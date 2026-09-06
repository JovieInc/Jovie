#!/usr/bin/env python3
"""Pressure-driven concurrency controller for the Jovie Symphony runtime.

The controller is intentionally stdlib-only and runs on the Gem host from the
existing event-driven fleet refresh. It samples Linux PSI, available memory,
authenticated provider-route eligibility, the lane admission receipt, and
Symphony's loopback status surface. A bounded hysteresis policy then atomically updates only
``agent.max_concurrent_agents`` in the installed workflow. Symphony watches
WORKFLOW.md and applies that value to future dispatch decisions without a
restart.

Missing pressure, provider, integrity, runtime, or workflow evidence fails
closed to the minimum concurrency. Scale-down is immediate; scale-up requires
three consecutive low-pressure samples with useful work at the current target,
downstream headroom, eligible provider routing, and a two-minute change cooldown.
Account inventory and CPU count are not worker limits; each successful probe adds
one future dispatch slot. This controller does not terminate existing workers.
"""

from __future__ import annotations

import argparse
import json
import math
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
LOW_STREAK_REQUIRED = 3
CHANGE_COOLDOWN_SECONDS = 120
EVIDENCE_MAX_AGE_SECONDS = 600
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
CANONICAL_CONCURRENCY = re.compile(r"[1-9][0-9]*")


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


def resource_scope(args: argparse.Namespace) -> dict[str, str]:
    return {
        "kind": "gem-host-provider-accounts-workflow",
        "host": os.uname().nodename,
        "workflow": str(args.workflow),
        "runtimeUrl": str(args.runtime_url),
        "leaseGuard": str(args.lease_guard),
        "providerRoutes": str(args.provider_routes),
        "downstreamReceipt": str(args.downstream_receipt),
        "repository": args.repo,
    }


def parse_pressure(text: str, kind: str) -> float | None:
    for line in text.splitlines():
        fields = line.split()
        if not fields or fields[0] != kind:
            continue
        for field in fields[1:]:
            if field.startswith("avg10="):
                try:
                    value = float(field.split("=", 1)[1])
                    return value if math.isfinite(value) and value >= 0 else None
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
        if type(item) is not int or item < 0:
            return None
        typed[key] = item
    typed["state"] = capacity["state"]
    fresh = capacity.get("freshReadiness")
    typed["eligible"] = type(fresh) is int and fresh > 0 and typed["available"] > 0
    typed["capacityFailure"] = capacity["state"] == "saturated" and typed["locked"] == 0
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
        "issues": [row.get("issue_identifier") for row in [*running, *retrying] if isinstance(row, dict)],
        "productive": sum(
            1 for row in running if isinstance(row, dict)
            and recent_timestamp(row.get("last_event_at"), time.time(), CHANGE_COOLDOWN_SECONDS)
            and any(stage in str(row.get("last_message", "")).lower()
                    for stage in ("command execution", "file change", "tool call", "turn completed"))
        ),
        "codexTotals": totals if isinstance(totals, dict) else None,
    }


def recent_timestamp(value: object, now_epoch: float, max_age: int = EVIDENCE_MAX_AGE_SECONDS) -> bool:
    if not isinstance(value, str):
        return False
    try:
        observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return observed.tzinfo is not None and 0 <= now_epoch - observed.timestamp() <= max_age
    except (ValueError, OverflowError):
        return False


