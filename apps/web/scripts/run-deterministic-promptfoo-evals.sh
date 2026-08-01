#!/usr/bin/env bash
set -euo pipefail

mode="${1:-eval}"
config_path="tests/eval/promptfoo/promptfooconfig.yaml"

for flag in \
  JOVIE_RUN_LIVE_EVALS \
  JOVIE_RUN_LIVE_HTTP_EVALS \
  JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS \
  JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS
do
  if [ "${!flag:-0}" = "1" ]; then
    echo "Refusing to run deterministic Promptfoo evals with ${flag}=1" >&2
    exit 1
  fi
  export "${flag}=0"
done

export PROMPTFOO_DISABLE_TELEMETRY=1
export PROMPTFOO_DISABLE_UPDATE=1
export PROMPTFOO_NO_TESTCASE_ASSERT_WARNING=1
# Promptfoo's interactive logger can race its file transport during teardown in
# agent PTYs (`ERR_STREAM_WRITE_AFTER_END`). Pipe both output streams through a
# plain sink so local agent runs take the same non-interactive output path as CI.

# Register the server-only shim before Promptfoo loads jovie-chat-provider.ts.
# lib/ai/sdk.ts imports `server-only`; without preload, validate/eval fail in CI.
PRELOAD_SHIM="$(cd "$(dirname "$0")/../tests/eval/promptfoo" && pwd)/server-only-preload.mjs"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import file://${PRELOAD_SHIM}"

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

case "$mode" in
  validate)
    promptfoo validate -c "$config_path"
    ;;
  eval)
    # Capture full output (no interactive TTY). Promptfoo's winston File transport
    # can throw ERR_STREAM_WRITE_AFTER_END during teardown after all cases pass,
    # which would otherwise fail merge_group with exit 1 (seen on #15334).
    tmp_log="$(mktemp -t jovie-pf-eval.XXXXXX)"
    set +e
    set +o pipefail
    promptfoo eval \
      -c "$config_path" \
      --filter-metadata cost=deterministic \
      --no-cache \
      --no-share \
      --no-write \
      --no-table >"$tmp_log" 2>&1
    pf_rc=$?
    set -e
    set -o pipefail
    cat "$tmp_log"
    if [ "$pf_rc" -eq 0 ]; then
      rm -f "$tmp_log"
      exit 0
    fi
    if grep -q 'Error: write after end' "$tmp_log" \
      && grep -Eq '0 failed|passed \(100%\)|✓ Complete!' "$tmp_log" \
      && ! grep -Eq '[1-9][0-9]* failed' "$tmp_log"; then
      echo "promptfoo teardown write-after-end ignored (all deterministic cases passed)" >&2
      rm -f "$tmp_log"
      exit 0
    fi
    rm -f "$tmp_log"
    exit "$pf_rc"
    ;;
  *)
    echo "Usage: $0 [validate|eval]" >&2
    exit 2
    ;;
esac
