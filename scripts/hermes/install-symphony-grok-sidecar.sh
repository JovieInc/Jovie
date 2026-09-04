#!/usr/bin/env bash
# Retired compatibility entrypoint. Official Symphony on :4041 is the sole
# coding runtime; this path must never materialize or unmask legacy units.
set -euo pipefail

TARGET_HOME="${SYMPHONY_GROK_SIDECAR_HOME:-$HOME}"
UNIT_DIR="$TARGET_HOME/.config/systemd/user"
UNITS=(symphony-grok-sidecar.service symphony-grok-sidecar.timer)

case "${1:-}" in
  --check)
    rc=0
    for unit in "${UNITS[@]}"; do
      if [[ -e "$UNIT_DIR/$unit" || -L "$UNIT_DIR/$unit" ]]; then
        echo "LEGACY_UNIT_PRESENT $UNIT_DIR/$unit"
        rc=1
      else
        echo "RETIRED $unit"
      fi
    done
    exit "$rc"
    ;;
  ""|--no-daemon-reload)
    echo "RETIRED_INSTALL_REFUSED use install-gem-fleet-controller.sh" >&2
    exit 2
    ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac
