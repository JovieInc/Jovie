# Agents Guide (Jovie)

This file defines how AI agents (Claude, Codex, Copilot, etc.) work in this repo so we ship fast while keeping `main` and `production` clean.

## Quickstart for AI agents

- **Single source of truth:** Treat this file as the canonical ruleset for all AI agents in this repo.
- **Analytics & flags:** Use **Statsig only** via the existing wrappers; do not introduce PostHog, Segment, RudderStack, or other analytics SDKs.
- **Branches & PRs:** Always work on feature branches from `main` and follow sections 1–2 for branching and PR expectations.
- **Guardrails:** Before making product changes, skim sections 8–13 for architecture, runtime/auth/DB rules, testing expectations, and CI/CD/landmine guidance.

## 0. Analytics & Feature Flags (Statsig-only)

- Statsig is the **only** product analytics and feature flag platform used in this repo.
- Do **not** add or reintroduce PostHog, Segment, RudderStack, or any other analytics/flags SDKs.
- Use Statsig feature gates/experiments for non-essential flows; leave MVP-critical flows ungated unless explicitly flagged.

### Feature Gate Workflow

**When creating a new feature flag:**

1. **Add to code constants** (`lib/statsig/flags.ts`):
   ```typescript
   export const STATSIG_FLAGS = {
     // ... existing flags
     NEW_FEATURE: 'feature_new_feature',
   } as const;
   ```

