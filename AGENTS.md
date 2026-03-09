# AI Agent Guidelines for Jovie

> **This file is the canonical source for all AI agent rules, engineering guardrails, and architecture guidance.**

---

## Environment Setup (Run First)

Run the idempotent setup script before any command. It checks Node.js (22.x), pnpm (9.15.4), and Doppler CLI, installs missing tools, runs `pnpm install`, and verifies Doppler auth:

```bash
./scripts/setup.sh
```


### Tooling Requirements

| Tool | Required Version |
|------|-----------------|
| **Node.js** | **22.x** (22.13.0+) — enforced by `.nvmrc` and `package.json` engines |
| **pnpm** | **9.15.4** (exact) — enforced by `package.json` packageManager field |
| **Turbo** | 2.8+ |

Verify before any task:
```bash
node --version  # Must be v22.13.0+
pnpm --version  # Must be 9.15.4

# Fix if wrong:
nvm use 22
corepack enable && corepack prepare pnpm@9.15.4 --activate
```
### Secrets (Doppler)

ALL commands that need secrets MUST be prefixed with `doppler run --`:

- `doppler run -- pnpm test`
- `doppler run -- pnpm exec playwright test`
- `doppler run -- pnpm run dev:local`

**Install Doppler if missing:**
```bash
# macOS/Linux
curl -Lsf https://cli.doppler.com/install.sh | sh

# Windows (PowerShell)
(Invoke-WebRequest -Uri "https://cli.doppler.com/install.ps1" -UseBasicParsing).Content | powershell
```

Then authenticate:

```bash
doppler login
doppler setup --project jovie-web --config dev
```

**CI/Automation:** Set `DOPPLER_TOKEN` env var and use `doppler run --token "$DOPPLER_TOKEN" -- <command>`.

---
### Cloud Container Bootstrap (AI Agent Platforms)

For headless/container environments (Codex, cloud sandboxes, CI runners). Requires `DOPPLER_TOKEN` env var.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Node 22 LTS + pnpm
curl -fsSL https://fnm.vercel.app/install | bash
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"
fnm install 22.13.0 && fnm use 22.13.0
corepack enable && corepack prepare pnpm@9.15.4 --activate

# 2. Doppler CLI (secrets manager)
apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
  'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' \
  | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" \
  | tee /etc/apt/sources.list.d/doppler-cli.list
apt-get update && apt-get install -y doppler

# 3. Configure secrets (DOPPLER_TOKEN must be set)
doppler setup --project jovie-web --config dev --no-interactive
doppler secrets download --no-file --format env-no-quotes > apps/web/.env.local

# 4. Install dependencies + verify
pnpm install
pnpm turbo build --filter=@jovie/web
```

**Doppler service token:** Doppler dashboard → Project `jovie-web` → Config `dev` → Access → Service Tokens → Generate.

**Alternative:** Run `./scripts/codex-setup.sh` which handles OS detection, Doppler installation, and `.env.local` generation automatically.

---

## Monorepo Commands (Turbo)

**Always run from repository root.** Never `cd` into packages to run commands.

```bash
# Development
pnpm dev                    # Start all dev servers
pnpm --filter web dev       # Start only web app

# Building
pnpm build                  # Build all packages
pnpm --filter web build     # Build only web app

# Testing
pnpm test                   # Run all tests
pnpm --filter web test      # Run web tests only

# Linting & Type Checking
pnpm lint                   # Lint all packages
pnpm typecheck              # Type check all packages

# Database (web app)
pnpm --filter web drizzle:generate
pnpm --filter web drizzle:migrate
pnpm --filter web drizzle:studio

