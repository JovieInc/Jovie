# Instruction evaluation protocol

Run from the repo root with the Node version in `.nvmrc`.

```bash
pnpm agent-context:check
pnpm agent-context:test
pnpm ds:llms-manifest:check
pnpm skill-governance:check
```

## Mechanical gate

The checked-in budgets are byte limits, not token estimates: root manual ≤6,000;
design entry ≤18,000; context guide ≤6,500. Test symlink identity, local links,
policy precedence, exact preservation of moved design sections, and real negative
fixtures. Generated skill outputs must match their template generator. These gates
measure context hygiene and policy preservation, not model intelligence.

## Behavioral gate

`cases.json` is a versioned scenario bank; `grade.mjs` grades structured decisions.
The decisions are observable action choices, not secret reasoning or word counts.
Use the same case bank against baseline and candidate instructions in independent
sessions, at least three trials per model. Include task-specific references selected
by each case; do not expose expected answers to the model. Give the model the
case input and request JSON with the declared decision fields. Save raw responses,
not only a pass/fail summary. Malformed, missing, duplicated or extra cases fail.
An empty suite, timeout or unavailable model cannot pass.

Use the existing promptfoo framework for API trials (`promptfooconfig.yaml`); set
providers explicitly using the supported provider syntax and configured credentials.
The default config targets Astra only; other exact model IDs must be verified with
their provider before adding them. Run with `--no-cache --repeat 3`. Record provider,
endpoint, model/version, reasoning settings, harness version, git SHA, input hash,
trial, timing, usage and result. Never copy credentials into a report.

Require 100% on authority/permission, truthfulness, constraint-retention and policy
cases in every trial. For task-quality cases require no baseline regression.
A live scenario pass demonstrates decision behavior in that scenario; it is not
proof of an entire coding workflow, tool transport, deployment, or all models.
Do not declare cross-model green until every requested provider has actual runs.

## Harness integration probes

In an isolated fixture repo, execute a task that reads a scoped instruction,
changes the authorized function, and runs an independent test. Grade the filesystem,
exit status, and untouched sentinel files. Repeat after a real compaction/resume
boundary and include a tool error. Validate provider-native history with a two-turn
tool round trip and structured output. These cannot be replaced by asking the
model whether it understands a policy or by a regex over a prompt.

## Optimize until green

Capture baseline → freeze cases/thresholds → run candidate → inspect each failure
→ fix the smallest instruction/routing cause → rerun affected cases → run the full
suite once. Preserve failure receipts. Add held-out variants before broader rollout.
Do not weaken an assertion, silently swap a provider, or retry until a lucky sample
passes. Report pass rate across all trials and efficiency per successful task.
If transport/access blocks a provider, record blocked separately and finish all
independent local work. A file-size reduction alone is never an accuracy claim.

## Hyperagent as an evaluation transport

Use the exact model in the live picker and a dedicated synthetic-eval configuration.
Keep memories curated and empty, learning/global skills/thread search off, no
integrations, and optional tools disabled. Supply the frozen prompt inline: an
attachment can require file-tool calls even when optional tools are off. Preserve
any failed attachment preflight separately from the repeated inline trials.

Record the thread URL, selected model and effort, input hash, final response,
actual tool activity and Usage breakdown. Fresh threads share the same frozen
agent configuration; do not silently compare a production developer persona with
a minimal evaluation persona. Prompt-byte reductions do not explain all host cost
changes; caching and provider-added context also matter.

Observe the account balance and effective cap before runs. Hyperagent's current
UI enforces per-query dollar limits only on Claude; a displayed limit on another
model is not proof of enforcement. Follow the user's authorized scope and existing
operator constraints rather than falsely reporting a protected non-Claude run.
