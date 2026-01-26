# Codebase Audit System

A systematic approach to auditing the Jovie codebase using specialized sub-agents.

## Quick Start

Copy any of the audit prompts below and use them with Claude Code. Each audit is designed to be iterative - the agent will find issues, report them, then continue searching.

---

## Audit 1: Database Operations (Drizzle/Neon)

### Purpose
Find database calls that should be batched, use transactions, or be refactored for performance.

### Prompt

```
You are a database performance auditor for a Drizzle ORM + Neon PostgreSQL codebase.

## Your Mission
Iteratively scan the codebase for database anti-patterns. After finding each issue, continue searching until the entire codebase is covered.

## What to Find

### 1. N+1 Query Patterns
- Loops that execute queries inside (for/forEach/map with await db.*)
- Sequential awaits that could be Promise.all or db.batch
- Related data fetched in separate queries instead of joins

### 2. Missing Batching
- Multiple insert/update/delete calls that should use db.batch()
- Sequential writes to the same or related tables
- Bulk operations done one-by-one

### 3. Missing Transactions
- Related writes without withTransaction()
- Operations that should be atomic but aren't
- Delete + insert pairs without transaction wrapper

### 4. Suboptimal Queries
- SELECT * when only specific columns needed
- Missing .limit() on potentially large result sets
- Repeated identical queries (should use prepared statements)
- Missing indexes (infer from WHERE clauses on non-indexed columns)

### 5. Connection Issues
- Direct db imports instead of using getDb() or withDb()
- Missing connection pool awareness in hot paths

## Search Strategy
1. Start with `/apps/web/lib/db/queries.ts` - the main query file
2. Then `/apps/web/app/**/actions.ts` - server actions with DB calls
3. Then `/apps/web/app/**/route.ts` - API routes
4. Then grep for `db.select`, `db.insert`, `db.update`, `db.delete` patterns
5. Look for `await.*await` patterns suggesting sequential queries

## Output Format
For each issue found:
```
### Issue: [Brief Title]
**File:** `path/to/file.ts:lineNumber`
**Pattern:** [N+1 | Missing Batch | Missing Transaction | Suboptimal Query | Connection]
**Current Code:**
\`\`\`typescript
// problematic code snippet
\`\`\`
**Recommended Fix:**
\`\`\`typescript
// improved code
\`\`\`
**Impact:** [High | Medium | Low] - [explanation]
```

After each finding, say "Continuing audit..." and search for more issues.
When complete, provide a summary with counts by category.
```

---

## Audit 2: TanStack Query Usage

### Purpose
Find fetch calls and data fetching patterns that should use TanStack Query infrastructure.

### Prompt

```
You are a data fetching auditor for a Next.js 16 + TanStack Query v5 codebase.

## Your Mission
Iteratively scan for data fetching that bypasses or misuses the TanStack Query system.

## Context
This codebase has established patterns in `/apps/web/lib/queries/`:
- `keys.ts` - Query key factory (queryKeys.*)
- `cache-strategies.ts` - REALTIME_CACHE, STANDARD_CACHE, STABLE_CACHE, etc.
- `fetch.ts` - fetchWithTimeout, createQueryFn, createMutationFn
- `server.ts` - getQueryClient, prefetchQuery, getDehydratedState
- `use*.ts` - Custom query hooks

## What to Find

### 1. Raw Fetch Without TanStack
- Direct `fetch()` calls in client components that should be useQuery
- `fetch()` in useEffect that should be useQuery
- axios/got/ky calls (if any) that should use the system

### 2. Missing Server Prefetching
- Server components that could prefetch but don't
- Pages missing HydrateClient wrapper for prefetched data
- Client components making requests that could be SSR'd

### 3. Improper Query Keys
- Hardcoded query key strings instead of queryKeys.*
- Missing dependencies in query keys (stale cache bugs)
- Inconsistent key structures

### 4. Wrong Cache Strategy
- Real-time data using STABLE_CACHE
- Static data using REALTIME_CACHE
- Missing staleTime configuration

### 5. Missing Mutations
- Direct fetch POST/PUT/DELETE that should be useMutation
- Missing optimistic updates where applicable
- Missing cache invalidation after mutations

### 6. Duplicate Query Logic
- Same fetch logic repeated instead of shared hook
- Queries that should use existing use*.ts hooks

## Search Strategy
1. Grep for raw `fetch(` in `/apps/web/app` and `/apps/web/components`
2. Look for `useEffect.*fetch` patterns
3. Find POST/PUT/DELETE without useMutation
4. Check server components in `/app` for missing prefetch
5. Search for hardcoded query key strings

## Output Format
For each issue found:
```
### Issue: [Brief Title]
**File:** `path/to/file.tsx:lineNumber`
**Pattern:** [Raw Fetch | Missing Prefetch | Bad Keys | Wrong Cache | Missing Mutation | Duplicate]
**Current Code:**
\`\`\`typescript
// problematic code
\`\`\`
**Recommended Fix:**
\`\`\`typescript
// using proper TanStack patterns
\`\`\`
**Existing Hook to Use:** `useXxxQuery` from `/lib/queries/useXxx.ts` (if applicable)
```

After each finding, say "Continuing audit..." and search for more issues.
When complete, provide a summary.
```

---

## Audit 3: Performance & Memoization

### Purpose
Find performance issues even with React Compiler enabled.

### Prompt

```
You are a React performance auditor for a React 19 codebase with React Compiler ENABLED.

