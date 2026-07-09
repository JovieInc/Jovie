#!/usr/bin/env bash
set -euo pipefail

for flag in \
  JOVIE_RUN_LIVE_EVALS \
  JOVIE_RUN_LIVE_HTTP_EVALS \
  JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS \
  JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS
do
  if [ "${!flag:-0}" = "1" ]; then
    echo "Refusing to run golden eval CI gate with ${flag}=1" >&2
    exit 1
  fi
  export "${flag}=0"
done

unset \
  AI_GATEWAY_API_KEY \
  OPENAI_API_KEY \
  ANTHROPIC_API_KEY \
  XAI_API_KEY \
  VERCEL_OIDC_TOKEN \
  BRAINTRUST_API_KEY \
  DATABASE_URL \
  DATABASE_URL_MAIN \
  BETTER_AUTH_SECRET \
  NEXT_PUBLIC_BETTER_AUTH_URL \
  STRIPE_SECRET_KEY \
  SPOTIFY_CLIENT_ID \
  SPOTIFY_CLIENT_SECRET \
  UPSTASH_REDIS_REST_URL \
  UPSTASH_REDIS_REST_TOKEN

vitest run --config vitest.config.golden-eval.mts