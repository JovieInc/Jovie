"""Throughput sentinel: no-progress alarms, idle-reason accounting and growth-bound headroom.

Tim 2026-10-24: throughput tanks after a day and nobody can find why. This module adds the
missing alarms on existing plumbing only: the doctor observes (`observe`), judges (`judge`)
and routes through its Tracker like every other doctor alert; nothing here owns a new loop.

Alarms (each names its stage and carries its evidence):
  throughput-no-push:<repo>:<lane>   demand > 0, seats configured, zero lane pushes for 60 min
  throughput-queue-no-merge          merge queue > 0, zero merges in the last 60 min
  throughput-merge-group-start-slow  merge-group runs wait > 5 min (p50) for a runner
  throughput-prod-lease-held         a Production Controller run holds the lease > 45 min
  throughput-idle-dominant           one idle/hold reason is > 50% of the last hour's exits
  growth-bound:<id>                  a size/count limit that scales with backlog passed 70%
Production-not-reached-in-90-min is the existing production-continuity freshness incident
(.github/scripts/production-continuity.mjs, threshold lowered to 90 min).
"""
from __future__ import annotations

import json
import os
import statistics
import subprocess
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
LEASE_HELD_MIN = 45.0
IDLE_DOMINANT_FRACTION = 0.5
IDLE_DOMINANT_MIN_EXITS = 6
GROWTH_ALARM_FRACTION = 0.7
RELEASE_FLOW_REFRESH_S = 300
MERGE_GROUP_SAMPLE_RUNS = 3
PUSH_VERDICTS = frozenset({"pr-opened", "pushed", "fix-pushed", "landing", "verified-not-queued", "decomposed"})
REPO = "JovieInc/Jovie"
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


def pushes_by_lane(receipts: list[dict], now: float) -> dict[str, int]:
    """Lane pushes in the last hour per `repository|provider`, from the run ledger."""
    counts: Counter = Counter()
    for row in receipts or []:
        ended = _iso_epoch(row.get("endedAt"))
        if ended is None or not 0 <= now - ended <= NO_PUSH_S or row.get("verdict") not in PUSH_VERDICTS:
            continue
        counts[f"{row.get('repository') or REPO}|{row.get('provider') or 'unknown'}"] += 1
    return dict(counts)


def _gh_json(run, path: str):
    result = run(["gh", "api", path], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or f"exit {result.returncode}").strip()[-160:])
    return json.loads(result.stdout)


def sample_release_flow(state: Path, now: float, run=subprocess.run, repo: str = REPO) -> tuple[dict | None, str | None]:
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
        waits, sampled = [], 0
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
        held = _gh_json(run, f"repos/{repo}/actions/workflows/{CONTROLLER_WORKFLOW}/runs?status=in_progress&per_page=10")
        leases = [(now - started) / 60 for row in held.get("workflow_runs") or []
                  if (started := _iso_epoch(row.get("run_started_at"))) is not None]
        runs = [row.get("id") for row in held.get("workflow_runs") or []]
        signal = {"schema": "symphony-release-flow/v1", "observedAt": now,
                  "mergeGroupRuns": sampled, "mergeGroupJobs": len(waits),
                  "mergeGroupStartP50Min": round(statistics.median(waits), 2) if waits else None,
                  "mergeGroupStartMaxMin": round(max(waits), 2) if waits else None,
                  "leaseHeldMin": round(max(leases), 1) if leases else 0.0, "leaseRunIds": runs[:3]}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(signal, sort_keys=True))
        os.replace(tmp, path)
        return signal, None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
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


def observe(state: Path, now: float, receipts: list[dict], limits: dict, run=subprocess.run,
            fetch_remote: bool = True) -> dict:
    flow, flow_error = (sample_release_flow(state, now, run) if fetch_remote else (None, None))
    exits = read_idle_exits(state, now)
    return {"pushes1h": pushes_by_lane(receipts, now),
            "idleExits1h": dict(Counter(row["reason"] for row in exits)),
            "idleExitsByProvider1h": {name: dict(Counter(r["reason"] for r in exits if r.get("provider") == name))
                                      for name in sorted({r.get("provider") for r in exits if r.get("provider")})},
            "releaseFlow": flow, "releaseFlowError": flow_error,
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
    if (flow.get("leaseHeldMin") or 0) > LEASE_HELD_MIN:
        alerts["throughput-prod-lease-held"] = (
            f"stage deploy: a Production Controller run has held the production lease {flow['leaseHeldMin']} min "
            f"(> {LEASE_HELD_MIN:g}; plain release is ~22 min); runs "
            f"{', '.join(str(i) for i in flow.get('leaseRunIds') or [])}")
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
