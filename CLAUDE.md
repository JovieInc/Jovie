# Claude AI Guidelines for Jovie Project (Next.js + Edge + Neon + Drizzle + Clerk + Upstash + Tailwind v4 + PostHog + Stripe)

## 🚦 Jovie PR & Integration Rules

1. **Intent**
   - Clearly define the purpose of the PR or integration.
   - Ensure it aligns with project goals and KPIs.
   - Keep scope focused on one primary user-visible outcome.

2. **Triggers**
   - Use feature flags to gate new functionality.
   - Name flags using lowercase snake_case: `feature_<slug>`.
   - Trigger PostHog events for key user actions.
   - Ensure events fire in all UI modes (light/dark).

3. **Environment & Branching**
   - Work exclusively on feature branches derived from `preview`.
   - Never push directly to `preview` or `production`.
   - Standard branch naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
   - Keep branch names scoped to 3–6 words in kebab-case.

4. **Smoke Steps**
   - Add unit tests for logic.
   - Add E2E smoke tests for primary happy path.
   - Verify lint, typecheck, unit, and E2E tests pass before merge.
   - Ensure preview deploy builds successfully.

5. **Policy**
   - PRs must be up-to-date with `preview`.
   - PR titles formatted as `[feat|fix|chore]: <slug>`.
   - PR body includes:
     1. Goal (1–2 sentences)
     2. KPI target (if applicable)
     3. Feature flag name
     4. New PostHog events added
     5. Rollback plan (typically "disable feature flag")
   - Auto-merge to `preview` allowed after green CI.
   - Promotion to `production` is manual via PR.

6. **Failure Behavior**
   - Disable feature flag to rollback.
   - Monitor Sentry and PostHog for errors.
   - Revert PR if critical issues arise.

7. **Success Behavior**
   - Enable flag internally first.
   - Verify metrics and events.
   - Roll out progressively to all users.

8. **PR Template**
   - Use the standardized template:

     ```
     Title: [feat|fix|chore]: <slug>

     ## Goal
     <1-2 sentences>

     ## KPI Target
     <if applicable>

     ## Feature Flag
     feature_<slug>

     ## PostHog Events
     - event_name_1
     - event_name_2

     ## Rollback Plan
     Disable feature flag
     ```

9. **Post-Open Flow**
   - Ensure PR is rebased onto latest `preview`.
   - Run all CI checks.
   - Address review comments promptly.
   - After merge, deploy preview with flag OFF.
   - Enable flag internally and monitor.

10. **Branching & Protection**
    - `preview` and `production` are protected.
    - No direct pushes allowed.
    - All changes via PR to `preview`.
    - Feature branches must be current with `preview`.
    - Manual promotion from `preview` to `production`.

---

## 🏗️ Component Architecture (Atomic Design + YC Principles)

### **Philosophy: Speed + Simplicity + Scale**

Follow Y Combinator principles: optimize for fast iteration, minimal cognitive overhead, and effortless scaling.

### **Directory Structure**

```
components/
├── atoms/           # Single-purpose, highly reusable primitives
├── molecules/       # Simple combinations of atoms
├── organisms/       # Complex, standalone component systems
├── templates/       # Layout patterns (rare, prefer page-level composition)
└── [feature]/       # Feature-specific components that don't fit atomic hierarchy
```

### **1. Atoms (components/atoms/)**
**Primitives with zero business logic.**

- **Purpose**: Single-responsibility UI primitives
- **Rules**: No business logic, no API calls, no feature dependencies
- **Examples**: `Button.tsx`, `Input.tsx`, `LoadingSpinner.tsx`, `QRCode.tsx`
- **Naming**: PascalCase, descriptive nouns (`LoadingSpinner`, not `Spinner`)

```typescript
// ✅ Good atom
export function Button({ children, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants[variant])} {...props}>{children}</button>
}

// ❌ Bad atom (has business logic)
export function LoginButton() {
  const { signIn } = useAuth() // ❌ Business logic
  return <button onClick={() => signIn()}>Login</button>
}
```

### **2. Molecules (components/molecules/)**
**Simple combinations solving specific problems.**

- **Purpose**: Combine 2-4 atoms for specific use cases
- **Rules**: Single clear purpose, minimal state, composable
- **Examples**: `AuthActions.tsx`, `DSPButtonGroup.tsx`, `QRCodeCard.tsx`
- **Naming**: PascalCase, describes the combination purpose

