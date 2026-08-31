#!/usr/bin/env bash
# codex-account-probe: authenticated, locked recovery probe for cooling Codex
# accounts. A successful probe writes a short-lived readiness receipt and only
# then clears that account's cooldown. Failed or indeterminate probes leave the
# existing cooldown untouched.
set -euo pipefail

ACCOUNTS_ROOT="${CODEX_ACCOUNTS_ROOT:-$HOME/.codex-accounts}"
STATE_FILE="${CODEX_ACCOUNTS_STATE:-$ACCOUNTS_ROOT/state.json}"
REAL_CODEX="${CODEX_REAL_BIN:-$HOME/.local/bin/codex}"
LOG_FILE="${CODEX_ROTATE_LOG:-$ACCOUNTS_ROOT/rotate.log}"
PROBE_TIMEOUT="${CODEX_ACCOUNT_PROBE_TIMEOUT:-15}"
RECEIPT_TTL="${CODEX_ACCOUNT_READINESS_TTL_SECONDS:-600}"

export ACCOUNTS_ROOT STATE_FILE REAL_CODEX LOG_FILE PROBE_TIMEOUT RECEIPT_TTL

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

python3 <<'PY'
import fcntl
import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(os.environ["ACCOUNTS_ROOT"])
STATE = Path(os.environ["STATE_FILE"])
REAL_CODEX = os.environ["REAL_CODEX"]
TIMEOUT = int(os.environ["PROBE_TIMEOUT"])
TTL = int(os.environ["RECEIPT_TTL"])
SOURCE = "authenticated_completion_probe/v1"
READY_MARKER = "SYMPHONY_ACCOUNT_READY"


def locked_state():
    lock_path = Path(f"{STATE}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = open(lock_path, "a+", encoding="utf-8")
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        value = json.loads(STATE.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("state must be an object")
        yield value
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def read_candidates(now):
    transaction = locked_state()
    state = next(transaction)
    try:
        cooldowns = state.get("cooldowns")
        if not isinstance(cooldowns, dict):
            return []
        candidates = []
        for name, raw_until in cooldowns.items():
            if not isinstance(name, str):
                continue
            try:
                until = int(raw_until)
            except (TypeError, ValueError):
                continue
            account = ROOT / name
            if until > now and (account / "auth.json").is_file() and (account / "config.toml").is_file():
                candidates.append((name, until))
        return sorted(candidates)
    finally:
        try:
            next(transaction)
        except StopIteration:
            pass


def account_environment(account):
    env = os.environ.copy()
    env["CODEX_HOME"] = str(ROOT / account)
    env_file = ROOT / account / "env"
    if not env_file.is_file():
        return env
    loaded = subprocess.run(
        ["/bin/sh", "-c", 'set -a; . "$1"; env -0', "sh", str(env_file)],
        env=env,
        capture_output=True,
        timeout=2,
        check=False,
    )
    if loaded.returncode != 0:
        return None
    for item in loaded.stdout.split(b"\0"):
        if b"=" not in item:
            continue
        key, value = item.split(b"=", 1)
        env[key.decode("utf-8", "strict")] = value.decode("utf-8", "surrogateescape")
    return env


def authenticated_probe(account):
    account_lock = ROOT / "locks" / f"{account}.lock"
    account_lock.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(account_lock, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        env = account_environment(account)
        if env is None:
            return False
        try:
            result = subprocess.run(
                [
                    REAL_CODEX,
                    "exec",
                    "--sandbox",
                    "read-only",
                    "--skip-git-repo-check",
                    f"Reply with exactly: {READY_MARKER}",
                ],
                env=env,
                capture_output=True,
                text=True,
                timeout=TIMEOUT,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return False
        if result.returncode != 0:
            return False
        return result.stdout.strip() == READY_MARKER
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def recover(account, observed_cooldown, now):
    transaction = locked_state()
    state = next(transaction)
    try:
        cooldowns = state.setdefault("cooldowns", {})
        try:
            current = int(cooldowns.get(account) or 0)
        except (TypeError, ValueError):
            return False
        # A second limiter event while this probe ran must win.
        if current != observed_cooldown or current <= now:
            return False
        cooldowns[account] = now
        readiness = state.setdefault("readiness", {})
        readiness[account] = {
            "checkedAt": now,
            "expiresAt": now + TTL,
            "source": SOURCE,
        }
        errors = state.get("last_error")
        if isinstance(errors, dict):
            errors.pop(account, None)
        temporary = STATE.with_suffix(STATE.suffix + ".tmp")
        temporary.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.chmod(temporary, 0o600)
        os.replace(temporary, STATE)
        return True
    finally:
        try:
            next(transaction)
        except StopIteration:
            pass


now = int(time.time())
for account, cooldown in read_candidates(now):
    if authenticated_probe(account) and recover(account, cooldown, now):
        print(f"RECOVERED {account}")
PY
