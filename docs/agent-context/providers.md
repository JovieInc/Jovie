# Provider evidence for instruction and harness changes

Reviewed 2026-09-05. These are documentation observations, not Jovie benchmark
results or proof of account access. Refresh before changing models or API options.
The shared entry point stays provider-neutral; configure differences in the host.

| Provider / model | Documented difference | Repository application |
|---|---|---|
| OpenAI GPT-6 Astra | Follows skills closely; can ask too many clarifying questions or over-test small edits. | Audit contradictory instructions; define authorization, completion and proportionate verification. [Model guidance](https://developers.openai.com/api/docs/guides/latest-model) |
| Anthropic Claude Fable 5.1 | Preserve conversation-bound thinking blocks; compaction must retain exact constraints, decisions and unfinished work. | Use native context operations; explicit checkpoint contract; avoid rewriting history to save tokens. [Fable guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) |
| Z.ai GLM-5.3 | Text-only; thinking always enabled. `reasoning_effort`: `low`, `high`, `max`. Disabling thinking fails. | Preserve requested model and validate settings; use a vision-capable evaluator for screenshots. [GLM guide](https://docs.z.ai/guides/llm/glm-5.3) |
| Moonshot Kimi K3 | Thinking always enabled; `low`, `high`, `max`; preserve the complete assistant message across tool turns. | Never reduce history to final `content`; parse structured output from content. [K3 guide](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart) |
| Google Gemini | Direct structured constraints; long source material before the final question; examples need task-specific tuning. | Clear task briefs and bounded references; evaluate examples rather than copy a universal template. [Prompting](https://ai.google.dev/gemini-api/docs/prompting-strategies) |
| DeepSeek | With tools, preserve all prior `reasoning_content`, even turns without a tool call; otherwise requests can fail. | Provider adapter owns history round trips; don't apply another provider's pruning rules. [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/) |
| xAI / Grok | Capabilities and availability are model-specific. | Verify the exact model and endpoint; do not infer tool/vision support from a family name. [Model catalog](https://docs.x.ai/developers/models) |
| Mistral | System/user messages, examples and output structure steer tasks. | Keep a stable role and explicit output contract; isolate task inputs. [Prompting](https://docs.mistral.ai/inference/prompting) |
| Alibaba Qwen | Model/template versions differ in thinking and history preservation. | Verify the served checkpoint and chat template, not just OpenAI-compatible transport. [Official Qwen repository](https://github.com/QwenLM/Qwen3.8) |

## Harness and evaluation sources

- [OpenAI harness engineering](https://openai.com/index/harness-engineering/):
  a compact instruction map with navigable repository knowledge and executable
  feedback loops. Application: split entry contract from detailed design references.
- [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction):
  provider-managed compaction is a transport capability. A Markdown checkpoint
  complements it; it does not replace opaque provider state.
- [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
  curate the information needed for the next action; retrieve context as needed.
- [OpenAI evaluation practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
  and [Anthropic agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):
  test observable outcomes and realistic failures; inspect traces and repeat trials.

## Adopt-first decision

**Extend/compose existing infrastructure.** Keep the existing AGENTS.md symlink,
scoped rules, gstack template generator, Node test runner, and promptfoo test
patterns. No new agent service, scheduler, framework, or provider proxy is needed.
Node is MIT licensed and already pinned by the repo; gstack is the existing
MIT-licensed vendored fork. The custom layer is Jovie-specific policy/route cases
and byte budgets. Local deterministic checks need no credentials or data transfer.
Live trials use the user's configured provider/CLI with synthetic tasks and record
model, harness, settings, prompt hash and raw receipts. No credential extraction,
new account, license assumption for model weights, or provider substitution.
Revisit only if this substrate cannot express an observed evaluation requirement.

The last30days research is supplementary community evidence. It returned dated
and evergreen items together; an old video or anecdote is not a current capability
claim. See [research receipt](research.md) for scope, provenance and limitations.
