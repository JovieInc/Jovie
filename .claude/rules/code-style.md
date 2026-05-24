# Code Style

TypeScript, React/Next.js, server/client boundaries, canonical imports, ESLint rules, hook patterns.

## Tech Stack

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

## TypeScript

- Strict mode enabled — no `any` types without justification.
- Use proper interfaces for all data structures.
- Prefer `unknown` over `any` for truly unknown types.

**Typecheck Gate (Mandatory):**
- **ALWAYS** run `pnpm turbo typecheck` before pushing any branch or creating a PR.
- If typecheck fails, fix all errors before pushing — do not push with known type errors.
- Use `/ship` which includes typecheck as part of its validation.
- The CI pipeline will block merges on type errors, but catching them locally is faster.

**Null Safety for String Methods:**
- Always guard against null/undefined before calling string methods.
- Common offenders: `.replaceAll()`, `.toLowerCase()`, `.split()`, `.trim()`.

```typescript
// WRONG: Will throw TypeError if title is undefined
const slug = title.replaceAll(' ', '-');

// CORRECT: Guard with optional chaining or nullish coalescing
const slug = title?.replaceAll(' ', '-') ?? '';
```

**Cross-Environment Globals:**
- Use `globalThis` instead of `window` or `global` where applicable.
- `window` fails in SSR/Node, `global` fails in browser.
- Note: `globalThis.location` is still `undefined` in Node.js SSR — SSR guards are required.

| Wrong | Correct |
| --- | --- |
| `window.location` (no guard) | `typeof window !== 'undefined' ? window.location : undefined` |
| `global.fetch` | `globalThis.fetch` |

## React / Next.js

- Functional components with hooks only.
- Server Components by default, Client Components when needed.
- Use `'use client'` directive sparingly and intentionally.

### Component Definition Rules

- **NEVER** define components inline (inside other components or render functions).
- Inline components are recreated every render, breaking React reconciliation and causing performance issues.
- Extract all components to module scope or separate files.

| Wrong | Correct |
| --- | --- |
| `const columns = [{ cell: () => <Button /> }]` | Extract: `const ActionCell = () => <Button />` then use `cell: ActionCell` |
| `{items.map(i => { const Item = () => ... })}` | Define `Item` outside the parent component |

### Route Constants

- **NEVER** hardcode route paths like `/app/dashboard/audience`.
- **ALWAYS** import from `constants/routes.ts`: `APP_ROUTES.AUDIENCE`.
- This prevents broken URLs from path typos and enables safe refactoring.
- Legacy compatibility paths still need named constants. If a redirect intentionally targets an old `/app/dashboard/*` route, add a constant for that legacy path instead of embedding the literal.

The `file-protection-check.sh` hook blocks hardcoded dashboard route literals.

## Server/Client Boundaries (Enforced by ESLint)

**Client components MUST have `'use client'`** when using React hooks (useState, useEffect, etc.).

**Server-only modules CANNOT be imported in `'use client'` files:**
- `@/lib/db/*` — Database access
- `@clerk/nextjs/server` — Server-side auth
- `stripe`, `resend` — API clients with secrets
- `drizzle-orm` — ORM queries
- `*.server.ts` files

**Commands:**
- `pnpm --filter web lint:server-boundaries` — Quick check for boundary violations
- `pnpm --filter web lint:eslint` — Full ESLint check

**Error Messages:**
```
# Missing 'use client':
React hook "useState" can only be used in client components.
Add "use client" directive at the top of this file.

# Server import in client:
Server-only import "@/lib/db" cannot be used in client components.
Remove the import or remove "use client" if this should be a server component.
```

## Canonical Imports (Use These Exact Paths)

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

## Data Serialization (Server → Client Boundaries)

**Date objects MUST be serialized** before:
- Caching in Redis (`JSON.stringify` cannot serialize Date)
- Returning from Server Actions / API routes
- Passing from RSC to Client Components

