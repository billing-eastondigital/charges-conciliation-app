"""
CLI entrypoint for the reconciliation engine.

Usage:
    python -m reconciliation_engine.cli --period "April 2026"

Environment variables (or .env file):
    SUPABASE_URL              — project URL
    SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for writes)
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the engine directory if present
_env_file = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_file)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run reconciliation for one billing period.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m reconciliation_engine.cli --period "April 2026"
  python -m reconciliation_engine.cli --period "March 2026" --tolerance 0.05
        """,
    )
    parser.add_argument(
        "--period",
        required=True,
        help='Period label matching periods.period_label, e.g. "April 2026"',
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.01,
        help="Match tolerance in dollars (default: 0.01). Do not widen without an ADR.",
    )
    args = parser.parse_args()

    from decimal import Decimal
    from .config import ReconciliationConfig
    from .reconciler import run

    cfg = ReconciliationConfig(match_tolerance=Decimal(str(args.tolerance)))

    print(f"Reconciling period: {args.period}")
    print(f"Match tolerance: ±${cfg.match_tolerance}")
    print()

    try:
        results = run(period_label=args.period, cfg=cfg)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"\nDone. {len(results)} reconciliation results written.")


if __name__ == "__main__":
    main()
