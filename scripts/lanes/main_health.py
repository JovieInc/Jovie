"""Main health: page Summer the moment a certification check fails on main itself (2026-10-29).

PR gates diff only what a PR touches, so a merge that changed certified source without renewing its evidence
left `design-surface-census` red on main for every later PR for hours, and nothing paged anyone. The hosted
`Main Health` workflow (.github/workflows/main-health.yml) runs scripts/main-health.mjs on every push to main. The
doctor reads that workflow's latest completed run every 5 minutes (one REST call, poll priority) and raises one
incident key, `main-health`, through the same Tracker as production-deploy while the newest completed run failed.
It clears itself when a later run passes, which is the renewal merging. A sample older than STALE_S is not raised:
the workflow only runs on pushes, so silence between pushes is normal; the lanes dead-man owns a dead reader.
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


def evaluate(runs: list[dict]) -> dict:
    """Newest-first completed runs -> state. A cancelled or skipped run says nothing about main."""
    real = [row for row in runs if row.get("conclusion") == "success" or row.get("conclusion") in FAILED]
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
                                      "?branch=main&event=push&status=completed&per_page=10").get("workflow_runs") or []
    except Exception as error:  # noqa: BLE001 - never reads as healthy-new
        return cached or None, f"{type(error).__name__}: {str(error)[:100]}"
    data = {**evaluate(runs), "observedAt": now}
    try:
        atomic_write_text(path, json.dumps(data, sort_keys=True))
    except OSError:
        pass
    return data, None
