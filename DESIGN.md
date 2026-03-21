# Design System: Marketing vs Product Split

Jovie uses **two intentionally different but related design systems**, both Linear-inspired. Mixing them is a bug unless explicitly documented in the [Grey Areas](#grey-areas) section below.

| System | Inspiration | Governs |
|--------|-------------|---------|
| **Marketing / homepage** | `linear.app` homepage | Acquisition, storytelling, launch pages |
| **Product / app** | `linear.app/demo` (product UI) | Dashboard, auth, onboarding, waitlist, settings, public product surfaces |

---

## Decision Tree

Use this first. If your new page doesn't clearly fit, check [Grey Areas](#grey-areas).

```
Is this page selling, explaining, or launching the product?
  YES → Marketing system (use MarketingLayout)
  NO ↓

Is this page helping a user sign in, set up, join waitlist, or operate the product?
  YES → Product system (use AuthLayout or app shell)
  NO ↓

Is this a public creator artifact or utility surface (profile, release, tip jar)?
  YES → Product system (product semantic tokens, no marketing layout)
  NO ↓

Default → Product system. Only use marketing if it's clearly acquisition-oriented.
```

---

## Surface Map

| Route group | System | Shell / Layout |
|-------------|--------|----------------|
| `app/(marketing)/*` | Marketing | `MarketingLayout` + `MarketingHeader` + `MarketingFooter` |
| `app/(marketing)/blog/*` | Marketing (content variant) | `MarketingLayout`, own post components |
| `app/(marketing)/changelog/*` | Marketing (content variant) | `MarketingLayout`, own changelog components |
| `app/(marketing)/tips/*` | Marketing (content variant) | `MarketingLayout`, own components |
| `app/(marketing)/support/*` | Marketing (content variant) | `MarketingLayout`, own components |
| `app/(marketing)/pricing/*` | Marketing | `MarketingLayout` + nested `pricing/layout.tsx` |
| `app/(marketing)/investors/*` | Marketing | `MarketingLayout` + nested `investors/layout.tsx` |
| `app/app/(shell)/*` | Product | Authenticated app shell (sidebar, dashboard chrome) |
| `app/(auth)/*` | Product | `AuthLayout` |
| `app/onboarding/*` | Product | `AuthLayout` (own provider shell in `onboarding/layout.tsx`) |
| `app/onboarding/checkout/*` | Product | `AuthLayout` |
| `app/waitlist/*` | Product | `AuthLayout` |
| `app/[username]` | Product (public) | Profile display — product tokens, no marketing layout |
| `app/[username]/claim/*` | Product (funnel) | Profile claiming flow |
| `app/[username]/tip/*`, `shop/*`, `subscribe/*` | Product (interactive) | Fan interaction utilities |
| `app/[username]/[slug]/*` | Product (content) | Release / smartlink pages |

**Note:** Blog, changelog, tips, and support live under `(marketing)` and use `MarketingLayout`, but they are **content pages** with their own component families — they do not use homepage section primitives like `homepage-section-shell` or `marketing-h1-linear`.

---

## Source-of-Truth Files

### CSS Architecture

One CSS graph, two composition layers:

```
globals.css
  └── imports design-system.css    ← base tokens for ALL surfaces
        └── imports linear-tokens.css  ← Linear-extracted tokens
```

All tokens are always loaded everywhere. The split is **compositional**, gated by the `.linear-marketing` class applied on the marketing layout root. You never need to "choose which CSS to import."

### File Ownership

| File | Owns | System |
|------|------|--------|
| `apps/web/styles/design-system.css` | Base token system (OKLCH surfaces, text, borders, buttons, sidebar, shadows, animations) | Product (shared base) |
| `apps/web/styles/linear-tokens.css` | 254 Linear-extracted tokens (spacing, typography, colors, layout) | Marketing-specific tokens |
| `apps/web/app/globals.css` | Tailwind registration, semantic utilities, homepage section classes | Both (composition layer) |
| `apps/web/app/(marketing)/layout.tsx` | Marketing shell — applies `.linear-marketing` class | Marketing |
| `apps/web/components/site/MarketingHeader.tsx` | Scroll-aware marketing nav | Marketing |
| `apps/web/components/site/MarketingFooter.tsx` | Minimal marketing footer | Marketing |
| `apps/web/components/features/home/*` | 80+ homepage section components | Marketing |
| `apps/web/components/features/auth/AuthLayout.tsx` | Shared auth/funnel shell (`bg-page`, `text-primary-token`) | Product |
| `apps/web/app/waitlist/page.tsx` | Waitlist — renders inside `AuthLayout` (product system, not marketing) | Product |

For token-level details (import order, OKLCH format, naming conventions, migration notes), see [`docs/DESIGN_TOKENS.md`](docs/DESIGN_TOKENS.md).

---

## Marketing / Homepage System

### Concrete primitives

These classes define the marketing composition layer. They are only meaningful inside `.linear-marketing` scope:

**Layout classes:**
- `homepage-section-shell` — section container, `max-width: 1250px`, centered
- `homepage-section-intro` — grid layout for section intros
- `homepage-section-intro-compact` — compact grid variant
- `homepage-section-copy` — constrained copy block, `max-width: 36rem`
- `homepage-section-stack` — vertical stack with section spacing
- `homepage-section-eyebrow` — inline-flex pill labels

**Typography classes:**
- `marketing-h1-linear` — responsive hero headline: `clamp(3.5rem, 11.2vw, 4.85rem)` → `5.8rem` at 1280px+, weight medium, line-height 0.9, tracking -0.034em
- `marketing-h2-linear` — responsive section headline: `clamp(2.15rem, 6vw, 3.5rem)`, weight medium, line-height 0.96, tracking -0.03em
- `marketing-lead-linear` — lead paragraph
- `marketing-body` — body text
- `marketing-cta` — call-to-action text

**Surface classes:**
- `homepage-surface-card` — elevated card for marketing sections

### Spacing rhythm

Section padding in `.jovie-homepage-marketing`:
- Mobile: `48px` top / `54px` bottom
- Tablet (768px+): `66px` top / `74px` bottom
- Desktop (1024px+): `80px` top / `88px` bottom

Content gaps: `16px` → `22px` → `28px` across breakpoints.

### Character

Cinematic, editorial, launch-oriented. Large headline scale, wide section spacing, proof-driven hero/product framing. Built for acquisition and storytelling.

### Used for

- Homepage (`/`)
- Launch pages (`/launch`)
- Feature marketing (`/ai`, `/engagement-engine`)
- Pricing (`/pricing`)
- Investor portal (`/investors`)
- Content pages that use the marketing shell: blog, changelog, tips, support (these use `MarketingLayout` but have their own component families)

---

## Product / Demo-Inspired System

### Concrete primitives

These tokens and classes are the default everywhere — no gating class needed:

**Surface tokens:**
- `bg-base`, `bg-surface-0`, `bg-surface-1`, `bg-surface-2`, `bg-surface-3` — elevation hierarchy
- `bg-page`, `bg-hover`, `bg-elevated`, `bg-input`, `bg-active`, `bg-button`

**Text tokens:**
- `text-primary-token` — headings, body
- `text-secondary-token` — secondary text
- `text-tertiary-token` — muted text
- `text-quaternary-token` — placeholders, disabled

**Border tokens:**
- `border-subtle` (6% opacity) / `border-default` (10%) / `border-strong` (18%) / `border-focus` (#7170ff)

**Utility classes:**
- `dashboard-heading` — bold heading with letter-spacing
- `dashboard-label` — 11px uppercase label
- `dashboard-body` — body text with font features
- `btn-primary`, `btn-secondary` — button styles
- `focus-ring` — focus ring utilities

**Shadows:**
- `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`
- `shadow-card`, `shadow-card-elevated` — card depth
- `shadow-divider` — inset divider
- `shadow-button-inset` — button depth

### Spacing rhythm

Product spacing scale (rem-based):
- `--space-1` through `--space-24`: `0.25rem` (4px) to `6rem` (96px)

Animation durations: `50ms` (instant) → `100ms` (fast) → `160ms` (normal) → `250ms` (slow) → `350ms` (slower)

### Character

Compact, operational, tool-like. Dense spacing, high information density. Sidebars, tables, panels, cards, drawers. Built for getting work done.

### Used for

- Dashboard, settings, admin (`app/app/(shell)/*`)
- Auth flows — sign in, sign up (`app/(auth)/*`)
- Onboarding (`app/onboarding/*`)
- Waitlist (`app/waitlist/*`)
- Public creator profiles (`app/[username]/*`)
- Release/smartlink pages (`app/[username]/[slug]/*`)

---

## Auth / Onboarding / Waitlist

These surfaces are **product system**, not marketing — even though they are public or semi-public entry flows.

| Surface | Shell | Layout |
|---------|-------|--------|
| Sign in / Sign up | `AuthLayout` | `(auth)/layout.tsx` (Clerk + feature flags) |
| Onboarding | `AuthLayout` | `onboarding/layout.tsx` (own Clerk + feature flags provider) |
| Checkout | `AuthLayout` | Under `onboarding/checkout/` |
| Waitlist | `AuthLayout` | `waitlist/layout.tsx` |

`AuthLayout` renders a centered, responsive form with `bg-page` and `text-primary-token` — product tokens throughout. No marketing hero patterns, no marketing header/footer.

---

## Hard Rules

1. **Do not** use homepage section primitives (`homepage-section-*`, `marketing-h*-linear`, `homepage-surface-card`) on auth, onboarding, waitlist, or app pages.
2. **Do not** use dashboard/table/sidebar primitives on marketing sections unless the page intentionally embeds a product demo.
3. Auth, onboarding, and waitlist **must** use `AuthLayout` and product semantic tokens — not marketing hero/header/footer patterns.
4. `app/(marketing)` pages **must** use `MarketingLayout` — not app-shell chrome.
5. Public profile routes (`app/[username]/*`) are **not** marketing pages — do not adopt homepage storytelling layout language.
6. New public acquisition pages → marketing system, unless clearly part of the product funnel.
7. New funnel steps continuing sign-in/account setup → product system, unless explicitly framed as marketing.
8. **Both systems must meet WCAG AA**: minimum 4.5:1 contrast for text, 44px minimum touch targets, full keyboard navigation, screen reader support.

---

## Grey Areas

Ambiguous cases where the system boundary isn't obvious:

| Scenario | Guidance |
|----------|----------|
| Marketing page embedding a live product demo or dashboard preview | Use marketing shell. Product data components render inside but **do not** adopt marketing typography or section spacing. |
| Product flow with celebration language (e.g., checkout success) | Stays in product system. Celebration is UX polish, not a system switch. |
| New public page that doesn't clearly fit either system | Default to product system unless it's acquisition/storytelling-oriented. |
| Marketing CTA in a product flow (e.g., upgrade prompts in dashboard) | Stays in product system. Use product button styles, not marketing hero patterns. |
| Blog post with embedded interactive product widget | Marketing shell for the page. Widget uses product component but inherits marketing container width. |

---

## Known Exceptions

- **Waitlist** is public-facing but functionally part of the auth/onboarding funnel — it uses `AuthLayout`, making it product system.
- **Onboarding** is pre-dashboard but uses `AuthLayout` with its own provider shell — product system, not marketing.
- Auth and onboarding share `AuthLayout` as a unified shell but have separate `layout.tsx` providers.
- Marketing pages are intentionally static with their own header/footer shell.
- The two systems **share underlying tokens** (all loaded via one CSS graph), but the **composition rules** are different — which classes you use, not which tokens are available.

---

## Maintaining This Document

Update `DESIGN.md` when:
- Adding a new route group or top-level route
- Moving or renaming layout files
- Creating a new public surface category
- Adding new CSS composition classes to either system
- Changing the classification of an existing surface

Stale paths are bugs. If a file path in this document no longer exists, fix the document.
