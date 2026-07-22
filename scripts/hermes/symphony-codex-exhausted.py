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
        "shell_environment_policy.inherit=all",
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


def _control(command: list[str]) -> bool:
    result = _captured(command, min(_timeout_seconds(), CONTROL_TIMEOUT_SECONDS))
    return result is not None and result.returncode == 0


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
        with urllib.request.urlopen(request, timeout=CONTROL_TIMEOUT_SECONDS) as response:
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


def _grok_command(identifier: str) -> list[str]:
    unit = f"grok-ship-{identifier}"
    return [
        "systemd-run",
        "--user",
        f"--unit={unit}",
        "--collect",
        str(pathlib.Path.home() / ".local/bin/grok-ship-one"),
        identifier,
    ]


def reconcile() -> int:
    ready, reason = codex_canary_ready()
    if ready:
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
        if not _control(_grok_command(identifier)):
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
    stage: pathlib.Path | None = None
    try:
        destination.mkdir(parents=True, exist_ok=True)
        stage = pathlib.Path(tempfile.mkdtemp(prefix=".symphony-install-", dir=destination.parent))
        for name, data in contents.items():
            staged = stage / name
            staged.write_bytes(data)
            staged.chmod(0o755)
        for name in contents:
            os.replace(stage / name, destination / name)
    except OSError:
        print("install failed", file=sys.stderr)
        return 2
    finally:
        if stage is not None:
            shutil.rmtree(stage, ignore_errors=True)
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
