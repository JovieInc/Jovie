---
description: React/Next.js performance audit for App Router + TanStack stack
tags: [performance, optimization, next.js, react]
---

# /perf-check - Performance Analysis

Audit React components for performance issues across 8 critical categories covering 57+ rules. Identifies waterfalls, bundle size bloat, server/client boundary violations, and re-render problems.

## Categories (57 rules total)

### CRITICAL Priority
1. **Eliminating Waterfalls** (async- prefix) - Sequential await chains that kill performance
2. **Bundle Size Optimization** (bundle- prefix) - Import bloat and unused dependencies

### HIGH Priority
3. **Server-Side Performance** (server- prefix) - SSR/ISR optimization and static page enforcement
4. **Client/Server Separation** (boundary- prefix) - Hooks in wrong context, missing directives

### MEDIUM-HIGH Priority
5. **Client-Side Data Fetching** (client- prefix) - TanStack Query patterns and cache strategies

### MEDIUM Priority
6. **Re-render Optimization** (rerender- prefix) - Unnecessary component updates
7. **Rendering Performance** (rendering- prefix) - Expensive render operations

### LOW-MEDIUM Priority
8. **JavaScript Performance** (js- prefix) - Runtime performance patterns

### LOW Priority
9. **Advanced Patterns** (advanced- prefix) - React 19 features and optimizations

## Jovie-Specific Guardrails (CRITICAL)

### 1. Client vs Server Separation (CRITICAL)

**Server Components (default):**
- Can be async functions
- Can directly access database via `@/lib/db`
- Can use `headers()`, `cookies()`, server-only modules
- CANNOT use hooks (`useState`, `useEffect`, `useCallback`, etc.)
- CANNOT use event handlers (`onClick`, `onChange`, etc.)
- CANNOT use browser APIs (`window`, `localStorage`, etc.)

**Client Components ('use client'):**
- Can use hooks and event handlers
- Can use browser APIs
- CANNOT import from `@/lib/db/*`
- CANNOT import from `@clerk/nextjs/server`
- CANNOT import server-only modules (stripe, resend with secrets)
- CANNOT import `*.server.ts` files

**Server Actions:**
- Must have `'use server'` at file top or function level
- Can only be called from Client Components or Server Components
- Should validate input with Zod schemas

#### Detection Rules

**Rule boundary-01: Hooks in Server Components (CRITICAL)**

❌ **Server Component with Hooks:**
```tsx
// apps/web/app/(marketing)/page.tsx - Server Component (no 'use client')
export default function HomePage() {
  const [state, setState] = useState(false); // ❌ CRITICAL: Hook in Server Component
  return <div>Home</div>;
}
```

✅ **Client Component with Hooks:**
```tsx
'use client'; // ✅ Proper directive

export default function HomePage() {
  const [state, setState] = useState(false); // ✅ OK: Client component
  return <div>Home</div>;
}
```

**Rule boundary-02: Server Imports in Client Components (CRITICAL)**

❌ **Client Component importing database:**
```tsx
'use client';
import { db } from '@/lib/db'; // ❌ CRITICAL: Server-only import

export function MyComponent() {
  // This will bundle Drizzle/Neon in client JS!
  return <div>Content</div>;
}
```

✅ **Use Server Action instead:**
```tsx
'use client';
import { getDataAction } from './actions'; // ✅ Server Action

export function MyComponent() {
  const handleClick = async () => {
    const data = await getDataAction();
  };
  return <button onClick={handleClick}>Load</button>;
}
```

**Rule boundary-03: Missing 'use client' Directive (HIGH)**

❌ **Interactive Component without directive:**
```tsx
// No 'use client' directive
export function Counter() {
  const [count, setCount] = useState(0); // ❌ Will error at runtime
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

✅ **Proper Client Component:**
```tsx
'use client'; // ✅ Required for hooks

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

**Automated Check:**
```bash
# Find server files using hooks (SHOULD BE EMPTY)
grep -rn "useState\|useEffect\|useCallback" apps/web/app --include="*.tsx" | grep -v "'use client'"

# Find 'use client' files importing db (SHOULD BE EMPTY)
grep -l "'use client'" apps/web --include="*.tsx" --include="*.ts" -r | xargs grep -l "@/lib/db" 2>/dev/null
```

