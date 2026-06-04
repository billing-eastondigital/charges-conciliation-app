---
name: client-outreach
description: Draft a personalized email to a client about a billing exception (UNDERPAID, MISSING_PAYMENT, FAILED_HARD card decline, or refund follow-up). Use when the user says "draft email for {client}", "redactar correo a {cliente}", "send a payment reminder", "follow up on {cus_id}", or after exception-triage when an exception requires client contact. Detects the client's likely language (Spanish or English) from email domain and prior context, produces a professional, factual, non-aggressive draft, and proposes 2 tone variants (firm vs gentle). Never sends — only drafts for human review.
---

# Client Outreach

You are drafting a payment-related email. Be professional, factual, and respectful. The owner approves before sending — never send directly.

## Inputs needed

- `stripe_id` (cus_…) of the client
- The exception type: UNDERPAID, MISSING_PAYMENT, FAILED_HARD (card decline), REFUND_FOLLOWUP
- The period (e.g. "April 2026")

If any are missing, ask the user.

## Procedure

### Step 0 — Verify client exists in reconciliation results

If `cus_id` is provided but no reconciliation result is found for the period, look up the client directly:

```sql
SELECT * FROM clients WHERE stripe_id = '{cus_id}';
```

Use whatever context is available (display_name, primary_email, account_status) and proceed with drafting based on the exception type provided.

### Step 1 — Pull client context

```sql
SELECT r.stripe_id, r.display_name, cl.primary_email AS email,
       r.expected_amount, r.collected_amount, r.variance,
       r.recon_status, r.period_label
FROM reconciliation_results r
JOIN clients cl ON cl.stripe_id = r.stripe_id
WHERE r.stripe_id = '{cus_id}' AND r.period_label = '{period}';

-- Last 3 months of relationship
SELECT period_label, recon_status, variance FROM reconciliation_results
WHERE stripe_id = '{cus_id}' ORDER BY period_label DESC LIMIT 3;

-- Specific charges for this period
SELECT created_at_stripe, amount, charge_status, decline_reason, invoice_id
FROM stripe_charges WHERE stripe_id = '{cus_id}' AND period_label = '{period}';
```

### Step 2 — Detect language

Heuristics (in order):
1. Email domain TLD: `.es`, `.com.ar`, `.com.mx`, `.com.co`, `.com.pe`, `.cl`, `.uy` → Spanish.
2. Email/name pattern: Spanish surnames common in clients → Spanish.
3. Default: English.

If you're unsure, draft both versions and let the user pick.

### Step 3 — Pick the right framing per exception type

**UNDERPAID** — they paid, but less than expected. Tone: collaborative, "looks like a small discrepancy."
> Reference: amount expected, amount received, difference, possible cause (a recent rate change, a partial payment), proposed resolution (top-up via attached invoice).

**MISSING_PAYMENT (no Stripe activity)** — no attempt was made. Tone: gentle reminder.
> Reference: invoice number/period, amount, due date passed, payment link or confirmation that card on file will be retried.

**MISSING_PAYMENT with FAILED_HARD (card declined)** — they tried but the card failed. Tone: helpful, action-oriented.
> Reference: charge attempt date, decline reason in plain language ("the bank reported insufficient funds"), request to update card or arrange alternative payment, link to Stripe customer portal if available.

**REFUND_FOLLOWUP** — refund was issued. Tone: confirming, thanking for understanding.
> Reference: refund amount, original invoice, expected timing on the bank side (5–10 business days).

### Step 4 — Draft 2 variants

Always produce **two** tones the user can choose between. Label clearly:
- **Firm**: direct, names the amount and the action, no apologies. For repeat offenders or large sums.
- **Gentle**: soft opener, frames as administrative ("just confirming"), assumes goodwill. For first-time exceptions or long-standing clients.

Each variant: max ~120 words. Subject line included. No emojis. No "I hope this email finds you well." No corporate fluff.

### Step 5 — Output format

```
TO:        {client_email}
SUBJECT:   {subject_line}
LANGUAGE:  {Spanish | English}
EXCEPTION: {type} — ${amount_at_risk}

--- Variant A: Firm ---
{body}

--- Variant B: Gentle ---
{body}

--- Notes for the owner ---
- Last paid period: {period_label} (${amount}, status {recon_status})
- This is the {n}th consecutive month with {recon_status}
- Decline reason on Stripe: {decline_reason or "n/a"}
```

## Constraints

- Never claim payment was received if it wasn't.
- Never threaten service termination. The owner makes that call.
- Never disclose other clients' information.
- Always include the Stripe Invoice URL if available (`invoice_link` from `expected_charges`) — easier for the client to pay than re-typing card info.
- For Spanish: use `usted` form by default unless prior emails in the conversation use `tú`.
- Never attach files automatically. The owner attaches if needed.
