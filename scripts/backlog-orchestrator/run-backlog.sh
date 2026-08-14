#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  linear_env_file="${HOME}/.config/symphony/linear.env"
  if [[ ! -r "$linear_env_file" ]]; then
    printf 'LINEAR_API_KEY is not set and credential file is unavailable: %s\n' "$linear_env_file" >&2
    exit 1
  fi
  LINEAR_API_KEY="$(tr -d '\r\n' < "$linear_env_file")"
  LINEAR_API_KEY="${LINEAR_API_KEY#LINEAR_API_KEY=}"
  export LINEAR_API_KEY
fi

if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  printf 'LINEAR_API_KEY is empty; set it or provide %s\n' "${HOME}/.config/symphony/linear.env" >&2
  exit 1
fi

cd "$(dirname "$0")"
# Runtime cache/report live outside this checkout (JOV-5076). Do not add a
# timer tick here — callers must be event-driven (Linear issue/label/comment).
exec node backlog-orchestrator.mjs "$@"
