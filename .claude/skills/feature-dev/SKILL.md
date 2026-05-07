---
name: feature-dev
description: Add a new feature to the recon app — engine logic, schema migration, edge function, or dashboard UI. Use when the user says "add a feature", "build {feature}", "I need a new view", "agregar feature", "implement {capability}", or any request that adds functionality crossing the engine, DB, or UI layers. Walks through ADR (if architectural) → schema migration → engine change → edge function → frontend → tests → docs in the right order with PR-ready commits.
---

# Feature Development

You are adding a feature. Stay disciplined: architecture decision FIRST, schema SECOND, engine THIRD, UI LAST. Skipping the order causes rework.

## Procedure

### Step 1 — Classify the feature

Ask yourself (and optionally the user):
- **UI-only** (new page, new chart, restyling) → skip to step 5.
- **DB-shaped** (new column, new table, new RLS policy) → start at step 2.
- **Engine logic** (new classification, new status, change to grain or tolerance) → **architectural**, requires ADR. Start at step 2 with the ADR.

If the change touches a rule in `CLAUDE.md` §3 (forensic invariants), it is architectural by definition. Write the ADR first; do not proceed without one.

### Step 2 — ADR (only if architectural)

```bash
# Find the next ADR number
ls docs/decisions/ | tail -n 1
```

Copy `tools/prompts/adr-template.md` to `docs/decisions/{NNNN}-{slug}.md`. Fill in Context, Options, Decision, Consequences. Status starts as `Proposed`. Commit the ADR alone before any code.

### Step 3 — Schema migration

```bash
# New migration file
T=$(date +%Y%m%d%H%M%S)
touch supabase/migrations/${T}_{description}.sql
```

Rules for migrations:
- **Additive only when possible**: `ADD COLUMN`, `ADD INDEX`, `CREATE TABLE`. Never `DROP COLUMN` without an explicit `down` plan.
- **Always reversible**: include a `DOWN` comment block at the bottom showing how to revert.
- **RLS for any new table**: enable RLS + add at least one policy. No exceptions.
- **Update views** that reference modified tables in the same migration.

Run `supabase db reset` locally to confirm it applies cleanly from scratch.

### Step 4 — Engine change

If the feature touches Python:

1. Update `engine/reconciliation_engine/config.py` if new constants/columns are involved.
2. Update the relevant module (`loaders.py`, `classifier.py`, `reconciler.py`, `reporter.py`) — keep the layered separation. Loaders don't classify; classifiers don't reconcile; reconcilers don't render.
3. **Regression test**: re-run `historical_ingest` against existing data and diff `reconciliation_results`:
   ```bash
   sqlite3 reconciliation.db ".backup pre_change.db"
   # ... make change, re-run ingest ...
   sqlite3 reconciliation.db ".backup post_change.db"
   # Diff
   ```
   For closed periods, **any change in MATCH count or total variance is a red flag**. Either it's a bug, or you've changed a forensic rule and the ADR should say so.

### Step 5 — Edge Function (Supabase)

If new server logic is needed:

```bash
supabase functions new {name}
```

Conventions:
- TypeScript only.
- Handler in `index.ts`; pure logic in `lib/*.ts` for testability.
- Read secrets from environment, never hardcode.
- Return JSON with `{ok: boolean, data?, error?}` shape.
- Test with `supabase functions serve {name}` + curl before deploying.

### Step 6 — Frontend

Conventions:
- App Router. Server components by default; `'use client'` only when interaction is needed.
- Data fetching: server components hit Supabase via the server-side client; client components use `swr` against an API route or server action.
- Money: always `formatMoney(amount, currency)` from `app/lib/format.ts`.
- Tables: TanStack Table.
- Charts: recharts.
- Forms: react-hook-form + zod schemas.
- Components live in `app/components/{domain}/`. Domain folders: `period`, `exception`, `client`, `audit`.

### Step 7 — Tests

- Engine: `pytest engine/tests/test_{module}.py`. Add a regression test asserting the closed-period numbers don't move.
- Edge Functions: `deno test supabase/functions/{name}/`.
- Frontend: vitest for utils, Playwright for any new user flow.

### Step 8 — Docs

- If schema changed → update `docs/architecture.md` data-flow section and the `supabase/CLAUDE.md`.
- If engine logic changed → update `engine/CLAUDE.md` and the relevant ADR's Status to `Accepted`.
- If a new skill emerged from the feature → scaffold it in `.claude/skills/`.

### Step 9 — Commit + PR

Commit shape:

```
feat({area}): {short imperative}

- ADR: docs/decisions/{NNNN}-{slug}.md
- Migration: supabase/migrations/{ts}_{name}.sql
- Engine: engine/reconciliation_engine/{module}.py
- UI: app/{path}

Regression: closed-period reconciliation results unchanged
(verified by historical_ingest re-run + diff).
```

## Forensic guardrails

- Closed periods never re-open silently. If a feature requires re-reconciling a closed period, prompt the user to confirm and write an ADR explaining why.
- Tolerance and grain are constitutional. Changes require ADR + explicit business owner sign-off recorded in the ADR.
- Schema migrations that delete columns must be paired with a backfill migration if any historical data lives there.
