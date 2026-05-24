# UI System

Design system, component hierarchy, surfaces, taste rules. Always read `DESIGN.md` before making any visual decisions.

## Component Architecture

Components follow atomic design with feature-based grouping:

```
packages/ui/atoms/          → Pure design system (Radix + CVA, NO Next.js/app imports)
apps/web/components/
├── atoms/                  → App-level atoms (may use Next.js, hooks)
├── molecules/              → Composed atoms
├── organisms/              → Complex shared widgets (includes table/ subsystem)
├── features/               → Feature modules (dashboard, admin, home, auth, etc.)
│   └── {feature}/          → May have internal atoms/molecules/organisms
├── providers/              → Context providers
├── hooks/                  → Shared hooks
├── site/                   → Site chrome
├── seo/                    → SEO components
└── effects/                → Visual effects
```

**Dependency direction (strictly enforced via eslint-plugin-boundaries):**

| Layer | Can import from |
|-------|----------------|
| `@jovie/ui` | React, Radix, CVA, Tailwind only |
| `atoms/` | `@jovie/ui` |
| `molecules/` | `atoms/`, `@jovie/ui` |
| `organisms/` | `molecules/`, `atoms/`, `@jovie/ui` |
| `features/{x}/` | `organisms/`, `molecules/`, `atoms/`, `@jovie/ui`, own internals |

**Forbidden imports:**
- `atoms/` must NOT import from `molecules/` or `organisms/`
- `molecules/` must NOT import from `organisms/`
- `features/{x}/` must NOT import from `features/{y}/` — if a component is needed by 2+ features, **promote it** to the shared `atoms/`, `molecules/`, or `organisms/` layer

**Token reference style:** Use Tailwind-named utilities (`text-primary-token`, `bg-surface-1`, `border-subtle`), NOT CSS variable arbitrary values (`text-(--linear-text-primary)`).

## New Component Pattern

| Type | Location | When to use |
|------|----------|-------------|
| Design system atom | `packages/ui/atoms/MyComponent.tsx` | Pure UI, no Next.js/app imports |
| App atom | `apps/web/components/atoms/MyComponent.tsx` | Small, reusable, may use Next.js hooks |
| Molecule | `apps/web/components/molecules/MyComponent.tsx` | Composes 2+ atoms |
| Organism | `apps/web/components/organisms/{feature}/MyComponent.tsx` | Complex shared widget |
| Feature component | `apps/web/components/features/{feature}/MyComponent.tsx` | Feature-specific, can have internal atoms/molecules |

```typescript
'use client'; // ONLY if using hooks (useState, useEffect, etc.) — omit for server components

import type { ReactNode } from 'react';

interface MyComponentProps {
  readonly title: string;        // Every prop MUST be readonly
  readonly children?: ReactNode;
  readonly onAction?: () => void;
}

export function MyComponent({ title, children, onAction }: MyComponentProps) {
  return <div>{title}{children}</div>;
}
```

## Styling

- Tailwind utility classes only (no custom CSS unless necessary)
- Follow existing design tokens in `tailwind.config.ts`
- Mobile-first responsive design

### Surface Elevation Rules (Card/Background Consistency)

The main content area (`<main>`) uses `bg-(--linear-app-content-surface)`, a dedicated shell canvas tone. In dark mode it must stay distinct from both recessed wells (`bg-surface-0`) and shared cards (`bg-surface-1`).

**Allowed patterns:**
- Card on app-shell canvas parent → `bg-surface-1` for shared cards and panels
- Recessed/"well" element inside the shell or a card → `bg-surface-0` (e.g., skeleton containers, empty states, input wells)
- Sticky shell chrome (toolbars, table headers, shell frame) → `bg-(--linear-app-content-surface)`
- Card with elevation → `Card` component as-is (has `bg-surface-1 border border-subtle shadow-card`)
- Nested card inside card → `bg-surface-0` for the inner element
- Table/workspace routes → wrap the primary content in `DashboardWorkspacePanel` plus a bordered `LINEAR_SURFACE.contentContainer`; do not render route content directly on the shell canvas

**Banned patterns (will cause invisible cards):**
- `bg-(--linear-app-content-surface)` on card-like elements inside the shell unless the element is shell chrome (toolbar/header/frame)
- Table/task routes that place their main list or empty state directly on the shell canvas instead of inside a framed content container
- `bg-surface-1` on elements inside a `surface-1` parent WITHOUT border+shadow — same color on same color
- `bg-surface-1/XX` (semi-transparent) — low opacity surface-1 on surface-1 parent is nearly invisible
- `Card className='border-0 shadow-none'` — strips all elevation from a surface-1 card, making it invisible on surface-1 parent
- `bg-surface-0/XX` (semi-transparent) — use solid `bg-surface-0` instead
- Card-within-card nesting (e.g., `DrawerSurfaceCard variant='card'` inside another card) — use `variant='flat'` for inner elements

