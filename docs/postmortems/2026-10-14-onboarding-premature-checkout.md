---
id: 2026-10-14-onboarding-premature-checkout
status: reviewed
severity: sev2
detected: 2026-10-14T01:29:14Z
repaired: 2026-10-14T02:13:09Z
failure_classes: [escaped-defect]
detectable_before_human: false
detection_gaps: [missing-invariant]
replay_corpus: [apps/web/tests/components/features/onboarding/useOnboardingClaim.test.tsx]
founder_rescues: 0
incident_issue: JOV-8068
actions: [JOV-8068]
gbrain: ops/postmortems/2026-10-14-onboarding-premature-checkout
---

# Onboarding mount claim opened checkout before a terminal decision

Author: close-receipt session for JOV-8068. Review: pending Summer.
Process: [README](README.md).

## Summary

A `/start` mount claim that returned transcript ownership (`claimed > 0` or
`alreadyClaimed`) without a server-verified terminal interview decision
navigated to `/onboarding/checkout`. The checkout page could then render an
Artist Presence upsell over an empty preview. The repair keeps that visitor
on `/start` until `readyForCheckout`, and the organic upsell renders only for
a claimed, completed, public profile.

## Impact

| Measure | Value |
| --- | --- |
| Start (first bad event) | Unverified. The repair pull request was opened at 2026-10-14T01:29:14Z. |
| Time to detect (first machine or human signal) | Unverified before the JOV-8068 report. No machine gate rejected the handoff. |
| Time to own (first incident record with an owner) | JOV-8068. The exact Linear open timestamp was not re-read in this session because Linear was unreachable. |
| Time to repair (user-facing recovery) | Fix merged at 2026-10-14T02:13:09Z as `0cf660dfa439d9fbad3b8ccefe8abec0d69bc633`. |
| What was blocked | A truthful onboarding handoff. Visitors could leave `/start` and see a live-profile offer before the interview produced a terminal decision. |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| 2026-10-14T01:29:14Z | Repair pull request opened. | [PR #21636](https://github.com/JovieInc/Jovie/pull/21636). |
| 2026-10-14T02:09:49Z | Merge-group unit tests executed the claim, checkout, and mount-claim detectors. | [Run 38499201344](https://github.com/JovieInc/Jovie/actions/runs/38499201344). |
| 2026-10-14T02:13:09Z | Repair merged. | `0cf660dfa439d9fbad3b8ccefe8abec0d69bc633`. |
| 2026-10-16T01:45:50Z | Production generation artifact names `c5cf1c76aa2b7be30d283a46de914c5b23de0140` and deployment `dpl_ErXiWbVWiP6NGLWVtXrRpPt1uNSp`. `terminalReason` is `skipped_superseded`. | [Run 38835294809](https://github.com/JovieInc/Jovie/actions/runs/38835294809). |
| 2026-10-16T02:13:10Z | `https://jov.ie/api/version` returned `{"buildId":"c5cf1c7"}`. Anonymous `GET /onboarding/checkout` returned 307 to `/signin`. `GET /start` returned 200. | Live curl against jov.ie. |

## Root cause

`useOnboardingClaim` treated ownership (`claimed` / `alreadyClaimed`) as
permission to leave `/start`. The claim route could acknowledge a transcript
claim before `proposeNextStep` reached a terminal decision. The checkout page
then built an organic upsell from whatever dashboard row was selected, including
a profile that was not claimed, public, and onboarding-complete. The rendered
offer could say the profile was live when it was not.

## Contributing causes

Certification and the previous claim tests treated a successful mount and a
renderable checkout response as success. They did not hold the invariant that
a claim without `readyForCheckout` stays on `/start`, and they did not hold
the invariant that the organic upsell requires a live claimed profile.
`web.onboarding-checkout` was registered in the screen inventory with no
rendered producer, so the screen audit counted it uncovered instead of
examining the offer.

## Failure classes and invariants violated

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |
| escaped-defect | A claim without a server-verified terminal decision stays on `/start`. The organic Artist Presence upsell renders only for a claimed, completed, public profile. Explicit paid intent (`source=intent`) stays a separate artist-initiated checkout. | Any onboarding handoff that treats an ownership flag as a terminal step, and any offer surface that previews a profile before that profile is live. |

## Why detection failed

The miss is a `missing-invariant` detection gap (JOV-7084). Objective evidence
of the bad handoff existed in the claim response shape, and a machine check
could have rejected it. The gates that ran checked that the claim request
completed and that checkout could render. They did not replay a claim body
with ownership and no terminal decision, and they did not require the checkout
page to refuse the organic upsell when the profile was not live. Dogfood that
only opened `/start` after a finished interview would not see the premature
handoff.

## Instance fix

[PR #21636](https://github.com/JovieInc/Jovie/pull/21636) merged as
`0cf660dfa439d9fbad3b8ccefe8abec0d69bc633`. The mount claim stays on `/start`
until the server reports `readyForCheckout`. The claim route does not treat
transcript ownership as onboarding completion. The checkout page redirects the
organic upsell unless the selected profile is public, claimed, and
onboarding-complete. That merge is an ancestor of production SHA
`c5cf1c76aa2b7be30d283a46de914c5b23de0140`, which `https://jov.ie/api/version`
was serving as `buildId` `c5cf1c7` on 2026-10-16.

## Systemic controls

1. JOV-8068 keeps the generalized detector on every similar handoff: the
   mount-claim tests reject ownership without a terminal decision, the claim
   route test rejects a premature handoff, the checkout page test refuses the
   organic upsell without a live profile, and the golden-path spec pins the
   same mount behavior. The deliberate-red inputs are the claim bodies
   `{claimed:1}`, `{claimed:0, alreadyClaimed:true}`, and a skipped profile
   with no `readyForCheckout`.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| [JOV-8068](https://linear.app/jovie/issue/JOV-8068) | Mount-claim, claim-route, and checkout-page detectors for a non-terminal handoff | escaped-defect | Landed in #21636; closure receipt still requires the compiled detection gap on the issue | https://github.com/JovieInc/Jovie/actions/runs/38499201344 |

## Open questions and unverified claims

The original report timestamp, founder-rescue count, and the body of Linear
comment `486b3265` are unverified here: Linear MCP authentication is
unavailable in this session. GBrain is unavailable (`gbrain-unavailable`); the
canonical file is this post-mortem and the mirror
`ops/postmortems/2026-10-14-onboarding-premature-checkout` is not written.
The production-generation artifact for `c5cf1c76aa2b7be30d283a46de914c5b23de0140`
records `terminalReason: skipped_superseded` while the public alias still
served that SHA. That terminal reason is unverified as a supersede of the
alias itself.
