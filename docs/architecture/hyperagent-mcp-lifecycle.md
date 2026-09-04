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

Authentication and canonical provider admission remain outside this source change.
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
| Remote completed with useful-output, usage, route, destination, and cost receipts | `remote_useful_success` | Settle trusted cost, then reconcile PR, merge, and required runtime; this is not landed |
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
2. `preflight` requires current account, payer, budget period, auth, thread
   scopes, model, balance, auto-recharge-off, per-query/period caps, useful
   outcome, issue, lease, destination, expected PR repository, required runtime,
   idempotency key, and normalized request digest. The
   journal independently authenticates the budget snapshot HMAC over payer,
   account, period, cap, spend, balance, and observation time.
3. Before any `create_thread` call, `reserve_dispatch` takes the canonical
   journal lock and atomically reserves the full per-query cap against aggregate
   exposure for the exact payer, provider account, and budget period. Every
   execution-affecting field is bound to one immutable identity digest.
4. The reservation emits an unpredictable persisted attempt identity. Created,
   found-existing, and provider-absence evidence must be HMAC-authenticated,
   identity-bound, and observed after the reservation. Ambiguous create outcomes
   retain exposure until signed reconciliation proves the original attempt
   absent or binds the existing thread.
5. `register_dispatch` cannot create or backfill a reservation; it only confirms
   an already authenticated thread binding. Remote and delivery observations
   preserve issue, lease, attempt, thread, PR, merge, runtime, and key identity,
   increase monotonically, and update `remote_state` without altering the
   separate `exposure_state`.
6. `classify` derives state from structured provider evidence; `plan` describes
   one admissible next action but always returns `execute: false`.
7. The journal atomically reserves that exact action. Only the first reservation
   returns `execute: true`; a reconnect sees the existing reservation and does
   not repeat the mutation.
8. Post-action completion must bind the reservation to an HMAC-authenticated,
   identity- and attempt-bound reconciliation receipt; authorization or
   reservation alone is never recorded as execution.
9. A single same-key create retry is allowed only after authenticated
   provider-absence evidence, fresh budget facts, exact full-identity
   revalidation, and aggregate exposure reservation under the process lock. A
   delivery retry additionally requires revision-current proof that the remote
   job is absent or idempotently replayable and that no PR exists. A committed
   identical receipt remains idempotent after its normal freshness window;
   changed evidence fails closed.
10. Completed, failed, declined, and cancelled outcomes release exposure only
    through an authenticated exact-cost or zero-cost terminal receipt bound to
    the full terminal observation digest. Unknown cost retains the reservation.
    Remote completion remains non-terminal: external delivery is independently
    verified through PR, merge, and exact-runtime evidence.

## Verification boundary

Deterministic tests cover auth/cap admission, every interaction class, exact
approval matching, legitimate attended web fallback, stale/lost transport,
401/402/403/429/5xx, terminal receipt gaps, journal corruption, full-identity
replay rejection, process-raced aggregate reservation, canonical-path aliases,
hard-link rejection, unpredictable attempts, authenticated create and terminal
receipts, ambiguous-create reconciliation, delayed exact replay, all terminal
outcomes, monotonic remote/delivery observations, existing-PR recovery, one
budgeted safe retry, and exact merge/runtime proof. Synthetic tests prove the
source contract only; they do not prove live
Hyperagent access, account balance, provider execution, useful output, cost,
delivery, deployment, or exact-runtime behavior.

## First-party sources

- <https://www.hyperagent.com/docs/concepts/agents/invocations/mcp-server>
- <https://www.hyperagent.com/docs/changelog/2026-08-20-more-capable-agents-visible-control>
- <https://www.hyperagent.com/docs/changelog/2026-08-12-team-memories>
- <https://www.hyperagent.com/docs/tools/data-and-code>
- <https://www.hyperagent.com/docs/billing/control-costs>
