"""Throughput sentinel: no-progress alarms, idle-reason accounting and growth-bound headroom.

Tim 2026-10-24: throughput tanks after a day and nobody can find why. This module adds the
missing alarms on existing plumbing only: the doctor observes (`observe`), judges (`judge`)
and routes through its Tracker like every other doctor alert; nothing here owns a new loop.

Alarms (each names its stage and carries its evidence):
  throughput-no-push:<repo>:<lane>   demand > 0, seats configured, zero lane pushes for 60 min
  throughput-queue-no-merge          merge queue > 0, zero merges in the last 60 min
  throughput-queue-unmergeable      an UNMERGEABLE queue entry the sweep could not dequeue (it dequeues, comments and
                                     routes to lane-fix-conflict after 10 min; #23519 stalled the queue 3h)
  throughput-claim-errors:<lane>     >= 20% of a lane's runs in 30 min died on claim-error (a broken claim ledger
                                     killed ~560 fix-red runs from 2026-10-26 07:30Z and nothing alarmed)
  throughput-merge-group-start-slow  merge-group runs wait > 5 min (p50) for a runner
  throughput-prod-lease-held         a Production Controller run holds the lease > 45 min
  throughput-idle-dominant           one idle/hold reason is > 50% of the last hour's exits
  throughput-idle-not-demand:<lane>  a lane with eligible demand idled >= 3 times in the hour, every time for a reason
                                     other than "no demand" (a gate or cap closed on it)
  throughput-no-merge:<repo>         other repos (LogYourBody): a clean ready PR waits > 60 min and nothing merged in 60 min
  throughput-pr-stuck:<repo>         other repos: an open non-draft PR has been conflicted/blocked > 24h
  growth-bound:<id>                  a size/count limit that scales with backlog passed 70%
Production-not-reached-in-90-min is the existing production-continuity freshness incident
(.github/scripts/production-continuity.mjs, threshold lowered to 90 min).
"""
from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
from types import SimpleNamespace
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

IDLE_LOG = "idle-exits.jsonl"
IDLE_LOG_KEEP_S = 2 * 3600
IDLE_LOG_MAX_BYTES = 512 * 1024
NO_PUSH_S = 3600
MERGE_GROUP_START_P50_MIN = 5.0
MERGE_GROUP_MIN_RUNS = 3
# Per-pool merge-gate wait (2026-10-29): after #23586 moved the gate jobs to the gem pool its
# created->started wait was p50 120 s / p95 451 s while hosted jobs in the same groups waited
# p50 3 s / p95 33 s. Alarm when the self-hosted pool is the slower one, or hosted is saturated.
POOL_MIN_JOBS = 5
POOL_SLOWER_MARGIN_S = 30.0
HOSTED_SATURATED_P50_S = 120.0
SELF_HOSTED_LABELS = frozenset({"self-hosted", "jovie-fixed"})


def runner_pool(labels) -> str:
    """'self-hosted' when a job asked for the gem pool, else 'hosted'."""
    return "self-hosted" if any(str(l).lower() in SELF_HOSTED_LABELS for l in labels or []) else "hosted"


