# Agents Guide (Jovie)

This file defines how AI agents (Claude, Codex, Copilot, etc.) work in this repo so we ship fast while keeping `main` clean.

## Core rules (read this first)

### Philosophy: Always Be Shipping 🚀

The guiding principle for all work in this repository is **"Always Be Shipping"**. This means:
- **Bias toward action:** Ship fast, iterate faster. Don't overthink, don't over-engineer.
- **Small, frequent deployments:** One user-visible outcome per PR. Keep scope tight, keep changes reversible.
- **Quality gates without gatekeeping:** Automated checks catch issues; humans ship features.
- **Prototype in production:** Use feature flags to ship incomplete work safely and gather real feedback.
- **Fail fast, learn faster:** CI failures are learning opportunities, not blockers. Fix and move on.

### Core Engineering Rules

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
- **console-check.sh**: Blocks `console.*` statements in production code (use Sentry instead)
- **ts-strict-check.sh**: Blocks explicit `any` types and warns on `@ts-ignore` usage
- **file-size-check.sh**: Warns when files exceed 500 lines

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

### 6.1 Model Selection Policy

**Default Model:** Use Opus 4.5 for tasks requiring architectural decisions or multi-file changes.

| Task Type | Recommended Model | Rationale |
|-----------|-------------------|-----------|
| Complex architecture, multi-file refactors | **Opus 4.5 (thinking)** | Better first-attempt accuracy, less steering |
| Feature development, bug fixes, standard tasks | **Sonnet 4.5** | Good balance of speed and quality |
| Simple edits, formatting, quick fixes | **Haiku** | Fast iteration, cost-efficient |
| Security reviews, critical path changes | **Opus 4.5 (thinking)** | Thoroughness over speed |

**When to use Opus 4.5:**
- Any task requiring >3 file changes
- Architectural decisions or new patterns
- Security-sensitive code (auth, payments, admin)
- Database schema changes
- Performance optimization

**When to use Sonnet:**
- Single-file feature additions
- Bug fixes with clear scope
- Test writing
- Documentation updates

**When to use Haiku:**
- Typo fixes, renames
- Simple formatting changes
- Quick research queries

### 6.2 Plan Mode Workflow (REQUIRED for Complex Tasks)

Use **Plan Mode** (Shift+Tab twice in CLI, or EnterPlanMode tool) before making changes for:

**When to use Plan Mode:**
- Multi-file refactors (>3 files affected)
- Architecture changes (new patterns, state management)
- Database schema changes (migrations, RLS policies)
- Security-sensitive code (auth, payments, admin)
- Performance optimization (caching, rate limiting)
- Unfamiliar areas of codebase

**When to skip Plan Mode:**
- Single-file bug fixes
- Documentation updates
- Test additions to existing files
- Formatting/style changes

**Plan Mode Process:**
1. **Analyze:** Read relevant files, understand existing patterns
2. **Design:** Create implementation plan with concrete steps
3. **Present:** Show plan to user for approval
4. **Clarify:** Use AskUserQuestion if approaches unclear
5. **Execute:** Implement with verification at each step
6. **Verify:** Run `/verify` before marking complete

**Anti-patterns:**
- Starting implementation without understanding existing code
- Making architectural decisions without plan approval
- Skipping plan mode for "quick" multi-file changes

### 6.3 Self-Verification (REQUIRED)

Before marking any task complete, run `/verify` to self-check your work. This 2-3x's code quality.

**Minimum verification steps:**
1. `pnpm turbo typecheck --filter=@jovie/web` - No type errors
2. `pnpm biome check .` - No lint/format errors
3. `pnpm vitest --run --changed` - All tests pass

**For UI changes:** Also verify visually in dev server.
**For security changes:** Also check for OWASP Top 10 vulnerabilities.

## 7. Safety & Guardrails

### 7.1 Permission Strategy

**Pre-approved operations** (no prompt needed):
- Read any file in the repository
- Run typecheck, lint, test commands
- Format code with Biome
- Create feature branches from main
- Run readonly bash commands (ls, cat, grep, git status, git log)

**Requires explicit approval:**
- Write to database (any environment)
- Push to remote (feature branches OK after first push)
- Modify `.github/workflows/` or `.github/rulesets/`
- Run destructive bash commands (rm -rf, force push)
- Modify Drizzle migrations after merge
- Install new dependencies

### 7.2 Core Restrictions

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

