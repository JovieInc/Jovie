#!/usr/bin/env python3
"""Fail-closed Codex readiness probe and reversible Symphony/Grok fallback."""

from __future__ import annotations

import argparse
import base64
import calendar
import fcntl
import hashlib
import json
import math
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
GROK_READY_MARKER = "GROK_MODEL_READY"
DEFAULT_ROTATE_BIN = "/home/timwhite/.local/bin/codex-rotate"
DEFAULT_STATE = "~/.codex-accounts/state.json"
DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_TIMEOUT_SECONDS = 30.0
DEFAULT_GROK_CANARY_TIMEOUT_SECONDS = 45.0
MAX_GROK_CANARY_TIMEOUT_SECONDS = 60.0
DEFAULT_GROK_SURVIVAL_SECONDS = 90.0
MAX_GROK_SURVIVAL_SECONDS = 120.0
CONTROL_TIMEOUT_SECONDS = 10.0
DEFAULT_GROK_MAX = 4  # Gem 16c/62GB safely runs 4 concurrent grok-ship workers (per-unit idempotent, active units skipped)
MAX_GROK_MAX = 10  # hard ceiling; 10 only via explicit SYMPHONY_GROK_MAX (free-tier Build quota / dispatch risk above 4)
STALE_REMOUNT_SECONDS = 90 * 60  # product remounts (JOV-5235) still grok at 54 min; 45 min would recycle live work
# Unlocked leftover JOV-*.lock files older than this cannot keep pickup idle.
# Held live implement/remount locks are never TTL-expired.
FALLBACK_LEASE_TTL_SECONDS = STALE_REMOUNT_SECONDS
FALLBACK_LEASE_DIR = "~/.local/state/symphony-fallback/leases"
# When Linear rate-limits the shared workspace key, every Linear call pauses
# for this long instead of stampeding the exhausted budget (JOV drain 2026-09-03).
LINEAR_BACKOFF_SECONDS = 15 * 60
FALLBACK_GC_SCHEMA = "symphony-fallback-lease-gc/v1"
FALLBACK_PICKUP_SCHEMA = "symphony-fallback-pickup/v1"
FALLBACK_LOCK_NAME = re.compile(r"^((?:JOV|LYB)-\d+)\.lock$")
TERMINAL_LOCK_STATES = frozenset(
    ("in review", "done", "canceled", "cancelled", "duplicate", "closed")
)
DONE_LOCK_STATES = frozenset(("done", "canceled", "cancelled", "duplicate", "closed"))
TYPED_PICKUP_REFUSE_REASONS = frozenset(
    (
        "open_pr_inflight",
        "issue_in_review",
        "issue_done",
        "issue_canceled",
        "issue_duplicate",
        "fallback_lease_held",
        "admission_unverifiable",
        "not_admitted",
        "grok_launch_failed",
        "lock_gc_unverifiable",
        "malformed_identifier",
        "capacity_full",
        "no_eligible_issue",
        "blocked",
        "state_not_admitted",
    )
)
# The upstream Elixir runtime is the sole owner of :4041 on Gem.  This
# recovery helper may observe/start only that unit; LogYourBody owns :4042 and
# is deliberately outside every recovery lifecycle.
PRIMARY_SERVICE = "symphony-elixir.service"
OPTIONAL_SERVICES: tuple[str, ...] = ()
SERVICES = (PRIMARY_SERVICE, *OPTIONAL_SERVICES)
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
    "cursor-agent-std",
    "model-router.py",
    "model-registry.json",
)
LAUNCHER_NAMES = (*LEGACY_RUNTIME_NAMES, "grok-ship-one", "cursor-agent-std")
# Labels are derived audit evidence, never independent admission blockers.
# The machine-written admission-gate/v1 receipt is the source of truth.
REQUIRED_ADMISSION_LABELS = frozenset()
ADMISSION_GATE_PREFIX = "<!-- admission-gate/v1 -->"
ADMISSION_GATE_SUFFIX = "<!--/admission-gate-->"
ADMISSION_GATE_SCHEMA = "admission-gate/v1"
# Single source of truth for the Grok sidecar admission predicate. `blocked` is
# included because human-review flags (needs-human / needs:human / blocked / hold)
# must gate out of auto-ship; reconcile and grok-ship-one both use this set.
BLOCKED_ADMISSION_LABELS = frozenset(
    (
        "human-review-required",
        "needs:human",
        "needs-human",
        "needs:decision",
        "needs-decision",
        "decision-required",
        "held",
        "hold",
        "manual-incident",
        "blocked",
        "no-symphony",
    )
)
SUPPORTED_TEAMS = frozenset(("JOV", "LYB"))

# Exit-status contract consumed by systemd: the versioned
# symphony-grok-sidecar.service declares SuccessExitStatus=0 2, so only the
# codes below classify how the oneshot unit lands.
#   EXIT_SAFE_FAIL_CLOSED (2): typed safe fail-closed exit. Runtime state was
#       preserved and verified (codex_readiness_indeterminate,
#       *_symphony_unchanged, grok_unchanged, symphony_restored). An expected
#       result that must NOT mark the unit failed.
#   EXIT_DEGRADED (3): a real controller failure — Symphony left stopped, Grok
#       ownership unknowable after a mutation, or restore/start failed. Must
#       keep failing the unit so the outage stays visible.
# check-admission and install keep their own separate exit-code contracts.
EXIT_SAFE_FAIL_CLOSED = 2
EXIT_DEGRADED = 3

# Linear pages are bounded; walk cursors until pageInfo.hasNextPage is false
# so admitted work past the first page is not hidden. Exceeding LINEAR_MAX_PAGES
# without a terminal page is treated as an incomplete listing (fail-closed).
LINEAR_PAGE_SIZE = 50
LINEAR_MAX_PAGES = 40

