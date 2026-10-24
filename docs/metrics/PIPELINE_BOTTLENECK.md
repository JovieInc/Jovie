# pipeline-bottleneck/v1

The single shared contract is
[`pipeline-bottleneck.ts`](../../packages/agent-transport-contracts/pipeline-bottleneck.ts).
Import the browser-safe Zod schema, inferred type, parser, and ranking helpers
from `@jovie/agent-transport-contracts/pipeline-bottleneck`; Node readers use the
separate `pipeline-bottleneck.node` export. No new service or scheduler is added.

Legacy `{ts, metrics, ranking, unmeasured}` snapshots remain valid. `ts` accepts
an ISO timestamp or a nonnegative Unix timestamp. The parser adds
`schema: "pipeline-bottleneck/v1"` when absent and rejects other versions.
Legacy metrics, ranking objects, unmeasured entries, and extra fields are
preserved. Optional `watcher_health` is an opaque object reserved for the Gem
watcher owner; extend this schema when its fields are settled.

Optional `golden_path_sentry` contains:

```json
{
  "score": 72,
  "unresolved_issues": 3,
  "users_affected_24h": 12,
  "top_issue": {"title": "Checkout failed", "flow": "checkout/upgrade", "users": 8},
  "checked_at": "2026-10-23T12:00:00Z"
}
```

Scores are producer-supplied, finite, and within 0–100; counts are nonnegative
integers. `top_issue` is null when unavailable. `checked_at` is the collector's
ISO observation timestamp, never the reader time. Golden paths cover sign-in,
core product actions, checkout/upgrade, public profile/track pages, and key
navigation. The collector owns flow classification and score calculation.
Any unresolved golden-path issue or affected user makes Sentry the highest
priority bottleneck (weight at least 1000 and above existing finite weights),
ahead of all legacy entries. The legacy relative order stays intact. The score alone
does not establish a regression. Repeated ranking replaces the Sentry row;
healthy or absent observations remove it. Missing data never implies score 100.

The existing hourly runner can consume one read-only iteration with:

```sh
pnpm exec node scripts/pipeline-bottleneck-loop.mts /absolute/path/bottleneck-state.json
```

It emits the canonical snapshot with prioritized ranking to stdout, exiting 1
on missing/invalid input. It never rewrites the externally owned state file.
Set `HUD_BOTTLENECK_STATE_PATH` to that same readable file in the web runtime to
feed `HudMetrics.pipelineBottleneck` and the existing `HudBottlenecksCard`.
This is a source path, not a feature flag. A remote web runtime needs the file
delivered to its filesystem by the existing state transport; no remote endpoint
or credentials are assumed. Missing/unreadable/invalid files return null without
breaking the rest of the HUD. The card displays the score and the ranked row's
issue count, users, top issue/flow, and original observation time.

Sourcing decision (2026-10-23): **extend** the existing shared Zod contracts and
HUD card; **compose** Node's read-only file API with the external collector.
No new dependency, Sentry polling, recurring network cost, or parallel schema.
Re-evaluate when the collector's legacy fields or watcher payload become typed;
then extend this contract and its compatibility tests.

`pipeline-bottleneck-coverage` in `scripts/ci-fast-lanes.mjs` selects the real
web Vitest tests on contract/reader/consumer changes for source and combined
heads, with 100% shared-contract and file-reader coverage floors. HUD source
also remains subject to the existing changed-line coverage gate.
