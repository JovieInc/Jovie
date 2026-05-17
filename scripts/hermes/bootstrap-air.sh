#!/usr/bin/env bash
#
# Hermes-Air bootstrap. Idempotent installer for the dedicated 16 GB Air.
# Run on the Air, from a clone of this repo, with Doppler authed.
#
# Modes:
#   ./scripts/hermes/bootstrap-air.sh                        # full install
#   ./scripts/hermes/bootstrap-air.sh --reconfigure          # re-render configs only
#   ./scripts/hermes/bootstrap-air.sh --uninstall            # remove launchd units + ~/.hermes
#   ./scripts/hermes/bootstrap-air.sh --resume-after-cost-kill
#
# See:
#   .claude/rules/hermes-air.md
#   docs/HERMES_AIR.md
#
set -euo pipefail

# ─── arg parsing ─────────────────────────────────────────────────────────────
MODE="install"
for arg in "$@"; do
  case "$arg" in
    --reconfigure) MODE="reconfigure" ;;
    --uninstall) MODE="uninstall" ;;
    --resume-after-cost-kill) MODE="resume" ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

# ─── constants ───────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERMES_HOME="${HOME}/.hermes"
LAUNCH_AGENTS="${HOME}/Library/LaunchAgents"
DOPPLER_PROJECT="jovie-web"
DOPPLER_CONFIG="dev"

REQUIRED_SECRETS=(
  HERMES_TELEGRAM_BOT_TOKEN
  OPENROUTER_API_KEY
  LINEAR_API_KEY
  GITHUB_TOKEN
  AIRTABLE_API_KEY
)

# ─── helpers ─────────────────────────────────────────────────────────────────
log()  { printf "\033[1;34m▶\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }
ask()  { read -r -p "$1 " REPLY; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"
}

doppler_get() {
  doppler secrets get "$1" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --plain 2>/dev/null || true
}

verify_macos_version() {
  local v
  v="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
  case "$v" in
    15.*|26.*|27.*) ok "macOS $v supported";;
    *) warn "macOS $v not validated; bootstrap will continue but voice memo transcript path may differ.";;
  esac
}

verify_arch() {
  local arch
  arch="$(uname -m)"
  if [[ "$arch" != "arm64" ]]; then
    warn "arch=$arch (not Apple Silicon). Ollama + whisper will be slower; consider running this on the Air's M-series."
  fi
}

# ─── teardown mode ───────────────────────────────────────────────────────────
if [[ "$MODE" == "uninstall" ]]; then
  log "Uninstalling Hermes-Air launchd units"
  for plist in "${LAUNCH_AGENTS}"/co.jovie.hermes.*.plist; do
    [[ -f "$plist" ]] || continue
    label="$(basename "$plist" .plist)"
    launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
    rm -f "$plist"
    ok "removed $label"
  done
  ask "Remove ~/.hermes/ entirely? [y/N]:"
  if [[ "${REPLY:-N}" =~ ^[Yy]$ ]]; then
    rm -rf "$HERMES_HOME"
    ok "removed $HERMES_HOME"
  fi
  ok "Uninstall complete. Doppler and Tailscale left untouched."
  exit 0
fi

# ─── resume mode ─────────────────────────────────────────────────────────────
if [[ "$MODE" == "resume" ]]; then
  log "Clearing cost kill switch"
  rm -f "${HERMES_HOME}/state/cost-kill-switch"
  for plist in "${LAUNCH_AGENTS}"/co.jovie.hermes.*.plist; do
    [[ -f "$plist" ]] || continue
    label="$(basename "$plist" .plist)"
    launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || \
      launchctl kickstart -k "gui/$(id -u)/${label}" 2>/dev/null || true
    ok "rebooted $label"
  done
  ok "Resume complete. Monitor cost.jsonl carefully."
  exit 0
fi

# ─── full install / reconfigure ──────────────────────────────────────────────
log "Hermes-Air bootstrap (mode=$MODE)"
verify_macos_version
verify_arch

# 1. Required system tooling
require_cmd doppler
require_cmd gh
require_cmd jq
require_cmd sqlite3
require_cmd curl

# 2. Doppler auth + scope
doppler setup --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --no-interactive >/dev/null
ok "Doppler scoped to ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"

# 3. Verify required secrets
MISSING=()
for key in "${REQUIRED_SECRETS[@]}"; do
  if [[ -z "$(doppler_get "$key")" ]]; then
    MISSING+=("$key")
  fi
