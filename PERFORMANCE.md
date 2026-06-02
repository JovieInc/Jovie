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
| Web first load and Lighthouse | Evidence required under JOV-2712. | Open |
| Electron startup and memory | Evidence required under JOV-2712. | Open |
| Chrome Extension popup/background performance | Evidence required under JOV-2712. | Open |

## Targets

| Platform | Target | Current status |
| --- | --- | --- |
| Web | First load under 2 seconds, no unnecessary rerenders, Lighthouse over 90. | Evidence required under JOV-2712 |
| iOS | Launch under 2 seconds, no frame drops, no memory leaks. | Evidence required under JOV-2712 |
| Electron | Startup under 3 seconds, stable memory footprint, no renderer crashes. | Evidence required under JOV-2712 |
| Chrome Extension | Fast popup open, fast background execution, minimal memory usage. | Evidence required under JOV-2712 |
