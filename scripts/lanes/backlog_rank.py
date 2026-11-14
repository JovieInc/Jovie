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
from itertools import pairwise

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


def _kept(values: list[float], limit: float) -> set[int]:
    """Positions of one longest strictly increasing run (not necessarily contiguous) of `values`,
    using only values below `limit`. Those rows are already in place and need no write."""
    best: list[list[int]] = []
    for n, value in enumerate(values):
        chain: list[int] = []
        if value < limit:
            for m in range(n):
                if best[m] and values[m] < value and len(best[m]) > len(chain):
                    chain = best[m]
            chain = [*chain, n]
        best.append(chain)
    return set(max(best, key=len, default=[]))


def _fill(values: list[float], kept: set[int], limit: float, step: float) -> list[float] | None:
    """`values` with every position outside `kept` moved between its kept neighbours (or just above
    the first / below `limit` at the ends). None when there is no room left between two neighbours."""
    out = list(values)
    n, count = 0, len(values)
    while n < count:
        if n in kept:
            n += 1
            continue
        end = n
        while end < count and end not in kept:
            end += 1
        run = end - n
        lo = out[n - 1] if n else None
        hi = values[end] if end < count else (limit if limit != float("inf") else None)
        for j in range(run):
            if lo is None and hi is None:
                return None
            if lo is None:
                out[n + j] = hi - step * (run - j)
            elif hi is None:
                out[n + j] = lo + step * (j + 1)
            else:
                if (hi - lo) / (run + 1) < 1e-4:
                    return None
                out[n + j] = lo + (hi - lo) * (j + 1) / (run + 1)
        n = end
    out = [round(value, 6) for value in out]
    if any(b <= a for a, b in pairwise(out)) or (limit != float("inf") and out[-1] >= limit):
        return None
    return out


def plan_sort_orders(ranked: list[dict], current: dict[str, float], others_min: float, step: float = 1.0,
                     others: dict[str, float] | None = None) -> dict[str, float]:
    """New Linear sortOrder values (lower = higher in the list) that put `ranked` in score order
    above `others_min`, writing as few rows as possible: rows already in order keep their value and
    only the rest move between their neighbours. A settled list writes nothing.

    With `others` (the competing rows below the list and their sortOrder), a newcomer that Linear
    listed above the ranked rows is moved below them instead, when that takes fewer writes than
    moving the whole list above it (JOV-12550: one new issue used to rewrite all 40 rows)."""
    ids = [row["id"] for row in ranked]
    if not ids or any(i not in current for i in ids):
        return {}
    values = [current[i] for i in ids]
    filled = _fill(values, _kept(values, others_min), others_min, step)
    if filled is None:  # no room between neighbours: lay the list out again, once
        base = others_min if others_min != float("inf") else min(values)
        filled = [round(base - (len(ids) - n) * step, 6) for n in range(len(ids))]
    plan = {i: v for i, v, old in zip(ids, filled, values) if v != old}
    if others:
        loose = _fill(values, _kept(values, float("inf")), float("inf"), step)
        if loose is not None:
            top = loose[-1]
            intruders = sorted((value, key) for key, value in others.items() if key not in set(ids) and value <= top)
            demote = {i: v for i, v, old in zip(ids, loose, values) if v != old}
            demote.update({key: round(top + step * (n + 1), 6) for n, (_, key) in enumerate(intruders)})
            if len(demote) < len(plan):
                return demote
    return plan


def with_factory_floor(ordered: list[dict], take: int, factory_share: float | None, floor: float) -> list[dict]:
    """The first `take` rows, but when the fleet's measured factory share is under `floor` the best
    factory row goes first. Share unknown (None) leaves the order alone: never guess a deficit."""
    picked = ordered[:max(0, take)]
    if take <= 0 or factory_share is None or factory_share >= floor or any(is_factory(row) for row in picked):
        return picked
    best = next((row for row in ordered if is_factory(row)), None)
    return picked if best is None else [best, *picked[:take - 1]]