| Wrong | Correct |
| --- | --- |
| `return { createdAt: user.createdAt }` | `return { createdAt: user.createdAt?.toISOString() }` |
| `redis.set(key, JSON.stringify(data))` with Date fields | Convert dates first with `toISOStringOrNull()` helper |
| Drizzle query result directly to client | Map dates: `{ ...row, date: row.date?.toISOString() }` |

**Helper pattern:**

```typescript
const toISOStringOrNull = (date: Date | null | undefined) =>
  date?.toISOString() ?? null;
```

## React Hook Guidelines

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
  return () => sub.unsubscribe();
}, []);

// WRONG: State update during render
if (condition) setState(x);  // Causes infinite loop!
// CORRECT: Use useEffect for conditional state updates
useEffect(() => {
  if (condition) setState(x);
}, [condition]);
```

## TanStack Query Patterns

### Required Configuration

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
  queryFn: () => fetchUser(id),
})
```

### AbortSignal Requirement

- All `queryFn` must destructure and pass `signal` to fetch operations.
- This prevents memory leaks and race conditions on component unmount.
- Without signal, requests continue after navigation, wasting resources.

### Cache Presets

Use presets from `lib/queries/cache-strategies.ts` for consistency:

- `REALTIME_CACHE` — for live data (notifications, active sessions)
- `FREQUENT_CACHE` — for frequently updated data (dashboard stats)
- `STANDARD_CACHE` — for typical data (5 min stale, 30 min gc)
- `STABLE_CACHE` — for slowly changing data (user profile, billing status, feature flags)
- `STATIC_CACHE` — for reference data that rarely changes (categories, platform lists)
- `PAGINATED_CACHE` / `SEARCH_CACHE` — for list/search results

### Disable Aggressive Refetch

For stable data:

```typescript
useQuery({
  ...options,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})
```

## Custom ESLint Rules

12 custom rules in `apps/web/eslint-rules/` run via `pnpm --filter web lint:eslint`. Violations block CI.

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
| `readonly-component-props` | Props interface/type properties without `readonly` modifier | Add `readonly` before each property (auto-fixable) |
| `edge-runtime-node-imports` | `node:fs`, `crypto`, `stripe`, `path`, `stream` in files with `export const runtime = 'edge'` | Remove the Node-only import or remove the Edge runtime declaration |
| `no-direct-electron-bridge` | Direct `window.electronAPI` access (or via `globalThis`/`self`/TS cast) outside `apps/web/lib/desktop/electron-bridge.ts` | Import the guarded wrapper: `import { useDesktopUpdate, isDesktopEnvironment } from '@/lib/desktop/electron-bridge'`. Stale installed binaries may expose a partial bridge — wrappers handle missing methods gracefully + capture Sentry warning. |
| `no-ad-hoc-currency` | Template literals like `$${x.toFixed(2)}` or `$${(x/100).toFixed(2)}` | Import `formatAmount` from `@/lib/utils/format-number` for cent values; `formatUsd` from `@/lib/admin/format` for admin USD values |

**Run:** `pnpm --filter web lint:eslint` (all rules) or `pnpm --filter web lint:server-boundaries` (boundary rules only).

## File Creation Patterns

### New API Route

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

### New Server Action

Location: `apps/web/app/{route}/actions.ts` or `apps/web/lib/actions/{domain}.ts`

```typescript
'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
```

For component patterns, see `.claude/rules/ui.md` → "New Component Pattern".

## Plan Before Executing Complex Tasks

For any task with 3 or more steps, architectural decisions, schema changes, or significant refactors:

- Use plan mode (Shift+Tab twice in Claude Code) to outline the approach.
- Wait for human approval before executing.
- Single-step bug fixes and trivial copy changes do not require plan mode.

## Scan for Similar Bugs

When you discover and fix a bug:

