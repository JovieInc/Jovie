"""Which lane a piece of work belongs to: code, or one of the non-code lanes (Tim, 2026-11-22).

Tim: "work that doesnt ship through code can move in paralell to code work and summer doesnt fuck
that up be holding design work that goes straight to figma over mcp or somethign behind code to fix
the golden path".

So the invariant every admission, refill and claim path keeps: non-code work (design that goes
straight to Figma or Pen, research, data jobs, copy, whiteboard redraws) runs in its own lanes with
its own slots. It is never counted against the code Todo target, never displaced or demoted to make
room for code (golden-path P0s included), and never claimed by a code seat. Code priority orders
code work only.

Classification is explicit, never inferred from loose wording: a `lane:<name>` label, the Pen
draft workflow's own `pen-draft` labels, or the exact title prefix of a generated Pen draft. When
both a non-code signal and `lane:code` are present, `lane:code` wins, so a mislabelled item can be
handed back to code in one label.

Speed wins (Tim, 2026-11-22: "speed wins jump can ship independly and speed up subsequent work") are
code, but they hold their own lane too: a `lane:speed`, `speed-win` or `compounding` label admits
them to Todo like Urgent, outside the code target, never displaced or demoted, and code seats claim
them before any other code, golden path included. Within the lane, Summer's portfolio rank orders
them, and that rank already scores time saved across every later run (improvement-portfolio).
"""
from __future__ import annotations

import re

CODE = "code"
SPEED = "speed"
SPEED_LABELS = frozenset({"lane:speed", "speed-win", "compounding"})
NON_CODE_LANES = ("design", "research", "data", "copy", "whiteboard", "reasoning")

# Labels that name non-code work. Keys are lowercase. Generic labels such as `research` or `figma`
# are deliberately absent: code issues carry them too, so they would pull code out of the code lanes.
LABEL_LANES = {f"lane:{lane}": lane for lane in NON_CODE_LANES}
# Summer's reasoning jobs run in the reason lane (reason_lane.py reads Todo only), so a code admission
# must never push one back to Backlog, where nothing re-promotes it.
LABEL_LANES["reasoning-job"] = "reasoning"
# The Pen draft workflow's own labels (`pen-draft`, `pen-draft:needs-tim`, ...) are design work.
LABEL_PREFIX_LANES = (("pen-draft", "design"),)

# Titles that only generated non-code items carry (the Pen draft workflow files these, with no labels).
TITLE_LANES = (
    (re.compile(r"^\s*pen draft for approval:", re.IGNORECASE), "design"),
)

# Each non-code lane holds its own Todo depth; none of it counts toward the code target.
NON_CODE_TODO_TARGET = 6


def _labels(row) -> set[str]:
    raw = row.get("labels") if isinstance(row, dict) else getattr(row, "labels", None)
    return {str(label).strip().lower() for label in raw or ()}


def _title(row) -> str:
    raw = row.get("title") if isinstance(row, dict) else getattr(row, "title", None)
    return str(raw or "")


def lane_of(row) -> str:
    """`code`, or the non-code lane this row (a mirror dict or an Issue) belongs to."""
    labels = _labels(row)
    if "lane:code" in labels:
        return CODE
    if labels & SPEED_LABELS:
        return SPEED
    for label in sorted(labels):
        if label in LABEL_LANES:
            return LABEL_LANES[label]
        for prefix, lane in LABEL_PREFIX_LANES:
            if label == prefix or label.startswith(prefix + ":"):
                return lane
    title = _title(row)
    for pattern, lane in TITLE_LANES:
        if pattern.search(title):
            return lane
    return CODE


def is_non_code(row) -> bool:
    return lane_of(row) not in (CODE, SPEED)


def is_speed(row) -> bool:
    return lane_of(row) == SPEED


def own_lane(row) -> bool:
    """Holds its own lane: never counted against, displaced for, or demoted for ordinary code."""
    return lane_of(row) != CODE


def code_only(rows):
    """Ordinary code: what the code Todo target counts. Speed and non-code lanes hold their own depth."""
    return [row for row in rows if not own_lane(row)]


