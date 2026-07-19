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
postmortem’s 26 indexed incidents are therefore reviewable without relying on
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

- The incident-contract verifier reports all 26 stable IDs, including separate
  runner-image provenance and GBrain token/recovery contracts.
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
