#!/usr/bin/env bash
# codex-account-probe: periodickly probe cooling Codex accounts.
# If a probe succeeds (account is usable again), clear its cooldown
# so codex-rotate picks it up immediately.
#
# Run every 15-30 minutes via cron.
# No output when nothing changes (cron-friendly).

set -euo pipefail

ACCOUNTS_ROOT="${CODEX_ACCOUNTS_ROOT:-$HOME/.codex-accounts}"
STATE_FILE="$ACCOUNTS_ROOT/state.json"
REAL_CODEX="${CODEX_REAL_BIN:-$HOME/.local/bin/codex}"
export ACCOUNTS_ROOT STATE_FILE REAL_CODEX
LOG_FILE="${CODEX_ROTATE_LOG:-$HOME/.codex-accounts/rotate.log}"
PROBE_TIMEOUT=15  # seconds per probe

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "probe: $*" >>"$LOG_FILE"
}

if [ ! -f "$STATE_FILE" ]; then
  exit 0  # no state, nothing to probe
fi

# Read state and find accounts still cooling
python3 <<"PYEOF"
import json, os, time, subprocess, sys
from pathlib import Path

state_file = Path(os.environ["STATE_FILE"])
accts_root = Path(os.environ["ACCOUNTS_ROOT"])
real_codex = os.environ.get("REAL_CODEX", str(Path.home() / ".local/bin/codex"))
probe_timeout = int(os.environ.get("PROBE_TIMEOUT", "15"))
now = int(time.time())

state = json.loads(state_file.read_text()) if state_file.exists() else {}
cds = state.get("cooldowns") or {}
errors = state.get("last_error") or {}

changed = False

for acct, until in list(cds.items()):
    if until <= now:
        continue  # already expired, will be picked naturally

    # Only probe accounts that are within 24h of expiring (avoid thrashing long cooldowns)
    if until > now + 86400:
        continue

    auth_file = accts_root / acct / "auth.json"
    if not auth_file.exists():
        continue

    # Lightweight probe: codex models (cheapest authenticated call)
    env = os.environ.copy()
    env["CODEX_HOME"] = str(accts_root / acct)

    try:
        proc = subprocess.run(
            [real_codex, "models", "--json"],
            env=env,
            capture_output=True,
            text=True,
            timeout=probe_timeout
        )
        if proc.returncode == 0:
            # Success! Account is usable again — clear cooldown
            cds[acct] = now  # cooldown = now (immediately usable)
            if acct in errors:
                reason = errors[acct].get("reason", "unknown")
                del errors[acct]
                state["last_error"] = errors
            state["cooldowns"] = cds
            changed = True
            print(f"RECOVERED {acct}: probe succeeded, cooldown cleared")
        else:
            # Still failing — check if there's a new "try again at" we can extract
            stderr_text = proc.stderr.lower() if proc.stderr else ""
            if "usage limit" in stderr_text or "try again" in stderr_text:
                # Update the cooldown if the error message has a different date
                import re
                match = re.search(r"try again at\s+(.+?)(?:\.|$)", stderr_text, re.I)
                if match and acct in errors:
                    # Update the log entry but keep existing cooldown
                    errors[acct]["last_probed"] = now
                    state["last_error"] = errors
                    changed = True
            # Still cooling — no change needed
    except subprocess.TimeoutExpired:
        pass  # probe timed out, leave cooldown intact
    except FileNotFoundError:
        pass  # codex binary not found, skip
    except Exception as e:
        print(f"PROBE_ERR {acct}: {e}", file=sys.stderr)

if changed:
    state_file.write_text(json.dumps(state, indent=2) + "\n")
    log(f"state updated after probe")
PYEOF
