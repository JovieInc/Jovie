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
