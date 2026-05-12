"""
Reconciliation engine — public API.

Usage:
    from reconciliation_engine import run
    run(period_label="April 2026")
"""

from .reconciler import run

__all__ = ["run"]
