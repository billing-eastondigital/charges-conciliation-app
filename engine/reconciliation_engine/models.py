"""
Domain dataclasses — canonical representations flowing through the engine.
These are constructed from DB rows; they never touch I/O themselves.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


@dataclass
class ARLine:
    """One row from expected_charges. Never merged — drill-down requires each line."""
    id: int
    period_label: str
    stripe_id: Optional[str]
    account_name: str
    primary_email: Optional[str]
    batch: Optional[str]
    expected_amount: Decimal


@dataclass
class StripeCharge:
    """One row from stripe_charges. charge_status is already engine-classified."""
    charge_id: str
    period_label: str
    stripe_id: Optional[str]
    customer_email: Optional[str]
    amount: Decimal
    charge_status: str          # PAID_NET | FAILED_RETRY | FAILED_HARD | REFUNDED
    amount_refunded: Decimal


@dataclass
class ClientMeta:
    """Client display fields fetched once and joined at write time."""
    stripe_id: str
    display_name: str
    primary_email: str
    batch: str
    account_status: str         # ACTIVE | LOST | INACTIVE


@dataclass
class ReconResult:
    """One output row per reconciliation grain (period, stripe_id)."""
    period_label: str
    stripe_id: Optional[str]
    expected_amount: Decimal
    collected_amount: Decimal
    variance: Decimal           # collected − expected; positive = overpaid
    recon_status: str
    display_name: Optional[str]
    primary_email: Optional[str]
    batch: Optional[str]
    account_status: Optional[str]
    paid_net_count: int
    failed_count: int
    refunded_count: int
    run_id: Optional[int] = None