LINEAR_QUERY = """
query($first: Int!, $after: String) {
  issues(
    first: $first
    after: $after
    filter: {
      state: { name: { in: ["Todo", "In Progress", "In Review"] } }
    }
  ) {
    nodes {
      identifier title description updatedAt
      state { name }
      team { key }
      labels { nodes { name } }
      comments { nodes { body } }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""

SINGLE_ISSUE_QUERY = """
query($id: String!) {
  issue(id: $id) {
    id identifier title description url updatedAt
    state { id name }
    team { key states { nodes { id name } } }
    labels { nodes { name } }
    comments { nodes { body } }
  }
}
"""

# Admission must mirror the list query. In Review stays eligible so a CI-red
# autonomous PR can be remounted; launch still skips inflight green/pending PRs.
ADMITTED_STATES = frozenset(("todo", "in progress", "in review"))
# Already-claimed work (Symphony retrying In Review with no Codex slots) must
# keep flowing on the grok fallback after #16212 emptied the receipt list.
# Todo still requires a current admission-gate/v1 receipt.
CONTINUE_WITHOUT_RECEIPT_STATES = frozenset(("in progress", "in review"))
# symphony/grok/fallback heads are the autonomous lane's own; codex/fable/fugu
# heads are GPT-worker-authored. Failed or DIRTY GPT work is adopted by the
# grok/kimi fallback lane (Tim 2026-09-03: "allow the failed gpt ones to move
# to grok or kimi"). Codex-lane identifiers are lowercase in branch names.
AUTONOMOUS_HEAD_RE = re.compile(
    r"^(?:(?:symphony|grok|fallback)/((?:JOV|LYB)-\d+)-fix"
    r"|(?:codex|fable|fugu)/((?:jov|lyb)-\d+)(?:-.+)?)$"
)
FALLBACK_UNIT_RE = re.compile(
    r"^(?:fallback-ship|grok-ship)-((?:JOV|LYB)-\d+)(?:-[0-9a-f]{12})?\.service$"
)
GH_TIMEOUT_SECONDS = 20.0
JOV_REPO = "JovieInc/Jovie"
LYB_REPO = "JovieInc/LogYourBody"


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


def _bounded_seconds(name: str, default: float, maximum: float) -> float:
    try:
        value = float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return default if not math.isfinite(value) or value <= 0 else min(value, maximum)


def _grok_executable() -> str | None:
    configured = os.environ.get("GEM_GROK_BIN", "grok")
    if pathlib.Path(configured).is_absolute():
        return configured if os.access(configured, os.X_OK) else None
    return shutil.which(configured)


def _grok_canary_ready() -> tuple[bool, str]:
    """Prove the fallback provider can answer before releasing Symphony."""
    executable = _grok_executable()
    if executable is None:
        return False, "grok_provider_executable_missing"
    try:
        with tempfile.TemporaryDirectory(prefix="symphony-grok-canary-") as cwd:
            result = _captured(
                [
                    executable,
                    "--always-approve",
                    "--cwd",
                    cwd,
                    "-p",
                    f"Reply with exactly: {GROK_READY_MARKER}",
                ],
                _bounded_seconds(
                    "GEM_GROK_CANARY_TIMEOUT_SECONDS",
                    DEFAULT_GROK_CANARY_TIMEOUT_SECONDS,
                    MAX_GROK_CANARY_TIMEOUT_SECONDS,
                ),
            )
    except OSError:
        return False, "grok_provider_probe_failed"
    if result is None or result.returncode != 0:
        return False, "grok_provider_probe_failed"
    if not any(
        line == GROK_READY_MARKER
        for line in result.stdout.decode(errors="replace").splitlines()
    ):
        return False, "grok_provider_missing_ready_evidence"
    return True, "grok_provider_ready"


def _bundle_revision() -> str | None:
    try:
        digest = hashlib.sha256()
        for name in ("symphony-codex-exhausted.py", "model-router.py", "model-registry.json"):
            path = pathlib.Path(__file__).resolve().parent / name
            if name == "model-registry.json" and not path.is_file():
                path = path.parent / "config" / name
            digest.update(path.read_bytes())
        return digest.hexdigest()
    except OSError:
        return None


def _model_router_selection() -> tuple[dict | None, str]:
    root = pathlib.Path(__file__).resolve().parent
    router = root / "model-router.py"
    registry = root / "model-registry.json"
    if not registry.is_file():
        registry = root / "config" / "model-registry.json"
    if not router.is_file() or not registry.is_file():
        return None, "model_router_bundle_missing"
    env = os.environ.copy()
    env["GEM_MODEL_REGISTRY"] = str(registry)
    local_bin = str(pathlib.Path.home() / ".local/bin")
    env["PATH"] = f"{local_bin}:{env.get('PATH', '/usr/bin:/bin')}"
    grok_exe = _grok_executable()
    if grok_exe:
        env.setdefault("GEM_GROK_EXECUTABLE", grok_exe)
        env.setdefault("GEM_GROK_BIN", grok_exe)
    try:
        result = subprocess.run(
            [sys.executable, str(router), "choose", "--workflow", "new_pr", "--capability", "code", "--exclude-pool", "codex"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=CONTROL_TIMEOUT_SECONDS,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None, "model_router_failed"
    try:
        payload = json.loads(result.stdout)
        selected = payload["selected"]
        executor = selected["executor"]
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None, "model_router_invalid"
    if (
        result.returncode != 0
        or payload.get("schema_version") != 1
        or payload.get("deterministic_first") is not True
        or selected.get("provider") == "codex"
        or not isinstance(selected.get("id"), str)
        or not isinstance(selected.get("model"), str)
        or not isinstance(executor, dict)
        or not isinstance(executor.get("executable"), str)
        or not isinstance(executor.get("argv"), list)
        or not all(isinstance(value, str) for value in executor["argv"])
    ):
        return None, "model_router_no_fallback"
    executable = executor["executable"]
    resolved = executable if pathlib.Path(executable).is_absolute() else shutil.which(executable)
    if not resolved or not os.access(resolved, os.X_OK):
        return None, "model_router_executor_missing"
    executor["executable"] = resolved
    return payload, "model_router_ready"


def _fleet_gate_allows_isolated() -> tuple[bool, str]:
    path = pathlib.Path(
        os.path.expanduser(
            os.environ.get(
                "GEM_FLEET_GATE_RECEIPT",
                "/home/timwhite/gem-workspace/state/gem-priority-gate/latest.json",
            )
        )
    )
    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return False, "fleet_gate_unavailable"
    state = receipt.get("state")
    if receipt.get("schema") != "jovie-fleet-gate/v1" or state not in ("GREEN", "AMBER", "RED"):
        return False, "fleet_gate_invalid"
    if state == "RED":
        return False, "fleet_gate_red"
    admission = receipt.get("workAdmission")
    if not isinstance(admission, dict) or admission.get("allowed") is not True:
        return False, "isolated_work_not_allowed"
    return True, f"fleet_gate_{state.lower()}"


def _grok_units_after_survival_window() -> list[str] | None:
    time.sleep(
        _bounded_seconds(
            "SYMPHONY_GROK_SURVIVAL_SECONDS",
            DEFAULT_GROK_SURVIVAL_SECONDS,
            MAX_GROK_SURVIVAL_SECONDS,
        )
    )
    return _active_grok_units()


def _read_state() -> dict | None:
    if not _known_account_state():
        return None
    try:
        return json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return None


def _configured_accounts() -> set[str] | None:
    """Return the exact account set codex-rotate considers runnable."""
    try:
        return {
            path.name
            for path in _state_path().parent.iterdir()
            if path.is_dir() and (path / "auth.json").is_file()
        }
    except OSError:
        return None


def _all_accounts_on_cooldown(state: dict, accounts: set[str], now: int) -> bool:
    """True only when every configured account has a valid future cooldown."""
    if not accounts:
        return False
    cooldowns = state.get("cooldowns") or {}
    for account in accounts:
        raw = cooldowns.get(account)
        try:
            until = int(raw)
        except (TypeError, ValueError):
            return False
        if until <= now:
            return False
    return True


def codex_canary_ready() -> tuple[bool, str]:
    # Primary signal: codex-rotate's cooldown state, which matches the live
    # provider 429s. The live probe through codex-rotate is NOT trusted for the
    # exhausted verdict: codex-rotate may answer via its kimi fallback even when
    # every Codex account is capped, which would report ready and keep Symphony
    # thrashing instead of launching the Grok sidecar.
    state = _read_state()
    if state is None:
        return False, "unknown_state"
    accounts = _configured_accounts()
    if accounts is None:
        return False, "unknown_accounts"
    if _all_accounts_on_cooldown(state, accounts, int(time.time())):
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


def _jov_active() -> bool:
    """JOV dispatch does not depend on the optional LYB worker remaining up."""
    return _control(_systemctl("is-active", "--quiet", PRIMARY_SERVICE))


def _start_jov_primary() -> bool:
    started = _control(_systemctl("start", PRIMARY_SERVICE))
    for service in OPTIONAL_SERVICES:
        _control(_systemctl("start", service))
    return started


def _services_active() -> bool:
    """JOV official Symphony is the required owner. LYB is best-effort."""
    return _jov_active()


def _active_grok_units() -> list[str] | None:
    result = _captured(
        _systemctl(
            "list-units",
            "--type=service",
            "--state=active",
            "grok-ship-*.service",
            "fallback-ship-*.service",
            "--no-legend",
            "--no-pager",
        ),
        CONTROL_TIMEOUT_SECONDS,
    )
    if result is None or result.returncode != 0:
        return None
    decoded = result.stdout.decode(errors="replace")
    return [line.split()[0] for line in decoded.splitlines() if line.strip()]


def _unit_not_loaded(unit: str) -> bool:
    result = _captured(
        _systemctl("show", "--property=LoadState", "--value", unit),
        CONTROL_TIMEOUT_SECONDS,
    )
    return (
        result is not None
        and result.returncode == 0
        and result.stdout.decode(errors="replace").strip() == "not-found"
    )


def _cleanup_launched_units(units: set[str]) -> bool:
    stopped = _control(_systemctl("stop", *sorted(units))) or all(
        _unit_not_loaded(unit) for unit in units
    )
    active = _active_grok_units()
    return stopped and active is not None and not units.intersection(active)


def _identifier_from_unit(unit: str) -> str | None:
    match = FALLBACK_UNIT_RE.fullmatch(unit)
    return match.group(1) if match else None


def _parse_systemd_wall_clock(raw: str) -> float | None:
    """Parse `systemctl show` ExecMainStartTimestamp.

    Live Gem user systemd prints `Wed 2026-08-19 23:23:53 UTC` and does not
    expose ExecMainStartTimestampUSec. USec-only age was always None, so
    stale remount recycle never stopped JOV-5220 (held 2h+).
    """
    raw = raw.strip()
    if not raw or raw in {"n/a", "0"}:
        return None
    parts = raw.split()
    if len(parts) >= 4 and parts[0][:1].isalpha():
        stamp, zone = f"{parts[1]} {parts[2]}", parts[3]
    elif len(parts) >= 3:
        stamp, zone = f"{parts[0]} {parts[1]}", parts[2]
    else:
        return None
    if zone not in {"UTC", "GMT", "Z"}:
        return None
    try:
        parsed = time.strptime(stamp, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return float(calendar.timegm(parsed))


def _unit_age_seconds(unit: str) -> float | None:
    result = _captured(
        _systemctl(
            "show",
            "--property=ExecMainStartTimestampUSec,ExecMainStartTimestamp",
            unit,
        ),
        CONTROL_TIMEOUT_SECONDS,
    )
    if result is None or result.returncode != 0:
        return None
    usec: int | None = None
    wall: str | None = None
    for line in result.stdout.decode(errors="replace").splitlines():
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if key == "ExecMainStartTimestampUSec" and value.isdigit():
            usec = int(value)
        elif key == "ExecMainStartTimestamp" and value:
            wall = value
    now = time.time()
    if usec is not None:
        age = now - usec / 1_000_000
        return age if age >= 0 else None
    if wall:
        started = _parse_systemd_wall_clock(wall)
        if started is None:
            return None
        age = now - started
        return age if age >= 0 else None
    return None


def _recycle_stale_remount_units(
    active: list[str], open_prs: dict[str, dict]
) -> list[str]:
    """Stop leftover remount units that still have a DIRTY/CONFLICTING head.

    Live JOV-5220 held fallback-ship for 90+ min after main moved, so sidecar
    skipped a fresh changelog remount (`grok_started=0 grok_survived=2`).
    """
    kept: list[str] = []
    for unit in active:
        ident = _identifier_from_unit(unit)
        if ident is None:
            kept.append(unit)
            continue
        verdict, _pr = _open_pr_verdict(ident, open_prs)
        if verdict != "remount":
            kept.append(unit)
            continue
        age = _unit_age_seconds(unit)
        if age is None or age < STALE_REMOUNT_SECONDS:
            kept.append(unit)
            continue
        if not _control(_systemctl("stop", unit)):
            print(
                f"fallback skip {ident} stale_remount_stop_failed",
                file=sys.stderr,
                flush=True,
            )
            kept.append(unit)
            continue
        print(
            f"fallback stop {ident} stale_remount age_s={int(age)}",
            file=sys.stderr,
            flush=True,
        )
    return kept


def _grok_ship_one_executable() -> str | None:
    executable = pathlib.Path.home() / ".local/bin/grok-ship-one"
    return str(executable) if executable.is_file() and os.access(executable, os.X_OK) else None


def _oidc_seat(entry: object) -> bool:
    if not isinstance(entry, dict):
        return False
    return bool(entry.get("refresh_token") or entry.get("key") or entry.get("access_token"))


def _grok_oauth_seats() -> int | None:
    path = pathlib.Path.home() / ".grok" / "auth.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    return sum(1 for entry in payload.values() if _oidc_seat(entry))


def _kimi_oauth_seats() -> int | None:
    path = pathlib.Path.home() / ".kimi-code" / "credentials" / "kimi-code.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return None
    return 1 if _oidc_seat(payload) else 0


def _live_oauth_seats() -> int | None:
    grok = _grok_oauth_seats()
    kimi = _kimi_oauth_seats()
    if grok is None and kimi is None:
        return None
    return (grok or 0) + (kimi or 0)


def _grok_limit() -> int:
    raw = os.environ.get("SYMPHONY_GROK_MAX")
    if raw is not None:
        try:
            return max(0, min(int(raw), MAX_GROK_MAX))
        except (TypeError, ValueError):
            return DEFAULT_GROK_MAX
    seats = _live_oauth_seats()
    if seats is None or seats <= 0:
        # Missing Grok/Kimi files, or Codex-only exhaustion, must not serial-pin.
        return DEFAULT_GROK_MAX
    return max(1, min(MAX_GROK_MAX, max(DEFAULT_GROK_MAX, seats)))


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


def _issue_revision(identifier: str, title: str, description: str) -> str:
    canonical = f"{identifier or ''}\n{(title or '').strip()}\n{(description or '').strip()}"
    return hashlib.sha256(canonical.encode()).hexdigest()[:24]


def _comment_bodies(comments: object) -> list[str]:
    if isinstance(comments, list):
        nodes = comments
    elif isinstance(comments, dict):
        nodes = comments.get("nodes")
        if not isinstance(nodes, list):
            return []
    else:
        return []
    bodies: list[str] = []
    for comment in nodes:
        if isinstance(comment, str):
            bodies.append(comment)
        elif isinstance(comment, dict) and isinstance(comment.get("body"), str):
            bodies.append(comment["body"])
    return bodies


def admission_receipt(identifier: str, title: str, description: str, comments: object) -> dict | None:
    """Return the current revision-scoped admission-gate/v1 receipt, or None."""
    prefix = f"{ADMISSION_GATE_PREFIX}\n"
    suffix = f"\n{ADMISSION_GATE_SUFFIX}"
    for body in reversed(_comment_bodies(comments)):
        if not (body.startswith(prefix) and body.endswith(suffix)):
            continue
        try:
            payload = json.loads(body[len(prefix) : -len(suffix)])
        except (TypeError, ValueError):
            return None
        if (
            not isinstance(payload, dict)
            or payload.get("schema") != ADMISSION_GATE_SCHEMA
            or payload.get("issue") != identifier
            or payload.get("decision") != "approved"
            or not isinstance(payload.get("fingerprint"), str)
            or not payload.get("fingerprint")
            or payload.get("issueRevision") != _issue_revision(identifier, title, description)
        ):
            return None
        return payload
    return None


def admission_decision(
    team_key: str,
    identifier: str,
    labels: set[str],
    title: str = "",
    description: str = "",
    comments: object = None,
) -> tuple[bool, str]:
    """Single admission predicate shared by reconcile listing, reconcile
    pre-launch verification, and grok-ship-one's check-admission command.

    An issue is admitted only when a current admission-gate/v1 receipt matches
    this revision and no blocked/human-review label is present. Labels are
    derived audit evidence, never a second waitlist.
    """
    if not IDENTIFIER.fullmatch(identifier):
        return False, "invalid_identifier"
    if team_key.upper() not in SUPPORTED_TEAMS:
        return False, "unsupported_team"
    if REQUIRED_ADMISSION_LABELS and not REQUIRED_ADMISSION_LABELS.issubset(labels):
        return False, "missing_admission_labels"
    if not BLOCKED_ADMISSION_LABELS.isdisjoint(labels):
        return False, "blocked"
    if admission_receipt(identifier, title, description, comments) is None:
        return False, "admission_receipt_missing_or_stale"
    return True, "admitted"


def _linear_issues_list_request(after: str | None = None) -> dict:
    variables: dict[str, int | str | None] = {"first": LINEAR_PAGE_SIZE}
    if after is not None:
        variables["after"] = after
    return {"query": LINEAR_QUERY, "variables": variables}


def _linear_backoff_path() -> pathlib.Path:
    return pathlib.Path(
        os.path.expanduser(
            os.environ.get(
                "SYMPHONY_LINEAR_BACKOFF",
                "~/.local/state/symphony-fallback/linear-backoff.json",
            )
        )
    )


def _linear_backoff_active() -> bool:
    try:
        data = json.loads(_linear_backoff_path().read_text(encoding="utf-8"))
        stamped = float(data.get("epoch", 0))
    except (OSError, ValueError, TypeError):
        return False
    return (time.time() - stamped) < LINEAR_BACKOFF_SECONDS


def _linear_note_ratelimited() -> None:
    path = _linear_backoff_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"epoch": time.time()}), encoding="utf-8")
    except OSError:
        pass


def _linear_clear_backoff() -> None:
    try:
        _linear_backoff_path().unlink(missing_ok=True)
    except OSError:
        pass


def _linear_graphql(payload: dict) -> dict | None:
    # A ratelimited shared Linear budget must not be stampeded by the timer
    # loop: while a backoff stamp is fresh, skip the network entirely (every
    # caller already fails closed on None).
    if _linear_backoff_active():
        return None
    key = os.environ.get("LINEAR_API_KEY") or _linear_api_key_from_file()
    if not key:
        return None
    request = urllib.request.Request(
        os.environ.get("LINEAR_API_URL", LINEAR_API),
        data=json.dumps(payload).encode(),
        headers={"Authorization": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=CONTROL_TIMEOUT_SECONDS) as response:
            body = json.load(response)
    except urllib.error.HTTPError as exc:
        # Linear signals rate limiting as HTTP 400/429 with a RATELIMITED code
        # in the error body (observed live 2026-09-03: 2500 req/hr exhausted on
        # Gem, every worker died on admission re-verify).
        try:
            detail = exc.read().decode("utf-8", "replace")
        except (OSError, ValueError):
            detail = ""
        if exc.code == 429 or "RATELIMITED" in detail:
            _linear_note_ratelimited()
        return None
    except (OSError, ValueError, TypeError, urllib.error.URLError):
        return None
    _linear_clear_backoff()
    return body if isinstance(body, dict) else None


def _admitted_issue_identifier(node: object) -> str | None:
    if not isinstance(node, dict) or not isinstance(node.get("identifier"), str):
        raise ValueError("malformed issue node")
    team = node.get("team")
    label_connection = node.get("labels")
    if not isinstance(team, dict) or not isinstance(label_connection, dict):
        raise ValueError("malformed issue node")
    team_key = team.get("key")
    label_nodes = label_connection.get("nodes")
    if not isinstance(team_key, str) or not isinstance(label_nodes, list):
        raise ValueError("malformed issue node")
    labels: set[str] = set()
    for label in label_nodes:
        if not isinstance(label, dict) or not isinstance(label.get("name"), str):
            raise ValueError("malformed issue node")
        labels.add(label["name"].strip().lower())
    identifier = node["identifier"]
    title = node.get("title") if isinstance(node.get("title"), str) else ""
    description = node.get("description") if isinstance(node.get("description"), str) else ""
    ok, reason = admission_decision(
        team_key,
        identifier,
        labels,
        title=title,
        description=description,
        comments=node.get("comments"),
    )
    if ok:
        return identifier
    if reason == "admission_receipt_missing_or_stale" and _continue_without_receipt(node):
        return identifier
    return None


def _continue_without_receipt(issue: dict) -> bool:
    """In Progress/In Review already left Todo; skip a missing receipt."""
    state = issue.get("state")
    if not isinstance(state, dict):
        return False
    return str(state.get("name") or "").strip().lower() in CONTINUE_WITHOUT_RECEIPT_STATES


def _linear_identifiers() -> list[str] | None:
    identifiers: list[str] = []
    after: str | None = None
    for _ in range(LINEAR_MAX_PAGES):
        payload = _linear_graphql(_linear_issues_list_request(after))
        if payload is None or payload.get("errors"):
            return None
        try:
            issues = payload["data"]["issues"]
            nodes = issues["nodes"]
            page_info = issues["pageInfo"]
        except (KeyError, TypeError):
            return None
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            return None
        has_next = page_info.get("hasNextPage")
        if not isinstance(has_next, bool):
            return None
        for node in nodes:
            try:
                identifier = _admitted_issue_identifier(node)
            except ValueError:
                return None
            if identifier is not None and identifier not in identifiers:
                identifiers.append(identifier)
        if not has_next:
            return identifiers
        end_cursor = page_info.get("endCursor")
        if not isinstance(end_cursor, str) or not end_cursor or end_cursor == after:
            return None
        after = end_cursor
    return None


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


def _issue_meta(
    issue: dict, identifier: str, *, require_receipt: bool = True, remount: bool = False
) -> tuple[bool, str, dict | None]:
    """Validate one issue against the shared admission predicate and, when
    admitted, produce the meta record grok-ship-one needs to run.

    Remount of an existing DIRTY/BEHIND/CI-red autonomous PR skips the
    admission-gate/v1 receipt: that work already left Linear and is sitting
    on GitHub. New pickup still requires a current receipt. Blocked/human
    labels still refuse both paths.
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
    title = issue.get("title") if isinstance(issue.get("title"), str) else ""
    description = issue.get("description") if isinstance(issue.get("description"), str) else ""
    if require_receipt:
        ok, reason = admission_decision(
            team_key,
            identifier,
            labels,
            title=title,
            description=description,
            comments=issue.get("comments"),
        )
        if not ok:
            return False, reason, None
    else:
        if not IDENTIFIER.fullmatch(identifier):
            return False, "invalid_identifier", None
        if team_key.upper() not in SUPPORTED_TEAMS:
            return False, "unsupported_team", None
        if not BLOCKED_ADMISSION_LABELS.isdisjoint(labels):
            return False, "blocked", None
    if issue["identifier"] != identifier:
        return False, "identifier_mismatch", None
    state_name = str(state.get("name") or "").strip().lower()
    if state_name not in ADMITTED_STATES:
        # Remount continues an existing open autonomous PR on GitHub. Linear
        # reading done/closed while that PR is still open and unmerged is a
        # state-sync error (e.g. linear-sync marked the issue Done on a partial
        # sibling merge), not proof the work finished. Canceled/duplicate stay
        # refused: those are deliberate kills.
        if not (remount and state_name in {"done", "closed"}):
            return False, "state_not_admitted", None
    state_nodes = team.get("states")
    states: dict[str, str] = {}
    if isinstance(state_nodes, dict) and isinstance(state_nodes.get("nodes"), list):
        for node in state_nodes["nodes"]:
            if isinstance(node, dict) and isinstance(node.get("name"), str):
                states[node["name"].strip().lower()] = str(node.get("id") or "")
    if not states.get("in progress") or not states.get("in review"):
        return False, "required_workflow_states_missing", None
    issue_revision = issue.get("updatedAt")
    if not isinstance(issue_revision, str) or not issue_revision.strip():
        return False, "issue_revision_missing", None
    meta = {
        "id": issue.get("id"),
        "title": issue.get("title") or identifier,
        "description": (issue.get("description") or "")[:6000],
        "url": issue.get("url") or "",
        "original_state_id": state.get("id"),
        "original_state_name": state.get("name") or "",
        "in_progress_state_id": states["in progress"],
        "in_review_state_id": states["in review"],
        "issue_revision": issue_revision,
    }
    return True, "admitted", meta


