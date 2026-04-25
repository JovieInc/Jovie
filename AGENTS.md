# AI Agent Guidelines for Jovie

> **This file is the canonical source for all AI agent rules, engineering guardrails, and architecture guidance.**

---

## Workspace Topology

This repo is the main code workspace.

- Default coding profile: `coder`
- Ops / FounderOS workspace: `/Users/timwhite/conductor/workspaces/ops/raleigh`
- Treat that ops repo as the source of truth for `company_state.md`, daily briefings, and task routing
- Keep code changes in this repo; keep orchestration and company-state updates in the ops repo

## Environment Setup (Run First)

Before running ANY command in this repo, run:

```bash
./scripts/setup.sh
```

On Windows PowerShell, run the wrapper instead so Git for Windows Bash is used instead of the WSL launcher:

```powershell
.\scripts\setup.ps1
```

This idempotent script checks Node.js (22.x), pnpm (9.15.4), `ripgrep` (`rg`), Doppler CLI, and GitHub CLI auth, installs missing tools when supported, runs `pnpm install`, and verifies Doppler auth.

On every fresh Git worktree, run `./scripts/setup.sh` again before doing anything else.
Worktrees do not share `node_modules`, so dependency installation is per-worktree even when Turbo cache is shared.

### Database Isolation for Agents

Do **NOT** create Neon ephemeral branches automatically in `./scripts/setup.sh`.

`setup.sh` must stay a fast, idempotent local bootstrap:
- verify/install required tools
- install dependencies
- verify Doppler auth/config
- verify GitHub CLI auth when present, including `GH_TOKEN`/`GITHUB_TOKEN` supplied by the environment or Doppler
- avoid creating remote infrastructure by default

Creating an isolated database branch for every fresh worktree is wasteful and can exhaust Neon branch limits. Most agent tasks do not need a private mutable database.

Use an ephemeral Neon branch **only when the task actually requires isolated DB state**, such as:
- mutation-heavy QA or crawling
- end-to-end flows that create/update/delete data
- migration validation
- debugging issues caused by shared state

Default policy:
- normal coding/review/docs tasks: use the standard local/dev configuration
- local tasks needing isolated mutable state: provision a DB branch explicitly via a dedicated command or script
- PR preview / CI QA: prefer per-PR ephemeral databases in CI or preview workflows, not local worktree bootstrap

If a dedicated helper is added later (for example `./scripts/dev-db-branch.sh`), agents should run it explicitly when needed rather than baking branch creation into `setup.sh`.

### Running tests and commands requiring secrets

ALL commands that need secrets MUST be prefixed with Doppler, and local/dev commands should pin the repo's default scope explicitly as `doppler run --project jovie-web --config dev --`:

- `pnpm run test:web`
- `pnpm run test:web:watch`
- `pnpm run test:web:e2e`
- `pnpm run test:web:smoke`
- `pnpm run dev:web:local`
- `pnpm run dev:web:browse`
- `pnpm test` alone **will fail** — missing env vars

Reason: local agents and worktrees should not rely on whatever Doppler scope happens to be active in the shell.

### Local Auth Bypass For Perf And E2E

When local perf or E2E work needs an authenticated session on loopback/private hosts, prefer the repo's dev auth bypass before assuming Clerk bootstrap is required or broken.

- Enable `E2E_USE_TEST_AUTH_BYPASS=1` for local authenticated test runs.
- Use `/api/dev/test-auth/session` to mint bypass cookies for programmatic flows and `/api/dev/test-auth/enter?persona=...&redirect=/app` for browser bootstrap flows.
- Validate the loopback host you are actually using (`localhost` vs `127.0.0.1`) because host-only cookies do not cross between them.
- If auth bootstrap fails locally, debug the bypass route/cookie flow first instead of treating it as an expected limitation.

### If Doppler is not installed

```bash
# macOS/Linux
curl -Lsf https://cli.doppler.com/install.sh | sh

# Windows (PowerShell)
(Invoke-WebRequest -Uri "https://cli.doppler.com/install.ps1" -UseBasicParsing).Content | powershell
```

Then authenticate and configure:

```bash
doppler login
doppler setup --project jovie-web --config dev
```

### For CI / Automation

Set `DOPPLER_TOKEN` env var and use:

```bash
doppler run --token "$DOPPLER_TOKEN" -- <command>
```

---

## CRITICAL: Tooling Requirements (READ FIRST)

**STOP AND VERIFY BEFORE RUNNING ANY COMMANDS.**

| Tool | Required Version | Enforcement |
|------|------------------|-------------|
| **Node.js** | **22.x** (22.13.0+) | `.nvmrc`, `package.json` engines |
| **pnpm** | **9.15.4** (exact) | `package.json` packageManager field |
| **Turbo** | 2.8+ | Root devDependencies |

### Why This Matters

AI agents frequently default to Node 18/20 which **will fail** or cause subtle issues. The entire CI/CD pipeline, build system, and runtime are configured for Node 22 LTS.

### Pre-Flight Checklist (Run Before Any Task)

```bash
# 1. Verify Node version - MUST be 22.x (22.13+)
node --version  # Expected: v22.13.0 or higher

# 2. Verify pnpm version - MUST be 9.15.4
pnpm --version  # Expected: 9.15.4

# 3. If wrong version, fix it:
nvm use 22       # or: nvm install 22
corepack enable && corepack prepare pnpm@9.15.4 --activate
```

### Cloud Container Bootstrap (AI Agent Platforms)

For headless/container environments (Codex, cloud sandboxes, CI runners). Requires `DOPPLER_TOKEN` env var set to a service token.

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

**Creating a Doppler service token:** Doppler dashboard → Project `jovie-web` → Config `dev` → Access → Service Tokens → Generate. Pass as `DOPPLER_TOKEN` env var.

**Alternative:** Run `./scripts/codex-setup.sh`, the Codex wrapper that delegates to the canonical `./scripts/setup.sh` bootstrap. Codex lifecycle config in `.codex/` also runs that wrapper automatically when supported.

### Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `npm install` | `pnpm install` |
| `yarn add` | `pnpm add` |
| `npx turbo ...` | `pnpm turbo ...` |
| Running turbo from wrong directory | Always run from repo root |
| `cd apps/web && pnpm dev` | `pnpm run dev:web:local` |
| `node script.js` with Node < 22 | Verify `node --version` first |

---

## Monorepo Commands (Turbo)

**Always run from repository root.** Never `cd` into packages to run commands.

For local web dev and secret-bound test flows, prefer the root wrappers (`pnpm run dev:web:local`, `pnpm run dev:web:browse`, `pnpm run test:web`) over direct filtered package commands.

```bash
# Development
pnpm dev                    # Start all dev servers
pnpm run dev:web:local      # Start local web app with pinned Doppler scope

# Building
pnpm build                  # Build all packages
pnpm --filter web build     # Build only web app

# Testing
pnpm test                   # Run all workspace tests
pnpm run test:web           # Run web tests with pinned Doppler scope

# Linting & Type Checking
pnpm lint                   # Lint all packages
pnpm typecheck              # Type check all packages

# Database (web app specific)
pnpm --filter web drizzle:generate   # Generate migrations
pnpm run db:web:migrate             # Apply migrations with pinned Doppler scope
pnpm run db:web:studio              # Open Drizzle Studio with pinned Doppler scope
```

---

### Turborepo 2.8 Features

All tasks in `turbo.json` have `description` fields that explain their purpose. These are readable by AI agents and help with onboarding. Run `pnpm turbo build --dry` to see task descriptions and the execution plan.

**Search Turborepo docs from the terminal:**

```bash
turbo docs "task configuration"     # Search for any topic
turbo docs "remote caching setup"   # Caching documentation
turbo docs "environment variables"  # Env var handling
```

Machine-readable docs: append `.md` to any URL at `turborepo.dev` (e.g., `turborepo.dev/docs/reference/configuration.md`). Full sitemap: `turborepo.dev/sitemap.md`.

### Git Worktrees for Parallel Agents

Turbo 2.8 automatically shares local cache across Git worktrees. Use worktrees to run multiple agents in parallel on the same repo:

```bash
# Create a worktree for parallel work
git worktree add ../Jovie-agent-1 -b agent/task-name

# Each worktree needs its own node_modules but shares turbo cache
cd ../Jovie-agent-1 && ./scripts/setup.sh && pnpm turbo build

# Clean up when done
git worktree remove ../Jovie-agent-1
```

No configuration is needed -- Turbo detects worktrees automatically and shares the local cache. Combined with remote caching, agents in separate worktrees get near-instant cache hits.

#### Concurrent Commit Pitfall — `git stash` Races Across Worktrees

`git stash` is **repo-global** — every worktree writes to the same `.git/refs/stash` stack. lint-staged backs up the working tree to a stash before running tasks and pops it on cleanup. When multiple worktrees invoke `git commit` concurrently, their lint-staged runs step on each other's backup stashes.

Symptom (from a parallel swarm of worktree agents):

```
[STARTED] Cleaning up temporary files...
[FAILED] lint-staged automatic backup is missing!
husky - pre-commit script failed (code 1)
```

Important: the commit itself often **succeeds** before husky errors on cleanup. Check `git log --oneline origin/main..HEAD` before assuming the work was lost and retrying — a blind retry after "failure" is how duplicate commits get introduced.

Mitigations (in priority order):

1. **Serialize commits across worktrees** in the orchestrator. Don't fire `git commit` in 5 worktrees at once; queue them.
2. Before commit, drop stale lint-staged stashes left by prior failed runs: `while git stash list | grep -q "lint-staged automatic backup"; do git stash drop "stash@{0}"; done`. Run this right before the commit, not preemptively.
3. If you're running long-lived parallel worktree agents (like `/swarm`), dispatch each agent in its own backgrounded turn so their commit windows rarely overlap.

**Never** use `--no-verify` to route around this. The hook failure message is cosmetic, but the fix is coordination, not skipping validation.

### Affected Builds (CI Optimization)

Use `--affected` to run tasks only for packages that changed relative to the base branch:

```bash
pnpm turbo build --affected    # Build only changed packages
pnpm turbo test --affected     # Test only changed packages
pnpm turbo lint --affected     # Lint only changed packages
```

This is particularly useful in CI to avoid rebuilding the entire monorepo on every PR. For non-standard setups, set `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` explicitly.

---

## Hard Guardrails (Enforced by Hooks)

These rules are enforced by `.claude/hooks/` and will **block your changes** if violated:

### 1. Migration Files Are Immutable

