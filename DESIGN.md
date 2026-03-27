# Jovie Design System

> **Baseline:** Linear.app March 2026 UI refresh (changelog 2026-03-12).
> **Strategy:** Start from Linear's proven design system, lock it as baseline, evolve into Jovie's own identity later.
> **Color space:** OKLCH (with LCH for values extracted directly from Linear's CSS).

---

## Surface Classification

Jovie uses two related but distinct design systems based on surface purpose:

| Surface | System | Mood | Routes |
|---------|--------|------|--------|
| Marketing / homepage | System A | Cinematic, editorial, proof-led | `(marketing)/*`, blog, changelog, pricing, support |
| Product app shell | System B | Compact, operational, tool-like | `app/*`, settings, admin, dashboard |
| Auth / onboarding / waitlist | System B | Funnel-focused, product family | `(auth)/*`, `onboarding/*`, `waitlist/*` |
| Public profiles | System B (public variant) | Expressive but product-native | `[username]/*` |
| Legal / informational | System A (calmer variant) | Clean, readable | `(dynamic)/legal/*` |

**Decision tree:** Selling/explaining → System A. Operating/using → System B. Public artifact → System B.

See the [Surface Classification](#canonical-surface-split) section below for full route mapping.

---

## Typography

**Font:** Inter Variable (self-hosted, weight range 100–900)

### Font Weights

| Name | Value | Usage |
|------|-------|-------|
| normal | 400 | Body text, nav links, secondary content |
| book | 450 | Linear's default UI weight — app body, labels, descriptions |
| medium | 510 | Headlines, nav items, workspace name, captions |
| semibold | 590 | Section headings, emphasis |
| bold | 680 | Strong emphasis, rare |

### Type Scale — Marketing (System A)

| Level | Size | Weight | Letter-spacing | Line-height | Usage |
|-------|------|--------|----------------|-------------|-------|
| H1 | 64px | 510 | -1.408px (-2.2%) | 67.84px (1.06) | Hero headlines |
| H2 | 48px | 510 | -1.056px (-2.2%) | 48px (1.0) | Section headlines |
| H3 | 20px | 590 | -0.24px (-1.2%) | 26.6px (1.33) | Sub-section titles |
| H4 | 18px | 538 | — | 24px (1.33) | Card titles |
| Body LG | 24px | 400 | -0.288px (-1.2%) | 31.92px (1.33) | Lead paragraphs |
| Body | 15px | 400 | -0.165px (-1.1%) | 24px (1.6) | Body text |
| Body SM | 14px | 400 | -0.182px (-1.3%) | 21px (1.5) | Small body |
| Caption | 13px | 510 | -0.13px (-1.0%) | 19.5px (1.5) | Captions, meta |
| Label | 12px | 400 | — | 19.2px (1.6) | Labels, tags |

### Type Scale — App (System B)

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| 2xs | 11px | 450 | Counts, badges, small indicators |
| App default | 13px | 450 | Linear's primary app text size |
| Nav item | 12px | 500 | Sidebar navigation |
| Workspace name | 13px | 500 | Sidebar workspace label |
| Heading | 13px | 510 | List/view headings |
| Body | 15px | 400 | Document body, descriptions |

### Responsive Typography

| Level | Small (mobile) | Medium | Large (desktop) |
|-------|---------------|--------|-----------------|
| H1 | 38px | 56px | 64px |
| H2 | 24px | 36px | 48px |
| Body LG | 16px | — | 17px |

### OpenType Features

```css
font-feature-settings: "cv01", "ss03";
```

---

## Color System

### Theme Generation

Three input variables generate the entire palette:

```css
--theme-base-hue: 282;       /* Blue-purple neutral foundation */
--theme-base-chroma: 0.015;  /* Very low — nearly neutral grays */
--theme-contrast: 65;        /* 0–100 contrast scale */
```

### App Colors — Light Mode (System B)

| Token | Value | Hex approx | Usage |
|-------|-------|-----------|-------|
| `--color-bg-base` | `#f5f5f5` | — | Sidebar, page background |
| `--color-bg-surface-0` | `#f5f5f5` | — | Page background |
| `--color-bg-surface-1` | `oklch(100% 0 0)` | `#ffffff` | Elevated surfaces, cards, panels |
| `--color-bg-surface-2` | `#f2f3f5` | — | Hover states, secondary surfaces |
| `--color-bg-surface-3` | `#ebecef` | — | Pressed states, inputs |
| `--color-bg-primary` | `lch(98.94% 0.5 282)` | `#fcfcfd` | Primary content area |
| `--color-bg-secondary` | `lch(95.94% 0.5 282)` | `#f3f3f5` | Secondary surfaces, sidebar |
| Text primary | `lch(9.894% 0 282)` | `#0c0c0c` | Headings, primary text |
| Text secondary | `lch(19.788% 1.25 282)` | `#2e2f31` | Body text, labels |
| Text tertiary | `lch(39.576% 1.25 282)` | `#5a5b5d` | Descriptions, meta |
| Text quaternary | `lch(65.3% 1.25 282)` | `#9a9b9d` | Placeholders |
| Border subtle | `oklch(0% 0 0 / 6%)` | — | Dividers |
| Border default | `oklch(0% 0 0 / 10%)` | — | Borders |
| Border strong | `oklch(0% 0 0 / 18%)` | — | Emphasis |
| Accent | `#7170ff` | — | Focus rings, active states, links |
| Accent hover | `#828fff` | — | Hover state |

### App Colors — Dark Mode (System B)

| Token | Value | Hex | Usage |
|-------|-------|-----|-------|
| `--color-bg-base` | `#08090a` | — | Sidebar, page background |
| `--color-bg-surface-0` | `#0f1011` | — | Primary app surface |
| `--color-bg-surface-1` | `#1c1c1f` | — | Cards, panels |
| `--color-bg-surface-2` | `#23252a` | — | Inputs, elevated |
| `--color-bg-surface-3` | `#2a2c32` | — | Modals, tooltips |
| Text primary | `lch(100% 0 282)` | `#ffffff` | Headings |
| Text secondary | `lch(90.65% 1.35 282)` | `#E3E4E6` | Body, labels (bright!) |
| Text tertiary | `lch(62.6% 1.35 282)` | `#969799` | Descriptions, meta |
| Text quaternary | `#62666d` | — | Placeholders |
| Content text | `#6b6f76` | — | Content/meta |
| Highlight text | `#ffffff` | — | Highlighted content |
| Border subtle | `rgba(255,255,255,0.05)` | — | Dividers |
| Border default | `rgba(255,255,255,0.08)` | — | Borders |
| Border strong | `rgba(255,255,255,0.10)` | — | Emphasis |
| Accent | `#7170ff` | — | Same as light mode |

### Marketing Colors (System A — Dark by Default)

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#000000` | Pure black |
| Primary text | `#F7F8F8` | Headlines, primary |
| Body text | `#A2A7AF` | Paragraphs |
| Muted text | `#8A8F98` | Nav items, secondary |
| Quaternary text | `#62666d` | Subtle, disabled |
| CTA accent | `#5E6AD2` | Linear indigo — sign-up buttons |
| App accent | `#7170ff` | In-app accent (different from marketing CTA) |
| Login button bg | `rgba(255,255,255,0.1)` | Subtle glass |
| Header bg | `transparent` | Blur backdrop |

### Gray Scale (Radix-style)

Pure neutral HSL — no hue tint. Used across both systems.

| Token | Value | Approx hex |
|-------|-------|-----------|
| `--gray1` | `hsl(0, 0%, 99%)` | `#fcfcfc` |
| `--gray2` | `hsl(0, 0%, 97.3%)` | `#f8f8f8` |
| `--gray3` | `hsl(0, 0%, 95.1%)` | `#f3f3f3` |
| `--gray4` | `hsl(0, 0%, 93%)` | `#ededed` |
| `--gray5` | `hsl(0, 0%, 90.9%)` | `#e8e8e8` |
| `--gray6` | `hsl(0, 0%, 88.7%)` | `#e2e2e2` |
| `--gray7` | `hsl(0, 0%, 85.8%)` | `#dbdbdb` |
| `--gray8` | `hsl(0, 0%, 78%)` | `#c7c7c7` |
| `--gray9` | `hsl(0, 0%, 56.1%)` | `#8f8f8f` |
| `--gray10` | `hsl(0, 0%, 52.3%)` | `#858585` |
| `--gray11` | `hsl(0, 0%, 43.5%)` | `#6f6f6f` |
| `--gray12` | `hsl(0, 0%, 9%)` | `#171717` |

### Semantic Status Colors

| Token | Value | Usage |
|-------|-------|-------|
| Success | `oklch(72% 0.2 145)` | Green — confirmations |
| Warning | `oklch(82% 0.17 85)` | Amber — cautions |
| Error | `oklch(65% 0.2 25)` | Red — errors, destructive |

---

## Spacing

**Base unit:** 4px

| Token | Value | Usage |
|-------|-------|-------|
| space-1 | 4px | Tight gaps (icons, badges) |
| space-2 | 8px | Button gaps, inline spacing |
| space-3 | 12px | Content padding, list gaps |
| space-4 | 16px | Card padding, form gaps |
| space-5 | 20px | Section inner spacing |
| space-6 | 24px | Card gaps, group spacing |
| space-8 | 32px | Large gaps |
| space-10 | 40px | Content gaps (small) |
| space-12 | 48px | Footer padding |
| space-16 | 64px | Content gaps (medium) |
| space-20 | 80px | Section padding (medium) |
| space-24 | 96px | Section padding (large) — marketing standard |
| space-28 | 112px | Extra-large sections |
| space-32 | 128px | Hero spacing |
| space-40 | 160px | Maximum section spacing |

### Section Padding

| Size | Padding-top | Padding-bottom | Usage |
|------|-------------|----------------|-------|
| Small | 56px | 56px | Compact sections |
| Medium | 80px | 80px | Standard sections |
| Large | 120px | 120px | Hero, key sections |

### Container Widths

| Token | Value | Usage |
|-------|-------|-------|
| Homepage max | 1344px | Full-width marketing |
| Container | 1298px | Standard container |
| Content | 1200px | Content area |
| Hero section | 1024px | Hero content |
| Prose | 624px | Long-form text |
| Pricing grid | 1024px | Pricing layout |

---

## Borders & Radius

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| xs | 2px | Tags, tiny elements |
| DEFAULT | 4px | Marketing buttons (preserved — changing risks silent regressions across all DEFAULT consumers) |
| sm | 8px | Badges, issue rows, small cards |
| md | 10px | Inner cards, drawer cards, properties panels |
| lg | 12px | App shell frame, content surface cards |
| xl | 16px | Large decorative elements |
| pill | 9999px | App buttons, inputs, controls, tab buttons |

### App Shell Radius

| Token | Value |
|-------|-------|
| App shell gap | 8px |
| Inner cards | 10px |
| Nested cards | 8px |
| App item | 8px |
| App menu | 8px |
| App shell frame | 12px |
| App control | 9999px (pill) |

---

## Shadows

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| sm | `0px 4px 4px -1px #0000000a, 0px 1px 1px 0px #00000014` | Subtle depth |
| md | `0 3px 8px #0000001a, 0 2px 5px #0000001a, 0 1px 1px #0000001a` | Cards |
| lg | `0 4px 40px #00000014, 0 3px 20px #0000001a, 0 2px 6px #00000014, 0 1px 1px #0000000f` | Elevated |
| xl | `0 5px 50px #00000033, 0 4px 30px #00000033, 0 3px 10px #0000001a` | Modals |
| card | Ring border + soft depth (Linear signature) | Cards |
| button | Layered shadow — `0px 8px 2px` through `0px 0px 1px` | Buttons |

### Dark Mode

| Token | Value | Usage |
|-------|-------|-------|
| sm | `0px 4px 4px -1px #0000000f, 0px 1px 1px 0px #0000001e` | Subtle |
| card | `rgba(0,0,0,0.2) 0px 0px 0px 1px, rgba(0,0,0,0.4) 0px 2px 4px` | Ring + depth |
| elevated | `rgba(0,0,0,0.2) 0px 0px 12px inset, rgba(0,0,0,0.2) 0px 4px 24px` | Modals |

---

## Motion

| Token | Duration | Usage |
|-------|----------|-------|
| instant | 50ms | Immediate feedback |
| fast | 100ms | Hover states, toggles |
| normal | 150ms | **THE standard** — buttons, transitions |
| slow | 200ms | Panels, reveals |
| slower | 250ms | Modals, drawers |
| slowest | 300ms | Complex animations |

**Easing:** `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — `--ease-interactive`

**Header blur:** 20px backdrop-filter

**Reduced motion:** Respects `prefers-reduced-motion: reduce` — transitions drop to 0ms.

---

## Component Patterns

### Buttons

| Variant | Light bg | Light fg | Dark bg | Dark fg |
|---------|----------|----------|---------|---------|
| Primary | `oklch(10% 0 0)` | `oklch(100% 0 0)` | `#e6e6e6` | `#08090a` |
| Secondary | `oklch(93% chroma hue)` | `oklch(20% 0 0)` | `oklch(19% chroma hue)` | `oklch(90% 0 0)` |
| Accent | `#7170ff` | white | `#7170ff` | white |
| Marketing CTA | `#5E6AD2` | white | `#5E6AD2` | white |

Height: sm=32px, md=40px. Radius: pill (9999px) for app, 6px for marketing. Padding: 12px horizontal.

### Sidebar (App Shell)

| Token | Light | Dark |
|-------|-------|------|
| Width | 244px | 244px |
| Background RGB | `247 248 248` | `15 16 17` |
| Foreground RGB | `18 18 20` | `227 228 229` |
| Border RGB | `0 0 0 / 0.06` | `255 255 255 / 0.06` |
| Accent RGB | `242 243 245` | `255 255 255 / 0.03` |
| Item foreground RGB | `88 90 96` | `214 218 226` |
| Item icon RGB | `122 125 132` | `116 120 128` |
| Muted RGB | `112 116 124` | `107 111 118` |
| Nav font | 12px / weight 500 | — |
| Item font | 13px / weight 450 | — |

### App Shell Frame

| Token | Light | Dark |
|-------|-------|------|
| Gap | 8px | 8px |
| Radius | 12px | 12px |
| Border | `rgba(0,0,0,0.065)` | `rgba(255,255,255,0.05)` |
| Sidebar seam | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.05)` |
| Frame seam | `rgba(0,0,0,0.055)` | `rgba(255,255,255,0.04)` |
| Shadow | `0 0 0 1px rgba(0,0,0,0.045), 0 18px 42px rgba(0,0,0,0.055)` | deeper |

### Right Panel Cards

| Token | Light | Dark |
|-------|-------|------|
| Background | `var(--linear-app-content-surface)` (flat — no `color-mix()`) | same token |
| Border | `frame-seam token` (thin left-border divider) | same token |
| Radius | 10px | 10px |
| Layout | Right panel lives inside `<main>` content card — sidebar and panel share one unified card | same |
| Pattern | `EntitySidebarShell` + `DrawerSurfaceCard variant='card'` | same |

### Button Tabs

| Token | Light | Dark |
|-------|-------|------|
| Background | `lch(94.483% 0.5 282)` | `rgba(255,255,255,0.05)` |
| Text color | `lch(9.894% 0 282)` | `lch(100% 0 282)` |
| Border | `lch(0% 0 0 / 0.149)` | `rgba(255,255,255,0.08)` |
| Shadow | `0px 3px 6px -2px lch(0% 0 0 / 0.02), 0px 1px 1px lch(0% 0 0 / 0.04)` | none |
| Icon color | `lch(39.576% 1.25 282)` | `lch(62.6% 1.35 282)` |

### Badges / Tags

| Token | Light | Dark |
|-------|-------|------|
| Background | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.05)` |
| Border | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.05)` |
| Text | `oklch(10% 0 0)` | `#F7F8F8` |
| Radius | 8px | 8px |
| Font | 10px / weight 510 | — |

