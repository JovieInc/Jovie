# Typecheck performance

JOV-4250 established that typechecking was a material bottleneck. The original cold full-repo check took 294.93 seconds, local leaf edits took 71–98 seconds, and six substantive CI samples had a 77.66-second P50 / 87.93-second P95. The shipped path uses pinned TS7 native batch checking for fast feedback while retaining TS6 as an independent CI merge gate.

Machine-readable results: [`typecheck-performance-results.json`](./typecheck-performance-results.json). Enforced targets and rolling baselines: [`.github/ci-harness/typecheck-performance.json`](../../.github/ci-harness/typecheck-performance.json).

## Baseline and final results

| Scenario | Baseline P50 | Baseline P95 | Final P50 | Final P95 | P95 change | Target | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Cold full repo | n/a | 294.93s | 26.56s | 27.99s | -90.5% | 30s | PASS |
| Warm full repo | n/a | 22.36s | 0.80s | 0.83s | -96.3% | 10s | PASS |
| Incremental leaf edit | 80.33s | 97.51s | 3.59s | 4.89s | -95.0% | 5s | PASS |
| Widely imported edit | n/a | >202s observed on the old compiler path | 17.77s | 19.99s | >-90% | 25s | PASS |
| CI typecheck (effective stable gate) | 77.66s | 87.93s | 9.86s | 10.52s local equivalent | -88.0% | 45s | PASS locally; CI workflow ratchet active |

The repo-specific leaf target is 5 seconds rather than the default 2 seconds. The measured program contains 9,255 files and roughly 1.45 million TypeScript plus declaration lines; TS7 reduced leaf P95 from 97.51 seconds to 4.89 seconds, but the current source boundary cannot reliably reach 2 seconds without a larger project-reference migration. The default 30-second cold, 10-second warm, and 45-second CI targets are enforced.

Repeated-run coefficient of variation is 3.6% cold, 3.4% warm, 11.6% leaf, 7.0% widely imported, 11.4% native CI-equivalent, and 5.8% stable CI-equivalent. All controlled scenario runs are below 15%. Long continuous local stress loops eventually triggered laptop thermal throttling; the nightly ratchet uses fresh hosted runners and 10 measured samples after two warmups.

The committed ratchet uses the later sustained native CI-equivalent campaign (8.70s P50, 10.12s P95, three samples). The results artifact retains the earlier 10-sample controlled campaign (6.15s P50, 7.86s P95) under `ciWarmInitialControlledCampaign` so the faster pre-throttling observation is not confused with the conservative baseline.

Peak full-repo RSS increased from 2.82 GiB to 4.35 GiB because the native compiler trades parallel memory for speed. That is 13.6% of the 32 GiB developer machine and approximately 62% of a 7 GiB hosted runner, below the 75% ceiling. A forced CI-equivalent smoke run measured 2.49 GiB across the full process tree.

On Linux, the ratchet samples cgroup memory usage every 100ms; elsewhere it samples aggregate RSS for the benchmark command and all descendants every 250ms. Its denominator is the lower of host memory and the Linux cgroup limit, so containerized runners cannot inherit an unrealistically large host allowance.

Mean CPU usage was 2.11 core-equivalents for cold full, 1.81 for cached warm full, 2.58 for native CI-equivalent, 1.07 for stable CI-equivalent, 2.14 for leaf edits, and 3.35 for widely imported edits on the 10-logical-CPU developer machine. Turbo cache hit rate was 100% for warm full and intentionally 0% for cold, forced CI, and forced wide-edit scenarios.

## Bottlenecks found

1. The web program dominates the original cold graph: 251.49 seconds and 51.2% of summed package work.
2. The web compiler parses 9,255 files, 716,066 TypeScript lines, and 674,505 declaration lines.
3. CI forced Turbo execution for correctness but restored `.turbo`, so it paid roughly 39 seconds of cache transfer while receiving no task replay benefit. It did not restore `.tsbuildinfo`.
4. Eight packages emitted incremental metadata outside Turbo's declared output, preventing reliable persistence.
5. Eligible draft agent PRs can run both `agent-pr-verify-ready.yml` and canonical CI typechecks. This is documented but not changed here because agent-verification ownership is separate.
6. Direct source aliases and the `@jovie/ui` barrel widen invalidation, but they were no longer the highest-ROI change after native compilation.

No final package exceeds 30% of summed package typecheck time; `@jovie/web` is largest at 22.9%.

## Changes shipped

