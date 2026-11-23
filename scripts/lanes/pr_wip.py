#!/usr/bin/env python3
"""Observed-capacity admission, enforced per-agent WIP caps, PR census and idle expiry.

New work needs matched caller quota, fresh runner backlog AND room under the producer's
WIP cap (Tim 2026-11-22, "finish before starting": an agent at its cap lands, repairs or
hands off its own open PRs before it takes new work; this supersedes the 2026-10-12
no-ceiling rule). Producers listed in `perSession` (many concurrent sessions share one
branch prefix, e.g. `claude/`) are capped per session through the
`<!-- agent-session: ID -->` body marker pr-open writes. Existing PR repairs never consult
the cap. Unknown observations permit only the existing bounded path, never more capacity.

api-budget: github-user-graphql 12/hr - CLI report/admit/expire, one paginated open-PR read (<=5 pages) per run
api-budget: github-search 12/hr - admit --session, one search call per pr-open of a per-session producer
api-budget: github-user-core 20/hr - expire --apply closes at most maxClosesPerTick PRs per run
"""
from __future__ import annotations

import argparse
import json
import math
import os
import stat
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
POLICY_PATH = Path(os.environ.get("LANES_PR_WIP_POLICY", HERE / "pr-wip-policy.json"))
# Parked, not the producer's to land: human holds plus repair-exhausted, escalated and queue-poisoned PRs.
HOLD_LABELS = frozenset({"hold", "gated", "incident", "queue-deferred", "lane-fix-exhausted", "lane-fix-escalating", "queue-poison"})
REPO_SLUG = "JovieInc/Jovie"


def load_policy(path: Path | None = None) -> dict:
    try:
        return json.loads(Path(path or POLICY_PATH).read_text())
    except (OSError, ValueError) as exc:  # fails open (every producer exempt), but never silently
        print(f"pr_wip: policy unreadable ({exc}); WIP caps are not enforced", file=sys.stderr)
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


def total_cap(policy: dict | None = None) -> int:
    """Repo-wide backstop: the sum of every named producer's cap. Each producer is limited by
    its own WIP, so the open-PR total can only pass this when unlisted producers pile up."""
    policy = load_policy() if policy is None else policy
    return sum(max(int(policy.get("minCap", 1)), int(cap)) for cap in (policy.get("caps") or {}).values())


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


def last_activity(pr: dict) -> float | None:
    """Last push (head commit time) or creation, whichever is later. Not `updatedAt`: lane
    label churn touches every open PR, which made all of them look fresh (2026-11-01)."""
    times = [t for t in (_epoch(pr.get("lastCommitAt")), _epoch(pr.get("createdAt"))) if t is not None]
    return max(times) if times else _epoch(pr.get("updatedAt"))


def owned(prs: list[dict], producer: str) -> list[dict]:
    """A producer's WIP: its open PRs, minus human-held ones (not the producer's to land)."""
    return [pr for pr in prs if producer_of(pr.get("headRefName")) == producer and not held(pr)]


SESSION_MARKER = "<!-- agent-session: {session} -->"


def session_cap(policy: dict) -> int | None:
    value = (policy or {}).get("perSessionCap")
    return None if value is None else max(1, int(value))


def per_session(producer: str, policy: dict) -> bool:
    return producer in set((policy or {}).get("perSession") or [])


def _oldest_first(prs: list[dict]) -> list[int]:
    return [pr["number"] for pr in sorted(prs, key=lambda pr: _epoch(pr.get("createdAt")) or 0)]


def admit(prs: list[dict] | None, producer: str, policy: dict | None = None, *, capacity: dict | None = None,
          session_prs: list[dict] | None = None) -> dict:
    """Prospective admission; actual calls reserve quota at the shared client.

    Refuses `wip-cap` when the producer's unheld open PRs (or, for a per-session producer
    with a known session, that session's) fill the cap; `landFirst` names them oldest
    first. Capacity exhaustion wins over the cap. An unreadable inventory fails open with
    `wipKnown: false` so the caller can say so; it never invents a count.
    """
    policy = load_policy() if policy is None else policy
    capacity = capacity or {"allowed": True, "known": False, "reason": "capacity-unknown", "unknown": ["quota", "ci"]}
    mine = None if prs is None else owned(prs, producer)
    scope, cap, counted = "producer", cap_for(producer, policy), mine
    if session_prs is not None and per_session(producer, policy):
        scope, cap, counted = "session", session_cap(policy), [pr for pr in session_prs if not held(pr)]
    decision = {**capacity, "producer": producer, "used": None if mine is None else len(mine),
                "cap": cap_for(producer, policy), "reservation": "at-request", "wipScope": scope,
                "wipUsed": None if counted is None else len(counted), "wipCap": cap, "wipKnown": counted is not None}
    if capacity.get("allowed") is not False and cap is not None and counted is not None and len(counted) >= cap:
        decision.update(allowed=False, reason="wip-cap", capacityReason=capacity.get("reason"), landFirst=_oldest_first(counted)[:10],
                        nextAction="land, repair or hand off (label lane-fix-escalating) these PRs, then retry")
    return decision


