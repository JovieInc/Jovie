"""Release-evidence and stale-production detectors (closed-loop gap 2026-11-01).

On 2026-11-01 the `Golden Path (manual)` job in main push CI was red on 8 consecutive main runs (da3ef52 to
fc2f650). The workflow run itself still concluded `success`, so nothing read it, and the Production Controller
blocked every release at the auth/billing journey gate for hours until someone traced it by hand (#24184).
Production meanwhile sat on one build while main advanced. Two doctor incident keys, raised through the
doctor's Tracker and routed by Summer's detector loop:

  * `production-deploy:release-evidence-red:<job>` (Urgent, P0): a release-evidence job is red on two or more
    consecutive completed main push CI runs. The issue names the job, the failing specs read from the newest
    failing job log, and the first bad SHA (the oldest run of the red streak), so a code-capable owner can act.
  * `production-deploy:build-stale` (High, P1): https://jov.ie/api/version has served the same buildId for more
    than 2h while main has advanced past it.

Both clear themselves when the condition clears (the next green evidence run; a new production build).

api-budget: github-user-core 48/hr - doctor tick every 5 min: 1 main push CI runs read, 1 main commit read, jobs of new completed runs (about 1 per tick, cached by run id), and 1 job-log read per new failing job once a streak is an incident
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

import throughput_sentinel as sentinel
from atomic_state import atomic_write_text

REPO = "JovieInc/Jovie"
# The CI jobs whose result is release evidence: the Production Controller's journey gate
# (scripts/lib/promotion-journey-evidence.mjs, REQUIRED_JOURNEYS auth + billing) reads the Playwright
# journeys that run in `Golden Path (manual)`; scripts/lib/merge-queue-guard.mjs lists the same job.
RELEASE_EVIDENCE_JOBS = {"Golden Path (manual)": "golden-path"}
RED_STREAK = 2
RUNS_READ = 8
FAILED = {"failure", "timed_out", "startup_failure", "cancelled"}
VERSION_URL = "https://jov.ie/api/version"
STALE_BUILD_S = 2 * 3600
REFRESH_S = 300
SPEC_LINE = re.compile(r"(tests/[\w./-]+\.spec\.ts(?::\d+)?)")
STATE_FILE = "release-evidence.json"


def job_conclusions(runs: list[dict], jobs_of) -> list[dict]:
    """Newest-first rows {runId, sha, at, url, jobs: {slug: (conclusion, jobId)}} for completed main push runs."""
    rows = []
    for run in runs[:RUNS_READ]:
        if run.get("status") != "completed":
            continue
        jobs = {}
        for job in jobs_of(run["id"]):
            slug = RELEASE_EVIDENCE_JOBS.get(job.get("name"))
            if slug:
                jobs[slug] = (job.get("conclusion"), job.get("id"), job.get("html_url"))
        rows.append({"runId": run["id"], "sha": run.get("head_sha"), "at": run.get("created_at"),
                     "url": run.get("html_url"), "jobs": jobs})
    return rows


def red_streaks(rows: list[dict]) -> dict[str, dict]:
    """Per evidence job: the consecutive red streak from the newest run that ran the job.

    A run that skipped the job (or did not run it) is no evidence either way and neither breaks nor extends the
    streak; the first green run ends it. `firstBadSha` is the oldest run of the streak.
    """
    out: dict[str, dict] = {}
    for slug in RELEASE_EVIDENCE_JOBS.values():
        streak: list[dict] = []
        bounded = False
        for row in rows:
            conclusion, job_id, job_url = row["jobs"].get(slug, (None, None, None))
            if conclusion in FAILED:
                streak.append({**row, "jobId": job_id, "jobUrl": job_url})
            elif conclusion == "success":
                bounded = True
                break
        if streak:
            out[slug] = {"count": len(streak), "newestSha": streak[0]["sha"], "firstBadSha": streak[-1]["sha"],
                         "firstBadAt": streak[-1]["at"], "newestJobId": streak[0]["jobId"],
                         "newestJobUrl": streak[0]["jobUrl"] or streak[0]["url"],
                         # False when no green run is inside the read window: the streak may be longer than what was read.
                         "bounded": bounded, "shas": [row["sha"] for row in streak]}
    return out


def carry_streak(current: dict, prior: dict | None) -> dict:
    """Keep the true first bad SHA once a streak outgrows the read window (2026-11-01 replay: it drifted).

    When no green run is in the window and the previous tick saw the same streak (its newest red SHA is still in
    this streak, or older than everything read), the first bad SHA and its time come from the previous tick and the
    count grows by the reds that are new since then.
    """
    if current.get("bounded") or not prior or not prior.get("firstBadSha"):
        return current
    shas = current.get("shas") or []
    newer = shas.index(prior.get("newestSha")) if prior.get("newestSha") in shas else len(shas)
    return {**current, "firstBadSha": prior["firstBadSha"], "firstBadAt": prior.get("firstBadAt"),
            "count": max(current["count"], int(prior.get("count") or 0) + newer)}


def failing_specs(log_text: str, limit: int = 5) -> list[str]:
    """Playwright/Vitest spec paths on failure lines of a job log, most frequent first."""
    counts: dict[str, int] = {}
    for line in log_text.splitlines():
        if not re.search(r"(✘|✗|×|FAIL|failed|Error:)", line):
            continue
        for spec in SPEC_LINE.findall(line):
            counts[spec] = counts.get(spec, 0) + 1
    return [spec for spec, _ in sorted(counts.items(), key=lambda kv: -kv[1])][:limit]


def read_version(url: str = VERSION_URL, opener=urllib.request.urlopen) -> str | None:
    """The live production buildId (short SHA); None when unreadable, never a guess."""
    try:
        request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "jovie-lanes-release-evidence"})
        with opener(request, timeout=10) as response:  # noqa: S310 (fixed https origin)
            body = json.loads(response.read(4096))
    except (OSError, ValueError):
        return None
    build = body.get("buildId") if isinstance(body, dict) else None
    return build if isinstance(build, str) and re.fullmatch(r"[0-9a-f]{7,40}", build) else None


def build_staleness(previous: dict, build_id: str | None, main_sha: str | None, now: float) -> dict:
    """Stale when main has been past the live buildId for more than 2h (measured from when main first advanced past
    this build, not from when the build went live: a long-running build is fine until main moves)."""
    if not build_id:
        return {**previous, "readable": False}
    same = previous.get("buildId") == build_id
    since = previous.get("since") if same else now
    advanced = bool(main_sha) and not main_sha.startswith(build_id)
    advanced_since = (previous.get("advancedSince") if same and previous.get("advancedSince") else now) if advanced else None
    age = int(now - advanced_since) if advanced_since is not None else 0
    return {"buildId": build_id, "since": since, "advancedSince": advanced_since, "mainSha": main_sha, "ageS": age,
            "readable": True, "stale": advanced and age > STALE_BUILD_S}


def sample(state_dir: Path, now: float, run=None, version=read_version) -> tuple[dict | None, str | None]:
    """Main push CI evidence jobs plus the live build; cached for 5 min. Completed runs' jobs never change."""
    path = Path(state_dir) / STATE_FILE
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < REFRESH_S:
        return cached, None
    gh = lambda p: sentinel._gh_json(run, p)  # noqa: E731
    errors: list[str] = []
    jobs_cache: dict[str, list] = dict(cached.get("jobsCache") or {})
    out = {"observedAt": now, "streaks": {}, "build": cached.get("build") or {}, "jobsCache": {}}
    try:
        runs = gh(f"repos/{REPO}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed"
                  f"&per_page={RUNS_READ}").get("workflow_runs") or []

        attempts = {r["id"]: r.get("run_attempt") or 1 for r in runs}

        def jobs_of(run_id: int) -> list:
            key = f"{run_id}:{attempts.get(run_id, 1)}"  # a manual rerun is a new attempt with new job results
            if key not in jobs_cache:
                jobs_cache[key] = [{k: j.get(k) for k in ("name", "conclusion", "id", "html_url")}
                                   for j in gh(f"repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100&filter=latest").get("jobs") or []]
            return jobs_cache[key]

        previous = cached.get("streaks") or {}
        streaks = {slug: carry_streak(streak, previous.get(slug)) for slug, streak in red_streaks(job_conclusions(runs, jobs_of)).items()}
        for slug, streak in streaks.items():
            prior = previous.get(slug) or {}
            if streak["count"] >= RED_STREAK and prior.get("newestJobId") == streak["newestJobId"] and prior.get("specs") is not None:
                streak["specs"] = prior["specs"]
            elif streak["count"] >= RED_STREAK:
                try:  # one log read per new failing job, only once the streak is an incident
                    log = (run or sentinel._budgeted_gh)(["api", f"repos/{REPO}/actions/jobs/{streak['newestJobId']}/logs"],
                                                         capture_output=True, text=True, timeout=60)
                    # None (not []) on a failed read, so the next tick retries the log for the same job.
                    streak["specs"] = failing_specs(log.stdout or "") if log.returncode == 0 else None
                except Exception:  # noqa: BLE001
                    streak["specs"] = None
        out["streaks"] = streaks
        keys = {f"{r['id']}:{r.get('run_attempt') or 1}" for r in runs[:RUNS_READ]}
        out["jobsCache"] = {k: v for k, v in jobs_cache.items() if k in keys}
    except Exception as error:  # noqa: BLE001
        errors.append(f"ci evidence: {type(error).__name__}: {str(error)[:80]}")
        out["streaks"] = cached.get("streaks") or {}
        out["jobsCache"] = jobs_cache  # keep what was read: a transient error must not force a full refetch
    try:  # separate from the evidence read: a failed main lookup never discards fresh streaks
        main_sha = (gh(f"repos/{REPO}/commits/main") or {}).get("sha")
    except Exception as error:  # noqa: BLE001
        errors.append(f"main head: {type(error).__name__}: {str(error)[:80]}")
        main_sha = (cached.get("build") or {}).get("mainSha")
    out["build"] = build_staleness(cached.get("build") or {}, version(), main_sha, now)
    atomic_write_text(path, json.dumps(out))
    return out, "; ".join(errors) or None