```typescript
// ✅ Good molecule
export function SearchField({ onSearch, placeholder }: SearchFieldProps) {
  return (
    <div className="flex gap-2">
      <Input placeholder={placeholder} />
      <Button onClick={onSearch}>Search</Button>
    </div>
  )
}
```

### **3. Organisms (components/organisms/)**
**Complex, self-contained systems.**

- **Purpose**: Complete UI sections with business logic
- **Rules**: Can contain state, API calls, complex interactions
- **Examples**: `HeaderNav.tsx`, `ProductFlyout.tsx`, `ProfileShell.tsx`
- **Naming**: PascalCase, describes the system function

```typescript
// ✅ Good organism
export function HeaderNav() {
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useAuth() // ✅ Business logic allowed
  
  return (
    <header>
      <Navigation />
      <AuthActions user={user} />
    </header>
  )
}
```

### **4. Feature Directories (components/[feature]/)**
**When atomic hierarchy doesn't fit.**

Use feature-based organization for:
- **Complex feature families**: `dashboard/`, `profile/`, `pricing/`
- **Domain-specific components**: `home/`, `creator/`, `tipping/`
- **Utility collections**: `site/`, `providers/`, `seo/`

```
components/
├── dashboard/
│   ├── atoms/        # Dashboard-specific atoms
│   ├── molecules/    # Dashboard-specific molecules  
│   ├── organisms/    # Dashboard-specific organisms
│   └── index.ts      # Export all dashboard components
└── home/
    ├── ClaimHandleForm.tsx
    ├── FeaturedArtists.tsx
    └── NewHomeHero.tsx
```

### **5. Import Conventions**

**Predictable import paths reduce cognitive load:**

```typescript
// Atomic hierarchy (global reusable)
import { Button } from '@/components/atoms/Button'
import { AuthActions } from '@/components/molecules/AuthActions'  
import { HeaderNav } from '@/components/organisms/HeaderNav'

// Feature-specific (domain-bounded)
import { ClaimHandleForm } from '@/components/home/ClaimHandleForm'
import { ProfileForm } from '@/components/dashboard/organisms/ProfileForm'

// Site infrastructure
import { Container } from '@/components/site/Container'
import { ClerkProvider } from '@/components/providers/ClerkProvider'
```

### **6. Anti-Patterns to Avoid**

❌ **Over-abstracting atoms**: Don't create `<GenericCard>` when you need `<PricingCard>`
❌ **Molecules with complex state**: Move to organisms if you need `useEffect`/`useState`  
❌ **Cross-domain imports**: Dashboard components shouldn't import from `/home`
❌ **Mixed hierarchies**: Don't put business logic in atoms

### **7. Migration Strategy**

**Current state**: Mixed `/ui` + atomic + feature directories  
**Target state**: Clean atomic hierarchy + feature domains

**Gradual approach**:
1. **New components**: Follow new structure immediately
2. **Refactoring**: Move components during feature work, not as separate effort
3. **Deprecation**: Mark old `/ui` imports with `@deprecated` comments

### **8. Component Checklist**

Before creating a component, ask:
1. **Reusability**: Used in 3+ places? → Atomic hierarchy  
2. **Domain specificity**: Feature-specific? → Feature directory
3. **Complexity**: Business logic? → Organism. Simple combination? → Molecule. Primitive? → Atom.
4. **Naming**: Clear, descriptive, follows existing patterns?

---

## 🎨 Design Aesthetic (Color-Agnostic, Apple-Inspired)

- **Core Principle**: Jovie’s design is **color-agnostic**. The brand is not tied to one palette. Like Apple, our logo and system adapt to whatever surface they’re on.

- **Logo**: 
  - Always black or white.  
  - Can sit on any background (dark, light, or colored).
  - Never treated as a “color brand mark.”  
  - Example: iPod era Apple logo — same white logo across multiple color backdrops.

- **UI Surfaces**:
  - **Dark Mode**: Black background, white text/buttons (pay buttons = solid black with white text).  
  - **Light Mode**: White background, black text/buttons (pay buttons = solid white with black text).  
  - **Landing Pages**: Each feature section can have its own accent color, but all system components remain neutral (black/white).

