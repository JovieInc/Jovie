# Promptfoo Chat Baseline

Runs a small Promptfoo suite against three local adapters:

- A deterministic tool-contract adapter for chat and onboarding tool availability, schemas, tool UI registry coverage, stubbed outputs, and no-spend guarantees.
- The production `executeChatTurn()` path used by `/api/chat`, with synthetic Luna Waves fixtures and eval-only tool stubs. This live path is manual-only because it calls the model provider.
- A deterministic route-contract adapter for `POST /api/chat`, covering unauthenticated requests, branch-ordering for the chat kill switch, invalid JSON, message validation, missing profile context, client-turn preconditions, rate-limit responses, and contract-only pre-dispatch success without starting Next, Clerk, or the database.
- A deterministic route-contract adapter for `POST /api/mobile/v1/chat/turns`, covering unauthenticated, invalid JSON, invalid-body variants, and `MOBILE_CHAT_RUNTIME_DISABLED` responses without starting Next or Clerk.
- A manual live HTTP adapter for `POST /api/chat`, covering loopback auth, authenticated validation errors, client-turn preconditions, DB-backed client-turn reservation, deterministic no-model terminal paths, duplicate replay, and no sensitive echo on unauthorized responses.

The default eval command is deterministic and does not call models, DB, Clerk, Spotify, Stripe, Slack, or a local Next server. The route-contract adapters mirror checked-in route behavior because direct route import in Promptfoo runs outside the Next/Clerk/DB server context.

Remaining JOV-2573 scope is live HTTP coverage for isolated rate-limit headers, terminal model-error variants, and production-like Clerk sessions. The current live HTTP lane uses loopback dev test-auth and deterministic no-model paths.

Cost decision: Ship now live HTTP validation and persistence coverage that never needs model dispatch. Re-evaluate when a local eval server can reliably start with Redis disabled or namespace-isolated, so rate-limit exhaustion costs zero external quota and cannot poison shared dev state. Then add live HTTP rate-limit exhaustion cases with capped request counts and concurrency 1.

Run from the repo root:

```bash
pnpm run evals
```

To run the live `executeChatTurn()` answer-quality cases manually:

```bash
JOVIE_RUN_LIVE_EVALS=1 pnpm run evals:live
```

To run the live HTTP `/api/chat` route cases manually, start the web app with dev test-auth enabled, then run the HTTP lane:

```bash
E2E_USE_TEST_AUTH_BYPASS=1 pnpm run dev:web:fast
JOVIE_RUN_LIVE_HTTP_EVALS=1 JOVIE_PROMPTFOO_BASE_URL=http://127.0.0.1:3000 pnpm run evals:live:http
```

Promptfoo exits non-zero when baseline assertions fail. That is expected when the live suite is capturing current product behavior that should be improved. The default deterministic suite should stay green and cheap enough for CI.

Required environment for default deterministic evals:

- None.

Required environment for manual live evals:

- `JOVIE_RUN_LIVE_EVALS=1`.
- `AI_GATEWAY_API_KEY`, normally supplied by Doppler through the root `evals:live` script.
- Optional `BRAINTRUST_API_KEY` for tracing.

Required environment for manual live HTTP evals:

- `JOVIE_RUN_LIVE_HTTP_EVALS=1`.
- `JOVIE_PROMPTFOO_BASE_URL`, restricted to loopback hosts.
- Local web server started with `E2E_USE_TEST_AUTH_BYPASS=1`.
- Local/Doppler DB and Clerk test-user setup required by `/api/dev/test-auth/session`.