### Row / Table States

| State | Light | Dark |
|-------|-------|------|
| Hover | `oklch(96.2% 0.003 260)` | `rgba(255,255,255,0.022)` |
| Selected | `oklch(94.8% 0.006 260)` | `rgba(255,255,255,0.048)` |

---

## Canonical Surface Split

| Surface | Routes / entrypoints | Layout / shell | Design system |
|---------|---------------------|----------------|---------------|
| Homepage storytelling | `(marketing)/page.tsx`, `components/features/home/*` | `(marketing)/layout.tsx` with `MarketingHeader` + `MarketingFooter` | System A |
| Secondary marketing | `(marketing)/blog/*`, `changelog/*`, `support/*`, `pricing/*`, `launch/*`, `ai/*`, `engagement-engine/*`, `investors/*`, `tips/*` | `(marketing)/layout.tsx` + page-specific nested layouts | System A (calmer) |
| Legal / informational | `(dynamic)/legal/*` | Legal layout | System A (informational) |
| Product app shell | `app/(shell)/*` | Authenticated app shell | System B |
| Auth funnel | `(auth)/*` | `AuthLayout` | System B |
| Onboarding funnel | `onboarding/*` | `AuthLayout` with onboarding provider | System B |
| Waitlist funnel | `waitlist/*` | `AuthLayout` | System B |
| Public product surfaces | `[username]/*` (claim, contact, listen, tip, tour, shop, subscribe, notifications, releases) | Username public layouts | System B (public variant) |

