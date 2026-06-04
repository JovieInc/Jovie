---
type: wiki
title: Harness Engineering — Adopted June 2026
date: '2026-06-03T00:00:00.000Z'
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T07:14:25.412Z'
source_kind: 'mcp:put_page'
tags:
  - adoption
  - ai-agents
  - engineering
  - process
---

# Harness Engineering — Adopted June 2026

Adopted from [OpenAI's Harness Engineering post](https://openai.com/index/harness-engineering/).

## Key Insight

**"Throughput changes the merge philosophy."**

As Codex's throughput increased, many conventional engineering norms became counterproductive. Corrections are cheap, and waiting is expensive.

## Adopted Principles

### 1. Merge Philosophy
- **Minimal blocking merge gates.** PRs are short-lived (hours, not days).
- **Test flakes → follow-up runs, not indefinite blocks.** Block only after 3+ consecutive failures.
- **Human review = judgment, not bug-catching.** Automated checks handle correctness. Humans handle architecture, taste, risk.
- **Never push to main.** Branch + PR always. But merge within hours of approval.
- **Batch small fixes.** Agents bundle related fixes into single PRs.

### 2. Harness Engineering
- **The harness** = scaffolding, guardrails, architecture, tests, prompts, CI/CD, automated reviewers, lint rules, conventions docs, failure-mode rules. It's the primary engineering artifact.
- **Engineers are banned from typing production code directly.** Build the harness, steer agents, review output.
- **Every failure mode becomes a permanent rule.** Encode into harness so it can't recur.
- **PRD as code input, app as compiled output.** Spec-to-implementation is agent-driven.
- **Non-engineers can ship.** PM writes PRD Monday → merged PR by Friday.

## Updated Files
- `AGENTS.md` — New §Merge Philosophy and §Harness Engineering sections under Agent Workflow Best Practices
- `jovie-agent-architecture` skill — New §Harness Engineering Philosophy, §Merge Philosophy, revised §Approval Policy

## Source
OpenAI, "Harness Engineering" — how a small team shipped a ~1M LoC product with humans primarily setting goals and steering via feedback rather than writing code. A team steering Codex opened and merged **1,500 pull requests** to ship an internal product used by hundreds — with zero manual coding by humans.