- Pin `@typescript/native-preview` and use `tsgo` for the fast web batch check.
- Keep `typecheck:stable` on TS6 as a separate CI merge gate.
- Remove deprecated `baseUrl`; `paths` remains relative to the config directory.
- Persist `.cache/tsbuildinfo*` for every workspace package.
- Replace the ineffective ci-fast `.turbo` cache transfer with TypeScript incremental-state caching.
- Record every ci-fast lane duration in the uploaded lane artifact.
- Add a reproducible benchmark harness with cold/warm/edit scenarios, deterministic restoration, P50/P95, variance, CPU, memory, diagnostics, per-package timing, cache-hit rate, JSON, and Markdown output.
- Add a nightly rolling-baseline ratchet with 90-day artifacts.
- Add an intentional-error safety probe covering application, shared/cross-package, test, and generated-client code.

## Rejected optimizations

- TypeScript 5.9.3 pin: web cold check took 322.60 seconds and used 2.42 GiB RSS, worse than TS6.
- Production/test config split: a controlled cold run exceeded 374 seconds before completion; the imported production graph remained dominant, so the split was reverted.
- Stable `tsc --watch`: leaf feedback was approximately 28 seconds after an 83-second startup.
- Native `tsgo --watch`: repeatedly retriggered after writing incremental state, so watch mode was rejected. Only batch mode is used.
- Fixed four-task concurrency for the whole CI graph: increased CI-equivalent timing variance to 32%; reverted. It is retained only for the widely imported benchmark, where it reduced variance to 7%.
- Removing the stable gate: rejected because native TypeScript remains pinned preview infrastructure. Native speed does not replace stable correctness.

## Type-safety verification

`pnpm typecheck:safety-probe` first requires a clean native and stable baseline, then injects deterministic intentional errors and verifies each compiler reports `TS2322` at the exact appended line and column. Restoration removes only the injected marker when a file changed concurrently, avoiding overwrite of an editor save. Both compilers caught 4/4 probes in:

- application code;
- shared package code through a cross-package import;
- co-located test code;
- generated-client boundary code.

Strictness, `skipLibCheck`, include coverage, and production exclusions were not weakened. No `any`, casts, suppressions, or skipped errors were added.

## Regression policy

- Warn above a 10% rolling P95 regression.
- Fail above 20% across at least three samples.
- Fail immediately above 125% of an absolute target.
- Fail if coefficient of variation exceeds 15%, memory exceeds 75% of the host/cgroup limit, an unjustified package exceeds 30% of summed package time, or required resource telemetry is missing.
- Download up to ten prior 90-day artifacts and use the lower of the committed baseline and median historical P95 once at least three compatible reports exist. Rolling history may tighten the ratchet but can never normalize a regression; baseline increases require a reviewed config change.
- Deduplicate history by commit and accept it only when OS, architecture, CPU count, memory class, Node major, and native/stable compiler versions match. The committed measurements are tagged `darwin-arm64`; a different hosted-runner profile bootstraps against absolute targets until it has compatible history.

## Reproduce

```bash
./scripts/setup.sh
pnpm typecheck:benchmark -- --scenario stable-ci-warm,cold-full,warm-full,ci-warm,incremental-leaf,incremental-wide --samples 10 --warmups 2 --cooldown-ms 2000 --check
pnpm typecheck:benchmark -- --scenario web-native-diagnostics --samples 3 --warmups 1
pnpm typecheck:safety-probe
pnpm --filter @jovie/web run typecheck:stable -- --pretty false
```

## Activity-weighted impact

Over the observed 30-day window, the repository had 79 PR CI runs (2.63/day) and 137 first-parent main commits (4.57/day). Conservatively assuming one local pre-push typecheck per merged commit:

- local feedback saved: about 5.84 minutes/day;
- CI runner time saved: about 4.42 minutes/day, accounting for both native and stable parallel gates and removal of the observed 39-second ineffective cache transfer;
- total: about 10.26 minutes/day, or roughly 5.1 hours over a 30-day month.

This estimate is conservative for local work because it counts only one typecheck per merged commit, not iterative checks on unmerged commits.

## Remaining limitations

- The native compiler is pinned preview infrastructure, so the stable gate remains mandatory until sustained parity data supports removal.
- The first stable-gate run without restored build info took 128.96 seconds; subsequent measured P95 was 10.52 seconds. The first cache-seeding run is a one-time exception to the 45-second CI target.
- Multi-minute continuous local stress loops thermally throttled the laptop and are not used as ratchet baselines; controlled runs stay below 15% CV and hosted-runner history is the enforcement source.
- CI final numbers above are local CI-equivalent measurements. The nightly workflow will establish hosted-runner rolling P50/P95 after its first three artifacts.
- Draft-agent duplicate checking remains in `agent-pr-verify-ready.yml`; changing that workflow should be coordinated with agent verification ownership.
- Project references and declaration boundaries remain the next lever if the 5-second leaf or 25-second wide-edit ratchets become insufficient.
