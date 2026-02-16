# AI Agent Guidelines for Jovie

> **This file is the canonical source for all AI agent rules, engineering guardrails, and architecture guidance.**

---

## CRITICAL: Tooling Requirements (READ FIRST)

**STOP AND VERIFY BEFORE RUNNING ANY COMMANDS.**

| Tool | Required Version | Enforcement |
|------|------------------|-------------|
| **Node.js** | **24.x** (24.0.0+) | `.nvmrc`, `package.json` engines |
| **pnpm** | **9.15.4** (exact) | `package.json` packageManager field |
| **Turbo** | 2.7.4+ | Root devDependencies |

### Why This Matters

AI agents frequently default to Node 18/20/22 which **will fail** or cause subtle issues. The entire CI/CD pipeline, build system, and runtime are configured for Node 24.

### Pre-Flight Checklist (Run Before Any Task)

```bash
# 1. Verify Node version - MUST be 24.x
node --version  # Expected: v24.0.0 or higher

# 2. Verify pnpm version - MUST be 9.15.4
pnpm --version  # Expected: 9.15.4

# 3. If wrong version, fix it:
nvm use 24       # or: nvm install 24
corepack enable && corepack prepare pnpm@9.15.4 --activate
```

### Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `npm install` | `pnpm install` |
| `yarn add` | `pnpm add` |
| `npx turbo ...` | `pnpm turbo ...` |
| Running turbo from wrong directory | Always run from repo root |
| `cd apps/web && pnpm dev` | `pnpm --filter web dev` (from root) |
| `node script.js` with Node < 24 | Verify `node --version` first |

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

# Database (web app specific)
pnpm --filter web drizzle:generate   # Generate migrations
pnpm --filter web drizzle:migrate    # Apply migrations
pnpm --filter web drizzle:studio     # Open Drizzle Studio
```

---

## Hard Guardrails (Enforced by Hooks)

These rules are enforced by `.claude/hooks/` and will **block your changes** if violated:

### 1. Migration Files Are Immutable

- **NEVER** edit files in `drizzle/migrations/`
- **NEVER** delete or rename migration files
- To fix a migration issue: create a NEW migration

### 2. No Direct middleware.ts Creation

- `middleware.ts` requires careful review
- Propose changes via PR description, don't create directly

### 3. No biome-ignore Comments

- **NEVER** add `// biome-ignore` comments to bypass linting
- Fix the underlying issue instead
- If truly necessary, discuss with maintainers first

### 4. Conventional Commits Required

```bash
# Format: type(scope): description
feat(auth): add password reset flow
fix(dashboard): resolve chart rendering issue
refactor(api): simplify user endpoint logic
docs(readme): update setup instructions
```

### 5. Scan for Similar Bugs

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

### 6. Marketing Pages Must Be Fully Static

- All marketing, blog, and legal pages **must be fully static** (`export const revalidate = false`): no `headers()`, `cookies()`, `fetch` with `no-store`, or per-request data/nonce in `app/(marketing)` and `app/(dynamic)/legal` pages/layouts.
- `app/layout.tsx` must not read per-request headers for marketing; theme init belongs in static `/public/theme-init.js` (no nonce).
- Middleware (`proxy.ts`) should only issue CSP nonces for app/protected/API paths. Marketing routes must not depend on nonce or geo headers for rendering.
- Homepage "See It In Action" must not hit the database during SSR; use static `FALLBACK_AVATARS` only.
- Blog and changelog pages must be fully static, reading content from filesystem at build time only.
- Cookie banner remains client-driven (localStorage + server cookie write) without server-provided `x-show-cookie-banner` headers.
- Public profiles (`/[username]`) use ISR (1h revalidate) for real-time updates, with cache tag invalidation for instant profile updates.

**Why:** Fully static marketing pages eliminate cold start 500 errors, reduce Vercel costs (no serverless invocations), and provide instant TTFB (<100ms from CDN).

### 7. Global UI Components Render Once

