#!/usr/bin/env bash
# Installs the Pen structural-edit guard on this Mac (JOV-9246, ASR-040):
#  - copies the hook, guard lib and census tool to ~/.claude/hooks
#  - backs up ~/.claude/settings.json, then adds a PreToolUse hook on mcp__pencil__execute (idempotent)
#  - installs a launchd agent that refreshes the instance census every 10 minutes
#    (only .pen files that changed since their last census are re-read)
# Usage: scripts/agent/pen-guard-install.sh [workspace-dir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOKS="$HOME/.claude/hooks"
WORKSPACE="${1:-$HOME/Documents/Jovie/Jovie Marketing Workspace}"
mkdir -p "$HOOKS"
cp "$HERE/pen-guard-hook.mjs" "$HERE/pen-structural-guard.mjs" "$HERE/pen-census.mjs" "$HOOKS/"
SETTINGS="$HOME/.claude/settings.json"
BACKUP="$SETTINGS.bak-pen-guard-$(date -u +%Y%m%dT%H%M%SZ)"
cp "$SETTINGS" "$BACKUP"
echo "settings backup: $BACKUP"
NODE_BIN="$(command -v node)"
SETTINGS="$SETTINGS" HOOK="$HOOKS/pen-guard-hook.mjs" NODE_BIN="$NODE_BIN" node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const { SETTINGS, HOOK, NODE_BIN } = process.env;
const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
settings.hooks ??= {};
settings.hooks.PreToolUse ??= [];
const command = `${NODE_BIN} ${HOOK}`;
const exists = settings.hooks.PreToolUse.some(e => e.matcher === "mcp__pencil__execute" && (e.hooks ?? []).some(h => h.command === command));
if (!exists) settings.hooks.PreToolUse.push({ matcher: "mcp__pencil__execute", hooks: [{ type: "command", command, timeout: 10, statusMessage: "Pen structural guard" }] });
writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
console.log(exists ? "hook already present" : "hook added");
'
PLIST="$HOME/Library/LaunchAgents/ie.jov.pen-census.plist"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>ie.jov.pen-census</string>
<key>ProgramArguments</key><array>
<string>$NODE_BIN</string><string>$HOOKS/pen-census.mjs</string><string>--max-age-days</string><string>14</string><string>--workspace</string><string>$WORKSPACE</string>
</array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/bin:/bin</string></dict>
<key>StartInterval</key><integer>600</integer>
<key>RunAtLoad</key><true/>
<key>Nice</key><integer>10</integer>
<key>StandardOutPath</key><string>$HOME/.cache/pen-census.log</string>
<key>StandardErrorPath</key><string>$HOME/.cache/pen-census.log</string>
</dict></plist>
PLISTEOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "census agent loaded (every 10 min over $WORKSPACE)"
