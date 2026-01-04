# Testing Optimization Plan

## 2026-01-04 Update
- Reduced `apps/web/tests/unit/useFormState.test.tsx` from 2,116 lines to 150 focused cases.
- Preserved coverage for initial state, success path, retry flow, manual retry, cancellation, and backoff jitter helper.
- Expect faster feedback loops on web unit suite due to lighter hook coverage.

## Next Targets
- Review other >900-line unit tests for similar consolidation opportunities.
- Track runtime deltas after pruning to set new performance baselines.
