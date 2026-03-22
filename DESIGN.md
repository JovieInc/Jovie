# Jovie Design System Boundaries

> Canonical filename: `DESIGN.md`. On this macOS worktree, `design.md` resolves to the same file path because the filesystem is case-insensitive.

## Purpose

Jovie intentionally uses two related but different Linear-inspired design systems:

- **Marketing / homepage system**: inspired by the `linear.app` homepage
- **Product / demo-inspired system**: inspired by `linear.app/demo` and Linear's app UI

The split is based on **surface purpose**, not route privacy. A public page is not automatically a marketing page. Mixing these systems casually creates inconsistent UX and should be treated as a bug unless the reason is documented in code review or PR notes.

## Canonical Surface Split

| Surface | Routes / entrypoints | Layout / shell | Design system | Notes |
| --- | --- | --- | --- | --- |
| Homepage storytelling marketing | `apps/web/app/(marketing)/page.tsx`, `apps/web/components/features/home/*` | `apps/web/app/(marketing)/layout.tsx` with `MarketingHeader` and `MarketingFooter` | Marketing / homepage | Acquisition-first, cinematic, proof-led |
| Secondary marketing pages | `apps/web/app/(marketing)/blog/*`, `changelog/*`, `support/*`, `pricing/*`, `launch/*`, `ai/*`, `engagement-engine/*`, `investors/*`, `tips/*` | `apps/web/app/(marketing)/layout.tsx` plus page-specific nested layouts | Marketing / homepage family | Same shell and token family, but denser and calmer than the homepage |
| Legal / public informational pages | `apps/web/app/(dynamic)/legal/*` | legal layout under `app/(dynamic)/legal` | Marketing / public informational | Public informational surfaces, not product shell |
| Product app shell | `apps/web/app/app/(shell)/*` | authenticated app shell | Product / demo-inspired | Dashboard, settings, admin, sidebars, tables, drawers, operational UI |
| Auth funnel | `apps/web/app/(auth)/*` | `AuthLayout` rendered inside `apps/web/app/(auth)/layout.tsx` | Product / demo-inspired | Sign in and sign up are funnel pages, not marketing |
| Onboarding funnel | `apps/web/app/onboarding/*` | `AuthLayout` with onboarding provider shell | Product / demo-inspired | Pre-dashboard but still product |
| Waitlist funnel | `apps/web/app/waitlist/*` | page renders through `AuthLayout` | Product / demo-inspired | Public route, but canonically part of the auth/product funnel |
| Public product surfaces | `apps/web/app/[username]/*` including `claim`, `contact`, `listen`, `tip`, `tour`, `shop`, `subscribe`, `notifications`, release pages under `[slug]` | username public layouts and page-specific shells | Public product surface | Public-facing product artifacts, not marketing storytelling pages |

## System A: Marketing / Homepage Design Language

The marketing system is the acquisition and storytelling layer. It is inspired by the `linear.app` homepage rather than the app UI.

- Visual intent: cinematic, editorial, launch-oriented, proof-led
- Typography: oversized marketing headlines, looser narrative spacing, long-view reading rhythm
- Layout rhythm: section intros, hero framing, controlled screenshot/mockup presentation, large vertical spacing
- Typical usage: homepage, feature launches, pricing marketing, investor-facing and content-marketing pages using the marketing shell

### Common primitives

- `homepage-section-shell`
- `homepage-section-intro`
- `homepage-section-intro-compact`
- `homepage-section-copy`
- `homepage-section-stack`
- `homepage-section-eyebrow`
- `homepage-surface-card`
- `marketing-h1-linear`
- `marketing-h2-linear`
- `marketing-lead-linear`

### Token / style ownership

- `apps/web/styles/linear-tokens.css`
- marketing-oriented composition in `apps/web/app/globals.css`
- marketing shell in `apps/web/app/(marketing)/layout.tsx`
- homepage implementation layer in `apps/web/components/features/home/*`

### Marketing has two tiers

#### Homepage storytelling pages

Examples:

- homepage
- launch-style hero pages
- acquisition-first product storytelling

Rules:

- strongest editorial rhythm
- largest headline scale
- most cinematic screenshot/mockup framing
- use homepage section primitives directly

#### Secondary marketing pages

Examples:

