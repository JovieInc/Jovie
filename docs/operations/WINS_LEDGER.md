# Engineering wins ledger

Owner: Summer (inbound content loop). Source: `canon/wins/wins.jsonl`
(`jovie.win/v1`). Rule: [one source of truth](../../.claude/rules/source-of-truth.md);
domain `engineering-wins`.

Every engineering win is data. A record has an id and date, an area, a one-line
claim, a theme, metrics (before, after, unit, direction, source, query), the PRs,
a verification link and post-deploy receipts. Prose in posts and pages derives
from it and never restates a number.

## How a win is created

A PR with a measurable before/after fills the `## Win` section of the PR template
(one `Metric:` line per number). Fleet Rules rejects a malformed section. When the
PR merges, `wins-ledger.yml` runs `node scripts/wins-ledger.mjs ingest --pr N --store` and
writes the record to the runtime store (`summer-company/wins-ledger/<id>.json`, create-only). No bot PR: data is not shipped as PRs (JovieInc/ci `canon/COMPANY.md`, "Data vs behaviour"). Without store credentials the Win stays in the merged PR body. `## Win` of `n/a` records nothing.

## Capture is automatic

- **Required.** A PR labeled `compounding`, or titled as ci, perf, build, queue, throughput or preflight work, fails Fleet Rules until its `## Win` section has a measured win. `n/a` does not satisfy it. The failure message prints a paste-ready template.
- **Fields.** Metric name, before, after, delta (computed), method (the `query`), source and evidence (`Verify` plus receipts).
- **No number yet.** Use `?` for the after-value and add `- Pending: yes`. The win is `pending-measure` and never counted. `node scripts/wins-ledger.mjs due` lists merged wins 24 hours past merge that still need their receipt. Wiring that list to a production-deploy trigger is the next step.
- **On merge.** `wins-ledger.yml` writes the record to the store. `summary --write` and `rollup --write` are derived views run on demand, never committed by automation.
- **Weekly rollup.** `rollup` gives, per week: wins, verified, claimed, merges per day, lead time p50 (PR created to merged), and seconds saved per merge for metrics tagged `Per-merge: yes`, split by verified and claimed. CI minutes and cost per merged PR are not measured here. Dollars never go in this repo; they belong in the private ops store.
- **Proof-stats.** Decks, applications and posts read aggregates from the proof-stats registry. Posting the rollup to its intake endpoint follows once #23697 merges.
- **Summer.** `notify` prints one line per verified win that improved a metric by 20 percent or more. Delivery over iMessage is blocked until Summer has its own Photon credential (see SUMMER_COMMISSIONING.md); the line is ready when it does.

## Status is computed, not stored

| Status | Meaning |
|---|---|
| `pending-merge` | A listed PR is not merged. Never counted. |
| `unverified` | No sourced before number. |
| `pending-measure` | Merged, after-value measured once live (`Pending: yes`). Never counted. |
| `claimed` | Numbers come from the PR body or a pre-merge run. |
| `verified` | Every metric has a receipt taken after the last merge that keeps at least half the claimed gain (20% of `before` when no after is claimed). |
| `not-reproduced` | A post-merge receipt exists and the gain did not hold. |

Record a re-measurement with `node scripts/wins-ledger.mjs receipt --id ID --metric NAME --value N --evidence URL [--sha SHA]`.
Only machine-readable evidence (a run, a query result) counts.

## Clustering and posts

`clusters()` groups by `theme`. A theme with ten verified wins, or a win flagged
`headline` that is verified, is ready for a draft engineering post (see
`docs/marketing/ENGINEERING_POSTS.md`). `docs/metrics/wins-latest.json` holds the
weekly counts Summer reads.

**Ship now:** ledger, ingest on merge, computed status, Fleet Rules check.
**Re-evaluate when:** more than half of claimed wins stay unverified after a week.
**Then:** add automatic re-measurement probes per metric source.
