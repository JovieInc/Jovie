---
type: note
title: Agent Skills (addyosmani)
embed_skip:
  bytes: 19260
  reason: oversized
  assessed_at: '2026-05-27T00:57:51.355821'
ingested_via: put_page
ingested_at: '2026-05-27T07:58:02.616Z'
source_kind: put_page
---

# Agent Skills (addyosmani)
# Cached: 2026-05-06T20:40:08Z
# Source: https://github.com/addyosmani/agent-skills

Title: GitHub - addyosmani/agent-skills: Production-grade engineering skills for AI coding agents.

URL Source: https://github.com/addyosmani/agent-skills

Markdown Content:
**Production-grade engineering skills for AI coding agents.**

Skills encode the workflows, quality gates, and best practices that senior engineers use when building software. These ones are packaged so AI agents follow them consistently across every phase of development.

```
DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
  /spec          /plan          /build        /test         /review       /ship
```

* * *

## Commands

[](https://github.com/addyosmani/agent-skills#commands)
7 slash commands that map to the development lifecycle. Each one activates the right skills automatically.

| What you're doing | Command | Key principle |
| --- | --- | --- |
| Define what to build | `/spec` | Spec before code |
| Plan how to build it | `/plan` | Small, atomic tasks |
| Build incrementally | `/build` | One slice at a time |
| Prove it works | `/test` | Tests are proof |
| Review before merge | `/review` | Improve code health |
| Simplify the code | `/code-simplify` | Clarity over cleverness |
| Ship to production | `/ship` | Faster is safer |

Skills also activate automatically based on what you're doing — designing an API triggers `api-and-interface-design`, building UI triggers `frontend-ui-engineering`, and so on.

* * *

## Quick Start

[](https://github.com/addyosmani/agent-skills#quick-start)

**Claude Code (recommended)**
**Marketplace install:**

```
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```

> **SSH errors?** The marketplace clones repos via SSH. If you don't have SSH keys set up on GitHub, either [add your SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account) or use the full HTTPS URL to force the HTTPS cloning:
> 
> 
> 
> /plugin marketplace add https://github.com/addyosmani/agent-skills.git
> /plugin install agent-skills@addy-agent-skills

**Local / development:**

git clone https://github.com/addyosmani/agent-skills.git
claude --plugin-dir /path/to/agent-skills

**Cursor**
Copy any `SKILL.md` into `.cursor/rules/`, or reference the full `skills/` directory. See [docs/cursor-setup.md](https://github.com/addyosmani/agent-skills/blob/main/docs/cursor-setup.md).

**Gemini CLI**
Install as native skills for auto-discovery, or add to `GEMINI.md` for persistent context. See [docs/gemini-cli-setup.md](https://github.com/addyosmani/agent-skills/blob/main/docs/gemini-cli-setup.md).

**Install from the repo:**

gemini skills install https://github.com/addyosmani/agent-skills.git --path skills

**Install from a local clone:**

gemini skills install ./agent-skills/skills/

**Windsurf**
Add skill contents to your Windsurf rules configuration. See [docs/windsurf-setup.md](https://github.com/addyosmani/agent-skills/blob/main/docs/windsurf-setup.md).

**OpenCode**
Uses agent-driven skill execution via AGENTS.md and the `skill` tool.

See [docs/opencode-setup.md](https://github.com/addyosmani/agent-skills/blob/main/docs/opencode-setup.md).

**GitHub Copilot**
Use agent definitions from `agents/` as Copilot personas and skill content in `.github/copilot-instructions.md`. See [docs/copilot-setup.md](https://github.com/addyosmani/agent-skills/blob/main/docs/copilot-setup.md).

**Kiro IDE & CLI** Skills for Kiro reside under ".kiro/skills/" and can be stored under Project or Global level. Kiro also supports Agents.md. See Kiro docs at [https://kiro.dev/docs/skills/](https://kiro.dev/docs/skills/)

**Codex / Other Agents**
Skills are plain Markdown - they work with any agent that accepts system prompts or instruction files. See [docs/getting-started.md](https://github.com/addyosmani/agent-skills/blob/main/docs/getting-started.md).

* * *

## All 20 Skills

[](https://github.com/addyosmani/agent-skills#all-20-skills)
The commands above are the entry points. Under the hood, they activate these 20 skills — each one a structured workflow with steps, verification gates, and anti-rationalization tables. You can also reference any skill directly.

### Define - Clarify what to build

[](https://github.com/addyosmani/agent-skills#define---clarify-what-to-build)
| Skill | What It Does | Use When |
| --- | --- | --- |
| [idea-refine](https://github.com/addyosmani/agent-skills/blob/main/skills/idea-refine/SKILL.md) | Structured divergent/convergent thinking to turn vague ideas into concrete proposals | You have a rough concept that needs exploration |
| [spec-driven-development](https://github.com/addyosmani/agent-skills/blob/main/skills/spec-driven-development/SKILL.md) | Write a PRD covering objectives, commands, structure, code style, testing, and boundaries before any code | Starting a new project, feature, or significant change |

### Plan - Break it down

[](https://github.com/addyosmani/agent-skills#plan---break-it-down)
| Skill | What It Does | Use When |
| --- | --- | --- |
| [planning-and-task-breakdown](https://github.com/addyosmani/agent-skills/blob/main/skills/planning-and-task-breakdown/SKILL.md) | Decompose specs into small, verifiable tasks with acceptance criteria and dependency ordering | You have a spec and need implementable units |

### Build - Write the code

[](https://github.com/addyosmani/agent-skills#build---write-the-code)
| Skill | What It Does | Use When |
| --- | --- | --- |
| [incremental-implementation](https://github.com/addyosmani/agent-skills/blob/main/skills/incremental-implementation/SKILL.md) | Thin vertical slices - implement, test, verify, commit. Feature flags, safe defaults, rollback-friendly changes | Any change touching more than one file |
| [test-driven-development](https://github.com/addyosmani/agent-skills/blob/main/skills/test-driven-development/SKILL.md) | Red-Green-Refactor, test pyramid (80/15/5), test sizes, DAMP over DRY, Beyonce Rule, browser testing | Implementing logic, fixing bugs, or changing behavior |
| [context-engineering](https://github.com/addyosmani/agent-skills/blob/main/skills/context-engineering/SKILL.md) | Feed agents the right information at the right time - rules files, context packing, MCP integrations | Starting a session, switching tasks, or when output quality drops |
| [source-driven-development](https://github.com/addyosmani/agent-skills/blob/main/skills/source-driven-development/SKILL.md) | Ground every framework decision in official documentation - verify, cite sources, flag what's unverified | You want authoritative, source-cited code for any framework or library |
| [frontend-ui-engineering](https://github.com/addyosmani/agent-skills/blob/main/skills/frontend-ui-engineering/SKILL.md) | Component architecture, design systems, state management, responsive design, WCAG 2.1 AA accessibility | Building or modifying user-facing interfaces |
| [api-and-interface-design](https://github.com/addyosmani/agent-skills/blob/main/skills/api-and-interface-design/SKILL.md) | Contract-first design, Hyrum's Law, One-Version Rule, error semantics, boundary validation | Designing APIs, module boundaries, or public interfaces |

### Verify - Prove it works

[](https://github.com/addyosmani/agent-skills#verify---prove-it-works)
| Skill | What It Does | Use When |
| --- | --- | --- |
| [browser-testing-with-devtools](https://github.com/addyosmani/agent-skills/blob/main/skills/browser-testing-with-devtools/SKILL.md) | Chrome DevTools MCP for live runtime data - DOM inspection, console logs, network traces, performance profiling | Building or debugging anything that runs in a browser |
| [debugging-and-error-recovery](https://github.com/addyosmani/agent-skills/blob/main/skills/debugging-and-error-recovery/SKILL.md) | Five-step triage: reproduce, localize, reduce, fix, guard. Stop-the-line rule, safe fallbacks | Tests fail, builds break, or behavior is unexpected |

### Review - Quality gates before merge

[](https://github.com/addyosmani/agent-skills#review---quality-gates-before-merge)
| Skill | What It Does | Use When |
| --- | --- | --- |
| [code-review-and-quality](https://github.com/addyosmani/agent-skills/blob/main/skills/code-review-and-quality/SKILL.md) | Five-axis review, change sizing (~100 lines), severity labels (Nit/Optional/FYI), review speed norms, splitting strategies | Before merging any change |
| [code-simplification](https://github.com/addyosmani/agent-skills/blob/main/skills/code-simplification/SKILL.md) | Chesterton's Fence, Rule of 500, reduce complexity while preserving exact behavior | Code works but is harder to read or maintain than it should be |
| [security-and-hardening](https://github.com/addyosmani/agent-skills/blob/main/skills/security-and-hardening/SKILL.md) | OWASP Top 10 prevention, auth patterns, secrets management, dependency auditing, three-tier boundary system | Handling user input, auth, data storage, or external integrations |
| [performance-optimization](https://github.com/addyosmani/agent-skills/blob/main/skills/performance-optimization/SKILL.md) | Measure-first approach - Core Web Vitals targets, profiling workflows, bundle analysis, anti-pattern detection | Performance requirements exist or you suspect regressions |

### Ship - Deploy with confidence

[](https://github.com/addyosmani/agent-skills#ship---deploy-with-confidence)
| Skill | What It Does | Use When |
| --- | --- | --- |
| [git-workflow-and-versioning](https://github.com/addyosmani/agent-skills/blob/main/skills/git-workflow-and-versioning/SKILL.md) | Trunk-based development, atomic commits, change sizing (~100 lines), the commit-as-save-point pattern | Making any code change (always) |
| [ci-cd-and-automation](https://github.com/addyosmani/agent-skills/blob/main/skills/ci-cd-and-automation/SKILL.md) | Shift Left, Faster is Safer, feature flags, quality gate pipelines, failure feedback loops | Setting up or modifying build and deploy pipelines |
| [deprecation-and-migration](https://github.com/addyosmani/agent-skills/blob/main/skills/deprecation-and-migration/SKILL.md) | Code-as-liability mindset, compulsory vs advisory deprecation, migration patterns, zombie code removal | Removing old systems, migrating users, or sunsetting features |
| [documentation-and-adrs](https://github.com/addyosmani/agent-skills/blob/main/skills/documentation-and-adrs/SKILL.md) | Architecture Decision Records, API docs, inline documentation standards - document the _why_ | Making architectural decisions, changing APIs, or shipping features |
| [shipping-and-launch](https://github.com/addyosmani/agent-skills/blob/main/skills/shipping-and-launch/SKILL.md) | Pre-launch checklists, feature flag lifecycle, staged rollouts, rollback procedures, monitoring setup | Preparing to deploy to production |

* * *

## Agent Personas

[](https://github.com/addyosmani/agent-skills#agent-personas)
Pre-configured specialist personas for targeted reviews:

| Agent | Role | Perspective |
| --- | --- | --- |
| [code-reviewer](https://github.com/addyosmani/agent-skills/blob/main/agents/code-reviewer.md) | Senior Staff Engineer | Five-axis code review with "would a staff engineer approve this?" standard |
| [test-engineer](https://github.com/addyosmani/agent-skills/blob/main/agents/test-engineer.md) | QA Specialist | Test strategy, coverage analysis, and the Prove-It pattern |
| [security-auditor](https://github.com/addyosmani/agent-skills/blob/main/agents/security-auditor.md) | Security Engineer | Vulnerability detection, threat modeling, OWASP assessment |

* * *

## Reference Checklists

[](https://github.com/addyosmani/agent-skills#reference-checklists)
Quick-reference material that skills pull in when needed:

| Reference | Covers |
| --- | --- |
| [testing-patterns.md](https://github.com/addyosmani/agent-skills/blob/main/references/testing-patterns.md) | Test structure, naming, mocking, React/API/E2E examples, anti-patterns |
| [security-checklist.md](https://github.com/addyosmani/agent-skills/blob/main/references/security-checklist.md) | Pre-commit checks, auth, input validation, headers, CORS, OWASP Top 10 |
| [performance-checklist.md](https://github.com/addyosmani/agent-skills/blob/main/references/performance-checklist.md) | Core Web Vitals targets, frontend/backend checklists, measurement commands |
| [accessibility-checklist.md](https://github.com/addyosmani/agent-skills/blob/main/references/accessibility-checklist.md) | Keyboard nav, screen readers, visual design, ARIA, testing tools |

* * *

## How Skills Work

[](https://github.com/addyosmani/agent-skills#how-skills-work)
Every skill follows a consistent anatomy:

```
┌─────────────────────────────────────────────────┐
│  SKILL.md                                       │
│                                                 │
│  ┌─ Frontmatter ─────────────────────────────┐  │
│  │ name: lowercase-hyphen-name               │  │
│  │ description: Guides agents through [task].│  │
│  │              Use when…                    │  │
│  └───────────────────────────────────────────┘  │                                                                                                
│  Overview         → What this skill does        │
│  When to Use      → Triggering conditions       │
│  Process          → Step-by-step workflow       │
│  Rationalizations → Excuses + rebuttals         │
│  Red Flags        → Signs something's wrong     │
│  Verification     → Evidence requirements       │
└─────────────────────────────────────────────────┘
```

**Key design choices:**

*   **Process, not prose.** Skills are workflows agents follow, not reference docs they read. Each has steps, checkpoints, and exit criteria.
*   **Anti-rationalization.** Every skill includes a table of common excuses agents use to skip steps (e.g., "I'll add tests later") with documented counter-arguments.
*   **Verification is non-negotiable.** Every skill ends with evidence requirements - tests passing, build output, runtime data. "Seems right" is never sufficient.
*   **Progressive disclosure.** The `SKILL.md` is the entry point. Supporting references load only when needed, keeping token usage minimal.

* * *

## Project Structure

[](https://github.com/addyosmani/agent-skills#project-structure)

```
agent-skills/
├── skills/                            # 20 core skills (SKILL.md per directory)
│   ├── idea-refine/                   #   Define
│   ├── spec-driven-development/       #   Define
│   ├── planning-and-task-breakdown/   #   Plan
│   ├── incremental-implementation/    #   Build
│   ├── context-engineering/           #   Build
│   ├── source-driven-development/     #   Build
│   ├── frontend-ui-engineering/       #   Build
│   ├── test-driven-development/       #   Build
│   ├── api-and-interface-design/      #   Build
│   ├── browser-testing-with-devtools/ #   Verify
│   ├── debugging-and-error-recovery/  #   Verify
│   ├── code-review-and-quality/       #   Review
│   ├── code-simplification/          #   Review
│   ├── security-and-hardening/        #   Review
│   ├── performance-optimization/      #   Review
│   ├── git-workflow-and-versioning/   #   Ship
│   ├── ci-cd-and-automation/          #   Ship
│   ├── deprecation-and-migration/     #   Ship
│   ├── documentation-and-adrs/        #   Ship
│   ├── shipping-and-launch/           #   Ship
│   └── using-agent-skills/            #   Meta: how to use this pack
├── agents/                            # 3 specialist personas
├── references/                        # 4 supplementary checklists
├── hooks/                             # Session lifecycle hooks
├── .claude/commands/                  # 7 slash commands (Claude Code)
├── .gemini/commands/                  # 7 slash commands (Gemini CLI)
└── docs/                              # Setup guides per tool
```

* * *

## Why Agent Skills?

[](https://github.com/addyosmani/agent-skills#why-agent-skills)
AI coding agents default to the shortest path - which often means skipping specs, tests, security reviews, and the practices that make software reliable. Agent Skills gives agents structured workflows that enforce the same discipline senior engineers bring to production code.

Each skill encodes hard-won engineering judgment: _when_ to write a spec, _what_ to test, _how_ to review, and _when_ to ship. These aren't generic prompts - they're the kind of opinionated, process-driven workflows that separate production-quality work from prototype-quality work.

Skills bake in best practices from Google's engineering culture — including concepts from [Software Engineering at Google](https://abseil.io/resources/swe-book) and Google's [engineering practices guide](https://google.github.io/eng-practices/). You'll find Hyrum's Law in API design, the Beyonce Rule and test pyramid in testing, change sizing and review speed norms in code review, Chesterton's Fence in simplification, trunk-based development in git workflow, Shift Left and feature flags in CI/CD, and a dedicated deprecation skill treating code as a liability. These aren't abstract principles — they're embedded directly into the step-by-step workflows agents follow.

* * *

## Contributing

[](https://github.com/addyosmani/agent-skills#contributing)
Skills should be **specific** (actionable steps, not vague advice), **verifiable** (clear exit criteria with evidence requirements), **battle-tested** (based on real workflows), and **minimal** (only what's needed to guide the agent).

See [docs/skill-anatomy.md](https://github.com/addyosmani/agent-skills/blob/main/docs/skill-anatomy.md) for the format specification and [CONTRIBUTING.md](https://github.com/addyosmani/agent-skills/blob/main/CONTRIBUTING.md) for guidelines.

* * *

## License

[](https://github.com/addyosmani/agent-skills#license)
MIT - use these skills in your projects, teams, and tools.
