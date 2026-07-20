# CI/release drain — incident prevention and inheritance postmortem

- **Source task:** `019f75f7-81b7-7da0-bf0c-84a4c9bd7daa`
- **Date:** 2026-07-19
- **Bottleneck:** CI/release throughput and trustworthy production evidence.
- **Evidence:** the drain exposed coupled trigger duplication, queue-head
  mutation, finite-runner starvation, unauthenticated probe false positives,
  stale production evidence, and coordination/logging safety gaps.
- **Success metric:** every known failure mode blocks regression through the
  checked incident contract and is inherited by a freshly scaffolded project.
- **Status:** prevention contract; active repair branches remain upstream
  inputs and are not overwritten here.

## Incident record and enforcement

The complete failure-mode matrix is the [CI/release incident index](../ci/CI_RELEASE_INCIDENTS.md).
Its source of truth is
[`/.github/ci-harness/ci-release-incidents.json`](../../.github/ci-harness/ci-release-incidents.json),
validated by:

```bash
node scripts/ci-release-incident-contract.mjs
```

The command is fail-closed. For each `ci-release/*` entry it requires a
deterministic regression/verifier, CI-stage owner, operator documentation,
canonical `JovieInc/ci` propagation, and a clean-scaffold assertion. The
postmortem’s 39 indexed incidents are therefore reviewable without relying on
the absence of a visible outage.

## What happened

The drain was not one failed job. It was a system failure in which lifecycle
boundaries were treated as interchangeable: source PR work was asked for
merge-queue proof, labels could awaken legacy automation after native queue
enrollment, stale runs held finite capacity, and production probes accepted
access-control responses as deployment evidence. At the same time, image and
secret-distribution assumptions were not independently attested, controllers
could retry themselves, and coordination/logging paths lacked hard bounds.

This means a green status, an HTTP 200, a runner heartbeat, a successful upload,
or a generic “pool saturated” response is insufficient evidence by itself. The
prevention system requires the exact head, merge parents and tree, workflow
provenance, capability, endpoint/origin, task objective, and lifecycle owner
appropriate to the CI stage.

## Confirmed source-task additions

- `ci-release/gbrain-admin-secret-log-redaction`: generated admin tokens have
  zero persistent-log exposure. The deterministic no-secret/redaction fixture
  is required before closure; the rotation runbook records only redacted
  receipts and never copies a token.
- `ci-release/gbrain-pool-recovery`: a saturated pool, wedged local session,
  DNS failure, and unreachable upstream are distinct states. The safe recovery
  path is bounded and tested; repeated service restart is not a remedy.
- `ci-release/coordination-query-bounds`: ownership/current-priority queries
  have deadlines and concurrency limits. Exhaustion returns the required
  fail-closed system-blocker message rather than continuing sequentially.
- `ci-release/agent-task-identity-context-drift`: the final receipt asserts the
  original task identity and objective, so context drift cannot be reported as
  successful completion.
- `ci-release/secret-scan-synthetic-merge-base`: merge-group Secret Scan proves
  parent 1 as effective base, parent 2 as exact source, recomputed merge-tree
  equality, and no live-base TOCTOU assumption. The source is not required to
  contain the mutable live base.

## Trigger, required-context, and supply-chain policy

The source PR and `merge_group` are distinct contracts. A required context must
run on every applicable source PR, or be produced by one stable aggregate that
always reports the required context; it must never disappear through a path
filter. The exact combined-head evidence is owned by `merge_group`, and source
PR policy must not demand that evidence early. Trigger admission prevents a
single event from recursively creating source, merge-group, and main retries.

Native queue mode has no legacy label state: `merge-queue` is never added,
interpreted, or retained. Graphite is a separate explicit backend, never an
implicit label-driven side effect, and may not rewrite a native-enrolled exact
head.