### 8.1 Component Architecture (Atomic Design - 2026)

#### Overview

Atomic Design organizes components into a clear hierarchy:
1. **Atoms** - Smallest UI primitives (buttons, inputs, icons)
2. **Molecules** - Simple combinations of atoms (search bar = input + button)
3. **Organisms** - Complex UI sections (navigation header, data table)
4. **Templates** - Page layouts without content (optional in this codebase)
5. **Pages** - Complete pages with real data (Next.js routes)

**Philosophy:** Build reusable components that serve a single purpose. Refactor regularly to improve reusability and consistency.

#### Core Rules

- **One component per file:** Named export only; no default exports. Export name must match file name.
- **Single Responsibility:** Each component should do one thing well
- **Composition over complexity:** Prefer small, composable components over large monoliths
- **TypeScript-first:** All components must have proper type definitions
- **Accessibility-first:** ARIA, semantic HTML, keyboard navigation are non-negotiable

#### Atoms - UI Primitives

**Characteristics:**
- **No business logic:** Pure UI components, no API calls or complex state
- **Highly reusable:** Used across many molecules and organisms
- **Minimal props:** Simple, focused API surface
- **No data fetching:** Never call external services

**Examples:**
- `Button.tsx` - Generic button with variants
- `Input.tsx` - Form input with validation states
- `Icon.tsx` - Icon wrapper for Lucide React
- `Badge.tsx` - Status/label badge
- `Spinner.tsx` - Loading indicator

**Anti-patterns to avoid:**
- ❌ Atoms with `useState` for complex state management
- ❌ Atoms that fetch data or call APIs
- ❌ Atoms with business logic (validation, calculations)
- ❌ Atoms over 100 lines of code

**Best Practices:**
```typescript
// ✅ Good: Simple, focused atom
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }))}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

#### Molecules - Simple Combinations

**Characteristics:**
- **Compose atoms:** Combine 2-3 atoms into functional units
- **Minimal state:** Simple local state only (`useState` for UI state)
- **Single feature:** One clear purpose (e.g., search bar, form field)
- **Reusable patterns:** Used in multiple organisms

**Examples:**
- `SearchBar.tsx` - Input + search icon button
- `FormField.tsx` - Label + input + error message
- `AvatarWithName.tsx` - Avatar + display name
- `CardHeader.tsx` - Title + subtitle + action button

**Anti-patterns to avoid:**
- ❌ Molecules with complex business logic
- ❌ Molecules with API calls or data fetching
- ❌ Molecules with more than 3-4 atoms
- ❌ Molecules over 150 lines of code

**Best Practices:**
```typescript
// ✅ Good: Focused molecule combining atoms
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder }: SearchBarProps) {
  const [query, setQuery] = useState('');

  return (
    <div className="flex gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
      />
      <Button onClick={() => onSearch(query)}>
        <Icon name="search" />
      </Button>
    </div>
  );
}
```

#### Organisms - Complex Sections

**Characteristics:**
- **Self-contained:** Own state, data fetching, business logic
- **Feature-complete:** Can be dropped into pages as-is
- **Compose molecules/atoms:** Build complex UI from smaller parts
- **Domain-aware:** Understand business concepts (users, profiles, etc.)

**Examples:**
- `NavigationHeader.tsx` - App header with menu, auth, notifications
- `DataTable.tsx` - Table with sorting, filtering, pagination
- `ProfileCard.tsx` - User profile display with actions
- `DashboardStats.tsx` - Analytics cards with data fetching

**Anti-patterns to avoid:**
- ❌ Organisms that are just renamed molecules (too simple)
- ❌ Organisms with hardcoded data (should accept props or fetch)
- ❌ Organisms over 500 lines (split into smaller organisms)
- ❌ Organisms without `data-testid` on root element

**Best Practices:**
```typescript
// ✅ Good: Self-contained organism with data fetching
interface ProfileCardProps {
  userId: string;
}

