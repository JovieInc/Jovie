"""Measured, exhaustive file layers for the existing fix-red split planner."""
from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from pathlib import Path


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


def _group_total(group: list[str], changes: dict[str, int], seen: set[str]) -> int:
    if not isinstance(group, list) or not group:
        raise ValueError("empty or invalid group")
    total = 0
    for path in group:
        if path not in changes or path in seen:
            raise ValueError(f"unknown or duplicate path: {path}")
        count = changes[path]
        if type(count) is not int or count < 0:
            raise ValueError("unknown, binary or negative line count")
        seen.add(path)
        total += count
    return total


def _layer_cost(paths: list[str], cost: Callable[[list[str]], int] | None) -> int:
    extra = 0 if cost is None else cost(paths)
    if type(extra) is not int or extra < 0:
        raise ValueError("layer cost must be a non-negative integer")
    return extra


def pack_groups(
    groups: list[list[str]],
    changes: dict[str, int],
    cap: int = 1500,
    *,
    pin: list[str] | None = None,
    cost: Callable[[list[str]], int] | None = None,
) -> list[list[str]]:
    """First-fit decreasing pack of inseparable path groups, tests included.

    `pin` names paths that stay together on layer 1 (the parent PR). `cost`
    adds measured overhead for a candidate layer, such as one registry shard,
    and that overhead is not itself a path in `changes`. A passing pack still
    needs `reviewable_split` once overhead paths are real files.

    No Git mutation or policy exception is authorized by a passing pack.
    """
    if type(cap) is not int or cap < 1 or not changes or not groups:
        raise ValueError("nonempty measurements/groups and a positive integer cap required")
    seen: set[str] = set()
    sized: list[tuple[int, tuple[str, ...]]] = []
    for group in groups:
        total = _group_total(group, changes, seen)
        sized.append((total, tuple(group)))
    if seen != set(changes):
        raise ValueError(f"unassigned paths: {sorted(set(changes) - seen)}")
    pin_set = set(pin or [])
    if any(path not in seen for path in pin_set):
        raise ValueError("pin path is not in a group")
    pinned, rest = [], []
    for total, paths in sized:
        if pin_set.intersection(paths):
            if not pin_set.issuperset(paths):
                raise ValueError("pin splits a group")
            pinned.append((total, paths))
        else:
            rest.append((total, paths))
    if pin_set != {path for _, paths in pinned for path in paths}:
        raise ValueError("pin path is not in a group")
    rest.sort(key=lambda item: (-item[0], item[1]))
    layers: list[list[str]] = []

    def place(paths: tuple[str, ...] | list[str], *, fresh: bool) -> None:
        incoming = list(paths)
        if fresh or not layers:
            candidate = incoming
            if sum(changes[path] for path in candidate) + _layer_cost(candidate, cost) > cap:
                raise ValueError(
                    f"group exceeds cap: {sum(changes[path] for path in candidate) + _layer_cost(candidate, cost)}/{cap}"
                )
            layers.append(candidate)
            return
        for layer in layers:
            candidate = layer + incoming
            if sum(changes[path] for path in candidate) + _layer_cost(candidate, cost) <= cap:
                layer.extend(incoming)
                return
        place(incoming, fresh=True)

    if pinned:
        first: list[str] = []
        for _, paths in pinned:
            first.extend(paths)
        place(first, fresh=True)
    for _, paths in rest:
        alone = list(paths)
        if sum(changes[path] for path in alone) + _layer_cost(alone, cost) > cap:
            raise ValueError(
                f"group exceeds cap: {sum(changes[path] for path in alone) + _layer_cost(alone, cost)}/{cap}"
            )
        place(alone, fresh=False)
    return layers


def main(argv: list[str] | None = None) -> int:
    """Pack a measured numstat into cap-sized layers. Groups JSON is a list of path lists."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["pack"])
    parser.add_argument("--numstat", type=Path, required=True)
    parser.add_argument("--groups", type=Path, required=True)
    parser.add_argument("--pin", action="append", default=[])
    parser.add_argument("--cap", type=int, default=1500)
    args = parser.parse_args(argv)
    try:
        changes = measured_changes(args.numstat.read_text())
        groups = json.loads(args.groups.read_text())
        if not isinstance(groups, list):
            raise ValueError("groups JSON must be a list of path lists")
        layers = pack_groups(groups, changes, args.cap, pin=args.pin or None)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print(json.dumps({
        "layers": layers,
        "reviewableLines": [sum(changes[path] for path in layer) for layer in layers],
        "cap": args.cap,
        "testsIncluded": True,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
