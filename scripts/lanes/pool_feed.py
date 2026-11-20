#!/usr/bin/env python3
"""Keep every allowed pool fed while admissible backlog waits, and say why a seat stayed idle.

The router (remediation.route_issue) sends each issue to its cheapest available route. Availability
was "the lane has at least one free slot", decided per issue, so one free seat on the cheapest lane
took the routing of the whole backlog: every other lane's worker saw `routed:<that lane>` for all
of it and left as `none-eligible` with hundreds of issues waiting (Gem doctor, 2026-11-07..11-10:
"hyperagent has 251 compatible issue(s), but 0/4 workers", "5/6 worker idle exits in the last hour
were 'none-eligible' while work is waiting").

`plan` walks the admissible backlog in claim order and gives each issue a seat, not a lane:

    for each issue, in the router's own candidate order (chosen first, then the other available
    routes; that order already carries cost, quota pressure and the use-or-lose pace discount)
      - a pool with a free new-issue seat left takes it; the seat is then spent for this pass
      - a pool whose free seats are spent hands the issue to the next pool
      - a pool whose claim scan came up empty (none-eligible) after it was offered this issue has
        declined it, and stays declined
        while the issue waits (even after the offer moved on); next pool
    an issue no pool can seat waits for its chosen pool, as before

Nothing here admits work. The backlog passed in already cleared label, failure, in-flight,
hotspot and held-back admission; the candidates are the router's (capability floor, pins, the
sensitive-surface restriction, banked/cooling/unhealthy/blocked/window-cap lanes already removed).
The PR budget, WIP cap, file-overlap gate and the claim ledger run after the pick, unchanged.
Seats are the autoscaler's intake seats; this module raises no limit and adds no worker.

Every pass writes one record: per pool, the free seats, how many were fed, and the reason each
remaining seat is idle. `python3 pool_feed.py status` prints the latest record per lane.

Kill switch: LANES_POOL_FEED=0 (old routing). LANES_POOL_FEED=observe records what the feed would
do and claims as before. Default: apply.
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import model_pools

SCHEMA = "symphony-lanes-pool-feed/v1"
STATE_FILE, LOG_FILE = "pool-feed.json", "runs/pool-feed.jsonl"
LOG_MAX_BYTES, LOG_KEEP_BYTES = 2_000_000, 1_000_000
OFFERS_MAX = 512
DECLINED_MAX = 8  # lanes remembered as having passed on one issue (more than the fleet has)
_OFF, _OBSERVE = frozenset({"0", "off", "false"}), frozenset({"observe", "shadow"})

# Idle-seat reasons, one per pool per pass.
FED = "fed"                                   # no seat left idle
NO_SEAT = "no-free-seat"                      # every seat is busy (or the lane has no intake seat)
NO_BACKLOG = "no-admissible-backlog"          # nothing cleared admission this pass
COVERED = "backlog-covered-by-earlier-pools"  # every issue this pool could run found a seat before it
NOT_QUALIFIED = "no-backlog-for-this-pool"    # no issue lists this pool (capability floor, pin, restriction)
DECLINED = "pool-declined-its-offers"         # the pool idled after being offered the work
UNAVAILABLE = "unavailable:"                  # + the router's reason (banked, cooling, blocked:wip-cap ...)


def mode(env=None) -> str:
    raw = str((os.environ if env is None else env).get("LANES_POOL_FEED", "apply")).strip().lower()
    return "off" if raw in _OFF else "observe" if raw in _OBSERVE else "apply"


def _iso(when: float) -> str:
    return datetime.fromtimestamp(when, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _epoch(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc).timestamp()
    except (TypeError, ValueError):
        return None


def _ranked(decision: dict) -> list[dict]:
    """The chosen route, then the other available routes in the router's order; one row per lane."""
    chosen = decision.get("chosen") or {}
    rows, seen = [chosen], {chosen.get("lane")}
    for row in decision.get("candidates") or ():
        if isinstance(row, dict) and row.get("available") and row.get("lane") not in seen:
            rows.append(row)
            seen.add(row["lane"])
    return rows


