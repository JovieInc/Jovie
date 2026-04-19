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
| `/perf-loop` | Autonomous performance optimization loop (fire and forget) |

**Troubleshooting:** If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

---

> **Full Guidelines:** See `AGENTS.md` at repo root for complete AI agent rules, engineering guardrails, and architecture guidance.

This file is intentionally kept minimal. The canonical source is `AGENTS.md`.

## Clerk Auth Proxy — DO NOT CHANGE

One Clerk instance per env (keys in Doppler). Proxy path: `/__clerk`. Handled by `fetch()` proxy in middleware (NOT `NextResponse.rewrite()` — that breaks Host headers). FAPI host decoded from publishable key at runtime. `clerk.jov.ie` is dead as a public URL. See `AGENTS.md` → "Clerk Auth Proxy Architecture" for details.

## E2E Test Authentication

Local `/browse` auth is bypass-first, not Clerk-form-first.

- Start local browse QA with: `doppler run -- pnpm --filter web dev:local:browse`
- Local browse entrypoint: `/api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings`
- Use `persona=admin` only for admin QA
- This path sets bypass cookies directly and does **not** require `NEXT_PUBLIC_E2E_MODE=1`
- `scripts/browse-auth.ts` remains available as a fallback helper for non-loopback hosts
- Full docs: `apps/web/tests/TESTING.md`

## Test Coverage Policy

- Treat Codecov patch coverage as the PR readiness signal and project coverage as the regression ratchet.
- Codecov statuses are blocking in repo config; branch protection should require `codecov/project/default`, `codecov/patch/default`, `codecov/patch/critical`, and `E2E Smoke (PR Fast Feedback)` once each check has appeared recently in the repo.
- Bug-fix PRs must add or update a regression test, or explain the exception in the PR body.
- Add the `testing` label to billing, auth, entitlements, webhook, migration, and environment/config PRs so `E2E Smoke (PR Fast Feedback)` runs before merge.

## Design System

Always read `DESIGN.md` before making any visual or UI decisions. All font choices, colors, spacing, and aesthetic direction are defined there. Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match `DESIGN.md`.

## Merge Requirements — Bot Review Comments Are Blocking

**Before merging any PR (including via `/land-and-deploy`), check for unaddressed bot review comments.** Unaddressed comments are a **BLOCKER** — do not merge until resolved.

### Bots to check

- `coderabbitai[bot]` (CodeRabbit)
- `greptile-apps[bot]` (Greptile)

### How to check

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
PR_NUMBER=$(gh pr view --json number --jq '.number')

# Fetch all inline review comments on the PR
gh api "repos/$REPO/pulls/$PR_NUMBER/comments" --paginate \
  --jq '[.[] | {id, author: .user.login, path, line, body, html_url, in_reply_to_id, position}]'
```

### Classification

For each **root** comment (where `in_reply_to_id` is null) from the bots above:

1. **Outdated** — `position` is null (code was force-pushed past it) → skip
2. **Addressed** — another comment exists with `in_reply_to_id` equal to this comment's `id`, from a non-bot author → skip
3. **Nitpick** — body starts with `[nitpick]` or `**nitpick**` → warning only, not blocking
4. **Unaddressed** — none of the above → **BLOCKER**

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

## Artist Profiles Landing Page

When building or iterating on the Artist Profiles landing page:

- Keep the page premium and restrained.
- Prefer real product renders over invented UI.
- Do not use customization messaging, theme builders, or open-ended template language.
- Keep one big idea per section.
- Prefer fewer, stronger sections over more sections.
- Keep this page distinct from generic bio-link competitors and generic creator-site tools.
- Keep copy in data files, not inline JSX.
- Iterate section by section in browser instead of trying to style the whole page in one pass.
- Do not use fake stats, fake testimonials, or founder-first proof near the top of the page.
