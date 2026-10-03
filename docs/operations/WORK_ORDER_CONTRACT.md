# Work order contract (`jovie.work-order/v1`)

Issue: JOV-7703
Source: `packages/agent-transport-contracts/work-order.ts` and
`packages/agent-transport-contracts/work-order-adapters.ts`
Tests: `apps/web/lib/agents/work-order.test.ts`

One delegation contract for every actor class — coding lanes,
reasoning/research agents, and the founder via Ovie. Transports stay where
they are (Linear issues and comments, Summer cards, lane receipts); the
contract only types, validates, seals and reconciles them. It never
dispatches, retries or cancels — those stay with each actor's existing owner
(e.g. the lanes execution ledger).

This page is the reference for adapter authors: the order and result fields,
the actor classes, gate reconciliation semantics, and the three shipped
adapters.

## Lifecycle at a glance

1. **Seal.** `sealWorkOrder(input)` validates an order against
   `WorkOrderSchema` and binds it to a SHA-256 content `digest`. A claimed
   digest that does not match the content is rejected.
2. **Dispatch.** A caller maps the sealed order onto a transport with a
   `to*` adapter and persists `acknowledgeDispatch(order, { transportRef,
   dispatchedAt })` — the acknowledgement `WorkResult` recording that work
   was handed off, and nothing more.
3. **Report.** The actor's own receipt is folded back into a `WorkResult`
   with the matching `from*` adapter. Results bind to the persisted
   acknowledgement — a receipt answers the revision that was handed off, not
   the current order.
4. **Reconcile.** `reconcileGate(...)` reads all orders and results for a
   gate and decides `advance` / `wait` / `reconcile` / `escalate` /
   `missing` / `withdrawn` / `conflict` per required order.

Transport records are markdown-embedded: `renderWorkBlock` emits a stable
HTML marker (`<!-- jovie-work-order:<hash>:r<n> -->` for orders,
`<!-- jovie-work-result:v1 -->` for results) plus a fenced `json` block, and
`extractWorkBlocks` pulls them back out of Linear issue bodies and comments.
`dispatchMarker(order)` is the dedupe key a caller searches for before
creating a transport record; the idempotency key is hashed so Linear cannot
auto-link issue IDs inside it.

## `jovie.work-order/v1` — order fields

`WorkOrderSchema` is a strict object; unknown fields fail parsing.

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | literal `jovie.work-order/v1` | Contract version. |
| `orderId` | id (≤200 chars) | Stable identity across revisions. |
| `revision` | positive int | Bumped when the order content changes. |
| `idempotencyKey` | `^[A-Za-z0-9_-]{8,128}$` | One logical dispatch per key; reused with different content ⇒ `conflict`. |
| `gate` | `{ objectiveRef, gateId }` | The objective gate this order unblocks (e.g. `JOV-7701` / `gate-4-dispatch`). |
| `state` | `open` \| `canceled` | Canceled orders are not dispatched and do not waive a required order. |
| `title` | ≤120 chars | Human-readable summary; becomes the transport title. |
| `outcome` | text | What done looks like. |
| `successPredicate` | `{ id, statement, verifier }` | Verifier is one of `ci`, `runtime-probe`, `founder-record`, `review`, `receipt`. |
| `requiredCapabilities` | id[] (1–16) | Drives actor-class routing via `resolveActorClass`. |
| `riskTier` | `low` \| `medium` \| `high` \| `critical` | Same vocabulary as the governor router. |
| `authorityClass` | `automation` \| `admin` \| `founder` | `founder` requires `founderAsk` — and only founder authority may carry one. |
| `scope` | `{ target, entityRefs[] }` | Repo/scope target plus up to 32 entity refs (issues, PRs, docs). |
| `evidence` | `{ ref, observedAt, freshness }[]` | `freshness` ∈ `fresh` / `stale` / `unknown`; max 32. |
| `permittedActions` | id[] | Allowlist the actor may exercise. |
| `forbiddenActions` | id[] | Hard deny list; forbidding a required capability fails sealing. |
| `budget` | `{ deadline, maxAttempts, maxSpendUsd, maxConcurrency, founderMinutes }` | Caps: ≤10 attempts, ≤$10,000, ≤16 concurrency, ≤120 founder minutes. |
| `stopConditions` | text[] | Conditions under which the actor must halt. |
| `escalation` | `{ owner, action }` | Where a blocked/denied/exhausted order goes. |
| `expectedArtifact` | `{ kind, description }` | `pull-request`, `decision-record`, `research-memo`, or `state-change`. |
| `founderAsk` | object \| `null` | Required exactly when `authorityClass === 'founder'` — see below. |
| `replyTo` | `{ kind: 'linear-comment', ref }` | Where the result is reported back. |
| `createdAt` / `createdBy` | timestamp / id | Provenance. |
| `digest` | sha256 hex (added by sealing) | Content binding for the exact revision. |

