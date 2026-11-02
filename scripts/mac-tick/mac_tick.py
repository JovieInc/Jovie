#!/usr/bin/env python3
"""One Mac launchd agent for every periodic Mac job (compounding, 2026-10-31).

launchd starts this every 5 minutes; it runs the tasks in tasks.json that are
due, each with its own timeout, and records a per-task receipt so a silent task
is visible (state.json: lastRunAt, lastOkAt, failures, ms). A failing task never
stops the others. Kill switches: touch ~/.local/state/mac-tick/disabled (all tasks) or
a task's own `disabledFile` (for example ~/.local/state/capacity/disabled).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

SLACK_S = 30  # launchd jitter must not skip a whole interval


def is_due(task: dict, state: dict, now: float) -> bool:
    last = state.get(task["id"], {}).get("lastRunAt")
    return last is None or now - last >= task["everyMin"] * 60 - SLACK_S


def overdue(tasks: list, state: dict, now: float) -> list:
    """Tasks with no success for 3 intervals; never-succeeded counts as overdue."""
    out = []
    for task in tasks:
        ok = state.get(task["id"], {}).get("lastOkAt")
        if ok is None or now - ok > 3 * task["everyMin"] * 60 + 60:
            out.append(task["id"])
    return out


def task_disabled(task: dict, ctx: dict) -> bool:
    """A task's own kill switch, so documented per-job switches still work."""
    path = task.get("disabledFile")
    return bool(path) and Path(expand(path, ctx)).exists()


def expand(value: str, ctx: dict) -> str:
    for key, val in ctx.items():
        value = value.replace("{" + key + "}", val)
    return value


def run_task(task: dict, ctx: dict, run=subprocess.run) -> tuple[bool, float]:
    started = time.monotonic()
    env = {**os.environ, **{k: expand(v, ctx) for k, v in task.get("env", {}).items()}}
    try:
        result = run([expand(a, ctx) for a in task["argv"]], env=env, capture_output=True,
                     timeout=task.get("timeoutS", 300))
        ok = result.returncode in task.get("okCodes", [0])
    except (OSError, subprocess.SubprocessError):
        ok = False
    return ok, round((time.monotonic() - started) * 1000)


def tick(tasks: list, state: dict, ctx: dict, now: float, run=subprocess.run) -> dict:
    for task in tasks:
        if not is_due(task, state, now) or task_disabled(task, ctx):
            continue
        ok, ms = run_task(task, ctx, run)
        prev = state.get(task["id"], {})
        state[task["id"]] = {
            "lastRunAt": now,
            "lastOkAt": now if ok else prev.get("lastOkAt"),
            "failures": 0 if ok else prev.get("failures", 0) + 1,
            "ms": ms,
        }
    return state


def main() -> int:
    home = Path.home()
    state_dir = home / ".local/state/mac-tick"
    if (state_dir / "disabled").exists():
        return 0
    state_dir.mkdir(parents=True, exist_ok=True)
    tasks = json.loads((Path(__file__).with_name("tasks.json")).read_text())["tasks"]
    ctx = {"share": str(home / ".local/share"), "state": str(home / ".local/state"), "capacity_host": os.environ.get("CAPACITY_HOST", "mac")}
    path = state_dir / "state.json"
    try:
        state = json.loads(path.read_text())
    except (OSError, ValueError):
        state = {}
    now = time.time()
    state = tick(tasks, state, ctx, now)
    receipt = {"schema": "jovie-mac-tick/v1", "at": now, "overdue": overdue(tasks, state, now), "tasks": state}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(receipt["tasks"]))
    os.replace(tmp, path)
    (state_dir / "receipt.json").write_text(json.dumps(receipt))
    return 0


if __name__ == "__main__":
    sys.exit(main())
