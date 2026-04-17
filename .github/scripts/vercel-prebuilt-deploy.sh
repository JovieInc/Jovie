#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <github-output-key> [vercel args...]" >&2
  exit 1
fi

github_output_key="$1"
shift
deploy_args=("$@")

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN must be set" >&2
  exit 1
fi

parse_deployment_url() {
  printf '%s\n' "$1" | grep -Eo 'https://[^[:space:]]+\.vercel\.app/?' | tail -1 || true
}

write_deployment_url() {
  local deployment_url="$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "${github_output_key}=${deployment_url}" >> "$GITHUB_OUTPUT"
  fi
}

count_prebuilt_files() {
  if [ ! -d ".vercel/output" ]; then
    echo "0"
    return
  fi

  find .vercel/output -type f | wc -l | tr -d ' '
}

run_deploy() {
  local mode="$1"
  shift

  if [ "$mode" = "archive" ]; then
    vercel deploy --prebuilt --archive=tgz "$@" --token "$VERCEL_TOKEN"
    return
  fi

  if [ "$mode" = "plain" ]; then
    vercel deploy --prebuilt "$@" --token "$VERCEL_TOKEN"
    return
  fi

  vercel deploy "$@" --token "$VERCEL_TOKEN"
}

try_mode() {
  local mode="$1"
  local attempt="$2"
  shift 2

  local deploy_output=""
  if deploy_output="$(run_deploy "$mode" "$@" 2>&1)"; then
    echo "$deploy_output"
    local deployment_url=""
    deployment_url="$(parse_deployment_url "$deploy_output")"
    if [ -z "$deployment_url" ]; then
      echo "Deploy succeeded but no preview URL was found in Vercel output" >&2
      return 1
    fi
    write_deployment_url "$deployment_url"
    echo "Deploy succeeded on attempt $attempt with ${mode} upload"
    return 0
  fi

  echo "$deploy_output"
  return 1
}

plain_prebuilt_limit=15000
prebuilt_file_count="$(count_prebuilt_files)"
can_use_plain_prebuilt=true

if [ "$prebuilt_file_count" -gt "$plain_prebuilt_limit" ]; then
  can_use_plain_prebuilt=false
fi

echo "Prebuilt output file count: $prebuilt_file_count"

for attempt in 1 2 3; do
  echo "Deploy attempt $attempt/3"

  if try_mode archive "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi

  if [ "$can_use_plain_prebuilt" = true ]; then
    echo "Archive deploy failed; falling back to standard prebuilt upload."
    if try_mode plain "$attempt" "${deploy_args[@]}"; then
      exit 0
    fi
  else
    echo "Skipping plain prebuilt fallback because Vercel rejects more than ${plain_prebuilt_limit} files and .vercel/output has ${prebuilt_file_count} files."
  fi

  echo "Falling back to source deployment."
  if try_mode source "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "Deploy failed, retrying in 10s..."
    sleep 10
  fi
done

echo "Deploy failed after 3 attempts" >&2
exit 1
