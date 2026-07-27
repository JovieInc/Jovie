# Visual Testing Policy (Canonical)

The single source of truth for how visual and accessibility regressions are caught before they ship. Read this before touching UI enforcement, Chromatic, Storybook coverage, or visual baselines. Shipping tiers and merge-queue mechanics are canonical in [`docs/PR_FLOW.md`](PR_FLOW.md); taste and design-system rules in [`DESIGN.md`](../DESIGN.md) and [`.claude/rules/ui.md`](../.claude/rules/ui.md).

## Purpose

Visual regressions are correctness failures that typecheck and lint cannot see. Every visual surface has exactly one owning layer that catches its class of bug; no layer duplicates another's job, and no bug class is unowned. Enforcement runs in the merge queue, never from source `pull_request` events (repo canon: [`docs/PR_FLOW.md`](PR_FLOW.md) §2, [`.claude/rules/release.md`](../.claude/rules/release.md)).

## Layer Ownership

| Layer | Owner | Catches |
|---|---|---|
| Static contract | TypeScript, Biome, structural guards | Wrong imports, boundary violations, token drift, banned patterns |
| Component states | Storybook | Missing states, interaction bugs, prop wiring |
| Component visuals | Chromatic | Per-story visual diffs on shared components |
| Component a11y | Storybook a11y + axe | ARIA, roles, focus order, contrast at component level |
| App behavior + page visuals | Playwright | Flows, routing, page-level snapshots, mobile overflow |
| App a11y | axe + Playwright | Page-level WCAG violations in real layouts |
| Performance | Lighthouse / Web Vitals | CLS, LCP, regression budgets |
| Taste | Human approval | Judgment calls machines cannot make |

A bug that escapes its owning layer is a policy gap — file a Linear issue; do not patch it in a lower layer.

## Required Gates

These lanes are **required on UI PRs** and run as path-selected jobs in the merge queue (`merge_group`), not from source `pull_request` events:

- Storybook static build.
- Storybook interaction/a11y tests: `pnpm --filter @jovie/web test:a11y`.
- Chromatic affected-story visual diff.
- Playwright smoke + mobile-overflow + axe subset.

Path filter covers: `apps/web/components`, `packages/ui`, styles/tokens, Storybook config, stories, visual specs. Backend-only PRs skip all of these lanes.

## Chromatic Budget Policy

Chromatic is on the **free plan**: $0/month, 5,000 billed snapshots/month, Chrome-only, testing pauses at exhaustion. The first paid tier is $179/month.

- **Never auto-upgrade.** A plan change is a spend decision; it requires explicit human approval. No agent, workflow, or retry loop may trigger one.
- **At 80% monthly usage: stop nonessential Chromatic runs.** Required merge-queue lanes continue; scheduled, exploratory, and broad-matrix runs stop.
- **At 100% (exhaustion): fall back to local Playwright screenshot diffs.** Do not wait on Chromatic, do not bypass visual review — the fallback lane owns the diff until the billing cycle resets.

Cost discipline, standing rules:

- Project is already linked (`chromatic.config.json`, projectId `Project:68a7da03dd53297b6349f724`). Do not re-link or create new projects.
- TurboSnap (`onlyChanged`) stays **on**. Never run full-suite Chromatic builds outside an explicit, human-approved baseline reset.
- One Chrome viewport per ordinary component. Extra viewports only where layout actually changes between breakpoints.
- Snapshot scope starts narrow: `packages/ui` primitives, shared nav/shells, forms, dialogs/popovers/menus, tables/cards, public-profile primitives, critical onboarding components. Expansion requires budget headroom (see Phase 3).

## Baseline Approval Rule

**Agents must never run `--update-snapshots` and merge blindly.** Any visual diff resolves exactly one of three ways:

1. **Fix the regression.** The diff is a bug; the code changes, the baseline does not.
2. **Explicit human approval** via the `visual-approved` PR label.
3. **Recorded justification** in the PR when the diff is intentional and trivially verifiable.

The `Visual Approval Guard` workflow fails any PR that touches the following without the `visual-approved` label:

- `apps/web/tests/e2e/__snapshots__/**`
- `apps/web/contrast-ratchet.baseline.json`
- `apps/web/touch-target-ratchet.baseline.json`
- `apps/web/tests/unit/design-system/button-surface-classes-remaining.json`

This includes JOVIE_BOT self-healing baseline PRs (branch `visual-baselines/auto-update`) — automation proposes, humans approve.

**Invariant: baselines may improve, never silently regress.**

## Story Coverage Ratchet

Every reusable component must have stories for applicable states: default, hover/focus, disabled, loading, empty, error, long content, narrow container, mobile viewport, dark + light, reduced motion, keyboard interaction. Any PR adding or materially changing a reusable UI component must add or update its story in the same PR.

Known gaps (recorded, not Phase 1 work):

- `packages/ui` has ~37 atom components but only 11 story files.
- The `apps/web/.storybook/main.ts` stories glob (`../components/**/*.stories.*`) does not pick up `packages/ui` stories.

Direction is a ratchet: coverage percentage only goes up. New components never ship below the bar; existing gaps burn down in Phase 2.

## Metrics & Ratchets

Track, report, and ratchet on:

- % shared components with stories (up only)
- % stories with interaction tests (up only)
- Unreviewed visual changes (toward zero)
- axe violations by severity (down only)
- Mobile-overflow failures (down only)
- Visual-test flake rate (down only)
- Snapshot count per PR (budget: 5,000/month)
- Escaped visual bugs (post-mortem each)
- CLS regressions (down only)
- Canonical-component bypasses (toward zero)

## Phase Roadmap

- **Phase 1 (done when gates wired):** required merge-queue lanes live, path filter active, Visual Approval Guard enforced, this policy published.
- **Phase 2:** close story-coverage gaps against the ratchet; adopt deterministic fixtures — fixed clocks, stable IDs, local fonts, disabled animations, seeded data — so diffs mean what they say.
- **Phase 3:** expand Chromatic snapshot scope and viewports strictly within the free-tier budget; revisit plan economics only with usage evidence and explicit human approval.
