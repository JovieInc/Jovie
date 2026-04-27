# Jovie Release Operating System

## What It Is

A planning surface that turns songs and artist context into a Friday-cadence
release calendar with deterministic workflows underneath every moment. The
surface is `/app/dashboard/release-plan` — desktop-only, artist-facing.

In P0 the demo runs entirely from client state: a frozen, hand-curated 12-moment
plan, deterministic generators, and a one-shot replanning command driven by the
sidebar chat. No schema changes, no migrations, no server actions.

## Vocabulary

- **Release moment** — a single dated touchpoint on the calendar. Types:
  `single`, `remix`, `acoustic`, `lyric_video`, `visualizer`, `merch_drop`,
  `tour_tie_in`, `media_appearance`, `anniversary`.
- **Workflow** — operational tasks underneath a moment, drawn from the
  product's `release_task_catalog` (`Distribution`, `DSP Pitching`,
  `Asset Production`, etc.). Rendered as `T-21 · Finalize cover artwork`.
- **Adaptive replanning** — when a moment moves, dependent state (workflow due
  dates, fan notification `sendsAt`) follows automatically because everything
  derives from the moment's `friday` via pure functions.

## Surfaces

- **`/app/dashboard/release-plan`** — empty state with EP track cards plus
  Generate, then a horizontally scrolling Friday-column calendar with
  color-coded moment cards and inline tour-date markers.
- **Release moment drawer** — opens on card click. Workflow task list (with
  `data-relative-days` attribute keyed off `release_task_catalog`) plus an
  inline fan notification preview that recomputes every render.
- **Sidebar chat** — natural-language replanning. The phrase
  `"Move the remix closer to the LA show"` (any casing/punctuation) is matched
  by the deterministic command registry, which dispatches a window event the
  calendar listens for.

## Data Model (today)

Client state only in P0. There are no new tables, no new enums, and no new
columns. The calendar holds an array of `DemoMoment` in React state; the chat
command mutates it through a pure transform (`moveRemixNearLAShow`).

Persistence in P1 lands in existing tables — `discog_releases`,
`release_tasks` + `release_task_catalog`, `tourDates`,
`fanReleaseNotifications`. No new tables.

## Determinism contract

- All date math is UTC string-based (`yyyy-mm-dd`). No browser-local timezone
  formatting on the visible Friday.
- `generateDemoPlan()` returns a fresh sorted array of exactly 12 moments
  every call. Mutating one call's result does not affect the next.
- `moveRemixNearLAShow(plan)` is a pure transform that never mutates input
  and is idempotent.
- Workflow due dates and fan notification `sendsAt` are derived from
  `moment.friday` — they update in the same React tick as the move.
- Animation is decorative: the Playwright arc never asserts on animation
  frames. Final DOM state is the contract.

## Roadmap

- **P0 (shipped)** — deterministic client-side demo of the OS concept.
- **P1** — persisted plans, real generate over the user's catalog,
  drag-to-reschedule, real fan notification rows, dashboard CTA.
- **P2** — adaptive planner reacts to tour date changes, conflict detection,
  multi-track timing rules.
- **P3** — generative workflows (LLM suggestions for copy, pitch text,
  artwork prompts) layered on top of the deterministic substrate.

## Files

- `apps/web/lib/release-planning/demo-plan.ts` — types, frozen plan,
  generators, transforms, helpers.
- `apps/web/lib/release-planning/demo-events.ts` — window event bus.
- `apps/web/lib/release-planning/demo-workflow-tasks.ts` — task catalog map.
- `apps/web/components/jovie/release-calendar/ReleaseCalendar.tsx`
- `apps/web/components/jovie/release-calendar/ReleaseMomentDrawer.tsx`
- `apps/web/app/app/(shell)/dashboard/release-plan/page.tsx`
- `apps/web/lib/chat/command-registry.ts` — keyword command.
- `apps/web/tests/e2e/yc-demo.spec.ts` — Playwright arc.