export function ProfileCard({ userId }: ProfileCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId),
  });

  if (isLoading) return <ProfileCardSkeleton />;
  if (!data) return <EmptyState message="Profile not found" />;

  return (
    <Card data-testid="profile-card">
      <CardHeader>
        <AvatarWithName
          avatar={data.avatar}
          name={data.displayName}
        />
        <Button variant="outline" onClick={() => handleFollow()}>
          Follow
        </Button>
      </CardHeader>
      <CardContent>
        <p>{data.bio}</p>
        <SocialLinks links={data.socialLinks} />
      </CardContent>
    </Card>
  );
}
```

#### Feature Directories

Use `components/<feature>/...` for domain-specific components that aren't widely reused.

**Examples:**
- `components/profile/` - Profile-specific components
- `components/dashboard/` - Dashboard-specific components
- `components/onboarding/` - Onboarding flow components

**When to use:**
- Component is only used in one feature/route
- Component has high coupling to feature domain
- Component is unlikely to be reused elsewhere

#### TypeScript Patterns

**Props Interface Naming:**
```typescript
// ✅ Always suffix with Props
interface ButtonProps { ... }
interface SearchBarProps { ... }
interface ProfileCardProps { ... }
```

**Children Typing:**
```typescript
// ✅ Use React.ReactNode for flexibility
interface CardProps {
  children: React.ReactNode;
  title?: string;
}
```

**ForwardRef Pattern:**
```typescript
// ✅ Use for DOM atoms/molecules
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => {
    return <input ref={ref} {...props} />;
  }
);

Input.displayName = 'Input';
```

#### Deprecation Strategy

**Mark old components with JSDoc:**
```typescript
/**
 * @deprecated Use Button from @/components/atoms/Button instead.
 * This component will be removed in v2.0.
 */
