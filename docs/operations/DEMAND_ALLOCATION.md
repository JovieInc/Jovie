# Demand allocation governor (JOV-7422)

Summer uses `POST /api/internal/ovie/summer-company/demand-allocation` with
its production OIDC identity. Public demand signals cannot authorize work.
The server composes fresh acquisition eligibility itself; request payloads
cannot supply a GREEN gate. Failed evidence reads hold expansion.

The endpoint is an event-driven pull queue in the existing PostgreSQL operating
store, with compare-and-set claims and immutable receipts. It adds no scheduler,
model call, migration, provider or production promotion path.

1. `submit`: supply an immutable `plan` matching
   `apps/web/lib/demand/allocation-contract.ts`. Include one demand cluster,
   disposition context, an authorized low-risk effort bound and expiry, prediction
   targets, baseline source, and review horizon. The response records the
   recommendation, countercase, decision, score and calibration penalty.
2. `reconcile`: after a material gate/evidence change or review horizon, rejudge
   pending work from original observations. RED/UNKNOWN/stale evidence holds
   expansion; authorized repair, certification and unblocking can proceed.
   GREEN releases otherwise eligible work automatically. Outbound, spend,
   cluster human gates, high-risk work and ambiguous tradeoffs stay escalated
   to the existing authority owner. No override grant is minted here.
3. `claim`: pass `id` and a stable `worker`. Only a current ready decision can
   be claimed, and the gate and authorization are rechecked. One worker executes
   at a time. The returned execution receipt carries the effort deadline and
   review deadline. Summer's worker performs that bounded job through normal
   execution; receiving a claim is not proof it ran or reached production.
4. `complete`: the same worker attaches `executionRef` after execution. This
   records actual completion and anchors the observation window there. The
   existing production controller still requires its certification receipts;
   `productionAuthorized` is always false.
5. `review`: supply `receiptId`, `supersedes` (null initially), the exact
   `windowStartedAt` from completion, `windowEndedAt` at/after the horizon,
   observed `metrics`, and nonempty `evidenceRefs`. Future or immature windows
   are rejected. An inconclusive review can be superseded by a new receipt;
   retries cannot alter an existing receipt. All revisions remain available.

Backtests compare declared targets with actual usage, repeat usage, quality,
claims, activation, retention, revenue, graph expansion, cost and maintenance.
Cost/maintenance are ceilings; other targets are floors. Missing target
measurements are inconclusive; measured zeroes can miss. Only the latest mature
review per executed allocation contributes to calibration. Each miss subtracts
10 judge points for the same capability/job and ICP adjacency, capped at 30;
misses can demote a raw build disposition. Unrelated jobs remain unaffected.
An outstanding/inconclusive outcome holds the next expansion until evidence
arrives, while cone repair remains available.

`dueReviews` and `overdueExecutions` expose obligations on each response.
Expired claims never silently re-execute: reconcile the existing worker's
receipt. Persistence failure returns 503; policy/identity conflicts return 409.
Source tests prove transitions, not a commercial result. The first real
experiment and deployed outcome evidence belong to JOV-6468 / JOV-7701.

Ship now: a maximum 200-allocation ledger, one active worker, five-minute gate
freshness, effort bounded to eight hours, and review horizons up to 90 days.
Re-evaluate when actual experiment volume, review latency or calibrated hit rate
shows these bounds constrain learning. Then adjust the bounds against those
receipts, preserving human gates and exact prediction/execution/outcome binding.
