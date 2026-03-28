# Claude AI Guidelines for Jovie Project

## STOP: Critical Requirements (Verify Before Any Command)

```bash
node --version   # MUST be v22.x (22.13+)
pnpm --version   # MUST be 9.15.4
```

**If wrong version:** `nvm use 22` and `corepack prepare pnpm@9.15.4 --activate`

| Do This | Not This |
|---------|----------|
| `pnpm install` | `npm install` / `yarn` |
| `pnpm --filter web dev` | `cd apps/web && pnpm dev` |
| `pnpm turbo build` | `npx turbo build` |

**Secrets require Doppler:** Prefix commands with `doppler run --` (e.g. `doppler run -- pnpm test`). Run `./scripts/setup.sh` to install and configure. See `AGENTS.md` for full Doppler setup.

---

## Linear Issue Gating

Skip any Linear issue labeled `human-review-required` or containing "This issue requires human review" in its description. Do not work on, close, or comment on these issues. See `AGENTS.md` for full details.

---

## gstack

This project includes [gstack](https://github.com/garrytan/gstack) vendored at `.claude/skills/gstack/`.

**Web browsing:** Always use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

**Available skills:**

| Skill | Purpose |
|-------|---------|
| `/plan-ceo-review` | CEO/founder-mode plan review — rethink from first principles |
| `/plan-eng-review` | Eng manager-mode plan review — architecture, edge cases, test coverage |
| `/review` | Pre-landing PR review for SQL safety, trust boundaries, side effects |
| `/ship` | Automated release: merge main, test, review, bump version, PR |
| `/browse` | Fast headless browser (~100ms/cmd) for QA and site verification |
| `/qa` | Systematic QA testing (diff-aware, full, quick, regression modes) |
| `/setup-browser-cookies` | Import authenticated browser sessions for testing |
| `/retro` | Weekly engineering retrospective with commit analysis |
| `/document-release` | Document a release |

**Troubleshooting:** If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

---

> **Full Guidelines:** See `AGENTS.md` at repo root for complete AI agent rules, engineering guardrails, and architecture guidance.

This file is intentionally kept minimal. The canonical source is `AGENTS.md`.

## Clerk Auth Proxy — DO NOT CHANGE

One Clerk instance per env (keys in Doppler). Proxy path: `/__clerk`. Handled by `fetch()` proxy in middleware (NOT `NextResponse.rewrite()` — that breaks Host headers). FAPI host decoded from publishable key at runtime. `clerk.jov.ie` is dead as a public URL. See `AGENTS.md` → "Clerk Auth Proxy Architecture" for details.

## E2E Test Authentication

Test auth uses Clerk `+clerk_test` emails with magic OTP `424242`. **No password needed.**

- Doppler: `jovie-web` project, `dev` config, binary at `/opt/homebrew/bin/doppler`
- Test user: `E2E_CLERK_USER_USERNAME` in Doppler (format `*+clerk_test@jov.ie`)
- Auth guard: `apps/web/tests/product-screenshots/helpers.ts` — `shouldSkipAuth()` skips if username missing or Clerk setup failed. `+clerk_test` emails bypass password requirement.
- Screenshots: `doppler run -p jovie-web -c dev -- pnpm --filter web screenshots`
- Browse auth: `doppler run -p jovie-web -c dev -- bun run scripts/browse-auth.ts`
- Full docs: `apps/web/tests/TESTING.md` (E2E Authentication section)

## Design System

Always read `DESIGN.md` before making any visual or UI decisions. All font choices, colors, spacing, and aesthetic direction are defined there. Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match `DESIGN.md`.

## Merge Requirements — Bot Review Comments Are Blocking

**Before merging any PR (including via `/land-and-deploy`), check for unaddressed bot review comments.** Unaddressed comments are a **BLOCKER** — do not merge until resolved.

### Bots to check

- `coderabbitai[bot]` (CodeRabbit)
- `greptile-apps[bot]` (Greptile)

### How to check

Use the GraphQL API to get review threads with resolution state:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
OWNER=$(echo "$REPO" | cut -d/ -f1)
NAME=$(echo "$REPO" | cut -d/ -f2)
PR_NUMBER=$(gh pr view --json number --jq '.number')

gh api graphql -f query='
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            isOutdated
            comments(first: 10) {
              nodes { author { login } body }
            }
          }
        }
      }
    }
  }
' -f owner="$OWNER" -f name="$NAME" -F number="$PR_NUMBER"
```

### Classification

For each review thread where the first comment's author is one of the bots above:

1. **Resolved** — `isResolved` is true → skip
2. **Outdated** — `isOutdated` is true → skip
3. **Addressed** — a reply exists in the thread from an author whose login does NOT end in `[bot]` → skip
4. **Nitpick** — first comment body starts with `[nitpick]` or `**nitpick**` → warning only, not blocking
5. **Unaddressed** — none of the above → **BLOCKER**

### When blocked

- List each unaddressed comment: `file:line` — first 80 chars of body — permalink
- Recommend: "Run `/review` to triage bot comments, or reply to each comment on GitHub"
- Do NOT merge with option C / "merge anyway" — this is a hard gate

### In the readiness report

Add a BOT REVIEWS section:
```
BOT REVIEWS
├─ CodeRabbit:   PASS / N unaddressed (blocker)
└─ Greptile:     PASS / N unaddressed (blocker)
```

---

## Deploy Configuration (configured by /setup-deploy)

- Platform: Vercel
- Production URL: https://jov.ie
- Staging URL: https://staging.jov.ie (Vercel preview alias)
- Deploy workflow: `.github/workflows/ci.yml` (`deploy-staging` -> `canary-health-gate` -> `promote-production`)
- Merge method: squash (merge queue)
- Project type: Web app (Next.js monorepo)
- Post-deploy health check: https://jov.ie/api/health

### Deploy flow

- Deploy trigger: automatic on push to `main`, with Vercel Git auto-aliasing disabled in `vercel.json`
- Staging deploy: `vercel deploy --prebuilt` -> preview URL -> `vercel alias` to `staging.jov.ie`
- Canary verification: health check + homepage + profile route against `staging.jov.ie`
- Production promotion: `vercel promote` after canary passes
- Post-promotion: Sentry error gate (5 minute soak) with auto-rollback
- Deploy status: `vercel promote` exit code + `canary-health-gate` + `sentry-error-gate`

### Custom deploy hooks

- Pre-merge: typecheck + lint (CI fast path, ~10-15s)
- DB migrations: run before staging deploy (production DB, additive only)
- Deploy trigger: automatic on push to `main`
- Health check: https://jov.ie/api/health (returns `{"status":"ok"}`)
