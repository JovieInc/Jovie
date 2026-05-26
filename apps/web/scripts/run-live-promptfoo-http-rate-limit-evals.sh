#!/usr/bin/env bash
set -euo pipefail

if [ "${JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS:-}" != "1" ]; then
  echo "Set JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS=1 to run live HTTP rate-limit Promptfoo evals" >&2
  exit 1
fi

if [ "${JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED:-}" != "1" ]; then
  echo "Set JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1 after starting the local server with JOVIE_DISABLE_REDIS_FOR_EVALS=1" >&2
  exit 1
fi

if [ "${JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED:-}" != "1" ]; then
  echo "Set JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1 after starting the local server with JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1" >&2
  exit 1
fi

if [ -z "${JOVIE_PROMPTFOO_BASE_URL:-}" ]; then
  echo "JOVIE_PROMPTFOO_BASE_URL is required for live HTTP rate-limit Promptfoo evals" >&2
  exit 1
fi

case "${JOVIE_PROMPTFOO_BASE_URL}" in
  http://localhost:* | http://127.0.0.1:* | http://[[]::1[]]:* | http://*.localhost:* | https://localhost:* | https://127.0.0.1:* | https://[[]::1[]]:* | https://*.localhost:*)
    ;;
  *)
    echo "Live HTTP rate-limit Promptfoo evals only run against loopback hosts" >&2
    exit 1
    ;;
esac

echo "Running live HTTP rate-limit Promptfoo evals against ${JOVIE_PROMPTFOO_BASE_URL}" >&2
unset AI_GATEWAY_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY BRAINTRUST_API_KEY
unset UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN
export JOVIE_RUN_LIVE_HTTP_EVALS=1

PROMPTFOO_DISABLE_TELEMETRY=1 \
  PROMPTFOO_DISABLE_UPDATE=1 \
  PROMPTFOO_NO_TESTCASE_ASSERT_WARNING=1 \
  promptfoo eval \
    -c tests/eval/promptfoo/promptfooconfig.yaml \
    --filter-metadata cost=live-rate-limit \
    --max-concurrency 1 \
    --no-cache \
    --no-share \
    --no-write \
    --no-table
