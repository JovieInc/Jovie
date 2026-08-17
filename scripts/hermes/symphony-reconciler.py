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
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request


SCHEMA = "symphony-reconciliation-receipt/v1"
RUNTIME_CAPABILITY_SCHEMA = "symphony-runtime-capabilities/v1"
RUNTIME_RECEIPT_SCHEMA = "symphony-runtime-receipt/v1"
WORKSPACE_REVISION_SCHEMA = "symphony-workspace-revision/v1"
LAUNCHER_FAILURE_SCHEMA = "symphony-launcher-failure/v1"
DEFAULT_API = "http://127.0.0.1:4041/api/v1/state"
DEFAULT_WORKSPACES = "~/symphony-workspaces"
DEFAULT_STATE = "~/.local/state/symphony-reconciler"
DEFAULT_CAPABILITY_MANIFEST = "config/symphony-reconciler-capabilities.json"
MODEL_ID = "qwen-coder-local"
MODEL_TIMEOUT_SECONDS = 12 * 60
RETRY_MINUTES = 15
SYMPHONY_SERVICE = "symphony-ui-pilot.service"
REQUIRED_RUNTIME_CAPABILITIES = frozenset(
    {
        "workspace-observation",
        "workspace-upgrade",
        "immutable-runtime-revision",
        "router-selection",
        "isolated-repair",
    }
)


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: pathlib.Path) -> str | None:
    try:
        return _sha256_bytes(path.read_bytes())
    except OSError:
        return None


def _runtime_paths() -> dict[str, pathlib.Path]:
    root = pathlib.Path(__file__).resolve().parent
    registry = pathlib.Path(
        os.path.expanduser(
            os.environ.get(
                "SYMPHONY_MODEL_REGISTRY", str(root / "config" / "model-registry.json")
            )
        )
    )
    manifest = pathlib.Path(
        os.path.expanduser(
            os.environ.get(
                "SYMPHONY_RUNTIME_CAPABILITY_MANIFEST",
                str(root / DEFAULT_CAPABILITY_MANIFEST),
            )
        )
    )
    router = pathlib.Path(
        os.path.expanduser(
            os.environ.get("SYMPHONY_MODEL_ROUTER", str(root / "model-router.py"))
        )
    )
    receipt_value = os.environ.get("SYMPHONY_RUNTIME_RECEIPT")
    receipt = (
        pathlib.Path(os.path.expanduser(receipt_value))
        if receipt_value
        else manifest.with_name("runtime-receipt.json")
    )
    return {
        "runtime": pathlib.Path(__file__).resolve(),
        "router": router,
        "registry": registry,
        "manifest": manifest,
        "receipt": receipt,
    }


def _runtime_revision(files: dict[str, pathlib.Path]) -> tuple[str | None, dict[str, str]]:
    hashes: dict[str, str] = {}
    for name, path in sorted(files.items()):
        digest = _sha256_file(path)
        if digest is None:
            return None, hashes
        hashes[name] = digest
    canonical = json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()
    return _sha256_bytes(canonical), hashes


def _load_json(path: pathlib.Path) -> dict[str, object] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _is_runnable(path: pathlib.Path, *, python_script: bool = False) -> bool:
    if os.access(path, os.X_OK):
        return True
    if not python_script:
        return False
    try:
        first_line = path.read_text(encoding="utf-8", errors="ignore").splitlines()[0]
    except (OSError, IndexError):
        return False
    return first_line.startswith("#!") and "python" in first_line


def _source_bundle_available() -> bool:
    value = os.environ.get("SYMPHONY_RUNTIME_SOURCE_ROOT")
    if not value:
        return False
    root = pathlib.Path(os.path.expanduser(value))
    if not root.is_dir():
        return False
    if not all(
        path.is_file()
        for path in (
            root / "symphony-reconciler.py",
            root / "model-router.py",
            root / "config" / "model-registry.json",
            root / "config" / "symphony-reconciler-capabilities.json",
        )
    ):
        return False
    manifest = _load_json(root / "config" / "symphony-reconciler-capabilities.json")
    return bool(
        manifest
        and manifest.get("schema") == RUNTIME_CAPABILITY_SCHEMA
        and manifest.get("runtime") == "symphony-reconciler"
    )