- **Buttons & Actions**:
  - Primary action buttons: all black with white text (dark mode), or all white with black text (light mode).  
  - No permanent “brand color” (blue, purple, etc.) for CTAs — instead, match Apple’s approach where context determines highlight.

- **Flexibility**:
  - Design should allow **per-feature accent colors** without breaking brand cohesion.  
  - Team uniforms, merch, and marketing surfaces can shift colors (red, green, blue, etc.) — the logo and system remain color-agnostic.

- **Inspirations**:
  - Apple Store shirts (different colors per day, same white logo).  
  - iPods in multiple colors, single white Apple logo.  
  - Apple landing pages (each product section has its own vibe but maintains a neutral core).

---

## 🧱 Stack & Packages (Pin to this shape)

- **Package Manager:** pnpm (preferred over npm for speed, determinism, and CI reliability)
- **Next.js (App Router, RSC):** `next`, `react`, `react-dom`
- **DB (Neon + Drizzle):** `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`
- **Auth (Clerk):** `@clerk/nextjs`
- **Cache/Rate Limit (Upstash Redis):** `@upstash/redis`, `@upstash/ratelimit`
- **CSS (Tailwind v4):** `tailwindcss` (v4), optional `clsx`, `tailwind-merge`
- **Analytics & Flags (PostHog):** `posthog-js` (client), `posthog-node` (server)
- **Billing (Stripe):** `stripe` (server), `@stripe/stripe-js` (client)

> Note: No Clerk Billing, no Supabase client SDK for data access.

---

## ⚙️ Runtime Modes on Vercel

- **Edge** for public profile reads and other latency‑sensitive, DB‑read paths.
  - In files: `export const runtime = 'edge'`.
- **Node** for Stripe webhooks, Stripe Checkout creators, heavy crypto, or any Node‑only libs.
  - In files: `export const runtime = 'nodejs'`.
- **Never import Node‑only libraries (e.g., `stripe`, `posthog-node`) in Edge code paths.**

---

## 🔐 Auth (Clerk) — Server‑First

- Add `middleware.ts` with `clerkMiddleware()`; protect only what is private.
- Server APIs/components: `import { auth, currentUser } from '@clerk/nextjs/server'`.
- Client: wrap app in `<ClerkProvider />`; use `useAuth()`/`useUser()` as needed.
- Env must be correct per domain (including previews):
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - Set allowed **Frontend URLs** in Clerk for `*.preview.jov.ie` and production.

---

## 🗄️ Database (Neon) with Drizzle — Edge‑Safe

**Edge client setup (per‑request):**
```ts
// db/index.ts (Edge‑safe)
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(process.env.DATABASE_URL!); // Neon HTTP pooled URL
export const db = drizzle(sql);
```

**Migrations (Node‑only):** run `drizzle-kit` via CI or scripts; never from Edge.

**Optional Node driver (non‑Edge):**
```ts
// db/node.ts (Node runtime only)
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
export const dbNode = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));
```

**Per‑request user context (for policies/auditing):**
```ts
// utils/session.ts
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';

export async function setSessionUser() {
  const { userId } = await auth();
  if (!userId) return;
  await db.execute(`set local "app.user_id" = '${userId}'`);
}
```

---

## 🛡️ Postgres Security & RLS Pattern

Use a PostgreSQL session variable (`app.user_id`) and reference it in RLS.

```sql
-- Enable RLS
alter table "users" enable row level security;

-- Read
create policy "Users can view own data" on "users"
for select using (current_setting('app.user_id', true) = user_id);

-- Insert
create policy "Users can insert own data" on "users"
for insert with check (current_setting('app.user_id', true) = user_id);

-- Update
create policy "Users can update own data" on "users"
for update using (current_setting('app.user_id', true) = user_id);
```

> Never hardcode user IDs in policies. Always set the session variable per request on the server before DB calls.

---

## 🚀 Public Profile Performance Recipe

1. **Runtime:** Edge route/handler (fast TTFB).
2. **Cache first:** Read `profile:${slug}` from Upstash Redis; on miss, query Neon via `neon-http` and store compact JSON.
3. **TTL:** 60–180s with simple `DEL` invalidation on writes; consider a version key per profile.
4. **RSC streaming:** Use Suspense/streaming; ship only the minimal client JS.
5. **PostHog tracking:** client‑side (deferred) and optionally server event for critical counters.

