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

run_deploy() {
  local mode="$1"
  shift

  case "$mode" in
    tgz)
      vercel deploy --prebuilt --archive=tgz "$@" --token "$VERCEL_TOKEN"
      ;;
    split-tgz)
      vercel deploy --prebuilt --archive=split-tgz "$@" --token "$VERCEL_TOKEN"
      ;;
    plain)
      vercel deploy --prebuilt "$@" --token "$VERCEL_TOKEN"
      ;;
    *)
      echo "Unknown deploy mode: $mode" >&2
      return 1
      ;;
  esac
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

for attempt in 1 2 3; do
  echo "Deploy attempt $attempt/3"

  if try_mode tgz "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi

  echo "tgz archive deploy failed; trying split-tgz."
  if try_mode split-tgz "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi

  echo "split-tgz archive deploy failed; trying plain prebuilt upload."
  if try_mode plain "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi

  if [ "$attempt" -lt 3 ]; then
    echo "Deploy failed, retrying in 10s..."
    sleep 10
  fi
done

echo "Deploy failed after 3 attempts" >&2
exit 1
