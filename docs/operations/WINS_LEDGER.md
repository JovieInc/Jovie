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
PR merges, `wins-ledger.yml` runs `node scripts/wins-ledger.mjs ingest --pr N` and
opens a bot PR appending the record. `## Win` of `n/a` records nothing.

## Status is computed, not stored

| Status | Meaning |
|---|---|
| `pending-merge` | A listed PR is not merged. Never counted. |
| `unverified` | No sourced before number. |
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
