# Agents Guide (Jovie)

This file defines how AI agents (Claude, Codex, Copilot, etc.) work in this repo so we ship fast while keeping `main` clean.

## Core rules (read this first)

- **Work style:** One user-visible outcome per PR, keep scope tight, keep changes reversible.
- **Branches:** Create feature branches from `main` (`feat/…`, `fix/…`, `chore/…`). Never push directly to `main`.
- **Protected repo settings:** Never modify repository settings, branch protection rules, or `.github/rulesets/*`.
- **Domains:** Multi-domain setup. Public profiles live on `jov.ie`; marketing/app/auth live on `meetjovie.com`.
- **Middleware entrypoint:** Do not create `middleware.ts`. This repo uses `apps/web/proxy.ts` and enforces it via `pnpm next:proxy-guard`.
- **Runtime:** Edge for latency-sensitive public reads; Node for Stripe and Node-only libraries. Never import Node-only deps into Edge code.
- **DB access:** Use `@/lib/db` helpers; do not invent new DB clients.
- **DB migrations:** Generate via `pnpm --filter=@jovie/web run drizzle:generate`. Treat migrations as append-only once merged to `main`.
- **Feature flags & analytics:** Use the existing wrappers/systems (`apps/web/lib/flags/*`, `apps/web/lib/analytics/*`). Do not add new analytics SDKs.
- **UI conventions:** Prefer Server Components; add `'use client'` only when needed. Use `next/link`, `next/image`, and `next/font`.
- **Tailwind:** Treat Tailwind config as locked. If you touch styling infra, run `pnpm --filter=@jovie/web run tailwind:check`.
- **Icons:** UI icons via `apps/web/components/atoms/Icon.tsx` (`lucide-react`). Social/brand icons via `apps/web/components/atoms/SocialIcon.tsx` (`simple-icons`).

## Runbooks and source-of-truth links

- **Auth/routing/runtime:** `docs/AUTH_ROUTING_RUNTIME.md`
- **Database + migrations:** `docs/DB_MIGRATIONS.md`
- **Tailwind lockdown:** `docs/TAILWIND_LOCKDOWN.md`
- **Feature gates registry:** `docs/STATSIG_FEATURE_GATES.md`
- **AI automation:** `docs/AI_AUTOMATION.md`
- **CI/CD flow:** `.github/CI_CD_FLOW.md`
- **Branch protection (human-owned):** `.github/BRANCH_PROTECTION.md`

## 5.1 Claude Code Hooks (Automated Guardrails)

Claude Code uses hooks to automatically enforce code quality and prevent common mistakes:

### Active Hooks

**PreToolUse Hooks** (run before file operations/bash commands):
- **bash-safety-check.sh**: Blocks dangerous commands (force push to main, rm -rf /, publishing)
- **file-protection-check.sh**: Enforces HARD GUARDRAILS:
  - Prevents modification of Drizzle migrations (append-only)
  - Blocks creation of `middleware.ts` (must use `proxy.ts`)
  - Rejects `biome-ignore` suppressions

**PostToolUse Hooks** (run after file operations):
- **biome-formatter.sh**: Auto-formats TypeScript/JavaScript files with Biome after every edit

### Hook Behavior

- Hooks run automatically on every relevant tool use
- Blocked operations display clear error messages with guidance
- Auto-formatting happens silently after edits
- Hooks have short timeouts (5-30s) to avoid blocking workflow

### Configuration

Hooks are configured in `.claude/settings.json` and implemented in `.claude/hooks/`.

To temporarily disable hooks for testing:
```bash
export CLAUDE_HOOKS_DISABLED=1
```

## 6. Agent-Specific Notes

- **Claude (feature work, refactors)**

  - Own end-to-end changes: schema → backend → UI → tests.
  - Prefer server components and feature-flagged rollouts.
  - Always use Statsig for feature gates/experiments; do not introduce any other flag or analytics SDKs.
  - Claude Code hooks automatically enforce code quality and guardrails (see section 5.1).

- **Codex (CI auto-fix, focused cleanups)**

  - Operates only via the `codex-autofix` workflow.
  - Keeps edits minimal and focused on fixing CI regressions.