### 2. Static Marketing Pages (CRITICAL - from agents.md)

**Marketing routes MUST be fully static:** `app/(marketing)/**` and `app/(dynamic)/legal/**`

**Enforcement:**
- Add `export const revalidate = false` (fully static, no ISR)
- NO dynamic data: `headers()`, `cookies()`, `fetch` with `no-store`
- NO per-request data or server-side nonce generation
- Theme init uses static `/public/theme-init.js` (no nonce)
- Homepage uses `FALLBACK_AVATARS` only (no DB during SSR)
- Blog/Changelog read from filesystem at build time

**Rule server-01: Marketing with Server Data (CRITICAL)**

❌ **Dynamic Data in Marketing:**
```tsx
// app/(marketing)/pricing/page.tsx
import { headers } from 'next/headers';

export default async function PricingPage() {
  const geo = (await headers()).get('x-vercel-ip-country'); // ❌ CRITICAL
  return <div>Pricing for {geo}</div>;
}
```

✅ **Fully Static Marketing:**
```tsx
// app/(marketing)/pricing/page.tsx
export const revalidate = false; // ✅ Fully static

export default function PricingPage() {
  // ✅ No server data, no headers(), no cookies()
  return <div>Pricing</div>;
}
```

**Rule server-02: Missing revalidate = false (HIGH)**

❌ **No Static Export:**
```tsx
// app/(marketing)/blog/page.tsx
export default function BlogPage() {
  return <div>Blog</div>;
}
```

✅ **Explicit Static Export:**
```tsx
// app/(marketing)/blog/page.tsx
export const revalidate = false; // ✅ Required

export default function BlogPage() {
  return <div>Blog</div>;
}
```

**Automated Check:**
```bash
# Find marketing pages without revalidate = false
grep -rL "revalidate = false" apps/web/app/\(marketing\) --include="*.tsx"

# Find marketing pages using headers/cookies (SHOULD BE EMPTY)
grep -rn "headers()\|cookies()" apps/web/app/\(marketing\) --include="*.tsx"
```

### 3. Public Profile Performance (HIGH)

Public profiles (`app/[username]/**`) are ISR with 1hr revalidate and cache tag invalidation.

**Requirements:**
- ISR: `export const revalidate = 3600` (1 hour)
- Cache tags: Use `revalidateTag('profile:username')` for instant updates
- Parallel fetching: Use `Promise.all()` for independent queries
- Prepared statements: Use Drizzle `.prepare()` for repeated queries

**Rule server-03: Sequential Await Waterfall (CRITICAL)**

❌ **Waterfall Pattern:**
```tsx
// app/[username]/page.tsx
export default async function ProfilePage({ params }: { params: { username: string } }) {
  const profile = await getProfile(params.username);     // Wait 50ms
  const releases = await getReleases(params.username);   // Wait 50ms
  const tourDates = await getTourDates(params.username); // Wait 50ms
  // Total: 150ms instead of 50ms!
  return <ProfileView profile={profile} releases={releases} tourDates={tourDates} />;
}
```

✅ **Parallel Fetching:**
```tsx
// app/[username]/page.tsx
export const revalidate = 3600; // ✅ 1hr ISR

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const [profile, releases, tourDates] = await Promise.all([
    getProfile(params.username),
    getReleases(params.username),
    getTourDates(params.username),
  ]); // ✅ Parallel: 50ms total
  return <ProfileView profile={profile} releases={releases} tourDates={tourDates} />;
}
```

**Rule server-04: Missing Cache Tags (MEDIUM)**

❌ **No Cache Invalidation:**
```tsx
export async function getProfile(username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) });
  // No way to invalidate this cache!
}
```

✅ **With Cache Tags:**
```tsx
import { unstable_cache } from 'next/cache';

export const getProfile = unstable_cache(
  async (username: string) => {
    return db.query.users.findFirst({ where: eq(users.username, username) });
  },
  ['profile-by-username'],
  {
    tags: (username) => [`profile:${username}`], // ✅ Can revalidate instantly
    revalidate: 3600,
  }
);
```

