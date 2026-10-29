# Time leverage: measure Tim's time and agent waste, propose automations

Goal (Tim, 2026-10-29): measure what Tim does, propose automations that free his time so all of it goes to the
highest-value levers, and do the same for wasted agent time. North-star metric: **% of Tim-minutes spent on
human-only high-value work**.

Code: `scripts/timewaste/` (`python3 -m timewaste ...` from `scripts/`). Tests: `scripts/tests/test_timewaste.py`.
Driver: `scripts/timewaste/run.sh weekly|check`.

## Privacy

Events carry `{ts, source, category, minutes, measured}` only. Message bodies (transcripts, iMessage, GitHub and
card text) are classified in memory and dropped. The store is `$JOVIE_TIMEWASTE_DIR`
(default `~/.local/state/jovie-timewaste`, mode 0700), outside every repo. The only thing that leaves the
machine is the `time-leverage/v1` aggregate (category minutes, counts, proposal titles) to Ovie and Summer's
brief. Never commit snapshots, and never put a baseline in a PR, log or issue body.

## Tim-time ledger

| Source | How | Notes |
|---|---|---|
| Claude Code sessions | `~/.claude/projects/*/*.jsonl`, typed prompts only (`entrypoint=cli`, not meta, sidechain or harness plumbing) | gap since the previous assistant entry is the measured latency |
| iMessage (Summer threads) | `chat.db` read-only; threads auto-detected; Tim's side = the shorter-message side | counts asks, replies, corrections; both-sides-long threads are skipped as agent-to-agent |
| GitHub | `users/<login>/events` via `scripts/apiclient` | events within 10 s of the previous are token-driven bursts and dropped |
| Linear | `LINEAR_API_KEY` | creations in batches are agents; only isolated creations count; unavailable without a key, never zero |
| Ovie decision cards | Summer cards export (`OVIE_CARDS_EXPORT`) | `resolution=default` costs Tim nothing; time-to-decide reported |

Classes: **human-only high-value** = taste calls, new direction, outbound relationships, spend/legal.
**Automatable** = status asks, chasing stalled work, re-explaining a rule, corrections, verify-it-for-me asks,
slop a machine should catch, copy/number updates, approvals a policy could grant, GitHub review/merge/label,
Linear triage. **Steering** (delegating work, unclassified) counts in the denominator only, so the north-star
is conservative. Taxonomy and rules: `taxonomy.py`.

Minutes per event: measured gap (0.05 to 15 min) when available, else
`0.2 + min(chars,1500)/220 + floor[category]`. `calibration` in each snapshot reports measured/heuristic per
category so the floors are re-tuned from data. Overlapping intervals across sources are clipped (`trim_overlap`).

## Agent-waste ledger

CI rework (extra Source Validation rounds per merged PR, same query as `scripts/ci-rounds-report.mjs`),
duplicate builds (a JOV id with a closed-unmerged twin), PRs closed unmerged, stale drafts, runs that ended
without landing, idle and no-change wakes (`gate-deferred`, `reconcile-unavailable`, `idle-exits.jsonl`,
coordinator task notifications answered with a text-only reply), merge-queue failures (merge-group runs and
`docs/metrics/shipping-slo-latest.json`), host overload alarms (`host-alarms.jsonl`), and local token cost per
merged PR. Lane state comes from the Gem state dir (`--state-dir`). A feed that cannot be read is reported
`available: false`, never zero. Agent-hour weights are documented constants in `agent_waste.py`.

## Proposals loop

`proposals.rank`: score = `(Tim-hours saved * 10 + agent-hours saved) * confidence / build-cost-hours`,
where saved = measured weekly base * expected reduction. Each proposal carries evidence counts, the automation,
an estimate, an owner and `needsReservedDecision`. `proposals.crossed` lists threshold crossings (daily check).
`proposals.evaluate` compares a shipped proposal's metric with its baseline after 7 days and returns `reopen`
when it shrank less than 20%.

Summer's job: weekly (and on any crossing) run `run.sh weekly|check`, file the top items as Linear issues in the
right project, build those with `needsReservedDecision: false`, record `{issue, shippedAt, baseline}` in
`proposals-state.json` in the private store when one ships, and reopen on an `evaluate` reopen verdict.

## Surface

`python3 -m timewaste surface --json` emits `time-leverage/v1`. Ovie receives it at
`/api/internal/ovie/time-leverage` (POST with the cron secret, GET for admins or Summer OIDC; shipped in the
Ovie PR) and renders a compact card on the ops HUD; Summer's morning brief appends the same lines (`brief_lines`).
