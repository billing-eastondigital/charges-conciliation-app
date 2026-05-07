# ADR 0001 — Reconciliation grain merges multiple AR lines per `cus_id`

- **Status**: Accepted
- **Date**: 2026-05-06
- **Deciders**: Marco (analyst), business owner

## Context

The brief stated: "use Stripe ID (`cus_…`) as the unique identifier to join both datasets." The data does not satisfy this constraint. In the source workbook (`April 26 Billing` alone):

- `cus_MAQFq6FlG4sGc3` maps to three distinct Account Names (`realestateposts.com`, `addressesofdistinction.com`, `hallsigns.com`) — same paying entity, three billing lines.
- `cus_Gks5Luf2oz80Vv` maps to two Account Names (`WIM - alltimetrading.com`, `WIM - wholesalesockdeals.com`).

Joining on `cus_id` alone collapses two or three real billing lines into one and misattributes payments. Several alternatives were considered.

## Options

1. **Keep both, allocate by Invoice ID** — preserves per-line variance visibility; requires invoice-level matching logic.
2. **Merge into one consolidated line per `cus_id`** — sums Expected and Collected at the customer level; loses per-domain variance but the math reconciles cleanly.
3. **Match first AR line, drop the rest** — silently loses billing revenue. Forensically unsafe.
4. **Flag as data error and skip** — neither line reconciles; both go to exceptions.

## Decision

**Option 2: merge into one consolidated line per `cus_id`.**

Reconciliation grain = `(period, cus_id)`. `expected_amount = Σ Total to Bill` across all AR rows sharing the `cus_id`. `collected_amount = Σ paid_net` for the same `cus_id`.

The constituent AR rows survive in the `expected_charges` table — drill-down is preserved; nothing is dropped silently.

## Consequences

**Positive**:
- Math reconciles at the level the customer actually pays at (one client = one bank account).
- No silent drops. Every billing line is queryable via `expected_charges`.
- Simpler join logic than Option 1 (deferred to a future ADR if per-domain attribution becomes required).

**Negative**:
- Per-domain variance attribution is not available in the headline view. If `realestateposts.com` is overpaid by $50 and `addressesofdistinction.com` underpaid by $50 within the same `cus_id`, the consolidated line shows MATCH.
- Workaround: the dashboard's drill-down panel shows the constituent lines; if granular attribution becomes a recurring need, revisit and adopt Option 1.

## Reversal cost

Low. `expected_charges` already preserves per-line data. Switching to Option 1 (per-Invoice-ID matching) is a change to the reconciler's `groupby` key plus a join on `invoice_id`; the rest of the pipeline is unaffected.

## References

- `engine/reconciliation_engine/reconciler.py` — `bill_grouped` aggregation
- Original conversation: 2026-05-06 alignment