1. **Identify the pattern** — What caused the bug? (wrong import, missing null check, incorrect type, etc.)
2. **Search for siblings** — Use grep/glob to find the same pattern in related files.
3. **Fix all instances** — Don't leave the same bug lurking elsewhere.

```bash
grep -rn "PATTERN_YOU_FIXED" apps/web --include="*.tsx"
```

**Why:** A bug in one file often indicates a systemic issue. Patching one instance while leaving others creates inconsistency and delays future debugging.

## Self-Improvement Loop

After any correction from a human reviewer:

1. **Identify the root cause** — what rule or assumption led to the mistake?
2. **Add a rule** to the relevant `.claude/rules/*.md` file (or skill file) that prevents the same mistake from recurring.
3. **Add a lesson** to `LESSONS.md` with the pattern and fix.
4. **Never repeat the same mistake** — the correction should be the last time that error occurs.

If you realize mid-task that you've made an assumption that turned out wrong, document it immediately without being asked.

### The Shame-on-Me Clause

Fool me once, shame on you. Fool me twice, shame on me. When a bug, regression, or operational gap reaches production AND no test, lint rule, hook, or guardrail caught it, the absence of the guardrail is the real failure — not the bug.

When you find a gap of this shape (e.g. a feature flag shipped without proper Statsig registration, an external service call without a timeout, a public route accidentally rendered SSR), close it in the same workflow:

1. Fix the immediate bug.
2. Identify the smallest test, lint rule, type-level assertion, hook, or CI check that would have caught it. Verify it fails on the buggy state and passes after the fix.
3. Add that guardrail in the same PR (or a tightly-coupled follow-up PR opened in the same session).
4. Do not merge unless the prevention is in place.

Do not ask for permission to add the prevention test. It is not optional, it is the cost of admission. Ship it, review it, land it autonomously.

## Claude Hooks Reference

Hooks in `.claude/hooks/` run automatically on every tool use. You cannot bypass them.

**Pre-execution hooks** (block the operation before it runs):

| Hook | Trigger | What It Blocks | Recovery |
|------|---------|---------------|----------|
| `bash-safety-check.sh` | Before: Bash | `rm -rf /`, force push to main, `npm publish` | Don't run destructive commands |
| `file-protection-check.sh` | Before: Edit/Write | Editing existing migration SQL/snapshots; creating `middleware.ts`; `biome-ignore` comments; hardcoded dashboard route literals; dynamic `revalidate` in marketing pages; global UI singletons in nested layouts | See matching rule file |
| `infra-guardrails-check.sh` | Before: Edit/Write | New cron route files (`app/api/cron/*/route.ts`); `vercel.json` cron changes | Get human approval first |

**Post-execution hooks** (check the result and may block or warn):

| Hook | Trigger | What It Catches | Recovery |
|------|---------|----------------|----------|
| `lint-check.sh` | After: Edit/Write | Biome lint/format errors | Auto-fixes first; fix remaining errors manually |
| `typecheck.sh` | After: Edit/Write | TypeScript errors in modified file | Fix the type error; run `pnpm typecheck` for full output |
| `biome-formatter.sh` | After: Edit/Write | N/A (non-blocking) | Auto-applies `biome check --write` silently |
| `console-check.sh` | After: Edit/Write | `console.log/error/warn/info/debug` in production code | Use `captureError`/`logger` from canonical imports |
| `ts-strict-check.sh` | After: Edit/Write | `any` type in production code (**blocks**); `@ts-ignore` (**warns**) | Use proper types or `unknown`; use `@ts-expect-error` with explanation |
| `file-size-check.sh` | After: Edit/Write | Files exceeding 500 lines (**warns**, skips tests/migrations/generated) | Split into smaller modules by concern |
| `db-patterns-check.sh` | After: Edit/Write | `db.transaction()`, `pg`/`pg-pool` imports, `new Pool()`, `@/lib/db/client` import | Use `import { db } from '@/lib/db'`; batch for atomicity |

