import fcntl
import contextlib
import json
import os
import subprocess
import time
import hashlib
import re
import secrets
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ["ACCOUNTS_ROOT"])
STATE = Path(os.environ["STATE_FILE"])
REAL_CODEX = os.environ["REAL_CODEX"]
TIMEOUT = int(os.environ["PROBE_TIMEOUT"])
TTL = int(os.environ["RECEIPT_TTL"])
SOURCE = "authenticated_completion_probe/v1"
READY_MARKER = "SYMPHONY_ACCOUNT_READY"


@contextlib.contextmanager
def locked_state():
    lock_path = Path(f"{STATE}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = open(lock_path, "a+", encoding="utf-8")
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        value = json.loads(STATE.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or any(key in value and not isinstance(value[key], dict) for key in ("cooldowns", "last_error", "readiness")):
            raise ValueError("state maps must be objects")
        yield value
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def read_candidates(now):
    try:
        with locked_state() as state:
            cooldowns = state.get("cooldowns")
            if not isinstance(cooldowns, dict):
                return []
            candidates = []
            for name, raw_until in cooldowns.items():
                if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name):
                    continue
                try:
                    until = int(raw_until)
                except (TypeError, ValueError):
                    continue
                account = ROOT / name
                if until > now and not account.is_symlink() and (account / "auth.json").is_file() and (account / "config.toml").is_file():
                    candidates.append((name, until, (state.get("last_error") or {}).get(name)))
            return sorted(candidates)
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return []


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
    env["CODEX_HOME"] = str(ROOT / account)
    return env


def authenticated_probe(account, cooldown, observed_error):
    account_lock = ROOT / "locks" / f"{account}.lock"
    account_lock.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(account_lock, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        from symphony_proof_context import profile_identity
        identity = profile_identity(ROOT / account)
        env = account_environment(account)
        if env is None:
            return False
        challenge = secrets.token_hex(32)
        expected = f"{READY_MARKER}:{challenge}"
        # The final-message file, not echoed prompts or diagnostic stdout, proves completion.
        with tempfile.TemporaryDirectory(prefix="symphony-probe-") as directory:
            output = Path(directory) / "completion.txt"
            result = subprocess.run(
                [REAL_CODEX, "exec", "--sandbox", "read-only", "--skip-git-repo-check",
                 "--output-last-message", str(output), f"Reply with exactly: {expected}"],
                env=env, capture_output=True, text=True, timeout=TIMEOUT, check=False)
            if result.returncode != 0 or not output.is_file() or output.read_text().strip() != expected:
                return False
        if profile_identity(ROOT / account) != identity:
            return False
        # Keep the account lease through the state compare-and-swap.
        return recover(account, cooldown, int(time.time()), observed_error)
    except (OSError, ValueError, subprocess.SubprocessError):
        return False
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def recover(account, observed_cooldown, now, observed_error):
    try:
        with locked_state() as state:
            cooldowns = state.setdefault("cooldowns", {})
            try:
                current = int(cooldowns.get(account) or 0)
            except (TypeError, ValueError):
                return False
            # A second limiter event while this probe ran must win.
            if (current != observed_cooldown or current <= now
                or (state.get("last_error") or {}).get(account) != observed_error):
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
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return False


now = int(time.time())
for account, cooldown, observed_error in read_candidates(now):
    if authenticated_probe(account, cooldown, observed_error):
        print(f"RECOVERED {account}")
