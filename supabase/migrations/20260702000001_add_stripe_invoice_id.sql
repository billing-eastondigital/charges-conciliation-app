-- Migration 20260702000001 — Add stripe_invoice_id to expected_charges
--
-- Stores the raw Stripe invoice ID (in_…) alongside invoice_url and invoice_status.
-- Written by the create-stripe-invoices Edge Function after invoice creation.
-- Mirrors what the Make.com scenario wrote back to Airtable ("Stripe Invoice ID").

ALTER TABLE expected_charges
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

COMMENT ON COLUMN expected_charges.stripe_invoice_id IS
  'Stripe invoice ID (in_…). Written by create-stripe-invoices edge function after invoice creation.';

-- DOWN:
-- ALTER TABLE expected_charges DROP COLUMN IF EXISTS stripe_invoice_id;
