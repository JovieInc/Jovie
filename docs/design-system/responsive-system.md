# Responsive System

This document records the canonical responsive contract chosen from values already present in the codebase.

## QA viewport matrix

- `320`
- `360`
- `375`
- `390`
- `414`
- `768`
- `820`
- `1024`
- `1280`
- `1440`
- `1536`

## Canonical widths

- Landing container: `1280px`
- Page container: `1120px`
- Prose container: `680px`
- Semantic public aliases: `--public-content-max-landing`, `--public-content-max-page`, `--public-content-max-prose`
- Internal wide content panel: `84rem`
- Internal reading content panel: `56rem`
- Internal form content panel: `50rem`
- Semantic app-shell aliases: `--app-shell-content-max-wide`, `--app-shell-content-max-reading`, `--app-shell-content-max-form`
- Profile shell width alias: `--profile-shell-max-width`
- Profile shell header width alias: `--profile-shell-header-max-width`

## Public shell rules

- Shared fixed-header offset is `--public-shell-header-offset`
- Marketing and legal/blog-style pages should use the same top offset behavior
- Public TOCs become sticky at large breakpoints and collapse away below large breakpoints

## Section spacing rules

- Marketing hero spacing is owned by `MarketingHero`
- Marketing section spacing is owned by `MarketingSectionFrame` and `section-spacing-linear`
- Long-form legal/blog spacing should be owned by `DocPage` or route templates using `MarketingContainer`

## Pricing behavior

- Pricing tier grid collapses to one column on compact widths
- Comparison table uses a mobile plan selector pattern instead of horizontal overflow-first behavior
- CTA rows should stack or center without creating horizontal scroll

## Public profile behavior

- Mobile uses locked viewport / drawer-driven interaction where already implemented
- Desktop allows normal document scrolling
- Profile module stack should remain single-column and avoid ad hoc breakpoint forks
- Shared profile shell values should use semantic aliases for shell width, header width, card radius, and drawer radius

## Auth behavior

- Auth shell is keyboard-aware on mobile
- Branding and title may hide visually when the keyboard is visible
- Form width remains constrained by `AUTH_FORM_MAX_WIDTH_CLASS`

## Internal app shell behavior

- App shell gap/radius use existing `--linear-app-*` tokens
- Table routes may use `overflow-x-auto` inside content panels
- Non-table routes should avoid horizontal overflow and use vertical panel scrolling