# CI optimization — run tasks only for changed packages
pnpm turbo build --affected
pnpm turbo test --affected
pnpm turbo lint --affected
```

---

### Turborepo Features

- `turbo.json` tasks have `description` fields readable by AI agents. Run `pnpm turbo build --dry` to see the plan.
- Search docs: `turbo docs "topic"` (e.g. `turbo docs "remote caching setup"`)
- Machine-readable docs: append `.md` to any `turborepo.dev` URL. Full sitemap: `turborepo.dev/sitemap.md`

### Git Worktrees for Parallel Agents

Turbo 2.8 automatically shares local cache across Git worktrees:

```bash
git worktree add ../Jovie-agent-1 -b agent/task-name
cd ../Jovie-agent-1 && pnpm install && pnpm turbo build
git worktree remove ../Jovie-agent-1
```


---

## Hard Guardrails (Enforced by Hooks)

These rules are enforced by `.claude/hooks/` and will **block your changes** if violated:

### 1. Migration Files Are Immutable

- **NEVER** edit, delete, or rename files in `drizzle/migrations/`
- To fix a migration issue: create a NEW migration

### 2. No Direct middleware.ts Creation

- `middleware.ts` requires careful review — propose changes via PR, don't create directly

### 3. No biome-ignore Comments

- **NEVER** add `// biome-ignore` comments — fix the underlying issue instead

### 4. No Emoji in UI — Use Icons

- **NEVER** use emoji in component markup, mock data, or UI strings
- Use proper SVG icons instead (e.g. Lucide icons or inline SVGs)
- Applies to all user-facing surfaces: marketing, dashboards, mockups

### 5. Conventional Commits Required

```bash
# Format: type(scope): description
feat(auth): add password reset flow
fix(dashboard): resolve chart rendering issue
refactor(api): simplify user endpoint logic
docs(readme): update setup instructions
```

### 6. Scan for Similar Bugs

When you fix a bug, search for the same pattern in related files and fix all instances. A bug in one file often indicates a systemic issue.

```bash
grep -rn "PATTERN_YOU_FIXED" apps/web --include="*.tsx"
```

### 7. Marketing Pages Must Be Fully Static

- All marketing, blog, and legal pages **must be fully static** (`export const revalidate = false`): no `headers()`, `cookies()`, `fetch` with `no-store`, or per-request data/nonce in `app/(marketing)` and `app/(dynamic)/legal` pages/layouts.
- `app/layout.tsx` must not read per-request headers for marketing; theme init belongs in static `/public/theme-init.js` (no nonce).
- Middleware (`proxy.ts`) should only issue CSP nonces for app/protected/API paths. Marketing routes must not depend on nonce or geo headers for rendering.
- Homepage "See It In Action" must not hit the database during SSR; use static `FALLBACK_AVATARS` only.
- Blog and changelog pages must be fully static, reading content from filesystem at build time only.
- Cookie banner remains client-driven (localStorage + server cookie write) without server-provided `x-show-cookie-banner` headers.
- Public profiles (`/[username]`) use ISR (1h revalidate) for real-time updates, with cache tag invalidation for instant profile updates.

**Why:** Fully static marketing pages eliminate cold start 500 errors, reduce Vercel costs (no serverless invocations), and provide instant TTFB (<100ms from CDN).

### 8. Global UI Components Render Once

Global UI elements must only render in root `app/layout.tsx`:
- Cookie banners
- Toast providers
- Modal providers
- Analytics scripts

**NEVER** render these in individual pages or nested layouts—causes duplicate overlapping UI elements.

### 9. Entitlements: Single Source of Truth

Entitlements behavior must stay centralized and predictable. Use these files as the canonical chain:

1. `apps/web/lib/entitlements/registry.ts` — plan matrix (features, limits, marketing metadata)
2. `apps/web/lib/entitlements/server.ts` — per-request user entitlement resolution
3. `apps/web/types/index.ts` — shared contract (`UserPlan`, `UserEntitlements`)

Required patterns:

- Always enforce access via `getCurrentUserEntitlements()` in API routes/actions.
- Always derive plan capabilities from `ENTITLEMENT_REGISTRY`; do not duplicate booleans/limits in call-sites.
- Billing outages degrade gracefully to free-tier entitlements (`getCurrentUserEntitlements` never throws). `BillingUnavailableError` is retained for backwards compatibility but is no longer thrown by default.
- Treat admin role as independent from billing status; use role-check-backed `isAdmin`.

Forbidden patterns:

- Reading billing rows directly in handlers to decide feature access.
- Recreating entitlement maps in pages/components/tests instead of importing canonical sources.
- Granting paid access based only on a raw `plan` string when canonical booleans/limits exist.

For deeper implementation guidance, use `.claude/skills/entitlements.md`.