- **NEVER** edit, delete, or rename migration SQL or snapshot files that already exist in `drizzle/migrations/` on the base branch
- **ALLOW** generated append-only migration artifacts for a new migration: one new `*.sql`, one new `meta/*_snapshot.json`, and the corresponding append to `meta/_journal.json`
- To fix a migration issue: create a NEW migration

### 2. No Direct middleware.ts Creation

- `middleware.ts` requires careful review
- Propose changes via PR description, don't create directly

### 3. No biome-ignore Comments

- **NEVER** add `// biome-ignore` comments to bypass linting
- Fix the underlying issue instead
- If truly necessary, discuss with maintainers first
- For JSON-LD or structured data, prefer plain `<script type="application/ld+json">{...}</script>` children or `safeJsonLdStringify()` from `apps/web/lib/utils/json-ld.ts` instead of `dangerouslySetInnerHTML` plus suppression

### 4. No Emoji in UI — Use Icons

- **NEVER** use emoji characters in component markup, mock data, or UI strings
- Emoji looks cheap and undesigned — always use proper SVG icons instead
- For decorative indicators, use small SVG icon components (e.g., Lucide icons or inline SVGs)
- This applies to marketing pages, dashboards, mockups, and all user-facing surfaces

### 4a. Text Casing Rules

- All user-facing text must follow `DESIGN.md` casing rules
- **Title Case** for labels, headings, buttons, badges, column headers, nav items
- **Sentence case** for body text, descriptions, tooltips, toasts
- Never lowercase the first word of a visible label or heading
- Use `capitalizeFirst()` from `apps/web/lib/utils/string-utils.ts` for dynamic data from the database

### 4b. Subtraction Principle (Tim White Canon)

- UI cleanup must follow the subtraction principle: remove before adding
- Before building a child component, open the parent container file and list what chrome (title, header, card surface, borders) it already renders — then omit those from the child
- When a screen feels messy, agents should first look for duplicated labels, redundant helper text, nested containers, extra borders, repeated actions, and unnecessary variants
- Prefer one clear heading, one clear action cluster, and one clear surface hierarchy instead of layering multiple decorative cues
- If an existing label, icon, placeholder, or layout already communicates the action, remove the extra explanatory UI around it
- Agents should not "solve" weak hierarchy by adding more badges, more cards, more copy, or more controls unless subtraction has clearly failed
- During refactors and polish passes, explicitly audit for what can be deleted, merged, flattened, or simplified before introducing anything new

### 4c. No AI-Slop Product UI

- Jovie product UI must feel closer to Linear than generic AI-generated dashboards: compact, quiet, precise, and premium
- Default to small typography, restrained weight changes, and clean spacing before adding decorative treatment
- Do **NOT** use all-caps labels, eyebrow text, or section headers as a default styling move; use normal Title Case labels unless an existing canonical pattern explicitly calls for something else
- For marketing sections, the default composition is: one headline, one subhead, one visual. Do not add eyebrow text, labels, proof bars, separators, helper rows, or extra wrapper cards unless a human explicitly asks for that exact element
- Eyebrow text is banned by default on marketing pages. Only add an eyebrow when a human explicitly requests it for that exact section
- For homepage-style marketing heroes, treat the first viewport like a poster: do not inset the hero inside a floating card, and do not push the primary proof element below the fold with a `100vh` shell plus extra stacked content. The initial viewport must include the full hero composition and the first proof beat together
- Do **NOT** wrap content in a Card when the parent surface (Sheet, Drawer, existing Card) already provides visual grouping; first solve hierarchy with spacing, alignment, type, and surface contrast
- Nested decorative carding around a phone, screenshot, or demo is banned by default. If the visual already lives inside a phone, drawer, or screenshot, do not wrap it in extra floating cards just to make it feel designed
- Borders are a supporting tool, not the main design language; if a border can be removed without losing meaning, remove it
- Avoid the common AI mockup pattern of tiny uppercase eyebrow + long explanatory paragraph inside a large rounded bordered card
- Prefer one compact, well-set label and one clear body line over stacked label, headline, description, and chrome all saying the same thing
- When revising a marketing layout and the direction is unclear, do not add explanatory copy or chrome as a hedge. The fallback is subtraction: headline, subhead, one visual
- When implementing or revising UI, compare the result against this smell test: if it looks like a generic AI admin template, it is off-style and should be simplified

### 4d. No Redundant Chrome (Container-Aware Design)

Before adding a title, header, card wrapper, or label to a component, **read the parent container** that will render it. Containers already provide chrome — do not duplicate it.

| Container | Chrome it provides | Do NOT add inside it |
|---|---|---|
| `EntitySidebarShell` | `DrawerHeader` via `title` prop | Card header or heading repeating the drawer title |
| `Sheet` / `Dialog` | `SheetHeader` / `DialogHeader` + title | Second heading or Card wrapping the body content |
| `Card` with `CardHeader` | `CardTitle` | Nested Card or redundant heading inside `CardContent` |
| `DrawerSurfaceCard` | Card surface + optional header | Do not nest another `Card` inside; use `variant='flat'` for inner elements |
| `DashboardHeader` breadcrumb | Page name | `PageToolbar start=` repeating the page name (see §No Duplicate Page Titles) |

**Checklist (run before every UI component PR):**

1. **Read the mount point** — open the parent layout/page and identify what container renders your component. What title, header, and surface does it already provide?
2. **Grep for repeated text** — search the route tree for your title/label string. If the same label appears 3+ times on one screen, deduplicate.
3. **Check surface nesting** — if the parent is already a Card, Sheet, or `DrawerSurfaceCard`, do not wrap children in another Card. Use `variant='flat'` or plain `div`.
4. **One heading per visual section** — a section gets exactly one title. If the container already renders one, your component renders zero.

**Banned patterns:**
- `EntitySidebarShell title="X"` → child renders `<CardHeader><CardTitle>X</CardTitle></CardHeader>` (double title)
- `Sheet` body wrapped in `Card` when Sheet already provides the surface (redundant carding)
- Same CTA label (e.g., "Get notified") appearing in header, body, AND footer of one screen

This is 4b (subtraction principle) applied specifically to container boundaries. When in doubt, remove the inner chrome.

### 4e. No Decorative Hover Motion

- Hover states must not move layout or shift components without a product reason
- Do **NOT** use `translate`, `scale`, lift-on-hover, or floating-card motion on buttons, cards, screenshots, auth surfaces, or marketing panels as a default polish move
- Prefer background-color, border-color, text-color, opacity, or shadow changes for hover feedback
- If motion is necessary because the UI is directly manipulating something spatial, it must be intentional and clearly tied to that interaction

### 5. Conventional Commits Required

```bash
# Format: type(scope): description
feat(auth): add password reset flow
fix(dashboard): resolve chart rendering issue
refactor(api): simplify user endpoint logic
docs(readme): update setup instructions
```

### 6. Scan for Similar Bugs

When you discover and fix a bug:

1. **Identify the pattern** - What caused the bug? (wrong import, missing null check, incorrect type, etc.)
2. **Search for siblings** - Use grep/glob to find the same pattern in related files
3. **Fix all instances** - Don't leave the same bug lurking elsewhere

**Example:** If you fix a missing `'use client'` directive in `Button.tsx`, search for other components with the same hook usage pattern that might also be missing it.

```bash
# Find similar patterns to what you just fixed
grep -rn "PATTERN_YOU_FIXED" apps/web --include="*.tsx"
```

**Why:** A bug in one file often indicates a systemic issue. Patching one instance while leaving others creates inconsistency and delays future debugging.

### 6a. Founder / Featured Creator Identity Must Be Canonical

- **NEVER** invent, substitute, or mix placeholder creator identities on the homepage or marketing demos when Tim White or a real featured creator from canonical data should be used
- For Tim White specifically, agents must use the canonical homepage identity source instead of hardcoded fallback assets or guessed values
- If Tim White appears in homepage mocks, use the correct founder photo and the correct Spotify artist ID: `4u`
- When fixing one wrong Tim White reference, search for sibling homepage/demo references and fix all of them in the same pass

**Why:** Using the wrong founder photo or wrong Spotify identity undermines trust in the product and makes the AI experience look careless.

### 7. Public/Webhook Coordination Must Be Durable

- **NEVER** rely on in-memory rate-limit, dedupe, or coordination state for public endpoints, webhooks, or automation triggers
- Public traffic controls and webhook dedupe MUST use durable storage (Redis, database, or another cross-instance store)
- Cold starts, deploys, and horizontal scale must not reset critical protections or duplicate suppression

### 8. Server-Side External HTTP Must Be Bounded

- **ALWAYS** use a shared timeout + retry wrapper for server-side external HTTP on request handlers, webhooks, cron jobs, and admin/HUD paths
- Raw `fetch()` is forbidden on these paths unless the PR explicitly documents why timeout/retry is intentionally omitted
- Non-critical notifications and observability sinks must not sit on revenue-critical or user-facing success paths without bounded failure handling

### 9. Persistence-Critical Success Must Fail Closed

- Helpers performing persistence-critical writes must throw on failure; they must not swallow errors and return `undefined`, `null`, or empty-success sentinels
- User-facing success responses must only be returned after the critical write succeeds
- If a follow-up side effect is optional, isolate it explicitly so the primary success path stays truthful

### 10. Marketing Pages Must Be Fully Static

- All marketing, blog, and legal pages **must be fully static** (`export const revalidate = false`): no `headers()`, `cookies()`, `fetch` with `no-store`, or per-request data/nonce in `app/(marketing)` and `app/(dynamic)/legal` pages/layouts.
- Any non-`false` `revalidate` value under `app/(marketing)` is a bug unless a human explicitly documents an exception in the PR.
- `app/layout.tsx` must not read per-request headers for marketing; theme init belongs in static `/public/theme-init.js` (no nonce).
- Middleware (`proxy.ts`) should only issue CSP nonces for app/protected/API paths. Marketing routes must not depend on nonce or geo headers for rendering.
- Homepage "See It In Action" must not hit the database during SSR; use static `FALLBACK_AVATARS` only.
- Marketing copy must not invent adoption metrics, customer counts, waitlist sizes, or traction claims. If a number is not verified and current, use non-quantified launch-stage copy instead.
- Blog and changelog pages must be fully static, reading content from filesystem at build time only.
- Cookie banner remains client-driven (localStorage + server cookie write) without server-provided `x-show-cookie-banner` headers.
- Structured data on marketing pages should be rendered without `biome-ignore`; use string children inside `<script type="application/ld+json">` and `safeJsonLdStringify()` whenever user-controlled content is involved.
- Public profiles (`/[username]`) use ISR (1h revalidate) for real-time updates, with cache tag invalidation for instant profile updates.

