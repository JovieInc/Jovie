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
  printf '%s\n' "$1" | grep -Eo 'https://[^[:space:]]+\.vercel\.app/?' | tail -1
}

write_deployment_url() {
  local deployment_url="$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "${github_output_key}=${deployment_url}" >> "$GITHUB_OUTPUT"
  fi
}

run_archive_deploy() {
  vercel deploy --prebuilt --archive=tgz "$@" --token "$VERCEL_TOKEN"
}

try_archive() {
  local attempt="$1"
  shift

  local deploy_output=""
  if deploy_output="$(run_archive_deploy "$@" 2>&1)"; then
    echo "$deploy_output"
    local deployment_url=""
    deployment_url="$(parse_deployment_url "$deploy_output")"
    if [ -z "$deployment_url" ]; then
      echo "Deploy succeeded but no preview URL was found in Vercel output" >&2
      return 1
    fi
    write_deployment_url "$deployment_url"
    echo "Deploy succeeded on attempt $attempt with archive upload"
    return 0
  fi

  echo "$deploy_output"
  return 1
}

for attempt in 1 2 3; do
  echo "Deploy attempt $attempt/3"

  # Keep retries on archive mode. Plain prebuilt uploads exceed Vercel's file
  # cap for this repo and turn transient archive errors into deterministic
  # failures.
  if try_archive "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "Deploy failed, retrying in 10s..."
    sleep 10
  fi
done

echo "Deploy failed after 3 attempts" >&2
exit 1
