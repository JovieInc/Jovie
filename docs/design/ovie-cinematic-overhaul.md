# Ovie cinematic Home overhaul

Date: 2026-10-23. Owner: Tim White. Implementation: `ui/ovie-cinematic-home-1`, no Linear issue — ad-hoc.

Reading this as: an operations workspace for Tim, with a restrained cinematic language, leaning toward Noir Ion and Linear’s compact type and controls.

Dials: low design variance, functional motion, high information density. The focal band is an operational readout, not a marketing hero.

## Problem and evidence

The bottleneck is scan hierarchy on the full-screen ultrawide Home. Tim requested one focal point, a quiet content zone, truthful real-time state and stable geometry.

Source audit at `8795a323c4f`:

- `HomeLoopPulse` gives every metric the same 80px card and text size. It fits by hiding overflow, so lower-priority measurements disappear as the workspace narrows. The hierarchy cannot distinguish a primary signal from context.
- `HomeLoopCanvas` already has a useful ultrawide grid: asks occupy three of twelve columns and the board/completed work share nine from `@7xl`. Preserve that data and action ownership rather than adding another dashboard.
- The Home story covers inbox asks with shipping unavailable. Populated, loading, empty and error compositions live in the real shared HomeLoop stories; they are fixtures, not production evidence.
- `ContentMetricStat` reserves three lines only when subtitle exists; its skeleton uses two differently spaced lines. That primitive does not provide the requested state-stable density contract.
- The existing `useHudShippingStateQuery` owns shared shipping state, source freshness and a 6-second poll; Home’s inbox query owns its 30-second poll. Neither endpoint has an SSE route in the inspected source.

Browser audit: pending local Storybook startup. PNGs and a viewport/overflow receipt are written to `/tmp/ovie-audit/`; this section will be replaced with observed findings before publication.

## Proposal

### Layout

Keep one full-width operational focal band above a quiet content zone. Emphasize the first source-ranked metric using `glance`; use `summary` for supporting signals and `dense` for compact lists. Never invent or reorder numbers to create a visual story. Keep the shared asks, stage board, completed work, generated answer and retry/undo actions intact. Ultrawide full screen (3440×1440) is primary; verify 1440×900 and compact reflow as well.

Integrate the metric presentation into the existing HomeLoop composition through a bounded slot. Replace the existing pulse presentation rather than appending a second metric row. No new route, panel, product action, data source or feature flag.

### Metric family

`packages/ui/atoms/cinematic-metric.tsx` owns `CinematicMetric` and its skeleton. Compose existing `Skeleton`, tooltip and utility owners; add no dependency or token family. Densities reserve 112/96/80px frames with fixed label/value/context slots. All labels/context are 12px; values use tabular figures. Null displays “Not measured”; measured zero displays 0. Pending hides stale values and context. Missing detail keeps its space. Full text is available through the canonical tooltip on pointer hover or keyboard focus, with Escape dismissal and a visible focus ring.

This is product-specific presentation built by composing maintained internal primitives. It is not new durable infrastructure. Existing `ContentMetricStat` consumers remain owned by their current feature; only the explicitly requested Home adoption consumes the new family in this stack.

### Background

Use one clean, full-bleed, tokenized editorial layer behind the focal band, with a neutral quiet zone beneath. No grain, grit, orange, fabricated artwork, decorative shapes, autoplay or layout-moving effects. Transparent glass regions reuse the shared surface ladder; content contrast wins over atmosphere.

EVENT: Tim’s 2026-10-23 brief specifies Noir Ion anchors Ion `#3FAFF3`, Ultra `#A789F0`, Pulse `#EB6AC6`, one accent per section. Consume existing semantic roles rather than embedding those hex values in components. Coordinate any source-token convergence with the background owner; never introduce local palette aliases or edit locked canonical token files in this stack.

### Real-time path

Compose the current React Query queries and preserve cache, cancellation, focus refresh, stale/unknown states and polling intervals. Prefer push/SSE only when the endpoint already supplies it; reconcile push into the same cache. This stack introduces no endpoint, second poller, page reload, event bus or new real-time infrastructure.

## State and verification contract

Metric states: loading; measured nonzero; measured zero; unmeasured/unavailable; absent context; long label/value/context; all three densities; dark/light inherited themes; hover; keyboard focus; Escape dismissal; reduced motion. No metric has an enabled/disabled mutation action.

Home states: shipping and asks loading independently; populated; empty; partial inbox sources; unauthorized; disconnected/stale; retry; decision pending/undo/failure; generated answer/streaming/history. Keep existing state meanings and action tests. Skeleton-to-data transitions must preserve hero/main-section geometry, focus and sibling positions.

Run the actual UI unit runner with coverage, the exact CI UI selector, touched-package lint and repository typecheck. Playwright measures metric and sibling rectangles at 3440×1440, 1440×900 and 390px, checks focus/hover stability, and captures real Storybook components. Screenshots are local component evidence, not deployed or installed-Mac acceptance.

## Ownership and delivery

- PR 1: this proposal, design-system metric, stories, unit and browser stability tests.
- PR 2: separate worktree from PR 1; adopt the family in Ovie Home and compose the focal-band layer after checking and stacking/rebasing onto the background PR.
- Parallel owners: `~/JovieInc/wt-1023-bg`, `wt-1023-sidebar`, `wt-1023-rail`, `wt-1023-library`. Do not edit their shell, sidebar, right-rail or shared background files. PR #22806 owns titlebar behavior; PR #22829 includes `HudBottlenecksCard` and Storybook accessibility work. Read the fleet rules in #22870 and SwiftUI/ultrawide direction in #22877 before implementation.
- Mac boundary: these are existing shared web components used by Ovie. No new Electron/native surface, signing, platform configuration or SwiftUI migration is included.

Ship now: the two small presentation slices once their checks pass. Re-evaluate when exact-head CI or rendered state/viewport evidence finds a regression. Then repair the owning layer and rerun affected checks. Roll back by reverting the relevant presentation PR; queries and authoritative records are unchanged.

GBrain retrieval: exact search returned no design decision; broader query timed out (`gbrain-unavailable`). The latest explicit brief controls; source observations above were inspected locally.
