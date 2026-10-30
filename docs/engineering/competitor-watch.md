# Competitor watch and fast-adopt pipeline

One feed of what the fastest-shipping vendors just released, tied to our research, so we know what is possible the moment someone else figures it out. Cost target: $0 incremental (Cloudflare Workers, D1 and Workers AI on credits).

## Stages

| Stage | Where | Notes |
| --- | --- | --- |
| Ingest | `workers/competitor-watch` (cron `7 * * * *`) | Sources in `sources.json`. RSS/Atom with ETag and If-Modified-Since, index-page links, or page-watch for changelogs with no feed. Stores link, title, our own short summary and dates. Never article text. |
| Triage | same Worker, Workers AI `@cf/meta/llama-3.1-8b-instruct-fast` | Outputs relevance 0-5, surfaces (jovie, ovie, lyb, chat, search, design), kind, `adoptable_now`, `cost_saving`, one-line why. |
| Route | `scripts/competitor-watch/route.mjs` | `cost-loop` (cost saving, relevance 3+), `adopt` (adoptable, 4+), `idea-radar` (security notices and 5s). Evidence is a `jovie.canonical-evidence/v1` object via the Idea Radar normalizer (JOV-5916), no separate ledger. Linear payloads are for executable next actions only. Research links come from gbrain `research/*` and `decisions/*`. |
| Mark | `POST /items/:id/routed` | Idempotent routing: an item routes once. |

Measurement: every item carries `published_at`, `first_seen_at`, `triaged_at`, `routed_at`. `GET /metrics` returns per-source counts. Publish-to-seen and seen-to-routed lag (p50/p95) are the numbers to drive down.

Known limits: the 8B triage model over-scores generic AI news, so the router requires a concrete flag (`adoptable_now` or `cost_saving`) except for a 5. xAI's `x.ai/news` and Replit's blog return 403 to Workers egress; xAI is covered through `docs.x.ai` release notes, Replit is disabled in `sources.json` until polled from another host.

## People and deferred sources

`sources.json` entries have `type: company | person`. People are followed through their own blogs, newsletters, personal-site feeds and GitHub release feeds (Boris Cherny's blog and Claude Code releases, Lauren Tan's site and noodle releases, Simon Willison, Karpathy, Geoffrey Litt, Peter Steinberger, Latent Space, Cursor's changelog and blog, OpenAI Developers blog and Codex releases). To add someone, append an entry.

Deferred, listed under `deferred` in `sources.json` with a revisit trigger:
- **X/Twitter**: no free, compliant RSS and the API is paid; we do not scrape. Revisit if a free or official feed appears, or if MRR justifies the API cost.
- **YouTube and podcasts**: per-channel YouTube RSS is free (`youtube.com/feeds/videos.xml?channel_id=...`); add once channel ids are confirmed.

## Fast-adopt path

An item routed to `adopt` is a small PR, not a promise. It extends existing machinery; nothing new is built.

1. **Flag.** The change ships off behind a boolean flag in `apps/web/lib/flags/contracts.ts` (registry in `registry.ts`, Statsig-backed). A vendor component, model id or SDK feature is never enabled by default.
2. **Machine gates, all must be green.** Unit and type tests; the dogfood judge on the flagged surface; the cold-screenshot test; the security ratchet and suppression audit (`security-suppression-audit.yml`); a license and provenance check for any copied code (vendor UI is reimplemented from the idea, never pasted). Red stops the pipeline; the PR is fixed or closed, never bypassed.
3. **Canary.** On merge the flag auto-enables for a canary cohort (internal and a small percentage). Rollout is recorded as an experiment line in `canon/growth-experiments.jsonl`: hypothesis, primary metric, window, decision.
4. **Measure, then decide.** At the end of the window: keep (widen the flag, then remove it), or revert (flag off, PR reverted). The decision and the measured delta are written back to the experiment line and to the originating Linear issue.
5. **Hour target.** Detection to canary within one hour is the goal for items that are small, flagged and fully machine-verifiable. If any gate cannot be evaluated autonomously, the item stops at a Linear issue and waits; a green gate set is the only thing that lets it proceed.

Gate status note: the flag registry, experiment ledger and suppression audit exist today. The dogfood judge and cold-screenshot gates are tracked separately; until they are required checks on main, `adopt` items stop after step 1 and open the PR as draft.

## Reader UI

Deferred. The Ovie tasks list/detail components are not on `main` (apps/ovie is a shell), so a News view would be a second implementation rather than a reuse. Revisit when the tasks view lands; the Worker already serves `GET /items` for it.

## Operating

- Add a source: append to `workers/competitor-watch/sources.json`, deploy with `wrangler deploy`.
- Secrets: `READ_TOKEN` (Worker secret). The router reads `COMPETITOR_WATCH_URL` and `COMPETITOR_WATCH_TOKEN`.
- Schema: `workers/competitor-watch/schema.sql`, applied with `wrangler d1 execute jovie-competitor-watch --remote --file schema.sql`.