## 🖼️ Profile Images (Seeded & User Uploads)

1. **Seeded Creators**
   - Store static images in `/public/avatars/<slug>.jpg`.
   - Provide a universal fallback at `/public/avatars/default.png`.
   - Use `next/image` directly for optimal caching.

2. **User Uploads**
   - Use **Vercel Blob** for storage (fast, CDN-backed).
   - Key format: `avatars/users/{userId}/v{timestamp}.jpg` and `avatars/creators/{id}/v{timestamp}.jpg`.
   - Store only the blob URL (and version) in Neon DB.
   - Replace versions by bumping `v{timestamp}` to force cache bust.

3. **Security & Limits**
   - Validate file size ≤ 4MB and type (`jpeg|png|webp`).
   - Rate-limit uploads with Upstash Redis (e.g., 3/min/user).
   - Optionally preprocess with Sharp for 1024×1024 max, 82% JPEG.

4. **next.config**
   ```js
   images: {
     remotePatterns: [
       { protocol: 'https', hostname: 'blob.vercel-storage.com' },
     ],
     formats: ['image/avif','image/webp'],
   }
   ```

5. **Cleanup & Privacy**
   - On profile deletion, remove blob via `@vercel/blob`.
   - For private avatars, mark blobs `private` and serve via signed proxy route.

6. **UI**
   - Always render with `next/image` for responsive optimization.
   - Default to fallback or generated initials (e.g., Dicebear) if no upload.

---

## ☁️ Upstash Redis (Edge‑friendly)

```ts
// lib/redis.ts
import { Redis } from '@upstash/redis';
export const redis = Redis.fromEnv();
```

- Use `@upstash/ratelimit` for IP/slug rate limits on public endpoints.
- Keep tokens server‑only; never expose to the browser.
- Optionally use **QStash** for webhook fan‑out/retries (Stripe, Clerk) with DLQ.

---

## 📊 PostHog (Analytics + Flags)

- **Client:** initialize `posthog-js` in a small provider; respect `doNotTrack`.
- **Server:** use `posthog-node` in Node routes for secure event capture and **server‑side flag checks** when SSR must reflect a flag (prevents UI flicker).
- Use Clerk `userId` as `distinct_id` when authenticated; anonymous IDs for public.

---

## 💳 Stripe (Direct; no Clerk Billing)

- **Checkout creator (Node):** `/app/api/stripe/checkout/route.ts`.
- **Customer Portal (Node):** `/app/api/stripe/portal/route.ts`.
- **Webhooks (Node):** `/app/api/stripe/webhook/route.ts` using `stripe.webhooks.constructEvent` with **raw body**.
- Store `stripe_customer_id` keyed by Clerk `userId` in your DB. Do not use Clerk Billing components.

**Do not** import `stripe` in any Edge runtime code.

---

## 🧪 Testing Strategy (Y Combinator Optimized)

### **Philosophy: Fast Feedback > Perfect Coverage**

Y Combinator principle: Ship fast, iterate faster. Testing should accelerate development, not slow it down.

### **Testing Pyramid (Optimized for Speed)**

```
           /\
          /  \        E2E (5-10 tests)
         /____\       ↑ High confidence, slow, expensive
        /      \      
       /  INTEG  \    Integration (20-30 tests) 
      /__________\    ↑ Medium confidence, medium speed
     /            \
    /    UNIT      \  Unit (80-100+ tests)
   /________________\ ↑ Fast feedback, cheap, high velocity
```

### **1. Unit Tests (80% of coverage, < 200ms each)**

**Target**: Business logic, utilities, pure functions  
**Tool**: Vitest  
**Location**: `tests/unit/`  
**Speed**: < 200ms per test, < 5s total suite

```typescript
// ✅ Good unit test - Fast, focused, no dependencies
describe('formatPrice', () => {
  it('formats USD correctly', () => {
    expect(formatPrice(1500, 'usd')).toBe('$15.00')
  })
})

// ❌ Bad unit test - Slow, complex setup
describe('UserDashboard', () => {
  it('renders with real API', async () => {
    const response = await fetch('/api/user') // ❌ Real network call
    // ... complex setup
  })
})
```

**Mock aggressively**: Stripe, Clerk, Upstash, PostHog, database calls