**Why:** Fully static marketing pages eliminate cold start 500 errors, reduce Vercel costs (no serverless invocations), and provide instant TTFB (<100ms from CDN).

### 11. Global UI Components Render Once

Global UI elements must only render in root `app/layout.tsx`:
- Cookie banners
- Toast providers
- Modal providers
- Analytics scripts

**NEVER** render these in individual pages or nested layouts—causes duplicate overlapping UI elements.
- Nested layouts must not mount `CookieBannerSection`, `ToastProvider`, `ClerkAnalytics`, or other analytics/provider singletons directly.

### 12. Entitlements: Single Source of Truth

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

### 13. Self-Improvement Loop

After any correction from a human reviewer:

1. **Identify the root cause** — what rule or assumption led to the mistake?
2. **Add a rule** to `AGENTS.md` (or the relevant skill file) that prevents the same mistake from recurring.
3. **Add a lesson** to `LESSONS.md` with the pattern and fix.
4. **Never repeat the same mistake** — the correction should be the last time that error occurs.

If you realize mid-task that you've made an assumption that turned out wrong, document it immediately without being asked.

### 14. Plan Before Executing Complex Tasks

For any task with 3 or more steps, architectural decisions, schema changes, or significant refactors:

- Use plan mode (Shift+Tab twice in Claude Code) to outline the approach
- Wait for human approval before executing
- Single-step bug fixes and trivial copy changes do not require plan mode

### 15. Verify Before Marking Done

Never mark a task complete without confirming the fix works:

- Run the relevant test file: `pnpm --filter web exec vitest run <test-file>`
- Run typecheck: `pnpm --filter web exec tsc --noEmit`
- For UI changes: confirm the component renders without errors
- For API changes: confirm the endpoint returns expected shape
- Paste the passing output as evidence in the PR description

### 16. Performance Must Not Replace Route UIs

- **NEVER** replace a route's component with a different layout/design as a performance optimization
- Use code-splitting (`dynamic()`), skeleton states, `Suspense`, and progressive hydration to make the *same* design faster
- Screenshot test: before and after a perf PR, the fully-loaded page must look identical
- If a route needs a genuinely different UI, that is a product decision requiring explicit approval, not a perf side effect

### 17. CSP Domains Must Stay In Sync With Providers

When adding a new DSP, social platform, or any feature that loads external images or media in the browser, update `apps/web/constants/platforms/cdn-domains.ts`:
- Image CDNs → `PLATFORM_CDN_DOMAINS` (governs CSP `img-src` + Next.js `remotePatterns`)
- Audio/video CDNs → `PLATFORM_MEDIA_DOMAINS` (governs CSP `media-src`)

These registries are the **single source of truth** consumed by the CSP builder, Next.js config, and avatar hostname validation. Do **NOT** edit CSP directives in `content-security-policy.ts` directly — add domains to the registry instead.

### 18. Outbound Email Personalization Must Fail Safe

- In cold email, lifecycle email, or claim-invite copy, **NEVER** greet recipients with raw usernames, handles, emoji names, or other guessed merge fields
- Only use a personalized first-name greeting when the source string clearly looks like a conventional human first-and-last name; if there is real doubt, fall back to a generic opener
- When fixing one risky personalization path, search sibling email templates that use the same creator/user fields and apply the same guard there

---

## Custom ESLint Rules (Quick Reference)

11 custom rules in `apps/web/eslint-rules/` run via `pnpm --filter web lint:eslint`. Violations block CI.

| Rule | What It Blocks | Fix |
|------|---------------|-----|
| `use-client-directive` | React hooks (`useState`, `useEffect`, etc.) in files without `'use client'` | Add `'use client'` at top of file |
| `server-only-imports` | `@/lib/db`, `@clerk/nextjs/server`, `stripe`, `resend`, `drizzle-orm`, `*.server.ts` in `'use client'` files | Move logic to server component or API route |
| `icon-usage` | Emoji in JSX, non-Lucide UI icons, direct `simple-icons` imports | Use `lucide-react` for UI icons; `SocialIcon` component for social/brand icons |
| `no-db-transaction` | `db.transaction()` or `tx.transaction()` calls | Use sequential operations or `db.insert().values([...])` batch |
| `no-handler-initialization` | `new Stripe()`, `new Pool()`, `new Resend()`, `new Client()` inside `GET`/`POST`/`PUT`/`DELETE` handlers | Move to module-level singleton: `const stripe = getStripe()` at file top |
| `no-hardcoded-routes` | String literals like `'/app/dashboard/audience'` in app code | Import from `APP_ROUTES`: `import { APP_ROUTES } from '@/constants/routes'` |
| `no-manual-db-pooling` | `import { Pool } from 'pg'` or `import pg from 'pg'` | Use `import { db } from '@/lib/db'` |
| `require-abort-signal` | `queryFn` in `useQuery`/`useSuspenseQuery` that doesn't destructure `{ signal }` | `queryFn: ({ signal }) => fetchThing(id, { signal })` |
| `require-query-cache-config` | `useQuery` without `staleTime` and `gcTime` | Add both, or spread a preset from `lib/queries/cache-strategies.ts` |
| `readonly-component-props` | Props interface/type properties without `readonly` modifier | Add `readonly` before each property (auto-fixable: ESLint will fix this for you) |
| `edge-runtime-node-imports` | `node:fs`, `crypto`, `stripe`, `path`, `stream` in files with `export const runtime = 'edge'` | Remove the Node-only import or remove the Edge runtime declaration |

**Run:** `pnpm --filter web lint:eslint` (all rules) or `pnpm --filter web lint:server-boundaries` (boundary rules only)

---

## Claude Hooks Reference

Hooks in `.claude/hooks/` run automatically on every tool use. You cannot bypass them. Understanding what triggers them saves debugging time.

**Pre-execution hooks** (block the operation before it runs):

| Hook | Trigger | What It Blocks | Recovery |
|------|---------|---------------|----------|
| `bash-safety-check.sh` | Before: Bash | `rm -rf /`, force push to main, `npm publish` | Don't run destructive commands |
| `file-protection-check.sh` | Before: Edit/Write | Editing existing migration SQL/snapshots; creating `middleware.ts`; `biome-ignore` comments; hardcoded dashboard route literals; dynamic `revalidate` in marketing pages; global UI singletons in nested layouts | See matching Hard Guardrail above |
| `infra-guardrails-check.sh` | Before: Edit/Write | New cron route files (`app/api/cron/*/route.ts`); `vercel.json` cron changes | Get human approval first |

**Post-execution hooks** (check the result and may block or warn):

| Hook | Trigger | What It Catches | Recovery |
|------|---------|----------------|----------|
| `lint-check.sh` | After: Edit/Write | Biome lint/format errors | Auto-fixes first; fix remaining errors manually |
| `typecheck.sh` | After: Edit/Write | TypeScript errors in modified file | Fix the type error; run `pnpm typecheck` for full output |
| `biome-formatter.sh` | After: Edit/Write | N/A (non-blocking) | Auto-applies `biome check --write` silently; no action required |
| `console-check.sh` | After: Edit/Write | `console.log/error/warn/info/debug` in production code (skips tests, scripts, configs) | Use `import { captureError } from '@/lib/error-tracking'` for errors; `import { logger } from '@/lib/utils/logger'` for logs |
| `ts-strict-check.sh` | After: Edit/Write | `any` type in production code (**blocks**); `@ts-ignore` (**warns**) | Use proper types or `unknown`; use `@ts-expect-error` with explanation |
| `file-size-check.sh` | After: Edit/Write | Files exceeding 500 lines (**warns**, skips tests/migrations/generated) | Split into smaller modules by concern |
| `db-patterns-check.sh` | After: Edit/Write | `db.transaction()`, `pg`/`pg-pool` imports, `new Pool()`, `@/lib/db/client` import | Use `import { db } from '@/lib/db'`; batch for atomicity |

**Lifecycle hooks:**

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | Session start | Verifies Node/pnpm versions, installs deps, builds gstack |
| `post-task-validate.sh` | Task completion (Stop) | Blocks completion if typecheck, Biome lint, server boundaries, or affected tests fail |

---

## Linear Issue Gating

