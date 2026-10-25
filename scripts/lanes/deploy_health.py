"""Production deploy health for Jovie and LogYourBody (closed-loop gap 2026-10-25).

LogYourBody production deploys failed on every run from 2026-10-23 16:14Z (15 runs) and nothing alerted anyone
for about two days. Each repo's production workflow is read every 5 minutes, and one incident key per repo
(`production-deploy:<repo>`) is raised through the doctor's Tracker when either

  * the latest real deploy run failed (the key names the failed streak, when it began, the last success), or
  * production lags main: the last successful deploy's commit is more than BEHIND_COMMITS behind, or the oldest
    commit it lacks is more than BEHIND_MAX_AGE_S old.

The doctor closes the incident when the condition clears, which is the next successful deploy. The same sample is
published in the lanes status feed (`deployHealth`), which is both the Ovie "Production is X behind" source for
LogYourBody and the hosted dead-man receipt (canon/automation-registry.jsonl, gem:deploy-health).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import throughput_sentinel as sentinel

REPOS = {
    "JovieInc/Jovie": {"label": "jovie", "workflow": "production-controller.yml"},
    "JovieInc/LogYourBody": {"label": "lyb", "workflow": "deploy.yml"},
}
REFRESH_S = 300
BEHIND_COMMITS = 15       # Jovie ships ~6 merges/h: 15 is ~2.5h of unshipped main. Tune from stage-timings.
BEHIND_MAX_AGE_S = 7200   # Tim 2026-10-25: more than 2 hours
STALE_S = 1800            # a sample older than this is the sampler's own dead-man
FAILED = {"failure", "timed_out", "startup_failure"}
STREAK_SHOWN = 3


def _epoch(value) -> float | None:
    return sentinel._iso_epoch(value)


def evaluate(repo: str, runs: list[dict], compare: dict | None, now: float) -> dict:
    """One repo's deploy state from its newest-first completed runs and the compare of its last success to main."""
    real = [row for row in runs if row.get("conclusion") == "success" or row.get("conclusion") in FAILED]
    state = {"repo": repo, "runs": len(real), "status": "unknown", "failedStreak": 0, "failingSince": None,
             "lastSuccessAt": None, "lastSuccessSha": None, "lastFailureUrl": None, "behindMain": None,
             "oldestUnshippedAge": None}
    if not real:
        return state
    streak = 0
    for row in real:
        if row.get("conclusion") in FAILED:
            streak += 1
        else:
            break
    success = next((row for row in real if row.get("conclusion") == "success"), None)
    if success:
        state["lastSuccessAt"] = success.get("created_at")
        state["lastSuccessSha"] = success.get("head_sha")
    if streak:
        state.update(status="failing", failedStreak=streak, failingSince=real[streak - 1].get("created_at"),
                     lastFailureUrl=real[0].get("html_url"))
    else:
        state["status"] = "ok"
    if compare and isinstance(compare.get("ahead_by"), int):
        state["behindMain"] = compare["ahead_by"]
        commits = compare.get("commits") or []
        oldest = _epoch(((commits[0] if commits else {}).get("commit") or {}).get("committer", {}).get("date"))
        if oldest is not None:
            state["oldestUnshippedAge"] = max(0, int(now - oldest))
    return state


def reasons(state: dict, now: float) -> list[str]:
    out = []
    if state.get("status") == "failing":
        since = state.get("failingSince")
        last = state.get("lastSuccessAt") or "none in the last runs read"
        out.append(f"{state['failedStreak']} consecutive production deploy failure(s) since {since} (last success {last}; "
                   f"latest failure {state.get('lastFailureUrl')})")
    behind, age = state.get("behindMain"), state.get("oldestUnshippedAge")
    if isinstance(behind, int) and behind > BEHIND_COMMITS:
        out.append(f"production is {behind} commits behind main (limit {BEHIND_COMMITS})")
    if isinstance(age, int) and age > BEHIND_MAX_AGE_S and (behind or 0) > 0:
        out.append(f"the oldest commit production lacks is {age // 60} min old (limit {BEHIND_MAX_AGE_S // 60})")
    return out


def judge(sample: dict | None, now: float) -> dict[str, str]:
    """Stable key -> one-line cause. One incident per repo; a stale sample is its own alert (dead-man)."""
    alerts: dict[str, str] = {}
    if not sample:
        return alerts
    observed = sample.get("observedAt")
    if isinstance(observed, (int, float)) and now - observed > STALE_S:
        alerts["deploy-health-stale"] = (f"production deploy health was last read {int((now - observed) // 60)} min ago "
                                         f"(limit {STALE_S // 60}); a failed deploy would go unnoticed")
    for repo, state in sorted((sample.get("repos") or {}).items()):
        why = reasons(state, now)
        if why:
            alerts[f"production-deploy:{REPOS.get(repo, {}).get('label', repo)}"] = f"{repo}: " + "; ".join(why)
    return alerts


def feed_block(sample: dict | None, now: float) -> dict | None:
    """Public status-feed block: the Ovie tile source and the hosted dead-man receipt."""
    if not sample:
        return None
    repos = {}
    for repo, state in (sample.get("repos") or {}).items():
        repos[repo] = {k: state.get(k) for k in ("status", "failedStreak", "failingSince", "lastSuccessAt", "behindMain",
                                                 "oldestUnshippedAge")}
    alerts = judge(sample, now)
    observed = sample.get("observedAt")
    return {"schema": "jovie-deploy-health/v1",
            "observedAt": datetime.fromtimestamp(observed, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if observed else None,
            "healthy": not alerts, "repos": repos}


def sample(state_dir: Path, now: float, run=None, repos: dict | None = None) -> tuple[dict | None, str | None]:
    """Read every repo (4 REST calls per 5 min at poll priority), cache the sample, keep going past one repo's failure."""
    path = Path(state_dir) / "deploy-health.json"
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < REFRESH_S:
        return cached, None
    out, errors = {}, []
    previous = cached.get("repos") or {}
    for repo, spec in (repos or REPOS).items():
        try:
            runs = sentinel._gh_json(run, f"repos/{repo}/actions/workflows/{spec['workflow']}/runs"
                                          "?branch=main&status=completed&per_page=30").get("workflow_runs") or []
            first = evaluate(repo, runs, None, now)
            compare = None
            if first["lastSuccessSha"]:
                compare = sentinel._gh_json(run, f"repos/{repo}/compare/{first['lastSuccessSha']}...main")
            out[repo] = evaluate(repo, runs, compare, now)
        except Exception as error:  # noqa: BLE001 - an unreadable repo keeps its last state, never reads as healthy-new
            errors.append(f"{repo}: {type(error).__name__}: {str(error)[:100]}")
            if repo in previous:
                out[repo] = previous[repo]
    if not out:
        return cached or None, "; ".join(errors) or "no repos read"
    data = {"observedAt": now if not errors else cached.get("observedAt"), "repos": out}
    if errors:
        data["errors"] = errors
    try:
        path.write_text(json.dumps(data, sort_keys=True))
    except OSError:
        pass
    return data, "; ".join(errors) or None
