#!/usr/bin/env python3
"""Durably reconcile Symphony failures without taking merge ownership.

The sidecar observes Symphony's local state API, records an exact workspace
head/base receipt for every stopped attempt, and escalates repeated failures to
the canonical remediation route only when that route selects a local model.
The alternate model may repair one isolated stopped workspace when the fleet
gate runtimeFloor admits local-only stale-capacity recovery, but may not
commit, push, merge, or change tracker state. Symphony remains the owner of
the normal update/test/ready/native-merge lifecycle on its next bounded retry.
"""

from __future__ import annotations

import datetime as dt
import fcntl
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
DEFAULT_WORKSPACES = "~/symphony-elixir-workspaces"
DEFAULT_STATE = "~/.local/state/symphony-reconciler"
DEFAULT_CAPABILITY_MANIFEST = "config/symphony-reconciler-capabilities.json"
DEFAULT_FLEET_GATE_RECEIPT = "/home/timwhite/gem-workspace/state/gem-priority-gate/latest.json"
MODEL_ID = "qwen-coder-local"
MODEL_TIMEOUT_SECONDS = 12 * 60
RETRY_MINUTES = 15
LOCAL_REPAIR_MAX_ATTEMPTS = 1
CONSUMED_LOCAL_REPAIR_STATUSES = frozenset(
    {
        "repair_started",
        "repair_interrupted",
        "repair_handoff_ready",
        "repair_failed",
        "repair_timed_out",
        "not_started",
        "repair_not_started",
    }
)
SYMPHONY_SERVICE = "symphony-elixir.service"
SYMPHONY_OWNER = "symphony-elixir"
REQUIRED_RUNTIME_CAPABILITIES = frozenset(
    {
        "workspace-observation",
        "workspace-upgrade",
        "immutable-runtime-revision",
        "router-selection",
        "isolated-repair",
    }
)
FLEET_GATE_RECEIPT_MAX_AGE = dt.timedelta(minutes=10)


def _stale_capacity_local_remediation_limit(
    receipt_path: pathlib.Path | None = None,
) -> tuple[int, str]:
    """Admit only the fail-closed, local-only stale-capacity recovery lane."""
    path = receipt_path or pathlib.Path(
        os.path.expanduser(
            os.environ.get("GEM_FLEET_GATE_RECEIPT", DEFAULT_FLEET_GATE_RECEIPT)
        )
    )
    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError):
        return 0, "fleet_gate_unavailable"
    if not isinstance(receipt, dict):
        return 0, "fleet_gate_local_remediation_not_admitted"
    remediation = receipt.get("remediationAdmission") or {}
    work = receipt.get("workAdmission") or {}
    concurrency = receipt.get("concurrency") or {}
    signals = receipt.get("signals") or {}
    if not all(
        isinstance(value, dict)
        for value in (remediation, work, concurrency, signals)
    ):
        return 0, "fleet_gate_local_remediation_not_admitted"
    gem = concurrency.get("gem") or {}
    evidence = signals.get("concurrencyEvidence") or {}
    if not isinstance(gem, dict) or not isinstance(evidence, dict):
        return 0, "fleet_gate_local_remediation_not_admitted"
    observed_at = _parse_time(receipt.get("observedAt"))
    try:
        age = _now() - observed_at if observed_at is not None else None
    except TypeError:
        age = None
    # symphony-concurrency-autoscale-v1: a receipt without accepted capacity
    # evidence runs at the runtime floor (one seat) instead of zero. The local
    # alternate-repair lane stays bounded to one attempt regardless of how
    # many seats the floor or live evidence grants.
    safe_floor_lane = (
        receipt.get("schema") == "jovie-fleet-gate/v1"
        and receipt.get("state") in {"GREEN", "AMBER"}
        and remediation.get("allowed") is True
        and remediation.get("localAllowed") is True
        and work.get("allowed") is True
        and isinstance(remediation.get("maxConcurrent"), int)
        and not isinstance(remediation.get("maxConcurrent"), bool)
        and remediation.get("maxConcurrent") >= LOCAL_REPAIR_MAX_ATTEMPTS
        and gem.get("runtimeFloor") == 1
        and evidence.get("accepted") is False
        and gem.get("evidenceAccepted") is False
        and isinstance(gem.get("maxConcurrent"), int)
        and not isinstance(gem.get("maxConcurrent"), bool)
        and gem.get("maxConcurrent") >= 1
        and age is not None
        and dt.timedelta(0) <= age <= FLEET_GATE_RECEIPT_MAX_AGE
    )
    if not safe_floor_lane:
        return 0, "fleet_gate_local_remediation_not_admitted"
    return LOCAL_REPAIR_MAX_ATTEMPTS, "fleet_gate_stale_capacity_local_only"


