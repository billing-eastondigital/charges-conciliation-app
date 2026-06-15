-- Migration 20260615000003 — Invoice columns on expected_charges
--
-- Adds three columns to support the billing review + Make.com invoice workflow:
--   ready_for_billing  — owner manually marks a row as reviewed and approved
--   invoice_url        — Stripe hosted invoice URL (written by Make.com after creation)
--   invoice_status     — Stripe invoice status: draft | open | paid | void
--
-- The existing anon UPDATE policy on expected_charges already covers ready_for_billing.
-- invoice_url and invoice_status are written by service_role (Make.com webhook / edge fn).

ALTER TABLE expected_charges
  ADD COLUMN IF NOT EXISTS ready_for_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_url       text,
  ADD COLUMN IF NOT EXISTS invoice_status    text
    CHECK (invoice_status IN ('draft', 'open', 'paid', 'void'));

COMMENT ON COLUMN expected_charges.ready_for_billing IS 'Owner sets true when row is reviewed and ready for Stripe invoice creation.';
COMMENT ON COLUMN expected_charges.invoice_url       IS 'Stripe hosted invoice URL. Written by Make.com after invoice is created.';
COMMENT ON COLUMN expected_charges.invoice_status    IS 'Stripe invoice status. Synced by Make.com: draft | open | paid | void.';

-- DOWN:
-- ALTER TABLE expected_charges
--   DROP COLUMN IF EXISTS ready_for_billing,
--   DROP COLUMN IF EXISTS invoice_url,
--   DROP COLUMN IF EXISTS invoice_status;
