#!/usr/bin/env bash
# codex-account-probe: authenticated, locked recovery probe for cooling Codex
# accounts. A successful probe writes a short-lived readiness receipt and only
# then clears that account's cooldown. Failed or indeterminate probes leave the
# existing cooldown untouched.
set -euo pipefail

ACCOUNTS_ROOT="${CODEX_ACCOUNTS_ROOT:-$HOME/.codex-accounts}"
STATE_FILE_REQUESTED="${CODEX_ACCOUNTS_STATE:-$ACCOUNTS_ROOT/state.json}"
REAL_CODEX="${CODEX_REAL_BIN:-$HOME/.local/bin/codex}"
LOG_FILE="${CODEX_ROTATE_LOG:-$ACCOUNTS_ROOT/rotate.log}"
LOCKS_DIR="$ACCOUNTS_ROOT/locks"
PROBE_TIMEOUT="${CODEX_ACCOUNT_PROBE_TIMEOUT:-15}"
TOTAL_TIMEOUT="${CODEX_ACCOUNT_PROBE_TOTAL_TIMEOUT:-30}"
MAX_RECOVERIES="${CODEX_ACCOUNT_PROBE_MAX_RECOVERIES:-1}"
RECEIPT_TTL="${CODEX_ACCOUNT_READINESS_TTL_SECONDS:-600}"

export ACCOUNTS_ROOT STATE_FILE_REQUESTED REAL_CODEX LOG_FILE LOCKS_DIR PROBE_TIMEOUT TOTAL_TIMEOUT MAX_RECOVERIES RECEIPT_TTL

exec python3 <<'PY'
import fcntl
import contextlib
import ctypes
import json
import math
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ["ACCOUNTS_ROOT"]).resolve()
REQUESTED_STATE = Path(os.environ["STATE_FILE_REQUESTED"])
STATE = ROOT / "state.json"
try:
    requested_identity = REQUESTED_STATE.parent.resolve(strict=True) / REQUESTED_STATE.name
except OSError:
    raise SystemExit(76)
if REQUESTED_STATE.is_symlink() or requested_identity != STATE:
    raise SystemExit(76)
if not STATE.is_file():
    raise SystemExit(0)
REAL_CODEX = os.environ["REAL_CODEX"]
LOCKS = Path(os.environ["LOCKS_DIR"])
MAX_TIMEOUT = 30.0


def finite_timeout(name, default):
    try:
        value = float(os.environ[name])
    except (KeyError, TypeError, ValueError):
        return default
    return default if not math.isfinite(value) or value <= 0 else min(value, MAX_TIMEOUT)


TIMEOUT = finite_timeout("PROBE_TIMEOUT", 15.0)
TOTAL_TIMEOUT = finite_timeout("TOTAL_TIMEOUT", 30.0)
MAX_RECOVERIES = int(os.environ["MAX_RECOVERIES"])
TTL = int(os.environ["RECEIPT_TTL"])
SOURCE = "authenticated_completion_probe/v1"
READY_MARKER = "SYMPHONY_ACCOUNT_READY"
SAFE_ACCOUNT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SYSTEMD_RUN = shutil.which("systemd-run")
SYSTEMCTL = shutil.which("systemctl")

if os.name == "posix" and Path("/proc").is_dir():
    try:
        ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0)
    except (AttributeError, OSError):
        pass


