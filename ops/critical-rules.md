---
type: note
title: Critical Rules - NEVER Violate
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-29T18:04:06.293Z'
source_kind: 'mcp:put_page'
tags:
  - ops
  - repo
  - rules
  - workflow
---

# Critical Rules

## Repository
- JovieInc/Jovie = canonical repo (always PR to this)
- itstimwhite/Jovie = Tim's fork
- NEVER push to main - always create feature branches and PRs
- PR workflow ONLY for all code changes

## gbrain First
- ALWAYS query gbrain before burning tokens on any task
- Use mcp_gbrain_query / mcp_gbrain_search for context lookup
- gbrain MCP tools are FREE (local Postgres + Ollama)
- Only call external APIs when gbrain doesn't have the info

## Linear Rules
- Issues In Progress > 1 day with no activity = ABANDONED
- Summer investigates, claims, and ships solutions for abandoned issues
- Close stale duplicates

## CI/CD
- Codecov patch coverage target: 80% for all new PRs
- Auth/UI PRs MUST include meaningful test coverage
