# Promptfoo Chat Baseline

Runs a small Promptfoo suite against the production `executeChatTurn()` path used by `/api/chat`, with synthetic Luna Waves fixtures and eval-only tool stubs.

This baseline does not exercise `/api/chat` auth, billing, rate limits, DB persistence, mobile chat, Clerk, Spotify, Stripe, or a local Next server. The native mobile chat endpoint is intentionally outside this baseline because it currently returns `MOBILE_CHAT_RUNTIME_DISABLED`.

Run from the repo root:

```bash
pnpm run evals
```

Promptfoo exits non-zero when baseline assertions fail. That is expected when the suite is capturing current product behavior that should be improved.

Required environment:

- `AI_GATEWAY_API_KEY`, normally supplied by Doppler through the root script.
- Optional `BRAINTRUST_API_KEY` for tracing.
