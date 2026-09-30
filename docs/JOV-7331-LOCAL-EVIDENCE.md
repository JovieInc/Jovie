# JOV-7331 bounded fleet: local evidence

The implementation is locally verified, with production activation held. No
production credential, environment flag, deployment or Messages introduction was
created. Summer contact and a live assignment remain unverified.

## Implemented surface

Six actions use the existing canonical contract: fleet.register, fleet.status,
work.next, work.claim, work.report, defect.report. CLI bindings are generated from
that manifest. Profile-bound worker bearers are individually scoped, expiring and
revocable; only credential hashes persist. Registration, bounded leases,
idempotency bindings, evidence receipts and defect reservations use the existing
PostgreSQL operating record backend with atomic compare-and-set.

Founder session controls require a short-lived one-use approval bound to actor,
profile, operation and exact payload. Missions record owner, existing work,
acceptance criteria and deadline; this first slice admits existing public read
commands. A lease grants no write, spend, deploy or credential authority. No
mission runner was introduced. The feature defaults off, and public MCP discovery
excludes operator tools.

Defects use server-derived issue UUIDs and profile-namespaced comment UUIDs.
Invocation key/payload binding precedes effects. Every provider write rechecks
credential revocation, lease expiry and reservation fencing, including after an
awaited comment lookup. Abandoned reservations permit authorized replacement
leases after a bounded interval. Expired original attempts reconcile read-only
and acknowledge completion only with exact comment/body or original create-body
proof. Missing evidence receives a terminal conflict. Editable marker substrings
cannot redirect identity; untrusted reserved markers are rejected.

## Exact local validation

Node24.21.0 and pnpm9.15.9, exact frozen lockfile dependencies installed offline
from the existing shared pnpm cache with hardlinks and zero downloads.

- Action contracts:58 tests; typecheck and generated-artifact drift checks pass.
- Fleet CLI:84 tests passed before the final bodyless cancellation assertion;
  the same guard/regression was independently verified in both worktrees.
- Final fleet/Linear suite:23/23 tests pass, including the actual PostgreSQL
  canary, concurrent next/claim/report, durable receipt parity across CLI/MCP/REST,
  dispatcher recreation, public OpenAPI read and revocation. The disposable
  loopback database stopped automatically after the run.
- Full repository types:16/17 initially, with two test-only typing errors;
  both fixed. Fresh full web typecheck then passes on the final source.
- Fleet source Biome and deterministic contract/CLI generation checks pass.
- Independent review reproduced four original defects plus evidence-proof and
  cross-profile UUID defects. Regressions cover all findings, late attempt
  fencing and adapter revocation after provider reads. Re-review is clean.

The actual DB test is opt-in through FLEET_LOCAL_DB_URL. It rejects non-loopback
hosts and requires database name jov7331_canary. It uses the production PostgreSQL
record backend with synthetic identities, never a production URL. It performs no
live Linear mutation.

## Separate public CLI safety slice

PR https://github.com/JovieInc/Jovie/pull/19742 contains only public protocol,
retry, cancellation, rate-limit error and output-contract fixes. Both independent
review findings and bodyless204 cancellation are fixed and reviewed. Final local
results:86 tests,90.36% branch coverage,97.41% lines,17/17 full repository types,
and official clean npm consumer pack/import/runtime fixture journeys pass.
Exact-head CI and normal qualification/promotion remain separate from fleet.
Existing JOV-6864/PR19730 owns the npm/MCP publication workflow; no duplicate
publication system or version bump was added here.

## Live gaps and next approval

Linux consumer proof, source-head CI/qualification, native merge, release and
hosted route/session/Linear integration remain required before live certification.
Passing local tests is not a Done receipt. The final reviewed tree will be shipped
in bounded dependent layers through normal gates.

Before a hosted fleet canary, review the exact deployed build and obtain approval
to enable the flag in one named staging environment, provision one short-lived
synthetic worker for one owned profile with exact scopes, select the Linear team,
and admit a single public-read mission with explicit acceptance criteria and
existing owner/work references. Live defect creation/comment scope must be
explicit. Production and existing founder approval gates remain intact.

Summer coordination is established only when the hosted operator can observe and
admit work through this durable store. No Summer assignment or introduction has
been sent or inferred from local tests.