- **Copilot / other LLM helpers**
  - Local assistance only; any branch/PR they help produce must still obey this guide.

## 7. Safety & Guardrails

- **No direct dependencies** on analytics/flags outside of the existing Statsig and analytics wrappers in `@/lib` and `@/lib/statsig`.
- **No direct Neon branch management** from agents; always go through CI workflows.
- **No direct pushes** to `main`.
- **HARD GUARDRAIL – Drizzle migrations are immutable:** Treat everything under `drizzle/migrations` as append-only. Do **not** edit, delete, reorder, squash, or regenerate existing migration files for any reason; only add new migrations. If a past migration appears incorrect, stop and escalate to a human instead of attempting an automated fix.
- **HARD GUARDRAIL – Never suppress Biome errors:** Do **not** use `biome-ignore` comments to suppress lint or format errors. Always address the root cause by fixing the code to comply with Biome rules. If a rule seems incorrect, discuss with the team before suppressing. Proper fixes include: using semantic HTML elements, adding proper ARIA roles, refactoring for accessibility, or restructuring code to follow best practices.
- **HARD GUARDRAIL – CI ownership (you touch it, you fix it):** If you work on a branch, you are responsible for making CI pass — even if errors existed before you started. This is non-negotiable.
  - **Before starting work:** Run `pnpm typecheck && pnpm lint` to see current state
  - **If pre-existing errors exist:** Fix them as part of your work, or explicitly flag to the user that the branch has pre-existing failures you cannot resolve
  - **Before committing:** Always verify `pnpm typecheck && pnpm lint` passes
  - **Never say "not my code":** PRs that fail CI block the entire team. If you touched the branch, you own making it green.
  - **Scope creep is acceptable for CI:** Fixing unrelated type/lint errors to unblock CI is always in-scope, even if "outside your task"
- New features ship **behind Statsig flags/experiments** and with **Statsig events** (or equivalent Statsig metrics) for primary actions.

## 8. Engineering Guardrails & Architecture

### 8.1 Component Architecture (Atomic)

- **One component per file.** Named export only; no default exports. Export name must match file name.
- **Atoms:** UI-only primitives (no business logic, no API calls), usually under `components/atoms/`.
- **Molecules:** Small combinations of atoms with minimal state, under `components/molecules/`.
- **Organisms:** Self-contained sections that can own state and feature logic, under `components/organisms/`.
- **Feature directories:** Use `components/<feature>/...` for domain-specific components that aren't widely reused.
- **Props:** Interface named `<ComponentName>Props`; children typed as `React.ReactNode`.
- **A11y & testing:** Add appropriate `aria-*` attributes; see section 8.1.1 for `data-testid` requirements.
- **forwardRef:** Use `React.forwardRef` for DOM atoms/molecules and set `Component.displayName`.
- **Deprecation:** Mark old components with `/** @deprecated Reason */` and point to the replacement.

#### 8.1.1 data-testid Strategy

**Philosophy:** Selective and purposeful, not exhaustive. Add `data-testid` when tests need stable selectors that accessibility-based selectors (`getByRole`, `getByLabelText`) cannot reliably provide.

**Requirements by component tier:**

| Tier | Requirement | Guidance |
|------|-------------|----------|
| **Organisms** | **REQUIRED** | Root element + major interactive areas (forms, buttons, key sections) |
| **Molecules** | **RECOMMENDED** | Add when used in E2E tests or critical flows (auth, checkout, onboarding) |
| **Atoms** | **OPTIONAL** | Accept via props (`data-testid?: string`), add only when a test needs it |

**When to add `data-testid`:**
- Critical user paths: checkout, auth, onboarding
- Dynamic/repeated content: list items, cards, table rows
- Conditional UI: elements that appear/disappear based on state
- E2E smoke test entry points

**When to skip `data-testid`:**
- Semantic HTML elements: prefer `getByRole('button')`, `getByLabelText('Email')`
- Static content: use `getByText('Welcome')` for headings/paragraphs
- One-off elements with clear accessibility selectors

**Naming convention:** `kebab-case`, descriptive of purpose
```
✅ data-testid="profile-save-button"
✅ data-testid="onboarding-step-2"
✅ data-testid="link-item-{id}"
❌ data-testid="btn1"
❌ data-testid="ProfileSaveButton"
```

