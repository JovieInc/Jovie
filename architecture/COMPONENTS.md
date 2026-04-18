# Component Architecture Guide

## Overview

Jovie’s current UI architecture is organized around three surface families:

- Marketing
- Public surface
- Dashboard / app

The canonical route contract for design-system surfaces lives in
[`apps/web/lib/canonical-surfaces.ts`](../apps/web/lib/canonical-surfaces.ts).

Current canonical surfaces:

- `homepage`
- `public-profile`
- `release-landing`
- `dashboard-releases`

This is the source of truth for live routes, review routes, and screenshot
alignment.

## Global Hierarchy

```text
apps/web/components/
├── atoms/
├── molecules/
├── organisms/
├── marketing/
└── features/
```

Use global `atoms`, `molecules`, and `organisms` for reusable UI building
blocks. Use `features/*` for domain-specific product logic.

## Surface Families

### 1. Marketing

Reusable marketing-page primitives belong in:

- [`apps/web/components/marketing`](../apps/web/components/marketing)

Examples:

- `MarketingPageShell`
- `MarketingHero`
- `MarketingSectionIntro`
- `MarketingMetricCard`
- `MarketingSurfaceCard`

These are the only reusable landing-page primitives. Route-specific marketing
composition belongs under route-local `_components/` folders inside
`app/(marketing)`.

Examples:

- `app/(marketing)/new/_components/*`

Do not create a second reusable landing library under `features/landing` or
another route-specific shared folder.

### 2. Public Surface

Shared public-facing shell chrome belongs in:

- [`apps/web/components/organisms/public-surface`](../apps/web/components/organisms/public-surface)

Exports:

- `PublicSurfaceShell`
- `PublicSurfaceStage`
- `PublicSurfaceHeader`
- `PublicSurfaceFooter`

These primitives own:

- ambient background treatment
- stage sizing and panel framing
- top control row layout
- bottom safe-area spacing

Business logic stays in the feature shells that compose them.

Current adopters:

- `SmartLinkShell`
- `ProfileShell`

### 3. Dashboard / App

Dashboard and authenticated app UI stays in feature-owned component families,
using the shared token system but not the marketing or public-surface shell
layers.

The canonical dashboard design-system surface today is `dashboard-releases`.

## Public Profile Path

The live public profile rendering path is:

- `/[username]`
- `StaticArtistPage`
- `ProfileCompactTemplate`

That is the canonical production profile template path.

Legacy profile implementations remain in the repo for test and story coverage,
but they are not the live route path:

- `PublicProfileTemplate`
- `PublicProfileTemplateV2`
- `AnimatedArtistPage`

`ProgressiveArtistPage` now stays on `StaticArtistPage` and no longer upgrades
to the animated legacy path.

## Route Classification

Important distinction:

- `/artist-profiles` is a marketing acquisition page
- it is not the canonical `public-profile` surface

Redirect-only routes are also not design surfaces:

- `/ai`
- `/investors`

## Atomic Design Rules

### Atoms

- no business logic
- no feature services
- props-driven only

### Molecules

- one clear composition purpose
- light state only
- reusable within or across families

### Organisms

- can own state and business logic
- can compose feature-specific flows
- should represent a coherent system, not a random wrapper

## Placement Rules

Use this decision order:

1. If it is reusable across many product areas, place it in global
   `atoms` / `molecules` / `organisms`.
2. If it is a reusable marketing-page primitive, place it in
   `components/marketing/*`.
3. If it is reusable public-facing shell chrome, place it in
   `components/organisms/public-surface/*`.
4. If it is route-local composition, keep it under that route’s `_components/`.
5. If it is feature-specific business UI, keep it in `features/*`.

## Current Source Files

- [`apps/web/lib/canonical-surfaces.ts`](../apps/web/lib/canonical-surfaces.ts)
- [`apps/web/components/marketing`](../apps/web/components/marketing)
- [`apps/web/components/organisms/public-surface`](../apps/web/components/organisms/public-surface)
- [`apps/web/components/features/profile/StaticArtistPage.tsx`](../apps/web/components/features/profile/StaticArtistPage.tsx)
- [`apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx`](../apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx)

## Anti-Patterns

- treating the dashboard as the only “real” design system
- creating route-specific reusable libraries when a shared family already exists
- exporting legacy profile templates as if they are canonical live surfaces
- treating redirect routes as design surfaces
- adding homepage extraction work into the marketing/public-surface cleanup stack