---

## Linear Issue Gating

Skip any Linear issue labeled `human-review-required` or whose description contains "This issue requires human review". Do not work on, close, or comment on these issues.

When scanning for issues, always filter out:
- Label: `human-review-required`
- Description containing: "This issue requires human review"

**Apply `human-review-required` to:** automation/infra setup tasks, architectural decisions, process changes, and untriaged scanner-filed issues.

---

## PR Discipline (Required)

### Size Limits

- Max 10 files changed per PR (excluding lockfiles and generated files)
- Max 400 lines of diff (additions + deletions)
- If a task requires more, split into sequential PRs with clear dependencies

### Pre-Push Gate

Before pushing to a branch, agents MUST pass locally:
1. `pnpm turbo typecheck`
2. `pnpm --filter web exec tsc --noEmit`
3. `pnpm biome check apps/web`
4. `pnpm vitest --run --changed`
5. `pnpm --filter web lint:server-boundaries`

Do NOT push code that fails any of these. Fix first, push once.

### One PR = One Concern

- Each PR addresses exactly one Linear issue or one bug fix
- No drive-by refactors, no "while I'm here" changes
- If you find a related issue, create a separate Linear ticket

### Branch Hygiene

- Always rebase on develop before pushing (not merge)
- Branch strategy: `feature/* → develop → preview → production`
- If a PR has been open >24h without progress, close it and re-create from fresh develop

### Incremental Shipping

- Ship independent fixes as separate PRs
- Push and enable auto-merge immediately — don't wait for CI before starting the next fix
- Each PR must still pass the pre-push gate locally before pushing

### Auto-Merge Path Guardrails

Not all PRs are safe for auto-merge. PRs touching high-risk paths require manual review.

**Auto-merge BLOCKED (require manual review):**

| Path / Area | Why |
|-------------|-----|
| `/api/stripe/`, `/api/billing/` | Money — billing bugs cost real revenue |
| Auth middleware, Clerk sync, `proxy-state` | Identity — broken auth locks out users |
| Onboarding flow (`app/(onboarding)`) | First impression — broken onboarding kills conversion |
| Leads/outreach pipeline | Growth engine — silent failures lose prospects |
| Profile ownership / claim flow | Trust — incorrect ownership = legal + trust risk |

**Auto-merge ALLOWED (CI-gated):**

| Change Type | Examples |
|-------------|---------|
| Docs / copy / README | Markdown files, changelog, legal copy |
| Tests (unit, integration, e2e) | `*.test.ts`, `*.spec.ts`, test fixtures |
| Style-only | CSS, design tokens, Tailwind config |
| Dependency bumps (non-breaking) | Lockfile-only, patch/minor version bumps |
| Linting / formatting fixes | Biome auto-fixes, whitespace, import sorting |

When in doubt, skip auto-merge and request review.

---

### Pre-PR Checklist

1. **Run `/verify`** - Self-verification: typecheck, lint, tests, security checks
2. **Run `/simplify`** - Simplify recently modified code for clarity
3. **After pushing your branch, immediately open a draft PR** using GitHub CLI:
   ```bash
   gh pr create --draft --base main --title "<Linear issue title>" --body "## Summary\n- ...\n\nLinear: https://linear.app/jovie/issue/<ISSUE-ID>"
   ```
4. **Enable automerge** with squash:
   ```bash
   gh pr merge --auto --squash
   ```


---

## Architecture Overview

```
Jovie/
├── apps/
│   ├── web/                 # Main Next.js 15 application
│   └── should-i-make/       # Secondary app
├── packages/
│   └── ui/                  # Shared UI components
├── drizzle/                 # Database migrations (IMMUTABLE)
├── .claude/hooks/           # Claude Code enforcement hooks
├── .cursor/hooks/           # Cursor enforcement hooks
└── turbo.json               # Monorepo task configuration
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Database | Neon PostgreSQL + Drizzle ORM |
| Auth | Clerk |
| Payments | Stripe |
| Linting | Biome |
| Package Manager | pnpm 9.15.4 |
| Monorepo | Turborepo |
| Runtime | Node.js 22 LTS |

### API Runtime

All API routes run on **Node.js runtime** (the Next.js default). Do not use Edge runtime — the API relies on connection pooling (Neon), native bindings (Sharp), Stripe SDK, and long-duration cron jobs (60–300s), none of which work on Edge.

Only add `export const runtime = 'nodejs'` when documenting a specific constraint (e.g. Sharp, Stripe). Don't add it as boilerplate.

---

## Code Quality Standards

### TypeScript

- Strict mode — no `any` without justification; prefer `unknown` for truly unknown types
- Use proper interfaces for all data structures
- **Always run `pnpm turbo typecheck` before pushing** — do not push with known type errors

**Null safety:** Always guard against null/undefined before calling string methods:

```typescript
// WRONG: Will throw TypeError if title is undefined
const slug = title.replaceAll(' ', '-');

