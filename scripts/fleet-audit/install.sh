#!/usr/bin/env bash
# Install the fleet audit shims (gh, git push, doppler) and the Claude Code secret-output hook on
# this host (Mac or Gem). Idempotent.
#   scripts/fleet-audit/install.sh                     install / update the shims
#   scripts/fleet-audit/install.sh --with-claude-hook  also register the Claude Code secret-output hook
#                                                     in ~/.claude/settings.json (host owner opts in)
#   scripts/fleet-audit/install.sh --uninstall
# Copies (not symlinks) into ~/.local/share/jovie-audit-bin so removing a worktree never breaks gh,
# then puts that dir first on PATH for login shells (zsh/bash), and for systemd user services on
# Linux via environment.d. The ingest secret is read from ~/.config/jovie/fleet-audit.secret.
set -euo pipefail
src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$HOME/.local/share/jovie-audit-bin"
marker="# jovie fleet audit shim"
line="export PATH=\"$dest/bin:\$PATH\" $marker"
# Appended last in each rc so later PATH edits (macOS path_helper, brew shellenv) cannot reorder it.
rcs=("$HOME/.zshenv" "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile")

if [ "${1:-}" = "--uninstall" ]; then
  for rc in "${rcs[@]}"; do [ -f "$rc" ] && sed -i.bak "/$marker/d" "$rc" && rm -f "$rc.bak"; done
  rm -f "$HOME/.config/environment.d/50-jovie-audit.conf"
  python3 - "$HOME/.claude/settings.json" <<'PY'
import json, os, sys
path = sys.argv[1]
if os.path.exists(path):
    cfg = json.load(open(path))
    for e in cfg.get("hooks", {}).get("PreToolUse", []):
        e["hooks"] = [h for h in e.get("hooks", []) if "block_secret_output.py" not in h.get("command", "")]
    cfg.get("hooks", {})["PreToolUse"] = [e for e in cfg.get("hooks", {}).get("PreToolUse", []) if e["hooks"]]
    json.dump(cfg, open(path, "w"), indent=2)
PY
  rm -rf "$dest"
  echo "fleet-audit: uninstalled"; exit 0
fi

mkdir -p "$dest/bin"
install -m 0755 "$src/audit.py" "$dest/audit.py"
install -m 0755 "$src/bin/gh" "$dest/bin/gh"
install -m 0755 "$src/bin/git" "$dest/bin/git"
install -m 0755 "$src/bin/doppler" "$dest/bin/doppler"
mkdir -p "$dest/hooks"
install -m 0755 "$src/hooks/block_secret_output.py" "$dest/hooks/block_secret_output.py"
if [ "${1:-}" = "--with-claude-hook" ]; then
# Claude Code PreToolUse(Bash) hook: blocks commands that print secret values (user-level settings,
# so it covers every project and session on this host). Idempotent; keeps all other settings.
python3 - "$HOME/.claude/settings.json" "$dest/hooks/block_secret_output.py" <<'PY'
import json, os, sys
path, hook = sys.argv[1], sys.argv[2]
cfg = json.load(open(path)) if os.path.exists(path) else {}
pre = cfg.setdefault("hooks", {}).setdefault("PreToolUse", [])
cmd = f"python3 -I {hook}"
if not any(h.get("command") == cmd for e in pre for h in e.get("hooks", [])):
    pre.append({"matcher": "Bash", "hooks": [{"type": "command", "command": cmd, "timeout": 5}]})
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".fleet-audit.tmp"
    json.dump(cfg, open(tmp, "w"), indent=2)
    os.replace(tmp, path)
    print("fleet-audit: registered secret-output hook in", path)
PY
fi
for rc in "${rcs[@]}"; do
  [ -f "$rc" ] || [ "$rc" = "$HOME/.zshenv" ] || continue
  touch "$rc"
  grep -qF "$marker" "$rc" || printf '\n%s\n' "$line" >> "$rc"
done
if [ "$(uname)" = "Linux" ]; then
  mkdir -p "$HOME/.config/environment.d"
  printf 'PATH=%s/bin:${PATH}\n' "$dest" > "$HOME/.config/environment.d/50-jovie-audit.conf"
  systemctl --user daemon-reload 2>/dev/null || true
fi
mkdir -p "$HOME/.local/state/jovie/audit"
[ -f "$HOME/.config/jovie/fleet-audit.secret" ] || echo "fleet-audit: note: no ingest secret yet; events spool locally until ~/.config/jovie/fleet-audit.secret exists"
for t in gh git doppler; do PATH="$dest/bin:$PATH" command -v "$t"; done
echo "fleet-audit: installed to $dest"