`@v1` is a moving major-version channel, not an immutable binding. Third-party
GitHub Actions are SHA-pinned. The centralized `JovieInc/ci` template advances
through a controlled updater and reviewed template-version mapping, with the
fresh-scaffold fixture checking the resolved manifest fields. A passing
verifier must exercise the real trigger/context or provenance condition—not
only assert that a workflow, action, or marker has a name.

## Containment and upstream boundary

This documentation does **not** replace, duplicate, or mutate the active
repairs for #14495, production probes, warm runners, the native queue, or Neon
#14484 / CI plan v2. Those branches are upstream inputs: once landed, their
behavior is represented by the stable ledger invariant and verifier. Until
then, an entry remains a required contract rather than permission to claim the
underlying repair is complete.

## Evidence timeline

| Time (UTC) | Evidence | Interpretation | Boundary |
| --- | --- | --- | --- |
| 2026-07-18 | Active-drain topology evidence recorded source-PR latency of 20–55 minutes and source fanout into build, preview, Neon, E2E, Lighthouse, a11y, Storybook, and layout. | Source admission carried integration and production-depth work. | Phase A topology input; not a production-success receipt. |
| 2026-07-18 | Repair sequence assigned exact merge-group provenance, deterministic source PR policy, post-merge/prod evidence, artifact publication, runner routing, and bounded monitors in that order. | This establishes the canonical Phase A/B topology below. | Planning evidence only until exact heads pass their own checks. |
| 2026-07-19 | #14495 at `72f0d8657ef923742828bbd890c92ab69a3be4c7` remained open and blocked. | Async Update Branch is an upstream boundary, not a closed action. | No completion claim from this postmortem. |
| 2026-07-19 | Draft #14496 documentation/index head was `ca057e2f4e39d5eb7570f531519b46f5615a4a0f`. | Operator/index evidence is reviewable but does not enforce CI alone. | Parent of the contract stack. |
| 2026-07-19 | Draft #14497 at `f59068c1345b4565b316e0b401b1cf76d8bc0f36` used #14496 as its base. | #14497 is a strict child stack, not duplicate documentation. | Verify/land #14496 before #14497; do not independently retarget it. |
| 2026-07-19 | PR-files indexing expected exact current-main `cf57…`, while stale PR REST/Actions reported `85f…`; the stale count was 32,993/232 versus actual 17/~829 after exclusions. | Files-derived admission/metrics were reading a stale head/base view and overstating scope. | Bind REST/GraphQL head/base first; mismatch is bounded `index_pending` observation only, never bypass/rerun/mutate. |
| Pending | Warm-runner and production-probe repair owners/exact heads are unconfirmed. | Their proof cannot be inferred from a generic heartbeat, HTTP 200, or this contract. | Unresolved upstream boundary until named owner publishes exact-head receipts. |

## Impact and detection

**Impact.** The drain consumed finite runner capacity with duplicate and superseded work, increased source-PR required-green latency, and could confuse protected/login responses or stale markers with production evidence. Controller, coordination, and logging failures could compound without owner-specific stops.

**Detection.** Exact-run and queue-state inspection exposed cancelled/retried work, diverging source/merge-group/main paths, uncertain runner routing, and probe responses that did not prove the intended public artifact. The contract makes these deterministic regressions; it does not retroactively make an unrelated run healthy.

The same discipline applies to PR-files indexing: the expected current-main was
`cf57…`, but stale PR REST/Actions state reported `85f…`, producing a false
32,993/232 view instead of actual 17/~829 after exclusions. Before consuming a
files endpoint, bind its REST/GraphQL head and base to the requested pair. A
mismatch becomes bounded `index_pending` observation; it must never bypass a
gate, rerun work, or mutate queue/deploy/controller state.

Pre-push scope selection follows the same fail-closed provenance rule. A new
branch may use affected scope only after it resolves the push destination and
upstream default and proves exact-main sole-parent/merge-base ancestry.
Divergent, unknown, or force-push targets run full verification. This invariant
does not change the current hook.

