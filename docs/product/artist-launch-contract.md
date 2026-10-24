# Artist launch surface contract

JOV-8369 establishes the **intended** web launch cut line and a reproducible
source inventory. It does not certify a deployed launch. Remaining runtime
enforcement, claims-path auditing and browser evidence are required in
[JOV-8505](https://linear.app/jovie/issue/JOV-8505), with deployed certification
in [JOV-8370](https://linear.app/jovie/issue/JOV-8370) and launch commissioning
in [JOV-8368](https://linear.app/jovie/issue/JOV-8368).

The machine-readable [inventory](generated/artist-launch-inventory.json) is
generated from [the policy](../../scripts/artist-launch-policy.mjs) and current
App Router source. Its `status: unverified` is deliberate: a B classification
names a feature to certify, not a claim that it already works.

| Class | Launch contract | Required controls / entry |
| --- | --- | --- |
| A | Account identity and security, regardless of product or paid plan | Account email, connected accounts and session management under Account; settings preferences remain account-owned |
| A | Data and privacy | Export and delete under Data & Privacy; legal documents remain reachable |
| A | Billing management | Subscription management, billing history and portal remain reachable even when paid features are unavailable |
| B | Artist identity and public output | Profile settings photo/name/username and entity details; public profile/about/contact; owner and visitor output must agree |
| B | Claim and active profile | Authenticate, claim the immutable creator entity, select only an authorized profile |
| B | Profile links | Social-link edits and preview through the existing profile editing context |
| B | Owner home and upgrade | Minimal owner entry and truthful existing billing/checkout prerequisites |
| C | Everything else in this source inventory | No launch affordances on any declared discovery or execution channel; preserve implementation and data |

The policy explicitly inventories currently mounted payment, Shopify, rider and
artist-rule controls as C. The current settings page still renders these. The
inventory is **not** a route guard or an authorization mechanism; JOV-8505 must
integrate it before the launch can be called ready. Internal/admin/service
routes default to C for the artist cohort, not a request to disable operations,
webhooks or internal authorization globally.

## Identity and ownership

`users.id` identifies the account; email, authentication, sessions, privacy and
billing belong to that account. `creator_profiles.id` identifies the creator
entity; display name, username, image, biography and social links belong to it.
`user_profile_claims` connects the two, with owner/manager write roles.
`users.active_profile_id` selects an entity and never grants access by itself.
Canonical claims take precedence over the deprecated profile `user_id` field.
Required proof must edit two distinct entities, reload owner and public views,
and reject a different account, stale legacy owner and ambiguous claim graph.

Reconciliation against source and Linear (2026-10-15; ownership update 2026-10-24):

- **JOV-3768 is canceled.** Current main retains `/app/settings/profile`, its
  artist-profile alias, account and individual settings pages. The seven-page
  proposal is not evidence of shipped consolidation. This slice preserves the
  current entry points so required profile controls are not retired prematurely.
- **JOV-6211 remains open.** The 2026-10-24 ownership slice changes dashboard
  candidates, profile API reads/writes, profile edit actions and switching to
  canonical-claim precedence. A session-bound boolean DB function sees claims
  hidden by tenant RLS; legacy ownership is allowed only when the entity has no
  canonical claims. Indexed candidate IDs retain the legacy safety index.
  Profile settings use the same authorized active selection as the owner shell;
  artist display-name edits no longer rename either account. Existing dashboard
  cache keys are versioned to discard pre-repair ownership results. This is
  source/fixture evidence, not an audit of every legacy ownership path or a
  deployed persistence claim; JOV-8505 retains that remaining audit.
- **JOV-8368 remains commissioning work.** No price, existing plan, entitlement,
  invitation or live Stripe behavior is changed by this source contract.
- **gbrain-unavailable:** the local service refused the preflight query; these
  findings were refreshed from repository and Linear evidence.

## Regeneration and CI

```sh
node scripts/artist-launch-contract.mjs --write
pnpm exec biome format --write docs/product/generated/artist-launch-inventory.json
node scripts/artist-launch-contract.mjs --check
node --test --test-isolation=none scripts/artist-launch-contract.test.mjs
```

Review each new entry before regenerating. Unassigned routes/actions receive C;
there is no permissive wildcard. The existing Source Guards lane checks parity
on PR and combined-head changes. It rejects added/removed/renamed entry points,
missing controls/actions, duplicate assignments, broken or cyclic prerequisites,
declared hidden required settings/actions and declared deferred channel leaks.
These are source-contract checks, not rendered UI or authorization tests.

The generated inventory covers `page`/`route` source files, their exported HTTP
methods, module-level `use server` exports under `apps/web/app`, and declared
editing controls. It retains separate source records for aliases and parallel
auth slots. Inline server closures, server actions outside `app`, config-only
rewrites, generated framework HEAD/OPTIONS methods and transitive component
affordances need the runtime integration audit in JOV-8505.

The manifest's proof matrix records desktop/mobile, free/trial/pro/max, flag
defaults/all-on/all-off, empty/pending/error/recovery, direct URLs and API/action
entry, persistence and public/owner parity. No screenshots or runtime receipts
are fabricated by this generator. JOV-8370 must bind those to a deployed SHA.

## Ownership regression evidence

The fast CI suite executes production Drizzle queries and transactions using
installed embedded PostgreSQL (PGlite), with no database credentials or skips:

```sh
pnpm --filter @jovie/web exec vitest run tests/unit/auth/artist-profile-ownership.test.ts --maxWorkers=1
```

The same suite can target a disposable loopback PostgreSQL database named
`jov8369_profile_contract` via `PROFILE_OWNERSHIP_TEST_DATABASE_URL`. It never
falls back to the application `DATABASE_URL`. It creates fixture tables and
executes the new migration; the restricted-role case replays existing profile
policies and verifies rejection when RLS hides another account's claim. Cases
cover exact entity writes, managers, viewers, ambiguous roles, legacy fallback,
revoked selection, account-name separation, empty accounts, reloads, cache
invalidation and rollback. Fixture rows and policies do not certify deployed
schema, database roles, public browser rendering or query performance. Migration
0148 requires a trusted owner with RLS bypass capability and fails before
activation if that prerequisite is absent; no role or credential is granted.

**Ship now:** inventory drift detection and the bounded ownership repair.
**Re-evaluate when:** JOV-8505 completes launch enforcement and remaining claim paths.
**Then:** certify the matrix on the deployed generation under JOV-8370 before
JOV-8368 invites the first artists.
