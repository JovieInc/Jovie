# UI Hardening Backlog — Hermes-UI-Orchestrator

**Started:** 2026-04-23
**Base:** origin/main @ b6ed327dfe
**Mission:** Polish/consolidation only — no product redesign or feature work.

## Issue Families

| ID | Family | Owning Sub-Agent |
|----|--------|------------------|
| F-A | Large-table layout shift after first paint | Agent 3 (writer) + Agent 2 (discovery) |
| F-B | Clipped badges/pills | Agent 5 |
| F-C | Metadata alignment drift across rows | Agent 4 (deferred) |
| F-D | Inefficient score/status/icon-only column | Agent 6 |
| F-E | Pill groups should stack/wrap | Agent 5 |
| F-F | Action menu visibility/inconsistency | Agent 7 (deferred) |
| F-G | Loading/skeleton geometry mismatch | Agent 3 |
| F-H | Responsive failures | cross-cutting QA |
| F-I | Dark/light mismatch | cross-cutting QA |
| F-J | Acceptable / no action | — |

## Wave Plan

**Wave 1 (in flight):**
- PR-1: Admin table loading-shift stabilization — Agent 3
- PR-2: One pill-heavy row → Linear-style stacked pills — Agent 5
- PR-3: One score/status column → right-aligned compact — Agent 6
- PR-4: Chat composer anchored — Agent 8

**Wave 2 (queued, depends on inventory):**
- Scannability pass — Agent 4
- Menu/dropdown normalization — Agent 7
- Details panel alignment — Agent 9

**Wave 3 (blocked on existing token sweeps draining):**
- Narrow token consolidation pilot — Agent 10

## Background Read-Only Agents

- Agent 1: PR Monitor (continuous review of UI hardening PRs)
- Agent 2: Inventory builder (feeds Wave 2 targeting)

## Hard Constraints (apply to every agent)

- No production data mutation; no auth/billing/permissions/customer-data changes.
- No broad redesigns or core functionality changes.
- No `--no-verify`, no weakening tests/lint/typecheck/a11y.
- No secrets in commits, screenshots, summaries.
- No temp files, debug overlays, or generated junk in PRs.
- Every UI-touching PR: screenshot of affected view in body (memory: feedback_pr_screenshots).
- Branch prefix: `itstimwhite/ui-hardening/<scope>`.
- Bot reviews (CodeRabbit, Greptile) are blocking before merge.
