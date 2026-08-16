#!/usr/bin/env python3
"""Durably reconcile Symphony failures without taking merge ownership.

The sidecar observes Symphony's local state API, records an exact workspace
head/base receipt for every stopped attempt, and escalates repeated failures to
the canonical remediation route only when that route selects a local model.
The alternate model may repair the isolated workspace, but may not commit,
push, merge, or change tracker state. Symphony remains the owner of the normal
update/test/ready/native-merge lifecycle on its next bounded retry.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import shlex
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request


SCHEMA = "symphony-reconciliation-receipt/v1"
DEFAULT_API = "http://127.0.0.1:4041/api/v1/state"
DEFAULT_WORKSPACES = "~/symphony-workspaces"
DEFAULT_STATE = "~/.local/state/symphony-reconciler"
MODEL_ID = "qwen-coder-local"
MODEL_TIMEOUT_SECONDS = 12 * 60
RETRY_MINUTES = 15
SYMPHONY_SERVICE = "symphony-ui-pilot.service"


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def _model_timeout_seconds() -> float:
    try:
        value = float(os.environ.get("SYMPHONY_ALTERNATE_TIMEOUT_SECONDS", MODEL_TIMEOUT_SECONDS))
    except (TypeError, ValueError):
        return float(MODEL_TIMEOUT_SECONDS)
    return min(max(value, 1.0), float(MODEL_TIMEOUT_SECONDS))


def _iso(value: dt.datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _parse_time(value: object) -> dt.datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _state_root() -> pathlib.Path:
    return pathlib.Path(os.path.expanduser(os.environ.get("SYMPHONY_RECONCILER_STATE", DEFAULT_STATE)))


def _workspace_root() -> pathlib.Path:
    return pathlib.Path(os.path.expanduser(os.environ.get("SYMPHONY_WORKSPACE_ROOT", DEFAULT_WORKSPACES))).resolve()


def _event(issue: str, transition: str, **fields: object) -> None:
    values = {
        "at": _iso(_now()),
        "issue": issue,
        "transition": transition,
        **fields,
    }
    rendered = " ".join(f"{key}={shlex.quote(str(value))}" for key, value in values.items())
    print(f"SYMPHONY_RECONCILER {rendered}", flush=True)


def _captured(command: list[str], cwd: pathlib.Path, timeout: int = 10) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _systemctl(action: str) -> subprocess.CompletedProcess[str] | None:
    executable = os.environ.get("SYMPHONY_SYSTEMCTL", "systemctl")
    try:
        return subprocess.run(
            [executable, "--user", action, SYMPHONY_SERVICE],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def _stop_scheduler() -> bool:
    stopped = _systemctl("stop")
    active = _systemctl("is-active")
    return stopped is not None and stopped.returncode == 0 and active is not None and active.returncode != 0


def _start_scheduler() -> bool:
    started = _systemctl("start")
    active = _systemctl("is-active")
    return started is not None and started.returncode == 0 and active is not None and active.returncode == 0


def _git(workspace: pathlib.Path, *args: str) -> str | None:
    try:
        result = _captured(["git", *args], workspace)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def _workspace_state(raw_path: object, identifier: str) -> dict[str, object]:
    root = _workspace_root()
    path = pathlib.Path(str(raw_path or root / identifier)).resolve()
    if path.parent != root or path.name != identifier or not (path / ".git").exists():
        return {
            "workspace": str(path),
            "valid": False,
            "reason": "workspace_outside_root_or_not_git",
            "head": None,
            "baseRef": "origin/main",
            "base": None,
        }

    head = _git(path, "rev-parse", "HEAD")
    base = _git(path, "rev-parse", "origin/main")
    merge_base = _git(path, "merge-base", "HEAD", "origin/main") if head and base else None
    branch = _git(path, "branch", "--show-current")
    status = _git(path, "status", "--porcelain=v1")
    conflicts = _git(path, "diff", "--name-only", "--diff-filter=U")
    counts = _git(path, "rev-list", "--left-right", "--count", "origin/main...HEAD") if head and base else None
    behind = ahead = None
    if counts:
        parts = counts.split()
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            behind, ahead = (int(parts[0]), int(parts[1]))
    return {
        "workspace": str(path),
        "valid": bool(head and base),
        "reason": "exact_git_state" if head and base else "head_or_base_unavailable",
        "branch": branch,
        "head": head,
        "baseRef": "origin/main",
        "base": base,
        "mergeBase": merge_base,
        "ahead": ahead,
        "behind": behind,
        "dirty": bool(status),
        "conflictedPaths": conflicts.splitlines() if conflicts else [],
    }


def _generation(identifier: str, error: str, state: dict[str, object]) -> str:
    raw = json.dumps(
        {
            "issue": identifier,
            "error": error,
            "head": state.get("head"),
            "base": state.get("base"),
            "conflicts": state.get("conflictedPaths"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _is_repeated_or_conflict(item: dict[str, object], source: str, state: dict[str, object]) -> bool:
    try:
        attempt = int(item.get("attempt") or 0)
    except (TypeError, ValueError):
        attempt = 0
    error = str(item.get("error") or "").lower()
    return (
        attempt >= 2
        or source == "blocked"
        or bool(state.get("conflictedPaths"))
        or any(word in error for word in ("conflict", "unmergeable", "rebase"))
    )


def _alternate_due(item: dict[str, object], source: str) -> bool:
    identifier = str(item.get("issue_identifier", ""))
    if not identifier:
        return False
    state = _workspace_state(item.get("workspace_path"), identifier)
    if not state.get("valid") or not _is_repeated_or_conflict(item, source, state):
        return False
    generation = _generation(identifier, str(item.get("error") or f"runtime_{source}"), state)
    previous = _read_receipt(identifier)
    if not previous or previous.get("generation") != generation:
        return True
    retry = _parse_time(previous.get("nextRetryAt"))
    return retry is None or retry <= _now()


def _receipt_path(identifier: str) -> pathlib.Path:
    return _state_root() / "receipts" / f"{identifier}.json"


def _read_receipt(identifier: str) -> dict[str, object] | None:
    try:
        payload = json.loads(_receipt_path(identifier).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) and payload.get("schema") == SCHEMA else None


def _write_receipt(identifier: str, payload: dict[str, object]) -> None:
    path = _receipt_path(identifier)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{identifier}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def _router_selection() -> tuple[dict[str, object] | None, str]:
    root = pathlib.Path(__file__).resolve().parent
    router = pathlib.Path(os.path.expanduser(os.environ.get("SYMPHONY_MODEL_ROUTER", str(root / "model-router.py"))))
    registry = pathlib.Path(
        os.path.expanduser(os.environ.get("SYMPHONY_MODEL_REGISTRY", str(root / "config" / "model-registry.json")))
    )
    if not registry.is_file():
        registry = root / ".symphony-codex-auth-fallback" / "current" / "model-registry.json"
    if not router.is_file() or not registry.is_file():
        return None, "router_bundle_unavailable"
    try:
        router_command = [sys.executable, str(router)] if router.read_bytes().startswith(b"#!/usr/bin/env python") else [str(router)]
    except OSError:
        return None, "router_bundle_unavailable"
    if router_command[0] == str(router) and not os.access(router, os.X_OK):
        return None, "router_not_executable"
    env = os.environ.copy()
    env["GEM_MODEL_REGISTRY"] = str(registry)
    try:
        result = subprocess.run(
            [*router_command, "choose", "--workflow", "remediation", "--capability", "code"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )
        payload = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
        return None, "router_unavailable"
    selected = payload.get("selected") if isinstance(payload, dict) else None
    if not isinstance(selected, dict):
        return None, "no_remediation_model_ready"
    if selected.get("id") != MODEL_ID or selected.get("provider") != "ollama":
        return None, f"local_model_unavailable_selected_{selected.get('id', 'unknown')}"
    executor = selected.get("executor")
    if not isinstance(executor, dict) or not isinstance(executor.get("executable"), str):
        return None, "local_model_executor_invalid"
    argv = executor.get("argv")
    if not isinstance(argv, list) or not all(isinstance(value, str) for value in argv):
        return None, "local_model_argv_invalid"
    return selected, "local_model_ready"


def _alternate_repair(
    identifier: str,
    error: str,
    state: dict[str, object],
) -> tuple[dict[str, object], dict[str, object]]:
    selected, selection_reason = _router_selection()
    result: dict[str, object] = {
        "kind": "alternate_local_model",
        "model": MODEL_ID,
        "selection": selection_reason,
        "startedAt": _iso(_now()),
    }
    if selected is None:
        result.update({"result": "not_started", "reason": selection_reason})
        return result, state

    workspace = pathlib.Path(str(state["workspace"]))
    prompt = f"""You are the alternate local repair model for one stopped Symphony workspace.