def check_admission(identifier: str, *, remount: bool = False) -> int:
    """Standalone admission gate: exit 0 + meta JSON on stdout when the issue
    passes the SAME predicate reconcile uses; exit 1 when not admitted; exit 2
    when the verdict cannot be verified (auth/transport). grok-ship-one
    delegates to this so there is exactly one admission source of truth.

    remount=True skips the admission-gate/v1 receipt so a DIRTY/CI-red
    autonomous head can continue after the receipt list went empty.
    """
    issue = _fetch_single_issue(identifier)
    if issue is None:
        print("not admitted:admission_unverifiable", file=sys.stderr)
        return 2
    ok, reason, meta = _issue_meta(
        issue,
        identifier,
        require_receipt=not remount and not _continue_without_receipt(issue),
        remount=remount,
    )
    if not ok:
        print(f"not admitted:{reason}", file=sys.stderr)
        return 1
    print(json.dumps(meta))
    return 0


def _fallback_unit(identifier: str, issue_revision: str) -> str:
    revision = hashlib.sha256(issue_revision.encode()).hexdigest()[:12]
    return f"fallback-ship-{identifier}-{revision}"


def _repo_for_identifier(identifier: str) -> str | None:
    if identifier.startswith("JOV-"):
        return JOV_REPO
    if identifier.startswith("LYB-"):
        return LYB_REPO
    return None


