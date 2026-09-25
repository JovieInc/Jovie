# Summer repository separation

Owner: JOV-5278; application boundary JOV-6023; deployment isolation JOV-6024;
extraction JOV-5280; cutover JOV-6025. Related commissioning remains JOV-4320,
JOV-5853, and JOV-6021. These issues retain their broader scope and owners.

## Decision and source ownership

Extend the existing private `JovieInc/summer-config` runtime authority, as named
by JOV-5278 and JOV-5280. `JovieInc/Ops` continues to own company canon. No new
repository, runtime framework, controller, or repository per identity is needed.
Reuse pinned Eve 0.47.7 (Apache-2.0), Node 24, pnpm 9.15.4, GitHub Actions,
and Vercel. Revisit the substrate only when measured lifecycle or isolation
requirements cannot be enforced by these existing services.

`apps/eve-pilot/scripts/materialize-app.mjs` exports either a Jovie application
or a Summer application into a new directory. It uses an explicit allowlist,
fixed identity, file checksums, and the existing frozen lockfile. It does not
copy environment files, runtime profiles, logs, sessions, or memory. Summer's
export is imported once into `summer-config/apps/summer`; subsequent Summer
implementation belongs there. This is a migration adapter, not a runtime build
dependency on Jovie. The Jovie export remains a product-owned application.

The only extracted utility is `@jovie/agent-transport-contracts`, the
existing Ed25519 snapshot signer. Jovie consumes the workspace package. Summer
vendors source-pinned implementation bytes and metadata for independent installation;
checksums are in its extraction receipt. No package-registry credential or
publication is needed. Like the existing action-contracts package, its private
workspace manifest omits a release version so global version stamping cannot
overwrite an independent contract version. The protocol retains its existing `/v1` discriminators.
Producer/verifier integration tests exercise the signature across this boundary.
A breaking wire change needs a new discriminator and a supported transition;
never coordinate releases by importing the other repository's implementation.

## Enforced source boundary

