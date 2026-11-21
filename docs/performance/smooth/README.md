# Smooth harness

Measurement-first jank/perf baseline for Tim's Smooth surfaces. Extends the
existing end-user budgets controller (`performance-budgets-guard.ts` +
`performance-route-manifest.ts`); it is not a second controller.

## Surfaces

Homepage, artist profile, `/start`, `/app` Inbox, `/app/chat`, Work library,
Audience, Identity (Presence), Settings (account destination).

Desktop `1512×944`. Mobile `390×844` with `4×` CPU throttle. Median of 3 runs.

## Commands

```bash
# Auth storage for creator surfaces (isolated build / PR preview only)
pnpm --filter @jovie/web run perf:auth -- --base-url "$BASE_URL"

# Capture + write checked-in baselines
pnpm --filter @jovie/web run perf:smooth:baseline:write -- \
  --base-url "$BASE_URL" \
  --auth-path .context/perf/auth/user.json
```

Baselines land in `docs/performance/smooth/baselines/*.json` with
`summary.json`. Project chat table: Smooth store `docs/smooth-baseline.md`.

## Targets

CLS ≤ 0.02 · LCP ≤ 2.0s desktop / ≤ 2.5s mobile · INP ≤ 150ms · 0 full-page
reloads · 0 duplicate fetches · 0 flicker · 0 hydration warnings.

Never measure production. Stub metered AI/paid APIs.
