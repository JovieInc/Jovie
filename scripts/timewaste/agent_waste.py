"""Agent-waste ledger: CI rework, idle wakes, duplicate work, stalled workers, cost per outcome, queue and host.

Reuses existing feeds instead of new loops: ci-rounds-report's query shape, throughput_sentinel's
idle-exits.jsonl / host-alarms.jsonl / queue-timings.json under the lanes state dir, the run ledger
(runs/ledger.jsonl) and docs/metrics/shipping-slo-latest.json. A missing feed is reported, never zero.
"""
from __future__ import annotations

# api-budget: github-user-core 12/hr - weekly collect at <=1/hr; three merge-group run pages, four client attempts each
# api-budget: github-user-graphql 200/hr - weekly collect at <=1/hr; point reserve for three CI-query sizes and ten PR-list pages including retries

import json
import re
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = str(Path(__file__).resolve().parents[1])
REPO = "JovieInc/Jovie"
# Documented assumptions (re-tune from the ledger's agentSeconds when present).
ROUND_AGENT_H = 0.4      # one extra CI round: wall wait plus the repair turn
DUP_PR_AGENT_H = 1.5     # one PR built twice: the discarded build
NOOP_WAKE_AGENT_H = 0.02  # a coordinator turn spent on "no change" (~1.2 min)
EJECTION_AGENT_H = 0.3   # a queue ejection: re-run plus repair turn
PRICES = {"opus": (15.0, 75.0), "sonnet": (3.0, 15.0), "haiku": (1.0, 5.0)}  # USD per M tokens in/out
NON_LANDING = frozenset({"failed", "cancelled", "quarantined", "gate-timeout", "fix-no-change", "sync-failed", "not-shippable"})
IDLE_VERDICTS = frozenset({"gate-deferred", "reconcile-unavailable"})
JOV = re.compile(r"\bJOV-\d+\b", re.I)


def _iso(value) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _pct(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, max(0, int(len(values) * q) - (0 if len(values) * q % 1 else 1)))] if values else None


def _gh_json(args):
    if SCRIPTS not in sys.path:
        sys.path.insert(0, SCRIPTS)
    from apiclient.gh import run_gh
    done = run_gh(list(args), priority="report")
    if done["code"] != 0:
        raise RuntimeError(f"gh exit {done['code']}")
    return json.loads(done["stdout"])


ROUNDS_QUERY = ('query { repository(owner:"JovieInc", name:"Jovie") { pullRequests(states: MERGED, last: %d, '
                'orderBy:{field:UPDATED_AT, direction:ASC}) { nodes { number mergedAt commits(first: 50) { nodes { '
                'commit { oid checkSuites(first: 30, filterBy: {appId: 15368}) { nodes { workflowRun { workflow '
                '{ name } } } } } } } } } } }')


