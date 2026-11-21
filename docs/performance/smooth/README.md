# Smooth baselines + regression ratchet

Committed public-surface medians live in [`baselines/`](./baselines/). The
harness under `apps/web/scripts/performance-smooth-*` extends
`performance-budgets-guard` (no second controller).

## What fails a PR

Exact-head Coverage (Source Validation → PR Ready) always runs:

1. `perf:smooth:ratchet --check` — six public baseline cells must be present
2. Hermetic planted-regression tests for the noise-aware compare

Live measure + compare (isolated preview or `next start`, **never production**):

```bash
pnpm --filter @jovie/web perf:smooth:baseline -- --base-url <isolated> --compare
# or measure separately, then:
pnpm --filter @jovie/web perf:smooth:ratchet -- --measured path/to/summary.json
```

In `CI=true`, `--compare` is on by default after a baseline run. A cell fails
when any ratcheted metric worsens beyond noise vs the committed baseline.

Lighthouse stays non-blocking; this Smooth ratchet is the blocking gate.

## Noise tolerance

| Metric | Allowed regression |
|---|---|
| CLS | `max(0.005, 25% of baseline)` |
| LCP | `max(150ms, 8% of baseline)` |
| INP | `max(50ms, 25% of baseline)`; null measured INP is skipped |
| Reloads / dup fetches / flicker / hydration | any integer increase |

## Updating baselines after intentional improvements

```bash
# Isolated preview only — never production
pnpm --filter @jovie/web perf:smooth:baseline:write -- --base-url <isolated>
```

`--write` is **shrink-only**: it refuses to raise a committed median beyond
noise. After a deliberate re-baseline (new environment, remasure after harness
trust fix), pass `--allow-raise` once with the same write command.
