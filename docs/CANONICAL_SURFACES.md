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

## How to add a marketing screenshot

There is one screenshot system: [apps/web/lib/screenshots/registry.ts](../apps/web/lib/screenshots/registry.ts). Do not create a parallel one.

To use a screenshot on a marketing page:

1. **Check whether the asset already exists as a scenario** in `registry.ts`. If yes, note its `id` and confirm `consumers` includes `'marketing-export'`.
2. **If the scenario is missing the `marketing-export` tag**, move it (or split it out) into a `defineScenarios(...)` block that uses `ADMIN_MARKETING_AND_INVESTOR`.
3. **If no scenario exists**, add one with a stable `id`, the live route, a `waitFor` selector, the right `viewport`, a `publicExportPath` filename, and `consumers: ADMIN_MARKETING_AND_INVESTOR`. The daily [`screenshots.yml`](../.github/workflows/screenshots.yml) workflow will capture it overnight; the auto-PR commits the PNG and updates the manifest.
4. **In the marketing page**, use one of:
   - `<MarketingScreenshot scenarioId="..." />` ([apps/web/components/marketing/MarketingScreenshot.tsx](../apps/web/components/marketing/MarketingScreenshot.tsx)) — for product-shell renders that wrap `<ProductScreenshot>`.
   - `<MarketingPhoneImage scenarioId="..." />` ([apps/web/components/marketing/MarketingPhoneImage.tsx](../apps/web/components/marketing/MarketingPhoneImage.tsx)) — for plain `<Image>` renders inside a `<PhoneFrame>` (or anywhere `<ProductScreenshot>` is the wrong shape).

Do not write `<Image src="/product-screenshots/..." />` in marketing pages. The wrappers resolve URL + retina dimensions from the registry so renames are caught by typescript and so a renamed PNG never silently breaks a marketing page.
