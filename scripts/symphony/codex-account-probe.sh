#!/usr/bin/env bash
# codex-account-probe: authenticated, locked recovery probe for cooling Codex
# accounts. A successful probe writes a short-lived readiness receipt and only
# then clears that account's cooldown. Failed or indeterminate probes leave the
# existing cooldown untouched.
set -euo pipefail

ACCOUNTS_ROOT="${CODEX_ACCOUNTS_ROOT:-$HOME/.codex-accounts}"
STATE_FILE="${CODEX_ACCOUNTS_STATE:-$ACCOUNTS_ROOT/state.json}"
REAL_CODEX="${CODEX_REAL_BIN:-$HOME/.local/bin/codex}"
LOG_FILE="${CODEX_ROTATE_LOG:-$ACCOUNTS_ROOT/rotate.log}"
PROBE_TIMEOUT="${CODEX_ACCOUNT_PROBE_TIMEOUT:-15}"
RECEIPT_TTL="${CODEX_ACCOUNT_READINESS_TTL_SECONDS:-600}"

export ACCOUNTS_ROOT STATE_FILE REAL_CODEX LOG_FILE PROBE_TIMEOUT RECEIPT_TTL

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/codex_account_probe.py"
