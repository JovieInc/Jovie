# Bug intake loop

Status: design spec (no code in this PR)
Owner: Tim White (priority overrides), Summer (operation)
Date: 2026-09-26
Related: [CERTIFICATION_V2_DOGFOOD.md](CERTIFICATION_V2_DOGFOOD.md) (feature
certification; unchanged by this loop)
Tracking: JOV-6638 (epic); bug intake children JOV-6661 to JOV-6666

Every bug report is taken seriously, whoever sends it. The loop is closed: the
person who reported it hears back when it is fixed. This loop is separate from
feature certification. A report here never certifies or blocks a feature by
itself. It becomes a prioritized Linear bug, and the fix ships through the
normal PR flow. A fix that touches a subject under certification re-enters
`machine_certified` like any new head.

```
intake (any source) -> normalize -> source weight -> Jev scores
  -> dedupe and repro -> Linear bug (JOV or LYB) with priority
  -> Summer dispatch -> fix lands and deploys -> closure proof
  -> reporter hears back (Ovie card for anyone but Tim)
```

## 1. Existing entry points (extend, don't fork)

| Source | Entry point today | Change |
| --- | --- | --- |
| Users (web app) | `POST /api/feedback` into `feedback_items` (`apps/web/lib/feedback.ts`), plus a Slack notification | Add bug classification and triage fields; keep the route contract |
| Sentry | `POST /api/webhooks/sentry` into `repository_dispatch`, `.github/workflows/sentry-autofix.yml`, closed by `sentry-autofix-recurrence.yml` | Keep the autofix path. Mirror each dispatched issue as a bug report so priority and metrics are unified. No second dispatcher |
| Agents | Ovie MCP `coordinate_linear_work` (`apps/web/lib/ovie/linear-coordination.ts`) | Route agent-found bugs through intake first, then file with the same coordinator |
| Dogfood | Failed `jovie.dogfood-receipt/v1` receipts; `human_signal` replies (dogfood spec sections 4 and 7) | Failed receipts and defect-classified replies become bug reports |
| Advisors and pools | Replies ingested through Ovie outbound threads (dogfood spec section 7) | Same as dogfood |
| Tim | Summer and Ovie chat | A Summer tool call creates a bug report with source `tim` |

Linear is the system of record. GitHub Issues are not an intake or fallback.

## 2. Report envelope

`jovie.bug-report/v1` is stored as `feedback_items` rows with a `kind` column
(`feedback` or `bug`). There is no second table.

| Field | Notes |
| --- | --- |
| `source` | `tim`, `advisor`, `pool`, `user`, `agent`, `sentry`, `dogfood` |
| `reporterRef` | Roster id, user id, agent run id, or Sentry issue id |
| `product` | `jov`, `lyb`, `ovie` |
| `surface` | Pathname, screen, or feature id |
| `message` | As reported; 2000-character cap, as today |
| `evidenceRefs` | Screenshot, receipt, Sentry event, or thread turn refs |
| `deploymentId`, `commitSha` | When known |
| `triage` | `{ sourceWeight, jev, priority, dedupeOf, repro, linearIssueId }` |
| `status` | Extends `pending`, `dismissed` with `triaged`, `duplicate`, `filed`, `fixed`, `notified` |

`dismissed` needs a written reason and still notifies the reporter. The
reporter must also be notified on `duplicate` and on "cannot reproduce". No
report ends silently.

## 3. Priority

**Source weight** (ship now): Tim 1.0, advisor 0.7, qualified pool 0.4,
uncalibrated pool 0.2, general user 0.2, agent 0.3 (0.6 with a repro receipt),
Sentry from users affected and event rate. Weight order follows Tim's rule:
Tim, then advisors, then pools, then general users.

**Jev scores.** Jev, the advisory text model, returns `{ risk, confidence,
priority, product, suggestedDuplicateOf }` through the existing gateway
integration (`scripts/invariants/jev-gateway.mjs`, `docs/evaluations/jev-gateway-integration.md`).
Jev is text-only. Image evidence stays attached for the fixer and is not scored
by Jev.

**Final priority** is a deterministic function, and Jev is one input:

- Base: Jev priority, or a rules-only default when Jev is unavailable. A report
  is never dropped because Jev failed.
- Raise one level when source weight is at least 0.7, when the surface is
  `money_path`, or when duplicates reach 3 or more.
- Floor: Tim's reports are at least High. Advisor reports are at least Medium.
- Maps to Linear priority 1 to 4.

Ship now: those rules. Re-evaluate when: Tim has overridden 20 priorities. Then:
refit the weights and Jev's influence to his overrides.

## 4. Dedupe and repro

- **Dedupe.** Match against open Linear bugs in the same lane on Sentry
  fingerprint, surface plus error signature, and Jev's suggested duplicate. A
  duplicate attaches to the existing issue as a +1 with its evidence. Its
  reporter joins that issue's notify list, and its weight raises that issue's
  priority.
- **Repro.** An agent tries to reproduce the bug on production with the dogfood
  drivers (Playwright, MCP, or iOS). The outcome is a receipt: `reproduced`,
  `not_reproduced`, or `not_attempted` (no driver).
- A report that does not reproduce is still filed, labeled
  `repro:unconfirmed`, with confidence lowered. Reports from Tim and advisors
  are filed at full priority regardless of repro.

## 5. Filing and dispatch

- File through `coordinateLinearWork` into team JOV (`jov`, `ovie`) or LYB
  (`lyb`), with the `Bug` label, the computed priority, state Backlog, and the
  source, weight, Jev scores, repro receipt, and notify list in the body.
- Summer dispatches bugs like any other work. `agent-ready` follows the normal
  rule: no auto label when the fix touches auth, billing, or infra.
- A Sentry-sourced bug links the autofix branch or PR if one exists, so the
  work is not duplicated.

## 6. Closing the loop

- **Closure proof.** The fix merged (`linear-sync-on-merge.yml` marks Done) and
  deployed. On top of that, either Sentry recurrence is quiet after soak, or
  the repro mission now passes on the deploy.
- **Reporter reply.** Tim hears back directly from Summer. For everyone else,
  Summer files an `outbound` card per reporter ("the bug you reported is
  fixed, thanks, tell us if you still see it"). The outbound type is
  `bug_fixed_reply`, and it can earn auto-send under the customer outbound
  policy ([CERTIFICATION_V2_CUSTOMERS.md](CERTIFICATION_V2_CUSTOMERS.md) section
  7). Anonymous `/api/feedback` reports with no contact get no reply, and the
  row records `notified: not_contactable`.
- A reporter who says it is still broken reopens the issue with their evidence
  attached.

## 7. Metrics

| Metric | Direction |
| --- | --- |
| Reports by source and lane | Visibility |
| Time to triage (report to filed) | Down |
| Time to fix by priority | Down |
| Reporters notified / contactable reporters | 100% |
| Reopen rate after "fixed" | Down |
| Duplicate rate and repro rate | Visibility |
| Tim priority overrides | Down |

## 8. What is not changing

- Feature certification rules. Tim's earlier answers stand for features.
- The Sentry autofix and recurrence workflows stay the Sentry repair path.
- The `/api/feedback` request and response contract.
- Linear as system of record; `linear-sync-on-merge.yml` owns Done.
- No outbound message to anyone but Tim without an Ovie card or an earned
  auto-send type.
