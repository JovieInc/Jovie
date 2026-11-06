#!/usr/bin/env bash
# Install (or remove) the Pen PROPOSAL review loop as a per-user launchd job
# on the Mac that runs the Pen desktop app (the live canvas only exists here).
#
#   scripts/hostops/install-pen-review.sh            # install/refresh
#   scripts/hostops/install-pen-review.sh --uninstall
#
# Triggers: WatchPaths on the canonical .pen file (every save is an event)
# plus a 10-minute backstop sweep, which also catches live, unsaved edits.
# Each run refreshes a dedicated detached checkout of origin/main, then runs
# `scripts/pen-review/run.mjs sweep`: only PROPOSAL frames whose content
# digest changed since their last review are reviewed.
# Receipts and ledger: ~/.local/state/jovie-pen-review/.
# Kill switch: touch ~/.local/state/jovie-pen-review/disabled, or --uninstall.
set -euo pipefail

LABEL="co.jovie.ops.pen-review"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SHARE="$HOME/.local/share/jovie-pen-review"
STATE="$HOME/.local/state/jovie-pen-review"
CHECKOUT="$SHARE/checkout"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && git rev-parse --path-format=absolute --git-common-dir)"
PEN_FILE="${PEN_REVIEW_FILE:-$HOME/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen}"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

# The detached checkout has no node_modules. Carry a validated installed module
# and browser into launchd rather than relying on the interactive shell.
: "${PEN_REVIEW_PLAYWRIGHT:?Set PEN_REVIEW_PLAYWRIGHT to an installed Playwright package.json or module directory}"
PEN_REVIEW_PLAYWRIGHT="$(node -p 'require("node:path").resolve(process.argv[1])' "$PEN_REVIEW_PLAYWRIGHT")"
DEFAULT_CHROMIUM="$(node - "$PEN_REVIEW_PLAYWRIGHT" <<'JS'
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const p = process.argv[2];
const req = createRequire(resolve(p.endsWith('.json') ? p : join(p, 'package.json')));
let api;
for (const name of ['playwright-core', 'playwright', '@playwright/test']) {
  try { api = req(name); break; } catch {}
}
if (!api?.chromium) throw new Error('Playwright Chromium is unavailable');
process.stdout.write(api.chromium.executablePath());
JS
)"
PEN_REVIEW_CHROMIUM="$(node -p 'require("node:path").resolve(process.argv[1])' "${PEN_REVIEW_CHROMIUM:-$DEFAULT_CHROMIUM}")"
[[ -x "$PEN_REVIEW_CHROMIUM" ]] || { echo 'Chromium executable is unavailable' >&2; exit 1; }
printf -v BROWSER_ENV 'export PEN_REVIEW_PLAYWRIGHT=%q\nexport PEN_REVIEW_CHROMIUM=%q' "$PEN_REVIEW_PLAYWRIGHT" "$PEN_REVIEW_CHROMIUM"

mkdir -p "$SHARE" "$STATE" "$HOME/Library/LaunchAgents"
if [[ ! -d "$CHECKOUT/.git" && ! -f "$CHECKOUT/.git" ]]; then
  git --git-dir="$REPO" fetch -q origin main
  git --git-dir="$REPO" worktree add -q --detach "$CHECKOUT" origin/main
fi

# launchd starts with a bare PATH; carry node, pen, claude and wrangler from
# the installing shell.
dirs=()
for tool in node pen claude wrangler git; do
  p="$(command -v "$tool" 2>/dev/null || true)"
  [[ -n "$p" ]] && dirs+=("$(dirname "$p")")
done
JOB_PATH="$(printf '%s:' "${dirs[@]}")/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

RUNNER="$SHARE/sweep.sh"
cat >"$RUNNER" <<RUN
#!/usr/bin/env bash
set -uo pipefail
[[ -e "$STATE/disabled" ]] && exit 0
$BROWSER_ENV
git -C "$CHECKOUT" fetch -q origin main && git -C "$CHECKOUT" checkout -q --detach origin/main
date -u +"%Y-%m-%dT%H:%M:%SZ sweep start" >>"$STATE/launchd.log"
node "$CHECKOUT/scripts/pen-review/run.mjs" sweep --holder pen-review-loop
code=\$?
printf '{"at":"%s","stage":"pen-review-sweep","exit":%s}\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\$code" >>"$STATE/sweeps.jsonl"
exit \$code
RUN
chmod 0755 "$RUNNER"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNNER</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>$PEN_FILE</string>
  </array>
  <key>StartInterval</key><integer>600</integer>
  <key>ThrottleInterval</key><integer>120</integer>
  <key>RunAtLoad</key><false/>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$JOB_PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>$STATE/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/launchd.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL (watch: $PEN_FILE; backstop 600s; checkout $CHECKOUT)"
