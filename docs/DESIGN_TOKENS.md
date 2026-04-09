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

## Common Failure Modes

- Defining the same token in multiple CSS files
- Adding new base tokens in `globals.css`
- Creating a second reusable marketing component family outside
  `components/marketing/*`
- Treating `/artist-profiles` as the public profile canonical surface
- Treating `/ai` or `/investors` as design surfaces instead of redirects
