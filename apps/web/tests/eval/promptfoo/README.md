# Promptfoo Chat Baseline

Deterministic Promptfoo adapters for chat/onboarding contracts (tools, schemas,
routing, prompts, route contracts). Default suite: no model, DB, Clerk, Spotify,
Stripe, Slack, or Next. Live `executeChatTurn()` and live HTTP lanes are
manual-only. Case inventory lives in `promptfooconfig.yaml`.

```bash
pnpm run evals
JOVIE_RUN_LIVE_EVALS=1 pnpm run evals:live
```

Live HTTP (dev test-auth; model keys off; loopback only):

```bash
E2E_USE_TEST_AUTH_BYPASS=1 JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1 pnpm run dev:web:fast
JOVIE_RUN_LIVE_HTTP_EVALS=1 JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1 \
  JOVIE_PROMPTFOO_BASE_URL=http://127.0.0.1:3000 pnpm run evals:live:http
```

Rate-limit lane (Redis+keys off, free port):

```bash
PORT=3101 JOVIE_DISABLE_REDIS_FOR_EVALS=1 JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1 \
  E2E_USE_TEST_AUTH_BYPASS=1 pnpm run dev:web:fast
JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS=1 JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1 \
  JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1 \
  JOVIE_PROMPTFOO_BASE_URL=http://127.0.0.1:3101 pnpm run evals:live:http:rate-limit
```

Model-error lane (keys off, free port):

```bash
PORT=3102 JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1 E2E_USE_TEST_AUTH_BYPASS=1 \
  pnpm run dev:web:fast
JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS=1 JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1 \
  JOVIE_PROMPTFOO_BASE_URL=http://127.0.0.1:3102 pnpm run evals:live:http:model-error
```

Live `evals:live` needs `AI_GATEWAY_API_KEY` (Doppler). Live HTTP needs loopback
`JOVIE_PROMPTFOO_BASE_URL` plus the matching `JOVIE_PROMPTFOO_EXPECT_*` flags.
Remaining JOV-2573: production-like Clerk sessions (ship now: loopback test-auth).
