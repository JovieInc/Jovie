# GPT-6 Astra readiness contract

Status: `READY_CONTRACT_ONLY`; live access and runtime compatibility are `UNKNOWN`.
Owner: JOV-6005. Activation and model-promotion owner: JOV-5929. Live Symphony
recovery/liveness owner: JOV-6004.

Last official-doc verification: 2026-09-04. Observed upstream OpenAI Symphony
revision: `8001b52e3062495a16e520e4ceaf8f9de868c4d0`. Observed local Codex app-server:
`0.153.0`. These observations are not a live Gem capability receipt.

One resumed Astra design-certification task reported an account usage-limit
failure on 2026-09-04. The contract classifies that receipt as terminal and
non-retryable until a new successful capability probe. It does not reroute,
purchase access, or consume a reset; JOV-5929 retains routing ownership.
The exact-main fleet gate also reported zero admitted capacity: six Codex
directories were cooling down, Grok returned HTTP 402, Kimi returned HTTP 403,
and Hyperagent had no executable/service proof. Directory count, model listing,
and another account's usage are not transferable capacity evidence.

## Decision

**Extend**, then activate only after proof. Keep the existing Symphony/provider
boundary and use OpenAI Responses, steering, agent tools, compaction, caching,
and reasoning primitives directly. The repository adds a versioned prompt and
compatibility contract plus a durable evidence journal. It does not add a
controller, execution queue, wait/message layer, retry loop, or steering
protocol. OpenAI and Symphony continue to own execution.

Custom code is limited to the Jovie-specific gap: fail-closed activation,
request/prompt validation, and restart-safe receipts needed to prove that the
native calls were handled correctly. Revisit after official Symphony exposes
the required app-server capabilities; delete redundant validation when the
upstream interface enforces the same contract.

## Audited instruction and runtime surfaces

- Root `AGENTS.md`/company canon governs this path. The Eve and framework skill
  AGENTS files are path-scoped and do not apply to this harness.
- Official Symphony's commit, push, pull, Linear, release, land, and debug skills
  were reviewed. Repository authority remains higher priority; an Astra job may
  not infer merge/deploy permission from a skill.
- `scripts/symphony/WORKFLOW.md` is the active prompt/runtime surface. It
  and the recovery-owned provider/controller files remain untouched.
- The current model registry/router, app-server request events, dynamic tool
  definitions, retry/continuation behavior, compaction support, and structural
  eval selector were inspected. Routing/promotion stays with JOV-5929/JOV-5029.

## Dispatch interface

`scripts/symphony/astra/contract.json` is the only canonical Astra prompt policy.
Dispatchers compile task facts through `astra_readiness.py compile --input FILE`.
The input must include `intent`, `constraints`, `authority`, `completion`,
`model_fit`, `budget`, `tests`, `steering`, `escalation`, and `receipts`. The compiler keeps the stable
policy prefix first, emits its SHA-256, and appends task-specific facts. Do not
copy the policy prose into workflow templates.

Before any route can select Astra, `activation_decision` requires an explicit
enable flag and a fresh `jovie-astra-capability/v1` receipt proving account
access, Responses transport, async dynamic tools, native steering, thread
resume, a durable pending-call registry, accepted evidence, and normalized
64-character lowercase SHA-256 account-scope and useful-turn receipt hashes.
Checked-in access stays `UNKNOWN`.
The current Symphony surface fails this gate by design, so non-Astra selection
is unchanged.

Every enabled decision also requires the task's full mandatory-capability set;
all must appear in the account-scoped probe. Any-overlap matching is rejected.
The compiled prompt records why a cheaper proven model is inadequate plus
attempt/token/cost/wall-time bounds. Aggregate incident retry/cost deduplication
remains an implementation packet for JOV-5925 and the current routing owner.

The receipt journal records native async call IDs, idempotency keys, terminal
results/cancellation/timeouts, and native steering IDs/sequence numbers. It
never starts, waits for, retries, reorders, modifies, or cancels work. A steering
receipt cannot cancel an already-started tool; cancellation needs its own native
terminal receipt. Connection loss demotes queued steering to
`unknown_not_persisted` for reconciliation, never automatic replay.

## Readiness matrix

