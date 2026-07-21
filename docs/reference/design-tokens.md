# Design Tokens

Jovie uses CSS custom properties for theming and design tokens. This is a reference for the token architecture, the major token namespaces, and how components consume them.

> Governance (where to add tokens, surface families, import order rules) lives in [`docs/DESIGN_TOKENS.md`](../DESIGN_TOKENS.md). This document is a map of the token system as implemented.

## Architecture

**Single source of truth:** `apps/web/styles/design-system.css` (~11.8k lines). It `@import`s `apps/web/styles/linear-tokens.css` and is itself imported by `apps/web/app/globals.css` in a locked order (`tailwindcss` → `design-system.css` → `theme.css`).

Key architectural properties:

- **OKLCH theme generation.** Colors are generated in OKLCH color space for perceptual uniformity (Linear-inspired). A small set of theme inputs — `--theme-base-hue`, `--theme-base-chroma`, `--theme-accent-hue`, `--theme-accent-chroma`, `--theme-contrast` — derives the full color system. Light and dark modes reuse identical generation logic with different `--theme-base-l` values.
- **Light/dark via `:root` / `:root.dark`.** Marketing surfaces additionally support `.linear-marketing.dark` and `[data-theme="linear"].dark` scopes.
- **Semantic tokens drive component styling.** Components consume semantic names (`--color-bg-surface-1`, `--linear-border-focus`), never raw values. Alias layers (`--ds-*`, `--app-shell-*`, `--system-b-*`) sit on top of primitives so the token contract can change without visual churn.
- **Responsive variant tokens** use size suffixes — e.g. `--linear-section-pt-sm` / `--linear-section-pt-md` / `--linear-section-pt-lg`, `--linear-button-height-sm` / `-md`, `--linear-content-gap-sm|md|lg` — and are swapped per breakpoint rather than redefining component CSS.
- **Tailwind v4 bridge.** `@theme` and `@theme inline` blocks in `apps/web/app/globals.css` map custom properties into Tailwind's token system, generating utilities like `bg-surface-1`, `text-secondary-token`, `border-subtle`, `bg-btn-primary`, `text-app`, and `font-display`.

## Token Files

| File | Role |
|---|---|
| `apps/web/styles/design-system.css` | Canonical token registry: theme inputs, semantic colors, surfaces, typography, spacing, radius, motion, shells, System B primitives |
| `apps/web/styles/linear-tokens.css` | `--linear-*` tokens extracted from Linear.app marketing pages (regenerate via `pnpm linear:extract`); light + dark |
| `apps/web/app/globals.css` | Imports token layers; hosts the Tailwind v4 `@theme` bridges; must not become a second token registry |
| `apps/web/styles/theme.css` | Feature accents, animation keyframes, scoped effects only |
| `packages/ui/theme/tokens.ts` | TypeScript constants (`surfaces`, `text`, `borders`, …) that reference the CSS custom properties for use in JS/TS |

## Important Token Categories

### Theme inputs (`--theme-*`)
The generation seeds: base hue/chroma, accent hue/chroma, contrast (0–100 continuous variable), and per-mode base lightness. Everything else derives from these.

### Semantic colors (`--color-*`, ~139 tokens)
- **Surfaces:** `--color-bg-base`, `--color-bg-surface-0..3`, `--color-bg-page`, `--color-bg-hover`, `--color-bg-elevated`, `--color-bg-input`, `--color-bg-active`, `--color-bg-button`, `--color-bg-tooltip` — layered elevation matching Linear's dark surface stops.
- **Text hierarchy:** `--color-text-primary-token`, `-secondary-token`, `-tertiary-token`, `-quaternary-token`, `-disabled-token` (the `-token` suffix distinguishes these from Tailwind-generated names).
- **Borders:** `--color-border-subtle` / `-default` / `-strong`.
- **Accent spectrum:** `--color-accent` plus named accents (`-blue`, `-purple`, `-pink`, `-teal`, `-orange`, `-red`, `-green`, `-gray`), each with a `-subtle` variant; interaction states `--color-accent-hover` / `-active`.
- **Status:** `--color-error` (and foreground), warning/success/info equivalents.
- **Platform brands:** `--color-brand-spotify|apple|youtube` with `-hover` and `-subtle` variants.

### Linear marketing tokens (`--linear-*`, ~284 in linear-tokens.css + aliases)
Extracted from Linear.app for marketing surfaces:
- OKLCH lightness ramp primitives (`--linear-l-0..7`), neutral chroma/hue.
- Text (`--linear-text-primary..quaternary`), backgrounds (`--linear-bg-page`, `--linear-bg-surface-0..2`), borders (`--linear-border-subtle|default|strong|focus`).
- Buttons (`--linear-btn-primary|secondary|accent-*`), accents (`--linear-accent-blue: #2563ff`, `-purple: #8b1eff`, etc.), status (`--linear-success|warning|error|info` + `-subtle`).
- Typography: font weights on Linear's optical scale (`normal 400`, `medium 510`, `semibold 590`, `bold 680`), `--linear-font-features`, optical sizing.
- Spacing scale `--linear-space-1..40` (4px base), radius (`--linear-radius-sm|md|lg|full`), motion (`--linear-ease`, `--linear-duration-fast|normal|slow`).
- Responsive section rhythm: `--linear-section-pt/pb-sm|md|lg`, `--linear-content-gap-*`, `--linear-intro-gap-*`.
- App chrome geometry: `--linear-app-sidebar-width`, `--linear-app-header-height(-compact)`, `--linear-app-shell-gap|radius|border`, audio bar heights.

