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

READY_LABEL = "agent-ready"
# Labels that mean a human decision, a human-owned task or a container: never auto-promoted.
HOLD_LABELS = frozenset({"needs-tim", "tim-action-required", "human-review-required", "type:epic",
                         "hold", "do-not-merge", "reasoning-job", "codex-blocked"})
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


def select(rows: list[dict], need: int, excluded=(), red_line=lambda row: False) -> tuple[list[dict], dict]:
    """The next `need` Backlog rows to promote, highest priority first (Urgent..Low, unset last),
    oldest first within a priority, plus a reason for every Backlog row left behind."""
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
    ready.sort(key=lambda row: ((row.get("priority") or 5), row.get("createdAt") or "", row["identifier"]))
    return ready[:max(0, need)], skipped


def refill(lane, host, binding, linear, floor: int = 0, now: float | None = None) -> dict:
    """One refill pass for `binding`: top Todo back up to `target`. Returns the receipt."""
    now = time.time() if now is None else now
    state = Path(host.state)
    mirror = lane.linear_sync.read_mirror(state, binding.key)
    rows = list((mirror.get("issues") or {}).values())
    todo = lane.linear_sync.todo(state, binding.key)
    pending = lane.linear_sync._pending_moves(state)  # promotions still in the outbox count as Todo
    depth, goal = len(todo), target(state, floor)  # todo() already counts promotions waiting in the outbox
    path = state / "bindings" / binding.key / "refill.json"
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
        _write(path, receipt)
        return receipt
    receipt["deficitSince"] = since or now
    stale = now - float(mirror.get("syncedAt") or 0) > 900
    if stale:  # a mirror that stopped syncing proves nothing about Backlog; never act on it
        receipt["held"] = "mirror-stale"
        _write(path, receipt)
        return receipt
    picked, skipped = select([row for row in rows if pending.get(row["id"]) != "Todo"], goal - depth, binding.excluded,
                             lambda row: lane.issue_hits_red_line(_issue(lane, row)))
    outbox = lane.linear_sync.Outboxed(state, linear)
    for row in picked:
        outbox.move(row["id"], "Todo")
        outbox.comment(row["id"], f"Backlog refill: promoted to Todo (agent-ready, acceptance criteria present, "
                                  f"no open blocker; {binding.key} Todo was {depth} of {goal}).")
        receipt["promoted"].append(row["identifier"])
    receipt["skipped"] = dict(sorted(skipped.items())[:100])
    receipt["short"] = max(0, goal - depth - len(picked))
    _write(path, receipt)
    return receipt


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
