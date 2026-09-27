# JOV-6044 data integrity audit

Status: source audit and bounded remediation, 2026-09-27. This is an evidence
map, not a second invariant registry. Canonical contracts remain in the schema,
application write paths, migrations, and the related Linear issues named below.

## Critical invariant map

| Domain | Persistent invariant | Database enforcement | Application enforcement / proof |
| --- | --- | --- | --- |
| Identity | A provider identity, email, Stripe customer, or subscription identifies at most one user | Unique constraints in `schema/auth.ts`; Better Auth provider constraints in `schema/better-auth.ts` | Auth adoption verifies the provider identity before binding it |
| Ownership and claims | One profile has at most one claim for a given role; claims cannot outlive their user or profile | `user_profile_claims (creator_profile_id, role)` unique; user/profile foreign keys cascade | Ownership readers use `userProfileClaims`; RLS integration coverage exercises cross-user denial |
| Billing and entitlements | One Stripe Connect account maps to at most one payout profile; concurrent entitlement writers cannot silently overwrite each other | Partial unique Connect-account index; `users.billing_version` compare-and-swap; billing audit FK | `applyBillingUpdateWithAudit` updates entitlement and inserts its audit receipt in one statement; `billing-persistence-concurrency.test.ts` races both boundaries on PostgreSQL |
| Profiles | Public handles are unique; profile edits reject stale versions | Unique normalized username; non-null monotonic `profile_edit_version` | Dashboard writes compare the expected edit version; collaborator reconciliation has a real-DB race test |
| Jobs and events | A provider event or dedupe key produces at most one durable effect | Unique Stripe event ID and domain-specific unique dedupe keys; job/profile foreign keys | Claim/update statements use conflict handling, event timestamps, leases, or CAS according to the workflow |
| Tenant data | A user cannot read or mutate another tenant's private profile, billing, chat, tips, or ingestion state | Forced RLS and ownership policies from migrations `0086` and `0089` | `rls-access-control.test.ts` and `rls-identity-pin.test.ts` use a non-`BYPASSRLS` database role |

## Representative invalid-state proof

- Duplicate user/provider/billing identities are rejected by unique constraints.
- Orphaned claims, profile-owned records, and billing audit rows are rejected by
  foreign keys or removed according to their declared delete policy.
- Duplicate profile-role claims are rejected independently of application code.
- Two concurrent Stripe Connect assignments cannot persist the same account on
  different profiles after migration `0111`.
- Two entitlement writers starting from the same billing version produce one
  winner, one stale result, one version increment, and one audit row.
- Cross-tenant reads and writes are exercised through PostgreSQL RLS rather than
  mocked repositories.

## Migration and recovery disposition

Migration `0111` checks for dirty duplicate Connect mappings before DDL and
fails without deleting or choosing a winner. The unique index is partial, so
unconnected profiles remain valid. Old application versions continue to read
and write the same column; the only newly rejected state was already unsafe.
The migration is append-only and uses idempotent DDL. Its regular index build is
transactional and may take a write lock; the certified online-index path remains
owned by JOV-3062 rather than being redefined here.

The broader migration-history/effective-schema work remains in JOV-6270 and
JOV-6274. Transaction-primitive certification remains JOV-6269, isolation and
reliability remediation remains JOV-6266, and the usable-business-state restore
drill remains JOV-6275. A backup listing is not restore evidence: JOV-6275 must
restore into an isolated target and validate identity, claims, entitlement,
profile, and event records before JOV-6044 can claim recovery acceptance.

## Verification commands

The source PR runs:

```text
pnpm --filter=@jovie/web run migration:validate
pnpm --filter=@jovie/web run drizzle:check
pnpm --filter=@jovie/web run test:integration:collaborator-profiles
```

The integration command is wired to the ephemeral-Neon CI lane and includes
both collaborator reconciliation and billing persistence concurrency tests.
