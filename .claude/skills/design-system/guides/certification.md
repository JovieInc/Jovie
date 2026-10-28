# Certification, benchmark and alignment

"Done" for a component or surface is evidence in the real system, not a green check.

## Per-diff (today)
`pnpm component-ship-gate`: changed shippable component needs test, story, Pen match, hygiene, ratchet and rendered certification receipts (Badge, Button, Card are live in Storybook). Design-ci judge evidence and the `jovie.certification/v1` kernel are founder-taste packets, not whole-tree status.

## Whole-tree certificate (in review in PR #23141, `jovie.component-certificate/v1`; use once merged)
Ten criteria, fail closed (unknown counts as missing): ds-owner, tokens, states (story per reachable state or a written waiver), tests, a11y (axe), frontend-rules (focus loss, input reset, layout shift, nested bordered surfaces, input retention), mutation (>= 80), visual (CI capture), journeys, benchmark (judgment against the benchmark library with adopt/adapt gaps done). The certificate binds to the source hash. `--spec` renders the agent work order. Baseline 2026-10-25: 0 of 1,324 shippable components certified.

## Alignment rules (apply when art-directing and when judging)
- Everything sits on the 4px beat; icon and label share a center line; text baselines align across a row; equal gutters; rail and table edges align to shell edges.
- One focus ring, one hover and one pressed treatment per control family; destructive actions need confirm or undo.
- Empty, loading, error, disabled, long-content, compact, and permission-denied states exist for every surface.
- Contrast: AA minimum for text and 3:1 for non-text; verified on dark and light.
- No layout shift on state change; skeletons match final geometry.

## Benchmark
Judge against best-in-class references (Linear, Apple, and the benchmark library entries) per peak moment, record adopt/adapt/skip with reasons, and add new references to the library. Judgments are logged; the cheap judge's accuracy against Tim's post-ship taste feedback is a tracked metric that decides when to escalate.

## Measure
Stage timestamps and p50/p95 for: Pen master change -> code PR open -> merge -> staging deploy -> taste feedback. Each fix leaves a guard (registry: `defect-guard-registry.json` when merged).
