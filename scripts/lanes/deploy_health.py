"""Production deploy health for Jovie and LogYourBody (closed-loop gap 2026-10-25).

LogYourBody production deploys failed on every run from 2026-10-23 16:14Z (15 runs) and nothing alerted anyone
for about two days. Each repo's production workflow is read every 5 minutes, and one incident key per repo
(`production-deploy:<repo>`) is raised through the doctor's Tracker when either

  * the latest real deploy run failed (the key names the failed streak, when it began, the last success), or
  * production lags main: the last successful deploy's commit is more than the repo's measured p95 batch size
    behind, or the oldest commit it lacks is older than the repo's measured p95 deploy lag (see REPOS).

The doctor closes the incident when the condition clears, which is the next successful deploy. The same sample is
published in the lanes status feed (`deployHealth`), which is both the Ovie "Production is X behind" source for
LogYourBody and the hosted dead-man receipt (canon/automation-registry.jsonl, gem:deploy-health).
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import deploy_lag
from atomic_state import atomic_write_text
import throughput_sentinel as sentinel

# Lag limits are the measured p95 of NORMAL deploys over the 7 days to 2026-10-25T07:00Z (successful deploy after a
# successful deploy; commits = batch size, age = oldest commit in the batch to deploy completion), not guesses:
#   Jovie (465 runs, 187 samples): commits p50 2 / p95 6 / max 16; age p50 56 min / p95 246 min / max 317 min
#   LogYourBody (50 runs, 34 samples): commits p50 2 / p95 5 / max 5; age p50 36 min / p95 183 min / max 2946 min
# These are SEEDS: deploy_lag.py recomputes the limits weekly from the trailing 7 days of real deploys and they replace
# the seeds once 20 samples exist. Method: each successful deploy that followed a successful deploy, previous head..this head.
REPOS = {
    # Jovie measures from the SHA production actually serves: a Production Controller run concludes `success`
    # when its generation was superseded and nothing deployed (2026-10-29: production sat on 836f596a while
    # superseded runs read as green deploys). Caps bound the measured limits: page Summer once production is
    # more than 60 min or 15 commits behind main, whatever the trailing p95 has drifted to.
    "JovieInc/Jovie": {"label": "jovie", "workflow": "production-controller.yml", "behindCommits": 6, "behindMaxAgeS": 246 * 60,
                       "buildInfoUrl": "https://jov.ie/api/health/build-info", "capCommits": 15, "capAgeS": 3600},
    "JovieInc/LogYourBody": {"label": "lyb", "workflow": "deploy.yml", "behindCommits": 5, "behindMaxAgeS": 183 * 60},
}
REFRESH_S = 300
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


def read_build_info(url: str, opener=urllib.request.urlopen) -> dict | None:
    """The live production build (commitSha, deployedAt ms); None when unreadable, never a guess."""
    try:
        request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "jovie-lanes-deploy-health"})
        with opener(request, timeout=10) as response:  # noqa: S310 (fixed https origin)
            body = json.loads(response.read(8192))
    except (OSError, ValueError):
        return None
    sha = body.get("commitSha") if isinstance(body, dict) else None
    if not (isinstance(sha, str) and len(sha) == 40 and all(c in "0123456789abcdef" for c in sha)):
        return None
    deployed = body.get("deployedAt")
    return {"sha": sha, "deployedAt": deployed / 1000 if isinstance(deployed, (int, float)) and deployed > 0 else None}


def release_sample(previous_sha: str, live: dict, compare: dict) -> dict | None:
    """One release's merge->production lead time from the compare of the previous live SHA to the new one."""
    commits = compare.get("commits") or []
    deployed = live.get("deployedAt")
    if not commits or deployed is None or not isinstance(compare.get("ahead_by"), int):
        return None
    date = lambda row: _epoch(((row or {}).get("commit") or {}).get("committer", {}).get("date"))  # noqa: E731
    oldest, newest = date(commits[0]), date(commits[-1])
    if oldest is None or newest is None:
        return None
    return {"id": live["sha"], "from": previous_sha, "at": deployed, "commits": compare["ahead_by"],
            "leadTimeS": max(0, int(deployed - newest)), "oldestLeadTimeS": max(0, int(deployed - oldest))}


