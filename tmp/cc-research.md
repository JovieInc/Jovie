---
type: concept
title: Cc Research
ingested_via: 'mcp:put_page'
ingested_at: '2026-05-30T21:24:41.475Z'
source_kind: 'mcp:put_page'
---

# Claude Code Best Practices for Coding Agent Workflows
## Research Compiled: 2026-05-30
## Target: Patterns to steal for Grok/Hermes agents on MBP

---

## 1. SKILL FILE ARCHITECTURE (Thin Harness, Fat Skills)

**Source**: Garry Tan's "Thin Harness, Fat Skills" (YC Spring 2026), Claude Code source leak analysis

### Core Pattern
The model is not the secret sauce. The harness wrapping it is. The 2x vs 100x productivity gap comes from the same models + different harness architecture.

### What is a Skill File?
A reusable markdown procedure that teaches the model HOW to do something. Not WHAT to do. The user supplies specifics; the skill supplies the process.

**Key insight**: A skill file works like a **method call**. It takes parameters. Same procedure + different arguments = radically different capabilities.

### Anatomy of a Skill (agentskills.io format)
```yaml
---
name: skill-name
description: What this skill does and when to use it.
metadata:
  author: YourName
  version: "1.0"
compatibility: Universal — works with Claude Code, Windsurf, Codex, CodeRabbit
---
```

### Skill Quality Rules (from addyosmani/agent-skills, 30K stars)
- **Specific**: Actionable steps, not vague advice
- **Verifiable**: Clear exit criteria with evidence requirements
- **Battle-tested**: Based on real workflows
- **Minimal**: Only what's needed to guide the agent

### Skill vs Code Decision Table
| Question | If YES | If NO |
|----------|--------|-------|
| Does the agent need to think/adapt/ask? | **Skill** (markdown recipe) | Code |
| Same input → same output? | **Code** (CLI command) | Skill |
| Requires judgment about environment? | **Skill** | Code |
| Is it a lookup/list/status check? | **Code** | Probably skill |
| Changes behavior from conversation? | **Skill** | Code |

---

## 2. AGENT ORCHESTRATION PATTERNS (Ruflo / Claude Flow)

**Source**: ruvnet/ruflo (45K stars), installed in Hermes

### SendMessage-First Coordination
Named agents coordinate via `SendMessage`, not polling or shared state.

```javascript
// Pipeline pattern: ALL agents in ONE message
Agent({ prompt: "Research the codebase. SendMessage findings to 'architect'.",
  subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Wait for 'researcher'. Design solution. SendMessage to 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true })
Agent({ prompt: "Wait for 'architect'. Implement it. SendMessage to 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true })
Agent({ prompt: "Wait for 'coder'. Write tests. SendMessage to 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true })
Agent({ prompt: "Wait for 'tester'. Review code quality and security.",
  subagent_type: "reviewer", name: "reviewer", run_in_background: true })

// Kick off the pipeline
SendMessage({ to: "researcher", summary: "Start", message: "[task context]" })
```

### Topology Patterns
| Pattern | Flow | Use When |
|---------|------|----------|
| **Pipeline** | A → B → C → D | Sequential dependencies (feature dev) |
| **Fan-out** | Lead → A, B, C → Lead | Independent parallel work (research) |
| **Supervisor** | Lead ↔ workers | Ongoing coordination (complex refactor) |

### Agent Coordination Rules
- ALWAYS name agents — `name: "role"` makes them addressable
- ALWAYS include comms instructions in prompts — who to message, what to send
- Spawn ALL agents in ONE message with `run_in_background: true`
- After spawning: STOP, tell user what's running, wait for results
- NEVER poll status — agents message back or complete automatically

### Task Routing by Complexity
| Task | Agents | Topology |
|------|--------|----------|
| Bug Fix | researcher, coder, tester | hierarchical |
| Feature | architect, coder, tester, reviewer | hierarchical |
| Refactor | architect, coder, reviewer | hierarchical |
| Performance | perf-engineer, coder | hierarchical |
| Security | security-architect, auditor | hierarchical |

### When to Swarm vs Not
- **YES**: 3+ files, new features, cross-module refactoring, API changes, security, performance
- **NO**: single file edits, 1-2 line fixes, docs updates, config changes, questions

### 3-Tier Model Routing
| Tier | Handler | Use Cases |
|------|---------|-----------|
| 1 | Agent Booster (WASM) | Simple transforms — skip LLM, use Edit directly |
| 2 | Haiku | Simple tasks, low complexity |
| 3 | Sonnet/Opus | Architecture, security, complex reasoning |

---

## 3. SLASH COMMANDS + SKILLS SYSTEM (addyosmani/agent-skills)

**Source**: addyosmani/agent-skills (30K stars), production-grade engineering skills

### 7 Universal Slash Commands Mapping to Dev Lifecycle
| Command | Principle |
|---------|-----------|
| `/spec` | Spec before code |
| `/plan` | Small, atomic tasks |
| `/build` | One slice at a time |
| `/test` | Tests are proof |
| `/review` | Improve code health |
| `/code-simplify` | Clarity over cleverness |
| `/ship` | Faster is safer |

### Auto-Activation Pattern
Skills activate automatically based on what you're doing:
- Designing an API → triggers `api-and-interface-design`
- Building UI → triggers `frontend-ui-engineering`
- The `description` field in frontmatter IS the resolver (like Clippy that works)
- You never have to remember command names

