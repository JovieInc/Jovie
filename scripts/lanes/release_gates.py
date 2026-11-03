"""Release-gate detectors derived from the production controller itself (closed-loop gap 2026-11-01).

On 2026-11-01 production promotion was blocked by four successive gates between 12:52Z and 19:00Z (the staged
canary, Golden Path journey evidence, the staged public-profile perf lane, then the fleet gate's
`check:Generate Screenshots:unhealthy`). Each was found by hand. `release_evidence.py` covers Golden Path and a stale
build only; this module covers every gate the controller enforces, without a hand-kept list:

  * The gate set is read from the repo at tick time: the job names of `production-controller.yml` and
    `staging-controller.yml` (every job there can block a release), the fleet gate's required main checks
    (`scripts/fleet-gate/gem_gate_contract.py`: REQUIRED_MAIN_CHECKS plus SURFACE_SCOPED_OPTIONAL_CHECKS for
    production-web) and the journey gate's REQUIRED_JOURNEYS (`scripts/lib/promotion-journey-evidence.mjs`).
    A new job or check in those files is watched from the next tick.
  * `production-deploy:release-gate-red:<gate>` (Urgent, P0): a gate job failed on two or more consecutive
    completed controller runs, or a fleet-gate required check was red on two or more consecutive main commits.
    The issue names the gate, the failing job, the failing specs read from its log, the first bad SHA and the
    newest controller run id.
  * `production-deploy:release-gate-new-blocker:<id>` (Urgent, P0): a controller run failed with a blocker reason
    the previous completed run did not have, so a new gate surfaces on its first occurrence. It stays raised while
    the latest controller run still carries that reason, and clears when it goes away.

Routed by the doctor: alert key -> Linear Triage issue -> Summer's detector loop.

api-budget: github-user-core 24/hr - doctor tick every 5 min cached 5 min: 2 controller run lists, jobs of new non-success runs (cached by run id and attempt), 1 main commit list, 1 check-run read per new (commit, check) once concluded, and 1 log read per new failing job among the newest two failing runs (cached by job id, at most 6 per tick)
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
import urllib.parse
from pathlib import Path

import throughput_sentinel as sentinel
from atomic_state import atomic_write_text
from release_evidence import FAILED, RED_STREAK, READ_STALE_S, carry_streak, failing_specs

REPO = "JovieInc/Jovie"
ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = {"production-controller.yml": "production", "staging-controller.yml": "staging"}
RUNS_READ = 8
COMMITS_READ = 6
LOG_READS_PER_TICK = 6
REFRESH_S = 300
CARRY_TTL_S = 24 * 3600
RUN_FAILED = FAILED - {"cancelled"}  # a superseded (coalesced) controller run is no evidence either way
STATE_FILE = "release-gates.json"
PROMOTION_SURFACE = "production-web"
ERROR_LINE = re.compile(r"(?:##\[error\]|::error::)\s*(.+)")
BLOCKERS_LINE = re.compile(r'"reason":\s*"required blockers:\s*([^"]+)"')


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def controller_jobs(workflow_text: str) -> list[str]:
    """Display names of the literal-named jobs under `jobs:` (the job id when a job has no name)."""
    names: list[str] = []
    in_jobs, job_id, named = False, None, False
    for line in workflow_text.splitlines():
        if re.match(r"^jobs:\s*$", line):
            in_jobs = True
            continue
        if not in_jobs or not line.strip() or line.lstrip().startswith("#"):
            continue
        if re.match(r"^\S", line):
            break
        job = re.match(r"^  ([\w-]+):\s*$", line)
        if job:
            if job_id and not named:
                names.append(job_id)
            job_id, named = job.group(1), False
            continue
        name = re.match(r"^    name:\s*(.+?)\s*$", line)
        if name and job_id and not named:
            named = True
            value = name.group(1).strip("'\"")
            if "${{" not in value:
                names.append(value)
    if job_id and not named:
        names.append(job_id)
    return names


def _load_contract(root: Path):
    path = root / "scripts/fleet-gate/gem_gate_contract.py"
    sys.path.insert(0, str(path.parent))
    try:
        spec = importlib.util.spec_from_file_location("gem_gate_contract_for_release_gates", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(path.parent))


def derive_gates(root: Path = ROOT) -> dict:
    """The release-blocking gates, read from the controller workflows and the fleet gate contract."""
    jobs = {}
    for workflow in WORKFLOWS:
        try:
            jobs[workflow] = controller_jobs((root / ".github/workflows" / workflow).read_text())
        except OSError:
            jobs[workflow] = []
    contract = _load_contract(root)
    checks = sorted(set(contract.REQUIRED_MAIN_CHECKS) | set(contract.SURFACE_SCOPED_OPTIONAL_CHECKS.get(PROMOTION_SURFACE, ())))
    journeys: list[str] = []
    try:
        match = re.search(r"REQUIRED_JOURNEYS\s*=\s*\[([^\]]*)\]", (root / "scripts/lib/promotion-journey-evidence.mjs").read_text())
        journeys = [a or b for a, b in re.findall(r"'([^']+)'|\"([^\"]+)\"", match.group(1))] if match else []
    except OSError:
        pass
    return {"controllerJobs": jobs, "mainChecks": checks, "journeys": journeys}


def workflow_for_check(root: Path, check: str) -> str | None:
    """The workflow file that has a job named `check` and can be dispatched (workflow_dispatch), else None."""
    for path in sorted((root / ".github/workflows").glob("*.yml")):
        try:
            text = path.read_text()
        except OSError:
            continue
        if re.search(r"^on:\s*$[\s\S]*?^  workflow_dispatch:", text, re.M) and check in controller_jobs(text):
            return path.name
    return None


def stale_red_checks(commits: list[dict], conclusions: dict[str, dict], streaks: dict[str, dict]) -> dict[str, dict]:
    """Red required checks that have not run on any commit newer than the red one (a path-filtered workflow that the
    fix never triggered, 2026-11-01 deadlock): the gate stays blocked until something else happens to touch the paths."""
    out = {}
    for key, streak in streaks.items():
        ran = [c["sha"] for c in commits if streak["gate"] in conclusions.get(c["sha"], {})]
        if ran and ran[0] == streak["newestSha"] and commits and commits[0]["sha"] != streak["newestSha"]:
            out[key] = streak
    return out


def normalize_reason(text: str) -> str:
    text = re.sub(r"^\S*Z\s+", "", text.strip())
    text = re.sub(r"\b[0-9a-f]{40}\b", "<sha>", text)
    text = re.sub(r"\d{4}-\d\d-\d\dT[\d:.]+Z?", "<t>", text)
    text = re.sub(r"\d{4,}", "<n>", text)
    return re.sub(r"\s+", " ", text)[:200]


def blocker_reasons(log_text: str) -> list[str]:
    """Normalized blocker reasons in a failed controller job log: fleet-gate blocker signals, then error lines."""
    out: list[str] = []
    for line in log_text.splitlines():
        text = re.sub(r"^\S*Z\s+", "", line)
        found = BLOCKERS_LINE.search(text)
        if found:
            out += [f"fleet-gate blocker: {name.strip()}" for name in found.group(1).split(",") if name.strip()]
            continue
        err = ERROR_LINE.search(text)
        if err and not re.match(r"Process completed with exit code \d+", err.group(1).strip()):
            out.append(normalize_reason(err.group(1)))
    return list(dict.fromkeys(out))


def streak_of(seq: list[tuple[str | None, dict]]) -> dict | None:
    """Newest-first (state, row): consecutive 'red' entries from the newest; 'green' ends it; None is no evidence."""
    streak: list[dict] = []
    bounded = False
    for state, row in seq:
        if state == "red":
            streak.append(row)
        elif state == "green":
            bounded = True
            break
    if not streak:
        return None
    return {"count": len(streak), "newestSha": streak[0]["sha"], "firstBadSha": streak[-1]["sha"], "firstBadAt": streak[-1]["at"],
            "newestJobId": streak[0].get("jobId"), "newestJobUrl": streak[0].get("jobUrl") or streak[0].get("url"),
            "newestRunId": streak[0].get("runId"), "bounded": bounded, "shas": [r["sha"] for r in streak]}


def controller_rows(workflow: str, runs: list[dict], jobs_of) -> list[dict]:
    """Newest-first evaluated controller runs: {runId, sha, at, url, success, failed: {job: (id, url)}, passed: [job]}."""
    rows = []
    for run in runs[:RUNS_READ]:
        if run.get("status") != "completed":
            continue
        conclusion = run.get("conclusion")
        row = {"runId": run["id"], "sha": run.get("head_sha"), "at": run.get("created_at"), "url": run.get("html_url"),
               "workflow": workflow, "success": conclusion == "success", "failed": {}, "passed": []}
        if conclusion in RUN_FAILED:
            for job in jobs_of(run["id"]):
                if job.get("conclusion") in RUN_FAILED:
                    row["failed"][job["name"]] = (job.get("id"), job.get("html_url"))
                elif job.get("conclusion") == "success":
                    row["passed"].append(job["name"])
        elif conclusion != "success":
            continue  # cancelled / skipped / neutral: superseded, no evidence either way
        rows.append(row)
    return rows


def gate_streaks(workflow: str, rows: list[dict]) -> dict[str, dict]:
    """Per failing gate job: its consecutive-failure streak across the newest-first controller runs."""
    out = {}
    for gate in {name for row in rows for name in row["failed"]}:
        seq = []
        for row in rows:
            if gate in row["failed"]:
                job_id, job_url = row["failed"][gate]
                seq.append(("red", {**row, "jobId": job_id, "jobUrl": job_url}))
            elif row["success"] or gate in row["passed"]:
                seq.append(("green", row))
        streak = streak_of(seq)
        if streak:
            out[f"{WORKFLOWS[workflow]}:{slug(gate)}"] = {**streak, "gate": gate, "workflow": workflow}
    return out


def check_streaks(commits: list[dict], conclusions: dict[str, dict]) -> dict[str, dict]:
    """Per fleet-gate required main check: consecutive red main commits, newest first.

    `commits` newest-first [{sha, at}]; `conclusions[sha][check] = (conclusion, checkRunId, url)` when concluded.
    """
    out = {}
    for name in {name for per in conclusions.values() for name in per}:
        seq = []
        for commit in commits:
            got = conclusions.get(commit["sha"], {}).get(name)
            if got is None:
                continue
            conclusion, job_id, url = got
            state = "red" if conclusion in FAILED else "green" if conclusion in ("success", "neutral", "skipped") else None
            seq.append((state, {"sha": commit["sha"], "at": commit["at"], "jobId": job_id, "jobUrl": url}))
        streak = streak_of(seq)
        if streak:
            out[f"check:{slug(name)}"] = {**streak, "gate": name, "workflow": "main"}
    return out


def new_blockers(rows: list[dict], reasons_of, raised: dict) -> dict:
    """Reasons the latest evaluated run has and the previous evaluated run did not; kept while still present."""
    if not rows or rows[0]["success"]:
        return {}
    latest = reasons_of(rows[0])
    previous = reasons_of(rows[1]) if len(rows) > 1 else None
    out = {sig: info for sig, info in raised.items() if sig in latest}
    if previous is not None:
        for sig, (gate, job_url) in latest.items():
            if sig not in previous and sig not in out:
                out[sig] = {"reason": sig, "gate": gate, "runId": rows[0]["runId"], "runUrl": rows[0]["url"],
                            "sha": rows[0]["sha"], "workflow": rows[0]["workflow"], "jobUrl": job_url}
    return out


def sample(state_dir: Path, now: float, run=None, root: Path = ROOT) -> tuple[dict | None, str | None]:
    """Controller gate streaks, new blockers and fleet-gate main checks; cached 5 min. Completed jobs never change."""
    path = Path(state_dir) / STATE_FILE
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < REFRESH_S:
        return cached, None
    gh = lambda p: sentinel._gh_json(run, p)  # noqa: E731
    errors: list[str] = []
    jobs_cache: dict = dict(cached.get("jobsCache") or {})
    log_cache: dict = dict(cached.get("logCache") or {})
    check_cache: dict = dict(cached.get("checkCache") or {})
    out = {"observedAt": now, "evidenceReadAt": cached.get("evidenceReadAt"), "firstObservedAt": cached.get("firstObservedAt") or now,
           "gates": cached.get("gates") or {}, "checks": cached.get("checks") or {}, "newBlockers": cached.get("newBlockers") or {},
           "derived": cached.get("derived") or {}, "dispatches": cached.get("dispatches") or {}}
    budget = [LOG_READS_PER_TICK]
    seen_runs: set[str] = set()
    seen_jobs: set[str] = set()

    def read_log(job_id) -> dict | None:
        key = str(job_id)
        seen_jobs.add(key)
        if key in log_cache:
            return log_cache[key]
        if budget[0] <= 0 or not job_id:
            return None
        budget[0] -= 1
        try:
            log = (run or sentinel._budgeted_gh)(["api", f"repos/{REPO}/actions/jobs/{job_id}/logs"], capture_output=True, text=True, timeout=60)
        except Exception:  # noqa: BLE001
            return None
        if log.returncode != 0:
            return None  # not cached: retried next tick
        text = log.stdout or ""
        log_cache[key] = {"reasons": blocker_reasons(text), "specs": failing_specs(text)}
        return log_cache[key]

    derived = out["derived"]
    try:
        derived = out["derived"] = derive_gates(root)
        previous_gates = cached.get("gates") or {}
        gates: dict[str, dict] = {}
        new: dict[str, dict] = {}
        for workflow in WORKFLOWS:
            runs = gh(f"repos/{REPO}/actions/workflows/{workflow}/runs?branch=main&status=completed&per_page={RUNS_READ}").get("workflow_runs") or []
            attempts = {r["id"]: r.get("run_attempt") or 1 for r in runs}

            def jobs_of(run_id: int, attempts=attempts) -> list:
                key = f"{run_id}:{attempts.get(run_id, 1)}"
                seen_runs.add(key)
                if key not in jobs_cache:
                    jobs_cache[key] = [{k: j.get(k) for k in ("name", "conclusion", "id", "html_url")}
                                       for j in gh(f"repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100&filter=latest").get("jobs") or []]
                return jobs_cache[key]

            rows = controller_rows(workflow, runs, jobs_of)
            for key, streak in gate_streaks(workflow, rows).items():
                streak = {**carry_streak(streak, previous_gates.get(key)), "lastRedSeenAt": now}
                if streak["count"] >= RED_STREAK:
                    got = read_log(streak["newestJobId"])
                    streak["specs"] = got["specs"] if got else (previous_gates.get(key) or {}).get("specs")
                gates[key] = streak
            for key, prior in previous_gates.items():
                # Only a green run clears a streak, not runs sliding the reds out of the window.
                if key.startswith(f"{WORKFLOWS[workflow]}:") and key not in gates \
                        and now - float(prior.get("lastRedSeenAt") or now) <= CARRY_TTL_S \
                        and not any(r["success"] or prior.get("gate") in r["passed"] for r in rows):
                    gates[key] = prior

            memo: dict = {}

            def reasons_of(row: dict, memo=memo) -> dict | None:
                if row["runId"] in memo:
                    return memo[row["runId"]]
                found: dict[str, tuple] | None = {}
                if not row["success"]:
                    for gate, (job_id, job_url) in row["failed"].items():
                        got = read_log(job_id)
                        if got is None:
                            found = None
                            break
                        for sig in got["reasons"] or [f"job failed: {gate}"]:
                            found.setdefault(sig, (gate, job_url))
                memo[row["runId"]] = found
                return found

            prior_new = {sig: info for sig, info in (cached.get("newBlockers") or {}).items() if info.get("workflow") == workflow}
            if rows and not rows[0]["success"]:
                if reasons_of(rows[0]) is not None and (len(rows) == 1 or reasons_of(rows[1]) is not None):
                    new.update(new_blockers(rows, reasons_of, prior_new))
                else:
                    new.update(prior_new)  # a log read failed: keep what was raised, retry next tick
        out["gates"], out["newBlockers"] = gates, new
    except Exception as error:  # noqa: BLE001
        errors.append(f"controller runs: {type(error).__name__}: {str(error)[:80]}")
    try:
        commits = [{"sha": c["sha"], "at": (c.get("commit") or {}).get("committer", {}).get("date")}
                   for c in gh(f"repos/{REPO}/commits?sha=main&per_page={COMMITS_READ}")]
        shas = {c["sha"] for c in commits}
        conclusions: dict[str, dict] = {}
        for commit in commits:
            per = {}
            for name in derived.get("mainChecks") or []:
                key = f"{commit['sha']}:{name}"
                if key not in check_cache:
                    found = gh(f"repos/{REPO}/commits/{commit['sha']}/check-runs?check_name={urllib.parse.quote(name)}&per_page=5").get("check_runs") or []
                    latest = max(found, key=lambda r: r.get("id") or 0) if found else None
                    if latest is None or latest.get("status") != "completed":
                        continue  # absent or pending: no evidence yet, read again next tick
                    check_cache[key] = [latest.get("conclusion"), latest.get("id"), latest.get("html_url")]
                per[name] = tuple(check_cache[key])
            conclusions[commit["sha"]] = per
        checks = {}
        prior_checks = cached.get("checks") or {}
        for key, streak in check_streaks(commits, conclusions).items():
            streak = {**carry_streak(streak, prior_checks.get(key)), "lastRedSeenAt": now}
            if streak["count"] >= RED_STREAK:
                got = read_log(streak["newestJobId"])
                streak["specs"] = got["specs"] if got else (prior_checks.get(key) or {}).get("specs")
            checks[key] = streak
        for key, prior in prior_checks.items():
            green = any(conclusions[s].get(prior.get("gate"), (None,))[0] == "success" for s in conclusions)
            if key not in checks and not green and now - float(prior.get("lastRedSeenAt") or now) <= CARRY_TTL_S:
                checks[key] = prior
        out["checks"] = checks
        # Self-heal: dispatch the stalled workflow on main once per red check run, with a receipt.
        receipts = dict(cached.get("dispatches") or {})
        for key, streak in stale_red_checks(commits, conclusions, checks).items():
            receipt_key = f"{streak['gate']}:{streak['newestJobId']}"
            workflow = workflow_for_check(root, streak["gate"])
            if receipt_key in receipts or not workflow:
                continue
            try:
                done = (run or sentinel._budgeted_gh)(["api", "-X", "POST", f"repos/{REPO}/actions/workflows/{workflow}/dispatches",
                                                      "-f", "ref=main"], capture_output=True, text=True, timeout=60)
                ok = done.returncode == 0
            except Exception:  # noqa: BLE001
                ok = False
            if ok:  # a failed dispatch leaves no receipt and is retried next tick
                receipts[receipt_key] = {"at": now, "workflow": workflow, "check": streak["gate"], "redCheckRunId": streak["newestJobId"],
                                         "redSha": streak["newestSha"], "mainSha": commits[0]["sha"],
                                         "reason": "required check red and never re-run on newer commits"}
        out["dispatches"] = {k: v for k, v in receipts.items() if any(k == f"{c['gate']}:{c['newestJobId']}" for c in checks.values()) or now - v["at"] < CARRY_TTL_S}
        out["evidenceReadAt"] = now
        check_cache = {k: v for k, v in check_cache.items() if k.split(":")[0] in shas}
    except Exception as error:  # noqa: BLE001
        errors.append(f"main checks: {type(error).__name__}: {str(error)[:80]}")
    out["jobsCache"] = {k: v for k, v in jobs_cache.items() if k in seen_runs}
    out["logCache"] = {k: v for k, v in log_cache.items() if k in seen_jobs}
    out["checkCache"] = check_cache
    atomic_write_text(path, json.dumps(out))
    return out, "; ".join(errors) or None


def judge(sample_: dict | None, now: float) -> dict[str, str]:
    """Stable key -> one-line cause with the facts an owner needs."""
    alerts: dict[str, str] = {}
    if not sample_:
        return alerts
    read_at = sample_.get("evidenceReadAt") or sample_.get("firstObservedAt")
    if isinstance(read_at, (int, float)) and now - read_at > READ_STALE_S:
        alerts["release-gates-stale"] = (f"release gate evidence (controller runs, fleet-gate main checks) was last read "
                                         f"{int((now - read_at) // 60)} min ago (limit {READ_STALE_S // 60}); a red gate would go unnoticed")
    for group, label in (("gates", "release gate"), ("checks", "fleet-gate required check")):
        for key, streak in sorted((sample_.get(group) or {}).items()):
            if streak.get("count", 0) < RED_STREAK:
                continue
            specs = ", ".join(streak.get("specs") or []) or "see the job log"
            unit = "main commits" if group == "checks" else f"consecutive {str(streak.get('workflow')).replace('.yml', '')} runs"
            run_id = f"; controller run {streak['newestRunId']}" if streak.get("newestRunId") else ""
            alerts[f"production-deploy:release-gate-red:{key}"] = (
                f"{label} `{streak.get('gate')}` red on {streak['count']} {unit}; failing job {streak.get('newestJobUrl')}; "
                f"failing: {specs}; first bad SHA {str(streak.get('firstBadSha'))[:12]} ({streak.get('firstBadAt')}){run_id}. "
                f"Production promotion is blocked until it is green.")
    for sig, info in sorted((sample_.get("newBlockers") or {}).items()):
        digest = hashlib.sha1(sig.encode()).hexdigest()[:10]
        alerts[f"production-deploy:release-gate-new-blocker:{digest}"] = (
            f"new release blocker on {str(info.get('workflow')).replace('.yml', '')} run {info.get('runId')} ({info.get('runUrl')}): "
            f"gate `{info.get('gate')}` failed with `{sig}`, not seen in the previous run; SHA {str(info.get('sha'))[:12]}; "
            f"job {info.get('jobUrl')}. A gate that was green is now blocking promotion.")
    return alerts