def judge(sample_: dict | None, now: float) -> dict[str, str]:
    """Stable key -> one-line cause (with the facts an owner needs)."""
    alerts: dict[str, str] = {}
    if not sample_:
        return alerts
    names = {slug: name for name, slug in RELEASE_EVIDENCE_JOBS.items()}
    for slug, streak in sorted((sample_.get("streaks") or {}).items()):
        if streak.get("count", 0) >= RED_STREAK:
            specs = ", ".join(streak.get("specs") or []) or "see the job log"
            alerts[f"production-deploy:release-evidence-red:{slug}"] = (
                f"release-evidence job `{names.get(slug, slug)}` red on {streak['count']} consecutive main push CI runs; "
                f"first bad SHA {str(streak.get('firstBadSha'))[:12]} ({streak.get('firstBadAt')}); failing: {specs}; "
                f"latest {streak.get('newestJobUrl')}. Production promotion is blocked at the journey gate until it is green.")
    build = sample_.get("build") or {}
    if build.get("stale"):
        alerts["production-deploy:build-stale"] = (
            f"production still serves build {build.get('buildId')} {build.get('ageS', 0) // 60} min after main advanced past it "
            f"(limit {STALE_BUILD_S // 60}); main is at {str(build.get('mainSha'))[:12]} ({VERSION_URL})")
    return alerts