**Just-in-time approach:** When writing an E2E test and you cannot reliably select an element with accessibility selectors, that's when you add the `data-testid` to the component. This keeps them purposeful and maintained.

**Component completion checklist update:**
- [ ] If organism: `data-testid` on root and key interactive areas
- [ ] If touched by E2E test: stable `data-testid` selectors added
- [ ] Accessibility: semantic HTML, proper ARIA attributes

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
- **Tailwind v4 Syntax (REQUIRED):** Use modern shorthand syntax:
  - `z-100` not `z-[100]` (arbitrary z-index)
  - `shrink-0` not `flex-shrink-0`
  - `bg-linear-to-r` not `bg-gradient-to-r`
  - `border-(--var-name)` not `border-[var(--var-name)]` (CSS variable references)
  - `bg-black!` not `!bg-black` (important modifier is postfix)
  - `hover:bg-gray-800!` not `hover:!bg-gray-800`
- **Headless UI:** Prefer `@headlessui/react` and `@floating-ui/*` for dialogs, menus, sheets, tooltips, and popovers.
- **Billing:** Stripe (`stripe` on server, `@stripe/stripe-js` on client); no Clerk Billing.
- **Analytics & flags:** Statsig-only for product analytics and feature flags; do not add PostHog/Segment/RudderStack.
- **Icons:** Use **Lucide React only** (`lucide-react`). Do not use Heroicons, Simple Icons (except for brand logos via `SocialIcon`), or other icon libraries. Import icons directly (e.g., `import { Check, X } from 'lucide-react'`) and use the `<Icon name="..." />` wrapper component for dynamic icon names.
- **URL State:** Use **nuqs** (`nuqs`) for type-safe URL search params state management. See section 8.4 for detailed usage.
- **File Uploads:** Use the existing custom upload implementation (`useAvatarUpload`, `AvatarUploadable`) for avatar uploads. For future multi-file uploads, prefer **React Dropzone** (`react-dropzone`) over Uppy unless you need resumable uploads or cloud imports.
- **State Management:** Use `useState` + React Context for local/shared state. Do not add Zustand, Jotai, or Redux — RSC handles server data, URL state handles shareable state, and context covers the rest.

### 8.4 URL State Management (nuqs)

Use `nuqs` for all URL search params state management. This provides type-safe, reactive URL state with automatic serialization.

**When to use nuqs:**
- Pagination (page, pageSize)
- Sorting (sort field, direction)
- Filtering and search queries
- Tab/view selection that should be shareable via URL
- Any state that should persist across page refreshes or be shareable

**When NOT to use nuqs:**
- One-time reads on page load (e.g., redirect URLs)
- Form state that doesn't belong in the URL
- Temporary UI state (modals open/close without URL persistence)

**Server Component Usage:**

```typescript
import type { SearchParams } from 'nuqs/server';
import { adminCreatorsSearchParams } from '@/lib/nuqs';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { page, pageSize, sort, q } = await adminCreatorsSearchParams.parse(searchParams);
  // Use type-safe params
}
```

**Client Component Usage:**

```typescript
'use client';
import { useTableParams } from '@/lib/nuqs';

function DataTable() {
  const [{ page, sort, direction }, { setPage, toggleSort }] = useTableParams({
    defaultPageSize: 20,
    defaultSort: 'createdAt',
    defaultDirection: 'desc',
  });
  // Reactive URL state with type-safe updates
}
```

**Key files:**
- `lib/nuqs/search-params.ts` - Server-side parsers and cache definitions
- `lib/nuqs/hooks.ts` - Client-side hooks (usePaginationParams, useSortParams, useTableParams)
- `lib/nuqs/index.ts` - Re-exports for convenience
- `components/providers/NuqsProvider.tsx` - NuqsAdapter wrapper (included in ClientProviders)

**Anti-patterns to avoid:**
- ❌ Manual URLSearchParams manipulation with `useRouter().push()`
- ❌ Using `useSearchParams()` directly for state that changes frequently
- ❌ Duplicating param parsing logic across components
- ❌ String-based param parsing without type validation

## 9. Runtime, Auth, Database & RLS

