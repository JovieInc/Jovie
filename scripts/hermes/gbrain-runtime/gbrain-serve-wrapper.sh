#!/usr/bin/env bash
# Repository-owned launcher for the shared, loopback-only GBrain HTTP service.
#
# This wrapper intentionally runs the installed release binary. A source checkout
# is not a deployment boundary and is never inferred from the working directory.
set -euo pipefail

GBRAIN_BIN="${GBRAIN_BIN:-${HOME}/.hermes/bin/gbrain}"
GBRAIN_SERVE_BIND="${GBRAIN_SERVE_BIND:-127.0.0.1}"
GBRAIN_SERVE_PORT="${GBRAIN_SERVE_PORT:-7801}"
GBRAIN_CONFIG_FILE="${GBRAIN_CONFIG_FILE:-${HOME}/.gbrain/config.json}"

case "$GBRAIN_SERVE_BIND" in
  127.0.0.1|::1|localhost) ;;
  *)
    if [[ "${GBRAIN_ALLOW_NON_LOOPBACK:-0}" != "1" ]]; then
      echo "gbrain wrapper: refusing non-loopback bind without GBRAIN_ALLOW_NON_LOOPBACK=1" >&2
      exit 64
    fi
    ;;
esac

if [[ ! -x "$GBRAIN_BIN" ]]; then
  echo "gbrain wrapper: executable not found: $GBRAIN_BIN" >&2
  exit 66
fi

# launchd starts with a sparse environment. Load connection URLs from GBrain's
# operator-owned configuration without printing or copying them into this repo.
if [[ -f "$GBRAIN_CONFIG_FILE" ]]; then
  while IFS= read -r -d '' entry; do
    key="${entry%%=*}"
    value="${entry#*=}"
    if [[ -n "$value" ]]; then
      export "$key=$value"
    fi
  done < <(python3 - "$GBRAIN_CONFIG_FILE" <<'PY'
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    config = json.load(handle)
for config_key, env_key in (
    ("database_url", "GBRAIN_DATABASE_URL"),
    ("direct_database_url", "GBRAIN_DIRECT_DATABASE_URL"),
):
    if os.environ.get(env_key):
        continue
    value = config.get(config_key)
    if isinstance(value, str) and value:
        sys.stdout.buffer.write(f"{env_key}={value}".encode() + b"\0")
PY
  )
fi

# Bound each long-lived process. Operators can lower these values, while a
# deliberate increase remains visible in launchd configuration.
export GBRAIN_DISABLE_DIRECT_POOL="${GBRAIN_DISABLE_DIRECT_POOL:-0}"
export GBRAIN_POOL_SIZE="${GBRAIN_POOL_SIZE:-3}"
export GBRAIN_DIRECT_POOL_SIZE="${GBRAIN_DIRECT_POOL_SIZE:-1}"
export GBRAIN_MAX_CONNECTIONS="${GBRAIN_MAX_CONNECTIONS:-3}"
export GBRAIN_PG_IDLE_TIMEOUT="${GBRAIN_PG_IDLE_TIMEOUT:-0}"
export GBRAIN_PREWARM_POOL="${GBRAIN_PREWARM_POOL:-0}"

exec "$GBRAIN_BIN" serve --http \
  --bind "$GBRAIN_SERVE_BIND" \
  --port "$GBRAIN_SERVE_PORT" \
  --suppress-bootstrap-token
