# Testing Optimization Plan

## Current Progress
- Added explicit performance budgets for the smoke, critical, and full suites to keep runtime expectations visible and enforceable.
- Extended the test performance guard to honor the budgets, optional baseline reuse, and suite selection so CI can block regressions instead of only reporting them.
- Wired the guard into CI to generate a fresh profile and enforce the budgets on every relevant change.

## Budget Thresholds
| Suite | Budget | Notes |
| --- | --- | --- |
| Smoke | < 30s | Keeps deploy checks and quick validations snappy.
| Critical | < 2m | Ensures critical regression coverage stays responsive.
| Full | < 5m | Prevents drift for comprehensive runs without slowing pipelines.

## Next Focus Areas
- Track historical performance baselines per suite to spot creeping regressions earlier.
- Tighten p95 and per-test thresholds once the new guard data stabilizes.
- Surface guard results in developer docs and dashboards for faster feedback loops.