def systemd_user_scope_available():
    if not (sys.platform.startswith("linux") and SYSTEMD_RUN and SYSTEMCTL):
        return False
    try:
        result = subprocess.run(
            [SYSTEMCTL, "--user", "show-environment"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


SYSTEMD_USER_SCOPE = systemd_user_scope_available()


def process_command(command):
    if not SYSTEMD_USER_SCOPE:
        return command, None
    unit = f"symphony-codex-probe-{os.getpid()}-{os.urandom(6).hex()}.scope"
    return ([
        SYSTEMD_RUN,
        "--user",
        "--scope",
        "--quiet",
        "--collect",
        f"--unit={unit}",
        "--property=KillMode=control-group",
        "--property=TimeoutStopSec=1s",
        "--",
        *command,
    ], unit)


def stop_systemd_scope(unit):
    if unit is None:
        return True
    try:
        result = subprocess.run(
            [SYSTEMCTL, "--user", "stop", unit],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    if result.returncode == 0:
        return True
    lowered = result.stderr.lower()
    return "not loaded" in lowered or "not found" in lowered or "could not be found" in lowered


def process_children():
    children = {}
    try:
        if Path("/proc").is_dir():
            rows = []
            for entry in Path("/proc").iterdir():
                if not entry.name.isdigit():
                    continue
                try:
                    fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                    rows.append((int(entry.name), int(fields[1])))
                except (OSError, IndexError, ValueError):
                    continue
        else:
            output = subprocess.run(
                ["ps", "-axo", "pid=,ppid="], capture_output=True, text=True,
                check=True, timeout=2,
            ).stdout.splitlines()
            rows = [tuple(int(value) for value in row.split()) for row in output]
        for pid, parent in rows:
            children.setdefault(parent, []).append(pid)
    except (OSError, IndexError, ValueError, subprocess.SubprocessError):
        return {}
    return children


def terminate_tree(process, _tree_token):
    descendants = set()
    pidfds = {}

    def discover():
        children = process_children()
        pending = [process.pid, os.getpid()]
        while pending:
            parent = pending.pop()
            for child in children.get(parent, []):
                if child not in descendants and child != os.getpid():
                    descendants.add(child)
                    pending.append(child)

    def remember(pid):
        if pid in pidfds or not hasattr(os, "pidfd_open"):
            return
        try:
            pidfds[pid] = os.pidfd_open(pid)
        except OSError:
            pass

    def send(pid, signum):
        try:
            descriptor = pidfds.get(pid)
            if descriptor is not None and hasattr(signal, "pidfd_send_signal"):
                signal.pidfd_send_signal(descriptor, signum)
            else:
                os.kill(pid, signum)
        except (OSError, PermissionError):
            pass

    discover()
    deadline = time.monotonic() + 1.0
    alive = []
    while time.monotonic() < deadline:
        discover()
        targets = [process.pid, *descendants]
        for pid in targets:
            remember(pid)
            send(pid, signal.SIGCONT)
            send(pid, signal.SIGTERM)
        alive = []
        for pid in targets:
            try:
                os.kill(pid, 0)
                alive.append(pid)
            except ProcessLookupError:
                pass
        if not alive:
            break
        time.sleep(0.02)
    discover()
    for pid in [process.pid, *descendants]:
        remember(pid)
        send(pid, signal.SIGKILL)
    try:
        process.communicate(timeout=0.5)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            pass
    reap_deadline = time.monotonic() + 1.0
    quiet_since = None
    while time.monotonic() < reap_deadline:
        discover()
        for pid in descendants:
            remember(pid)
            send(pid, signal.SIGKILL)
        while True:
            try:
                reaped, _ = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                reaped = 0
                break
            if reaped <= 0:
                break
        pending = [
            descriptor for descriptor in pidfds.values()
            if not select.select([descriptor], [], [], 0)[0]
        ]
        # Do not return on the first empty snapshot. A just-exited probe can
        # still have an intermediate child racing through a second fork before
        # the resulting orphan is reparented to this subreaper and becomes
        # visible in /proc. Require a stable quiet interval after every known
        # process has exited before declaring the subtree drained.
        if pending:
            quiet_since = None
        elif quiet_since is None:
            quiet_since = time.monotonic()
        elif time.monotonic() - quiet_since >= 0.1:
            break
        time.sleep(0.01)
    for descriptor in pidfds.values():
        os.close(descriptor)


def account_path(name):
    if not isinstance(name, str) or not SAFE_ACCOUNT.fullmatch(name) or name in (".", ".."):
        return None
    path = ROOT / name
    try:
        if path.is_symlink() or path.resolve(strict=True).parent != ROOT:
            return None
    except OSError:
        return None
    return path


def account_file(account, name):
    path = account / name
    try:
        if (
            path.is_symlink()
            or not path.is_file()
            or path.resolve(strict=True).parent != account
        ):
            return None
    except OSError:
        return None
    return path


@contextlib.contextmanager
def locked_state():
    lock_path = Path(f"{STATE}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = open(lock_path, "a+", encoding="utf-8")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    try:
        value = json.loads(STATE.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("state must be an object")
        yield value
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def configured_inventory():
    inventory = {}
    auth_identities = set()
    config_identities = set()
    for account in ROOT.iterdir():
        if not account.is_dir() or account.name == "locks":
            continue
        auth_path = account_file(account, "auth.json")
        config_path = account_file(account, "config.toml")
        if auth_path is None and config_path is None:
            continue
        if account_path(account.name) is None or auth_path is None or config_path is None:
            return None
        auth_identity = (auth_path.stat().st_dev, auth_path.stat().st_ino)
        config_identity = (config_path.stat().st_dev, config_path.stat().st_ino)
        if auth_identity in auth_identities or config_identity in config_identities:
            return None
        auth_identities.add(auth_identity)
        config_identities.add(config_identity)
        auth = json.loads(auth_path.read_text(encoding="utf-8"))
        if not isinstance(auth, dict):
            return None
        inventory[account.name] = (account, auth_path, config_path, auth)
    return inventory


def read_candidates(now):
    try:
        with locked_state() as state:
            cooldowns = state.get("cooldowns")
            if not isinstance(cooldowns, dict):
                return []
            candidates = []
            identities = set()
            inventory = configured_inventory()
            if inventory is None:
                return None
            for name, raw_until in cooldowns.items():
                try:
                    until = int(raw_until)
                except (TypeError, ValueError):
                    continue
                account = account_path(name)
                if account is None or account in identities or name not in inventory:
                    return None
                identities.add(account)
                if until <= now:
                    continue
                _account, auth_path, config_path, auth = inventory[name]
                auth_identity = (auth_path.stat().st_dev, auth_path.stat().st_ino)
                config_identity = (config_path.stat().st_dev, config_path.stat().st_ino)
                if auth.get("auth_mode") == "chatgpt":
                    errors = state.get("last_error")
                    observed_error = errors.get(name) if isinstance(errors, dict) else None
                    candidates.append((name, until, observed_error, state.get("active"), auth_identity, config_identity))
            return sorted(candidates, key=lambda item: (item[1], item[0]))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return None


def account_environment(account):
    home = account_path(account)
    if home is None:
        return None
    env = os.environ.copy()
    env["CODEX_HOME"] = str(home)
    env_file = home / "env"
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
    if env.get("CODEX_HOME") != str(home):
        return None
    env["CODEX_HOME"] = str(home)
    return env


def authenticated_probe(account, deadline):
    """Run the completion probe. Caller must hold the canonical account lease."""
    env = account_environment(account)
    if env is None:
        return "indeterminate"
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return "indeterminate"
    try:
        tree_token = os.urandom(16).hex()
        env["SYMPHONY_PROCESS_TREE_TOKEN"] = tree_token
        command, systemd_unit = process_command(
            [
                REAL_CODEX,
                "--config",
                'model_provider="openai"',
                "--model",
                "gpt-5.6-luna",
                "exec",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                f"Reply with exactly: {READY_MARKER}",
            ]
        )
        process = subprocess.Popen(
            command,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
        try:
            stdout, stderr = process.communicate(timeout=min(TIMEOUT, remaining))
        except subprocess.TimeoutExpired:
            stop_systemd_scope(systemd_unit)
            terminate_tree(process, tree_token)
            return "indeterminate"
        scope_clean = stop_systemd_scope(systemd_unit)
        terminate_tree(process, tree_token)
    except (OSError, ValueError):
        return "indeterminate"
    if not scope_clean:
        return "indeterminate"
    if process.returncode != 0:
        capacity = re.compile(r"usage limit|rate limit|\b429\b|hit your usage limit", re.I)
        return "not_ready" if capacity.search(stdout + "\n" + stderr) else "indeterminate"
    return "ready" if stdout.strip() == READY_MARKER else "indeterminate"


def probe_and_recover(account, observed_cooldown, observed_error, observed_active, observed_auth, observed_config, now, deadline):
    if LOCKS.exists() and LOCKS.is_symlink():
        return "indeterminate"
    account_lock = LOCKS / f"{account}.lock"
    account_lock.parent.mkdir(parents=True, exist_ok=True)
    if account_lock.is_symlink():
        return "indeterminate"
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(account_lock, flags, 0o600)
    except OSError:
        return "indeterminate"
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return "indeterminate"
        try:
            inventory = configured_inventory()
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            return "indeterminate"
        selected = inventory.get(account) if inventory is not None else None
        if selected is None:
            return "indeterminate"
        _home, auth_path, config_path, _auth = selected
        if ((auth_path.stat().st_dev, auth_path.stat().st_ino) != observed_auth or
                (config_path.stat().st_dev, config_path.stat().st_ino) != observed_config):
            return "indeterminate"
        probe = authenticated_probe(account, deadline)
        if probe != "ready":
            return probe
        return recover(account, observed_cooldown, observed_error, observed_active, now)
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def recover(account, observed_cooldown, observed_error, observed_active, now):
    try:
        with locked_state() as state:
            cooldowns = state.get("cooldowns")
            errors = state.get("last_error")
            readiness = state.get("readiness")
            if (
                not isinstance(cooldowns, dict)
                or not isinstance(errors, dict)
                or (readiness is not None and not isinstance(readiness, dict))
            ):
                return "indeterminate"
            try:
                current = int(cooldowns.get(account) or 0)
            except (TypeError, ValueError):
                return False
            # A second limiter event while this probe ran must win.
            if current != observed_cooldown or current <= now:
                return "drift"
            current_error = errors.get(account)
            if current_error != observed_error:
                return "drift"
            if state.get("active") != observed_active:
                return "drift"
            cooldowns[account] = now
            state["active"] = account
            readiness = state.setdefault("readiness", {})
            readiness[account] = {
                "checkedAt": now,
                "expiresAt": now + TTL,
                "source": SOURCE,
                "requiredForNextLaunch": True,
            }
            errors.pop(account, None)
            temporary = STATE.with_suffix(STATE.suffix + ".tmp")
            temporary.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            os.chmod(temporary, 0o600)
            os.replace(temporary, STATE)
            return "recovered"
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return "indeterminate"


now = int(time.time())
external_deadline = os.environ.get("CODEX_ACCOUNT_PROBE_DEADLINE_EPOCH")
try:
    deadline_epoch = float(external_deadline) if external_deadline is not None else None
except (TypeError, ValueError):
    deadline_epoch = None
if deadline_epoch is not None and (not math.isfinite(deadline_epoch) or deadline_epoch <= time.time()):
    raise SystemExit(76)
budget = min(TOTAL_TIMEOUT, deadline_epoch - time.time()) if deadline_epoch is not None else TOTAL_TIMEOUT
deadline = time.monotonic() + budget
recovered = 0
indeterminate = False
candidates = read_candidates(now)
if candidates is None:
    raise SystemExit(76)
for account, cooldown, observed_error, observed_active, observed_auth, observed_config in candidates:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        indeterminate = True
        break
    outcome = probe_and_recover(
        account, cooldown, observed_error, observed_active, observed_auth, observed_config, now, deadline
    )
    if outcome == "indeterminate":
        indeterminate = True
        continue
    if outcome == "not_ready":
        continue
    if outcome == "recovered":
        print(f"RECOVERED {account}")
        recovered += 1
        if MAX_RECOVERIES > 0 and recovered >= MAX_RECOVERIES:
            break
    elif outcome in ("drift", "indeterminate"):
        indeterminate = True
if recovered:
    raise SystemExit(0)
raise SystemExit(76 if indeterminate else 75)
PY
