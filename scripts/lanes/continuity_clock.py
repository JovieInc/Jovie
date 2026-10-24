"""Drive cadence-bound GitHub workflows from Gem's lanes tick (JOV-6909).

GitHub delivered this repository's sub-daily crons only about every 6 h
(2026-10-10..12 median gap 311-452 min for */5, */10, */15 and hourly), so a
workflow whose purpose depends on its cadence needs a clock that actually fires.
The lanes tick is that clock; each workflow keeps its GitHub cron as a backstop.

The clock fires `repository_dispatch` (the Jovie Bot installation token has
contents:write but not actions:write, so `workflow_dispatch` returned 403).
Only the dispatched workflow probes or reports. This adapter records dispatch
requests, never check-ins or successful observations.
"""
from __future__ import annotations

import fcntl
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
import subprocess
import time
from datetime import datetime

SCHEMA = "jovie-continuity-clock/v1"
REPO = "repos/JovieInc/Jovie"
DISPATCHES = REPO + "/dispatches"
UNCERTAIN_S = 900
# The tick runs about every 5 min and records time after dispatch work, so a
# deadline met a few seconds late must not slip a whole tick.
SLACK_S = 60
ACTIVE = frozenset({"queued", "in_progress", "requested", "waiting", "pending"})
# Every clocked job times out within 20 min. An "active" run older than this is a
# GitHub ghost (sentry-autofix-recurrence run 37655501164 sat "queued" from
# 2026-10-07, uncancellable), and must not block its clock forever.
GHOST_ACTIVE_S = 6 * 3600
CLOCK_EVENTS = frozenset({"schedule", "workflow_dispatch", "repository_dispatch"})


@dataclass(frozen=True)
class Clock:
    name: str
    workflow: str
    event_type: str
    interval_s: int
    state_file: str
    # Other triggers whose runs also count as a fresh invocation.
    extra_events: frozenset = frozenset()
    # False: the workflow has no GitHub cron backstop (JOV-INV-042), so this clock is its only
    # trigger and an empty run history means it has never run and is due, not unobservable.
    github_cron: bool = True

    @property
    def endpoint(self) -> str:
        return f"{REPO}/actions/workflows/{self.workflow}"


CLOCKS = (
    # Vercel spend pauses and outages on Jovie and Summer (production-continuity.yml).
    # workflow_run is historical: PR19436 removed it, but GitHub still returns those runs.
    Clock("continuity", "production-continuity.yml", "clock_production_continuity", 300,
          "continuity-clock.json", frozenset({"workflow_run"})),
    # An offline self-hosted runner emits no event; the queued heartbeat is the signal.
    Clock("runnerHeartbeat", "runner-heartbeat.yml", "clock_runner_heartbeat", 600,
          "runner-heartbeat-clock.json", frozenset({"push"})),
    # The hosted observer of that heartbeat.
    Clock("runnerHealth", "runner-health-monitor.yml", "clock_runner_health_monitor", 600,
          "runner-health-clock.json"),
    # Runaway production event volume (cost) can start with no deploy.
    Clock("costAnomaly", "cost-anomaly-gate.yml", "clock_cost_anomaly_gate", 900,
          "cost-anomaly-clock.json"),
    # Resolve or reopen autofixed incidents once their 45-minute post-deploy soak elapses.
    Clock("sentryRecurrence", "sentry-autofix-recurrence.yml", "clock_sentry_autofix_recurrence", 3600,
          "sentry-recurrence-clock.json"),
    # Weekly archive-then-delete of stale remote branches (7,752 on 2026-10-20). A clock event
    # applies unless client_payload.apply is false; the bot token cannot send workflow_dispatch.
    Clock("staleBranchSweep", "stale-branch-sweep.yml", "clock_stale_branch_sweep", 7 * 86400,
          "stale-branch-sweep-clock.json", github_cron=False),
)
CONTINUITY = CLOCKS[0]


def api(run, args):
    result = run(["gh", "api", *args], capture_output=True, text=True, timeout=10)
    if result.returncode:
        # API output can contain credentials or private infrastructure details.
        raise RuntimeError("continuity-api-failed")
    return result.stdout