def _gh_json(command: list[str]) -> object | None:
    result = _captured(command, GH_TIMEOUT_SECONDS)
    if result is None or result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout.decode())
    except ValueError:
        return None


def _autonomous_open_pr_index(identifiers: list[str] | None = None) -> dict[str, dict]:
    """Map identifier -> {number, head, repo} for open autonomous heads.

    identifiers=None lists every matching symphony/grok/fallback head so a
    remount scan can find DIRTY work even when Linear's receipt list is empty.
    Listing failure is fail-open (empty): better to risk a duplicate than to
    starve leftover Todo work because `gh` blipped.
    """
    # Unit tests set SYMPHONY_OPEN_PR_INDEX=empty so reconcile never calls live gh.
    if os.environ.get("SYMPHONY_OPEN_PR_INDEX") == "empty":
        return {}
    index: dict[str, dict] = {}
    wanted = set(identifiers) if identifiers is not None else None
    if wanted is not None:
        repos = {repo for ident in identifiers if (repo := _repo_for_identifier(ident))}
        if not repos:
            return {}
    else:
        repos = {JOV_REPO, LYB_REPO}
    for repo in repos:
        payload = _gh_json(
            [
                "gh",
                "pr",
                "list",
                "--repo",
                repo,
                "--state",
                "open",
                "--limit",
                "100",
                "--json",
                "number,headRefName,mergeStateStatus,mergeable",
            ]
        )
        if not isinstance(payload, list):
            continue
        for pr in payload:
            if not isinstance(pr, dict):
                continue
            head = pr.get("headRefName") or ""
            if not isinstance(head, str):
                continue
            match = AUTONOMOUS_HEAD_RE.fullmatch(head)
            if match is None:
                continue
            # Group 2 covers the lowercase codex-lane identifier; normalize to
            # the canonical JOV-/LYB- form used everywhere downstream.
            ident = (match.group(1) or match.group(2)).upper()
            if wanted is not None and ident not in wanted:
                continue
            if ident not in index:
                index[ident] = {
                    "number": pr.get("number"),
                    "head": head,
                    "repo": repo,
                    "mergeStateStatus": pr.get("mergeStateStatus"),
                    "mergeable": pr.get("mergeable"),
                }
    return index


def _github_remount_identifiers() -> list[str]:
    """Identifiers whose open autonomous PR is DIRTY, BEHIND, or product-CI red."""
    index = _autonomous_open_pr_index(None)
    remounts: list[str] = []
    for ident in index:
        verdict, _pr = _open_pr_verdict(ident, index)
        if verdict == "remount" and ident not in remounts:
            remounts.append(ident)
    return remounts


