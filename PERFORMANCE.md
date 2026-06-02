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
| iOS shell runtime performance | `pnpm run ios:runtime-performance` passed locally after `e1df2767fc` and wrote `artifacts/ios-test-results/runtime-performance/Test-Jovie-runtime-performance-2026.06.02_07-46-34-0700-summary.md`. The deterministic Chat to Profile to Chat bottom-navigation flow averaged `2.725s` monotonic time, `0.185s` CPU time, and `59695.770 kB` peak physical memory across 5 measured iterations. Local simulator graphics probes reported `Hitches is not supported on this platform` and `The graphics instruments do not support the current device`. | Runtime baseline captured; frame-drop proof remains required under JOV-2712 |
| iOS memory/leak baseline command | `pnpm run ios:memory` passed locally after `318557208f` and wrote `artifacts/ios-test-results/memory-baseline/Jovie-memory-baseline-2026.06.02_06-27-15--0700/summary.md`. The deterministic `-ui-testing-ready` shell reported a `sample` physical footprint of `36.6M`; `leaks --outputGraph` returned status `255` because local Developer Tools security is disabled, so no `.memgraph` was created. Strict mode `JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1` exits nonzero and writes a summary when the memgraph is blocked. | Repeatable command captured; leak proof remains required under JOV-2712 |
| Web first load and Lighthouse | Evidence required under JOV-2712. | Open |
| Electron startup and memory | Evidence required under JOV-2712. | Open |
| Chrome Extension popup/background performance | Evidence required under JOV-2712. | Open |

## Targets

| Platform | Target | Current status |
| --- | --- | --- |
| Web | First load under 2 seconds, no unnecessary rerenders, Lighthouse over 90. | Evidence required under JOV-2712 |
| iOS | Launch under 2 seconds, no frame drops, no memory leaks. | Launch baseline captured at average `3.01s` to signed-out shell under UI-test automation; runtime baseline captured shell transition clock, CPU, and memory metrics; local simulator graphics probes could not capture frame/hitch data; frame-drop and leak evidence required under JOV-2712 |
| Electron | Startup under 3 seconds, stable memory footprint, no renderer crashes. | Evidence required under JOV-2712 |
| Chrome Extension | Fast popup open, fast background execution, minimal memory usage. | Evidence required under JOV-2712 |