def ci_rework(since: float, fetch=_gh_json, prs: int = 40) -> dict:
    """Source Validation rounds per merged PR (same definition as scripts/ci-rounds-report.mjs)."""
    nodes, error = None, None
    for size in (prs, prs // 2, prs // 4):  # a wide commit/check-suite fan-out can 502; shrink and retry
        try:
            nodes = fetch(["api", "graphql", "-f", f"query={ROUNDS_QUERY % size}"])["data"]["repository"]["pullRequests"]["nodes"]
            break
        except (RuntimeError, KeyError, ValueError, TypeError) as exc:
            error = exc
    if nodes is None:
        return {"available": False, "reason": type(error).__name__}
    rows = []
    for pr in nodes:
        merged = _iso(pr.get("mergedAt"))
        if merged is None or merged < since:
            continue
        rounds = sum(1 for n in pr["commits"]["nodes"] if any(
            ((s.get("workflowRun") or {}).get("workflow") or {}).get("name") == "Source Validation"
            for s in n["commit"]["checkSuites"]["nodes"]))
        rows.append({"pr": pr["number"], "rounds": rounds})
    rounds = [r["rounds"] for r in rows]
    extra = sum(max(0, r - 1) for r in rounds)
    return {"available": True, "prs": len(rows), "roundsP50": statistics.median(rounds) if rounds else None,
            "roundsP95": _pct(rounds, 0.95), "reworkRounds": extra,
            "prsOver3Rounds": sum(1 for r in rounds if r > 3), "worst": sorted(rows, key=lambda r: -r["rounds"])[:3],
            "agentHours": round(extra * ROUND_AGENT_H, 1)}


def duplicate_work(since: float, fetch=_gh_json) -> dict:
    """PRs opened in the window; groups sharing a JOV id with at least one closed-unmerged are built twice."""
    try:
        rows = fetch(["pr", "list", "--repo", REPO, "--state", "all", "--limit", "1000", "--json",
                      "number,title,headRefName,state,createdAt,closedAt,mergedAt,isDraft,updatedAt"])
    except (RuntimeError, ValueError) as error:
        return {"available": False, "reason": type(error).__name__}
    window = [r for r in rows if (_iso(r.get("createdAt")) or 0) >= since]
    groups: dict[str, list] = {}
    for r in window:
        m = JOV.search(f"{r.get('title', '')} {r.get('headRefName', '')}")
        if m:
            groups.setdefault(m.group(0).upper(), []).append(r)
    built_twice = [k for k, v in groups.items() if len(v) > 1 and any(x["state"] == "CLOSED" and not x.get("mergedAt") for x in v)]
    closed_unmerged = [r for r in window if r["state"] == "CLOSED" and not r.get("mergedAt")]
    now = datetime.now(timezone.utc).timestamp()
    stale_drafts = [r for r in window if r["state"] == "OPEN" and r.get("isDraft") and now - (_iso(r.get("updatedAt")) or now) > 24 * 3600]
    oldest = min((_iso(r.get("createdAt")) or since for r in rows), default=since)
    return {"available": True, "prsOpened": len(window), "coversFullWindow": oldest <= since, "builtTwice": len(built_twice),
            "builtTwiceIds": built_twice[:5], "closedUnmerged": len(closed_unmerged),
            "staleDrafts24h": len(stale_drafts), "agentHours": round(len(built_twice) * DUP_PR_AGENT_H, 1)}


def queue_ejections(since: float, fetch=_gh_json, slo_path: Path | None = None) -> dict:
    out: dict = {"available": False}
    if slo_path and slo_path.exists():
        try:
            slo = json.loads(slo_path.read_text())
            out.update({"available": True, "ejectionRate": slo.get("queueEjectionRate"),
                        "queueWaitP95Min": round(slo["queueWaitP95Seconds"] / 60, 1) if slo.get("queueWaitP95Seconds") else None,
                        "mergesPerDay": (slo.get("throughput") or {}).get("mergesPerDay")})
        except (OSError, ValueError):
            pass
    try:
        since_s = datetime.fromtimestamp(since, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        runs = []
        for page in (1, 2, 3):
            data = fetch(["api", f"repos/{REPO}/actions/runs?event=merge_group&per_page=100&page={page}&created=%3E%3D{since_s}"])
            runs += data.get("workflow_runs") or []
            if len(data.get("workflow_runs") or []) < 100:
                break
        real = [r for r in runs if r.get("conclusion") not in (None, "skipped")]
        failed = sum(1 for r in real if r["conclusion"] in ("failure", "cancelled", "timed_out"))
        out.update({"available": True, "mergeGroupRuns": len(real), "mergeGroupFailed": failed,
                    "failedShare": round(failed / len(real), 3) if real else None,
                    "agentHours": round(failed * EJECTION_AGENT_H, 1)})
    except (RuntimeError, ValueError, AttributeError):
        out.setdefault("reason", "merge-group-runs-unavailable")
    return out


def _jsonl(path: Path, since: float, ts_keys=("endedAt", "at", "ts", "observedAt")) -> list[dict]:
    rows = []
    try:
        with open(path, "rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 24 * 1024 * 1024))
            lines = handle.read().decode(errors="replace").splitlines()
    except OSError:
        return []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        ts = next((_iso(row[k]) if isinstance(row.get(k), str) else row.get(k) for k in ts_keys if row.get(k) is not None), None)
        if isinstance(ts, (int, float)) and ts >= since:
            rows.append(row)
    return rows


def lane_state(since: float, state: Path | None) -> dict:
    """Run-ledger outcomes, idle/no-change wakes and host alarms from the lanes state dir (the Gem host)."""
    if not state or not state.exists():
        return {"available": False, "reason": "no-state-dir"}
    ledger = _jsonl(state / "runs/ledger.jsonl", since)
    runs = [r for r in ledger if r.get("verdict")]
    verdicts = Counter(r["verdict"] for r in runs)
    non_landing = [r for r in runs if r["verdict"] in NON_LANDING]
    secs = lambda rs: sum(float(r.get("agentSeconds") or 0) for r in rs)
    idle = _jsonl(state / "idle-exits.jsonl", since, ("at", "ts", "observedAt"))
    alarms = _jsonl(state / "host-alarms.jsonl", since, ("at", "ts", "observedAt"))
    alarm_kinds = Counter(str(a.get("kind") or a.get("alarm") or a.get("level") or "host") for a in alarms)
    return {"available": True, "runs": len(runs), "verdicts": dict(verdicts.most_common(8)),
            "idleWakes": sum(verdicts[v] for v in IDLE_VERDICTS), "idleExitsLogged": len(idle),
            "idleReasons": dict(Counter(str(r.get("reason")) for r in idle).most_common(4)),
            "stalledOrFailed": len(non_landing), "stalledAgentHours": round(secs(non_landing) / 3600, 1),
            "allAgentHours": round(secs(runs) / 3600, 1), "hostAlarms": len(alarms),
            "hostAlarmKinds": dict(alarm_kinds.most_common(4))}


def token_cost(since: float, projects_dir: Path | None = None) -> dict:
    """Local Claude Code transcript spend (lower bound: other lanes are unattributed)."""
    import glob
    import os
    projects_dir = projects_dir or Path.home() / ".claude/projects"
    seen, usd, tokens = set(), 0.0, 0
    for path in glob.glob(str(projects_dir / "*" / "*.jsonl")):
        try:
            if os.path.getmtime(path) < since:
                continue
            lines = Path(path).read_text(errors="ignore").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") != "assistant":
                continue
            ts, m = _iso(d.get("timestamp")), d.get("message") or {}
            u = m.get("usage")
            mid = m.get("id") or d.get("uuid")
            if not u or ts is None or ts < since or mid in seen:
                continue
            seen.add(mid)
            tier = next((k for k in PRICES if k in str(m.get("model", "")).lower()), None)
            if not tier:
                continue
            pin, pout = PRICES[tier]
            inp, out = u.get("input_tokens", 0), u.get("output_tokens", 0)
            cr, cw = u.get("cache_read_input_tokens", 0), u.get("cache_creation_input_tokens", 0)
            usd += (inp * pin + out * pout + cr * pin * 0.1 + cw * pin * 1.25) / 1e6
            tokens += inp + out + cr + cw
    return {"available": True, "tokens": tokens, "estUsd": round(usd, 2), "note": "local Claude Code transcripts only"}


def time_now() -> float:
    import time
    return time.time()


def collect(since: float, state: Path | None, wake: dict | None, slo_path: Path | None, fetch=_gh_json,
            projects_dir: Path | None = None) -> dict:
    ci, dup = ci_rework(since, fetch), duplicate_work(since, fetch)
    queue, lanes = queue_ejections(since, fetch, slo_path), lane_state(since, state)
    cost = token_cost(since, projects_dir)
    wake = wake or {"notifications": 0, "noOpWakes": 0}
    noop_h = wake["noOpWakes"] * NOOP_WAKE_AGENT_H
    # Denominator: merges in the window (shipping-slo throughput), else the CI sample; never the sample when SLO exists.
    per_day = queue.get("mergesPerDay")
    merged = round(per_day * max(1, (time_now() - since) / 86400)) if per_day else (ci.get("prs") if ci.get("available") else None)
    wasted = sum(x for x in (ci.get("agentHours"), dup.get("agentHours"), queue.get("agentHours"),
                             lanes.get("stalledAgentHours"), round(noop_h, 1)) if x)
    return {"ci": ci, "duplicates": dup, "queue": queue, "lanes": lanes, "wakes": {**wake, "agentHours": round(noop_h, 1)},
            "cost": {**cost, "mergedPrs": merged,
                     "usdPerMergedPr": round(cost["estUsd"] / merged, 2) if merged else None,
                     "agentHoursPerMergedPr": round(lanes["allAgentHours"] / merged, 2) if merged and lanes.get("available") else None},
            "wastedAgentHours": round(wasted, 1)}