// CORRECT: Guard with optional chaining or nullish coalescing
const slug = title?.replaceAll(' ', '-') ?? '';
```

**Cross-environment globals:** Use `globalThis` instead of `window` or `global`:

| Wrong | Correct |
|-------|---------|
| `window.location` (no guard) | `typeof window !== 'undefined' ? window.location : undefined` |
| `global.fetch` | `globalThis.fetch` |

Note: `globalThis.location` is still `undefined` in Node.js SSR — SSR guards are required.

### React/Next.js

- Functional components with hooks only; Server Components by default
- Use `'use client'` sparingly and intentionally
- **Never define components inline** (inside other components or render functions) — they are recreated every render, breaking reconciliation
- **Never hardcode route paths** — import from `constants/routes.ts` (e.g. `APP_ROUTES.AUDIENCE`)

### Server/Client Boundaries (Enforced by ESLint)

Client components MUST have `'use client'` when using React hooks. Server-only modules cannot be imported in `'use client'` files:
- `@/lib/db/*`, `@clerk/nextjs/server`, `stripe`, `resend`, `drizzle-orm`, `*.server.ts`

```bash
pnpm --filter web lint:server-boundaries  # quick check
pnpm --filter web lint:eslint             # full ESLint check
```

### Database Access (Single Driver Policy)

**Always use `import { db } from '@/lib/db'`** — this is the canonical database client.

- `lib/db/client.ts` is a legacy HTTP-based client — do not use it
- Use `db.query.*` or `db.select()`, not raw SQL strings outside `lib/db`
- Use `db.insert().values([...items])` for batches, never loop with individual `db.insert()` calls

**Transaction Restrictions (Neon HTTP Driver):**
- **NEVER** use `db.transaction()` — Neon HTTP driver does not support interactive transactions
- For atomicity, use Drizzle batch operations: `db.insert().values([...items])`

**Forbidden patterns:**

| Forbidden | Why | Alternative |
|-----------|-----|-------------|
| `db.transaction(async (tx) => ...)` | Neon HTTP incompatible | Sequential ops or batch insert |
| `import { Pool } from 'pg'` / `import pg from 'pg'` | Manual pooling conflicts with Neon | `import { db } from '@/lib/db'` |
| `new Pool()` / `pool.connect()` | Manual connection management | `import { db } from '@/lib/db'` |
| Loop with individual `db.insert()` | O(N) DB operations | `db.insert().values([...items])` |

### Data Serialization (Server → Client Boundaries)

**Date objects MUST be serialized** before caching in Redis, returning from Server Actions/API routes, or passing from RSC to Client Components:

```typescript
// Wrong
return { createdAt: user.createdAt }
// Correct
return { createdAt: user.createdAt?.toISOString() }

// Helper
const toISOStringOrNull = (date: Date | null | undefined) => date?.toISOString() ?? null;
```

### React Hook Guidelines

```typescript
// CORRECT: Stable dependencies
const callback = useCallback(() => doThing(id), [id]);
useEffect(() => { ... }, [callback]);

// WRONG: Object/function in deps = infinite loop
useEffect(() => { ... }, [{ foo }]);           // Object recreated each render
useEffect(() => { ... }, [() => doThing()]);   // Function recreated each render

// CORRECT: Cleanup subscriptions
useEffect(() => {
  const sub = subscribe();
  return () => sub.unsubscribe();  // Always cleanup!
}, []);

// WRONG: State update during render
if (condition) setState(x);  // Causes infinite loop!
// CORRECT: Use useEffect for conditional state updates
useEffect(() => {
  if (condition) setState(x);
}, [condition]);
```

### TanStack Query Patterns

All `useQuery` calls MUST specify cache configuration and pass `AbortSignal`:

```typescript
// Correct
useQuery({
  queryKey: keys.user(id),
  queryFn: ({ signal }) => fetchUser(id, { signal }),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

// Wrong: missing cache config and signal
useQuery({
  queryKey: keys.user(id),
  queryFn: () => fetchUser(id),
})
```

Use presets from `lib/queries/cache.ts`: `STABLE_CACHE` (rarely-changing data) and `DYNAMIC_CACHE` (frequently-updated data).

For stable data, disable aggressive refetching: `refetchOnMount: false, refetchOnWindowFocus: false`.

### Styling

- Tailwind utility classes only (no custom CSS unless necessary)
- Follow existing design tokens in `tailwind.config.ts`
- Mobile-first responsive design

### Testing

- Unit tests: Vitest with jsdom; E2E tests: Playwright
- Focus on user behavior, not implementation details
- Write tests at feature creation time, not retroactively

#### E2E Authentication with Clerk

Use Clerk's official Playwright helpers for any E2E test that needs auth:

1. Create unique test email: `` `e2e+clerk_test+${Date.now().toString(36)}@example.com` ``
2. Call `setupClerkTestingToken({ page })` before navigating to Clerk pages
3. Navigate to `/signin` and wait for `window.Clerk?.loaded`
4. Use `createOrReuseTestUserSession(page, email)` from `apps/web/tests/helpers/clerk-auth.ts`
5. Assert authenticated state before continuing

**Do NOT:** reuse auth sessions across tests, hardcode OTP codes, mock Clerk auth, or skip sign-in flows unless the test scope explicitly starts post-auth.

**Reference:** `apps/web/tests/e2e/golden-path-signup.spec.ts`

**Test user cleanup:**
```bash
doppler run -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts
doppler run -- pnpm tsx apps/web/scripts/setup-e2e-users.ts
```

#### General E2E Rules

- Include meaningful behavioral assertions (not just render/no-crash checks)
- Music fetch must remain real in integration/E2E — do not mock it; increase timeout if slow
- Stripe flows use test mode and card `4242 4242 4242 4242`
- Do not assert on CSS values, spacing, or brittle copy text
- Prefer `data-testid` selectors over fragile structural selectors

#### Test Performance (CI Runtime Is a First-Class Constraint)

Tests are part of the deploy path. Slow tests slow shipping.

**Core rule:** Any test that materially slows CI without proportional risk reduction is harmful, even if correct. We're pre-PMF — iteration speed is critical; gated CI must support 2–3 deploys per day.

| Gated CI — Allowed | Gated CI — Not Allowed |
|--------------------|-----------------------|
| Fast, deterministic unit/integration tests | Long-running E2E, exhaustive fuzzing |
| Minimal fixture setup, mocked external calls | Large fixtures, real network, sleep/polling loops |

Slow or high-cardinality tests belong in nightly/async jobs that never block deploys.

**Agent rules:** Prefer fewer, stronger assertions. Collapse redundant tests. Call out expected runtime impact in PRs when adding tests.

#### Test Coverage Guidelines

**Tests REQUIRED for:**
- Core logic (parsers, transformers, validators)
- API routes and server actions
- Gating systems (waitlist, auth, permissions, entitlements)
- Deterministic workflows (intent router, CRUD, feedback submission)
- Backend services and data pipelines
- Database queries and mutations (especially complex joins/filters)

**Tests may be SKIPPED for:**
- Rapidly changing UI components (layout, styling, copy)
- Prototype/experimental features still in flux
- Pure presentation components with no logic
- Marketing page content and static pages

No strict coverage % targets — quality over quantity. Deterministic workflows must have 100% path coverage.

---

## Infrastructure & Scheduling Guardrails (CRITICAL)

AI agents lack context about operational costs and infrastructure consequences. Before creating any scheduled/background work, walk through this hierarchy **in order** and use the first option that works:

| Priority | Approach | When to Use |
|----------|----------|-------------|
| 1 | **Webhook / Event handler** | An external service (Stripe, Clerk, etc.) can notify you. **Almost always the right answer.** |
| 2 | **Inline after-action** | Work can happen synchronously after the triggering action |
| 3 | **On-demand / lazy evaluation** | Work can happen when data is next accessed |
| 4 | **Add to existing scheduled job** | Add logic to an existing nightly/periodic job |
| 5 | **New scheduled job** | Only if none of the above work, AND documented in the PR |

### Rules for Cron Jobs & Scheduled Tasks

1. **NEVER create a new cron job without explicit approval.** Document in the PR: why webhooks won't work, why it can't join an existing job, expected API call volume, and proposed frequency justification.

2. **Consolidate, don't proliferate.** Multiple cleanup tasks that run at similar times should be a single job with multiple steps.

3. **Frequency must be justified by business need.** If you can't explain what breaks between intervals, the interval is too frequent.

4. **Cron jobs are NOT a substitute for webhooks.** If Stripe, Clerk, or any external service provides webhooks, use them. Reconciliation jobs (if needed) run at most daily as a safety net.

### External API Call Budget

Every external API call has a cost. Before writing code that calls third-party services:

| Rule | Rationale |
|------|-----------|
| **NEVER iterate over all users to call an external API** | O(users) calls per run × runs/day. At 1,000 users hourly = 24,000 calls/day. |
| **NEVER poll external APIs for state you can receive via webhook** | Stripe, Clerk, Resend all push state changes. Use them. |
| **Batch where possible** | Use batch/list endpoints instead of per-record fetches |
| **Cache aggressively** | Cache with appropriate TTLs; don't re-fetch what hasn't changed |
| **Log and monitor call volume** | New integrations must log call counts so we can track costs |

**Stripe specifically:** Webhooks are the primary mechanism. NEVER enumerate all Stripe customers/subscriptions. Query the local DB for anomalies, then spot-check individual records. Before adding any Stripe API call: `(calls/run) × (runs/day) × 30 = monthly calls`. If >1,000/month, justify it in the PR.

### Forbidden Infrastructure Patterns

| Forbidden | Why | Do This Instead |
|-----------|-----|-----------------|
| New Vercel Cron entry without PR approval | Cron proliferation | Add logic to existing cron or use events |
| Polling loop calling external APIs | Burns API budget and rate limits | Use webhooks |
| Per-user external API call in a loop | O(N) API calls | Batch endpoints or event-driven |
| New job queue / worker system | We already have `ingestionJobs` in-database queue | Use existing system or justify |
| Adding Bull, Agenda, BullMQ, or similar | Operational complexity at our scale | Use existing in-database queue or Vercel Cron |
| `setInterval` / `setTimeout` in server code | Serverless functions don't persist; silently fail | Use Vercel Cron or existing job queue |
| Dedicated "sync" service | Polling-based sync is almost always wrong | Webhook + reconciliation safety net |

### Cost Impact Disclosure

PRs that introduce/modify external API calls, cron frequency, scheduled DB queries, or new third-party integrations MUST include a **Cost Impact** section:

**Cost Impact template:**

```markdown
## Cost Impact
- **External API calls**: ~X calls/day to [Service] (X calls/run × Y runs/day)
- **Monthly projection**: ~X calls/month at current user count
- **Scaling factor**: O(1) / O(users) / O(records) per run
- **Monthly cost estimate**: $X based on [pricing tier]
```

---

## General Agent Decision-Making Rules

1. **Don't architect what you don't understand.** If you're unsure about billing model, pricing tiers, API rate limits, or infrastructure costs, ASK before building.

2. **Prefer boring, proven patterns.** Use established codebase patterns for webhooks, job queues, caching, and API integration. Don't invent new patterns for solved problems.

3. **Scope your changes to what was asked.** Don't refactor unrelated systems while fixing one thing.

4. **Read the provider's webhook docs first.** Almost every SaaS (Stripe, Clerk, Resend, Vercel) has webhook support. Check before building a polling solution.

5. **Never silently add recurring costs.** If your change will run repeatedly in production, say so in the PR with volume estimates.

**Before merging any PR with background/scheduled work, verify:**
- [ ] Is there already a webhook for this event?
- [ ] Can this logic run inline after the triggering action?
- [ ] Can this be lazy-evaluated when data is next read?
- [ ] If a cron job is truly needed, can it join an existing one?
- [ ] What's the API call volume at 100 / 1,000 / 10,000 / 100,000 users?
- [ ] What happens if this job fails? Is there retry/dead-letter handling?
- [ ] Is the frequency justified? What breaks if we run it less often?
- [ ] Is a Cost Impact section included in the PR description?

---

## Environment Variables

**NEVER** hardcode secrets. Always use the validated env:

```typescript
// Correct
import { env } from '@/lib/env';
const apiKey = env.STRIPE_SECRET_KEY;

// Wrong — no validation
const apiKey = process.env.STRIPE_SECRET_KEY;
```

Required variables are defined in `lib/env.ts` with Zod validation.

---

## Branch Strategy

```
feature/* ──► develop ──► preview ──► production
```

- **NEVER** push directly to `preview` or `production`
- Create feature branches from `develop`
- All changes require PR review

---

## Quick Troubleshooting

### "Command not found: pnpm"
```bash
corepack enable && corepack prepare pnpm@9.15.4 --activate
```

### "Node version mismatch"
```bash
nvm install 22 && nvm use 22
```

### "Turbo cache issues"
```bash
pnpm turbo clean
rm -rf node_modules/.cache
```

### "Test OOM / Out of Memory"
```bash
pnpm turbo test --concurrency=1
pnpm turbo test --affected --concurrency=1
```

### "Type errors after pull"
```bash
pnpm install && pnpm typecheck
```

---

## Additional Resources

- **Copilot-specific**: `.github/copilot-instructions.md`
- **Cursor-specific**: `apps/web/.cursorrules`
- **Hooks documentation**: `.claude/hooks/README.md`

---

## Turborepo Quick Reference (Agent Index)

Compressed documentation index. Use `turbo docs "topic"` for full details.

```
topic|config/command|notes
task-deps|dependsOn: ["^build"]|^ = topological (upstream first), no prefix = same-package
task-inputs|inputs: ["$TURBO_DEFAULT$", "!**/*.test.ts"]|narrow cache key, exclude tests from build
task-outputs|outputs: [".next/**", "dist/**"]|what turbo caches and restores on hit
task-description|description: "what this task does"|human/agent-readable, no execution effect (2.8+)
env-vars|env: ["NODE_ENV", "NEXT_PUBLIC_*"]|wildcards supported, affects cache hash
global-deps|globalDependencies: [".env.*local"]|changes invalidate ALL task caches
pass-through-env|globalPassThroughEnv: ["SENTRY_AUTH_TOKEN"]|available at runtime but doesn't affect cache
persistent|"persistent": true|long-running (dev servers), can't be depended on
interruptible|"interruptible": true|turbo watch can restart if inputs change
no-cache|"cache": false|always re-runs (dev, format, lint:fix, drizzle:generate)
remote-cache|remoteCache.enabled: true|share cache across CI and local machines
affected|--affected|run only changed packages vs base branch (CI optimization)
concurrency|--concurrency=N or --concurrency=50%|limit parallel tasks (OOM mitigation)
dry-run|--dry / --dry=json|preview execution plan without running
filter|--filter=@jovie/web|run task for specific package only
graph|--graph|visualize task dependency graph (svg, png, json, html)
force|--force|ignore cache, re-execute all tasks
output-logs|outputLogs: "errors-only"|reduce log noise (full, hash-only, new-only, errors-only, none)
summarize|--summarize|generate JSON metadata for timing/cache analysis
turbo-clean|pnpm turbo clean|clear local cache when debugging
turbo-docs|turbo docs "query"|search turborepo.dev documentation from terminal (2.8+)
worktrees|git worktree add ../dir -b branch|cache shared automatically across worktrees (2.8+)
schema|$schema: turborepo.dev/schema.json|validates turbo.json in editors, use turborepo.dev domain
daemon|daemon: false|background process for optimization (disabled in Jovie due to gRPC issues)
```

---

**Remember: When in doubt, verify your Node version (`node --version`) and use pnpm from the repository root.**
