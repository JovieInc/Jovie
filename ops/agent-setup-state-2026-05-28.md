---
type: note
title: Agent Setup State — 2026-05-28
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T01:24:43.158Z'
source_kind: 'mcp:put_page'
tags:
  - air
  - crons
  - hermes
  - mbp
  - ops
  - setup
  - web-ui
---

# Agent Setup State — 2026-05-28

## Machines

### tims-macbook-air (Summer's primary)
- Model: MacBook Air M2, 16GB, macOS 26.1
- Hermes: v0.15.1 (Air) at `~/.hermes/hermes-agent`
- Role: Chief of Staff, sole gateway, gbrain host
- Gateway: `ai.hermes.gateway` (launchd, port via tailscale)
- GBrain: Postgres 16, Ollama nomic-embed-text, 1,271 pages
- Tailscale: 100.106.27.46
- Web UIs:
  - Hermes Dashboard: http://127.0.0.1:9119
  - GBrain Admin: http://127.0.0.1:8765 (launchd: ai.hermes.gbrain-admin)

### tims-macbook-pro (Coding machine)
- Model: MacBook Pro M5, 32GB, macOS 25.2
- Hermes: v0.15.1 at `~/.hermes/hermes-agent`
- Role: Coding sub-agent target, NO gateway (Air is sole gateway)
- SSH: `ssh -i ~/.ssh/id_ed25519 timwhite@tims-macbook-pro`
- Tailscale: 100.115.191.120
- Note: Full PATH requires: `export PATH=~/.bun/bin:~/.nvm/versions/node/v22.22.0/bin:~/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`

## Model Routing
| Task | Model |
|------|-------|
| Summer (default) | openrouter/owl-alpha |
| Planning/Writing | kimi-2.6 or deepseek-v4-pro |
| Coding | deepseek-v4-pro via sub-agents on MBP |
| Easy tasks | owl-alpha |

## Cron Jobs (15 total)
### High-signal (deliver to origin/Telegram)
1. `Jovie Founder Morning Briefing` — daily 8am
2. `OpenRouter Daily Cost Watch` — daily 8am
3. `inbox-ops-poll` — 2x/day (8am, 8pm)
4. `Weekly 20% AI Improvement Research` — weekly

### Silent (deliver to local/HUD only)
5. `summer-health-check` — every 60min
6. `Jovie P0 Watch` — every 120min
7. `Sentry Auto-Fix` — every 120min
8. `PR Captain` — every 180min
9. `Design-System Auditor` — daily 7am
10. `CFO Cost Audit` — daily 9am
11. `startup-deals-collect` — every 360min
12. `summer-gbrain-sync` — every 15min
13. `voice-style-daily` — daily 10pm
14. `Weekly GBrain Doctor` — Sunday 3am
15. `Auto-update Hermes + GStack + Tools` — Sunday 3am

## Principles
- Always check gbrain before burning tokens
- Always write back to gbrain
- Orchestrate only, never code yourself
- Use sub-agents with correct profiles
- Trigger-based > polling; poll max 2x/day unless justified
- Cheap models for easy, premium only where it matters
- High-signal channel: only human-actionable items reach Tim
