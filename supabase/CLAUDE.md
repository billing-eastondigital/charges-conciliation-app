# supabase/CLAUDE.md

Supabase = Postgres + Auth + Edge Functions. The DB is the source of truth for the dashboard; the engine writes here.

## Layout

```
supabase/
├── migrations/                       # timestamp-prefixed SQL, applied in order
├── functions/                        # Edge Functions (Deno/TypeScript)
│   ├── ingest-period/                # called to reconcile a period
│   ├── stripe-webhook/               # listens to charge.refunded etc. (V2)
│   └── audit-packet/                 # builds the downloadable audit packet
├── seed.sql                          # local dev seed (NOT for prod)
└── config.toml                       # supabase CLI config
```

## Schema cardinal rules

- Every table has `created_at timestamptz NOT NULL DEFAULT now()`.
- Every table has RLS enabled. No exceptions, even for "internal" tables.
- Money columns: `numeric(12,4)` for AR amounts (4dp source), `numeric(12,2)` for Stripe amounts. Never `float` or `real`.
- `stripe_id` columns are `text` and reference `clients(stripe_id)`.
- Status enums use CHECK constraints, not Postgres ENUMs (easier to evolve).

## Key tables (canonical schema)

See `migrations/00000000000001_initial.sql` for the source of truth. Summary:

- `periods(period_label PK, start_date, end_date, closed bool)`
- `clients(stripe_id PK, display_name, primary_email, is_active, ...)` — extended model TBD (owner to provide full field list from clients.xlsx)
- `expected_charges` — one row per AR billing line (preserves drill-down)
- `stripe_charges(charge_id PK, ...)` — one row per Stripe transaction
- `reconciliation_results(period_label, stripe_id, ..., UNIQUE(period_label, stripe_id))`
- `exceptions` — workflow state for action items
- `reconciliation_runs` — provenance: source-file hashes, engine version, run timestamp

### Clients table — extended model

The `clients` table goes beyond what Stripe exposes. The owner manages a client master (source: `data/clients.xlsx`) with fields beyond `stripe_id / display_name / email`. Full schema to be defined once the model is shared. When received:
1. Capture all fields in a migration (`20260506000002_extend_clients.sql`)
2. Update this section with the final column list
3. Update `engine/reconciliation_engine/config.py` if any column names affect the engine

## RLS policies pattern

```sql
-- Read: anyone authenticated can read all (single-tenant app)
CREATE POLICY "auth read" ON {table}
  FOR SELECT USING (auth.role() = 'authenticated');

-- Write: only specific roles
CREATE POLICY "owner write" ON {table}
  FOR INSERT WITH CHECK (auth.jwt() ->> 'app_role' = 'owner');
```

For `exceptions`, analysts can write but only owners can mark `won't fix`. Encode in the policy, not in app code.

## Edge Functions conventions

- TypeScript, no JavaScript.
- `index.ts` is the handler. Pure logic in sibling files (`lib/*.ts`) so tests don't need Deno.serve.
- Return shape: `{ ok: boolean; data?: T; error?: { code: string; message: string } }`.
- Read secrets from `Deno.env.get('SECRET_NAME')`. Never log secrets, even at debug level.
- Always validate input with zod (or the Deno equivalent) before touching the DB.

## ingest-period function

Triggered by:
- Manual call from the admin UI (`/admin/reingest`).
- Cron (Supabase Scheduled Function) on the 6th of each month for the prior month.

Behavior:
1. Receive `{ period_label, source_files: { billing_url, stripe_csv_url } }`.
2. Download files (Supabase Storage), hash them.
3. Invoke the Python engine (subprocess if available; otherwise replicate the engine logic in TS — preferable to keep it Python-only and use a worker queue).
4. Upsert into `expected_charges`, `stripe_charges`, `reconciliation_results`.
5. Generate `exceptions` rows for each non-MATCH result that doesn't already have an open exception.
6. Insert into `reconciliation_runs` with hashes and engine commit SHA.

**Idempotency**: re-running for the same period must produce the same results. Use upsert on `(period_label, stripe_id)`, not insert.

## Migrations

- One change per migration. Don't bundle.
- Filename: `{YYYYMMDDHHMMSS}_{snake_case_description}.sql`.
- Include a `-- DOWN` comment block at the bottom showing the inverse, even if you don't auto-apply it.
- Test against `supabase db reset` locally before pushing.

## Local development

```bash
supabase start                    # start local stack
supabase db reset                 # apply all migrations from scratch
supabase functions serve          # run all edge functions locally
psql -h localhost -p 54322 -U postgres -d postgres   # direct DB access
```

## Don't do

- Don't `ALTER TABLE` in the Supabase Studio UI for production. All schema changes via migrations.
- Don't store secrets in migrations or seed files. Use `vault` or env vars.
- Don't disable RLS, even temporarily, even on a "trusted" table.
- Don't write to `reconciliation_results` from anywhere except the engine. The dashboard reads, never writes.
