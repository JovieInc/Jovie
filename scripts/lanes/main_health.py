"""Main health: page Summer the moment a certification check fails on main itself (2026-10-29).

PR gates diff only what a PR touches, so a merge that changed certified source without renewing its evidence
left `design-surface-census` red on main for every later PR for hours, and nothing paged anyone. The hosted
`Main Health` workflow (.github/workflows/main-health.yml) runs scripts/main-health.mjs on every push to main. The
doctor reads that workflow's latest completed run every 5 minutes (one REST call, poll priority) and raises one
incident key, `main-health`, through the same Tracker as production-deploy while the newest completed run failed.
It clears itself when a later run passes, which is the renewal merging.

2026-11-11: the workflow only ran on pushes, so a main that went red by the clock (a test with an expired date) or
while nothing merged was never re-tested: 2026-11-10 20:11Z to 04:13Z, zero merges, no Main Health run, no incident.
Admission and landing workflows may not run from cron, so the clock lives here like the Green Enroll backstop:
`idle_probe` dispatches the workflow on main when its newest run is older than IDLE_PROBE_S, at most once per
IDLE_PROBE_S. A dispatched run also runs the script contracts (scripts/main-health.mjs --structural), and the sampler
reads dispatch runs on main as well as push runs.
"""
from __future__ import annotations

import json
from pathlib import Path

from atomic_state import atomic_write_text
import throughput_sentinel as sentinel

REPO = "JovieInc/Jovie"
WORKFLOW = "main-health.yml"
REFRESH_S = 300
FAILED = {"failure", "timed_out", "startup_failure"}
IDLE_PROBE_S, IDLE_PROBE_FILE = 3600, "main-health-idle-probe.json"
EVENTS = ("push", "workflow_dispatch")


def evaluate(runs: list[dict]) -> dict:
    """Newest-first completed runs -> state. A cancelled or skipped run says nothing about main."""
    real = [row for row in runs if row.get("event", "push") in EVENTS
            and (row.get("conclusion") == "success" or row.get("conclusion") in FAILED)]
    if not real:
        return {"status": "unknown", "failedStreak": 0}
    streak = 0
    for row in real:
        if row.get("conclusion") in FAILED:
            streak += 1
        else:
            break
    newest = real[0]
    state = {"status": "failing" if streak else "ok", "failedStreak": streak, "sha": newest.get("head_sha"),
             "url": newest.get("html_url"), "at": newest.get("created_at")}
    if streak:
        state["failingSince"] = real[streak - 1].get("created_at")
        state["failingSha"] = real[streak - 1].get("head_sha")
    return state


def judge(sample: dict | None) -> dict[str, str]:
    """Stable key -> one-line cause. One incident, cleared by the next green main-health run."""
    if not sample or sample.get("status") != "failing":
        return {}
    since = sample.get("failingSince")
    return {"main-health": (
        f"main is red on certification checks: {sample['failedStreak']} consecutive Main Health failure(s) since {since} "
        f"(first bad commit {str(sample.get('failingSha'))[:9]}; latest {sample.get('url')}). Every PR whose CI runs the "
        "script-contracts tests fails until it is repaired; Surface Recertify opens the renewal PR for stale census rows")}


def feed_block(sample: dict | None) -> dict | None:
    if not sample:
        return None
    return {"schema": "jovie-main-health/v1", "healthy": sample.get("status") != "failing",
            **{key: sample.get(key) for key in ("status", "failedStreak", "failingSince", "sha", "url")}}


def sample(state_dir: Path, now: float, run=None) -> tuple[dict | None, str | None]:
    """One read per 5 minutes; an unreadable API keeps the last state and reports the error."""
    path = Path(state_dir) / "main-health.json"
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < REFRESH_S:
        return cached, None
    try:
        runs = sentinel._gh_json(run, f"repos/{REPO}/actions/workflows/{WORKFLOW}/runs"
                                      "?branch=main&status=completed&per_page=10").get("workflow_runs") or []
    except Exception as error:  # noqa: BLE001 - never reads as healthy-new
        return cached or None, f"{type(error).__name__}: {str(error)[:100]}"
    newest = max((at for row in runs if row.get("event", "push") in EVENTS
                  and (at := sentinel._iso_epoch(row.get("created_at"))) is not None), default=None)
    data = {**evaluate(runs), "observedAt": now, "newestRunAt": newest}
    try:
        atomic_write_text(path, json.dumps(data, sort_keys=True))
    except OSError:
        pass
    return data, None


def idle_probe(state_dir: Path, data: dict | None, now: float, run=None) -> dict | None:
    """Dispatch Main Health on main when nothing has run it for IDLE_PROBE_S (no push, so nothing re-tested main).
    Read-only workflow, one dispatch per IDLE_PROBE_S at most; a fresh sample is required so an unreadable API
    never dispatches blind. Returns the receipt of the dispatch made this call, else None."""
    if not data or not isinstance(data.get("observedAt"), (int, float)) or now - data["observedAt"] > 2 * REFRESH_S:
        return None
    if "newestRunAt" not in data:  # a sample cached by an older reader carries no run age
        return None
    newest = data.get("newestRunAt")
    if isinstance(newest, (int, float)) and now - newest < IDLE_PROBE_S:
        return None
    path = Path(state_dir) / IDLE_PROBE_FILE
    try:
        last = json.loads(path.read_text())
    except (OSError, ValueError):
        last = {}
    if isinstance(last.get("at"), (int, float)) and 0 <= now - last["at"] < IDLE_PROBE_S:
        return None
    run = run or sentinel._budgeted_gh
    try:
        done = run(["workflow", "run", WORKFLOW, "-R", REPO, "--ref", "main"], capture_output=True, text=True, timeout=60)
        receipt = {"at": now, "idleS": round(now - newest) if isinstance(newest, (int, float)) else None,
                   "ok": done.returncode == 0,
                   "error": None if done.returncode == 0 else (done.stderr or done.stdout or "")[-160:]}
    except Exception as error:  # noqa: BLE001 - a failed dispatch must never break the doctor tick
        receipt = {"at": now, "idleS": None, "ok": False, "error": f"{type(error).__name__}: {error}"[:160]}
    try:
        atomic_write_text(path, json.dumps(receipt, sort_keys=True))
    except OSError:
        pass
    return receipt