export function OldButton() { ... }
```

**Migration path:**
1. Mark component as `@deprecated` with reason
2. Point to replacement in deprecation notice
3. Add console warning in development
4. Remove after 2 major versions or 6 months

#### Common Pitfalls (2026)

**Problem:** Classification paralysis - spending too long deciding if something is an atom vs. molecule.
**Solution:** Start as molecule, refactor to atom if reused 3+ times.

**Problem:** State management doesn't align with atomic structure.
**Solution:** Use URL state (nuqs) for shareable state, React Context for feature state, TanStack Query for server state.

**Problem:** Blurring of stateful and stateless components.
**Solution:** Atoms should be stateless presentational components. Move state to organisms or use composition.

**Problem:** Over-abstraction creating unused components.
**Solution:** Build components when you need them (YAGNI principle). Refactor when you have 3+ similar instances.

#### Real-World Guidelines

**From Industry Leaders (Shopify, IBM):**
- Document components in Storybook with examples
- Write tests for organisms (required) and molecules (recommended)
- Keep component files under 500 lines (split if exceeded)
- Use consistent naming: `<Noun>` for atoms, `<Noun><Noun>` for molecules, `<Feature><Noun>` for organisms

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

### 8.3 Stack & Packages (2026)

#### Core Framework & Runtime

- **Runtime & framework:** Next.js 16.1.1 + App Router + React Server Components (RSC)
  - Next.js 16 features: Cache Components with `use cache`, Turbopack stable, React Compiler support
  - Default to request-time execution unless explicitly cached with `use cache`
  - Combine Cache Components with Suspense-based Partial Prerendering (PPR)
- **Package manager:** `pnpm` only (v9.15.9+)
- **Monorepo:** Turborepo with remote caching enabled (Vercel Remote Cache)
  - Cache outputs defined in `turbo.json` for build, typecheck, lint, test tasks
  - Use `dependsOn` to declare task dependencies across workspace
  - Enable filesystem caching for faster dev server restarts

#### Database & Backend

- **DB:** Neon Postgres + Drizzle ORM
  - Use `@neondatabase/serverless` with WebSocket support for full transaction capabilities
  - Connection pooling via `Pool` for production-ready performance
  - Configure `neonConfig.webSocketConstructor = ws` for transactions
  - Implement retry logic for transient connection errors
  - **Best Practice:** Use interactive transactions via `neon-serverless` driver (Pool/Client) when you need session/transaction support
  - **Migrations:** Never run from Edge runtime; always use Node.js environment
- **Auth:** Clerk v6.36.7 (`@clerk/nextjs` + `@clerk/nextjs/server`)
  - Use `clerkMiddleware()` for route protection (compatible with App Router)
  - Server helpers from `@clerk/nextjs/server`: `auth()`, `currentUser()`
  - Client hooks/components from `@clerk/nextjs`
  - **Best Practice:** Use `auth.protect()` for automatic redirects on unauthorized access
- **Payments:** Stripe v20.1.2
  - Server-only SDK (`stripe`) in Node.js routes only
  - Client SDK (`@stripe/stripe-js`) for checkout flows
  - Webhook signature verification required: `stripe.webhooks.constructEvent()`
  - Use `req.text()` in App Router webhooks to prevent body parsing

#### Styling & UI

- **Styling:** Tailwind CSS v4.1.18 with PostCSS (`@tailwindcss/postcss`)
  - **CSS-first configuration:** Use `@import "tailwindcss"` and `@theme` directive
  - **Modern syntax (REQUIRED):**
    - `z-100` not `z-[100]` (arbitrary z-index)
    - `shrink-0` not `flex-shrink-0`
    - `bg-linear-to-r` not `bg-gradient-to-r`
    - `border-(--var-name)` not `border-[var(--var-name)]` (CSS variable references)
    - `bg-black!` not `!bg-black` (important modifier is postfix)
    - `hover:bg-gray-800!` not `hover:!bg-gray-800`
  - **Performance:** 5x faster full builds, 100x faster incremental builds
  - **Color palette:** Uses `oklch` color space for P3-compatible vibrant colors
- **Headless UI:**
  - Primary: `@headlessui/react` v2.2.8 (Tailwind Labs, WAI-ARIA compliant)
  - Radix UI for specific primitives: Dialog, Dropdown, Tooltip, etc. (v1.x)
  - `@floating-ui/react` v0.27.16 for custom positioning
  - **Best Practice:** Headless UI manages accessibility, keyboard nav, ARIA - never skip semantic HTML
- **Icons:**
  - **UI icons:** Lucide React v0.562.0 (`lucide-react`) ONLY
  - **Brand icons:** Simple Icons v16.1.0 (`simple-icons`) via `<SocialIcon />` wrapper
  - Import directly: `import { Check, X } from 'lucide-react'`
  - Use `<Icon name="..." />` wrapper for dynamic icon names
  - ❌ Do NOT use Heroicons, Font Awesome, or other icon libraries

#### State Management & Data Fetching

- **Server State:** TanStack Query v5.90.16 (`@tanstack/react-query`)
  - Full Suspense support with `useSuspenseQuery`, `useSuspenseInfiniteQuery`
  - Requires React 18+ (uses `useSyncExternalStore`)
  - Server streaming with `react-query-next-experimental` adapter
  - Dehydrate pending queries for early prefetches (v5.40.0+)
- **Client State:**
  - Local state: `useState` + React Context
  - URL state: **nuqs** v2.8.6 for type-safe search params
  - ❌ Do NOT add Zustand, Jotai, Redux, or Recoil
- **URL State (nuqs):**
  - Server Components: `await searchParams.parse()` for type-safe params
  - Client Components: `useTableParams()`, `usePaginationParams()`, `useSortParams()`
  - **When to use:** pagination, sorting, filtering, tab selection, shareable state
  - **When NOT to use:** one-time reads, form state, temporary UI state

#### Tables & Virtualization

- **Table State:** TanStack Table v8.21.3 (`@tanstack/react-table`)
  - Use `useReactTable` with `getCoreRowModel`, `getSortedRowModel`
  - Type-safe column definitions with `ColumnDef<TData>`
  - Built-in row selection, sorting, filtering support
  - **CRITICAL: Column Type Inference Pattern**
    - When mixing `columnHelper.accessor()` and `columnHelper.display()` columns, **ALWAYS use type inference**
    - ❌ **DON'T:** Explicitly type columns as `ColumnDef<TData, unknown>[]`
    - ✅ **DO:** Let TypeScript infer the column union type naturally
    - **Why:** TanStack Table has specific accessor types (`AccessorKeyColumnDef<TData, string>`) that conflict with explicit generic typing
    - **Type Assertion:** When passing inferred columns to components that expect `ColumnDef<TData, unknown>[]`, use type assertion: `as ColumnDef<TData, unknown>[]`
    - **Example:**
      ```typescript
      // ❌ WRONG: Explicit typing causes type errors
      const columns = useMemo<ColumnDef<MyType, unknown>[]>(() => {
        const baseColumns: ColumnDef<MyType, unknown>[] = [
          columnHelper.accessor('field', { /* ... */ }),
          columnHelper.display({ /* ... */ }),
        ];
        return baseColumns;
      }, [deps]);

      // ✅ CORRECT: Let TypeScript infer types
      const columns = useMemo(() => {
        const baseColumns = [
          columnHelper.accessor('field', { /* ... */ }),
          columnHelper.display({ /* ... */ }),
        ];
        return baseColumns;
      }, [deps]);

      // ✅ When passing to UnifiedTable, use type assertion:
      <UnifiedTable
        data={data}
        columns={columns as ColumnDef<MyType, unknown>[]}
      />
      ```
- **Virtualization:** TanStack Virtual v3.13.13 (`@tanstack/react-virtual`)
  - Use `useVirtualizer` for list/table virtualization
  - Auto-enable for datasets 20+ rows
  - **Best Practice:** Set `useFlushSync: false` for React 19 compatibility (batches updates naturally)
  - Memoize `getItemKey` with `useCallback` to avoid recalculations
  - Use `rangeExtractor` for sticky headers/footers/custom rendering

#### Forms & Validation

- **Forms:** React Hook Form v7.69.0 (`react-hook-form`)
  - Schema validation via Zod v4.2.1 with `@hookform/resolvers` v5.2.2
  - Use `zodResolver` to connect schemas: `useForm({ resolver: zodResolver(schema) })`
  - **Best Practice:** Define schema once, reuse across client + server
  - Validate on client for UX, re-validate on server for security
  - Works with Next.js Server Actions for full-stack type safety

#### Animation & Interaction

- **Motion:** Framer Motion v12.23.26 (`framer-motion`)
  - Use for complex animations, gestures, layout animations
  - Prefer CSS transitions for simple hover/focus states
- **Drag & Drop:** dnd-kit v6.3.1 (`@dnd-kit/core`, `@dnd-kit/sortable`)
  - Accessible, performant, framework-agnostic
  - Use for sortable lists, kanban boards, file uploads

#### Analytics & Feature Flags

- **Analytics & Flags:** Statsig ONLY
  - `@statsig/react-bindings` v3.30.0 for feature gates/experiments
  - `@statsig/web-analytics` v3.31.0 for product analytics
  - `@statsig/session-replay` v3.30.0 for session replay
  - ❌ Do NOT add PostHog, Segment, RudderStack, Amplitude
  - All feature flags must be registered in `docs/STATSIG_FEATURE_GATES.md`

#### Observability & Error Tracking

- **Monitoring:** Sentry v10 (`@sentry/nextjs`)
  - Configured for client, server, and edge runtimes
  - Use `Sentry.captureException()` for errors
  - Use `Sentry.startSpan()` for performance tracing
  - Import: `import * as Sentry from '@sentry/nextjs'`
  - **Best Practice:** Use structured logging with `logger.error(message, context)`
  - Enable `consoleLoggingIntegration` to forward console to Sentry

#### Development Tools

- **TypeScript:** v5 with strict mode enabled
- **Linting:** Biome v2.3.11 (`@biomejs/biome`)
  - Auto-format on save with 80-char line width
  - Accessibility rules enforced (a11y)
  - No explicit `any` types in production (error level)
- **Testing:**
  - Unit: Vitest v3.2.4 (`vitest`)
  - E2E: Playwright v1.55.0 (`@playwright/test`)
  - A11y: `@axe-core/playwright` v4.11.0
  - Component: Storybook v10.1.10 with Vite
- **Package Updates:** Check for updates weekly; keep dependencies current for security

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

## 14. Next.js 16 Best Practices (2026 Edition)

### 14.1 Cache Components & Caching Strategy

**GOLDEN RULE:** Caching is now **opt-in** by default. All dynamic code executes at request time unless explicitly cached.

#### Cache Components (`use cache`)

```typescript
// ✅ Explicitly cache expensive operations
'use cache';

