# Design Tokens

> Single source of truth: `apps/web/styles/design-system.css`

## Overview

Jovie uses one token system across three surface families:

- Marketing
- Public surface
- Dashboard / app

The tokens are shared. The component families differ in layout and chrome, not
in separate design-token files.

The current canonical surface contract lives in
[`apps/web/lib/canonical-surfaces.ts`](../apps/web/lib/canonical-surfaces.ts).

## Token Files

### `apps/web/styles/design-system.css`

This is the repo-owned source of truth for:

- color tokens
- surface tokens
- text hierarchy tokens
- border tokens
- shadow tokens
- button tokens
- focus tokens
- duration tokens
- shell V1 semantic aliases for app chrome geometry and audio/sidebar chrome

Add new core tokens here.

### `apps/web/styles/theme.css`

This file is for:

- feature accent tokens
- animation keyframes
- scoped visual effects that extend the base token system

Do not duplicate base surface or text tokens here.

### `apps/web/app/globals.css`

This file imports the token layers and applies base HTML styling. It should not
become a second token registry.

Required import order:

```css
@import "tailwindcss";
@import "../styles/design-system.css";
@import "../styles/theme.css";
```

## Surface Families

### Marketing

Marketing pages use the shared primitives in
[`apps/web/components/marketing`](../apps/web/components/marketing).

These routes include:

- `/new`
- `/artist-profiles`
- `/pricing`
- `/launch`
- `/launch/pricing`

`/artist-profiles` is a marketing acquisition page. It is not the canonical
public profile surface.

### Public Surface

The shared public shell lives in
[`apps/web/components/organisms/public-surface`](../apps/web/components/organisms/public-surface).

It provides the outer framing used by public-facing release and profile
surfaces:

- `PublicSurfaceShell`
- `PublicSurfaceStage`
- `PublicSurfaceHeader`
- `PublicSurfaceFooter`

The canonical live public profile path is:

- `StaticArtistPage -> ProfileCompactTemplate`

Legacy profile templates remain in the repo for source history, stories, and
tests, but they are not the live production path.

### Dashboard / App

Dashboard and authenticated app surfaces use the same token layer, but their
component structure remains under the app and dashboard feature families. They
are not described by the marketing or public-surface shell libraries.

Shell V1 app chrome should prefer the semantic `--app-shell-*` aliases for
shared geometry and surfaces. These aliases live in `design-system.css` and
resolve to the current Linear-derived values:

- `--app-shell-sidebar-width`
- `--app-shell-header-height`
- `--app-shell-header-height-compact`
- `--app-shell-gap`
- `--app-shell-radius`
- `--app-shell-border`
- `--app-shell-frame-seam`
- `--app-shell-content-surface`
- `--app-shell-audio-bar-max-height`
- `--app-shell-audio-compact-height`

## Canonical Surface Contract

The four current canonical design-system surfaces are defined in
[`apps/web/lib/canonical-surfaces.ts`](../apps/web/lib/canonical-surfaces.ts):

- `homepage`
- `public-profile`
- `release-landing`
- `dashboard-releases`

This contract is used to align design review and screenshot/admin tooling.

Routes that are explicitly not design-system surfaces:

- `/ai`
- `/investors`

Both are redirects, not designed review surfaces.

## Rules

- Add shared design tokens in `design-system.css`.
- Keep `theme.css` as an extension layer, not a competing token source.
- Reuse `components/marketing/*` for shared marketing-page primitives.
- Reuse `components/organisms/public-surface/*` for shared public-facing shell
  chrome.
- Do not add route-specific token files for a single marketing page or a single
  public surface.
- Do not treat redirect routes as canonical surfaces.

## Naming

Use the existing token prefixes:

- `--color-bg-*`
- `--color-text-*`
- `--color-border-*`
- `--color-btn-*`
- `--sidebar-*`
- `--accent-*`
- `--shadow-*`
- `--duration-*`

## DS_FOUNDATION_V1 canonical decisions

These are the canonical semantic aliases established by Wave 0 of the
DS_FOUNDATION_V1 consolidation. Downstream tokens and components should consume
these, not redefine them.

- **Public/marketing content width = 1298px** (Linear.app parity).
  - CSS: `var(--ds-public-content-max)`
  - Tailwind: `max-w-public-content`
- **Prose exception = 680px** for long-form reading surfaces.
  - CSS: `var(--ds-prose-max)`
  - Tailwind: `max-w-prose-canonical`
- **Motion taxonomy** — only two intents are canonical:
  - `subtle` — micro-interactions (hover, focus, color, icon swap, toast).
    150ms.
    - CSS: `var(--ds-motion-subtle-duration)` + `var(--ds-motion-subtle-easing)`
    - Tailwind: `duration-subtle ease-subtle`
  - `cinematic` — high-impact reveals (drawers, modals, audio player open/close).
    420ms.
    - CSS: `var(--ds-motion-cinematic-duration)` + `var(--ds-motion-cinematic-easing)`
    - Tailwind: `duration-cinematic ease-cinematic`
  - Raw durations and easings in route code are forbidden (will be enforced in
    Wave 4).
- **Canonical button variants** — `primary`, `secondary`, `tertiary`, `ghost`,
  and `link`; destructive styling is `destructive`, not a variant.
- **Canonical button sizes** — `sm` = 28px, `md` = 36px, `lg` = 44px; `icon`
  uses the `md` control height with equal width.

## Source guards (composer + header radius/padding)

Composer and app-shell header surfaces must not reintroduce off-token corner
radius or padding magic numbers. Enforced by:

- `apps/web/tests/unit/chat/composer-header-radius-padding-source-guard.test.ts` (JOV-3532)
- Numeric px map: `apps/web/lib/design/system-b-radius.ts` (`SYSTEM_B_RADIUS_PX`)

**Forbidden in scoped files** (`ChatInput.tsx`, `ChatComposerToolbar.tsx`,
`chat-motion.ts`, `HomeComposerHero.tsx`, `components/shell/*`):

- `borderRadius: 28` (or any bare number) — use `SYSTEM_B_RADIUS_PX['3xl']` etc.
- `rounded-[…]` arbitrary Tailwind radius
- `p-[…]` / `px-[…]` / `py-[…]` (and `pt|pb|pl|pr-[…]`) arbitrary padding

**Escape hatch** (previous line or same line, with reason + Linear ID):

```ts
// system-b-allow: safe-area inset requires calc(); no spacing token covers env() (JOV-3532)
className='… pb-[calc(1rem+env(safe-area-inset-bottom))]'
```

To widen the guard: clean the new surface of un-allowlisted violations first,
then add its path to the test's scoped file list.

Admin page titles are owned by the shell breadcrumb — `AdminPage` must not
re-render the route title (JOV-3527;
`apps/web/tests/unit/app/admin-page-header-dedupe.test.ts`).

## Common Failure Modes

- Defining the same token in multiple CSS files
- Adding new base tokens in `globals.css`
- Creating a second reusable marketing component family outside
  `components/marketing/*`
- Treating `/artist-profiles` as the public profile canonical surface
- Treating `/ai` or `/investors` as design surfaces instead of redirects
- Adding bare `borderRadius: N` or `rounded-[Npx]` on composer/header surfaces
  (use `SYSTEM_B_RADIUS_PX` / named utilities; see source guards above)
