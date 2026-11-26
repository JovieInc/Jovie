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
handed back to code in one label. A `lane:<sub-lane>` label (below) hands it back the same way.

Speed wins (Tim, 2026-11-22: "speed wins jump can ship independly and speed up subsequent work") are
code, but they hold their own lane too: a `lane:speed`, `speed-win` or `compounding` label admits
them to Todo like Urgent, outside the code target, never displaced or demoted, and code seats claim
them before any other code, golden path included. Within the lane, Summer's portfolio rank orders
them, and that rank already scores time saved across every later run (improvement-portfolio).

Code sub-lanes (2026-11-22): JOV Todo held 468 issues against a code target of 6, most of them auto-filed
remediation, so one class of work starved the rest. Ordinary code is split into sub-lanes, each with its own
Todo depth: activation, remediation, small, infra, product (`code_sub_lane`). Each counts only its own Todo,
and displacement, WIP demotion and Urgent admission stay inside one sub-lane, so an Urgent remediation can
only push out another remediation item. A `lane:<sub-lane>` label picks the sub-lane outright; otherwise the
first rule that matches wins (exact labels, label prefixes, then exact title prefixes), and product takes the
rest.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

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

# A Pen draft Tim accepts (he moves it to Todo; scripts/design/pen-draft-publish.mjs APPROVAL_LINE)
# is no longer design work: the approved picture now has to be built in the app. Tim, 2026-11-22: "my
# mac app doesnt seem to be movng very fast no matter how much i push on design work". 13 of 27
# approved design items in two weeks sat with no builder, because an accepted draft kept its design
# title and no code seat ever claimed it. Admission labels an accepted draft as a speed-lane code
# build, so it jumps the code queue; `lane:code` still hands back any one Tim wants left alone.
ACCEPTED_DESIGN_LABELS = ("lane:speed", "agent-ready")
PEN_DRAFT_TITLE = TITLE_LANES[0][0]
AWAITING_DECISION_LABEL = "tim-action-required"
# Any other design review (a design-system taste pick, a launch redraw) marks the build issue it
# files with this label once Tim picks; admission then turns it into a speed build the same way.
DESIGN_APPROVED_LABEL = "design-approved"


def _explicit_lane(labels: set[str]) -> bool:
    if "lane:code" in labels or labels & SPEED_LABELS or labels & set(LABEL_LANES):
        return True
    return any(label == prefix or label.startswith(prefix + ":") for label in labels for prefix, _ in LABEL_PREFIX_LANES)


def accepted_pen_drafts(todo_rows):
    """Todo design work Tim has accepted (a Pen draft he moved to Todo, or an issue a design review
    labelled design-approved) that no lane label has yet turned into a build."""
    out = []
    for row in todo_rows:
        labels = _labels(row)
        if AWAITING_DECISION_LABEL in labels:
            continue
        if not (PEN_DRAFT_TITLE.search(_title(row)) or DESIGN_APPROVED_LABEL in labels):
            continue
        if _explicit_lane(labels):  # a lane label is a human or workflow decision; leave it
            continue
        out.append(row)
    return out


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
    if "lane:code" in labels or labels & SUB_LANE_LABELS:
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


# ------------------------------------------------------------------ code sub-lanes

ACTIVATION, REMEDIATION, SMALL, INFRA, PRODUCT = "activation", "remediation", "small", "infra", "product"
SUB_LANES = (ACTIVATION, REMEDIATION, SMALL, INFRA, PRODUCT)
SUB_LANE_LABELS = frozenset(f"lane:{sub}" for sub in SUB_LANES)
# Todo depth each sub-lane holds. Product also takes whatever room the binding's own code target (two per
# seat, or its floor) leaves once the other sub-lanes are counted, so a team with only product work keeps
# its old depth.
SUB_LANE_DEPTH = {ACTIVATION: 3, REMEDIATION: 3, SMALL: 2, INFRA: 2, PRODUCT: 2}
# Activation (the golden path) always keeps a seat: it fills first and nothing outside it displaces it.
SUB_LANE_MIN_SEATS = {ACTIVATION: 1}
SUB_LANE_CEILING_PER_DEPTH = 4  # a sub-lane's Todo above 4 x its depth is over WIP
# (sub-lane, exact labels, label prefixes, title prefixes); first match wins, product is the rest.
SUB_LANE_RULES = (
    (ACTIVATION, frozenset({"lane:activation", "golden-path", "area:auth", "ws:security-auth", "ws:chat-agent"}),
     ("remediation:claim-checkout",), ("P0 QA: waitlist-signup-to-waitlisted", "[board:goal-rev-")),
    # Bare `remediation` is the lanes' own intake label (remediation.REMEDIATION_LABEL), filed with `ws:ci`.
    (REMEDIATION, frozenset({"lane:remediation", "remediation", "ci-nightly", "flaky", "prod-error",
                             "symphony-remediation"}),
     ("remediation:", "sentry:"),
     ("[ci] ", "[sentry] ", "[Sentry ", "[prod-errors] ", "Symphony doctor: ", "[board:", "[model-budget] ",
      "PAGE: ", "Time bomb: ")),
    (SMALL, frozenset({"lane:small", "size:xs", "polish", "gap-sweep"}), ("batch:",), ()),
    (INFRA, frozenset({"lane:infra", "fleet", "symphony", "ws:symphony-throughput", "ws:ovie-ops", "area:ops",
                       "area:infra", "infra", "ws:ci", "agent-improvement", "commissioning", "machine-gap", "codex",
                       "devin", "hyperagent", "factory"}), (), ()),
)


