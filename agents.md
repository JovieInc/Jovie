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
