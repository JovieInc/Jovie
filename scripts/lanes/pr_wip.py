#!/usr/bin/env python3
"""Per-producer PR WIP limits, open-PR census and idle expiry (one policy: pr-wip-policy.json).

Producers open PRs faster than the merge queue lands them (2026-11-01: 391 open, ~96
merges/day, +69/day net). A producer is the branch prefix before the first '/'. While it
owns `cap` or more open, unheld PRs it may not open another (pr-open.mjs `admit`) and its
lane may not claim a new issue (lane_runner.new_issue_budget). Repairs of existing PRs are
never gated. The census feeds the reconcile counts (lanes feed `prs.wip` -> Ovie and
Summer); expiry closes ownerless idle PRs with a comment and keeps the branch.

api-budget: github-user-graphql 12/hr - CLI report/admit/expire, one paginated open-PR read (<=5 pages) per run
api-budget: github-user-core 20/hr - expire --apply closes at most maxClosesPerTick PRs per run
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
POLICY_PATH = Path(os.environ.get("LANES_PR_WIP_POLICY", HERE / "pr-wip-policy.json"))
HOLD_LABELS = frozenset({"hold", "gated", "incident", "queue-deferred"})
REPO_SLUG = "JovieInc/Jovie"


def load_policy(path: Path | None = None) -> dict:
    try:
        return json.loads(Path(path or POLICY_PATH).read_text())
    except (OSError, ValueError):
        return {}


def producer_of(branch: str | None) -> str:
    branch = (branch or "").strip()
    return branch.split("/", 1)[0].lower() if "/" in branch else "(none)"


def cap_for(producer: str, policy: dict) -> int | None:
    """None means exempt (Tim's own branches, dependabot, queue refs) or no policy."""
    if not policy or producer in set(policy.get("exemptProducers") or []):
        return None
    caps = policy.get("caps") or {}
    cap = caps.get(producer, policy.get("defaultCap"))
    return None if cap is None else max(int(policy.get("minCap", 1)), int(cap))


def _labels(pr: dict) -> set[str]:
    return {(label.get("name") if isinstance(label, dict) else str(label)).lower()
            for label in pr.get("labels") or []}


def held(pr: dict) -> bool:
    return producer_of(pr.get("headRefName")) == "tim" or bool(_labels(pr) & HOLD_LABELS)


def _epoch(value) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(q * len(ordered)) - 1)]


def owned(prs: list[dict], producer: str) -> list[dict]:
    """A producer's WIP: its open PRs, minus human-held ones (not the producer's to land)."""
    return [pr for pr in prs if producer_of(pr.get("headRefName")) == producer and not held(pr)]


def admit(prs: list[dict] | None, producer: str, policy: dict | None = None) -> dict:
    """New-PR / new-issue admission. Unknown inventory admits (fail open): the in-flight
    duplicate read fails closed separately, and a missing count must not stall shipping."""
    policy = load_policy() if policy is None else policy
    cap = cap_for(producer, policy)
    if cap is None:
        return {"allowed": True, "reason": "wip-exempt", "producer": producer, "used": None, "cap": None}
    if prs is None:
        return {"allowed": True, "reason": "wip-unknown", "producer": producer, "used": None, "cap": cap}
    used = len(owned(prs, producer))
    return {"allowed": used < cap, "reason": "within-wip" if used < cap else "wip-cap",
            "producer": producer, "used": used, "cap": cap}


def live_producers(prs: list[dict], now: float, policy: dict) -> set[str]:
    """A producer is live when any of its open PRs moved inside liveWindowHours."""
    window = float(policy.get("liveWindowHours", 48)) * 3600
    return {producer_of(pr.get("headRefName")) for pr in prs
            if (moved := _epoch(pr.get("updatedAt"))) is not None and now - moved <= window}


def expiry_candidates(prs: list[dict], now: float, policy: dict | None = None, *,
                      force: bool = False) -> list[tuple[dict, str]]:
    """Idle PRs to close: ownerless producer idle > ownerlessIdleDays, or anyone idle >
    anyIdleDays. Never held, exempt, or queued PRs. Oldest first. `force` lists or closes
    candidates while the automatic path is disabled (an explicit operator run)."""
    policy = load_policy() if policy is None else policy
    rule = policy.get("expire") or {}
    if not (rule.get("enabled") or force):
        return []
    live = live_producers(prs, now, policy)
    out = []
    for pr in prs:
        producer = producer_of(pr.get("headRefName"))
        moved = _epoch(pr.get("updatedAt"))
        if moved is None or held(pr) or cap_for(producer, policy) is None or pr.get("isInMergeQueue"):
            continue
        idle_days = (now - moved) / 86400
        if producer not in live and idle_days > float(rule.get("ownerlessIdleDays", 7)):
            out.append((pr, f"no live owner: `{producer}/` has no PR activity in "
                            f"{policy.get('liveWindowHours', 48)}h and this PR is idle {idle_days:.0f} days"))
        elif idle_days > float(rule.get("anyIdleDays", 21)):
            out.append((pr, f"idle {idle_days:.0f} days (over the {rule.get('anyIdleDays', 21)}-day limit)"))
    return sorted(out, key=lambda row: _epoch(row[0].get("updatedAt")) or 0)


