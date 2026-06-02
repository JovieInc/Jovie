# Design System Audit

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Scope

This audit tracks canonical primitives, duplicate components, spacing,
typography, colors, button styles, loading states, empty states, navigation
patterns, modals, drawers, cards, tables, lists, right rails, and error states.

## Current Evidence

| Surface | Evidence | Result |
| --- | --- | --- |
| iOS signed-out/profile/settings/onboarding/chat | `pnpm run ios:screenshots` passed on `origin/main` `9e9200348e`; screenshots are in `artifacts/ios-screenshots`. | Rendered and legible |
| iOS iPad shell | `pnpm run ios:screenshots` produced `07-ipad-shell.png` at `1640x2360`. | Rendered and legible |
| Web app shell and marketing surfaces | Evidence required under JOV-2712. | Open |
| Electron shell | Evidence required under JOV-2712. | Open |
| Chrome Extension UI | Evidence required under JOV-2712. | Open |

## Acceptance Checks

| Check | Status |
| --- | --- |
| Every screen uses canonical design system primitives | Evidence required under JOV-2712 |
| No duplicated component systems | Evidence required under JOV-2712 |
| No legacy UI patterns | Evidence required under JOV-2712 |
| Loading, empty, and error states are consistent | Evidence required under JOV-2712 |
