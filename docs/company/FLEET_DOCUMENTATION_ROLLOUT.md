# Fleet documentation rollout — 2026-09-24

Tracking: JOV-6607; shared CI distribution/update automation: JOV-6555.
Owner: company engineering / Tim White; existing repo and runtime owners remain.

## Source boundary

Jovie owns the portable repository source contract; JovieInc/ci owns the small
MIT-licensed offline projection tool. Repos vendor explicit revision/hash pins,
retain their own README/AGENTS, and render their own manifests/workflows. No
company-wide Node/Python/Xcode version or build dependency is imposed. Existing
local freshness and release checks remain. New conformance is shadow only.

## Repo-specific scope and handoffs

| Repo | Prepared scope / next action | Owner or boundary |
|---|---|---|
| Jovie | Canonical portable policy, local source map and shadow parity | Company canon; existing doc-freshness retained |
| ci | Canonical tested tooling; remove claims that absent gate workflows exist | JOV-6555; existing PRs #3/#5 retain their implementation scope |
| summer-config | Replace obsolete root Hermes install/runtime guidance; source-derived Eve dependencies and commands; historical contracts explicitly retired | Summer source review; deployment and commissioning controller untouched |
| LogYourBody | Add local source map and pinned policy; keep native/web toolchains independent | LYB delivery owner; no existing release workflow edits |
| symphony-ops | Conformance on current source, independent of pending upstream extraction | JOV-6489 owner; PRs #1/#2 keep upstream/runtime scope |
| Ops | Preserve local writing/content canon; add repository source parity only | Ops source owner; no content publication |
| BubblegumFactory | Preserve creative canon; add source instructions and conformance | Creative source owner; no asset generation or publication |
| retouching | Preserve Python pipeline; add source instructions and conformance | Pipeline source owner; no image processing |
| zoe-config | Add repository-level entry points, keep workspace/runtime files untouched | Worker config owner; no activation or host change |
| ovie | Adoption packet below; do not race replacement README/runtime extraction | JOV-6026, active PR #15 |
| symphony | Keep public upstream fork unchanged; use private integration conformance | Explicit `symphony-ops/docs/BOUNDARY.md`, JOV-6489 |
| gbrain | No application manifests; main contains only `.gitignore` | Knowledge-source owner/Tim; live pages are not this Git placeholder |
| ios-certificates | Metadata-only policy pointer on next authorized signing-maintenance PR | Tim/release signing owner; signing assets excluded from code rollout |

All exclusions and outstanding qualification remain tracked in JOV-6607; none
is silently counted as conformant. No source change implies live commissioning.

## Reviewable adoption packets

**Ovie:** after PR #15 establishes the app root, add `repository-docs.json` listing
that app's actual manifest and workflow paths plus README/AGENTS. Vendor the same
reviewed CI script/tests/license and company contract with exact revisions and
hashes. Add the nonblocking shadow workflow and run the seven parity scenarios
with full statement/branch coverage. Preserve the extraction's own commands and
runtime proof. Do not derive the app root from the archived Swift README.

**Public Symphony:** no fork mutation. Private `symphony-ops` owns the projection;
when its upstream-pin PR lands, register the real lock and verification workflow
paths there. Preserve the upstream submodule and independent release canary.

**GBrain:** current main has no application source to project. Confirm the source
repository with the knowledge-source owner before proposing a code check. Never
export live knowledge pages, private memory or connection material for parity.

**Signing assets:** proposed file is a short README pointer to the immutable
company source contract with this repo's signing-only purpose and accountable
owner. Review alongside authorized signing maintenance. Do not copy application
scripts, run untrusted PR code with signing access, or rewrite assets.

## Acceptance and rollback

Local source parity and fixture rollback are preparation evidence. Hosted shadow
results, independent source review, native queue/merge, actual consumer canary and
rollback each need distinct receipts. Consumer imports currently reference draft
source commits; qualify those sources before consumer promotion. Upstream merges
may squash commits; retain reviewed source provenance or repin in a new consumer
commit, then recheck. No dependency on unrelated sibling test suites is added.

Keep checks nonblocking until the owner records representative actual ships,
correctness/pass rate, p95 duration, throughput/cost and failure isolation with
explicit workload thresholds. Revert an individual consumer commit to roll back.
JOV-6555 owns later updater integration; no second bot or recurring controller.
