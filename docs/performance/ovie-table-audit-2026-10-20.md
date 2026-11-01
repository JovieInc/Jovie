# Ovie canonical table audit — October 20, 2026

JOV-6894 implementation slice: prevent empty virtual windows from mounting the
whole dataset and restore TanStack's row-ref cleanup. This is local component
runtime evidence. It does not certify deployed Ovie, physical Mac performance,
fan behavior, authenticated route fetches, or every table consumer.

The current source already includes PR #19915's column alignment repair,
PR #19916's bounded row modes, and JOV-7798's shared dense person cells and
keyboard render budget. Contacts, Users and Creators consume `AdminDataTable`
→ `UnifiedTable`. This repair stays in that same family.

## Reproduced failures

1. `VirtualizedTableBody` treated an empty virtual window as a request to render
   every row. A zero-height viewport therefore mounted 10,000 rows even though
   virtualization was enabled. `initialRect` already supplies a bounded SSR
   window, so the fallback is unnecessary.
2. `VirtualizedTableRow` discarded `measureElement(null)` on ref cleanup.
   Without a ResizeObserver delivery, the real TanStack virtualizer retained
   visited row elements: the new test exceeded its 62-element budget at 69.
   Chromium's ordinary scrolling already pruned through ResizeObserver; this
   test demonstrates the missing ref lifecycle, not an observed indefinite
   leak in every browser.

Both new performance tests failed before the repair; both pass afterwards.
Existing alignment, keyboard and SSR behavior remains covered. Affected real-table
integration fixtures opt into a shared measured 640px viewport and canonical row
mode heights, preserving their assertions instead of relying on jsdom's
zero-height full-dataset fallback. Presence explicitly scrolls its off-window
Pricing page into view before inspecting or opening it.

## Same-method browser measurements

Baseline: `8c631355d4fa27ce77c81301c7c8892f1e07d3a5`. Headless Chromium
148.0.7778.96 on Linux, 1280×800, Storybook development build, 10,000 synthetic
people, 640px viewport, dense 32px rows, overscan 5. Forty 100-row scroll jumps,
then collapse/reopen the viewport, then ten 25/10,000-row dataset toggles.
Cell counts record committed renders through React Profiler callbacks.
Heap and DOM counters follow forced GC. Latency covers a DOM click through two
animation frames. Exact samples and repaired source digests are in the
[measurement receipt](ovie-table-audit-2026-10-20.json).

| Measurement | Before | After |
| --- | ---: | ---: |
| Mounted rows while hidden | 10,000 | 0 |
| Additional cell renders on hide | 10,000 | 0 |
| JS heap while hidden | 121,503,252 bytes | 53,935,460 bytes |
| DOM nodes while hidden | 50,466 | 466 |
| Hide-to-paint sample | 7,719.5 ms | 15.8 ms |
| JS heap after filter sequence | 75,574,044 bytes | 59,957,212 bytes |

Scroll and filter latency did not consistently improve under shared host load;
no claim is made for those timings. The eliminated full-dataset render explains
the repeatable viewport transition spike. This does not establish the cause of
every reported People interaction spike. Early window-error capture also finds
single-frame ResizeObserver notification warnings on the baseline's hide and the
repair's hide/reveal transitions. Vite intercepts them before Playwright's
`pageerror` channel. Their remaining investigation is included in JOV-8660;
passing row/retention budgets do not certify warning-free navigation.

## Regression budgets and reproduction

- A 10,000-row SSR window remains bounded by its 1080px initial viewport.
- A 640px viewport paints at most 31 dense rows; a hidden window paints none.
- Keyboard j/k renders at most the two focus-changing cells.
- Ref retention stays within two rendered windows without ResizeObserver delivery.
- Forty browser scroll jumps and ten dataset toggles keep DOM growth below 1,000
  nodes after GC, maintain 32px row heights and preserve the table element.
- Playwright covers 390px/1280px in light/dark themes and attaches current heap,
  node, render-count and interaction observations. Timings remain observations;
  deterministic render/retention budgets are the regression gates. The four browser
  cases join the existing combined-head Storybook matrix; no PR job or runner
  is added.

From the repository root:

```sh
pnpm --filter @jovie/web exec vitest run components/organisms/table/organisms/UnifiedTable.perf.test.tsx tests/unit/organisms/table/VirtualizedTableBody.test.tsx tests/unit/organisms/table/VirtualizedTableRow.test.tsx
STORYBOOK_BASE_URL=http://localhost:6014 pnpm --filter @jovie/web exec playwright test --config=playwright.config.storybook.ts tests/e2e/storybook-table-performance.spec.ts --workers=1 --reporter=line
```

The second command needs the repository Storybook server running at that URL.
The story fixture has no backend, subscriptions or production credentials.
Remaining route/consumer and deployed Mac commissioning is tracked in
[JOV-8660](https://linear.app/jovie/issue/JOV-8660).

Ship now: the two shared lifecycle corrections and bounded regression budgets.
Re-evaluate when: the deployed Mac build and representative founder dataset can
be profiled against the same navigation workload. Then: identify remaining
route, subscription, identity-cell and consumer geometry failures from that
runtime evidence, retaining this shared table as the canonical owner.