Issue: {identifier}
Exact current head: {state.get('head')}
Exact current base origin/main: {state.get('base')}
Branch: {state.get('branch')}
Failure: {error}

Work only in the current workspace. Diagnose this exact failure, make the smallest safe source repair if one is possible, and run only focused deterministic checks. Do not commit, push, merge, create or edit a PR, change Linear, alter credentials, or touch another workspace. Do not weaken checks. Leave any repair in the workspace for the normal Symphony model to review and continue through update/test/ready/native-merge. End with a concise plain-text result and the checks run.
"""
    executor = selected["executor"]
    executable = str(executor["executable"])
    argv = [value.format(model=selected["model"], prompt=prompt) for value in executor["argv"]]
    try:
        completed = subprocess.run(
            [executable, *argv],
            cwd=workspace,
            check=False,
            capture_output=True,
            text=True,
            timeout=_model_timeout_seconds(),
        )
        summary = (completed.stdout or completed.stderr).strip()[-4000:]
        result.update(
            {
                "finishedAt": _iso(_now()),
                "exitCode": completed.returncode,
                "result": "repair_handoff_ready" if completed.returncode == 0 else "repair_failed",
                "summary": summary,
            }
        )
    except subprocess.TimeoutExpired:
        result.update({"finishedAt": _iso(_now()), "result": "repair_timed_out"})
    except OSError as exc:
        result.update({"finishedAt": _iso(_now()), "result": "repair_not_started", "reason": type(exc).__name__})
    return result, _workspace_state(workspace, identifier)


def _fetch_state() -> dict[str, object]:
    url = os.environ.get("SYMPHONY_STATE_URL", DEFAULT_API)
    with urllib.request.urlopen(url, timeout=10) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError("state payload is not an object")
    return payload


def _reconcile_item(item: dict[str, object], source: str, alternate_permitted: bool) -> None:
    identifier = str(item.get("issue_identifier", ""))
    if not identifier or not identifier.replace("-", "").isalnum():
        _event("unknown", "invalid_runtime_item", reason="invalid_identifier")
        return
    error = str(item.get("error") or f"runtime_{source}")
    try:
        attempt = int(item.get("attempt") or 0)
    except (TypeError, ValueError):
        attempt = 0
    state_before = _workspace_state(item.get("workspace_path"), identifier)
    generation = _generation(identifier, error, state_before)
    previous = _read_receipt(identifier)
    next_retry = _parse_time(item.get("due_at")) or (_now() + dt.timedelta(minutes=RETRY_MINUTES))
    repeated = _is_repeated_or_conflict(item, source, state_before)
    attempted: list[dict[str, object]] = [
        {
            "kind": "normal_model_bounded_retry",
            "attempt": attempt,
            "result": "failed" if repeated else "scheduled",
            "runtimeError": error,
        }
    ]
    alternate: dict[str, object] = {
        "nominatedModel": MODEL_ID,
        "path": "model-router:remediation/code:local-only",
        "status": "not_due",
    }
    transition = "normal_retry_scheduled"
    next_action = "normal_model_retry"
    state_after = state_before

    already_attempted = bool(previous and previous.get("generation") == generation and previous.get("alternateModel", {}).get("status") in {"repair_handoff_ready", "repair_failed", "repair_timed_out", "repair_not_started"})
    previous_retry = _parse_time(previous.get("nextRetryAt")) if previous else None
    escalation_due = not already_attempted or (previous_retry is not None and previous_retry <= _now())
    if repeated:
        attempted.append(
            {
                "kind": "scheduler_ownership_handoff",
                "owner": "symphony-reconciler",
                "result": "acquired" if alternate_permitted else "not_acquired",
            }
        )
        if escalation_due and state_before.get("valid") and alternate_permitted:
            transition = "alternate_local_repair_started"
            _event(
                identifier,
                transition,
                reason=error,
                head=state_before.get("head"),
                base=state_before.get("base"),
                attempt=attempt,
            )
            repair, state_after = _alternate_repair(identifier, error, state_before)
            attempted.append(repair)
            alternate.update(
                {
                    "status": repair.get("result"),
                    "selection": repair.get("selection"),
                    "summary": repair.get("summary"),
                }
            )
            if repair.get("result") == "repair_handoff_ready":
                transition = "returned_to_normal_loop"
                next_action = "normal_model_update_test_ready_native_merge"
                next_retry = _now() + dt.timedelta(minutes=RETRY_MINUTES)
            else:
                transition = "alternate_local_repair_deferred"
                next_action = "retry_alternate_local_model"
                next_retry = _now() + dt.timedelta(minutes=RETRY_MINUTES)
        elif not state_before.get("valid"):
            transition = "durable_escalation_blocked"
            next_action = "retry_exact_workspace_observation"
            next_retry = _now() + dt.timedelta(minutes=RETRY_MINUTES)
            alternate["status"] = "workspace_state_invalid"
        elif not alternate_permitted:
            transition = "alternate_local_repair_waiting"
            next_action = "retry_scheduler_handoff_then_alternate_local_model"
            if previous and previous.get("generation") == generation and previous_retry and previous_retry > _now():
                next_retry = previous_retry
            else:
                next_retry = _now() + dt.timedelta(minutes=RETRY_MINUTES)
            alternate["status"] = "scheduler_handoff_waiting"
        else:
            transition = "alternate_local_repair_waiting"
            next_action = "retry_alternate_local_model"

    receipt: dict[str, object] = {
        "schema": SCHEMA,
        "updatedAt": _iso(_now()),
        "generation": generation,
        "issue": {
            "identifier": identifier,
            "id": item.get("issue_id"),
            "url": item.get("issue_url"),
        },
        "reason": error,
        "entryCriteria": "runtime retry/blocked after bounded normal-model attempt",
        "authoritativeOwner": "symphony-reconciler" if alternate_permitted else "symphony-ui-pilot",
        "resourceScope": {
            "issue": identifier,
            "workspace": state_after.get("workspace"),
            "head": state_after.get("head"),
            "base": state_after.get("base"),
        },
        "deadline": _iso(_now() + dt.timedelta(seconds=_model_timeout_seconds())) if alternate_permitted else _iso(next_retry),
        "runtimeState": source,
        "attempt": attempt,
        "headBaseBefore": state_before,
        "headBaseCurrent": state_after,
        "attemptedRepairs": attempted,
        "transition": transition,
        "nextAutomatedAction": next_action,
        "nextRetryAt": _iso(next_retry),
        "alternateModel": alternate,
    }
    _write_receipt(identifier, receipt)
    _event(
        identifier,
        transition,
        reason=error,
        head=state_after.get("head"),
        base=state_after.get("base"),
        next=next_action,
        retry_at=_iso(next_retry),
        alternate=alternate.get("status"),
    )


def main() -> int:
    try:
        state = _fetch_state()
    except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError) as exc:
        _event("control-plane", "observation_failed", reason=type(exc).__name__, next="retry_timer")
        return 2

    items = []
    for source in ("retrying", "blocked"):
        values = state.get(source, [])
        if isinstance(values, list):
            items.extend((source, value) for value in values if isinstance(value, dict))
    if not items:
        _event("control-plane", "healthy_or_idle", reason="no_stopped_work")
        return 0
    running = state.get("running", [])
    candidates = [(source, item) for source, item in items if _alternate_due(item, source)]
    handoff_acquired = False
    if candidates and isinstance(running, list) and not running:
        handoff_acquired = _stop_scheduler()
        _event(
            "control-plane",
            "alternate_owner_acquired" if handoff_acquired else "alternate_owner_deferred",
            reason="scheduler_stopped" if handoff_acquired else "scheduler_stop_unproven",
            next="bounded_local_repair" if handoff_acquired else "retry_timer",
        )

    alternate_used = False
    try:
        for source, item in items:
            permitted = handoff_acquired and not alternate_used and (source, item) in candidates
            _reconcile_item(item, source, permitted)
            alternate_used = alternate_used or permitted
    finally:
        if handoff_acquired:
            if not _start_scheduler():
                _event(
                    "control-plane",
                    "scheduler_restore_failed",
                    reason="service_not_active",
                    next="systemd_retry_and_operator_escalation",
                )
                return 3
            _event(
                "control-plane",
                "normal_owner_restored",
                reason="scheduler_active",
                next="normal_update_test_ready_native_merge",
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
