---
name: perf-loop
version: 2026-05-07
description: |
  Measurement-first Jovie performance hardening loop. Use when route budgets,
  bundle size, DB/query behavior, test speed, Playwright throughput, or CI
  duration regress.
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - Edit
---

# /perf-loop

This is the gstack entrypoint for Jovie performance hardening.

## Source Of Truth

Load and follow `.claude/skills/jovie-performance-hardening/SKILL.md`.

## Operating Rules

- Measure before changing code.
- Use existing Jovie performance scripts first.
- Use one hypothesis family per iteration.
- Re-measure with the same method.
- Keep only validated wins.
- Do not replace route UIs or change behavior to make metrics pass.
- Do not run as a broad daily LLM cron.

## Required Output

Return the full deliverable set required by
`.claude/skills/jovie-performance-hardening/SKILL.md`:

### A. Brief Verdict

- bottleneck
- root cause
- accepted fix
- measured delta
- remaining risk

### B. Change Ledger

One row per iteration:

- hypothesis
- files
- before
- after
- verdict

### C. Budget Status

- passed
- failed
- tightened
- deferred with reason

### D. Next Move

- next highest-leverage bottleneck
- whether to continue loop or stop

### E. Artifact Paths

Point to:

- perf baseline
- route measurements
- Lighthouse reports
- bundle report
- test perf baseline/report
