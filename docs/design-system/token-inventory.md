# Token Inventory

This document records the current token sources and the canonical values already present in production code. It is an inventory artifact for the consolidation plan, not a redesign proposal.

## Source files

- `apps/web/styles/design-system.css`
- `apps/web/styles/linear-tokens.css`
- `apps/web/styles/theme.css`
- `apps/web/app/globals.css`

## Canonical token layers

### Primitive app/theme tokens

Defined primarily in `apps/web/styles/design-system.css`.

#### Background and surface

- `--color-bg-base`
- `--color-bg-surface-0`
- `--color-bg-surface-1`
- `--color-bg-surface-2`
- `--color-bg-surface-3`
- `--color-bg-page`
- `--color-bg-hover`
- `--color-bg-elevated`
- `--color-bg-input`
- `--color-bg-active`
- `--color-bg-button`
- `--color-bg-tooltip`

#### Text

- `--color-text-primary-token`
- `--color-text-secondary-token`
- `--color-text-tertiary-token`
- `--color-text-quaternary-token`
- `--color-text-disabled-token`
- `--color-text-tooltip`

#### Border and focus

- `--color-border-subtle`
- `--color-border-default`
- `--color-border-strong`
- `--color-border-focus`
- `--color-focus-ring`

#### Accent and state

- `--color-accent`
- `--color-accent-hover`
- `--color-accent-active`
- `--color-accent-subtle`
- `--color-accent-foreground`
- `--color-accent-gray`
- `--color-accent-blue`
- `--color-accent-purple`
- `--color-accent-pink`
- `--color-accent-red`
- `--color-accent-orange`
- `--color-accent-green`
- `--color-accent-teal`

#### Button

- `--color-btn-primary-bg`
- `--color-btn-primary-fg`
- `--color-btn-primary-hover`
- `--color-btn-secondary-bg`
- `--color-btn-secondary-fg`
- `--color-btn-secondary-hover`

#### Interaction, badge, skeleton

- `--color-interactive-hover`
- `--color-interactive-active`
- `--color-badge-bg`
- `--color-badge-border`
- `--color-badge-text`
- `--color-cell-hover`
- `--color-skeleton-base`
- `--color-skeleton-shimmer`

### Primitive marketing/public tokens

Defined primarily in `apps/web/styles/linear-tokens.css`.

#### Public text

- `--linear-text-primary`
- `--linear-text-secondary`
- `--linear-text-tertiary`
- `--linear-text-quaternary`
- `--linear-text-inverse`

#### Public background and border

- `--linear-bg-page`
- `--linear-bg-header`
- `--linear-bg-surface-0`
- `--linear-bg-surface-1`
- `--linear-bg-surface-2`
- `--linear-bg-button`
- `--linear-bg-footer`
- `--linear-border-footer`
- `--linear-bg-hover`
- `--linear-border-subtle`
- `--linear-border-default`
- `--linear-border-strong`
- `--linear-border-focus`

#### Public button

- `--linear-btn-primary-bg`
- `--linear-btn-primary-fg`
- `--linear-btn-primary-hover`
- `--linear-btn-primary-border`
- `--linear-btn-secondary-bg`
- `--linear-btn-secondary-fg`
- `--linear-btn-secondary-hover`
- `--linear-btn-accent-bg`
- `--linear-btn-accent-fg`
- `--linear-btn-accent-hover`

#### Public status

- `--linear-success`
- `--linear-warning`
- `--linear-error`
- `--linear-info`

### Typography inventory

Defined primarily in `apps/web/styles/linear-tokens.css` and consumed through classes in `apps/web/app/globals.css`.

#### Font weights

- `--linear-font-weight-normal: 400`
- `--linear-font-weight-medium: 510`
- `--linear-font-weight-semibold: 590`
- `--linear-font-weight-bold: 680`

#### Tracking

- `--linear-tracking-headline: -0.022em`
- `--linear-tracking-subheadline: -0.0175em`
- `--linear-tracking-body: -0.011em`

#### Headline and body sizes

- `--linear-h1-size: 64px`
- `--linear-h2-size: 48px`
- `--linear-h3-size: 20px`
- `--linear-h4-size: 18px`
- `--linear-body-lg-size: 24px`
- `--linear-body-size: 15px`
- `--linear-body-sm-size: 14px`
- `--linear-caption-size: 13px`
- `--linear-label-size: 12px`

#### Canonical type utility classes already in use

- `.marketing-h1-linear`
- `.marketing-h2-linear`
- `.marketing-lead-linear`
- `.marketing-kicker`
- `.marketing-body`
- `.public-doc-label`

### Layout, spacing, radius, sizing

#### Canonical public widths

- `MarketingContainer landing`: `1280px`
- `MarketingContainer page`: `1120px`
- `MarketingContainer prose`: `680px`

#### Existing marketing/layout size tokens

- `--linear-container-max: 1298px`
- `--linear-content-max: 1200px`
- `--linear-hero-section-max: 1024px`
- `--linear-prose-max: 624px`
- `--linear-homepage-max: 1344px`
- `--linear-pricing-grid-max: 1024px`

#### Existing height/radius tokens

- `--linear-header-height: 72px`
- `--linear-button-height-sm: 32px`
- `--linear-button-height-md: 40px`
- `--linear-radius-sm: 8px`
- `--linear-radius-md: 8px`
- `--linear-radius-lg: 12px`
- `--linear-radius-full: 9999px`

#### Existing app-shell layout tokens

- `--linear-app-sidebar-width: 244px`
- `--linear-app-header-height: 40px`
- `--linear-app-header-height-compact: 36px`
- `--linear-app-shell-gap: 8px`
- `--linear-app-shell-radius: 12px`

### Semantic aliases added during consolidation

These aliases keep current values but give public surfaces a single shared contract.

- `--public-shell-header-offset`
- `--public-shell-bg`
- `--public-shell-text`
- `--public-shell-border`
- `--public-shell-content-max`

## Canonical template mapping

- Marketing shell: `apps/web/components/site/PublicPageShell.tsx`
- Public header: `apps/web/components/site/MarketingHeader.tsx`
- Public footer: `apps/web/components/site/MarketingFooter.tsx`
- Marketing widths: `apps/web/components/marketing/MarketingContainer.tsx`
- Long-form public TOC: `apps/web/components/molecules/PublicTableOfContents.tsx`

## Known duplication still to retire

- `apps/web/components/site/Container.tsx`
  Still used by homepage-era surfaces and a few blog/public routes.
- `homepage-section-*` utility family in `apps/web/app/globals.css`
  Useful but separate from the newer marketing shell contract.
- Remaining one-off width and spacing wrappers in blog/profile/dashboard route templates.
