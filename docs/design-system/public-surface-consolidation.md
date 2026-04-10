# Public Surface Consolidation

This document records the current canonical public-surface design system for the Jovie web app. It is the first implementation artifact for the broader consolidation plan in `.context/attachments/jovie_design_system_consolidation_plan.md`.

## Canonical foundations

### Token sources

- `apps/web/styles/design-system.css`
- `apps/web/styles/linear-tokens.css`
- `apps/web/styles/theme.css`

### Canonical shared shells

- Public header: `apps/web/components/site/MarketingHeader.tsx`
- Public footer: `apps/web/components/site/MarketingFooter.tsx`
- Public page shell: `apps/web/components/site/PublicPageShell.tsx`
- Marketing container widths: `apps/web/components/marketing/MarketingContainer.tsx`
- Long-form public content shell: `apps/web/components/marketing/MarketingContentShell.tsx`
- Token inventory artifact: `docs/design-system/token-inventory.md`

### Canonical long-form document template

- Document frame: `apps/web/components/organisms/DocPage.tsx`
- Legal wrapper: `apps/web/components/organisms/LegalPage.tsx`
- Document toolbar: `apps/web/components/molecules/DocToolbar.tsx`
- Document sidebar / table of contents: `apps/web/components/molecules/LegalSidebar.tsx`
- Shared public document TOC primitive: `apps/web/components/molecules/PublicTableOfContents.tsx`

## Consolidation inventory

### Shell/template families found in production code

- Marketing/public pages: `apps/web/app/(marketing)`
- Legal pages: `apps/web/app/(dynamic)/legal`
- Auth pages: `apps/web/app/(auth)`
- Public profile pages: `apps/web/tests/unit/profile/*` and route-specific profile code

### Duplicate or drifting implementations to retire

- `apps/web/components/site/Container.tsx`
  Uses a separate width scale from `MarketingContainer`.
- `apps/web/components/organisms/HeaderNav.tsx` versus `apps/web/components/site/MarketingHeader.tsx`
  Both represent public headers. `MarketingHeader` is now the canonical public-marketing/legal wrapper.
- Public layouts in `apps/web/app/(marketing)/layout.tsx` and `apps/web/app/(dynamic)/legal/layout.tsx`
  These now share `PublicPageShell` and should stay aligned.

## Current canonical widths

- Landing: `1280px`
- Page: `1120px`
- Prose: `680px`

These values come from the existing production implementation in `MarketingContainer`. New public-facing layouts should consume these widths instead of introducing new max-width classes.

## Current canonical shell rules

- One public header implementation across marketing and legal pages
- One public footer implementation across marketing and legal pages
- One shared fixed-header offset token
- Long-form legal/docs-style content should use the document template stack rather than route-specific one-off spacing wrappers
- Public document sidebars and TOCs should use one shared primitive instead of route-family copies

## Immediate migration targets

1. Finish remaining public launch/detail routes that still use page-local width wrappers instead of canonical public width owners.
2. Continue aliasing shared shell values behind semantic public/profile/app-shell tokens instead of introducing new raw literals.
3. Complete auth helper reduction so `AuthLayout` remains the single auth shell owner and helper components stay content-only.
4. Continue internal route-entrypoint convergence on canonical `ContentSurfaceCard`, `PageErrorState`, and app-shell primitives.