def reasons(state: dict, now: float) -> list[str]:
    spec = REPOS.get(state.get("repo"), {})
    max_commits = state.get("limitCommits", spec.get("behindCommits", 6))
    max_age = state.get("limitAgeS", spec.get("behindMaxAgeS", 246 * 60))
    if spec.get("capCommits"):
        max_commits = min(max_commits, spec["capCommits"])
    if spec.get("capAgeS"):
        max_age = min(max_age, spec["capAgeS"])
    out = []
    if state.get("status") == "failing":
        since = state.get("failingSince")
        last = state.get("lastSuccessAt") or "none in the last runs read"
        out.append(f"{state['failedStreak']} consecutive production deploy failure(s) since {since} (last success {last}; "
                   f"latest failure {state.get('lastFailureUrl')})")
    behind, age = state.get("behindMain"), state.get("oldestUnshippedAge")
    if isinstance(behind, int) and behind > max_commits:
        out.append(f"production is {behind} commits behind main (limit {max_commits})")
    if isinstance(age, int) and age > max_age and (behind or 0) > 0:
        out.append(f"the oldest commit production lacks is {age // 60} min old (limit {max_age // 60})")
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
    return {"schema": "jovie-deploy-health/v1", "limits": sample.get("limits") or {}, "lag": sample.get("lag") or {},
            "observedAt": datetime.fromtimestamp(observed, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if observed else None,
            "healthy": not alerts, "repos": repos}


def sample(state_dir: Path, now: float, run=None, repos: dict | None = None,
           build_info=read_build_info) -> tuple[dict | None, str | None]:
    """Read every repo (4 REST calls per 5 min at poll priority), cache the sample, keep going past one repo's failure."""
    path = Path(state_dir) / "deploy-health.json"
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < REFRESH_S:
        return cached, None
    out, errors, limits, lag = {}, [], dict(cached.get("limits") or {}), dict(cached.get("lag") or {})
    previous = cached.get("repos") or {}
    for repo, spec in (repos or REPOS).items():
        try:
            store = deploy_lag.load(state_dir, spec["label"])
            pages = deploy_lag.BACKLOG_PAGES if store.get("backlog") or not store.get("samples") else 1
            runs = []
            for page in range(1, pages + 1):
                batch = sentinel._gh_json(run, f"repos/{repo}/actions/workflows/{spec['workflow']}/runs"
                                               f"?branch=main&status=completed&per_page={100 if pages > 1 else 30}&page={page}").get("workflow_runs") or []
                runs += batch
                if len(batch) < (100 if pages > 1 else 30):
                    break
            try:  # the measurement never blocks the failure alarm
                store = deploy_lag.update_limits(deploy_lag.collect(store, repo, runs, now, lambda path: sentinel._gh_json(run, path)), now)
                deploy_lag.save(state_dir, spec["label"], store)
            except Exception as error:  # noqa: BLE001
                errors.append(f"{repo} lag: {type(error).__name__}: {str(error)[:80]}")
            limits[repo] = deploy_lag.limits_or_seed(store, spec["behindCommits"], spec["behindMaxAgeS"])
            lag[repo] = deploy_lag.lag_summary(store, now)
            first = evaluate(repo, runs, None, now)
            live = build_info(spec["buildInfoUrl"]) if spec.get("buildInfoUrl") else None
            base = live["sha"] if live else first["lastSuccessSha"]
            compare = None
            if base:
                compare = sentinel._gh_json(run, f"repos/{repo}/compare/{base}...main")
            extra = {"measuredFrom": "build-info" if live else "controller-run"}
            if live:
                extra.update(liveSha=live["sha"], liveDeployedAt=live["deployedAt"])
                prior = (previous.get(repo) or {}).get("liveSha")
                if prior and prior != live["sha"]:
                    try:  # one compare per release; the measurement never blocks the alarm
                        row = release_sample(prior, live, sentinel._gh_json(run, f"repos/{repo}/compare/{prior}...{live['sha']}"))
                        if row:
                            store = deploy_lag.record_release(store, row, now)
                            deploy_lag.save(state_dir, spec["label"], store)
                            lag[repo] = deploy_lag.lag_summary(store, now)
                    except Exception as error:  # noqa: BLE001
                        errors.append(f"{repo} lead time: {type(error).__name__}: {str(error)[:80]}")
            out[repo] = {**evaluate(repo, runs, compare, now), **extra,
                         "limitCommits": limits[repo]["commits"], "limitAgeS": limits[repo]["ageS"]}
        except Exception as error:  # noqa: BLE001 - an unreadable repo keeps its last state, never reads as healthy-new
            errors.append(f"{repo}: {type(error).__name__}: {str(error)[:100]}")
            if repo in previous:
                out[repo] = previous[repo]
    if not out:
        return cached or None, "; ".join(errors) or "no repos read"
    data = {"observedAt": now if not errors else cached.get("observedAt"), "repos": out, "limits": limits, "lag": lag}
    if errors:
        data["errors"] = errors
    try:
        atomic_write_text(path, json.dumps(data, sort_keys=True))
    except OSError:
        pass
    return data, "; ".join(errors) or None
