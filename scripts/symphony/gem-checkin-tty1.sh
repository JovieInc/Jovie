#!/usr/bin/env bash
# Ultrawide List HUD owns tty1. Official Symphony elixir stays on :4041 with journal logs, not tty1.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "$ROOT/scripts/symphony/gem-checkin-hud.py" "$@"
