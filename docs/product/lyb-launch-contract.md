# LogYourBody launch contract

Version: `lyb-launch-contract/v1`. Source: JOV-6013. Owner: LYB product.

**EVENT:** Launch serves people whose appearance is materially tied to their
work: actors, models, musicians, and creators. The promise is proactive
body-composition control around the user's own outcome dates and constraints.
GLP-1 + DEXA is an initial high-intent wedge; neither is required to use LYB.

This contract supersedes the audience, outcome, and surface breadth in the
[earlier offer](../company/LYB-LAUNCH-OFFER.md),
[MVP cut line](lyb-mvp-cut-line.md), and
[historical coach audit](../../audits/lyb-eve-fable-audit-jov-5961.md).
Commercial proposals remain proposals. The
[health trust boundary](lyb-health-trust-boundary.md) continues to bind every
recommendation, including founder-assisted delivery. Allowed coaching
capabilities do not authorize additional launch screens.

The bottleneck is an inconsistent launch promise and competing routes to value.
Source evidence: the older offer excluded GLP-1 users and sold an eight-week
hypertrophy block; the audited app has 46 native states plus legacy modes and
34 web pages. Measure first persisted, delivered individualized directives
against dated outcomes using the existing
[activation contract](lyb-activation-retention-contract.md). No observed uplift
is claimed by this policy change.

## What a new user reads

> Your body-composition goal, planned around your next date.
>
> Set an outcome and a date. LogYourBody follows your photos and measurements,
> spots drift, and gives you one next action.

The landing page and first native screen explain this before asking for data.
Examples include a shoot, performance, summer, travel, or a maintenance phase.
Users choose the outcome; LYB never assigns an appearance goal from occupation,
sex, or immutable traits. Dates guide planning, never guarantee a result.

## Canonical journey and evidence

The primary product surfaces are the swipeable visual timeline, stats/body
score, and Jovi coach. They may share the existing Home composition; this does
not prescribe a new tab bar. Logging, connections, account, and privacy live
behind contextual actions or settings. Web stays landing/support/account-only.

| Step | User outcome and required assertion | Certification path |
| --- | --- | --- |
| Understand | Reads the dated-outcome promise and knows what to do next without founder explanation. | `launch.promise` |
| Set the constraint | Saves an outcome, date, and constraints such as travel, availability, or a maintenance interval. Survives relaunch. Changing the date updates the plan. | `launch.deadline`, `launch.deadline-replan` |
| Establish a baseline | Connects available signals or enters a measurement manually. HealthKit, photos, DEXA, and GLP-1 disclosure are optional. Permission denial returns to manual entry; no-data asks for one useful input. | `launch.baseline` |
| See the history | Swipes dated photos/measurements with provenance; missing photos have an honest empty state and a logging action. | `launch.timeline` |
| Understand status | Sees stats/body score against their goal and time remaining. Measured, estimated, stale, and unknown values remain distinct. No invented score or trend from insufficient evidence. | `launch.stats` |
| Receive first value | Jovi works backward from the date using available evidence and constraints. Persists and delivers one feasible next action with rationale and uncertainty. | `launch.directive` |
| Catch drift | A subsequent check-in compares comparable signals with the dated plan. Shows drift early and changes one action; conflicting/stale data asks for clarification or a fresh reading. | `launch.drift` |
| Return | Relaunch shows the saved goal, timeline, latest action, and next check-in. A completed/expired date offers review, maintenance, or a new date without silently extending it. | `launch.return` |
| Stay on path | Exercises every visible entry, deep link, back, cancel, and account exit. Hidden/deleted features cannot appear or strand the user. | `launch.navigation` |
| Recover | Pending, failed, offline, no-data, denied permission, interrupted import, and unavailable-plan states preserve context and offer retry/manual entry/return. Unsynced data is labeled. | `launch.recovery` |
| Stay safe | Impossible dates and unsafe targets defer or suggest revising the constraint. Red flags, medication questions, minors, and unavailable safety checks follow the existing trust boundary. | `launch.safety` |
| Keep memory isolated | Two users and a non-LYB product cannot read/write each other's health context. Retrieval retains provenance; logout/account switches cannot leak cached context. | `launch.memory-isolation` |