def _admitted_or_remount_identifiers() -> list[str] | None:
    """Union Linear receipt-admitted issues with GitHub remount heads.

    After #16212, a fleet with no current admission-gate/v1 receipts returns
    an empty Linear list even while DIRTY grok/JOV PRs still need remount
    (live: no_admitted_work while #16211 sat DIRTY). Remount identifiers
    recover that work. Linear query failure with zero remounts stays
    fail-closed.
    """
    identifiers = _linear_identifiers()
    remounts = _github_remount_identifiers()
    if identifiers is None and not remounts:
        return None
    combined: list[str] = []
    for ident in remounts + (identifiers or []):
        if ident not in combined:
            combined.append(ident)
    return combined


_REMOUNT_IGNORE_FAILURES = frozenset({"enroll", "PR Ready"})


def _pr_has_failing_check(repo: str, number: int) -> bool:
    payload = _gh_json(
        ["gh", "pr", "view", str(number), "--repo", repo, "--json", "statusCheckRollup"]
    )
    if not isinstance(payload, dict):
        return False
    checks = payload.get("statusCheckRollup") or []
    if not isinstance(checks, list):
        return False
    pending = False
    failing = False
    for check in checks:
        if not isinstance(check, dict):
            continue
        name = str(check.get("name") or "")
        status = str(check.get("status") or "").upper()
        if status in {"IN_PROGRESS", "QUEUED", "PENDING"}:
            pending = True
            continue
        if name in _REMOUNT_IGNORE_FAILURES:
            continue
        if check.get("conclusion") == "FAILURE" or check.get("state") == "FAILURE":
            failing = True
    # Pending CI after a remount push is not a product failure. Remounting
    # again fights the in-flight checks (live #16211 at 20:17).
    return failing and not pending


def _open_pr_verdict(identifier: str, index: dict[str, dict]) -> tuple[str, dict | None]:
    """Return (none|skip|remount, pr). skip = inflight green/pending open PR."""
    pr = index.get(identifier)
    if pr is None:
        return "none", None
    repo = pr.get("repo")
    number = pr.get("number")
    if not isinstance(repo, str) or not isinstance(number, int):
        return "skip", pr
    status = str(pr.get("mergeStateStatus") or "").upper()
    mergeable = str(pr.get("mergeable") or "").upper()
    # CLEAN heads are already merge-queue eligible. Remounting them fights
    # github-merge-queue and can knock a green autonomous PR out of the queue.
    if status == "CLEAN" and mergeable != "CONFLICTING":
        return "skip", pr
    # DIRTY/BEHIND after a sibling merge is not product-CI-red, but the head
    # cannot enroll until it merges main. Live #16211 was skipped as inflight
    # after #16212 landed (sidecar: open_pr_inflight). CONFLICTING covers
    # merge-queue UNMERGEABLE (mergeStateStatus often UNKNOWN) after a
    # sibling CHANGELOG land (#16229 vs #16243).
    if status in {"DIRTY", "BEHIND"} or mergeable == "CONFLICTING":
        return "remount", pr
    if _pr_has_failing_check(repo, number):
        return "remount", pr
    return "skip", pr


def open_pr_verdict_command(identifier: str) -> int:
    """CLI for grok-ship-one: JSON {verdict, number?, head?} on stdout."""
    if not IDENTIFIER.fullmatch(identifier):
        print("open-pr-verdict:malformed_identifier", file=sys.stderr)
        return 2
    index = _autonomous_open_pr_index([identifier])
    verdict, pr = _open_pr_verdict(identifier, index)
    payload: dict = {"verdict": verdict}
    if pr is not None:
        payload["number"] = pr.get("number")
        payload["head"] = pr.get("head")
        payload["repo"] = pr.get("repo")
        payload["mergeStateStatus"] = pr.get("mergeStateStatus")
    print(json.dumps(payload))
    return 0


def _fallback_lease_dir() -> pathlib.Path:
    return pathlib.Path(
        os.path.expanduser(os.environ.get("SYMPHONY_FALLBACK_LEASE_DIR", FALLBACK_LEASE_DIR))
    )


def _fallback_gc_receipt_path() -> pathlib.Path:
    configured = os.environ.get("SYMPHONY_FALLBACK_GC_RECEIPT")
    if configured:
        return pathlib.Path(os.path.expanduser(configured))
    return _fallback_lease_dir().parent / "gc" / "latest.json"


def _fallback_pickup_receipt_path() -> pathlib.Path:
    configured = os.environ.get("SYMPHONY_FALLBACK_PICKUP_RECEIPT")
    if configured:
        return pathlib.Path(os.path.expanduser(configured))
    return _fallback_lease_dir().parent / "pickup" / "latest.json"


def _write_json_atomic(path: pathlib.Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _iter_fallback_locks() -> list[pathlib.Path]:
    directory = _fallback_lease_dir()
    try:
        entries = list(directory.iterdir())
    except FileNotFoundError:
        return []
    locks: list[pathlib.Path] = []
    for path in entries:
        if path.is_file() and FALLBACK_LOCK_NAME.fullmatch(path.name):
            locks.append(path)
    return sorted(locks)


def _fallback_lock_count() -> int | None:
    try:
        return len(_iter_fallback_locks())
    except OSError:
        return None


def _lock_identifier(path: pathlib.Path) -> str | None:
    match = FALLBACK_LOCK_NAME.fullmatch(path.name)
    return match.group(1) if match else None


def _lock_held(path: pathlib.Path) -> bool | None:
    """True when another process holds the exclusive flock. None if unreadable."""
    try:
        descriptor = os.open(path, os.O_RDWR)
    except FileNotFoundError:
        return False
    except OSError:
        return None
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return True
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        return False
    finally:
        os.close(descriptor)


def _lock_age_seconds(path: pathlib.Path, now: float) -> float | None:
    try:
        age = now - path.stat().st_mtime
    except OSError:
        return None
    return age if age >= 0 else None


def expire_fallback_lock_decision(
    *,
    held: bool | None,
    state_name: str | None,
    pr_verdict: str | None,
    age_seconds: float | None,
    ttl_seconds: float = FALLBACK_LEASE_TTL_SECONDS,
) -> tuple[str, str]:
    """Pure GC verdict: expire | keep | unknown, plus a typed reason."""
    if held is None:
        return "unknown", "lock_held_unverified"
    if pr_verdict == "skip":
        return "expire", "open_pr_inflight"
    state = (state_name or "").strip().lower()
    if state in DONE_LOCK_STATES:
        # A live remount of a done/closed issue keeps its lease: the open
        # DIRTY/CI-red PR proves the work never landed, and expiring the lock
        # mid-remount would admit a second writer. Canceled/duplicate locks
        # still expire — those are deliberate kills.
        if held and pr_verdict == "remount" and state in {"done", "closed"}:
            return "keep", "live_remount"
        return "expire", {
            "done": "issue_done",
            "closed": "issue_done",
            "canceled": "issue_canceled",
            "cancelled": "issue_canceled",
            "duplicate": "issue_duplicate",
        }[state]
    if state == "in review" and pr_verdict != "remount":
        return "expire", "issue_in_review"
    if held and pr_verdict == "remount":
        return "keep", "live_remount"
    if held and state in {"todo", "in progress"}:
        return "keep", "live_holder"
    if not held:
        if age_seconds is not None and age_seconds > ttl_seconds:
            return "expire", "ttl_expired"
        if age_seconds is None and state_name is None and pr_verdict is None:
            return "unknown", "lock_age_unverified"
        return "keep", "ttl_unexpired"
    if state_name is None and pr_verdict is None:
        return "unknown", "lock_owner_unverified"
    if state == "in review":
        return "expire", "issue_in_review"
    return "keep", "live_holder"


def _issue_state_name(issue: dict | None) -> str | None:
    if not isinstance(issue, dict):
        return None
    state = issue.get("state")
    if not isinstance(state, dict) or not isinstance(state.get("name"), str):
        return None
    return state["name"]


def _typed_pickup_reason(reason: str) -> tuple[str, bool]:
    """Unknown refuse reasons are red."""
    if reason in TYPED_PICKUP_REFUSE_REASONS:
        return reason, False
    return "unknown", True


def _emit_pickup(
    event: str,
    *,
    reason: str | None = None,
    identifier: str | None = None,
    lock_count: int | None = None,
    next_issue: str | None = None,
) -> dict:
    typed_reason = reason
    red = False
    if event == "refuse":
        typed_reason, red = _typed_pickup_reason(reason or "")
        if red:
            event = "red"
    if event == "red":
        typed_reason, _ = _typed_pickup_reason(reason or "unknown")
        if typed_reason != "unknown":
            typed_reason = "unknown"
        red = True
    count_text = "unknown" if lock_count is None else str(lock_count)
    next_text = next_issue or ""
    ident_text = identifier or ""
    reason_text = typed_reason or ""
    line = (
        f"pickup schema={FALLBACK_PICKUP_SCHEMA} event={event}"
        f" identifier={ident_text} reason={reason_text}"
        f" lock_count={count_text} next={next_text}"
    )
    print(line, file=sys.stderr, flush=True)
    receipt = {
        "schema": FALLBACK_PICKUP_SCHEMA,
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event": event,
        "identifier": identifier,
        "reason": typed_reason,
        "lockCount": lock_count,
        "nextEligibleIssue": next_issue or None,
        "red": red,
    }
    try:
        _write_json_atomic(_fallback_pickup_receipt_path(), receipt)
    except OSError:
        pass
    return receipt


def gc_fallback_locks(
    *,
    open_prs: dict[str, dict] | None = None,
    now: float | None = None,
    fetch_issue=None,
) -> dict:
    """Expire leftover fallback locks that can permanently own pickup.

    Unlink is the only mutation. Live implement/remount holders are kept.
    Missing observations fail closed (keep the file).
    """
    observed = time.time() if now is None else now
    fetch = fetch_issue or _fetch_single_issue
    expired: list[dict] = []
    kept: list[dict] = []
    unknown: list[dict] = []
    try:
        locks = _iter_fallback_locks()
    except OSError:
        receipt = {
            "schema": FALLBACK_GC_SCHEMA,
            "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(observed)),
            "ttlSeconds": FALLBACK_LEASE_TTL_SECONDS,
            "lockCountBefore": None,
            "lockCountAfter": None,
            "expired": [],
            "kept": [],
            "unknown": [{"reason": "lock_dir_unreadable"}],
            "red": True,
        }
        print(
            f"pickup schema={FALLBACK_PICKUP_SCHEMA} event=red identifier= reason=lock_gc_unverifiable"
            f" lock_count=unknown next=",
            file=sys.stderr,
            flush=True,
        )
        return receipt
    if locks and open_prs is None:
        open_prs = _autonomous_open_pr_index(None)
    if open_prs is None:
        open_prs = {}
    for path in locks:
        identifier = _lock_identifier(path)
        if identifier is None:
            unknown.append({"path": path.name, "reason": "malformed_lock"})
            continue
        held = _lock_held(path)
        age = _lock_age_seconds(path, observed)
        verdict, _pr = _open_pr_verdict(identifier, open_prs)
        # Skip Linear when TTL or an inflight PR already proves the lock is stale.
        state_name = None
        needs_issue = not (
            verdict == "skip" or (held is False and age is not None and age > FALLBACK_LEASE_TTL_SECONDS)
        )
        if needs_issue:
            state_name = _issue_state_name(fetch(identifier))
        action, reason = expire_fallback_lock_decision(
            held=held,
            state_name=state_name,
            pr_verdict=verdict,
            age_seconds=age,
        )
        record = {"identifier": identifier, "reason": reason, "held": held, "ageSeconds": None if age is None else int(age)}
        if action == "expire":
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                unknown.append({**record, "reason": "lock_unlink_failed"})
                continue
            expired.append(record)
            continue
        if action == "unknown":
            unknown.append(record)
            continue
        kept.append(record)
    after = _fallback_lock_count()
    receipt = {
        "schema": FALLBACK_GC_SCHEMA,
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(observed)),
        "ttlSeconds": FALLBACK_LEASE_TTL_SECONDS,
        "lockCountBefore": len(locks),
        "lockCountAfter": after,
        "expired": expired,
        "kept": kept,
        "unknown": unknown,
        "red": bool(unknown),
    }
    try:
        _write_json_atomic(_fallback_gc_receipt_path(), receipt)
    except OSError:
        pass
    print(
        f"fallback-lock-gc schema={FALLBACK_GC_SCHEMA} expired={len(expired)}"
        f" kept={len(kept)} unknown={len(unknown)} lock_count={after if after is not None else 'unknown'}",
        file=sys.stderr,
        flush=True,
    )
    return receipt