**Lifecycle hooks:**

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | Session start | Verifies Node/pnpm versions, installs deps, builds gstack |
| `post-task-validate.sh` | Task completion (Stop) | Blocks completion if typecheck, Biome lint, server boundaries, or affected tests fail |

## Agent Autonomy: When to Ask vs. Just Do It

Compute is infinite. Human decision capacity is finite. Don't waste questions on engineering hygiene — save them for decisions only a human has context on.

### Just do it (never ask)

- **Error handling** — add it everywhere: internal utils, helpers, boundaries, all of it.
- **Edge cases** — handle anything a real user could realistically hit (bad input, network errors, race conditions, concurrent state).
- **Tests** — always write tests for new/changed code, but avoid slop tests or tests for rapidly-changing UI. Follow `.claude/rules/testing.md`.
- **Linting, type fixes, dead code removal** — fix what you touch.
- **Validation, logging, cleanup** — if it makes the code more robust, do it.

### Auto-fix, ask about structural changes (gstack skills)

- `/qa`, `/review`, `/ship` should auto-fix obvious issues (lint, types, small bugs) without asking.
- Ask before structural changes (moving files, changing APIs, refactoring patterns).

### Always ask (genuine human decisions)

- Product/UX decisions (how should this behave for users?)
- Architecture choices (which approach/pattern?)
- Scope changes (should we also tackle X while we're here?)
- Breaking changes or migrations
- New external dependencies or services
- Trade-offs where both options have real downsides

**The principle:** If the upside is obvious and the cost is small (a few minutes of compute), just do it. Save questions for decisions only a human has context on.

## You Don't Know What You Don't Know

AI agents confidently make decisions about topics they have zero context on. These rules exist to prevent that.

1. **Don't architect what you don't understand.** If you're unsure about the billing model, pricing tiers, API rate limits, or infrastructure costs of a service, ASK before building. "I'll just add a cron job" is not a low-risk default — it has real operational and financial consequences.
2. **Prefer boring, proven patterns.** The existing codebase has established patterns for webhooks, job queues, caching, and API integration. Use them. Don't invent new patterns for solved problems.
3. **Scope your changes to what was asked, plus hardening (error handling, edge cases, tests) for code you touch.**
4. **When adding integrations, read the provider's docs on webhooks first.** Almost every SaaS provider has webhook support. Check for it before building a polling solution.
5. **Never silently add recurring costs.** Cron jobs, API polling, scheduled tasks, and external service calls all cost money. If your change will run repeatedly in production, say so in the PR description with volume estimates.
6. **Verify before trusting.** When the user (or another agent's output) states something verifiable — "we use X," "competitor Y doesn't do Z," "this API returns W" — check it. A quick grep, file read, or doc lookup takes seconds. If the claim is wrong, say so clearly. This is how we catch agent drift, stale assumptions, and documentation gaps.

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

## Documentation Index

Reference docs for common agent lookups:

| Doc | Question It Answers |
|-----|---------------------|
| `docs/SCHEMA_MAP.md` | Which schema file defines this table? What are the key relationships? |
| `docs/API_ROUTE_MAP.md` | Does an API endpoint already exist for this? What auth does it need? |
| `docs/CRON_REGISTRY.md` | What scheduled jobs already run? Can I add my logic to an existing one? |
| `docs/WEBHOOK_MAP.md` | Which webhooks handle this provider's events? |
| `docs/LIB_MODULE_INDEX.md` | Which lib module provides the functionality I need? |
| `docs/FEATURE_REGISTRY.md` | What feature flags exist? What are their current states? |
| `docs/DB_MIGRATIONS.md` | How do I create/run migrations? What are the invariants? |
| `docs/TESTING_GUIDELINES.md` | Testing philosophy, patterns, and when to write tests |
| `docs/DOPPLER_SETUP.md` | How to set up and use Doppler for secrets management |