def _runtime_receipt(
    paths: dict[str, pathlib.Path], manifest: dict[str, object]
) -> dict[str, object] | None:
    revision, files = _runtime_revision(
        {name: paths[name] for name in ("runtime", "router", "registry", "manifest")}
    )
    if revision is None:
        return None
    return {
        "schema": RUNTIME_RECEIPT_SCHEMA,
        "runtime": "symphony-reconciler",
        "runtimeRevision": revision,
        "capabilities": sorted(manifest["capabilities"]),
        "files": files,
    }


def write_runtime_receipt(
    paths: dict[str, pathlib.Path] | None = None,
) -> dict[str, object] | None:
    resolved = paths or _runtime_paths()
    manifest = _load_json(resolved["manifest"])
    if manifest is None:
        return None
    receipt = _runtime_receipt(resolved, manifest)
    if receipt is None:
        return None
    destination = resolved["receipt"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", dir=destination.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(receipt, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, destination)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return receipt


def runtime_preflight(
    paths: dict[str, pathlib.Path] | None = None,
) -> dict[str, object]:
    """Verify the installed recovery bundle before observing or mutating work.

    A missing generated receipt or missing installed file is recoverable only
    when the source bundle is explicitly available for bootstrap. A malformed
    capability contract is permanent: retrying the same runtime cannot add a
    capability that its manifest does not declare.
    """

    resolved = paths or _runtime_paths()
    manifest = _load_json(resolved["manifest"])
    if manifest is None:
        return {
            "status": "permanent_failure",
            "reason": "capability_manifest_invalid",
            "runtimeRevision": None,
            "capabilities": [],
        }
    if (
        manifest.get("schema") != RUNTIME_CAPABILITY_SCHEMA
        or manifest.get("runtime") != "symphony-reconciler"
        or not isinstance(manifest.get("capabilities"), list)
        or not all(isinstance(value, str) for value in manifest["capabilities"])
        or not isinstance(manifest.get("requiredFiles"), list)
        or not all(isinstance(value, str) for value in manifest["requiredFiles"])
    ):
        return {
            "status": "permanent_failure",
            "reason": "capability_manifest_invalid",
            "runtimeRevision": None,
            "capabilities": [],
        }

    capabilities = set(manifest["capabilities"])
    missing_capabilities = sorted(REQUIRED_RUNTIME_CAPABILITIES - capabilities)
    if missing_capabilities:
        return {
            "status": "permanent_failure",
            "reason": "required_capability_missing",
            "missingCapabilities": missing_capabilities,
            "runtimeRevision": None,
            "capabilities": sorted(capabilities),
        }

    required_files = set(manifest["requiredFiles"])
    known_files = set(resolved) - {"receipt"}
    missing_manifest_files = sorted(required_files - known_files)
    if missing_manifest_files:
        return {
            "status": "permanent_failure",
            "reason": "capability_manifest_file_contract_invalid",
            "missingFiles": missing_manifest_files,
            "runtimeRevision": None,
            "capabilities": sorted(capabilities),
        }

    missing_files = sorted(
        name
        for name in required_files
        if not resolved[name].is_file()
    )
    non_executable = sorted(
        name
        for name in ("runtime", "router")
        if name in required_files
        and resolved[name].is_file()
        and not _is_runnable(resolved[name], python_script=name == "router")
    )
    if missing_files or non_executable:
        source_available = _source_bundle_available()
        return {
            "status": "recoverable" if source_available else "permanent_failure",
            "reason": "runtime_bootstrap_required"
            if source_available
            else "required_runtime_executable_missing",
            "missingFiles": missing_files,
            "nonExecutable": non_executable,
            "runtimeRevision": None,
            "capabilities": sorted(capabilities),
            "bootstrapSourceAvailable": source_available,
        }

    receipt = _runtime_receipt(resolved, manifest)
    if receipt is None:
        return {
            "status": "permanent_failure",
            "reason": "runtime_revision_unavailable",
            "runtimeRevision": None,
            "capabilities": sorted(capabilities),
        }

    configured_receipt = bool(os.environ.get("SYMPHONY_RUNTIME_RECEIPT"))
    installed_receipt = _load_json(resolved["receipt"])
    if installed_receipt is None:
        if configured_receipt:
            return {
                "status": "recoverable",
                "reason": "runtime_receipt_missing",
                "runtimeRevision": receipt["runtimeRevision"],
                "capabilities": sorted(capabilities),
                "receipt": receipt,
            }
        return {
            "status": "ready",
            "reason": "source_runtime_verified",
            "runtimeRevision": receipt["runtimeRevision"],
            "capabilities": sorted(capabilities),
            "receipt": receipt,
        }

    if (
        installed_receipt.get("schema") != RUNTIME_RECEIPT_SCHEMA
        or installed_receipt.get("runtime") != receipt["runtime"]
        or installed_receipt.get("runtimeRevision") != receipt["runtimeRevision"]
        or installed_receipt.get("capabilities") != receipt["capabilities"]
        or installed_receipt.get("files") != receipt["files"]
    ):
        return {
            "status": "recoverable",
            "reason": "runtime_receipt_stale",
            "runtimeRevision": receipt["runtimeRevision"],
            "capabilities": sorted(capabilities),
            "receipt": receipt,
        }
    return {
        "status": "ready",
        "reason": "runtime_receipt_verified",
        "runtimeRevision": receipt["runtimeRevision"],
        "capabilities": sorted(capabilities),
        "receipt": installed_receipt,
    }


DETERMINISTIC_LAUNCHER_ATTEMPTS = 1
TRANSIENT_LAUNCHER_ATTEMPTS = 3

DETERMINISTIC_LAUNCHER_PATTERN = re.compile(
    r"SYMPHONY_LAUNCHER_FAILURE.*deterministic-launcher"
    r"|bwrap:.*(?:uid map|permission denied|operation not permitted)"
    r"|sandbox.*(?:permission denied|operation not permitted|failed)"
    r"|permission denied"
    r"|interactive input.*approval"
    r"|approval.*interactive input"
    r"|human approval.*(?:required|unavailable|disabled|not supported|never)"
    r"|(?:approval|configuration|config|auth).*(?:invalid|missing|unavailable|not found|failed)"
    r"|(?:command not found|no such file or directory|executable.*(?:missing|not found))",
    re.IGNORECASE,
)
TRANSIENT_LAUNCHER_PATTERN = re.compile(
    r"CAPACITY_UNAVAILABLE|account_busy|rate limit|quota|usage limit"
    r"|provider.*(?:temporarily )?unavailable|temporarily unavailable",
    re.IGNORECASE,
)


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


def classify_launcher_failure(error: object) -> dict[str, object]:
    """Classify launcher evidence into a bounded, observable retry policy."""
    evidence = str(error or "")
    if DETERMINISTIC_LAUNCHER_PATTERN.search(evidence):
        return {
            "schema": LAUNCHER_FAILURE_SCHEMA,
            "class": "deterministic-launcher",
            "code": "deterministic-launcher-failure",
            "retryable": False,
            "maxAttempts": DETERMINISTIC_LAUNCHER_ATTEMPTS,
        }
    if TRANSIENT_LAUNCHER_PATTERN.search(evidence):
        return {
            "schema": LAUNCHER_FAILURE_SCHEMA,
            "class": "transient-launcher",
            "code": "capacity-or-provider-unavailable",
            "retryable": True,
            "maxAttempts": TRANSIENT_LAUNCHER_ATTEMPTS,
        }
    return {
        "schema": LAUNCHER_FAILURE_SCHEMA,
        "class": "unknown-launcher",
        "code": "unclassified-launcher-failure",
        "retryable": True,
        "maxAttempts": TRANSIENT_LAUNCHER_ATTEMPTS,
    }


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


def _git_result(workspace: pathlib.Path, *args: str) -> subprocess.CompletedProcess[str] | None:
    try:
        return _captured(["git", *args], workspace)
    except (OSError, subprocess.TimeoutExpired):
        return None


def _parse_ahead_behind(value: str | None) -> tuple[int | None, int | None]:
    if not value:
        return None, None
    parts = value.split()
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return None, None
    return int(parts[1]), int(parts[0])


def _workspace_revision(
    *,
    head: str | None,
    base: str | None,
    merge_base: str | None,
    status: str | None,
    ahead: int | None,
    behind: int | None,
) -> dict[str, object]:
    status_value = status or ""
    return {
        "schema": WORKSPACE_REVISION_SCHEMA,
        "head": head,
        "baseRef": "origin/main",
        "base": base,
        "mergeBase": merge_base,
        "ahead": ahead,
        "behind": behind,
        "dirty": bool(status_value),
        "statusDigest": _sha256_bytes(status_value.encode()),
    }


def _upgrade_stale_workspace(path: pathlib.Path) -> dict[str, object]:
    """Refresh only a clean workspace with no local commits.

    Fetching the remote advances only the remote-tracking ref. The hard reset
    is allowed only when the workspace is clean and has no commits ahead of
    the fetched exact base, so partial repairs are preserved fail-closed.
    """

    before_head = _git(path, "rev-parse", "HEAD")
    status_result = _git_result(path, "status", "--porcelain=v1")
    if status_result is None or status_result.returncode != 0:
        return {
            "status": "unavailable",
            "reason": "workspace_status_unavailable",
            "beforeHead": before_head,
        }
    before_status = status_result.stdout.strip()
    before_base = _git(path, "rev-parse", "origin/main")
    if not before_head:
        return {"status": "unavailable", "reason": "head_unavailable"}

    shallow = _git(path, "rev-parse", "--is-shallow-repository") == "true"
    fetch_args = (
        ["fetch", "--unshallow", "origin", "main"]
        if shallow
        else ["fetch", "origin", "main"]
    )
    fetched = _git_result(path, *fetch_args)
    if fetched is None or fetched.returncode != 0:
        return {
            "status": "unavailable",
            "reason": "origin_main_fetch_failed",
            "beforeHead": before_head,
            "beforeBase": before_base,
        }

    after_base = _git(path, "rev-parse", "origin/main")
    counts = _git(path, "rev-list", "--left-right", "--count", "origin/main...HEAD")
    ahead, behind = _parse_ahead_behind(counts)
    if not after_base or ahead is None or behind is None:
        return {
            "status": "unavailable",
            "reason": "origin_main_revision_unavailable",
            "beforeHead": before_head,
            "beforeBase": before_base,
        }
    if before_status:
        return {
            "status": "preserved",
            "reason": "workspace_dirty",
            "beforeHead": before_head,
            "afterBase": after_base,
            "ahead": ahead,
            "behind": behind,
        }
    if ahead > 0:
        return {
            "status": "preserved",
            "reason": "workspace_has_local_commits",
            "beforeHead": before_head,
            "afterBase": after_base,
            "ahead": ahead,
            "behind": behind,
        }
    if behind <= 0 or before_head == after_base:
        return {
            "status": "current",
            "reason": "workspace_matches_fetched_base",
            "beforeHead": before_head,
            "afterBase": after_base,
            "ahead": ahead,
            "behind": behind,
        }

    reset = _git_result(path, "reset", "--hard", "origin/main")
    if reset is None or reset.returncode != 0:
        return {
            "status": "unavailable",
            "reason": "workspace_upgrade_failed",
            "beforeHead": before_head,
            "afterBase": after_base,
        }
    return {
        "status": "upgraded",
        "reason": "clean_workspace_replanted_on_fetched_base",
        "beforeHead": before_head,
        "afterBase": after_base,
    }


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
            "workspaceRevision": _workspace_revision(
                head=None,
                base=None,
                merge_base=None,
                status=None,
                ahead=None,
                behind=None,
            ),
        }

    upgrade = _upgrade_stale_workspace(path)
    head = _git(path, "rev-parse", "HEAD")
    base = _git(path, "rev-parse", "origin/main")
    merge_base = _git(path, "merge-base", "HEAD", "origin/main") if head and base else None
    branch = _git(path, "branch", "--show-current")
    status = _git(path, "status", "--porcelain=v1")
    conflicts = _git(path, "diff", "--name-only", "--diff-filter=U")
    counts = _git(path, "rev-list", "--left-right", "--count", "origin/main...HEAD") if head and base else None
    ahead, behind = _parse_ahead_behind(counts)
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
        "upgrade": upgrade,
        "workspaceRevision": _workspace_revision(
            head=head,
            base=base,
            merge_base=merge_base,
            status=status,
            ahead=ahead,
            behind=behind,
        ),
    }