### Rules

**Do:**
- Use System A for acquisition, storytelling, launch, and public informational pages
- Use System B for sign-in, account setup, waitlist, dashboard, settings, admin
- Treat public creator pages as public product surfaces
- Document any intentional cross-system borrowing in PR notes

**Don't:**
- Use homepage section primitives on auth, onboarding, dashboard, or settings
- Use dashboard/sidebar/table composition on marketing pages
- Treat all public pages as marketing pages
- Assume pages under the marketing shell should look like the homepage hero

---

## Source-of-Truth File Map

| File | Responsibility |
|------|----------------|
| `apps/web/styles/design-system.css` | Canonical app/product token source |
| `apps/web/styles/linear-tokens.css` | Marketing-specific Linear-extracted tokens |
| `apps/web/styles/theme.css` | Feature accents & animations only |
| `apps/web/app/globals.css` | Tailwind registration + shared utilities |
| `apps/web/tailwind.config.js` | Tailwind v4 token mapping |
| `apps/web/app/(marketing)/layout.tsx` | Marketing shell |
| `apps/web/components/site/MarketingHeader.tsx` | Marketing header |
| `apps/web/components/site/MarketingFooter.tsx` | Marketing footer |
| `apps/web/components/features/auth/AuthLayout.tsx` | Product-funnel shell |
| `apps/web/components/features/home/*` | Homepage implementation layer |

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-23 | Lock Linear March 2026 refresh as baseline | Start from proven design, evolve into Jovie identity later |
| 2026-03-23 | Stay on OKLCH color space | Linear uses LCH for rendering but OKLCH-like generation; OKLCH is more modern and positions us for theme generation |
| 2026-03-23 | Theme base hue: 282 | Match Linear's March 2026 refresh (shifted from 272) |
| 2026-03-23 | Font weight book: 450 | Linear's default UI weight (was incorrectly set to 400) |
| 2026-03-23 | Two accent colors: #7170ff (app) + #5E6AD2 (marketing CTA) | Linear uses different accent colors for app vs marketing surfaces |
| 2026-03-23 | Marketing always dark | Linear's marketing pages are dark-only; System A follows this |
| 2026-03-25 | Remove `color-mix()` from content surfaces | Flat `var(--linear-app-content-surface)` renders more cleanly and avoids compositing artifacts |
| 2026-03-25 | Right panel inside `<main>` content card | Matches Linear's unified card layout — sidebar and panel share one card with a thin left-border divider |
| 2026-03-25 | Sidebar: no border, radius, shadow, or backdrop-blur | Flat sidebar sits flush against page background — matches Linear's design (v26.4.72) |
| 2026-03-25 | BrandLogo: `next/image` with dark/light variants | Reverted from inline SVG — `next/image` handles theme-aware loading with proper optimization |
