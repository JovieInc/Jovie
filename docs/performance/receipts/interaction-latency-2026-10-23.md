# Interaction latency receipt (2026-10-23)

Playwright Chromium harness using the declared manifest selectors and measureInteractionLatency. The authenticated Jovie app shell was not measured. Pass/fail is the harness against the unchanged budgets.

Budgets were not changed. Median is nearest-rank p50 (`ceil(p/100*n)-1`).
Machine-readable receipt: docs/performance/generated/interaction-latency-2026-10-23.json
measureInteractionLatency observes next paint, first feedback and usable state concurrently from the action start. Each visible milestone waits two animation frames to include a paint; simultaneous milestones share that paint instead of accumulating extra frame waits.

- Device: Ubuntu 24.04.1 LTS; kernel 6.8.0-134-generic; x64
- CPU: 16 x Intel(R) Core(TM) i9-9900K CPU @ 3.60GHz
- Browser: Chromium 148.0.7778.96 (Playwright 1.64.1)
- Viewport: 1440x900
- Runs: 2 warmup (unscored) + 20 scored per scenario

| Scenario | Class | Median first feedback | p95 first feedback | Median usable | p95 usable | p95 render to interactive | Max dropped frames | Target | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| command-palette-open | command-palette-open | 30.8ms | 45.5ms | 30.8ms | 45.6ms | n/a | 0 | Command palette open <=100ms p95 | pass |
| command-palette-filter | type-to-filter-result-update | 30.9ms | 31.4ms | 30.9ms | 31.5ms | n/a | 0 | Type-to-filter result update <=50ms p95 | pass |
| slash-picker-open | local-ui-toggle | 31.0ms | 31.6ms | 31.0ms | 31.7ms | n/a | 0 | Local UI toggle <=100ms p95 | pass |
| release-table-row-move | keyboard-selection-row-movement | 31.0ms | 45.8ms | 31.3ms | 45.9ms | n/a | 0 | Keyboard selection / row movement <=50ms p95 | pass |
| release-drawer-open | cached-route-view-switch | 30.2ms | 45.2ms | 30.2ms | 45.3ms | n/a | 0 | Cached route/view switch <=200ms p95 | pass |
| chat-route-cached-switch | cached-route-view-switch | 30.9ms | 31.4ms | 30.9ms | 31.4ms | n/a | 0 | Cached route/view switch <=200ms p95 | pass |
| chat-message-round-trip | chat-message-round-trip | 30.8ms | 31.3ms | 30.8ms | 31.3ms | 30.2ms | 0 | Chat feedback <100ms p50, first reply <300ms p95, interactive <50ms p95, zero dropped scroll frames | pass |
| metadata-save-feedback | mutation-visible-feedback | 30.7ms | 31.1ms | 30.7ms | 31.1ms | n/a | 0 | Mutation visible feedback <=100ms p95 | pass |
| lyrics-toggle | local-ui-toggle | 30.8ms | 31.4ms | 30.8ms | 31.4ms | n/a | 0 | Local UI toggle <=100ms p95 | pass |
| audio-play-pause-visual | audio-transport-visual-response | 30.8ms | 31.1ms | 30.8ms | 31.2ms | n/a | 0 | Audio transport visual response <=50ms p95 | pass |
