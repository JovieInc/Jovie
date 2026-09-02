#!/usr/bin/env bash
# Ultrawide List HUD owns tty1. Official burrito stays on :4043 with journal logs, not tty1.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "$ROOT/scripts/hermes/gem-checkin-hud.py" "$@"
