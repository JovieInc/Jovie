# Voice of customer (VOC)

Continuous mining of public complaints and payment objections about the tools
Jovie replaces (JOV-7701). The output is first-class signal for offer, copy,
proof, the funnel persona judge and product gaps.

## Categories

`link-in-bio`, `smart-link`, `epk`, `fan-crm`, `storefront`,
`music-marketing`, `contact-card`, `launch-kit`, `founder-site`.

## Privacy and naming

- Real product names live only in the private targets list: gbrain
  `ops/voc/targets` (canonical) and the `VOC_TARGETS_JSON` secret for CI.
  Brand-scrub blocks competitor names in this repo, so repo files use
  anonymized ids such as `lib-01`.
- Items keep a short quote (at most 280 characters) and the source URL. No
  reviewer names or other personal data are stored.
- Sources follow site terms: Apple's public review RSS feed, the Hacker News
  Algolia API, and Exa search/contents (licensed index, about $0.60 per full
  run). Reddit and X are not mined: Reddit blocks crawlers and its API terms
  rule out scraping.

## Run

On demand, from a machine with gbrain and `EXA_API_KEY`:

```bash
node scripts/voc/voc-mine.mjs --days 540 --out items.jsonl \
  --private-out items.private.jsonl --gbrain --work-dir "$TMPDIR"
```

Targets come from `--targets <file>`, else `VOC_TARGETS_JSON`, else the
`json voc-targets` block on gbrain `ops/voc/targets`.

`--gbrain` writes the dated receipt `ops/voc/runs/<date>` and refreshes
`ops/voc/index`, whose `voc-trend` block keeps per-run theme counts so
frequency is a series. Options: `--category <id>`, `--sources
appstore,hn,exa,trustpilot`, `--days <n>`.

Weekly: `.github/workflows/voc-mine.yml` (Mondays) runs the same collector and
uploads the anonymized `items.jsonl` and summary as an artifact. It skips until
the `VOC_TARGETS_JSON` and `EXA_API_KEY` repository secrets exist.

## Synthesis and consumers

The deterministic classifier only tags and counts. The agent that runs the
miner (subscription model, never a raw model API key) curates each run into
`ops/voc/reports/<date>` and routes it:

| Consumer | What it gets |
|---|---|
| Funnel persona judge (`scripts/funnel-judge`) | `persona-objections.json`: mined objections each persona carries, with VOC item ids |
| Offer variants | Ranked payment objections per category |
| Proof registry | Proof gaps: claims the offer needs before copy can use them |
| Copy candidates (JOV-7790) | Customer language for headlines and objection handling |
| Linear | One issue per repeated product-gap theme, parented to JOV-7701, labeled `no-symphony` |

Only open a Linear issue when a theme repeats across runs or sources. Never
open one per review.

## Verify

```bash
node --test scripts/voc/voc-mine.test.mjs
```
