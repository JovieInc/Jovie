#!/usr/bin/env python3
"""Bounded Gem disk and log reclaim for fixed runners and Symphony workspaces.

This command intentionally cleans only reproducible artifacts:
- idle GitHub runner _work contents under exact runner roots;
- node_modules, .next, .turbo, and coverage directories in inactive,
  provenance-owned Symphony workspaces.

It writes typed receipts for every run. Unsafe or unknown state preserves data
and records the reason instead of deleting.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


SCHEMA = "gem-disk-reclaim/v1"
DISK_CAPACITY_SCHEMA = "gem-disk-capacity/v1"
CONCURRENCY_SCHEMA = "gem-concurrency-evidence/v1"
ROUTING_SCHEMA = "symphony-routing/v1"
GIB = 1024**3
WORKSPACE_ARTIFACT_NAMES = frozenset({"node_modules", ".next", ".turbo", "coverage"})
RUNNER_ARTIFACT_NAMES = frozenset({"_actions", "_temp", "_tool", "_update"})
PROTECTED_DIR_NAMES = frozenset(
    {".git", ".codex", ".ssh", ".config", ".local", ".gnupg", "credentials", "secrets"}
)
WORKSPACE_METADATA_FILES = frozenset({".symphony-routing.json"})
ISSUE_IDENTIFIER = re.compile(r"^(?:JOV|LYB)-[0-9]+$")
GEM_WORKSPACE_ENV = "GEM_DISK_RECLAIM_GEM_WORKSPACE"
RECEIPT_ENV = "GEM_DISK_RECLAIM_RECEIPT"
DISK_RECEIPT_ENV = "GEM_DISK_RECLAIM_DISK_RECEIPT"
CAPACITY_RECEIPT_ENV = "GEM_DISK_RECLAIM_CAPACITY_RECEIPT"


class ReclaimTimeout(TimeoutError):
    """The whole reclaim cycle exceeded its deadline."""


class FailClosed(RuntimeError):
    """A path or state invariant failed before mutation."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json_atomic(path: pathlib.Path, value: dict[str, Any], mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def resolve_existing_or_parent(path: pathlib.Path) -> pathlib.Path:
    target = path.expanduser()
    if target.exists():
        return target.resolve()
    parent = target.parent
    while not parent.exists() and parent != parent.parent:
        parent = parent.parent
    return (parent.resolve() / target.relative_to(parent)).resolve()


def require_under(path: pathlib.Path, root: pathlib.Path) -> pathlib.Path:
    resolved = path.resolve()
    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as error:
        raise FailClosed(f"path outside allowed root: {resolved} not under {root_resolved}") from error
    return resolved


def deadline_remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ReclaimTimeout("gem disk reclaim timed out")
    return remaining


def run_process(
    args: list[str],
    cwd: pathlib.Path,
    deadline: float,
    timeout: float = 15.0,
) -> subprocess.CompletedProcess[str]:
    remaining = min(timeout, max(0.1, deadline_remaining(deadline)))
    return subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
        timeout=remaining,
    )


def directory_size(path: pathlib.Path, deadline: float) -> int:
    deadline_remaining(deadline)
    if path.is_symlink():
        raise FailClosed(f"refusing symlink candidate: {path}")
    if path.is_file():
        return path.lstat().st_size
    total = 0
    for root, dirs, files in os.walk(path, topdown=True, followlinks=False):
        deadline_remaining(deadline)
        root_path = pathlib.Path(root)
        retained_dirs = []
        for name in dirs:
            child = root_path / name
            if child.is_symlink():
                raise FailClosed(f"refusing symlink below candidate: {child}")
            if name in PROTECTED_DIR_NAMES:
                raise FailClosed(f"refusing protected directory below candidate: {child}")
            retained_dirs.append(name)
        dirs[:] = retained_dirs
        for name in files:
            child = root_path / name
            if child.is_symlink():
                raise FailClosed(f"refusing symlink below candidate: {child}")
            total += child.lstat().st_size
    return total


