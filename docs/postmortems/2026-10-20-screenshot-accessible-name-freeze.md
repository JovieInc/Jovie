---
id: 2026-10-20-screenshot-accessible-name-freeze
status: draft
severity: sev2
detected: 2026-10-20T00:16Z
repaired: unverified
failure_classes: [pre-merge-parity-gap]
detectable_before_human: true
detection_gaps: [missing-invariant]
replay_corpus: [apps/web/app/(marketing)/blog/components/BlogCard.test.tsx, apps/web/tests/unit/app/voice-landing-page.test.tsx]
founder_rescues: 0
incident_issue: JOV-7674
actions: [JOV-7674]
gbrain: ops/postmortems/2026-10-20-screenshot-accessible-name-freeze
---

# Screenshot accessibility failures blocked production freshness

Author: Codex, JOV-7674. Review: Summer. Process: [README](README.md).

## Summary

The production controller correctly held promotion after the screenshot producer
found accessible names that omitted visible text on `/voice` and `/blog`.
Production continued serving HTTP 200 but exceeded the two-hour freshness bound.
This repair changes the labels; main, deployment and runtime recovery remain unverified.

## Impact

| Measure | Observed value |
| --- | --- |
| Screenshot failure | 2026-10-19 22:52–22:53 UTC |
| Detection | Continuity observation at 00:16:32 UTC, 7,387 seconds after the oldest unshipped commit |
| Ownership | JOV-7674 In Progress at 00:23:13 UTC |
| Repair | Unverified in production |
| Blocked | Two main commits after served build `48dce1933e84d14d0f0288965935a546ceaa4d4c`; neither endpoint was down |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| Oct 19 22:52–22:53 | Desktop/mobile marketing captures fail `label-content-name-mismatch`. | [Screenshot producer 39337299994](https://github.com/JovieInc/Jovie/actions/runs/39337299994) |
| Oct 19 23:05:45 | Fleet admission blocks promotion with `check:Generate Screenshots:unhealthy`. | [Controller 39339245875](https://github.com/JovieInc/Jovie/actions/runs/39339245875) |
| Oct 20 00:16:32 | Both endpoints return 200; two commits aged 7,387 seconds exceed the 7,200-second bound. | [Continuity 39346643078](https://github.com/JovieInc/Jovie/actions/runs/39346643078) |
| During repair | The unchanged production build reproduces all four failures with Axe 4.14; five new unit regressions fail on the original code. | Local browser observations and regression logs recorded in JOV-7674 |

## Root cause

`VoiceDemoVisual` overrode its visible button text with a different `aria-label`.
`BlogCard` labelled each link only with its article heading, while the same link
also displayed an artwork headline marked `aria-hidden`. Axe 4.14's existing
route check reports both cases as serious label/content mismatches. That failed
the producer and made its later certification artifacts unavailable.

## Contributing causes

Earlier unit checks asserted visible text or the old title-only accessible name.
They did not require every visible label to participate in the accessible name.
The previous risk-routing repair (#22234) remains in main; this episode reached
a different, correctly enforced release boundary.

## Failure classes and invariants violated

| Class | Required invariant | Covered surfaces |
| --- | --- | --- |
| pre-merge-parity-gap | Accessible names include visible control text in rendered order. | All four editorial headlines, artwork fallback, and voice idle/playing/stopped/completed states |

## Why detection failed

Browser detection worked. The gap was focused regression coverage before the
post-merge screenshot run. The freshness observer also worked and reported the
actual release delay. No monitor threshold or gate needs relaxing.

## Instance fix and systemic controls

Use the voice button's native text name. Include both visible blog labels in
`aria-labelledby`, using only the title when artwork is absent. Regression tests
exercise all existing artwork headlines and voice transitions. Retain the
existing full-route Axe checks at desktop/mobile and all release gates.

## Action items

| Issue | Control | State | Live verification receipt |
| --- | --- | --- | --- |
| JOV-7674 | Label repair, failing-before regression coverage, then exact-head screenshot and production verification | Source repair prepared | Unverified; independent landing and production controller own acceptance |

## Open questions and unverified claims

The first introduction of these labels and the first affected screenshot run
are unverified. This timeline uses the current episode's retrieved evidence.
Local browser proof does not certify hosted CI, merge, deployment or production
freshness. GBrain was unreachable (`gbrain-unavailable`); this file and the
Linear handoff retain the findings for later recall.
