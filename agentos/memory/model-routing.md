---
type: founder-memory
domain: model-routing
last-updated: 2026-05-08
owner: Tim White
---

# Model Routing Policy

Which AI model to use for which task types. The goal: maximize task quality while minimizing cost, routing cheap/free models to safe task classes.

## Route registry

| Route key | Provider | Model | Cost tier | Max task complexity |
|-----------|----------|-------|-----------|-------------------|
| `deterministic` | Internal | Rule-based | Free | Logic only, no LLM |
| `openrouter-free` | OpenRouter | Free-tier models | Free | Summarize, classify, simple draft |
| `kilo-free` | Kilo | Free allowance | Free | Summarize, classify, rank |
| `ai-sdk-gateway` | Vercel AI SDK | Auto-routed | Low | Standard coding, analysis |
| `openrouter-cheap` | OpenRouter | Budget models | Low | Draft, outline, extract |
| `claude-code` | Anthropic | claude-sonnet-4-6 | Medium | Complex coding, multi-file edits |
| `codex-cli` | OpenAI | Codex | Medium | Code generation, refactor |
| `airme-agent` | Airme | Agent model | Medium | Agentic workflows |

## Routing rules

| Task class | Allowed routes | Preferred |
|-----------|---------------|-----------|
| Summarize / extract | openrouter-free, kilo-free, openrouter-cheap | kilo-free |
| Classify / rank | openrouter-free, kilo-free | openrouter-free |
| Draft (non-critical) | openrouter-cheap, ai-sdk-gateway | openrouter-cheap |
| Standard feature implementation | claude-code, codex-cli | claude-code |
| Multi-file refactor | claude-code | claude-code |
| Agentic long-horizon task | airme-agent, claude-code | claude-code until airme-agent proven |
| Security/billing/auth code | claude-code only | claude-code |

## Free-model safety constraints

Free-model routes (openrouter-free, kilo-free, openrouter-cheap) are ONLY allowed for:
- Summarize
- Classify
- Rank
- Draft (non-critical, human reviews before use)

Free routes are NEVER allowed for:
- Code that runs in production
- Security or auth decisions
- Billing or payment logic
- Any task where a wrong answer causes data loss or user harm

## Cost discipline

| Rule | Rationale |
|------|-----------|
| Route to the cheapest model that can reliably complete the task | AI API cost is real and scales with usage |
| Record model used + cost estimate in every AgentRunArtifact | Enables cost attribution and CFO/Cost agent analysis |
| Prefer `proposedModelRoute` from AgentBrief over defaults | Brief generator has task context; router should trust it |
| Escalate to claude-code only when cheaper routes fail | Not the first resort; the reliable fallback |

## Fallback chain

If the proposed route fails or returns low-confidence output:
1. Log the failure in AgentRunArtifact (attemptNumber + routeReason)
2. Escalate one tier up the cost ladder
3. Cap at 3 attempts total before creating an ops_event (severity=medium, source=manual)
