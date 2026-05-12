"""
Supabase I/O layer — all reads and writes to the database.
The reconciler never calls this directly; it is called by the public run() function.

Uses the service role key to bypass RLS for write operations.
"""

import hashlib
import json
import os
from decimal import Decimal
from typing import Optional

from supabase import create_client, Client

from .config import (
    ReconciliationConfig,
    EXCEPTION_STATUSES,
    STATUS_MATCH,
)
from .models import ARLine, StripeCharge, ClientMeta, ReconResult


def _client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


# ── reads ─────────────────────────────────────────────────────────────────────


def fetch_ar_lines(period_label: str) -> list[ARLine]:
    """Load all expected_charges rows for the period."""
    sb = _client()
    resp = (
        sb.table("expected_charges")
        .select("id,period_label,stripe_id,account_name,primary_email,batch,expected_amount")
        .eq("period_label", period_label)
        .execute()
    )
    rows = resp.data or []
    return [
        ARLine(
            id              = r["id"],
            period_label    = r["period_label"],
            stripe_id       = r.get("stripe_id") or None,
            account_name    = r["account_name"],
            primary_email   = r.get("primary_email"),
            batch           = r.get("batch"),
            expected_amount = Decimal(str(r["expected_amount"])),
        )
        for r in rows
    ]


def fetch_stripe_charges(period_label: str) -> list[StripeCharge]:
    """Load all stripe_charges rows for the period."""
    sb = _client()
    resp = (
        sb.table("stripe_charges")
        .select("charge_id,period_label,stripe_id,customer_email,amount,charge_status,amount_refunded")
        .eq("period_label", period_label)
        .execute()
    )
    rows = resp.data or []
    return [
        StripeCharge(
            charge_id       = r["charge_id"],
            period_label    = r["period_label"],
            stripe_id       = r.get("stripe_id") or None,
            customer_email  = r.get("customer_email"),
            amount          = Decimal(str(r["amount"])),
            charge_status   = r["charge_status"],
            amount_refunded = Decimal(str(r.get("amount_refunded") or "0")),
        )
        for r in rows
    ]


def fetch_client_meta() -> dict[str, ClientMeta]:
    """Load all clients → keyed by stripe_id for O(1) join in the reconciler."""
    sb = _client()
    resp = (
        sb.table("clients")
        .select("stripe_id,display_name,primary_email,batch,account_status")
        .not_.is_("stripe_id", "null")
        .execute()
    )
    rows = resp.data or []
    return {
        r["stripe_id"]: ClientMeta(
            stripe_id      = r["stripe_id"],
            display_name   = r["display_name"],
            primary_email  = r["primary_email"],
            batch          = r["batch"],
            account_status = r["account_status"],
        )
        for r in rows
        if r.get("stripe_id")
    }


# ── writes ────────────────────────────────────────────────────────────────────


