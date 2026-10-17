# PAP protocol profile and adoption decision

Assessment: [JOV-7960](https://linear.app/jovie/issue/JOV-7960), 2026-10-15.
Profile ID: `pap`; revision: **1**; class: **protocol**, not a marketplace.
Canonical profile owner: [JOV-7312](https://linear.app/jovie/issue/JOV-7312),
within the [capability distribution architecture](CAPABILITY_DISTRIBUTION_OS.md).
Local source inspected: `112f1c63691`; production observations: build `85c8866`.
Evidence cache: [dated sources, hashes, HTTP observations and test receipt](evidence/pap-2026-10-15.json).
GBrain: `gbrain-unavailable` (localhost:7801 connection refused).

## Decision

**Ship now:** register the evidence-backed assessment, reuse current public
contracts, and reconcile existing owners. The bottleneck is uncertainty about
protocol maturity and Jovie's actual delegation journey, not absence of another
runtime. Success for this assessment is a source-backed disposition for every
required surface and separate, falsifiable admission and rollout gates.

**Re-evaluate when:** an official revision, reference implementation/client,
security correction, compatible-client result or Jovie prerequisite materially
changes the requirement map. **Then:** JOV-7315 updates this profile and reconciles
JOV-7961/JOV-7962 plus the affected existing owners. Keep unchanged evidence cached.

**EVENT:** Summer retains company-work authority. External customers use Jovie's
public contracts; PAP grants no route to privileged Summer/Ovie tools. No new
registry, marketplace, orchestrator, identity provider or product pivot. LYB is
outside this delivery. Use bounded, non-preempting capacity at the existing issue
priority. APIs/MCP remain a core access path under the
[current product priority](../../canon/strategy/theses/2026-09-03-apis-mcps-core-not-first.md).

Anonymous public lookup and allowed unclaimed drafts remain available before
signup under their existing limits. Private access, ownership, publication,
mutations and paid actions keep their current consent, approval and entitlement
checks. This study authorizes no payments, sponsored-card purchase, push transport
or outbound action. Signup, claim, checkout, CLI distribution and current revenue
certification have no PAP prerequisite.

## Protocol provenance and status

The October 6 issue context is now historical: Sierra
[published a draft on October 9](https://sierra.ai/blog/poppy), linking the
[protocol site](https://personalagentprotocol.org/). The site links its
[publisher repository](https://github.com/personal-agent-protocol/personal-agent-protocol).
This provenance establishes an official draft, not deployed Jovie support.

| Evidence                                                                                                                                                        | Published / revision                                                   | Retrieved  | What it establishes                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [Sierra announcement](https://sierra.ai/blog/introducing-personal-agent-protocol)                                                                               | 2026-10-06                                                             | 2026-10-15 | OAuth-backed visits across company channels announced; granular permissions, push and payments described as possibilities.               |
| [Sierra draft publication](https://sierra.ai/blog/poppy)                                                                                                        | 2026-10-09                                                             | 2026-10-15 | Official draft exists; reference implementation still described as forthcoming. Partner demonstrations do not prove Jovie compatibility. |
| [Official specification](https://personalagentprotocol.org/docs/spec)                                                                                           | Draft 0.1; publication event 2026-10-09                                | 2026-10-15 | Specified draft, not stable 1.0. Rendered Markdown SHA-256: `799fa69df0e51e71c34877c9f3629786da91f71b9e8205abe390415e663d45b1`.          |
| [Immutable publisher source](https://github.com/personal-agent-protocol/personal-agent-protocol/blob/f766ef8bdc249c66b2a42671ea9e7d53c3555665/content/spec.mdx) | Repository head `f766ef8bdc249c66b2a42671ea9e7d53c3555665`, 2026-10-14 | 2026-10-15 | Reproducible source pointer; separate MDX digest in cache. No attestation that this source built the live site.                          |
| [Path to 1.0](https://personalagentprotocol.org/docs/path-to-1)                                                                                                 | Draft 0.1; page publication date unknown                               | 2026-10-15 | Breaking draft revisions possible; payments, push and attachments remain open topics.                                                    |
| [Publisher README](https://github.com/personal-agent-protocol/personal-agent-protocol/blob/f766ef8bdc249c66b2a42671ea9e7d53c3555665/README.md)                  | Same immutable source revision                                         | 2026-10-15 | Documentation site, explicitly not an implementation of the protocol APIs.                                                               |

Status axes: **announced: verified; specified: official draft 0.1; tested by
Jovie: no; independent interoperability: unverified; public compatibility:
unclaimed**. No official reference implementation was verified in this bounded
source review. Search-discovered third-party SDKs/examples are not official
conformance or compatible-client receipts; none was installed or executed.

The cache retains bounded findings and response digests rather than third-party
articles. A changed HTML/template hash alone is not a protocol event. Preserve
historical snapshots; increment the profile revision only for a changed requirement
or assessment. Unknown required policy dimensions block qualification, as in the
existing architecture; they never expire into a pass.

## Bounded requirement review and unresolved dimensions

These are draft facts from the linked sections, not guesses from the announcement.
They identify work to review; they do not complete the authentication design.

| Dimension                                              | Evidence state                                                                   | Draft requirement / Jovie disposition                                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery                                              | Verified draft, [§3](https://personalagentprotocol.org/docs/spec#discovery)      | `/.well-known/poppy.json`, organization and issuer binding. Adapt only from eligible canonical capabilities; no route added here.                                                                   |
| Session and agent identity                             | Verified draft, [§4](https://personalagentprotocol.org/docs/spec#sessions)       | Client metadata, signed assertions, pairwise user identity, guest/account sessions. Jovie mappings and enforcement are unresolved.                                                                  |
| API transport                                          | Verified draft, [§4.3 and §6](https://personalagentprotocol.org/docs/spec#apis)  | DPoP for OpenAPI; resource-bound Bearer tokens for MCP. Do not reuse an unrestricted token across resources.                                                                                        |
| Browser handoff                                        | Verified draft, [§5](https://personalagentprotocol.org/docs/spec#web-browsing)   | Signed browser assertion establishes a company session cookie. Reuse safe correlation, not shared browser/API credentials.                                                                          |
| Consent and revocation                                 | Verified draft, [§4.4–4.9](https://personalagentprotocol.org/docs/spec#sessions) | Scope-bound sign-in and account-token revocation. Jovie requires next-request denial after revoke, including issued credentials; draft short-token fallback does not satisfy that guarantee.        |
| Conversation transport                                 | Specified draft, [§7](https://personalagentprotocol.org/docs/spec#conversations) | Defer company-conversation exposure; public endpoints cannot proxy private Summer/Ovie.                                                                                                             |
| Listing/submission/commerce                            | Unsupported for this profile                                                     | Protocol adoption supplies no marketplace listing, distribution reach, payment permission or revenue evidence.                                                                                      |
| Jovie endpoints, scopes and token contents             | Unknown / unimplemented                                                          | No Jovie PAP endpoint mapping, account-scope mapping, token format/claims or browser bridge is selected. Do not derive them from examples or the announcement.                                      |
| Privacy, retention, quotas, reliability, certification | Unknown for Jovie PAP                                                            | Review metadata-fetch trust, storage/retention, retry/abuse limits, exact conformance cases and rollout thresholds under existing owners before qualification. No certified badge or latency claim. |

The review must reconcile the two standards below with the exact PAP revision.
Do not attribute their requirements to PAP, or assume Better Auth metadata proves
that either resource authorization or a PAP session bridge works.

- [MCP authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
  supplies HTTP OAuth discovery and registration rules, resource indicators,
  intended-audience validation, per-request header tokens, invalid-token errors
  and scope challenges. Clients bind the selected issuer to each authorization
  transaction and validate the response before code exchange. Authorization is
  optional for public MCP; no reason to gate current anonymous reads. Token
  passthrough is prohibited. The linked discovery/security sections govern the
  complete implementation, including PKCE and untrusted metadata URLs.
- [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
  (§2.1–2.4, §4.14) supplies exact redirect matching (native loopback port
  exception), CSRF and mix-up defenses, PKCE with downgrade protection,
  audience/action restriction and public-client refresh rotation or sender
  constraint. The password grant is prohibited. Prefer company-page direct
  sign-in; optional PAP mediated credential sign-in is not selected for Jovie.
  These existing standards do not provide Jovie ownership, claim, approval,
  entitlement, publication authority or a cross-channel business receipt.
- OpenAPI describes the existing HTTP contract. A schema, MCP tool declaration or
  OAuth login alone does not implement delegation or authorize an action.

## Code/test-backed reuse and delta matrix

All implementation statements below refer to the local source revision above.
Tests are existing tests, not new PAP tests. The twelve selected suites passed
**210 tests** on Node 24.21.0/pnpm 9.15.9 using the secret-free `test:ci` runner;
exact file filters and limitations are in the cache. Source presence, passing
unit tests and live discovery are separate evidence layers.

| Surface                                | Implemented source and test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Remaining delta / disposition                                                                                                                                                                                                                                                          | Canonical owner                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery and public reads             | [API index/contract](../../apps/web/lib/api/v1/contract.ts), [index test](../../apps/web/app/api/v1/route.test.ts), [music MCP](../../apps/web/lib/agent-acquisition/music-mcp.ts) and [tests](../../apps/web/lib/agent-acquisition/music-mcp.test.ts); public artist MCP and OAuth metadata tests below.                                                                                                                                                                             | **Reuse** current discovery. **Adapt** eligible PAP metadata after admission; no new discovery registry.                                                                                                                                                                               | [JOV-3251](https://linear.app/jovie/issue/JOV-3251), [JOV-4075](https://linear.app/jovie/issue/JOV-4075); PAP projection: [JOV-7961](https://linear.app/jovie/issue/JOV-7961). |
| Useful value before signup             | [Shared draft boundary](../../apps/web/lib/agent-acquisition/api.ts) and [tests](../../apps/web/lib/agent-acquisition/api.test.ts); [draft store](../../apps/web/lib/agent-acquisition/draft-store.ts) and [tests](../../apps/web/lib/agent-acquisition/draft-store.test.ts). Signed draft capability, persisted unpublished preview, stable receipt/status ID, retry resumes.                                                                                                        | **Reuse** anonymous allowed drafts. `claim_url` and `published_url` are null; draft tokens never establish ownership. **Adapt** claim continuation in its existing owner.                                                                                                              | [JOV-4076](https://linear.app/jovie/issue/JOV-4076).                                                                                                                           |
| Claim and browser continuation         | [Profile creation](../../apps/web/app/api/agents/profiles/route.ts) returns the existing `/claim` entry for an unclaimed profile; [claim finalization](../../apps/web/lib/claim/finalize.ts), [claim-flow tests](../../apps/web/tests/lib/claim/claim-flow.test.ts). This is distinct from draft-table continuation.                                                                                                                                                                  | **Reuse** existing human claim. **Adapt** the missing draft-to-verified-owner bridge; do not claim a returned URL proves claim completion.                                                                                                                                             | [JOV-4076](https://linear.app/jovie/issue/JOV-4076).                                                                                                                           |
| Customer delegation                    | [Better Auth provider](../../apps/web/lib/auth/better-auth.ts) has code/refresh grants and identity scopes; [artist resource metadata](../../apps/web/lib/mcp/artist-oauth-discovery.ts) and [metadata tests](../../apps/web/app/.well-known/oauth-metadata.test.ts). [Artist MCP](../../apps/web/app/api/mcp/[username]/route.ts) resolves owner tools through [session auth](../../apps/web/lib/auth/cached.ts).                                                                    | **Reuse** provider/session primitives. **Adapt** customer scope enforcement, CLI login/key flow and resource-token verification; metadata and native/session bearer support do not prove delegated OAuth resource tokens. PAP assertion/DPoP/session semantics remain additional work. | [JOV-6866](https://linear.app/jovie/issue/JOV-6866); PAP bridge: JOV-7961.                                                                                                     |
| Channel handoff                        | [CLI command definitions](../../packages/jovie-cli/src/commands.ts) share public tools; [REST/MCP parity tests](../../apps/web/lib/agent-acquisition/api.test.ts) reuse one draft service; claim entry exists separately.                                                                                                                                                                                                                                                             | **Reuse** shared business handlers. **Adapt** privacy-safe journey correlation, account-switch/replay denial and continuation. No implemented PAP browser or conversation bridge was found.                                                                                            | JOV-4075/JOV-4076/JOV-6866; protocol transport JOV-7961; journey [JOV-7962](https://linear.app/jovie/issue/JOV-7962).                                                          |
| Action receipts                        | Draft store returns a receipt and status URL. [Invocation route](../../apps/web/app/api/v1/actions/[actionId]/invoke/route.ts) now exists, but calls [fleet HTTP](../../apps/web/lib/actions/fleet/http.ts); [tests](../../apps/web/lib/actions/fleet/http.test.ts) preserve fleet receipts and reject credential escalation.                                                                                                                                                         | **Reuse** receipt patterns. **Adapt** the customer action execution path in JOV-6866. Route existence does not establish general release/contact/task invocation, and internal fleet receipts grant no customer authority.                                                             | JOV-4075/JOV-6866; descriptor/compiler [JOV-7311](https://linear.app/jovie/issue/JOV-7311).                                                                                    |
| Policy enforcement                     | [Capability resolver](../../apps/web/lib/actions/capabilities.ts) is advisory and denies worker-scope discovery; [tests](../../apps/web/tests/unit/lib/action-capabilities.test.ts). [Artist MCP tests](../../apps/web/app/api/mcp/[username]/route.test.ts) cover owner denial and explicit publish confirmation. [Draft capability tests](../../apps/web/lib/agent-acquisition/draft-capability.test.ts) reject tamper/expiry; API tests cover flag/origin/durable limiter denials. | **Reuse** server ownership, entitlements and per-action approval. **Adapt** grant checks at each selected handler; do not translate read-only delegation into a session with all owner privileges.                                                                                     | JOV-6866/JOV-7961; existing capability policy JOV-7311.                                                                                                                        |
| Revocation                             | Provider advertises a revocation endpoint; draft reads require an unexpired capability and unclaimed row. Neither proves customer connected-app revocation. No connected-app list/revoke implementation was located in the inspected settings/API source.                                                                                                                                                                                                                             | **Adapt** existing grant owner: issued access, refresh, cached auth and queued mutations must honor revoke. Preserve unrelated grants. Test in-flight semantics and prevent handoff resurrection.                                                                                      | [JOV-6712](https://linear.app/jovie/issue/JOV-6712), with JOV-7962 evidence.                                                                                                   |
| Certification and recovery             | [Kernel](../../apps/web/lib/agent-os/certification.ts), [kernel tests](../../apps/web/tests/unit/agent-os/certification.test.ts), [dogfood receipts](../../apps/web/lib/agent-os/dogfood-receipt.ts), [exposure tests](../../apps/web/lib/agent-os/dogfood-receipt.exposure.test.ts).                                                                                                                                                                                                 | **Reuse** kernel, receipt and report/repair loop. **Adapt** one journey and revision-bound channel certification; no PAP certification packet or independent compatible-client run exists.                                                                                             | [JOV-6865](https://linear.app/jovie/issue/JOV-6865), JOV-7962; profile certification JOV-7312.                                                                                 |
| Profiles, compiler and evidence intake | Product truth exists. The [architecture](CAPABILITY_DISTRIBUTION_OS.md) proposes distribution fields/profiles/compiler; searches found no implementation in product-truth/action-contracts/agent-os. [Reconciliation code](../../scripts/capability-benchmark/capability-reconciliation.mjs) already accepts protocol events and deduplicates by evidence/event digest.                                                                                                               | **Reuse** event intake. **Adapt** this assessment into the eventual canonical profile collection. Do not introduce a competing executable profile registry to compensate for unfinished shared work.                                                                                   | JOV-7311/JOV-7312; evidence [JOV-7315](https://linear.app/jovie/issue/JOV-7315).                                                                                               |
| Payments, push, marketplace and LYB    | No PAP evidence establishes these Jovie capabilities or permissions.                                                                                                                                                                                                                                                                                                                                                                                                                  | **Defer** all PAP extensions, purchases, outbound and LYB rollout. No new implementation slice or watcher in this assessment.                                                                                                                                                          | Scope boundary JOV-7961; only material new evidence enters JOV-7315 for triage.                                                                                                |

## Deployed-surface audit

Read-only probes on **2026-10-15 16:22–16:23 UTC**, without customer credentials:

| Probe                                                         | Observed result                                                                    | Limit                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/version` before and after                           | 200, build `85c8866` both times                                                    | Short served build ID, not a full-SHA deployment attestation; different from local source. |
| `GET /llms.txt`, `GET /robots.txt`                            | 200 text responses                                                                 | Discovery reachability only.                                                               |
| `GET /api/v1`, `GET /api/v1/openapi.json`                     | 200; anonymous/read-only index; OpenAPI 3.1.0                                      | Contract advertisement, not every operation executed.                                      |
| `GET /.well-known/oauth-authorization-server/api/auth`        | 200; code/refresh grants, identity scopes, S256, revocation endpoint               | Does not establish delegated customer read/write authorization or actual revocation.       |
| `GET /.well-known/oauth-protected-resource/api/mcp/radiohead` | 200; artist resource and `/api/auth` issuer                                        | Metadata accepts a valid username shape; no artist existence or owner access proof.        |
| `POST /api/mcp`, `tools/list`                                 | 200; `artist.search_or_import`, `workspace.create_draft`, `release.prepare_launch` | Listing only; no draft created and no claim attempted.                                     |
| `POST /api/music/mcp`, `initialize`                           | 200; `jovie-music-identity`, protocol `2025-03-26`                                 | MCP handshake only; no catalog lookup or PAP handshake.                                    |

Cache includes request bodies, response hashes and bounded observations; no tokens,
private content or customer identifiers. No live authenticated mutation, grant,
checkout, revocation or full journey was exercised. Those remain explicit baseline
obligations of JOV-7962 and existing implementation owners. No hosted CI, merged
state, Production Verified marker or deployed version of this assessment is implied.

## Separate admission and public rollout gates

**Implementation admission — JOV-7961, currently not admitted:**

1. Pin a published **official** spec/revision and evidence snapshot. This condition
   is now met for the observed draft; stable 1.0 and a reference client are not
   prerequisites merely to start implementation. Recheck the digest at pickup.
2. Reconcile every applicable requirement with the canonical capability and chosen
   API surface, supported sign-in/transport subset, privacy policy and failure
   semantics. Unknown required fields block only that adapter/capability.
3. Complete security/architecture prerequisites with frontier-model planning and
   independent review through the existing execution policy. Resolve the provider
   extension strategy for assertions/DPoP, resource audience and scope enforcement,
   claim/account binding, revocation/caches, durable replay/idempotency and SSRF-safe
   metadata fetches. Explicitly select company-page direct sign-in. No mediated
   credential flow is authorized by this assessment.
4. Verify prerequisite receipts for the selected slice under JOV-7311/JOV-7312,
   JOV-4076/JOV-6866/JOV-6712. Plan local fixtures and negative cases against the
   pinned requirements. This requires reviewed prerequisites, **not a finished PAP
   integration, independent compatible client or completed journey canary**.

Keep JOV-7961 in Backlog without `agent-ready` while the remaining admission
conditions lack receipts. Closing JOV-7960 alone does not admit it. This assessment
introduces no new approval label or separate human gate.

**Public claims and rollout — additional JOV-7312/JOV-7962 requirements:**

- A representative **independent compatible client**, with actual supported
  revision and version recorded, completes the selected journey. A home-built
  mock or an unverified third-party SDK proves local behavior only. A design
  partner logo or vendor demo does not establish access, compatibility or reach.
- The deployed journey canary covers discover → lookup → allowed draft → human
  claim → delegated read → selected action approval → result/receipt → revoke →
  denial, with scope/tenant/audience/issuer/replay/account-switch negatives and
  retry/handoff duplicate prevention. PAP and baseline lanes report separately;
  missing capability is blocked/failing evidence, never a skipped pass.
- Bind certification to deployed artifact digest, capability revision, auth/policy
  revision, profile/spec digest and client/scenario version. Reuse the existing
  universal kernel plus channel requirements and current publication authority.
  Measure completion/denial correctness, first-draft/outcome time, calls, retries
  and prevented duplicates against baseline; derive rollout thresholds from that
  evidence. Keep synthetic runs separate from activation/revenue telemetry.
- Demonstrate bounded-cohort rollback and continued baseline signup/claim/checkout,
  MCP/API/CLI and revenue certification. No public PAP claim before these receipts.

## Adapter rollback contract

JOV-7961 owns the reversible adapter boundary; no PAP flag currently exists in
this assessment. Before enabling a cohort, use the existing flag/release mechanism
to deny only PAP admission and discovery exposure, with a tested operator path.
Trigger on an authorization/privacy violation, revoked-grant reuse, wrong resource
binding, duplicate side effect, failed canary or unsafe spec drift. Immediately
stop PAP admission, invalidate its channel qualification and disable its metadata
projection; remove any published compatibility claim. Revoke PAP-issued grants or
sessions through the existing auth owner and observe denial, including cached and
pending work; do not revoke unrelated customer applications. Restore the last
qualified adapter/profile tuple only after the original failing scenario passes
on the exact deployed build. Already committed actions retain truthful receipts;
revocation is not compensation. Current transports continue independently.

## Material-event handoff and assessment completion

[JOV-7315](https://linear.app/jovie/issue/JOV-7315) owns publication and revision
intake. The **October 9 official draft publication is a material event now**, not
an external condition still waiting to happen. Reconcile its existing October 6
PAP entry using this profile, preserving the old observation. No second watcher,
cron, event bus, repeated full research sweep or issue-per-article process.

For the draft event, reference-client publication or a later semantic change:

1. Cache official provenance, publication/retrieval dates, revision/digest and
   bounded changed requirements through the existing evidence intake. Use its
   `protocol-or-platform` class and existing semantic deduplication. Do not treat
   this documentation cache as an ingested canonical-event receipt.
2. Update this profile; invalidate affected requirement/certification dimensions
   only. Reconcile JOV-7311/JOV-7312 and the existing JOV-7961 admission checklist.
   Publication alone does not supply the remaining prerequisites.
3. Update JOV-7962's PAP lane/client evidence while retaining its independently
   actionable baseline under JOV-6865. Route product gaps to JOV-4076/JOV-6866/
   JOV-6712; do not create duplicate remediation owners.

JOV-7960's deliverable is this registered assessment plus the Linear handoff. It
can complete after those artifacts are accepted; adapter implementation and public
interoperability remain the existing JOV-7961/JOV-7962 obligations. A future client
or revision event does not hold the assessment open indefinitely.
