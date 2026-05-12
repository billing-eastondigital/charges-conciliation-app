"""
ReconciliationConfig — all tunables in one place. No magic numbers elsewhere.
"""

from dataclasses import dataclass
from decimal import Decimal

ENGINE_VERSION = "1.0.0"

# Charge classification codes (must match stripe_charges.charge_status CHECK constraint)
CLASS_PAID_NET    = "PAID_NET"
CLASS_FAILED_RETRY = "FAILED_RETRY"
CLASS_FAILED_HARD  = "FAILED_HARD"
CLASS_REFUNDED     = "REFUNDED"

# Reconciliation status codes (must match reconciliation_results.recon_status CHECK constraint)
STATUS_MATCH           = "MATCH"
STATUS_OVERPAID        = "OVERPAID"
STATUS_UNDERPAID       = "UNDERPAID"
STATUS_MISSING_PAYMENT = "MISSING_PAYMENT"
STATUS_STRIPE_ONLY     = "STRIPE_ONLY"
STATUS_FAILED_HARD     = "FAILED_HARD"
STATUS_REFUNDED        = "REFUNDED"

# Statuses that generate an exception row
EXCEPTION_STATUSES = {
    STATUS_OVERPAID,
    STATUS_UNDERPAID,
    STATUS_MISSING_PAYMENT,
    STATUS_STRIPE_ONLY,
    STATUS_FAILED_HARD,
    STATUS_REFUNDED,
}


@dataclass(frozen=True)
class ReconciliationConfig:
    """All tunables. Pass a custom instance in tests to override thresholds."""

    # Variance within ±match_tolerance is classified as MATCH.
    # CLAUDE.md §3 rule 4: do NOT widen this to paper over discrepancies.
    match_tolerance: Decimal = Decimal("0.01")

    engine_version: str = ENGINE_VERSION
