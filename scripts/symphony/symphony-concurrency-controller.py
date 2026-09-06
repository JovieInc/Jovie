#!/usr/bin/env python3
"""Pressure-driven concurrency controller for the Jovie Symphony runtime.

The controller is intentionally stdlib-only and runs on the Gem host from the
existing event-driven fleet refresh. It samples Linux PSI, available memory,
authenticated provider-route eligibility, the lane admission receipt, and
Symphony's loopback status surface. Before each decision it also reattests the
installer-pinned source, binary, provider generation, and live service identity.
A hysteresis policy then atomically updates only ``agent.max_concurrent_agents``
in the installed workflow. Symphony watches
WORKFLOW.md and applies that value to future dispatch decisions without a
restart.

Missing pressure, provider, integrity, runtime, or workflow evidence fails
closed to the minimum concurrency. Scale-down is immediate; scale-up requires
three consecutive low-pressure samples with useful work at the current target,
downstream headroom, eligible provider routing, and a two-minute change cooldown.
Duplicate issue/active-PR ownership evidence vetoes widening without terminating
unrelated work that is already running.
Account inventory and CPU count are not worker limits; each successful probe adds
one future dispatch slot. This controller does not terminate existing workers.
"""

from __future__ import annotations

import argparse
import hashlib
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
CANONICAL_REVISION = re.compile(r"[0-9a-f]{40}")
CANONICAL_SHA256 = re.compile(r"[0-9a-f]{64}")
REATTEST_SCHEMA = "gem-service-reattest/v1"

SOURCE_ARTIFACTS = {
    "unit": ("scripts/symphony/systemd/symphony-elixir.service", ".config/systemd/user/symphony-elixir.service"),
    "policy": ("scripts/symphony/gem_rehabilitation_policy.py", "gem-workspace/scripts/gem_rehabilitation_policy.py"),
    "gate": ("scripts/symphony/gem-priority-gate.py", "gem-workspace/scripts/gem-priority-gate.py"),
    "closureHealth": ("scripts/symphony/closure_health.py", "gem-workspace/scripts/closure_health.py"),
    "contract": ("scripts/symphony/gem_gate_contract.py", "gem-workspace/scripts/gem_gate_contract.py"),
    "consumer": ("scripts/symphony/gem-pr-drain.py", "gem-workspace/scripts/gem-pr-drain.py"),
    "registryModule": ("scripts/symphony/gem_repo_registry.py", "gem-workspace/scripts/gem_repo_registry.py"),
    "registryConfig": ("scripts/symphony/config/gem-repo-registry.json", "gem-workspace/config/gem-repo-registry.json"),
    "concurrencyController": ("scripts/symphony/symphony-concurrency-controller.py", ".local/bin/symphony-concurrency-controller"),
    "concurrencyService": ("scripts/symphony/systemd/symphony-concurrency-controller.service", ".config/systemd/user/symphony-concurrency-controller.service"),
    "concurrencyTimer": ("scripts/symphony/systemd/symphony-concurrency-controller.timer", ".config/systemd/user/symphony-concurrency-controller.timer"),
    "runtimeHelper": ("scripts/symphony/symphony_official_runtime.py", ".local/bin/symphony-official-runtime"),
    "autoRoute": ("scripts/symphony/symphony-auto-route.mjs", ".local/bin/symphony-auto-route.mjs"),
    "safeRestart": ("scripts/symphony/symphony-elixir-safe-restart", ".local/bin/symphony-elixir-safe-restart"),
    "frozenTransition": ("scripts/symphony/symphony-frozen-generation-transition", ".local/bin/symphony-frozen-generation-transition"),
}
PROVIDER_FILES = {"agent-router", "codex-router", "codex-probe", "cursor-adapter", "entry"}


def utc_now(now_epoch: float | None = None) -> str:
    instant = datetime.now(timezone.utc) if now_epoch is None else datetime.fromtimestamp(now_epoch, timezone.utc)
    return instant.isoformat().replace("+00:00", "Z")


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