# These are the existing measured runner-backlog policy, shared with autoscale.
CI_QUEUED_RUNS_BRAKE, CI_QUEUED_OLDEST_BRAKE_MIN, CI_SIGNAL_STALE_S = 400, 15, 900


def _capacity_file(path: Path, limit: int) -> dict:
    """The lanes' bounded regular-file evidence pattern; never block on a FIFO."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
                return {}
            with os.fdopen(fd, "rb", closefd=False) as handle:
                raw = handle.read(limit + 1)
            value = json.loads(raw) if len(raw) <= limit else None
            return value if isinstance(value, dict) else {}
        finally:
            os.close(fd)
    except (OSError, ValueError):
        return {}


def capacity_from_observation(obs: dict, name: str = "") -> dict:
    """Current canonical evidence outranks cached per-provider observations."""
    obj = lambda value: value if isinstance(value, dict) else {}
    return (obj(obs["admissionCapacity"]) if "admissionCapacity" in obs
            else obj(obj(obj(obs.get("newIssueBudgetByProvider")).get(name)).get("capacity")))


def intake_blockers(obs: dict, name: str = "") -> list[str]:
    """Current resources gate intake; historical symptoms are diagnostic. Repairs remain independent."""
    capacity, gates = capacity_from_observation(obs, name), []
    if capacity.get("allowed") is False:
        gates.extend(capacity.get("blockers") or [capacity.get("reason", "capacity-unavailable")])
    ci = obs.get("ciQueue") if isinstance(obs.get("ciQueue"), dict) else {}
    queued, oldest = ci.get("queuedRuns"), ci.get("oldestMin")
    saturated = ((type(queued) is int and queued >= CI_QUEUED_RUNS_BRAKE)
                 or (type(oldest) in (int, float) and math.isfinite(oldest) and oldest >= CI_QUEUED_OLDEST_BRAKE_MIN))
    if "admissionCapacity" not in obs and ci.get("fresh") and saturated:
        gates.append("ci-runner-backlog")
    return list(dict.fromkeys(gates))


def capacity_snapshot(*, store=None, credential=None, state_dir=None, now=None, priority="default") -> dict:
    """Read the exact caller's ledger and current CI backlog. No API call or new state.

    A token/installation's buckets are never substituted by another credential's larger
    balance. Debits include the shared client's reservations. A zero stays exhausted
    until reset; a passed reset requires a fresh observation, never an inferred refill.
    Caller quota does not attest the separate Actions installation's quota.
    """
    sys.path.insert(0, str(HERE.parent))
    from apiclient.gh import gh_credential
    from apiclient.policy import LEDGER_SCHEMA, UNTIMED_OBSERVATION_MS, decide, empty_credential
    from apiclient.store import FileLedgerStore, credential_label, default_state_root, default_store

    now = time.time() if now is None else now
    at = int(now * 1000)
    store = default_store() if store is None else store
    credential = gh_credential(os.environ) if credential is None else credential
    state_dir = Path(state_dir) if state_dir is not None else default_state_root()
    ledger = (_capacity_file(store.path("github"), 1024 * 1024)
              if isinstance(store, FileLedgerStore) else store.read("github"))
    credentials = (ledger.get("credentials") if isinstance(ledger, dict)
                   and ledger.get("schema") == LEDGER_SCHEMA and ledger.get("provider") == "github" else None)
    state = credentials.get(credential) if isinstance(credentials, dict) else None
    state = state if isinstance(state, dict) else {}
    unknown, blockers, buckets = [], [], {}
    breaker = state.get("breaker") if isinstance(state.get("breaker"), dict) else {}
    breaker_state = breaker.get("state")
    timer = breaker.get("openUntil" if breaker_state == "open" else "probeUntil")
    if (breaker_state not in ("closed", "open", "half-open")
            or (breaker_state != "closed" and (type(timer) not in (int, float) or not math.isfinite(timer) or timer < 0))):
        unknown.append("github:breaker")
    until = breaker.get("openUntil")
    if breaker.get("state") == "open" and type(until) in (int, float) and math.isfinite(until) and until > at:
        blockers.append((f"github-breaker:{breaker.get('reason', 'open')}", until / 1000))
    until = breaker.get("probeUntil")
    if breaker.get("state") == "half-open" and type(until) in (int, float) and math.isfinite(until) and until > at:
        blockers.append(("github-breaker-probe-in-flight", until / 1000))
    observed_buckets = state.get("buckets") if isinstance(state.get("buckets"), dict) else {}
    for resource in ("core", "graphql"):
        bucket = observed_buckets.get(resource)
        bucket = bucket if isinstance(bucket, dict) else {}
        remaining, reset, observed, limit = (bucket.get(key) for key in ("remaining", "resetAt", "observedAt", "limit"))
        number = lambda v: type(v) in (int, float) and math.isfinite(v)
        valid = (number(remaining) and remaining >= 0 and number(limit) and 0 <= remaining <= limit and number(reset) and reset > at
                 and number(observed) and 0 <= at - observed)
        # Known exhaustion survives freshness expiry, but never the provider reset.
        fresh = valid and at - observed <= UNTIMED_OBSERVATION_MS
        buckets[resource] = {"remaining": remaining, "resetAt": reset, "observedAt": observed,
                             "fresh": bool(fresh)}
        if valid and remaining == 0:
            blockers.append((f"github-quota:{resource}", reset / 1000))
        elif not fresh:
            unknown.append(f"github:{resource}")
        else:
            # A prospective quota check uses the canonical priority reserve, without
            # mutating counters or treating malformed unrelated state as capacity.
            prospect = empty_credential(at)
            prospect["buckets"][resource] = dict(bucket)
            d = decide(prospect, priority, {resource: 1}, at)
            if d["action"] != "go":
                blockers.append((f"github-{d['reason']}", None if d["until"] is None else d["until"] / 1000))
    flow = _capacity_file(state_dir / "release-flow.json", 65536)
    stamp, queued, oldest = (flow.get(key) for key in ("observedAt", "queuedRuns", "queuedOldestMin"))
    ci_known = (flow.get("schema") == "symphony-release-flow/v1" and type(stamp) in (int, float)
                and math.isfinite(stamp) and 0 <= now - stamp <= CI_SIGNAL_STALE_S
                and type(queued) is int and queued >= 0
                and (queued == 0 or (type(oldest) in (int, float) and math.isfinite(oldest) and oldest >= 0)))
    if not ci_known:
        unknown.append("ci")
    elif queued >= CI_QUEUED_RUNS_BRAKE or (queued > 0 and oldest >= CI_QUEUED_OLDEST_BRAKE_MIN):
        blockers.append(("ci-runner-backlog", None))
    return {"allowed": not blockers, "known": not unknown,
            "reason": blockers[0][0] if blockers else "capacity-unknown" if unknown else "within-capacity",
            "retryAt": max((reset for _, reset in blockers if reset is not None), default=None),
            "unknown": unknown, "blockers": [reason for reason, _ in blockers], "observedAt": now, "priority": priority,
            "quota": {"credential": credential_label(credential), "scope": "caller", "buckets": buckets},
            "ci": {"known": ci_known, "observedAt": stamp, "queuedRuns": queued, "oldestMin": oldest}}


def observe_capacity(*, refresh=False, **kwargs) -> dict:
    """At most one quota-free refresh on an existing admission invocation, never a poller.

    The client owns credential routing, shared reservations and typed deferral. A failed
    refresh leaves the observation unknown; it never creates a full quota balance.
    """
    snapshot = capacity_snapshot(**kwargs)
    if refresh and snapshot["allowed"] and any(key.startswith("github:") for key in snapshot["unknown"]):
        sys.path.insert(0, str(HERE.parent))
        from apiclient import run_gh
        from apiclient.contract import DEFAULTS
        from apiclient.gh import default_run
        try:
            refreshed = run_gh(["api", "rate_limit"], priority="repair", max_attempts=1, max_wait_ms=0,
                               run=lambda args, env: default_run(args, env, timeout=DEFAULTS["timeoutMs"] / 1000))
            snapshot = capacity_snapshot(**kwargs)
            if refreshed.get("code") != 0:
                snapshot["refresh"] = "unavailable"
        except (OSError, ValueError, TypeError, KeyError, AttributeError, TimeoutError, subprocess.SubprocessError):
            snapshot["refresh"] = "unavailable"
    return snapshot


def capped_producers(prs: list[dict] | None, policy: dict | None = None) -> frozenset[str]:
    """Producers whose open, unheld PRs already fill their WIP cap. Every one of those PRs
    (bound to a Linear issue or not) holds an intake slot, so repairing them frees the cap."""
    if not prs:
        return frozenset()
    policy = load_policy() if policy is None else policy
    return frozenset(producer for producer in {producer_of(pr.get("headRefName")) for pr in prs}
                     if (cap := cap_for(producer, policy)) is not None and len(owned(prs, producer)) >= cap)


def live_producers(prs: list[dict], now: float, policy: dict) -> set[str]:
    """A producer is live when any of its open PRs moved inside liveWindowHours."""
    window = float(policy.get("liveWindowHours", 48)) * 3600
    return {producer_of(pr.get("headRefName")) for pr in prs
            if (moved := last_activity(pr)) is not None and now - moved <= window}


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
        moved = last_activity(pr)
        if moved is None or held(pr) or cap_for(producer, policy) is None or pr.get("isInMergeQueue"):
            continue
        idle_days = (now - moved) / 86400
        if producer not in live and idle_days > float(rule.get("ownerlessIdleDays", 7)):
            out.append((pr, f"no live owner: `{producer}/` has pushed no PR in "
                            f"{policy.get('liveWindowHours', 48)}h and this PR is idle {idle_days:.0f} days"))
        elif idle_days > float(rule.get("anyIdleDays", 21)):
            out.append((pr, f"idle {idle_days:.0f} days (over the {rule.get('anyIdleDays', 21)}-day limit)"))
    return sorted(out, key=lambda row: last_activity(row[0]) or 0)


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
                               "overCap": decision["cap"] is not None and decision["used"] >= decision["cap"]}
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
                  "labels(first:20){nodes{name}} commits(last:1){nodes{commit{committedDate}}}}}}}")


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
        commits = (row.pop("commits", None) or {}).get("nodes") or [{}]
        row["lastCommitAt"] = (commits[0].get("commit") or {}).get("committedDate")
    return rows


def fetch_session_prs(session: str, run_gh=None) -> list[dict] | None:
    """Open PRs whose body carries this session's marker: one search call, None if unreadable."""
    if not session or not all(ch.isalnum() or ch in "-_" for ch in session):
        return None
    if run_gh is None:
        sys.path.insert(0, str(HERE.parent))
        from apiclient import run_gh  # noqa: PLC0415
    query = f'repo:{REPO_SLUG} is:pr is:open in:body "agent-session: {session}"'
    result = run_gh(["api", "-X", "GET", "search/issues", "-f", f"q={query}", "-f", "per_page=50",
                     "--jq", ".items[] | {number, createdAt: .created_at, labels} | tojson"], priority="report")
    if result.get("code") != 0:
        return None
    try:
        return [json.loads(line) for line in (result.get("stdout") or "").splitlines() if line.strip()]
    except ValueError:
        return None