def plan(issues, decide, *, lane: str, free: dict, declined=frozenset(), order=None, providers=None) -> dict:
    """Pure seat assignment for one worker pass.

    issues: admissible issues in claim order (objects with `.identifier`).
    decide(issue): the routing decision ({chosen, candidates, required}).
    lane: the lane of the worker asking; it holds one seat of its own, which is not in `free`.
    free: {lane: free new-issue seats right now}, this worker's seat excluded.
    declined: {(identifier, lane)} offers that lane already passed on.
    order(rows): optional re-ordering of an issue's candidate rows (an expiry-order selector plugs in
    here); the default keeps the router's order.
    providers: the provider table; a moved decision takes alias and costClass from the route config of
    (its new lane, model), since the router's candidate rows do not carry them.

    Returns {take, decision, pools, held, waiting, offers, backlog}. `take` is the first issue seated
    on this worker's own seat, `decision` its routing decision with `chosen` moved to this lane and a
    `feed` note when another pool was skipped.
    """
    left = {name: max(0, int(count)) for name, count in free.items()}
    seats = {name: count for name, count in left.items()}
    seats[lane] = seats.get(lane, 0) + 1
    fed, unavailable, qualified, passed = Counter(), {}, Counter(), Counter()
    held, offers, waiting = Counter(), {}, 0
    take = take_decision = None
    own_seat_open = True
    for issue in issues:
        decision = decide(issue)
        if not decision.get("chosen"):
            held["route-held:" + str(decision.get("required"))] += 1
            continue
        for row in decision.get("candidates") or ():
            if isinstance(row, dict) and not row.get("available"):
                unavailable.setdefault(row.get("lane"), Counter())[str(row.get("why") or "unavailable")] += 1
        rows = _ranked(decision)
        rows = list(order(rows)) if order is not None else rows
        skipped, placed = [], None
        qualified.update(row.get("lane") for row in rows)
        for row in rows:
            name = row.get("lane")
            if name == lane and own_seat_open:
                placed, own_seat_open = name, False
                take, take_decision = issue, _moved(decision, row, skipped, providers)
                break
            if (issue.identifier, name) in declined:
                passed[name] += 1
                skipped.append({"lane": name, "why": "declined"})
                continue
            if left.get(name, 0) > 0:
                left[name] -= 1
                placed = name
                if name != lane:
                    offers[issue.identifier] = name
                break
            skipped.append({"lane": name, "why": "no-free-seat"})
        if placed is None:
            waiting += 1
        else:
            fed[placed] += 1
        if not own_seat_open and not any(left.values()):
            break
    pools = {}
    for name in sorted(seats):
        idle = seats[name] - fed[name]
        why = unavailable.get(name)
        reason = ((UNAVAILABLE + why.most_common(1)[0][0] if why else NO_SEAT) if not seats[name] else
                  FED if idle <= 0 else
                  NO_BACKLOG if not issues else
                  DECLINED if passed[name] and passed[name] >= qualified[name] else
                  COVERED if qualified[name] else
                  UNAVAILABLE + why.most_common(1)[0][0] if why else
                  NOT_QUALIFIED)
        pools[name] = {"freeSeats": seats[name], "fed": fed[name], "idle": max(0, idle), "reason": reason}
    return {"take": take, "decision": take_decision, "pools": pools, "held": dict(held), "waiting": waiting,
            "offers": offers, "backlog": len(issues)}


def _route(providers, lane, model) -> dict:
    """The provider route config for (lane, model), as model_pools.balanced reads it; {} when absent."""
    return next((item for item in ((providers or {}).get(lane) or {}).get("routes") or ()
                 if isinstance(item, dict) and item.get("model") == model), {})