Toolchain selection is equally fail-closed: Node 26 is rejected before tests;
Node 22.23.1 and pnpm 9.15.4 must propagate into nested execution, and the
receipt records resolved versions. This invariant changes neither the current
hook nor push behavior.

## Production-control additions

Production evidence is valid only when its transport, deployment identity,
environment, browser route handling, artifact intake, and content assertions
are each independently safe. The ten incidents below prohibit secret-bearing
curl argv, first-page deployment selection, all-skip auth smoke success, 200
not-found/empty public routes, staging or preview substitution, unsafe
Lighthouse evidence files, third-party cookie forwarding, unawaited Playwright
routes, and timeouts extended indefinitely by progress. Each remains
fail-closed and is inherited through the canonical fresh-scaffold contract.

## Root causes and contributing causes

### Root causes

1. Lifecycle boundaries were not enforced as a system: source admission, exact merge-group integration, and main/post-deploy evidence could demand or reuse each other’s proof.
2. Provenance/capability was inferred from convenient signals—labels, moving refs, status codes, uploads, and generic heartbeats—rather than exact head, immutable binding, scope, and content assertions.
3. Prevention was not inherited as one executable contract through the canonical template and a clean scaffold.

### Contributing causes

- Legacy label-driven Graphite behavior coexisted with native queue enrollment.
- Retry/cancellation and matrix scheduling retained capacity after work was superseded.
- Image, secret-sync, and probe prerequisites lacked one fail-closed attestation.
- Controllers and coordination did not consistently bound retries, deadlines, concurrency, and terminal ownership.
- Concurrent repairs made an open upstream branch easy to mistake for landed prevention.

## Canonical Phase A/B topology

**Phase A — admission and exact integration.** Source `pull_request` runs deterministic required admission contexts on every applicable PR (or one stable aggregate). `merge_group` owns exact combined-head unit/build/layout evidence. Native mode never reads or writes `merge-queue`; Graphite is selected only through an explicit backend.

**Phase B — main release and post-deploy proof.** Main promotion requires exact current-main/workflow provenance, then one serialized production-mutation owner deploys and probes immutable public output. Sentry read scope, Doppler freshness, redirect/content assertions, Lighthouse matches, and marker freshness are separate gates. Heavy/nondeterministic work stays post-merge, scheduled, or explicitly dispatched.

**Cross-cutting control plane.** Runner capacity/image provenance, controller termination, GBrain recovery/coordination, agent identity, and secret-log redaction apply to both phases but cannot replace a Phase A or B receipt.

## Action register

“Contract stack” means #14497 supplies ledger/verifier wiring after #14496; it does not mean a named upstream repair landed. Every row closes only when its acceptance evidence passes on its owner’s exact head and the canonical scaffold check succeeds.