**Quick test:** If removing the element would cause no visual change, it's an elevation bug.

### No Duplicate Page Titles (Breadcrumb + Toolbar)

The `DashboardHeader` breadcrumb already renders the page name prominently. Do NOT repeat the page name in `PageToolbar start={}`. The toolbar should only contain contextual metadata (counts, status) and action buttons.

**Allowed:** `<PageToolbar start={<span>3 matched platforms</span>} end={<ActionButton />} />`
**Banned:** `<PageToolbar start={<span>Earnings</span>} />` — duplicates the breadcrumb

## Taste Rules (Hard Invariants)

### No Emoji in UI — Use Icons

- **NEVER** use emoji characters in component markup, mock data, or UI strings.
- Emoji looks cheap and undesigned — always use proper SVG icons instead.
- For decorative indicators, use small SVG icon components (Lucide icons or inline SVGs).
- Applies to marketing pages, dashboards, mockups, and all user-facing surfaces.

### Text Casing Rules

- All user-facing text must follow `DESIGN.md` casing rules.
- **Title Case** for labels, headings, buttons, badges, column headers, nav items.
- **Sentence case** for body text, descriptions, tooltips, toasts.
- Never lowercase the first word of a visible label or heading.
- Use `capitalizeFirst()` from `apps/web/lib/utils/string-utils.ts` for dynamic data from the database.

### Line Break Quality

- Hero headlines, subheads, section leads, card titles, CTA labels, and nav items must be checked for orphaned final lines on desktop, tablet, and mobile.
- A single word on the last line is a design bug. Fix it with `text-wrap: balance`, a better `max-width`, nonbreaking phrase groups, or a copy edit.
- Do not add hard `<br>` tags unless the break is a natural phrase boundary and has been verified at responsive widths.
- Browser QA for marketing sections must include a visual scan for awkward wraps, clipped text, and lines that feel visually unbalanced.

### Subtraction Principle (Tim White Canon)

- UI cleanup must follow the subtraction principle: remove before adding.
- Before building a child component, open the parent container file and list what chrome (title, header, card surface, borders) it already renders — then omit those from the child.
- When a screen feels messy, agents should first look for duplicated labels, redundant helper text, nested containers, extra borders, repeated actions, and unnecessary variants.
- Prefer one clear heading, one clear action cluster, and one clear surface hierarchy instead of layering multiple decorative cues.
- If an existing label, icon, placeholder, or layout already communicates the action, remove the extra explanatory UI around it.
- Agents should not "solve" weak hierarchy by adding more badges, more cards, more copy, or more controls unless subtraction has clearly failed.
- During refactors and polish passes, explicitly audit for what can be deleted, merged, flattened, or simplified before introducing anything new.

### No AI-Slop Product UI

- Jovie product UI must feel closer to Linear than generic AI-generated dashboards: compact, quiet, precise, and premium.
- Default to small typography, restrained weight changes, and clean spacing before adding decorative treatment.
- Do **NOT** use all-caps labels, eyebrow text, or section headers as a default styling move; use normal Title Case labels unless an existing canonical pattern explicitly calls for something else.
- For marketing sections, the default composition is: one headline, one subhead, one visual. Do not add eyebrow text, labels, proof bars, separators, helper rows, or extra wrapper cards unless a human explicitly asks for that exact element.
- Eyebrow text is banned by default on marketing pages. Only add an eyebrow when a human explicitly requests it for that exact section.
- For homepage-style marketing heroes, treat the first viewport like a poster: do not inset the hero inside a floating card, and do not push the primary proof element below the fold with a `100vh` shell plus extra stacked content. The initial viewport must include the full hero composition and the first proof beat together.
- Do **NOT** wrap content in a Card when the parent surface (Sheet, Drawer, existing Card) already provides visual grouping; first solve hierarchy with spacing, alignment, type, and surface contrast.
- Nested decorative carding around a phone, screenshot, or demo is banned by default. If the visual already lives inside a phone, drawer, or screenshot, do not wrap it in extra floating cards just to make it feel designed.
- Borders are a supporting tool, not the main design language; if a border can be removed without losing meaning, remove it.
- Avoid the common AI mockup pattern of tiny uppercase eyebrow + long explanatory paragraph inside a large rounded bordered card.
- Prefer one compact, well-set label and one clear body line over stacked label, headline, description, and chrome all saying the same thing.
- When revising a marketing layout and the direction is unclear, do not add explanatory copy or chrome as a hedge. The fallback is subtraction: headline, subhead, one visual.
- When implementing or revising UI, compare the result against this smell test: if it looks like a generic AI admin template, it is off-style and should be simplified.

