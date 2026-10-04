#!/usr/bin/env bash
# pen-export.sh <run.pen> <outdir> <frameId...>
# Exports frames as PNG (into outdir) and html-css (<outdir>/<id>.html; html-css needs a file
# path, a directory fails with EISDIR). The headless session writes to a throwaway --out.
set -uo pipefail
export NODE_OPTIONS="--network-family-autoselection-attempt-timeout=2000"

[ $# -ge 3 ] || { echo "usage: pen-export.sh <run.pen> <outdir> <frameId...>" >&2; exit 64; }
RUN=$1
OUT=$2
shift 2
mkdir -p "$OUT"
ids=$(printf '"%s",' "$@")
ids="[${ids%,}]"
html=""
for id in "$@"; do html+="Export([\"$id\"], \"html-css\", \"$OUT/$id.html\"); "; done
printf '%s\n' "execute({ input: 'Export($ids, \"png\", \"$OUT\"); $html' })" 'exit()' |
  pen interactive --in "$RUN" --out "$OUT/.throwaway.pen" >"$OUT/export.log" 2>&1
rm -f "$OUT/.throwaway.pen"
ls "$OUT"
