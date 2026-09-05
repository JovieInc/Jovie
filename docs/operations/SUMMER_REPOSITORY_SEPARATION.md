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
Summer Blob calls require an explicit `SUMMER_BLOB_READ_WRITE_TOKEN`; ambient
`BLOB_READ_WRITE_TOKEN` cannot be used. Product credential names are rejected in
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
root `apps/summer`, production branch `main`. Runtime commit
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