def write_results(
    period_label: str,
    results: list[ReconResult],
    ar_lines: list[ARLine],
    charges: list[StripeCharge],
    cfg: ReconciliationConfig,
) -> None:
    """
    Atomically replace reconciliation data for the period.

    Order:
    1. Insert reconciliation_run (PARTIAL) → get run_id
    2. Delete existing recon results + exceptions for this period
    3. Insert new reconciliation_results (with run_id)
    4. Insert exceptions for non-MATCH results
    5. Update run → COMPLETED with summary stats
    """
    sb = _client()

    billing_hash = _hash_rows(ar_lines)
    stripe_hash  = _hash_rows(charges)

    # 1. Create run record
    run_resp = (
        sb.table("reconciliation_runs")
        .insert({
            "period_label":      period_label,
            "engine_version":    cfg.engine_version,
            "triggered_by":      "python-cli",
            "billing_file_name": f"expected_charges:{period_label}",
            "billing_file_hash": billing_hash,
            "stripe_file_name":  f"stripe_charges:{period_label}",
            "stripe_file_hash":  stripe_hash,
            "run_status":        "PARTIAL",
        })
        .execute()
    )
    run_id: int = run_resp.data[0]["id"]

    # 2. Clear existing data for this period
    sb.table("exceptions").delete().eq("period_label", period_label).execute()
    sb.table("reconciliation_results").delete().eq("period_label", period_label).execute()

    # 3. Insert reconciliation_results
    result_rows = [_result_to_row(r, run_id) for r in results]
    if result_rows:
        # Insert in chunks to avoid request size limits
        for chunk in _chunks(result_rows, 200):
            inserted = sb.table("reconciliation_results").insert(chunk).execute()

        # Build stripe_id → result_id map for exception FK
        result_id_map: dict[Optional[str], int] = {}
        all_inserted = (
            sb.table("reconciliation_results")
            .select("id,stripe_id")
            .eq("period_label", period_label)
            .eq("run_id", run_id)
            .execute()
        )
        for row in all_inserted.data or []:
            result_id_map[row.get("stripe_id")] = row["id"]

    # 4. Insert exceptions
    exception_rows = [
        _exception_row(r, result_id_map.get(r.stripe_id))
        for r in results
        if r.recon_status in EXCEPTION_STATUSES
    ]
    if exception_rows:
        for chunk in _chunks(exception_rows, 200):
            sb.table("exceptions").insert(chunk).execute()

    # 5. Update run with summary stats
    counts = _count_by_status(results)
    total_expected  = sum(r.expected_amount  for r in results)
    total_collected = sum(r.collected_amount for r in results)
    total_variance  = sum(r.variance         for r in results)

    sb.table("reconciliation_runs").update({
        "run_status":        "COMPLETED",
        "total_expected":    str(total_expected),
        "total_collected":   str(total_collected),
        "total_variance":    str(total_variance),
        "match_count":       counts.get(STATUS_MATCH, 0),
        "overpaid_count":    counts.get("OVERPAID", 0),
        "underpaid_count":   counts.get("UNDERPAID", 0),
        "missing_count":     counts.get("MISSING_PAYMENT", 0),
        "stripe_only_count": counts.get("STRIPE_ONLY", 0),
        "failed_hard_count": counts.get("FAILED_HARD", 0),
        "refunded_count":    counts.get("REFUNDED", 0),
    }).eq("id", run_id).execute()

    print(f"Run {run_id} complete: {len(results)} results, {len(exception_rows)} exceptions")
    print(f"  MATCH={counts.get(STATUS_MATCH, 0)}  "
          f"OVERPAID={counts.get('OVERPAID', 0)}  "
          f"UNDERPAID={counts.get('UNDERPAID', 0)}  "
          f"MISSING={counts.get('MISSING_PAYMENT', 0)}  "
          f"STRIPE_ONLY={counts.get('STRIPE_ONLY', 0)}  "
          f"FAILED={counts.get('FAILED_HARD', 0)}  "
          f"REFUNDED={counts.get('REFUNDED', 0)}")


# ── serialization helpers ─────────────────────────────────────────────────────


def _result_to_row(r: ReconResult, run_id: int) -> dict:
    return {
        "period_label":     r.period_label,
        "stripe_id":        r.stripe_id,
        "expected_amount":  str(r.expected_amount),
        "collected_amount": str(r.collected_amount),
        "variance":         str(r.variance),
        "recon_status":     r.recon_status,
        "display_name":     r.display_name,
        "primary_email":    r.primary_email,
        "batch":            r.batch,
        "account_status":   r.account_status,
        "paid_net_count":   r.paid_net_count,
        "failed_count":     r.failed_count,
        "refunded_count":   r.refunded_count,
        "run_id":           run_id,
    }


def _exception_row(r: ReconResult, result_id: Optional[int]) -> dict:
    return {
        "period_label":    r.period_label,
        "stripe_id":       r.stripe_id,
        "result_id":       result_id,
        "exception_type":  r.recon_status,
        "expected_amount": str(r.expected_amount),
        "collected_amount":str(r.collected_amount),
        "variance":        str(r.variance),
        "display_name":    r.display_name,
        "primary_email":   r.primary_email,
        "batch":           r.batch,
        "resolution_status":"OPEN",
    }


def _hash_rows(rows: list) -> str:
    """
    SHA-256 of a deterministic JSON representation of the input rows.
    Used as a provenance hash when data comes from DB rather than a file.
    """
    payload = json.dumps(
        [vars(r) if hasattr(r, "__dict__") else str(r) for r in rows],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _chunks(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def _count_by_status(results: list[ReconResult]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in results:
        counts[r.recon_status] = counts.get(r.recon_status, 0) + 1
    return counts