2. **Create gate in Statsig** using one of these methods:
   - **Recommended**: Use the Statsig MCP server (configured in `.claude.json`)
     - Ask Claude Code to create the gate via MCP
     - Provide: gate name, description, default value, expiry (if temporary)
   - **Manual**: Create via [Statsig Console](https://console.statsig.com)
     - Navigate to Feature Gates → Create New Gate
     - Use exact name from `STATSIG_FLAGS` constant

3. **Document the gate** in `docs/STATSIG_FEATURE_GATES.md`:
   - Add entry with status, default, description, expiry, and usage locations
   - Update migration checklist if applicable

4. **Use in code**:
   ```typescript
   import { STATSIG_FLAGS } from '@/lib/statsig/flags';

   // Client-side
   const isEnabled = statsig.checkGate(STATSIG_FLAGS.NEW_FEATURE);

   // Server-side
   const isEnabled = await statsig.checkGateForUser(user, STATSIG_FLAGS.NEW_FEATURE);
   ```

### Statsig MCP Server

The Statsig MCP server is configured for Claude Code and enables:
- Programmatic gate creation and management
- Gate status checking and updates
- Experiment configuration
- Analytics event tracking

Configuration location: `.claude.json` (project-specific)

## 1. Branch & Environment Model

- **Feature branches**
  - **Base:** always branch from `main`.
  - **Naming:** `feat/<slug>`, `fix/<slug>`, `chore/<slug>` (3–6 word kebab-case slug).
  - **Never** push directly to `main` or `production`.

- **Long-lived branches**
  - **`main`**
    - Source of truth for all day-to-day development.
    - Must always be **green** on: `pnpm typecheck`, `pnpm lint`, `pnpm test`, basic E2E smoke.
    - Deploys to [main.jov.ie](https://main.jov.ie) (Main Staging Vercel environment) automatically on push.
    - Full CI runs on push: build, unit tests, E2E smoke, Drizzle checks, database migrations.
  - **`production`**
    - Mirrors what users see at [jov.ie](https://jov.ie) in production.
    - Only updated via **release PRs from `main` → `production`**, never by direct commits.
    - Requires manual approval before merge (enforced by branch protection).
    - Deploys automatically to production after PR merge.

- **Neon Database Branches**
  - **`production`** - Primary production branch mapped to Git `production`.
  - **`main`** - Staging branch mapped to Git `main` for rapid iteration.
  - **NO preview branch** - Legacy preview environment removed (main is the staging environment now).
  - **Ephemeral branches** - Auto-created per PR for full CI, auto-deleted on PR close (see neon-ephemeral-branch-cleanup.yml).

## 2. PR Expectations (All Agents)

- **Before opening a PR**
  - Start from latest `main`.
  - Keep scope tight: one user-visible outcome per PR.
  - Wrap new behavior behind a feature flag named `feature_<slug>` where appropriate.

- **When opening a PR**
  - **Base branch:** `main`.
  - **Title:** `[feat|fix|chore]: <slug>` (conventional commit style).
  - **Body includes:**
    - Goal (1–2 sentences).
    - KPI / outcome (if applicable).
    - Statsig events/experiments added/updated (no PostHog).
    - Rollback plan (usually "disable feature flag" or "revert PR").
  - Add label `auto-merge` when it is safe for CI + automation to merge once green.

- **Required checks for auto-merge into `main`**
  - Fast lane:
    - `pnpm typecheck` (CI job: Typecheck).
    - `pnpm lint` (CI job: Lint).
  - For higher-risk changes (DB, core flows), ensure full CI is enabled (`full-ci` label) so build, unit tests, Drizzle checks, and smoke E2E run.

## 3. Codex Auto-Fix CI

- **Trigger:**
  - Runs after the primary `CI` workflow **fails** on a PR into `main`.
  - Only for PRs from the same repo (no forks).

- **Behavior:**
  - Uses the Codex CLI to:
    - Read the repo and CI logs.
    - Apply minimal, targeted fixes so `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.
  - Verifies checks locally inside the workflow.
  - Opens a dedicated `codex/auto-fix-<id>` branch + PR against the original feature branch.

- **Agent obligations:**
  - Do **not** fight Codex auto-fixes; incorporate them or adjust with a follow-up PR.
  - If Codex cannot safely fix an issue (complex refactor, product decision), add `needs-human` or `no-auto-merge` to halt automation.

## 4. Auto-Merge Rules

- Auto-merge is managed by `.github/workflows/auto-merge.yml`:
  - **Regular PRs:** auto-merge allowed when:
    - Base is `main`.
    - PR has `auto-merge` label.
    - CI checks configured for `main` are green.
    - No blocking labels: `blocked`, `human-review`, `no-auto-merge`, `claude:needs-fixes`, `needs-human`.
  - **Dependabot:** auto-merge for patch/minor + security, subject to policy checks.
  - **Codegen/automation PRs:** auto-merge when labeled appropriately (e.g. `codegen`).
  - **Production promotion PRs:** **never** auto-merged; must be manually approved.

## 5. Neon & Migrations

- **Do not** run Drizzle migrations manually in ad-hoc ways.
- **Long-lived branches:** Only `main` and `production` (no preview branch).
- CI is responsible for:
  - Creating per-PR Neon ephemeral DBs for full CI (auto-created, auto-deleted on PR close).
  - Running `drizzle:check` to validate schema changes before merge.
  - Running `pnpm run drizzle:migrate` automatically on main and production deploys.
- Per PR:
  - Aim for **one migration per PR**.
  - Avoid destructive changes without a clear data-migration plan.
  - **Linear append-only migrations** - never edit or squash existing migrations.

### 5.1 Migration Creation Workflow (CRITICAL)

When creating new database migrations, you **MUST** follow this exact process:

1. **Generate migration using Drizzle:**
   ```bash
   pnpm run drizzle:generate
   ```
   This command:
   - Creates a new `.sql` file in `drizzle/migrations/`
   - **Automatically updates `drizzle/migrations/meta/_journal.json`**
   - Generates a snapshot file in `drizzle/migrations/meta/`

2. **NEVER manually create migration files** without updating the journal:
   - ❌ **WRONG**: Create `0011_my_migration.sql` directly
   - ✅ **RIGHT**: Use `pnpm run drizzle:generate` which updates both `.sql` and `_journal.json`

3. **Verify journal is updated:**
   - Check that `drizzle/migrations/meta/_journal.json` includes your new migration
   - Journal entry must have: `idx`, `version`, `when`, `tag`, `breakpoints`
   - Migration will be **silently skipped** if not in journal

4. **Why this matters:**
   - Drizzle's migration runner (`pnpm run drizzle:migrate`) only applies migrations listed in `_journal.json`
   - If you create a `.sql` file but forget to update `_journal.json`, the migration will **never run** in CI or production
   - This causes "column does not exist" errors and schema drift between environments

**Example of a properly registered migration:**
```json
{
  "idx": 13,
  "version": "7",
  "when": 1733400200000,
  "tag": "0013_social_link_state",
  "breakpoints": false
}
```

**If you discover an unregistered migration:**
1. DO NOT manually add it to `_journal.json` - this can cause migration order issues
2. Instead, regenerate the migration using `pnpm run drizzle:generate`
3. Or consult with team lead before manually editing the journal

### 5.1.1 Migration Validation (Pre-commit Hook)

A pre-commit hook automatically validates migration files to catch common issues:

**What it checks:**
1. Every `.sql` file in `drizzle/migrations/` has a corresponding entry in `_journal.json`
2. Journal entries have all required fields: `idx`, `version`, `when`, `tag`, `breakpoints`
3. Migration filenames match journal `tag` values
4. No gaps in migration `idx` sequence

**When it runs:**
- Automatically on `git commit`
- Before pushing to remote
- Can be bypassed with `--no-verify` flag (use sparingly!)

**If validation fails:**
```bash
❌ Migration validation failed:
   - Migration file 0015_my_feature.sql found but not in _journal.json
   - Use `pnpm drizzle-kit generate` to create migrations properly
```

**To fix:**
1. Remove the manually created `.sql` file
2. Run `pnpm drizzle-kit generate` to regenerate it properly
3. Commit again

### 5.2 Zero-Downtime Index Creation (CRITICAL)

When creating indexes in production migrations, you **MUST** use `CONCURRENTLY` to avoid blocking writes:

**❌ WRONG - Blocks all writes:**
```sql
CREATE INDEX idx_name ON table_name (column_name);
CREATE UNIQUE INDEX uniq_name ON table_name (column_name);
```

**✅ RIGHT - Allows concurrent writes:**
```sql
CREATE INDEX CONCURRENTLY idx_name ON table_name (column_name);
CREATE UNIQUE INDEX CONCURRENTLY uniq_name ON table_name (column_name);
```

**Why this matters:**
- Without `CONCURRENTLY`, PostgreSQL acquires an **exclusive lock** on the table
- This **blocks all writes** (INSERT, UPDATE, DELETE) during index creation
- Can cause **deployment timeouts** and **production downtime**
- Large tables may take minutes to index, blocking all operations

**Important notes:**
- `CONCURRENTLY` cannot be used inside a transaction block
- If your migration has multiple statements, you may need to split index creation into a separate migration
- Always test index creation time on staging before deploying to production

### 5.3 PostgreSQL Syntax Requirements (CRITICAL)

When writing raw SQL migrations, you **MUST** use correct PostgreSQL syntax. Common mistakes to avoid:

#### ❌ WRONG: `CREATE TYPE IF NOT EXISTS`
PostgreSQL does **NOT** support `IF NOT EXISTS` for `CREATE TYPE`:
```sql
-- ❌ INVALID SYNTAX - will fail
CREATE TYPE IF NOT EXISTS my_enum AS ENUM ('a', 'b', 'c');
```

#### ✅ RIGHT: Use DO block with pg_type check
```sql
-- ✅ CORRECT - check pg_type catalog first
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'my_enum') THEN
    CREATE TYPE my_enum AS ENUM ('a', 'b', 'c');
  END IF;
END $$;
```

#### ❌ WRONG: Multiple statements in Neon MCP
The Neon MCP `run_sql` tool cannot execute multiple statements:
```sql
-- ❌ FAILS with "cannot insert multiple commands into a prepared statement"
CREATE INDEX idx_a ON table_a (col);
CREATE INDEX idx_b ON table_b (col);
```

#### ✅ RIGHT: One statement per call
```sql
-- ✅ CORRECT - execute each statement separately
CREATE INDEX idx_a ON table_a (col);
-- (separate call)
CREATE INDEX idx_b ON table_b (col);
```

#### Other PostgreSQL gotchas:
- **Enums are case-sensitive** - `'Active'` ≠ `'active'`
- **Use `timestamp` not `datetime`** - PostgreSQL uses `timestamp` or `timestamptz`
- **Use `text` not `varchar`** - In PostgreSQL, `text` is preferred over `varchar` for variable-length strings
- **Use `jsonb` not `json`** - `jsonb` is binary and supports indexing; `json` is text-based
- **Default values must match type** - `DEFAULT '{}'::jsonb` not `DEFAULT '{}'`

### 5.4 Migration Testing Checklist

Before merging any migration:

1. **Syntax validation:** Run `pnpm run drizzle:check` locally
2. **Fresh database test:** Apply migration to empty database
3. **Idempotency:** Use `IF NOT EXISTS` / `IF EXISTS` where supported
4. **Rollback plan:** Document how to reverse the migration if needed
5. **Seed compatibility:** Ensure `pnpm run drizzle:seed` still works after migration

## 5.5 CI/CD Workflow Details (YC-Aligned Rapid Deployment)

### Fast Path (Feature PRs → main)
- **Triggers:** PRs to `main` branch
- **Checks:** TypeScript typecheck + ESLint (~10-15s total)
- **Auto-merge:** Enabled for dependabot, codegen, PRs with `auto-merge` label
- **Deployment:** Automatic to [main.jov.ie](https://main.jov.ie) on merge
- **Timeline:** Feature → production in ~2 minutes (if auto-merge eligible)

### Full CI (main → production PRs)
- **Triggers:** Push to `main` or PRs to `production`
- **Checks:**
  - All fast checks (typecheck, lint)
  - Drizzle schema validation
  - Next.js build
  - Unit tests
  - E2E smoke tests
- **Database migrations:** Run automatically via `drizzle:migrate` on deployment
- **Auto-merge:** Disabled (requires manual approval for production)
- **Deployment:** Automatic to [jov.ie](https://jov.ie) after PR merge
- **Timeline:** Main → production in ~5 minutes (with review)

### Database Migrations
- **Auto-run:** Migrations run automatically on Vercel deploy via `drizzle:migrate` script
- **Ephemeral Neon branches:** Auto-created per PR with unique name, auto-deleted on PR close
- **Long-lived branches:** Only `main` and `production` (NO preview branch)
- **Migration strategy:** Linear append-only (no squashing, no editing existing migrations)
- **Testing:** Each PR gets isolated ephemeral database for safe schema testing

### Environment URLs
- **Main staging:** [main.jov.ie](https://main.jov.ie) - Deployed from `main` branch
- **Production:** [jov.ie](https://jov.ie) - Deployed from `production` branch
- **PR previews:** Unique Vercel preview URLs per PR (ephemeral)

### YC-Optimized Velocity
- **Ship multiple times per day:** Fast CI enables rapid iteration
- **Feature → main:** ~2 minutes (auto-merge)
- **Main → production:** ~5 minutes (manual review + auto-deploy)
- **Total:** Ship to production in < 10 minutes from PR creation

### Rollback Strategy
- **Code rollback:** `git revert` + push to main
- **Database rollback:** Create reverse migration (append-only, no destructive rollback)
- **Emergency:** Direct PR to production (bypass main)
- **Backups:** Neon point-in-time recovery available

## 6. Agent-Specific Notes

- **Claude (feature work, refactors)**
  - Own end-to-end changes: schema → backend → UI → tests.
  - Prefer server components and feature-flagged rollouts.
  - Always use Statsig for feature gates/experiments; do not introduce any other flag or analytics SDKs.

- **Codex (CI auto-fix, focused cleanups)**
  - Operates only via the `codex-autofix` workflow.
  - Keeps edits minimal and focused on fixing CI regressions.

- **Copilot / other LLM helpers**
  - Local assistance only; any branch/PR they help produce must still obey this guide.

## 7. Safety & Guardrails

- **No direct dependencies** on analytics/flags outside of the existing Statsig and analytics wrappers in `@/lib` and `@/lib/statsig`.
- **No direct Neon branch management** from agents; always go through CI workflows.
- **No direct pushes** to `main` or `production`.
- **HARD GUARDRAIL – Drizzle migrations are immutable:** Treat everything under `drizzle/migrations` as append-only. Do **not** edit, delete, reorder, squash, or regenerate existing migration files for any reason; only add new migrations. If a past migration appears incorrect, stop and escalate to a human instead of attempting an automated fix.
- New features ship **behind Statsig flags/experiments** and with **Statsig events** (or equivalent Statsig metrics) for primary actions.

## 8. Engineering Guardrails & Architecture

### 8.1 Component Architecture (Atomic)
- **One component per file.** Named export only; no default exports. Export name must match file name.
- **Atoms:** UI-only primitives (no business logic, no API calls), usually under `components/atoms/`.
- **Molecules:** Small combinations of atoms with minimal state, under `components/molecules/`.
- **Organisms:** Self-contained sections that can own state and feature logic, under `components/organisms/`.
- **Feature directories:** Use `components/<feature>/...` for domain-specific components that aren't widely reused.
- **Props:** Interface named `<ComponentName>Props`; children typed as `React.ReactNode`.
- **A11y & testing:** Add appropriate `aria-*` attributes; organisms must expose stable `data-testid` hooks.
- **forwardRef:** Use `React.forwardRef` for DOM atoms/molecules and set `Component.displayName`.
- **Deprecation:** Mark old components with `/** @deprecated Reason */` and point to the replacement.

### 8.2 Design Aesthetic & Copy
- **Brand:** Color-agnostic; Jovie logo is black or white only.
- **Surfaces:**
  - Dark mode: black background, white text/buttons; primary CTAs are solid black with white text.
  - Light mode: white background, black text/buttons; primary CTAs are solid white with black text.
  - Marketing sections may use accent colors, but core system components stay neutral.
- **Copywriting:**
  - Use "Jovie profile" and "Jovie handle/username".
  - Never describe Jovie itself as a "link-in-bio" product (only use that phrase when comparing competitors).
  - Apple-level clarity; concise, active voice; focus copy on activation and MRR.

### 8.3 Stack & Packages
- **Runtime & framework:** Next.js App Router + React Server Components.
- **Package manager:** `pnpm` only.
- **DB:** Neon + Drizzle (`@neondatabase/serverless`, `drizzle-orm/neon-serverless` with WebSocket support for transactions).
- **Auth:** Clerk via `@clerk/nextjs` / `@clerk/nextjs/server`.
- **Styling:** Tailwind CSS v4 + small helpers (e.g., `clsx`, `tailwind-merge`) where needed.
- **Headless UI:** Prefer `@headlessui/react` and `@floating-ui/*` for dialogs, menus, sheets, tooltips, and popovers.
- **Billing:** Stripe (`stripe` on server, `@stripe/stripe-js` on client); no Clerk Billing.
- **Analytics & flags:** Statsig-only for product analytics and feature flags; do not add PostHog/Segment/RudderStack.

### 8.4 Tailwind & Layout
- `tailwind.config.js`, `postcss.config.mjs`, and the top of `styles/globals.css` are effectively locked.
- Do **not** rename/move `tailwind.config.js`, add `@config`/`@source` directives, or switch to TS configs.
- Add custom utilities via `@utility` in `globals.css`; add new content paths via the `content` array in `tailwind.config.js`.
- Ensure `globals.css` starts with `@import "tailwindcss";` and theme imports as documented.

## 9. Runtime, Auth, Database & RLS

### 9.1 Runtime Modes (Vercel)
- Use **Edge runtime** (`export const runtime = 'edge'`) for latency-sensitive public reads (e.g., public profiles).
- Use **Node runtime** (`export const runtime = 'nodejs'`) for Stripe, Node-only libraries, and heavy compute.
- Never import Node-only libraries (e.g., `stripe`, Node crypto) into Edge code.

### 9.2 Auth (Clerk)
- Use `clerkMiddleware()` in `middleware.ts` to protect private routes.
- Wrap the app with `<ClerkProvider>` in `app/layout.tsx`.
- Import server helpers (e.g., `auth`) from `@clerk/nextjs/server` and client hooks/components from `@clerk/nextjs`.
- Ensure Clerk environment and allowed frontend URLs are configured for preview and production domains.

#### 9.2.1 Auth + Onboarding Flow (Current Baseline)

- **Authentication model:**
  - **Email-only OTP** using Clerk Elements; **no passwords** and **no OAuth/social providers** in the UI.
  - Sign-in and sign-up live under the App Router:
    - `GET /signin` → `OtpSignInForm` (Clerk Elements + shadcn UI) inside `AuthLayout`.
    - `GET /signup` → `OtpSignUpForm` (Clerk Elements + shadcn UI) inside `AuthLayout`.
- **Onboarding integration:**
  - New users are taken through `/onboarding` immediately after sign-up (configure Clerk **after sign-up redirect** to `/onboarding` in the Dashboard).
  - `/onboarding` is a **protected route** that:
    - Requires a valid Clerk session (`auth()`), otherwise redirects to `/signin?redirect_url=/onboarding`.
    - Uses the same `AuthLayout` shell as `/signin` and `/signup` for a unified experience.
    - Renders the Apple-style multi-step onboarding organism (name → handle → done) backed by `completeOnboarding` server actions.
- **Onboarding steps (streamlined):**
  1. **Name** – collect the artist display name.
  2. **Handle** – pick and validate the Jovie handle (with availability checks and profile URL preview).
  3. **Done** – confirm the public profile URL and offer CTAs (go to Dashboard, copy link).
- **Testing expectations:**
  - E2E tests should authenticate via **Clerk test-mode tokens / programmatic sessions**, not password-based flows.
  - Do **not** reintroduce password fields or OAuth buttons in new auth or onboarding UI.

### 9.3 Database (Neon + Drizzle)
- Use the transaction-capable client: `@neondatabase/serverless` + `drizzle-orm/neon-serverless`.
- WebSocket support is configured via `neonConfig.webSocketConstructor = ws` for full transaction capabilities.
- The database client uses connection pooling (`Pool`) for production-ready performance.
- Transaction support enables proper RLS with `SET LOCAL` session variables that persist within transaction scope.
- Run Drizzle migrations only in Node (never from Edge code).
- Keep Neon branches tidy: production parent + a primary child for preview; ephemeral branches per PR created/destroyed via CI.
- Set `app.clerk_user_id` per request on the server before DB calls when RLS policies depend on it (use `withDbSession` or `withDbSessionTx` helpers).

### 9.4 Postgres RLS Pattern
- Use `current_setting('app.user_id', true)` in RLS policies to authorize access.
- Do not hardcode user IDs in policies; always drive them through the session variable.

## 10. Performance, Caching & Public Profiles

- Public profile reads:
  - Edge runtime + direct Neon queries (no cache layer yet).
  - Use RSC streaming/Suspense to minimize client-side JS.
- Caching & rate limiting:
  - Currently disabled by design ("do things that dont scale").
  - Only introduce Redis/rate limiting when traffic/abuse/latency thresholds are clearly hit.

## 11. Payments (Stripe)

- Stripe is Node-only; do not import `stripe` in Edge handlers or React Server Components.
- Use dedicated Node routes for:
  - Checkout (`/app/api/stripe/checkout/route.ts`).
  - Customer portal (`/app/api/stripe/portal/route.ts`).
  - Webhooks (`/app/api/stripe/webhook/route.ts`) with **raw body** access.
- Store `stripe_customer_id` keyed by Clerk `userId` in the database.

## 12. Testing Strategy

- Follow a **pyramid**:
  - Unit tests (fast, many) > integration tests (fewer) > E2E (critical paths only).
- Unit tests:
  - Focus on pure logic and utilities; run quickly (<200ms each).
  - Mock external services (Clerk, Stripe, Statsig, DB).
- Integration tests:
  - Cover API routes and DB interactions with a test database.
- E2E tests:
  - Exercise golden paths such as sign-up  create profile  share profile, and monetization flows.
- CI expectations:
  - `pnpm typecheck`, `pnpm lint`, `pnpm test` must be green before merge.
  - Smoke E2E tests run on PRs touching critical flows.

## 13. CI/CD, Critical Modules & Landmines

- **CI/CD:**
  - Fast checks always run: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
  - Full CI (build, Drizzle checks, E2E) runs for higher-risk changes or when labeled (`full-ci`).
- **Critical module protection:**
  - Protected areas: marketing homepage, Featured Creators, and money-path flows (checkout/portal/pricing/onboarding).
  - Do not introduce mocks/static lists in protected modules; keep using adapters and real data sources.
  - Preserve existing `data-testid` hooks so homepage/money-path smoke tests remain stable.
- **Landmines to avoid:**
  - Edge/Node leakage (Node-only libs in Edge).
  - Clerk host/environment mismatches.
  - Running migrations from Edge.
  - Tailwind v4 plugin/config drift.
  - Env/secret sprawl or mixing preview and production credentials.

## 14. Next.js 16 Best Practices

- Enable Cache Components with the `use cache` directive so caching is explicit and the compiler can generate consistent cache keys.
- Default to request-time execution for dynamic server code unless Cache Components explicitly wrap it, matching the new “opt-in cache” mindset.
- Combine Cache Components with Suspense-based Partial Prerendering to deliver static shells with targeted dynamic updates.
- Pass a cacheLife profile (we recommend `'max'`) as the second argument to `revalidateTag()` to get SWR-style behavior instead of manually tracking expirations.
- Call `updateTag()` inside Server Actions when mutations must show read-your-write data immediately within the same request.
- Use the Server Actions-only `refresh()` when you need to refresh uncached data without touching cached page shells, complementing `router.refresh`.
- Plug into Next.js DevTools MCP so agents and teammates can inspect routing, caching, and the unified log surface for faster debugging.
- Replace `middleware.ts` with `proxy.ts`/`proxy` (Node runtime) handlers to keep the network boundary clear; keep Edge middleware only for legacy cases.
- Monitor the enhanced dev/build logs that break out compile work vs. React rendering so you can spot time sinks faster.
- Default to the stable Turbopack bundler in both dev and prod for the 2–5× faster builds and up to 10× speedier Fast Refresh, falling back to webpack only when absolutely necessary.
- Turn on Turbopack filesystem caching so repeated restarts reuse artifacts and large repositories feel snappier.
- Start new features from the refreshed `create-next-app` template (App Router, TypeScript-first, Tailwind, ESLint) to stay aligned with current defaults.
- Use the Build Adapters API when you need to hook into the build flow for custom deployment hosts or infrastructure automation.
- Gradually opt into `reactCompiler` once you’ve measured the build-time cost; it automatically memoizes components to cut redundant renders.
- Lean on layout deduplication and incremental prefetching (built into Next.js 16) so shared layouts download once and cached chunks only refresh when invalidated.
- Take advantage of React 19.2 additions (`View Transitions`, `useEffectEvent`, `<Activity />`) whenever you build new transitions or interaction patterns.

## 15. Sentry Instrumentation & Logging

- Always import Sentry via `import * as Sentry from '@sentry/nextjs'` and initialize once per context (client: `instrumentation-client.(js|ts)`, server: `sentry.server.config.ts`, edge: `sentry.edge.config.ts`).
- Keep the default `Sentry.init` configuration (DSN + `enableLogs: true`) unless a teammate documents a safe override; reuse the provided logger (e.g., `const { logger } = Sentry`) rather than wiring new instances.
- Use `Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })` when enabling console forwarding so you don’t need to wrap every console call manually.
- Capture unexpected exceptions with `Sentry.captureException(error)` inside `catch` blocks or fail-fast paths where errors should be surfaced.
- Create spans for key UI/API actions (`button clicks`, `fetch calls`, `critical business logic`) using `Sentry.startSpan` with meaningful `op` and `name` values, and attach attributes/metrics describing inputs or request-specific data.
  ```javascript
  Sentry.startSpan(
    { op: 'ui.click', name: 'Test Button Click' },
    span => {
      span.setAttribute('config', value);
      span.setAttribute('metric', metric);
      doSomething();
    }
  );
  ```
- Wrap API requests similarly so the span describes the route and HTTP operation when calling fetchers.
  ```javascript
  return Sentry.startSpan(
    { op: 'http.client', name: `GET /api/users/${userId}` },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      return response.json();
    }
  );
  ```
- Use the shared `logger` helpers for structured logging and prefer `logger.fmt` when injecting variables; e.g., `logger.debug(logger.fmt`Cache miss for user: ${userId}`)` or `logger.error('Failed to process payment', { orderId, amount })`.

## 16. Auto-Commit at End of Job (REQUIRED)

All AI agents **MUST** commit their work at the end of every job/task. This ensures no work is lost and maintains a clean audit trail.

### Rules

1. **Always commit before ending a session:**
   - After completing a task, stage and commit all changes.
   - Use conventional commit format: `[feat|fix|chore]: <description>`.
   - Keep commit messages concise but descriptive.

2. **Commit command sequence:**
   ```bash
   git add -A
   git commit -m "[type]: <description>"
   ```

3. **When to commit:**
   - At the end of every completed task.
   - Before switching to a different task.
   - Before ending a conversation/session.
   - After any significant milestone within a larger task.

4. **Commit message format:**
   - `feat:` for new features or enhancements.
   - `fix:` for bug fixes.
   - `chore:` for maintenance, refactors, docs, or config changes.
   - Include ticket/issue number if available: `[feat]: add user avatar (#123)`.

5. **Do NOT commit if:**
   - The code is in a broken state (fails typecheck/lint).
   - You are explicitly told not to commit.
   - The changes are exploratory/experimental and the user hasn't approved them.

6. **Push policy:**
   - Commit locally at minimum.
   - Push to remote only if on a feature branch (never push directly to `main` or `production`).
   - Ask before pushing if uncertain about branch state.

### Example End-of-Job Flow

```bash
# 1. Verify changes are valid
pnpm typecheck && pnpm lint

# 2. Stage all changes
git add -A

# 3. Commit with conventional message
git commit -m "feat: add skeleton loaders for auth screens"

# 4. (Optional) Push if on feature branch
git push origin feat/auth-skeleton-loaders
```

**Failure to commit at end of job is a violation of agent protocol.**
