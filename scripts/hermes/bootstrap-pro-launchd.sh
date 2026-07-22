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
HERMES_SCRIPTS="${HERMES_HOME}/scripts"
LAUNCH_AGENTS="${HOME}/Library/LaunchAgents"
PRO_TEMPLATE_DIR="${REPO_ROOT}/scripts/hermes/launchd/pro"
LAUNCHD_TEMPLATE_DIR="${REPO_ROOT}/scripts/hermes/launchd"
SHIPPER_ENTRYPOINT_SRC="${REPO_ROOT}/scripts/hermes/shipper-gated-entrypoint.py"
SHIPPER_ENTRYPOINT_DST="${HERMES_SCRIPTS}/shipper-gated-entrypoint.py"
CODEX_SHIPPER_PLIST_TEMPLATE="${LAUNCHD_TEMPLATE_DIR}/co.jovie.hermes.cron-codex-issue-shipper.plist.template"
INSTALL_HELPER="${REPO_ROOT}/scripts/hermes/lib/install-launchd-artifacts.sh"

# shellcheck source=scripts/hermes/lib/install-launchd-artifacts.sh
source "$INSTALL_HELPER"

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
require_cmd plutil
require_cmd shasum
chmod +x "${REPO_ROOT}/scripts/hermes/ship-loop.sh"
[[ -f "$SHIPPER_ENTRYPOINT_SRC" ]] || die "Missing shipper entrypoint: $SHIPPER_ENTRYPOINT_SRC"
[[ -f "$CODEX_SHIPPER_PLIST_TEMPLATE" ]] || die "Missing codex shipper plist: $CODEX_SHIPPER_PLIST_TEMPLATE"

mkdir -p "$HERMES_HOME/logs/launchd" "$HERMES_SCRIPTS" "$LAUNCH_AGENTS"
LAUNCHD_STAGE="$(hermes_create_launchd_stage)"
trap 'hermes_remove_launchd_stage "$LAUNCHD_STAGE"' EXIT
INSTALL_ARGS=()
hermes_stage_artifact "$SHIPPER_ENTRYPOINT_SRC" \
  "${LAUNCHD_STAGE}/shipper-gated-entrypoint.py" 755
INSTALL_ARGS+=(
  "${LAUNCHD_STAGE}/shipper-gated-entrypoint.py"
  "$SHIPPER_ENTRYPOINT_DST"
  755
)

log "Rendering Houston launchd plists (mode=$MODE)"
while IFS= read -r label; do
  [[ -n "$label" ]] || continue
  tmpl="${PRO_TEMPLATE_DIR}/${label}.plist.template"
  out="${LAUNCHD_STAGE}/${label}.plist"
  render_plist "$tmpl" "$out"
  INSTALL_ARGS+=("$out" "${LAUNCH_AGENTS}/${label}.plist" 644)
  ok "staged $label"
done < <(pro_labels)

CODEX_SHIPPER_PLIST_STAGE="${LAUNCHD_STAGE}/co.jovie.hermes.cron-codex-issue-shipper.plist"
render_plist "$CODEX_SHIPPER_PLIST_TEMPLATE" "$CODEX_SHIPPER_PLIST_STAGE"
INSTALL_ARGS+=(
  "$CODEX_SHIPPER_PLIST_STAGE"
  "${LAUNCH_AGENTS}/co.jovie.hermes.cron-codex-issue-shipper.plist"
  644
)
ok "staged co.jovie.hermes.cron-codex-issue-shipper"

hermes_install_validated_launchd_artifacts "$LAUNCHD_STAGE" "${INSTALL_ARGS[@]}"
ok "validated and installed launchd artifacts"

if [[ "$MODE" == "reconfigure" ]]; then
  log "Reconfigure complete. Restart with:"
  echo "  launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.cron-codex-kanban-ship"
  echo "  launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.cron-codex-issue-shipper"
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

for label in co.jovie.hermes.cron-codex-issue-shipper; do
  plist="${LAUNCH_AGENTS}/${label}.plist"
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  ok "bootstrapped $label"
done

# agentcookie sender (optional — only if binary is installed and env vars are set)
AGENTCOOKIE_PLIST="${LAUNCH_AGENTS}/co.jovie.hermes.agentcookie-sender.plist"
if [[ -f "$AGENTCOOKIE_PLIST" ]] && command -v agentcookie >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/co.jovie.hermes.agentcookie-sender" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTCOOKIE_PLIST"
  ok "bootstrapped co.jovie.hermes.agentcookie-sender"
elif [[ -f "$AGENTCOOKIE_PLIST" ]]; then
  printf "\033[1;33m!\033[0m agentcookie sender plist rendered but binary not found; skipping bootstrap.\n" >&2
  printf "\033[1;33m!\033[0m Install agentcookie, then: launchctl bootstrap gui/\$(id -u) %s\n" "$AGENTCOOKIE_PLIST" >&2
fi

ok "Houston launchd bootstrap complete."
log "Force a run: launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.cron-codex-kanban-ship"
log "Force shipper: launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.cron-codex-issue-shipper"
log "Tail logs: tail -f ~/.hermes/logs/launchd/cron-codex-kanban-ship.log ~/.hermes/logs/ship-loop.log ~/.hermes/logs/launchd/cron-codex-issue-shipper.log"
