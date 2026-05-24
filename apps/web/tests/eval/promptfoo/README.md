# Promptfoo Chat Baseline

Runs a small Promptfoo suite against two local adapters:

- The production `executeChatTurn()` path used by `/api/chat`, with synthetic Luna Waves fixtures and eval-only tool stubs.
- A deterministic route-contract adapter for `POST /api/mobile/v1/chat/turns`, covering unauthenticated, invalid-body, and `MOBILE_CHAT_RUNTIME_DISABLED` responses without starting Next or Clerk.

This baseline does not exercise live `/api/chat` auth, billing, rate limits, DB persistence, Clerk, Spotify, Stripe, or a local Next server. The mobile route-contract adapter mirrors the checked-in route behavior because direct route import in Promptfoo runs outside the Next/Clerk server context.

Remaining JOV-2562 scope is route-level web `/api/chat` coverage for auth, billing, rate limits, and DB persistence once that path has a thin local harness or HTTP fixture setup.

Run from the repo root:

```bash
pnpm run evals
```

Promptfoo exits non-zero when baseline assertions fail. That is expected when the suite is capturing current product behavior that should be improved.

Required environment:

- `AI_GATEWAY_API_KEY`, normally supplied by Doppler through the root script.
- Optional `BRAINTRUST_API_KEY` for tracing.
