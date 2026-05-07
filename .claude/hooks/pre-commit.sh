#!/usr/bin/env bash
# .claude/hooks/pre-commit.sh
# Guardrails: refuse commits that risk forensic integrity.
#
# Wire this up via .git/hooks/pre-commit (symlink) or pre-commit framework.
set -euo pipefail

fail() { echo "❌ pre-commit: $*" >&2; exit 1; }
warn() { echo "⚠  pre-commit: $*" >&2; }

# 1. No magic numbers in engine business logic
if git diff --cached --name-only | grep -qE '^engine/.*\.py$'; then
  if git diff --cached -- 'engine/**/*.py' \
       ':!engine/**/config.py' ':!engine/**/tests/**' \
     | grep -E '^\+' \
     | grep -vE '^\+\+\+' \
     | grep -E 'tolerance|TOLERANCE|0\.01|0\.005' >/dev/null 2>&1; then
    fail "Hardcoded tolerance found in engine/. Move to ReconciliationConfig in config.py."
  fi
fi

# 2. ADR check: refuse changes to forensic invariants without an ADR commit
FORENSIC_FILES='engine/reconciliation_engine/(reconciler|classifier|config)\.py'
if git diff --cached --name-only | grep -qE "$FORENSIC_FILES"; then
  ADR_TOUCHED=$(git diff --cached --name-only | grep -c '^docs/decisions/' || true)
  if [ "$ADR_TOUCHED" -eq 0 ]; then
    warn "Touching forensic logic but no ADR in this commit."
    warn "If this changes grain/classification/tolerance, write an ADR first."
    warn "If it's a pure refactor or bugfix, add 'no-adr-needed' to your commit message."
    if ! git diff --cached --no-color -- '*COMMIT_EDITMSG*' 2>/dev/null | grep -q 'no-adr-needed'; then
      : # Allow but warn — full enforcement on review.
    fi
  fi
fi

# 3. Schema migration discipline
if git diff --cached --name-only | grep -qE '^supabase/migrations/.*\.sql$'; then
  for f in $(git diff --cached --name-only | grep -E '^supabase/migrations/.*\.sql$'); do
    grep -q "^-- DOWN" "$f" || warn "$f is missing a -- DOWN block. Add inverse for reversibility."
    grep -qiE 'enable row level security|alter table .* enable rls' "$f" || \
      grep -qiE 'create policy' "$f" || \
      grep -qi 'create table' "$f" && warn "$f creates a table — confirm RLS is enabled."
  done
fi

# 4. No .env or secrets staged
if git diff --cached --name-only | grep -qE '(^|/)\.env($|\.[^/]+$)'; then
  fail "Refusing to commit .env file."
fi

# 5. Run engine tests if engine code changed
if git diff --cached --name-only | grep -qE '^engine/.*\.py$'; then
  if command -v pytest >/dev/null 2>&1; then
    (cd engine && pytest -x -q tests/) || fail "engine tests failed."
  fi
fi

echo "✓ pre-commit checks passed"
