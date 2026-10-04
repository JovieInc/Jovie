#!/usr/bin/env bash
# pen-fanout.sh <jobs.tsv> <batch-name> [max-parallel]
# Runs headless `pen` agent jobs in parallel. See README.md.
# jobs.tsv: id \t agent \t model \t target_frame_id \t direction   (# lines are skipped)
#
# Env:
#   PEN_WS     (required) scratch copy of the workspace: holds src.pen (or slice-<target>.pen) and
#              receives <batch>-run-<id>.pen. Every .pen stays in this root because Pen resolves
#              image paths relative to the file. Refused if it points under ~/Documents.
#   PEN_LOGS   log dir (default: $PEN_WS/../logs)
#   PEN_SKILL  file attached with --prompt-file (default: ~/.codex/skills/frontend-skill/SKILL.md)
#   PEN_SLICE  1 = use slice-<target>.pen (pen-slice.mjs). Full 18MB inputs time out at N=10.
#   PEN_MODE   dup (default: duplicate the target and restyle it) | new (build a new frame,
#              using the target only as reference)
#   PEN_BRIEF  extra brief text for PEN_MODE=new
set -uo pipefail
# Node 22's default family autoselection (250ms) can time out on font CDNs under load: text then
# renders blank, existing frames reflow and saves write y:null.
export NODE_OPTIONS="--network-family-autoselection-attempt-timeout=2000"

[ $# -ge 2 ] || { echo "usage: pen-fanout.sh <jobs.tsv> <batch> [max-parallel]" >&2; exit 64; }
: "${PEN_WS:?set PEN_WS to a scratch copy of the workspace}"
docs="$(cd "$HOME/Documents" 2>/dev/null && pwd -P || echo "$HOME/Documents")"
case "$(cd "$PEN_WS" && pwd -P)" in
  "$docs"*) echo "refusing: PEN_WS is a real workspace; copy it to scratch first" >&2; exit 9 ;;
esac
JOBS=$1
B=$2
P=${3:-3}
LOG="${PEN_LOGS:-$PEN_WS/../logs}/$B"
mkdir -p "$LOG"
export PEN_WS LOG B
export PEN_SKILL="${PEN_SKILL:-$HOME/.codex/skills/frontend-skill/SKILL.md}"
export PEN_SLICE="${PEN_SLICE:-0}" PEN_MODE="${PEN_MODE:-dup}" PEN_BRIEF="${PEN_BRIEF:-}"

run() {
  IFS=$'\t' read -r id agent model target dir <<<"$1"
  local prompt in t0 rc
  if [ "$PEN_MODE" = new ]; then
    prompt="Reference: the existing top-level frame with id \"$target\" holds the current designs, components and tokens. Use it only as reference and never modify, move or delete it or any existing node. Create ONE NEW top-level frame, 1440px wide, placed clear of all existing content (x beyond the rightmost node). Name it \"PENPAR $B/$id · $dir\". Brief: $PEN_BRIEF Direction: $dir. Reuse existing components and variables where they fit. Be efficient: aim for under 25 tool calls, then stop."
  else
    prompt="Target: the existing top-level frame with id \"$target\". Duplicate it as ONE NEW top-level frame placed clear of all existing content (x beyond the rightmost node). Name it \"PENPAR $B/$id · $dir · from $target\". Apply this design direction to the duplicate only: $dir. Hard rules: never modify, move or delete any existing node; keep product copy verbatim unless the direction requires otherwise; reuse existing components/variables; stay inside the new frame. Be efficient: aim for under 20 tool calls, then stop."
  fi
  in="$PEN_WS/src.pen"
  [ "$PEN_SLICE" = 1 ] && in="$PEN_WS/slice-$target.pen"
  t0=$(date +%s)
  pen --in "$in" --out "$PEN_WS/$B-run-$id.pen" --agent "$agent" --model "$model" \
    --prompt "$prompt" --prompt-file "$PEN_SKILL" --usage "$LOG/usage-$id.json" \
    --max-failed-calls 15 >"$LOG/run-$id.log" 2>&1
  rc=$?
  printf '%s\t%s\t%s\t%s\trc=%s\twall=%ss\n' "$id" "$agent" "$model" "$target" "$rc" \
    "$(($(date +%s) - t0))" | tee -a "$LOG/results.tsv"
}
export -f run

(while :; do echo "$(date +%T) $(sysctl -n vm.loadavg 2>/dev/null || cut -d' ' -f1-3 /proc/loadavg)" >>"$LOG/load.txt"; sleep 10; done) &
LP=$!
trap 'kill $LP 2>/dev/null' EXIT
T0=$(date +%s)
grep -v '^#' "$JOBS" | grep -v '^$' | tr '\n' '\0' | xargs -0 -P "$P" -I{} bash -c 'run "$@"' _ {}
echo "BATCH $B wall=$(($(date +%s) - T0))s" | tee -a "$LOG/results.tsv"