See also: [Linear Ownership Contract](#linear-ownership-contract) below for the
state-transition rules every agent must follow.

Before working on any Linear issue, check for the `human-review-required` label.
If present, SKIP the issue entirely. Do not attempt to work on it, close it,
or add comments. These issues require human decision-making.

Also skip any issue whose description contains:
"This issue requires human review"

When scanning Linear for issues to work on, always filter with:
- Exclude label: `human-review-required`
- Exclude description containing: "This issue requires human review"

### When to apply the `human-review-required` label
- Automation/infrastructure setup tasks
- Architectural decisions requiring human judgment
- Process or workflow changes
- Issues filed by automated scanners that haven't been triaged

### Always file a Linear issue for deferred follow-ups

When you identify follow-up work in the course of a task — out-of-scope refactors,
next-phase features, known gaps, TODOs — and **choose not to tackle it right away**,
open a Linear issue for it before closing out the current work. Do not rely on
inline `// TODO` comments, PR-body bullet lists, or chat memory to track it.

- Create the issue on the relevant team (usually `Jovie`) with a clear title and
  description of the deferred scope.
- If the follow-up depends on the current work landing first, use `blockedBy` to
  link it to the current issue so the dependency is explicit in Linear.
- Reference the follow-up issue ID in the current PR description and in any
  planning/design docs so future readers can navigate to it.
- This applies equally to scope you deferred *to ship faster* (Approach C-style
  decisions) and scope you noticed but chose not to do. If it's worth remembering,
  it's worth a Linear issue.

---

## Linear Ownership Contract

Every agent working a Linear-tracked task MUST follow this three-state contract.
Multiple agents run in parallel (Conductor workspaces, autopilot, ad-hoc sessions).
Linear state is the shared signal other agents use to see what is in flight —
if you do not mark your issue In Progress, you invite collisions where two agents
edit the same files.

### The contract

1. **On start — mark the Linear issue `In Progress`.** Do this BEFORE reading
   code or editing files. If the issue is unassigned, assign it to yourself
   (or the human owner) at the same time. This is the only manual transition.
2. **On PR open —** behavior depends on how the work was started:
   - **Orchestrator-dispatched work** (branches created by `linear-ai-orchestrator.yml`): no action required. The `sync_linear_in_review` job auto-transitions the issue to `In Review` when the PR opens.
   - **Ad-hoc work** (direct agent sessions, manually opened PRs): manually transition the Linear issue to `In Review` when you open the PR. The orchestrator's `sync_linear_in_review` job does NOT run for branches it didn't dispatch.
   In both cases, preserve the PR body's `<!-- linear-issue-id:... -->` comment and the `jov-XXXX` branch pattern so `linear-sync-on-merge.yml` can find the issue at merge time.
3. **On merge — no action required.** `linear-sync-on-merge.yml` auto-transitions
   the issue to `Done` and posts the merge SHA as a comment.

Do NOT manually perform the In Review or Done transitions — you will race the
workflows and produce confusing state.

### Orchestrator-dispatched work

When the Linear AI orchestrator dispatches work (`linear-ai-orchestrator.yml`
`assign_to_codex` job), it sets `In Progress` at dispatch time. If your session
was started by the orchestrator, the transition is already done — skip step 1.

### How to transition

With Linear MCP available (most Claude Code sessions):

```
# 1. Get the team's state IDs
mcp__claude_ai_Linear__list_issue_statuses({ team: "<team-id-or-key>" })

# 2. Set the issue to In Progress
mcp__claude_ai_Linear__save_issue({ id: "<issue-id>", state: "<in-progress-state-id>" })
```

Without Linear MCP, use the GraphQL API directly (same pattern as
`.github/workflows/linear-ai-orchestrator.yml` — look up the state where
`name` matches `/in progress/i`, then call `issueUpdate`).

### No Linear issue (ad-hoc work)

If the user asks you to fix something without a Linear issue, either:

1. Create a Linear issue for it and move it to In Progress, OR
2. Explicitly state "no Linear issue — ad-hoc" in your first status message so
   the human knows coordination is manual and other agents won't see this work.

---

## PR Discipline (Required)

### Size Limits

- Max 10 files changed per PR (excluding lockfiles and generated files)
- Max 400 lines of diff (additions + deletions)
- If a task requires more, split into sequential PRs with clear dependencies

### Pre-Push Gate

The gstack skill pipeline handles verification. The standard agent workflow is:

1. `/qa` — Systematic QA testing (skip if already run manually)
2. `/review` — Pre-landing code review (skip if already run manually)
3. `/ship` — Tests, review, version bump, PR creation/update
4. `/land-and-deploy` — Merge, CI wait, deploy verification

`/ship` runs typecheck, lint, and tests as part of its pre-flight checks. There is no separate `/verify` step.

**IMPORTANT:** Always run `pnpm biome check --write apps/web` before pushing so formatting issues are fixed in-place. The pre-push hook calls `biome check .` (read-only) and will reject pushes with formatter violations.

### One PR = One Concern

- Each PR addresses exactly one Linear issue or one bug fix
- Mark the Linear issue `In Progress` before you start editing files (see [Linear Ownership Contract](#linear-ownership-contract))
- No drive-by refactors, no "while I'm here" changes
- If you find a related issue, create a separate Linear ticket

### Branch Hygiene

- Always rebase on main before pushing (not merge)
- Follow the branch strategy: `feature/* -> main` (CI deploys to staging, then promotes to production)
- If a PR has been open >24h without progress, close it and re-create from fresh main

### Incremental Shipping (Ship Fast, Fail Fast)

- When a command produces multiple independent fixes, ship each as its own PR
- **Open a draft PR on first push** — CI runs immediately, giving early feedback
- Push frequently — concurrency groups cancel stale CI runs automatically
- Run `/ship` when ready — it detects the draft PR and promotes it to ready-for-review
- CI runs in parallel on all PRs while the agent continues working
- This maximizes throughput: N PRs x parallel CI > 1 large PR x serial CI
- If a PR fails CI, fix and push again; don't create a new PR
- Enable auto-merge only after the PR is marked ready (not while draft)

### Draft PR First Workflow (Parallel Agents)

AI agents MUST follow the "draft PR first, commit often" pattern for all non-trivial work:

1. **First commit on branch:** Push immediately and open a draft PR:
   ```bash
   git push -u origin <branch-name>
   gh pr create --draft --base main --title "WIP: <description>" --body "Draft — CI feedback loop in progress"
   ```

2. **Iterate on CI feedback:** Push frequently. Each push triggers CI with cancel-in-progress
   (stale runs are automatically cancelled). Check CI status:
   ```bash
   gh pr checks <pr-number> --json name,state,conclusion
   ```
   Fix failures, push again.

3. **Finalize:** When CI is green and code is ready, run `/ship`. The ship skill detects
   the existing draft PR, updates its title/body with the standard template, and marks
   it ready for review.

**Why draft PRs first:**
- CI catches build failures (now a merge gate), type errors, and test regressions within minutes
- Parallel agents see each other's in-progress branches via PR list
- Concurrency groups cancel stale CI runs automatically — frequent pushes are cheap
- The PR summary comment gives a structured view of all check statuses

### PR Labels (Required)

Agents must apply PR labels intentionally. Labels are part of the CI control plane, not just project organization.

- Add `testing` when a PR needs the heavyweight verification lanes (E2E, smoke tests, full build with secrets) beyond the default merge gate.
- Add `testing` for changes affecting deploy behavior, migrations, auth, billing, entitlements, webhooks, middleware/proxy logic, environment/config loading, or any flow that should get E2E and preview QA before merge.
- Note: Build (public routes), Lighthouse, a11y, and layout-guard now run on ALL PRs without the `testing` label. The `testing` label is only needed for E2E/smoke/preview-deploy lanes.
- For billing, auth, entitlements, webhook, migration, and env/config PRs, `testing` is mandatory so `E2E Smoke (PR Fast Feedback)` runs before merge.

- Add `needs-human` when the PR should be held for human review or automation must stop.
- Add `needs-human` for risky or ambiguous changes, incidents/hotfixes needing human judgment, unexpected CI/deploy behavior, security-sensitive changes, or any case where the agent is not confident the PR should continue through auto-merge.
- If a PR has `needs-human`, do **NOT** enable or preserve auto-merge. Treat the label as a hard stop for unattended automation until a human clears it.

- Use `automerge` only for clearly safe PRs that fit the auto-merge guardrails below.
- Do **NOT** add `automerge` to high-risk paths or to PRs that also need `needs-human`.

- Use `deploy-preview` only when a PR specifically needs the build/preview lane for review or QA and `testing` is not otherwise warranted.
- Do **NOT** rely on `deploy-preview` as a substitute for `testing` on risky changes.

- Do **NOT** add `skip-migration-guard` unless a human explicitly instructs you to bypass the migration guard for that PR.
- If a migration-related PR seems to require `skip-migration-guard`, stop and escalate with `needs-human` instead of applying the bypass yourself.

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

**Auto-merge ALLOWED (CI-gated, no manual review needed):**

| Change Type | Examples |
|-------------|---------|
| Docs / copy / README | Markdown files, changelog, legal copy |
| Tests (unit, integration, e2e) | `*.test.ts`, `*.spec.ts`, test fixtures |
| Style-only | CSS, design tokens, Tailwind config |
| Dependency bumps (non-breaking) | Lockfile-only, patch/minor version bumps |
| Linting / formatting fixes | Biome auto-fixes, whitespace, import sorting |

When in doubt, skip auto-merge and request review.

---

## Pre-PR Checklist (required before opening any PR)

1. **Open a draft PR early** — push your first meaningful commit and create a draft PR immediately (see "Draft PR First Workflow" above)
2. **Iterate** — push frequently, let CI catch issues, fix and push again
3. **When ready to ship:** run `/qa` → `/review` → `/ship` (skip `/qa` or `/review` if already run manually)
4. `/ship` handles: tests, review, version bump, CHANGELOG, commit, push, PR creation/update
5. `/land-and-deploy` handles: merge, CI wait, deploy verification
6. **Enable automerge** with squash after the PR is marked ready:
   ```bash
   gh pr merge --auto --squash
   ```

## Ship Validation (CodeRabbit Issue Planner Instruction)

When generating implementation plans for GitHub issues, the plan MUST include a final **"Ship Validation"** phase as the last step. This phase ensures all changes pass quality gates before a PR is opened.

The validation phase must instruct the coding agent to run:

```bash
pnpm run typecheck && pnpm run biome:check && pnpm run test
```

**Requirements for the Ship Validation phase:**
- All TypeScript type checks pass (zero errors)
- All Biome lint and formatting checks pass (zero errors)
- All unit tests pass
- If any check fails, fix before proceeding to PR creation

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

### Documentation Index

Reference docs for common agent lookups. These are table-driven and answer specific navigation questions:

| Doc | Question It Answers |
|-----|---------------------|
| [`docs/SCHEMA_MAP.md`](docs/SCHEMA_MAP.md) | Which schema file defines this table? What are the key relationships? |
| [`docs/API_ROUTE_MAP.md`](docs/API_ROUTE_MAP.md) | Does an API endpoint already exist for this? What auth does it need? |
| [`docs/CRON_REGISTRY.md`](docs/CRON_REGISTRY.md) | What scheduled jobs already run? Can I add my logic to an existing one? |
| [`docs/WEBHOOK_MAP.md`](docs/WEBHOOK_MAP.md) | Which webhooks handle this provider's events? |
| [`docs/LIB_MODULE_INDEX.md`](docs/LIB_MODULE_INDEX.md) | Which lib module provides the functionality I need? |
| [`docs/FEATURE_REGISTRY.md`](docs/FEATURE_REGISTRY.md) | What feature flags exist? What are their current states? |
| [`docs/DB_MIGRATIONS.md`](docs/DB_MIGRATIONS.md) | How do I create/run migrations? What are the invariants? |
| [`docs/TESTING_GUIDELINES.md`](docs/TESTING_GUIDELINES.md) | Testing philosophy, patterns, and when to write tests |
| [`docs/DOPPLER_SETUP.md`](docs/DOPPLER_SETUP.md) | How to set up and use Doppler for secrets management |

### Component Architecture & Dependency Rules

Components follow atomic design with feature-based grouping:

```
packages/ui/atoms/          → Pure design system (Radix + CVA, NO Next.js/app imports)
apps/web/components/
├── atoms/                  → App-level atoms (may use Next.js, hooks)
├── molecules/              → Composed atoms
├── organisms/              → Complex shared widgets (includes table/ subsystem)
├── features/               → Feature modules (dashboard, admin, home, auth, etc.)
│   └── {feature}/          → May have internal atoms/molecules/organisms
├── providers/              → Context providers
├── hooks/                  → Shared hooks
├── site/                   → Site chrome
├── seo/                    → SEO components
└── effects/                → Visual effects
```

**Dependency direction (strictly enforced via eslint-plugin-boundaries):**

| Layer | Can import from |
|-------|----------------|
| `@jovie/ui` | React, Radix, CVA, Tailwind only |
| `atoms/` | `@jovie/ui` |
| `molecules/` | `atoms/`, `@jovie/ui` |
| `organisms/` | `molecules/`, `atoms/`, `@jovie/ui` |
| `features/{x}/` | `organisms/`, `molecules/`, `atoms/`, `@jovie/ui`, own internals |

**Forbidden imports:**
- `atoms/` must NOT import from `molecules/` or `organisms/`
- `molecules/` must NOT import from `organisms/`
- `features/{x}/` must NOT import from `features/{y}/` — if a component is needed by 2+ features, **promote it** to the shared `atoms/`, `molecules/`, or `organisms/` layer

**Token reference style:** Use Tailwind-named utilities (`text-primary-token`, `bg-surface-1`, `border-subtle`), NOT CSS variable arbitrary values (`text-(--linear-text-primary)`).

### File Creation Patterns

When creating new files, follow these templates. They reflect actual codebase patterns (derived from `app/api/feedback/route.ts` and similar).

#### New API Route

Location: `apps/web/app/api/{domain}/{action}/route.ts`

```typescript
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const payloadSchema = z.object({ /* ... */ });

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    // ... business logic using db ...

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('[api/{domain}] Operation failed:', error);
    await captureError('Description', error, { route: '/api/{domain}', method: 'POST' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

Key rules: Zod validation on input, auth check, try/catch with `captureError` + `logger.error`, no `new Stripe()` inside the handler (use module-level singletons). Only add `export const runtime = 'nodejs'` when documenting a specific constraint.

#### New Component

| Type | Location | When to use |
|------|----------|-------------|
| Design system atom | `packages/ui/atoms/MyComponent.tsx` | Pure UI, no Next.js/app imports |
| App atom | `apps/web/components/atoms/MyComponent.tsx` | Small, reusable, may use Next.js hooks |
| Molecule | `apps/web/components/molecules/MyComponent.tsx` | Composes 2+ atoms |
| Organism | `apps/web/components/organisms/{feature}/MyComponent.tsx` | Complex shared widget |
| Feature component | `apps/web/components/features/{feature}/MyComponent.tsx` | Feature-specific, can have internal atoms/molecules |

```typescript
'use client'; // ONLY if using hooks (useState, useEffect, etc.) — omit for server components

import type { ReactNode } from 'react';

interface MyComponentProps {
  readonly title: string;        // Every prop MUST be readonly
  readonly children?: ReactNode;
  readonly onAction?: () => void;
}

export function MyComponent({ title, children, onAction }: MyComponentProps) {
  return <div>{title}{children}</div>;
}
```

#### New Server Action

Location: `apps/web/app/{route}/actions.ts` or `apps/web/lib/actions/{domain}.ts`

```typescript
'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
```

#### New Test

Co-locate with source: `{name}.test.ts` or `{name}.test.tsx` (not `__tests__/` directories unless shared fixtures needed).

```typescript
import { describe, expect, it, vi } from 'vitest';
```

Name tests by behavior: `describe('ComponentName')` → `it('shows error when input is empty')`.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Database | Neon PostgreSQL + Drizzle ORM |
| Auth | Clerk (three instances, proxy via `/__clerk`) |
| Payments | Stripe |
| Linting | Biome |
| Package Manager | pnpm 9.15.4 |
| Monorepo | Turborepo |
| Runtime | Node.js 22 LTS |

### Clerk Auth Proxy Architecture

**CRITICAL — read this before touching anything Clerk-related.**

Jovie uses three distinct Clerk key pairs:
- **Dev** (`dev`, account A development instance): local/dev worktrees use the `pk_test_...` + dev secret pair from Doppler `jovie-web/dev`
- **Staging** (`stg`, account B production instance): `staging.jov.ie` uses `CLERK_PUBLISHABLE_KEY_STAGING` + `CLERK_SECRET_KEY_STAGING`
- **Production** (`prd`, account A production instance): `jov.ie` uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`

The proxy path is `/__clerk`. ClerkProvider sets `proxyUrl="/__clerk"`. All Clerk JS requests go to `/__clerk/*` on the current origin. Dev mode doesn't use the proxy — ClerkProvider talks directly to Clerk.

**How the proxy works:**
- Middleware in `proxy.ts` intercepts `/__clerk/*` and `/clerk/*` paths
- Decodes the FAPI host from the active publishable key at runtime
- Uses `fetch()` to proxy with the correct `Host` header set to the decoded FAPI host
- Uses strict host routing: `staging.jov.ie` must use the staging key pair and must never fall back to production keys

**DO NOT:**
- Use `NextResponse.rewrite()` for clerk paths — Vercel doesn't set the Host header correctly, causing Clerk 400 "Invalid host"
- Use `vercel.json` rewrites as the primary mechanism — same Host header problem
- Hardcode FAPI hosts — always decode from the resolved publishable key
- Use `clerk.jov.ie` or `clerk.staging.jov.ie` as public-facing URLs — traffic goes through `/__clerk` path proxy only
- Add satellite/custom proxy domains — they cost money and are unnecessary with the fetch proxy

**If Clerk auth breaks:**
1. Check the `fetch()` proxy in `proxy.ts` decodes the FAPI host from the resolved publishable key
2. Check the active runtime exposes the correct key pair for that host:
   production uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
   staging uses `CLERK_PUBLISHABLE_KEY_STAGING` + `CLERK_SECRET_KEY_STAGING`
3. Check CSP allows the decoded FAPI host in connect-src, script-src, frame-src
4. If staging auth is broken, do not let `staging.jov.ie` fall back to production Clerk keys; fail closed to the auth-unavailable state instead

### API Runtime

All API routes run on **Node.js runtime** (the Next.js default). Do not use Edge runtime.

**Why:** The API relies on connection pooling (Neon), native bindings (Sharp), payment SDKs (Stripe), and long-duration cron jobs (60-300s)—none of which work on Edge.

**Convention:** Only add `export const runtime = 'nodejs'` when documenting a specific constraint (e.g., Sharp, Stripe). Don't add it to every route as boilerplate.

---

## Code Quality Standards

### TypeScript

- Strict mode enabled - no `any` types without justification
- Use proper interfaces for all data structures
- Prefer `unknown` over `any` for truly unknown types

**Typecheck Gate (Mandatory):**
- **ALWAYS** run `pnpm turbo typecheck` before pushing any branch or creating a PR
- If typecheck fails, fix all errors before pushing — do not push with known type errors
- Use `/ship` which includes typecheck as part of its validation
- The CI pipeline will block merges on type errors, but catching them locally is faster and prevents wasted CI cycles

**Null Safety for String Methods:**
- Always guard against null/undefined before calling string methods
- Common offenders: `.replaceAll()`, `.toLowerCase()`, `.split()`, `.trim()`

```typescript
// WRONG: Will throw TypeError if title is undefined
const slug = title.replaceAll(' ', '-');

// CORRECT: Guard with optional chaining or nullish coalescing
const slug = title?.replaceAll(' ', '-') ?? '';
```

**Cross-Environment Globals:**
- Use `globalThis` instead of `window` or `global` where applicable
- `window` fails in SSR/Node, `global` fails in browser
- Note: `globalThis.location` is still `undefined` in Node.js SSR - SSR guards are required

| Wrong                        | Correct                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `window.location` (no guard) | `typeof window !== 'undefined' ? window.location : undefined` |
| `global.fetch`               | `globalThis.fetch`                                            |

### React/Next.js

- Functional components with hooks only
- Server Components by default, Client Components when needed
- Use `'use client'` directive sparingly and intentionally

**Component Definition Rules:**
- **NEVER** define components inline (inside other components or render functions)
- Inline components are recreated every render, breaking React reconciliation and causing performance issues
- Extract all components to module scope or separate files

| Wrong                                          | Correct                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `const columns = [{ cell: () => <Button /> }]` | Extract: `const ActionCell = () => <Button />` then use `cell: ActionCell` |
| `{items.map(i => { const Item = () => ... })}`  | Define `Item` outside the parent component                                 |

**Route Constants:**
- **NEVER** hardcode route paths like `/app/dashboard/audience`
- **ALWAYS** import from `constants/routes.ts`: `APP_ROUTES.AUDIENCE`
- This prevents broken URLs from path typos and enables safe refactoring
- Legacy compatibility paths still need named constants. If a redirect intentionally targets an old `/app/dashboard/*` route, add a constant for that legacy path instead of embedding the literal.

### Server/Client Boundaries (Enforced by ESLint)

**Client components MUST have `'use client'`** when using React hooks (useState, useEffect, etc.).

**Server-only modules CANNOT be imported in `'use client'` files:**
- `@/lib/db/*` - Database access
- `@clerk/nextjs/server` - Server-side auth
- `stripe`, `resend` - API clients with secrets
- `drizzle-orm` - ORM queries
- `*.server.ts` files

**Commands:**
- `pnpm --filter web lint:server-boundaries` - Quick check for boundary violations
- `pnpm --filter web lint:eslint` - Full ESLint check

**Error Messages:**
```
# Missing 'use client':
React hook "useState" can only be used in client components.
Add "use client" directive at the top of this file.

# Server import in client:
Server-only import "@/lib/db" cannot be used in client components.
Remove the import or remove "use client" if this should be a server component.
```

### Database Access (Single Driver Policy)

**ALWAYS use `import { db } from '@/lib/db'`** - this is the canonical database client.

| Correct | Wrong |
|---------|-------|
| `import { db } from '@/lib/db'` | `import { db } from '@/lib/db/client'` |
| Use `db.query.*` or `db.select()` | Direct SQL strings outside lib/db |
| `db.insert().values([...items])` | Loop with individual `db.insert()` calls |

The project uses `@neondatabase/serverless` with the **WebSocket driver** for stateful RLS connections. Application code creates a client-side `Pool` (max 20 per Vercel container) because WebSocket connections are stateful and need lifecycle management. The DATABASE_URL uses Neon's **direct** endpoint (not the `-pooler` endpoint). Scripts and migrations use the HTTP driver for stateless one-off operations. The `lib/db/client.ts` is a legacy HTTP-based client — do not use it.

**Transaction Restrictions (Canonical Policy):**
- **NEVER** introduce new direct `db.transaction()` usage in app code without explicit human approval.
- Existing transaction-based RLS/session helpers are legacy exceptions and must not be copied into new call-sites.
- If you need transaction-scoped session state, use an approved wrapper or escalate before adding new transaction logic.
- For atomicity, use Drizzle's batch operations: `db.insert().values([...items])`
- If you need true ACID transactions, document the requirement and discuss alternatives

**Forbidden Database Patterns:**
| Forbidden                          | Why                               | Alternative                            |
| ---------------------------------- | --------------------------------- | -------------------------------------- |
| `db.transaction(async (tx) => ...)` | Requires explicit approval; use approved RLS wrappers | Sequential operations or batch insert  |
| `import { Pool } from 'pg'`        | Manual pooling conflicts with Neon | Use `import { db } from '@/lib/db'`   |
| `import pg from 'pg'`              | Direct postgres driver            | Use `import { db } from '@/lib/db'`   |
| `new Pool()` or `pool.connect()`   | Manual connection management      | Use `import { db } from '@/lib/db'`   |
| Loop with individual `db.insert()` | O(N) database operations          | `db.insert().values([...items])` batch |

### Canonical Imports (Use These Exact Paths)

Agents frequently import from wrong paths. This is the authoritative reference:

| What | Correct Import | NOT This |
|------|---------------|----------|
| Database | `import { db } from '@/lib/db'` | `@/lib/db/client` (legacy, hook-blocked) |
| Env vars | `import { env } from '@/lib/env'` | `process.env.X` (no validation) |
| Routes | `import { APP_ROUTES } from '@/constants/routes'` | Hardcoded `'/app/dashboard/...'` strings (hook-blocked) |
| Entitlements (server) | `import { getCurrentUserEntitlements } from '@/lib/entitlements/server'` | Reading billing rows directly in handlers |
| Entitlements (registry) | `import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry'` | Duplicating plan matrices in components |
| UI Icons | `import { IconName } from 'lucide-react'` | Emoji, FontAwesome, heroicons, custom SVGs |
| Social/Brand Icons | `import { SocialIcon } from '@/components/atoms/SocialIcon'` | Lucide for social platforms, direct `simple-icons` |
| Auth (client) | `import { useUser, useAuth } from '@clerk/nextjs'` | `@clerk/nextjs/server` in client files |
| Auth (server) | `import { auth, currentUser } from '@clerk/nextjs/server'` | Server imports in `'use client'` files |
| Error tracking | `import { captureError } from '@/lib/error-tracking'` | `console.error()` (hook-blocked in production code) |
| Logger | `import { logger } from '@/lib/utils/logger'` | `console.log()` (hook-blocked in production code) |
| Cache presets | `import { STABLE_CACHE } from '@/lib/queries/cache-strategies'` | Inline `staleTime`/`gcTime` values without presets |

### Data Serialization (Server → Client Boundaries)

**Date objects MUST be serialized** before:
- Caching in Redis (`JSON.stringify` cannot serialize Date)
- Returning from Server Actions / API routes
- Passing from RSC to Client Components

| Wrong                                                   | Correct                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `return { createdAt: user.createdAt }`                  | `return { createdAt: user.createdAt?.toISOString() }`  |
| `redis.set(key, JSON.stringify(data))` with Date fields | Convert dates first with `toISOStringOrNull()` helper  |
| Drizzle query result directly to client                 | Map dates: `{ ...row, date: row.date?.toISOString() }` |

**Helper pattern:**

```typescript
const toISOStringOrNull = (date: Date | null | undefined) =>
  date?.toISOString() ?? null;
```

### React Hook Guidelines

**Prevent render loops and memory leaks:**

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

**Required Configuration:**
All `useQuery` calls MUST specify cache configuration:
```typescript
// CORRECT: Explicit cache config with AbortSignal
useQuery({
  queryKey: keys.user(id),
  queryFn: ({ signal }) => fetchUser(id, { signal }), // AbortSignal required!
  staleTime: 5 * 60 * 1000, // Required: when data becomes stale
  gcTime: 10 * 60 * 1000,   // Required: when to garbage collect
})

// WRONG: Missing cache config (causes aggressive refetching and API spam)
useQuery({
  queryKey: keys.user(id),
  queryFn: () => fetchUser(id), // Missing signal = memory leaks, missing cache = API spam
})
```

**AbortSignal Requirement:**
- All `queryFn` must destructure and pass `signal` to fetch operations
- This prevents memory leaks and race conditions on component unmount
- Without signal, requests continue after navigation, wasting resources

**Cache Presets:**
Use presets from `lib/queries/cache-strategies.ts` for consistency:
- `REALTIME_CACHE` - for live data (notifications, active sessions)
- `FREQUENT_CACHE` - for frequently updated data (dashboard stats)
- `STANDARD_CACHE` - for typical data (5 min stale, 30 min gc)
- `STABLE_CACHE` - for slowly changing data (user profile, billing status, feature flags)
- `STATIC_CACHE` - for reference data that rarely changes (categories, platform lists)
- `PAGINATED_CACHE` / `SEARCH_CACHE` - for list/search results

**Disable Aggressive Refetch:**

For stable data, disable automatic refetching:

```typescript
useQuery({
  ...options,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})
```

### Styling

- Tailwind utility classes only (no custom CSS unless necessary)
- Follow existing design tokens in `tailwind.config.ts`
- Mobile-first responsive design

#### Surface Elevation Rules (Card/Background Consistency)

The main content area (`<main>`) uses `bg-(--linear-app-content-surface)`, a dedicated shell canvas tone. In dark mode it must stay distinct from both recessed wells (`bg-surface-0`) and shared cards (`bg-surface-1`).

**Allowed patterns:**
- Card on app-shell canvas parent → use `bg-surface-1` for shared cards and panels
- Recessed/"well" element inside the shell or a card → use `bg-surface-0` (e.g., skeleton containers, empty states, input wells)
- Sticky shell chrome (toolbars, table headers, shell frame) → use `bg-(--linear-app-content-surface)`
- Card with elevation → use `Card` component as-is (has `bg-surface-1 border border-subtle shadow-card`)
- Nested card inside card → use `bg-surface-0` for the inner element
- Table/workspace routes → wrap the primary content in `DashboardWorkspacePanel` plus a bordered `LINEAR_SURFACE.contentContainer`; do not render route content directly on the shell canvas

**Banned patterns (will cause invisible cards):**
- `bg-(--linear-app-content-surface)` on card-like elements inside the shell unless the element is shell chrome (toolbar/header/frame)
- Table/task routes that place their main list or empty state directly on the shell canvas instead of inside a framed content container
- `bg-surface-1` on elements inside a `surface-1` parent WITHOUT border+shadow — same color on same color
- `bg-surface-1/XX` (semi-transparent) — low opacity surface-1 on surface-1 parent is nearly invisible
- `Card className='border-0 shadow-none'` — strips all elevation from a surface-1 card, making it invisible on surface-1 parent
- `bg-surface-0/XX` (semi-transparent) — use solid `bg-surface-0` instead
- Card-within-card nesting (e.g., `DrawerSurfaceCard variant='card'` inside another card) — use `variant='flat'` for inner elements

**Quick test:** If removing the element would cause no visual change, it's an elevation bug.

#### No Duplicate Page Titles (Breadcrumb + Toolbar)

The `DashboardHeader` breadcrumb already renders the page name prominently. Do NOT repeat the page name in `PageToolbar start={}`. The toolbar should only contain contextual metadata (counts, status) and action buttons.

**Allowed:** `<PageToolbar start={<span>3 matched platforms</span>} end={<ActionButton />} />`
**Banned:** `<PageToolbar start={<span>Earnings</span>} />` — duplicates the breadcrumb

### Performance Optimization Loop

`/perf-loop` runs an autonomous optimization loop that measures, experiments,
and keeps only improvements. State is persisted to `.context/perf/` for resume
capability. The skill uses `perf:loop` (performance-optimizer.ts) as its
measurement primitive and commits each accepted improvement atomically.

Runtime: ~30-50 minutes for a full run (4-10 iterations with builds).

### Testing

- Unit tests: Vitest with jsdom
- E2E tests: Playwright
- Focus on user behavior, not implementation details

#### E2E Authentication with Clerk (Required Patterns)

Use Clerk's official Playwright testing helpers whenever an E2E test needs auth.

- Official docs: `https://clerk.com/docs/testing/playwright/test-helpers`
- In this repo, `setupClerkTestingToken({ page })` must run **before** navigating to Clerk pages so the token is attached to Clerk FAPI calls.
- Auth pages must include ClerkProvider, so start auth on `/signin` (not `/`).

**Test user creation pattern (canonical):**

1. Create a unique test email with the Clerk testing suffix:
   - `const email = \`e2e+clerk_test+${Date.now().toString(36)}@example.com\``
2. Call `setupClerkTestingToken({ page })`.
3. Navigate to `/signin` and wait for `window.Clerk?.loaded`.
4. Use `createOrReuseTestUserSession(page, email)` from `apps/web/tests/helpers/clerk-auth.ts`.
5. Assert authenticated state before continuing the flow.

**Do NOT do the following in E2E auth tests:**

- Do **not** reuse auth sessions across tests. Each test that validates auth behavior must start from a fresh context/session.
- Do **not** hardcode OTP codes in test code.
- Do **not** use pre-authenticated Clerk tokens to skip sign-up/sign-in flows unless the test scope explicitly starts post-auth.
- Do **not** mock Clerk auth in Playwright E2E tests.

**Golden path references:**

- `apps/web/tests/e2e/onboarding.spec.ts` shows the canonical fresh-user Clerk-authenticated onboarding flow using `setupClerkTestingToken({ page })` plus `createOrReuseTestUserSession(page, email)`.
- `apps/web/tests/e2e/auth.setup.ts` is the canonical shared auth bootstrap that writes `tests/.auth/user.json`.

#### Next Cache APIs In Shared Test Helpers

- Helpers used by Playwright global setup, `tsx` seed scripts, or any plain Node entrypoint must not call `revalidateTag()` or `revalidatePath()` unguarded.
- Those Next cache APIs require a Next request/static-generation context and will throw `Invariant: static generation store missing` in plain Node.
- If cache invalidation is best-effort in a shared helper, catch only that specific missing-context invariant and continue; rethrow all other errors.
- For manual browse auth outside Playwright, use `doppler run --project jovie-web --config dev -- pnpm tsx scripts/browse-auth.ts --base-url http://localhost:3002 --output /tmp/browse-clerk-cookies.json --persona creator` and import the exported cookies into browse.

**Test user cleanup:**

- E2E users are tagged with metadata (`role: 'e2e'`).
- Clean stale users interactively:
  - `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts`
- Clean stale users non-interactively (for agents and CI):
  - `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force`
- Preview what would be deleted (dry run):
  - `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --dry-run`
- To re-seed users:
  - `doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/setup-e2e-users.ts`

**Agent cleanup requirement:**

Agents **MUST** run cleanup after any session that creates test accounts via sign-up flows (E2E tests, `/qa` runs that trigger signup). Run:

```bash
doppler run --project jovie-web --config dev -- pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force
```

This deletes all Clerk users matching either `role: 'e2e'` metadata OR `+clerk_test` email pattern, AND their corresponding database records (cascading to related tables). Only works against test Clerk instances (`sk_test_` keys). Safe to run repeatedly.

#### General E2E Rules (Required)

- Every E2E test must include meaningful assertions on behavior/outcomes (not just render/no-crash checks).
- Music fetch must remain real in integration/E2E coverage: if slow, increase timeout; do not mock the enrichment fetch.
- Stripe flows must run in Stripe test mode and use test card `4242 4242 4242 4242`.
- Do not assert on CSS values, spacing/padding, or brittle copy text.
- Prefer stable `data-testid` selectors over fragile structural selectors.

#### Test Performance (CI Runtime Is a First-Class Constraint)

Tests are part of the deploy path. Slow tests slow shipping. Test runtime performance is a functional requirement of the testing system itself.

**Core Rule:** Any test that materially slows CI without proportional risk reduction is considered harmful, even if it is "correct."

**Why This Matters (Pre-PMF Context):**
- We're pre product-market fit—iteration speed is critical
- Gated CI tests must run fast enough to support 2–3 deploys per day
- Test runtime must not grow unbounded over time
- Added tests must justify their runtime cost with real risk coverage

**Gated CI (Deploy-Blocking):**
| Allowed | Not Allowed |
|---------|-------------|
| Fast, deterministic tests | Long-running E2E |
| Focused unit/integration tests | Exhaustive fuzzing |
| Minimal fixture setup | Large fixture setup |
| Mocked external calls | Real network, sleep, or polling loops |

**Nightly / Async Jobs:**
- May be slow and exhaustive
- May trade speed for coverage
- Must never block deploys

**Agent Rules:**

| Do | Don't |
|----|-------|
| Prefer fewer, stronger assertions over more tests | Add slow tests to gated CI by default |
| Collapse redundant tests | Increase CI runtime without explaining why |
| Move slow or high-cardinality tests to nightly | Justify slow tests with "better coverage" alone |
| Call out expected runtime impact in PRs when adding tests | |

**Signs of a Broken Test Suite:**
- CI time increases noticeably without corresponding risk reduction
- Engineers avoid deploys due to slow feedback
- Tests are skipped locally to save time

**Default Bias:** When there's a tradeoff between test thoroughness and iteration speed in gated CI, bias toward speed and move thoroughness to nightly runs.

### Test Coverage Guidelines (When to Write Tests)

Tests should usually be written **at feature creation time**. Bug fixes must add a regression test or include a concrete justification for why one is not practical. Apply coverage selectively — don't slow iteration speed.

**Tests REQUIRED for:**
- Core logic and data processing (parsers, transformers, validators)
- API routes and server actions (contract with frontend)
- Gating systems (waitlist, auth, permissions, entitlements)
- Deterministic workflows (intent router, feedback submission, CRUD operations)
- Backend services and data pipelines (ingestion, enrichment, jobs)
- Database queries and mutations (especially complex joins/filters)

**Tests may be SKIPPED for:**
- Rapidly changing UI components (layout, styling, copy changes)
- Prototype/experimental features still in flux
- Pure presentation components with no logic
- Marketing page content and static pages

**Coverage philosophy:**
- No single repo-wide vanity target; use Codecov patch coverage as the PR readiness signal and project coverage as a ratchet
- Patch coverage floors: 80% for normal changes, 95% for billing/auth/entitlements/webhooks
- Deterministic workflows must have 100% path coverage
- AI-dependent workflows should use mocked LLM responses for determinism
- Focus testing where correctness and reliability are critical
- Bug-fix PRs must either change a `*.test.*` or `*.spec.*` file or explain the regression-test exception in the PR body

| Area | Tests Required? | Why |
|------|----------------|-----|
| Intent router patterns | Yes | Deterministic, must be reliable |
| Waitlist/auth gating | Yes | Security-critical gating |
| API route handlers | Yes | Contract with frontend |
| Server actions (CRUD) | Yes | Data integrity |
| Ingestion/enrichment pipelines | Yes | Data correctness |
| Dashboard layout | No | Changes frequently, visual |
| Homepage copy | No | Marketing, iterates fast |
| Feedback submission flow | Yes | Deterministic workflow |

---

## Infrastructure & Scheduling Guardrails (CRITICAL)

AI agents lack context about operational costs, API billing, and infrastructure consequences. These guardrails exist because agents have historically created expensive, redundant, and architecturally unsound infrastructure without understanding the impact.

### The Decision Hierarchy: Before Creating Any Scheduled/Background Work

**STOP.** Before creating a cron job, scheduled task, background worker, or polling loop, walk through this hierarchy **in order**. Use the first option that works:

| Priority | Approach | When to Use |
|----------|----------|-------------|
| 1 | **Webhook / Event handler** | An external service (Stripe, Clerk, etc.) can notify you when state changes. **This is almost always the right answer.** |
| 2 | **Inline after-action** | The work can happen synchronously after the triggering action (e.g., clean up a record right after it's used). |
| 3 | **On-demand / lazy evaluation** | The work can happen when the data is next accessed (e.g., check if a token is expired when it's read, not on a timer). |
| 4 | **Add to existing scheduled job** | If a nightly/periodic job already exists, add your logic there instead of creating a new one. |
| 5 | **New scheduled job** | Only if none of the above work, AND you've documented why in the PR. |

### Rules for Cron Jobs & Scheduled Tasks

1. **NEVER create a new cron job without explicit approval.** Document in the PR description:
   - Why a webhook/event-driven approach won't work
   - Why it can't be added to an existing scheduled job
   - Expected API call volume and cost impact
   - Proposed frequency and why that frequency is necessary

2. **Consolidate, don't proliferate.** Multiple cleanup tasks that run at similar times should be a single job with multiple steps. One nightly cleanup job that handles photos, keys, retention, etc. is better than four separate cron entries.

3. **Frequency must be justified by business need, not convenience.**
   - Hourly jobs must justify why daily isn't sufficient
   - "Near real-time" requirements should use webhooks, not polling
   - If you can't explain what bad thing happens between intervals, the interval is too frequent

4. **Cron jobs are NOT a substitute for proper event handling.** If Stripe, Clerk, or any external service provides webhooks:
   - Use the webhook to react to state changes in real time
   - Do NOT poll the external API to check for changes
   - Reconciliation jobs (if needed at all) should run at most daily and serve as a safety net, not the primary mechanism

### External API Call Budget Awareness

**Every external API call has a cost.** Agents MUST consider API call volume before writing code that interacts with third-party services.

| Rule | Rationale |
|------|-----------|
| **NEVER iterate over all users to call an external API** | Calling Stripe/Clerk/etc. once per user per run = O(users) calls per run × runs per day. At 1,000 users hourly, that's 24,000 calls/day. At 10,000 users, it's 240,000. |
| **NEVER poll external APIs for state you can receive via webhook** | Stripe, Clerk, Resend, and most services push state changes. Use those. |
| **Batch where possible** | If you must call an external API, use batch/list endpoints instead of per-record fetches. |
| **Cache aggressively** | If you need external data, cache it with appropriate TTLs. Don't re-fetch what hasn't changed. |
| **Log and monitor call volume** | Any new external API integration must log call counts so we can track costs. |

**Stripe-Specific Rules:**
- Stripe webhooks are the **primary** mechanism for billing state changes. The webhook handlers already exist and are hardened with deduplication, optimistic locking, and audit logging.
- Reconciliation (if any) is a **safety net**, not a primary mechanism. It should run at most once daily and only check users whose state actually looks inconsistent (e.g., `isPro = true` but `stripeSubscriptionId` is null).
- NEVER enumerate all Stripe customers/subscriptions. Query the local database for anomalies, then spot-check individual records against Stripe only when something looks wrong.
- Before adding any Stripe API call, calculate: `(calls per run) × (runs per day) × 30 = monthly API calls`. If this number exceeds 1,000/month, justify it in the PR.

### Forbidden Infrastructure Patterns

| Forbidden | Why | Do This Instead |
|-----------|-----|-----------------|
| New Vercel Cron entry without PR approval | Cron proliferation leads to unmanageable scheduled work | Add logic to existing cron or use events |
| Polling loop that calls external APIs | Burns through API budgets and rate limits | Use webhooks |
| Per-user external API call in a loop | O(N) API calls scale linearly with user growth | Batch endpoints or event-driven approach |
| Creating a new job queue / worker system | We already have an in-database job queue (`ingestionJobs`) | Use the existing system or justify why it's insufficient |
| Adding Bull, Agenda, BullMQ, or similar | Adds operational complexity for no benefit at our scale | Use existing in-database queue or Vercel Cron |
| `setInterval` or `setTimeout` in server code | Serverless functions don't persist; these silently fail | Use Vercel Cron or the existing job queue |
| Creating a dedicated "sync" service | Polling-based sync is almost always the wrong pattern | Webhook + reconciliation safety net |

### Cost Impact Disclosure

When a PR introduces or modifies any of the following, the PR description MUST include a **Cost Impact** section:

- New external API calls (Stripe, Clerk, Resend, AI providers, etc.)
- New or modified cron job frequency
- New database queries that run on a schedule
- New third-party service integrations

**Cost Impact template:**

```markdown
## Cost Impact
- **External API calls**: ~X calls/day to [Service] (X calls/run × Y runs/day)
- **Monthly projection**: ~X calls/month at current user count
- **Scaling factor**: O(1) / O(users) / O(records) per run
- **Monthly cost estimate**: $X based on [pricing tier]
```

---

## Agent Autonomy: When to Ask vs. Just Do It

Compute is infinite. Human decision capacity is finite. Don't waste questions on engineering hygiene — save them for decisions only a human has context on.

### Just do it (never ask)

- **Error handling** — add it everywhere: internal utils, helpers, boundaries, all of it
- **Edge cases** — handle anything a real user could realistically hit (bad input, network errors, race conditions, concurrent state)
- **Tests** — always write tests for new/changed code, but avoid slop tests or tests for rapidly-changing UI (design, copy). Follow the Test Coverage Guidelines above.
- **Linting, type fixes, dead code removal** — fix what you touch
- **Validation, logging, cleanup** — if it makes the code more robust, do it

### Auto-fix, ask about structural changes (gstack skills)

- `/qa`, `/review`, `/ship` should auto-fix obvious issues (lint, types, small bugs) without asking
- Ask before structural changes (moving files, changing APIs, refactoring patterns)

### Always ask (genuine human decisions)

- Product/UX decisions (how should this behave for users?)
- Architecture choices (which approach/pattern?)
- Scope changes (should we also tackle X while we're here?)
- Breaking changes or migrations
- New external dependencies or services
- Trade-offs where both options have real downsides

**The principle:** If the upside is obvious and the cost is small (a few minutes of compute), just do it. Save questions for decisions only a human has context on.

---

## General Agent Decision-Making Rules

### You Don't Know What You Don't Know

AI agents confidently make decisions about topics they have zero context on. These rules exist to prevent that.

1. **Don't architect what you don't understand.** If you're unsure about the billing model, pricing tiers, API rate limits, or infrastructure costs of a service, ASK before building. "I'll just add a cron job" is not a low-risk default — it has real operational and financial consequences.

2. **Prefer boring, proven patterns.** The existing codebase has established patterns for webhooks, job queues, caching, and API integration. Use them. Don't invent new patterns for solved problems.

3. **Scope your changes to what was asked, plus hardening (error handling, edge cases, tests) for code you touch.** If the task is "add a field to the user profile," don't also refactor the database client, add a reconciliation job, or restructure the API layer — but do add error handling, edge case coverage, and tests for the code you modified.

4. **When adding integrations, read the provider's docs on webhooks first.** Almost every SaaS provider (Stripe, Clerk, Resend, Vercel, etc.) has webhook support. Check for it before building a polling solution.

5. **Never silently add recurring costs.** Cron jobs, API polling, scheduled tasks, and external service calls all cost money. If your change will run repeatedly in production, say so in the PR description with volume estimates.

6. **Verify before trusting.** When the user (or another agent's output) states something verifiable — "we use X," "competitor Y doesn't do Z," "this API returns W" — check it. A quick grep, file read, or doc lookup takes seconds. If the claim is wrong, say so clearly. This is how we catch agent drift (an agent introduced something it shouldn't have), stale assumptions, and documentation gaps. Being corrected is a feature, not a problem.

### Operational Awareness Checklist

Before merging any PR that introduces background/scheduled work, verify:

- [ ] Is there already a webhook for this event? (Check the provider's docs)
- [ ] Can this logic run inline after the triggering action?
- [ ] Can this be lazy-evaluated when the data is next read?
- [ ] If a cron job is truly needed, can it be added to an existing one?
- [ ] What's the API call volume at 100 users? 1,000? 10,000? 100,000?
- [ ] What happens if this job fails? Is there retry logic? Dead letter handling?
- [ ] Is the frequency justified? What breaks if we run it less often?
- [ ] Have I included a Cost Impact section in the PR description?

---

## Environment Variables

**NEVER** hardcode secrets. Always use environment validation:

```typescript
// CORRECT: Use validated env
import { env } from '@/lib/env';
const apiKey = env.STRIPE_SECRET_KEY;

// WRONG: Direct process.env access
const apiKey = process.env.STRIPE_SECRET_KEY; // No validation!
```

Required variables are defined in `lib/env.ts` with Zod validation.

---

## Branch Strategy

```
feature/* ──► develop ──► preview ──► production
                │
                └── PR required for each transition
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
# Or check .nvmrc: cat .nvmrc
```

### "Turbo cache issues"
```bash
pnpm turbo clean
rm -rf node_modules/.cache
```

### "Test OOM / Out of Memory"
```bash
# Run tests with reduced concurrency to lower memory pressure
pnpm turbo test --concurrency=1

# Run only tests for changed packages
pnpm turbo test --affected

# Combine both for maximum memory savings
pnpm turbo test --affected --concurrency=1

# The web app already uses NODE_OPTIONS=--max-old-space-size=4096
# and --pool=forks --maxWorkers=2 for memory safety.
```

### "Type errors after pull"
```bash
pnpm install  # Ensure deps are synced
pnpm typecheck  # Re-run type check
```

---

## Additional Resources

- **Copilot-specific**: `.github/copilot-instructions.md`
- **Cursor-specific**: `apps/web/.cursorrules`
- **Hooks documentation**: `.claude/hooks/README.md` (if exists)

---

## Turborepo Quick Reference (Agent Index)

Compressed documentation index for AI agents. Use `turbo docs "topic"` or the `/turbo-docs` command for full details.

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

## gstack Skills (Workflow Toolkit)

This repo includes [gstack](https://github.com/garrytan/gstack) as a git submodule at `.claude/skills/gstack/`. It provides specialized workflow skills available to all AI agents.

**Conflict rule:** gstack commands are canonical. If a gstack skill conflicts with any other command or workflow, the gstack version takes precedence.

### Available Skills

| Skill | Invocation | Purpose |
|-------|------------|---------|
| Ship | `/ship` | Automated release: merge main, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR |

#### Changelog

**Do not manually edit `CHANGELOG.md` during development.** The `/ship` workflow generates changelog entries automatically from the diff and commit history.

`CHANGELOG.md` uses `merge=union` in `.gitattributes` to auto-resolve merge conflicts between concurrent PRs.

**Customer-friendly format:** The changelog is rendered on the public `/changelog` page, RSS feed, and subscriber emails. Follow these conventions:
- **Summary blockquote:** Add `> plain-language summary` (max 3 sentences) right after the version heading. Written for non-technical users (artists, fans, investors).
- **`[internal]` prefix:** Tag developer-facing entries with `- [internal] ...`. These are hidden from the public page, RSS feed, and emails but preserved for developer reference.
- **Plain language:** Public entries should avoid jargon. Write what changed for the user, not how it was implemented. Example: "Tips now process correctly" not "Stop capture-tip infinite Stripe retry loop".
- **Hidden releases:** Releases where ALL entries are `[internal]` are completely hidden from public surfaces.

**Shared parser:** `apps/web/lib/changelog-parser.ts` is the single source of truth for changelog parsing in the Next.js app (page + RSS feed). `scripts/lib/changelog-parser.mjs` is the Node ESM version used by the email send script.

**Post-merge emails:** After a PR merges to main, run `pnpm changelog:send` to email all verified changelog subscribers (requires `RESEND_API_KEY`, `DATABASE_URL`).

**Spam protection:** `changelog:send` enforces a 24-hour cooldown between product update emails. If subscribers were emailed within the last 24h, the send is skipped automatically. Use `--force` to override for critical announcements.

| Review | `/review` | Pre-landing PR review for SQL safety, trust boundary violations, side effects |
| Plan (CEO) | `/plan-ceo-review` | Founder mode: rethink problems from first principles, find the 10-star product |
| Plan (Eng) | `/plan-eng-review` | Eng manager mode: lock in execution plans with architecture and edge cases |
| Browse | `/browse` | Fast headless browser (~100ms/cmd) for QA testing and site verification |
| QA | `/qa` | Systematic QA with diff-aware, full, quick, and regression modes |
| Retro | `/retro` | Weekly retrospective analyzing commit history and code quality metrics |
| Browser Cookies | `/setup-browser-cookies` | Import authenticated sessions for testing |
| Upgrade | `/gstack-upgrade` | Upgrade gstack to latest version |

### Setup

gstack requires **Bun v1.0+**. The session-start hook installs Bun and runs setup automatically. For manual setup:

```bash
cd .claude/skills/gstack && ./setup
```

### Updating gstack

```bash
cd .claude/skills/gstack && git pull origin main && ./setup
```

Or use `/gstack-upgrade` from within Claude Code.

### QA & Browse Authentication (Jovie-Specific)

When running `/qa` or `/browse` against local Jovie, agents **MUST** use the built-in dev auth bootstrap. **Do NOT prompt the user for credentials. Do NOT ask for cookie import help.**

**Local default flow (`localhost`, `127.0.0.1`, private dev IPs):**

1. Start the browse-compatible dev server:

   ```bash
   pnpm run dev:web:browse
   ```

2. Authenticate the browse session by opening:

   ```text
   /api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings
   ```

3. Use `persona=admin` only when you intentionally need admin QA:

   ```text
   /api/dev/test-auth/enter?persona=admin&redirect=/app/admin
   ```

**What this does:**
- sets the local auth-bypass cookies automatically
- provisions a stable creator browse persona by default
- avoids Clerk sign-in, OTP entry, and cookie handoff
- works without `NEXT_PUBLIC_E2E_MODE=1`

**Agent rules:**
- `/browse` on local Jovie means: use the dev auth bootstrap route above
- default persona is `creator`; `admin` is opt-in
- if auth is needed on local browse QA, solve it yourself with this flow
- only use `scripts/browse-auth.ts` as a fallback helper for non-loopback hosts
- only use `/setup-browser-cookies` for importing a real human session when a human explicitly wants that path

**Do NOT:**
- prompt the user for credentials
- fill the Clerk sign-in form manually for local QA
- claim auth is blocked on local `/browse` without trying `/api/dev/test-auth/enter?...`
- enable `NEXT_PUBLIC_E2E_MODE=1` just to make browse auth work

---

**Remember: When in doubt, verify your Node version (`node --version`) and use pnpm from the repository root.**

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke `office-hours`
- Bugs, errors, "why is this broken", 500 errors → invoke `investigate`
- Ship, deploy, push, create PR → invoke `ship`
- QA, test the site, find bugs → invoke `qa`
- Code review, check my diff → invoke `review`
- Update docs after shipping → invoke `document-release`
- Weekly retro → invoke `retro`
- Design system, brand → invoke `design-consultation`
- Visual audit, design polish → invoke `design-review`
- Architecture review → invoke `plan-eng-review`

## CI Seeding Guardrail

- In shared CI lanes that audit public routes (`Lighthouse`, `a11y`, public smoke), seed scripts must fail only on required schema.
- Optional fixtures that depend on add-on relations, such as `promo_downloads`, must warn and skip when the relation is missing unless that lane explicitly provisions the schema first.
- Playwright route-audit specs must not resolve manifests or env-dependent surface lists in a way that can crash the module import. Catch resolution failures and surface them through an always-registered test or equivalent explicit failure path; `beforeAll` alone is insufficient if manifest failure can result in zero generated tests.
- Test-bypass health/debug endpoints must fail closed on production deploys. Preview-only bypass logic may exist for CI smoke runs, but `VERCEL_ENV=production` must hard-block access regardless of spoofable headers or bypass flags.