### Google Engineering Practices Embedded in Skills
- **Hyrum's Law** in API design
- **Beyonce Rule** + test pyramid in testing
- **Change sizing** + review speed norms in code review
- **Chesterton's Fence** in simplification
- **Trunk-based development** in git workflow
- **Shift Left** + feature flags in CI/CD
- **Deprecation skill** treating code as a liability

---

## 4. MULTI-FILE WORKFLOW PATTERNS

**Source**: Internal Jovie refactoring plans, agent delegation protocol

### Before Starting a Task
1. **Claim the task** — change status from `[ ]` to `[🔄]` + session ID
2. **Read full task description** including acceptance criteria
3. **Check dependencies** — ensure prerequisites completed first
4. **Create a feature branch** from `main`

### While Working
1. Follow project's atomic component architecture
2. Maintain test coverage — update/add tests for refactored code
3. Run validation before committing: `pnpm typecheck && pnpm lint && pnpm test`
4. Keep changes focused — one task per PR

### After Completing a Task
1. Update status: `[🔄]` → `[✅]`
2. Add completion notes
3. Update the Changelog
4. Commit this documentation file with code changes
5. Update dependent tasks if scope changed

### Living Document Pattern
- **Do not delete items** when complete — move to resolved/section
- Every PR should update at least one tracking item
- Weekly hygiene: keep P0 minimal, promote/demote based on incidents

---

## 5. CONTEXT & MEMORY MANAGEMENT

**Source**: Garry Tan's CLAUDE.md findings, Jovie brain conventions

### The 20,000 Line CLAUDE.md Anti-Pattern
A 20,000-line CLAUDE.md degrades model attention. The fix: ~200 lines as pointers to documents. The resolver loads the right one when it matters.

### Resolver Pattern (Context Routing)
When task type X appears, load document Y first.
- Skills say HOW
- Resolvers say WHAT to load WHEN
- Without resolver: developer changes prompt, ships
- With resolver: model reads the right context, which may say "run eval suite first"

### Sub-Agent Convention Propagation
When spawning sub-agents, include in their task prompt:
```
Read skills/conventions/brain-first.md before starting work.
```
This ensures conventions propagate through any depth of sub-agent chain.

### Two-Repo Architecture
Separate agent behavior (replaceable) from world knowledge (permanent):
- **Agent repo**: AGENTS.md, SOUL.md, USER.md, skills/, cron/, tasks/
- **Brain repo**: people/, companies/, deals/, meetings/, originals/
- Boundary test: "Would this file transfer if you switched AI agents?"

---

## 6. SELF-IMPROVING SKILLS (Diarization Pattern)

**Source**: Garry Tan YC Startup School system

### The Improve Loop
After running a workflow:
1. `/improve` skill reads feedback/surveys
2. Diarizes "OK" responses (not just bad ones)
3. Extracts patterns
4. Writes new rules back into the skill file
5. Next run uses them automatically — **the skill rewrites itself**

### Example Self-Modification
```
When attendee says "AI infrastructure"
    but startup is 80%+ billing code:
    -> Classify as FinTech, not AI Infra.

When two attendees in same group
    already know each other:
    -> Penalize proximity.
       Prioritize novel introductions.
```

### The Compounding Principle
> "You are not allowed to do one-off work. If I ask you to do something and it's the kind of thing that will need to happen again, you must: do it manually the first time. Show me the output. If I approve, codify it into a skill file. If it should run automatically, put it on a cron."
>
> "The test: if I have to ask you for something twice, you failed."

---

## 7. BUILD & TEST RULES (Non-Negotiable)

- ALWAYS run tests after code changes
- ALWAYS verify build succeeds before committing
- `npm run build && npm test` (or equivalent)
- Public/webhook coordination MUST use durable storage (not in-memory)
- Server-side external HTTP MUST have timeout + retry wrapper
- Persistence-critical writes must throw on failure (never swallow errors)

---

## KEY STEALABLE ACTIONS FOR HERMES/GROK ON MBP

1. **Implement skill-as-directory pattern**: `.agent/skills/` with SKILL.md per skill, frontmatter with description for auto-activation. Symlink from tool-specific dirs.

2. **Add resolver to CLAUDE.md / AGENTS.md**: Keep it under 200 lines. Use it only as pointers to detailed docs that get loaded on-demand.

3. **Use SendMessage-first coordination**: When spawning multiple agents, define the full pipeline in ONE message with named agents and explicit message routing.

4. **Implement claim/complete protocol**: Task files with status tracking. Agents claim before starting, update after completion. Never delete completed items.

5. **3-tier model routing**: Use WASM for transforms, Haiku for simple tasks, Sonnet/Opus for complex reasoning. Already partially implemented.

6. **Codify recurring work into skills**: Every time you ask an agent to do something twice, extract the process into a markdown skill file with the agentskills.io format.

7. **Self-improvement loop**: After workflows execute, have the agent read feedback, extract patterns, and update its own skill files.

8. **Swarm only for complex tasks**: 3+ files, cross-module work, features, security. Single-file edits and 1-2 line fixes should be direct.

9. **Slug discipline for brain content**: lowercase alphanumeric and hyphens only, slash-separated. No underscores, no file extensions. Quote users verbatim in reflections.

10. **Skill description = resolver**: The `description` field in skill frontmatter should exactly describe WHEN to trigger the skill. This replaces manual command lookup with automatic intent matching.
