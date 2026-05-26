# Promptfoo Chat Baseline

Runs a small Promptfoo suite against local adapters:

- Deterministic contract adapters for chat and onboarding tool availability, production tool-access gating, schemas, tool UI registry coverage, model-routing scenario inventory, knowledge-topic routing, prompt/context assembly safety, onboarding next-step state decisions, stubbed outputs, and no-spend guarantees.
- A deterministic onboarding tool-sequence adapter, covering Spotify confirmation before observation, observation before next-step evaluation, checkout only after instant access, waitlist without checkout, and blocking premature next-step attempts before artist identity.
- A deterministic tool-result shape adapter, covering synthetic success and failure output contracts for every chat and onboarding tool without model, DB, or network calls.
- A deterministic AI skill registry inventory adapter, covering deployed skill IDs, registry metadata, entitlement/model/version fields, and checked-in prompt or schema path presence without model, DB, or network calls.
- A deterministic AI skill artifact adapter, covering registry tool skills against chat tool schema/result/render coverage and vertical-agent prompt artifacts against retouch guardrails without model, DB, or network calls.
- A deterministic AI skill catalog sync adapter, covering the `SKILL_REGISTRY` to `skills_catalog`/`tools_catalog` row shape, postbuild script wiring, metadata serializability, and no DB/network side effects.
- A deterministic AI skill command adapter, covering slash/cmd+k skill command wiring, `/skill:` token round-trips, release entity-slot contracts, and explicit hidden-tool visibility decisions without model, DB, or network calls.
- The production `executeChatTurn()` path used by `/api/chat`, with synthetic Luna Waves fixtures and eval-only tool stubs. This live path is manual-only because it calls the model provider.
- A deterministic route-contract adapter for `POST /api/chat`, covering unauthenticated requests, branch-ordering for the chat kill switch, invalid JSON, message validation, missing profile context, client-turn preconditions, client-turn replay/in-progress branches, deterministic intent short-circuits, album-art unavailable preflight, rate-limit terminal responses, and contract-only pre-dispatch success without starting Next, Clerk, or the database.
- A deterministic route-contract adapter for chat confirmation endpoints, covering `confirm-edit`, `confirm-link`, `confirm-remove-link`, and album-art apply validation, ownership, entitlement, safe URL, soft-delete, audit, sync, and apply boundaries without starting Next, Clerk, or the database.
- A deterministic route-contract adapter for `POST /api/mobile/v1/chat/turns`, covering unauthenticated, invalid JSON, invalid-body variants, and `MOBILE_CHAT_RUNTIME_DISABLED` responses without starting Next or Clerk.
- A deterministic route-contract adapter for `POST /api/onboarding/welcome-chat`, covering the `/start` to signed-in chat handoff, profile absence, initial-reply limits, existing-conversation reuse, retry idempotency, safe orphan claiming, unsafe orphan rejection, and route construction without starting Next, Clerk, or the database.
- A manual live HTTP adapter for `POST /api/chat`, covering loopback auth, authenticated validation errors, client-turn preconditions, DB-backed client-turn reservation, deterministic no-model terminal paths, duplicate replay, and no sensitive echo on unauthorized responses.
- A separate manual live HTTP rate-limit adapter for the anonymous `/api/chat` onboarding path, covering fail-closed 429 headers when Redis is intentionally disabled on the local server.
- A separate manual live HTTP model-error adapter for authenticated `/api/chat`, covering terminal streaming model failures, generic fallback copy, DB-backed `failed_model_error` persistence, duplicate replay, and no public provider diagnostics when model credentials are intentionally disabled on the local server.

The default eval command is deterministic and does not call models, DB, Clerk, Spotify, Stripe, Slack, or a local Next server. The route-contract adapters mirror checked-in route behavior because direct route import in Promptfoo runs outside the Next/Clerk/DB server context.

Remaining JOV-2573 scope is production-like Clerk sessions. The current live HTTP lanes use loopback dev test-auth, deterministic no-model paths, an isolated Redis-disabled local server for rate-limit coverage, and an isolated model-key-disabled local server for terminal model-error coverage.

Cost decision: Ship now live HTTP validation, persistence, Redis-disabled rate-limit coverage, and model-key-disabled terminal model-error coverage with no paid model calls. Re-evaluate when production-like Clerk sessions can run locally without real customer data or paid auth-provider side effects. Then add Clerk-session live HTTP cases with capped case count and concurrency 1 under JOV-2573.

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

To run the isolated live HTTP rate-limit case, start the local server with Redis and model provider keys disabled. Use a port that is not already owned by another worktree:

```bash
PORT=3101 JOVIE_DISABLE_REDIS_FOR_EVALS=1 JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1 E2E_USE_TEST_AUTH_BYPASS=1 pnpm run dev:web:fast
JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS=1 JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1 JOVIE_PROMPTFOO_BASE_URL=http://127.0.0.1:3101 pnpm run evals:live:http:rate-limit
```

To run the isolated live HTTP model-error case, start the local server with model provider credentials disabled. Use a port that is not already owned by another worktree:

```bash
PORT=3102 JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1 E2E_USE_TEST_AUTH_BYPASS=1 pnpm run dev:web:fast
JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS=1 JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1 JOVIE_PROMPTFOO_BASE_URL=http://127.0.0.1:3102 pnpm run evals:live:http:model-error
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

Required environment for manual live HTTP rate-limit evals:

- `JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS=1`.
- `JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1`.
- `JOVIE_PROMPTFOO_BASE_URL`, restricted to loopback hosts.
- Local web server started with `JOVIE_DISABLE_REDIS_FOR_EVALS=1` and `JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1`.

Required environment for manual live HTTP model-error evals:

- `JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS=1`.
- `JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1`.
- `JOVIE_PROMPTFOO_BASE_URL`, restricted to loopback hosts.
- Local web server started with `E2E_USE_TEST_AUTH_BYPASS=1` and `JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1`.