def sha256_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def workflow_semantic_sha(text: str) -> str:
    matches = list(CONCURRENCY_LINE.finditer(text))
    if len(matches) != 1 or not CANONICAL_CONCURRENCY.fullmatch(matches[0].group(2)):
        raise ValueError("workflow must contain one bounded max_concurrent_agents scalar")
    normalized = CONCURRENCY_LINE.sub(
        lambda match: f"{match.group(1)}<runtime>{match.group(3)}", text, count=1
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def artifact_targets(runtime_home: pathlib.Path, gem_root: pathlib.Path) -> dict[str, pathlib.Path]:
    targets: dict[str, pathlib.Path] = {}
    for name, (_, relative) in SOURCE_ARTIFACTS.items():
        targets[name] = (
            gem_root / relative.removeprefix("gem-workspace/")
            if relative.startswith("gem-workspace/")
            else runtime_home / relative
        )
    return targets


def provider_generation_identity(runtime_home: pathlib.Path) -> dict[str, Any]:
    root = runtime_home / ".local/state/symphony-elixir/provider-generations"
    current = root / "current"
    if not current.is_symlink():
        raise ValueError("managed provider generation is missing")
    target = current.resolve(strict=True)
    if target.parent != root.resolve() or not target.is_dir():
        raise ValueError("provider generation is outside the managed store")
    manifest_path = target / "manifest.json"
    manifest = read_json(manifest_path)
    hashes = manifest.get("sha256")
    if manifest.get("schema") != "symphony-provider-generation/v1" or not isinstance(hashes, dict):
        raise ValueError("provider generation manifest is invalid")
    if set(hashes) != PROVIDER_FILES:
        raise ValueError("provider generation manifest inventory is invalid")
    for name in PROVIDER_FILES:
        expected = hashes.get(name)
        path = target / name
        if (
            not isinstance(expected, str)
            or not CANONICAL_SHA256.fullmatch(expected)
            or path.is_symlink()
            or not path.is_file()
            or not os.access(path, os.X_OK)
            or sha256_file(path) != expected
        ):
            raise ValueError(f"provider generation integrity mismatch: {name}")
    aliases = [runtime_home / ".local/bin/symphony-agent-router", runtime_home / ".local/bin/symphony-codex-entry"]
    for alias in aliases:
        if not alias.is_symlink() or alias.resolve(strict=True) != target / "entry":
            raise ValueError(f"provider alias integrity mismatch: {alias.name}")
    return {
        "currentPath": str(current),
        "targetPath": str(target),
        "manifestSha256": sha256_file(manifest_path),
        "sha256": hashes,
        "aliases": [str(alias) for alias in aliases],
    }


def live_service_identity(
    runtime_home: pathlib.Path,
    proc_root: pathlib.Path,
    runtime_healthy: bool,
) -> dict[str, Any]:
    if not runtime_healthy:
        raise ValueError("official Symphony state endpoint is unhealthy")

    def command(*parts: str) -> str:
        return subprocess.run(
            list(parts), check=True, capture_output=True, text=True, timeout=5
        ).stdout.strip()

    command("systemctl", "--user", "is-active", "--quiet", "symphony-elixir.service")
    wrapper_raw = command("systemctl", "--user", "show", "symphony-elixir.service", "--property=MainPID", "--value")
    control_group = command("systemctl", "--user", "show", "symphony-elixir.service", "--property=ControlGroup", "--value")
    fragment = command("systemctl", "--user", "show", "symphony-elixir.service", "--property=FragmentPath", "--value")
    if not wrapper_raw.isdigit() or int(wrapper_raw) <= 0:
        raise ValueError("official Symphony wrapper pid is invalid")
    if not control_group.endswith("/symphony-elixir.service"):
        raise ValueError("official Symphony cgroup is invalid")
    if pathlib.Path(fragment) != runtime_home / ".config/systemd/user/symphony-elixir.service":
        raise ValueError("official Symphony unit fragment drifted")
    wrapper_pid = int(wrapper_raw)
    if control_group not in (proc_root / str(wrapper_pid) / "cgroup").read_text(encoding="utf-8"):
        raise ValueError("official Symphony wrapper escaped its service cgroup")
    wrapper_cmdline = (proc_root / str(wrapper_pid) / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8")
    if "symphony-official-runtime" not in wrapper_cmdline:
        raise ValueError("official Symphony wrapper identity mismatch")
    listeners = command("ss", "-H", "-ltnp", "sport = :4041")
    match = re.search(r"pid=([1-9][0-9]*)[,]", listeners)
    if match is None:
        raise ValueError("official Symphony listener is missing")
    listener_pid = int(match.group(1))
    if control_group not in (proc_root / str(listener_pid) / "cgroup").read_text(encoding="utf-8"):
        raise ValueError("official Symphony listener escaped its service cgroup")
    listener_cmdline = (proc_root / str(listener_pid) / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8")
    if ".burrito/symphony_erts-" not in listener_cmdline or "--port 4041" not in listener_cmdline or "symphony-ui-pilot" in listener_cmdline:
        raise ValueError("official Symphony listener identity mismatch")
    return {
        "port": 4041,
        "pid": listener_pid,
        "wrapperPid": wrapper_pid,
        "controlGroup": control_group,
        "boundToService": True,
    }


def resource_scope(args: argparse.Namespace) -> dict[str, str]:
    return {
        "kind": "gem-host-provider-accounts-workflow",
        "host": os.uname().nodename,
        "workflow": str(args.workflow),
        "runtimeUrl": str(args.runtime_url),
        "leaseGuard": str(args.lease_guard),
        "providerRoutes": str(args.provider_routes),
        "downstreamReceipt": str(args.downstream_receipt),
        "sourceAttestation": str(args.source_attestation),
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
    """Read the lane gate without turning repair permission into new-work permission."""
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
        work = gate.get("workAdmission")
        closure_admission = gate.get("closureAdmission")
        remediation = gate.get("remediationAdmission")
        if not all(isinstance(item, dict) for item in (closure, work, closure_admission, remediation)):
            return None
        classifications = closure.get("classifications")
        if not isinstance(classifications, dict):
            return None
        duplicate_issue_lanes = classifications.get("duplicateIssueLanes")
        if not isinstance(duplicate_issue_lanes, list):
            return None
        for lane in duplicate_issue_lanes:
            if not isinstance(lane, dict):
                return None
            issue = lane.get("issue")
            prs = lane.get("prs")
            if (
                not isinstance(issue, str)
                or not issue
                or not isinstance(prs, list)
                or len(prs) < 2
                or any(type(number) is not int or number <= 0 for number in prs)
            ):
                return None
        remediation_continues = (
            closure.get("remediationContinues") is True
            and closure_admission.get("remediationContinues") is True
        )
        normal_intake = (
            work.get("allowed") is True
            and work.get("newIssueLeaseAllowed") is True
            and work.get("newImplementationAllowed") is True
            and closure_admission.get("newIssueIntakeAllowed") is True
            and closure_admission.get("newImplementationAllowed") is True
        )
        healthy = (
            gate.get("state") != "RED"
            and signals.get("main", {}).get("status") == "green"
            and signals.get("production", {}).get("status") == "green"
            and normal_intake
        )
        # Do not consume gate.concurrency here: that is proof inventory, and
        # using it to authorize a probe would create a circular capacity gate.
        return {
            "healthy": healthy,
            "headroom": max(0, budget - ready),
            "repository": repository,
            "newWorkAllowed": normal_intake,
            "operationalHealthy": (
                gate.get("state") != "RED"
                and signals.get("main", {}).get("status") == "green"
                and signals.get("production", {}).get("status") == "green"
                and max(0, budget - ready) > 0
            ),
            "ownershipConflict": bool(duplicate_issue_lanes),
            "repairOnly": (
                gate.get("state") != "RED"
                and remediation_continues
                and remediation.get("allowed") is True
                and remediation.get("localAllowed") is True
                and not normal_intake
            ),
            "remediationPushAllowed": remediation.get("pushAllowed") is True,
        }
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def initialize_source_attestation(
    *,
    source_root: pathlib.Path,
    source_revision: str,
    runtime_home: pathlib.Path,
    gem_root: pathlib.Path,
    workflow: pathlib.Path,
    destination: pathlib.Path,
    listener: dict[str, Any],
    now_epoch: float,
) -> dict[str, Any]:
    """Create the immutable identity baseline after installer-owned checks pass."""
    if not CANONICAL_REVISION.fullmatch(source_revision):
        raise ValueError("source revision must be a full lowercase SHA")
    targets = artifact_targets(runtime_home, gem_root)
    artifacts: dict[str, Any] = {}
    for name, (source_relative, _) in SOURCE_ARTIFACTS.items():
        source = source_root / source_relative
        target = targets[name]
        source_hash, installed_hash = sha256_file(source), sha256_file(target)
        if source_hash != installed_hash:
            raise ValueError(f"refusing stale Gem service attestation: {name} drifted")
        artifacts[name] = {
            "path": str(target),
            "sourceSha256": source_hash,
            "installedSha256": installed_hash,
            "matches": True,
        }
    source_workflow = (source_root / "scripts/symphony/WORKFLOW.md").read_text(encoding="utf-8")
    installed_workflow = workflow.read_text(encoding="utf-8")
    installed_concurrency = verify_concurrency_overlay(source_workflow, installed_workflow)
    source_concurrency = read_current_target(source_root / "scripts/symphony/WORKFLOW.md")[1]
    runtime_binary = runtime_home / ".local/bin/symphony"
    build_hash = sha256_file(runtime_binary)
    provider_identity = provider_generation_identity(runtime_home)
    observed_at = utc_now(now_epoch)
    receipt = {
        "schema": "gem-service-attestation/v1",
        "observedAt": observed_at,
        "sourceRevision": source_revision,
        "daemonReloaded": True,
        "service": "symphony-elixir.service",
        "active": True,
        "healthy": True,
        "listener": listener,
        "workflow": {
            "sourceSha256": hashlib.sha256(source_workflow.encode("utf-8")).hexdigest(),
            "installedSha256": hashlib.sha256(installed_workflow.encode("utf-8")).hexdigest(),
            "semanticSha256": workflow_semantic_sha(source_workflow),
            "matches": True,
            "matchMode": "exact" if source_workflow == installed_workflow else "bounded_concurrency_overlay",
            "sourceMaxConcurrentAgents": source_concurrency,
            "installedMaxConcurrentAgents": installed_concurrency,
        },
        "unit": artifacts["unit"],
        "policy": artifacts["policy"],
        "gate": artifacts["gate"],
        "closureHealth": artifacts["closureHealth"],
        "concurrencyController": artifacts["concurrencyController"],
        "concurrencyService": artifacts["concurrencyService"],
        "concurrencyTimer": artifacts["concurrencyTimer"],
        "reattest": {
            "schema": REATTEST_SCHEMA,
            "lastVerifiedAt": observed_at,
            "artifacts": artifacts,
            "runtimeBuild": {"path": str(runtime_binary), "sha256": build_hash},
            "providerGeneration": provider_identity,
        },
    }
    write_json_atomic(destination, receipt)
    return receipt


def refresh_source_attestation(
    *,
    path: pathlib.Path,
    now_epoch: float,
    runtime_home: pathlib.Path,
    gem_root: pathlib.Path,
    workflow: pathlib.Path,
    proc_root: pathlib.Path,
    runtime_healthy: bool,
    write: bool,
) -> dict[str, Any] | None:
    """Revalidate exact installed identity and refresh only a verified receipt."""
    try:
        receipt = read_json(path)
        reattest = receipt.get("reattest")
        revision = receipt.get("sourceRevision")
        if (
            receipt.get("schema") != "gem-service-attestation/v1"
            or not isinstance(revision, str)
            or not CANONICAL_REVISION.fullmatch(revision)
            or not isinstance(reattest, dict)
            or reattest.get("schema") != REATTEST_SCHEMA
        ):
            return None
        artifacts = reattest.get("artifacts")
        expected_targets = artifact_targets(runtime_home, gem_root)
        if not isinstance(artifacts, dict) or set(artifacts) != set(expected_targets):
            return None
        for name, target in expected_targets.items():
            identity = artifacts.get(name)
            if not isinstance(identity, dict):
                return None
            expected_hash = identity.get("sourceSha256")
            if (
                identity.get("path") != str(target)
                or not isinstance(expected_hash, str)
                or not CANONICAL_SHA256.fullmatch(expected_hash)
                or sha256_file(target) != expected_hash
            ):
                return None
        workflow_text = workflow.read_text(encoding="utf-8")
        semantic_hash = receipt.get("workflow", {}).get("semanticSha256")
        if not isinstance(semantic_hash, str) or workflow_semantic_sha(workflow_text) != semantic_hash:
            return None
        _, installed_concurrency = read_current_target(workflow)
        build = reattest.get("runtimeBuild")
        runtime_binary = runtime_home / ".local/bin/symphony"
        if (
            not isinstance(build, dict)
            or build.get("path") != str(runtime_binary)
            or not isinstance(build.get("sha256"), str)
            or not CANONICAL_SHA256.fullmatch(build["sha256"])
            or sha256_file(runtime_binary) != build["sha256"]
        ):
            return None
        if provider_generation_identity(runtime_home) != reattest.get("providerGeneration"):
            return None
        listener = live_service_identity(runtime_home, proc_root, runtime_healthy)
        observed_at = utc_now(now_epoch)
        refreshed = json.loads(json.dumps(receipt))
        refreshed.update({"observedAt": observed_at, "active": True, "healthy": True, "listener": listener})
        refreshed["workflow"].update({
            "installedSha256": hashlib.sha256(workflow_text.encode("utf-8")).hexdigest(),
            "installedMaxConcurrentAgents": installed_concurrency,
            "matches": True,
            "matchMode": (
                "exact"
                if refreshed["workflow"].get("sourceSha256") == hashlib.sha256(workflow_text.encode("utf-8")).hexdigest()
                else "bounded_concurrency_overlay"
            ),
        })
        for name, target in expected_targets.items():
            refreshed["reattest"]["artifacts"][name]["installedSha256"] = sha256_file(target)
            refreshed["reattest"]["artifacts"][name]["matches"] = True
        for legacy in ("unit", "policy", "gate", "closureHealth", "concurrencyController", "concurrencyService", "concurrencyTimer"):
            refreshed[legacy] = refreshed["reattest"]["artifacts"][legacy]
        refreshed["reattest"]["lastVerifiedAt"] = observed_at
        if write:
            write_json_atomic(path, refreshed)
        return {"sourceRevision": revision, "observedAt": observed_at, "reattested": True}
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError):
        return None


def read_source_attestation(path: pathlib.Path, now_epoch: float) -> dict[str, Any] | None:
    """Bind a controller decision to the fresh official runtime source revision."""
    try:
        receipt = read_json(path)
        revision = receipt.get("sourceRevision")
        listener = receipt.get("listener")
        if (
            receipt.get("schema") != "gem-service-attestation/v1"
            or not isinstance(revision, str)
            or not CANONICAL_REVISION.fullmatch(revision)
            or not recent_timestamp(receipt.get("observedAt"), now_epoch)
            or receipt.get("active") is not True
            or receipt.get("healthy") is not True
            or not isinstance(listener, dict)
            or listener.get("port") != 4041
            or listener.get("boundToService") is not True
            or not isinstance(receipt.get("reattest"), dict)
            or receipt["reattest"].get("schema") != REATTEST_SCHEMA
            or receipt["reattest"].get("lastVerifiedAt") != receipt.get("observedAt")
        ):
            return None
        return {"sourceRevision": revision, "observedAt": receipt["observedAt"], "reattested": True}
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
    if downstream is not None:
        operational_health = downstream.get("operationalHealthy")
        if operational_health is False or (
            operational_health is None
            and (
                downstream.get("healthy") is not True
                or downstream.get("headroom", 0) <= 0
            )
        ):
            return MIN_CONCURRENCY, 0, "downstream-backpressure"
    if provider.get("capacityFailure") is True:
        return max(MIN_CONCURRENCY, current // 2), 0, "provider-capacity-failure"
    if pressure == "high":
        return max(MIN_CONCURRENCY, current - 1), 0, "measured-saturation"
    if downstream is None:
        return current, 0, "downstream-evidence-unavailable"
    if downstream.get("ownershipConflict") is True:
        return current, 0, "duplicate-issue-ownership-conflict"
    if downstream.get("healthy") is not True or downstream.get("headroom", 0) <= 0:
        return MIN_CONCURRENCY, 0, "downstream-backpressure"
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
    provenance = refresh_source_attestation(
        path=args.source_attestation,
        now_epoch=now_epoch,
        runtime_home=args.runtime_home,
        gem_root=args.gem_root,
        workflow=args.workflow,
        proc_root=args.proc_root,
        runtime_healthy=runtime is not None,
        write=not args.dry_run,
    )
    integrity_allowed, integrity_status = integrity_allows_scale(args.integrity_receipt)
    decision_allowed = integrity_allowed and provenance is not None
    decision_status = (
        integrity_status if provenance is not None else "source-attestation-unavailable"
    )
    target, low_streak, reason = choose_target(
        current=current,
        state=state,
        sample=sample,
        provider=provider,
        runtime=runtime,
        integrity_allowed=decision_allowed,
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
        "sourceRevision": provenance.get("sourceRevision") if provenance else None,
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
        "integrity": {"allowed": decision_allowed, "status": decision_status},
        "provenance": provenance,
    }
    if not args.dry_run:
        write_json_atomic(args.receipt, receipt, mode=0o644)
    return receipt


def parse_args() -> argparse.Namespace:
    home = pathlib.Path.home()
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--runtime-home", type=pathlib.Path, default=home)
    parser.add_argument("--gem-root", type=pathlib.Path, default=pathlib.Path("/home/timwhite/gem-workspace"))
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
    parser.add_argument("--source-attestation", type=pathlib.Path, default=home / "gem-workspace/state/gem-service-attestation.json")
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
    parser.add_argument(
        "--initialize-source-attestation",
        nargs=2,
        metavar=("SOURCE_ROOT", "SOURCE_REVISION"),
        help="seed exact installed identity after installer-owned runtime checks",
    )
    parser.add_argument("--initial-wrapper-pid", type=int)
    parser.add_argument("--initial-listener-pid", type=int)
    parser.add_argument("--initial-control-group")
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
        if args.initialize_source_attestation is not None:
            source_root, source_revision = args.initialize_source_attestation
            if (
                args.initial_wrapper_pid is None
                or args.initial_wrapper_pid <= 0
                or args.initial_listener_pid is None
                or args.initial_listener_pid <= 0
                or not isinstance(args.initial_control_group, str)
                or not args.initial_control_group.endswith("/symphony-elixir.service")
            ):
                raise ValueError("installer-proven service identity is required")
            receipt = initialize_source_attestation(
                source_root=pathlib.Path(source_root),
                source_revision=source_revision,
                runtime_home=args.runtime_home,
                gem_root=args.gem_root,
                workflow=args.workflow,
                destination=args.source_attestation,
                listener={
                    "port": 4041,
                    "pid": args.initial_listener_pid,
                    "wrapperPid": args.initial_wrapper_pid,
                    "controlGroup": args.initial_control_group,
                    "boundToService": True,
                },
                now_epoch=time.time(),
            )
            print(json.dumps(receipt, indent=2, sort_keys=True))
            return 0
        receipt = run(args)
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"schema": SCHEMA, "observedAt": utc_now(), "status": "error", "error": str(error)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