| Official recommendation | State / decision | Evidence | Owner and activation gate |
| --- | --- | --- | --- |
| Initiative and follow-through | READY | Canonical execution prompt + completeness test | JOV-6005; compile every Astra job |
| Instruction sensitivity/conflicts | READY | Prompt preserves higher-priority rules and reports unresolved conflicts | JOV-6005; prompt version match |
| Concise writing | READY | Outcome/evidence-first canonical wording | JOV-6005; prompt version match |
| Delegation | READY, disabled by policy where unavailable | One owner per mutable surface; only bounded independent delegation | Dispatcher owner; applicable agent policy and capacity |
| Calibrated testing | READY | Task schema requires exact tests, coverage, and separated proof tiers | Job owner; repository selector green |
| Responses-only tool calling | BLOCKED_CURRENT_RUNTIME | Request validator requires `/v1/responses`; current Symphony uses app-server turn APIs | JOV-5929/upstream; Responses transport receipt |
| Unsupported parameters | READY | Rejects temperature, top-p, logprob fields, and old cache retention | JOV-6005; contract tests |
| Reasoning effort/update | READY_CONTRACT | Supports low through max; rejects none/minimal and incompatible/adjacent updates; retains cache key | JOV-5929; live configuration-update receipt |
| Prompt caching | READY_CONTRACT | Stable prefix hash and `prompt_cache_options.ttl=30m` | Dispatcher; cached-token receipt before scale |
| Persisted reasoning | READY_CONTRACT, BLOCKED_CURRENT_RUNTIME | Tool outputs require Responses state via previous response or conversation; current retries start fresh threads | Upstream/JOV-5929; resume/restart receipt |
| Compaction | DOCUMENTED_GATED | Native compact only; updates reject incompatible auto compaction/truncation; multi-agent rejects standalone compact | Upstream/JOV-5929; long-context eval |
| Programmatic tools | DOCUMENTED_GATED | Never async; allowed callers must remain explicit and bounded | Tool owner; deterministic sandbox eval |
| Async tools | BLOCKED_CURRENT_RUNTIME | No eligible tools; current dynamic-tool schema lacks `async`; journal proves pending/resume/terminal/idempotency semantics only | Tool + runtime owner; all capability fields and restart eval |
| Steering | BLOCKED_CURRENT_RUNTIME | Native ID/order/preservation/disconnect receipts; no bespoke steering or implied cancellation | Upstream/JOV-5929; WebSocket turn/steer eval |
| Multi-agent | DOCUMENTED_GATED | Native agent tool only; rejects async parallelism, standalone compact, summaries, and max-tool-calls conflicts | Dispatcher; bounded eval and ownership map |
| Model/account access and task fit | INELIGIBLE_OBSERVED; current full inventory still UNKNOWN | One task returned usage limit; activation requires all mandatory capabilities plus model-fit/budget facts | Tim/account and routing owner; new fresh successful account-scoped probe |
| Non-Astra behavior | READY | Validator returns a deep, equal copy without Astra enforcement | JOV-6005; regression test |

## Exact verification and activation proof

The hosted structural lane runs:

```sh
COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-astra-readiness.coverage" \
  python3 -m coverage run --branch scripts/symphony/tests/astra-readiness.test.py
```

and enforces at least 90% branch-aware source coverage. The suite covers request
shape, prompt version/cache stability, unsupported fields, reasoning updates,
persisted continuations, async restart/cancel/timeout/idempotency, steering
ordering/preservation/disconnect, unavailable fallback, and non-Astra behavior.

Activation requires separate receipts for source, exact selector and coverage,
hosted CI, current account access, exact Symphony/app-server build, native
Responses request/continuation, worker-restart recovery, WebSocket steering,
and a bounded canary. Deployment/runtime/dogfood remain distinct gates. This
readiness layer neither diagnoses nor claims to resolve JOV-6004 deadlocks.

## Official sources

- [Latest model guide](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-6 Astra model and access](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling)
- [Steering](https://developers.openai.com/api/docs/guides/steering)
- [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [Programmatic tool calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)
- [Multi-agent orchestration](https://developers.openai.com/api/docs/guides/responses-multi-agent)
