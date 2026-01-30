# Shadcn UI Refactor Tasks

## Overview

Refactor legacy components to align with the `shadcn/ui` design system. Each task should deliver a cleaner implementation, world‑class UX, and copy worthy of Apple's product pages. Use Linear-style task breakdown and lean development principles inspired by Y Combinator.

## Tasks

### CTAButton (`components/ui/CTAButton.tsx`)
- [x] Rebuild using `components/ui/Button` with prop parity
- [x] Fold loading/success states into `LoadingButton` or `OptimisticProgress`
- [x] Remove direct theme and motion logic in favor of shared hooks

### FrostedButton (`components/ui/FrostedButton.tsx`)
- [x] Convert to a `Button` variant (`ghost` or `outline`) with a frosted style token
- [x] Ensure focus and hover states match shadcn defaults
- [x] Delete bespoke shape utilities once migrated

### IconButton (`components/atoms/IconButton.tsx`)
- [x] Replace with `Button` `size="icon"`
- [x] Preserve link support via `as` prop
- [x] Leverage shared disabled and focus handling

### DSPButton (`components/atoms/DSPButton.tsx`)
- [x] Extend `Button` to accept dynamic brand colors and SVG logos
- [x] Centralize external link behavior
- [x] Document analytics events within component props

### NavLink (`components/ui/NavLink.tsx`) & FooterLink (`components/ui/FooterLink.tsx`)
- [x] Replace custom link styling with `buttonVariants` or `Link` wrappers from `ui`
- [x] Merge accessibility and external-link safeguards
- [x] Provide concise, human copy for labels

### Badge (`components/ui/Badge.tsx`)
- [x] Migrate to `Badge` from `shadcn/ui`
- [x] Map existing variants to design tokens
- [x] Remove legacy size logic once unified

### LoadingSpinner (`components/ui/LoadingSpinner.tsx` & `components/ui/Spinner.tsx`)
- [x] Consolidate into a single spinner component under `ui`
- [x] Standardize size and color props
- [x] Drop legacy `Spinner` export

---
Each task aims for minimal surface area, exceptional clarity, and a measurable path to delight.