def safe_inventory(read) -> list[dict] | None:
    """`read()` open PRs, or None when unreadable (admission fails open; in-flight fails closed elsewhere)."""
    try:
        return read() or None
    except Exception:  # noqa: BLE001
        return None


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
    gate.add_argument("--priority", choices=("default", "repair"), default="default")
    gate.add_argument("--session", default=os.environ.get("AGENT_SESSION_ID") or os.environ.get("CLAUDE_CODE_SESSION_ID")
                      or os.environ.get("CODEX_SESSION_ID") or "")
    run = sub.add_parser("expire")
    run.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    policy, now = load_policy(), time.time()
    if args.cmd == "admit":
        producer = producer_of(args.branch)
        capacity = observe_capacity(refresh=True, priority=args.priority)
        exempt = cap_for(producer, policy) is None and not per_session(producer, policy)
        prs = None if exempt or capacity.get("allowed") is False else safe_inventory(fetch_open_prs)
        sessions = (fetch_session_prs(args.session) if args.session and per_session(producer, policy)
                    and capacity.get("allowed") is not False else None)
        decision = admit(prs, producer, policy, capacity=capacity, session_prs=sessions)
        print(json.dumps(decision))
        return 0 if decision["allowed"] else 3 if decision["reason"] == "wip-cap" else 75
    prs = fetch_open_prs()
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