def pickup_refuse_reason(
    identifier: str,
    *,
    issue: dict | None,
    pr_verdict: str,
    held: bool | None,
    codex_writer: bool = False,
) -> str | None:
    """Typed reason to refuse a new writer. None means the issue may start.

    Codex is never a second writer on In Review (lease-guard + router). The
    sidecar may continue an In Review remount or receipt-less claimed head.
    """
    if not IDENTIFIER.fullmatch(identifier):
        return "malformed_identifier"
    if pr_verdict == "skip":
        return "open_pr_inflight"
    state = (_issue_state_name(issue) or "").strip().lower()
    if state in DONE_LOCK_STATES:
        # An open DIRTY/CI-red autonomous PR proves the work never landed:
        # remounting it continues existing GitHub work and is exempt from the
        # done/closed refusal (Linear state-sync error, e.g. marked Done on a
        # partial sibling merge). Canceled/duplicate stay refused — those are
        # deliberate kills.
        if not (pr_verdict == "remount" and state in {"done", "closed"}):
            return {
                "done": "issue_done",
                "closed": "issue_done",
                "canceled": "issue_canceled",
                "cancelled": "issue_canceled",
                "duplicate": "issue_duplicate",
            }[state]
    if held is True:
        return "fallback_lease_held"
    if held is None:
        return "lock_gc_unverifiable"
    if state == "in review" and (codex_writer or pr_verdict == "skip"):
        return "issue_in_review"
    return None


def pickup_check_command(identifier: str) -> int:
    """Router preflight: GC this issue's stale lock, then fail closed with a typed reason."""
    if not IDENTIFIER.fullmatch(identifier):
        print(
            'SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 '
            f'class=pickup-refused retryable=false maxAttempts=1 reason="malformed_identifier {identifier}"',
            file=sys.stderr,
        )
        return 78
    open_prs = _autonomous_open_pr_index([identifier])
    gc_fallback_locks(open_prs=_autonomous_open_pr_index(None))
    issue = _fetch_single_issue(identifier)
    verdict, _pr = _open_pr_verdict(identifier, open_prs)
    lock_path = _fallback_lease_dir() / f"{identifier}.lock"
    held = _lock_held(lock_path) if lock_path.is_file() else False
    reason = pickup_refuse_reason(
        identifier, issue=issue, pr_verdict=verdict, held=held, codex_writer=True
    )
    lock_count = _fallback_lock_count()
    if reason is not None:
        _emit_pickup(
            "refuse",
            reason=reason,
            identifier=identifier,
            lock_count=lock_count,
            next_issue="",
        )
        failure_class = "fallback-lease-held" if reason == "fallback_lease_held" else "pickup-refused"
        print(
            "SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 "
            f"class={failure_class} retryable=false maxAttempts=1 "
            f'reason="{reason} owns {identifier}"',
            file=sys.stderr,
        )
        return 78
    _emit_pickup(
        "lease_start",
        reason="lease_start",
        identifier=identifier,
        lock_count=lock_count,
        next_issue=identifier,
    )
    print(f"PICKUP_ADMITTED identifier={identifier} lock_count={lock_count}")
    return 0


def _launch_fallback_workers(
    identifiers: list[str],
    active: list[str],
    executable: str,
    bundle_revision: str,
    selection: dict,
    limit: int,
) -> tuple[set[str], int]:
    """Start isolated fallback units up to *limit*. Never stops Symphony."""
    open_prs = _autonomous_open_pr_index(None)
    gc_fallback_locks(open_prs=open_prs)
    active_units = set(_recycle_stale_remount_units(active, open_prs))
    capacity_used = len(active_units)
    launched_units: set[str] = set()
    lock_count = _fallback_lock_count()
    next_eligible = ""
    first_lease: str | None = None
    for identifier in identifiers:
        if capacity_used >= limit:
            if next_eligible == "":
                next_eligible = identifier
            _emit_pickup(
                "refuse",
                reason="capacity_full",
                identifier=identifier,
                lock_count=lock_count,
                next_issue=first_lease or next_eligible,
            )
            break
        legacy_unit = f"grok-ship-{identifier}.service"
        fallback_prefix = f"fallback-ship-{identifier}-"
        if legacy_unit in active_units or any(unit.startswith(fallback_prefix) for unit in active_units):
            continue
        verdict, _pr = _open_pr_verdict(identifier, open_prs)
        lock_path = _fallback_lease_dir() / f"{identifier}.lock"
        held = _lock_held(lock_path) if lock_path.is_file() else False
        issue = None
        if verdict != "skip":
            issue = _fetch_single_issue(identifier)
        refuse = pickup_refuse_reason(
            identifier, issue=issue, pr_verdict=verdict, held=held
        )
        if refuse is not None:
            if next_eligible == "" and refuse not in {
                "open_pr_inflight",
                "issue_in_review",
                "issue_done",
                "issue_canceled",
                "issue_duplicate",
            }:
                next_eligible = identifier
            _emit_pickup(
                "refuse",
                reason=refuse,
                identifier=identifier,
                lock_count=lock_count,
                next_issue=next_eligible,
            )
            skip_label = (
                "not admitted"
                if refuse in {"not_admitted", "blocked", "state_not_admitted"}
                else refuse
            )
            print(f"fallback skip {identifier} {skip_label}", file=sys.stderr, flush=True)
            continue
        if issue is None:
            _emit_pickup(
                "refuse",
                reason="admission_unverifiable",
                identifier=identifier,
                lock_count=lock_count,
                next_issue=next_eligible,
            )
            print(f"fallback skip {identifier} admission_unverifiable", file=sys.stderr, flush=True)
            continue
        ok, meta_reason, meta = _issue_meta(
            issue,
            identifier,
            require_receipt=(verdict != "remount" and not _continue_without_receipt(issue)),
            remount=(verdict == "remount"),
        )
        if not ok:
            reason = meta_reason if meta_reason in TYPED_PICKUP_REFUSE_REASONS else "not_admitted"
            _emit_pickup(
                "refuse",
                reason=reason,
                identifier=identifier,
                lock_count=lock_count,
                next_issue=next_eligible,
            )
            skip_label = (
                "not admitted"
                if reason in {"not_admitted", "blocked", "state_not_admitted"}
                else reason
            )
            print(f"fallback skip {identifier} {skip_label}", file=sys.stderr, flush=True)
            continue
        command = _grok_command(
            identifier,
            executable,
            selection,
            meta["issue_revision"],
            bundle_revision,
        )
        if not _control(command):
            _emit_pickup(
                "refuse",
                reason="grok_launch_failed",
                identifier=identifier,
                lock_count=lock_count,
                next_issue=next_eligible,
            )
            print(f"fallback skip {identifier} grok_launch_failed", file=sys.stderr, flush=True)
            continue
        launched_units.add(next(arg.removeprefix("--unit=") + ".service" for arg in command if arg.startswith("--unit=")))
        capacity_used += 1
        if first_lease is None:
            first_lease = identifier
            next_eligible = identifier
        _emit_pickup(
            "lease_start",
            reason="lease_start",
            identifier=identifier,
            lock_count=lock_count,
            next_issue=identifier,
        )
    if not launched_units and first_lease is None:
        _emit_pickup(
            "idle",
            reason="no_eligible_issue" if not next_eligible else "capacity_full",
            identifier=None,
            lock_count=lock_count,
            next_issue=next_eligible,
        )
    return launched_units, capacity_used