Onboarding collects only what the next step requires. Photos, connections,
notification prompts, training history, and a complete profile cannot block
first value when an adequate manual baseline exists. A payment interruption
must expose restore/retry and an exit; this contract does not alter entitlements.
Health measurements and raw goal/medical text never enter analytics payloads.

## Every audited surface has a disposition

The executable inventory is
[`scripts/fixtures/lyb-launch-contract.json`](../../scripts/fixtures/lyb-launch-contract.json).
Its sorted `surfaces` map classifies **87 entries** at
[LogYourBody `b95b34d`](https://github.com/JovieInc/LogYourBody/tree/b95b34da12c3f933e413b6f37b7ad503d2974151):
all 46 `WorldClassScreen` cases from `DesignSystem/Theme.swift`, all 34
`apps/web/src/app/**/page.tsx` pages, three `PaidAppSurface` modes, DEXA import,
training/live-session and voice-review sheets, and the composer selector prototype.
Components, API endpoints, and loading variants within a screen are not separate
product surfaces. Native state requirements above cover their behavior.

| Disposition | Launch treatment |
| --- | --- |
| `launch` | Required core or supporting entry. Keep only its job in this journey; verify mounted behavior. |
| `repair` | Required surface whose behavior/copy needs alignment. Blocks launch certification until its relevant journey assertions pass. This classification is not proof of a defect or completion. |
| `hide` | No launch navigation, prompts, upsells, or deep-link access. Keep implementation dormant only when needed for a later evidence-based decision. |
| `delete` | Remove redundant/obsolete implementation and entry points. Existing links return to the canonical launch entry instead of a dead end. Retain its inventory tombstone for audit. |

The map repairs goal editing, Home, stats, coach, baseline, and first-photo
flows; hides sharing, voice/live-training UI, visual estimation, bulk photo
import, marketing breadth, and prototypes; deletes alternative home modes,
home-choice onboarding, duplicate landing, Android download, and dormant web
product routes. Optional GLP-1 context belongs in the coach/check-in boundary,
never a required medication workflow. Legal, consent, restore, support, export,
session management, and deletion remain reachable as supporting functions.

**Ship now:** these three primary surfaces and their minimal dependencies.
**Re-evaluate when:** observed launch users cannot complete the dated-outcome
loop because a hidden capability is absent. **Then:** revise this versioned
contract and its fixture with that evidence before exposing another surface.

## Certification and delivery boundary

[`lyb-native-certification/v2`](../../scripts/lyb-native-certification.mjs)
requires the fixture's exact SHA-256 digest in both manifest and receipt,
the LYB repository identity, the complete surface dispositions, the exact
primary-surface list, and all 13 journey paths at their declared evidence tiers.
Capture requirements cannot be erased by the producer. The existing oracle
then checks actual selected/executed/passed XCTest records and hashed captures,
installed build lineage, configuration, and artifact identity. See the
[producer contract](../operations/lyb-native-certification.md).

This Jovie slice ships policy, fixtures, and fail-closed reconciliation. It
does **not** implement the iOS journey or certify an installed product. The
cross-repository implementation and manifest producer are tracked in
[LYB-183](https://linear.app/jovie/issue/LYB-183/implement-deadline-launch-journey-and-scope-enforcement-from-jov-6013).
JOV-6013 remains incomplete until that app's exact build passes the journey.
The source pin is an audit baseline, not the candidate build SHA. Any newly
observed surface must be classified before certification; deleted entries stay
as tombstones. Synthetic oracle fixtures cannot be submitted as runtime proof.

Verification here is deterministic policy reconciliation and negative controls;
no customer exposure or outcome optimization runs in this repository slice.
Rollback is a revert of this contract change, never a bypass of health safety.
GBrain was unreachable (`gbrain-unavailable`); current repository source and the
issue's explicit product direction supplied the evidence.