export async function getCreatorProfile(username: string) {
  const profile = await db.query.creatorProfiles.findFirst({
    where: eq(creatorProfiles.username, username),
  });
  return profile;
}
```

**Best Practices:**
- Use `use cache` directive to make caching explicit
- Compiler generates consistent cache keys automatically
- Combine with Suspense for Partial Prerendering (PPR)
- Pass `cacheLife: 'max'` to `revalidateTag()` for SWR-style behavior
- Use `updateTag()` in Server Actions for read-your-write consistency

#### Caching Anti-Patterns
- ❌ Don't rely on implicit caching (removed in Next.js 16)
- ❌ Don't cache at component level - cache data fetching functions instead
- ❌ Don't manually manage cache expirations - use `cacheLife` profiles

### 14.2 Turbopack - Stable & Production-Ready

**ENABLED BY DEFAULT** in Next.js 16 for 2-5x faster builds and 10x faster Fast Refresh.

**Configuration:**
```javascript
// next.config.js
export default {
  experimental: {
    turbo: {
      // Enable filesystem caching for faster restarts
      cache: true,
    },
  },
};
```

**Performance Gains:**
- **Full builds:** 2-5x faster than Webpack
- **Fast Refresh:** Up to 10x faster hot module replacement
- **Incremental builds:** Reuse cached artifacts across restarts
- **Dev server startup:** Significantly faster for large repositories

**When to use Webpack:**
- Only when absolutely necessary (legacy plugins, custom loaders)
- Most projects should use Turbopack exclusively

### 14.3 React Compiler Support

Next.js 16 includes stable support for the React Compiler (following React Compiler 1.0 release).

**When to enable:**
- After measuring build-time cost impact
- For applications with frequent re-renders
- When you want automatic memoization without manual `useMemo`/`useCallback`

**Configuration:**
```javascript
// next.config.js
export default {
  experimental: {
    reactCompiler: true,
  },
};
```

**Benefits:**
- Automatically memoizes components to cut redundant renders
- Reduces need for manual `useMemo`, `useCallback`, `memo`
- Improves runtime performance at the cost of slightly longer builds

### 14.4 Server Actions & Mutations

**Best Practices:**
- Use Server Actions for all mutations (create, update, delete)
- Call `refresh()` to refresh uncached data within the same request
- Use `revalidateTag()` to invalidate cached data after mutations
- Use `updateTag()` for immediate read-your-write consistency

```typescript
'use server';

