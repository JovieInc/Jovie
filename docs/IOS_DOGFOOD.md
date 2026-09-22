# iOS Dogfood Driver (JOV-4572 foundation slice)

Deterministic, scriptable dogfooding for the native iOS shell. One command runs
a bounded XCUITest exploration across the core app surfaces on the iOS
Simulator, captures screenshots and crash reports, and emits a structured
`report.json` (schema `jovie-ios-dogfood/v1`) that downstream automation can
consume.

This is the foundation slice of "continuous autonomous iOS/macOS dogfooding":
it intentionally does **not** file Linear issues or register a CI schedule.
Both integration points are documented below.

## Run it

```bash
pnpm run ios:dogfood
# or directly:
bash apps/ios/scripts/dogfood-ios.sh
```

The driver reuses `apps/ios/scripts/run-xcodebuild.sh` for destination
resolution (prefers the newest iOS iPhone simulator) and simulator reset, then
runs `xcodebuild test -only-testing:JovieUITests/DogfoodExplorationUITests`.

Useful overrides:

| Env var | Default | Purpose |
| --- | --- | --- |
| `JOVIE_IOS_DOGFOOD_OUTPUT_DIR` | `artifacts/ios-dogfood/<utc-ts>-<sha>` | Output root for the run |
| `JOVIE_IOS_DOGFOOD_ONLY_TESTING` | `JovieUITests/DogfoodExplorationUITests` | Narrow/widen the exploration |
| `JOVIE_IOS_RESET_SIMULATOR` | `1` | `0` keeps prior simulator state |
| `JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS` | unset | Bound the xcodebuild phase |

`artifacts/` is gitignored — a run is pure local evidence, never committed.

## What it explores

`apps/ios/JovieUITests/DogfoodExplorationUITests.swift` drives the app's own
deterministic `-ui-testing-*` launch modes (no network, no auth):

- `testDogfoodSignedOutSurface` — the real first-run auth surface.
- `testDogfoodCoreSurfaceExploration` — chat home, dashboard (profile),
  settings, library, inbox, calendar, audience. Each surface is a fresh launch
  with an anchor assertion, 1–3 bounded surface checks, a liveness check
  (`app.state == .runningForeground`), and a screenshot.
- `testDogfoodDrawerSurfaceSwitching` — user-style navigation: opens the left
  drawer and cycles every reachable surface switcher, asserting each
  destination mounts.

The suite runs with `continueAfterFailure = true`: a dead surface fails the run
but never starves evidence for the rest of the journey.

## Run artifacts

```
artifacts/ios-dogfood/<run-id>/
  report.json        schema jovie-ios-dogfood/v1
  events.jsonl       per-surface events emitted by the test process
  screenshots/       dogfood-<surface>.png per visited surface
  dogfood.xcresult   full result bundle (also carries XCTAttachments)
  crashes/           Jovie*.ips/.crash reports created during the run window
  logs/xcodebuild.log
```

`report.json` is the contract: `verdict` (`pass|fail|inconclusive`),
`surfaces[]` (per-surface status, checks, issues), `crashes[]`,
`surface_summary`, and `artifacts` paths. Exit code is non-zero when the test
action fails **or** a crash report is captured — a crash found while
"everything passed" is still a dogfood finding.

## Integration points (not wired in this slice)

Each deferred item is tracked in Linear (per the durable-follow-up rule):
automatic filing = JOV-6504, nightly scheduling = JOV-6505, macOS driver =
JOV-6506. All are `blockedBy` JOV-4572.

**Automatic Linear filing — Symphony's lane.** `report.json` is the artifact a
filing step consumes: each `issues[]`/`crashes[]` entry maps to one candidate
issue with its surface, check detail, screenshot path, and the run's
`git_sha`/`destination`. Wire it the same way `scripts/qa-swarm` proposals flow
into Linear — dedupe on `(surface, check name)` fingerprints before creating
anything. Deliberately unimplemented here: automatic creation from a young
harness risks issue spam, and Symphony owns the proposal/filing contract.

**Scheduling — nightly lane (JOV-6505).** The intended plug-in is a new job in
`.github/workflows/nightly-tests.yml` (or a sibling scheduled workflow) that
runs `bash apps/ios/scripts/dogfood-ios.sh` on the macOS lane and uploads the
run directory as a workflow artifact. It must stay off the PR gate and the
merge-queue path — see the CI risk-tier table in `docs/PR_FLOW.md` (deep/nightly
tier) and the macOS-job capacity note (JOV-6107): a scheduled dogfood run
consumes one of the organization's limited macOS jobs, so it belongs on the
nightly cadence, not per-PR.

**macOS (Electron/MenuMonitor) dogfooding (JOV-6506).** This slice covers the iOS shell
only. `apps/macos/MenuMonitor` is a menu-bar accessory with its own SPM tests;
a future slice should add an equivalent driver for the Electron app
(`apps/desktop`) — most likely a Playwright-driven pass against the packaged
app — rather than stretching this XCUITest driver across platforms.
