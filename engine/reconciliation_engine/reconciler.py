"""
Core reconciliation logic.

No I/O here — takes lists of domain objects, returns lists of ReconResult.
The supabase_io module handles all reads and writes.

Reconciliation grain = (period, stripe_id).  See CLAUDE.md §3 rule 1.
"""

from collections import defaultdict
from decimal import Decimal
from typing import Optional

from .config import (
    ReconciliationConfig,
    CLASS_PAID_NET,
    CLASS_FAILED_HARD,
    CLASS_REFUNDED,
    STATUS_MATCH,
    STATUS_OVERPAID,
    STATUS_UNDERPAID,
    STATUS_MISSING_PAYMENT,
    STATUS_STRIPE_ONLY,
    STATUS_FAILED_HARD,
    STATUS_REFUNDED,
)
from .models import ARLine, StripeCharge, ClientMeta, ReconResult
from .supabase_io import (
    fetch_ar_lines,
    fetch_stripe_charges,
    fetch_client_meta,
    write_results,
)


def run(
    period_label: str,
    cfg: Optional[ReconciliationConfig] = None,
) -> list[ReconResult]:
    """
    Reconcile one period end-to-end.

    Reads expected_charges + stripe_charges from Supabase, reconciles,
    writes reconciliation_results + exceptions + run record.
    Returns the list of ReconResult produced.
    """
    if cfg is None:
        cfg = ReconciliationConfig()

    ar_lines = fetch_ar_lines(period_label)
    charges   = fetch_stripe_charges(period_label)
    client_meta = fetch_client_meta()

    results = _reconcile(ar_lines, charges, client_meta, cfg)
    write_results(period_label, results, ar_lines, charges, cfg)
    return results


# ── internal helpers ──────────────────────────────────────────────────────────


