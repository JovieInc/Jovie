# Jovie Design System

> **Baseline:** Linear.app March 2026 UI refresh, evolved with Jovie's own identity.
> **Aesthetic:** Apple meets Rekordbox. Dark-first, restrained, product-as-hero. The restraint is the brand.
> **Target audience:** World-class touring DJs who take themselves seriously.
> **Color space:** OKLCH (with LCH for values extracted directly from Linear's CSS).

---

## Surface Classification

Jovie uses two related but distinct design systems based on surface purpose:

| Surface | System | Mood | Routes |
|---------|--------|------|--------|
| Homepage / chat-intake | System B | Product surface, utility-first, inevitable | `(home)/*` |
| Marketing (editorial) | System A | Cinematic, editorial, proof-led | `(marketing)/*`, blog, changelog, pricing, support |
| Product app shell | System B | Compact, operational, tool-like | `app/*`, settings, admin, dashboard |
| Auth / onboarding / waitlist | System B | Funnel-focused, product family | `(auth)/*`, `onboarding/*`, `waitlist/*` |
| Public profiles | System B (public variant) | Expressive but product-native | `[username]/*` |
| Legal / informational | System A (calmer variant) | Clean, readable | `(dynamic)/legal/*` |

**Decision tree:** Selling/explaining (blog, pricing, legal) → System A. Everything else (homepage, auth, app, profiles) → System B.

Note: the homepage migrated from System A to System B on 2026-04-22. The chat-intake surface is product, not marketing. The restraint is the brand. Full System A retirement is TBD after 3 months of shipping.

See the [Surface Classification](#canonical-surface-split) section below for full route mapping.

---

## Typography

### System A — Marketing (Satoshi + DM Sans)

Marketing pages use a two-font system loaded via `next/font/local` in the marketing layout:

- **Display/Hero:** Satoshi Variable (weight 800, letter-spacing -0.025em)
- **Section headlines:** Satoshi Variable (weight 700, letter-spacing -0.02em)
- **Subsection:** Satoshi Variable (weight 600, letter-spacing -0.015em)
- **Buttons:** Satoshi Variable (weight 600, letter-spacing -0.01em) — buttons are controls, not copy
- **Body:** DM Sans Variable (weight 400, letter-spacing -0.005em)
- **Captions/meta:** DM Sans Variable (weight 500)

Font files: `apps/web/public/fonts/Satoshi-Variable.woff2` (~42KB), `apps/web/public/fonts/DMSans-Variable.woff2` (~48KB).

CSS variables: `--font-satoshi`, `--font-dm-sans` (set by `next/font/local`). Scoped to `.linear-marketing` wrapper via `--marketing-font-display` and `--marketing-font-body`.

### System B — App (Inter)

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
| H1 | 64px | 800 | -1.6px (-2.5%) | 67.84px (1.06) | Hero headlines (Satoshi) |
| H2 | 48px | 700 | -0.96px (-2.0%) | 48px (1.0) | Section headlines (Satoshi) |
| H3 | 20px | 600 | -0.3px (-1.5%) | 26.6px (1.33) | Sub-section titles (Satoshi) |
| H4 | 18px | 600 | -0.18px (-1.0%) | 24px (1.33) | Card titles (Satoshi) |
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

## Copywriting

Jovie copy should feel precise, calm, and inevitable.

### Core Standard

- Be concise by default
- Say the thing once
- Earn every word
- Prefer clarity over warmth when they conflict
- Prefer usefulness over personality when they conflict

### Product Copy Rules

- One clear line is better than a headline plus explanatory filler
- Avoid stacked copy that repeats the same idea in an eyebrow, headline, and body sentence
- If an input placeholder or control label already explains the action, remove redundant supporting text nearby
- Use concrete verbs and specific nouns
- Cut throat-clearing phrases like "tell Jovie what you need", "get started", "welcome", "you can", and other generic setup copy unless they add real information
- Avoid anthropomorphic filler and assistant self-description unless it is functionally necessary

### Voice

- Apple-level polish: spare, exact, controlled, never chatty for the sake of it
- YC-grade communication: direct, legible, high-signal, no fluff, no fake grandeur
- Launch-stage honesty: do not overclaim, oversell, or add decorative marketing language to product surfaces

### UI Hierarchy

- Labels and placeholders should carry more of the instructional load than paragraphs
- Default empty states to a single headline or a single sentence, not both, unless both are necessary
- Prefer short action language:
  - `Ask Jovie`
  - `Search Tasks`
  - `Filter`
- Avoid redundant combinations like:
  - eyebrow: `Jovie Assistant`
  - headline: `Welcome to Jovie`
  - body: `Ask anything or tell Jovie what you need`

The example above says one thing three times. Jovie should say it once.

### Anti-Patterns To Avoid

- Generic AI-dashboard styling: oversized rounded cards, visible borders on every container, repeated chrome, and stacked explanatory copy
- All-caps eyebrows or section labels as a default hierarchy tool
- Long helper paragraphs inside cards when a short label or one sentence would do
- Multiple nested surfaces whose only job is to create the feeling of "designed"
- Treating borders as the primary way to separate content instead of using spacing, alignment, contrast, and typography
- **Emoji/symbol on colored background square** — explicitly banned. This pattern cheapens the brand and reads as consumer-grade AI slop. Use accent color on title text only.
- **Gold colors in brand/CTA expression** — banned. Avoid prestige-signaling metallic tones for identity or primary actions. (Feature accent orange/amber for Pro tier is a distinct, permitted use.)
- **Saturated brand colors** for CTAs — CTAs are white-on-black (Apple approach). Accent colors are for feature differentiation only.
- **"Fun" fonts** — Jovie's audience is world-class touring DJs who take themselves seriously. Typography should be utilitarian, clean, and modern.

### Product UI Taste

- Jovie app surfaces should feel calm, dense, and expensive, not loud or overcomposed
- Linear is the baseline: small text, tight vertical rhythm, restrained emphasis, and very selective use of borders
- Hierarchy should come primarily from layout and typography, not from uppercase text or extra boxes
- If a section still reads clearly after removing its border or eyebrow label, that simpler version is usually the right one
- Before shipping a UI, run this check: does it look like a generic AI-generated SaaS mockup? If yes, remove chrome until it feels native to Jovie

---

## Subtraction Principle

This is part of the Tim White canon for Jovie product taste:

- When a surface feels off, remove before adding
- Prefer one strong signal over three medium ones
- Repetition is usually a design bug, not reinforcement
- If a label, layout, or icon already explains the action, remove the extra helper copy or chrome around it
- Fewer containers, fewer borders, fewer badges, fewer variants
- Empty space should create focus, not deadness

### Practical Rules

- Remove duplicated titles, headings, and section labels
- Collapse nested cards when a single surface can carry the structure
- Avoid stacked explanation patterns like eyebrow + headline + helper text unless each layer adds distinct information
- Default to one primary action per region
- When auditing a UI, ask:
  - what can be deleted?
  - what can be merged?
  - what is repeating work already done by another element?

### Canonical Test

If removing an element makes the screen clearer and does not reduce comprehension, that element should stay removed.

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
| `--color-bg-surface-1` | `#17171a` | — | Cards, panels |
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

**No brand color.** Black, white, and gray are the brand. The restraint is the identity.

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#000000` | Pure black |
| Primary text | `#F7F8F8` | Headlines, primary |
| Body text | `#A2A7AF` | Paragraphs |
| Muted text | `#8A8F98` | Nav items, secondary |
| Quaternary text | `#62666d` | Subtle, disabled |
| Primary CTA bg | `#ffffff` | White-on-black (Apple approach) |
| Primary CTA fg | `#08090a` | Dark text on white button |
| Secondary CTA bg | `transparent` | Glass with white border |
| Secondary CTA fg | `#F7F8F8` | White text |
| Login button bg | `rgba(255,255,255,0.1)` | Subtle glass |
| Header bg | `transparent` | Blur backdrop |

### Feature Accent Colors (supporting, never brand)

These colors differentiate features in bento grids and semantic indicators. They are supporting cast, never used for CTAs or brand identity.

| Token | Light | Dark | Feature |
|-------|-------|------|---------|
| `--accent-analytics` | `#2563ff` | `#4d7dff` | Analytics |
| `--accent-conv` | `#8b1eff` | `#9b4dff` | Conversion |
| `--accent-beauty` | `#d61a7f` | `#ea4a9c` | Beauty/Design |
| `--accent-links` | `#0f9b8e` | `#22b8a7` | Smart Links |
| `--accent-speed` | `#2f9e44` | `#43b85c` | Speed |
| `--accent-pro` | `#ff9800` | `#ffab2e` | Pro Tools |

**Usage rules:**
- Apply accent color to feature card **title text only** via `text-[color:var(--accent-*)]`
- Never use accent colors on CTAs, brand identity, icon backgrounds, or decorative elements
- Feature accents are defined in `design-system.css` (lines 136-151 light, 362-377 dark, 816-823 aliases)

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
| Marketing canonical | 1200px | **All boxed marketing content** — header, hero, every section. One width. |
| Prose | 624px | Long-form text |
| Pricing grid | 1024px | Pricing layout (intentional narrow) |

**Rule:** All marketing sections use `max-w-[1200px]` (or `var(--linear-content-max)`). Full-bleed sections explicitly break out. No more mixed widths.

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
| Marketing CTA | `#ffffff` | `#08090a` | `#ffffff` | `#08090a` |

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

## Full-Screen Status Screens

All full-screen takeover screens (offline, global error, root error, public error fallback) share identical layout geometry to prevent layout shift when transitioning between states.

| Property | Value | Notes |
|----------|-------|-------|
| Background | `#08090a` | Dark `--color-bg-base` |
| Text primary | `#ffffff` | |
| Text secondary | `#969799` | Descriptions |
| Text quaternary | `#62666d` | Error IDs |
| Logo | 32px white Jovie icon | `lg` in Logo.tsx scale |
| Body | `min-height: 100dvh; flex center center; padding: 24px + safe-area` | |
| Container | `max-width: 320px; width: 100%; flex column; align center; text center` | |
| Font | Inter + system stack | `font-feature-settings: "cv01", "ss03"` |
| Headline | 18px / weight 590 / -0.02em / line-height 1.3 | |
| Description | 14px / weight 400 / line-height 1.5 | |
| Error ID | 12px / weight 400 | |
| Logo-to-headline gap | 20px | |
| Headline-to-description | 8px | |
| Description-to-buttons | 24px | |
| Button gap | 12px | Flex row, never stacks |
| Buttons-to-error-ID | 20px | |
| Primary button | h-36px, px-16px, pill, bg `#e6e6e6`, text `#08090a` | Hover: `#ffffff` |
| Secondary button | h-36px, px-16px, pill, transparent, border `white/8%` | |
| Focus ring | 2px solid `#7170ff`, offset 2px | |

**Rules:**
- Logo is a quiet identity anchor, not a hero. 32px maximum on status screens.
- No icons, illustrations, or decorative elements. Logo + text + buttons only.
- Always dark mode (these screens can't access the theme system).
- `offline.html` and `global-error.tsx` must be self-contained (no imports).
- `app/error.tsx` uses inline SVG, not BrandLogo import (resilience over DRY).

**Source files:**
- `apps/web/public/offline.html` (static HTML)
- `apps/web/app/global-error.tsx` (React, inline CSS)
- `apps/web/components/providers/PublicPageErrorFallback.tsx` (React, inline styles)
- `apps/web/app/error.tsx` (React, Tailwind)
- `apps/web/public/sw.js` (service worker, bump `CACHE_NAME` when updating offline.html)

---

## Text Casing

| Context | Convention | Example |
|---------|------------|---------|
| Headings (H1-H4) | Title Case | "Grow Your Audience" |
| Button labels | Title Case | "Copy Profile Link" |
| Nav / tab labels | Title Case | "Dashboard", "Identified" |
| Column headers | Title Case | "Last Action" |
| Badge / tag labels | Title Case | "Returning", "High Intent" |
| Body text / descriptions | Sentence case | "Share your profile link on social media." |
| Tooltips | Sentence case | "High intent" |
| Toast messages | Sentence case | "Member removed" |
| Dynamic labels | Sentence case (first word capitalized) | "Mobile visitor from London" |

**Anti-patterns:**
- Never ALL CAPS except abbreviations (LTV, SMS, UTM)
- Never lowercase first word of a visible label or heading
- Dynamic strings forming readable phrases must start with a capital letter

**Utility:** Use `capitalizeFirst()` from `apps/web/lib/utils/string-utils.ts` for dynamic data.

---

## Canonical Surface Split

| Surface | Routes / entrypoints | Layout / shell | Design system |
|---------|---------------------|----------------|---------------|
| Homepage / chat-intake | `(home)/*`, `components/homepage/*` | `(home)/layout.tsx` with `MarketingHeader` (minimal) + `MarketingFooter` | System B |
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
| 2026-04-11 | Marketing typography: Satoshi (display) + DM Sans (body) | Inter is too generic for a music/DJ product. Satoshi 800 provides hierarchy without being flashy. DM Sans is clean body text. |
| 2026-04-11 | No brand color (Apple approach) | White-on-black CTAs. Accent colors are supporting cast for feature differentiation only. Restraint is the brand. |
| 2026-04-22 | Homepage migrated from System A to System B | Chat-intake is product, not marketing. Satoshi-editorial typography on a utility entrypoint was a category error. Lovable, v0, Bolt, and ChatGPT all use one system across homepage and product. System A scope shrinks to editorial surfaces (blog, pricing, changelog, support, legal). Full System A retirement deferred 3 months pending shipping data. |
| 2026-04-22 | Homepage hero typography: Inter 40→48→56px, weight 680 (Linear bold / `font-bold` token) | Replaces Satoshi 800 marketing display. Product-powerful without tipping into marketing-shout. Letter-spacing -2.5% at display sizes. `--font-weight-bold` resolves to 680 (verified at runtime); the plan's initial "try 590 first, 680 if too muted" landed on 680. |
| 2026-04-11 | Canonical 1200px width for all marketing | Fixed inconsistent widths (header 1200px, hero 1120px). Everything boxed at 1200px now. |
| 2026-04-11 | Ban emoji-on-colored-square icons | Replaced with accent color on card title text. Icon-on-square reads as AI slop and cheapens the brand. |
| 2026-04-11 | Ban gold colors | Gold signals prestige-seeking. Not appropriate for Jovie's DJ audience. |
