---
paths: ["packages/research/**", "scripts/voc/**", "scripts/ops/firecrawl-crawl.sh"]
---

# Research and decisions

One router for all research: `jovie-research` (package `packages/research`,
also an MCP server via `jovie-research mcp`). Do not call Exa, Firecrawl,
Perplexity, Hyperagent or web search APIs directly from agents or scripts.

## When to research

Research before an architectural, vendor, pricing or tooling decision, and
before building a commodity capability (see the prior-art gate in
`canon/ENGINEERING.md`). Do not research purely local code questions; read the
code. One question per call; split compound questions.

## How

```bash
jovie-research ask "<question>"                 # standard: stops at the first tier that answers
jovie-research ask "<q>" --mode quick           # fewer results, cheapest path
jovie-research ask "<q>" --mode deep            # adds a Hyperagent research thread (minutes)
jovie-research ask "<q>" --social --fresh week  # adds last30days (Reddit, HN, X, YouTube)
jovie-research ask "<q>" --local                # gbrain + repo only, never spends
```

Pass `--fresh live|day|week|month|evergreen` when you know it; otherwise the
router infers it. Output is bounded (8 hits, short snippets); use `--json` only
when a program consumes it.

## Tier order (enforced by the router)

0. **Local, free:** cache, gbrain research pages, gbrain search, repo docs and
   source (rg).
1. **Credits / free plans:** Cloudflare Browser Rendering for URLs, Firecrawl
   search (plan credits), last30days, Hyperagent threads (deep mode).
2. **Paid:** Exa. Perplexity is configured but off until funded.

A decision model scores every hit 0-3 after each tier (Cloudflare Clef-flash on
credits first, Jev on the AI Gateway as fallback). Junk is dropped, and the
router escalates only when too few hits are relevant.

## Caps and caching

- Per-source daily and monthly call/USD caps live in
  `packages/research/sources.json`. A capped source is skipped, never retried.
  Raising a cap or enabling a paid source is new spend: ask Tim.
- Every provider call goes through `@jovie/api-client` (shared rate-limit
  ledger, breaker, retries).
- Results are cached by normalized query with a TTL per freshness class
  (15m live to 90d evergreen), shared by every agent on the host
  (`~/.local/state/jovie-research`). Identical in-flight queries wait for one
  run. `--refresh` bypasses the read, not the caps.
- `jovie-research stats` and `jovie-research sources` show cost, latency,
  cache-hit rate and remaining caps.

## Where results and decisions go

- Escalated results are saved as gbrain pages `research/q-<key>` (sources,
  date, query provenance, expiry). Do not paste raw search dumps elsewhere.
- Decisions: `jovie-research decision record --file d.json` writes
  `decisions/<area>/<slug>` with context, options, evidence and
  **Ship now / Re-evaluate when / Then**, plus a gbrain take.
- Before changing anything a decision covers, run
  `jovie-research decision find "<topic>"`. Research output lists related
  decisions first; do not silently undo them.
- When a new model, tool, price or data point may invalidate one:
  `jovie-research decision trigger --kind model --trigger "<what changed>"`.
  It creates a linked review page and never edits the old decision. Resolve
  with `decision resolve <review> --kept|--superseded`. A changed decision is a
  new record with `"supersedes"`.
- `jovie-research decision check <slug>` shows contradiction findings and
  takes for one decision.
