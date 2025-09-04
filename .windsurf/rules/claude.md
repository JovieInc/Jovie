---
trigger: always_on
---

## PR & Integration Rules
- Always: work on feature branches from `preview`; names `feat|fix|chore/<kebab-slug>`.
- Always: trigger PostHog events for key actions (both light/dark modes).
- Always: add unit + E2E smoke; pass typecheck, lint, unit, E2E; preview build succeeds.
- PR title: `[feat|fix|chore]: <slug>`; body: Goal, KPI (if any), PostHog events, Rollback plan.
- Fast-Path auto-promote: ≤200 LOC, ≤3 files, revenue/activation scope, smoke green.
- Branch protection: no direct pushes to `preview`/`production`; PRs only; keep branches in sync.

## Component Architecture (Atomic)
- One component per file. No default exports; named export matches file name.
- Atoms: UI-only, no business logic.
- Props interface: `<ComponentName>Props`; children as `React.ReactNode`.
- A11y: add `aria-*` where appropriate; stable `data-testid` on organisms.
- Use `forwardRef` for DOM-rendering atoms/molecules and set `displayName`.
- Deprecate via `/** @deprecated Reason */` and reference replacements.

## Design Aesthetic
- Color-agnostic brand; logo black/white only.
- Dark: black bg, white text/buttons; Light: white bg, black text/buttons.
- CTAs: black on dark, white on light; per-feature accents allowed.

## Copywriting
- Use “Jovie profile/handle/username”; never call Jovie a “link-in-bio”.
- Apple-level clarity; concise, active voice; YC focus on activation/MRR.

## Stack & Packages
- pnpm; Next.js App Router + RSC; Neon + Drizzle; Tailwind v4; HeadlessUI; Floating UI; Stripe.
- PostHog: import only via `@/lib/analytics` wrapper (never directly elsewhere).

## Runtime Modes (Vercel)
- Edge: latency-sensitive reads/public profile; add `export const runtime = 'edge'`.
- Node: Stripe webhooks/checkout, Node-only libs/crypto; add `export const runtime = 'nodejs'`.
- Never import Node-only libs in Edge code.

## Auth (Clerk)
- Use `clerkMiddleware()` in `middleware.ts`.
- Wrap app with `<ClerkProvider>` in `app/layout.tsx`.
- Server imports from `@clerk/nextjs/server`; client hooks as needed.
- Configure allowed Frontend URLs for preview/prod; set proper env vars.

## Database (Neon + Drizzle)
- Edge-safe client: `@neondatabase/serverless` + `drizzle-orm/neon-http`.
- Migrations: Node-only with drizzle-kit; optional Node driver for non-Edge.
- Per-request: set `app.user_id` session var for policies/auditing.
- Neon branch hygiene: per-feature branches; cap active branches; nightly preview reset.

## Postgres RLS Pattern
- Use `current_setting('app.user_id', true)` in select/insert/update policies.
- Never hardcode user IDs; always set session var server-side.

## Public Profile Performance
- Caching disabled for now; direct Neon queries; RSC streaming; PostHog tracking.
- Add Redis later when thresholds are met.

## Profile Images
- Seeded under `/public/avatars`; default fallback.
- User uploads: Vercel Blob; store URL/version; bump version for cache bust.
- Validate type/size; optionally preprocess; allow private blobs via signed proxy.
- `next/image` only; configure `images.remotePatterns` for blob host.

## Caching & Rate Limiting (Future)
- Disabled until needed; criteria: traffic/abuse/latency thresholds.

## PostHog (Analytics + Flags)
- Client init via provider; respect DNT. Server: use server SDK for secure capture and SSR flag checks when HTML must reflect split.
- Use Clerk `userId` as `distinct_id` when signed in; anonymous otherwise.
- Never import PostHog SDKs outside `@/lib/analytics` wrapper.

## Stripe
- Node-only routes: checkout, portal, webhooks with raw body.
- Store `stripe_customer_id` keyed by Clerk `userId`.
- Never import `stripe` in Edge code.

## Testing Strategy
- Pyramid: Unit (fast, majority) > Integration > E2E (golden paths).
- Speed budgets: unit <200ms each; integration <30s; E2E smoke <3m total.
- Mock external deps; flags define owner/expiry/killswitch; CI fails past expiry.
- CI fast checks: typecheck, lint, unit; PR checks add E2E smoke.

## Landmines
- Edge/Node leakage; Clerk host mismatch; wrong Neon client; running migrations in Edge; SSR flags; Tailwind v4 plugin drift; env separation; secret sprawl.

## Critical Module Protection
- Protected areas: marketing pages, Featured Creators, money path.
- No mocks/static lists; modify in place; keep `data-testid`s.
- CI: homepage smoke, no-mocks-in-prod lint, adapter contract, CODEOWNERS gate.

## Environment Variables
- Neon: `DATABASE_URL`.
- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, optional `CLERK_WEBHOOK_SECRET`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- PostHog: `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_API_KEY`, `POSTHOG_HOST`.
- Caching vars intentionally omitted until enabled.