### **2. Integration Tests (15% of coverage, < 30s each)**

**Target**: API routes, database operations, component integration  
**Tool**: Vitest + test database  
**Location**: `tests/integration/`

```typescript
// ✅ Good integration test
describe('POST /api/profiles', () => {
  it('creates profile with valid data', async () => {
    const response = await POST('/api/profiles', validProfileData)
    expect(response.status).toBe(201)
    
    // Verify in test database
    const profile = await db.select().from(profiles).where(...)
    expect(profile).toBeDefined()
  })
})
```

### **3. E2E Tests (5% of coverage, critical paths only)**

**Target**: Core user journeys that generate revenue  
**Tool**: Playwright  
**Location**: `tests/e2e/`

**Golden Path Priority**:
1. **Sign up → Create profile → Share link** (revenue impact: high)
2. **Visit profile → Click music links** (engagement: high)  
3. **Upgrade → Remove branding** (revenue: direct)

```typescript
// ✅ Focused E2E test
test('Golden path: Sign up to live profile @smoke', async ({ page }) => {
  await signUp(page, testUser)
  await createProfile(page, profileData)
  await shareProfile(page)
  
  // Verify public profile works
  await page.goto(`/${profileData.username}`)
  await expect(page.getByText(profileData.name)).toBeVisible()
})
```

### **4. Testing Commands (Fast by Default)**

```bash
# Fast feedback loop (< 5s)
pnpm test                    # Unit tests only
pnpm test:watch              # Watch mode for development

# Pre-commit verification (< 30s)  
pnpm test:ci                 # Unit + coverage report

# Full confidence (< 3min)
pnpm test:e2e:smoke          # Critical paths only (@smoke tag)
pnpm test:e2e:golden-path    # Revenue-generating flows

# Full suite (CI only, < 10min)
pnpm test:e2e:full           # All E2E tests
```

### **5. Coverage Targets (Pragmatic)**

- **Functions/Lines**: 80%+ (focus on business logic)
- **Branches**: 70%+ (edge cases for critical paths only)  
- **Components**: 60%+ (atoms/molecules, skip complex organisms)

**Don't test**:
- Third-party libraries (Clerk, Stripe SDKs)
- Simple pass-through components
- Styling/layout (use visual regression sparingly)
- Generated code (Drizzle migrations)

### **6. Test Organization**

```
tests/
├── unit/
│   ├── components/          # Component logic (not rendering)
│   ├── lib/                # Business logic, utilities
│   └── api/                # API route handlers (mocked)
├── integration/
│   ├── api/                # Real API + test database
│   └── components/         # Component + dependencies
├── e2e/
│   ├── golden-path.spec.ts # Revenue-critical flows
│   ├── smoke.spec.ts       # Basic functionality
│   └── regression.spec.ts  # Bug prevention
└── fixtures/               # Test data, mocks, helpers
```

### **7. Component Testing Strategy**

**Atomic Design Testing**:
- **Atoms**: Test props → output (pure function style)
- **Molecules**: Test interactions between atoms
- **Organisms**: Integration tests with mocked services  
- **Pages**: E2E only (too complex for unit testing)

```typescript
// ✅ Atom test (fast, focused)
describe('Button', () => {
  it('applies variant classes correctly', () => {
    render(<Button variant="primary">Click</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600')
  })
})

// ✅ Organism test (mock dependencies)
describe('HeaderNav', () => {
  it('shows auth actions when signed out', () => {
    vi.mocked(useUser).mockReturnValue({ isSignedIn: false })
    render(<HeaderNav />)
    expect(screen.getByText('Sign in')).toBeVisible()
  })
})
```

### **8. Performance Testing Rules**

- **Unit tests**: < 200ms each, fail CI if slower
- **Integration**: < 30s each, run in parallel when possible
- **E2E**: < 3min total for smoke tests
- **Database**: Use transactions + rollback for isolation

### **9. Mocking Strategy**

**Mock everything external**:
```typescript
// Global mocks (vitest.setup.ts)
vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(() => ({ isSignedIn: false })),
  useAuth: vi.fn(() => ({ userId: null }))
}))

vi.mock('stripe', () => ({
  default: vi.fn(() => mockStripe)
}))
```

