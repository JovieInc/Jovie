"""Recover missed continuity invocations from Gem's existing minute tick (JOV-6909).

Only the existing hosted workflow probes production and reports health. This
adapter records dispatch requests, never check-ins or successful observations.
"""
from __future__ import annotations

import fcntl
import json
import math
import os
from pathlib import Path
import subprocess
import time
from datetime import datetime

SCHEMA = "jovie-continuity-clock/v1"
ENDPOINT = "repos/JovieInc/Jovie/actions/workflows/production-continuity.yml"
INTERVAL_S = 300
UNCERTAIN_S = 900
ACTIVE = frozenset({"queued", "in_progress", "requested", "waiting", "pending"})


def api(run, args):
    result = run(["gh", "api", *args], capture_output=True, text=True, timeout=10)
    if result.returncode:
        # API output can contain credentials or private infrastructure details.
        raise RuntimeError("continuity-api-failed")
    return result.stdout


def observe(run, now: float) -> dict:
    data = json.loads(api(run, [ENDPOINT + "/runs?branch=main&per_page=30"]))
    rows = data.get("workflow_runs")
    if not isinstance(rows, list) or not rows:
        raise ValueError("workflow-runs-unobservable")
    observations = []
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get("id"), int)
                or row.get("head_branch") != "main"
                or row.get("event") not in {"schedule", "workflow_dispatch"}
                or row.get("status") not in ACTIVE | {"completed"}):
            raise ValueError("workflow-run-invalid")
        created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        if created.tzinfo is None or created.timestamp() > now + 60:
            raise ValueError("workflow-run-clock-invalid")
        observations.append((created.timestamp(), row))
    active = next((row for _, row in observations if row["status"] in ACTIVE), None)
    if active:
        return {"status": "active", "runId": active["id"]}
    at, latest = max(observations, key=lambda item: item[0])
    if now-at >= INTERVAL_S:
        # A long-running invocation can fall outside the recent window. Check it
        # separately before dispatch; the workflow concurrency group handles the
        # final race with a new native schedule invocation.
        running = json.loads(api(run, [ENDPOINT + "/runs?branch=main&status=in_progress&per_page=1"]))
        if not isinstance(running.get("workflow_runs"), list):
            raise ValueError("active-runs-unobservable")
        if running["workflow_runs"]:
            return {"status": "active"}
    return {"status": "current" if now-at < INTERVAL_S else "overdue",
            "runId": latest["id"], "ageSeconds": max(0, int(now-at))}


def save(path: Path, state: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, sort_keys=True))
    os.replace(temporary, path)


def tick(state_dir: Path, hostname: str, run=subprocess.run, now: float | None = None) -> dict:
    if hostname != "gem":
        return {"status": "not-owner", "owner": "gem"}
    now = time.time() if now is None else now
    state_dir.mkdir(parents=True, exist_ok=True)
    path = state_dir / "continuity-clock.json"
    with (state_dir / "continuity-clock.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "busy"}
        try:
            state = json.loads(path.read_text()) if path.exists() else {"schema": SCHEMA, "nextAttemptAt": 0}
            next_at = state["nextAttemptAt"]
            if (state["schema"] != SCHEMA or type(next_at) not in (int, float)
                    or not math.isfinite(next_at) or next_at < 0 or next_at > now + UNCERTAIN_S):
                raise ValueError("invalid-clock-state")
        except (OSError, ValueError, TypeError, KeyError):
            # Never reset an unreadable dispatch budget to zero.
            return {"status": "state-unobservable"}
        if now < next_at:
            return {"status": "cooldown", "nextAttemptAt": next_at, "lastResult": state.get("lastResult")}
        # Persist before any network call: crashes cannot create a minute retry storm.
        state.update(nextAttemptAt=now + INTERVAL_S, checkedAt=now)
        save(path, state)
        try:
            result = observe(run, now)
        except (OSError, subprocess.SubprocessError, ValueError, TypeError, KeyError, AttributeError, RuntimeError) as error:
            result = {"status": "failed", "error": type(error).__name__}
        if result["status"] == "overdue":
            state.update(nextAttemptAt=now + UNCERTAIN_S,
                         lastResult={"status": "dispatch-uncertain", "requestedAt": now})
            save(path, state)
            try:
                api(run, ["--method", "POST", ENDPOINT + "/dispatches", "-f", "ref=main"])
                result = {**result, "status": "dispatch-requested", "requestedAt": now}
                state["nextAttemptAt"] = now + INTERVAL_S
            except (OSError, subprocess.SubprocessError, RuntimeError) as error:
                result = {**result, "status": "dispatch-uncertain", "error": type(error).__name__}
        state["lastResult"] = result
        save(path, state)
        return result