def read_router_capacity(directory: pathlib.Path, runtime: dict[str, Any] | None, now_epoch: float) -> dict[str, Any] | None:
    """Route eligibility is permission to probe, never a numerical slot claim."""
    if runtime is None:
        return None
    try:
        cooldowns = read_json(directory / "provider-cooldowns.json").get("providers")
        if not isinstance(cooldowns, dict):
            return None
        eligible = False
        cooling = False
        for issue in runtime.get("issues", []):
            if not isinstance(issue, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", issue):
                continue
            route = read_json(directory / f"{issue}.json")
            if (route.get("schema") != "symphony-provider-route/v1" or route.get("issue") != issue
                or not recent_timestamp(route.get("observedAt"), now_epoch)
                or not isinstance(route.get("model"), str) or not route["model"]):
                continue
            provider = route.get("provider")
            if not isinstance(provider, str) or not provider:
                continue
            cooldown = cooldowns.get(provider)
            if cooldown is not None:
                if not isinstance(cooldown, dict):
                    return None
                until = cooldown.get("unavailableUntil")
                if not isinstance(until, str):
                    return None
                deadline = datetime.fromisoformat(until.replace("Z", "+00:00"))
                if deadline.tzinfo is None:
                    return None
                if deadline.timestamp() > now_epoch:
                    cooling = True
                    continue
            eligible = True
        return {"eligible": eligible, "capacityFailure": cooling and not eligible,
                "source": "active-issue-authenticated-routes"}
    except (OSError, ValueError, TypeError):
        return None


def read_downstream(path: pathlib.Path, repository: str, now_epoch: float) -> dict[str, Any] | None:
    """Read the existing lane gate, keeping ready inventory within its allowance."""
    try:
        gate = read_json(path)
        if gate.get("schema") != "jovie-fleet-gate/v1" or not recent_timestamp(gate.get("observedAt"), now_epoch):
            return None
        signals = gate["signals"]
        queue = signals["queue"]
        # A held product cannot contract another repository's controller.
        if queue.get("repository") != repository:
            return None
        ready, budget = queue.get("greenReadyPrs", queue.get("eligiblePrs")), queue.get("target")
        if queue.get("status") != "known" or type(ready) is not int or ready < 0 or type(budget) is not int or budget <= 0:
            return None
        closure = signals.get("closureHealth")
        remediation_continues = (
            isinstance(closure, dict)
            and closure.get("remediationContinues") is True
        )
        normal_intake = (
            gate.get("workAdmission", {}).get("allowed") is True
            and gate.get("closureAdmission", {}).get("newIssueIntakeAllowed") is True
        )
        healthy = (
            gate.get("state") != "RED"
            and signals.get("main", {}).get("status") == "green"
            and signals.get("production", {}).get("status") == "green"
            and (normal_intake or remediation_continues)
        )
        # Do not consume gate.concurrency here: that is proof inventory, and
        # using it to authorize a probe would create a circular capacity gate.
        return {"healthy": healthy, "headroom": max(0, budget - ready), "repository": repository}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


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
    if not CANONICAL_CONCURRENCY.fullmatch(matches[0].group(2)):
        raise ValueError("installed concurrency is outside the bounded policy")
    return text, value


def render_target(text: str, target: int) -> str:
    return CONCURRENCY_LINE.sub(lambda match: f"{match.group(1)}{target}{match.group(3)}", text, count=1)


def verify_concurrency_overlay(source_text: str, installed_text: str) -> int:
    """Require byte identity except a single bounded max_concurrent_agents overlay.

    The pressure controller rewrites only that scalar on the installed workflow.
    Any other difference, a missing or duplicated line, a non-numeric value, a
    zero-padded numeral, or a non-positive runtime value fails closed.
    """
    source_matches = list(CONCURRENCY_LINE.finditer(source_text))
    installed_matches = list(CONCURRENCY_LINE.finditer(installed_text))
    if len(source_matches) != 1:
        raise ValueError("source workflow must contain exactly one max_concurrent_agents scalar")
    if len(installed_matches) != 1:
        raise ValueError("installed workflow must contain exactly one max_concurrent_agents scalar")
    source_raw = source_matches[0].group(2)
    installed_raw = installed_matches[0].group(2)
    if not CANONICAL_CONCURRENCY.fullmatch(source_raw) or not CANONICAL_CONCURRENCY.fullmatch(installed_raw):
        raise ValueError("installed concurrency is outside the bounded policy")
    if render_target(installed_text, int(source_raw)) != source_text:
        raise ValueError("workflow drift beyond concurrency overlay")
    return int(installed_raw)


def write_workflow_atomic(path: pathlib.Path, text: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8")
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def load_state(
    path: pathlib.Path, current_target: int, scope: dict[str, str]
) -> dict[str, Any]:
    try:
        value = read_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        value = {}
    if value.get("schema") != STATE_SCHEMA or value.get("resourceScope") != scope:
        return {
            "schema": STATE_SCHEMA,
            "resourceScope": scope,
            "target": current_target,
            "lowStreak": 0,
            "lastChangeEpoch": 0.0,
        }
    target = value.get("target")
    low_streak = value.get("lowStreak")
    last_change = value.get("lastChangeEpoch")
    if type(target) is not int or target < MIN_CONCURRENCY:
        target = current_target
    if not isinstance(low_streak, int) or low_streak < 0:
        low_streak = 0
    if not isinstance(last_change, (int, float)) or last_change < 0:
        last_change = 0.0
    return {
        "schema": STATE_SCHEMA,
        "resourceScope": scope,
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
    downstream: dict[str, Any] | None = None,
) -> tuple[int, int, str]:
    if provider is None or runtime is None or not integrity_allowed:
        reason = "integrity-blocked" if not integrity_allowed else "required-telemetry-unavailable"
        return MIN_CONCURRENCY, 0, reason
    cpu_count = sample.get("cpuCount")
    if type(cpu_count) is not int or cpu_count <= 0:
        return MIN_CONCURRENCY, 0, "required-telemetry-unavailable"
    pressure = classify_pressure(sample)
    if pressure == "unknown":
        return MIN_CONCURRENCY, 0, "required-telemetry-unavailable"
    if pressure == "severe":
        return MIN_CONCURRENCY, 0, "severe-pressure"
    if downstream is not None and (downstream.get("healthy") is not True or downstream.get("headroom", 0) <= 0):
        return MIN_CONCURRENCY, 0, "downstream-backpressure"
    if provider.get("capacityFailure") is True:
        return max(MIN_CONCURRENCY, current // 2), 0, "provider-capacity-failure"
    if pressure == "high":
        return max(MIN_CONCURRENCY, current - 1), 0, "measured-saturation"
    if downstream is None:
        return current, 0, "downstream-evidence-unavailable"
    if provider.get("eligible") is not True or runtime.get("retrying", 0) > 0:
        return current, 0, "provider-eligibility-unproven"
    if runtime.get("productive", 0) < current:
        return current, 0, "useful-work-headroom-unproven"
    if pressure != "low":
        return current, 0, "pressure-hold"
    low_streak = int(state.get("lowStreak", 0)) + 1
    cooldown_elapsed = now_epoch - float(state.get("lastChangeEpoch", 0.0))
    if low_streak >= LOW_STREAK_REQUIRED and cooldown_elapsed >= CHANGE_COOLDOWN_SECONDS:
        return current + 1, 0, "sustained-low-pressure"
    return current, low_streak, "low-pressure-hysteresis"


def run(args: argparse.Namespace) -> dict[str, Any]:
    now_epoch = time.time()
    workflow_text, current = read_current_target(args.workflow)
    scope = resource_scope(args)
    state = load_state(args.state, current, scope)
    proc_root = args.proc_root
    sample = {
        "cpuCount": read_cpu_count(),
        "cpuSomeAvg10": read_pressure(proc_root, "cpu", "some"),
        "memoryFullAvg10": read_pressure(proc_root, "memory", "full"),
        "ioFullAvg10": read_pressure(proc_root, "io", "full"),
        "availableMemoryBytes": read_available_memory(proc_root),
    }
    runtime = read_runtime_state(args.runtime_url)
    provider = read_router_capacity(args.provider_routes, runtime, now_epoch)
    if provider is None and not args.provider_routes.exists():
        provider = read_provider_capacity(args.lease_guard)
    downstream = read_downstream(args.downstream_receipt, args.repo, now_epoch)
    integrity_allowed, integrity_status = integrity_allows_scale(args.integrity_receipt)
    target, low_streak, reason = choose_target(
        current=current,
        state=state,
        sample=sample,
        provider=provider,
        runtime=runtime,
        integrity_allowed=integrity_allowed,
        now_epoch=now_epoch,
        downstream=downstream,
    )
    changed = target != current
    if changed and not args.dry_run:
        write_workflow_atomic(args.workflow, render_target(workflow_text, target))
    next_state = {
        "schema": STATE_SCHEMA,
        "resourceScope": scope,
        "target": target,
        "lowStreak": low_streak,
        "lastChangeEpoch": now_epoch if changed else state.get("lastChangeEpoch", 0.0),
    }
    if not args.dry_run:
        write_json_atomic(args.state, next_state)
    receipt = {
        "schema": SCHEMA,
        "resourceScope": scope,
        "observedAt": utc_now(),
        "mode": "dry-run" if args.dry_run else "applied",
        "current": current,
        "target": target,
        "changed": changed,
        "reason": reason,
        "lowStreak": low_streak,
        "bounds": {"min": MIN_CONCURRENCY, "max": None, "policy": "empirical-additive-probe"},
        "downstream": downstream,
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
        default=home / ".config/symphony/WORKFLOW.md",
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
    parser.add_argument("--provider-routes", type=pathlib.Path, default=home / ".local/state/symphony-provider-router")
    parser.add_argument("--downstream-receipt", type=pathlib.Path, default=home / "gem-workspace/state/gem-priority-gate/latest.json")
    parser.add_argument("--repo", default="JovieInc/Jovie")
    parser.add_argument("--proc-root", type=pathlib.Path, default=pathlib.Path("/proc"))
    parser.add_argument("--runtime-url", default="http://127.0.0.1:4041/api/v1/state")
    parser.add_argument(
        "--verify-workflow-overlay",
        nargs=2,
        metavar=("SOURCE", "INSTALLED"),
        type=pathlib.Path,
        help="exit 0 when INSTALLED matches SOURCE except a bounded concurrency overlay",
    )
    return parser.parse_args()


def main() -> int:
    try:
        args = parse_args()
        if args.verify_workflow_overlay is not None:
            source_path, installed_path = args.verify_workflow_overlay
            try:
                target = verify_concurrency_overlay(
                    source_path.read_text(encoding="utf-8"),
                    installed_path.read_text(encoding="utf-8"),
                )
            except (OSError, ValueError):
                print(f"DRIFT {installed_path}")
                return 1
            print(f"OK {installed_path} (runtime max_concurrent_agents={target})")
            return 0
        receipt = run(args)
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"schema": SCHEMA, "observedAt": utc_now(), "status": "error", "error": str(error)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
