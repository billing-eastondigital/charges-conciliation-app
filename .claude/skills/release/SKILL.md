---
name: release
description: Cut a new release of the recon app. Use when the user says "release v{n}", "deploy", "ship it", "cortar release", "publicar nueva versión", or wants to promote the current main branch to production. Bumps the version, generates a changelog from git history, tags the commit, deploys Supabase migrations and Edge Functions, and triggers the Vercel deploy. Stops to confirm before any production write.
---

# Release

You are cutting a release. Production writes are blocked behind explicit user confirmation. This skill is conservative by design.

## Procedure

### Step 1 — Sanity checks

Refuse to proceed if any of these are true:
- Working tree is dirty (`git status` shows uncommitted changes).
- Current branch is not `main` (or the configured release branch).
- CI is failing on the latest commit.
- Any open ADR with status `Proposed` exists in `docs/decisions/` (must be `Accepted` or `Superseded` before release).
- `pytest engine/tests/` does not pass.
- `pnpm test && pnpm typecheck && pnpm lint` does not pass.
- Closed-period regression: re-run `historical_ingest` against current data and compare to a known-good snapshot. If any closed period's MATCH count or total variance changed, STOP — investigate before releasing.

### Step 2 — Determine version bump

Look at commits since last tag:

```bash
LAST=$(git describe --tags --abbrev=0)
git log $LAST..HEAD --pretty='%s'
```

Apply semver:
- `feat!:` or `BREAKING CHANGE:` → MAJOR
- `feat:` → MINOR
- `fix:`, `perf:`, `refactor:` → PATCH
- `docs:`, `chore:`, `test:` only → no release needed (skip)

Confirm the version with the user before proceeding.

### Step 3 — Generate the changelog

```bash
git log $LAST..HEAD --pretty='- %s (%h)' > .changelog_draft.txt
```

Group by type (feat / fix / docs / etc.). Filter out merge commits and trivial chores. Manually craft the user-facing summary at the top — the auto-generated list is supporting detail.

Write to `CHANGELOG.md` (insert at top, keep prior entries):

```markdown
## v{X.Y.Z} — {YYYY-MM-DD}

{2-3 sentence summary of what changed for the user}

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Forensic / Schema
- (any change that affects historical reconciliation must be noted here, even if minor)
```

### Step 4 — Tag and push

After user approves the changelog:

```bash
git add CHANGELOG.md
git commit -m "chore(release): v{X.Y.Z}"
git tag -a v{X.Y.Z} -m "Release v{X.Y.Z}"
# DO NOT push without explicit user confirmation — settings.json denies push by default
```

Then prompt the user to push the tag and commit themselves (security: this skill has no push permission).

### Step 5 — Deploy Supabase

After confirmation:

```bash
# Migrations (review the diff first!)
supabase db diff --linked

# Apply
supabase db push --linked

# Edge functions
for fn in supabase/functions/*/; do
    supabase functions deploy $(basename $fn) --project-ref $PROJECT_REF
done
```

### Step 6 — Deploy frontend (Vercel)

If Vercel is wired to the repo, the tag push triggers a deploy automatically. If not:

```bash
vercel --prod
```

### Step 7 — Smoke test production

After deploy:
- Hit the home page → loads, no console errors.
- Run the engine against last month's data via the dashboard's `/admin/reingest` action → completes, results match the audit packet for that period.
- Check Supabase logs for the Edge Functions → no errors in the first 5 minutes.

### Step 8 — Announce

Generate a short announcement (Slack format):

```
🚀 recon-app v{X.Y.Z} shipped

{summary}

Highlights:
• {feat 1}
• {feat 2}

Full changelog: github.com/.../blob/main/CHANGELOG.md
```

## Forensic guardrails

- A release that includes any change to engine grain, classification, or tolerance MUST be documented in CHANGELOG under "Forensic / Schema" with a link to the ADR.
- Never delete a Supabase migration. If a migration was wrong, supersede it with a new one.
- Never rewrite git history past the previous tag.
- If `historical_ingest` shows different numbers post-deploy than pre-deploy for a closed period, the release is broken — roll back.
