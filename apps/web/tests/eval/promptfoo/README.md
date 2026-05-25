# Promptfoo Chat Baseline

Runs a small Promptfoo suite against three local adapters:

- The production `executeChatTurn()` path used by `/api/chat`, with synthetic Luna Waves fixtures and eval-only tool stubs.
- A deterministic route-contract adapter for `POST /api/chat`, covering unauthenticated requests, invalid JSON, missing profile context, client-turn preconditions, the chat kill switch, and billing-verification rate-limit messaging without starting Next, Clerk, or the database.
- A deterministic route-contract adapter for `POST /api/mobile/v1/chat/turns`, covering unauthenticated, invalid-body, and `MOBILE_CHAT_RUNTIME_DISABLED` responses without starting Next or Clerk.

This baseline does not exercise live `/api/chat` Clerk sessions, real billing lookups, DB persistence, Spotify, Stripe, or a local Next server. The route-contract adapters mirror checked-in route behavior because direct route import in Promptfoo runs outside the Next/Clerk/DB server context.

Remaining JOV-2573 scope is live HTTP coverage for `/api/chat` with local service startup, real auth/test-session fixtures, DB-backed turn reservation/replay, and persistence assertions.

Run from the repo root:

```bash
pnpm run evals
```

Promptfoo exits non-zero when baseline assertions fail. That is expected when the suite is capturing current product behavior that should be improved.

Required environment:

- `AI_GATEWAY_API_KEY`, normally supplied by Doppler through the root script.
- Optional `BRAINTRUST_API_KEY` for tracing.