**Rule server-05: N+1 Query Pattern (HIGH)**

❌ **N+1 Queries:**
```tsx
const releases = await db.query.releases.findMany({ where: eq(releases.userId, userId) });
for (const release of releases) {
  const tracks = await db.query.tracks.findMany({ where: eq(tracks.releaseId, release.id) });
  // N queries for N releases!
}
```

✅ **Single Query with Join:**
```tsx
const releases = await db.query.releases.findMany({
  where: eq(releases.userId, userId),
  with: { tracks: true }, // ✅ Single query with join
});
```

### 4. Proper Hook Usage (HIGH)

**Rules of Hooks:**
- Call hooks at top level only (not in conditions/loops)
- Include ALL dependencies in dependency arrays
- Return cleanup functions from `useEffect` where needed
- Use `useRef` for non-rendering values

**Rule rerender-01: Conditional Hook (CRITICAL)**

❌ **Hook inside condition:**
```tsx
function Component({ show }: { show: boolean }) {
  if (show) {
    const [state, setState] = useState(false); // ❌ CRITICAL: Conditional hook
  }
  return <div>Content</div>;
}
```

✅ **Top-level Hook:**
```tsx
function Component({ show }: { show: boolean }) {
  const [state, setState] = useState(false); // ✅ Top-level
  if (!show) return null;
  return <div>Content</div>;
}
```

**Rule rerender-02: Missing Dependencies (HIGH)**

❌ **Incomplete dependency array:**
```tsx
function Component({ userId }: { userId: string }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData(userId).then(setData);
  }, []); // ❌ Missing userId dependency
}
```

✅ **Complete dependencies:**
```tsx
function Component({ userId }: { userId: string }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData(userId).then(setData);
  }, [userId]); // ✅ Include userId
}
```

**Rule rerender-03: Object in Dependency Array (MEDIUM)**

❌ **Inline object causes infinite loop:**
```tsx
useEffect(() => {
  doSomething(options);
}, [{ foo: bar }]); // ❌ New object every render → infinite loop
```

✅ **Use useMemo or primitive dependencies:**
```tsx
const options = useMemo(() => ({ foo: bar }), [bar]); // ✅ Stable reference
useEffect(() => {
  doSomething(options);
}, [options]);
```

### 5. Component Simplicity (MEDIUM)

**Principles:**
- Single Responsibility: Component does one thing
- Avoid over-engineering: Don't add features not needed
- Extract complexity: Split large components (>200 lines)
- Minimal props: Keep prop count <7
- No prop drilling: Use context for deeply nested state

**Rule rendering-01: Component Too Large (MEDIUM)**

❌ **250+ line component:**
```tsx
export function DashboardPage() {
  // 250 lines of mixed concerns
  // Analytics logic
  // Settings logic
  // Profile logic
  // All in one component
}
```

✅ **Split by concern:**
```tsx
export function DashboardPage() {
  return (
    <div>
      <AnalyticsSection />
      <SettingsSection />
      <ProfileSection />
    </div>
  );
}
```

**Rule rendering-02: Prop Drilling (MEDIUM)**

❌ **Props passed through 3+ levels:**
```tsx
<Parent user={user}>
  <Middle user={user}>
    <Child user={user}>
      <Grandchild user={user} /> {/* ❌ Prop drilling */}
    </Child>
  </Middle>
</Parent>
```

✅ **Use Context:**
```tsx
const UserContext = createContext<User | null>(null);

<UserContext.Provider value={user}>
  <Parent>
    <Middle>
      <Child>
        <Grandchild /> {/* ✅ Uses useContext(UserContext) */}
      </Child>
    </Middle>
  </Parent>
</UserContext.Provider>
```

## TanStack Query Patterns (Jovie Stack)

### Cache Strategies

Use predefined strategies from `apps/web/lib/queries/cache-strategies.ts`:

