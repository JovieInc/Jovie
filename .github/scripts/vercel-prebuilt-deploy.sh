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

VERCEL_CMD=()

resolve_vercel_cmd() {
  if command -v vercel >/dev/null 2>&1; then
    VERCEL_CMD=("$(command -v vercel)")
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1 && pnpm exec -- vercel --version >/dev/null 2>&1; then
    VERCEL_CMD=(pnpm exec -- vercel)
    return 0
  fi

  if [ -x "./node_modules/.bin/vercel" ]; then
    VERCEL_CMD=("./node_modules/.bin/vercel")
    return 0
  fi

  echo "Vercel CLI not found in PATH or project dependencies" >&2
  return 127
}

run_vercel() {
  "${VERCEL_CMD[@]}" "$@"
}

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
    return
  fi

  find .vercel/output -type f | wc -l | tr -d ' '
}

run_deploy() {
  local mode="$1"
  shift

  if [ "$mode" = "tgz" ]; then
    run_vercel deploy --prebuilt --archive=tgz "$@" --token "$VERCEL_TOKEN"
    return
  fi

  if [ "$mode" = "split-tgz" ]; then
    run_vercel deploy --prebuilt --archive=split-tgz "$@" --token "$VERCEL_TOKEN"
    return
  fi

  if [ "$mode" = "plain" ]; then
    run_vercel deploy --prebuilt "$@" --token "$VERCEL_TOKEN"
    return
  fi

  run_vercel deploy "$@" --token "$VERCEL_TOKEN"
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
plain_prebuilt_requested="${VERCEL_ENABLE_PLAIN_PREBUILT_FALLBACK:-false}"
prebuilt_file_count="$(count_prebuilt_files)"
has_prebuilt_output=true
can_use_plain_prebuilt=true

if [ -z "$prebuilt_file_count" ] || [ "$prebuilt_file_count" -eq 0 ]; then
  has_prebuilt_output=false
  can_use_plain_prebuilt=false
elif [ "$prebuilt_file_count" -gt "$plain_prebuilt_limit" ]; then
  can_use_plain_prebuilt=false
fi

if [ "$plain_prebuilt_requested" != "true" ]; then
  can_use_plain_prebuilt=false
fi

if [ "$has_prebuilt_output" = true ]; then
  echo "Prebuilt output file count: $prebuilt_file_count"
else
  echo "Prebuilt output file count: unavailable (.vercel/output missing or empty)"
fi
resolve_vercel_cmd
echo "Using Vercel CLI command: ${VERCEL_CMD[*]}"
echo "Plain prebuilt fallback requested: $plain_prebuilt_requested"
echo "Plain prebuilt fallback enabled: $can_use_plain_prebuilt"

deploy_modes=()

if [ "$has_prebuilt_output" = true ]; then
  deploy_modes+=(tgz split-tgz)
fi

if [ "$can_use_plain_prebuilt" = true ]; then
  deploy_modes+=(plain)
fi

deploy_modes+=(source)
total_attempts="${#deploy_modes[@]}"
attempt=0

for mode in "${deploy_modes[@]}"; do
  attempt=$((attempt + 1))

  case "$mode" in
    tgz)
      echo "Deploy attempt $attempt/$total_attempts (tgz archive prebuilt)"
      ;;
    split-tgz)
      echo "tgz archive deploy failed; trying split-tgz."
      echo "Deploy attempt $attempt/$total_attempts (split-tgz archive prebuilt)"
      ;;
    plain)
      echo "Archive deploys failed; falling back to standard prebuilt upload."
      echo "Deploy attempt $attempt/$total_attempts (plain prebuilt)"
      ;;
    source)
      if [ "$has_prebuilt_output" = false ]; then
        echo "Skipping prebuilt deploy modes because .vercel/output is missing."
        echo "Falling back to source deployment."
      elif [ "$can_use_plain_prebuilt" = true ]; then
        echo "Plain prebuilt upload failed; falling back to source deployment."
      elif [ "$plain_prebuilt_requested" != "true" ]; then
        echo "Skipping plain prebuilt fallback because it is opt-in only for this repo."
        echo "Falling back to source deployment."
      else
        echo "Skipping plain prebuilt fallback because Vercel rejects more than ${plain_prebuilt_limit} files and .vercel/output has ${prebuilt_file_count} files."
        echo "Falling back to source deployment."
      fi
      echo "Deploy attempt $attempt/$total_attempts (source deploy)"
      ;;
  esac

  if try_mode "$mode" "$attempt" "${deploy_args[@]}"; then
    exit 0
  fi
done

echo "Deploy failed after $total_attempts attempts" >&2
exit 1
