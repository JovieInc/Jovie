#!/usr/bin/env python3
"""Codex readiness probe and the reversible Symphony/Grok sidecar."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request


READY_MARKER = "GEM_MODEL_READY"
DEFAULT_ROTATE_BIN = "/home/timwhite/.local/bin/codex-rotate"
DEFAULT_STATE = "~/.codex-accounts/state.json"
DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_TIMEOUT_SECONDS = 30.0
DEFAULT_GROK_MAX = 2
MAX_GROK_MAX = 10
DEFAULT_CONTROL_TIMEOUT_SECONDS = 10.0
MAX_CONTROL_TIMEOUT_SECONDS = 30.0
SERVICE = "symphony-ui-pilot.service"
LINEAR_API = "https://api.linear.app/graphql"
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
LINEAR_ENV_PATH = "~/.config/symphony/linear.env"
DOTENV_ASSIGNMENT = re.compile(r"^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
INSTALL_STATE_DIR = ".symphony-codex-auth-fallback"
INSTALL_CURRENT = "current"
INSTALL_RELEASES = "releases"
RUNTIME_NAMES = (
    "symphony-codex-exhausted",
    "symphony-codex-exhausted.py",
    "symphony-grok-sidecar",
)

LINEAR_QUERY = """
query {
  issues(
    first: 20
    filter: {
      labels: { name: { eq: "symphony" } }
      state: { name: { in: ["Todo", "In Progress"] } }
    }
  ) {
    nodes { identifier }
  }
}
"""


def _state_path() -> pathlib.Path:
    value = os.environ.get("GEM_CODEX_ACCOUNTS_STATE", DEFAULT_STATE)
    return pathlib.Path(os.path.expanduser(value))


def _known_account_state() -> bool:
    """Validate the observed schema without treating any field as readiness."""

    try:
        state = json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return False
    if not isinstance(state, dict):
        return False
    required = ("active", "cooldowns", "last_error")
    if any(key not in state for key in required):
        return False
    return (
        (state["active"] is None or isinstance(state["active"], str))
        and isinstance(state["cooldowns"], dict)
        and isinstance(state["last_error"], dict)
    )


def _timeout_seconds() -> float:
    try:
        value = float(
            os.environ.get(
                "GEM_CODEX_CANARY_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)
            )
        )
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_SECONDS
    if value <= 0:
        return DEFAULT_TIMEOUT_SECONDS
    return min(value, MAX_TIMEOUT_SECONDS)


def _rotate_executable() -> str | None:
    configured = os.environ.get("GEM_CODEX_ROTATE_BIN", DEFAULT_ROTATE_BIN)
    if pathlib.Path(configured).is_absolute():
        return configured if os.access(configured, os.X_OK) else None
    return shutil.which(configured)


def _grok_ship_one_executable() -> str | None:
    configured = os.environ.get(
        "GEM_GROK_SHIP_ONE_BIN",
        str(pathlib.Path.home() / ".local/bin/grok-ship-one"),
    )
    executable = pathlib.Path(os.path.expanduser(configured))
    if not executable.is_absolute():
        return None
    return str(executable) if executable.is_file() and os.access(executable, os.X_OK) else None


def _captured(command: list[str], timeout: float) -> subprocess.CompletedProcess[bytes] | None:
    """Run a child with all output captured and never returned to the caller."""

    try:
        return subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def _exact_marker(output: bytes) -> bool:
    return any(line == READY_MARKER for line in output.decode(errors="replace").splitlines())


def codex_canary_ready() -> tuple[bool, str]:
    if not _known_account_state():
        return False, "unknown_state"

    executable = _rotate_executable()
    if executable is None:
        return False, "executable_missing"

    command = [
        executable,
        "--config",
        "shell_environment_policy.inherit=none",
        "--config",
        "model=gpt-5.6-luna",
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        f"Reply with exactly: {READY_MARKER}",
    ]
    result = _captured(command, _timeout_seconds())
    if result is None:
        return False, "probe_failed"
    if result.returncode != 0:
        return False, "probe_failed"
    if not _exact_marker(result.stdout):
        return False, "missing_ready_evidence"
    return True, "ready"


def _systemctl(*args: str) -> list[str]:
    return ["systemctl", "--user", *args]


def _control_timeout_seconds() -> float:
    try:
        value = float(
            os.environ.get(
                "GEM_SYSTEM_CONTROL_TIMEOUT_SECONDS",
                str(DEFAULT_CONTROL_TIMEOUT_SECONDS),
            )
        )
    except (TypeError, ValueError):
        return DEFAULT_CONTROL_TIMEOUT_SECONDS
    if value <= 0:
        return DEFAULT_CONTROL_TIMEOUT_SECONDS
    return min(value, MAX_CONTROL_TIMEOUT_SECONDS)


def _control(command: list[str]) -> bool:
    result = _captured(command, _control_timeout_seconds())
    return result is not None and result.returncode == 0


def _active_grok_units() -> bool | None:
    result = _captured(
        _systemctl(
            "list-units",
            "--type=service",
            "--state=active",
            "grok-ship-*.service",
            "--no-legend",
            "--no-pager",
        ),
        _control_timeout_seconds(),
    )
    if result is None or result.returncode != 0:
        return None
    return bool(result.stdout.strip())


def _grok_limit() -> int:
    try:
        value = int(os.environ.get("SYMPHONY_GROK_MAX", str(DEFAULT_GROK_MAX)))
    except (TypeError, ValueError):
        return DEFAULT_GROK_MAX
    return max(0, min(value, MAX_GROK_MAX))


def _dotenv_value(raw: str) -> str | None:
    if not raw:
        return None
    if raw[0] in "'\"":
        quote = raw[0]
        if len(raw) < 2 or raw[-1] != quote:
            return None
        value = raw[1:-1]
        if quote in value or any(character in value for character in "\\$`"):
            return None
        return value or None
    if any(character.isspace() for character in raw):
        return None
    if any(character in raw for character in "'\"\\$`;|&<>(){}"):
        return None
    return raw


def _linear_api_key_from_file() -> str | None:
    try:
        lines = pathlib.Path(os.path.expanduser(LINEAR_ENV_PATH)).read_text(
            encoding="utf-8"
        ).splitlines()
    except (OSError, UnicodeError):
        return None

    key: str | None = None
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = DOTENV_ASSIGNMENT.fullmatch(line)
        if match is None or match.group(1) != "LINEAR_API_KEY" or key is not None:
            return None
        key = _dotenv_value(match.group(2))
        if key is None:
            return None
    return key


def _linear_identifiers() -> list[str] | None:
    key = (
        os.environ["LINEAR_API_KEY"]
        if "LINEAR_API_KEY" in os.environ
        else _linear_api_key_from_file()
    )
    if not key:
        return None
    body = json.dumps({"query": LINEAR_QUERY}).encode()
    request = urllib.request.Request(
        os.environ.get("LINEAR_API_URL", LINEAR_API),
        data=body,
        headers={"Authorization": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=_control_timeout_seconds()) as response:
            payload = json.load(response)
    except (OSError, ValueError, TypeError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict) or payload.get("errors"):
        return None
    try:
        nodes = payload["data"]["issues"]["nodes"]
    except (KeyError, TypeError):
        return None
    if not isinstance(nodes, list):
        return None
    identifiers = []
    for node in nodes:
        if not isinstance(node, dict) or not isinstance(node.get("identifier"), str):
            return None
        identifier = node["identifier"]
        if IDENTIFIER.fullmatch(identifier):
            identifiers.append(identifier)
    return identifiers


def _grok_command(identifier: str, executable: str) -> list[str]:
    unit = f"grok-ship-{identifier}"
    path = f"{pathlib.Path.home()}/.local/bin:/usr/bin:/bin"
    return [
        "systemd-run",
        "--user",
        f"--unit={unit}",
        "--collect",
        "-p",
        "Type=exec",
        "-p",
        f"Environment=PATH={path}",
        "/bin/bash",
        executable,
        identifier,
    ]


def reconcile() -> int:
    ready, reason = codex_canary_ready()
    if ready:
        active_grok_units = _active_grok_units()
        if active_grok_units is None or active_grok_units:
            print(
                "codex_not_exhausted recovery_deferred grok_ship_active_unknown",
                file=sys.stderr,
            )
            return 0
        if not _control(_systemctl("start", SERVICE)):
            print("codex_not_exhausted symphony_start_failed", file=sys.stderr)
            return 2
        if not _control(_systemctl("is-active", "--quiet", SERVICE)):
            print("codex_not_exhausted symphony_not_active", file=sys.stderr)
            return 2
        print("codex_not_exhausted symphony_active idle", file=sys.stderr)
        return 0

    if not _control(_systemctl("stop", SERVICE)):
        print("codex_exhausted symphony_stop_failed", file=sys.stderr)
        return 2
    executable = _grok_ship_one_executable()
    if executable is None:
        print("codex_exhausted grok_executable_missing", file=sys.stderr)
        return 2
    identifiers = _linear_identifiers()
    if identifiers is None:
        print("codex_exhausted linear_query_failed", file=sys.stderr)
        return 2

    started = 0
    limit = _grok_limit()
    for identifier in identifiers:
        if started >= limit:
            break
        unit = f"grok-ship-{identifier}"
        if _control(_systemctl("is-active", "--quiet", unit)):
            continue
        if not _control(_grok_command(identifier, executable)):
            print("codex_exhausted grok_launch_failed", file=sys.stderr)
            return 2
        started += 1
    print(f"codex_exhausted {reason} grok_started={started}", file=sys.stderr)
    return 0


def _artifacts() -> dict[str, pathlib.Path]:
    root = pathlib.Path(__file__).resolve().parent
    return {
        "symphony-codex-exhausted": root / "symphony-codex-exhausted",
        "symphony-codex-exhausted.py": root / "symphony-codex-exhausted.py",
        "symphony-grok-sidecar": root / "symphony-grok-sidecar",
    }


def _stable_launcher(name: str) -> bytes:
    if name == "symphony-codex-exhausted.py":
        return b'''#!/usr/bin/env python3
from __future__ import annotations

import os
import pathlib
import sys


controller = (
    pathlib.Path(__file__).resolve().parent
    / ".symphony-codex-auth-fallback"
    / "current"
    / "symphony-codex-exhausted.py"
)
os.execv(sys.executable, [sys.executable, str(controller), *sys.argv[1:]])
'''
    command = 'reconcile "$@"' if name == "symphony-grok-sidecar" else '"$@"'
    return f'''#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${{BASH_SOURCE[0]}}")" && pwd)"
exec python3 "$SCRIPT_DIR/{INSTALL_STATE_DIR}/{INSTALL_CURRENT}/symphony-codex-exhausted.py" {command}
'''.encode()


def _path_exists(path: pathlib.Path) -> bool:
    return os.path.lexists(path)


def _write_executable(path: pathlib.Path, data: bytes) -> None:
    with path.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    path.chmod(0o755)


def install(destination_root: str | None) -> int:
    artifacts = _artifacts()
    contents: dict[str, bytes] = {}
    for name, source in artifacts.items():
        try:
            mode = source.stat().st_mode
            data = source.read_bytes()
        except OSError:
            print("install validation failed", file=sys.stderr)
            return 2
        if not source.is_file() or not data.startswith(b"#!") or not (mode & 0o111):
            print("install validation failed", file=sys.stderr)
            return 2
        contents[name] = data

    destination = pathlib.Path(os.path.expanduser(destination_root or "~/.local/bin")).resolve()
    state_dir = destination / INSTALL_STATE_DIR
    current = state_dir / INSTALL_CURRENT
    release: pathlib.Path | None = None
    migration_backup: pathlib.Path | None = None
    moved: list[str] = []
    installed: list[str] = []
    had_current = _path_exists(current)
    old_current_target: str | None = None
    current_switched = False
    next_current = state_dir / ".current.install"
    try:
        destination.mkdir(parents=True, exist_ok=True)
        state_dir.mkdir(parents=True, exist_ok=True)
        releases = state_dir / INSTALL_RELEASES
        releases.mkdir(parents=True, exist_ok=True)
        if had_current:
            if not current.is_symlink():
                raise OSError("current switch is not a symlink")
            old_current_target = os.readlink(current)

        release = pathlib.Path(tempfile.mkdtemp(prefix="release-", dir=releases))
        for name, data in contents.items():
            _write_executable(release / name, data)

        if not had_current:
            migration_backup = pathlib.Path(tempfile.mkdtemp(prefix=".migration-", dir=state_dir))
            for name in RUNTIME_NAMES:
                target = destination / name
                if _path_exists(target):
                    os.replace(target, migration_backup / name)
                    moved.append(name)

        for name in RUNTIME_NAMES:
            target = destination / name
            if _path_exists(target):
                continue
            staged = destination / f".{name}.install"
            _write_executable(staged, _stable_launcher(name))
            os.replace(staged, target)
            installed.append(name)

        if _path_exists(next_current):
            next_current.unlink()
        os.symlink(f"{INSTALL_RELEASES}/{release.name}", next_current)
        os.replace(next_current, current)
        current_switched = True
    except OSError:
        for name in installed:
            target = destination / name
            if _path_exists(target):
                target.unlink()
        if migration_backup is not None:
            for name in reversed(moved):
                backup = migration_backup / name
                if _path_exists(backup):
                    os.replace(backup, destination / name)
        if current_switched:
            if _path_exists(current):
                current.unlink()
            if old_current_target is not None:
                os.symlink(old_current_target, current)
        if _path_exists(next_current):
            next_current.unlink()
        if release is not None:
            shutil.rmtree(release, ignore_errors=True)
        for name in RUNTIME_NAMES:
            staged = destination / f".{name}.install"
            if _path_exists(staged):
                staged.unlink()
        if migration_backup is not None:
            shutil.rmtree(migration_backup, ignore_errors=True)
        print("install failed", file=sys.stderr)
        return 2
    if migration_backup is not None:
        shutil.rmtree(migration_backup, ignore_errors=True)
    return 0


def main() -> int:
    default = "probe"
    if pathlib.Path(sys.argv[0]).name == "symphony-grok-sidecar":
        default = "reconcile"
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", choices=("probe", "reconcile", "install"), default=default)
    parser.add_argument("--destination-root")
    args = parser.parse_args()
    if args.command == "install":
        return install(args.destination_root)
    if args.command == "reconcile":
        return reconcile()
    ready, _ = codex_canary_ready()
    print("no" if ready else "yes")
    return 1 if ready else 0


if __name__ == "__main__":
    sys.exit(main())
