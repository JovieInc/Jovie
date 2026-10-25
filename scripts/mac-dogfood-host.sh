#!/bin/zsh
# One tick of the Mac dogfood loop on the Mac host. Tooling only: fetches the
# runner from main, drives the already-installed apps read-only when something
# changed (or on the backstop) and the person is idle, then files deduped Linear
# issues from the result. Install with: scripts/mac-dogfood-host.sh --install
# Remove with:                  scripts/mac-dogfood-host.sh --uninstall
set -u
HOME_DIR="${HOME}/.local/share/jovie-mac-dogfood"
STATE_DIR="${HOME}/.local/state/jovie-mac-dogfood"
LABEL="co.jovie.mac-dogfood"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
FILES=(scripts/mac-dogfood.mjs scripts/mac-dogfood-file.mjs scripts/lib/mac-dogfood.mjs scripts/lib/prod-dogfood.mjs scripts/lib/linear-cooldown.mjs scripts/lib/linear-issue-intake.mjs)

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "${HOME_DIR}" "${STATE_DIR}"
  cp "$0" "${HOME_DIR}/tick.sh"
  cat > "${PLIST}" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>/bin/zsh</string><string>${HOME_DIR}/tick.sh</string></array>
<key>StartInterval</key><integer>1800</integer>
<key>RunAtLoad</key><false/>
<key>LimitLoadToSessionType</key><string>Aqua</string>
<key>StandardOutPath</key><string>${STATE_DIR}/tick.log</string>
<key>StandardErrorPath</key><string>${STATE_DIR}/tick.err</string>
</dict></plist>
PL
  launchctl bootstrap "gui/$(id -u)" "${PLIST}" && echo "installed ${LABEL}"
  exit 0
fi
if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null
  rm -f "${PLIST}"; echo "removed ${LABEL}"; exit 0
fi

mkdir -p "${HOME_DIR}/scripts/lib" "${STATE_DIR}"
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"
for f in "${FILES[@]}"; do
  gh api "repos/JovieInc/Jovie/contents/${f}?ref=main" -H 'Accept: application/vnd.github.raw' > "${HOME_DIR}/${f}.new" \
    && mv "${HOME_DIR}/${f}.new" "${HOME_DIR}/${f}" || { echo "fetch failed: ${f}" >&2; exit 1; }
done
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${STATE_DIR}/runs/${STAMP}"
GIST="${MAC_DOGFOOD_STATUS_GIST:-}"
ARGS=(--tick --channel both --out "${OUT}" --state "${STATE_DIR}/last.json" --max-age-minutes 720 --require-idle-minutes 10)
[[ -n "${GIST}" ]] && ARGS+=(--status-gist "${GIST}")
node "${HOME_DIR}/scripts/mac-dogfood.mjs" "${ARGS[@]}"
[[ -f "${OUT}/findings.json" ]] || exit 0
# File/close Linear issues (private/ never leaves the host; the filer reads only the json files).
LINEAR_API_KEY="$(doppler secrets get LINEAR_API_KEY -p jovie-web -c prd --plain 2>/dev/null)" \
  node "${HOME_DIR}/scripts/mac-dogfood-file.mjs" --from "${OUT}" || echo "filing failed" >&2
