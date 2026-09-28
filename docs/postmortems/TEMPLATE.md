---
id: YYYY-MM-DD-slug
status: draft
severity: sev2
detected: YYYY-MM-DDTHH:MMZ
repaired: YYYY-MM-DDTHH:MMZ
failure_classes: []
incident_issue: none
actions: []
gbrain: ops/postmortems/YYYY-MM-DD-slug
---

# <Incident title>

Author: <agent/session>. Review: Summer. Process: [README](README.md).

## Summary

Two or three sentences: what broke, for how long, and the one-line root cause.

## Impact

| Measure | Value |
| --- | --- |
| Start (first bad event) | |
| Time to detect (first machine or human signal) | |
| Time to own (first incident record with an owner) | |
| Time to repair (user-facing recovery) | |
| What was blocked | |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |

## Root cause

The mechanism, with the PR, commit, or run that proves it.

## Contributing causes

What made it longer, harder to see, or harder to fix.

## Failure classes and invariants violated

One row per class from the [taxonomy](README.md#failure-class-taxonomy).
State the invariant that should have held.

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |

## Why detection failed

Which monitor, gate, or test should have caught it, and why it did not.

## Instance fix

The PRs that restored service. Mark any that did not help.

## Systemic controls

Controls that make the class impossible or loud on **every similar surface**,
not only the one that failed: instrumentation, guardrail, invariant test,
canary.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |

## Open questions and unverified claims

Mark anything that was not confirmed from source as `unverified`.
