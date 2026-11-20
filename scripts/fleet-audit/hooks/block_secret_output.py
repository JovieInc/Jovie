#!/usr/bin/env python3
"""Claude Code PreToolUse hook (matcher: Bash): block commands that would print secret values.

Wired by scripts/fleet-audit/install.sh into ~/.claude/settings.json. Reads the hook JSON on stdin;
exit 2 blocks the call and the stderr text goes back to the agent with the safe alternative.

Background (2026-10-29): `doppler secrets delete ... --yes` printed the whole jovie-web/prd table
with values into a Claude session. The doppler shim suppresses that output; this hook is the second
layer for hosts or shells where the shim is not on PATH, and for the other common leaks.
"""
from __future__ import annotations

import json
import re
import sys

PRINTING_SINKS = r"(cat|tee|less|more|head|tail|xxd|od|base64|echo|printf|jq)\b"

RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bdoppler\s+secrets(?![^|;&]*\s--only-names)(\s+(download|list)\b|\s*($|[|;&>])|\s+-)"),
     "`doppler secrets` without --only-names prints every value. Use `doppler secrets --only-names`."),
    (re.compile(r"\bdoppler\s+secrets\s+(set|delete|upload)\b(?![^|;&]*(>\s*/dev/null|--silent))"),
     "doppler secrets set/delete/upload prints the remaining config table WITH VALUES. Run it through the "
     "fleet-audit doppler shim (scripts/fleet-audit/install.sh) or append `>/dev/null`."),
    (re.compile(r"\bdoppler\s+secrets\s+get\b(?![^|;&]*--(plain|raw))"),
     "`doppler secrets get` without --plain prints a table with the value. Use `--plain` piped into the "
     "command that needs it, or `doppler run -- <cmd>`."),
    (re.compile(r"(?<!\$\()\bdoppler\s+secrets\s+get\b[^|;&)]*--(plain|raw)\b[^|;&)]*\s*($|;|&&|\|\|)"),
     "`doppler secrets get --plain` to stdout lands in the transcript. Pipe it into the consumer "
     "(`... --plain | cmd`) or use `$(doppler secrets get X --plain)` inside the command."),
    (re.compile(r"\bdoppler\s+secrets\s+get\b[^;&]*--(plain|raw)\b[^;&|]*\|\s*" + PRINTING_SINKS),
     "Piping a secret value into cat/echo/head/jq prints it. Pipe it into the command that uses it."),
    (re.compile(r"\bdoppler\s+run\b.*--\s*(env|printenv|set|export)\s*($|[|;&])"),
     "Printing the environment of `doppler run` prints every secret. Print names only: "
     "`doppler secrets --only-names`."),
    (re.compile(r"(^|[;&|(]\s*)(env|printenv)\s*(\|\s*(grep|rg|sort|head|tail|less|cat)\b|$|;)(?![^;&]*cut\s+-d\s*=?\s*['\"]?=)"),
     "`env`/`printenv` prints tokens and keys. Print names only: `env | cut -d= -f1`, or `printenv NAME | wc -c`."),
    (re.compile(r"\bvercel\s+env\s+pull\b[^;&|]*(/dev/stdout|\s-\s*($|[|;&]))"),
     "`vercel env pull` to stdout prints values. Pull to a file the command reads, never to output."),
    (re.compile(r"\b(cat|less|more|head|tail|bat)\s+[^|;&]*(\.env(?!\.(example|sample|template))(\.[\w-]+)*|fleet-audit\.secret|\.npmrc|credentials\.json)\b"),
     "Reading a secrets file into output exposes values. Check names with `cut -d= -f1 <file>`."),
    (re.compile(r"\bsecurity\s+find-(generic|internet)-password\b[^|;&]*\s-w\b[^|]*($|;|&&)"),
     "`security find-*-password -w` to stdout prints the secret. Pipe it into the consumer."),
]


def check(command: str) -> str | None:
    for pat, why in RULES:
        if pat.search(command):
            return why
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    if payload.get("tool_name") not in (None, "Bash"):
        return 0
    command = (payload.get("tool_input") or {}).get("command") or ""
    why = check(command)
    if why:
        sys.stderr.write(f"Blocked by fleet-audit secret-output guard: {why}\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