`founderAsk` (the JOV-7080 packet essentials): `whyNow`, `blocked`,
`options` (1–6 of `{ id, label, tradeoff }`), `recommendation`,
`defaultIfSilent` (nullable), and `materialChange` (nullable) — set only to
re-ask after a denial, stating what materially changed.

Sealing invariants beyond schema:

- `authorityClass === 'founder'` ⇔ `founderAsk !== null`.
- Non-founder orders may not request founder-only capabilities (`spend`,
  `outbound`, `taste`, `permission`) or the `founder-record` verifier.
- `requiredCapabilities ∩ forbiddenActions` must be empty.

## `jovie.work-result/v1` — result fields

`WorkResultSchema` is also strict. A result always answers one sealed
revision: `orderId` + `orderRevision` + `orderDigest`.

| Field | Type | Meaning |
| --- | --- | --- |
| `actor` | `{ class, runtime, provider, model, ref }` | Which actor class produced it and on what runtime/receipt. |
| `phase` | `acknowledged` \| `running` \| `terminal` | `terminal` ⇔ `terminalState` is non-null. |
| `disposition` | `accepted` \| `rejected` \| `deferred` | Did the actor take the work. |
| `terminalState` | enum \| `null` | Closed vocabulary: `succeeded`, `no_op_stale`, `canceled`, `failed_known`, `failed_unknown`, `budget_exhausted`, `quarantined`, `superseded`, `dead_lettered`, `denied`, `timed_out`, `partial`. |
| `actionsTaken` / `artifacts` | text[] / `{ kind, ref }[]` | What was done and what exists now. |
| `outcome` | `{ predicateId, status, evidenceRefs }` | `status` ∈ `met`, `partially_met`, `not_met`, `unknown`. |
| `certification` | `{ status, invalidatedBy }` | `certified` only on a `met` outcome; `invalidatedBy` lists what would void it (e.g. a revert). |
| `failures` / `unknowns` | text[] | Known failure reasons vs. open questions. |
| `cost` | `{ attempts, wallSeconds, spendUsd, founderMinutes }` | Nullable where the transport doesn't meter it. |
| `next` | `{ event, owner, action }` \| `null` | The follow-up this result implies. |
| `transportRef` | ref | Where the order was handed off (`linear:<id>`, `ovie:summer-card/<id>`). |
| `dispatchedAt` / `observedAt` | timestamps | A result may not predate its dispatch. |
| `source` | `{ adapter, receiptRef }` | Which adapter produced the result and the underlying receipt. |

Parse invariants: only terminal results carry a terminal state; a `met`
outcome requires `terminalState === 'succeeded'` and at least one evidence
ref; only a `met` outcome can be `certified`.

## Actor classes and routing

`resolveActorClass(order)` picks exactly one class — or `unroutable` —
from `requiredCapabilities` and `authorityClass`. Brands (Devin, Codex,
Hyperagent, …) are chosen inside a class by the existing routers, not by
the contract.

| Class | Capabilities it covers | Transport |
| --- | --- | --- |
| `code-lane` | `code-change`, `tests`, `docs` | Linear issue with `agent-ready` label, drained by lanes |
| `reasoning-lane` | `research`, `reasoning`, `ranking`, `prioritization`, `strategy`, `revenue-plan`, `capability-gap`, `bottleneck` | Linear `summer.reasoning-job/v1` issue with `reasoning-job` label |
| `founder-decision` | `decision`, `taste`, `spend`, `outbound`, `permission` | Ovie Summer card |

Founder authority routes only to `founder-decision`, and `founder-decision`
accepts only founder authority. A capability set covered by no single class
is `unroutable` and must be split into separate orders.

## The three adapters (`work-order-adapters.ts`)

Each adapter maps a sealed order onto its class's existing transport
(`to*`) and folds that transport's native receipt back into a `WorkResult`
(`from*`). Adapters never send anything — callers keep their transports.
Every `from*` requires the persisted `acknowledgeDispatch` result for the
matching class and rejects receipts that predate the dispatch.

### (a) Code lanes — `toLaneIntake` / `fromLaneRun`

`toLaneIntake` renders the order brief (outcome, predicate, gate, scope,
permitted/forbidden actions, stop conditions, deadline) plus the work block
into a Linear issue body labeled `agent-ready`; lanes drains it like any
other issue.

`fromLaneRun` consumes `jovie-lane-run/v1` receipts, the pull request, and
`CertificationEvidence`:

- PR **merged** ⇒ terminal `succeeded`. It is `certified`/`met` only when
  certification evidence of the *requested verifier* exists on the exact
  merge commit, observed at or after `mergedAt`; otherwise it succeeds
  uncertified and `next` asks Summer to verify the predicate.
- PR **closed** unmerged ⇒ terminal `failed_known`, escalates to
  `order.escalation`.