import { revalidateTag } from 'next/cache';

export async function updateProfile(data: ProfileData) {
  await db.update(profiles).set(data);

  // Invalidate cache for this profile
  revalidateTag(`profile-${data.id}`);

  return { success: true };
}
```

### 14.5 Partial Prerendering (PPR)

Combine static shells with dynamic content for optimal performance.

**Pattern:**
```tsx
export default function Page() {
  return (
    <div>
      {/* Static shell - prerendered */}
      <Header />
      <Sidebar />

      {/* Dynamic content - streamed */}
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
```

**Benefits:**
- Static shell delivers instantly (TTFB < 50ms)
- Dynamic data streams in via Suspense
- Best of both worlds: fast initial load + fresh data

### 14.6 Layout Deduplication & Prefetching

**Built-in optimizations:**
- Shared layouts download once and cache client-side
- Incremental prefetching: only fetch chunks that changed
- Automatic route prefetching on link hover

**Best Practice:**
- Maximize shared layouts to benefit from deduplication
- Use `<Link prefetch={false}>` to disable prefetch for low-priority routes
- Monitor Network tab to verify layout chunks are cached

### 14.7 Enhanced Dev & Build Logs

Next.js 16 breaks out compile work vs. React rendering for faster debugging.

**Monitor for:**
- Slow compilation (Turbopack should be fast)
- Large bundle sizes (use Bundle Analyzer)
- Render bottlenecks (use React DevTools Profiler)

### 14.8 React 19 Features

Take advantage of React 19.2 additions when building new UI:

- **View Transitions API:** Native page transitions without libraries
- **`useEffectEvent()`:** Stable event handlers without exhaustive deps
- **`<Activity />`:** Built-in loading/activity indicators
- **Form Actions:** Native form handling with Server Actions

### 14.9 Next.js DevTools & Debugging

**Recommended Setup:**
- Install Next.js DevTools MCP for agent/team debugging
- Use unified log surface to inspect routing, caching, rendering
- Enable React DevTools for component profiling

### 14.10 Build Adapters API

Use when you need to hook into the build flow for:
- Custom deployment hosts
- Infrastructure automation
- CDN integration
- Asset optimization pipelines

**Example Use Cases:**
- Deploy to self-hosted infrastructure
- Integrate with custom CDNs
- Add post-build asset processing

## 14.11 Turborepo Monorepo Best Practices (2026)

### Remote Caching Strategy

**ENABLED** in this repo via Vercel Remote Cache.

**Configuration in `turbo.json`:**
```json
{
  "remoteCache": {
    "enabled": true
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

**Best Practices:**
- **Cache outputs aggressively:** Define all build artifacts in `outputs`
- **Declare dependencies:** Use `dependsOn` to order tasks correctly
- **Incremental builds:** CI will reuse cache from previous runs
- **Local development:** Cache shared across team members

### Task Pipeline Optimization

**Critical Rules:**
1. **Build shared packages first:** Use `^build` dependency
2. **Parallel execution:** Tasks without dependencies run concurrently
3. **Minimal cache keys:** Only include files that affect output

**Example Pipeline:**
```json
{
  "tasks": {
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": [".cache/tsbuildinfo"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

### Code Sharing Strategy

**GOLDEN RULE:** Start with **less sharing**, not more. It's easier to extract shared code later than to untangle overshared code.

**Best Practices:**
- **Shared packages:** Only extract when code is used in 3+ places
- **Workspace dependencies:** Use `workspace:*` protocol
- **TypeScript paths:** Configure `paths` in `tsconfig.json` for clean imports
- **No circular dependencies:** Enforce with `dependency-cruiser`

### Dependency Management

**Optimization tactics:**
- **Hoist common deps to root:** Move React, Next.js, TypeScript to root `package.json`
- **Remove unused devDependencies:** Audit with `depcheck`
- **Use pnpm:** Avoids duplication, ensures consistency
- **Lock versions:** Use exact versions in `package.json` for predictability

### Performance Targets

**Benchmark your setup:**
- **Cold build:** < 2 minutes (with Turbopack + remote cache)
- **Cached build:** < 10 seconds (with Turborepo remote cache)
- **Fast Refresh:** < 1 second (with Turbopack)
- **Dev server startup:** < 5 seconds

**If you exceed these:**
1. Check remote cache is enabled and working
2. Verify Turbopack is active (not webpack fallback)
3. Audit large dependencies with Bundle Analyzer
4. Split large packages into smaller ones

### Global Environment Variables

**Configured in `turbo.json`:**
```json
{
  "globalPassThroughEnv": [
    "SENTRY_AUTH_TOKEN",
    "DOPPLER_PROJECT",
    "DOPPLER_CONFIG"
  ]
}
```

**Best Practice:**
- Only pass env vars that are truly global
- Use task-level `env` for task-specific vars
- Never commit secrets - use Doppler/Vault

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

## 18. Code Quality Enforcement (REQUIRED)

AI agents **must** follow these code quality rules, which are enforced by Claude Code hooks and Biome.

### Console Statement Policy

- **No `console.*` in production code** - Use Sentry logging per Section 15
- **Allowed locations:** tests, scripts/, dev-only files, config files
- **Enforcement:** Claude hook (blocks), Biome (future)

**Correct pattern:**
```typescript
import * as Sentry from '@sentry/nextjs';

// For errors
Sentry.captureException(error);

// For structured logging
const { logger } = Sentry;
logger.error('message', { context });
```

### TypeScript Strictness

- **No explicit `any` types in production code** - Use proper typing or `unknown`
- **Avoid `@ts-ignore`** - Use `@ts-expect-error` with explanation comment
- **Track unavoidable exceptions** in `TECH_DEBT_TRACKER.md`
- **Enforcement:** Biome (error), Claude hook (blocks)

**Correct pattern:**
```typescript
// Instead of: const data: any = ...
const data: unknown = response.json();

// Type guard for unknown
function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}

// Instead of: @ts-ignore
// @ts-expect-error - Drizzle type mismatch during migration (tracked in TECH_DEBT_TRACKER.md)
```

### File Size Limits

- **Max file size: 500 lines** - Split if exceeded
- **Exceptions:** test files, generated files, migrations
- **Enforcement:** Claude hook (warning)

**Refactoring strategies:**
- Extract utility functions to separate files
- Split by feature/concern
- Create sub-components for large React components
- Use composition patterns

### Code Coverage Requirements

- **New code coverage: 60%** minimum
- **Critical paths:** Higher coverage expected (auth, payments, onboarding)
- **Enforcement:** SonarCloud quality gate (warning mode)

### Biome Configuration

The following rules are enforced as errors:

| Rule | Level | Purpose |
|------|-------|---------|
| `noExplicitAny` | error | Type safety in production |
| `noUnusedVariables` | error | Clean code |
| `noUnusedImports` | error | Bundle size |
| `noArrayIndexKey` | warn | React best practice |
| `noUselessFragments` | warn | Performance |

**Override for tests:** `any` types are allowed in test files (`*.test.ts`, `*.spec.ts`, `/tests/`)

</details>
