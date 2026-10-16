---
id: 2026-10-16-production-lineage-rest-quota
status: draft
severity: sev3
detected: 2026-10-16T12:35Z
repaired: unverified
failure_classes: [pre-merge-parity-gap, serial-layer-discovery]
detectable_before_human: true
detection_gaps: [missing-invariant]
replay_corpus: [scripts/lib/__tests__/recheck-main-lineage-auth.test.mjs]
founder_rescues: 0
incident_issue: JOV-7974
actions: [JOV-7974]
gbrain: ops/postmortems/2026-10-16-production-lineage-rest-quota
---

# Production lineage checks failed on the shared REST quota

Author: Codex, JOV-7974. Review: Summer. Process: [README](README.md).

## Summary

The production mutation check failed when the GitHub installation quota reset
exceeded its 240-second REST wait budget. The authenticated Git lineage fallback
already used at staging alias time was absent from this boundary and the later
promotion checks. Recovery on main and in production remains unverified.

## Impact

| Measure | Value |
| --- | --- |
| Observed failure | 2026-10-16 12:35:03 UTC, before production mutation |
| Time to detect | Approximately two minutes until Summer's 12:36:40 recurrence comment |
| Time to own | In Progress receipt at 12:43:29 UTC |
| Time to repair | Unverified; this PR prepares the source repair |
| What was blocked | Promotion of generation `9ad96f55e39c5214fe51e3f7d7e3402bcb110d35`; customer outage or sustained production staleness is unverified |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| 2026-10-12 | Earlier Vercel queue-delay repair merged; it remains present. | [PR #21361](https://github.com/JovieInc/Jovie/pull/21361) |
| 2026-10-16 11:25 | Remaining release REST reads gained bounded holds; short-job reset exhaustion intentionally still failed closed. | [PR #22065](https://github.com/JovieInc/Jovie/pull/22065) |
| 12:35:03 | Mutation check received installation HTTP 403; reset epoch `1792155772` exceeded its 240-second budget. | [Job 116974151564](https://github.com/JovieInc/Jovie/actions/runs/38900962257/job/116974151564) |
| During repair | Actual workflow scripts failed eight regression cases before the change; the repaired scripts proved ancestry over authenticated HTTPS. | `recheck-main-lineage-auth.test.mjs` |

## Root cause

`production-release.yml` still called `commits/main` and `compare` through
`gh-api-hold.sh` at its head, mutation and promotion boundaries. That wrapper can
wait for a nearby reset, but cannot prove lineage when the reset exceeds the
job's budget. `recheck-main-lineage.sh` already provided authenticated Git proof
after a failed REST read; only the staging alias boundary invoked it. Neither
prior fix reverted: the new recurrence exposed different release boundaries.

## Contributing causes

The final promotion script duplicated the same REST checks, and the release
result performed another REST tip read after successful promotion. Repairing
only the reported step would leave those later boundaries vulnerable. A failed
REST compare inside a shell conditional also appeared as supersession rather
than requiring an independent lineage proof.

## Failure classes and invariants violated

| Class | Invariant that should hold | Similar surfaces covered here |
| --- | --- | --- |
| pre-merge-parity-gap | Execute the actual workflow boundary under installation exhaustion, including authenticated ancestry fetch. | Release, staging and production head checks; mutation and promotion checks |
| serial-layer-discovery | Trace all later reads needed to finish the same release before declaring repair. | Final promotion script and release-result tip read |

## Why detection failed

Existing tests covered the staging alias fallback and bounded REST retry, but
did not replay exhaustion through the production workflow wiring. The added
regression executes the checked-in steps with the real GitHub CLI and an
authenticated Git HTTPS fixture. Sparse jobs receive only their declared files.

## Instance fix

JOV-7974 routes the remaining lineage checks and final promotion through the
existing fallback, preserves the superseding SHA, and uses the existing Git
main resolver for the final release receipt. Unknown Git ancestry still fails;
proven rewrites yield without mutation.

## Systemic controls

One shared lineage implementation now covers all ancestry decisions in this
reusable release workflow. Tests exercise a reset beyond budget, compare-only
exhaustion, proven divergence, denied authenticated fetch, final mutation and
release-result preservation. Job timeouts and existing REST budgets stay fixed.

**Ship now:** use the existing authenticated proof at these boundaries.
**Re-evaluate when:** a controller containing this repair repeats the failure.
**Then:** inspect the exact executing source and failed transport before changing budgets.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| JOV-7974 | Shared lineage fallback and workflow exhaustion regression | pre-merge-parity-gap | Source repair; independent landing pending | Local regression only; main/deployment outcome unverified |

## Open questions and unverified claims

Production recovery, outage duration and the final deployed generation remain
unverified until the independent gate lands the PR and a fresh controller proves
the result. No founder rescue was needed during this repair. GBrain was
unreachable (`gbrain-unavailable`); this repository record is canonical.
