# Updating screen

`UpdatingScreen` is the shared, restrained update presentation. It composes the
canonical `JovieO` and `ProgressBar`, with System B surfaces, typography and color.
The full-page layout mirrors the supplied centered updater reference. The embedded
layout is consumed by the existing desktop download dialog.

## Ownership and behavior

- The native updater and `DesktopUpdateProvider` remain the lifecycle owners.
  This component never downloads, installs, restarts, estimates progress or stores
  a second updater state.
- `progress` is a measured percentage. Missing, infinite or NaN values are
  indeterminate. Finite values clamp consistently to 0–100 for text and ARIA.
- `state` is `updating`, `ready` or `error`. Ready/error stop the loading feedback
  and retain the action slot. The caller supplies truthful title, copy and actions.
- Strings passed to `title` render as an h1. A dialog passes its existing
  `DialogTitle` and `DialogDescription`, retaining its name and focus owner.
- Progress, details and action slots reserve space. Percentages are tabular and
  are not part of the live region, avoiding repeated screen-reader announcements.
- Reduced-motion behavior is inherited from the brand/progress primitives.
- Supply a manual-download destination from the product's existing route owner.
  Hiding the desktop dialog does not cancel a background download; installation
  continues to require the existing explicit restart action.

## Verification boundary

Storybook `UI/Patterns/UpdatingScreen` covers light/dark, zero/unknown/partial,
ready/error, permission-denied, unavailable, long-copy and compact compositions.
Tests prove progress semantics, actions, focus retention and automated a11y.
These are component proofs, not a claim that a native update was installed.
