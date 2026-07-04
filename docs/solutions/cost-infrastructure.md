# Cost Infrastructure

## Problem
Multiple AI agent subscriptions with different pricing models, running across Cron jobs and shipping pipelines. Need cost tracking, auto-tuning, and budget enforcement.

## Solution
Two-tier system: daily cost report + weekly auto-tune suggestions.

## Cost Tracker (daily)
- Script: `cost-tracker.py` (deployed on Hermes)
- Parses agent.log files for "API call #" entries
- Tracks: model, calls, input/output tokens, estimated cost
- Pricing (USD per 1M tokens):
  - deepseek-v4-flash: $0.50
  - minimax-m3: $3.00
  - claude-opus-4-7: $30.00
- Output: markdown report + structured daily.json

## Auto-Tune (weekly, Monday 9am)
- Analyzes 7-day success rate per job
- Rules:
  - minimax-m3 with ≥95% success rate → suggest deepseek-flash (cheaper)
  - deepseek-flash with <80% success rate → suggest minimax-m3 (better quality)
  - Never auto-apply — Tim reviews suggestions

## Budget ceilings
- hyperagent.com: $1000/day hard cap
- Grok: $300/week (resets Monday)
- ChatGPT/Codex: $200/month (ChatGPT Plus)
- OpenRouter free tier: $0/day
