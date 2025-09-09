# Shadcn UI Refactor Tasks

## Overview

Refactor legacy components to align with the `shadcn/ui` design system. Each task should deliver a cleaner implementation, world‑class UX, and copy worthy of Apple's product pages. Use Linear-style task breakdown and lean development principles inspired by Y Combinator.

## Tasks

### CTAButton (`components/atoms/CTAButton.tsx`)
- [ ] Rebuild using `components/ui/Button` with prop parity
- [ ] Fold loading/success states into `LoadingButton` or `OptimisticProgress`
- [ ] Remove direct theme and motion logic in favor of shared hooks

### FrostedButton (`components/atoms/FrostedButton.tsx`)
- [ ] Convert to a `Button` variant (`ghost` or `outline`) with a frosted style token
- [ ] Ensure focus and hover states match shadcn defaults
- [ ] Delete bespoke shape utilities once migrated

### IconButton (`components/atoms/IconButton.tsx`)
- [ ] Replace with `Button` `size="icon"`
- [ ] Preserve link support via `as` prop
- [ ] Leverage shared disabled and focus handling

### DSPButton (`components/atoms/DSPButton.tsx`)
- [ ] Extend `Button` to accept dynamic brand colors and SVG logos
- [ ] Centralize external link behavior
- [ ] Document analytics events within component props

### NavLink (`components/atoms/NavLink.tsx`) & FooterLink (`components/atoms/FooterLink.tsx`)
- [ ] Replace custom link styling with `buttonVariants` or `Link` wrappers from `ui`
- [ ] Merge accessibility and external-link safeguards
- [ ] Provide concise, human copy for labels

### Badge (`components/atoms/Badge.tsx`)
- [ ] Migrate to `Badge` from `shadcn/ui`
- [ ] Map existing variants to design tokens
- [ ] Remove legacy size logic once unified

### LoadingSpinner (`components/atoms/LoadingSpinner.tsx` & `components/ui/Spinner.tsx`)
- [ ] Consolidate into a single spinner component under `ui`
- [ ] Standardize size and color props
- [ ] Drop legacy `Spinner` export

---
Each task aims for minimal surface area, exceptional clarity, and a measurable path to delight.
