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
