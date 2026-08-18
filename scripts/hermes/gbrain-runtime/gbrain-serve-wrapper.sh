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
read_config_snapshot() {
  python3 - "$GBRAIN_CONFIG_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    config = json.load(handle)
sys.stdout.write(json.dumps({
    "database_url": config.get("database_url", ""),
    "direct_database_url": config.get("direct_database_url", ""),
}, separators=(",", ":")))
PY
}

snapshot_value() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

value = json.loads(sys.argv[1]).get(sys.argv[2])
if isinstance(value, str):
    sys.stdout.write(value)
PY
}

if [[ -f "$GBRAIN_CONFIG_FILE" ]] && \
   [[ -z "${GBRAIN_DATABASE_URL:-}" || -z "${GBRAIN_DIRECT_DATABASE_URL:-}" ]]; then
  CONFIG_SNAPSHOT="$(read_config_snapshot)"
  if [[ -z "${GBRAIN_DATABASE_URL:-}" ]]; then
    GBRAIN_DATABASE_URL="$(snapshot_value "$CONFIG_SNAPSHOT" database_url)"
    export GBRAIN_DATABASE_URL
  fi
  if [[ -z "${GBRAIN_DIRECT_DATABASE_URL:-}" ]]; then
    GBRAIN_DIRECT_DATABASE_URL="$(snapshot_value "$CONFIG_SNAPSHOT" direct_database_url)"
    export GBRAIN_DIRECT_DATABASE_URL
  fi
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
