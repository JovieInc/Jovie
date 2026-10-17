# Artist launch surface contract

JOV-8369 establishes the **intended** web launch cut line and a reproducible
source inventory. It does not certify a deployed launch. Runtime enforcement,
claims reconciliation and browser evidence are required in
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

Reconciliation against source and Linear on 2026-10-15:

- **JOV-3768 is canceled.** Current main retains `/app/settings/profile`, its
  artist-profile alias, account and individual settings pages. The seven-page
  proposal is not evidence of shipped consolidation. This slice preserves the
  current entry points so required profile controls are not retired prematurely.
- **JOV-6211 remains open.** Dashboard base loading still filters the deprecated
  `creatorProfiles.userId`; `updateCreatorProfile` also uses that legacy owner.
  `getExactProfileAccess` already has canonical-claim precedence, but that does
  not prove every read/write path uses it. The September triage deliberately
  retained the indexed legacy read until identity hardening or stop-write;
  preserve that safety index. JOV-8505 must reconcile these paths against the
  launch ownership contract before changing the query.
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

**Ship now:** inventory and source-contract drift detection.
**Re-evaluate when:** JOV-8505 integrates launch enforcement and claims ownership.
**Then:** certify the matrix on the deployed generation under JOV-8370 before
JOV-8368 invites the first artists.
