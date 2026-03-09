---
description: Run smoke E2E tests, pull Sentry issues they triggered, and fix them
tags: [e2e, sentry, smoke, debugging, automation]
---

# /smoke-sentry — Smoke Test + Sentry Issue Fixer

Runs the `@smoke`-tagged Playwright tests against the local dev server, waits for
Sentry ingestion, fetches every new issue the run surfaced, fixes each root cause,
re-runs to confirm, then opens a PR.

---

## Pre-flight

Verify the following before proceeding. Abort with a clear message if any check fails.

```bash
# 1. Dev server is reachable
curl -sf "${BASE_URL:-http://localhost:3000}/api/health" > /dev/null \
  || { echo "ERROR: Dev server not running at ${BASE_URL:-http://localhost:3000}"; exit 1; }

# 2. Required env vars are present (via doppler)
doppler run -- bash -c '
  : "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN is not set in Doppler}"
  : "${SENTRY_ORG_SLUG:?SENTRY_ORG_SLUG is not set in Doppler}"
  : "${SENTRY_DEV_PROJECT:?SENTRY_DEV_PROJECT is not set in Doppler}"
  echo "Env vars OK"
'

# 3. Dev Sentry DSN is wired up
grep -q "SENTRY_DSN_DEV" apps/web/.env.local \
  || { echo "ERROR: SENTRY_DSN_DEV not found in apps/web/.env.local"; exit 1; }
```

---

## Step 1 — Record start time

```bash
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Run started at: $START_TIME"
```

---

## Step 2 — Run smoke tests

Run only `@smoke`-tagged tests on Chromium. Do **not** stop on failure — we want
to collect as many Sentry events as possible.

```bash
doppler run -- pnpm exec playwright test \
  --grep "@smoke" \
  --project=chromium \
  --reporter=line \
  --config=apps/web/playwright.config.ts \
  2>&1 | tee /tmp/smoke-run.log || true

echo "Smoke test run complete (failures captured above)"
```

> Note: failures are expected — that's why we're here. Capture them but continue.

---

## Step 3 — Wait for Sentry ingestion

```bash
echo "Waiting 15s for Sentry to ingest events..."
sleep 15
```

---

## Step 4 — Fetch new Sentry issues

Query the dev project for issues created since `START_TIME`.

```bash
ISSUES=$(doppler run -- bash -c "
  curl -sf \
    \"https://sentry.io/api/0/projects/\${SENTRY_ORG_SLUG}/\${SENTRY_DEV_PROJECT}/issues/?query=firstSeen:>${START_TIME}&limit=50\" \
    -H \"Authorization: Bearer \${SENTRY_AUTH_TOKEN}\"
")

echo "$ISSUES" | jq -r '.[] | "\(.id) \(.title)"'
ISSUE_COUNT=$(echo "$ISSUES" | jq 'length')
echo "Found $ISSUE_COUNT new issue(s)"
```

If `$ISSUE_COUNT` is 0, print "No new Sentry issues — smoke tests are clean!" and exit successfully.

---

## Step 5 — Fix each issue

For each issue in `$ISSUES`:

### 5a. Fetch the full event (stack trace + breadcrumbs)

```bash
ISSUE_ID="<id from step 4>"

EVENT=$(doppler run -- bash -c "
  curl -sf \
    \"https://sentry.io/api/0/issues/\${ISSUE_ID}/events/latest/\" \
    -H \"Authorization: Bearer \${SENTRY_AUTH_TOKEN}\"
")

# Print key info
echo "$EVENT" | jq '{title: .title, culprit: .culprit, frames: [.entries[] | select(.type=="exception") | .data.values[].stacktrace.frames[-3:] | .[] | {file: .filename, line: .lineNo, fn: .function}]}'
```

### 5b. Locate the source

Use the `filename` and `lineNo` from the top stack frame to find the exact file.
Read surrounding context with the `Read` tool.

### 5c. Fix the root cause

Apply the minimal fix. Follow these constraints:

- **Fix root cause, not symptoms** — no try/catch suppression without actual handling
- **No new error suppression in `ignoreErrors`** unless the error is genuinely non-actionable
- **Max 50 lines changed** per issue — if more is needed, open a Linear ticket instead
- **Follow existing patterns** — check nearby code before inventing a new approach

### 5d. Skip criteria

Skip an issue (log it) if any of the following apply:
- Already tagged `expected` or `ignored` in Sentry
- The fix would require > 50 lines of changes
- The issue is in a third-party dependency (not our code)
- The same fix has already been applied to a sibling issue

---

## Step 6 — Re-run failing smoke tests

After all fixes are applied, re-run only the tests that failed in Step 2:

```bash
FAILED_TESTS=$(grep "✘" /tmp/smoke-run.log | awk '{print $NF}' | head -20)

if [ -n "$FAILED_TESTS" ]; then
  doppler run -- pnpm exec playwright test \
    --grep "@smoke" \
    --project=chromium \
    --reporter=line \
    --config=apps/web/playwright.config.ts
fi
```

If tests still fail, investigate further before shipping.

---

## Step 7 — Ship a PR

### Stage and commit

```bash
git add -A
git commit -m "fix: resolve Sentry issues from smoke test run $(date +%Y-%m-%d)

Issues fixed:
$(echo "$ISSUES" | jq -r '.[] | "- \(.shortId): \(.title)"')

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Push and open PR

```bash
BRANCH="fix/smoke-sentry-$(date +%Y%m%d)"
git checkout -b "$BRANCH"
git push -u origin "$BRANCH"

ISSUE_LINKS=$(echo "$ISSUES" | jq -r '.[] | "- [\(.shortId)](\(.permalink)): \(.title)"')

gh pr create \
  --title "fix: resolve Sentry issues from smoke test run" \
  --body "$(cat <<EOF
## Summary

Automated fix for Sentry issues surfaced by the \`@smoke\` E2E test suite.

## Issues Fixed

${ISSUE_LINKS}

## Test Plan

- [x] Smoke tests re-run and passing after fixes
- [ ] Manual spot-check of affected flows in dev

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Environment Variables Required

| Variable | Where to set | Description |
|----------|-------------|-------------|
| `SENTRY_AUTH_TOKEN` | Doppler | Sentry API token with `project:read` + `event:read` |
| `SENTRY_ORG_SLUG` | Doppler | Sentry org slug (e.g. `jovie`) |
| `SENTRY_DEV_PROJECT` | Doppler | Dev project slug (e.g. `jovie-web-dev`) |
| `SENTRY_DSN_DEV` | `apps/web/.env.local` | Dev project DSN (server-side) |
| `NEXT_PUBLIC_SENTRY_DSN_DEV` | `apps/web/.env.local` | Dev project DSN (client-side) |
| `BASE_URL` | Shell (optional) | Dev server URL, defaults to `http://localhost:3000` |

---

## Constraints

- Never suppress errors with an empty `try/catch` — handle them or let them propagate
- Never add to `ignoreErrors` unless the error is genuinely non-actionable (document why)
- Max 15 files changed per PR — split larger refactors into separate issues
- If a fix requires > 50 lines, open a Linear ticket instead and link it in the PR body
- Do not touch `pnpm-lock.yaml` or `package.json` unless a dependency is the root cause