### No Redundant Chrome (Container-Aware Design)

Before adding a title, header, card wrapper, or label to a component, **read the parent container** that will render it. Containers already provide chrome — do not duplicate it.

| Container | Chrome it provides | Do NOT add inside it |
|---|---|---|
| `EntitySidebarShell` | `DrawerHeader` via `title` prop | Card header or heading repeating the drawer title |
| `Sheet` / `Dialog` | `SheetHeader` / `DialogHeader` + title | Second heading or Card wrapping the body content |
| `Card` with `CardHeader` | `CardTitle` | Nested Card or redundant heading inside `CardContent` |
| `DrawerSurfaceCard` | Card surface + optional header | Do not nest another `Card` inside; use `variant='flat'` for inner elements |
| `DashboardHeader` breadcrumb | Page name | `PageToolbar start=` repeating the page name |

**Checklist (run before every UI component PR):**

1. **Read the mount point** — open the parent layout/page and identify what container renders your component. What title, header, and surface does it already provide?
2. **Grep for repeated text** — search the route tree for your title/label string. If the same label appears 3+ times on one screen, deduplicate.
3. **Check surface nesting** — if the parent is already a Card, Sheet, or `DrawerSurfaceCard`, do not wrap children in another Card. Use `variant='flat'` or plain `div`.
4. **One heading per visual section** — a section gets exactly one title. If the container already renders one, your component renders zero.

**Banned patterns:**
- `EntitySidebarShell title="X"` → child renders `<CardHeader><CardTitle>X</CardTitle></CardHeader>` (double title)
- `Sheet` body wrapped in `Card` when Sheet already provides the surface (redundant carding)
- Same CTA label (e.g., "Get notified") appearing in header, body, AND footer of one screen

This is the subtraction principle applied specifically to container boundaries. When in doubt, remove the inner chrome.

### No Decorative Hover Motion

- Hover states must not move layout or shift components without a product reason.
- Do **NOT** use `translate`, `scale`, lift-on-hover, or floating-card motion on buttons, cards, screenshots, auth surfaces, or marketing panels as a default polish move.
- Prefer background-color, border-color, text-color, opacity, or shadow changes for hover feedback.
- If motion is necessary because the UI is directly manipulating something spatial, it must be intentional and clearly tied to that interaction.

### No Native Browser Dialogs

- **NEVER** use `alert(...)`, `confirm(...)`, or `prompt(...)` — bare or via `globalThis` / `window` / `self` — anywhere in production app code.
- Native dialogs are blocking, unstyled, and break design-system + a11y guarantees.
- The Biome rule `noRestrictedGlobals` (level: error) catches bare calls; `pnpm --filter web lint:no-native-dialogs` catches `globalThis.X` / `window.X` forms — both run in CI.
- Canonical replacements:
  - **Confirmations (irreversible actions)** → `<ConfirmDialog>` from `@/components/molecules/ConfirmDialog`
  - **Notifications / async errors** → `toast.error()` / `toast.success()` from `sonner`
  - **Reversible actions** → optimistic update + undo-toast (pattern not yet codified — file a Linear ticket if you need this)
- See `DESIGN.md` → "Confirmations & Destructive Actions" for the full decision rule and copy guidance.
- Storybook stories (`*.stories.tsx`) and CLI scripts (`apps/web/scripts/**`) are exempted via the Biome override; they may use `alert()` for handler-fired signals.

### Performance Must Not Replace Route UIs

- **NEVER** replace a route's component with a different layout/design as a performance optimization.
- Use code-splitting (`dynamic()`), skeleton states, `Suspense`, and progressive hydration to make the *same* design faster.
- Screenshot test: before and after a perf PR, the fully-loaded page must look identical.
- If a route needs a genuinely different UI, that is a product decision requiring explicit approval, not a perf side effect.

### Layout Shift Prevention — Mandatory for All Agents

Before touching **any** component or surface, an agent **must** explicitly enumerate every possible visual state it can render (loading, empty, error, partial data, success, authenticated vs anonymous, with/without banners/status lines/status text, mobile vs desktop, collapsed vs expanded, first-message vs ongoing, securing/awaiting vs ready, etc.).

For every state transition the component or page can undergo, the agent must verify that **no layout shift** occurs:
- Content does not push or displace other content vertically or horizontally.
- Containers do not unexpectedly resize or reflow.
- Scroll position is preserved where users expect it.
- Focus, selection, and caret positions are not disrupted.

