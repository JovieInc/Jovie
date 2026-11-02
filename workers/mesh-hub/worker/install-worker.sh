#!/usr/bin/env bash
# Reuse the canonical Aeon executor with local Doppler auth and optional trusted SSH.
# Stop the previous consumer after checking it is idle before running this installer.
set -euo pipefail
kind="${MESH_KIND:-aeon}"
case "$kind" in aeon|devin) ;; *) echo 'MESH_KIND must be aeon or devin' >&2; exit 1;; esac
if launchctl print "gui/$(id -u)/ie.jov.mesh-worker.$kind" >/dev/null 2>&1; then
  echo 'Existing local consumer is still loaded; stop it after an idle check before installing.' >&2
  exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.jovie/mesh/worker"
mkdir -p "$dest" "$HOME/.jovie/mesh/$kind" "$HOME/Library/LaunchAgents"
if [ -f "$dest/mesh-worker.mjs" ]; then
  cp "$dest/mesh-worker.mjs" "$dest/mesh-worker.mjs.prev"
fi
install -m 0755 "$here/mesh-worker.mjs" "$dest/mesh-worker.mjs"
install -m 0644 "$here/devin-executor.mjs" "$dest/devin-executor.mjs"
python3 - "$here" "$kind" <<'PY'
import os
import plistlib
import re
import sys
from pathlib import Path
host = os.environ.get('CODEX_SSH_HOST', '')
if host and not re.fullmatch(r'[A-Za-z0-9_.@:-]+', host):
    raise SystemExit('CODEX_SSH_HOST must be an existing trusted SSH host')
kind = sys.argv[2]
name = f'ie.jov.mesh-worker.{kind}.plist.example'
if kind == 'aeon' and host: name = 'ie.jov.mesh-worker.aeon-ssh.plist.example'
text = (Path(sys.argv[1]) / name).read_text().replace('__HOME__', str(Path.home())).replace('__SSH_HOST__', host)
plistlib.loads(text.encode())
(Path.home() / f'Library/LaunchAgents/ie.jov.mesh-worker.{kind}.plist').write_text(text)
PY
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/ie.jov.mesh-worker.$kind.plist"
launchctl list "ie.jov.mesh-worker.$kind"
