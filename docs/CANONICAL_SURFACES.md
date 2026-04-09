# Canonical Surfaces

This document and [apps/web/lib/canonical-surfaces.ts](../apps/web/lib/canonical-surfaces.ts) are the source of truth for the repo's design-system surfaces on current `main`.

## Canonical Surface List

| ID | Label | Live Route(s) | Review Route | Screenshot ID(s) | Current Owner | Component Family | Description |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `homepage` | Homepage | `/` | `/` | `marketing-home-desktop` | `app/(home)/page.tsx -> HomePageNarrative` | `features/home` | Primary marketing homepage and current live review surface. |
| `public-profile` | Public Profile | `/[username]` | `/demo/showcase/public-profile` | `public-profile-desktop`, `public-profile-mobile` | `app/[username]/page.tsx -> StaticArtistPage` | `features/profile` | Canonical public artist profile surface rendered from `StaticArtistPage` and `ProfileCompactTemplate`. |
| `release-landing` | Release Landing | `/r/[slug]`, `/[username]/[slug]` | `/demo/showcase/release-landing` | `release-landing-desktop`, `release-landing-mobile` | `app/r/[slug]/ReleaseLandingPage.tsx -> ReleaseLandingPage` | `features/release` | Canonical smart-link release destination sharing the public shell direction. |
| `dashboard-releases` | Dashboard Releases | `/app/dashboard/releases` | `/demo` | `dashboard-releases-desktop`, `dashboard-releases-sidebar-desktop`, `dashboard-release-sidebar-detail-desktop` | `app/app/(shell)/dashboard/releases/page.tsx -> ReleasesPageClient` | `features/dashboard/organisms/release-provider-matrix` | Canonical authenticated releases workspace and current dashboard review/capture surface. |

## What Is Not A Canonical Surface

- `/ai` is a redirect, not a designed surface.
- `/investors` is a redirect, not a designed surface.
- Screenshot and admin review infrastructure already exists and is not redefined here.

## Current Source Files

- [apps/web/lib/canonical-surfaces.ts](../apps/web/lib/canonical-surfaces.ts)
- [apps/web/lib/screenshots/registry.ts](../apps/web/lib/screenshots/registry.ts)
- [apps/web/lib/screenshots/catalog.ts](../apps/web/lib/screenshots/catalog.ts)
- [apps/web/components/features/demo/showcase-surfaces.ts](../apps/web/components/features/demo/showcase-surfaces.ts)

## Next Slice

Slice 2 should align screenshot and admin metadata to these canonical surfaces rather than rebuilding the existing screenshot system.