done
if (( ${#MISSING[@]} > 0 )); then
  warn "Missing Doppler secrets: ${MISSING[*]}"
  warn "Set them with: doppler secrets set --project $DOPPLER_PROJECT --config $DOPPLER_CONFIG <KEY> <VALUE>"
  if [[ "$MODE" != "reconfigure" ]]; then
    die "Aborting; required secrets are missing."
  fi
fi

if [[ "$MODE" == "install" ]]; then
  # 4. Tailscale
  if ! command -v tailscale >/dev/null 2>&1; then
    log "Installing Tailscale"
    brew install --cask tailscale-app 2>/dev/null || die "Install Tailscale manually from https://tailscale.com/download/mac"
  fi
  if ! tailscale status >/dev/null 2>&1; then
    warn "Tailscale not signed in. Run \`sudo tailscale up\` and re-run bootstrap."
    die "Tailscale required for Pro↔Air gbrain queries."
  fi
  TAILSCALE_IP="$(tailscale ip -4 | head -1)"
  ok "Tailscale IP: $TAILSCALE_IP"

  # 5. Hermes (hermes-agent-rs)
  if ! command -v hermes >/dev/null 2>&1; then
    log "Installing Hermes (hermes-agent-rs)"
    curl -fsSL https://raw.githubusercontent.com/Lumio-Research/hermes-agent-rs/main/scripts/install.sh | bash
  fi
  HERMES_BIN="$(command -v hermes)"
  ok "Hermes at $HERMES_BIN"

  # 6. gbrain
  if ! command -v gbrain >/dev/null 2>&1; then
    log "Installing gbrain (see .claude/skills/setup-gbrain/SKILL.md for path 1: local PGLite)"
    warn "Run /setup-gbrain in a Claude Code session to install, then re-run bootstrap."
    die "gbrain not installed."
  fi
  GBRAIN_BIN="$(command -v gbrain)"
  ok "gbrain at $GBRAIN_BIN"

  # 7. Ollama (fallback model host)
  if ! command -v ollama >/dev/null 2>&1; then
    log "Installing Ollama"
    brew install ollama 2>/dev/null || die "Install Ollama from https://ollama.com/download/mac"
  fi
  if ! pgrep -q ollama; then
    log "Starting Ollama as a background service"
    brew services start ollama 2>/dev/null || ollama serve >/dev/null 2>&1 &
    sleep 3
  fi
  if ! ollama list 2>/dev/null | grep -q "qwen3:4b"; then
    log "Pulling qwen3:4b-q4_K_M (~2.5 GB)"
    ollama pull qwen3:4b-q4_K_M
  fi
  ok "Ollama ready with qwen3:4b-q4_K_M"

  # 8. tsx for running the cron job scripts
  if ! command -v tsx >/dev/null 2>&1; then
    log "Installing tsx globally"
    npm install -g tsx
  fi
  TSX_BIN="$(command -v tsx)"
  ok "tsx at $TSX_BIN"
else
  # reconfigure: discover existing binaries
  HERMES_BIN="$(command -v hermes || echo /usr/local/bin/hermes)"
  GBRAIN_BIN="$(command -v gbrain || echo /usr/local/bin/gbrain)"
  TSX_BIN="$(command -v tsx || echo /usr/local/bin/tsx)"
  TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -1 || echo 127.0.0.1)"
fi

# 9. Hermes home + state dirs
mkdir -p \
  "$HERMES_HOME" \
  "$HERMES_HOME/logs" \
  "$HERMES_HOME/logs/launchd" \
  "$HERMES_HOME/state"
chmod 700 "$HERMES_HOME"
ok "Hermes home: $HERMES_HOME"

# 10. Render ~/.hermes/.env from Doppler
log "Rendering ~/.hermes/.env"
{
  for key in "${REQUIRED_SECRETS[@]}"; do
    val="$(doppler_get "$key")"
    [[ -n "$val" ]] && printf "%s=%s\n" "$key" "$val"
  done
} > "${HERMES_HOME}/.env"
chmod 600 "${HERMES_HOME}/.env"
ok "Secrets rendered (chmod 600)"

# 11. Render ~/.hermes/config.yaml from template.
# Only path substitution; secrets stay as ${ENV} references that Hermes
# expands at runtime from ~/.hermes/.env. This keeps secrets out of YAML on
# disk and avoids sed-special-char corruption for keys containing | or &.
log "Rendering ~/.hermes/config.yaml"
python3 - "$REPO_ROOT" "$HOME" "${HERMES_HOME}/config.yaml" <<'PYEOF'
import sys
from pathlib import Path
repo_root, home, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
tmpl = Path(repo_root, "scripts/hermes/config.air.template.yaml").read_text()
Path(out_path).write_text(tmpl.replace("{{HOME}}", home))
PYEOF
chmod 600 "${HERMES_HOME}/config.yaml"
ok "Hermes config rendered (secrets stay as env refs)"

# 12. Render launchd plists
log "Rendering launchd plists"
mkdir -p "$LAUNCH_AGENTS"
for tmpl in "${REPO_ROOT}/scripts/hermes/launchd/"*.plist.template; do
  [[ -f "$tmpl" ]] || continue
  label="$(basename "$tmpl" .plist.template)"
  out="${LAUNCH_AGENTS}/${label}.plist"
  # Python substitution is safer than sed for paths that may contain |, &, /, etc.
  HOME_V="$HOME" REPO_V="$REPO_ROOT" HERMES_V="$HERMES_BIN" \
  GBRAIN_V="$GBRAIN_BIN" TSX_V="$TSX_BIN" TS_IP_V="$TAILSCALE_IP" \
  python3 - "$tmpl" "$out" <<'PYEOF'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
mapping = {
    "{{HOME}}": os.environ["HOME_V"],
    "{{JOVIE_REPO}}": os.environ["REPO_V"],
    "{{HERMES_BIN}}": os.environ["HERMES_V"],
    "{{GBRAIN_BIN}}": os.environ["GBRAIN_V"],
    "{{TSX_BIN}}": os.environ["TSX_V"],
    "{{TAILSCALE_IP}}": os.environ["TS_IP_V"],
}
with open(src, "r") as f:
    content = f.read()
for k, v in mapping.items():
    content = content.replace(k, v)
with open(dst, "w") as f:
    f.write(content)
PYEOF
  ok "rendered $label"
done

if [[ "$MODE" == "reconfigure" ]]; then
  log "Reconfigure complete. Restart services with:"
  echo "  launchctl kickstart -k gui/\$(id -u)/co.jovie.hermes.daemon"
  exit 0
fi

# 13. Bootstrap launchd units
log "Bootstrapping launchd units"
for plist in "${LAUNCH_AGENTS}"/co.jovie.hermes.*.plist; do
  [[ -f "$plist" ]] || continue
  label="$(basename "$plist" .plist)"
  # bootout first in case it's already loaded (idempotent re-run).
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  ok "bootstrapped $label"
done

# 14. Manual GUI step: Full Disk Access
warn ""
warn "MANUAL STEP REQUIRED:"
warn "  Open System Settings → Privacy & Security → Full Disk Access"
warn "  Add: ${TSX_BIN}"
warn "  This lets voice-memo-watcher read ~/Library/Group Containers/group.com.apple.VoiceMemos.shared/"
warn ""
ask "Press Enter once you've granted Full Disk Access:"

# 15. Verification
log "Verifying"

VERIFY_OK=true

if launchctl list | grep -q co.jovie.hermes.daemon; then
  ok "daemon registered"
else
  warn "daemon not registered"; VERIFY_OK=false
fi

if curl -fsS --max-time 5 http://localhost:7800/health >/dev/null; then
  ok "daemon /health responds"
else
  warn "daemon /health does not respond yet (may need ~10s)"
fi

if curl -fsS --max-time 5 "http://127.0.0.1:7801/health" >/dev/null 2>&1; then
  ok "gbrain server responds locally"
else
  warn "gbrain server not responding on :7801"
fi

if [[ -f "${HERMES_HOME}/.env" ]] && [[ "$(stat -f '%Lp' "${HERMES_HOME}/.env")" == "600" ]]; then
  ok "~/.hermes/.env has correct permissions (600)"
else
  warn "~/.hermes/.env permissions wrong"; VERIFY_OK=false
fi

if [[ -z "$(doppler_get HERMES_TELEGRAM_BOT_TOKEN)" ]]; then
  warn "HERMES_TELEGRAM_BOT_TOKEN missing from Doppler — Telegram gateway disabled"
fi

echo
if $VERIFY_OK; then
  ok "Hermes-Air bootstrap complete."
  log "Send your Telegram bot a test message to capture the chat ID:"
  echo "  tail -f ${HERMES_HOME}/logs/daemon.log"
  echo
  log "Next: configure the Pro to query gbrain at http://${TAILSCALE_IP}:7801"
  log "See docs/HERMES_AIR.md for ongoing ops."
else
  die "Bootstrap completed with warnings; see above."
fi