- A terminal lane verdict without a PR maps through `LANE_TERMINAL`:
  `failed`/`provider-error` → `failed_unknown`, `not-shippable` →
  `failed_known` (disposition `rejected`), `quarantined` → `quarantined`,
  `cancelled`/`revoked` → `canceled`, `no-change` → `no_op_stale`.
- Queued/claimed/held/PR-open ⇒ `acknowledged` or `running`, never terminal.

### (b) Founder via Ovie — `toSummerCard` / `fromSummerCard`

`toSummerCard` produces `summerCardInputSchema` input: card `kind` is
`spend`/`outbound`/`taste` when those capabilities are present, else
`decision`; `founderCardKey(order)` (sha256 over
`idempotencyKey:revision:digest`) is the server-side one-card-per-revision
key. A previously `denied` order cannot be re-asked unless the new
revision's `founderAsk.materialChange` states what changed. Spend still
needs its purchase preflight receipt.

`fromSummerCard` verifies the card answers this exact revision
(`transportRef === ovie:summer-card/<id>`, matching digest and card
idempotency key):

- `pending` ⇒ `acknowledged`/`deferred`, founder decides in Ovie.
- `rejected` ⇒ terminal `denied`, escalates.
- `approved` ⇒ terminal `succeeded`, but the outcome is `met`/`certified`
  only when the order's verifier is `founder-record` — i.e. the decision
  itself was the ask. Otherwise approval just means "go execute":
  uncertified, `next` hands verification to Summer.

### (c) Reasoning lane — `toReasoningJob` / `fromReasoningResult`

`toReasoningJob` emits a `summer.reasoning-job/v1` job block (question =
outcome + success predicate; `decisionType` from the matching capability,
default `strategy`; `contextRefs` filtered to `JOV-*`/`LYB-*`/`gbrain:`/
`https:` refs; deadline) plus the work block, labeled `reasoning-job`.

`fromReasoningResult` consumes `summer.reasoning-result/v1` records plus
the issue state and a GBrain read-back:

- `confidence === 'failed'` ⇒ `running` while the lane's retry (issue back
  to Todo) can still fire; terminal `failed_unknown` once the issue is
  `Canceled`.
- Otherwise terminal: `succeeded`/`met`/`certified` only when the memo is
  actually stored in GBrain (`storedMemo.slug` matches and body is
  non-empty — a slug in the receipt is not proof) **and** confidence
  satisfies the requested verifier (`review` needs `high` + a named
  reviewer; `receipt` needs `research`). Anything else is terminal
  `partial` / `partially_met`, escalated via `order.escalation`.

## Gate reconciliation

`reconcileGate({ gate, requiredOrderIds, orders, results, now })` seals
every order, parses every result, keeps only orders for the given gate, and
decides per required order:

| Decision | When |
| --- | --- |
| `missing` | A required order id was not found. |
| `withdrawn` | The order is `canceled` — canceling does not waive a required order. |
| `conflict` | The idempotency key or revision was reused with different content, or terminal results disagree for one revision. |
| `advance` | Latest bound result is terminal `succeeded` **and** `certified`. |
| `wait` | Not yet terminal and the deadline hasn't passed; or `succeeded` but uncertified. |
| `reconcile` | `failed_unknown`/`timed_out` (owner must confirm the work stopped before redispatch) with attempts left; or deadline passed with a non-terminal result. |
| `escalate` | Deadline passed without dispatch, attempts exhausted, certification `invalidated`, or any other terminal failure. |

Binding rules: a result counts only if it matches the current revision's
`orderRevision`, `orderDigest`, and `predicateId`; non-matching results land
in `staleResults`. Among bound terminal results for one revision, the
highest certification rank wins (`invalidated` > `certified` > `uncertified`
— invalidation deliberately outranks so a voided success is not silently
accepted), ties broken by `observedAt`.

Gate status: `advanced` only when every required order is `advance`;
`blocked` when any order is `escalate`, `conflict`, `missing`, or
`withdrawn`; otherwise `open`.

## Writing a new adapter

1. Gate the `to*` on `requireClass(order, yourClass)` so an unroutable or
   misrouted order fails at the boundary.
2. Persist `acknowledgeDispatch` at hand-off; every `from*` calls
   `requireAck` to prove the receipt answers the persisted dispatch for the
   right class, then `notBefore` on any receipt timestamp.
3. Produce results through `bind(binding, fields)` so `orderId`,
   `orderRevision`, `orderDigest`, `predicateId`, `transportRef` and
   `dispatchedAt` always come from the ack — a receipt can never answer a
   different revision.
4. Map transport verdicts onto the closed `TERMINAL_STATES` vocabulary;
   leave ambiguous outcomes non-terminal (`acknowledged`/`running`) rather
   than guessing.
5. Certification is evidence-bound: `met`/`certified` only when the
   verifier named in `successPredicate` actually produced evidence for the
   exact artifact. Record what would void it in `invalidatedBy`.
