#!/usr/bin/env python3
"""Six-hourly credentials and spend registry check on the lanes host (metadata only).

The lanes tick runs scripts/credentials-spend-check.mjs --live from the installed
release (RELEASE_EXTRAS carries it and ops/registry/*), so it reads the reviewed
registry on main and Gem's own Codex ledger. Each run appends its record to
~/.local/state/jovie-registry/credentials-runs.jsonl, the receipt the automation
registry row gem:credentials-spend watches.

Alerting findings are filed with --file-linear through the remediation intake,
authenticated as the Jovie Lanes Linear app: its short-lived access token goes in
LINEAR_ACCESS_TOKEN, which the intake sends as Bearer (#22440). Never a personal
key (#22378). Without the app credential the check still runs and records
filing=unavailable.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

INTERVAL_S = 6 * 3600
RETRY_S = 1800
TIMEOUT_S = 120
SCRIPT = "scripts/credentials-spend-check.mjs"
STATE_FILE = "credentials-spend.json"
# Only what node needs to run: no host credentials reach the check by inheritance.
ENV_KEYS = ("PATH", "HOME", "LANG", "TZ")


def app_access_token(state_dir: Path) -> str | None:
    """The Jovie Lanes Linear app's shared host token, or None (no credential, mint backoff)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import linear_app_token
    app = linear_app_token.credentials(linear_app_token.default_path())
    if not app:
        return None
    try:
        return linear_app_token.token(*app, state_dir)
    except linear_app_token.TokenUnavailable:
        return None


def receipt_path(home: Path | None = None) -> Path:
    return (Path.home() if home is None else home) / ".local/state/jovie-registry/credentials-runs.jsonl"


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, sort_keys=True))
    os.replace(temporary, path)


def summarize(stdout: str) -> dict:
    """Counts only; finding messages stay in the receipt the check writes."""
    report = json.loads(stdout)
    findings = report.get("findings") if isinstance(report, dict) else None
    if not isinstance(findings, list):
        raise ValueError("report-without-findings")
    severities: dict[str, int] = {}
    for item in findings:
        severity = str((item or {}).get("severity") or "unknown")
        severities[severity] = severities.get(severity, 0) + 1
    return {"findings": len(findings), "bySeverity": severities}


def tick(state_dir: Path, release: Path, run=subprocess.run, now: float | None = None,
         home: Path | None = None, linear_token=None) -> dict:
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    now = time.time() if now is None else now
    path = state_dir / STATE_FILE
    state = _read(path)
    next_at = state.get("nextAttemptAt", 0)
    if isinstance(next_at, (int, float)) and now < next_at:
        return {"status": "current", "nextAttemptAt": next_at, "lastRun": state.get("lastRun")}
    script = release / SCRIPT
    if not script.is_file():
        # The first release after this module ships is staged by the previous updater's
        # RELEASE_EXTRAS (bootstrap rule), so the script can be absent for one release.
        return {"status": "script-missing", "release": str(release)}
    # Persist the next attempt before running: a crash can never become a retry storm.
    state.update(nextAttemptAt=now + RETRY_S, startedAt=_iso(now))
    _write(path, state)
    receipt = receipt_path(home)
    receipt.parent.mkdir(parents=True, exist_ok=True)
    env = {key: os.environ[key] for key in ENV_KEYS if key in os.environ}
    if home is not None:
        env["HOME"] = str(home)
    args = ["node", str(script), "--live", "--receipt", str(receipt), "--json"]
    try:
        access = (linear_token or app_access_token)(state_dir)
    except Exception:  # filing is optional; the check and its receipt still run
        access = None
    if access:
        env["LINEAR_ACCESS_TOKEN"] = access
        args.append("--file-linear")
    try:
        done = run(args, cwd=str(release),
                   env=env, capture_output=True, text=True, timeout=TIMEOUT_S, stdin=subprocess.DEVNULL)
        if done.returncode != 0:
            raise RuntimeError(f"exit {done.returncode}")
        result = {"status": "ok", **summarize(done.stdout), "filing": "linear-app" if access else "unavailable"}
        state["nextAttemptAt"] = now + INTERVAL_S
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError, TypeError) as error:
        # Output can carry provider details; keep only the error class.
        result = {"status": "failed", "error": type(error).__name__}
    result["at"] = _iso(now)
    state["lastRun"] = result
    _write(path, state)
    return result
