#!/usr/bin/env python3
"""Fail-closed Codex readiness probe and reversible Symphony/Grok fallback."""

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
import time
import urllib.error
import urllib.request


READY_MARKER = "GEM_MODEL_READY"
DEFAULT_ROTATE_BIN = "/home/timwhite/.local/bin/codex-rotate"
DEFAULT_STATE = "~/.codex-accounts/state.json"
DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_TIMEOUT_SECONDS = 30.0
CONTROL_TIMEOUT_SECONDS = 10.0
DEFAULT_GROK_MAX = 4  # Gem 16c/62GB safely runs 4 concurrent grok-ship workers (per-unit idempotent, active units skipped)
MAX_GROK_MAX = 10  # hard ceiling; 10 only via explicit SYMPHONY_GROK_MAX (free-tier Build quota / dispatch risk above 4)
SERVICES = ("symphony-ui-pilot.service", "symphony-lyb.service")
LINEAR_API = "https://api.linear.app/graphql"
LINEAR_ENV_PATH = "~/.config/symphony/linear.env"
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
DOTENV_ASSIGNMENT = re.compile(r"^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
STATE_DIR_NAME = ".symphony-codex-auth-fallback"
LEGACY_RUNTIME_NAMES = (
    "symphony-codex-exhausted",
    "symphony-codex-exhausted.py",
    "symphony-grok-sidecar",
)
RUNTIME_NAMES = (
    *LEGACY_RUNTIME_NAMES,
    "grok-ship-one",
)
REQUIRED_ADMISSION_LABELS = frozenset(("symphony", "plan-approved", "admission-approved"))
# Single source of truth for the Grok sidecar admission predicate. `blocked` is
# included because human-review flags (needs-human / needs:human / blocked / hold)
# must gate out of auto-ship; reconcile and grok-ship-one both use this set.
BLOCKED_ADMISSION_LABELS = frozenset(
    ("human-review-required", "needs:human", "needs-human", "needs:decision", "needs-decision", "hold", "blocked")
)
SUPPORTED_TEAMS = frozenset(("JOV", "LYB"))

LINEAR_QUERY = """
query {
  issues(
    first: 20
    filter: {
      labels: { name: { eq: "symphony" } }
      state: { name: { in: ["Todo", "In Progress"] } }
    }
  ) {
    nodes {
      identifier
      team { key }
      labels { nodes { name } }
    }
  }
}
"""

SINGLE_ISSUE_QUERY = """
query($id: String!) {
  issue(id: $id) {
    id identifier title description url
    state { id name }
    team { key states { nodes { id name } } }
    labels { nodes { name } }
  }
}
"""

# Admission must mirror the list query: only Todo / In Progress issues are
# eligible for pipe through the Grok sidecar.
ADMITTED_STATES = frozenset(("todo", "in progress"))


def _state_path() -> pathlib.Path:
    return pathlib.Path(os.path.expanduser(os.environ.get("GEM_CODEX_ACCOUNTS_STATE", DEFAULT_STATE)))


def _known_account_state() -> bool:
    try:
        state = json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return False
    return (
        isinstance(state, dict)
        and isinstance(state.get("cooldowns"), dict)
        and isinstance(state.get("last_error"), dict)
        and (state.get("active") is None or isinstance(state.get("active"), str))
    )


def _timeout_seconds() -> float:
    try:
        value = float(os.environ.get("GEM_CODEX_CANARY_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_SECONDS
    return DEFAULT_TIMEOUT_SECONDS if value <= 0 else min(value, MAX_TIMEOUT_SECONDS)


def _rotate_executable() -> str | None:
    configured = os.environ.get("GEM_CODEX_ROTATE_BIN", DEFAULT_ROTATE_BIN)
    if pathlib.Path(configured).is_absolute():
        return configured if os.access(configured, os.X_OK) else None
    return shutil.which(configured)


def _captured(command: list[str], timeout: float) -> subprocess.CompletedProcess[bytes] | None:
    """Capture child output so auth payloads never reach durable or caller output."""
    try:
        return subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def _exact_marker(output: bytes) -> bool:
    return any(line == READY_MARKER for line in output.decode(errors="replace").splitlines())


def _read_state() -> dict | None:
    if not _known_account_state():
        return None
    try:
        return json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return None


def _account_off_cooldown(state: dict, now: int) -> bool:
    """True when at least one recorded account's cooldown has expired."""
    for raw in (state.get("cooldowns") or {}).values():
        try:
            until = int(raw or 0)
        except (TypeError, ValueError):
            continue
        if until <= now:
            return True
    return False


def codex_canary_ready() -> tuple[bool, str]:
    # Primary signal: codex-rotate's cooldown state, which matches the live
    # provider 429s. The live probe through codex-rotate is NOT trusted for the
    # exhausted verdict: codex-rotate may answer via its kimi fallback even when
    # every Codex account is capped, which would report ready and keep Symphony
    # thrashing instead of launching the Grok sidecar.
    state = _read_state()
    if state is None:
        return False, "unknown_state"
    cooldowns = state.get("cooldowns") or {}
    if cooldowns and not _account_off_cooldown(state, int(time.time())):
        return False, "all_accounts_cooldown"
    executable = _rotate_executable()
    if executable is None:
        return False, "executable_missing"
    result = _captured(
        [
            executable,
            "--config", "shell_environment_policy.inherit=none",
            "--config", "model=gpt-5.6-luna",
            "exec", "--sandbox", "read-only", "--skip-git-repo-check",
            f"Reply with exactly: {READY_MARKER}",
        ],
        _timeout_seconds(),
    )
    if result is None or result.returncode != 0:
        return False, "probe_failed"
    if not _exact_marker(result.stdout):
        return False, "missing_ready_evidence"
    return True, "ready"


def _systemctl(*args: str) -> list[str]:
    return ["systemctl", "--user", *args]


def _control(command: list[str]) -> bool:
    result = _captured(command, CONTROL_TIMEOUT_SECONDS)
    return result is not None and result.returncode == 0


def _active_grok_units() -> list[str] | None:
    result = _captured(
        _systemctl("list-units", "--type=service", "--state=active", "grok-ship-*.service", "--no-legend", "--no-pager"),
        CONTROL_TIMEOUT_SECONDS,
    )
    if result is None or result.returncode != 0:
        return None
    decoded = result.stdout.decode(errors="replace")
    return [line.split()[0] for line in decoded.splitlines() if line.strip()]


def _grok_ship_one_executable() -> str | None:
    executable = pathlib.Path.home() / ".local/bin/grok-ship-one"
    return str(executable) if executable.is_file() and os.access(executable, os.X_OK) else None


def _grok_limit() -> int:
    try:
        value = int(os.environ.get("SYMPHONY_GROK_MAX", DEFAULT_GROK_MAX))
    except (TypeError, ValueError):
        return DEFAULT_GROK_MAX
    return max(0, min(value, MAX_GROK_MAX))


def _dotenv_value(raw: str) -> str | None:
    if not raw:
        return None
    if raw[0] in "'\"":
        quote = raw[0]
        if len(raw) < 2 or raw[-1] != quote or quote in raw[1:-1] or any(c in raw for c in "\\$`"):
            return None
        return raw[1:-1] or None
    return None if any(c.isspace() or c in "'\"\\$`;|&<>(){}" for c in raw) else raw


def _linear_api_key_from_file() -> str | None:
    try:
        lines = pathlib.Path(os.path.expanduser(LINEAR_ENV_PATH)).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return None
    key: str | None = None
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = DOTENV_ASSIGNMENT.fullmatch(line)
        if match is None or match.group(1) != "LINEAR_API_KEY" or key is not None:
            return None
        key = _dotenv_value(match.group(2))
        if key is None:
            return None
    return key


def admission_decision(team_key: str, identifier: str, labels: set[str]) -> tuple[bool, str]:
    """Single admission predicate shared by reconcile listing, reconcile
    pre-launch verification, and grok-ship-one's check-admission command.

    An issue is admitted only when it is a supported-team identifier carrying
    every required admission label and no blocked/human-review label.
    """
    if not IDENTIFIER.fullmatch(identifier):
        return False, "invalid_identifier"
    if team_key.upper() not in SUPPORTED_TEAMS:
        return False, "unsupported_team"
    if not REQUIRED_ADMISSION_LABELS.issubset(labels):
        return False, "missing_admission_labels"
    if not BLOCKED_ADMISSION_LABELS.isdisjoint(labels):
        return False, "blocked"
    return True, "admitted"


def _linear_identifiers() -> list[str] | None:
    key = os.environ.get("LINEAR_API_KEY") or _linear_api_key_from_file()
    if not key:
        return None
    request = urllib.request.Request(
        os.environ.get("LINEAR_API_URL", LINEAR_API),
        data=json.dumps({"query": LINEAR_QUERY}).encode(),
        headers={"Authorization": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=CONTROL_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except (OSError, ValueError, TypeError, urllib.error.URLError):
        return None
    try:
        nodes = payload["data"]["issues"]["nodes"]
    except (KeyError, TypeError):
        return None
    if not isinstance(nodes, list) or payload.get("errors"):
        return None
    identifiers: list[str] = []
    for node in nodes:
        if not isinstance(node, dict) or not isinstance(node.get("identifier"), str):
            return None
        team = node.get("team")
        label_connection = node.get("labels")
        if not isinstance(team, dict) or not isinstance(label_connection, dict):
            return None
        team_key = team.get("key")
        label_nodes = label_connection.get("nodes")
        if not isinstance(team_key, str) or not isinstance(label_nodes, list):
            return None
        labels: set[str] = set()
        for label in label_nodes:
            if not isinstance(label, dict) or not isinstance(label.get("name"), str):
                return None
            labels.add(label["name"].strip().lower())
        identifier = node["identifier"]
        ok, _reason = admission_decision(team_key, identifier, labels)
        if ok:
            identifiers.append(identifier)
    return identifiers


def _fetch_single_issue(identifier: str) -> dict | None:
    key = os.environ.get("LINEAR_API_KEY") or _linear_api_key_from_file()
    if not key:
        return None
    request = urllib.request.Request(
        os.environ.get("LINEAR_API_URL", LINEAR_API),
        data=json.dumps({"query": SINGLE_ISSUE_QUERY, "variables": {"id": identifier}}).encode(),
        headers={"Authorization": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=CONTROL_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except (OSError, ValueError, TypeError, urllib.error.URLError):
        return None
    issue = (payload.get("data") or {}).get("issue")
    if payload.get("errors") or not isinstance(issue, dict):
        return None
    return issue


def _issue_meta(issue: dict, identifier: str) -> tuple[bool, str, dict | None]:
    """Validate one issue against the shared admission predicate and, when
    admitted, produce the meta record grok-ship-one needs to run.
    """
    team = issue.get("team")
    label_connection = issue.get("labels")
    state = issue.get("state")
    if (
        not isinstance(team, dict)
        or not isinstance(label_connection, dict)
        or not isinstance(state, dict)
        or not isinstance(issue.get("identifier"), str)
    ):
        return False, "malformed_issue", None
    team_key = team.get("key")
    if not isinstance(team_key, str):
        return False, "malformed_team", None
    labels = {
        str(node.get("name", "")).strip().lower()
        for node in label_connection.get("nodes", [])
        if isinstance(node, dict)
    }
    ok, reason = admission_decision(team_key, identifier, labels)
    if not ok:
        return False, reason, None
    if issue["identifier"] != identifier:
        return False, "identifier_mismatch", None
    state_name = str(state.get("name") or "").strip().lower()
    if state_name not in ADMITTED_STATES:
        return False, "state_not_admitted", None
    state_nodes = team.get("states")
    states: dict[str, str] = {}
    if isinstance(state_nodes, dict) and isinstance(state_nodes.get("nodes"), list):
        for node in state_nodes["nodes"]:
            if isinstance(node, dict) and isinstance(node.get("name"), str):
                states[node["name"].strip().lower()] = str(node.get("id") or "")
    if not states.get("in progress") or not states.get("in review"):
        return False, "required_workflow_states_missing", None
    meta = {
        "id": issue.get("id"),
        "title": issue.get("title") or identifier,
        "description": (issue.get("description") or "")[:6000],
        "url": issue.get("url") or "",
        "original_state_id": state.get("id"),
        "original_state_name": state.get("name") or "",
        "in_progress_state_id": states["in progress"],
        "in_review_state_id": states["in review"],
    }
    return True, "admitted", meta


def check_admission(identifier: str) -> int:
    """Standalone admission gate: exit 0 + meta JSON on stdout when the issue
    passes the SAME predicate reconcile uses; exit 1 when not admitted; exit 2
    when the verdict cannot be verified (auth/transport). grok-ship-one
    delegates to this so there is exactly one admission source of truth.
    """
    issue = _fetch_single_issue(identifier)
    if issue is None:
        print("not admitted:admission_unverifiable", file=sys.stderr)
        return 2
    ok, reason, meta = _issue_meta(issue, identifier)
    if not ok:
        print(f"not admitted:{reason}", file=sys.stderr)
        return 1
    print(json.dumps(meta))
    return 0


def _grok_command(identifier: str, executable: str) -> list[str]:
    return [
        "systemd-run", "--user", f"--unit=grok-ship-{identifier}", "--collect",
        "-p", "Type=exec", "-p", f"Environment=PATH={pathlib.Path.home()}/.local/bin:/usr/bin:/bin",
        executable, identifier,
    ]


def reconcile() -> int:
    ready, reason = codex_canary_ready()
    if ready:
        active = _active_grok_units()
        if active is None:
            print("codex_not_exhausted grok_state_query_failed", file=sys.stderr)
            return 2
        if active:
            print("codex_not_exhausted recovery_deferred grok_ship_active", file=sys.stderr)
            return 0
        if not _control(_systemctl("start", *SERVICES)):
            print("codex_not_exhausted symphony_start_failed", file=sys.stderr)
            return 2
        if not _control(_systemctl("is-active", "--quiet", *SERVICES)):
            print("codex_not_exhausted symphony_not_active", file=sys.stderr)
            return 2
        print("codex_not_exhausted symphony_active idle", file=sys.stderr)
        return 0

    # A failed readiness probe is not proof that Codex is exhausted. Only the
    # typed cooldown state authorizes the destructive primary-to-fallback
    # handoff. Preserve the running services on missing state, missing binaries,
    # timeouts, transport failures, and malformed probe output.
    if reason != "all_accounts_cooldown":
        print(
            f"codex_readiness_indeterminate {reason} symphony_unchanged",
            file=sys.stderr,
        )
        return 2

    # Prove the fallback control plane before stopping Symphony. Otherwise a
    # transient Linear, filesystem, or systemd observation failure can turn a
    # healthy primary into a zero-worker outage.
    executable = _grok_ship_one_executable()
    if executable is None:
        print(
            "codex_exhausted grok_executable_missing symphony_unchanged",
            file=sys.stderr,
        )
        return 2
    identifiers = _linear_identifiers()
    if identifiers is None:
        print(
            "codex_exhausted linear_query_failed symphony_unchanged",
            file=sys.stderr,
        )
        return 2
    active = _active_grok_units()
    if active is None:
        print(
            "codex_exhausted grok_state_query_failed symphony_unchanged",
            file=sys.stderr,
        )
        return 2
    if not identifiers and not active:
        print(
            f"codex_exhausted {reason} no_admitted_work symphony_unchanged",
            file=sys.stderr,
        )
        return 0
    if not _control(_systemctl("stop", *SERVICES)):
        print("codex_exhausted symphony_stop_failed", file=sys.stderr)
        return 2
    remaining = _grok_limit() - len(active)
    if remaining <= 0:
        print(f"codex_exhausted {reason} grok_concurrency_full grok_started=0", file=sys.stderr)
        return 0
    started = 0
    for identifier in identifiers:
        if started >= remaining:
            break
        if _control(_systemctl("is-active", "--quiet", f"grok-ship-{identifier}")):
            continue
        # Re-verify admission immediately before launch: a label/state guard
        # may have flagged the issue (blocked / needs-human) after the list
        # query, and reconcile must never launch work grok-ship-one will
        # reject. Same predicate as grok-ship-one's check-admission.
        issue = _fetch_single_issue(identifier)
        if issue is None:
            print(f"codex_exhausted skip {identifier} admission_unverifiable", file=sys.stderr)
            continue
        ok, _reason, _meta = _issue_meta(issue, identifier)
        if not ok:
            print(f"codex_exhausted skip {identifier} not admitted", file=sys.stderr)
            continue
        if not _control(_grok_command(identifier, executable)):
            print("codex_exhausted grok_launch_failed", file=sys.stderr)
            return 2
        started += 1
    print(f"codex_exhausted {reason} grok_started={started}", file=sys.stderr)
    return 0


class InstallValidationError(Exception):
    pass


def _artifacts() -> dict[str, pathlib.Path]:
    root = pathlib.Path(__file__).resolve().parent
    return {name: root / name for name in RUNTIME_NAMES}


def _stable_launcher(name: str) -> bytes:
    if name == "symphony-codex-exhausted.py":
        return f'''#!/usr/bin/env python3
from __future__ import annotations
import os
import pathlib
import sys
state = pathlib.Path(__file__).resolve().parent / "{STATE_DIR_NAME}"
controller = state / "current" / "symphony-codex-exhausted.py"
if not controller.is_file():
    raise SystemExit("symphony-codex-auth-fallback is not installed")
os.execv(sys.executable, [sys.executable, str(controller), *sys.argv[1:]])
'''.encode()
    if name in ("symphony-codex-exhausted", "symphony-grok-sidecar"):
        command = 'reconcile "$@"' if name == "symphony-grok-sidecar" else '"$@"'
        return f'''#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${{BASH_SOURCE[0]}}")" && pwd)"
exec python3 "$SCRIPT_DIR/{STATE_DIR_NAME}/current/symphony-codex-exhausted.py" {command}
'''.encode()
    return f'''#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${{BASH_SOURCE[0]}}")" && pwd)"
exec "$SCRIPT_DIR/{STATE_DIR_NAME}/current/{name}" "$@"
'''.encode()


def _path_exists(path: pathlib.Path) -> bool:
    return os.path.lexists(path)


def _fsync_directory(path: pathlib.Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_executable(path: pathlib.Path, data: bytes) -> None:
    with path.open("wb") as handle:
        handle.write(data)
        path.chmod(0o755)
        handle.flush()
        os.fsync(handle.fileno())


def _valid_runtime_file(path: pathlib.Path) -> bool:
    try:
        return not path.is_symlink() and path.is_file() and bool(path.stat().st_mode & 0o111) and path.read_bytes().startswith(b"#!")
    except OSError:
        return False


def _current_release(state: pathlib.Path, releases: pathlib.Path) -> pathlib.Path | None:
    link = state / "current"
    if not _path_exists(link):
        return None
    if not link.is_symlink():
        raise InstallValidationError("current is not a symlink")
    raw = os.readlink(link)
    parts = pathlib.PurePath(raw).parts
    if pathlib.PurePath(raw).is_absolute() or len(parts) != 2 or parts[0] != "releases":
        raise InstallValidationError("current target is invalid")
    release = releases / parts[1]
    if (
        release.parent != releases
        or not release.is_dir()
        or not all(_valid_runtime_file(release / n) for n in LEGACY_RUNTIME_NAMES)
        or any(_path_exists(release / n) and not _valid_runtime_file(release / n) for n in RUNTIME_NAMES)
    ):
        raise InstallValidationError("current release is incomplete")
    return release


def _preflight_install(destination: pathlib.Path, contents: dict[str, bytes]) -> None:
    state = destination / STATE_DIR_NAME
    releases = state / "releases"
    current = _current_release(state, releases)
    installed = {n: destination / n for n in RUNTIME_NAMES if _path_exists(destination / n)}
    installed_names = set(installed)
    if current is None and installed and installed_names not in (set(LEGACY_RUNTIME_NAMES), set(RUNTIME_NAMES)):
        raise InstallValidationError("legacy launcher set is partial")
    if any(not _valid_runtime_file(path) for path in installed.values()):
        raise InstallValidationError("installed launcher is invalid")
    if current is not None and any(
        _path_exists(current / name) and not _valid_runtime_file(current / name) for name in contents
    ):
        raise InstallValidationError("current release is invalid")


def _atomic_current(state: pathlib.Path, release: pathlib.Path) -> None:
    temporary = state / f".current.{release.name}"
    if _path_exists(temporary):
        temporary.unlink()
    os.symlink(f"releases/{release.name}", temporary)
    os.replace(temporary, state / "current")
    _fsync_directory(state)


def _install_launcher(destination: pathlib.Path, name: str, data: bytes) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{name}.", dir=destination)
    os.close(descriptor)
    temporary = pathlib.Path(temporary_name)
    try:
        _write_executable(temporary, data)
        os.replace(temporary, destination / name)
        _fsync_directory(destination)
    finally:
        if _path_exists(temporary):
            temporary.unlink()


def install(destination_root: str | None) -> int:
    artifacts = _artifacts()
    try:
        contents = {}
        for name, source in artifacts.items():
            if source.is_symlink() or not source.is_file() or not (source.stat().st_mode & 0o111):
                raise InstallValidationError("source is not executable")
            contents[name] = source.read_bytes()
            if not contents[name].startswith(b"#!"):
                raise InstallValidationError("source is not executable")
        destination = pathlib.Path(os.path.expanduser(destination_root or "~/.local/bin")).resolve()
        _preflight_install(destination, contents)
        destination.mkdir(parents=True, exist_ok=True)
        state = destination / STATE_DIR_NAME
        releases = state / "releases"
        state.mkdir(exist_ok=True)
        releases.mkdir(exist_ok=True)
        _fsync_directory(destination)
        _fsync_directory(state)
        release = pathlib.Path(tempfile.mkdtemp(prefix=".install-", dir=releases))
        for name, data in contents.items():
            _write_executable(release / name, data)
        _fsync_directory(release)
        _fsync_directory(releases)
        _atomic_current(state, release)
        for name in RUNTIME_NAMES:
            _install_launcher(destination, name, _stable_launcher(name))
    except (InstallValidationError, OSError, ValueError):
        print("install validation failed" if "contents" not in locals() else "install failed", file=sys.stderr)
        return 2
    return 0


def main() -> int:
    default = "reconcile" if pathlib.Path(sys.argv[0]).name == "symphony-grok-sidecar" else "probe"
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        nargs="?",
        choices=("probe", "reconcile", "install", "check-admission"),
        default=default,
    )
    parser.add_argument("identifier", nargs="?")
    parser.add_argument("--destination-root")
    args = parser.parse_args()
    if args.command == "install":
        return install(args.destination_root)
    if args.command == "reconcile":
        return reconcile()
    if args.command == "check-admission":
        if not args.identifier:
            print("check-admission requires an issue identifier", file=sys.stderr)
            return 2
        return check_admission(args.identifier)
    ready, _ = codex_canary_ready()
    print("no" if ready else "yes")
    return 1 if ready else 0


if __name__ == "__main__":
    sys.exit(main())
