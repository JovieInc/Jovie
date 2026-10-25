"""Backlog -> Todo refill for extra bindings (LYB), run by the dispatch tick.

Tim 2026-10-24: "when Todo is empty, issues should move from Backlog automatically", per
team, event-driven. LYB had 0 Todo and 42 Backlog while the lanes idled: nothing owned the
refill (Summer's backlog governor reads JOV only and delegates every write; the bindings
only read Todo). This closes the gap with the machinery already on the host: the tick has
just refreshed the local mirror, so a deficit is seen within one tick of the Linear event
that caused it, with no extra Linear read. Only issues a human or groomer already marked
`agent-ready` are promoted; everything else stays Backlog and is reported as the reason.

Pure selection (`select`) is separate from the write (`refill`), which goes through the
outbox like every other lane write (readback, retry, never overwrites a remote decision).
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import backlog_rank

READY_LABEL = "agent-ready"
# Labels that mean a human decision, a human-owned task or a container: never auto-promoted.
HOLD_LABELS = frozenset({"needs-tim", "tim-action-required", "human-review-required", "type:epic",
                         "hold", "do-not-merge", "reasoning-job", "codex-blocked", "tim-hold", "gated",
                         "needs-human-decision", "no-auto", "ws:human-decision"})
FACTORY_FLOOR = 0.20     # factory share of issue runs below this puts factory work first
ALARM_AFTER_S = 900      # ready Backlog work with Todo below target for this long is an alarm
GROOM_KEEP = 25
MIN_DESCRIPTION = 200
ACCEPTANCE = re.compile(r"(?i)acceptance|accept\b|\bverif(?:y|ication)\b|required outcome|definition of done|\bdone bar\b")
# "Blocked by LYB-12", "Sequencing: after LYB-138", "depends on LYB-9": an open referenced issue blocks.
BLOCKER = re.compile(r"(?i)(?:blocked by|depends on|waits? (?:on|for)|sequencing[:*\s]*(?:\w+\s+)?after|gate:?\s*blocked by)"
                     r"[^\n]{0,80}?\b([A-Z]{2,5}-\d+)\b")
HOLD_TEXT = re.compile(r"(?i)after (?:the )?1\.\d\.\d (?:submission|submit)|backlog until|tim(?:'s)? (?:call|decision)")
SEATS_FILE = "autoscale.json"


def seats(state: Path) -> int:
    """Seats that can take intake right now, from the autoscaler's measured effective counts."""
    try:
        lanes = json.loads((Path(state) / SEATS_FILE).read_text()).get("lanes") or {}
    except (OSError, ValueError):
        return 1
    total = sum(int(row.get("intakeEffective") or 0) for row in lanes.values() if isinstance(row, dict))
    return max(1, total)


def target(state: Path, floor: int = 0) -> int:
    """Todo depth worth holding: two issues per seat that can claim, or the binding's own floor."""
    return max(2 * seats(state), int(floor or 0))


def skip_reason(row: dict, open_ids: set[str], excluded: frozenset[str], red_line=lambda row: False) -> str | None:
    if row.get("state") != "Backlog":
        return "not-backlog"
    if not row.get("labelsComplete"):
        return "labels-incomplete"
    labels = {label.lower() for label in row.get("labels") or ()}
    if READY_LABEL not in labels:
        return "not-agent-ready"
    blocked = sorted((HOLD_LABELS | excluded) & labels)
    if blocked:
        return f"label:{blocked[0]}"
    description = row.get("description") or ""
    if len(description) < MIN_DESCRIPTION:
        return "thin-description"
    if not ACCEPTANCE.search(description):
        return "no-acceptance-criteria"
    if HOLD_TEXT.search(description):
        return "held-by-text"
    for match in BLOCKER.finditer(description):
        if match.group(1) != row.get("identifier") and match.group(1) in open_ids:
            return f"blocked-by:{match.group(1)}"
    if red_line(row):
        return "sensitive-text"
    return None


def select(rows: list[dict], need: int, excluded=(), red_line=lambda row: False, now: float | None = None,
           factory_share: float | None = None) -> tuple[list[dict], dict]:
    """The next `need` Backlog rows to promote in `backlog_rank` order (value x confidence / effort
    plus age, factory floor first when the fleet is under it), plus a reason for every Backlog
    row left behind."""
    now = time.time() if now is None else now
    excluded = frozenset(label.lower() for label in excluded)
    open_ids = {row["identifier"] for row in rows}
    skipped, ready = {}, []
    for row in rows:
        if row.get("state") != "Backlog":
            continue
        reason = skip_reason(row, open_ids, excluded, red_line)
        if reason:
            skipped[row["identifier"]] = reason
        else:
            ready.append(row)
    return backlog_rank.with_factory_floor(backlog_rank.order(ready, now), need, factory_share, FACTORY_FLOOR), skipped


def missing_info(row: dict) -> list[str]:
    """What stops a Backlog row from being agent-ready, in words a cheap grooming pass can act on.
    Empty when a human label (needs-tim, epic, hold) keeps it out: that is a human decision."""
    labels = {label.lower() for label in row.get("labels") or ()}
    if labels & HOLD_LABELS:
        return []
    description = row.get("description") or ""
    found = []
    if len(description) < MIN_DESCRIPTION:
        found.append("description under %d chars: state the problem and the scope" % MIN_DESCRIPTION)
    if not ACCEPTANCE.search(description):
        found.append("no acceptance criteria: add a checkable Definition of done")
    if READY_LABEL not in labels and not found:
        found.append("groomed but not labelled agent-ready: confirm no human gate, then label")
    return found