def _acquire_local_remediation_lease():
    directory = _state_root() / "leases"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    handle = (directory / "stale-capacity-local-remediation.lock").open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def _release_local_remediation_lease(handle) -> None:
    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    handle.close()


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


def _source_bundle_hashes() -> dict[str, str] | None:
    value = os.environ.get("SYMPHONY_RUNTIME_SOURCE_ROOT")
    if not value:
        return None
    root = pathlib.Path(os.path.expanduser(value))
    revision, hashes = _runtime_revision(
        {
            "runtime": root / "symphony-reconciler.py",
            "router": root / "model-router.py",
            "registry": root / "config" / "model-registry.json",
            "manifest": root / "config" / "symphony-reconciler-capabilities.json",
        }
    )
    return hashes if revision is not None else None


def _runtime_receipt(
    paths: dict[str, pathlib.Path], manifest: dict[str, object]
) -> dict[str, object] | None:
    revision, files = _runtime_revision(
        {name: paths[name] for name in ("runtime", "router", "registry", "manifest")}
    )
    if revision is None:
        return None
    installed_at = (
        dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    )
    source_hashes = _source_bundle_hashes()
    return {
        "schema": RUNTIME_RECEIPT_SCHEMA,
        "runtime": "symphony-reconciler",
        "runtimeRevision": revision,
        "installedAt": installed_at,
        "capabilities": sorted(manifest["capabilities"]),
        "files": files,
        "runtimeHashes": files,
        "sourceHashes": source_hashes or files,
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

    source_hashes = installed_receipt.get("sourceHashes")
    runtime_hashes = installed_receipt.get("runtimeHashes")
    current_source_hashes = _source_bundle_hashes()
    if (
        installed_receipt.get("schema") != RUNTIME_RECEIPT_SCHEMA
        or installed_receipt.get("runtime") != receipt["runtime"]
        or installed_receipt.get("runtimeRevision") != receipt["runtimeRevision"]
        or installed_receipt.get("capabilities") != receipt["capabilities"]
        or installed_receipt.get("files") != receipt["files"]
        or runtime_hashes not in (None, receipt["files"])
        or source_hashes not in (None, receipt["files"])
        or (
            current_source_hashes is not None
            and (
                current_source_hashes != receipt["files"]
                or source_hashes != current_source_hashes
            )
        )
        or not isinstance(installed_receipt.get("installedAt"), str)
        or not installed_receipt.get("installedAt")
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
EX_CONFIG = 78
EX_TEMPFAIL = 75
SYMPHONY_ROUTING_SCHEMA = "symphony-routing/v1"

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
PORT_EXIT_PATTERN = re.compile(
    r"\{:port_exit,\s*(\d+)\}|port_exit[, :]+(\d+)",
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


def parse_port_exit(error: object) -> int | None:
    """Extract a port/process exit status from controller or launcher evidence."""
    if isinstance(error, dict):
        for key in ("port_exit", "exit_code", "exitCode", "status"):
            value = error.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
        error = error.get("error") or error.get("reason") or error.get("message")
    evidence = str(error or "")
    match = PORT_EXIT_PATTERN.search(evidence)
    if not match:
        return None
    for group in match.groups():
        if group is not None:
            try:
                return int(group)
            except ValueError:
                return None
    return None


def parse_launcher_sentinel(error: object) -> dict[str, object] | None:
    """Preserve a structured symphony-launcher-failure/v1 sentinel when present."""
    if isinstance(error, dict) and error.get("schema") == LAUNCHER_FAILURE_SCHEMA:
        return error
    evidence = str(error or "")
    marker = "SYMPHONY_LAUNCHER_FAILURE"
    index = evidence.find(marker)
    if index < 0:
        return None
    payload = evidence[index + len(marker) :].strip()
    fields: dict[str, object] = {"schema": LAUNCHER_FAILURE_SCHEMA}
    try:
        tokens = shlex.split(payload)
    except ValueError:
        tokens = payload.split()
    for token in tokens:
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        if value in {"true", "false"}:
            fields[key] = value == "true"
        elif value.isdigit():
            fields[key] = int(value)
        else:
            fields[key] = value
    return fields


def _failure(
    class_name: str,
    code: str,
    *,
    retryable: bool,
    max_attempts: int,
) -> dict[str, object]:
    return {
        "schema": LAUNCHER_FAILURE_SCHEMA,
        "class": class_name,
        "code": code,
        "retryable": retryable,
        "maxAttempts": max_attempts,
    }


def classify_launcher_failure(
    error: object,
    item: dict[str, object] | None = None,
) -> dict[str, object]:
    """Classify launcher and controller-exit evidence into a bounded retry policy.

    Structured sentinels and sysexits EX_CONFIG (78) are terminal. EX_TEMPFAIL
    (75) stays a distinct bounded capacity state. Unknown exits stay typed
    unknown and bounded, never collapsed into exit 78.
    """
    item = item or {}
    sentinel = parse_launcher_sentinel(error)
    if sentinel is None:
        sentinel = parse_launcher_sentinel(item.get("error") or item.get("launcherFailure"))
    if isinstance(sentinel, dict) and sentinel.get("retryable") is False:
        return _failure(
            str(sentinel.get("class") or "deterministic-launcher"),
            str(sentinel.get("code") or "deterministic-launcher-failure"),
            retryable=False,
            max_attempts=DETERMINISTIC_LAUNCHER_ATTEMPTS,
        )
    port_exit = parse_port_exit(error)
    if port_exit is None:
        port_exit = parse_port_exit(item.get("error"))
    if port_exit is None:
        for key in ("port_exit", "exit_code", "exitCode"):
            value = item.get(key)
            if isinstance(value, int):
                port_exit = value
                break
    if port_exit == EX_CONFIG:
        return _failure(
            "deterministic-launcher",
            "deterministic-launcher-failure",
            retryable=False,
            max_attempts=DETERMINISTIC_LAUNCHER_ATTEMPTS,
        )
    evidence = str(error or item.get("error") or "")
    if DETERMINISTIC_LAUNCHER_PATTERN.search(evidence):
        return _failure(
            "deterministic-launcher",
            "deterministic-launcher-failure",
            retryable=False,
            max_attempts=DETERMINISTIC_LAUNCHER_ATTEMPTS,
        )
    if port_exit == EX_TEMPFAIL or TRANSIENT_LAUNCHER_PATTERN.search(evidence):
        return _failure(
            "transient-launcher",
            "capacity-or-provider-unavailable",
            retryable=True,
            max_attempts=TRANSIENT_LAUNCHER_ATTEMPTS,
        )
    if port_exit is not None:
        return _failure(
            "unknown-launcher",
            f"unclassified-port-exit-{port_exit}",
            retryable=True,
            max_attempts=TRANSIENT_LAUNCHER_ATTEMPTS,
        )
    if isinstance(sentinel, dict) and sentinel.get("retryable") is True:
        return _failure(
            str(sentinel.get("class") or "transient-launcher"),
            str(sentinel.get("code") or "capacity-or-provider-unavailable"),
            retryable=True,
            max_attempts=TRANSIENT_LAUNCHER_ATTEMPTS,
        )
    return _failure(
        "unknown-launcher",
        "unclassified-launcher-failure",
        retryable=True,
        max_attempts=TRANSIENT_LAUNCHER_ATTEMPTS,
    )


def _valid_materialized_routing_receipt(
    receipt: object,
    issue_identifier: object,
) -> bool:
    """Validate the complete workspace-local receipt written by admission."""
    if not isinstance(receipt, dict) or receipt.get("schema") != SYMPHONY_ROUTING_SCHEMA:
        return False
    if receipt.get("issue") != issue_identifier or not isinstance(receipt.get("modelId"), str):
        return False
    if not isinstance(receipt.get("model"), str) or not receipt.get("model"):
        return False
    if not isinstance(receipt.get("escalation"), bool):
        return False
    if receipt.get("fallback") is not None and not isinstance(receipt.get("fallback"), str):
        return False
    classification = receipt.get("classification")
    if not isinstance(classification, dict):
        return False
    if classification.get("risk") not in {"low", "medium", "high"}:
        return False
    if classification.get("complexity") not in {"low", "standard", "high"}:
        return False
    capabilities = classification.get("capabilities")
    reasons = classification.get("reasons")
    if not isinstance(capabilities, list) or not capabilities or not all(
        isinstance(value, str) and value for value in capabilities
    ):
        return False
    if not isinstance(reasons, list) or not reasons or not all(
        isinstance(value, str) and value for value in reasons
    ):
        return False
    candidates = receipt.get("candidates")
    if not isinstance(candidates, list) or any(
        not isinstance(candidate, dict)
        or not isinstance(candidate.get("id"), str)
        or candidate.get("status") not in {"incompatible", "cooldown", "unavailable"}
        for candidate in candidates
    ):
        return False
    capacity = receipt.get("capacity")
    if not isinstance(capacity, dict) or capacity.get("readable") is not True:
        return False
    if not isinstance(capacity.get("accounts"), int) or capacity.get("accounts", 0) <= 0:
        return False
    fingerprint = receipt.get("fingerprint")
    return isinstance(fingerprint, str) and re.fullmatch(r"[0-9a-f]{24}", fingerprint) is not None


def controller_retry_decision(
    observation: dict[str, object],
    previous: dict[str, object] | None = None,
    *,
    routing_receipt: dict[str, object] | None = None,
) -> dict[str, object]:
    """Sole retry scheduler for the Symphony controller runtime.

    A non-retryable sentinel or port exit 78 parks terminally: retryable=false,
    maxAttempts=1, no due_at, no alternate-provider handoff, and no new lease.
    Repeated observation of the same generation must not advance attempts.
    A later generation may run only after canonical admission materializes a
    valid symphony-routing/v1 receipt.
    """
    failure = classify_launcher_failure(
        observation.get("error") or observation.get("reason"),
        observation,
    )
    sentinel = parse_launcher_sentinel(observation.get("error") or observation.get("launcherFailure"))
    if isinstance(sentinel, dict) and sentinel.get("class") in {"provider-cooldown", "provider-unavailable"}:
        eligible = _parse_time(sentinel.get("nextEligibleAt"))
        if eligible is not None and eligible > _now():
            return {"state": "deferred", "retryable": False, "maxAttempts": 1,
                    "due_at": _iso(eligible), "nextEligibleAt": _iso(eligible), "attempt": 1,
                    "lease": None, "handoff": False, "providerAccount": None, "failure": failure}
        if eligible is not None:
            # Expiry permits one normal scheduler reevaluation, never an alternate handoff.
            return {"state": "retrying", "retryable": True, "maxAttempts": 1,
                    "due_at": _iso(eligible), "nextEligibleAt": _iso(eligible), "attempt": 1,
                    "lease": None, "handoff": False, "providerAccount": None,
                    "failure": {**failure, "retryable": True, "maxAttempts": 1}}
    generation = observation.get("generation")
    previous_generation = previous.get("generation") if previous else None
    # A changed generation/routing receipt cannot erase a current launcher failure.
    repaired = bool(
        previous
        and not observation.get("error")
        and _valid_materialized_routing_receipt(
            routing_receipt,
            observation.get("issue_identifier"),
        )
        and generation
        and generation != previous_generation
    )
    if (
        not observation.get("error")
        and _valid_materialized_routing_receipt(
            routing_receipt,
            observation.get("issue_identifier"),
        )
        and previous
        and generation == previous_generation
        and previous.get("state") == "ready"
    ):
        return {
            "state": "ready",
            "retryable": True,
            "maxAttempts": TRANSIENT_LAUNCHER_ATTEMPTS,
            "due_at": None,
            "attempt": 0,
            "lease": None,
            "handoff": False,
            "providerAccount": None,
            "failure": None,
        }
    if repaired:
        return {
            "state": "ready",
            "retryable": True,
            "maxAttempts": TRANSIENT_LAUNCHER_ATTEMPTS,
            "due_at": None,
            "attempt": 0,
            "lease": None,
            "handoff": False,
            "providerAccount": None,
            "failure": None,
        }
    if (
        previous
        and previous_generation == generation
        and previous.get("retryable") is False
    ):
        return {
            "state": str(previous.get("state") or "blocked"),
            "retryable": False,
            "maxAttempts": DETERMINISTIC_LAUNCHER_ATTEMPTS,
            "due_at": None,
            "attempt": int(previous.get("attempt") or 1),
            "lease": None,
            "handoff": False,
            "providerAccount": None,
            "failure": previous.get("failure") or failure,
        }
    if failure["retryable"] is False:
        return {
            "state": "blocked",
            "retryable": False,
            "maxAttempts": DETERMINISTIC_LAUNCHER_ATTEMPTS,
            "due_at": None,
            "attempt": 1,
            "lease": None,
            "handoff": False,
            "providerAccount": None,
            "failure": failure,
        }
    try:
        attempt = int(observation.get("attempt") or 0)
    except (TypeError, ValueError):
        attempt = 0
    max_attempts = int(failure["maxAttempts"])
    if attempt >= max_attempts:
        return {
            "state": "blocked",
            "retryable": False,
            "maxAttempts": max_attempts,
            "due_at": None,
            "attempt": max_attempts,
            "lease": None,
            "handoff": False,
            "providerAccount": None,
            "failure": {**failure, "exhausted": True},
        }
    delay_minutes = 1 if failure["class"] == "transient-launcher" else RETRY_MINUTES
    return {
        "state": "retrying",
        "retryable": True,
        "maxAttempts": max_attempts,
        "due_at": _iso(_now() + dt.timedelta(minutes=delay_minutes)),
        "attempt": attempt + 1,
        "lease": None,
        "handoff": False,
        "providerAccount": None,
        "failure": failure,
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


def _git_bytes(workspace: pathlib.Path, *args: str) -> bytes | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=workspace,
            check=False,
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def _workspace_dirty_content_digest(
    workspace: pathlib.Path,
    status: str | None,
) -> str | None:
    if not status:
        return None
    digest = hashlib.sha256()
    digest.update(status.encode())
    for label, args in (
        ("unstaged", ("diff", "--no-ext-diff", "--binary", "HEAD", "--")),
        ("staged", ("diff", "--cached", "--no-ext-diff", "--binary", "HEAD", "--")),
    ):
        output = _git_bytes(workspace, *args)
        if output is None:
            return None
        digest.update(label.encode())
        digest.update(b"\0")
        digest.update(output)
        digest.update(b"\0")
    untracked = _git_bytes(workspace, "ls-files", "--others", "--exclude-standard", "-z")
    if untracked is None:
        return None
    root = workspace.resolve()
    for raw_path in sorted(value for value in untracked.split(b"\0") if value):
        relative = pathlib.Path(os.fsdecode(raw_path))
        try:
            target = root / relative
            target.resolve().relative_to(root)
            stat_result = target.lstat()
        except (OSError, ValueError):
            return None
        digest.update(b"untracked\0")
        digest.update(raw_path)
        digest.update(b"\0")
        digest.update(str(stat_result.st_mode).encode())
        digest.update(b"\0")
        if target.is_symlink():
            try:
                digest.update(os.fsencode(os.readlink(target)))
            except (OSError, UnicodeEncodeError):
                return None
        elif target.is_file():
            try:
                with target.open("rb") as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(chunk)
            except OSError:
                return None
        else:
            digest.update(b"non-file")
        digest.update(b"\0")
    return digest.hexdigest()


def _workspace_revision(
    *,
    head: str | None,
    base: str | None,
    merge_base: str | None,
    status: str | None,
    ahead: int | None,
    behind: int | None,
    content_digest: str | None = None,
) -> dict[str, object]:
    status_value = status or ""
    revision: dict[str, object] = {
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
    if content_digest:
        revision["contentDigest"] = content_digest
    return revision


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
    content_digest = _workspace_dirty_content_digest(path, status)
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
            content_digest=content_digest,
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


def _local_repair_generation(
    identifier: str,
    error: str,
    state: dict[str, object],
    runtime: dict[str, object] | None = None,
) -> str:
    """Stable identity for one local attempt, excluding mutable base/status."""
    raw = json.dumps(
        {
            "issue": identifier,
            "error": error,
            "head": state.get("head"),
            "runtimeRevision": runtime.get("runtimeRevision") if runtime else None,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _legacy_base_scoped_local_repair_generation(
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
    if classify_launcher_failure(item.get("error"), item).get("retryable") is False:
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
) -> bool:
    identifier = str(item.get("issue_identifier", ""))
    if not identifier or not identifier.replace("-", "").isalnum():
        _event("unknown", "invalid_runtime_item", reason="invalid_identifier")
        return False
    error = str(item.get("error") or f"runtime_{source}")
    try:
        attempt = int(item.get("attempt") or 0)
    except (TypeError, ValueError):
        attempt = 0
    state_before = _workspace_state(item.get("workspace_path"), identifier)
    runtime = runtime or runtime_preflight()
    generation = _generation(identifier, error, state_before, runtime)
    local_repair_generation = _local_repair_generation(
        identifier,
        error,
        state_before,
        runtime,
    )
    previous = _read_receipt(identifier)
    previous_alternate = previous.get("alternateModel") if previous else None
    previous_scope = previous.get("resourceScope") if previous else None
    previous_base_state = {
        **state_before,
        "base": previous_scope.get("base")
        if isinstance(previous_scope, dict)
        else state_before.get("base"),
    }
    same_local_repair_generation = bool(
        previous
        and (
            previous.get("localRepairGeneration") == local_repair_generation
            or previous.get("localRepairGeneration")
            == _legacy_base_scoped_local_repair_generation(
                identifier,
                error,
                previous_base_state,
                runtime,
            )
            or (
                previous.get("localRepairGeneration") is None
                and previous.get("reason") == error
                and isinstance(previous_scope, dict)
                and previous_scope.get("head") == state_before.get("head")
                and previous_scope.get("runtimeRevision")
                == runtime.get("runtimeRevision")
            )
        )
    )
    consumed_previous_local_repair = (
        previous
        and same_local_repair_generation
        and isinstance(previous_alternate, dict)
        and previous_alternate.get("status") in CONSUMED_LOCAL_REPAIR_STATUSES
    )
    previous_consumed_status = (
        previous_alternate.get("status")
        if consumed_previous_local_repair and isinstance(previous_alternate, dict)
        else None
    )
    returned_previous_local_repair = (
        consumed_previous_local_repair
        and previous_consumed_status == "repair_handoff_ready"
    )
    previous_workspace_revision = (
        previous_scope.get("workspaceRevision")
        if isinstance(previous_scope, dict)
        else None
    )
    launcher_failure = classify_launcher_failure(error, item)
    routing_receipt = None
    workspace_value = state_before.get("workspace")
    if isinstance(workspace_value, str):
        routing_receipt = _load_json(pathlib.Path(workspace_value) / ".symphony-routing.json")
    decision = controller_retry_decision(
        {
            **item,
            "error": item.get("error"),
            "generation": generation,
            "attempt": attempt,
        },
        {
            "generation": previous.get("generation"),
            "retryable": (previous.get("retryPolicy") or {}).get("retryable")
            if isinstance(previous.get("retryPolicy"), dict)
            else None,
            "attempt": previous.get("attempt"),
            "state": previous.get("controllerState") or previous.get("runtimeState"),
            "failure": previous.get("launcherFailure"),
        }
        if previous
        else None,
        routing_receipt=routing_receipt,
    )
    launcher_failure = decision["failure"] or launcher_failure
    policy_retryable = bool(decision["retryable"])
    decision_state = str(decision["state"])
    fresh_routing_ready_after_consumed_repair = (
        decision_state == "ready"
        and previous_consumed_status not in {"repair_started"}
        and previous_workspace_revision is not None
        and previous_workspace_revision != state_before.get("workspaceRevision")
    )
    if (
        consumed_previous_local_repair
        and not returned_previous_local_repair
        and not fresh_routing_ready_after_consumed_repair
    ):
        previous_status = previous_consumed_status
        if previous_status == "repair_started":
            current_scope = (
                previous_scope.copy() if isinstance(previous_scope, dict) else {}
            )
            previous = {
                **previous,
                "updatedAt": _iso(_now()),
                "authoritativeOwner": "symphony-reconciler",
                "controllerState": "blocked",
                "transition": "github_runner_handoff_required",
                "nextAutomatedAction": "escalate_ci_platform_dependency",
                "nextRetryAt": None,
                "alternateModel": {
                    **previous_alternate,
                    "status": "repair_interrupted",
                },
                "resourceScope": {
                    **current_scope,
                    "issue": identifier,
                    "workspace": state_before.get("workspace"),
                    "head": state_before.get("head"),
                    "base": state_before.get("base"),
                    "workspaceRevision": state_before.get("workspaceRevision"),
                    "runtimeRevision": runtime.get("runtimeRevision"),
                    "capabilities": runtime.get("capabilities", []),
                },
                "headBaseCurrent": state_before,
                "terminalEscalation": {
                    "owner": "symphony-reconciler",
                    "requestedOwner": "CI Platform",
                    "route": "rolling-ci-fx",
                    "state": "handoff_unaccepted",
                    "reason": "repair_interrupted",
                    "trigger": "authenticated_ci_workflow_run",
                },
            }
            _write_receipt(identifier, previous)
        _event(
            identifier,
            "completed_local_repair_held",
            reason=error,
            alternate=previous_status,
            next=previous.get("nextAutomatedAction"),
            retry_at=previous.get("nextRetryAt"),
        )
        return False
    retry_scheduled = decision_state == "retrying"
    deferred = decision_state == "deferred"
    terminal = decision_state == "blocked"
    deterministic_terminal = terminal and launcher_failure.get("retryable") is False
    retry_exhausted = terminal and launcher_failure.get("exhausted") is True
    if (deferred and previous and previous.get("generation") == generation
        and previous.get("controllerState") == "deferred"
        and previous.get("nextRetryAt") == decision.get("due_at")):
        return False
    previous_launcher_failure = previous.get("launcherFailure") if previous else None
    if (
        previous
        and previous.get("generation") == generation
        and isinstance(previous_launcher_failure, dict)
        and previous_launcher_failure.get("retryable") is False
        and previous_launcher_failure.get("class") not in {"provider-cooldown", "provider-unavailable"}
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
        return False
    next_retry = _parse_time(decision.get("due_at")) if retry_scheduled or deferred else None
    previous_retry = _parse_time(previous.get("nextRetryAt")) if previous else None
    repeated = (
        alternate_permitted
        and not returned_previous_local_repair
        and (retry_scheduled or retry_exhausted)
        and _is_repeated_or_conflict(item, source, state_before)
    )
    attempted: list[dict[str, object]] = [
        {
            "kind": (
                "retry_policy_exhausted"
                if launcher_failure.get("exhausted") is True
                else "launcher_failure_classification"
                if terminal
                else "normal_model_bounded_retry"
            ),
            "attempt": decision["attempt"],
            "result": (
                "blocked"
                if terminal
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
        "provider_cooldown_deferred"
        if deferred
        else "admitted_generation_ready"
        if decision_state == "ready"
        else
        "bounded_retry_exhausted"
        if launcher_failure.get("exhausted") is True
        else "deterministic_launcher_blocked"
        if terminal
        else "normal_retry_scheduled"
    )
    next_action = (
        "await_provider_next_eligible"
        if deferred
        else "normal_model_run_admitted_generation"
        if decision_state == "ready"
        else
        "manual_or_environment_repair"
        if terminal
        else "normal_model_retry"
    )
    state_after = state_before
    local_repair_attempted = False
    terminal_escalation: dict[str, object] | None = None
    receipt_controller_state = decision_state
    authoritative_owner = (
        "symphony-reconciler" if alternate_permitted else SYMPHONY_OWNER
    )
    if deterministic_terminal:
        alternate["status"] = "not_permitted"
    if returned_previous_local_repair and decision_state != "ready":
        attempted.append(
            {
                "kind": "successful_local_repair_handoff",
                "result": "returned_to_normal_loop",
                "status": previous_consumed_status,
            }
        )
        transition = "returned_to_normal_loop"
        next_action = "normal_model_update_test_ready_native_merge"
        if next_retry is None:
            next_retry = previous_retry if previous_retry and previous_retry > _now() else _now()
        policy_retryable = True
        receipt_controller_state = "retrying"
        authoritative_owner = SYMPHONY_OWNER
        if isinstance(previous_alternate, dict):
            for key in ("selection", "summary"):
                if key in previous_alternate:
                    alternate[key] = previous_alternate[key]
        alternate["status"] = "repair_handoff_ready"

    if repeated:
        attempted.append(
            {
                "kind": "scheduler_ownership_handoff",
                "owner": "symphony-reconciler",
                "result": "acquired" if alternate_permitted else "not_acquired",
            }
        )
        if state_before.get("valid") and alternate_permitted:
            transition = "alternate_local_repair_started"
            _write_receipt(
                identifier,
                {
                    "schema": SCHEMA,
                    "updatedAt": _iso(_now()),
                    "generation": generation,
                    "localRepairGeneration": local_repair_generation,
                    "issue": {
                        "identifier": identifier,
                        "id": item.get("issue_id"),
                        "url": item.get("issue_url"),
                    },
                    "reason": error,
                    "launcherFailure": launcher_failure,
                    "retryPolicy": {
                        "retryable": False,
                        "maxAttempts": decision["maxAttempts"],
                        "localRepairAttempts": 1,
                        "localRepairMaxAttempts": LOCAL_REPAIR_MAX_ATTEMPTS,
                    },
                    "entryCriteria": "runtime retry/blocked after bounded normal-model attempt",
                    "authoritativeOwner": "symphony-reconciler",
                    "resourceScope": {
                        "issue": identifier,
                        "workspace": state_before.get("workspace"),
                        "head": state_before.get("head"),
                        "base": state_before.get("base"),
                        "workspaceRevision": state_before.get("workspaceRevision"),
                        "runtimeRevision": runtime.get("runtimeRevision"),
                        "capabilities": runtime.get("capabilities", []),
                    },
                    "deadline": _iso(
                        _now() + dt.timedelta(seconds=_model_timeout_seconds())
                    ),
                    "runtimeState": source,
                    "controllerState": "blocked",
                    "attempt": decision["attempt"],
                    "transition": transition,
                    "nextAutomatedAction": "await_local_repair_result",
                    "nextRetryAt": None,
                    "alternateModel": {
                        **alternate,
                        "status": "repair_started",
                    },
                },
            )
            _event(
                identifier,
                transition,
                reason=error,
                head=state_before.get("head"),
                base=state_before.get("base"),
                attempt=attempt,
            )
            repair, state_after = _alternate_repair(identifier, error, state_before)
            local_repair_attempted = True
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
                authoritative_owner = SYMPHONY_OWNER
            else:
                transition = "github_runner_handoff_required"
                next_action = "escalate_ci_platform_dependency"
                next_retry = None
                policy_retryable = False
                receipt_controller_state = "blocked"
                authoritative_owner = "symphony-reconciler"
                terminal_escalation = {
                    "owner": "symphony-reconciler",
                    "requestedOwner": "CI Platform",
                    "route": "rolling-ci-fx",
                    "state": "handoff_unaccepted",
                    "reason": str(repair.get("result") or "local_repair_failed"),
                    "trigger": "authenticated_ci_workflow_run",
                }
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

    retry_policy: dict[str, object] = {
        "retryable": policy_retryable,
        "maxAttempts": decision["maxAttempts"],
    }
    if deferred:
        retry_policy["nextEligibleAt"] = decision["nextEligibleAt"]
    if local_repair_attempted or returned_previous_local_repair:
        retry_policy.update(
            {
                "localRepairAttempts": 1,
                "localRepairMaxAttempts": LOCAL_REPAIR_MAX_ATTEMPTS,
            }
        )
    receipt: dict[str, object] = {
        "schema": SCHEMA,
        "updatedAt": _iso(_now()),
        "generation": generation,
        "localRepairGeneration": local_repair_generation,
        "issue": {
            "identifier": identifier,
            "id": item.get("issue_id"),
            "url": item.get("issue_url"),
        },
        "reason": error,
        "launcherFailure": launcher_failure,
        "retryPolicy": retry_policy,
        "entryCriteria": "runtime retry/blocked after bounded normal-model attempt",
        "authoritativeOwner": authoritative_owner,
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
            if (
                deterministic_terminal
                or decision_state == "ready"
                or terminal_escalation
            )
            else _iso(_now() + dt.timedelta(seconds=_model_timeout_seconds()))
            if alternate_permitted
            else _iso(next_retry)
            if next_retry
            else None
        ),
        "runtimeState": source,
        "controllerState": receipt_controller_state,
        "attempt": decision["attempt"],
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
    if terminal_escalation:
        receipt["terminalEscalation"] = terminal_escalation
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
    return local_repair_attempted


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
    local_limit, local_reason = _stale_capacity_local_remediation_limit()
    local_lease = _acquire_local_remediation_lease()
    if local_lease is None:
        _event(
            "control-plane",
            "bounded_local_remediation_busy"
            if local_limit
            else "reconciliation_writer_busy",
            reason=local_reason,
            capacity=local_limit,
            observed=len(items),
        )
        return 0
    local_slot_available = bool(local_limit)
    local_repair_attempts = 0
    try:
        for source, item in items:
            permitted = local_slot_available
            try:
                # A stale-capacity receipt can delegate one existing stopped
                # workspace to the local alternate repair path. No new issue
                # lease or remote mutation is admitted by that receipt.
                attempted = _reconcile_item(item, source, permitted, runtime)
                if attempted:
                    local_repair_attempts += 1
                    local_slot_available = False
            except (OSError, TypeError, ValueError, subprocess.SubprocessError) as exc:
                if permitted:
                    local_slot_available = False
                _event(
                    str(item.get("issue_identifier") or "unknown"),
                    "item_reconciliation_failed",
                    reason=type(exc).__name__,
                    next="retry_timer",
                )
        if local_limit:
            _event(
                "control-plane",
                "bounded_local_remediation_admitted"
                if local_repair_attempts
                else "bounded_local_remediation_idle",
                reason=local_reason,
                capacity=local_limit,
                observed=len(items),
                attempted=local_repair_attempts,
            )
    finally:
        _release_local_remediation_lease(local_lease)
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "runtime-receipt":
        raise SystemExit(0 if write_runtime_receipt() else 2)
    if len(sys.argv) == 2 and sys.argv[1] == "runtime-preflight":
        result = runtime_preflight()
        print(json.dumps(result, sort_keys=True))
        raise SystemExit(0 if result.get("status") == "ready" else 1)
    raise SystemExit(main())
