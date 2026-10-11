---
id: 2026-09-28-codex-lane-attribution-gap
status: draft
severity: sev2
detected: 2026-09-27T17:09Z
repaired: 2026-09-28T20:24Z
failure_classes: [green-by-implication, evidence-forgery-or-staleness]
incident_issue: JOV-6867
actions: [JOV-7088]
gbrain: ops/postmortems/2026-09-28-codex-lane-attribution-gap
---

# Codex lane dispatch and attribution gap

Author: Codex autonomous lane for JOV-6867. Review: Summer. Process:
[README](README.md).

## Summary

The Codex lane was reported idle while qualified work waited, then appeared healthy
again without durable evidence that an account had been leased or that Codex had
produced the attributed output. The lane treated a provider probe and branch naming
as sufficient proof; it did not bind account lease, issue claim, worktree, provider,
and result in one receipt.

At 20:24 UTC, fresh host evidence showed three autonomous Codex workers running and
the JOV-6867 worker holding an OAuth account lease. This change makes that evidence
durable, separates origin from review/finalizer participation, publishes matched
provider throughput, and alerts when usable Codex capacity idles for five minutes
while compatible work exists.

## Impact

| Measure | Value |
| --- | --- |
| Start (first bad event) | Unverified; the first durable system signal was 2026-09-27 17:09 UTC |
| Time to detect (first machine or human signal) | Unverified; the monitor created JOV-6867 at 17:09 UTC, but the start of idleness was not recorded |
| Time to own (first incident record with an owner) | Immediate for the initial signal; 14 minutes from the 20:08 UTC recurrence report to the fresh autonomous claim |
| Time to repair (user-facing recovery) | An upper bound of 27h 15m from the initial signal to observed dispatch recovery; the actual outage duration is unverified |
| What was blocked | Trustworthy Codex dispatch health, provider comparison, and proof that available autonomous capacity was producing PRs |

No customer-facing application outage or data loss was verified.

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| 2026-09-27 17:09 | The monitor opened JOV-6867 with 51 issues waiting and Codex reported down. | Linear issue creation and intake body |
| 2026-09-27 17:14 | The initial incident was marked Done after a provider-health recovery. | Linear state history |
| 2026-09-28 20:08 | The incident was reopened after the live TUI showed Codex at 0/3 with `pool unknown` and `linear red`. | Founder report in JOV-6867; screenshot/runtime receipt unverified |
| 2026-09-28 20:22 | The canonical Codex lane claimed JOV-6867 and moved it to In Progress. | Linear state history and the active worktree/worker process |
| 2026-09-28 20:24 | The live feed showed Codex at 3/4 running, pool 43, with one account available; the current worker log showed an OAuth account lease. | Live status feed, process tree, and local lane log |
| 2026-09-28 20:42 | Receipt attribution, provider metrics, idle alerting, and regression tests were implemented. | This change and the lane test suite |
| 2026-09-28 20:49 | The reset-aware Grok canary reported an authenticated account at 100% weekly usage, resetting at 21:01 UTC. | Live Grok TUI `/usage`; no pre-reset capacity remained to drain |

## Root cause

Lane health and output attribution had two disconnected evidence paths. Provider
health established that a command could answer, while the HUD inferred provider
output from branch prefixes. Neither path proved that an autonomous account was
leased, a worker started through the canonical path, that worker claimed the issue,
and the same run produced or remediated the resulting PR.

Consequently, an old or manually created `codex/*` branch, review-only involvement,
or a cross-provider finalizer could be counted as Codex lane output. A recovered
provider probe could also clear the incident while every Codex slot remained idle.
The immediate trigger for the reported 0/3 state is unverified because the old path
did not persist a stage-specific terminal receipt.

## Contributing causes

- Account leasing happened inside the Codex wrapper but was not appended to the
  lane receipt stream.
- Run receipts described the issue and result but omitted account class, worktree,
  explicit offer/accept/start events, and provider roles.
- The HUD counted merged branches using a provider-name regular expression.
- The status feed exposed process counts but no matched offered-to-landed funnel or
  qualified-capacity idle reason.
- A provider probe and a productive autonomous run were presented as equivalent
  health evidence.

## Failure classes and invariants violated

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |
| `green-by-implication` | Provider health is green only when fresh evidence proves lease, start, claim, and a classified result; a passing probe is only admission evidence. | Every autonomous provider lane and fallback path |
| `evidence-forgery-or-staleness` | Landed output is attributed from a durable run receipt tied to the issue, provider role, worktree, and PR head, never from a branch prefix or historical author. | HUD, Summer status, retrospectives, and provider comparisons |

## Why detection failed

The monitor could detect a failed provider probe and a zero worker count, but it did
not retain when compatible work was offered, whether an account was available, or
why no worker started. Once the probe recovered, the signal could clear without a
productive-run receipt. The HUD then used historical branch names as output proof,
masking the absence of fresh autonomous provenance.

## Instance fix

Fresh host evidence confirmed the canonical JOV-6867 worker had leased a Codex OAuth
account and that three Codex workers were running. This PR is the fresh
Codex-origin artifact required by the reopened incident contract; it also supplies
a classified terminal failure if a future run cannot produce a PR.

The separate Grok reset canary had no drainable capacity: the authenticated live
account showed 100% weekly usage and a 21:01 UTC (14:01 PT) reset. No workload was
routed based solely on login health.

## Systemic controls

- The Codex wrapper writes and fsyncs a structured account-lease event only after
  the account lock succeeds and before the worker starts.
- Lane receipts bind issue UUID, provider, account class, branch, worktree, offer,
  acceptance, result, PR/head, and origin/finalizer roles.
- Attribution distinguishes autonomous creation, manual Codex-app creation, old
  branches landed later, review-only participation, remediation, handoff, and
  finalizer-only participation.
- HUD and Summer throughput use receipt attribution and publish a matched 24-hour
  provider funnel: offered, accepted, started, productive, PR-created,
  first-pass-green, remediation, landed, latency, account leases, and failure/idle
  reasons.
- Five continuous minutes of available Codex capacity plus compatible work and no
  worker start raises the urgent `provider-idle:codex` signal.
- Regression tests reject branch-prefix attribution and exercise lease receipts,
  role classification, provider metrics, and the continuous-idle timer.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| JOV-7088 | Verify a fresh autonomous Codex receipt/PR, status/HUD funnel, deliberate-red idle alert and clear, and create the GBrain mirror. | Both | Todo | Pending; source controls are not yet deployed |

## Open questions and unverified claims

- **Unverified:** the exact claim/provider/gate failure that produced the reported
  0/3, `pool unknown`, and `linear red` state. The prior implementation retained no
  stage receipt for that episode.
- **Unverified:** the duration of the original idle interval and how much qualified
  work was actually compatible with Codex at each point.
- **Unverified:** live behavior of the new status fields and idle alert until this
  PR lands and JOV-7088 records the deliberate-red canary.
- The GBrain service was unavailable in this run. JOV-7088 owns creation of the
  required `ops/postmortems/2026-09-28-codex-lane-attribution-gap` mirror.