Each generated application has one fixed identity and rejects attempts to bind
the other identity or its channels. Summer has no generic Eve session endpoint
and no default model tools. Jovie retains its existing authenticated core-chat
adapter and read-only product capability manifest. Photon remains contained.
Summer Blob uses Vercel OIDC with `BLOB_STORE_ID` from the dedicated store
connection; static Blob read-write tokens are denied (summer-config #61).
Product credential names are rejected in
Summer and company credential names are rejected in Jovie.

These guards detect accidental injection. They cannot prove that a provider
credential has a narrow grant. Provider-side project/store/session isolation,
release authority, and negative credential probes are required by JOV-6024.
No private memory provider is added or connected by this change.

## Verification and recovery

Run the materializer with `jovie` or `summer` and a new destination. From each
output, independently run Node 24/pnpm 9.15.4 `install --ignore-workspace
--frozen-lockfile`, `run typecheck`, `run test:coverage`, `run build`, and `run test:built`. The last command boots only the compiled output
in a temporary directory and checks identity/instruction loading without a model call.
The Eve workflow repeats these exact selectors for both outputs. The private
repository runs its Summer selector without cloning Jovie or running product CI.

Keep the existing `apps/eve-pilot` source and routing as recovery material until
the destination is verified. Its continued presence is explicitly not a completed
extraction. Existing product generation, Ovie clients, and authenticated transports
remain product-owned. JOV-6021's unlanded conversation work is not copied or
superseded; integrate the accepted landed successor under its current owner.

Cutover requires exact private-repository revision, provider grant readback,
independent deployment and rollback receipts, identity/session tests across
restart, failure and recurrence receipts, and isolated message sinks. After those
pass, switch the authenticated Ovie target and disable the superseded entry points
and deploy workflow in the same approved cutover. Remove the product's runtime
Summer instruction-file reads then. Rollback must target an approved Eve revision
or explicit unavailable, never Hermes, Trigger.dev, OpenClaw, or artist chat.

Until these gates pass, deployment and commissioning are incomplete. The canonical
retirement/freshness registry is unchanged; an export or green build does not
refresh its runtime evidence.

The manual `jovie-agent-release.yml` workflow exports only the Jovie application
from a reviewed main revision. It requires a separate protected
`jovie-agent-release` environment and `JOVIE_AGENT_VERCEL_*` project binding.
Its preview/candidate/promote/rollback gates are covered by the same test cases
as the independent Summer release path. Neither workflow changes current routing
until an authorized promotion; neither environment is commissioned by this PR.

## Production cutover receipt (2026-09-05)

Private `JovieInc/summer-config` owns the Git-linked `jovie-eve-shadow` project,
root `apps/summer`, production branch `main`. `jovie-eve-shadow`
(prj_LaVQva346cjp5XfrbAIIQUln7tPH) is the production Summer project; "shadow"
is a legacy name from the pre-cutover pilot. Its production alias is
summer.jov.ie. Runtime commit
`f9cad8528000000c4f196e1ccbf6a8aaf386b0f7` deployed as
`dpl_CnnoQexMQB46zwBNURMJSsAZrRAp`; the public Photon alias served that build.
A real founder iMessage at 20:50:42.610Z reached the signed production webhook
with HTTP 200, created one immutable admission, and received one Summer reply
at 20:50:56.976Z. The obsolete parallel webhook was retired with sole-replacement
readback. No credentials or message bodies belong in this repository.

The monorepo Eve workflow retains all verification jobs and no longer has
company deployment or promotion jobs. Deploy and rollback Summer through its
private repository and verified private deployment history. Do not restore a
mixed monorepo build onto the company alias. Product Eve materialization remains
here; historical Summer extraction fixtures are verification-only pending
final source cleanup. Transport delivery does not certify governor execution,
Ovie web/mobile continuity, or revenue lift.

## Production Summer identity and the Jovie pin

EVENT: Production Summer is project `prj_LaVQva346cjp5XfrbAIIQUln7tPH`. The
display name is not identity.

Identify Summer by that project id (`SUMMER_PRODUCTION` in
`apps/web/lib/ovie/summer-production-identity.ts`), never by the Vercel display
name. "shadow" in Summer names does not mean non-production.

The Jovie caller targets `https://summer.jov.ie`. It does not use
`OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN` as the request URL. A summer-config
promotion that moves the production alias does not require an env edit or a
new exact deployment id in Jovie.

`resolveSummerEveCallerOrigin` reads `GET /runtime/v1/identity` on that alias.
The alias must be `company.summer`, project
`prj_LaVQva346cjp5XfrbAIIQUln7tPH`, and `environment=production`. The live
`deploymentId` is what response headers are checked against. A 404, an
unreachable alias, or any other identity is `503` `summer_pin_invalid`. That
failure is not cached and is not mapped to a generic 502.

`OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN` and
`OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID` stay optional advisory pins.
`pnpm check:summer-eve-pin` still requires both. When they are set and the
alias `deploymentId` differs, the runtime logs `summer_pin_invalid` with
`fallback: production_alias` and still calls summer.jov.ie. The scheduled
check warns and exits 0; `--strict` makes that drift fatal. Do not clear the
two pin variables to silence the log: the CI check fails its schema without
them. Leave them in place so the schedule can see drift, or update them when
convenient. They are not on the request path.

`check:summer-eve-pin` still requires a READY production-target deployment of
that project, and `blobAuth=oidc` on both the pinned deployment and the
alias. A 404 from either identity read fails the script.

Before revoking any Summer credential, list the deployments that still use it,
including whatever deployment summer.jov.ie currently serves.

## Repointing the Jovie bridge

1. `GET https://summer.jov.ie/runtime/v1/identity` and confirm `projectId`,
   `environment=production`, and `blobAuth=oidc`.
2. Ship a Jovie production build of the alias caller. No Jovie env change is
   required for the heartbeat to follow the alias.
3. Keep `OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET` as the eve-shadow automation
   secret. It is sent to the alias, not to a hard-coded deployment host.
4. Optional: refresh the two advisory pin variables to the current immutable
   URL and `deploymentId`, then run `pnpm check:summer-eve-pin` with a
   read-only `SUMMER_PIN_CHECK_VERCEL_TOKEN`. The schedule skips until that
   token exists.

Ship now: call summer.jov.ie, fail closed only when that alias is not
production Summer, and log a stale exact pin while still using the alias.
Re-evaluate when the advisory pin is unused. Then remove the two pin
variables and the exact-id CI check.