def code_sub_lane(row) -> str:
    """The code sub-lane of an ordinary code row: its `lane:<sub-lane>` label, else the first rule that
    matches, else product."""
    labels = _labels(row)
    for sub in SUB_LANES:
        if f"lane:{sub}" in labels:
            return sub
    title = _title(row).lstrip()
    for sub, exact, prefixes, titles in SUB_LANE_RULES:
        if labels & exact or any(label.startswith(prefixes) for label in labels) or title.startswith(titles):
            return sub
    return PRODUCT


def by_sub_lane(rows) -> dict[str, list]:
    """Ordinary code rows keyed by sub-lane (speed and non-code rows hold their own lanes and are left out)."""
    out: dict[str, list] = {sub: [] for sub in SUB_LANES}
    for row in code_only(rows):
        out[code_sub_lane(row)].append(row)
    return out


def sub_lane_depths(goal: int = 0, todo: dict | None = None) -> dict[str, int]:
    """Todo depth per sub-lane. Product also takes the room the binding's code target `goal` leaves after
    the other sub-lanes' Todo (each counted up to its own depth), so no sub-lane ever borrows another's."""
    depths = dict(SUB_LANE_DEPTH)
    held = sum(min(len((todo or {}).get(sub) or ()), depth) for sub, depth in depths.items() if sub != PRODUCT)
    depths[PRODUCT] = max(depths[PRODUCT], int(goal or 0) - held)
    return depths


def sub_lane_ceiling(depth: int) -> int:
    return SUB_LANE_CEILING_PER_DEPTH * max(1, depth)


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
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def _hours(seconds: float) -> float:
    return round(seconds / 3600, 1)


def _blocked(row) -> bool:
    return bool(_labels(row) & BLOCK_LABELS)


def _measure_group(members: list, before: dict, open_ids: set, now: float, previous_at) -> tuple[dict, dict]:
    """One lane's (or sub-lane's) metrics and the snapshot that the next measure diffs against."""
    queued = [r for r in members if str(r.get("state") or "").lower() in QUEUED_STATES]
    started = [r for r in members if r.get("stateType") in STARTED_TYPES]
    blocked = [r for r in queued + started if _blocked(r)]
    ages = sorted(now - e for e in (_epoch(r.get("updatedAt")) for r in queued) if e is not None)
    queued_ids = {r.get("identifier") for r in queued}
    started_ids = {r.get("identifier") for r in started}
    exits = len([i for i in before.get("queued", []) if i not in queued_ids])
    done = len([i for i in before.get("started", []) if i not in open_ids])
    last_exit = now if (exits or done) else float(before.get("lastExitAt") or previous_at or now)
    stuck = bool(queued) and not started and now - last_exit >= STUCK_AFTER_S
    metric = {"queued": len(queued), "started": len(started), "blocked": len(blocked),
              "oldestQueuedH": _hours(ages[-1]) if ages else 0.0,
              "p50QueuedH": _hours(ages[len(ages) // 2]) if ages else 0.0,
              "leftQueueSinceLast": exits, "finishedSinceLast": done,
              "hoursSinceLastExit": _hours(now - last_exit), "stuck": stuck}
    return metric, {"queued": sorted(queued_ids)[:500], "started": sorted(started_ids)[:500], "lastExitAt": last_exit}


def measure(rows, now: float, previous: dict | None = None) -> tuple[dict, dict]:
    """Per lane: queued, started, blocked, queue age (untouched hours, oldest and p50), exits since the
    previous measure (throughput) and `stuck` when work waits, none is started and none left for a day.
    The same numbers per code sub-lane go in the snapshot's `codeSubLanes` block (the lane keys stay as
    they were for the doctor feed).

    `rows` are open mirror rows (closed issues leave the mirror, so an id that drops out of the open
    set, or a queued id now started, is an exit). Returns (metrics, snapshot to pass next time)."""
    previous = previous or {}
    metrics, subs = {}, {}
    snapshot = {"at": now, "lanes": {}, "subLanes": {}, "metrics": metrics, "codeSubLanes": subs}
    grouped: dict[str, list] = {lane: [] for lane in LANES}
    for row in rows:
        grouped[lane_of(row)].append(row)
    open_ids = {row.get("identifier") for row in rows}
    for lane, members in grouped.items():
        before = (previous.get("lanes") or {}).get(lane) or {}
        metrics[lane], snapshot["lanes"][lane] = _measure_group(members, before, open_ids, now, previous.get("at"))
    for sub, members in by_sub_lane(rows).items():
        before = (previous.get("subLanes") or {}).get(sub) or {}
        subs[sub], snapshot["subLanes"][sub] = _measure_group(members, before, open_ids, now, previous.get("at"))
    return metrics, snapshot


def view(state) -> dict:
    """The newest per-lane measure for each team, as the doctor publishes it: {team: {at, lanes}}."""
    out = {}
    for path in sorted((Path(state) / "lanes").glob(f"*-{METRICS_FILE}")):
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        out[path.name[: -len(METRICS_FILE) - 1]] = {"at": data.get("at"), "lanes": data.get("metrics") or {},
                                                    "codeSubLanes": data.get("codeSubLanes") or {}}
    return out


def alerts(view_: dict) -> dict[str, str]:
    """`lane-stuck:<team>:<lane>` for each lane with waiting work, nothing started and no exit for a day.
    Code sub-lanes are reported in the view, not alerted: each doctor alert files a Linear issue."""
    found = {}
    for team, data in (view_ or {}).items():
        for lane, m in (data.get("lanes") or {}).items():
            if isinstance(m, dict) and m.get("stuck"):
                found[f"lane-stuck:{team}:{lane}"] = (f"{lane} lane: {m.get('queued')} waiting, none started, no exit for "
                                                      f"{m.get('hoursSinceLastExit')}h (oldest {m.get('oldestQueuedH')}h)")
    return found
