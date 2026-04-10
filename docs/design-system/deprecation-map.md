# Deprecation Map

This file tracks legacy implementations that should not be used for new work and should be retired as consolidation progresses.

## Legacy public layout primitives

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| `apps/web/components/site/Container.tsx` on production public routes | Deprecated | `apps/web/components/marketing/MarketingContainer.tsx` | Public profile not-found route is migrated; storybook-only use is acceptable during migration |
| Route-local public layout wrappers | Deprecated | `apps/web/components/site/PublicPageShell.tsx` | Marketing/legal/blog-style routes should converge here |

## Legacy public navigation/TOC

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| Route-specific legal/blog TOCs | Deprecated | `apps/web/components/molecules/PublicTableOfContents.tsx` | Investor long-form surfaces still need migration |
| Direct `btn-linear-login` / `btn-linear-signup` route-level usage | Deprecated for new work | shared public CTA classes / `AuthActions` | Existing untouched routes still need migration |

## CTA duplication

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| `PrimaryCTA.tsx` as a separate primary-button concept | Constrain | `CTAButton.tsx` or shared public CTA classes | Keep only if needed for existing product surfaces during migration |
| `marketing-cta` route-local use | Deprecated for new work | shared public CTA contract | Guarded in representative marketing/public surfaces; long-tail public routes still need migration |
| Route-local pricing/support action links | Deprecated | shared public CTA contract | Address in public-template slice |

## Auth duplication

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| `AuthFormContainer.tsx` mobile header duplication | Constrained | `AuthLayout.tsx` contract | Reduced to form-frame responsibilities only |
| `AuthBranding.tsx` shell spacing ownership | Constrained | auth shell contract | Preserve branding aesthetic, but keep shell spacing in `AuthLayout` |

## Internal route-entrypoint drift

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| `SettingsErrorState` in settings route entrypoints | Deprecated | `PageErrorState` | Guarded across settings page/content entrypoints |
| Route-local admin playlists shell chrome | Deprecated | `ContentSurfaceCard` | Guarded in `admin-playlists-surface-guard.test.ts` |
| Route-local dashboard profile chat shell chrome | Deprecated | `ContentSurfaceCard` | Guarded in `internal-shell-surface-guard.test.ts` |

## Profile accessibility drift

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| Shared profile `menu` / `menuitem` semantics for dialog content | Deprecated | dialog + plain button contract via `ProfileDrawerShell` | Guarded in `ProfileMenuDrawer.test.tsx` |

## Token drift

| Legacy item | Status | Replacement | Notes |
| --- | --- | --- | --- |
| Direct `var(--linear-*)` usage for shared public semantics | Gradual migration | semantic aliases in `design-system.css` | Keep primitives, add aliases first |
| Page-local max-width wrappers duplicating marketing widths | Deprecated | `MarketingContainer` | Search public routes before adding new wrappers |
