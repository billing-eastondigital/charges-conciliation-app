-- Allow the app (anon key) to write billing plans from server actions
-- Single-tenant admin app — anon key is only used server-side in server actions.
CREATE POLICY "anon_write_billing_plans"
  ON client_billing_plans FOR ALL TO anon USING (true) WITH CHECK (true);

-- DOWN
-- DROP POLICY "anon_write_billing_plans" ON client_billing_plans;
