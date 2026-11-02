#!/usr/bin/env bash
# Weekly (and threshold-check) driver for the time-leverage system. Runs on the Mac that holds Tim's
# Claude Code transcripts and Messages; the agent-waste half reads the lanes state dir when LANES_STATE_DIR
# points at a copy of (or mount of) the Gem state. Output stays in $JOVIE_TIMEWASTE_DIR (private, 0700).
#   run.sh weekly   collect + propose + surface (+ post to Ovie when OVIE_TIMELEVERAGE_URL and CRON_SECRET are set)
#   run.sh check    collect nothing new; print thresholds crossed (Summer files an issue per crossing)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
state_args=()
[ -n "${LANES_STATE_DIR:-}" ] && state_args=(--state-dir "$LANES_STATE_DIR")
case "${1:-weekly}" in
  weekly)
    python3 -m timewaste collect "${state_args[@]}" >/dev/null
    python3 -m timewaste propose --json --top 5
    python3 -m timewaste surface --post
    ;;
  check) python3 -m timewaste check --json ;;
  *) echo "usage: run.sh weekly|check" >&2; exit 2 ;;
esac
