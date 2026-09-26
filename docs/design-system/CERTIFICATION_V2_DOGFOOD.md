# Certification v2: dogfood-first, confidence-timed

Status: design spec (no code in this PR)
Owner: Tim White (taste), Summer (operation)
Date: 2026-09-26
Extends: [CERTIFICATION_OPERATING_LOOP.md](CERTIFICATION_OPERATING_LOOP.md)
Tracking: JOV-6638 (epic), children JOV-6639 to JOV-6648

v1 asks for founder taste proof (`founder_locked`) **before** `shipped`. That
order makes Tim the first human to see a change and the thing it waits on. v2
reverses it: machines certify, production receives the change behind a flag,
agents and trusted people dogfood it, Tim certifies asynchronously inside a
bounded window, and only then do real users see it.

```
working -> machine_certified -> dogfooding -> dogfood_certified
        -> human_window -> rolling_out -> monitored
```

v2 is an evolution of the one kernel in `apps/web/lib/agent-os/certification.ts`.
It adds no registry, queue, controller, or certification authority.

## 1. Founder requirements this spec is held to

1. Order: machine-certify, ship to production behind a flag, dogfood
   autonomously, human-certify async, staged rollout. No human step precedes
   production exposure to dogfooders.
2. Dogfood is first class, with six kinds (section 4). If no agent can reliably
   do the job, the item is not machine-certifiable.
3. Confidence sets the human window. High confidence gets about 1h, then
   promotes without Tim. Low confidence escalates to stronger models before a
   card reaches Tim.
4. Certified dogfooder cohorts live in an Ovie table with customer certification.
   Summer contacts them only through an approved Ovie outbound card.
5. Summer tracks and improves the metrics in section 8.
6. Ovie, Jovie, and LogYourBody lanes never hold each other.

## 2. State machine

| v2 state | Admitted when | Exposure | Emits |
| --- | --- | --- | --- |
| `working` | Any blocker, rejection, kill switch, or changes requested | Flag off | Nothing |
| `machine_certified` | All six taste tiers pass (unchanged v1 rules) and same-source `ci` passes | None yet | Nothing |
| `dogfooding` | `queue_merge` and `deploy` receipts for the exact head; subject flag on for the dogfood cohort only | Agents, Tim, certified dogfooders | Dogfood missions |
| `dogfood_certified` | Dogfood receipts satisfy the subject's mission set (section 4) with required reliability | Same | Confidence evaluation |
| `human_window` | Confidence tier computed; escalation chain finished (section 5) | Same | One Taste Inbox card with a deadline |
| `rolling_out` | Founder `approved`, or window expired with silence and tier permits silent promotion | Staged ladder (section 6) | Stage receipts |
| `monitored` | Ladder reached 100% and post-rollout `runtime_dogfood` plus canary receipts pass for the soak period | Everyone | Nothing |

Transitions out of any state:

- A failed receipt at any tier, a canary failure, or a founder
  `changes_requested`/`rejected` turns the subject flag off in the same
  reconcile tick and returns the subject to `working`, with audit history.
  Flag-off is the rollback. Reverts are for code that cannot be flagged.
- A new source head re-enters at `machine_certified`. Operational receipts stay
  excluded from the decision digest, as in v1.

`founder_locked` becomes async and timeout-bounded. v2 has no state in which a
subject waits for Tim before production. The founder decision is still one
decision bound to one decision-evidence digest with v1 replay protection. What
changes is when it is taken (during `human_window`, after dogfood) and that its
absence is itself a policy outcome (silence), not an indefinite hold.

Taste Inbox emission moves from `review_ready` to `human_window`. At most one
card per subject, as in v1.

## 3. Evidence tiers

Taste tiers are unchanged: `canonical_source`, `invariant_evaluation`,
`tests_coverage`, `visual_proof`, `canonical_references`, `required_variants`.
Operational tiers are unchanged: `ci`, `queue_merge`, `deploy`,
`runtime_dogfood`. v2 adds structure inside `runtime_dogfood` and adds one new
operational tier:

| Tier | New | Content |
| --- | --- | --- |
| `runtime_dogfood` | sub-kinds | `jovie.dogfood-receipt/v1` receipts, one per mission run (section 4) |
| `judge_panel` | new operational tier | LLM judge verdicts with model id, rung, and agreement (section 5) |
| rollout stage receipts | reuse `deploy`/canary receipts | One per ladder rung, same exact deployment id |

Both stay out of the decision digest, so more dogfood or a later judge rung never
stales a valid founder decision.

## 4. Dogfood kinds and receipts