```tsx
import { STABLE_CACHE, STANDARD_CACHE, FREQUENT_CACHE } from '@/lib/queries/cache-strategies';

// Stable data (15min stale, 1hr gc)
useQuery({
  queryKey: queryKeys.user.profile(id),
  queryFn: () => getProfile(id),
  ...STABLE_CACHE,
});

// Standard app data (5min stale, 30min gc)
useQuery({
  queryKey: queryKeys.links.list(),
  queryFn: getLinks,
  ...STANDARD_CACHE,
});

// Frequent updates (1min stale, 10min gc)
useQuery({
  queryKey: queryKeys.analytics.stats(),
  queryFn: getStats,
  ...FREQUENT_CACHE,
});
```

**Rule client-01: TanStack Query Deduplication (MEDIUM)**

TanStack Query automatically deduplicates requests with the same `queryKey`. Use the query key factory pattern.

❌ **Duplicate key strings:**
```tsx
// Component A
const { data } = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) });

// Component B
const { data } = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) });
// Keys must match exactly for deduplication - easy to get wrong
```

✅ **Query key factory:**
```tsx
// apps/web/lib/queries/keys.ts
export const queryKeys = {
  user: {
    all: ['users'] as const,
    byId: (id: string) => [...queryKeys.user.all, id] as const,
  },
};

// Component A
const { data } = useQuery({
  queryKey: queryKeys.user.byId(id),
  queryFn: () => getUser(id),
  ...STABLE_CACHE,
});

// Component B - automatically deduplicated!
const { data } = useQuery({
  queryKey: queryKeys.user.byId(id),
  queryFn: () => getUser(id),
  ...STABLE_CACHE,
});
```

**Rule client-02: Wrong Cache Strategy (MEDIUM)**

❌ **No cache strategy specified:**
```tsx
useQuery({
  queryKey: queryKeys.user.profile(id),
  queryFn: () => getProfile(id),
  // Uses TanStack Query defaults: may refetch too often
});
```

✅ **Explicit cache strategy:**
```tsx
useQuery({
  queryKey: queryKeys.user.profile(id),
  queryFn: () => getProfile(id),
  ...STABLE_CACHE, // ✅ Appropriate for profile data
});
```

## Database Access (Jovie Stack)

**Rule server-06: Wrong Database Import (HIGH)**

❌ **Direct driver imports:**
```tsx
import { db } from '@/lib/db/client'; // ❌ Legacy HTTP client
import { Pool } from '@neondatabase/serverless'; // ❌ Direct driver
```

✅ **Canonical import:**
```tsx
import { db } from '@/lib/db'; // ✅ ONLY import from index.ts
```

**Automated Check:**
```bash
# SHOULD BE EMPTY (except lib/db/ itself)
grep -rn "from '@/lib/db/client'" apps/web --include="*.ts" --include="*.tsx" | grep -v "lib/db/"
grep -rn "from '@neondatabase" apps/web --include="*.ts" --include="*.tsx" | grep -v "lib/db/"
```

## Bundle Size Optimization

**Rule bundle-01: Importing Entire Library (CRITICAL)**

❌ **Barrel import:**
```tsx
import * as Icons from 'lucide-react'; // ❌ Bundles all 1000+ icons
<Icons.ChevronRight />
```

✅ **Direct import:**
```tsx
import { ChevronRight } from 'lucide-react'; // ✅ Tree-shaking works
<ChevronRight />
```

**Rule bundle-02: Client-side Environment Variables (MEDIUM)**

❌ **Server-only env var in client:**
```tsx
'use client';
const key = process.env.STRIPE_SECRET_KEY; // ❌ Will bundle in client JS!
```

✅ **Use Server Action:**
```tsx
'use server';
export async function createPaymentIntent() {
  const key = process.env.STRIPE_SECRET_KEY; // ✅ Server-only
  // ... stripe logic
}
```

## React 19 Patterns (Jovie Stack)

**Note:** Jovie uses React 19. Some patterns have changed:

**Rule advanced-01: Using forwardRef (LOW)**

❌ **Old React 18 pattern:**
```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => <button ref={ref} {...props} />
);
```

✅ **React 19 native ref:**
```tsx
function Button({ ref, ...props }: ButtonProps & { ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} {...props} />;
}
```

