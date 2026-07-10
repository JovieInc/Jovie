# Jovie Strategy

## Build Philosophy

### Compound Engineering
Jovie uses the **Compound Engineering** loop: Ideate → Brainstorm → Plan → Work → Compound.

This replaces traditional ship cycles. The loop runs faster and more autonomously with each iteration.

### Pipeline
1. **Plan:** An issue gets `tim-approved` label after planning review
2. **Ship:** Codex CLI shipper (ChatGPT $200 sub) or Codex/veronica (OpenRouter/Anthropic) picks up approved issues
3. **Review:** Automated CI + lint + tests only. Taste decisions are made at planning time, not code review
4. **Merge:** Auto-merge when CI passes with `merge-queue` label

### Agent Fleet
- **Zoe** (OpenClaw): Communications & intelligence, outer-loop orchestration
- **Eve** (HyperAgent + Fable 5): Planner / PM, specs issues, routes to build models
- **Developer** (HyperAgent + Fable 5 -> Haiku): Implements from spec, opens PRs
- **Codex CLI:** Active coder via ChatGPT sub
- **Summer / Coder / Coder-Flash:** Hermes fleet for monitoring, analysis, cost management

### Model Tiers
| Tier | Model | Provider | Use |
|---|---|---|---|
| 🟢 Free | google/gemma-4-31b-it:free | OpenRouter | Monitoring, analysis |
| 🔵 Cheap | deepseek/deepseek-v4-flash | OpenRouter | Coding, planning |
| 🟡 Mid | minimax/minimax-m3 | Vercel Gateway | Complex analysis |
| 🔴 Heavy | grok-composer-2.5-fast | Grok CLI | Self-heal, escalation |
| 🟣 Specialist | Fable 5 / Opus | HyperAgent / Anthropic | Planning, orchestration |

## Repository Structure

### Key Directories
- `apps/web/`: Next.js web application (HUD, marketing, admin)
- `apps/desktop/`: Electron desktop app
- `apps/ios/`: Swift iOS app
- `scripts/hermes/`: Hermes fleet agent code
- `docs/solutions/`: Compound engineering solution docs
- `docs/decisions/`: Architecture decision records

### Routes
- `/app/admin/ops`: canonical admin Ops surface (Ovie shipping cockpit)
- `/hud`: legacy compatibility redirect to `/app/admin/ops`
- `/hud-tv?kiosk=...`: thin token-authenticated fullscreen wrapper
- `/hud/wiki`: Company wiki backed by gbrain
- `/signin`, `/signup`: Auth flows
- `/app/`: Authenticated app shell

## Infrastructure
- **gbrain:** Knowledge graph / wiki backend (Postgres + Supabase + `text-embedding-3-small`)
- **gbrain MCP:** SSE-streamable HTTP endpoint on :7801
- **Vercel:** Web hosting
- **HyperAgent:** Agent fleet hosting (hyperagent.com, OAuth MCP)
- **Cloudflare:** Tunnel (for exposing gbrain to prod)

## Operations
- Weekly health check (Monday 10 AM PT)
- Daily cost report (10 PM PT)
- Monday cost auto-tune (9 AM PT)
- Shipping watchdog runs every 20 minutes
