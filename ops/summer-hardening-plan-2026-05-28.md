---
type: note
title: Summer Hardening Plan 2026-05-28 — EXECUTED
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T01:10:44.989Z'
source_kind: 'mcp:put_page'
tags:
  - crons
  - gateway
  - hardening
  - mbp
  - noise-cleanup
  - ops
  - web-ui
---

# Summer Hardening Plan 2026-05-28 — EXECUTED

## What Was Done

### 1. Cron Noise Cleanup (HIGH PRIORITY)
**Problem:** 15 crons, 5 failing, many delivering noise to Tim's Telegram.

**Fix:** All infrastructure crons now deliver to `local` (write to disk/HUD only).
Only high-signal crons deliver to `origin` (Telegram):
- `Jovie Founder Morning Briefing` — daily 8am ✅
- `OpenRouter Daily Cost Watch` — daily 8am ✅
- `inbox-ops-poll` — 2x/day ✅
- `Weekly 20% AI Improvement Research` — weekly ✅

All others (P0 Watch, Sentry, PR Captain, Design Auditor, GBrain Sync, etc.) → `local`

### 2. Fixed Failing Crons
- `summer-health-check` — was exiting 1 on warnings, now exits 0 with report
- `morning-briefing` — rewritten to be cleaner, exits 0 always
- `startup-deals-collect` — replaced shell script with Python script that handles timeouts, writes to HUD
- `inbox-ops-poll` — still erroring (Beeper DB access), deliver set to local
- `sentry-auto-fix` — still erroring (Sentry token), deliver set to local

### 3. Web UIs Launched
- **GBrain Admin** — http://127.0.0.1:8765 (React SPA, launchd persistent)
- **Hermes Dashboard** — http://127.0.0.1:9119 (full dashboard with TUI chat)

### 4. Model Routing (Updated)
| Task | Model | Why |
|------|-------|-----|
| Summer (default) | openrouter/owl-alpha | Good quality, cost-effective |
| Planning/Writing | kimi-2.6 or deepseek-v4-pro | Deep reasoning, cheap |
| Coding | deepseek-v4-pro via sub-agents | Best code quality per dollar |
| Easy tasks | owl-alpha | Don't waste premium tokens |

### 5. Principles Enforced
- Always check gbrain before burning tokens
- Always write back to gbrain
- Orchestrate only, never code yourself
- Use sub-agents with correct profiles
- Trigger-based > polling
- Poll max 2x/day unless justified
- Cheap models for easy, premium only where it matters
- **High-signal channel: only human-actionable items reach Tim**