def _generation(
    identifier: str,
    error: str,
    state: dict[str, object],
    runtime: dict[str, object] | None = None,
) -> str:
    raw = json.dumps(
        {
            "issue": identifier,
            "error": error,
            "head": state.get("head"),
            "base": state.get("base"),
            "conflicts": state.get("conflictedPaths"),
            "workspaceRevision": state.get("workspaceRevision"),
            "runtimeRevision": runtime.get("runtimeRevision") if runtime else None,
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


def _alternate_due(
    item: dict[str, object],
    source: str,
    runtime: dict[str, object] | None = None,
) -> bool:
    identifier = str(item.get("issue_identifier", ""))
    if not identifier:
        return False
    state = _workspace_state(item.get("workspace_path"), identifier)
    if not state.get("valid") or not _is_repeated_or_conflict(item, source, state):
        return False
    generation = _generation(
        identifier,
        str(item.get("error") or f"runtime_{source}"),
        state,
        runtime,
    )
    previous = _read_receipt(identifier)
    if not previous or previous.get("generation") != generation:
        return True
    launcher_failure = previous.get("launcherFailure")
    if isinstance(launcher_failure, dict) and launcher_failure.get("retryable") is False:
        return False
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
    runtime = runtime_preflight()
    if runtime.get("status") != "ready":
        return None, str(runtime.get("reason") or "runtime_preflight_failed")
    paths = _runtime_paths()
    router = paths["router"]
    registry = paths["registry"]
    try:
        first_line = router.read_text(encoding="utf-8").splitlines()[0]
        python_router = first_line.startswith("#!") and "python" in first_line
        router_command = (
            [sys.executable, str(router)]
            if python_router
            else [str(router)]
        )
    except (OSError, IndexError):
        return None, "router_runtime_missing"
    if router_command[0] == str(router) and not os.access(router, os.X_OK):
        return None, "router_runtime_not_executable"
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
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None, "router_unavailable"
    if result.returncode != 0:
        return None, "router_unavailable"
    try:
        payload = json.loads(result.stdout)
    except (TypeError, ValueError):
        return None, "router_invalid_receipt"
    if (
        not isinstance(payload, dict)
        or payload.get("schema_version") != 1
        or payload.get("workflow") != "remediation"
        or payload.get("capability") != "code"
        or payload.get("deterministic_first") is not True
    ):
        return None, "router_capability_missing"
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
    executable = str(executor["executable"])
    resolved = executable if pathlib.Path(executable).is_absolute() else shutil.which(executable)
    if not resolved or not pathlib.Path(resolved).is_file() or not os.access(resolved, os.X_OK):
        return None, "local_model_executor_missing"
    executor["executable"] = resolved
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
Workspace revision receipt: {json.dumps(state.get('workspaceRevision'), sort_keys=True)}
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


def _reconcile_item(
    item: dict[str, object],
    source: str,
    alternate_permitted: bool,
    runtime: dict[str, object] | None = None,
) -> None:
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
    runtime = runtime or runtime_preflight()
    generation = _generation(identifier, error, state_before, runtime)
    previous = _read_receipt(identifier)
    launcher_failure = classify_launcher_failure(error)
    previous_launcher_failure = previous.get("launcherFailure") if previous else None
    if (
        previous
        and previous.get("generation") == generation
        and isinstance(previous_launcher_failure, dict)
        and previous_launcher_failure.get("retryable") is False
    ):
        _event(
            identifier,
            "deterministic_launcher_held",
            reason=error,
            failure_class=previous_launcher_failure.get("class"),
            retryable=False,
            next="manual_or_environment_repair",
            retry_at=None,
        )
        return
    next_retry = (
        None
        if launcher_failure["retryable"] is False
        else _parse_time(item.get("due_at"))
        or (_now() + dt.timedelta(minutes=RETRY_MINUTES))
    )
    repeated = launcher_failure["retryable"] and _is_repeated_or_conflict(
        item, source, state_before
    )
    attempted: list[dict[str, object]] = [
        {
            "kind": (
                "launcher_failure_classification"
                if launcher_failure["retryable"] is False
                else "normal_model_bounded_retry"
            ),
            "attempt": attempt,
            "result": (
                "blocked"
                if launcher_failure["retryable"] is False
                else "failed"
                if repeated
                else "scheduled"
            ),
            "runtimeError": error,
            "launcherFailure": launcher_failure,
        }
    ]
    alternate: dict[str, object] = {
        "nominatedModel": MODEL_ID,
        "path": "model-router:remediation/code:local-only",
        "status": "not_due",
    }
    transition = (
        "deterministic_launcher_blocked"
        if launcher_failure["retryable"] is False
        else "normal_retry_scheduled"
    )
    next_action = (
        "manual_or_environment_repair"
        if launcher_failure["retryable"] is False
        else "normal_model_retry"
    )
    state_after = state_before
    if launcher_failure["retryable"] is False:
        alternate["status"] = "not_permitted"

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
        "launcherFailure": launcher_failure,
        "retryPolicy": {
            "retryable": launcher_failure["retryable"],
            "maxAttempts": launcher_failure["maxAttempts"],
        },
        "entryCriteria": "runtime retry/blocked after bounded normal-model attempt",
        "authoritativeOwner": "symphony-reconciler" if alternate_permitted else "symphony-ui-pilot",
        "resourceScope": {
            "issue": identifier,
            "workspace": state_after.get("workspace"),
            "head": state_after.get("head"),
            "base": state_after.get("base"),
            "workspaceRevision": state_after.get("workspaceRevision"),
            "runtimeRevision": runtime.get("runtimeRevision"),
            "capabilities": runtime.get("capabilities", []),
        },
        "deadline": (
            None
            if launcher_failure["retryable"] is False
            else _iso(_now() + dt.timedelta(seconds=_model_timeout_seconds()))
            if alternate_permitted
            else _iso(next_retry)
            if next_retry
            else None
        ),
        "runtimeState": source,
        "attempt": attempt,
        "headBaseBefore": state_before,
        "headBaseCurrent": state_after,
        "runtimeRevision": runtime.get("runtimeRevision"),
        "runtimeCapabilities": runtime.get("capabilities", []),
        "runtimeReceipt": runtime.get("receipt"),
        "attemptedRepairs": attempted,
        "transition": transition,
        "nextAutomatedAction": next_action,
        "nextRetryAt": _iso(next_retry) if next_retry else None,
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
        retry_at=_iso(next_retry) if next_retry else None,
        alternate=alternate.get("status"),
    )


def main() -> int:
    runtime = runtime_preflight()
    if runtime.get("status") != "ready":
        transition = (
            "runtime_bootstrap_required"
            if runtime.get("status") == "recoverable"
            else "runtime_permanent_failure"
        )
        _event(
            "control-plane",
            transition,
            reason=runtime.get("reason"),
            runtime_revision=runtime.get("runtimeRevision"),
            capabilities=runtime.get("capabilities"),
            missing_files=runtime.get("missingFiles"),
            missing_capabilities=runtime.get("missingCapabilities"),
        )
        return 2 if runtime.get("status") == "recoverable" else 3
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
    candidates = [
        (source, item)
        for source, item in items
        if _alternate_due(item, source, runtime)
    ]
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
            _reconcile_item(item, source, permitted, runtime)
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
    if len(sys.argv) == 2 and sys.argv[1] == "runtime-receipt":
        raise SystemExit(0 if write_runtime_receipt() else 2)
    if len(sys.argv) == 2 and sys.argv[1] == "runtime-preflight":
        result = runtime_preflight()
        print(json.dumps(result, sort_keys=True))
        raise SystemExit(0 if result.get("status") == "ready" else 1)
    raise SystemExit(main())
