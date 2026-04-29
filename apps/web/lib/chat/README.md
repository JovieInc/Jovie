# lib/chat

Provider-neutral chat-turn pipeline. Wraps the Vercel AI SDK with Jovie-specific system prompts, tool registries, knowledge selection, and streaming. The chat HTTP route (`apps/web/app/api/chat/route.ts`) calls into this module — keep the route as the boundary for Sentry, billing, and rate-limiting concerns.

## Chat-turn flow

`run.ts:executeChatTurn()` is the entry point. The pipeline:

1. **Knowledge selection** — `knowledge/router.ts` extracts relevant industry context from the last few user turns (topics in `knowledge/topics.ts`).
2. **System prompt** — `system-prompt.ts:buildSystemPrompt()` composes artist context, discography summary, plan capabilities, and tool docs.
3. **Message conversion** — UIMessage history → AI SDK ModelMessage format.
4. **Model selection** — frontier model by default; `forceLightModel` (Statsig kill-switch) routes to the cheaper/faster model. Free-tier short-intent traffic also routes light.
5. **`streamText()`** — AI SDK call with system prompt, messages, and tools.
6. **Streaming** — return a UIMessage stream the route hands directly to the client.

Key files:

- `run.ts` — pipeline + model selection + `isClientDisconnect()`
- `system-prompt.ts` — prompt assembly
- `tool-schemas.ts` — Zod schemas (shared with eval / test runners)
- `tool-ui-registry.ts` / `tool-events.ts` — UI affordances and event types for streamed tool calls
- `command-registry.ts` — slash-command intents
- `knowledge/router.ts` + `knowledge/topics.ts` — knowledge retrieval
- `submit-feedback.ts` — concrete tool implementation called from the route's free tool set
- `tokens.ts` — token estimation for budget guards

## Tool registry

Tools are NOT defined here. They are built in the route (`buildFreeChatTools`, `buildChatTools`) and passed into `executeChatTurn()` as `tools`. This keeps the pipeline free of plan/billing logic.

- **Free tier** (always available): photo upload, social link add/remove, feedback
- **Paid tier**: profile edits, bio writing, canvas planning, album art generation, pitch generation, promo strategy, release creation, analytics insights

## Telemetry contract

`types.ts` defines `ChatTelemetry` with `setTags`, `setExtra`, `captureException`. The route binds Sentry; eval scripts pass a no-op. The pipeline never imports `@sentry/nextjs` directly.

## Adding a new tool

1. Implement the tool factory under `apps/web/lib/ai/tools/<name>.ts` with `tool({ description, inputSchema, execute })`.
2. Register it in `apps/web/app/api/chat/route.ts` — `buildFreeChatTools` if always-on, `buildChatTools` if plan-gated.
3. Mention it in `system-prompt.ts` so the model knows when to call it.
4. If shared with eval/test runners, add the schema to `tool-schemas.ts`.
5. If the client needs to render special UI for tool output, register a renderer in `tool-ui-registry.ts`.
