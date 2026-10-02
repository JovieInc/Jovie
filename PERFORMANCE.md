# Performance Audit

Tracking issue: [JOV-2712](https://linear.app/jovie/issue/JOV-2712/track-platform-hardening-deliverables-and-ios-evidence-baseline)

## Scope

This audit tracks cold start, warm start, route transitions, chat rendering,
profile loading, search performance, memory usage, CPU usage, network requests,
bundle size, rerenders, queries, data fetching, image loading, caching,
hydration, and virtualization.

## Current Evidence

| Area | Evidence | Status |
| --- | --- | --- |
| iOS launch/render smoke | `pnpm run ios:screenshots` passed on `origin/main` `9e9200348e` and captured loading, signed-out, profile, settings, onboarding, chat, and iPad shell states. | Visual smoke passed |
| iOS auth test runtime | `pnpm test:auth:ios` passed deterministic auth coverage on `origin/main` `9e9200348e`. | Test runtime captured in command output |
| iOS signed-out launch performance | `pnpm run ios:performance` passed on `origin/main` `546e2af1f4` using `XCTApplicationLaunchMetric(waitUntilResponsive: true)`. The iPhone 17 simulator run observed launch-to-`Continue in Browser` timings of `3.59`, `2.98`, `2.89`, `2.88`, `2.86`, and `2.86` seconds from the xcodebuild activity log, average `3.01s`; artifacts are in `artifacts/ios-test-results/launch-performance/Test-Jovie-launch-performance-2026.06.02_05-52-46-0700.{log,xcresult}`. | Baseline captured; 2s target is not met under JOV-2712 |
| iOS shell runtime performance | `pnpm run ios:runtime-performance` passed locally on `codex/ios-frame-hitch-evidence` after `c9be9b797a` and wrote `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_08-27-31-0700-summary.md`. The deterministic Chat to Profile to Chat bottom-navigation flow averaged `0.687s` monotonic time, `0.093s` CPU time, and `60036.557 kB` peak physical memory across 5 measured iterations. The XCTest requests `XCTHitchMetric(application:)` on iOS 26+ simulator runtimes, but the xcodebuild log emitted no measured hitch or frame metric lines; earlier local simulator graphics probes reported `Hitches is not supported on this platform` and `The graphics instruments do not support the current device`. | Runtime baseline captured; frame-drop proof remains required under JOV-2712 |
| iOS memory/leak baseline command | `pnpm run ios:memory` passed locally after `318557208f` and wrote `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/summary.md`. The deterministic `-ui-testing-ready` shell reported a `sample` physical footprint of `36.6M`; `leaks --outputGraph` returned status `255` because local Developer Tools security is disabled, so no `.memgraph` was created. Strict mode `JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1` exits nonzero and writes a summary when the memgraph is blocked. | Repeatable command captured; leak proof remains required under JOV-2712 |
| Web first load and Lighthouse | Evidence required under JOV-2712. | Open |
| Electron startup and memory | Evidence required under JOV-2712. | Open |
| Chrome Extension popup/background performance | Evidence required under JOV-2712. | Open |

## Targets

| Platform | Target | Current status |
| --- | --- | --- |
| Web | First load under 2 seconds, no unnecessary rerenders, Lighthouse over 90. | Evidence required under JOV-2712 |
| iOS | Launch under 2 seconds, no frame drops, no memory leaks. | Launch baseline captured at average `3.01s` to signed-out shell under UI-test automation; runtime baseline captured shell transition clock, CPU, and memory metrics and now requests the iOS 26+ hitch metric, but no hitch/frame lines were emitted; frame-drop and leak evidence required under JOV-2712 |
| Electron | Startup under 3 seconds, stable memory footprint, no renderer crashes. | Evidence required under JOV-2712 |
| Chrome Extension | Fast popup open, fast background execution, minimal memory usage. | Evidence required under JOV-2712 |

## Installed desktop resource collector (JOV-4400)

`pnpm desktop:memory` remains the development smoke harness (GPU disabled,
fixed settling delay). It does not establish authenticated chat readiness.

`pnpm desktop:performance` attaches to a running, installed production Mac app
without changing its launch flags, enabling remote debugging, or quitting it.
The collector verifies the packaged build identity against the bundle and the
selected main process. It rejects missing renderer/GPU processes, explicit GPU
overrides on the main process, and software-rendering/debug flags in the tree.
A GPU process alone does not prove hardware acceleration.

On a Mac, open the production app normally using an authorized test account.
Find the main `Jovie` PID in Activity Monitor (not a Helper process), then run
from the repository root, substituting that PID:

```bash
pnpm desktop:performance --pid 12345 --messages 200 --scenario foreground-idle
```

At the interactive prompt, verify the fixture is loaded, focus the composer,
type and clear a short draft, and confirm the requested work state by entering
`ready`. Sampling starts only after this confirmation and after the collector
brings the app forward or hides it. Keep the requested state for the capture;
streaming scenarios require a controlled test prompt that is still streaming
at confirmation. No message is sent by the collector. Visibility preparation and per-sample checks use
macOS System Events and require the terminal's Automation/Accessibility access;
a failure produces an incomplete report. The app remains running in the chosen
visibility state afterward.

Repeat with `--messages 20`, `200`, and `2000`, using histories with tool results
and attachments. Choose `--scenario foreground-idle`, `hidden-idle`,
`foreground-streaming`, or `hidden-streaming`. Defaults are ten samples, two
seconds apart; `--samples` (2–60) and `--interval-ms` (250–10000) bound the run.
`--app` selects another installed production `.app`; `--output` selects the
artifact directory. JSON metadata and a Markdown summary otherwise go to
`artifacts/desktop-test-results/production-baseline/<timestamp>/`.

Each sample verifies that the selected PID is hidden, or foreground with an
unminimized window, and records per-process and aggregate RSS/OS CPU estimates for main,
renderer, GPU, utility, and other descendants. Raw commands and conversation
contents are not persisted. Summed RSS includes shared pages; it is not unique
physical footprint. macOS `ps` CPU percentages are OS-defined recent estimates,
not CPU deltas over the sample interval. Readiness and message counts are
operator attestations. Work state is attested at confirmation, not verified
throughout sampling; a response can end during the run. The loaded hosted-web
revision is also unverified. A captured baseline is not a performance gate,
startup measurement, interaction latency result, or leak proof.

**Ship now:** collect bounded resource evidence from the real installed app.
**Re-evaluate when:** [JOV-7463](https://linear.app/jovie/issue/JOV-7463) captures
authenticated focused-composer launch instrumentation and the real Mac workload
matrix. **Then:** set measured regression budgets, including input/paint and
conversation-switch latency. This collector's source tests do not close the
open Electron runtime-evidence rows above.