| ID | Phase / owner | Status | Acceptance evidence | Dependency / boundary |
| --- | --- | --- | --- | --- |
| `ci-release/source-pr-queue-evidence` | A / CI control plane | Contract stack | Source regression and stable required context. | #14497 after #14496. |
| `ci-release/duplicate-ci-retry-loop` | A / trigger admission | Contract stack | One authoritative event/ref route. | #14497 after #14496. |
| `ci-release/legacy-merge-queue-label` | A / queue enrollment | Contract stack | Native label absent; Graphite explicit. | Native queue owner. |
| `ci-release/async-update-branch-bounds` | A / PR mutation | Upstream open | Exact head, structured result, bounded subprocess. | #14495 open/blocked at `72f0d865…`. |
| `ci-release/pr-files-index-head-base-staleness` | A / PR files/index admission | Upstream dedicated repair | Merged immutable SHA and behavioral receipt prove REST/GraphQL head/base bind before files; mismatch is bounded `index_pending` only. | Dedicated exact-main coder; required before Phase-B release; this docs lane implements no runtime repair. |
| `ci-release/prepush-exact-main-scope-selection` | A / pre-push scope selection | Contract dependency | Exact-main branch resolves destination/upstream default and proves sole parent/merge-base before affected scope; divergent, unknown, or force targets run full verification. | Current hook untouched; canonical pre-push owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/prepush-toolchain-runtime-contract` | A / pre-push toolchain | Contract dependency | Node 26 rejects before tests; Node 22.23.1/pnpm 9.15.4 propagate nested and receipt records versions. | Current hook/push behavior untouched; toolchain owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/superseded-run-capacity` | A / capacity | Contract stack | Superseded work releases capacity. | Capacity owner. |
| `ci-release/runner-heartbeat-routing` | A / runner routing | Upstream unresolved | Fresh heartbeat or hosted fallback. | Warm-runner owner/head unresolved. |
| `ci-release/runner-image-prerequisites` | A / runner image | Upstream unresolved | Marker, service PATH, Playwright attested. | Warm-runner owner/head unresolved. |
| `ci-release/runner-image-source-sha-provenance` | A / image provenance | Upstream unresolved | Source SHA equals approved source. | Warm-runner owner/head unresolved. |
| `ci-release/cache-artifact-fanout` | A / artifact cache | Contract stack | Fanout/upload budget enforced. | Artifact owner. |
| `ci-release/runner-emergency-headroom` | A / scheduler | Contract stack | Matrix leaves emergency reservation. | Capacity owner. |
| `ci-release/sentry-read-gate-scopes` | B / error gate | Contract stack | Read scope distinct from upload. | Production-probe owner/head unresolved. |
| `ci-release/doppler-sync-freshness` | B / secret distribution | Contract stack | Current attributed freshness/capability. | Secret distribution owner. |
| `ci-release/vercel-immutable-probe` | B / public probe | Upstream unresolved | Immutable public artifact, not SSO. | Production-probe owner/head unresolved. |
| `ci-release/seo-redirect-auth-html` | B / SEO | Upstream unresolved | Reject cross-origin/login HTML. | Production-probe owner/head unresolved. |
| `ci-release/lighthouse-assertion-matches` | B / Lighthouse | Upstream unresolved | Immutable target and non-zero assertions. | Production-probe owner/head unresolved. |
| `ci-release/bypass-secret-containment` | B / probe security | Contract stack | All five egress surfaces secret-free. | Production-probe owner/head unresolved. |
| `ci-release/bypass-secret-curl-argv` | B / production probe security | Contract dependency | Guardrail rejects secret-bearing curl argv before probe; regression proves redacted transport. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/ready-deployment-pagination-exact-identity` | B / deployment readiness | Contract dependency | Bounded pagination finds exact immutable deployment identity or fails closed. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/configured-auth-smoke-all-skip` | B / authenticated smoke | Contract dependency | Configured suite fails when all routes skip; configured route executes or reports unavailable. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/tim-route-not-found-200` | B / Tim route probe | Contract dependency | Route identity/body assertion rejects not-found surface despite 200. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/public-route-2xx-empty-body` | B / public probe | Contract dependency | Status, content type, and non-empty body assertion all pass. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/staging-preview-environment-bypass` | B / production admission | Contract dependency | Expected production environment identity is bound; staging/preview substitution fails. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/lighthouse-evidence-symlink-fifo-manifest` | B / Lighthouse evidence | Contract dependency | Manifest permits only declared regular files; symlink/FIFO mismatch fails. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/bypass-cookie-third-party-mask` | B / probe security | Contract dependency | Cookie stays first-party and is masked in all receipts. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/playwright-route-promise-await` | B / browser probe | Contract dependency | Delayed/rejected route promise is awaited and fails deterministically. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/fetch-absolute-timeout` | B / probe transport | Contract dependency | Absolute deadline defeats redirect/stream progress extension. | Production-control owner must provide merged immutable SHA and behavioral receipt. |
| `ci-release/production-workflow-provenance` | B / production admission | Contract stack | Authorized run matches workflow SHA. | Production mutation owner. |
| `ci-release/production-evidence-freshness` | B / production verification | Contract stack | Main, provenance, deploy markers current. | Production mutation owner. |
| `ci-release/controller-loop-bounds` | Cross / remediation | Contract stack | Idempotency, cap, terminal stop. | Controller owner. |
| `ci-release/gbrain-readiness-diagnosis` | Cross / readiness | Contract stack | Ready, registration, lock, DB/DNS diagnosis. | GBrain owner. |
| `ci-release/gbrain-pool-recovery` | Cross / recovery | Contract stack | Bounded local-pool/upstream recovery. | GBrain owner; no restart claim. |
| `ci-release/coordination-query-bounds` | Cross / coordination | Contract stack | Deadline/concurrency fails closed. | Coordination owner. |
| `ci-release/admin-secret-log-redaction` | Cross / logging | Contract stack | Persistent-log fixture rejects credentials. | Service logging owner. |
| `ci-release/gbrain-admin-secret-log-redaction` | Cross / GBrain admin | Contract stack | No-secret fixture and token-free rotation receipt. | GBrain admin; no token exposure. |
| `ci-release/agent-task-identity-context-drift` | Cross / delivery | Contract stack | Final receipt matches assigned identity/objective. | Agent delivery owner. |
| `ci-release/secret-scan-synthetic-merge-base` | A / secret scan | Contract stack | Parents, merge tree, TOCTOU regression. | Merge-group owner. |

## Operator response model

1. Identify the affected `ci-release/*` id in the incident index.
2. Run its ledger regression and inspect its CI-stage owner before acting.
3. For queue/release state, prove the exact head and authoritative GitHub state;
   labels, cancelled runs, and historical workflow files are not authority.
4. For probe/secret state, preserve only redacted receipts; reject redirect,
   login HTML, missing scope, stale sync, or unverifiable provenance.
5. For controllers and GBrain, distinguish reachable upstream from local pool
   health, stop at the bounded retry/query limit, and emit the fail-closed
   system-blocker message rather than recursively remediating.
6. If a new failure is found, add its ledger entry, regression, owner, this
   index/postmortem link, canonical bootstrap propagation, and scaffold proof
   in one change. `node scripts/ci-release-incident-contract.mjs` must pass.

## Permanent inheritance decision

**Ship now:** use the existing `JovieInc/ci` shared reusable-workflow and
bootstrap system, specifically `templates/jovie-ci-release-prevention/`; there
is no organization `.github` template repository to copy into. Its manifest requires `template`,
`template_version`, `ledger`, `verifier`, and `scaffold_proof`; the canonical
fixture is `node scripts/test-jovie-ci-template-scaffold.mjs`. This is the only
approved propagation path for the prevention contract. Advance central template
versions through the controlled updater/version map; pin third-party actions by
SHA and never characterize `@v1` as immutable provenance.

**Re-evaluate when:** a new CI-stage failure is discovered, a shared workflow
major version changes, or the scaffold assertion detects drift.

**Then:** extend the existing machine ledger and `JovieInc/ci` bootstrap first,
then update this indexed postmortem. Do not create repo-local parallel policy.

## Verification receipts required for closure

- The incident-contract verifier reports all 39 stable IDs, including runner-
  image provenance, GBrain token/recovery, pre-push contracts, and distinct
  production-control transport, deployment, environment, evidence, browser,
  cookie, content, and timeout contracts.
- Each listed regression/verifier succeeds in its owning CI stage.
- The shared `JovieInc/ci` template/bootstrap change is reviewed with its
  consumer caller evidence.
- A newly generated temporary project contains the inherited contract and
  passes its clean-scaffold check.
- Active repair heads are cited as upstream evidence only after their own
  required CI is green; no old run or stale marker can substitute for it.
- The synthetic merge Secret Scan proves parent ordering and merge-tree equality
  against the queued commit, not the mutable live base; the final agent receipt
  proves it completed its assigned objective without context drift.
