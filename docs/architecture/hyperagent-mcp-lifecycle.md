# Symphony to Hyperagent MCP lifecycle

Status: source-ready, provider-ineligible

Date: 2026-09-04

## Decision

Extend the existing Symphony router with a provider adapter contract; do not add
a Hyperagent queue, scheduler, poller, cost router, account registry, or secret
store. `scripts/symphony/hyperagent/lifecycle.py` is a deterministic classifier
and receipt journal only. It never calls Hyperagent or mutates provider state.

This composes the unlanded provider-agnostic admission work found in repository
history with Hyperagent's native MCP thread, approval Inbox, usage, and billing
surfaces. Revisit the boundary if Hyperagent publishes atomic create-with-budget,
authoritative idempotent replay, and portable terminal outcome/cost receipts.

## Current observed envelope

| Fact | Current evidence | Readiness |
| --- | --- | --- |
| MCP endpoint | `codex mcp get hyperagent`: enabled streamable HTTP at `https://hyperagent.com/api/mcp` | CONFIGURED |
| Authentication | `codex mcp list`: `Not logged in` | BLOCKED |
| MCP tools and scopes | No Hyperagent tools exposed to this task | UNKNOWN |
| Account/workspace | Authenticated settings unavailable | UNKNOWN |
| Reachable agents and modes | Authenticated `list_agents` unavailable | UNKNOWN |
| Live model catalog and prices | Workspace picker unavailable | UNKNOWN |
| Balance, payer, expiry, auto-recharge | Billing unavailable | UNKNOWN |
| Canonical route | `scripts/symphony/config/model-registry.json` has no Hyperagent model | INELIGIBLE |
| Useful canary, cost, delivery | No run authorized or attempted | UNKNOWN |

Authentication and canonical provider admission are the current bottlenecks.
No login, OAuth change, paid job, approval resolution, memory decision, browser
approval, provider configuration, runtime restart, or service mutation is part
of this source change.

## Documented provider lifecycle

Hyperagent's first-party MCP documentation says `create_thread` returns a
`threadId` immediately, the caller follows the same thread with `get_thread`,
and the final assistant message is read only after the thread is no longer
running. Disconnecting does not cancel the thread. OAuth scopes distinguish
`threads:read`, `threads:write`, `approvals:read`, and `approvals:write`.
Inbound MCP refuses to start an `Ask first` agent because it has no inline
approval surface.

The source contract therefore treats these as different states:

| Evidence | Classification | Allowed recovery |
| --- | --- | --- |
| Structured pending approval ID and action identity | `approval_required` | Resolve once through MCP only with exact existing authorization and `approvals:write`; otherwise surface it |
| Provider says approval is web-only | `approval_required` | Open the attended original thread once only with exact existing authorization |
| Ordinary question/required response | `input_required` | Send one fingerprint-matched authorized response; never call it approval |
| Proposed or auto-saved memory decision | `memory_decision_required` | Surface it; approve/reject only from an explicit matching memory decision |
| Code-sandbox network domain | `approval_required` with domain scope | Surface the domain boundary; it grants no integration-write authority |
| Old observation | `stale_status` | Reconcile the issue, original thread, and existing PR once |
| Lost MCP transport | `transport_unknown` | Reconcile the issue, original thread, and existing PR once; disconnect is not cancellation |
| 401 | `provider_failure` | Authorized reconnect required |
| 402 | `provider_failure` | Billing hold; no purchase or auto-recharge |
| 403 | `provider_failure` | Inspect exact scope/resource/policy denial |
| 429 | `provider_failure` | Honor one shared cooldown; no per-job retry storm |
| 5xx | `provider_failure` | Reconcile the issue, original thread, and existing PR once before replay |
| Running with no structured interaction | `running` | Continue bounded observation of the same thread |
| Remote completed with useful-output, usage, route, destination, and cost receipts | `remote_useful_success` | Reconcile PR, merge, and required runtime; this is not landed |
| Remote completed without those receipts | `terminal_unverified` | Reconcile the full issue lifecycle once, then retain `UNKNOWN` |
| No PR found for the issue | `delivery_missing` | Reconcile delivery once before any retry |
| PR exists and is open | `pr_open` | Recover and land the existing PR; never redispatch the issue |
| PR merged without exact required-runtime proof | `merged_runtime_unverified` | Reconcile the existing merge/runtime; never redispatch the issue |
| PR closed unmerged with owner and failure receipt | `delivery_failed` | Terminal explicit failure with owner/evidence |
| Exact PR merge and required-runtime SHA receipt | `landed_verified` | Terminal success |

Words such as “approve” in assistant prose are not approval evidence. A real
approval requires a structured pending item. Memory receipts and proposed
learnings are not external-action approvals.

## Execution and loss contract

1. The canonical router selects the exact provider/model for the task.
2. `preflight` requires current account, auth, thread scopes, model, balance,
   auto-recharge-off, per-query/period caps, useful outcome, issue, lease,
   destination, expected PR repository, required runtime, idempotency key, and
   normalized request digest.
3. One `create_thread` call returns a thread ID; the journal binds it to the
   idempotency key and request digest.
4. The journal preserves issue, lease, attempt, thread, PR, merge, and runtime
   identity across process restart. Remote and delivery revisions are monotonic.
5. `classify` derives state from structured provider evidence; `plan` describes
   one admissible next action but always returns `execute: false`.
6. The journal atomically reserves that exact action. Only the first reservation
   returns `execute: true`; a reconnect sees the existing reservation and does
   not repeat the mutation.
7. Post-action completion must bind the reservation to a provider-result digest;
   authorization or reservation alone is never recorded as execution.
8. Transport loss, stale state, remote failure, or 5xx gets one full-lifecycle
   reconciliation pass. An existing remote thread or PR is always recovered.
9. A single same-key retry can be reserved only when one revision-current
   receipt proves the remote job absent or idempotently replayable and proves no
   PR exists. The new thread is bound to attempt 2 before observations continue.
10. Remote useful completion is non-terminal. Success requires the existing PR
    merge SHA to equal the exact required-runtime SHA with a durable receipt.

Journal schema v2 intentionally rejects v1 files because v1 lacks durable issue,
lease, PR, merge, runtime, and per-attempt identities. Before enabling this
adapter, an operator must migrate a v1 journal into the v2 fields with verified
receipts or archive/remove it while the adapter is stopped; the adapter fails
closed rather than inferring those identities.

## Verification boundary

Deterministic tests cover auth/cap admission, every interaction class, exact
approval matching, legitimate attended web fallback, stale/lost transport,
401/402/403/429/5xx, terminal receipt gaps, journal corruption, duplicate jobs,
monotonic remote/delivery observations, crash/reconnect reservation persistence,
existing-PR recovery, matching provider-result receipts, one reconciliation,
one bounded retry, retry-thread binding, and exact merge/runtime proof. Synthetic
tests prove the source contract only; they do not prove live
Hyperagent access, account balance, provider execution, useful output, cost,
delivery, deployment, or exact-runtime behavior.

## First-party sources

- <https://www.hyperagent.com/docs/concepts/agents/invocations/mcp-server>
- <https://www.hyperagent.com/docs/changelog/2026-08-20-more-capable-agents-visible-control>
- <https://www.hyperagent.com/docs/changelog/2026-08-12-team-memories>
- <https://www.hyperagent.com/docs/tools/data-and-code>
- <https://www.hyperagent.com/docs/billing/control-costs>
