# Company OS critical-path spine

> Decision record, 2026-10-03. Issues: JOV-7702 (spine), JOV-7545 (receipts),
> JOV-7073 (governor ranking). Workstream: JOV-7701.
> Implementation: `JovieInc/summer-config` `apps/summer/agent/lib/company-critical-path.ts`.

## Problem

JOV-7701 has more than twenty P0 children. A flat urgent list does not say
which one gates the objective, which can run in parallel, and which must wait.
Summer reported `commissioned=false` with receipts stale since
2026-10-03T02:41Z, and JOV-7545 could never close.

## Findings

- Summer's runtime was up the whole time. The only writer of capability
  receipts was a founder-verified `company_capabilities({verify:true})` turn,
  so freshness depended on Tim chatting with Summer.
- `commissioned` is false by construction. Its four ledgers (owner-accepted
  work, distinct terminal outcomes, verified deploys, an unattended next cycle)
  are not read anywhere, and three of them do not exist yet.
- `scripts/lib/remediation-sweep.mjs` filed `remediation:summer-receipts-stale`
  whenever `commissioned` was false. A dispatched lane agent cannot change that,
  so the remediation route could never succeed.
- The macOS `ai.hermes.gateway-summer` launcher is retired on purpose
  ([SUMMER_RUNTIME_RETIREMENT.md](./SUMMER_RUNTIME_RETIREMENT.md)). It is not
  the receipt writer and stays unloaded.

## Decision

1. Summer's hourly heartbeat refreshes the GitHub, Linear and GBrain receipts
   with its own server credentials. The handoff and governor-enforce receipts
   keep their exact proofs.
2. The sweep files `remediation:summer-receipts-stale` only when one of those
   three receipts is missing or older than two hours, judged per provider. It
   no longer files on `commissioned`.
3. The spine is a typed, versioned declaration in Summer's source with seven
   ordered gates. Each gate has exit checks: a Linear issue in a completed
   state, or a runtime fact. Every child has a gate and a role (`exit`,
   `support`, `parallel-safe`).
4. The active gate is the first one with an unmet exit check. Unknown evidence
   never advances a gate. Each projection is stored with its evidence snapshot,
   so consecutive records are the transition receipt.
5. The JOV-7073 backlog governor stays the only queue and the only actor:
   - It holds downstream spine P0s with reason `held-by-spine:gate-N`.
   - It ranks the active gate's blockers first.
   - When no projection is younger than two hours, it holds gated spine items.
     Ordinary work is never held by the spine.
6. Summer answers "what is the one active gate and why" from
   `company_shipping_lanes_read.criticalPath`. `/runtime/v1/health` shows an
   identifier-only summary.

## Seed

| Gate | Exit checks | Support | Parallel-safe |
| --- | --- | --- | --- |
| 1 Truth and liveness | provider receipts fresh (2h); JOV-7545, JOV-7674, JOV-7691 | | JOV-7690, JOV-7698 |
| 2 Lifecycle truth | JOV-7694, JOV-7300 | | |
| 3 Priority spine | JOV-7702, JOV-7073, JOV-6739, JOV-7696 | | |
| 4 Dispatch | JOV-7703, JOV-6024 | JOV-7695 | JOV-7706 |
| 5 Capability truth | JOV-7485, JOV-7697 | | |
| 6 Commercial loop | JOV-6468, JOV-7422 | JOV-6473 | |
| 7 Burn-in and learning | `commissioned`; JOV-5853 | JOV-7201, JOV-2967, JOV-7084, JOV-7202 | |
| Any gate | | | JOV-7704, JOV-7705, JOV-7707, JOV-7708 |

`commissioned` sits at gate 7, not gate 1. Its facts come from gate 4
(accepted work and terminal outcomes), release truth, and an unattended cycle.
Requiring it at gate 1 would hold gate 1 behind gate 4.

JOV-6024 (credential isolation) is a gate-4 exit check because dispatch is the
point where unattended authority expands. JOV-7697 (synthetic dogfood
principal) is a gate-5 exit check because capability claims rest on its
evidence.

## Independent challenge

A Codex review of the plan raised eight objections. Each was resolved as
follows:

| Objection | Resolution |
| --- | --- |
| Bypassing the operator guard drops the environment boundary | `assertRuntimeEnvironment` still runs. The refresh is reachable from no tool or route. Results carry `provenance: service:summer-bottleneck-heartbeat`. |
| An hourly refresh conflicts with the ten-minute TTL | The TTL keeps its meaning ("verified now"). Liveness uses a separate, explicit two-hour window. |
| The newest receipt can hide a partial outage | Each provider is judged separately. Missing or invalid timestamps count as stale. |
| Pool admission cannot revoke already-admitted work | Accepted as scope. The spine governs admission and ordering. Demotion of admitted work remains JOV-7073. Spine P0s carry `no-symphony` today. |
| Prerequisites were marked optional | JOV-6024 and JOV-7697 were promoted to exit checks. |
| Linear `completed` and cron chronology are gameable | No chronology shortcut for `nextCycleExecution`. Issue checks read `completed` until JOV-7694 lands (see below). |
| The Linear cost bound was not enforced | An immutable claim per ten-minute window serializes concurrent ticks. A failed read keeps its claim as backoff. |
| Unknown evidence fails open | An expired or missing projection holds gated spine items. Unknown never advances a gate. |

## Ship now / Re-evaluate when / Then

- Exit checks read the Linear `completed` state. Re-evaluate when JOV-7694
  lands Validating receipts. Then exit checks read the Validating receipt.
- Gate order and membership live in code, and the PR is the reorder receipt.
  Re-evaluate when gates reorder more than weekly. Then move membership to
  Linear labels.
- At most one Linear spine read per ten minutes. Re-evaluate when gate-advance
  latency exceeds fifteen minutes or a Linear rate hold appears. Then recompute
  only on events for spine identifiers.