### Foundation aliases (`--ds-*`)
Canonical semantic aliases from DS_FOUNDATION_V1 — do not redefine downstream: `--ds-public-content-max: 1298px`, `--ds-prose-max: 680px`, `--ds-motion-subtle-duration|easing`, `--ds-motion-cinematic-duration|easing`.

### Shell tokens (`--app-shell-*`, `--public-shell-*`, `--profile-*`)
- `--app-shell-*`: app chrome geometry (sidebar width, header heights, gap, radius, border, frame seam, content surface, content max widths for wide/reading/form) — mostly aliases onto `--linear-app-*`.
- `--public-shell-*`: the marketing/legal layout contract (header offset, bg, text, border, content max).
- `--profile-*` (~86 tokens): public artist-profile surface — shell max width, card/inner/action radii, drawer radii, avatar/cover sizing (fluid `clamp()` values), bottom-nav height with safe-area insets.

### System B page primitives (`--system-b-*`, ~84 tokens)
Per-surface recipe tokens for public app pages (chat bubbles, action cards, opportunity inbox, entity chips, onboarding, pricing/launch/brand pages, error/loading states). These alias semantic tokens (e.g. `--system-b-bg-page: var(--color-bg-base)`) so page-level styling stays on named contracts instead of route-local Tailwind literals. Includes the cinematic near-black `--system-b-cinematic-black: #06070a`.

### Sidebar tokens (`--sidebar-*`, ~36 tokens)
Defined as **RGB triplets** (not full colors) so consumers can compose alpha: bridged in `@theme inline` as `--color-sidebar-*: rgb(var(--sidebar-*))`.

### Geist accent palette (`--geist-*`, ~36 tokens)
Feature-surface accents: per-hue `-bg` / `-fg` / `-solid` triplets (blue, cyan, green, amber, etc.).

### Liquid glass (`--liquid-glass-*`)
Translucent surface system: `--liquid-glass-bg(-solid)`, `-blur(-intense)`, `-border`, `-highlight`, `-shadow(-elevated)`, item hover/active/selected states.

### Scales
- **Spacing:** `--space-*` on an 8px grid (plus `--space-px`); fluid layout tokens like `--page-pad`, `--section-gap`, `--card-pad` use `clamp()`.
- **Radius:** `--radius-none|xs|sm|default|md|lg|xl|2xl|3xl|full|pill`.
- **Typography:** `--font-sans|mono|features|settings|optical-sizing`, sizes (`--font-size-micro|mini|small|regular|large`), weights (`--font-weight-book|normal|medium|semibold|bold|heavy|nav`). Display font is Satoshi (`--font-display`), body/UI is Inter (`--font-sans`); Tailwind type scale adds `--text-3xs|2xs|app|mid` (13px `text-app` is the default UI size).
- **Motion:** `--duration-instant|fast|normal|slow|slower|slowest|subtle|cinematic` with easings `--ease-linear|out|in-out|subtle|interactive|spring|cinematic`.
- **Shadows:** `--shadow-card(-elevated)`, `--shadow-button-inset`, `--shadow-divider`, `--shadow-high`, `--shadow-color`.
- **States:** `--state-*` interaction constants (e.g. `--state-disabled-opacity`).

## Usage

Components reference tokens via `className` using the `cn()` utility (from `packages/ui/lib/utils.ts` — `clsx` + an extended `tailwind-merge`) or inline `style` props.

Three consumption patterns:

1. **Bridged Tailwind utilities** — the `@theme` blocks generate classes from tokens:
   ```tsx
   <div className={cn('bg-surface-1 border-subtle text-secondary-token rounded-lg')} />
   ```
2. **Arbitrary-value var() references** — Tailwind v4 parenthesis syntax for tokens without a bridged utility:
   ```tsx
   // packages/ui/atoms/button.tsx
   'focus-visible:ring-(--linear-border-focus)/55 disabled:opacity-[var(--state-disabled-opacity)]'
   ```
3. **TypeScript token constants** — for JS-side styling:
   ```ts
   import { surfaces, text } from '@jovie/ui/theme/tokens';
   // surfaces['surface-1'] === 'var(--color-bg-surface-1)'
   ```

**Rules of thumb**

- Never hardcode theme colors, focus rings, or motion values — ESLint rules (`no-hardcoded-theme-colors`, `no-raw-focus-ring`, `no-raw-motion-values`) guard this.
- Add new core tokens to `design-system.css`, not `globals.css` or `theme.css`.
- Prefer the semantic alias for the surface you're on (`--system-b-*` for public app pages, `--app-shell-*` for app chrome) over reaching into primitives. Marketing surfaces use System B tokens too — System A is retired (founder-directed 2026-06-18); the remaining `--linear-*` / `.linear-marketing` appliers are a shrink-only ratchet list (`apps/web/tests/unit/design-system/singular-system-b-ratchet.test.ts`), so never add new ones.
