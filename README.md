# Recon App

Forensic Stripe ↔ AR reconciliation system. Engine + dashboard + audit packet.

## Quick start (local dev)

```bash
# Engine (Python)
cd engine && pip install -e .
python -m reconciliation_engine.cli --help

# Dashboard (Next.js)
cd app && pnpm install && pnpm dev

# Database (Supabase)
supabase start && supabase db reset
```

## Working with Claude Cowork on this repo

This repo is structured for Claude Cowork autonomous development. Read `CLAUDE.md` first — it's the project memory. Skills in `.claude/skills/` automate recurring operations:

| When you say... | Skill that fires |
|---|---|
| "Run the monthly close for April" | `monthly-close` |
| "What's outstanding?" / "Triage exceptions" | `exception-triage` |
| "Draft an email to {client}" | `client-outreach` |
| "Audit packet for Q1 2026" | `audit-prep` |
| "Compare April vs March" | `period-comparison` |
| "Add a feature for {x}" | `feature-dev` |
| "The engine is failing on {sheet}" | `data-quality` |
| "Release v0.3.0" | `release` |

## Documentation

- `CLAUDE.md` — project memory (start here)
- `docs/architecture.md` — system diagram and data flow
- `docs/decisions/` — ADRs (architectural decisions, append-only)
- `docs/runbooks/` — operational playbooks

## Layout

See `CLAUDE.md` §4 for the complete repository layout.
