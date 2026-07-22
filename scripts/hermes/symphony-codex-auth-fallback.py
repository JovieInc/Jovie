#!/usr/bin/env python3
"""Bounded Codex canary and reversible Symphony/Grok fallback controller.

The default invocation preserves the existing probe contract:
  exhausted -> print ``yes`` and exit 0
  usable    -> print ``no`` and exit 1

Cooldown timestamps are not readiness evidence. A valid account-state document
is required so malformed provider state fails closed, but only a live canary
using the rotating Codex command can report the provider usable.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shlex
import shutil
import subprocess
import sys


READY_MARKER = "GEM_MODEL_READY"
DEFAULT_ROTATE_BIN = "/home/timwhite/.local/bin/codex-rotate"
DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_STATE = "~/.codex-accounts/state.json"
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_TIMEOUT_SECONDS = 30.0
MAX_GROK_CANDIDATES = 3
MAX_COMMAND_LENGTH = 4096


def _state_path() -> pathlib.Path:
    return pathlib.Path(
        os.path.expanduser(os.environ.get("GEM_CODEX_ACCOUNTS_STATE", DEFAULT_STATE))
    )


def _known_account_state() -> bool:
    """Return whether the account state is structurally known, never its age."""

    try:
        state = json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return False
    if not isinstance(state, dict) or not state:
        return False
    if "cooldowns" in state and not isinstance(state["cooldowns"], dict):
        return False
    if "accounts" in state and not isinstance(state["accounts"], (dict, list)):
        return False
    return state.get("status") not in {"unknown", "invalid", "unavailable"}


def _timeout_seconds() -> float:
    try:
        timeout = float(
            os.environ.get(
                "GEM_CODEX_CANARY_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)
            )
        )
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS
    if timeout <= 0 or timeout > MAX_TIMEOUT_SECONDS:
        return DEFAULT_TIMEOUT_SECONDS
    return timeout


def _resolve_executable() -> str | None:
    configured = os.environ.get("GEM_CODEX_ROTATE_BIN", DEFAULT_ROTATE_BIN)
    if pathlib.Path(configured).is_absolute():
        return configured if os.access(configured, os.X_OK) else None
    return shutil.which(configured)


def _has_exact_marker(output: str) -> bool:
    return any(line.strip() == READY_MARKER for line in output.splitlines())


def codex_canary_ready() -> tuple[bool, str]:
    """Run the no-tool rotating canary without exposing its output."""

    if not _known_account_state():
        return False, "unknown_state"

    executable = _resolve_executable()
    if executable is None:
        return False, "executable_missing"

    command = [
        executable,
        "--config",
        "shell_environment_policy.inherit=all",
        "--config",
        f"model={os.environ.get('GEM_CODEX_MODEL', DEFAULT_MODEL)}",
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        f"Reply with exactly: {READY_MARKER}",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=_timeout_seconds(),
        )
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except (OSError, ValueError):
        return False, "probe_failed"

    if result.returncode != 0:
        return False, "probe_failed"
    if not _has_exact_marker(result.stdout):
        return False, "missing_ready_evidence"
    return True, "ready"


def _control_command(command: list[str], timeout: float) -> bool:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return False
    return result.returncode == 0


def _parse_command(value: str) -> list[str] | None:
    if not value or len(value) > MAX_COMMAND_LENGTH:
        return None
    try:
        command = shlex.split(value)
    except ValueError:
        return None
    return command or None


def _grok_candidates() -> list[list[str]] | None:
    raw = os.environ.get("GEM_GROK_CANDIDATES", "")
    if not raw:
        return []
    commands: list[list[str]] = []
    for line in raw.splitlines():
        command = _parse_command(line)
        if command is None:
            return None
        commands.append(command)
    if len(commands) > MAX_GROK_CANDIDATES:
        return None
    return commands


def _systemctl(*args: str) -> list[str]:
    return [os.environ.get("GEM_SYSTEMCTL", "systemctl"), *args]


def reconcile() -> int:
    ready, reason = codex_canary_ready()
    service = os.environ.get("GEM_SYMPHONY_SERVICE", "symphony-ui-pilot.service")
    control_timeout = min(_timeout_seconds(), 10.0)

    if ready:
        if not _control_command(_systemctl("start", service), control_timeout):
            print("codex_usable symphony_start_failed", file=sys.stderr)
            return 2
        if not _control_command(
            _systemctl("is-active", "--quiet", service), control_timeout
        ):
            print("codex_usable symphony_not_active", file=sys.stderr)
            return 2

        idle = _parse_command(os.environ.get("GEM_GROK_IDLE_COMMAND", ""))
        if idle is not None and not _control_command(idle, control_timeout):
            print("codex_usable grok_idle_failed", file=sys.stderr)
            return 2
        print("codex_usable symphony_active grok_idle_requested", file=sys.stderr)
        return 0

    if not _control_command(_systemctl("stop", service), control_timeout):
        print(f"codex_exhausted {reason} symphony_stop_failed", file=sys.stderr)
        return 2

    candidates = _grok_candidates()
    if candidates is None:
        print(f"codex_exhausted {reason} grok_candidates_invalid", file=sys.stderr)
        return 2
    for candidate in candidates:
        if not _control_command(candidate, control_timeout):
            print(f"codex_exhausted {reason} grok_candidate_failed", file=sys.stderr)
            return 2
    print(
        f"codex_exhausted {reason} grok_candidates_started={len(candidates)}",
        file=sys.stderr,
    )
    return 0


def main() -> int:
    default_command = (
        "reconcile"
        if "grok-sidecar" in pathlib.Path(sys.argv[0]).name
        else "probe"
    )
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command", nargs="?", choices=("probe", "reconcile"), default=default_command
    )
    args = parser.parse_args()
    if args.command == "reconcile":
        return reconcile()

    ready, _ = codex_canary_ready()
    print("no" if ready else "yes")
    return 1 if ready else 0


if __name__ == "__main__":
    sys.exit(main())