- blog
- changelog
- support
- pricing marketing pages
- informational pages under the marketing shell

Rules:

- use the marketing shell and marketing token family
- do **not** automatically inherit homepage-scale hero composition
- use denser, calmer, more content-oriented layouts than the homepage

## System B: Product / Demo-Inspired Design Language

The product system is the operational UI layer. It is inspired by the Linear app and `linear.app/demo`, not the homepage.

- Visual intent: compact, operational, systemized, tool-like
- Layout: denser spacing, higher information density, faster scanability
- Emphasis: surfaces, controls, panels, sidebars, tables, drawers, cards, settings chrome
- Typical usage: dashboard, settings, admin, product operations, auth funnel, onboarding, waitlist, public product utilities

### Common primitives and token families

- `bg-surface-*`
- `text-*-token`
- `border-subtle`, `border-default`, `border-strong`
- button variants
- app shadows
- sidebar, table, drawer, and panel conventions

### Token / style ownership

- `apps/web/styles/design-system.css`
- `apps/web/app/globals.css`
- `apps/web/tailwind.config.js`

## Auth / Onboarding / Waitlist Classification

Auth, onboarding, and waitlist are part of the **product funnel**. They belong to the **product / demo-inspired system**, not the homepage marketing system.

This is a canonical rule, not a temporary exception:

- auth pages render through `AuthLayout`
- onboarding pages currently render through `AuthLayout`
- waitlist currently renders through `AuthLayout` even though the route is public

These pages should:

- use `AuthLayout`-style funnel framing
- use product semantic tokens
- avoid homepage storytelling composition
- avoid marketing hero, homepage section, and marketing header/footer patterns

## Public Profiles Classification

Public profiles are **not** marketing pages.

They are public-facing product artifacts:

- expressive enough to represent a creator publicly
- still part of the product surface family
- not default candidates for homepage storytelling composition

If public profiles need a visual redesign, that should be treated as a **public-product** design problem, not a homepage marketing problem.

## Source-of-Truth File Map

| File | Responsibility |
| --- | --- |
| `apps/web/styles/design-system.css` | Canonical app/product token source |
| `apps/web/styles/linear-tokens.css` | Homepage/marketing-specific Linear-extracted tokens |
| `apps/web/app/globals.css` | Tailwind registration plus shared semantic utilities and marketing utility classes |
| `apps/web/app/(marketing)/layout.tsx` | Canonical marketing shell |
| `apps/web/components/site/MarketingHeader.tsx` | Marketing header/navigation behavior |
| `apps/web/components/site/MarketingFooter.tsx` | Marketing footer behavior |
| `apps/web/components/features/auth/AuthLayout.tsx` | Product-funnel shell for auth, onboarding, and waitlist |
| `apps/web/components/features/home/*` | Homepage marketing implementation layer |

`docs/DESIGN_TOKENS.md` remains the token-level reference. `DESIGN.md` is the boundary document for choosing the correct surface system.

## Hard Rules

### Do

- Use the marketing/homepage system for acquisition, storytelling, launch, and public informational pages.
- Use the product/demo-inspired system for sign-in, account setup, waitlist, dashboard, settings, admin, and product operation surfaces.
- Treat public creator pages as public product surfaces unless there is an explicit, documented reason not to.
- Document any intentional cross-system borrowing in code review or PR notes.

### Don't

- Do not use homepage section primitives on auth, onboarding, waitlist, dashboard, settings, admin, or other product flows.
- Do not use dashboard/sidebar/table/drawer composition as the base language for marketing pages.
- Do not treat all public pages as marketing pages.
- Do not assume that pages under the marketing shell should look like the homepage hero.

## Decision Tree For New Pages

1. Is the page selling, explaining, or launching the product?
   Use the marketing / homepage system.
2. Is the page helping a user sign in, join, wait, set up, or operate the product?
   Use the product / demo-inspired system.
3. Is the page a creator-facing public artifact?
   Treat it as a public product surface, not a marketing page by default.

## Known Current Exceptions / Notes

- Waitlist is public, but belongs to the product funnel.
- Onboarding is pre-dashboard, but still part of the product system.
- Secondary marketing pages share the marketing shell without inheriting homepage hero composition by default.
- Public profiles are public, but separate from marketing.
