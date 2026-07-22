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
CONTROL_TIMEOUT_SECONDS = 10.0
SERVICE = "symphony-ui-pilot.service"
LINEAR_API = "https://api.linear.app/graphql"
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
LINEAR_ENV_PATH = "~/.config/symphony/linear.env"
DOTENV_ASSIGNMENT = re.compile(r"^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
INSTALL_STATE_DIR = ".symphony-codex-auth-fallback"
INSTALL_CURRENT = "current"
INSTALL_PENDING = "pending"
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
    executable = pathlib.Path.home() / ".local/bin/grok-ship-one"
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
    return CONTROL_TIMEOUT_SECONDS


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
        executable,
        identifier,
    ]


def reconcile() -> int:
    ready, reason = codex_canary_ready()
    if ready:
        active_grok_units = _active_grok_units()
        if active_grok_units is None:
            print("codex_not_exhausted grok_state_query_failed", file=sys.stderr)
            return 2
        if active_grok_units:
            print(
                "codex_not_exhausted recovery_deferred grok_ship_active",
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


state_dir = pathlib.Path(__file__).resolve().parent / ".symphony-codex-auth-fallback"
release_link = state_dir / "current"
if not release_link.exists():
    release_link = state_dir / "pending"
controller = release_link / "symphony-codex-exhausted.py"
if not controller.is_file():
    raise SystemExit("symphony-codex-auth-fallback is not installed")
os.execv(sys.executable, [sys.executable, str(controller), *sys.argv[1:]])
'''
    command = 'reconcile "$@"' if name == "symphony-grok-sidecar" else '"$@"'
    return f'''#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${{BASH_SOURCE[0]}}")" && pwd)"
STATE_DIR="$SCRIPT_DIR/{INSTALL_STATE_DIR}"
RELEASE_LINK="$STATE_DIR/{INSTALL_CURRENT}"
if [[ ! -e "$RELEASE_LINK" ]]; then
  RELEASE_LINK="$STATE_DIR/{INSTALL_PENDING}"
fi
exec python3 "$RELEASE_LINK/symphony-codex-exhausted.py" {command}
'''.encode()


def _path_exists(path: pathlib.Path) -> bool:
    return os.path.lexists(path)


def _write_executable(path: pathlib.Path, data: bytes) -> None:
    with path.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    path.chmod(0o755)


class InstallValidationError(Exception):
    pass


def _valid_runtime_file(path: pathlib.Path) -> bool:
    if path.is_symlink() or not path.is_file():
        return False
    try:
        mode = path.stat().st_mode
        data = path.read_bytes()
    except OSError:
        return False
    return bool(data.startswith(b"#!") and mode & 0o111)


def _validated_release_link(
    link: pathlib.Path, releases: pathlib.Path
) -> pathlib.Path | None:
    if not _path_exists(link):
        return None
    if not link.is_symlink():
        raise InstallValidationError("release link is not a symlink")
    raw_target = os.readlink(link)
    target_parts = pathlib.PurePath(raw_target).parts
    if (
        pathlib.PurePath(raw_target).is_absolute()
        or len(target_parts) != 2
        or target_parts[0] != INSTALL_RELEASES
    ):
        raise InstallValidationError("release link target is invalid")
    release = releases / target_parts[1]
    if release.parent != releases or not release.is_dir():
        raise InstallValidationError("release link target is missing")
    if not all(_valid_runtime_file(release / name) for name in RUNTIME_NAMES):
        raise InstallValidationError("release link target is incomplete")
    return release


def _existing_top_level(destination: pathlib.Path) -> dict[str, pathlib.Path]:
    return {
        name: destination / name
        for name in RUNTIME_NAMES
        if _path_exists(destination / name)
    }


def _preflight_install(
    destination: pathlib.Path,
) -> tuple[pathlib.Path | None, pathlib.Path | None, str]:
    state_dir = destination / INSTALL_STATE_DIR
    releases = state_dir / INSTALL_RELEASES
    current = _validated_release_link(state_dir / INSTALL_CURRENT, releases)
    pending = _validated_release_link(state_dir / INSTALL_PENDING, releases)
    top_level = _existing_top_level(destination)
    stable = {name: _stable_launcher(name) for name in RUNTIME_NAMES}

    if current is None and pending is None:
        if not top_level:
            return None, None, "fresh"
        if len(top_level) != len(RUNTIME_NAMES) or not all(
            _valid_runtime_file(path) for path in top_level.values()
        ):
            raise InstallValidationError("legacy launcher set is partial or invalid")
        return None, None, "legacy"

    if current is None:
        if any(path.read_bytes() != stable[name] for name, path in top_level.items()):
            raise InstallValidationError("pending install has an invalid launcher")
        return None, pending, "fresh"

    current_contents = {name: (current / name).read_bytes() for name in RUNTIME_NAMES}
    for name, path in top_level.items():
        if not _valid_runtime_file(path):
            raise InstallValidationError("installed launcher is invalid")
        if path.read_bytes() not in (stable[name], current_contents[name]):
            raise InstallValidationError("installed launcher has unexpected contents")
    return current, pending, "versioned"


def _atomic_release_link(link: pathlib.Path, release: pathlib.Path) -> None:
    temporary = link.parent / f".{link.name}.install"
    if _path_exists(temporary):
        temporary.unlink()
    os.symlink(f"{INSTALL_RELEASES}/{release.name}", temporary)
    os.replace(temporary, link)


def _install_launcher(destination: pathlib.Path, name: str, data: bytes) -> None:
    staged = destination / f".{name}.install"
    _write_executable(staged, data)
    os.replace(staged, destination / name)


def _remove_install_temps(destination: pathlib.Path, state_dir: pathlib.Path) -> None:
    for name in RUNTIME_NAMES:
        staged = destination / f".{name}.install"
        if _path_exists(staged):
            try:
                staged.unlink()
            except OSError:
                pass
    for name in (INSTALL_CURRENT, INSTALL_PENDING):
        staged = state_dir / f".{name}.install"
        if _path_exists(staged):
            try:
                staged.unlink()
            except OSError:
                pass


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

    destination = pathlib.Path(
        os.path.expanduser(destination_root or "~/.local/bin")
    ).resolve()
    state_dir = destination / INSTALL_STATE_DIR
    current = state_dir / INSTALL_CURRENT
    pending = state_dir / INSTALL_PENDING

    try:
        current_target, pending_target, mode = _preflight_install(destination)
    except (InstallValidationError, OSError):
        print("install validation failed", file=sys.stderr)
        return 2

    release: pathlib.Path | None = pending_target
    try:
        destination.mkdir(parents=True, exist_ok=True)
        state_dir.mkdir(parents=True, exist_ok=True)
        releases = state_dir / INSTALL_RELEASES
        releases.mkdir(parents=True, exist_ok=True)
        if release is None:
            release = pathlib.Path(tempfile.mkdtemp(prefix="release-", dir=releases))
            for name, data in contents.items():
                _write_executable(release / name, data)

        if mode == "legacy" and current_target is None:
            prior = pathlib.Path(tempfile.mkdtemp(prefix="prior-", dir=releases))
            for name in RUNTIME_NAMES:
                source = destination / name
                _write_executable(prior / name, source.read_bytes())
            _atomic_release_link(current, prior)
            current_target = prior

        if not _path_exists(pending):
            _atomic_release_link(pending, release)

        for name in RUNTIME_NAMES:
            _install_launcher(destination, name, _stable_launcher(name))

        os.replace(pending, current)
        _remove_install_temps(destination, state_dir)
    except OSError:
        _remove_install_temps(destination, state_dir)
        print("install failed", file=sys.stderr)
        return 2
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