def remove_path(path: pathlib.Path, deadline: float) -> None:
    deadline_remaining(deadline)
    if path.is_symlink():
        raise FailClosed(f"refusing symlink candidate: {path}")
    if path.is_dir():
        shutil.rmtree(path)
        return
    path.unlink()


def parse_roots(values: list[str], env_value: str | None, defaults: list[pathlib.Path]) -> list[pathlib.Path]:
    raw: list[str] = []
    raw.extend(values)
    if env_value:
        raw.extend(item for item in env_value.split(":") if item)
    if not raw:
        return [path.expanduser() for path in defaults]
    return [pathlib.Path(value).expanduser() for value in raw]


def default_runner_roots(home: pathlib.Path) -> list[pathlib.Path]:
    return [
        home / "actions-runner",
        home / "actions-runner-1",
        home / "actions-runner-2",
        home / "actions-runner-3",
        home / "actions-runner-4",
        home / "actions-runner-5",
    ]


def read_ps(args: argparse.Namespace, deadline: float) -> str:
    if args.ps_fixture:
        return args.ps_fixture.read_text(encoding="utf-8")
    result = run_process(["ps", "-eo", "pid=,args="], pathlib.Path("/"), deadline, timeout=5)
    return result.stdout if result.returncode == 0 else ""


def runner_worker_active(ps_text: str) -> bool:
    return any("Runner.Worker" in line for line in ps_text.splitlines())


def cleanup_runners(args: argparse.Namespace, deadline: float) -> dict[str, Any]:
    ps_text = read_ps(args, deadline)
    active_worker = runner_worker_active(ps_text)
    roots = parse_roots(
        args.runner_root,
        os.environ.get("GEM_DISK_RECLAIM_RUNNER_ROOTS"),
        default_runner_roots(args.home),
    )
    root_reports: list[dict[str, Any]] = []
    observed = 0
    mutated = 0
    reclaimed = 0
    violations: list[str] = []

    for root in roots:
        deadline_remaining(deadline)
        resolved = root.resolve() if root.exists() else root
        report: dict[str, Any] = {"root": str(resolved), "status": "preserved", "candidates": []}
        if not root.exists():
            report["reason"] = "runner_root_missing"
            root_reports.append(report)
            continue
        if root.is_symlink():
            violations.append(f"refusing runner root symlink: {root}")
            report["status"] = "error"
            report["reason"] = "runner_root_symlink_refused"
            root_reports.append(report)
            continue
        if active_worker:
            report["reason"] = "runner_worker_active"
            root_reports.append(report)
            continue
        if not (root / ".runner").is_file() or not (root / "run.sh").is_file():
            report["reason"] = "unknown_runner_installation"
            root_reports.append(report)
            continue
        work = root / "_work"
        if not work.is_dir():
            report["reason"] = "runner_work_missing"
            root_reports.append(report)
            continue
        try:
            work_resolved = require_under(work, root)
        except FailClosed as error:
            violations.append(str(error))
            report["reason"] = "unexpected_runner_work_path"
            root_reports.append(report)
            continue
        candidates = []
        preserved = []
        for child in sorted(work_resolved.iterdir(), key=lambda item: item.name):
            if child.name not in RUNNER_ARTIFACT_NAMES:
                preserved.append(
                    {
                        "path": str(child.resolve()),
                        "relative": str(child.relative_to(work_resolved)),
                        "reason": "runner_work_child_not_allowlisted",
                    }
                )
                continue
            candidates.append(child)
        report["status"] = "ok"
        report["reason"] = "idle_runner"
        report["preserved"] = preserved
        for child in candidates:
            try:
                if child.is_symlink():
                    raise FailClosed(f"refusing runner _work symlink: {child}")
                candidate = require_under(child, work_resolved)
                if candidate == work_resolved:
                    raise FailClosed(f"refusing runner _work root deletion: {candidate}")
                size = directory_size(candidate, deadline)
                entry = {
                    "path": str(candidate),
                    "relative": str(candidate.relative_to(work_resolved)),
                    "bytes": size,
                    "mutated": False,
                }
                observed += 1
                if args.mode == "apply":
                    remove_path(candidate, deadline)
                    entry["mutated"] = True
                    mutated += 1
                    reclaimed += size
                report["candidates"].append(entry)
            except FailClosed as error:
                violations.append(str(error))
                report["status"] = "error"
                report["reason"] = "unexpected_runner_candidate_path"
                break
        root_reports.append(report)

    return {
        "activeRunnerWorker": active_worker,
        "roots": root_reports,
        "observed": observed,
        "mutated": mutated,
        "reclaimedBytes": reclaimed,
        "violations": violations,
    }