def _reconcile(
    ar_lines: list[ARLine],
    charges: list[StripeCharge],
    client_meta: dict[str, ClientMeta],
    cfg: ReconciliationConfig,
) -> list[ReconResult]:
    """
    Pure reconciliation — no I/O.

    Strategy
    --------
    1. Group AR lines by stripe_id → sum expected_amount.
       AR rows with stripe_id=NULL cannot be auto-joined → MISSING_PAYMENT individually.
    2. Group stripe charges by stripe_id.
       Only PAID_NET charges contribute to collected_amount (rule 2 in CLAUDE.md §3).
    3. Join AR groups with Stripe groups → assign status.
    4. Stripe-only stripe_ids (no AR row) → STRIPE_ONLY / FAILED_HARD / REFUNDED.
    """
    # ── AR grouping ──────────────────────────────────────────────────────────
    # stripe_id → (total_expected, list of AR lines)
    ar_by_stripe: dict[str, tuple[Decimal, list[ARLine]]] = {}
    ar_no_stripe: list[ARLine] = []

    for line in ar_lines:
        if not line.stripe_id:
            ar_no_stripe.append(line)
        else:
            cur_total, cur_lines = ar_by_stripe.get(line.stripe_id, (Decimal("0"), []))
            ar_by_stripe[line.stripe_id] = (cur_total + line.expected_amount, cur_lines + [line])

    # ── Stripe grouping ──────────────────────────────────────────────────────
    # stripe_id → {paid_net: Decimal, failed_count: int, refunded_count: int,
    #              paid_net_count: int, raw: list[StripeCharge]}
    stripe_by_id: dict[str, dict] = defaultdict(lambda: {
        "paid_net": Decimal("0"),
        "paid_net_count": 0,
        "failed_count": 0,
        "refunded_count": 0,
        "charges": [],
    })

    unmatched_charges: list[StripeCharge] = []  # stripe_id = NULL

    for charge in charges:
        if not charge.stripe_id:
            unmatched_charges.append(charge)
            continue
        grp = stripe_by_id[charge.stripe_id]
        grp["charges"].append(charge)
        if charge.charge_status == CLASS_PAID_NET:
            grp["paid_net"] += charge.amount
            grp["paid_net_count"] += 1
        elif charge.charge_status == CLASS_FAILED_HARD:
            grp["failed_count"] += 1
        elif charge.charge_status == CLASS_REFUNDED:
            grp["refunded_count"] += 1
        # FAILED_RETRY is informational — does not contribute to counts or amounts

    results: list[ReconResult] = []

    # ── AR-side rows ─────────────────────────────────────────────────────────
    for stripe_id, (expected, lines) in ar_by_stripe.items():
        meta = client_meta.get(stripe_id)
        stripe_grp = stripe_by_id.get(stripe_id)

        collected   = stripe_grp["paid_net"]       if stripe_grp else Decimal("0")
        paid_net_c  = stripe_grp["paid_net_count"] if stripe_grp else 0
        failed_c    = stripe_grp["failed_count"]   if stripe_grp else 0
        refunded_c  = stripe_grp["refunded_count"] if stripe_grp else 0

        status = _classify_ar_stripe(expected, collected, cfg)

        results.append(ReconResult(
            period_label    = lines[0].period_label,
            stripe_id       = stripe_id,
            expected_amount = expected,
            collected_amount= collected,
            variance        = collected - expected,
            recon_status    = status,
            display_name    = meta.display_name    if meta else None,
            primary_email   = meta.primary_email   if meta else (lines[0].primary_email),
            batch           = meta.batch           if meta else (lines[0].batch),
            account_status  = meta.account_status  if meta else None,
            paid_net_count  = paid_net_c,
            failed_count    = failed_c,
            refunded_count  = refunded_c,
        ))

    # ── AR rows with no stripe_id → MISSING_PAYMENT individually ─────────────
    for line in ar_no_stripe:
        results.append(ReconResult(
            period_label    = line.period_label,
            stripe_id       = None,
            expected_amount = line.expected_amount,
            collected_amount= Decimal("0"),
            variance        = -line.expected_amount,
            recon_status    = STATUS_MISSING_PAYMENT,
            display_name    = line.account_name,
            primary_email   = line.primary_email,
            batch           = line.batch,
            account_status  = None,
            paid_net_count  = 0,
            failed_count    = 0,
            refunded_count  = 0,
        ))

    # ── Stripe-only stripe_ids (no AR row) ───────────────────────────────────
    ar_stripe_ids = set(ar_by_stripe.keys())
    for stripe_id, grp in stripe_by_id.items():
        if stripe_id in ar_stripe_ids:
            continue  # already handled above

        meta = client_meta.get(stripe_id)
        paid_net = grp["paid_net"]

        # Determine which status to emit for this stripe-only customer
        if grp["paid_net_count"] > 0:
            status = STATUS_STRIPE_ONLY
        elif grp["failed_count"] > 0:
            status = STATUS_FAILED_HARD
        elif grp["refunded_count"] > 0:
            status = STATUS_REFUNDED
        else:
            # Only FAILED_RETRY — informational, no exception needed
            continue

        results.append(ReconResult(
            period_label    = charges[0].period_label if charges else "",
            stripe_id       = stripe_id,
            expected_amount = Decimal("0"),
            collected_amount= paid_net,
            variance        = paid_net,
            recon_status    = status,
            display_name    = meta.display_name   if meta else None,
            primary_email   = meta.primary_email  if meta else (grp["charges"][0].customer_email if grp["charges"] else None),
            batch           = meta.batch          if meta else None,
            account_status  = meta.account_status if meta else None,
            paid_net_count  = grp["paid_net_count"],
            failed_count    = grp["failed_count"],
            refunded_count  = grp["refunded_count"],
        ))

    return results


def _classify_ar_stripe(
    expected: Decimal,
    collected: Decimal,
    cfg: ReconciliationConfig,
) -> str:
    """
    Assign reconciliation status for a row that has an AR entry.

    Tolerance = ±$0.01 per CLAUDE.md §3 rule 4.
    """
    if collected == Decimal("0"):
        return STATUS_MISSING_PAYMENT

    variance = collected - expected
    if abs(variance) <= cfg.match_tolerance:
        return STATUS_MATCH
    if variance > cfg.match_tolerance:
        return STATUS_OVERPAID
    return STATUS_UNDERPAID
