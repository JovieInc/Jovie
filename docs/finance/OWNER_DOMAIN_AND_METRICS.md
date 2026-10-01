# Finance owner domain and metric contract

- Status: canonical v1 design for JOV-4610
- Security dependency: JOV-4609 (Done)

The financial owner is the authenticated individual's `users.id`. A creator,
profile, workspace, organization, manager, label, collaborator, or admin role
is never an authorization principal for finance. V1 has no finance sharing.

## Canonical sources

- `apps/web/lib/finance/domain-contracts.ts`: entities, relationships, retention, provenance, categories, and lifecycle.
- `apps/web/lib/finance/metric-contracts.ts`: the only formula, window, label, display, desired-direction, and edge-treatment registry; all consumers cite its id and `finance-metrics/v1` version.
- `apps/web/lib/finance/metric-evaluation.ts`: deterministic trend, target-status, and confidence evaluation.
- `apps/web/tests/fixtures/finance-domain.ts`: mixed personal/business accounts and irregular creator income.

Money uses signed integer minor units: inflow positive, outflow negative. Provider decimal strings convert once at ingestion;
calculations never mix currencies without a persisted FX assumption.

## Relationship design

```text
users.id (financial owner)
└─ provider connection ─ consent events
   └─ institution ─ account ─ balance snapshots
                            └─ transactions
                               ├─ splits / classification / corrections
                               ├─ transfer pairs / refunds / adjustments
                               └─ deterministic owner rules
└─ budgets / sustainability targets
└─ comparison windows ─ metric snapshots
└─ forecast assumptions ─ scenarios
└─ deletion requests / exports / redacted audit events
```

Every finance row has a non-null `owner_user_id -> users.id`, even when its
parent already has one. Every parent reference is a composite same-owner foreign
key `(owner_user_id, parent_id)`, backed by a unique `(owner_user_id, id)` on the
parent. Every table uses `ENABLE` and `FORCE ROW LEVEL SECURITY` with only
`owner_user_id = current_app_user_uuid()` in `USING` and `WITH CHECK`. There is
no system, table-owner, creator, workspace, or membership bypass.

Provider connection is distinct from institution: connection owns encrypted
read-only credentials and current consent; immutable consent events prove grant,
scope change, revocation, and disconnect. Balance snapshots are immutable.
Pending transactions are superseded by posted transactions through provider
identity, not counted twice. Splits sum exactly to their parent. Transfer pairs,
refunds, chargebacks, reimbursements, and adjustments retain explicit links.
Owner corrections are immutable events; the current classification is a
rebuildable projection, and an enabled deterministic rule records its version.

## Provenance and citations

Imported and derived records carry source kind, opaque or hashed source ref,
connection and sync-run ids where applicable, input record ids, observation
time, and definition version. Raw provider payloads are transient and are not
persisted. Metric snapshots additionally persist owner, metric id, exact current
and comparison bounds, as-of time, value/unit/state, assumption ids, source
counts, exclusions, freshness, and confidence.

An owner-only UI or assistant citation uses: metric label + definition version,
as-of time, window bounds, last successful sync, included account/transaction
counts, exclusions, assumptions, and confidence. Transaction ids and detailed
descriptions remain owner-only; shared memory, analytics, telemetry, support,
and creator context receive neither inputs nor personal derived values.

## Retention and lifecycle

- Provider secrets use `revocable_secret`: revoke provider access and destroy
  local credentials on consent revocation or disconnect.
- Normalized source records use `owner_lifetime`: retain only while the owner
  retains the connected history; owner deletion cascades by `owner_user_id`.
- Metric/window snapshots use `derived_rebuildable`: remove them when any input
  is deleted and rebuild only inside the same owner session.
- Exports use `expiring_artifact`: every object and row has `expires_at`; expiry,
  owner deletion, or explicit deletion removes both.
- Consent/deletion/audit evidence stores redacted hashes and lifecycle metadata,
  never values, descriptions, account ids, or provider payloads; each row has an
  explicit policy expiry. Backups are inaccessible after tombstoning and expire
  under the recorded provider backup policy.

Deletion order is credentials → exports → derived snapshots/scenarios → rules,
classifications and links → transactions/balances/accounts/institutions →
connection. The deletion receipt retains only a redacted digest. Export and
deletion state transitions are owner-scoped, auditable, retryable, and fail
closed; success is returned only after durable state is written.

## Migration plan

1. Preserve the existing owner-only `finance_institutions`, `finance_accounts`,
   `finance_transactions`, `finance_exports`, budget tables, and their RLS.
2. Add provider connection/consent and immutable balance tables; backfill each
   existing row from its own `owner_user_id`, never from creator data.
3. Add transaction lifecycle/link/classification tables, then same-owner unique
   keys and composite foreign keys. Reject mismatches before enabling writes.
4. Add window, metric, assumption, scenario, lifecycle, and audit tables under
   identical owner RLS. Derived rows are regenerated owner by owner.
5. Dual-read and reconcile owner-scoped data, then remove cached balance and
   legacy pending fields only in a later append-only migration after parity.

No migration writes financial data to an existing creator-scoped table, adds a
creator/workspace membership foreign key to finance, or backfills ownership from
profile membership. Each downstream issue ships its own append-only migration
and extends the every-table owner/RLS authorization matrix from JOV-4609.

## Deliberately derived creator-business publication

V1 remains disabled. A later, separately reviewed owner-opt-in publication may
copy only the allowlisted aggregates: creator income this month, typical monthly
creator income, creator operating burn, and creator investment spend. Enablement
must name each metric and definition version, destination, expiry, and revocation
state. It publishes a value copy, never a finance row, relationship, cache key,
transaction, account, or authorization grant. Cash, debt, tax reserve, personal
income/spend, survival burn, net cash flow, runway, and both coverage metrics can
never cross into shared creator context.

## JOV-4609 security review

Contract review passes the owner-only architecture: all entity definitions name
the authenticated individual; every relationship is same-owner; shared context
defaults off; the future allowlist contains derived creator-business values only;
provenance and lifecycle metadata are owner-scoped and redacted. The table-driven
contract test enforces those properties and all required edge treatments.
Integration reviews must still prove owner/non-owner/unauthenticated RLS, job,
cache, export, telemetry, and AI-memory negative cases against real tables and
endpoints before their issues merge.

**Ship now:** versioned contracts and fixtures without provider or UI coupling.
**Re-evaluate when:** a downstream implementation cannot express a required
relationship, metric input, or owner-only lifecycle.
**Then:** version the contract and migrate additively; never reinterpret stored
snapshots under a changed formula version.
