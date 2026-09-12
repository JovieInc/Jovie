#!/usr/bin/env python3
"""Fail-closed liveness proof for a repeating systemd user timer."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import subprocess
import time


SYSTEMD_INFINITY = {"", "infinity", "n/a", "0", "0us"}


def parse_systemd_timestamp(value: str) -> float:
    normalized = value.strip().replace(" UTC", "+00:00")
    parsed = dt.datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.timestamp()


def _duration_seconds(value: str) -> float:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(ms|s|m|min|h)\s*", value)
    if not match:
        raise ValueError(f"unsupported timer duration: {value}")
    amount = float(match.group(1))
    return amount * {"ms": 0.001, "s": 1, "m": 60, "min": 60, "h": 3600}[
        match.group(2)
    ]


def max_age_from_unit(path: pathlib.Path) -> int:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key] = value
    interval = values.get("OnUnitActiveSec") or values.get("OnUnitInactiveSec")
    if not interval:
        raise ValueError("repeating timer interval missing")
    jitter = values.get("RandomizedDelaySec", "0s")
    return int(_duration_seconds(interval) + _duration_seconds(jitter) + 60)


def timer_snapshot_errors(
    snapshot: dict[str, str], *, now: float, max_age_seconds: int
) -> list[str]:
    errors: list[str] = []
    if snapshot.get("ActiveState") != "active":
        errors.append("timer_not_active")
    if snapshot.get("SubState") == "elapsed":
        errors.append("substate_elapsed")
    if snapshot.get("NextElapseUSecMonotonic", "").strip().lower() in SYSTEMD_INFINITY:
        errors.append("next_trigger_infinite")
    try:
        last_trigger = parse_systemd_timestamp(snapshot.get("LastTriggerUSec", ""))
    except (TypeError, ValueError):
        errors.append("last_trigger_missing")
    else:
        if now - last_trigger > max_age_seconds:
            errors.append("last_trigger_stale")
    return errors


def two_cycle_cadence_proven(cycles: list[dict[str, object]]) -> bool:
    if len(cycles) < 2:
        return False
    recent = cycles[-2:]
    triggers = [item.get("lastTriggerMonotonic") for item in recent]
    if not all(isinstance(value, (int, float)) for value in triggers):
        return False
    if not triggers[0] < triggers[1]:
        return False
    return all(item.get("serviceResult") == "success" for item in recent)


def _show(unit: str, properties: tuple[str, ...]) -> dict[str, str]:
    command = ["systemctl", "--user", "show", unit]
    for name in properties:
        command.extend((f"--property={name}",))
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"systemctl_show_failed:{unit}")
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values


def _snapshot(timer: str, service: str) -> tuple[dict[str, str], dict[str, object]]:
    timer_data = _show(
        timer,
        (
            "ActiveState",
            "SubState",
            "NextElapseUSecMonotonic",
            "LastTriggerUSec",
            "LastTriggerUSecMonotonic",
            "FragmentPath",
        ),
    )
    service_data = _show(service, ("Result",))
    monotonic = timer_data.get("LastTriggerUSecMonotonic", "0")
    match = re.search(r"\d+", monotonic)
    cycle = {
        "lastTriggerMonotonic": int(match.group()) if match else 0,
        "serviceResult": service_data.get("Result"),
    }
    return timer_data, cycle


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("timer")
    parser.add_argument("--service", required=True)
    parser.add_argument("--unit-file", type=pathlib.Path, required=True)
    parser.add_argument("--observe-cycles", type=int, default=0, choices=(0, 2))
    parser.add_argument("--timeout-seconds", type=int, default=330)
    parser.add_argument("--poll-seconds", type=float, default=5)
    args = parser.parse_args()
    max_age = max_age_from_unit(args.unit_file)
    deadline = time.monotonic() + args.timeout_seconds
    cycles: list[dict[str, object]] = []
    while True:
        timer_data, cycle = _snapshot(args.timer, args.service)
        errors = timer_snapshot_errors(
            timer_data, now=time.time(), max_age_seconds=max_age
        )
        structural_errors = [
            error
            for error in errors
            if error not in {"last_trigger_missing", "last_trigger_stale"}
        ]
        if structural_errors:
            print(json.dumps({"ok": False, "errors": errors, "timer": timer_data}))
            return 1
        if not errors and (
            not cycles
            or cycle["lastTriggerMonotonic"] != cycles[-1]["lastTriggerMonotonic"]
        ):
            cycles.append(cycle)
        if args.observe_cycles == 0 or two_cycle_cadence_proven(cycles):
            print(
                json.dumps(
                    {
                        "ok": True,
                        "schema": "symphony-timer-cadence/v1",
                        "timer": args.timer,
                        "maxAgeSeconds": max_age,
                        "cycles": cycles,
                    },
                    sort_keys=True,
                )
            )
            return 0
        if time.monotonic() >= deadline:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "errors": errors or ["two_cycle_timeout"],
                        "cycles": cycles,
                    }
                )
            )
            return 1
        time.sleep(max(0.1, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
