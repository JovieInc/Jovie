"""Backstop Merge Queue Green Enroll from Gem's minute tick.

GitHub cron in this repo fires every 4-7 h, not every 15 min (the */15 enroll
sweep ran 5 times in 21 h on 2026-10-11), so a green PR whose dequeue left no
event wake could sit unqueued for hours. This reads only the lanes' cached
open-PR inventory (no new GitHub reads) and, when it holds ready PRs whose
required checks are green and which are not queued, asks the enroll workflow
for a full reconcile through repository_dispatch with the lanes' bot token. The
workflow stays the only enqueue authority; this module only wakes it.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import subprocess
import time
from pathlib import Path

SCHEMA = "jovie-enroll-backstop/v1"
# Jovie Bot has contents: write but only actions: read, so workflow_dispatch is refused;
# the enroll workflow runs its full reconcile on this repository_dispatch type instead.
ENDPOINT = "repos/JovieInc/Jovie/dispatches"
EVENT_TYPE = "enroll-reconcile"
# At most one reconcile per 12 minutes, and once an hour while the same PRs at
# the same heads stay unqueued (the enroll saw them and declined, e.g. a
# failure hold), so a stuck candidate cannot spend the bot budget every tick.
INTERVAL_S = 720
UNCHANGED_S = 3600
# Rows older than this are not current enough to justify a wake.
INVENTORY_MAX_AGE_S = 600
# GitHub reads BLOCKED while a required check is pending or red; these states
# mean every required check is green and the head has no conflict. Same set
# and blocking labels as the enroll workflow.
ADMISSIBLE = frozenset({"CLEAN", "HAS_HOOKS", "UNSTABLE"})
BLOCKING = frozenset({"hold", "gated", "incident", "do-not-merge", "queue-poison"})


def candidates(prs: list) -> list[dict]:
    """Ready, same-repo, main-based PRs with green required checks, not queued or blocked."""
    found = []
    for pr in prs:
        if (not isinstance(pr, dict) or pr.get("isDraft") is not False
                or pr.get("isInMergeQueue") is not False or pr.get("isCrossRepository") is not False
                or pr.get("baseRefName") != "main" or pr.get("mergeStateStatus") not in ADMISSIBLE):
            continue
        labels = {str((label or {}).get("name", "")).lower() for label in pr.get("labels") or []}
        if labels & BLOCKING:
            continue
        if isinstance(pr.get("number"), int) and isinstance(pr.get("headRefOid"), str):
            found.append({"number": pr["number"], "headRefOid": pr["headRefOid"]})
    return sorted(found, key=lambda row: row["number"])


def fingerprint(rows: list[dict]) -> str:
    text = ",".join(f"{row['number']}:{row['headRefOid']}" for row in rows)
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def read_inventory(path: Path, now: float) -> list | None:
    try:
        cached = json.loads(path.read_text())
        at, value = cached["at"], cached["value"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if type(at) not in (int, float) or not math.isfinite(at) or not 0 <= now - at <= INVENTORY_MAX_AGE_S:
        return None
    return value if isinstance(value, list) else None


def save(path: Path, state: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, sort_keys=True))
    os.replace(temporary, path)


def tick(state_dir: Path, inventory: Path, hostname: str, run=subprocess.run,
         now: float | None = None) -> dict:
    if hostname != "gem":
        return {"status": "not-owner", "owner": "gem"}
    now = time.time() if now is None else now
    prs = read_inventory(inventory, now)
    if prs is None:
        return {"status": "inventory-unavailable"}
    rows = candidates(prs)
    if not rows:
        return {"status": "idle"}
    state_dir.mkdir(parents=True, exist_ok=True)
    path = state_dir / "enroll-backstop.json"
    with (state_dir / "enroll-backstop.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "busy"}
        try:
            state = json.loads(path.read_text()) if path.exists() else {"schema": SCHEMA, "dispatchedAt": 0}
            last = state["dispatchedAt"]
            if (state["schema"] != SCHEMA or type(last) not in (int, float) or not math.isfinite(last)
                    or last < 0 or last > now + 60):
                raise ValueError("invalid-backstop-state")
        except (OSError, ValueError, TypeError, KeyError):
            # Never reset an unreadable dispatch budget to zero.
            return {"status": "state-unobservable"}
        key = fingerprint(rows)
        wait = UNCHANGED_S if state.get("fingerprint") == key else INTERVAL_S
        numbers = [row["number"] for row in rows]
        if now - last < wait:
            return {"status": "cooldown", "candidates": numbers, "nextAttemptAt": last + wait}
        # Persist before the network call: a crash cannot turn into a minute retry storm.
        state.update(dispatchedAt=now, fingerprint=key, candidates=numbers)
        save(path, state)
        try:
            result = run(["gh", "api", "--method", "POST", ENDPOINT, "-f", f"event_type={EVENT_TYPE}"],
                         capture_output=True, text=True, timeout=10)
            ok = result.returncode == 0
        except (OSError, subprocess.SubprocessError):
            ok = False
        # API output can carry credentials or infrastructure details; keep only the outcome.
        status = "dispatch-requested" if ok else "dispatch-failed"
        state["lastResult"] = {"status": status, "at": now}
        save(path, state)
        return {"status": status, "candidates": numbers}
