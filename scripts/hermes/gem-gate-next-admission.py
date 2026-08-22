#!/usr/bin/env python3
"""Serialize Fleet reconcile->gate-next and Intake gate-next on one Gem flock."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

SCHEMA = "gem-gate-next-admission/v1"
REQUIRED_HOSTNAME = "gem"
DEFAULT_STATE_DIR = Path("/home/timwhite/gem-workspace/state")
LOCK_NAME = "gem-gate-next-admission.lock"
RECEIPT_NAME = "gem-gate-next-admission.json"
LOCK_ACQUIRE_TIMEOUT_SECONDS = 270.0
LOCK_POLL_SECONDS = 0.2
RECONCILE_TIMEOUT_SECONDS = 180
GATE_NEXT_TIMEOUT_SECONDS = 60
RETRY_CEILING = 0
ISSUE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]*-\d+$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
LOCK_HELD_ENV = "JOVIE_GEM_GATE_ADMISSION_LOCK_HELD"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUN_BACKLOG = REPO_ROOT / "scripts/backlog-orchestrator/run-backlog.sh"
EXIT_OK, EXIT_FAIL_CLOSED, EXIT_RECONCILE_REQUIRED = 0, 2, 3
NEXT_BUSY, NEXT_RECONCILE, NEXT_VALIDATION, NEXT_CHILD, NEXT_NONE = (
    "do-not-retry",
    "reconcile-linear-receipts-and-leases",
    "fix-invocation",
    "observe-child-receipt",
    "none",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def is_test_harness() -> bool:
    return os.environ.get("JOVIE_GEM_ADMISSION_TEST") == "1"


def current_hostname() -> str:
    if is_test_harness():
        override = os.environ.get("JOVIE_GEM_ADMISSION_HOSTNAME")
        if override is not None:
            return override
    return socket.gethostname()


def state_dir() -> Path:
    if is_test_harness():
        override = os.environ.get("JOVIE_GEM_ADMISSION_STATE_DIR")
        if override:
            return Path(override)
    return DEFAULT_STATE_DIR


def lock_path(directory: Path | None = None) -> Path:
    return (directory or state_dir()) / LOCK_NAME


def receipt_path(directory: Path | None = None) -> Path:
    return (directory or state_dir()) / RECEIPT_NAME


def run_backlog_path() -> Path:
    if is_test_harness():
        override = os.environ.get("JOVIE_GEM_ADMISSION_RUN_BACKLOG")
        if override:
            return Path(override)
    return DEFAULT_RUN_BACKLOG


def env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a positive number") from None
    if value <= 0:
        raise ValueError(f"{name} must be a positive number")
    return value


def timeout_seconds(kind: str) -> float:
    defaults = {
        "lock": LOCK_ACQUIRE_TIMEOUT_SECONDS,
        "reconcile": float(RECONCILE_TIMEOUT_SECONDS),
        "gate-next": float(GATE_NEXT_TIMEOUT_SECONDS),
    }
    names = {
        "lock": "JOVIE_GEM_ADMISSION_LOCK_TIMEOUT_SECONDS",
        "reconcile": "JOVIE_GEM_ADMISSION_RECONCILE_TIMEOUT_SECONDS",
        "gate-next": "JOVIE_GEM_ADMISSION_GATE_NEXT_TIMEOUT_SECONDS",
    }
    default = defaults[kind]
    return env_float(names[kind], default) if is_test_harness() else default


def write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    encoded = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, encoded)
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temporary, path)
    dir_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def run_identity() -> dict[str, str]:
    run_id = os.environ.get("GITHUB_RUN_ID", "").strip()
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "").strip()
    event = os.environ.get("GITHUB_EVENT_NAME", "").strip()
    source = (
        os.environ.get("JOVIE_GEM_ADMISSION_SOURCE_SHA", "").strip()
        or os.environ.get("GITHUB_SHA", "").strip()
    )
    missing = [
        name
        for name, value in (
            ("GITHUB_RUN_ID", run_id),
            ("GITHUB_RUN_ATTEMPT", attempt),
            ("GITHUB_EVENT_NAME", event),
            ("GITHUB_SHA", source),
        )
        if not value
    ]
    if missing:
        raise ValueError("missing run identity: " + ", ".join(missing))
    if not SHA_RE.fullmatch(source):
        raise ValueError("source SHA must be a 40-character lowercase hex digest")
    expected = os.environ.get("JOVIE_GEM_ADMISSION_EXPECTED_SHA", "").strip()
    if expected and expected != source:
        raise ValueError("mismatched source SHA")
    return {
        "runId": run_id,
        "runAttempt": attempt,
        "event": event,
        "sourceSha": source,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Hold the Gem gate-next admission flock around mutating writers."
    )
    parser.add_argument("--mode", required=True, choices=("fleet", "intake"))
    parser.add_argument("--issue", default="")
    return parser.parse_args(argv)


def validate_request(args: argparse.Namespace) -> str | None:
    issue = args.issue.strip() or None
    if args.mode == "intake":
        if not issue or not ISSUE_RE.fullmatch(issue):
            raise ValueError("intake mode requires an exact Linear issue identifier")
    elif issue:
        raise ValueError("fleet mode must not target an issue")
    hostname = current_hostname()
    if hostname != REQUIRED_HOSTNAME:
        raise ValueError(f"exact host {REQUIRED_HOSTNAME} required, got {hostname}")
    return issue


def base_receipt(
    identity: Mapping[str, str],
    *,
    mode: str,
    issue: str | None,
    phase: str,
    exit_classification: str,
    next_action: str,
    child_invoked: bool,
    mutations: str | int,
    acquired_at: str | None = None,
    released_at: str | None = None,
    child_exit: int | None = None,
    detail: str | None = None,
) -> dict[str, Any]:
    receipt: dict[str, Any] = {
        "schema": SCHEMA,
        "runId": identity["runId"],
        "runAttempt": identity["runAttempt"],
        "event": identity["event"],
        "mode": mode,
        "issue": issue,
        "pid": os.getpid(),
        "hostname": current_hostname(),
        "sourceSha": identity["sourceSha"],
        "acquiredAt": acquired_at,
        "releasedAt": released_at,
        "phase": phase,
        "exitClassification": exit_classification,
        "retryCeiling": RETRY_CEILING,
        "nextAction": next_action,
        "childInvoked": child_invoked,
        "mutations": mutations,
        "lockPath": str(lock_path()),
    }
    if child_exit is not None:
        receipt["childExit"] = child_exit
    if detail:
        receipt["detail"] = detail
    return receipt


def emit_receipt(receipt: Mapping[str, Any], *, holder: bool) -> None:
    if holder:
        write_json_atomic(receipt_path(), receipt)
        return
    name = f"{receipt['runId']}-{receipt['runAttempt']}-{os.getpid()}.json"
    write_json_atomic(state_dir() / "gem-gate-next-admission-runs" / name, receipt)


def acquire_lock(timeout: float) -> int | None:
    directory = state_dir()
    directory.mkdir(parents=True, exist_ok=True)
    fd = os.open(lock_path(directory), os.O_RDWR | os.O_CREAT, 0o644)
    deadline = time.monotonic() + timeout
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except BlockingIOError:
            if time.monotonic() >= deadline:
                os.close(fd)
                return None
            time.sleep(LOCK_POLL_SECONDS)


def release_lock(fd: int) -> None:
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def fail_closed(receipt: Mapping[str, Any]) -> int:
    emit_receipt(receipt, holder=False)
    print(
        f"gem-gate-next-admission {receipt['phase']} {receipt['exitClassification']}",
        file=sys.stderr,
    )
    return EXIT_FAIL_CLOSED


def run_child(command: list[str], child_timeout: float, env: Mapping[str, str]) -> int:
    proc = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        env=dict(env),
        start_new_session=True,
        close_fds=True,
    )
    try:
        return proc.wait(timeout=child_timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        raise


def child_env() -> dict[str, str]:
    env = os.environ.copy()
    env[LOCK_HELD_ENV] = "1"
    env["JOVIE_GEM_ADMISSION_LOCK_PATH"] = str(lock_path())
    return env


def run_locked_children(
    fd: int,
    args: argparse.Namespace,
    issue: str | None,
    identity: Mapping[str, str],
    acquired_at: str,
) -> int:
    del fd
    run_backlog = run_backlog_path()
    commands = (
        [
            ("reconcile", [str(run_backlog), "reconcile"], timeout_seconds("reconcile")),
            ("gate-next", [str(run_backlog), "gate-next"], timeout_seconds("gate-next")),
        ]
        if args.mode == "fleet"
        else [
            (
                "gate-next",
                [str(run_backlog), "gate-next", f"--issue={issue}"],
                timeout_seconds("gate-next"),
            )
        ]
    )
    env = child_env()
    last_exit = 0

    def emit(holder: bool = True, **fields: Any) -> None:
        emit_receipt(
            base_receipt(identity, mode=args.mode, issue=issue, **fields),
            holder=holder,
        )

    for phase, command, child_timeout in commands:
        emit(
            phase=phase,
            exit_classification="running",
            next_action=NEXT_NONE,
            child_invoked=True,
            mutations="possible",
            acquired_at=acquired_at,
        )
        try:
            last_exit = run_child(command, child_timeout, env)
        except subprocess.TimeoutExpired:
            emit(
                phase="child-timeout",
                exit_classification="reconcile-required",
                next_action=NEXT_RECONCILE,
                child_invoked=True,
                mutations="possible",
                acquired_at=acquired_at,
                released_at=utc_now(),
                detail=f"{phase} exceeded {child_timeout}s after possible effect",
            )
            return EXIT_RECONCILE_REQUIRED
        except Exception as error:
            emit(
                phase="child-lost",
                exit_classification="reconcile-required",
                next_action=NEXT_RECONCILE,
                child_invoked=True,
                mutations="possible",
                acquired_at=acquired_at,
                released_at=utc_now(),
                detail=str(error),
            )
            return EXIT_RECONCILE_REQUIRED
        if last_exit != 0:
            emit(
                phase=phase,
                exit_classification="child-error",
                next_action=NEXT_CHILD,
                child_invoked=True,
                mutations="possible",
                acquired_at=acquired_at,
                released_at=utc_now(),
                child_exit=last_exit,
            )
            return last_exit
    emit(
        phase="released",
        exit_classification="ok",
        next_action=NEXT_NONE,
        child_invoked=True,
        mutations="possible",
        acquired_at=acquired_at,
        released_at=utc_now(),
        child_exit=last_exit,
    )
    return EXIT_OK


def validation_identity() -> dict[str, str]:
    return {
        "runId": os.environ.get("GITHUB_RUN_ID", "missing"),
        "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT", "missing"),
        "event": os.environ.get("GITHUB_EVENT_NAME", "missing"),
        "sourceSha": os.environ.get("GITHUB_SHA", "0" * 40),
    }


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        issue = validate_request(args)
        identity = run_identity()
    except ValueError as error:
        mode = "invalid"
        issue = None
        if argv:
            try:
                parsed = parse_args(argv)
                mode = parsed.mode
                issue = parsed.issue.strip() or None
            except SystemExit:
                pass
        return fail_closed(
            base_receipt(
                validation_identity(),
                mode=mode,
                issue=issue,
                phase="validation",
                exit_classification="validation",
                next_action=NEXT_VALIDATION,
                child_invoked=False,
                mutations=0,
                detail=str(error),
            )
        )
    fd = acquire_lock(timeout_seconds("lock"))
    if fd is None:
        return fail_closed(
            base_receipt(
                identity,
                mode=args.mode,
                issue=issue,
                phase="busy",
                exit_classification="busy",
                next_action=NEXT_BUSY,
                child_invoked=False,
                mutations=0,
                detail="admission lock stayed contested before any child",
            )
        )
    acquired_at = utc_now()
    try:
        emit_receipt(
            base_receipt(
                identity,
                mode=args.mode,
                issue=issue,
                phase="held",
                exit_classification="running",
                next_action=NEXT_NONE,
                child_invoked=False,
                mutations=0,
                acquired_at=acquired_at,
            ),
            holder=True,
        )
        return run_locked_children(fd, args, issue, identity, acquired_at)
    finally:
        release_lock(fd)


if __name__ == "__main__":
    sys.exit(main())