| Kind id | Actor | Real entry point today | Agent-reliable? |
| --- | --- | --- | --- |
| `ui_agent` | Agent acting as a human through the UI | Playwright against production with the subject flag on; `apps/ios/scripts/dogfood-ios.sh` for iOS (`jovie-ios-dogfood/v1`) | Yes |
| `agent_on_behalf` | Agent acting as an agent for a human | Per-artist MCP `apps/web/app/api/mcp/[username]/route.ts` (resources plus authenticated merch tools); Ovie MCP `apps/web/app/api/ovie/mcp/route.ts` (`get_feature_state`, `certify_feature`); `@jovie/cli` (`jovie artist get`, `artist llms`, `api openapi`, `docs llms`, read-only) | Yes, read paths. The CLI has no authenticated write path yet. |
| `instincts` | Instincts agent pinged over iMessage | No repo surface; receipt arrives through feedback ingestion | Only with a structured receipt |
| `local_agent` | Local coding agents driving a local or preview build | gstack `qa`/`qa-swarm` skills | Yes |
| `mac_closed_loop` | Mac app opened and driven on Tim's Mac | `cua-driver`; prior art `docs/operations/evidence/summer-mac-production-dogfood-2026-09-01.json` | Yes, when the Mac is reachable |
| `founder_real_account` | Tim's real profile, music, and smart links | Production, Tim's session | Agent-driven read missions; writes only if reversible |
| `human_cohort` | Certified dogfooders (section 7) | Their own accounts, feedback by text or DM | Human |

`jovie.dogfood-receipt/v1` generalizes the existing
`jovie.summer-dogfood-observation/v1` shape rather than replacing it:

```
schema, subjectId, product (jov | lyb | ovie), kind, missionId, actor,
environment, deploymentId, commitSha, flagCohort, startedAt, completedAt,
outcome (passed | failed | blocked), blocker, evidenceRefs[],
privacy { conversationContentRetained, credentialsRetained,
          accountIdentityRetained, unrelatedPersonalDataRetained }
```

A receipt counts only if `commitSha` and `deploymentId` match the subject's
current deploy receipt.

**Mission set.** Each registry identity declares which missions prove it, in its
existing per-identity assurance profile (v1). No second registry. A mission names
one outcome a real user needs ("claim a smart link and see it resolve"), not an
implementation step. `certify_feature` already drafts outcome-level missions from
the profile capability inventory. v2 uses that as the proposer.

**Reliability rule (the "cannot reliably do the job" test).** An agent kind
counts for a mission only if it passes the mission on the exact deploy:

- Ship now: at least 3 of 3 runs for deterministic drivers (Playwright, XCUITest,
  MCP, CLI), at least 4 of 5 for model-driven drivers (computer use, Instincts,
  local agents).
- Re-evaluate when: 30 days of receipts show a driver's flake rate above 5%, or a
  defect escapes that a passing driver should have caught.
- Then: raise that driver's run count, or mark it non-counting for that mission.

If no agent kind meets the rule for a required mission, the subject is
`machineCertifiable: false`. It can still reach `dogfood_certified`, but only
through `human_cohort` or `founder_real_account` receipts, and its confidence
tier is `low` (section 5). Summer treats every such subject as coverage debt.

**Tim's real account.** Agents may run read missions on it at any time the flag
is on. Write missions are limited to reversible operations with a recorded undo
step. The privacy block must be all false. No content from Tim's account enters
receipts, only outcomes and evidence refs.

## 5. Confidence model

Confidence is a pure function in the kernel over receipts. It is not a model
opinion. It returns one tier and the reasons. Rule-based tiers beat a weighted
score here because every promotion must be explainable in one card line.

**Inputs**

| Input | Source |
| --- | --- |
| Taste tiers all passed | Existing kernel |
| Distinct agent dogfood kinds meeting the reliability rule | Section 4 receipts |
| `machineCertifiable` | Section 4 |
| Judge panel verdict and agreement | `judge_panel` receipts |
| Surface risk class: `presentation`, `product`, `money_path` (auth, billing, payouts, migrations) | Assurance profile |
| Surface escaped-defect rate, trailing 30 promotions | Section 8 |
| Open defects linked to the subject | Linear |

**Tiers and windows**

| Tier | Requires | Human window | On silence |
| --- | --- | --- | --- |
| `high` | Taste tiers pass; at least 2 agent kinds reliable; judge panel unanimous; risk class not `money_path`; surface escaped-defect rate at most 5%; no open linked defect | 1h | Promote to `rolling_out` |
| `medium` | Taste tiers pass; at least 1 agent kind reliable; judge majority; no open linked defect | 8h | Promote to `rolling_out` |
| `low` | Anything else, including `machineCertifiable: false` | 24h, only after the escalation chain | Hold at `dogfooding`; re-card at most once per 24h |