def _moved_pool(pool: dict, moved: dict, providers) -> dict:
    """The pool record (model_pools.balanced) for the lane the decision moved to, built with the same
    model_pools.choose, keeping its own expiry reading when the balancer considered it."""
    lane, model = moved.get("lane"), moved.get("model")
    seen = next((row for row in pool.get("considered") or () if isinstance(row, dict)
                 and row.get("lane") == lane and row.get("model") == model), None)
    expiry = ({key: value for key, value in seen.items() if key not in ("lane", "model", "pool")} if seen
              else {"expiresAt": None, "basis": "not-considered"})
    own = {"lane": lane, "model": model, "pool": model_pools.pool_for_lane((providers or {}).get(lane) or {}),
           "expiry": expiry}
    return {**model_pools.choose([own])[1], "rule": "pool-feed",
            "fedFrom": {"rule": pool.get("rule"), "chosenPool": pool.get("chosenPool")}}


def _moved(decision: dict, row: dict, skipped: list[dict], providers=None) -> dict:
    """The decision as this lane runs it. Unchanged when this lane was the router's choice."""
    chosen = decision["chosen"]
    if row.get("lane") == chosen.get("lane"):
        return decision
    route = _route(providers, row.get("lane"), row.get("model"))
    moved = {**chosen, **{key: row[key] for key in chosen if key in row},
             "alias": route.get("alias", row.get("alias")), "costClass": route.get("costClass", row.get("costClass"))}
    pool = decision.get("pool")
    if isinstance(pool, dict):
        pool = _moved_pool(pool, moved, providers)
    return {**decision, "chosen": moved, **({"pool": pool} if pool is not None else {}),
            "feed": {"from": chosen.get("lane"), "skipped": skipped},
            "rationale": f"{decision.get('rationale', '')}; fed to {moved['lane']}: "
                         + ", ".join(f"{item['lane']} {item['why']}" for item in skipped)}


# ---------------------------------------------------------------- state

def _read(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(path: Path, data: dict) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(data))
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _declined_by(row) -> list[str]:
    names = (row or {}).get("declinedBy") if isinstance(row, dict) else None
    return [name for name in names if isinstance(name, str)] if isinstance(names, list) else []


# Idle-exit reasons (lane_runner.record_idle_exit) from a claim scan that evaluated the backlog,
# offered issues included, and took nothing. Exits before or instead of that scan (linear-rate-limited,
# disk-unobservable, a budget gate, maintenance-only-idle, in-flight-unknown, routing preflight, overlap
# inventory) say nothing about an offer, so they never decline one.
DECLINING_EXITS = frozenset({"none-eligible"})


def idle_exits(rows: dict) -> dict:
    """{lane: last idle exit time} from the worker idle record (lane -> {at, reason}), counting only
    exits whose scan saw the offers (DECLINING_EXITS)."""
    return {lane: row.get("at") for lane, row in (rows or {}).items()
            if isinstance(row, dict) and row.get("reason") in DECLINING_EXITS}


def declined_offers(offers: dict, idle_at: dict) -> frozenset:
    """An offer is declined once its lane recorded an idle exit after the offer was first made: the
    lane's worker reached the claim scan with the issue routed to it and left without it. Lanes that
    declined the issue before it moved to its current lane stay declined (`declinedBy`), so a moved
    offer does not swing back to a lane that already passed on it."""
    out = set()
    for identifier, row in (offers or {}).items():
        out.update((identifier, name) for name in _declined_by(row))
        offered, idled = _epoch((row or {}).get("at")), _epoch(idle_at.get((row or {}).get("lane")))
        if offered is not None and idled is not None and idled > offered:
            out.add((identifier, row["lane"]))
    return frozenset(out)


def merge_offers(previous: dict, new: dict, backlog: set, now: float, declined=frozenset()) -> dict:
    """Keep the first time each standing offer was made; drop offers whose issue left the backlog or
    moved to another pool. An offer that moved because its lane declined it records that lane in
    `declinedBy` (bounded, newest kept) for as long as the issue stays in the backlog."""
    kept = {}
    for identifier, name in new.items():
        old = (previous or {}).get(identifier) or {}
        by = _declined_by(old)
        if old.get("lane") not in (None, name) and (identifier, old["lane"]) in declined and old["lane"] not in by:
            by.append(old["lane"])
        row = {"lane": name, "at": old["at"] if old.get("lane") == name and old.get("at") else _iso(now)}
        kept[identifier] = {**row, "declinedBy": by[-DECLINED_MAX:]} if by else row
    for identifier, row in (previous or {}).items():
        if identifier in backlog and identifier not in kept and isinstance(row, dict):
            kept[identifier] = row
    return dict(sorted(kept.items(), key=lambda item: str(item[1].get("at")))[-OFFERS_MAX:])