def groom_queue(rows: list[dict], now: float, keep: int = GROOM_KEEP) -> list[dict]:
    """Highest-ranked Backlog rows that are not agent-ready yet, with the specific missing info,
    for the cheap-model readiness pass (capacity registry routing)."""
    queue = [row for row in rows if row.get("state") == "Backlog" and missing_info(row)]
    return [{"id": row["identifier"], "score": backlog_rank.score(row, now), "missing": missing_info(row)}
            for row in backlog_rank.order(queue, now)[:keep]]


def view(rows: list[dict], now: float) -> dict:
    """Backlog health for one team from the mirror: agent-ready count and age p50/p95 in days."""
    open_ids = {row["identifier"] for row in rows}
    ages = []
    for row in rows:
        if row.get("state") == "Backlog" and skip_reason(row, open_ids, frozenset()) is None:
            created = backlog_rank._epoch(row.get("createdAt"))
            if created:
                ages.append((now - created) / 86400)
    ages.sort()

    def pick(q):
        return round(ages[min(len(ages) - 1, int(q * len(ages)))], 1) if ages else None
    return {"backlog": sum(1 for row in rows if row.get("state") == "Backlog"), "ready": len(ages),
            "readyAgeDaysP50": pick(0.5), "readyAgeDaysP95": pick(0.95)}


def refill(lane, host, binding, linear, floor: int = 0, now: float | None = None) -> dict:
    """One refill pass for `binding`: top Todo back up to `target`. Returns the receipt."""
    now = time.time() if now is None else now
    state = Path(host.state)
    mirror = lane.linear_sync.read_mirror(state, binding.key)
    rows = list((mirror.get("issues") or {}).values())
    todo = lane.linear_sync.todo(state, binding.key)
    pending = lane.linear_sync._pending_moves(state)  # promotions still in the outbox count as Todo
    depth, goal = len(todo), target(state, floor)  # todo() already counts promotions waiting in the outbox
    path = state / "refill" / f"{binding.key}.json"
    try:
        previous = json.loads(path.read_text())
    except (OSError, ValueError):
        previous = {}
    receipt = {"at": now, "team": binding.key, "todo": depth, "target": goal, "seats": seats(state),
               "mirrorSyncedAt": mirror.get("syncedAt"), "promoted": [], "skipped": {}}
    # Stage timestamps for p50/p95: when the deficit opened and when it closed.
    since = previous.get("deficitSince")
    if depth >= goal:
        if since:
            receipt["lastRefillLatencyS"] = round(now - since, 1)
        receipt["deficitSince"] = None
        receipt.update(view(rows, now))
        _write(path, receipt)
        return receipt
    receipt["deficitSince"] = since or now
    stale = now - float(mirror.get("syncedAt") or 0) > 900
    if stale:  # a mirror that stopped syncing proves nothing about Backlog; never act on it
        receipt["held"] = "mirror-stale"
        _write(path, receipt)
        return receipt
    live = [row for row in rows if pending.get(row["id"]) != "Todo"]
    picked, skipped = select(live, goal - depth, binding.excluded, lambda row: lane.issue_hits_red_line(_issue(lane, row)),
                             now, _factory_share(state))
    outbox = lane.linear_sync.Outboxed(state, linear)
    for row in picked:
        outbox.move(row["id"], "Todo")
        outbox.comment(row["id"], f"Backlog refill: promoted to Todo ({binding.key} Todo was {depth} of {goal}; "
                                  f"agent-ready, acceptance criteria present, no open blocker). Why ranked here: "
                                  f"{backlog_rank.explain(row, now)}.")
        receipt["promoted"].append(row["identifier"])
        _log(state, {"at": now, "team": binding.key, "id": row["identifier"],
                     "backlogAgeS": round(now - (backlog_rank._epoch(row.get("createdAt")) or now)),
                     "score": backlog_rank.score(row, now), "factory": backlog_rank.is_factory(row)})
    receipt["skipped"] = dict(sorted(skipped.items())[:100])
    receipt["short"] = max(0, goal - depth - len(picked))
    receipt["groomQueue"] = groom_queue(live, now)
    receipt.update(view(rows, now))
    # Guard: ready work waited in Backlog while Todo sat under target. Promotion normally closes the
    # deficit within a tick, so a deficit this old means writes are not landing.
    if receipt["deficitSince"] and now - receipt["deficitSince"] > ALARM_AFTER_S and receipt["ready"] > len(picked):
        receipt["alarm"] = "ready-work-in-backlog"
    _write(path, receipt)
    return receipt


def _factory_share(state: Path) -> float | None:
    """Measured factory share of recent issue runs, written by the doctor; None when never measured."""
    try:
        value = json.loads((Path(state) / "factory-share.json").read_text()).get("share")
        return float(value) if value is not None else None
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def _log(state: Path, row: dict) -> None:
    """Append-only promotion log: time-in-backlog p50/p95 of promoted work is computed from it."""
    try:
        with open(Path(state) / "backlog-promotions.jsonl", "a") as handle:
            handle.write(json.dumps(row) + "\n")
    except OSError:
        pass


def _issue(lane, row: dict):
    return lane.Issue(row["id"], row["identifier"], row["title"], row["description"], row["priority"],
                      row["createdAt"], list(row["labels"]))


def _write(path: Path, data: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data))
        temporary.replace(path)
    except OSError:
        pass
