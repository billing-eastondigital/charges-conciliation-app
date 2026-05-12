-- ============================================================
-- Migration 0009 — anon read policies for Phase 2
--
-- Allows the unauthenticated (anon) Supabase role to read all
-- tables. Required for Phase 2 because Supabase Auth is not yet
-- wired; the Next.js server components use the anon key.
--
-- When auth is implemented (Phase 4), these policies should be
-- restricted: anon → remove, authenticated read only.
-- ============================================================

CREATE POLICY "anon_read_clients"
  ON clients FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_periods"
  ON periods FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_expected_charges"
  ON expected_charges FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_stripe_charges"
  ON stripe_charges FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_reconciliation_results"
  ON reconciliation_results FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_exceptions"
  ON exceptions FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_reconciliation_runs"
  ON reconciliation_runs FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_client_billing_plans"
  ON client_billing_plans FOR SELECT TO anon USING (true);

-- DOWN:
-- DROP POLICY "anon_read_clients" ON clients;
-- DROP POLICY "anon_read_periods" ON periods;
-- DROP POLICY "anon_read_expected_charges" ON expected_charges;
-- DROP POLICY "anon_read_stripe_charges" ON stripe_charges;
-- DROP POLICY "anon_read_reconciliation_results" ON reconciliation_results;
-- DROP POLICY "anon_read_exceptions" ON exceptions;
-- DROP POLICY "anon_read_reconciliation_runs" ON reconciliation_runs;
-- DROP POLICY "anon_read_client_billing_plans" ON client_billing_plans;
