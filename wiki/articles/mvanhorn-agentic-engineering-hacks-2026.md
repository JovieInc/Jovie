---
type: wiki/article
title: Every Hack I Know — Matt Van Horn's Agentic Engineering Workflow
author: Matt Van Horn (@mvanhorn)
source_uri: 'https://x.com/mvanhorn/status/2061877533885473181'
description: >-
  Matt Van Horn's 2026 guide to agentic engineering: plan-first workflow,
  voice-to-LLM, parallel Claude/Codex sessions, and custom tools. 218K views on
  X.
source_kind: 'mcp:put_page'
effective_date: '2026-06-02'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T04:16:45.998Z'
tags:
  - agentic-engineering
  - ai-agents
  - claude-code
  - codex
  - open-source
  - summer-learning
  - voice
  - workflow
---

# Every Hack I Know — Matt Van Horn's Agentic Engineering Workflow

> **Source**: X post by @mvanhorn (Matt Van Horn), June 2, 2026 — 218K views, 1.2K likes
> **Co-founder**: June (acquired by Weber), early Lyft
> **OSS**: last30days (26k+ stars), Printing Press (4k+ stars), AgentMail

Follow-up to his "Every Claude Code Hack I Know" post from 3 months prior (913K views).

## Core Philosophy

- **No IDE** — just `plan.md` files, voice, multiple Claude/Codex sessions, and custom tools
- **Plan-first**: The moment you have an idea, bug, screenshot, or vague thought → immediately run `/ce-plan`
- **Plans are for the agent**, not you. Make them, don't obsessively read them
- **Flip the ratio**: Traditional dev = 80% coding / 20% planning. This is the opposite.
- **Research first** with `last30days`, use voice heavily, run many parallel sessions, delegate execution, be the "human signal"

## The 22 Hacks

### 1. Always Start with `/ce-plan`
The moment you have an idea, bug, screenshot, error → run `/ce-plan` via Compound Engineering plugin. It spins up research agents then writes a structured `plan.md` with approach, files to change, and acceptance criteria.

### 2. Don't Read the Plan
Make the agent create it (forces rigor), but don't read the whole thing yourself. Skim, ask for TL;DR or "eli5", or ask clarifying questions inline. The plan keeps the agent honest.

### 3. Use It for Non-Code Work
Strategy, specs, competitive analysis, docs. Start with "make a plan for the plan" + feed it PDFs/transcripts for deeper output.

### 4. Get Voice-Pilled
Use voice-to-LLM: Monologue/Wispr Flow on Mac, Apple dictation on phone. The LLM fills in gaps from imperfect transcription. (Harder in open offices.)

### 5. Multiple cmux Tabs
Run 4–6 parallel sessions: planning, building, debugging, researching, etc.

### 6. Terminal Defaults to Agent
New tabs open directly into an agent session (no `cd`, no typing commands).

### 7. Remote Control + Email for Agents
Enable remote control for mobile continuation. Use AgentMail (open-source) so emailing a task spins up a session.

### 8. YOLO Permissions
Disable permission prompts: `skipDangerousModePermissionPrompt`, `bypassPermissions`, sound hooks on completion. Run 6+ sessions without constant approval. Own machine with GitHub as backup.

### 9. Claude for Planning/Taste, Codex for Building
Route work between them via extensions, flags, or Printing Press. Both set to high reasoning.

### 10. Run `last30days` First
His own tool (26k stars) for fresh research across Reddit, X, HN, YouTube, etc., before planning. Avoids stale training data.

### 11. Granola Transcripts
Drop raw meeting transcripts into plans. Use Printing Press Granola CLI for structured access to past meetings.

### 12. Be the "Human Signal"
Your value is taste, direction, and feedback ("use language from option 1 but risk profile from option 2"), not typing.

### 13. HyperFrames for Video
Treat video like code: `script.md` → agent renders MP4. For launch reels, demos, explainers.

### 14. Your Notes = Agent's Knowledge Base
Point agents at Bear/Obsidian + tools like gbrain/supermemory for compounding personal knowledge.

### 15. Work from Anywhere
Mac mini as always-on remote box, Mosh + tmux for travel, Hermes/OpenClaw, Agent Cookie for syncing cookies/.env.

### 16. Proof for Sharing Plans
Turns `plan.md` into readable docs with comments that feed back to agents.

### 17. Write Your Own Skills
Turn repeated tasks into reusable agent skills by copying structure from existing ones (e.g., Compound Engineering skills).

### 18. Contribute to Open Source
Use the same loop to ship real PRs. He's now top contributor on multiple projects (Python, Go, GStack, Paperclip, Compound Engineering). Great for hiring network.

### 19. Hardware
M5 Max 64GB + Anker battery/charger. `sudo pmset -a disablesleep 1` (never sleep).

### 20. Printing Press + Agent Cookie
Fleet of CLIs for real-world tasks (Tesla preheat, Instacart, flight booking, sports watching). Agent Cookie lets agents use your real browser session.

### 21. Beware AI Psychosis
The loop is addictively fun ("greatest video game ever"). Warning: don't disappear into building at the expense of life/relationships. Build for users (even if just yourself).

### 22. Meta Hack
Paste this entire post into your agent and tell it to implement what it can.

## Key Takeaways for Jovie/Relevance to Tim

- **Plan-first with `/ce-plan` maps directly to our Planner → Coder pipeline** — Summer already orchestrates this way
- **Voice-to-LLM** aligns with Tim's existing voice memo / Wispr Flow usage
- **YOLO permissions** — relevant for CI/autonomous agents where human-in-the-loop slows things down
- **Claude for planning/taste + Codex for building** — validates our model routing strategy
- **last30days for fresh research** — could replace/augment web_search for Jovie feature ideation
- **AgentMail (email-to-agent)** — directly relevant to the inbox automation Tim just requested
- **Printing Press/AgentCookie** — interesting for Jovie booking flows (venue outreach, etc.)

## Tools Mentioned
- **Compound Engineering** — Claude Code plugin for plan-first workflow
- **last30days** — OSS research tool, 26k+ stars
- **Printing Press** — OSS fleet of CLI tools, 4k+ stars
- **AgentMail** — OSS email-to-agent bridge
- **Agent Cookie** — sync cookies/.env to agent sessions
- **Proof** — plan.md → readable docs
- **HyperFrames** → video generation from scripts
- **Granola** — meeting transcription