def by_lane(rows) -> dict[str, list]:
    """Rows of every own lane (speed and the non-code lanes), keyed by lane."""
    out: dict[str, list] = {lane: [] for lane in (SPEED, *NON_CODE_LANES)}
    for row in rows:
        lane = lane_of(row)
        if lane != CODE:
            out[lane].append(row)
    return out


# ------------------------------------------------------------------ per-lane measure

LANES = (CODE, SPEED, *NON_CODE_LANES)
QUEUED_STATES = frozenset({"todo"})
STARTED_TYPES = frozenset({"started"})
BLOCK_LABELS = frozenset({"hold", "blocked", "needs-tim", "tim-action-required"})
STUCK_AFTER_S = 24 * 3600
METRICS_FILE = "lane-metrics.json"


def _epoch(stamp):
    try:
        from datetime import datetime
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def _hours(seconds: float) -> float:
    return round(seconds / 3600, 1)


def _blocked(row) -> bool:
    return bool(_labels(row) & BLOCK_LABELS)


def measure(rows, now: float, previous: dict | None = None) -> tuple[dict, dict]:
    """Per lane: queued, started, blocked, queue age (untouched hours, oldest and p50), exits since the
    previous measure (throughput) and `stuck` when work waits, none is started and none left for a day.

    `rows` are open mirror rows (closed issues leave the mirror, so an id that drops out of the open
    set, or a queued id now started, is an exit). Returns (metrics, snapshot to pass next time)."""
    previous = previous or {}
    prev_lanes = previous.get("lanes") or {}
    metrics, snapshot = {}, {"at": now, "lanes": {}}
    grouped: dict[str, list] = {lane: [] for lane in LANES}
    for row in rows:
        grouped[lane_of(row)].append(row)
    open_ids = {row.get("identifier") for row in rows}
    for lane, members in grouped.items():
        queued = [r for r in members if str(r.get("state") or "").lower() in QUEUED_STATES]
        started = [r for r in members if r.get("stateType") in STARTED_TYPES]
        blocked = [r for r in queued + started if _blocked(r)]
        ages = sorted(now - e for e in (_epoch(r.get("updatedAt")) for r in queued) if e is not None)
        before = prev_lanes.get(lane) or {}
        queued_ids = {r.get("identifier") for r in queued}
        started_ids = {r.get("identifier") for r in started}
        exits = len([i for i in before.get("queued", []) if i not in queued_ids])
        done = len([i for i in before.get("started", []) if i not in open_ids])
        last_exit = now if (exits or done) else float(before.get("lastExitAt") or previous.get("at") or now)
        stuck = bool(queued) and not started and now - last_exit >= STUCK_AFTER_S
        metrics[lane] = {"queued": len(queued), "started": len(started), "blocked": len(blocked),
                         "oldestQueuedH": _hours(ages[-1]) if ages else 0.0,
                         "p50QueuedH": _hours(ages[len(ages) // 2]) if ages else 0.0,
                         "leftQueueSinceLast": exits, "finishedSinceLast": done,
                         "hoursSinceLastExit": _hours(now - last_exit), "stuck": stuck}
        snapshot.setdefault("metrics", metrics)
        snapshot["lanes"][lane] = {"queued": sorted(queued_ids)[:500], "started": sorted(started_ids)[:500],
                                   "lastExitAt": last_exit}
    return metrics, snapshot


def view(state) -> dict:
    """The newest per-lane measure for each team, as the doctor publishes it: {team: {at, lanes}}."""
    from pathlib import Path
    import json
    out = {}
    for path in sorted((Path(state) / "lanes").glob(f"*-{METRICS_FILE}")):
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        out[path.name[: -len(METRICS_FILE) - 1]] = {"at": data.get("at"), "lanes": data.get("metrics") or {}}
    return out


def alerts(view_: dict) -> dict[str, str]:
    """`lane-stuck:<team>:<lane>` for each lane with waiting work, nothing started and no exit for a day."""
    found = {}
    for team, data in (view_ or {}).items():
        for lane, m in (data.get("lanes") or {}).items():
            if isinstance(m, dict) and m.get("stuck"):
                found[f"lane-stuck:{team}:{lane}"] = (f"{lane} lane: {m.get('queued')} waiting, none started, no exit for "
                                                      f"{m.get('hoursSinceLastExit')}h (oldest {m.get('oldestQueuedH')}h)")
    return found