Where a transition would insert or remove content that affects layout height or position:
- Reserve space in advance (min-height, skeleton loaders, empty placeholder elements with matching dimensions, or a dedicated fixed-status slot).
- Or use height-preserving wrappers combined with opacity / visibility / scale / transform transitions only (never height or margin changes that cause reflow).

Add or update tests (Playwright layout guards, visual regression snapshots, bounding-box assertions on key containers, CLS metrics, or stability specs) for any non-trivial state changes or surfaces that render conditional UI.

This rule is non-negotiable and applies to **all product work** (including onboarding, chat, dashboards, marketing, and shell surfaces). Violations block design review and PR landing. See also `DESIGN.md` (visual stability section), `docs/TESTING_GUIDELINES.md` (risk-based visual QA), and `AGENTS.md` (verification).

### Global UI Components Render Once

Global UI elements must only render in root `app/layout.tsx`:
- Cookie banners
- Toast providers
- Modal providers
- Analytics scripts

**NEVER** render these in individual pages or nested layouts — causes duplicate overlapping UI elements. Nested layouts must not mount `CookieBannerSection`, `ToastProvider`, `ClerkAnalytics`, or other analytics/provider singletons directly.

## Marketing Pages Must Be Fully Static

- All marketing, blog, and legal pages **must be fully static** (`export const revalidate = false`): no `headers()`, `cookies()`, `fetch` with `no-store`, or per-request data/nonce in `app/(marketing)` and `app/(dynamic)/legal` pages/layouts.
- Any non-`false` `revalidate` value under `app/(marketing)` is a bug unless a human explicitly documents an exception in the PR.
- `app/layout.tsx` must not read per-request headers for marketing; theme init belongs in static `/public/theme-init.js` (no nonce).
- Middleware (`proxy.ts`) should only issue CSP nonces for app/protected/API paths. Marketing routes must not depend on nonce or geo headers for rendering.
- Homepage "See It In Action" must not hit the database during SSR; use static `FALLBACK_AVATARS` only.
- Marketing copy must not invent adoption metrics, customer counts, waitlist sizes, or traction claims. If a number is not verified and current, use non-quantified launch-stage copy instead.
- Blog and changelog pages must be fully static, reading content from filesystem at build time only.
- Cookie banner remains client-driven (localStorage + server cookie write) without server-provided `x-show-cookie-banner` headers.
- Structured data on marketing pages should be rendered without `biome-ignore`; use string children inside `<script type="application/ld+json">` and `safeJsonLdStringify()` whenever user-controlled content is involved.
- Public profiles (`/[username]`) use ISR (1h revalidate) for real-time updates, with cache tag invalidation for instant profile updates.

**Why:** Fully static marketing pages eliminate cold start 500 errors, reduce Vercel costs (no serverless invocations), and provide instant TTFB (<100ms from CDN).

## Marketing Screenshots

Marketing pages reference product screenshots through `apps/web/lib/screenshots/registry.ts` only — never via `<Image src="/product-screenshots/..." />` literals. Use `<MarketingScreenshot scenarioId>` or `<MarketingPhoneImage scenarioId>`. See `docs/CANONICAL_SURFACES.md` → "How to add a marketing screenshot". Do not build a parallel registry.

## Founder / Featured Creator Identity Must Be Canonical

- **NEVER** invent, substitute, or mix placeholder creator identities on the homepage or marketing demos when Tim White or a real featured creator from canonical data should be used.
- For Tim White specifically, agents must use the canonical homepage identity source instead of hardcoded fallback assets or guessed values.
- If Tim White appears in homepage mocks, use the correct founder photo and the correct Spotify artist ID: `4u`.
- Calvin Harris demo fixtures must not include `Blessings`, Clementine Douglas, or any Tim White credit. Those names create an obvious founder-identity collision and must be treated as forbidden in Calvin demo content.
- When fixing one wrong Tim White reference, search for sibling homepage/demo references and fix all of them in the same pass.

**Why:** Using the wrong founder photo or wrong Spotify identity undermines trust in the product and makes the AI experience look careless.

## Artist Profiles Landing Page

When building or iterating on the Artist Profiles landing page:

- Keep the page premium and restrained.
- Prefer real product renders over invented UI.
- Do not use customization messaging, theme builders, or open-ended template language.
- Keep one big idea per section.
- Prefer fewer, stronger sections over more sections.
- Keep this page distinct from generic bio-link competitors and generic creator-site tools.
- Keep copy in data files, not inline JSX.
- Iterate section by section in browser instead of trying to style the whole page in one pass.
- Do not use fake stats, fake testimonials, or founder-first proof near the top of the page.
