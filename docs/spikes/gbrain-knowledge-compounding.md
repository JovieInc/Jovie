# GBrain Knowledge Compounding Spike

> Symphony is the shipping lanes harness (`scripts/lanes/README.md`). The Symphony Elixir control plane is retired from Jovie; paths written `symphony-control/...` live in the private repo JovieInc/symphony-control (full history).

> Issue: [#13048](https://github.com/JovieInc/Jovie/issues/13048)

Goal: turn recurring source data into durable gbrain summaries with source
links, timestamps, operational facts, and stable decision records.

## Landed slice (health digest → durable claims)

Jovie now owns the compounding hop in-repo:

| Piece | Path |
|---|---|
| Digest + claims + put/read-back | [`scripts/gbrain-compounding/`](../../scripts/gbrain-compounding/) |
| Operator runbook | [`scripts/gbrain-compounding/README.md`](../../scripts/gbrain-compounding/README.md) |
| Manual verify workflow | [`.github/workflows/gbrain-compounding.yml`](../../.github/workflows/gbrain-compounding.yml) (`workflow_dispatch` only; no new cron) |

When gbrain is live, the compounder writes `ops/gbrain-health/latest`, per-day
claim pages under `ops/gbrain-health/claims/<date>/`, and
`ops/gbrain-health/claims/index`. When the CLI/daemon is missing it exits 0 with
explicit `status: needs-probe` / `reason: gbrain-unavailable` and optionally
buffers pages to `--buffer-dir` — never a silent skip.

**Ship now:** health-digest compounding with fail-closed/needs-probe.
**Re-evaluate when:** Gem/Hermes host runs the compounder after the daily
health summary and agents retrieve claim pages in a real session.
**Then:** land agent-performance digest and hourly degradation alert from the
table below (still control-plane, not Vercel cron).

## Connectors

Sources: GitHub, Linear, Hermes/OpenClaw, Stripe reports, CRM/Airtable,
Slack/Telegram, Sentry/Vercel, and Web/Exa. Guardrails: bounded summarized
notes, no raw logs/customer polling/contact dumps, and explicit web budget.

## Proposed Jobs

| Job | Schedule | Script | Delivery | Cost |
|---|---:|---|---|---|
| GBrain health summary | Daily 07:15 local | `symphony-control/jobs/gbrain-health-summary.ts` | Telegram/Slack + `ops/gbrain-health/latest` | One Tailscale HTTP probe plus bounded local diagnostics |
| **Health digest → durable claims** | After health summary (same host) | `scripts/gbrain-compounding/run.mjs` | `ops/gbrain-health/claims/*` + index | Local CLI put + read-back |
| Agent performance digest | Daily 07:30 local | Extend `pipeline-scoreboard.ts` or sibling digest | Telegram + `ops/agent-health/latest` | Local logs unless GitHub enrichment is added |
| Hourly degradation alert | Hourly | Reuse health summary with transition state | Telegram/Slack on change | Local CLI calls |
| Weekly trend scrape | Mondays 08:00 local | New Exa/web research job | GBrain + Telegram excerpt | Needs approved provider budget |
| Monthly KR snapshot | First day 08:00 local | New metrics collector | GBrain structured claims | Prefer existing reports |

No Vercel cron is added. These are Hermes-Air control-plane jobs, not product
traffic. Decision flow: search gbrain, read current repo docs, make a quantified
Ship now / Re-evaluate when / Then decision, then write the durable learning.
