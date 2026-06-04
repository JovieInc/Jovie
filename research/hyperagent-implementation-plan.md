---
type: research
title: HyperAgent — Full Research & Implementation Plan
created: '2026-06-03T00:00:00.000Z'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T22:58:45.090Z'
source_kind: 'mcp:put_page'
tags:
  - airtable
  - api
  - deep-research
  - exa
  - fundraising
  - hyperagent
  - june-2026
  - marketing
  - mcp
---

# HyperAgent — Full Research & Implementation Plan

## What It Is
Autonomous agent platform built by Airtable team (Formagrid Inc.). Tim has $20K credits from Founding 500 program.

## Core Concepts
- **Agent** = persistent identity with name, system prompt, tools, accumulated knowledge
- **Thread** = single work session (browse, code, generate artifacts)
- **Skill** = reusable method taught to agent (API usage, workflow patterns)
- **Memory** = facts retained across sessions
- **Rubric** = evaluation framework for output quality

## Agent Configuration
1. **Identity** — Name, icon, system prompt
2. **Model** — Claude Opus/Sonnet, effort level, thinking tokens, budget cap (cost control!)
3. **Invocations** — Thread, Slack, Telegram, Scheduled, Webhook/API, Email, Live Mode
4. **Tools** — Web search, image/video/audio gen, code execution, docs, slides, maps
5. **Integrations** — GitHub, Slack, Google Sheets, Gmail (OAuth)

## API / MCP Access
- **Webhook/API**: Each agent exposes an HTTP POST endpoint
- **MCP Client**: Full MCP support — connect to any MCP server (Google Sheets, Notion, Slack, GitHub, Airtable, Exa via Composio)
- **Custom Actions**: Define tools with Zod schemas for any API
- **Note**: MCP Server invocation (exposing agent as tool) is "coming soon"

## Cost Monitoring for $20K Credits
- Per-thread and per-agent cost tracking built in
- **Budget caps** on every agent (critical!)
- Use cheaper models (Sonnet) for routine tasks, Opus only for complex work
- Set effort level and thinking tokens conservatively
- Review per-agent costs weekly
- **Recommendation**: Create a "Cost Monitor" scheduled agent that checks burn rate weekly

## Recommended Workflows

### 1. Fundraising (Highest Priority)
**3-4 specialized agents:**
- **Investor Research Agent** (scheduled, daily) — Search VCs, extract fund data, score fit → Google Sheets
- **Outreach Drafting Agent** (on-demand) — Research investor, draft personalized email → Gmail
- **CRM/Pipeline Tracker** (scheduled, daily) — Scan replies, update CRM, flag hot leads → Slack/Telegram
- **Follow-Up Agent** (scheduled) — Check CRM for stale leads, draft contextual follow-ups

### 2. Marketing Content
**2-3 agents:**
- **Content Research & Drafting** (scheduled, 3x/week) — Monitor trends, draft LinkedIn posts, generate images
- **Content Repurposing** (webhook) — Long-form → Twitter thread, carousel, video script
- **VP Marketing** (weekly) — Review performance, generate reports, recommend priorities

### 3. Deep Research (with Exa)
- Use built-in web search for most research
- For neural search: integrate Exa via Custom Action or MCP server
- **Deep Researcher agent**: Decompose questions → parallel searches → synthesize → structured report
- Set budget caps; use effort level to control depth

## Gotchas
- MCP Server invocation (exposing agent as tool) = "coming soon"
- No native CRM (Salesforce/HubSpot) — use Skills or Composio MCP
- Credits = inference only, not third-party API costs (Exa separate)
- Multi-agent pipelines multiply costs
- Agents need 1-3 weeks of feedback loop to compound quality
- No public pricing for post-grant usage

## Next Steps
1. Sign up at hyperagent.com with Founding 500 credits
2. Create first agent (start with Investor Research)
3. Set budget caps immediately
4. Build feedback loop from day one
5. Start with 2-3 agents max, prove value before scaling
