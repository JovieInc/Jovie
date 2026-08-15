#!/usr/bin/env python3
"""Pressure-driven concurrency controller for the Jovie Symphony runtime.

The controller is intentionally stdlib-only and runs on the Gem host from the
existing event-driven fleet refresh. It samples Linux PSI, available memory,
the lease guard's provider-account receipt, and Symphony's loopback status
surface. A bounded hysteresis policy then atomically updates only
``agent.max_concurrent_agents`` in the installed workflow. Symphony watches
WORKFLOW.md and applies that value to future dispatch decisions without a
restart.

Missing pressure, provider, integrity, runtime, or workflow evidence fails
closed to the minimum concurrency. Scale-down is immediate; scale-up requires
three consecutive low-pressure samples and a two-minute change cooldown.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


SCHEMA = "symphony-concurrency/v1"
STATE_SCHEMA = "symphony-concurrency-state/v1"
MIN_CONCURRENCY = 1
MAX_CONCURRENCY = 8
LOW_STREAK_REQUIRED = 3
CHANGE_COOLDOWN_SECONDS = 120
MIN_AVAILABLE_MEMORY_BYTES = 8 * 1024**3
SEVERE_AVAILABLE_MEMORY_BYTES = 4 * 1024**3
LOW_CPU_SOME_AVG10 = 5.0
HIGH_CPU_SOME_AVG10 = 20.0
SEVERE_CPU_SOME_AVG10 = 40.0
LOW_MEMORY_FULL_AVG10 = 0.5
HIGH_MEMORY_FULL_AVG10 = 2.0
SEVERE_MEMORY_FULL_AVG10 = 5.0
LOW_IO_FULL_AVG10 = 2.0
HIGH_IO_FULL_AVG10 = 10.0
SEVERE_IO_FULL_AVG10 = 20.0
CONCURRENCY_LINE = re.compile(r"^(\s*max_concurrent_agents:\s*)([0-9]+)(\s*)$", re.MULTILINE)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: pathlib.Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def write_json_atomic(path: pathlib.Path, value: dict[str, Any], mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def parse_pressure(text: str, kind: str) -> float | None:
    for line in text.splitlines():
        fields = line.split()
        if not fields or fields[0] != kind:
            continue
        for field in fields[1:]:
            if field.startswith("avg10="):
                try:
                    return float(field.split("=", 1)[1])
                except ValueError:
                    return None
    return None


def read_pressure(proc_root: pathlib.Path, resource: str, kind: str) -> float | None:
    try:
        return parse_pressure((proc_root / "pressure" / resource).read_text(), kind)
    except OSError:
        return None


def read_available_memory(proc_root: pathlib.Path) -> int | None:
    try:
        for line in (proc_root / "meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                fields = line.split()
                if len(fields) == 3 and fields[2] == "kB":
                    return int(fields[1]) * 1024
    except (OSError, ValueError):
        return None
    return None


def read_cpu_count() -> int | None:
    value = os.cpu_count()
    return value if isinstance(value, int) and value > 0 else None


def read_provider_capacity(guard_bin: pathlib.Path) -> dict[str, Any] | None:
    try:
        completed = subprocess.run(
            [str(guard_bin), "report"],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        value = json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    capacity = value.get("capacity") if isinstance(value, dict) else None
    if not isinstance(capacity, dict) or capacity.get("state") not in {"available", "saturated"}:
        return None
    typed: dict[str, Any] = {}
    for key in ("accounts", "locked", "cooldown", "available"):
        item = capacity.get(key)
        if not isinstance(item, int) or item < 0:
            return None
        typed[key] = item
    typed["state"] = capacity["state"]
    return typed


def read_runtime_state(url: str) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - fixed loopback URL
            value = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(value, dict):
        return None
    running = value.get("running")
    retrying = value.get("retrying")
    if not isinstance(running, list) or not isinstance(retrying, list):
        return None
    totals = value.get("codex_totals")
    return {
        "running": len(running),
        "retrying": len(retrying),
        "codexTotals": totals if isinstance(totals, dict) else None,
    }


def integrity_allows_scale(path: pathlib.Path) -> tuple[bool, str]:
    if not path.exists():
        return True, "no-active-receipt"
    try:
        value = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return False, "integrity-receipt-invalid"
    status = value.get("status")
    if status in {"clear", "resolved"}:
        return True, str(status)
    return False, f"integrity-{status or 'unknown'}"


def read_current_target(workflow: pathlib.Path) -> tuple[str, int]:
    text = workflow.read_text(encoding="utf-8")
    matches = list(CONCURRENCY_LINE.finditer(text))
    if len(matches) != 1:
        raise ValueError("workflow must contain exactly one max_concurrent_agents scalar")
    value = int(matches[0].group(2))
    if not MIN_CONCURRENCY <= value <= MAX_CONCURRENCY:
        raise ValueError("installed concurrency is outside the bounded policy")
    return text, value


def render_target(text: str, target: int) -> str:
    return CONCURRENCY_LINE.sub(lambda match: f"{match.group(1)}{target}{match.group(3)}", text, count=1)


def write_workflow_atomic(path: pathlib.Path, text: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8")
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def load_state(path: pathlib.Path, current_target: int) -> dict[str, Any]:
    try:
        value = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        value = {}
    if value.get("schema") != STATE_SCHEMA:
        return {
            "schema": STATE_SCHEMA,
            "target": current_target,
            "lowStreak": 0,
            "lastChangeEpoch": 0.0,
        }
    target = value.get("target")
    low_streak = value.get("lowStreak")
    last_change = value.get("lastChangeEpoch")
    if not isinstance(target, int) or not MIN_CONCURRENCY <= target <= MAX_CONCURRENCY:
        target = current_target
    if not isinstance(low_streak, int) or low_streak < 0:
        low_streak = 0
    if not isinstance(last_change, (int, float)) or last_change < 0:
        last_change = 0.0
    return {
        "schema": STATE_SCHEMA,
        "target": target,
        "lowStreak": low_streak,
        "lastChangeEpoch": float(last_change),
    }


def classify_pressure(sample: dict[str, Any]) -> str:
    required = ("cpuSomeAvg10", "memoryFullAvg10", "ioFullAvg10", "availableMemoryBytes")
    if any(sample.get(key) is None for key in required):
        return "unknown"
    if (
        sample["availableMemoryBytes"] < SEVERE_AVAILABLE_MEMORY_BYTES
        or sample["cpuSomeAvg10"] >= SEVERE_CPU_SOME_AVG10
        or sample["memoryFullAvg10"] >= SEVERE_MEMORY_FULL_AVG10
        or sample["ioFullAvg10"] >= SEVERE_IO_FULL_AVG10
    ):
        return "severe"
    if (
        sample["availableMemoryBytes"] < MIN_AVAILABLE_MEMORY_BYTES
        or sample["cpuSomeAvg10"] >= HIGH_CPU_SOME_AVG10
        or sample["memoryFullAvg10"] >= HIGH_MEMORY_FULL_AVG10
        or sample["ioFullAvg10"] >= HIGH_IO_FULL_AVG10
    ):
        return "high"
    if (
        sample["availableMemoryBytes"] >= MIN_AVAILABLE_MEMORY_BYTES
        and sample["cpuSomeAvg10"] <= LOW_CPU_SOME_AVG10
        and sample["memoryFullAvg10"] <= LOW_MEMORY_FULL_AVG10
        and sample["ioFullAvg10"] <= LOW_IO_FULL_AVG10
    ):
        return "low"
    return "normal"


def choose_target(
    *,
    current: int,
    state: dict[str, Any],
    sample: dict[str, Any],
    provider: dict[str, Any] | None,
    runtime: dict[str, Any] | None,
    integrity_allowed: bool,
    now_epoch: float,
) -> tuple[int, int, str]:
    if provider is None or runtime is None or not integrity_allowed:
        reason = "integrity-blocked" if not integrity_allowed else "required-telemetry-unavailable"
        return MIN_CONCURRENCY, 0, reason
    cpu_count = sample.get("cpuCount")
    if not isinstance(cpu_count, int) or cpu_count <= 0:
        return MIN_CONCURRENCY, 0, "required-telemetry-unavailable"
    provider_ceiling = provider["locked"] + provider["available"]
    host_ceiling = max(MIN_CONCURRENCY, min(MAX_CONCURRENCY, cpu_count - 1))
    ceiling = max(MIN_CONCURRENCY, min(MAX_CONCURRENCY, provider_ceiling, host_ceiling))
    pressure = classify_pressure(sample)
    if pressure == "unknown":
        return MIN_CONCURRENCY, 0, "required-telemetry-unavailable"
    if pressure == "severe":
        return MIN_CONCURRENCY, 0, "severe-pressure"
    if current > ceiling:
        return ceiling, 0, "capacity-ceiling-contracted"
    if pressure == "high":
        return max(MIN_CONCURRENCY, current - 1), 0, "measured-saturation"
    if pressure != "low":
        return current, 0, "pressure-hold"
    low_streak = int(state.get("lowStreak", 0)) + 1
    cooldown_elapsed = now_epoch - float(state.get("lastChangeEpoch", 0.0))
    if current < ceiling and low_streak >= LOW_STREAK_REQUIRED and cooldown_elapsed >= CHANGE_COOLDOWN_SECONDS:
        return current + 1, 0, "sustained-low-pressure"
    return current, low_streak, "low-pressure-hysteresis"


def run(args: argparse.Namespace) -> dict[str, Any]:
    now_epoch = time.time()
    workflow_text, current = read_current_target(args.workflow)
    state = load_state(args.state, current)
    proc_root = args.proc_root
    sample = {
        "cpuCount": read_cpu_count(),
        "cpuSomeAvg10": read_pressure(proc_root, "cpu", "some"),
        "memoryFullAvg10": read_pressure(proc_root, "memory", "full"),
        "ioFullAvg10": read_pressure(proc_root, "io", "full"),
        "availableMemoryBytes": read_available_memory(proc_root),
    }
    provider = read_provider_capacity(args.lease_guard)
    runtime = read_runtime_state(args.runtime_url)
    integrity_allowed, integrity_status = integrity_allows_scale(args.integrity_receipt)
    target, low_streak, reason = choose_target(
        current=current,
        state=state,
        sample=sample,
        provider=provider,
        runtime=runtime,
        integrity_allowed=integrity_allowed,
        now_epoch=now_epoch,
    )
    changed = target != current
    if changed and not args.dry_run:
        write_workflow_atomic(args.workflow, render_target(workflow_text, target))
    next_state = {
        "schema": STATE_SCHEMA,
        "target": target,
        "lowStreak": low_streak,
        "lastChangeEpoch": now_epoch if changed else state.get("lastChangeEpoch", 0.0),
    }
    if not args.dry_run:
        write_json_atomic(args.state, next_state)
    receipt = {
        "schema": SCHEMA,
        "observedAt": utc_now(),
        "mode": "dry-run" if args.dry_run else "applied",
        "current": current,
        "target": target,
        "changed": changed,
        "reason": reason,
        "lowStreak": low_streak,
        "bounds": {"min": MIN_CONCURRENCY, "max": MAX_CONCURRENCY},
        "sample": sample,
        "provider": provider,
        "runtime": runtime,
        "utilizationRatio": (
            round(runtime["running"] / target, 4)
            if runtime is not None and target > 0
            else None
        ),
        "integrity": {"allowed": integrity_allowed, "status": integrity_status},
    }
    if not args.dry_run:
        write_json_atomic(args.receipt, receipt, mode=0o644)
    return receipt


def parse_args() -> argparse.Namespace:
    home = pathlib.Path.home()
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--workflow",
        type=pathlib.Path,
        default=home / "symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md",
    )
    parser.add_argument(
        "--state",
        type=pathlib.Path,
        default=home / ".local/state/symphony-concurrency-controller/state.json",
    )
    parser.add_argument(
        "--receipt",
        type=pathlib.Path,
        default=pathlib.Path("/home/timwhite/gem-workspace/state/symphony-concurrency.json"),
    )
    parser.add_argument(
        "--integrity-receipt",
        type=pathlib.Path,
        default=pathlib.Path("/home/timwhite/gem-workspace/state/integrity.json"),
    )
    parser.add_argument(
        "--lease-guard",
        type=pathlib.Path,
        default=home / ".local/bin/symphony-lease-guard",
    )
    parser.add_argument("--proc-root", type=pathlib.Path, default=pathlib.Path("/proc"))
    parser.add_argument("--runtime-url", default="http://127.0.0.1:4041/api/v1/state")
    return parser.parse_args()


def main() -> int:
    try:
        receipt = run(parse_args())
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"schema": SCHEMA, "observedAt": utc_now(), "status": "error", "error": str(error)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
