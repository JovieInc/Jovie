# Finance privacy boundary — security review checklist (JOV-4609)

Personal financial data in Jovie is **owner-only**. The financial owner is the
authenticated user's `users.id`. Creator profiles, workspaces, collaborator
roles, manager/label access, and admin-level creator permissions grant **zero**
access to financial data. V1 supports no sharing; any future sharing model
requires a separate explicit-consent, scoped, revocable design.

This checklist must pass before any financial feature ships.

## Data layer (mandatory)

- [ ] Every `finance_*` table keys rows by `owner_user_id → users.id`. No
      `creator_id`, workspace, or membership column exists on a finance table.
- [ ] Every `finance_*` table has `ENABLE ROW LEVEL SECURITY` **and**
      `FORCE ROW LEVEL SECURITY`.
- [ ] The only policy predicate is
      `owner_user_id = current_app_user_uuid()` (USING and WITH CHECK).
      No `is_system_rls_session()` bypass and no `is_rls_table_owner` bridge.
- [ ] Authorization tests exist for owner, non-owner collaborator, unrelated
      user, and unauthenticated principals against every finance table.

## Application layer

- [ ] Request paths resolve the owner via `requireFinancialOwnerId()` (from
      the authenticated session only) — never from a route param, creator id,
      or client-supplied value.
- [ ] Background jobs and webhooks carry the owner's `users.id` in their
      payload, validate it with `assertFinancialOwnerId()`, and run inside an
      owner-scoped RLS session (`applyRlsSessionUser`). There is no system
      session that can read finance rows.
- [ ] Repository/service functions always filter by `owner_user_id`; guessed
      ids and direct API calls fail closed.
- [ ] Server actions and routes never return another owner's rows, derived
      personal metrics, or existence signals (enumeration-safe errors).

## Cache and rendering

- [ ] All finance cache keys are built with `financeCacheKey(ownerUserId, …)`;
      no creator- or workspace-scoped key may contain financial data.
- [ ] Server-rendered payloads are keyed per owner; SSR hydration never
      includes another user's finance rows.

## Outbound surfaces

- [ ] Shared creator dashboards contain no personal balances, burn, runway,
      categories, or transaction-level data.
- [ ] Exports and emailed reports are generated only under an owner session
      and stored under an owner-scoped `finance_exports` row.
- [ ] Notifications, analytics events, logs, and error reports pass finance
      payloads through `redactFinancialFields` — no descriptions, balances,
      account identifiers, merchant details, or provider payloads.
- [ ] Personal finance stays out of shared memory, creator-agent context,
      embeddings, search indexes, and support/admin surfaces.

## Review sign-off

- [ ] A reviewer has walked the negative cases in JOV-4609 (collaborator
      admin, manager/label, multi-workspace user, guessed ids, stale session,
      job owner confusion, cache collision, SSR leak, exports, AI retrieval).
- [ ] Any new finance table, endpoint, job, or surface added since this list
      was last signed is re-checked against every item above.
