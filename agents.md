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

### 6. Homepage Optimization Guardrails (Marketing)

- The marketing homepage **must stay static/ISR**: no `headers()`, `cookies()`, `fetch` with `no-store`, or per-request data/nonce in `app/(marketing)` pages/layouts.
- `app/layout.tsx` must not read per-request headers for marketing; theme init belongs in static `/public/theme-init.js` (no nonce).
- Middleware (`proxy.ts`) should only issue CSP nonces for app/protected/API paths. Marketing routes must not depend on nonce or geo headers for rendering.
- Homepage “See It In Action” must not hit the database during SSR; use cached data or static fallbacks.
- Cookie banner remains client-driven (localStorage + server cookie write) without server-provided `x-show-cookie-banner` headers.

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

### React/Next.js

- Functional components with hooks only
- Server Components by default, Client Components when needed
- Use `'use client'` directive sparingly and intentionally

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
| `import { withTransaction } from '@/lib/db'` | `import { neon } from '@neondatabase/serverless'` |
| Use `db.query.*` or `db.select()` | Direct SQL strings outside lib/db |

The project uses `@neondatabase/serverless` with connection pooling (WebSocket-based). The `lib/db/client.ts` is a legacy HTTP-based client - do not use it.

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

### Styling

- Tailwind utility classes only (no custom CSS unless necessary)
- Follow existing design tokens in `tailwind.config.ts`
- Mobile-first responsive design

### Testing

- Unit tests: Vitest with jsdom
- E2E tests: Playwright
- Focus on user behavior, not implementation details

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
