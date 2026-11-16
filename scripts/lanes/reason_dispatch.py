"""Native reason scheduling: local admission, detached queue check and durable scheduling evidence."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import lifecycle
from atomic_state import atomic_write_text

HERE = Path(__file__).resolve().parent


def schedule_tick(host, lane, spawn=None) -> dict:
    """Request the existing queue check without making code dispatch wait on Linear."""
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    probe = lane.Locked(host.state / "reason.lock", blocking=False)
    try:
        if not probe.held:
            return {"status": "busy"}
    finally:
        probe.release()
    (spawn or subprocess.Popen)([sys.executable, str(HERE / "reason_lane.py"), "tick"],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True, **lifecycle.spawn_kwargs())
    return {"status": "scheduled"}


def tick(host, lane, linear_factory, config: dict, *, queued_jobs, spawn) -> dict:
    """Dispatch hook: a queued job starts a detached drain unless one is already running."""
    probe = lane.Locked(host.state / "reason.lock", blocking=False)
    try:
        if not probe.held:
            return {"status": "running"}
        try:
            jobs = queued_jobs(linear_factory(), config["label"])
        except lane.LinearRateLimited as error:
            return {"status": "linear-rate-limited", "resetAt": error.reset_at}
    finally:
        probe.release()
    if not jobs:
        return {"status": "idle"}
    spawn([sys.executable, str(HERE / "reason_lane.py"), "drain"], stdin=subprocess.DEVNULL,
          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
          **lifecycle.spawn_kwargs())
    return {"status": "spawned", "queued": len(jobs)}


def checked_tick(host, lane, linear_factory, *, check, now_iso) -> dict:
    """Persist scheduling evidence; a spawned drain is not an accepted or completed job."""
    receipt = {"startedAt": now_iso(), "owner": "reason-lane", "status": "checking",
               "nextAction": "Await the existing queue check; retry on the next dispatch tick if its process is lost"}
    path = host.state / "reason-tick.json"
    atomic_write_text(path, json.dumps(receipt))
    try:
        receipt.update(check(host, lane, linear_factory))
        receipt["nextAction"] = ("Retry after the recorded Linear quota reset" if receipt["status"] == "linear-rate-limited"
                                 else "Await accepted run-lease and durable result receipts" if receipt["status"] == "spawned"
                                 else "Observe the existing reason worker or next dispatch tick")
    except (Exception, SystemExit) as error:
        receipt.update(status="blocked", error=f"{type(error).__name__}: {error}"[:200],
                       nextAction="Restore the queue dependency and retry through the existing dispatch tick")
    receipt["observedAt"] = now_iso()
    atomic_write_text(path, json.dumps(receipt))
    return receipt