def record(state: Path, lane: str, result: dict, feed_mode: str, backlog: set, now: float,
           declined=frozenset()) -> dict:
    """One record per pass in pool-feed.json (latest per lane, standing offers) and the bounded log."""
    row = {"schema": SCHEMA, "at": _iso(now), "lane": lane, "mode": feed_mode, "backlog": result["backlog"],
           "took": getattr(result["take"], "identifier", None),
           "tookFrom": ((result.get("decision") or {}).get("feed") or {}).get("from"),
           "pools": result["pools"], "held": result["held"], "waiting": result["waiting"],
           **({"wouldTake": result["wouldTake"]} if "wouldTake" in result else {})}
    path = Path(state) / STATE_FILE
    data = _read(path)
    passes = data.get("passes") if isinstance(data.get("passes"), dict) else {}
    passes[lane] = row
    _write(path, {"schema": SCHEMA, "passes": passes,
                  "offers": merge_offers(data.get("offers") or {}, result["offers"], backlog, now, declined)})
    log = Path(state) / LOG_FILE
    log.parent.mkdir(parents=True, exist_ok=True)
    if log.exists() and log.stat().st_size > LOG_MAX_BYTES:
        tail = log.read_bytes()[-LOG_KEEP_BYTES:]
        log.write_bytes(tail[tail.find(b"\n") + 1:])
    with open(log, "a") as out:
        out.write(json.dumps(row) + "\n")
    return row


def attach(route, *, state: Path, lane: str, free, idle_at=None, order=None, env=None, now=None, providers=None):
    """Wrap an issue router so `pick_issue` can feed from it. `free(lane)` counts that lane's free
    new-issue seats; `idle_at()` returns {lane: last idle exit time}. Off, or no router: unchanged."""
    feed_mode = mode(env)
    if route is None or feed_mode == "off":
        return route
    raw = {}

    def decide(issue):
        if issue.identifier not in raw:
            raw[issue.identifier] = route(issue)
        return raw[issue.identifier]

    def fed(issue):
        return decide(issue)

    def feed(issues):
        when = time.time() if now is None else now
        lanes = {row.get("lane") for issue in issues for row in (decide(issue).get("candidates") or ())
                 if isinstance(row, dict) and row.get("lane") != lane}
        counts = {name: free(name) for name in sorted(name for name in lanes if name)}
        counts[lane] = free(lane)
        try:
            offers = _read(Path(state) / STATE_FILE).get("offers") or {}
            declined = declined_offers(offers, (idle_at() if idle_at else {}) or {})
        except Exception:
            declined = frozenset()  # Unreadable offers keep the plain seat count.
        result = plan(issues, decide, lane=lane, free=counts, declined=declined, order=order, providers=providers)
        if feed_mode == "observe":
            take = next((issue for issue in issues if (decide(issue).get("chosen") or {}).get("lane") == lane), None)
            result = {**result, "take": take, "decision": decide(take) if take else None,
                      "wouldTake": getattr(result["take"], "identifier", None)}
        try:
            record(state, lane, result, feed_mode, {issue.identifier for issue in issues}, when, declined)
        except OSError as error:
            print(f"pool feed record unavailable: {type(error).__name__}", file=sys.stderr)
        if result["take"] is not None:
            route.decisions[result["take"].identifier] = result["decision"]
        return result["take"]

    fed.decisions = route.decisions
    fed.feed = feed
    return fed


def status(state: Path) -> dict:
    data = _read(Path(state) / STATE_FILE)
    return {"schema": SCHEMA, "mode": mode(), "passes": data.get("passes") or {},
            "standingOffers": len(data.get("offers") or {})}


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] != ["status"]:
        print("usage: pool_feed.py status [state-dir]", file=sys.stderr)
        return 2
    state = Path(argv[1]) if len(argv) > 1 else Path(
        os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")
    print(json.dumps(status(state), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
