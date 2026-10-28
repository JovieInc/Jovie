# Ops health contract: `ops.health/v1`

One envelope every internal service exposes, so Summer, Ovie and agents can answer "what is running, which commit, is it fresh, is it healthy" with one call and no guessing. Reuses Jovie build-info's `commitSha` and Summer's `receiptFreshness` model.

- Schema: [`ops/registry/ops-health.v1.schema.json`](../ops/registry/ops-health.v1.schema.json)
- The one validator and builders: [`scripts/lib/ops-health.mjs`](../scripts/lib/ops-health.mjs)
- Where each service answers: [`ops/registry/health-endpoints.json`](../ops/registry/health-endpoints.json) (owners are pointers into [`ownership.json`](./ownership.json), never copied)
- Conformance check: `node scripts/ops-health-conformance.mjs [--service jovie-web:production] [--expect-sha <sha>]`; the daily Remediation Sweep runs it (`--mode ops-health`) and files one fingerprinted Linear issue per drifting endpoint.

## Shape

```json
{
  "schema": "ops.health/v1",
  "service": "jovie-web",
  "environment": "production",
  "commitSha": "<40 hex> | null",
  "deployedAt": "ISO-8601 | null",
  "version": "26.10.16 | null",
  "status": "up | degraded | down | unknown",
  "checkedAt": "ISO-8601",
  "dependencies": [{ "name": "githubRead", "status": "up", "observedAt": "ISO-8601 | null", "latencyMs": 40, "detail": "stale" }],
  "links": { "detail": "/api/health/comprehensive" }
}
```

## Rules (enforced by the validator)

1. Unknown is explicit. A missing commit or build time is `null`, a short sha is `null`, never a guess. A fake `deployedAt` (request time) is a defect: jov.ie served `Date.now()` as `deployedAt` until this contract.
2. `up` never hides anything. A dependency that is `unknown`, `degraded` or `down`, or an unknown `commitSha`, makes `status: up` invalid.
3. A dependency reported `up` needs `observedAt` within 15 minutes. A verified-but-old receipt is `unknown` with `detail: "stale"`.
4. `deployedAt` is the instant the running build was produced (Vercel build stamp), not the request time.
5. Additive only. Legacy fields stay for existing consumers (`buildId`, `receiptFreshness`, `symphony-lanes-status/v1` keys). A service whose top-level `schema` is taken (the lanes feed) nests the envelope under `ops` and sets `envelopePath` in the registry.
6. "Is X live?" is `--expect-sha`. Lag behind main is reported (`lag=behind(n)`); a deployed commit that is not an ancestor of its repo's main fails. The production lag dead-man stays in `automation-registry.jsonl`.
7. Conformance is `enforced` or `pending`. A `pending` endpoint that already validates fails the check, so the flip to `enforced` cannot be forgotten.

## Inventory (2026-10-28)

| Service | Endpoint | Before | Now | Consumers |
|---|---|---|---|---|
| Jovie web (and Ovie) | `/api/health/build-info` | `buildId, version, deployedAt (epoch ms = request time), commitSha, deploymentId, environment` | ops.health/v1 plus those legacy keys; `deployedAt` is the ISO build instant or null | update pill, Summer `deployed-builds`, Ovie shipping-state, promotion gates, `production-freshness` dead-man |
| Jovie web | `/api/health` and `/api/health/{auth,comprehensive,db,deploy,env,homepage,keys,redis}` | liveness `{status}` or `{healthy,timestamp}`; detail needs admin or `CRON_SECRET` | unchanged; `build-info.links.detail` points here | uptime probes, admins |
| Ovie | none of its own: `apps/ovie` re-exports apps/web routes and has no Vercel project; `/api/ovie/*`, `/api/hud/*` are data APIs | n/a | covered by jovie-web (`OPS_SERVICE=ovie` if apps/ovie is ever built standalone) | operators |
| Summer | `/runtime/v1/health` | `identity (name only), availability, receiptFreshness, acceptedWork, criticalPath`; no commit, no `status` | ops.health/v1 (commit from Vercel identity, build stamp, dependencies from receipts) plus legacy keys | automation-registry receipts, Remediation Sweep, Ovie |
| Summer | `/runtime/v1/identity` | `sourceRevision, deploymentId, environment, projectId` | unchanged (richer identity) | pin check |
| Gem lanes host | gist `lanes-status.json` | `schema symphony-lanes-status/v1, at, host, release (tree hash)` | adds `ops` envelope (`commitSha` from `.release.json`, honest dependencies) | Summer, Ovie, production-freshness |
| LogYourBody | none | n/a | pending: route in JovieInc/LogYourBody | none |
| Workers (`observability-ingest`, `canary-otp`, `x402-artist-resource-proxy`) | POST-only or none | n/a | pending (Linear) | none |
| Hermes scripts, mesh | shell/py status files, no HTTP contract | n/a | pending (Linear) | gem watchers |
| Automation registry | `canon/automation-registry.jsonl` `receipt` blocks | per-row receipt kinds (`json-timestamp`, `production-freshness`, `github-workflow`) | unchanged: it is the liveness dead-man registry, not the endpoint registry; URLs repeat there and should migrate to endpoint ids (Linear) | `scripts/automation-liveness.mjs` |

## Where operational facts live

| Fact | One source | Everything else |
|---|---|---|
| Service health URL, expected-head repo | `ops/registry/health-endpoints.json` | points to it by id |
| Service owner and escalation | `canon/ownership.json` | `ownerRef` pointer |
| Liveness SLOs and kill switches | `canon/automation-registry.jsonl` | n/a |
| Credentials, spend, capacity | `ops/registry/*.json` | n/a |
