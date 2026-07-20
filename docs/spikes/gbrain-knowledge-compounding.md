# GBrain Knowledge Compounding Spike

> Issue: [#13048](https://github.com/JovieInc/Jovie/issues/13048)

Goal: turn recurring source data into durable gbrain summaries with source
links, timestamps, operational facts, and stable decision records.

## Connectors

Sources: GitHub, Linear, Hermes/OpenClaw, Stripe reports, CRM/Airtable,
Slack/Telegram, Sentry/Vercel, and Web/Exa. Guardrails: bounded summarized
notes, no raw logs/customer polling/contact dumps, and explicit web budget.

## Proposed Jobs

| Job | Schedule | Script | Delivery | Cost |
|---|---:|---|---|---|
| GBrain health summary | Daily 07:15 local | `scripts/hermes/jobs/gbrain-health-summary.ts` | Telegram/Slack + `ops/gbrain-health/latest` | One Tailscale HTTP probe plus bounded local diagnostics |
| Agent performance digest | Daily 07:30 local | Extend `pipeline-scoreboard.ts` or sibling digest | Telegram + `ops/agent-health/latest` | Local logs unless GitHub enrichment is added |
| Hourly degradation alert | Hourly | Reuse health summary with transition state | Telegram/Slack on change | Local CLI calls |
| Weekly trend scrape | Mondays 08:00 local | New Exa/web research job | GBrain + Telegram excerpt | Needs approved provider budget |
| Monthly KR snapshot | First day 08:00 local | New metrics collector | GBrain structured claims | Prefer existing reports |

No Vercel cron is added. These are Hermes-Air control-plane jobs, not product
traffic. Decision flow: search gbrain, read current repo docs, make a quantified
Ship now / Re-evaluate when / Then decision, then write the durable learning.
