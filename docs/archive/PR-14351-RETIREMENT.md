# PR #14351 Retirement

The deploy-relevance patch is retired. Native merge-queue staging in
[#14484](https://github.com/JovieInc/Jovie/pull/14484) replaced it with exact
merge-group proof reuse and a fail-closed direct-main fallback, so the older
deploy classifier conflicts with the final release topology.

Replacement: #14484 at `153d2e92b67eec0830fe5f194ff39ba3d8745030`. No CI
code from #14351 remains.
