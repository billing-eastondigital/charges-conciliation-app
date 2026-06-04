---
name: exception-triage
description: Triage open reconciliation exceptions. Use when the user says "revisar excepciones", "triage exceptions", "trabajar el queue", "what's outstanding", "who hasn't paid", "review exceptions", "excepciones abiertas", "pending exceptions", "qué hay pendiente", or wants to understand and act on the current exception queue. This skill prioritizes exceptions by amount and recurrence, looks up each client's history, and suggests next actions (resolve, escalate, draft outreach). Use BEFORE generating client emails or marking exceptions resolved.
---

# Exception Triage

You are working the open exception queue. The owner cares most about: who owes money, who is a recurring problem, and what the next concrete action is for each.

## Procedure

### Step 1 — Pull open exceptions

```sql
SELECT e.id, e.period_label, e.stripe_id, e.exception_type,
       e.note, e.created_at,
       r.display_name, r.expected_amount, r.collected_amount, r.variance,
       r.recon_status
FROM exceptions e
LEFT JOIN reconciliation_results r
  USING (period_label, stripe_id)
WHERE e.resolution_status = 'open'
ORDER BY ABS(r.variance) DESC NULLS LAST, e.created_at;
```

If queue is empty, say so and stop.

### Step 2 — For each exception, gather context

For each `stripe_id`, look up the last 6 months of reconciliation results:

```sql
SELECT period_label, expected_amount, collected_amount, variance, recon_status
FROM reconciliation_results
WHERE stripe_id = '{cus_id}'
ORDER BY period_label DESC LIMIT 6;
```

Classify the client into one of these patterns:
- **First-time exception**: clean history → likely a one-off (failed card, mistimed payment). Low severity unless amount is large.
- **Recurring same status**: same exception 2+ months in a row → structural issue. High severity.
- **Drift**: amounts trending up or down over months → billing rule out of sync. Medium severity.
- **Mixed**: alternating MATCH and exceptions → process issue (late retries, manual adjustments). Medium severity.

### Step 3 — Look up the underlying charges

For each exception, fetch the relevant Stripe charges:

```sql
SELECT charge_id, charge_status, amount, amount_refunded,
       decline_reason, invoice_id, created_at_stripe
FROM stripe_charges
WHERE stripe_id = '{cus_id}' AND period_label = '{period}'
ORDER BY created_at_stripe;
```

This tells you whether the client tried and failed (insufficient funds, expired card, declined) vs no attempt at all vs partial payment.

### Step 4 — Suggest a next action per exception

For each, output:

```
[{severity}] {stripe_id} — {display_name}
  Status:     {exception_type}
  Period:     {period_label}
  At risk:    ${variance}
  History:    {pattern} (last 6 months: MATCH x4, MISSING x2)
  Charges:    {n_paid} paid · {n_failed} failed ({decline_reason}) · {n_refunded} refunded
  Action:     {one of:}
                - "Draft outreach email" (use client-outreach skill)
                - "Card on file expired — request update from client"
                - "Confirm with owner whether to write off ${amount}"
                - "Investigate billing rule — recurring underpayment suggests AR sheet has wrong Total to Bill"
                - "Wait one cycle — Stripe will retry on {date}"
                - "Mark as won't fix" (with reason)
                - "Investigate whether client has a Stripe ID missing from the billing sheet; if confirmed, add to expected_charges via /admin/import and re-run engine" (for STRIPE_ONLY)
```

### Step 5 — Ask the user how to proceed

Don't take action without confirmation. Offer:
- "Draft outreach for top N exceptions" → invokes `client-outreach` per client
- "Mark resolved with note" for each (one at a time, with the resolution note)
- "Escalate to owner" — adds a high-severity tag and includes in the next review packet

## Severity rubric

| Severity | When |
|---|---|
| HIGH | Amount >= $1,000 OR recurring (same status 2+ months) OR client status = LOST |
| MEDIUM | Amount $100–$1,000, first occurrence |
| LOW | Amount < $100 OR pending Stripe retry within 7 days |

## Forensic guardrails

- Never close (`resolution_status = resolved`) an exception without a note explaining the resolution.
- Never mark MATCH after the fact — the underlying numbers don't change just because the issue was understood. Keep the exception, mark resolved with the explanation.
- If a client is in `account_status = LOST`, surface that prominently — collection effort priority is different (and may be moot).