- **Runtime Modes (Vercel)**

- **Auth (Clerk)**

- **Database (Neon + Drizzle)**

- **Postgres RLS Pattern**
- Import server helpers (e.g., `auth`) from `@clerk/nextjs/server` and client hooks/components from `@clerk/nextjs`.
- Ensure Clerk environment and allowed frontend URLs are configured for preview and production domains.

#### 9.2.0 Auth Decision Path (CRITICAL)

**GOLDEN RULE: There must be exactly ONE canonical "am I authed?" decision path, and it must behave identically in Edge + Server runtimes.**

- **Single source of truth:** All auth decisions flow through `lib/auth/gate.ts` → `resolveUserState()`
- **Edge + Server compatible:** `resolveUserState()` uses only Edge-compatible APIs (no Node.js dependencies)
- **Database-driven authorization:** Clerk provides authentication (who you are), database determines authorization (what you can access)
- **Never duplicate auth logic:** Do NOT create separate auth checks in middleware, layouts, or components
- **Consistent state enum:** Use `UserState` enum (UNAUTHENTICATED, NEEDS_DB_USER, NEEDS_ONBOARDING, ACTIVE, etc.) everywhere

**Anti-patterns to avoid:**
- ❌ Checking `auth()` in one place and `currentUser()` in another
- ❌ Different auth logic in middleware vs. layouts
- ❌ Client-side auth checks that diverge from server-side
- ❌ Hardcoded redirect URLs scattered across codebase
- ❌ Conditional auth flows based on runtime (Edge vs. Node)

**Correct pattern:**
```typescript
// Server-side (RSC, API routes, middleware)
import { resolveUserState, canAccessApp } from '@/lib/auth/gate';

const authResult = await resolveUserState();
if (!canAccessApp(authResult.state)) {
  redirect(authResult.redirectTo!);
}
```

#### 9.2.0.1 Redirect Protocol (CRITICAL)

**GOLDEN RULE: Redirects must respect x-forwarded-proto / canonical host, and you should NOT be dynamically inventing callback URLs in multiple places.**

- **Single redirect URL builder:** Use `lib/auth/redirect.ts` helper for ALL redirect URL construction
- **Protocol awareness:** Respect `x-forwarded-proto` header in production (HTTPS), localhost in dev
- **Canonical host:** Use environment variable `NEXT_PUBLIC_APP_URL` as single source of truth
- **Never hardcode URLs:** Do NOT create callback URLs like `/signin/sso-callback` in multiple places
- **Middleware compatibility:** Redirect URLs must work in Edge runtime (no Node.js dependencies)

**Anti-patterns to avoid:**
- ❌ `redirectUrl: '/signup/sso-callback'` hardcoded in OAuth flow
- ❌ `new URL('/callback', 'https://meetjovie.com')` scattered across files
- ❌ Different callback URLs in `useSignInFlow.ts` vs. `useSignUpFlow.ts`
- ❌ HTTP redirects in production (must use HTTPS)
- ❌ Localhost redirects in production deployments

**Correct pattern:**
```typescript
import { buildRedirectUrl } from '@/lib/auth/redirect';

// OAuth flow
const redirectUrl = buildRedirectUrl('/signin/sso-callback');
const redirectUrlComplete = buildRedirectUrl('/app/dashboard/overview');

await signIn.authenticateWithRedirect({
  strategy: 'oauth_google',
  redirectUrl,           // Uses canonical host + protocol
  redirectUrlComplete,   // Uses canonical host + protocol
});
```

#### 9.2.0.2 Onboarding Gating (CRITICAL)

**GOLDEN RULE: Onboarding gating should be one-directional and resilient.**

**Principle:**
- **One-way gate:** Signed in but not onboarded → ALWAYS land on onboarding until done
- **Data independence:** Onboarding routes must NOT depend on data that is only created at the end
- **Fresh signup detection:** Use `?fresh_signup=true` flag to prevent redirect loops
- **DB user creation timing:** Create DB user record BEFORE redirecting to onboarding (not after)

