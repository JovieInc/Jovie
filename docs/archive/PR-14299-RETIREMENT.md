# PR #14299 Retirement

The fixed-runner cancellation healer is retired. Native merge-queue staging in
[#14484](https://github.com/JovieInc/Jovie/pull/14484) moved source-PR unit
evidence to the exact combined head and routes those shards through
`CI_UNIT_RUNNER`; the deterministic source `ci-fast` lane now uses hosted
capacity. Reintroducing a `workflow_run` job with `actions: write` would add a
second cancellation mutation controller beside the native queue and runner
routing controls.

Replacement: #14484 at `153d2e92b67eec0830fe5f194ff39ba3d8745030`
and #14485 at `4182a46470b5344234969ad375b00207a8fe5dd5`. No healer
workflow or classifier from #14299 remains.
