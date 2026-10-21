# Stage events and stage timings

Rule (canon/OPERATING_SYSTEM.md, Law 2): a pipeline, loop or feature is not done
until every stage it adds is registered in
[`stage-manifest.json`](stage-manifest.json), emits timestamps in the contract
below, and shows up with p50/p95/n in
[`stage-timings-latest.json`](stage-timings-latest.json).

## Contract: `jovie-stage-event/v1`

One row per entity per stage. Stage dwell time is `exitedAt - enteredAt`.

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `"jovie-stage-event/v1"` | Contract version. Breaking changes bump it. |
| `entityType` | manifest key | `shipping`, `remediation`, `release`, `release-replay`, `ios-release`, `revenue-funnel`, `summer-turn`, `linear-intake`, `automation-run` |
| `entityId` | string | Stable id; the format is declared per entity in the manifest. |
| `stage` | manifest stage id | Must be registered for the entity type. Unregistered stages are rejected. |
| `enteredAt` | ISO-8601 | When the entity entered the stage. |
| `exitedAt` | ISO-8601 or `null` | When it left; `null` while still in the stage. |
| `actor` | string or `null` | Lane, provider, workflow or agent that owned the stage. |
| `outcome` | `advanced`, `completed`, `failed`, `abandoned`, `open` | How the stage ended. |
| `sourceReceipt` | string | URL or receipt id that proves the timestamp. |

Example:

```json
{"schema":"jovie-stage-event/v1","entityType":"shipping","entityId":"JovieInc/Jovie#22315","stage":"queued","enteredAt":"2026-10-20T19:24:47Z","exitedAt":"2026-10-20T19:34:25Z","actor":"codex","outcome":"advanced","sourceReceipt":"https://github.com/JovieInc/Jovie/pull/22315"}
```

## Where events live

No new database. Two paths, both read by the daily
[Shipping SLO Ratchet](../../.github/workflows/shipping-slo.yml):

1. **Derived** (`status: derived`). `scripts/lib/stage-collect.mjs` reads durable
   receipts each run (GitHub PR timelines and check rollups, Staging/Production
   Controller jobs, LogYourBody iOS Release Loop jobs, Linear issue history) and
   `scripts/lib/stage-derive.mjs` turns them into events. Re-deriving a 29-day
   window every day is the backfill: history exists from the first run.
2. **Pushed** (`status: pushed`, `kind: events` sources). A producer that sees
   stages GitHub cannot see publishes a rolling 28-day NDJSON file of contract
   rows at the source URL in the manifest. Invalid rows are counted as
   `rejected` in the snapshot, never silently kept or dropped.
   Privacy-bound producers (revenue funnel) publish only pre-aggregated
   `{entities:{<type>:{stages:{<id>:{windows,regression}}}}}` (`kind: timings`).

`scripts/lib/stage-events.mjs` aggregates p50/p95/n per stage and per declared
end-to-end pair over 24h/7d/28d, using completion time for windowing. A
terminal stage has no dwell, so it reports arrivals (`n`), `failed` and
`failRate`.

**Regression flag**: the 7d p95 is compared with the p95 of days 8 to 28. It is
flagged only when both sides have enough samples (10 recent, 20 baseline), the
ratio exceeds 1.25 and the absolute increase is at least 60s. Thresholds live
in the manifest `regression` block.

## Outputs

- `docs/metrics/stage-timings-latest.json` (`jovie-stage-timings-compact/v1`): table committed by the snapshot bot PR.
  `windowFormat` names the compact array fields; `terminalWindowFormat` additionally names `failed` and `failRate`.
- `docs/metrics/shipping-slo-latest.json` gains `stages`
  (`jovie-stage-summary/v1`): coverage, regressions, the five slowest 7d p95
  stages and 7d end-to-end p50/p95/n. The lanes status gist embeds this file as
  its `slo` block, so Ovie Home reads it there without new fetches.

### Data contract for Ovie Home (`slo.stages`)

```ts
type StageSummaryV1 = {
  schema: 'jovie-stage-summary/v1';
  at: string; // ISO time the snapshot was computed
  coverage: { stagesTotal: number; stagesWithData: number; events: number };
  regressions: string[]; // e.g. "shipping:merged.p95", "release:staging->verified.p95"
  slowestP95_7d: { stage: string; p50: number; p95: number; n: number }[]; // seconds
  endToEnd7d: Record<string, { p50: number | null; p95: number | null; n: number }>;
};
```

Show `null` as unknown, never as zero. Freshness is `at`; the snapshot refreshes
daily.

## Registration gate

`node scripts/stage-manifest-check.mjs` (also run by
`scripts/lib/__tests__/stage-events.test.mjs` in the structural CI lane) fails when the
manifest is invalid or a delivery workflow (`controller`, `release`, `deploy`,
`promot*`, `testflight`, `app-store`, `canary`, `rollback` in its file name) is
neither registered under `producers.workflows` nor exempted with a reason.

## Emitter specs for other owners

### Lanes worker (`scripts/lanes/**`)

Append contract rows to a rolling NDJSON file and publish it as
`stage-events.ndjson` in the existing lanes status gist (same writer, same
PATCH as `lanes-status.json`). Keep 28 days, drop older rows, cap at 8 MB.