**Note:** `packages/ui/atoms/button.tsx` still uses `forwardRef` for backwards compatibility. New components should use native ref prop.

**Rule advanced-02: Using useContext (LOW)**

❌ **Old pattern:**
```tsx
const user = useContext(UserContext);
```

✅ **React 19 use() hook:**
```tsx
import { use } from 'react';
const user = use(UserContext);
```

## Execution Workflow

1. **Identify target files**
   - If no path specified, scan recently modified files: `git diff --name-only HEAD~5`
   - Focus on `.tsx` and `.ts` files in `apps/web/`

2. **Run CRITICAL checks first**
   - Client/Server boundary violations (boundary-*)
   - Static marketing page violations (server-01, server-02)
   - Sequential await waterfalls (server-03)
   - Bundle size issues (bundle-*)

3. **Run HIGH priority checks**
   - Hook usage violations (rerender-01, rerender-02)
   - Database import violations (server-06)
   - N+1 query patterns (server-05)

4. **Run MEDIUM priority checks**
   - TanStack Query patterns (client-*)
   - Component complexity (rendering-*)
   - Cache strategy (client-02)

5. **Report findings**
   - Format: `file:line - [SEVERITY] rule-id: Description`
   - Group by severity
   - Include fix suggestions with before/after examples

## Integration Points

- Run BEFORE `/verify` in development workflow
- Cross-reference with `/simplify` for performance-related refactorings
- Complement existing bundle analyzer: `@next/bundle-analyzer`
- Reference `/a11y-audit` for reduced motion patterns

## Output Format

```markdown
## Performance Audit Results

### CRITICAL Issues (blocking)
- `apps/web/app/(marketing)/pricing/page.tsx:12` - [CRITICAL] server-01: Using headers() in marketing page
- `apps/web/components/DashboardClient.tsx:45` - [CRITICAL] boundary-01: useState in Server Component

### HIGH Priority (fix soon)
- `apps/web/app/[username]/page.tsx:23` - [HIGH] server-03: Sequential await waterfall (150ms → 50ms)
- `apps/web/lib/queries/getProfile.ts:8` - [HIGH] server-06: Importing from @/lib/db/client

### MEDIUM Priority (improve)
- `apps/web/components/UserProfile.tsx:67` - [MEDIUM] client-02: No cache strategy specified
- `apps/web/components/Dashboard.tsx:120` - [MEDIUM] rendering-01: Component >200 lines

### Summary
- Total issues: 6
- CRITICAL: 2 (must fix)
- HIGH: 2 (fix soon)
- MEDIUM: 2 (improve)

### Recommended Fixes
[Include before/after code examples for top 3 issues]
```

## Critical Files Reference

- `apps/web/lib/queries/cache-strategies.ts` - TanStack Query cache strategies
- `apps/web/lib/queries/keys.ts` - Query key factory pattern
- `apps/web/lib/db/index.ts` - Canonical database import (MUST use)
- `packages/ui/atoms/button.tsx` - CVA variant pattern example
- `apps/web/middleware/proxy.ts` - Middleware optimization reference

## Automated Validation

Run these checks before manual audit:

```bash
# Server/Client boundaries
pnpm --filter web lint:server-boundaries

# Marketing pages with dynamic data (SHOULD BE EMPTY)
grep -rn "headers()\|cookies()" apps/web/app/\(marketing\) --include="*.tsx"

# Client components with server imports (SHOULD BE EMPTY)
grep -l "'use client'" apps/web --include="*.tsx" -r | xargs grep -l "@/lib/db" 2>/dev/null

# Wrong database imports (SHOULD BE EMPTY)
grep -rn "from '@/lib/db/client'" apps/web --include="*.ts" --include="*.tsx" | grep -v "lib/db/"

# Server components with hooks (SHOULD BE EMPTY)
grep -rn "useState\|useEffect\|useCallback" apps/web/app --include="*.tsx" | grep -v "'use client'"
```

---

**CRITICAL:** Focus on CRITICAL and HIGH severity issues first. These have the biggest impact on performance and correctness.