def _grok_command(
    identifier: str,
    executable: str,
    selection: dict,
    issue_revision: str,
    bundle_revision: str,
) -> list[str]:
    encoded = base64.b64encode(json.dumps(selection, separators=(",", ":")).encode()).decode()
    unit = _fallback_unit(identifier, issue_revision)
    grok_exe = _grok_executable() or str(pathlib.Path.home() / ".local/bin/grok")
    return [
        "systemd-run", "--user", f"--unit={unit}", "--collect",
        "-p", "Type=exec", "-p", f"Environment=PATH={pathlib.Path.home()}/.local/bin:{pathlib.Path.home()}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
        "-p", "Environment=AUTOMATION_VERIFY_MAX_WORKERS=4",
        "-p", "Environment=AUTOMATION_VERIFY_SHARD_CONCURRENCY=2",
        "-p", f"Environment=GEM_GROK_EXECUTABLE={grok_exe}",
        "-p", f"Environment=GEM_GROK_BIN={grok_exe}",
        "-p", f"Environment=SYMPHONY_FALLBACK_SELECTION_B64={encoded}",
        "-p", f"Environment=SYMPHONY_FALLBACK_ISSUE_REVISION={issue_revision}",
        "-p", f"Environment=SYMPHONY_FALLBACK_BUNDLE_REVISION={bundle_revision}",
        "-p", f"Environment=SYMPHONY_FALLBACK_UNIT={unit}",
        executable, identifier,
    ]


def reconcile(target_identifier: str | None = None) -> int:
    gc_fallback_locks()
    ready, reason = codex_canary_ready()
    if ready:
        active = _active_grok_units()
        if active is None:
            print("codex_not_exhausted grok_state_query_failed", file=sys.stderr)
            return EXIT_SAFE_FAIL_CLOSED
        if active:
            if target_identifier is not None:
                print(
                    "codex_not_exhausted recovery_deferred "
                    f"target_not_started={target_identifier} grok_ship_active",
                    file=sys.stderr,
                )
                return EXIT_SAFE_FAIL_CLOSED
            print("codex_not_exhausted recovery_deferred grok_ship_active", file=sys.stderr)
            return 0
        if not _start_jov_primary():
            print("codex_not_exhausted symphony_start_failed", file=sys.stderr)
            return EXIT_DEGRADED
        if not _services_active():
            print("codex_not_exhausted symphony_not_active", file=sys.stderr)
            return EXIT_DEGRADED
        launched_units: set[str] = set()
        drain_reason = _drain_included_pools(
            active, target_identifier, launched_units
        )
        if target_identifier is not None and not drain_reason.startswith(
            "drain_started=1 "
        ):
            print(
                f"codex_not_exhausted symphony_active target={target_identifier} "
                f"{drain_reason}",
                file=sys.stderr,
            )
            return EXIT_SAFE_FAIL_CLOSED
        if target_identifier is not None:
            survived = _grok_units_after_survival_window()
            if survived is None:
                print(
                    "codex_not_exhausted symphony_active "
                    f"target_survival_query_failed={target_identifier}",
                    file=sys.stderr,
                )
                return EXIT_DEGRADED
            if set(survived) != launched_units:
                if not _cleanup_launched_units(launched_units):
                    print(
                        "codex_not_exhausted symphony_active "
                        f"target_cleanup_failed={target_identifier}",
                        file=sys.stderr,
                    )
                    return EXIT_DEGRADED
                print(
                    "codex_not_exhausted symphony_active "
                    f"target_not_survived={target_identifier}",
                    file=sys.stderr,
                )
                return EXIT_SAFE_FAIL_CLOSED
        idle = "idle " if drain_reason.startswith("drain_skipped=") or drain_reason.startswith("drain_idle") else ""
        print(f"codex_not_exhausted symphony_active {idle}{drain_reason}", file=sys.stderr)
        return 0
    return _continue_exhausted_reconcile(reason, target_identifier)


def _drain_included_pools(
    active: list[str],
    target_identifier: str | None = None,
    launched_out: set[str] | None = None,
) -> str:
    """Use leftover included Cursor/Grok/Kimi quota while Codex still owns Symphony.

    One issue still has one implementation owner: grok-ship-one and
    symphony-codex-router share the fallback lease flock.
    """
    executable = _grok_ship_one_executable()
    if executable is None:
        return "drain_skipped=grok_executable_missing"
    gate_ready, gate_reason = _fleet_gate_allows_isolated()
    if not gate_ready:
        return f"drain_skipped={gate_reason}"
    identifiers = _admitted_or_remount_identifiers()
    if identifiers is None:
        return "drain_skipped=linear_query_failed"
    if target_identifier is not None:
        if target_identifier not in identifiers:
            return f"drain_skipped=target_not_eligible:{target_identifier}"
        identifiers = [target_identifier]
    if not identifiers:
        return "drain_idle pool=unselected"
    selection, selection_reason = _model_router_selection()
    if selection is None:
        return f"drain_skipped={selection_reason}"
    pool = (selection.get("selected") or {}).get("pool") or "unknown"
    if pool == "codex":
        return "drain_skipped=codex_pool"
    bundle_revision = _bundle_revision()
    if bundle_revision is None:
        return "drain_skipped=bundle_revision_unavailable"
    limit = 1 if target_identifier is not None else _grok_limit()
    if limit <= 0:
        return "drain_skipped=grok_capacity_zero"
    launched, _used = _launch_fallback_workers(
        identifiers, active, executable, bundle_revision, selection, limit
    )
    if launched_out is not None:
        launched_out.update(launched)
    if not launched:
        if target_identifier is not None:
            return f"drain_skipped=target_not_started:{target_identifier}"
        return f"drain_idle pool={pool}"
    return f"drain_started={len(launched)} pool={pool} model={selection['selected'].get('id')}"


