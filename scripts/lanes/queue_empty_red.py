"""Empty-queue stall: a merge queue with nothing in it is not healthy when the last merge groups were red.

2026-11-10 20:11Z to 2026-11-11 04:13Z: one test expired by the clock and failed every merge group. The queue
breaker and the failure hold ejected each entry, so queue depth was 0, and `throughput-queue-no-merge`
(scripts/lanes/throughput_sentinel.py), which needs depth > 0, read healthy for eight hours with zero merges.

  throughput-queue-empty-red   queue empty, zero merges in the last 60 min, the newest decided merge group failed,
                               and either most of the last groups failed on several PRs or held PRs wait

One REST read per 5 minutes through the sentinel's budgeted gh reader. Composed by health_checks like the other
providers; the doctor's Tracker routes the alert.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from atomic_state import atomic_write_text
import throughput_sentinel as sentinel

REPO = "JovieInc/Jovie"
GROUP_OUTCOMES_FILE, GROUP_OUTCOMES_REFRESH_S, GROUP_OUTCOMES_RUNS = "merge-group-outcomes.json", 300, 6
EMPTY_RED_MIN_FAILED, EMPTY_RED_MIN_PRS, EMPTY_RED_HELD, EMPTY_RED_FRESH_S = 3, 2, 3, 6 * 3600
GROUP_BRANCH_PR = "gh-readonly-queue/main/pr-"


def sample(state: Path, now: float, run=None, repo: str = REPO) -> tuple[dict | None, str | None]:
    """Conclusions of the newest GROUP_OUTCOMES_RUNS decided merge groups (success or failure; a cancelled or
    skipped group says nothing), whatever their age: one REST read per 5 min. The release-flow sampler only looks
    at the trailing hour, which is empty exactly when a red main has emptied the queue."""
    path = Path(state) / GROUP_OUTCOMES_FILE
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < GROUP_OUTCOMES_REFRESH_S:
        return cached, None
    try:
        rows = sentinel._gh_json(run, f"repos/{repo}/actions/workflows/ci.yml/runs?event=merge_group&status=completed&per_page=30")
        decided = [row for row in sorted(rows.get("workflow_runs") or [], key=lambda r: str(r.get("updated_at")), reverse=True)
                   if row.get("conclusion") in ("success", "failure", "timed_out", "startup_failure")][:GROUP_OUTCOMES_RUNS]
        failed = [row for row in decided if row.get("conclusion") != "success"]
        prs = set()
        for row in failed:
            branch = str(row.get("head_branch") or "")
            if branch.startswith(GROUP_BRANCH_PR):
                prs.add(branch[len(GROUP_BRANCH_PR):].split("-")[0])
        last_green = next((row for row in decided if row.get("conclusion") == "success"), None)
        signal = {"schema": "symphony-merge-group-outcomes/v1", "observedAt": now, "decided": len(decided),
                  "failed": len(failed), "failedPrs": sorted(prs),
                  "newestConclusion": decided[0].get("conclusion") if decided else None,
                  "newestEndedAt": sentinel._iso_epoch(decided[0].get("updated_at")) if decided else None,
                  "lastGreenAt": sentinel._iso_epoch(last_green.get("updated_at")) if last_green else None,
                  "failedRunIds": [row.get("id") for row in failed][:3]}
        atomic_write_text(path, json.dumps(signal, sort_keys=True))
        return signal, None
    except (OSError, ValueError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
        return (cached or None), f"{type(error).__name__}: {error}"[:200]


def judge(obs: dict) -> dict[str, str]:
    """Stable key -> one-line cause. `obs` is the doctor observation (mergeThroughput, sentinel.supplyFlow, groupOutcomes)."""
    alerts: dict[str, str] = {}
    merge = obs.get("mergeThroughput") or {}
    supply = (obs.get("sentinel") or {}).get("supplyFlow") or {}
    groups = obs.get("groupOutcomes") or {}
    now = obs.get("now") or 0
    # 2a. An EMPTY queue is not a healthy queue when the last groups were red: once the breaker and the failure hold
    # eject everything, depth is 0 and rule 2 can never fire (2026-11-10, 8 h, zero merges). The stall is "nothing
    # merged, the newest decided group failed, and either most recent groups failed on several PRs or held PRs wait".
    if isinstance(merge.get("observedAt"), (int, float)) and now - merge["observedAt"] < 1800 \
            and merge.get("queueDepth") == 0 and merge.get("mergedPerHour") == 0 \
            and isinstance(groups.get("observedAt"), (int, float)) and now - groups["observedAt"] < 900 \
            and groups.get("newestConclusion") not in (None, "success"):
        failed, decided = groups.get("failed") or 0, groups.get("decided") or 0
        fresh_supply = isinstance(supply.get("observedAt"), (int, float)) and now - supply["observedAt"] < 900
        held = (supply.get("counts") or {}).get("held", 0) if fresh_supply else 0
        waiting = held + (len(supply.get("cleanUnqueued") or []) if fresh_supply else 0)
        mostly_red = failed >= EMPTY_RED_MIN_FAILED and failed * 2 > decided \
            and len(groups.get("failedPrs") or []) >= EMPTY_RED_MIN_PRS
        recent = now - (groups.get("newestEndedAt") or 0) < EMPTY_RED_FRESH_S
        # Held PRs alone count only while the newest failed group is recent: a stale red group plus PRs held for
        # other reasons (an operator hold, a lane-fix-red label) is not evidence that main is red now.
        if (mostly_red and (recent or waiting)) or (held >= EMPTY_RED_HELD and recent):
            alerts["throughput-queue-empty-red"] = (
                f"stage queued->merged: the merge queue is empty and nothing merged in the last 60 min, but {failed} of the last "
                f"{decided} decided merge groups failed (PRs {', '.join('#' + n for n in (groups.get('failedPrs') or [])[:6]) or 'unknown'}; "
                f"runs {groups.get('failedRunIds')}) and {held} held + {waiting - held} green-unqueued PR(s) wait: main itself is "
                "probably red, so re-enqueueing cannot help. Fix main (queue_breaker files the merge-group-shared intake; "
                "main-red-eject raises the incident); do not edit the victim PRs")
    return alerts
