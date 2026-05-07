// ============================================================
// Client projection rules — extracted from clientDatabase.
// In Phase 2 (Supabase), buildBudgetRows() reads directly from the
// `clients` + `client_billing_plans` tables via a server action.
// ============================================================

import { clientDatabase } from "./client-database";
import type { ClientProjectionRule } from "../types";

export const clientRules2026: ClientProjectionRule[] = clientDatabase.map((r) => ({
  stripe_id:         r.stripe_id ?? "",   // "" = no-Stripe client (margaret)
  display_name:      r.display_name,
  primary_email:     r.primary_email,
  batch:             r.batch,
  is_active:         r.is_active,
  deactivated_month: r.deactivated_month,
  billing_plans:     r.billing_plans,
}));
