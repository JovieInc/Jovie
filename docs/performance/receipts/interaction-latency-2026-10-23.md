# Interaction latency receipt (2026-10-23)

Playwright Chromium harness using the declared manifest selectors and measureInteractionLatency. The authenticated Jovie app shell was not measured. Pass/fail is the harness against the unchanged budgets.

Budgets were not changed. Median is nearest-rank p50 (`ceil(p/100*n)-1`).
Machine-readable receipt: docs/performance/generated/interaction-latency-2026-10-23.json
measureInteractionLatency records first feedback after two animation frames and usable state after another paint. On this 60Hz run that is about 64ms and 97ms. Budgets that require 50ms fail on that floor.

- Device: Ubuntu 24.04.4 LTS; kernel 6.12.94+; x64
- CPU: 4 x Intel(R) Xeon(R) Processor
- Browser: Chromium 148.0.7778.96 (Playwright 1.64.1)
- Viewport: 1440x900
- Runs: 2 warmup (unscored) + 20 scored per scenario

| Scenario | Class | Median first feedback | p95 first feedback | Median usable | p95 usable | p95 render to interactive | Max dropped frames | Target | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| command-palette-open | command-palette-open | 63.7ms | 64.6ms | 97.0ms | 98.0ms | n/a | 0 | Command palette open <=100ms p95 | pass |
| command-palette-filter | type-to-filter-result-update | 63.4ms | 64.0ms | 96.8ms | 97.4ms | n/a | 0 | Type-to-filter result update <=50ms p95 | fail |
| slash-picker-open | local-ui-toggle | 63.1ms | 64.5ms | 96.5ms | 97.8ms | n/a | 0 | Local UI toggle <=100ms p95 | pass |
| release-table-row-move | keyboard-selection-row-movement | 63.6ms | 64.2ms | 96.9ms | 97.5ms | n/a | 0 | Keyboard selection / row movement <=50ms p95 | fail |
| release-drawer-open | cached-route-view-switch | 63.3ms | 64.0ms | 96.7ms | 97.4ms | n/a | 0 | Cached route/view switch <=200ms p95 | pass |
| chat-route-cached-switch | cached-route-view-switch | 63.3ms | 64.6ms | 96.7ms | 97.9ms | n/a | 0 | Cached route/view switch <=200ms p95 | pass |
| chat-message-round-trip | chat-message-round-trip | 63.5ms | 64.2ms | 96.9ms | 97.7ms | 30.0ms | 0 | Chat feedback <100ms p50, first reply <300ms p95, interactive <50ms p95, zero dropped scroll frames | pass |
| metadata-save-feedback | mutation-visible-feedback | 63.3ms | 64.2ms | 96.5ms | 97.7ms | n/a | 0 | Mutation visible feedback <=100ms p95 | pass |
| lyrics-toggle | local-ui-toggle | 63.3ms | 64.9ms | 96.7ms | 98.1ms | n/a | 0 | Local UI toggle <=100ms p95 | pass |
| audio-play-pause-visual | audio-transport-visual-response | 63.5ms | 64.3ms | 96.8ms | 97.7ms | n/a | 0 | Audio transport visual response <=50ms p95 | fail |