def _continue_exhausted_reconcile(
    reason: str, target_identifier: str | None = None
) -> int:
    # A failed readiness probe is not proof that Codex is exhausted. Only the
    # typed cooldown state authorizes the destructive primary-to-fallback
    # handoff. Preserve the running services on missing state, missing binaries,
    # timeouts, transport failures, and malformed probe output.
    if reason != "all_accounts_cooldown":
        print(
            f"codex_readiness_indeterminate {reason} symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED

    # Prove the fallback control plane before stopping Symphony. Otherwise a
    # transient Linear, filesystem, or systemd observation failure can turn a
    # healthy primary into a zero-worker outage.
    executable = _grok_ship_one_executable()
    if executable is None:
        print(
            "codex_exhausted grok_executable_missing symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED
    identifiers = _admitted_or_remount_identifiers()
    if identifiers is None:
        print(
            "codex_exhausted linear_query_failed symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED
    if target_identifier is not None:
        if target_identifier not in identifiers:
            print(
                f"codex_exhausted {reason} target_not_eligible={target_identifier} "
                "symphony_unchanged",
                file=sys.stderr,
            )
            return EXIT_SAFE_FAIL_CLOSED
        identifiers = [target_identifier]
    active = _active_grok_units()
    if active is None:
        print(
            "codex_exhausted grok_state_query_failed symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED
    if not identifiers and not active:
        if _jov_active():
            print(
                f"codex_exhausted {reason} no_admitted_work symphony_unchanged",
                file=sys.stderr,
            )
            return 0
        if not _start_jov_primary():
            print(
                f"codex_exhausted {reason} no_admitted_work symphony_restore_failed",
                file=sys.stderr,
            )
            return EXIT_DEGRADED
        print(
            f"codex_exhausted {reason} no_admitted_work symphony_restored",
            file=sys.stderr,
        )
        return 0
    limit = 1 if target_identifier is not None else _grok_limit()
    if limit <= 0 and not active:
        print(
            f"codex_exhausted {reason} grok_capacity_zero symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED

    gate_ready, gate_reason = _fleet_gate_allows_isolated()
    if not gate_ready:
        print(
            f"codex_exhausted {gate_reason} symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED

    selection, selection_reason = _model_router_selection()
    if selection is None:
        print(
            f"codex_exhausted {selection_reason} symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED
    bundle_revision = _bundle_revision()
    if bundle_revision is None:
        print(
            "codex_exhausted bundle_revision_unavailable symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED

    # Exclusive implementation is the fallback lease flock; the Codex launcher
    # exits 78 when that lock is held. Do not stop JOV: fleet-gate observes
    # :4041 on Gem, and a stopped scheduler freezes promotion (zero merge-queue slots).
    launched_units, _capacity_used = _launch_fallback_workers(
        identifiers, active, executable, bundle_revision, selection, limit
    )
    if target_identifier is not None and not launched_units:
        print(
            f"codex_exhausted {reason} target_not_started={target_identifier} "
            "symphony_unchanged",
            file=sys.stderr,
        )
        return EXIT_SAFE_FAIL_CLOSED
    started = 0
    final_active = _active_grok_units()
    if final_active is None:
        # Exclusivity cannot be proven. Do not restart Symphony while an
        # accepted or pre-existing Grok unit may still own implementation.
        # The timer will retry the observation and restore the safe owner once
        # systemd state is knowable again.
        print(
            f"codex_exhausted {reason} grok_state_query_failed symphony_stopped",
            file=sys.stderr,
        )
        return EXIT_DEGRADED
    if final_active:
        survived = _grok_units_after_survival_window()
        if survived is None:
            print(
                f"codex_exhausted {reason} grok_survival_query_failed symphony_stopped",
                file=sys.stderr,
            )
            return EXIT_DEGRADED
        if survived:
            started = len(launched_units.intersection(survived))
            if target_identifier is not None and set(survived) != launched_units:
                if not _cleanup_launched_units(launched_units):
                    print(
                        f"codex_exhausted {reason} "
                        f"target_cleanup_failed={target_identifier} symphony_active",
                        file=sys.stderr,
                    )
                    return EXIT_DEGRADED
                if not _jov_active() and not _start_jov_primary():
                    print(
                        f"codex_exhausted {reason} "
                        f"target_not_survived={target_identifier} "
                        "symphony_api_restore_failed",
                        file=sys.stderr,
                    )
                    return EXIT_DEGRADED
                print(
                    f"codex_exhausted {reason} "
                    f"target_not_survived={target_identifier} symphony_active",
                    file=sys.stderr,
                )
                return EXIT_SAFE_FAIL_CLOSED
            if not _jov_active() and not _start_jov_primary():
                print(
                    f"codex_exhausted {reason} grok_started={started} grok_survived={len(survived)} symphony_api_restore_failed",
                    file=sys.stderr,
                )
                return EXIT_DEGRADED
            print(
                f"codex_exhausted {reason} grok_started={started} grok_survived={len(survived)}",
                file=sys.stderr,
            )
            return 0
        final_active = survived

    if launched_units:
        # Accepted transient units can activate after an empty snapshot. Cancel
        # every accepted launch synchronously, then prove the entire Grok lane
        # is still empty before bringing the primary owner back. A collected
        # transient may already have disappeared, in which case systemctl stop
        # reports "unit not loaded" even though cleanup is complete. Tolerate
        # only that exact, independently proven state; every other stop failure
        # leaves exclusivity unproven and must remain degraded.
        if not _control(_systemctl("stop", *sorted(launched_units))) and not all(
            _unit_not_loaded(unit) for unit in launched_units
        ):
            print(
                f"codex_exhausted {reason} grok_cleanup_failed symphony_stopped",
                file=sys.stderr,
            )
            return EXIT_DEGRADED
        cleared = _active_grok_units()
        if cleared is None or cleared:
            print(
                f"codex_exhausted {reason} grok_cleanup_unverified symphony_stopped",
                file=sys.stderr,
            )
            return EXIT_DEGRADED

    # No fallback owner survived the handoff. Restore the primary owner and
    # verify it is active so this failure path self-heals instead of stranding a
    # zero-worker runtime.
    if not _start_jov_primary():
        print(
            f"codex_exhausted {reason} grok_started=0 symphony_restore_failed",
            file=sys.stderr,
        )
        return EXIT_DEGRADED
    if not _services_active():
        print(
            f"codex_exhausted {reason} grok_started=0 symphony_not_active",
            file=sys.stderr,
        )
        return EXIT_DEGRADED
    print(
        f"codex_exhausted {reason} grok_started=0 symphony_restored",
        file=sys.stderr,
    )
    return EXIT_SAFE_FAIL_CLOSED


class InstallValidationError(Exception):
    pass


def _artifacts() -> dict[str, pathlib.Path]:
    root = pathlib.Path(__file__).resolve().parent
    registry = root / "model-registry.json"
    if not registry.is_file():
        registry = root / "config" / "model-registry.json"
    return {
        **{name: root / name for name in (*LEGACY_RUNTIME_NAMES, "grok-ship-one", "cursor-agent-std", "model-router.py")},
        "model-registry.json": registry,
    }


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


def _valid_bundle_file(name: str, path: pathlib.Path) -> bool:
    if name == "model-registry.json":
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return not path.is_symlink() and path.is_file() and payload.get("schema_version") == 1
        except (OSError, TypeError, ValueError):
            return False
    if name == "model-router.py":
        try:
            return not path.is_symlink() and path.is_file() and path.read_bytes().startswith(b"#!")
        except OSError:
            return False
    return _valid_runtime_file(path)


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
        or any(_path_exists(release / n) and not _valid_bundle_file(n, release / n) for n in RUNTIME_NAMES)
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
        _path_exists(current / name) and not _valid_bundle_file(name, current / name) for name in contents
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
            if not _valid_bundle_file(name, source):
                raise InstallValidationError("source is invalid")
            contents[name] = source.read_bytes()
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
            if name in ("model-router.py", "model-registry.json"):
                (release / name).write_bytes(data)
                os.chmod(release / name, 0o644)
            else:
                _write_executable(release / name, data)
        _fsync_directory(release)
        _fsync_directory(releases)
        _atomic_current(state, release)
        for name in LAUNCHER_NAMES:
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
        choices=(
            "probe",
            "reconcile",
            "install",
            "check-admission",
            "open-pr-verdict",
            "gc-fallback-locks",
            "pickup-check",
        ),
        default=default,
    )
    parser.add_argument("identifier", nargs="?")
    parser.add_argument("--destination-root")
    parser.add_argument(
        "--remount",
        action="store_true",
        help="Skip admission-gate/v1 receipt (DIRTY/CI-red remount only)",
    )
    args = parser.parse_args()
    if args.command == "install":
        return install(args.destination_root)
    if args.command == "reconcile":
        if args.identifier and not re.fullmatch(r"(?:JOV|LYB)-\d+", args.identifier):
            print("reconcile identifier must be JOV-<n> or LYB-<n>", file=sys.stderr)
            return 2
        return reconcile(args.identifier)
    if args.command == "check-admission":
        if not args.identifier:
            print("check-admission requires an issue identifier", file=sys.stderr)
            return 2
        return check_admission(args.identifier, remount=args.remount)
    if args.command == "open-pr-verdict":
        if not args.identifier:
            print("open-pr-verdict requires an issue identifier", file=sys.stderr)
            return 2
        return open_pr_verdict_command(args.identifier)
    if args.command == "gc-fallback-locks":
        receipt = gc_fallback_locks()
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 2 if receipt.get("red") else 0
    if args.command == "pickup-check":
        if not args.identifier:
            print("pickup-check requires an issue identifier", file=sys.stderr)
            return 2
        return pickup_check_command(args.identifier)
    ready, _ = codex_canary_ready()
    print("no" if ready else "yes")
    return 1 if ready else 0


if __name__ == "__main__":
    sys.exit(main())
