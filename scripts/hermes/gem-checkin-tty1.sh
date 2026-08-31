#!/usr/bin/env bash
# Official burrito TUI keeps tty1 until a pickup has a PR; then check-in glass HUD.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
URL="${SYMPHONY_STATE_URL:-http://127.0.0.1:4043/api/v1/state}"
if python3 - "$URL" <<'PY'
import json, sys, urllib.request
try:
    payload = json.load(urllib.request.urlopen(sys.argv[1], timeout=1.5))
except Exception:
    raise SystemExit(1)
blob = json.dumps(payload)
raise SystemExit(0 if any(token in blob for token in ('"html_url"', '"pr_url"', "pull/")) else 1)
PY
then
  exec python3 "$ROOT/scripts/hermes/gem-checkin-hud.py" "$@"
fi
echo "official TUI keeps tty1 until a pickup has a PR"
exit 0