def pool_waits(waits_by_pool: dict) -> dict:
    """p50/p95/n of created->started seconds per runner pool."""
    out = {}
    for pool, waits in sorted(waits_by_pool.items()):
        if not waits:
            continue
        ordered = sorted(waits)
        p95 = ordered[max(0, min(len(ordered) - 1, -(-95 * len(ordered) // 100) - 1))]
        out[pool] = {"n": len(ordered), "p50S": round(statistics.median(ordered), 1), "p95S": round(p95, 1)}
    return out
LEASE_HELD_MIN = 45.0
IDLE_DOMINANT_FRACTION = 0.5
IDLE_DOMINANT_MIN_EXITS = 6
IDLE_NOT_DEMAND_MIN_EXITS = 3
NO_DEMAND_REASONS = frozenset({"maintenance-only-idle", "no-demand", "pool-empty"})
GROWTH_ALARM_FRACTION = 0.7
RELEASE_FLOW_REFRESH_S = 300
MERGE_GROUP_SAMPLE_RUNS = 3
CLAIM_ERROR_WINDOW_S, CLAIM_ERROR_FRACTION, CLAIM_ERROR_MIN_RUNS = 1800, 0.2, 5
PUSH_VERDICTS = frozenset({"pr-opened", "pushed", "fix-pushed", "landing", "verified-not-queued", "decomposed"})
REPO = "JovieInc/Jovie"
# Repos the lanes do not claim work in; their demand and merge signals come from GitHub alone.
WATCHED_REPOS = ("JovieInc/LogYourBody",)
REPO_REFRESH_S = 300
CLEAN_WAIT_S = 3600
PR_STUCK_S = 24 * 3600
CONTROLLER_WORKFLOW = "production-controller.yml"
MIB = 1024 * 1024


def _iso_epoch(value) -> float | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() if parsed.tzinfo else None


def append_idle_exit(state: Path, repo: str, provider: str, reason: str, now: float | None = None) -> None:
    """One bounded row per worker idle exit; worker-idle.json only keeps the latest per provider."""
    now = time.time() if now is None else now
    path = Path(state) / IDLE_LOG
    try:
        with open(path, "a") as out:
            out.write(json.dumps({"at": now, "repo": repo, "provider": provider, "reason": reason}) + "\n")
        if path.stat().st_size > IDLE_LOG_MAX_BYTES:
            keep = [row for row in read_idle_exits(state, now, IDLE_LOG_KEEP_S)]
            tmp = path.with_suffix(".tmp")
            tmp.write_text("".join(json.dumps(row) + "\n" for row in keep))
            os.replace(tmp, path)
    except OSError:
        pass  # accounting never blocks a worker exit


def read_idle_exits(state: Path, now: float, window_s: float = 3600) -> list[dict]:
    rows = []
    try:
        size = (Path(state) / IDLE_LOG).stat().st_size
        with open(Path(state) / IDLE_LOG, "rb") as handle:
            handle.seek(max(0, size - 2 * IDLE_LOG_MAX_BYTES))
            raw = handle.read().decode("utf-8", "replace")
    except OSError:
        return rows
    for line in raw.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and isinstance(row.get("at"), (int, float)) and 0 <= now - row["at"] <= window_s \
                and isinstance(row.get("reason"), str):
            rows.append(row)
    return rows


def claim_errors_by_lane(receipts: list[dict], now: float) -> dict[str, dict]:
    """Per provider over the last 30 min: finished runs and how many died on a claim-error receipt."""
    out: dict[str, dict] = {}
    for row in receipts or []:
        ended = _iso_epoch(row.get("endedAt"))
        if ended is None or not 0 <= now - ended <= CLAIM_ERROR_WINDOW_S or not row.get("provider"):
            continue
        slot = out.setdefault(row["provider"], {"runs": 0, "claimErrors": 0, "sample": None})
        slot["runs"] += 1
        reason = next((r for r in row.get("reasons") or [] if isinstance(r, str) and r.startswith("claim-error:")), None)
        if reason:
            slot["claimErrors"] += 1
            slot["sample"] = slot["sample"] or reason[:120]
    return out


def pushes_by_lane(receipts: list[dict], now: float) -> dict[str, int]:
    """Lane pushes in the last hour per `repository|provider`, from the run ledger."""
    counts: Counter = Counter()
    for row in receipts or []:
        ended = _iso_epoch(row.get("endedAt"))
        if ended is None or not 0 <= now - ended <= NO_PUSH_S or row.get("verdict") not in PUSH_VERDICTS:
            continue
        counts[f"{row.get('repository') or REPO}|{row.get('provider') or 'unknown'}"] += 1
    return dict(counts)


def _budgeted_gh(args, **_):
    """gh through the shared client layer (budget, breaker, jittered backoff; 'poll' priority is shed first).
    Returns a subprocess-shaped result so callers and tests keep one shape; a deferral is an error, not a verdict."""
    scripts = str(Path(__file__).resolve().parents[1])
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient.gh import run_gh
    done = run_gh(list(args), priority="poll")
    return SimpleNamespace(returncode=done["code"], stdout=done["stdout"], stderr=done["stderr"])


def _gh_json(run, path: str):
    run = run or _budgeted_gh
    result = run(["api", path], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}").strip()[-160:])
    return json.loads(result.stdout)


def sample_release_flow(state: Path, now: float, run=None, repo: str = REPO) -> tuple[dict | None, str | None]:
    """Merge-group runner wait and Production Controller lease age; two REST reads per 5 min."""
    path = Path(state) / "release-flow.json"
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < RELEASE_FLOW_REFRESH_S:
        return cached, None
    since = datetime.fromtimestamp(now - 3600, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        groups = _gh_json(run, f"repos/{repo}/actions/runs?event=merge_group&per_page=30&created=%3E%3D{since}")
        # run_started_at equals created_at for merge_group runs; the real wait is a job's
        # created_at -> started_at (runner assignment), sampled over the latest runs.
        waits, sampled, by_pool = [], 0, {}
        for row in sorted(groups.get("workflow_runs") or [], key=lambda r: str(r.get("created_at")), reverse=True):
            if sampled >= MERGE_GROUP_SAMPLE_RUNS:
                break
            if row.get("conclusion") == "skipped" or not row.get("id"):
                continue
            sampled += 1
            for job in _gh_json(run, f"repos/{repo}/actions/runs/{row['id']}/jobs?per_page=100").get("jobs") or []:
                created, started = _iso_epoch(job.get("created_at")), _iso_epoch(job.get("started_at"))
                if created is not None and started is not None and started >= created:
                    waits.append((started - created) / 60)
                    by_pool.setdefault(runner_pool(job.get("labels")), []).append(started - created)
        held = _gh_json(run, f"repos/{repo}/actions/workflows/{CONTROLLER_WORKFLOW}/runs?status=in_progress&per_page=10")
        leases = [(now - started) / 60 for row in held.get("workflow_runs") or []
                  if (started := _iso_epoch(row.get("run_started_at"))) is not None]
        runs = [row.get("id") for row in held.get("workflow_runs") or []]
        # Hosted-runner backlog: queued runs repo-wide and the oldest one's wait. 2026-10-28: 990 queued
        # runs, oldest 18 min, 64 in progress, so a green head waited on runner concurrency, not on lanes.
        queued = _gh_json(run, f"repos/{repo}/actions/runs?status=queued&per_page=1")
        queued_total = queued.get("total_count") if isinstance(queued.get("total_count"), int) else None
        oldest_min = None
        if queued_total:
            tail = _gh_json(run, f"repos/{repo}/actions/runs?status=queued&per_page=1&page={queued_total}")
            created = _iso_epoch(((tail.get("workflow_runs") or [{}])[0]).get("created_at"))
            oldest_min = round((now - created) / 60, 1) if created is not None else None
        signal = {"schema": "symphony-release-flow/v1", "observedAt": now,
                  "mergeGroupRuns": sampled, "mergeGroupJobs": len(waits),
                  "mergeGroupStartP50Min": round(statistics.median(waits), 2) if waits else None,
                  "mergeGroupStartMaxMin": round(max(waits), 2) if waits else None,
                  "mergeGroupStartByPool": pool_waits(by_pool),
                  "leaseHeldMin": round(max(leases), 1) if leases else 0.0, "leaseRunIds": runs[:3],
                  "queuedRuns": queued_total, "queuedOldestMin": oldest_min}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        return (cached or None), f"{type(error).__name__}: {error}"[:200]


QUEUE_TIMINGS_REFRESH_S, QUEUE_TIMINGS_PRS, QUEUE_TIMINGS_FILE = 900, 12, "queue-timings.json"
REARM_CONTEXT = "jovie-queue-victim-rearm/v1"  # scripts/merge-group-victim-rearm.mjs


def _pct(values: list, q: float):
    values = sorted(values)
    return round(values[min(len(values) - 1, int(len(values) * q))], 1) if values else None


def sample_queue_timings(state: Path, now: float, run=None, repo: str = REPO) -> tuple[dict | None, str | None]:
    """Merge-queue wait stages (schema symphony-queue-timings/v1), refreshed every 15 min:
    merge-group CI duration p50/p95 and outcome mix over the latest 100 CI merge_group runs
    (cancelled = a group reset by a failure, jump or dequeue), and enqueue->merge p50/p95 for the
    latest merged PRs (last enqueue, and first enqueue which includes ejections and re-enqueues)."""
    path = Path(state) / QUEUE_TIMINGS_FILE
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < QUEUE_TIMINGS_REFRESH_S:
        return cached, None
    try:
        runs = _gh_json(run, f"repos/{repo}/actions/workflows/ci.yml/runs?event=merge_group&per_page=100").get("workflow_runs") or []
        done = [row for row in runs if row.get("status") == "completed" and _iso_epoch(row.get("created_at")) is not None
                and _iso_epoch(row.get("updated_at")) is not None]
        by = {kind: [(_iso_epoch(r["updated_at"]) - _iso_epoch(r["created_at"])) / 60 for r in done if r.get("conclusion") == kind]
              for kind in ("success", "failure", "cancelled")}
        merged = _gh_json(run, f"repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=40")
        merged = [pr for pr in merged if pr.get("merged_at")][:QUEUE_TIMINGS_PRS]
        last, first = [], []
        dequeues = {"github": 0, "bot": 0, "human": 0}
        requeue_lag, auto_lag, push_lag = [], [], []
        receipts_cache: dict[str, list[float]] = {}
        for pr in merged:
            events = _gh_json(run, f"repos/{repo}/issues/{pr['number']}/timeline?per_page=100")
            adds = [_iso_epoch(e.get("created_at")) for e in events if e.get("event") == "added_to_merge_queue"]
            adds = [a for a in adds if a is not None]
            # Silent dequeues: removals with no check named on the PR. github-merge-queue[bot] = GitHub ejected
            # the entry after a merge-group failure/timeout; each is followed by a re-enqueue (lag measured).
            removed = [(_iso_epoch(e.get("created_at")), str((e.get("actor") or {}).get("login") or ""))
                       for e in events if e.get("event") == "removed_from_merge_queue"]
            for at, actor in removed:
                if at is None:
                    continue
                dequeues["github" if actor.startswith("github-merge-queue") else "bot" if actor.endswith("[bot]") else "human"] += 1
                later = [a for a in adds if a > at]
                if later:
                    back = min(later)
                    lag = (back - at) / 60
                    requeue_lag.append(lag)
                    # Auto = the victim-rearm job wrote a why= receipt on this head between the removal and the
                    # re-add (the enqueue lands seconds before the receipt); anything else came from the enroll sweep.
                    sha = str((pr.get("head") or {}).get("sha") or "")
                    if sha and sha not in receipts_cache:
                        rows = _gh_json(run, f"repos/{repo}/commits/{sha}/statuses?per_page=100")
                        receipts_cache[sha] = [t for t in (_iso_epoch(r.get("created_at")) for r in rows
                                               if r.get("context") == REARM_CONTEXT and ";why=" in str(r.get("description") or ""))
                                               if t is not None]
                    auto = any(at <= t <= back + 120 for t in receipts_cache.get(sha, []))
                    (auto_lag if auto else push_lag).append(lag)
            merged_at = _iso_epoch(pr.get("merged_at"))
            if adds and merged_at is not None:
                last.append((merged_at - max(adds)) / 60)
                first.append((merged_at - min(adds)) / 60)
        total = sum(len(v) for v in by.values())
        signal = {"schema": "symphony-queue-timings/v1", "observedAt": now, "groupCi": {
                      "runs": total, "successP50Min": _pct(by["success"], .5), "successP95Min": _pct(by["success"], .95),
                      "cancelledShare": round(len(by["cancelled"]) / total, 3) if total else None,
                      "failureShare": round(len(by["failure"]) / total, 3) if total else None},
                  "enqueueToMerge": {"prs": len(last), "lastEnqueueP50Min": _pct(last, .5), "lastEnqueueP95Min": _pct(last, .95),
                                     "firstEnqueueP50Min": _pct(first, .5), "firstEnqueueP95Min": _pct(first, .95),
                                     "targets": {"p50Min": 30, "p95Min": 60}},
                  "dequeues": {"prs": len(last), "silentGithub": dequeues["github"], "bot": dequeues["bot"], "human": dequeues["human"],
                               "requeueLagP50Min": _pct(requeue_lag, .5), "requeueLagP95Min": _pct(requeue_lag, .95),
                               "autoRequeues": len(auto_lag), "pushToMainRequeues": len(push_lag),
                               "autoRequeueLagP50Min": _pct(auto_lag, .5), "autoRequeueLagP95Min": _pct(auto_lag, .95),
                               "pushRequeueLagP50Min": _pct(push_lag, .5), "pushRequeueLagP95Min": _pct(push_lag, .95)}}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        return (cached or None), f"{type(error).__name__}: {error}"[:200]


def sample_repo_flow(state: Path, repo: str, now: float, run=None) -> tuple[dict | None, str | None]:
    """Open-PR and recent-merge signals for a repo without lane demand (two `gh pr list` reads per 5 min)."""
    path = Path(state) / f"repo-flow-{repo.rsplit('/', 1)[-1].lower()}.json"
    try:
        cached = json.loads(path.read_text())
    except (OSError, ValueError):
        cached = {}
    if isinstance(cached.get("observedAt"), (int, float)) and 0 <= now - cached["observedAt"] < REPO_REFRESH_S:
        return cached, None

    run = run or _budgeted_gh

    def gh(*args):
        result = run(list(args), capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}").strip()[-160:])
        return json.loads(result.stdout)

    try:
        opened = gh("pr", "list", "-R", repo, "--state", "open", "-L", "100", "--json",
                    "number,isDraft,createdAt,updatedAt,mergeStateStatus,author")
        merged = gh("pr", "list", "-R", repo, "--state", "merged", "-L", "30", "--json", "number,mergedAt")
        merged_at = sorted(t for t in (_iso_epoch(row.get("mergedAt")) for row in merged) if t is not None)
        signal = {"schema": "symphony-repo-flow/v1", "observedAt": now, "repo": repo,
                  "openPrs": [{"number": row["number"], "draft": bool(row.get("isDraft")),
                               "state": row.get("mergeStateStatus"), "author": (row.get("author") or {}).get("login"),
                               "updatedAt": _iso_epoch(row.get("updatedAt"))} for row in opened][:100],
                  "merged1h": sum(1 for t in merged_at if 0 <= now - t <= 3600),
                  "lastMergedAt": merged_at[-1] if merged_at else None}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        return (cached or None), f"{type(error).__name__}: {error}"[:200]


def growth_bounds(state: Path, limits: dict) -> list[dict]:
    """Backlog-scaled limits with current headroom. `limits` carries values owned by their readers
    (so a reader changing its cap cannot drift from this list): inventoryBytes, worktreeScan."""
    state = Path(state)

    def size(rel: str) -> int | None:
        try:
            return (state / rel).stat().st_size
        except OSError:
            return None

    def count(rel: str) -> int | None:
        try:
            return sum(1 for _ in os.scandir(state / rel))
        except OSError:
            return None

    def queue_scanned() -> int | None:
        try:
            value = json.loads((state / "outcome-queue.json").read_text()).get("scanned")
        except (OSError, ValueError):
            return None
        return value if isinstance(value, int) else None

    rows = [
        ("repair-inventory-bytes", size("cache/open-prs-labels-v2.json"), limits.get("inventoryBytes", 16 * MIB),
         "bytes", "lane_runner.REPAIR_INVENTORY_MAX_BYTES: every repair worker idles when exceeded (JOV 2026-10-24, 154 PRs)"),
        ("ledger-bytes", size("runs/ledger.jsonl"), 64_000_000, "bytes",
         "backlog_admission refuses all admission above 64,000,000 bytes (native-attempt-ledger-read-bound); "
         "ledger_archive.py rotation keeps 10 days"),
        ("api-budget-bytes", size("api-budget.json"), 65536, "bytes",
         "maintenance_json(limit=65536): the Linear/GitHub budget reads fail closed above 64 KiB"),
        ("linear-usage-bytes", size("linear-usage.json"), MIB, "bytes", "maintenance_json(limit=1 MiB): usage accounting reads fail closed"),
        ("fix-attempts-bytes", size("fix-attempts.json"), MIB, "bytes",
         "maintenance_json default 1 MiB: fix-attempt accounting reads fail closed"),
        ("held-bytes", size("held.json"), MIB, "bytes", "maintenance_json default 1 MiB: hold reads fail closed"),
        ("red-dispatch-ledger-bytes", size("runs/red-dispatch.jsonl"), MIB, "bytes",
         "lane_runner and doctor read the red-dispatch ledger as empty above 1 MiB (unclaimed reds go unseen)"),
        ("publication-revocations-bytes", size("runs/publication-revocations.jsonl"), MIB, "bytes",
         "maintenance_json default 1 MiB: revocation reads fail closed"),
        ("worker-slot-files", count("slots"), 4096, "files", "occupied_worker_slots returns unknown above 4096"),
        ("worktree-scan", count("worktrees"), limits.get("worktreeScan", 256), "dirs",
         "maintenance_preserved scans at most 256 checkouts"),
        ("outcome-candidate-scan", queue_scanned(), 200, "issues",
         "outcome_lane.candidates stops after 200 Validating issues; later issues never get a receipt"),
    ]
    out = []
    for ident, used, limit, unit, effect in rows:
        out.append({"id": ident, "used": used, "limit": limit, "unit": unit, "effect": effect,
                    "fraction": None if used is None or not limit else round(used / limit, 3)})
    return out


def observe(state: Path, now: float, receipts: list[dict], limits: dict, run=None,
            fetch_remote: bool = True) -> dict:
    queue_unmergeable = None
    if fetch_remote:
        try:
            import queue_unmergeable as _queue
            queue_unmergeable = _queue.sweep(state, run or _budgeted_gh, now)
        except Exception as error:  # noqa: BLE001  (a sweep failure must never stop the sentinel)
            queue_unmergeable = {"seen": [], "dequeued": [], "errors": [f"{type(error).__name__}: {error}"[:160]]}
    flow, flow_error = (sample_release_flow(state, now, run) if fetch_remote else (None, None))
    if fetch_remote:
        sample_queue_timings(state, now, run)
    exits = read_idle_exits(state, now)
    repos, repo_errors = {}, {}
    for watched in (WATCHED_REPOS if fetch_remote else ()):
        flow_row, flow_err = sample_repo_flow(state, watched, now, run)
        repos[watched] = flow_row
        if flow_err:
            repo_errors[watched] = flow_err
    breaker = None
    if fetch_remote:
        try:
            import queue_breaker as _breaker
            breaker = _breaker.sweep(state, run or _budgeted_gh, now)
        except Exception as error:  # noqa: BLE001
            breaker = {"tripped": [], "reblocked": [], "errors": [f"{type(error).__name__}: {error}"[:160]]}
    return {"queueBreaker": breaker, "queueUnmergeable": queue_unmergeable, "pushes1h": pushes_by_lane(receipts, now), "claimErrors30m": claim_errors_by_lane(receipts, now),
            "idleExits1h": dict(Counter(row["reason"] for row in exits)),
            "idleExitsByProvider1h": {name: dict(Counter(r["reason"] for r in exits if r.get("provider") == name))
                                      for name in sorted({r.get("provider") for r in exits if r.get("provider")})},
            "releaseFlow": flow, "releaseFlowError": flow_error, "repos": repos, "repoErrors": repo_errors,
            "growth": growth_bounds(state, limits)}


def _top(counter: dict, n: int = 3) -> str:
    return ", ".join(f"{reason} x{count}" for reason, count in Counter(counter).most_common(n)) or "none recorded"


def judge(obs: dict) -> dict[str, str]:
    """Stable key -> one-line cause naming the stage and the evidence."""
    alerts: dict[str, str] = {}
    sentinel = obs.get("sentinel") or {}
    if not sentinel:
        return alerts
    # 1. Demand but no lane push, per repo and lane.
    capacity = obs.get("capacityByProvider") or {}
    demand = obs.get("eligiblePoolByProvider") or {}
    pushes = sentinel.get("pushes1h") or {}
    if not obs.get("operatorDraining") and obs.get("linearError") is None:
        for provider, row in sorted(capacity.items()):
            if not demand.get(provider) or not row.get("slots"):
                continue
            if pushes.get(f"{REPO}|{provider}", 0) == 0:
                idle = (sentinel.get("idleExitsByProvider1h") or {}).get(provider) or {}
                alerts[f"throughput-no-push:{REPO}:{provider}"] = (
                    f"stage claim->push: {demand[provider]} eligible issues and {row['slots']} {provider} seat(s) "
                    f"({row.get('running', 0)} running, oldest lease "
                    f"{round((row.get('oldestLeaseAge') or 0) / 60)} min) but zero {provider} pushes in the last 60 min; "
                    f"idle exits 1h: {_top(idle)}; held: {obs.get('heldByReason') or {}}")
    # 1b. Claim errors: runs that die before any work because the claim ledger is unreadable.
    for provider, row in sorted((sentinel.get("claimErrors30m") or {}).items()):
        if row.get("runs", 0) >= CLAIM_ERROR_MIN_RUNS and row.get("claimErrors", 0) / row["runs"] > CLAIM_ERROR_FRACTION:
            alerts[f"throughput-claim-errors:{provider}"] = (
                f"stage claim ({provider}): {row['claimErrors']}/{row['runs']} runs in the last 30 min ended on claim-error "
                f"({row.get('sample')}); check runs/execution-attempts.jsonl for a torn line and the execution coordinator")
    # 1c. An UNMERGEABLE queue entry is dequeued and routed by queue_unmergeable; an alarm only when that fails.
    stuck = sentinel.get("queueUnmergeable") or {}
    if stuck.get("errors") and stuck.get("seen"):
        alerts["throughput-queue-unmergeable"] = (
            f"stage queued->merged: UNMERGEABLE merge-queue entries {[row['pr'] for row in stuck['seen']]} could not be "
            f"auto-dequeued: {'; '.join(stuck['errors'])[:300]}")
    tripped = sentinel.get("queueBreaker") or {}
    if tripped.get("tripped"):
        alerts["throughput-queue-breaker"] = (
            f"stage queued->merged: PR(s) {tripped['tripped']} failed merge-group CI twice in 3h and were dequeued and held with "
            "lane-fix-red; re-enqueue waits for a new head and a green PR-time check")
    # 2. Queue but no merges.
    merge = obs.get("mergeThroughput") or {}
    if isinstance(merge.get("observedAt"), (int, float)) and obs["now"] - merge["observedAt"] < 1800 \
            and (merge.get("queueDepth") or 0) > 0 and merge.get("mergedPerHour") == 0:
        alerts["throughput-queue-no-merge"] = (
            f"stage queued->merged: {merge['queueDepth']} PRs in the merge queue, zero merges in the last 60 min "
            f"(queue wait p50 {merge.get('queueWaitP50Minutes')} min, ejection rate {merge.get('ejectionRate')}); "
            f"evidence: node scripts/promotion-loss-metrics.mjs --since 1h --json")
    # 3 and 4. Merge-group runner wait and production lease.
    flow = sentinel.get("releaseFlow") or {}
    if (flow.get("mergeGroupJobs") or 0) >= MERGE_GROUP_MIN_RUNS and \
            (flow.get("mergeGroupStartP50Min") or 0) > MERGE_GROUP_START_P50_MIN:
        alerts["throughput-merge-group-start-slow"] = (
            f"stage merge-group created->started: p50 {flow['mergeGroupStartP50Min']} min (max "
            f"{flow.get('mergeGroupStartMaxMin')}) over {flow.get('mergeGroupJobs')} jobs in the latest {flow['mergeGroupRuns']} merge_group runs; "
            "runner capacity or Actions queueing; check runner-heartbeat and runner-health-monitor")
    pools = flow.get("mergeGroupStartByPool") or {}
    hosted, fixed = pools.get("hosted") or {}, pools.get("self-hosted") or {}
    if (hosted.get("n") or 0) >= POOL_MIN_JOBS and (fixed.get("n") or 0) >= POOL_MIN_JOBS \
            and fixed["p50S"] > hosted["p50S"] + POOL_SLOWER_MARGIN_S:
        alerts["throughput-merge-gate-pool"] = (
            f"stage merge-group created->started: self-hosted p50 {fixed['p50S']}s / p95 {fixed['p95S']}s vs hosted "
            f"p50 {hosted['p50S']}s / p95 {hosted['p95S']}s; route merge-gate jobs to hosted by deleting repo variable MERGE_GATE_POOL"
            "")
    elif (hosted.get("n") or 0) >= POOL_MIN_JOBS and not fixed and hosted["p50S"] > HOSTED_SATURATED_P50_S:
        alerts["throughput-merge-gate-pool"] = (
            f"stage merge-group created->started: hosted p50 {hosted['p50S']}s / p95 {hosted['p95S']}s (saturated); "
            "consider the gem pool: set repo variable MERGE_GATE_POOL=fixed")
    if (flow.get("leaseHeldMin") or 0) > LEASE_HELD_MIN:
        alerts["throughput-prod-lease-held"] = (
            f"stage deploy: a Production Controller run has held the production lease {flow['leaseHeldMin']} min "
            f"(> {LEASE_HELD_MIN:g}; plain release is ~22 min); runs "
            f"{', '.join(str(i) for i in flow.get('leaseRunIds') or [])}")
    # 4b. Repos without lane demand: a clean PR that nothing merges, and PRs stuck open.
    for repo, flow_row in sorted((sentinel.get("repos") or {}).items()):
        if not flow_row or obs["now"] - float(flow_row.get("observedAt") or 0) > 1800:
            continue
        prs = [pr for pr in flow_row.get("openPrs") or [] if not pr.get("draft")]
        clean = [pr for pr in prs if pr.get("state") == "CLEAN"
                 and obs["now"] - float(pr.get("updatedAt") or obs["now"]) > CLEAN_WAIT_S]
        if clean and not flow_row.get("merged1h"):
            alerts[f"throughput-no-merge:{repo}"] = (
                f"stage ready->merged ({repo}): {len(clean)} clean non-draft PR(s) "
                f"({', '.join('#' + str(pr['number']) for pr in clean[:5])}) idle > 60 min and zero merges in the last 60 min; "
                "check the repo's merge queue enrollment and required checks")
        stuck = [pr for pr in prs if pr.get("state") in ("DIRTY", "BEHIND", "BLOCKED", "UNKNOWN", "UNSTABLE")
                 and obs["now"] - float(pr.get("updatedAt") or obs["now"]) > PR_STUCK_S]
        if stuck:
            alerts[f"throughput-pr-stuck:{repo}"] = (
                f"stage pr-open->ready ({repo}): {len(stuck)} non-draft PR(s) untouched > 24h and not mergeable: "
                + ", ".join(f"#{pr['number']} {pr['state']} by {pr.get('author') or 'unknown'}" for pr in stuck[:5]))
    # 4c. Demand exists, so an idle exit must not be for any reason but "no demand".
    for provider, reasons in sorted((sentinel.get("idleExitsByProvider1h") or {}).items()):
        total = sum(reasons.values())
        if demand.get(provider) and total >= IDLE_NOT_DEMAND_MIN_EXITS and not (set(reasons) & NO_DEMAND_REASONS):
            alerts[f"throughput-idle-not-demand:{provider}"] = (
                f"stage claim ({provider}): {demand[provider]} eligible issues but {total} idle exits in the last hour, none for "
                f"lack of demand: {_top(reasons, 5)}; a gate, cap or unreadable input closed the lane")
    # 5. One idle reason dominating the hour while there is demand.
    exits = sentinel.get("idleExits1h") or {}
    total = sum(exits.values())
    if total >= IDLE_DOMINANT_MIN_EXITS and (obs.get("eligiblePool") or obs.get("openPRCount")):
        reason, count = Counter(exits).most_common(1)[0]
        if count / total > IDLE_DOMINANT_FRACTION and reason != "maintenance-only-idle":
            alerts["throughput-idle-dominant"] = (
                f"stage claim: {count}/{total} worker idle exits in the last hour were '{reason}' "
                f"({round(100 * count / total)}%) while work is waiting; all reasons: {_top(exits, 5)}")
    # 6. Backlog-scaled limits.
    for row in sentinel.get("growth") or []:
        if row.get("fraction") is not None and row["fraction"] >= GROWTH_ALARM_FRACTION:
            alerts[f"growth-bound:{row['id']}"] = (
                f"{row['id']} at {round(100 * row['fraction'])}% of its limit ({row['used']}/{row['limit']} {row['unit']}); "
                f"{row['effect']}")
    return alerts