## Your Mission
Even with React Compiler auto-memoization, find performance issues that need manual intervention.

## Context
- React Compiler handles most memoization automatically
- BUT some patterns still need attention
- Uses TanStack Virtual for some lists
- Has complex dashboard with multiple contexts

## What to Find

### 1. Context Value Stability
- Context providers with unstable value objects
- Missing useMemo on context value when it contains callbacks
- Contexts that update too frequently

### 2. Heavy Computations
- Expensive calculations without useMemo (Compiler might miss some)
- Data transformations on every render
- Complex filtering/sorting of large arrays inline

### 3. Missing Virtualization
- Long lists rendered without TanStack Virtual
- Tables with 100+ rows not virtualized
- Infinite scroll without windowing

### 4. Render Cascades
- State lifted too high causing subtree re-renders
- Missing component splitting for isolated updates
- Event handlers recreated in render (though Compiler should catch most)

### 5. Expensive Effects
- useEffect with heavy computation
- Missing cleanup in effects with subscriptions
- Effects that run too frequently (missing/wrong deps)

### 6. Bundle Size Issues
- Large libraries imported for small features
- Missing dynamic imports for heavy components
- Client components that could be server components

### 7. Unnecessary Client Boundaries
- 'use client' on components that don't need interactivity
- Client wrappers around static content

## Search Strategy
1. Check `/components/providers/` for context patterns
2. Look at dashboard components `/app/dashboard/` for complex renders
3. Find all 'use client' directives and validate necessity
4. Search for large .map() operations without virtualization
5. Look for inline object/array creation in JSX props

## Output Format
For each issue found:
```
### Issue: [Brief Title]
**File:** `path/to/file.tsx:lineNumber`
**Pattern:** [Context | Computation | Virtualization | Render Cascade | Effect | Bundle | Client Boundary]
**Current Code:**
\`\`\`typescript
// problematic code
\`\`\`
**Recommended Fix:**
\`\`\`typescript
// improved code
\`\`\`
**Performance Impact:** [Explain the render/memory/bundle impact]
```

After each finding, say "Continuing audit..." and search for more issues.
When complete, provide a summary.
```

---

## Master Orchestration Prompt

Use this prompt to run all audits systematically with sub-agents:

```
You are the master auditor orchestrating a comprehensive codebase review.

## Your Mission
Run three parallel sub-agent audits, then synthesize findings into a prioritized action plan.

## Execution Strategy

### Phase 1: Launch Parallel Audits
Use the Task tool to launch THREE sub-agents simultaneously:

1. **Database Audit Agent** (subagent_type: Explore)
   - Focus: Drizzle ORM patterns, batching, transactions
   - Start: /apps/web/lib/db/ and /apps/web/app/**/actions.ts

2. **TanStack Query Audit Agent** (subagent_type: Explore)
   - Focus: Data fetching, caching, mutations
   - Start: /apps/web/lib/queries/ and client components

3. **Performance Audit Agent** (subagent_type: Explore)
   - Focus: Memoization, virtualization, bundle size
   - Start: /apps/web/components/ and /apps/web/app/

### Phase 2: Synthesize Results
After all agents complete:
1. Deduplicate overlapping findings
2. Categorize by severity (Critical, High, Medium, Low)
3. Group by file/feature area
4. Identify quick wins vs major refactors

### Phase 3: Create Action Plan
Output a prioritized list:
```markdown
## Critical (Fix Immediately)
- [ ] Issue description - File:line - Est. effort

## High Priority (This Sprint)
- [ ] ...

## Medium Priority (Backlog)
- [ ] ...

## Low Priority (Nice to Have)
- [ ] ...
```

### Phase 4: Create GitHub Issues (Optional)
If requested, create GitHub issues for each category using `gh issue create`.

## Launch Command
"Run comprehensive codebase audit with parallel sub-agents for: database operations, TanStack Query usage, and performance patterns. Synthesize into prioritized action items."
```

---

## Running Individual Audits

For focused audits, use these one-liners:

```bash
# Database audit only
claude "Run the Database Operations audit from CODEBASE_AUDIT.md"

# TanStack Query audit only
claude "Run the TanStack Query Usage audit from CODEBASE_AUDIT.md"

# Performance audit only
claude "Run the Performance & Memoization audit from CODEBASE_AUDIT.md"

# Full orchestrated audit
claude "Run the Master Orchestration from CODEBASE_AUDIT.md with parallel sub-agents"
```

---

## Customizing Audits

### Add New Audit Categories

1. Copy an existing audit template
2. Modify the "What to Find" section
3. Update the "Search Strategy" for relevant paths
4. Add to the Master Orchestration prompt

### Suggested Additional Audits

- **Security Audit**: SQL injection, XSS, auth bypass, secrets exposure
- **Accessibility Audit**: ARIA, keyboard nav, screen reader support
- **Error Handling Audit**: Missing try/catch, unhandled promises, error boundaries
- **Type Safety Audit**: `any` types, missing Zod validation, unsafe casts

---

## Tips for Effective Auditing

1. **Run in chunks**: For large codebases, audit one feature area at a time
2. **Cross-reference**: Issues often span categories (DB issue → Query issue)
3. **Prioritize by traffic**: Focus on hot paths and frequently-used features
4. **Track fixes**: Update this doc or create issues as fixes are made
5. **Re-audit after changes**: Run again to catch regressions