def routing_provenance(workspace: pathlib.Path, identifier: str) -> tuple[bool, dict[str, Any]]:
    path = workspace / ".symphony-routing.json"
    try:
        receipt = load_json(path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return False, {"path": str(path), "reason": f"routing_receipt_unavailable:{type(error).__name__}"}
    if receipt.get("schema") != ROUTING_SCHEMA or receipt.get("issue") != identifier:
        return False, {"path": str(path), "reason": "routing_receipt_mismatch"}
    fingerprint = receipt.get("fingerprint")
    if not isinstance(fingerprint, str) or re.fullmatch(r"[0-9a-f]{24}", fingerprint) is None:
        return False, {"path": str(path), "reason": "routing_receipt_missing_fingerprint"}
    return True, {
        "path": str(path),
        "schema": ROUTING_SCHEMA,
        "issue": identifier,
        "modelId": receipt.get("modelId"),
        "fingerprint": fingerprint,
    }


def status_path(line: str) -> str:
    value = line[3:] if len(line) >= 3 else ""
    if " -> " in value:
        value = value.rsplit(" -> ", 1)[1]
    return value.strip().rstrip("/")


def path_is_allowed_artifact(relative: str) -> bool:
    if relative in WORKSPACE_METADATA_FILES:
        return True
    parts = pathlib.PurePosixPath(relative).parts
    return any(part in WORKSPACE_ARTIFACT_NAMES for part in parts)


def workspace_git_state(workspace: pathlib.Path, deadline: float) -> dict[str, Any]:
    status = run_process(
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        workspace,
        deadline,
        timeout=15,
    )
    if status.returncode != 0:
        return {"valid": False, "reason": "workspace_status_unavailable"}
    dirty_source_paths = [
        status_path(line)
        for line in status.stdout.splitlines()
        if status_path(line) and not path_is_allowed_artifact(status_path(line))
    ]
    counts = run_process(
        ["git", "rev-list", "--left-right", "--count", "origin/main...HEAD"],
        workspace,
        deadline,
        timeout=15,
    )
    if counts.returncode != 0:
        return {
            "valid": False,
            "reason": "workspace_base_unavailable",
            "dirtySourcePaths": dirty_source_paths,
        }
    try:
        behind_raw, ahead_raw = counts.stdout.strip().split()
        behind = int(behind_raw)
        ahead = int(ahead_raw)
    except ValueError:
        return {
            "valid": False,
            "reason": "workspace_ahead_behind_malformed",
            "dirtySourcePaths": dirty_source_paths,
        }
    return {
        "valid": True,
        "dirty": bool(dirty_source_paths),
        "dirtySourcePaths": dirty_source_paths,
        "ahead": ahead,
        "behind": behind,
    }


def read_symphony_state(args: argparse.Namespace, deadline: float) -> dict[str, Any]:
    deadline_remaining(deadline)
    if args.symphony_state_file:
        value = load_json(args.symphony_state_file)
    else:
        timeout = min(5.0, max(0.1, deadline_remaining(deadline)))
        with urllib.request.urlopen(args.symphony_state_url, timeout=timeout) as response:  # noqa: S310 - loopback URL by default
            value = json.loads(response.read().decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Symphony state must be a JSON object")
    if not isinstance(value.get("running"), list) or not isinstance(value.get("retrying"), list):
        raise ValueError("Symphony state must contain running and retrying lists")
    return value


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def state_values(item: object) -> tuple[set[str], set[str]]:
    identifiers: set[str] = set()
    paths: set[str] = set()
    if not isinstance(item, dict):
        return identifiers, paths
    nested = []
    for key in ("running", "retry", "workspace", "issue"):
        if isinstance(item.get(key), dict):
            nested.append(item[key])
    for source in [item, *nested]:
        for key in ("issue_identifier", "identifier", "id"):
            value = _text(source.get(key))
            if value:
                identifiers.add(value)
        for key in ("workspace_path", "workspace", "cwd", "path"):
            value = _text(source.get(key))
            if value:
                paths.add(str(pathlib.Path(value).expanduser().resolve()))
    return identifiers, paths


def workspace_active(state: dict[str, Any], workspace: pathlib.Path, identifier: str) -> bool:
    workspace_path = str(workspace.resolve())
    for bucket in ("running", "retrying"):
        for item in state.get(bucket, []):
            identifiers, paths = state_values(item)
            if identifier in identifiers or workspace_path in paths:
                return True
    return False


def discover_workspace_candidates(
    workspace: pathlib.Path,
    workspace_root: pathlib.Path,
    deadline: float,
) -> tuple[list[pathlib.Path], list[str]]:
    candidates: list[pathlib.Path] = []
    violations: list[str] = []
    for raw_root, dirs, _files in os.walk(workspace, topdown=True, followlinks=False):
        deadline_remaining(deadline)
        root = pathlib.Path(raw_root)
        kept: list[str] = []
        for name in dirs:
            child = root / name
            if name in PROTECTED_DIR_NAMES:
                continue
            if name in WORKSPACE_ARTIFACT_NAMES:
                try:
                    if child.is_symlink():
                        raise FailClosed(f"refusing workspace artifact symlink: {child}")
                    candidate = require_under(child, workspace_root)
                    require_under(candidate, workspace)
                    candidates.append(candidate)
                except FailClosed as error:
                    violations.append(str(error))
                continue
            if child.is_symlink():
                continue
            kept.append(name)
        dirs[:] = kept
    return candidates, violations


def cleanup_workspaces(args: argparse.Namespace, deadline: float) -> dict[str, Any]:
    roots = parse_roots(
        args.workspace_root,
        os.environ.get("GEM_DISK_RECLAIM_WORKSPACE_ROOTS"),
        [args.home / "symphony-workspaces"],
    )
    root_reports: list[dict[str, Any]] = []
    observed = 0
    mutated = 0
    reclaimed = 0
    violations: list[str] = []

    for root in roots:
        deadline_remaining(deadline)
        resolved_root = root.resolve() if root.exists() else root
        root_report: dict[str, Any] = {"root": str(resolved_root), "workspaces": []}
        if not root.exists():
            root_report["status"] = "preserved"
            root_report["reason"] = "workspace_root_missing"
            root_reports.append(root_report)
            continue
        if root.is_symlink():
            violations.append(f"refusing workspace root symlink: {root}")
            root_report["status"] = "error"
            root_report["reason"] = "workspace_root_symlink_refused"
            root_reports.append(root_report)
            continue
        workspace_root = root.resolve()
        for workspace in sorted(workspace_root.iterdir(), key=lambda item: item.name):
            deadline_remaining(deadline)
            identifier = workspace.name
            report: dict[str, Any] = {
                "workspace": str(workspace.resolve()),
                "identifier": identifier,
                "status": "preserved",
                "candidates": [],
            }
            if workspace.is_symlink():
                violations.append(f"refusing workspace symlink: {workspace}")
                report["status"] = "error"
                report["reason"] = "workspace_symlink_refused"
                root_report["workspaces"].append(report)
                continue
            if not workspace.is_dir():
                continue
            if not ISSUE_IDENTIFIER.fullmatch(identifier):
                report["reason"] = "unknown_workspace_ownership"
                root_report["workspaces"].append(report)
                continue
            if not (workspace / ".git").exists():
                report["reason"] = "workspace_not_git"
                root_report["workspaces"].append(report)
                continue
            provenance_ok, provenance = routing_provenance(workspace, identifier)
            report["provenance"] = provenance
            if not provenance_ok:
                report["reason"] = "workspace_provenance_unverified"
                root_report["workspaces"].append(report)
                continue
            git_state = workspace_git_state(workspace, deadline)
            report["git"] = git_state
            if not git_state.get("valid"):
                report["reason"] = git_state.get("reason", "workspace_git_state_unavailable")
                root_report["workspaces"].append(report)
                continue
            if git_state.get("dirty"):
                report["reason"] = "workspace_dirty"
                root_report["workspaces"].append(report)
                continue
            if git_state.get("ahead", 0) > 0:
                report["reason"] = "workspace_has_unpublished_commits"
                root_report["workspaces"].append(report)
                continue
            candidates, candidate_violations = discover_workspace_candidates(
                workspace,
                workspace_root,
                deadline,
            )
            if candidate_violations:
                violations.extend(candidate_violations)
                report["status"] = "error"
                report["reason"] = "unexpected_workspace_candidate_path"
                root_report["workspaces"].append(report)
                continue
            try:
                state = read_symphony_state(args, deadline)
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
                report["reason"] = f"symphony_state_unavailable:{type(error).__name__}"
                root_report["workspaces"].append(report)
                continue
            if workspace_active(state, workspace, identifier):
                report["reason"] = "workspace_active_in_symphony_state"
                root_report["workspaces"].append(report)
                continue
            report["status"] = "ok"
            report["reason"] = "inactive_provenance_owned_workspace"
            for candidate in candidates:
                try:
                    size = directory_size(candidate, deadline)
                    entry = {
                        "path": str(candidate),
                        "relative": str(candidate.relative_to(workspace)),
                        "bytes": size,
                        "mutated": False,
                    }
                    observed += 1
                    if args.mode == "apply":
                        remove_path(candidate, deadline)
                        entry["mutated"] = True
                        mutated += 1
                        reclaimed += size
                    report["candidates"].append(entry)
                except FailClosed as error:
                    violations.append(str(error))
                    report["status"] = "error"
                    report["reason"] = "unexpected_workspace_candidate_path"
                    break
            root_report["workspaces"].append(report)
        root_report["status"] = "ok"
        root_reports.append(root_report)

    return {
        "roots": root_reports,
        "observed": observed,
        "mutated": mutated,
        "reclaimedBytes": reclaimed,
        "violations": violations,
    }


def compact_repeated_lines(source: pathlib.Path, target: pathlib.Path) -> tuple[int, int]:
    input_lines = 0
    emitted_lines = 0
    with source.open("rb") as raw, gzip.open(target, "wb") as out:
        previous: bytes | None = None
        repeats = 0

        def flush() -> None:
            nonlocal previous, repeats, emitted_lines
            if previous is None:
                return
            out.write(previous)
            emitted_lines += 1
            if repeats:
                out.write(f"# gem-disk-reclaim repeated previous line {repeats} time(s)\n".encode("utf-8"))
                emitted_lines += 1
            previous = None
            repeats = 0

        for line in raw:
            input_lines += 1
            if previous == line:
                repeats += 1
                continue
            flush()
            previous = line
        flush()
    return input_lines, emitted_lines


def rotate_log(args: argparse.Namespace, deadline: float) -> dict[str, Any]:
    log = args.log_path
    report: dict[str, Any] = {
        "path": str(log),
        "maxBytes": args.log_max_bytes,
        "retention": args.log_retention,
        "rotated": False,
        "removedArchives": [],
    }
    if not log.exists():
        report["reason"] = "log_missing"
        return report
    size = log.stat().st_size
    report["bytesBefore"] = size
    if size <= args.log_max_bytes:
        report["reason"] = "below_threshold"
        return report
    report["reason"] = "above_threshold"
    if args.mode != "apply":
        return report
    deadline_remaining(deadline)
    for index in range(args.log_retention, 0, -1):
        archive = log.with_name(f"{log.name}.{index}.gz")
        if index == args.log_retention and archive.exists():
            archive.unlink()
            report["removedArchives"].append(str(archive))
        previous = log.with_name(f"{log.name}.{index - 1}.gz")
        if previous.exists():
            previous.replace(archive)
    first = log.with_name(f"{log.name}.1.gz")
    temporary = log.with_name(f".{log.name}.1.gz.tmp.{os.getpid()}")
    input_lines, emitted_lines = compact_repeated_lines(log, temporary)
    os.replace(temporary, first)
    with log.open("r+b") as handle:
        handle.truncate(0)
    report.update(
        {
            "rotated": True,
            "archive": str(first),
            "bytesAfter": log.stat().st_size,
            "inputLines": input_lines,
            "emittedLines": emitted_lines,
        }
    )
    return report


def load_disk_fixture(path: pathlib.Path | None) -> dict[str, dict[str, int]]:
    if path is None:
        return {}
    raw = load_json(path)
    fixture: dict[str, dict[str, int]] = {}
    for key, value in raw.items():
        if not isinstance(value, dict):
            continue
        total = int(value.get("total", 0))
        used = int(value.get("used", 0))
        free = int(value.get("free", 0))
        fixture[str(pathlib.Path(key).expanduser().resolve())] = {
            "total": total,
            "used": used,
            "free": free,
        }
    return fixture


def disk_usage_for(path: pathlib.Path, fixture: dict[str, dict[str, int]]) -> dict[str, int]:
    resolved = resolve_existing_or_parent(path)
    matches = []
    for raw_root, usage in fixture.items():
        root = pathlib.Path(raw_root)
        try:
            resolved.relative_to(root)
            matches.append((len(root.parts), usage))
        except ValueError:
            continue
    if matches:
        return dict(max(matches, key=lambda item: item[0])[1])
    usage = shutil.disk_usage(resolved if resolved.exists() else resolved.parent)
    return {"total": usage.total, "used": usage.used, "free": usage.free}


def disk_observations(args: argparse.Namespace, fixture: dict[str, dict[str, int]]) -> dict[str, Any]:
    paths = [
        args.gem_workspace,
        args.log_path.parent,
        args.receipt.parent,
        *parse_roots(args.workspace_root, os.environ.get("GEM_DISK_RECLAIM_WORKSPACE_ROOTS"), [args.home / "symphony-workspaces"]),
        *parse_roots(args.runner_root, os.environ.get("GEM_DISK_RECLAIM_RUNNER_ROOTS"), default_runner_roots(args.home)),
    ]
    observations = []
    for path in paths:
        usage = disk_usage_for(path, fixture)
        observations.append({"path": str(resolve_existing_or_parent(path)), **usage})
    worst_free = min((item["free"] for item in observations), default=None)
    status = "unknown"
    if worst_free is not None:
        status = "critical" if worst_free < args.min_free_bytes else "warning" if worst_free < args.warning_free_bytes else "ok"
    return {
        "schema": DISK_CAPACITY_SCHEMA,
        "observedAt": utc_now(),
        "status": status,
        "minFreeBytes": args.min_free_bytes,
        "warningFreeBytes": args.warning_free_bytes,
        "worstFreeBytes": worst_free,
        "observations": observations,
    }


def maybe_write_concurrency_stop(args: argparse.Namespace, disk: dict[str, Any]) -> dict[str, Any]:
    if args.mode != "apply":
        return {"written": False, "reason": "dry_run"}
    status = disk.get("status")
    if status == "critical":
        receipt = {
            "schema": CONCURRENCY_SCHEMA,
            "observedAt": utc_now(),
            "target": 0,
            "approved": False,
            "cleanRuns": 0,
            "severeIncidents": 1,
            "accepted": False,
            "reason": "disk-free-critical",
            "source": "gem-disk-reclaim",
            "disk": disk,
        }
        write_json_atomic(args.capacity_receipt, receipt)
        return {"written": True, "path": str(args.capacity_receipt), "reason": "disk-free-critical"}
    try:
        existing = load_json(args.capacity_receipt)
    except (OSError, ValueError, json.JSONDecodeError):
        return {"written": False, "reason": "no_owned_critical_receipt"}
    if existing.get("source") != "gem-disk-reclaim" or existing.get("reason") != "disk-free-critical":
        return {"written": False, "reason": "capacity_receipt_not_owned"}
    receipt = {
        "schema": CONCURRENCY_SCHEMA,
        "observedAt": utc_now(),
        "target": 1,
        "approved": True,
        "cleanRuns": 1,
        "severeIncidents": 0,
        "accepted": True,
        "reason": "disk-free-recovered",
        "source": "gem-disk-reclaim",
        "disk": disk,
    }
    write_json_atomic(args.capacity_receipt, receipt)
    return {"written": True, "path": str(args.capacity_receipt), "reason": "disk-free-recovered"}


def run(args: argparse.Namespace) -> dict[str, Any]:
    deadline = time.monotonic() + args.timeout_seconds
    before_fixture = load_disk_fixture(args.disk_fixture)
    disk_before = disk_observations(args, before_fixture)
    log_report = rotate_log(args, deadline)
    runners = cleanup_runners(args, deadline)
    workspaces = cleanup_workspaces(args, deadline)
    disk_after = disk_observations(args, before_fixture)
    write_json_atomic(args.disk_receipt, disk_after)
    intake = maybe_write_concurrency_stop(args, disk_after)
    violations = [*runners["violations"], *workspaces["violations"]]
    status = "error" if violations else "critical" if disk_after["status"] == "critical" else "warning" if disk_after["status"] == "warning" else "ok"
    receipt = {
        "schema": SCHEMA,
        "observedAt": utc_now(),
        "mode": args.mode,
        "status": status,
        "bounded": {
            "timeoutSeconds": args.timeout_seconds,
            "workspaceArtifactNames": sorted(WORKSPACE_ARTIFACT_NAMES),
            "runnerArtifactNames": sorted(RUNNER_ARTIFACT_NAMES),
            "workspaceMetadataFiles": sorted(WORKSPACE_METADATA_FILES),
            "protectedDirNames": sorted(PROTECTED_DIR_NAMES),
            "logMaxBytes": args.log_max_bytes,
            "logRetention": args.log_retention,
        },
        "diskBefore": disk_before,
        "diskAfter": disk_after,
        "intake": intake,
        "logs": log_report,
        "runners": runners,
        "workspaces": workspaces,
        "summary": {
            "observed": runners["observed"] + workspaces["observed"],
            "mutated": runners["mutated"] + workspaces["mutated"],
            "reclaimedBytes": runners["reclaimedBytes"] + workspaces["reclaimedBytes"],
            "violations": violations,
        },
    }
    write_json_atomic(args.receipt, receipt)
    return receipt


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be non-negative")
    return parsed


def default_path_from_env(name: str, fallback: pathlib.Path) -> pathlib.Path:
    return pathlib.Path(os.environ.get(name, str(fallback))).expanduser()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    pre_parser = argparse.ArgumentParser(add_help=False)
    pre_parser.add_argument("--home", type=pathlib.Path, default=pathlib.Path.home())
    pre_args, _ = pre_parser.parse_known_args(argv)
    home = pre_args.home.expanduser()
    gem_workspace = default_path_from_env(GEM_WORKSPACE_ENV, home / "gem-workspace")
    receipt_root = gem_workspace / "state/gem-disk-reclaim"
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", dest="mode", action="store_const", const="dry-run")
    mode.add_argument("--apply", dest="mode", action="store_const", const="apply")
    parser.set_defaults(mode="dry-run")
    parser.add_argument("--timeout-seconds", type=float, default=600.0)
    parser.add_argument("--home", type=pathlib.Path, default=home)
    parser.add_argument("--gem-workspace", type=pathlib.Path, default=gem_workspace)
    parser.add_argument("--workspace-root", action="append", default=[])
    parser.add_argument("--runner-root", action="append", default=[])
    parser.add_argument("--symphony-state-url", default="http://127.0.0.1:4041/api/v1/state")
    parser.add_argument("--symphony-state-file", type=pathlib.Path)
    parser.add_argument("--ps-fixture", type=pathlib.Path)
    parser.add_argument("--disk-fixture", type=pathlib.Path)
    parser.add_argument("--receipt", type=pathlib.Path, default=default_path_from_env(RECEIPT_ENV, receipt_root / "latest.json"))
    parser.add_argument(
        "--disk-receipt",
        type=pathlib.Path,
        default=default_path_from_env(DISK_RECEIPT_ENV, receipt_root / "capacity.json"),
    )
    parser.add_argument(
        "--capacity-receipt",
        type=pathlib.Path,
        default=default_path_from_env(CAPACITY_RECEIPT_ENV, gem_workspace / "state/concurrency.json"),
    )
    parser.add_argument("--log-path", type=pathlib.Path, default=home / "symphony-ui-pilot-logs/stdout.log")
    parser.add_argument("--log-max-bytes", type=positive_int, default=64 * 1024 * 1024)
    parser.add_argument("--log-retention", type=positive_int, default=5)
    parser.add_argument("--min-free-bytes", type=positive_int, default=25 * GIB)
    parser.add_argument("--warning-free-bytes", type=positive_int, default=40 * GIB)
    args = parser.parse_args(argv)
    args.home = args.home.expanduser()
    args.gem_workspace = args.gem_workspace.expanduser()
    args.receipt = args.receipt.expanduser()
    args.disk_receipt = args.disk_receipt.expanduser()
    args.capacity_receipt = args.capacity_receipt.expanduser()
    args.log_path = args.log_path.expanduser()
    if args.log_retention < 1:
        parser.error("--log-retention must be at least 1")
    if args.timeout_seconds < 0:
        parser.error("--timeout-seconds must be non-negative")
    if args.warning_free_bytes < args.min_free_bytes:
        parser.error("--warning-free-bytes must be >= --min-free-bytes")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        receipt = run(args)
    except ReclaimTimeout as error:
        receipt = {
            "schema": SCHEMA,
            "observedAt": utc_now(),
            "mode": args.mode,
            "status": "timeout",
            "error": str(error),
            "bounded": {"timeoutSeconds": args.timeout_seconds},
        }
        write_json_atomic(args.receipt, receipt)
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError, FailClosed) as error:
        receipt = {
            "schema": SCHEMA,
            "observedAt": utc_now(),
            "mode": args.mode,
            "status": "error",
            "error": f"{type(error).__name__}:{error}",
            "bounded": {"timeoutSeconds": args.timeout_seconds},
        }
        write_json_atomic(args.receipt, receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    if receipt.get("status") in {"ok", "warning"}:
        if receipt.get("status") == "warning":
            print("ALERT gem-disk-reclaim disk-free-warning", file=sys.stderr)
        return 0
    print(f"ALERT gem-disk-reclaim {receipt.get('status')}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