def observe(run, now: float, clock: Clock = CONTINUITY) -> dict:
    endpoint = clock.endpoint
    data = json.loads(api(run, [endpoint + "/runs?branch=main&per_page=30"]))
    rows = data.get("workflow_runs")
    if isinstance(rows, list) and not rows and not clock.github_cron and data.get("total_count") == 0:
        return {"status": "overdue", "runId": None, "ageSeconds": None, "neverRun": True}
    if not isinstance(rows, list) or not rows:
        raise ValueError("workflow-runs-unobservable")
    observations = []
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get("id"), int)
                or row.get("head_branch") != "main"
                or row.get("event") not in CLOCK_EVENTS | clock.extra_events
                or row.get("status") not in ACTIVE | {"completed"}):
            raise ValueError("workflow-run-invalid")
        created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        if created.tzinfo is None or created.timestamp() > now + 60:
            raise ValueError("workflow-run-clock-invalid")
        observations.append((created.timestamp(), row))
    active = next((row for at, row in observations
                   if row["status"] in ACTIVE and now-at < GHOST_ACTIVE_S), None)
    if active:
        return {"status": "active", "runId": active["id"]}
    at, latest = max(observations, key=lambda item: item[0])
    due = now-at >= clock.interval_s - SLACK_S
    if due:
        # A long-running invocation can fall outside the recent window. Check it
        # separately before dispatch; the workflow concurrency group handles the
        # final race with a new native schedule invocation.
        running = json.loads(api(run, [endpoint + "/runs?branch=main&status=in_progress&per_page=1"]))
        if not isinstance(running.get("workflow_runs"), list):
            raise ValueError("active-runs-unobservable")
        if running["workflow_runs"]:
            return {"status": "active"}
    return {"status": "overdue" if due else "current",
            "runId": latest["id"], "ageSeconds": max(0, int(now-at))}


def save(path: Path, state: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, sort_keys=True))
    os.replace(temporary, path)


def tick_one(state_dir: Path, clock: Clock, run, now: float) -> dict:
    path = state_dir / clock.state_file
    with path.with_suffix(".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "busy"}
        try:
            state = json.loads(path.read_text()) if path.exists() else {"schema": SCHEMA, "nextAttemptAt": 0}
            next_at = state["nextAttemptAt"]
            if (state["schema"] != SCHEMA or type(next_at) not in (int, float)
                    or not math.isfinite(next_at) or next_at < 0
                    or next_at > now + max(UNCERTAIN_S, clock.interval_s)):
                raise ValueError("invalid-clock-state")
        except (OSError, ValueError, TypeError, KeyError):
            # Never reset an unreadable dispatch budget to zero.
            return {"status": "state-unobservable"}
        if now < next_at - SLACK_S:
            return {"status": "cooldown", "nextAttemptAt": next_at, "lastResult": state.get("lastResult")}
        # Persist before any network call: crashes cannot create a minute retry storm.
        state.update(nextAttemptAt=now + clock.interval_s, checkedAt=now)
        save(path, state)
        try:
            result = observe(run, now, clock)
        except (OSError, subprocess.SubprocessError, ValueError, TypeError, KeyError, AttributeError, RuntimeError) as error:
            result = {"status": "failed", "error": type(error).__name__}
        if result["status"] == "overdue":
            state.update(nextAttemptAt=now + UNCERTAIN_S,
                         lastResult={"status": "dispatch-uncertain", "requestedAt": now})
            save(path, state)
            try:
                api(run, ["--method", "POST", DISPATCHES, "-f", f"event_type={clock.event_type}"])
                result = {**result, "status": "dispatch-requested", "requestedAt": now}
                state["nextAttemptAt"] = now + clock.interval_s
            except (OSError, subprocess.SubprocessError, RuntimeError) as error:
                result = {**result, "status": "dispatch-uncertain", "error": type(error).__name__}
        state["lastResult"] = result
        save(path, state)
        return result


def tick(state_dir: Path, hostname: str, run=subprocess.run, now: float | None = None,
         clocks: tuple = CLOCKS) -> dict:
    """The continuity result, with every other clock's result under `clocks`."""
    if hostname != "gem":
        return {"status": "not-owner", "owner": "gem"}
    now = time.time() if now is None else now
    state_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    for clock in clocks:
        try:
            results[clock.name] = tick_one(state_dir, clock, run, now)
        except OSError as error:  # one clock's lock or state file never stops the others
            results[clock.name] = {"status": "failed", "error": type(error).__name__}
    result = dict(results.pop(CONTINUITY.name, {"status": "not-configured"}))
    if results:
        result["clocks"] = results
    return result
