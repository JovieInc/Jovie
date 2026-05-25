# Promptfoo Chat Baseline

Runs a small Promptfoo suite against three local adapters:

- A deterministic tool-contract adapter for chat and onboarding tool availability, schemas, tool UI registry coverage, stubbed outputs, and no-spend guarantees.
- The production `executeChatTurn()` path used by `/api/chat`, with synthetic Luna Waves fixtures and eval-only tool stubs. This live path is manual-only because it calls the model provider.
- A deterministic route-contract adapter for `POST /api/chat`, covering unauthenticated requests, branch-ordering for the chat kill switch, invalid JSON, message validation, missing profile context, client-turn preconditions, rate-limit responses, and contract-only pre-dispatch success without starting Next, Clerk, or the database.
- A deterministic route-contract adapter for `POST /api/mobile/v1/chat/turns`, covering unauthenticated, invalid JSON, invalid-body variants, and `MOBILE_CHAT_RUNTIME_DISABLED` responses without starting Next or Clerk.

The default eval command is deterministic and does not call models, DB, Clerk, Spotify, Stripe, Slack, or a local Next server. The route-contract adapters mirror checked-in route behavior because direct route import in Promptfoo runs outside the Next/Clerk/DB server context.

Remaining JOV-2573 scope is live HTTP coverage for `/api/chat` with local service startup, real auth/test-session fixtures, DB-backed turn reservation/replay, and persistence assertions.

Run from the repo root:

```bash
pnpm run evals
```

To run the live `executeChatTurn()` answer-quality cases manually:

```bash
JOVIE_RUN_LIVE_EVALS=1 pnpm run evals:live
```

Promptfoo exits non-zero when baseline assertions fail. That is expected when the live suite is capturing current product behavior that should be improved. The default deterministic suite should stay green and cheap enough for CI.

Required environment for default deterministic evals:

- None.

Required environment for manual live evals:

- `JOVIE_RUN_LIVE_EVALS=1`.
- `AI_GATEWAY_API_KEY`, normally supplied by Doppler through the root `evals:live` script.
- Optional `BRAINTRUST_API_KEY` for tracing.
