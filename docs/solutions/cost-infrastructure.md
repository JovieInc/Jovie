# Cost Infrastructure

## Problem
Multiple AI agent subscriptions with different pricing models, running across
Cron jobs and shipping pipelines. Agents consume API credits across OpenRouter,
Vercel AI Gateway, and ChatGPT subs, so daily spend, trends, and model fit need
explicit tracking, auto-tuning, and budget enforcement.

## Solution
Two-tier system: daily cost report + weekly auto-tune suggestions. Budget caps
stay human-approved; suggestions never auto-apply.

## Cost Tracker (daily)
- Script: `~/.hermes/profiles/summer/scripts/cost-tracker.py`
- Cron: `55 23 * * *`
- Parses agent.log files for "API call #" entries
- Tracks: model, calls, input/output tokens, estimated cost
- Output: markdown report + structured `daily.json`

## Auto-Tune (weekly, Monday 9am)
- Script: `~/.hermes/profiles/summer/scripts/cost-autotune.py`
- Cron: `0 9 * * 1`
- Analyzes 7-day success rate per job
- Rules:
  - minimax-m3 with ≥95% success rate → suggest deepseek-flash (cheaper)
  - deepseek-flash with <80% success rate → suggest minimax-m3 (better quality)
  - Skip opus jobs (specialist only)
  - Never auto-apply — Tim reviews suggestions

## Pricing Table (USD per 1M tokens)

| Model | Input Cost | Tier |
|---|---:|---|
| google/gemma-4-31b-it:free | $0.00 | Free |
| deepseek/deepseek-v4-flash | $0.15 | Cheap |
| minimax/minimax-m3 | $3.00 | Mid |
| claude-opus-4-8 | $30.00 | Heavy |

## Budget ceilings
- hyperagent.com: $1000/day hard cap
- Grok: $300/week (resets Monday)
- ChatGPT/Codex: $200/month (ChatGPT Plus)
- OpenRouter free tier: $0/day

## First applied auto-tune
RevenueCat Config Health Check: deepseek-flash → minimax-m3
(was failing 80%, HTTP 401 from missing cookie auth — model can't help)
