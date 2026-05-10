---
type: founder-memory
domain: delegation-policy
last-updated: 2026-05-08
owner: Tim White
---

# Delegation Policy

Which work agents can own end-to-end vs. what requires human involvement. Derived from CLAUDE.md agent role boundaries and observed delegation patterns.

## Delegation tiers

| Tier | Owner | Examples |
|------|-------|---------|
| Full autonomy | Agent (coder profile) | Bug fixes, feature implementation from clear spec, typecheck/lint fixes, test writing, design system consistency sweeps |
| Agent-led, human reviews | Agent dispatches → human merges | New product features with UX implications, A/B experiments, new API endpoints |
| Human-led, agent assists | Human decides → agent implements | Architecture changes, new external integrations, billing/auth changes, anything in `.claude/rules/security.md` T3 list |
| Human-only | No agent involvement | Investor communications (draft OK, send = human), legal/compliance decisions, firing/hiring, financial commitments |

## Profile routing

| Profile | Can do | Cannot do |
|---------|--------|----------|
| `coder` | Implement assigned HUD/delegation manifests | Plan, decide scope, create Linear issues beyond follow-ups |
| `code-orchestrator` | Plan, decompose, create manifests | Implement, commit, push, merge |
| `default` / Chief of Staff | Prioritize, dispatch, verify, update HUD/Linear | Code |
| `cfo-milan-v2` | Cost, runway, usage, spend routing | Code |
| `founder-os` | GTM, fundraising, company facts | Code |

## Dispatch contract

Before dispatching a coder agent, the orchestrator must create a delegation manifest with:
- KPI being addressed
- Files in scope (HOT ZONE)
- Acceptance criteria
- Verification steps (typecheck + relevant tests)
- Expected AgentRunArtifact output

An agent that discovers work outside its mandate must create a Linear issue and stop — not expand scope.

## Autonomy escalation path

As agents demonstrate reliable outcomes, autonomy can expand:
1. Start: agent proposes, human approves before merge
2. After 5 clean merges in domain: agent auto-merges with human notification
3. After 20 clean merges + no regressions: agent dispatches sub-agents

Autonomy is domain-scoped. Reliability in Coding dept does not grant autonomy in billing or auth.

## What agents never do

| Never | Reason |
|-------|--------|
| Push to main directly | Merge queue required |
| Skip CI or hooks | Safety net is non-negotiable |
| Modify migration files | Immutable by policy |
| Send external communications without human review | Brand/legal risk |
| Make financial commitments | Human-only |
