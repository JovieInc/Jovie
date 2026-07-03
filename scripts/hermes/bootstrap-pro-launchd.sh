#!/usr/bin/env bash
#
# Houston (MacBook Pro) launchd installer for coder/shipping loops.
# Idempotent: re-renders Pro-only plist templates and bootstraps them.
#
# Usage:
#   ./scripts/hermes/bootstrap-pro-launchd.sh
#   ./scripts/hermes/bootstrap-pro-launchd.sh --reconfigure
#   ./scripts/hermes/bootstrap-pro-launchd.sh --uninstall
#
set -euo pipefail

MODE="install"
for arg in "$@"; do
  case "$arg" in
    --reconfigure) MODE="reconfigure" ;;
    --uninstall) MODE="uninstall" ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERMES_HOME="${HOME}/.hermes"
LAUNCH_AGENTS="${HOME}/Library/LaunchAgents"
PRO_TEMPLATE_DIR="${REPO_ROOT}/scripts/hermes/launchd/pro"

log() { printf "\033[1;34m▶\033[0m %s\n" "$*"; }
ok() { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"
}

render_plist() {
  local tmpl="$1"
  local out="$2"
  HOME_V="$HOME" REPO_V="$REPO_ROOT" NODE_BIN_V="$(dirname "$(command -v node)")" \
  python3 - "$tmpl" "$out" <<'PYEOF'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
mapping = {
    "{{HOME}}": os.environ["HOME_V"],
    "{{JOVIE_REPO}}": os.environ["REPO_V"],
    "{{NODE_BIN_DIR}}": os.environ["NODE_BIN_V"],
}
with open(src, "r", encoding="utf-8") as f:
    content = f.read()
for key, value in mapping.items():
    content = content.replace(key, value)
with open(dst, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF
}

pro_labels() {
  local tmpl label
  for tmpl in "${PRO_TEMPLATE_DIR}"/*.plist.template; do
    [[ -f "$tmpl" ]] || continue
    label="$(basename "$tmpl" .plist.template)"
    printf '%s\n' "$label"
  done
}

if [[ "$MODE" == "uninstall" ]]; then
  log "Uninstalling Houston launchd units"
  while IFS= read -r label; do
    [[ -n "$label" ]] || continue
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
    rm -f "${LAUNCH_AGENTS}/${label}.plist"
    ok "removed $label"
  done < <(pro_labels)
  exit 0
fi

require_cmd node
require_cmd python3
require_cmd launchctl
chmod +x "${REPO_ROOT}/scripts/hermes/ship-loop.sh"

mkdir -p "$HERMES_HOME/logs/launchd" "$LAUNCH_AGENTS"

log "Rendering Houston launchd plists (mode=$MODE)"
while IFS= read -r label; do
  [[ -n "$label" ]] || continue
  tmpl="${PRO_TEMPLATE_DIR}/${label}.plist.template"
  out="${LAUNCH_AGENTS}/${label}.plist"
  render_plist "$tmpl" "$out"
  ok "rendered $label"
done < <(pro_labels)

if [[ "$MODE" == "reconfigure" ]]; then
  log "Reconfigure complete. Restart with:"
  echo "  launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.cron-codex-kanban-ship"
  exit 0
fi

log "Bootstrapping Houston launchd units"
while IFS= read -r label; do
  [[ -n "$label" ]] || continue
  plist="${LAUNCH_AGENTS}/${label}.plist"
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  ok "bootstrapped $label"
done < <(pro_labels)

ok "Houston launchd bootstrap complete."
log "Force a run: launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.cron-codex-kanban-ship"
log "Tail logs: tail -f ~/.hermes/logs/launchd/cron-codex-kanban-ship.log ~/.hermes/logs/ship-loop.log"