#!/usr/bin/env python3
"""Fleet work ledger: one read-only view of who holds what, and how well the fleet is covered.

Reuses what exists, adds no orchestrator:
- lanes run leases        <state>/linear/run-leases/<issue-id>.lock (flock, owner json)
- repo-binding leases     <state>/bindings/<KEY>/issue.<IDENT>.lock (flock)
- the claim ledger        <state>/linear/claims.json
- external agent claims   <state>/fleet-claims/<IDENT>.json  (Lola / Hyperagent threads / Summer:
  `claim` writes owner + heartbeat + ttl, `heartbeat` renews, `release` removes; a claim with no
  heartbeat for its ttl is `expired` and is not honoured by anyone checking the ledger)
- the run ledger          <state>/runs/ledger.jsonl (jovie-lane-run/v1)

`ledger` lists every claim with a liveness verdict (live / stranded / expired). `metrics`
measures duplicate overlapping runs, overnight (00-08 UTC) vs daytime throughput and the share
of runs spent on factory (fleet-improving) work. Stdlib only; never takes a lock it can block on.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import pathlib as _pl, sys as _sys  # noqa: E402
_sys.path[:0] = [p for p in [str(_pl.Path(__file__).resolve().parent)] if p not in _sys.path]  # sibling module of the release
from atomic_state import atomic_write_text  # noqa: E402

STRANDED_S = 3 * 3600            # active claim with no live lease for this long is stranded
EXTERNAL_TTL_S = 30 * 60         # default external claim ttl; renewed by `heartbeat`
OVERLAP_S = 60                   # overlap shorter than this is handoff jitter, not a duplicate
# A run is factory work when its issue classifies into one of these workstreams (workstreams.RANK).
FACTORY_WORKSTREAMS = frozenset({"ci", "symphony-throughput", "release-deploy", "ovie-ops"})
FACTORY_TARGET_SHARE = 0.20      # floor; raise only while measured factory ROI is positive
NON_AGENT_KINDS = frozenset({"outcome-verify", "outcome"})  # timers, not agent hours


def _flock(path: Path) -> str:
    """`live` while some process holds the lock, `ended` if it exists and is free, `none`."""
    if not path.exists():
        return "none"
    try:
        with open(path, "a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
            except BlockingIOError:
                return "live"
            fcntl.flock(handle, fcntl.LOCK_UN)
    except OSError:
        return "live"  # unreadable evidence never frees a claim
    return "ended"


def _json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def external_dir(state: Path) -> Path:
    return state / "fleet-claims"


def external_claim(state: Path, ident: str, agent: str, note: str = "", ttl_s: int = EXTERNAL_TTL_S,
                   now: float | None = None) -> bool:
    """Take `ident` for a non-lane agent. False if another agent holds an unexpired claim."""
    now = time.time() if now is None else now
    path = external_dir(state) / f"{ident}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)  # short critical section: read-modify-write only
        handle.seek(0)
        try:
            held = json.loads(handle.read() or "{}")
        except ValueError:
            held = {}
        if held and held.get("agent") != agent and now - held.get("heartbeatAt", 0) < held.get("ttlS", ttl_s):
            return False
        claimed = held.get("claimedAt") if held.get("agent") == agent else now
        handle.seek(0)
        handle.truncate()
        handle.write(json.dumps({"ident": ident, "agent": agent, "note": note, "ttlS": ttl_s,
                                 "claimedAt": claimed, "heartbeatAt": now}))
    return True


def external_heartbeat(state: Path, ident: str, agent: str, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    path = external_dir(state) / f"{ident}.json"
    held = _json(path, {})
    if held.get("agent") != agent:
        return False
    held["heartbeatAt"] = now
    atomic_write_text(path, json.dumps(held))
    return True


def external_release(state: Path, ident: str, agent: str) -> bool:
    path = external_dir(state) / f"{ident}.json"
    if _json(path, {}).get("agent") != agent:
        return False
    path.unlink(missing_ok=True)
    return True


def external_active(state: Path, ident: str, now: float | None = None) -> dict | None:
    """The unexpired external claim on `ident`, or None. What lanes/agents check before starting."""
    now = time.time() if now is None else now
    held = _json(external_dir(state) / f"{ident}.json", {})
    if held and now - held.get("heartbeatAt", 0) < held.get("ttlS", EXTERNAL_TTL_S):
        return held
    return None


def ledger(state: Path, now: float | None = None) -> list[dict]:
    """Every claim from every source with a liveness verdict."""
    now = time.time() if now is None else now
    rows: list[dict] = []
    claims = (_json(state / "linear" / "claims.json", {}).get("claims") or {})
    for issue_id, claim in claims.items():
        if claim.get("status") != "active":
            continue
        ident = str(claim.get("identifier") or "")
        run = _flock(state / "linear" / "run-leases" / f"{issue_id}.lock")
        binding = "none"
        for path in (state / "bindings").glob(f"*/issue.{ident}.lock"):
            verdict = _flock(path)
            binding = "live" if verdict == "live" else (binding if binding == "live" else verdict)
        live = "live" in (run, binding)
        age = now - (claim.get("claimedAt") or now)
        rows.append({"source": "lanes-claim", "ident": ident, "agent": claim.get("lane"), "ageS": round(age),
                     "verdict": "live" if live else "stranded" if age > STRANDED_S else "starting"})
    for path in sorted(external_dir(state).glob("*.json")):
        held = _json(path, {})
        if not held:
            continue
        fresh = external_active(state, held.get("ident", path.stem), now) is not None
        rows.append({"source": "external-claim", "ident": held.get("ident", path.stem), "agent": held.get("agent"),
                     "ageS": round(now - held.get("claimedAt", now)), "verdict": "live" if fresh else "expired",
                     "note": held.get("note", "")})
    return rows


def codex_consumption(state: Path, since: float) -> dict:
    """Per-agent Codex seat use from runs/delegations.jsonl (codex_delegate.py): runs, failures,
    seat-seconds. Lane runs are in the run ledger; this is the spend by agents that delegate."""
    out: dict[str, dict] = {}
    try:
        lines = (state / "runs" / "delegations.jsonl").read_text().splitlines()
    except OSError:
        return out
    for line in lines:
        try:
            row = json.loads(line)
            if _ts(row["startedAt"]) < since:
                continue
        except (ValueError, KeyError):
            continue
        agent = out.setdefault(row.get("agent", "?"), {"runs": 0, "failed": 0, "seatSeconds": 0.0})
        agent["runs"] += 1
        agent["failed"] += row.get("exit") not in (0, None) and 1 or 0
        agent["seatSeconds"] = round(agent["seatSeconds"] + float(row.get("seconds") or 0), 1)
    return out


def stranded(state: Path, now: float | None = None) -> list[str]:
    return sorted(r["ident"] for r in ledger(state, now) if r["verdict"] == "stranded")


def external_held(state: Path, now: float | None = None) -> frozenset[str]:
    """Identifiers some non-lane agent holds under an unexpired claim: lanes must not take them."""
    now = time.time() if now is None else now
    held = set()
    for path in external_dir(state).glob("*.json"):
        row = _json(path, {})
        if row.get("ident") and external_active(state, row["ident"], now):
            held.add(row["ident"])
    return frozenset(held)


READY_FILE = "fleet-ready.jsonl"
READY_MAX_BYTES = 4 * 1024 * 1024
READY_MAX_GAP_S = 15 * 60        # a gap longer than this means the recorder was down: not counted


def record_ready(state: Path, now: float, capacity: dict, ready_by_provider: dict | None) -> None:
    """One row per doctor pass: eligible work and seats per provider, so idle-while-ready is
    measurable. Best effort; a recorder failure must never fail the doctor."""
    row = {"at": round(now), "p": {name: {"ready": (ready_by_provider or {}).get(name),
                                          "slots": seats.get("slots"), "running": seats.get("running"),
                                          "base": seats.get("base")}
                                   for name, seats in (capacity or {}).items()}}
    path = state / READY_FILE
    try:
        if path.exists() and path.stat().st_size > READY_MAX_BYTES:
            keep = path.read_text().splitlines()[-(READY_MAX_BYTES // 400):]
            atomic_write_text(path, "\n".join(keep) + "\n")
        with open(path, "a") as handle:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")
    except OSError:
        pass


def idle_while_ready(state: Path, since: float) -> dict:
    """Minutes (per provider) with eligible work, an allowed seat free (`idle`) or a seat the
    autoscaler removed (`throttled`: base > slots). Intervals are the time to the next row."""
    rows = []
    try:
        for line in (state / READY_FILE).read_text().splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if row.get("at", 0) >= since:
                rows.append(row)
    except OSError:
        return {"coveredMin": 0, "idleMin": {}, "throttledMin": {}}
    rows.sort(key=lambda r: r["at"])
    idle: Counter = Counter()
    throttled: Counter = Counter()
    covered = 0.0
    for a, b in zip(rows, rows[1:]):
        dt = b["at"] - a["at"]
        if dt <= 0 or dt > READY_MAX_GAP_S:
            continue
        covered += dt
        for name, seat in (a.get("p") or {}).items():
            ready, slots, running = seat.get("ready"), seat.get("slots"), seat.get("running")
            if not ready or slots is None or running is None:
                continue
            if running < min(slots, ready):
                idle[name] += dt
            elif (seat.get("base") or 0) > slots and running < min(seat["base"], ready):
                throttled[name] += dt
    return {"coveredMin": round(covered / 60, 1),
            "idleMin": {k: round(v / 60, 1) for k, v in idle.items()},
            "throttledMin": {k: round(v / 60, 1) for k, v in throttled.items()}}


GATE_LABELS = frozenset({"needs-human-decision", "needs-human", "needs:human", "human-review-required",
                         "quality-gap:needs-tim", "hold", "gated"})
APPROVED_LABELS = frozenset({"tim-approved"})   # an approved gate is no gate
DEADLINE = re.compile(r"^\s*(?:\*\*)?deadline\s*:\s*(?:\*\*)?\s*(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?", re.I | re.M)
DEFAULT = re.compile(r"^\s*(?:\*\*)?default\s*:\s*(?:\*\*)?\s*(\S.*)$", re.I | re.M)
GATE_FILE = "gate-proposals.json"
# Tim's rule (2026-10-25): unanswered taste ships its default after base(risk) x confidence.
BASE_H = {"low": 4, "med": 24, "high": 72}
CONFIDENCE_X = {"high": 0.5, "med": 1.0, "low": 2.0}
HIGH_RISK_LABELS = frozenset({"billing", "no-auto", "auth", "security", "credentials"})


def gate_deadline_h(risk: str, confidence: str) -> float:
    return BASE_H[risk] * CONFIDENCE_X[confidence]


def propose_gate(row: dict, now: float) -> dict:
    """A default, risk, confidence and deadline for a gate nobody bounded. Heuristic and reversible:
    the closed-loop worker's mechanism applies it at the deadline; Tim's answer always wins."""
    labels = {(l if isinstance(l, str) else l.get("name", "")).lower() for l in (row.get("labels") or [])}
    title = row.get("title") or ""
    if "quality-gap:needs-tim" in labels:
        risk, conf = "low", "med"
        default = "accept the finder's proposal (move to Todo); a canceled fingerprint is never re-proposed"
    elif re.search(r"\b(publish|npm|release)\b", title, re.I) and "human-review-required" in labels:
        risk, conf, irreversible = "high", "low", True
        default = "do NOT publish (irreversible external action): keep parked and re-ask; ships only on explicit approval"
        return {"risk": risk, "confidence": conf, "default": default, "irreversible": True,
                "deadline": _iso(now + gate_deadline_h(risk, conf) * 3600), "proposedAt": _iso(now)}
    elif labels & HIGH_RISK_LABELS:
        risk, conf = "high", "low"
        default = "do not change billing/auth behaviour; agents may only build behind a flag that is off"
    else:
        risk, conf = "med", "low"
        default = "proceed with the narrowest reversible option and record the choice in the issue"
    return {"risk": risk, "confidence": conf, "default": default, "irreversible": False,
            "deadline": _iso(now + gate_deadline_h(risk, conf) * 3600), "proposedAt": _iso(now)}


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def gate_comment(ident: str, proposal: dict) -> str:
    return (f"gate-proposal (fleet coordination): nothing should wait on a human forever.\n\n"
            f"Default: {proposal['default']}\nRisk: {proposal['risk']}\nConfidence: {proposal['confidence']}\n"
            f"Deadline: {proposal['deadline']}\n\n"
            f"Deadline = base(risk: low 4h / med 24h / high 72h) x confidence (high 0.5 / med 1 / low 2) from "
            f"{proposal['proposedAt']}. Reply or change the label to override; unanswered, the closed-loop worker "
            f"applies the default at the deadline."
            + ("\n\nThis is an irreversible external action: the default is to keep it parked, never to ship it." if proposal.get("irreversible") else ""))


def gate_census(state: Path, now: float | None = None) -> dict:
    """Human-gated issues never block the queue (lanes skip them); each needs a default and a
    deadline, in its description (`Default:` / `Deadline:`) or in state/gate-proposals.json (written
    by `gates --propose`, which also posts the proposal as a comment). parked = bounded and not
    due; due = deadline passed, the default should now be applied; unbounded = can block forever."""
    now = time.time() if now is None else now
    proposals = _json(state / GATE_FILE, {})
    out: dict[str, list] = {"parked": [], "due": [], "unbounded": []}
    rows = {}
    for team in ("JOV", "LYB"):
        rows.update(_json(state / "linear" / f"mirror-{team}.json", {}).get("issues") or {})
    for issue_id, row in rows.items():
        labels = {(l if isinstance(l, str) else l.get("name", "")).lower() for l in (row.get("labels") or [])}
        if not labels & GATE_LABELS or labels & APPROVED_LABELS or row.get("stateType") in ("completed", "canceled"):
            continue
        ident, text = row.get("identifier"), row.get("description") or ""
        deadline, default = DEADLINE.search(text), DEFAULT.search(text)
        proposal = proposals.get(ident)
        if deadline and default:
            due = _ts(f"{deadline.group(1)}T{deadline.group(2) or '00:00'}:00Z")
        elif proposal:
            due = _ts(proposal["deadline"].replace("Z", ":00Z") if len(proposal["deadline"]) == 17 else proposal["deadline"])
        else:
            out["unbounded"].append(ident)
            continue
        out["due" if due <= now else "parked"].append(ident)
    return {**{k: sorted(v) for k, v in out.items()}, "counts": {k: len(v) for k, v in out.items()}}


def propose_unbounded(state: Path, now: float | None = None, post: bool = True) -> list[dict]:
    """Bound every unbounded gate: store the proposal and queue one Linear comment (outbox)."""
    now = time.time() if now is None else now
    census = gate_census(state, now)
    proposals = _json(state / GATE_FILE, {})
    by_ident = {}
    for team in ("JOV", "LYB"):
        for issue_id, row in (_json(state / "linear" / f"mirror-{team}.json", {}).get("issues") or {}).items():
            by_ident[row.get("identifier")] = (issue_id, row)
    made = []
    for ident in census["unbounded"]:
        issue_id, row = by_ident[ident]
        proposal = propose_gate(row, now)
        proposals[ident] = proposal
        if post:
            import linear_sync
            linear_sync.enqueue(state, "comment", issue_id, body=gate_comment(ident, proposal))
        made.append({"ident": ident, **proposal})
    if made:
        tmp = state / (GATE_FILE + ".tmp")
        tmp.write_text(json.dumps(proposals, indent=1))
        tmp.replace(state / GATE_FILE)
    return made


def burn_plan(windows: list[dict], now: float | None = None) -> list[dict]:
    """Use-it-or-lose-it pacing for capped agents (Muse, Grokbot...). Each window:
    {agent, resetAt (epoch), windowS, quota, used} from the capacity registry. `behind` means less of
    the quota is spent than of the window elapsed: route extra work there now. `needPerHour` is the
    units/hour that finish the quota exactly at reset."""
    now = time.time() if now is None else now
    plan = []
    for w in windows:
        left_s = w["resetAt"] - now
        if left_s <= 0 or w["quota"] <= 0:
            continue
        elapsed = min(1.0, max(0.0, 1 - left_s / w["windowS"]))
        spent = w["used"] / w["quota"]
        plan.append({"agent": w["agent"], "spentPct": round(100 * spent), "elapsedPct": round(100 * elapsed),
                     "needPerHour": round((w["quota"] - w["used"]) / (left_s / 3600), 2),
                     "behind": spent < elapsed - 0.05, "resetInH": round(left_s / 3600, 1)})
    return sorted(plan, key=lambda r: r["spentPct"] - r["elapsedPct"])


def _ts(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def read_runs(state: Path, since: float) -> list[dict]:
    runs = []
    try:
        lines = (state / "runs" / "ledger.jsonl").read_text().splitlines()
    except OSError:
        return runs
    for line in lines:
        if '"jovie-lane-run/v1"' not in line:
            continue
        try:
            row = json.loads(line)
            start, end = _ts(row["startedAt"]), _ts(row["endedAt"])
        except (ValueError, KeyError, TypeError):
            continue
        if start >= since and end >= start:
            runs.append({**row, "_s": start, "_e": end})
    return runs


def duplicate_overlaps(runs: list[dict]) -> list[dict]:
    """Different runs working the same PR/issue at the same time (a duplicate claim)."""
    by_key: dict[str, list[dict]] = {}
    for run in runs:
        key = f"pr:{run['pr']}" if run.get("pr") else (f"issue:{run['issue']}" if run.get("issue") else None)
        if key and run.get("kind") not in NON_AGENT_KINDS:
            by_key.setdefault(key, []).append(run)
    found = []
    for key, items in by_key.items():
        items.sort(key=lambda r: r["_s"])
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                if b["_s"] >= a["_e"] - OVERLAP_S:
                    break
                if a["runId"] != b["runId"]:
                    found.append({"key": key, "a": a["runId"], "b": b["runId"], "providers": [a["provider"], b["provider"]],
                                  "overlapS": round(min(a["_e"], b["_e"]) - b["_s"])})
    return found


def _median(values: list[float]) -> float:
    values = sorted(values)
    return values[len(values) // 2] if values else 0.0


def throughput(runs: list[dict], days: float) -> dict:
    """Runs and productive runs per clock hour, overnight (00-08 UTC) vs day. Productive = the run
    pushed or opened something (fix-pushed, pr-opened, landing)."""
    productive = {"fix-pushed", "pr-opened", "landing", "success"}
    out = {}
    for name, hours in (("overnight_00_08", range(0, 8)), ("day_08_24", range(8, 24))):
        mine = [r for r in runs if r.get("kind") not in NON_AGENT_KINDS
                and datetime.fromtimestamp(r["_s"], timezone.utc).hour in hours]
        agent_h = sum(min(r["_e"] - r["_s"], 4 * 3600) for r in mine) / 3600  # a run is capped at 4 h
        clock_h = days * len(hours)
        out[name] = {"runs": len(mine), "runsPerHour": round(len(mine) / clock_h, 2),
                     "productivePerHour": round(sum(r.get("verdict") in productive for r in mine) / clock_h, 3),
                     "agentHoursPerHour": round(agent_h / clock_h, 2),
                     "medianRunMin": round(_median([r["_e"] - r["_s"] for r in mine]) / 60, 1)}
    return out


def factory_share(runs: list[dict], classify) -> dict:
    """Share of agent runs on factory work. `classify(run)` returns a workstream key or None."""
    counts = Counter()
    for run in runs:
        if run.get("kind") in NON_AGENT_KINDS:
            continue
        key = classify(run)
        counts["repair" if key == "repair" else "factory" if key in FACTORY_WORKSTREAMS
               else "product" if key else "unclassified"] += 1
    classified = counts["factory"] + counts["product"]
    share = counts["factory"] / classified if classified else 0.0
    return {**counts, "share": round(share, 3), "target": FACTORY_TARGET_SHARE,
            "belowTarget": share < FACTORY_TARGET_SHARE}


def mirror_classifier(state: Path, workstreams):
    titles = {}
    for team in ("JOV", "LYB"):
        for row in (_json(state / "linear" / f"mirror-{team}.json", {}).get("issues") or {}).values():
            titles[row.get("identifier")] = (row.get("title") or "", [l if isinstance(l, str) else l.get("name", "")
                                             for l in (row.get("labels") or [])])

    def classify(run: dict):
        ident = run.get("issue") if isinstance(run.get("issue"), str) else None
        if ident in titles:
            return workstreams.classify(*titles[ident])
        # Fix-red / adopt runs repair someone's open PR: neither new product nor factory work.
        return "repair" if run.get("kind") in ("fix-red", "adopt") else None
    return classify


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--state", default=os.environ.get("LANES_STATE") or str(Path.home() / ".local/state/jovie-lanes"))
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ledger")
    gates = sub.add_parser("gates")
    gates.add_argument("--propose", action="store_true", help="bound every unbounded gate (writes + queues comments)")
    sub.add_parser("burn")
    metrics = sub.add_parser("metrics")
    metrics.add_argument("--days", type=float, default=7)
    for name in ("claim", "heartbeat", "release"):
        cmd = sub.add_parser(name)
        cmd.add_argument("ident")
        cmd.add_argument("--agent", required=True)
        if name == "claim":
            cmd.add_argument("--note", default="")
            cmd.add_argument("--ttl", type=int, default=EXTERNAL_TTL_S)
    args = parser.parse_args(argv)
    state = Path(args.state)
    if args.cmd == "ledger":
        rows = ledger(state)
        print(json.dumps({"claims": rows, "verdicts": dict(Counter(r["verdict"] for r in rows))}, indent=1))
    elif args.cmd == "gates":
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        print(json.dumps(propose_unbounded(state) if args.propose else gate_census(state), indent=1))
    elif args.cmd == "burn":
        print(json.dumps(burn_plan(_json(state / "quota-windows.json", {}).get("windows") or []), indent=1))
    elif args.cmd == "metrics":
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import workstreams
        runs = read_runs(state, time.time() - args.days * 86400)
        dup = duplicate_overlaps(runs)
        print(json.dumps({"days": args.days, "runs": len(runs), "throughput": throughput(runs, args.days),
                          "duplicateOverlaps": {"count": len(dup), "sample": dup[:5]},
                          "gates": gate_census(state)["counts"],
                          "idleWhileReady": idle_while_ready(state, time.time() - args.days * 86400),
                          "factory": factory_share(runs, mirror_classifier(state, workstreams))}, indent=1))
    else:
        ok = (external_claim(state, args.ident, args.agent, args.note, args.ttl) if args.cmd == "claim"
              else external_heartbeat(state, args.ident, args.agent) if args.cmd == "heartbeat"
              else external_release(state, args.ident, args.agent))
        print(json.dumps({"ok": ok}))
        return 0 if ok else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