Global UI elements must only render in root `app/layout.tsx`:
- Cookie banners
- Toast providers
- Modal providers
- Analytics scripts

**NEVER** render these in individual pages or nested layouts—causes duplicate overlapping UI elements.

---

## Pre-PR Checklist (required before opening any PR)

1. **Run `/verify`** - Self-verification: typecheck, lint, tests, security checks
2. **Run `/simplify`** - Simplify recently modified code for clarity
3. **Enable automerge** with squash:
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
| Runtime | Node.js 24 |

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
- Use `/verify` or `/ship` commands which include typecheck as part of their validation
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

The project uses `@neondatabase/serverless` with the HTTP driver and Neon's built-in connection pooling. The `lib/db/client.ts` is a legacy HTTP-based client - do not use it.

**Transaction Restrictions (Neon HTTP Driver):**
- **NEVER** use `db.transaction()` - Neon HTTP driver does not support interactive transactions
- For atomicity, use Drizzle's batch operations: `db.insert().values([...items])`
- If you need true ACID transactions, document the requirement and discuss alternatives

**Forbidden Database Patterns:**
| Forbidden                          | Why                               | Alternative                            |
| ---------------------------------- | --------------------------------- | -------------------------------------- |
| `db.transaction(async (tx) => ...)` | Neon HTTP driver incompatible     | Sequential operations or batch insert  |
| `import { Pool } from 'pg'`        | Manual pooling conflicts with Neon | Use `import { db } from '@/lib/db'`   |
| `import pg from 'pg'`              | Direct postgres driver            | Use `import { db } from '@/lib/db'`   |
| `new Pool()` or `pool.connect()`   | Manual connection management      | Use `import { db } from '@/lib/db'`   |
| Loop with individual `db.insert()` | O(N) database operations          | `db.insert().values([...items])` batch |

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
Use presets from `lib/queries/cache.ts` for consistency:
- `STABLE_CACHE` - for data that rarely changes (user profile, billing status)
- `DYNAMIC_CACHE` - for frequently updated data (notifications, real-time feeds)

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

### Testing

- Unit tests: Vitest with jsdom
- E2E tests: Playwright
- Focus on user behavior, not implementation details

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
```
## Cost Impact
- **External API calls**: ~X calls/day to [Service] (X calls/run × Y runs/day)
- **Monthly projection**: ~X calls/month at current user count
- **Scaling factor**: O(1) / O(users) / O(records) per run
- **Monthly cost estimate**: $X based on [pricing tier]
```

---

## General Agent Decision-Making Rules

### You Don't Know What You Don't Know

AI agents confidently make decisions about topics they have zero context on. These rules exist to prevent that.

1. **Don't architect what you don't understand.** If you're unsure about the billing model, pricing tiers, API rate limits, or infrastructure costs of a service, ASK before building. "I'll just add a cron job" is not a low-risk default — it has real operational and financial consequences.

2. **Prefer boring, proven patterns.** The existing codebase has established patterns for webhooks, job queues, caching, and API integration. Use them. Don't invent new patterns for solved problems.

3. **Scope your changes to what was asked.** If the task is "add a field to the user profile," don't also refactor the database client, add a reconciliation job, or restructure the API layer. Do the thing that was asked and nothing more.

4. **When adding integrations, read the provider's docs on webhooks first.** Almost every SaaS provider (Stripe, Clerk, Resend, Vercel, etc.) has webhook support. Check for it before building a polling solution.

5. **Never silently add recurring costs.** Cron jobs, API polling, scheduled tasks, and external service calls all cost money. If your change will run repeatedly in production, say so in the PR description with volume estimates.

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
nvm install 24 && nvm use 24
# Or check .nvmrc: cat .nvmrc
```

### "Turbo cache issues"
```bash
pnpm turbo clean
rm -rf node_modules/.cache
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

**Remember: When in doubt, verify your Node version (`node --version`) and use pnpm from the repository root.**
