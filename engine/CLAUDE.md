# engine/CLAUDE.md

Python reconciliation engine. Pure functions, no I/O side effects in the math, layered separation of concerns. See root `CLAUDE.md` §3 for the forensic invariants this code enforces.

## Module layout

```
engine/reconciliation_engine/
├── __init__.py            # public API: run(), run_history()
├── config.py              # ReconciliationConfig — all tunables, NO magic numbers
├── loaders.py             # ingest .xlsx + .csv → canonical DataFrames
├── classifier.py          # tag every charge: PAID_NET / FAILED_RETRY / FAILED_HARD / REFUNDED
├── reconciler.py          # join + group + variance + status (the heart)
├── reporter.py            # multi-tab Excel writer
├── historical_ingest.py   # loop all periods → SQLite/Postgres
└── cli.py                 # argparse entrypoint for ad-hoc runs
```

## Layering rules

- **Loaders** never classify, reconcile, or filter business-logically. They normalize types and column names. That's it.
- **Classifier** tags every charge based ONLY on the charge data (status, refund, sibling-charge lookup by Invoice ID). It does not consult the AR side.
- **Reconciler** joins the two sides and produces results. It must never need to re-read the source files.
- **Reporter** writes Excel. It must never compute. If a number isn't already in the result frames, the reconciler is missing it.

## Conventions

- All money quantities are `Decimal`, not `float`, until the boundary with Excel/SQLite.
- Public functions take a `cfg: ReconciliationConfig` parameter, defaulted. Tests pass custom configs to verify edge cases.
- Public functions are imported from `__init__.py`. Private helpers are prefixed with `_` and not re-exported.
- Type hints on every signature.
- No mutable default arguments.
- Docstrings on every public function explain WHY, not WHAT — the WHAT is in the type hints.

## Adding a new classification or status

This is architectural. Requires an ADR. See `feature-dev` skill, step 1–2. After ADR:

1. Add the new code/string to `config.py` (e.g. `CLASS_NEW_THING: str = "NEW_THING"`).
2. Update `classifier.py` to emit it under the right conditions.
3. If the new class affects `paid_net`, update the `paid_net` calculation explicitly.
4. Update `reconciler._classify_row` if the new class changes how status is assigned.
5. Update `reporter.STATUS_FILLS` / `STATUS_FONTS` if the new class needs UI color.
6. Add a regression test that closed periods don't move.

## Testing

```bash
pytest engine/tests/ -v
pytest engine/tests/test_classifier.py::test_failed_retry_with_paid_sibling
```

The most important test asserts that re-running `historical_ingest` against the canonical fixture produces byte-identical reconciliation_results. If it doesn't, something forensic moved.

## Common pitfalls

- `pd.read_excel` on a 100-sheet workbook is **slow per call** — pass an `xls: pd.ExcelFile` to `load_billing_sheet` when iterating.
- `groupby().agg(lambda)` with Decimal sums uses pure Python — fine for ~100 groups, slow for 100k. If the data scales, replace with `.transform` or convert to float at the boundary.
- `pandas` may infer dtype `object` for Stripe ID columns where some cells are NaN floats. Always `.fillna("").astype(str).str.strip()` before string ops.
