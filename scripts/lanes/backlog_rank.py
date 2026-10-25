"""One Backlog score, built from the signals the dispatcher already ranks by.

Tim 2026-10-25: ranking and re-ranking handled properly across Jovie and LogYourBody.
This is NOT a second ranker: `lane_runner.admission_order` orders Todo by Linear priority,
one level of aging per day and `workstreams.rank`; this module orders Backlog by the same
three inputs (priority, `workstreams` rank/compounding, age) plus the value, confidence and
effort evidence the mirror carries, so an issue ranked first here is also first when it
reaches Todo. Pure and deterministic: same row and clock, same score.

    score = value * confidence / effort + age_bonus        (higher runs first)

`explain` returns the score and a one-line "why ranked here" that the refill writes into the
promotion comment, so every promotion is auditable from Linear.
"""
from __future__ import annotations

import re
from datetime import datetime

import workstreams

# Linear priority -> value points. Unset (0) sits between Medium and Low: unknown, not unimportant.
PRIORITY_VALUE = {1: 8.0, 2: 5.0, 3: 3.0, 0: 2.0, 4: 1.0}
# Label evidence of customer/production/founder value. Largest matching boost per group counts.
LABEL_VALUE = (
    {"p0": 6.0, "severity:p0": 6.0, "p1": 3.0, "severity:p1": 3.0, "p2": 1.0},      # stated severity
    {"incident": 3.0, "prod-errors": 3.0, "postmortem-action": 2.0, "missed-work": 2.0,
     "quality-gap": 1.0, "capability-gap": 1.0},                                      # outcome gaps, Sentry user impact
    {"dispatch-next": 4.0, "tim-approved": 1.5, "plan-approved": 1.5, "admission-approved": 1.0},  # Tim's stated priorities
)
WORKSTREAM_WEIGHT = 3.0      # top workstream +3, bottom +0
COMPOUNDING_BONUS = 2.0      # CI / throughput fixes multiply every later landing
AGE_POINTS_PER_WEEK = 1.0    # anti-starvation; capped so age never outranks a real severity gap
AGE_CAP = 6.0
CHECKBOX = re.compile(r"(?m)^\s*[-*]\s*\[[ xX]\]")
ACCEPTANCE_WORD = re.compile(r"(?i)acceptance|definition of done|required outcome|\bdone bar\b")


def _epoch(stamp) -> float | None:
    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def stream(row: dict) -> str:
    return workstreams.classify(row.get("title") or "", row.get("labels") or ())


def is_factory(row: dict) -> bool:
    """Throughput/CI work the fleet itself depends on (the factory-share floor counts these)."""
    labels = {str(label).lower() for label in row.get("labels") or ()}
    return "factory" in labels or workstreams.compounding(stream(row))


def value(row: dict) -> tuple[float, list[str]]:
    priority = row.get("priority") if type(row.get("priority")) is int and 0 <= row["priority"] <= 4 else 0
    labels = {str(label).lower() for label in row.get("labels") or ()}
    points, notes = PRIORITY_VALUE[priority], [f"priority {priority or 'unset'}"]
    for group in LABEL_VALUE:
        hits = {name: boost for name, boost in group.items() if name in labels}
        if hits:
            name = max(hits, key=hits.get)
            points += hits[name]
            notes.append(name)
    key = stream(row)
    rank_points = WORKSTREAM_WEIGHT * (1 - workstreams.rank(key) / max(1, len(workstreams.KEYS) - 1))
    points += rank_points
    notes.append(f"ws:{key}")
    if workstreams.compounding(key):
        points += COMPOUNDING_BONUS
        notes.append("compounding")
    return points, notes


def confidence(row: dict) -> float:
    """0.5..1.0: how well the issue states what done looks like. Readiness itself is a gate elsewhere."""
    description = row.get("description") or ""
    criteria = len(CHECKBOX.findall(description)) or (1 if ACCEPTANCE_WORD.search(description) else 0)
    return round(0.5 + 0.5 * min(1.0, criteria / 3), 2)


def effort(row: dict) -> float:
    """1..5 from size evidence in the row: long specs and features cost more than a scoped fix."""
    labels = {str(label).lower() for label in row.get("labels") or ()}
    points = 1.0 + min(2.5, len(row.get("description") or "") / 3000)
    if labels & {"type:feature", "feat", "feature"}:
        points += 1.0
    if labels & {"parallelizable", "small", "size:xs", "size:s"}:
        points -= 0.5
    return round(max(1.0, points), 2)


def age_bonus(row: dict, now: float) -> float:
    created = _epoch(row.get("createdAt"))
    if created is None:
        return 0.0
    return min(AGE_CAP, max(0.0, now - created) / (7 * 86400) * AGE_POINTS_PER_WEEK)


def score(row: dict, now: float) -> float:
    points, _ = value(row)
    return round(points * confidence(row) / effort(row) + age_bonus(row, now), 3)


def explain(row: dict, now: float) -> str:
    points, notes = value(row)
    return (f"score {score(row, now)} = value {points:.1f} ({', '.join(notes)}) x confidence {confidence(row)} "
            f"/ effort {effort(row)} + age {age_bonus(row, now):.1f}")


def order(rows: list[dict], now: float) -> list[dict]:
    """Highest score first; ties by older, then identifier. Stable and total."""
    # Explicit Urgent is a tier, as in admission_order: age and evidence never outrank it.
    return sorted(rows, key=lambda row: (row.get("priority") != 1, -score(row, now), row.get("createdAt") or "",
                                         row.get("identifier") or ""))


def with_factory_floor(ordered: list[dict], take: int, factory_share: float | None, floor: float) -> list[dict]:
    """The first `take` rows, but when the fleet's measured factory share is under `floor` the best
    factory row goes first. Share unknown (None) leaves the order alone: never guess a deficit."""
    picked = ordered[:max(0, take)]
    if take <= 0 or factory_share is None or factory_share >= floor or any(is_factory(row) for row in picked):
        return picked
    best = next((row for row in ordered if is_factory(row)), None)
    return picked if best is None else [best, *picked[:take - 1]]