**Selective mocking for integration**:
```typescript
// Mock only third-party services, keep internal logic
vi.mock('@/lib/stripe', () => ({
  createCheckoutSession: vi.fn()
}))
```

### **10. Test-First Development**

For new features, write tests first:
1. **Red**: Write failing test defining expected behavior
2. **Green**: Write minimal code to make test pass
3. **Refactor**: Optimize while keeping tests green

**Exception**: UI experimentation and design iteration skip test-first

### **11. CI/CD Integration**

**Fast checks** (every push):
```yaml
- pnpm typecheck     # < 10s
- pnpm lint          # < 5s
- pnpm test          # < 5s
```

**Full checks** (PR merge):
```yaml
- pnpm test:ci       # < 30s (with coverage)
- pnpm test:e2e:smoke # < 3min
```

**Nightly** (catch regressions):
```yaml
- pnpm test:e2e:full # < 10min
```

---

## ❗ Landmines to Avoid

1. **Edge/Node Leakage:** Importing `stripe`, `posthog-node`, or Node crypto in Edge routes will fail.
2. **Clerk Host Mismatch:** Frontend URLs (incl. preview domains) must be configured in Clerk or you get `Invalid host/JWT` errors.
3. **Wrong Neon Client:** Use `@neondatabase/serverless` + `drizzle-orm/neon-http` on Edge. Node pg pool only in Node runtime.
4. **Running Migrations in Edge:** Never run `drizzle-kit` in Edge paths.
5. **Cache Invalidation:** Always `DEL` or bump a version key on profile edits/plan changes.
6. **SSR Feature Flags:** Resolve PostHog flags server‑side when HTML must reflect the split.
7. **Stripe Webhooks:** Must be Node runtime with raw body; avoid middleware that consumes the body.
8. **Tailwind v4 Plugin Drift:** Remove/replace plugins not v4‑compatible.
9. **Env Separation:** Separate keys/projects for preview vs prod (Clerk, PostHog, Stripe). Avoid data mixing.
10. **Secret Sprawl:** Keep secrets in Vercel envs; do not import into client bundles.

---

## 🔑 Environment Variables (by system)

```bash
# Neon
DATABASE_URL=postgresql://...

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
# (Optionally) CLERK_WEBHOOK_SECRET=whsec_...

# Upstash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_...
POSTHOG_API_KEY=phx_...
POSTHOG_HOST=https://us.i.posthog.com # or EU/self-host
```

---

## 🚦 CI/CD Pipeline (GitHub Actions)

### Fast Checks (Always Run)
- **Typecheck**: `pnpm typecheck` - TypeScript validation
- **Lint**: `pnpm lint --max-warnings=0` - ESLint with zero warnings policy

### Full CI Triggers
- **Production PRs**: Always run full suite
- **Push to preview/production**: Always run full suite  
- **Merge queue**: Always run full suite
- **'full-ci' label**: Forces full suite on any PR

### Full CI Jobs
- **Drizzle Check**: `pnpm drizzle:check` - Database schema validation
- **Build**: `pnpm build` - Next.js production build
- **Unit Tests**: `pnpm test` - Vitest unit test suite
- **E2E Tests**: `pnpm test:e2e` - Playwright end-to-end tests

### Path Guards (Skip CI if no relevant changes)
- **Critical paths**: `app/`, `components/`, `lib/`, `tests/`, `package*.json`, `next.config.js`
- **DB paths**: `drizzle/`, `lib/db/`, `drizzle.config.ts`, `package*.json`, `pnpm-lock.yaml`

### Commands for Local Development
```bash
# Run all checks that CI runs
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# Run specific CI jobs
pnpm drizzle:check      # Validate schema changes
pnpm test:e2e          # Run E2E tests locally
```

### Branch Protection & Auto-merge
- **preview**: Protected, requires CI + auto-merge eligible
- **production**: Protected, requires manual review + full CI
- Auto-merge handles dependency updates and codegen PRs

---

## 📚 Resources

- Drizzle ORM: https://orm.drizzle.team/docs
- Neon Serverless: https://neon.tech/docs/introduction
- Clerk + Next.js: https://clerk.com/docs/quickstarts/nextjs
- Postgres RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Upstash Redis: https://upstash.com/docs/redis
- PostHog: https://posthog.com/docs
- Stripe API: https://stripe.com/docs/api
