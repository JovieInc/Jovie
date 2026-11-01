---
name: perf-loop
version: 2026-05-07
description: "Autonomous measure-experiment-keep loop for route budget, bundle, DB, test and CI regressions."
allowed-tools:
  - Bash
  - Read
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
- Do not install `vercel-optimize` or enable Observability Plus. Scanner-only
  Vercel specialization lives in `jovie-performance-hardening` section [11].

## Required Output

Return:

- bottleneck
- root cause
- before metric
- after metric
- accepted or reverted fix
- checks run
- remaining risk