def census(prs: list[dict], now: float, policy: dict | None = None) -> dict:
    """Open-PR count, age and mergeability, per producer and over-cap; JSON-safe."""
    policy = load_policy() if policy is None else policy
    ages = [(now - created) / 3600 for pr in prs if (created := _epoch(pr.get("createdAt"))) is not None]
    mergeable: dict[str, int] = {}
    for pr in prs:
        state = str(pr.get("mergeStateStatus") or "UNKNOWN")
        mergeable[state] = mergeable.get(state, 0) + 1
    producers: dict[str, dict] = {}
    for producer in sorted({producer_of(pr.get("headRefName")) for pr in prs}):
        decision = admit(prs, producer, policy)
        producers[producer] = {"open": sum(producer_of(pr.get("headRefName")) == producer for pr in prs),
                               "wip": decision["used"], "cap": decision["cap"],
                               "overCap": decision["reason"] == "wip-cap"}
    return {"schema": "jovie-pr-wip/v1", "open": len(prs),
            "drafts": sum(bool(pr.get("isDraft")) for pr in prs),
            "ageP50Hours": None if not ages else round(_percentile(ages, 0.5), 1),
            "ageP95Hours": None if not ages else round(_percentile(ages, 0.95), 1),
            "mergeable": mergeable, "byProducer": producers,
            "overCap": sorted(name for name, row in producers.items() if row["overCap"]),
            "expiryCandidates": len(expiry_candidates(prs, now, policy, force=True))}


EXPIRY_COMMENT = ("🤖 pr-wip: closing this idle PR ({why}). Policy: `scripts/lanes/pr-wip-policy.json`. "
                  "The branch `{branch}` is kept, so nothing is lost: reopen this PR or open a fresh one "
                  "from the branch when someone owns it again.")

OPEN_PRS_QUERY = ("query($endCursor:String){repository(owner:\"JovieInc\",name:\"Jovie\"){pullRequests("
                  "states:OPEN,first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{number "
                  "headRefName isDraft mergeStateStatus isInMergeQueue createdAt updatedAt "
                  "labels(first:20){nodes{name}}}}}}")


def fetch_open_prs(run_gh=None) -> list[dict] | None:
    if run_gh is None:
        sys.path.insert(0, str(HERE.parent))
        from apiclient import run_gh  # noqa: PLC0415  (the one client layer)
    result = run_gh(["api", "graphql", "--paginate", "-f", f"query={OPEN_PRS_QUERY}",
                     "--jq", ".data.repository.pullRequests.nodes[] | tojson"], priority="report")
    if result.get("code") != 0:
        return None
    try:
        rows = [json.loads(line) for line in (result.get("stdout") or "").splitlines() if line.strip()]
    except ValueError:
        return None
    for row in rows:
        row["labels"] = (row.get("labels") or {}).get("nodes") or []
    return rows


def close_pr(number: int, body: str, run_gh=None) -> bool:
    """Close with a comment through the budgeted client; the branch is never deleted."""
    if run_gh is None:
        sys.path.insert(0, str(HERE.parent))
        from apiclient import run_gh  # noqa: PLC0415
    return run_gh(["pr", "close", str(number), "--repo", REPO_SLUG, "--comment", body],
                  priority="default").get("code") == 0


def expire(prs: list[dict], now: float, policy: dict, close, *, force: bool = False) -> list[dict]:
    """Close at most maxClosesPerTick candidates via `close(number, comment) -> bool`."""
    limit = int((policy.get("expire") or {}).get("maxClosesPerTick", 10))
    closed = []
    for pr, why in expiry_candidates(prs, now, policy, force=force)[:limit]:
        if close(pr["number"], EXPIRY_COMMENT.format(why=why, branch=pr.get("headRefName"))):
            closed.append({"pr": pr["number"], "branch": pr.get("headRefName"), "reason": why})
    return closed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("report")
    gate = sub.add_parser("admit")
    gate.add_argument("--branch", required=True)
    run = sub.add_parser("expire")
    run.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    policy, now = load_policy(), time.time()
    prs = fetch_open_prs()
    if args.cmd == "admit":
        decision = admit(prs, producer_of(args.branch), policy)
        print(json.dumps(decision))
        return 0 if decision["allowed"] else 3
    if prs is None:
        print(json.dumps({"error": "open-prs-unreadable"}))
        return 75
    if args.cmd == "report":
        print(json.dumps(census(prs, now, policy), indent=2))
        return 0
    if not args.apply:
        print(json.dumps([{"pr": pr["number"], "branch": pr["headRefName"], "reason": why}
                          for pr, why in expiry_candidates(prs, now, policy, force=True)], indent=2))
        return 0
    closed = expire(prs, now, policy, close_pr, force=True)
    print(json.dumps(closed, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
