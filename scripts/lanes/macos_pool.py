"""Shared hosted-macOS pool: measure it, record per-job wait and run time, and gate LYB iOS intake.

Hosted macOS is one small org-wide pool shared by LogYourBody (LYB) and Jovie. On 2026-10-25
LYB's iOS PRs kept 17-18 `macos-15` jobs queued behind ~5 running, so Jovie's 6-minute Mac job
waited 23+ minutes and every merge group that carried it timed out. This module

* samples the queued/running macOS jobs of both repos (`sample`, from the dispatch tick),
* records each job's wait and run seconds once it finishes (`macos-pool.jsonl`; the Ovie tile reads it),
* measures the pool: the highest total of jobs seen running at once in a rolling window
  (`pool_cap`, never an assumed constant), and
* tells intake to hold LYB iOS work while LYB's running + queued macOS jobs are at or over
  HOLD_AT (`admission`, `partition_ios`).

An admission gate costs no runner minutes (a CI wait job would). It fails open: no sample, a
stale sample or a failed read never holds work.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime
from pathlib import Path

POOL_FILE = "macos-pool.json"
HISTORY_FILE = "macos-pool.jsonl"
REPOS = ("JovieInc/LogYourBody", "JovieInc/Jovie")
HOLD_REPO = "JovieInc/LogYourBody"
HOLD_AT = 3                  # Tim/lead 2026-10-25: hold LYB iOS intake at running + queued >= 3
STALE_S = 900                # a sample older than this proves nothing about the pool
MIN_SAMPLE_S = 120           # one sample per two minutes at most
CAP_WINDOW_S = 7 * 86400
IOS_LABELS = frozenset({"ios", "area:ios", "native-ios", "swift", "xcode"})
HOLD_REASON = "macos-admission-hold"


def _epoch(value) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def is_macos(labels) -> bool:
    return any("macos" in str(label).lower() for label in labels or ())


def tally(jobs: list[dict]) -> dict:
    """{repo: {"running": n, "queued": n}} for the macOS jobs among `jobs` (job API rows + `repo`)."""
    out = {repo: {"running": 0, "queued": 0} for repo in REPOS}
    for job in jobs:
        if not is_macos(job.get("labels")):
            continue
        row = out.setdefault(job["repo"], {"running": 0, "queued": 0})
        if job.get("status") == "in_progress":
            row["running"] += 1
        elif job.get("status") == "queued":
            row["queued"] += 1
    return out


def job_metric(repo: str, job: dict) -> dict | None:
    """Wait and run seconds of one finished macOS job, or None when its times are unusable."""
    created, started, done = _epoch(job.get("created_at")), _epoch(job.get("started_at")), _epoch(job.get("completed_at"))
    if created is None or started is None or done is None or started < created or done < started:
        return None
    return {"repo": repo, "job": job.get("name"), "waitS": round(started - created, 1), "runS": round(done - started, 1),
            "conclusion": job.get("conclusion"), "completedAt": job.get("completed_at")}


def pool_cap(history: list[dict], now: float, window_s: int = CAP_WINDOW_S) -> int | None:
    """Most macOS jobs seen running at once across both repos in the window, or None without samples."""
    seen = [sum(int(r.get("running") or 0) for r in (row.get("repos") or {}).values())
            for row in history if row.get("kind") == "sample" and now - float(row.get("at") or 0) <= window_s]
    return max(seen) if seen else None


def admission(state: Path, now: float | None = None, hold_at: int = HOLD_AT) -> dict:
    """Whether LYB iOS intake is held. Fails open without a fresh sample."""
    now = time.time() if now is None else now
    try:
        snap = json.loads((Path(state) / POOL_FILE).read_text())
    except (OSError, ValueError):
        return {"hold": False, "reason": "no-sample"}
    age = now - float(snap.get("at") or 0)
    if age > STALE_S:
        return {"hold": False, "reason": "stale-sample", "ageS": round(age)}
    lyb = (snap.get("repos") or {}).get(HOLD_REPO) or {}
    load = int(lyb.get("running") or 0) + int(lyb.get("queued") or 0)
    return {"hold": load >= hold_at, "reason": "lyb-macos-load" if load >= hold_at else "under-threshold",
            "lybLoad": load, "holdAt": hold_at, "poolCap": snap.get("poolCap"), "ageS": round(age)}


def is_ios(row: dict) -> bool:
    return bool({str(label).lower() for label in row.get("labels") or ()} & IOS_LABELS)


def partition_ios(rows: list[dict], hold: bool) -> tuple[list[dict], dict]:
    """(rows intake may consider, {identifier: reason} for iOS rows held back)."""
    if not hold:
        return list(rows), {}
    kept, held = [], {}
    for row in rows:
        if is_ios(row):
            held[row["identifier"]] = HOLD_REASON
        else:
            kept.append(row)
    return kept, held


def gh_fetch(path: str, timeout: int = 40):
    result = subprocess.run(["gh", "api", path], capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip()[-100:] or f"gh exit {result.returncode}")
    return json.loads(result.stdout or "null")


def _open_jobs(repo: str, fetch) -> list[dict]:
    jobs, seen = [], set()
    for status in ("queued", "in_progress"):
        runs = fetch(f"repos/{repo}/actions/runs?status={status}&per_page=40")
        for run in (runs or {}).get("workflow_runs") or ():
            page = fetch(f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=50")
            for job in (page or {}).get("jobs") or ():
                # A run can move between the two listings mid-sample: count each job once.
                if job["id"] in seen:
                    continue
                if job.get("status") in ("queued", "in_progress") and is_macos(job.get("labels")):
                    seen.add(job["id"])
                    jobs.append({**job, "repo": repo})
    return jobs


def sample(state: Path, fetch=gh_fetch, now: float | None = None, force: bool = False) -> dict:
    """One sample: refresh the snapshot, append it to the history, and record every job that
    finished since the last sample. Throttled; any read failure leaves the old snapshot to age out."""
    if os.environ.get("LANES_SELFTEST") and fetch is gh_fetch:  # a release self-test never calls GitHub
        return {"skipped": "selftest"}
    now = time.time() if now is None else now
    state = Path(state)
    path = state / POOL_FILE
    try:
        previous = json.loads(path.read_text())
    except (OSError, ValueError):
        previous = {}
    if not force and now - float(previous.get("at") or 0) < MIN_SAMPLE_S:
        return {"skipped": "throttled"}
    jobs = []
    try:
        for repo in REPOS:
            jobs += _open_jobs(repo, fetch)
    except Exception as error:  # noqa: BLE001 - a failed read must never block the tick
        return {"error": f"{type(error).__name__}: {error}"[:160]}
    counts = tally(jobs)
    open_now = {str(job["id"]): {"repo": job["repo"], "name": job.get("name")} for job in jobs}
    history = []
    try:
        history = [json.loads(line) for line in (state / HISTORY_FILE).read_text().splitlines()[-5000:] if line.strip()]
    except (OSError, ValueError):
        pass
    rows = [{"kind": "sample", "at": now, "repos": counts}]
    for job_id, meta in (previous.get("open") or {}).items():
        if job_id in open_now:
            continue
        try:  # finished since the last sample: read its final times once
            metric = job_metric(meta["repo"], fetch(f"repos/{meta['repo']}/actions/jobs/{job_id}"))
        except Exception:  # noqa: BLE001
            metric = None
        if metric:
            rows.append({"kind": "job", "at": now, **metric})
    snapshot = {"at": now, "repos": counts, "open": open_now,
                "poolCap": pool_cap(history + rows, now)}
    state.mkdir(parents=True, exist_ok=True)
    with (state / HISTORY_FILE).open("a") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")
    path.write_text(json.dumps(snapshot))
    return {"repos": counts, "poolCap": snapshot["poolCap"], "recorded": len(rows) - 1}
