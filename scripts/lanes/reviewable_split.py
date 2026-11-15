"""Measured, exhaustive file layers for the existing fix-red split planner."""
from __future__ import annotations


def measured_changes(numstat: str) -> dict[str, int]:
    """Count every Git numstat row, including tests; reject unknown/binary sizes.

    No exclusions are inferred here: generated rows are conservatively counted.
    """
    changes = {}
    for row in numstat.splitlines():
        parts = row.split("\t")
        if len(parts) != 3 or not all(value.isdecimal() for value in parts[:2]):
            raise ValueError("unknown, binary or malformed Git numstat row")
        added, deleted, path = parts
        if not path or path in changes:
            raise ValueError("empty or duplicate Git numstat path")
        changes[path] = int(added) + int(deleted)
    return changes


def reviewable_split(changes: dict[str, int], layers: list[list[str]], cap: int = 1500) -> list[int]:
    """Validate an exhaustive split, counting tests. Caller measures generated paths as zero.

    This plans file-level layers only; each layer still owes dependency/build/test proof.
    No Git mutation or policy exception is authorized by a passing plan.
    """
    if type(cap) is not int or cap < 1 or not changes or not layers:
        raise ValueError("nonempty measurements/layers and a positive integer cap required")
    if any(type(count) is not int or count < 0 for count in changes.values()):
        raise ValueError("unknown, binary or negative line count")
    seen, totals = set(), []
    for layer in layers:
        if not isinstance(layer, list) or not layer:
            raise ValueError("empty or invalid layer")
        for path in layer:
            if path not in changes or path in seen:
                raise ValueError(f"unknown or duplicate path: {path}")
            seen.add(path)
        total = sum(changes[path] for path in layer)
        if total > cap:
            raise ValueError(f"layer {len(totals) + 1} exceeds cap: {total}/{cap}")
        totals.append(total)
    if seen != set(changes):
        raise ValueError(f"unassigned paths: {sorted(set(changes) - seen)}")
    return totals