Ship now: the numbers above. Re-evaluate when: 50 founder decisions exist as
labels, or silence-promotion regret (section 8) exceeds 2% over 30 days. Then:
fit per-risk-class thresholds against Tim's decisions (next paragraph), and
shorten or lengthen windows per class from measured regret.

`money_path` caps at `medium`. That is stricter CI plus a longer window, not a
merge gate, consistent with the autonomous shipping doctrine. Ship now: cap.
Re-evaluate when: `money_path` escaped-defect rate is at most 2% over 50
promotions. Then: allow `high`.

A low item held at `dogfooding` is not blocked from the people dogfooding it.
Only real users wait.

**Escalation chain (runs before any card reaches Tim).** Low-confidence items go
up judge rungs until one is confident or the chain ends:

1. Default router model (Symphony model registry default) as a 3-judge panel.
2. Strongest same-vendor model.
3. Cross-vendor panel (at least two vendors, strongest tier of each).
4. Taste Inbox card to Tim.

A rung can raise the tier only when its agreement clears the calibrated
threshold for that risk class. Rungs never lower a tier set by failed receipts.
Each rung writes a `judge_panel` receipt with model ids and cost, so Summer can
see which rung does the work. This is the cascaded selective evaluation pattern
from Trust or Escalate (Jung et al., ICLR 2025) and the cost cascade from
FrugalGPT (Chen et al., 2023).

**Calibration.** Every founder decision is a label. Tim's `approved`,
`changes_requested`, and `rejected` decisions and every escaped defect form the
calibration set. Ship now: fixed thresholds (unanimous for `high`, majority for
`medium`). Re-evaluate when: 50 labels per risk class. Then: choose each rung's
agreement threshold by fixed-sequence testing so judge-versus-Tim disagreement
stays under alpha = 0.10 with delta = 0.05, per Trust or Escalate.

## 6. Staged rollout

One flag per subject. Stages: `dogfood` (agents, Tim, certified dogfooders),
`alpha`, `beta`, `10%`, `50%`, `100%`.

- Cohort stages target by user id through the existing flags stack
  (`apps/web/lib/flags/*`, Statsig). Percentage stages use the same stable
  bucketing idea as `apps/web/lib/agents/rollout.ts`; do not add a new
  assignment store for web flags. Skill experiments keep `skill_rollout_assignments`.
- A rung advances when its soak time passes and canary receipts are green
  (`.github/workflows/canary-health-gate.yml`, `apps/web/app/api/cron/*-canary`).
- Ship now soak per rung: `high` 1h, `medium` 4h. `low` never auto-advances.
  Re-evaluate when: 30 days of rung data exist. Then: set soak per risk class
  from observed time-to-detect.
- Canary or dogfood failure at any rung is the kill switch in section 2.

## 7. Dogfooder roster (Ovie)

One Postgres table (migration through the normal Migration Guard path),
readable only through `authorizeSummerControl`, projected as an Ovie table.

| Field | Notes |
| --- | --- |
| `id` | uuid |
| `displayName` | e.g. "Daniel" |
| `cohort` | `advisor`, `alpha`, `beta`, `trusted` |
| `products` | subset of `jov`, `lyb`, `ovie`; lanes are independent |
| `channel` | `imessage`, `sms`, `x_dm`, `email` |
| `handle` | contact address; never leaves the server |
| `jovieUserId` | nullable; links to their account for flag targeting |
| `consent` | `{ grantedAt, scope, source, revokedAt }`; no contact without unrevoked consent |
| `certState` | `invited`, `consented`, `onboarded`, `certified`, `paused`, `retired` |
| `certEvidence` | calibration mission completed, feedback quality score |
| `contactBudget` | Ship now: at most 1 outbound per 7 days per person |
| `lastContactedAt`, `lastFeedbackAt` | For the budget and the health metrics |

**Customer certification.** A person is `certified` after consent, a completed
calibration mission (a known-good and a known-broken build, and they tell them
apart), and two feedback reports Summer could act on. Only `certified` people
produce `human_cohort` receipts that count toward `dogfood_certified`. Others
still give feedback. It just counts as signal, not evidence.

**Outbound.** Summer never messages a person directly. She files a Summer card
of kind `outbound` (`apps/web/lib/ovie/summer-cards.ts`) with `recipient`, the
exact message, and the subject. Approval of the card sends it once. Invites to
join a cohort use the same card. The send path ships disabled and is enabled as
a separate post-landing authority action.

**Feedback ingestion.** Replies map to a `jovie.dogfood-receipt/v1` of kind
`human_cohort` on the subject. Summer classifies each reply as defect (Linear
issue linked to the subject, which blocks `high`), taste (Taste Inbox signal),
or noise.

## 8. Metrics Summer owns

