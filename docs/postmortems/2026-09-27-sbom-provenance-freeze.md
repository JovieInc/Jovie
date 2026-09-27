---
id: 2026-09-27-sbom-provenance-freeze
status: draft
severity: sev2
detected: 2026-09-27T03:23Z
repaired: 2026-09-27T05:14Z
failure_classes: [pre-merge-parity-gap, silent-production-staleness, green-by-implication]
incident_issue: JOV-6726
actions: [JOV-6729, JOV-6684, JOV-6686, JOV-6687]
gbrain: ops/postmortems/2026-09-27-sbom-provenance-freeze
---

# Production freeze: SBOM step failed every promotion after #18879

Author: release-engineer session (Claude Code), 2026-09-27. Review: Summer.
Process: [README](README.md). This is the second production freeze in 24 hours,
after the [2026-09-26 production freeze](2026-09-26-production-freeze.md).

## Summary

From 03:37Z on 2026-09-27, every Production Controller run failed in **Promote
to Production › Build and stage production deployment**, which left jov.ie on
`ee7401f` while `main` moved on. Production recovered at 05:14Z on
`62c920d0`, about 1 h 37 min after the first failure. #18879 (JOV-6054) had added
`pnpm licenses list --prod --json` to build the production SBOM. That command
reads package index files from the pnpm store. The promote job restores
`node_modules` from the exact cache, and that restore path never populates the
store. As a result pnpm failed with `ERR_PNPM_MISSING_PACKAGE_INDEX_FILE`, and
the release gate reported "evidence incomplete". The fix (#18926) installs
from the lockfile into a warm store in that job.

## Impact

| Measure | Value |
| --- | --- |
| Start (first bad event) | 2026-09-27 03:00Z. #18879 merged (`8838321b`); the first run to reach the step failed at 03:37:52Z |
| Time to detect (first machine or human signal) | About 23 min. At 03:23Z a controller run failed with "Skip-promote / superseded generation cannot succeed while live jov.ie commitSha ee7401f…", a loud machine signal. The first failure naming the SBOM came at 03:37Z. |
| Time to own (first incident record with an owner) | About 63 min. JOV-6726 was created at 04:03Z and moved to In Progress at about 04:25Z. |
| Time to repair (user-facing recovery) | About 1 h 37 min from the first SBOM failure (03:37Z → 05:14Z). The fix took about 28 min from merge to promote. |
| What was blocked | Every merge after `ee7401f`, including the admin passkey unlock (#18574, `7afc11a4`) |

## Timeline (UTC, 2026-09-27)

| Time | Event | Evidence |
| --- | --- | --- |
| ~02:40 | Production is serving `ee7401f`; later commits never reach it. | JOV-6726 |
| 02:45–03:15 | Controller runs for `75367211`…`ace50538` conclude `success`, but coalesced into a running wave with every release job `skipped`. | runs 36289436301…36290886072 |
| 03:00 | #18879 merges as `8838321b`: `production-input-provenance.mjs sbom` now runs `pnpm licenses list`. | PR #18879 |
| 03:23 | Run 36290977402 fails its final verification because production is still `ee7401f` (the staleness guard from the previous post-mortem works). | run log |
| 03:37:52 | Run 36291199560 fails in Promote to Production with `ERR_PNPM_MISSING_PACKAGE_INDEX_FILE` for `next@16.3.6`. Every later run fails the same way. | run log |
| 03:55 | Run 36291960232 (`708a7071`) fails the same way. Release result: "Production gate evidence was incomplete or errored". | run log |
| 04:03 | JOV-6726 opened (Urgent). | Linear |
| ~04:25 | Owner assigned. The failure reproduced locally with the real tree and an empty store, byte-identical to the CI error. | this session |
| 04:33 | Fix PR #18926 opened. | PR #18926 |
| 04:41 | #18926 enqueued in the native merge queue (position 1 of 1; no bypass). | `mergeQueueEntry` |
| 04:46 | #18926 merges as `62c920d0`. | PR #18926 |
| 05:03–05:04 | Controller run 36295304352: `setup-node-pnpm` runs `pnpm fetch` plus install in 51 s. | job log |
| 05:11 | Build and stage succeeds. The SBOM has 1736 components, and the `production-input-provenance-62c920d…-1` artifact is preserved. | run artifact |
| 05:14 | Promote to Production succeeds. Production Verified, both smokes, and LHCI are green. jov.ie serves `62c920d0`, which includes #18574 (`7afc11a4`). | run 36295304352, `build-info` |

## Root cause

`pnpm licenses list` (pnpm 9.15.9) resolves every package's metadata through
its **store index file**, not through the installed `node_modules`. The
`setup-node-pnpm` action on GitHub-hosted runners restores an exact
`pnpm-node-modules-v3-*` cache. On a hit it skips both the setup-node store
cache and `pnpm fetch`, by design, because tests only need `node_modules`.
`pnpm install --frozen-lockfile` then sees an up-to-date tree and writes no
store. The promote job used that default. So the SBOM command ran against a
complete `node_modules` and an empty store, and failed on the first package.

To reproduce: from any installed checkout, run
`npm_config_store_dir=$(mktemp -d) pnpm licenses list --prod --json`.

## Contributing causes

- **The command's error was invisible in the step summary.** With `--json`,
  pnpm prints its error as JSON on **stdout** and leaves stderr empty. Node's
  `execFileSync` error showed only `Command failed … exit 1` plus a buffer dump.
  The step also exited under `set -e` without a `failure_subtype`, so
  deploy-notify could not classify it.
- **The tests covered the pure function, not the command.** #18879 tested
  `buildSbom` on a hand-written report. `generateSbom` (the `execFileSync`
  call) and the job's install shape had zero coverage.
- **Release-pipeline changes have no pre-merge exercise.** No source-PR or
  merge-queue check runs any part of `promote-production`. The first execution
  of a release-job change is a production release.
- **Coalesced no-op runs rendered green.** Between 02:45 and 03:15, eight
  controller runs concluded `success` with every release job skipped. That
  hid the fact that `ee7401f` was already the served commit while `main` moved
  on.

## Failure classes and invariants violated

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |
| `pre-merge-parity-gap` | A change to a release job is executed in that job's install and runner shape before it can merge. | Every `production-release.yml` / `production-controller.yml` step, `.github/scripts/production-*.mjs`, `setup-node-pnpm` cache semantics, runner-image restore (`restore-installed-tree.sh` also ships no store). |
| `silent-production-staleness` | Production lagging `main` opens an incident on its own. | Second occurrence. Freshness alert JOV-6684 is still Backlog; detection again depended on an agent reading controller failures. |
| `green-by-implication` | A controller run that deploys nothing does not render `success`. | Coalesced waves in `production-controller.yml`. Covered by the convergence and simulation work in JOV-6687. |

## Why detection failed

It mostly didn't. The controller's final verification failed within 23 minutes
because production was stale, which the previous post-mortem asked for. What
failed was **prevention**: nothing ran the new command before merge. Ownership
took about an hour because no monitor opens an `incident` issue (JOV-6684).

## Instance fix

- #18926 (Refs JOV-6726), merged as `62c920d0` and live in production at 05:14Z:
  - `promote-production` calls `setup-node-pnpm` with `package_cache: 'false'`,
    so it runs `pnpm fetch --frozen-lockfile` and `pnpm install
    --frozen-lockfile` into a warm store. The SBOM now describes a lockfile
    install at the release SHA.
  - `generateSbom` parses pnpm's JSON error and names the missing store index,
    why it happens, and the remedy.
  - An SBOM failure now routes through `fail_stage … production_artifact_failed`.
  - The gate remains a hard fail. It was not reverted to advisory.
- New tests:
  - A workflow contract test fails if the promote job goes back to the cached
    tree.
  - A real-pnpm test runs against the real installed tree with an empty store
    (the exact CI failure shape) and asserts the actionable error.
  - Stubbed success and generic-failure tests cover the rest of `generateSbom`.

## Systemic controls

1. **Pre-merge release-shape lane** (JOV-6729). Class-level hardening for
   `pre-merge-parity-gap`, now seen twice. It adds a path-selected
   merge-queue lane for release workflows, provenance scripts,
   `setup-node-pnpm` and runner-image restore. The lane runs the non-mutating
   prefix of `promote-production` and `deploy-staging` in the same install
   shape. It also adds an invariant: every external command a release step
   runs has a test that executes it in that shape. It complements JOV-6686,
   which covers Vercel packaging inputs.
2. **Freshness alert opens the incident** (JOV-6684, existing). This is the
   second freeze where a human or agent opened the incident.
3. **Controller convergence** (JOV-6687, existing). Stops coalesced no-op
   waves from reading as green while production is stale.
4. **Store-dependent tooling note.** Any future job step that reads the pnpm
   store (`pnpm licenses`, `pnpm audit --fix`, `pnpm store` and similar) must
   set `package_cache: 'false'` or warm the store. The error message added in
   #18926 states this at the failure site.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| [JOV-6729](https://linear.app/jovie/issue/JOV-6729) | Pre-merge release-shape lane and external-command invariant | `pre-merge-parity-gap` | Backlog | pending |
| [JOV-6684](https://linear.app/jovie/issue/JOV-6684) | Production freshness alert opens `incident` | `silent-production-staleness` | Backlog | pending |
| [JOV-6686](https://linear.app/jovie/issue/JOV-6686) | Packaging validator in the merge queue | `pre-merge-parity-gap` | Backlog | pending |
| [JOV-6687](https://linear.app/jovie/issue/JOV-6687) | Controller convergence invariant | `green-by-implication` | Backlog | pending |

## Open questions and unverified claims

- Measured: the cold `pnpm fetch` plus install in `promote-production` took
  51 s on run 36295304352. That is well under the Re-evaluate threshold
  (about 3 min) recorded in #18926.
- `unverified`: why the controller run for `ee7401f` (36288825351) concluded
  `failure` in Production Verified even though production serves `ee7401f`.
- `unverified`: `build-info` `deployedAt` changed from 04:33Z to 05:20Z for
  the same build. It seems to reflect alias or rollback activity rather than
  the build time, so this timeline does not use it.
