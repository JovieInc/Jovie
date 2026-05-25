#!/usr/bin/env bash
set -euo pipefail

mode="${1:-smoke}"

if [ "${JOVIE_RUN_LIVE_EVALS:-}" != "1" ]; then
  echo "Set JOVIE_RUN_LIVE_EVALS=1 to run live Promptfoo evals" >&2
  exit 1
fi

if [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
  echo "AI_GATEWAY_API_KEY is required for live Promptfoo evals" >&2
  exit 1
fi

base_args=(
  eval
  -c
  tests/eval/promptfoo/promptfooconfig.yaml
  --filter-metadata
  cost=live
  --max-concurrency
  1
  --no-cache
  --no-share
  --no-write
  --no-table
)

case "$mode" in
  smoke)
    live_eval_limit="${JOVIE_LIVE_EVAL_LIMIT:-3}"
    case "$live_eval_limit" in
      "" | *[!0-9]*)
        echo "JOVIE_LIVE_EVAL_LIMIT must be a positive integer" >&2
        exit 1
        ;;
    esac

    if [ "$live_eval_limit" -lt 1 ]; then
      echo "JOVIE_LIVE_EVAL_LIMIT must be at least 1" >&2
      exit 1
    fi

    if [ "$live_eval_limit" -gt 3 ]; then
      echo "JOVIE_LIVE_EVAL_LIMIT must be <= 3 for evals:live; use evals:live:all for the full manual suite" >&2
      exit 1
    fi

    echo "Running $live_eval_limit capped live Promptfoo smoke case(s) at concurrency 1" >&2
    PROMPTFOO_DISABLE_TELEMETRY=1 \
      PROMPTFOO_DISABLE_UPDATE=1 \
      PROMPTFOO_NO_TESTCASE_ASSERT_WARNING=1 \
      promptfoo "${base_args[@]}" --filter-metadata liveSmoke=true --filter-first-n "$live_eval_limit"
    ;;
  all)
    echo "Running all live Promptfoo cases at concurrency 1" >&2
    PROMPTFOO_DISABLE_TELEMETRY=1 \
      PROMPTFOO_DISABLE_UPDATE=1 \
      PROMPTFOO_NO_TESTCASE_ASSERT_WARNING=1 \
      promptfoo "${base_args[@]}"
    ;;
  *)
    echo "Unknown live Promptfoo eval mode: $mode" >&2
    exit 1
    ;;
esac