| Metric | Definition | Direction |
| --- | --- | --- |
| Founder-blocking minutes | Sum over subjects of minutes where the only missing input was Tim | Down |
| Founder cards per day | Cards that reached Tim after the escalation chain | Down |
| Silence-promotion regret | Silent promotions later killed or Tim-flagged, per 100 | At most 2 |
| Escaped-defect rate | Defects first found at or after `beta`, per 100 promotions, per lane and risk class | Down |
| Dogfood catch rate | Defects caught in `dogfooding` over all defects for promoted subjects | Up |
| Machine-certifiable coverage | Registry identities with at least one reliable agent kind per required mission | Up |
| Dogfood kind coverage | Distinct kinds with passing receipts per identity | Up |
| Driver reliability | Pass rate on known-good builds per driver | Up |
| Canary coverage | Identities whose surface has a canary route | Up |
| Judge calibration | Agreement of each rung with Tim's decisions | Up |
| Escalation mix | Share and cost resolved at each rung | Earlier rungs |
| Cycle time | `machine_certified` to `100%`, p50 and p90, per tier | Down |
| Kill-switch MTTR | Failure receipt to flag off | Down |
| Cohort health | Certified dogfooders per lane, reply rate, feedback-to-fix latency | Up / down |

Summer's loop: pick the metric that is the current bottleneck (constitution
Law 1), file the smallest Linear issue that moves it, measure again.

## 9. Product lanes

`subject.product` is required in v2 (`jov`, `lyb`, `ovie`). Windows, cohorts,
ladders, kill switches, and metrics are all per lane. A held, low, or killed
subject in one lane never affects another lane's admission. The only shared
piece is the kernel. Summer cards currently use `jov | lyb | company`; `ovie`
subjects file cards under `company` until that enum grows an `ovie` value.

## 10. Migration from v1

- The kernel dispatches on `packet.contract`. `jovie.certification/v1` packets
  keep v1 states and semantics exactly. `jovie.certification/v2` packets use this
  spec. Existing callers (marketing adapter, `certification-runtime-store.ts`,
  `/api/ovie/certifications`) change nothing until they opt in.
- v2 exports new constants (`CERTIFICATION_V2_STATES`, the dogfood receipt type,
  the confidence function) next to the v1 ones. It does not widen v1 unions, so
  exhaustive switches in current callers keep compiling.
- The marketing adapter is the first opt-in. On migration, a v1 row maps as:
  `working` to `working`; `review_ready` to `machine_certified`;
  `founder_locked` keeps its founder decision and enters `dogfooding` once
  deployed; `shipped` to `dogfooding`; `monitored` to `monitored`.
- The ledger schema version bumps only when a v2 packet is written. CAS, the
  monotonic evaluation watermark, and fail-closed drift rules are unchanged.
- v1 is retired once no caller writes v1 packets for 30 days.

## 11. What is not changing

- One kernel, one decision digest, the same six taste inputs, operational
  receipts excluded from the digest, duplicate and replay rejection.
- Registries remain the denominators. No new registry.
- Required checks and the native merge queue remain merge authority. Nothing in
  v2 gates a merge. Certification gates exposure, not merging.
- No human merge gate for auth, billing, or migrations. They get stricter CI and
  a `medium` confidence cap.
- Per-identity assurance profiles, the 97 quality floor for public pages, and
  fail-closed behavior on missing, stale, or ambiguous receipts.
- At most one Taste Inbox card per subject.

## 12. Customer certification

Customer certification runs on the same kernel: a prospect's built profile is
the test, product defects it exposes are fixed and re-checked, Tim approves each
prospect, and outbound is card-approved until a message type earns auto-send.
Spec: [CERTIFICATION_V2_CUSTOMERS.md](CERTIFICATION_V2_CUSTOMERS.md).

## 13. Research basis

- Meta ships to employees first, then 2% of production, then 100%, with
  Gatekeeper flags as the rollback
  ([Rapid release at massive scale](https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/)).
- Slack runs a dogfood tier, then a canary at about 2% of traffic
  ([Deploys at Slack](https://slack.engineering/deploys-at-slack/)).
- Google canaries on a small traffic slice with representative, attributable
  metrics ([SRE Workbook, Canarying Releases](https://sre.google/workbook/canarying-releases/)).
- Anthropic ships internally to everyone first ("antfooding") and reads a
  feedback channel continuously
  ([How Anthropic teams use Claude Code](https://www.anthropic.com/news/how-anthropic-teams-use-claude-code)).
- Selective judging with escalation to stronger judges, with a provable
  human-agreement bound
  ([Trust or Escalate](https://arxiv.org/abs/2407.18370)).
- Cheap-first model cascades with a reliability score
  ([FrugalGPT](https://arxiv.org/abs/2305.05176)).

No primary engineering source for Apple, OpenAI, or Cursor release staging was
consulted for this spec. Nothing here depends on their practice.