**Anti-patterns to avoid:**
- ❌ Onboarding page checks if user has `dbUserId`, but `dbUserId` is only created after onboarding
- ❌ Redirect loop: onboarding → check DB → no record → back to auth → onboarding → ...
- ❌ Different onboarding entry points (OAuth vs. email OTP) with inconsistent state
- ❌ Onboarding completion check depends on data created in final step
- ❌ Missing `fresh_signup=true` flag on OAuth callback redirects

**Correct pattern:**
```typescript
// In auth gate (lib/auth/gate.ts)
if (!profile) {
  return {
    state: UserState.NEEDS_ONBOARDING,
    redirectTo: '/onboarding?fresh_signup=true', // ✅ Flag prevents loop
    clerkUserId,
    dbUserId, // ✅ DB user already created by this point
  };
}

// In onboarding page
const isFreshSignup = searchParams.get('fresh_signup') === 'true';
if (!authResult.dbUserId && !isFreshSignup) {
  // ✅ Detect redirect loop - user shouldn't be here
  return <ErrorPage message="Redirect loop detected" />;
}
```

**Required flow for new users:**
1. User completes OAuth or email OTP authentication
2. Auth gate detects no profile exists
3. Auth gate **creates DB user record** with retry logic
4. Auth gate redirects to `/onboarding?fresh_signup=true`
5. Onboarding page verifies `dbUserId` exists OR `fresh_signup=true` flag is set
6. User completes onboarding steps
7. Profile creation marks onboarding as complete
8. Future requests pass `canAccessApp()` check

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
- Keep Neon branches tidy: main branch for production + ephemeral branches per PR created/destroyed via CI.
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
  Sentry.startSpan({ op: "ui.click", name: "Test Button Click" }, (span) => {
    span.setAttribute("config", value);
    span.setAttribute("metric", metric);
    doSomething();
  });
  ```
- Wrap API requests similarly so the span describes the route and HTTP operation when calling fetchers.
  ```javascript
  return Sentry.startSpan(
    { op: "http.client", name: `GET /api/users/${userId}` },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      return response.json();
    }
  );
  ```
- Use the shared `logger` helpers for structured logging and prefer `logger.fmt` when injecting variables; e.g., `logger.debug(logger.fmt`Cache miss for user: ${userId}`)` or `logger.error('Failed to process payment', { orderId, amount })`.

## 16. Auto-Commit at End of Job (REQUIRED)

All AI agents **MUST** commit their work at the end of every job/task. This ensures no work is lost and maintains a clean audit trail.

**CRITICAL: Commit messages MUST follow the Conventional Commits format** (enforced by commitlint via husky). Invalid commit messages will be rejected.

### Rules

1. **Always commit before ending a session:**

   - After completing a task, stage and commit all changes.
   - Use conventional commit format: `type: subject` or `type(scope): subject`.
   - Keep commit messages concise but descriptive.

2. **Commit command sequence:**

   ```bash
   git add -A
   git commit -m "type: subject"
   ```

3. **When to commit:**

   - At the end of every completed task.
   - Before switching to a different task.
   - Before ending a conversation/session.
   - After any significant milestone within a larger task.

4. **Commit message format (Conventional Commits):**

   - **Format:** `type(scope): subject`
     - `type` is required (lowercase, no brackets)
     - `scope` is optional (lowercase, in parentheses)
     - `subject` is required (lowercase, imperative mood, no period)
   - **Types:**
     - `feat:` for new features or enhancements
     - `fix:` for bug fixes
     - `chore:` for maintenance, refactors, docs, or config changes
     - `refactor:` for code refactoring without feature changes or bug fixes
     - `docs:` for documentation changes
     - `style:` for formatting, missing semicolons, etc. (no code change)
     - `test:` for adding or updating tests
     - `perf:` for performance improvements
   - **Subject rules:**
     - Use lowercase (except for proper nouns)
     - Use imperative mood ("add" not "added" or "adds")
     - No period at the end
     - Keep it under 72 characters when possible
   - **Body rules (if including a body):**
     - Each line must not exceed 100 characters (enforced by commitlint)
     - Wrap long lines to stay within the limit
     - Use blank line to separate body from subject
   - **Examples:**

     - ✅ `feat: add skeleton loaders for auth screens`
     - ✅ `fix(auth): resolve login redirect issue`
     - ✅ `chore: update cursor rules for commit messages`
     - ✅ `feat(dashboard): add user avatar component (#123)`
     - ✅ Commit with body (lines ≤ 100 chars):

       ```
       chore: update agent guidelines and commit message format

       - Clarify AI agent restrictions on merging PRs to production
       - Update commit message format to follow Conventional Commits
       - Enhance documentation on feature flag creation
       ```

     - ❌ `[feat]: add skeleton loaders` (brackets not allowed)
     - ❌ `feat: Added skeleton loaders` (not imperative)
     - ❌ `feat: Add skeleton loaders.` (period not allowed)
     - ❌ Body line too long:
       ```
       - Clarify AI agent restrictions on merging PRs to production and modifying repository settings.
       ```
       (exceeds 100 characters)

5. **Do NOT commit if:**

   - The code is in a broken state (fails typecheck/lint).
   - You are explicitly told not to commit.
   - The changes are exploratory/experimental and the user hasn't approved them.

6. **Push policy:**
   - Commit locally at minimum.
   - Push to remote only if on a feature branch (never push directly to `main`).
   - Ask before pushing if uncertain about branch state.

### Example End-of-Job Flow

```bash
# 1. Verify changes are valid
pnpm typecheck && pnpm lint

# 2. Stage all changes
git add -A

# 3. Commit with conventional message (will be validated by commitlint)
# Simple commit (subject only):
git commit -m "feat: add skeleton loaders for auth screens"

# Or with body (wrap body lines to ≤ 100 characters):
git commit -m "chore: update agent guidelines

- Clarify AI agent restrictions on merging PRs
- Update commit message format to follow Conventional Commits
- Enhance documentation on feature flag creation"

# 4. (Optional) Push if on feature branch
git push origin feat/auth-skeleton-loaders
```

**Failure to commit at end of job is a violation of agent protocol.**
**Commit messages that don't follow Conventional Commits format will be rejected by husky/commitlint.**

## 17. Tech Debt Tracking (REQUIRED)

AI agents **must** maintain the tech debt tracker at `TECH_DEBT_TRACKER.md` in the repo root.

### When to Update the Tracker

**You MUST update `TECH_DEBT_TRACKER.md` when:**

1. **Fixing tech debt:** Move items from "Open Issues" to "Resolved Issues"
2. **Discovering new tech debt:** Add items to the appropriate "Open Issues" section
3. **Completing refactoring tasks:** Update the metrics dashboard

### How to Update

**When resolving an issue:**

```markdown
## Resolved Issues

### YYYY-MM-DD

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| Description of what was fixed | P0/P1/P2/P3 | Brief explanation | PR or commit ref |
```

**When discovering new tech debt:**

```markdown
### P1 - High (or appropriate priority)

| File | Line(s) | Description |
|------|---------|-------------|
| path/to/file.ts | 42 | What the issue is |
```

### Priority Definitions

- **P0 (Critical):** Blocks production, security vulnerabilities, data loss risks
- **P1 (High):** Significant code quality issues, type safety problems
- **P2 (Medium):** Deprecated code, TODO comments, minor improvements
- **P3 (Low):** Nice-to-have cleanup, test organization

### What Constitutes Tech Debt

Track these items in `TECH_DEBT_TRACKER.md`:

- `@ts-nocheck` or `@ts-ignore` without clear justification
- Empty catch blocks
- `console.*` statements in production code (use Sentry instead)
- Files marked `@deprecated` without migration path
- TODO/FIXME/HACK comments
- TypeScript `any` types in production code
- eslint-disable without justification
- Large files (>500 lines) that should be split
- Duplicated code patterns

### Metrics to Track

Update the metrics dashboard when counts change:

```markdown
| Metric | Count | Target | Last Updated |
|--------|-------|--------|--------------|
| `@ts-nocheck` files | X | 0 | YYYY-MM-DD |
| `@ts-ignore` in production | X | <5 | YYYY-MM-DD |
| Deprecated files | X | 0 | YYYY-MM-DD |
| TODO comments | X | 0 | YYYY-MM-DD |
| Empty catch blocks | X | 0 | YYYY-MM-DD |
```

**Failure to update the tech debt tracker when addressing or discovering tech debt is a violation of agent protocol.**

</details>
