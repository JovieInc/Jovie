# Coding Agent Run Ingestion (JOV-6508)

Receipts for external coding-agent runs (Hyperagent threads, Devin sessions,
Cursor, GrokBot) land in the `coding_agent_runs` table — separate from
`agent_runs`, which audits in-product agents.

## Pipeline

| Step | Script | Schedule |
|---|---|---|
| Ingest | `scripts/agents/ingest-runs.ts` | hourly, launchd `co.jovie.hermes.cron-agent-ingest` |
| Label  | `scripts/agents/label-outcomes.ts` | daily, launchd `co.jovie.hermes.cron-agent-label` |

Both are Hermes-Air launchd jobs (templates in `scripts/hermes/launchd/`),
secrets rendered to `~/.hermes/.env` by `bootstrap-air.sh`. Watermark lives at
`~/.hermes/state/coding-agent-ingest-watermark.json` — delete it to force a
fresh `INGEST_BACKFILL_DAYS` (default 30) backfill.

## Semantics

- `model_name` is the **exact** provider-reported model string, never a route
  name. Hyperagent does not report per-thread models — the importer maps the
  agent's display name (e.g. "GLM 5.3 Flash Developer" → `glm-5.3-flash`) and
  otherwise leaves it NULL with a `notes` explanation. Never guess.
- `cost_usd` + `cost_source`: `actual` = billed USD from the provider;
  `estimated` = backfill estimate (method noted in `notes`). Neither the
  Hyperagent MCP nor the Devin API currently exposes per-session billed USD —
  those rows are `estimated`/NULL until a billing endpoint exists.
- `prompt_digest` is SHA-256 hex of the task prompt. Prompt text is never
  stored. `tools_used` is `{tool_name: count}` — no payloads.
- `outcome_label`: `open` until the 7-day post-merge window closes, then
  `landed`; `reverted`/`failed` can land earlier on signal. Closed-unmerged
  PRs are `abandoned`. Transitions are pure functions in
  `apps/web/lib/coding-agent-runs/outcomes.ts`.

## Jev query surface

`cost_per_landed_pr` SQL view and `costPerLandedPr()` helper
(`apps/web/lib/coding-agent-runs/cost-per-landed-pr.ts`):

```
sum(cost_usd where cost_source='actual' and outcome_label='landed')
  / count(outcome_label='landed')
```

grouped by `source` + `model_name`, optional `windowDays` filter on
`merge_timestamp`. Estimated-cost rows never enter the numerator.

## Provider credentials

| Source | Auth |
|---|---|
| hyperagent | OAuth token file `~/.config/hyperagent/mcp-oauth.json` (self-refreshing); `HYPERAGENT_MCP_TOKEN` env is a last-resort fallback — Doppler snapshots rot in ~15 min |
| devin | `DEVIN_API_KEY` org service key (not yet provisioned — importer skips gracefully) |
| github | `GH_TOKEN`/`GITHUB_TOKEN`/`HUD_GITHUB_TOKEN` for PR state, check runs, revert join |
| sentry | `SENTRY_AUTH_TOKEN` + `SENTRY_ORG_SLUG` for post-land incident join |