| Stage | entityType / entityId | enteredAt | exitedAt | Source |
| --- | --- | --- | --- | --- |
| `shipping:worker-start` | `shipping` / `JovieInc/Jovie#<pr>` once the run has a PR, else `JOV-<n>` | ledger receipt `startedAt` | receipt `endedAt` | `runs/ledger.jsonl` issue receipt (`kind` issue) |
| `shipping:gate-seat` | `shipping` / `JovieInc/Jovie#<pr>` | adopt receipt `startedAt` | `startedAt + gateWaitS` (no seat: `endedAt`, outcome `abandoned`) | `runs/ledger.jsonl` (`kind` adopt) |
| `shipping:gate` | `shipping` / `JovieInc/Jovie#<pr>` | `startedAt + gateWaitS` | receipt `endedAt` (`advanced` landing/verified, `failed` held/timeout) | `runs/ledger.jsonl` (`kind` adopt) |
| `remediation:repair-start` | `remediation` / `JovieInc/Jovie#<pr>@<first 12 chars of the red head sha>` | fix-red receipt `startedAt` | receipt `endedAt` | `runs/ledger.jsonl` (`kind` fix-red) |

`actor` = provider (`codex`, `claude`, ...). `outcome`: `advanced` when the run
produced a PR or a push, `failed` for `failed`/`provider-error`/`fix-no-change`
verdicts. `sourceReceipt` = `lanes-ledger:<runId>`. Backfill: emit rows for
every ledger receipt in the last 28 days on the first publish.

### summer-config (Summer)

Live since 2026-10-20 23:52Z at
`https://summer.jov.ie/runtime/v1/summer-stage-events.ndjson`, registered as
`summer-stage-feed.url`. `model-turn`, `action` and `outcome` are `pushed`;
`event` stays `spec` until the feed emits ingress rows, so the tracked
end-to-end pair is `model-turn->outcome`. The terminal `outcome` stage reports
`failed` and `failRate` per window (first read 2026-10-21: 22 turns, 15
failed, pre-fix; fixed in summer-config #270).

| Stage | Timestamp |
| --- | --- |
| `summer-turn:event` | ingress receipt time (`summer-shadow/receipts/<key>.json`) |
| `summer-turn:model-turn` | model call start for the turn |
| `summer-turn:action` | first tool/action dispatch |
| `summer-turn:outcome` | terminal receipt (`summer-shadow/terminal/<key>.json`) |

`entityId` = `<conversation>:<turn>`, both hashed by summer-config. `outcome` on the terminal row: `completed`,
`failed` or `abandoned`. Backfill from the existing receipt blobs.

### Controller replay (`release-replay`)

Live emitter: `.github/scripts/controller-quota-replay.mjs` (workflow
`controller-quota-replay.yml`, on Staging/Production Controller completion).
It replays only transient failures (GitHub quota, 5xx, network, runner loss)
of the newest run of that controller while production lags main, up to
controller attempt 3, after waiting for the token's quota reset or
2^(attempt-1) x 120s. Rows go to the artifact
`release-replay-receipts/stage-events.ndjson`, next to `decision.json`.

| Stage | Timestamp |
| --- | --- |
| `release-replay:blocked` | the failed attempt's `updated_at`; exits at the decision. `outcome` `advanced` (replayed), `abandoned` (not transient, superseded, or prod already on main) or `failed` (attempt/wait cap, rejected rerun) |
| `release-replay:replayed` | the accepted `gh run rerun --failed` request |

`entityId` = `<workflow file>#<run id>@<attempt>`. Like `automation-run`, the
source is an artifact, so it reaches stage timings once the collector reads
artifact sources.

### Automation liveness (`automation-run`)

Live emitter: `scripts/automation-liveness.mjs` (workflow
`automation-liveness.yml`) writes `automation-run:started` and
`automation-run:finished` rows for every registered automation whose receipt
carries both timestamps, into the artifact
`automation-liveness-receipts/stage-events.ndjson`.

| Stage | Timestamp |
| --- | --- |
| `automation-run:started` | run start from the automation's receipt |
| `automation-run:finished` | terminal receipt; `outcome` `completed` or `failed` |

`entityId` = `<automationId>@<runRef>` (`automationId` from
`canon/automation-registry.jsonl`). Rows without real timestamps are never
emitted. The source has no URL yet: the shipping-slo collector reads `url`
sources only, so reading the artifact is the remaining step before these
timings reach the snapshot.

### LogYourBody release loop

`ios-release:released` needs the App Store release time, which GitHub cannot
see. Publish NDJSON rows with `entityId` = `JovieInc/LogYourBody@<sha>` and
`enteredAt` = App Store Connect release date from
`ios-app-store-approved-release.yml`, then set `lyb-stage-feed.url`.

### Revenue funnel (apps/web)

Funnel timings come from the database (`acquisition_journeys.captured_at`,
`users.created_at`, `user_profile_claims.claimed_at`, `checkout_initiated` in
`server_analytics_events`, first paid `billing_audit_log` row). Only aggregates
may leave the app. The `revenue-funnel-timings` source expects
`GET https://jov.ie/api/cron/stage-timings` (CRON_SECRET) to return the
`kind: timings` shape above. Adding that cron route needs approval under the
infra guardrail; it is tracked as a gap issue until then.

`pending-verification`, `claim-verified` and `claim-rejected` are branch stages
off `paid` for high-reach artist claims. They are not steps in the linear
funnel. The app records them in `acquisition_journey_stages`, and the admin
artist-offer funnel report (`branches[]`) already returns their counts and
p50/p95.
