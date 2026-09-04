"""Focused recovery contracts for the Symphony reconciler runtime."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/symphony/symphony-reconciler.py"
SPEC = importlib.util.spec_from_file_location("symphony_reconciler_runtime", SOURCE)
assert SPEC is not None and SPEC.loader is not None
sys.modules[SPEC.name] = importlib.util.module_from_spec(SPEC)
RECONCILER = sys.modules[SPEC.name]
SPEC.loader.exec_module(RECONCILER)


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _runtime_fixture(tmp_path: Path) -> tuple[dict[str, Path], dict[str, object]]:
    runtime = tmp_path / "symphony-reconciler"
    runtime.write_text("#!/usr/bin/env python3\n", encoding="utf-8")
    runtime.chmod(0o755)
    router = tmp_path / "model-router.py"
    router.write_text("#!/usr/bin/env python3\n", encoding="utf-8")
    router.chmod(0o755)
    registry = tmp_path / "model-registry.json"
    registry.write_text("{}\n", encoding="utf-8")
    manifest = tmp_path / "capabilities.json"
    manifest_payload: dict[str, object] = {
        "schema": "symphony-runtime-capabilities/v1",
        "runtime": "symphony-reconciler",
        "capabilities": sorted(RECONCILER.REQUIRED_RUNTIME_CAPABILITIES),
        "requiredFiles": ["runtime", "router", "registry"],
    }
    manifest.write_text(json.dumps(manifest_payload), encoding="utf-8")
    return (
        {
            "runtime": runtime,
            "router": router,
            "registry": registry,
            "manifest": manifest,
            "receipt": tmp_path / "runtime-receipt.json",
        },
        manifest_payload,
    )


def test_stale_clean_workspace_is_upgraded_to_fetched_origin_main(tmp_path: Path) -> None:
    remote = tmp_path / "remote.git"
    _git(tmp_path, "init", "--bare", "-q", str(remote))

    seed = tmp_path / "seed"
    seed.mkdir()
    _git(seed, "init", "-q")
    _git(seed, "config", "user.email", "test@example.com")
    _git(seed, "config", "user.name", "Test")
    (seed / "proof.txt").write_text("v1\n", encoding="utf-8")
    _git(seed, "add", "proof.txt")
    _git(seed, "commit", "-qm", "base")
    _git(seed, "branch", "-M", "main")
    _git(seed, "remote", "add", "origin", str(remote))
    _git(seed, "push", "-q", "-u", "origin", "main")

    workspace = tmp_path / "workspaces" / "JOV-1"
    workspace.parent.mkdir()
    _git(tmp_path, "clone", "-q", "--depth", "1", "-b", "main", str(remote), str(workspace))

    (seed / "proof.txt").write_text("v2\n", encoding="utf-8")
    _git(seed, "commit", "-qam", "refresh")
    _git(seed, "push", "-q", "origin", "main")
    expected_head = _git(seed, "rev-parse", "HEAD")

    with patch.dict(os.environ, {"SYMPHONY_WORKSPACE_ROOT": str(workspace.parent)}):
        state = RECONCILER._workspace_state(str(workspace), "JOV-1")

    assert state["upgrade"]["status"] == "upgraded"
    assert state["head"] == expected_head
    assert state["base"] == expected_head
    assert state["dirty"] is False
    assert state["workspaceRevision"]["schema"] == "symphony-workspace-revision/v1"
    assert state["workspaceRevision"]["statusDigest"]


def test_missing_required_capability_is_permanent_failure(tmp_path: Path) -> None:
    paths, manifest = _runtime_fixture(tmp_path)
    manifest["capabilities"] = [
        capability
        for capability in manifest["capabilities"]
        if capability != "workspace-upgrade"
    ]
    paths["manifest"].write_text(json.dumps(manifest), encoding="utf-8")

    result = RECONCILER.runtime_preflight(paths)

    assert result["status"] == "permanent_failure"
    assert result["reason"] == "required_capability_missing"
    assert result["missingCapabilities"] == ["workspace-upgrade"]


def test_missing_router_or_runtime_is_bootstrap_recoverable_only_with_source_bundle(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source-bundle"
    (source_root / "config").mkdir(parents=True)
    (source_root / "symphony-reconciler.py").write_text(
        "#!/usr/bin/env python3\n", encoding="utf-8"
    )
    (source_root / "model-router.py").write_text(
        "#!/usr/bin/env python3\n", encoding="utf-8"
    )
    (source_root / "config/model-registry.json").write_text("{}\n", encoding="utf-8")
    (source_root / "config/symphony-reconciler-capabilities.json").write_text(
        json.dumps(
            {
                "schema": "symphony-runtime-capabilities/v1",
                "runtime": "symphony-reconciler",
                "capabilities": sorted(RECONCILER.REQUIRED_RUNTIME_CAPABILITIES),
                "requiredFiles": ["runtime", "router", "registry"],
            }
        ),
        encoding="utf-8",
    )

    for missing_name in ("router", "runtime"):
        fixture_root = tmp_path / missing_name
        fixture_root.mkdir()
        paths, _ = _runtime_fixture(fixture_root)
        paths[missing_name].unlink()
        with patch.dict(os.environ, {"SYMPHONY_RUNTIME_SOURCE_ROOT": str(source_root)}):
            recoverable = RECONCILER.runtime_preflight(paths)
        with patch.dict(os.environ, {"SYMPHONY_RUNTIME_SOURCE_ROOT": ""}):
            permanent = RECONCILER.runtime_preflight(paths)

        assert recoverable["status"] == "recoverable"
        assert recoverable["reason"] == "runtime_bootstrap_required"
        assert recoverable["missingFiles"] == [missing_name]
        assert permanent["status"] == "permanent_failure"
        assert permanent["reason"] == "required_runtime_executable_missing"


def test_runtime_receipt_matches_exact_bundle_revision_and_detects_drift(tmp_path: Path) -> None:
    paths, _ = _runtime_fixture(tmp_path)

    receipt = RECONCILER.write_runtime_receipt(paths)
    assert receipt is not None
    verified = RECONCILER.runtime_preflight(paths)
    stored = json.loads(paths["receipt"].read_text(encoding="utf-8"))

    assert verified["status"] == "ready"
    assert verified["reason"] == "runtime_receipt_verified"
    assert verified["runtimeRevision"] == receipt["runtimeRevision"]
    assert stored["runtimeRevision"] == receipt["runtimeRevision"]
    assert len(receipt["runtimeRevision"]) == 64

    paths["router"].write_text("#!/usr/bin/env python3\n# changed\n", encoding="utf-8")
    stale = RECONCILER.runtime_preflight(paths)

    assert stale["status"] == "recoverable"
    assert stale["reason"] == "runtime_receipt_stale"
    assert stale["runtimeRevision"] != receipt["runtimeRevision"]
    assert verified["receipt"]["installedAt"]
    assert verified["receipt"]["runtimeHashes"] == verified["receipt"]["files"]


def test_runtime_preflight_fails_closed_for_source_drift_and_receipt_metadata(
    tmp_path: Path,
) -> None:
    runtime_root = tmp_path / "runtime"
    runtime_root.mkdir()
    paths, _ = _runtime_fixture(runtime_root)
    source_root = tmp_path / "source"
    (source_root / "config").mkdir(parents=True)
    (source_root / "symphony-reconciler.py").write_bytes(paths["runtime"].read_bytes())
    (source_root / "model-router.py").write_bytes(paths["router"].read_bytes())
    (source_root / "config/model-registry.json").write_bytes(paths["registry"].read_bytes())
    (source_root / "config/symphony-reconciler-capabilities.json").write_bytes(
        paths["manifest"].read_bytes()
    )
    with patch.dict(
        os.environ,
        {
            "SYMPHONY_RUNTIME_SOURCE_ROOT": str(source_root),
            "SYMPHONY_RUNTIME_RECEIPT": str(paths["receipt"]),
        },
    ):
        receipt = RECONCILER.write_runtime_receipt(paths)
        assert receipt is not None
        assert RECONCILER.runtime_preflight(paths)["status"] == "ready"

        source_router = source_root / "model-router.py"
        original_source = source_router.read_bytes()
        source_router.write_bytes(original_source + b"# source drift\n")
        source_drift = RECONCILER.runtime_preflight(paths)
        assert source_drift["status"] == "recoverable"
        assert source_drift["reason"] == "runtime_receipt_stale"
        source_router.write_bytes(original_source)

        original_receipt = json.loads(paths["receipt"].read_text(encoding="utf-8"))
        for field, value in (
            ("installedAt", ""),
            ("sourceHashes", {}),
            ("runtimeHashes", {}),
        ):
            malformed = {**original_receipt, field: value}
            paths["receipt"].write_text(json.dumps(malformed), encoding="utf-8")
            stale = RECONCILER.runtime_preflight(paths)
            assert stale["status"] == "recoverable", field
            assert stale["reason"] == "runtime_receipt_stale", field
        paths["receipt"].unlink()
        missing = RECONCILER.runtime_preflight(paths)
        assert missing["status"] == "recoverable"
        assert missing["reason"] == "runtime_receipt_missing"


def test_structured_and_port_exit_78_are_terminal_at_controller_retry_boundary() -> None:
    sentinel = (
        "SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 "
        'class=deterministic-launcher retryable=false maxAttempts=1 '
        'reason="no valid symphony-routing/v1 receipt for JOV-4999"'
    )
    errors = (
        sentinel,
        "agent exited: {:port_exit, 78}",
        "port_exit 78",
    )
    for error in errors:
        failure = RECONCILER.classify_launcher_failure(error)
        assert failure["retryable"] is False
        assert failure["maxAttempts"] == 1
        assert failure["class"] == "deterministic-launcher"
        decision = RECONCILER.controller_retry_decision(
            {
                "issue_identifier": "JOV-4999",
                "error": error,
                "attempt": 1,
                "generation": "gen-1",
            }
        )
        assert decision["state"] == "blocked"
        assert decision["retryable"] is False
        assert decision["maxAttempts"] == 1
        assert decision["due_at"] is None
        assert decision["lease"] is None
        assert decision["handoff"] is False
        assert decision["providerAccount"] is None
        assert decision["attempt"] == 1


def test_malformed_sentinel_attempt_bound_cannot_crash_or_expand_retries() -> None:
    terminal = RECONCILER.classify_launcher_failure(
        "SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 "
        "class=deterministic-launcher retryable=false maxAttempts=garbage"
    )
    transient = RECONCILER.classify_launcher_failure(
        "SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 "
        "class=transient-launcher retryable=true maxAttempts=999999"
    )
    assert terminal["retryable"] is False
    assert terminal["maxAttempts"] == 1
    assert transient["retryable"] is True
    assert transient["maxAttempts"] == 3


def test_exit_75_is_typed_transient_and_unknown_exit_is_bounded_not_78() -> None:
    transient = RECONCILER.classify_launcher_failure("agent exited: {:port_exit, 75}")
    unknown = RECONCILER.classify_launcher_failure("agent exited: {:port_exit, 1}")
    boom = RECONCILER.classify_launcher_failure("agent exited: :boom")
    assert transient["class"] == "transient-launcher"
    assert transient["retryable"] is True
    assert transient["code"] == "capacity-or-provider-unavailable"
    assert unknown["class"] == "unknown-launcher"
    assert unknown["retryable"] is True
    assert unknown["code"] == "unclassified-port-exit-1"
    assert boom["class"] == "unknown-launcher"
    assert boom["code"] == "unclassified-launcher-failure"
    for failure, error in (
        (transient, "agent exited: {:port_exit, 75}"),
        (unknown, "agent exited: {:port_exit, 1}"),
    ):
        decision = RECONCILER.controller_retry_decision(
            {"issue_identifier": "JOV-1", "error": error, "attempt": 0, "generation": "g"}
        )
        assert decision["state"] == "retrying"
        assert decision["retryable"] is True
        assert decision["due_at"]
        assert decision["failure"]["code"] != "deterministic-launcher-failure"
        assert decision["failure"]["class"] == failure["class"]
        exhausted = RECONCILER.controller_retry_decision(
            {
                "issue_identifier": "JOV-1",
                "error": error,
                "attempt": failure["maxAttempts"],
                "generation": "g",
            }
        )
        assert exhausted["state"] == "blocked"
        assert exhausted["retryable"] is False
        assert exhausted["maxAttempts"] == failure["maxAttempts"]
        assert exhausted["attempt"] == failure["maxAttempts"]
        assert exhausted["due_at"] is None
        assert exhausted["lease"] is None
        assert exhausted["handoff"] is False
        assert exhausted["providerAccount"] is None
        assert exhausted["failure"]["class"] == failure["class"]
        assert exhausted["failure"]["code"] != "deterministic-launcher-failure"
        assert exhausted["failure"]["exhausted"] is True


def test_jov_4999_fixture_parks_once_without_retry_deadline_or_lease(
    tmp_path: Path, monkeypatch
) -> None:
    workspace_root = tmp_path / "workspaces"
    workspace = workspace_root / "JOV-4999"
    workspace.mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=workspace, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=workspace, check=True)
    (workspace / "proof.txt").write_text("historical\n", encoding="utf-8")
    subprocess.run(["git", "add", "proof.txt"], cwd=workspace, check=True)
    subprocess.run(["git", "commit", "-qm", "base"], cwd=workspace, check=True)
    subprocess.run(["git", "remote", "add", "origin", "."], cwd=workspace, check=True)
    subprocess.run(
        ["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=workspace, check=True
    )
    assert not (workspace / ".symphony-routing.json").exists()
    monkeypatch.setenv("SYMPHONY_WORKSPACE_ROOT", str(workspace_root))
    monkeypatch.setenv("SYMPHONY_RECONCILER_STATE", str(tmp_path / "state"))

    item = {
        "issue_identifier": "JOV-4999",
        "issue_id": "historical-jov-4999",
        "issue_url": "https://linear.app/jovie/issue/JOV-4999",
        "workspace_path": str(workspace),
        "attempt": 6,
        "error": "agent exited: {:port_exit, 78}",
        "due_at": "2030-01-01T00:00:00Z",
    }
    assert RECONCILER._alternate_due(item, "retrying") is False
    RECONCILER._reconcile_item(item, "retrying", False)
    receipt_path = tmp_path / "state/receipts/JOV-4999.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert receipt["schema"] == "symphony-reconciliation-receipt/v1"
    assert receipt["launcherFailure"]["retryable"] is False
    assert receipt["retryPolicy"] == {"maxAttempts": 1, "retryable": False}
    assert receipt["nextRetryAt"] is None
    assert receipt["deadline"] is None
    assert receipt["alternateModel"]["status"] == "not_permitted"
    generation = receipt["generation"]
    decision = RECONCILER.controller_retry_decision(
        {**item, "generation": generation},
        {
            "generation": generation,
            "retryable": False,
            "attempt": 1,
            "state": "blocked",
            "failure": receipt["launcherFailure"],
        },
    )
    assert decision["state"] == "blocked"
    assert decision["due_at"] is None
    assert decision["attempt"] == 1
    assert decision["lease"] is None
    assert decision["handoff"] is False
    before = receipt_path.read_text(encoding="utf-8")
    item["attempt"] = 7
    item["due_at"] = "2030-01-02T00:00:00Z"
    RECONCILER._reconcile_item(item, "retrying", False)
    assert receipt_path.read_text(encoding="utf-8") == before
    assert not (workspace / ".symphony-routing.json").exists()


def _routing_receipt(issue: str = "JOV-4999") -> dict[str, object]:
    return {
        "schema": "symphony-routing/v1",
        "issue": issue,
        "modelId": "codex-sol",
        "model": "gpt-5.6-sol",
        "escalation": False,
        "fallback": None,
        "classification": {
            "risk": "high",
            "complexity": "high",
            "capabilities": ["root-cause", "architecture"],
            "reasons": [
                "capabilities=root-cause,architecture",
                "risk=high",
                "complexity=high",
            ],
        },
        "candidates": [],
        "capacity": {
            "accounts": 4,
            "ready": 3,
            "active": None,
            "readable": True,
        },
        "fingerprint": "9197946728dd292864478412",
    }


def test_repaired_generation_runs_only_after_routing_receipt() -> None:
    parked = RECONCILER.controller_retry_decision(
        {
            "issue_identifier": "JOV-4999",
            "error": "port_exit 78",
            "attempt": 1,
            "generation": "missing-routing",
        }
    )
    assert parked["state"] == "blocked"
    still_parked = RECONCILER.controller_retry_decision(
        {
            "issue_identifier": "JOV-4999",
            "error": "port_exit 78",
            "attempt": 7,
            "generation": "missing-routing",
        },
        {
            "generation": "missing-routing",
            "retryable": False,
            "attempt": 1,
            "state": "blocked",
            "failure": parked["failure"],
        },
        routing_receipt=None,
    )
    assert still_parked["attempt"] == 1
    assert still_parked["due_at"] is None
    repaired = RECONCILER.controller_retry_decision(
        {
            "issue_identifier": "JOV-4999",
            "error": "",
            "attempt": 1,
            "generation": "admitted-routing",
        },
        {
            "generation": "missing-routing",
            "retryable": False,
            "attempt": 1,
            "state": "blocked",
        },
        routing_receipt=_routing_receipt(),
    )
    assert repaired["state"] == "ready"
    assert repaired["retryable"] is True
    assert repaired["due_at"] is None
    assert repaired["attempt"] == 0
    assert repaired["handoff"] is False


def test_repaired_generation_rejects_partial_or_cross_issue_routing_receipt() -> None:
    previous = {
        "generation": "missing-routing",
        "retryable": False,
        "attempt": 1,
        "state": "blocked",
    }
    observation = {
        "issue_identifier": "JOV-4999",
        "error": "port_exit 78",
        "attempt": 1,
        "generation": "repaired-routing",
    }
    invalid_receipts = (
        {"schema": "symphony-routing/v1", "model": "gpt-5.6-sol"},
        _routing_receipt("JOV-OTHER"),
        {**_routing_receipt(), "fingerprint": "not-a-fingerprint"},
        {**_routing_receipt(), "capacity": None},
    )
    for receipt in invalid_receipts:
        decision = RECONCILER.controller_retry_decision(
            observation,
            previous,
            routing_receipt=receipt,
        )
        assert decision["state"] == "blocked"
        assert decision["retryable"] is False
        assert decision["due_at"] is None


def test_reconciler_consumes_materialized_receipt_once_for_repaired_generation(
    tmp_path: Path, monkeypatch
) -> None:
    workspace_root = tmp_path / "workspaces"
    workspace = workspace_root / "JOV-4999"
    workspace.mkdir(parents=True)
    _git(workspace, "init", "-q")
    _git(workspace, "config", "user.email", "test@example.com")
    _git(workspace, "config", "user.name", "Test")
    (workspace / "proof.txt").write_text("historical\n", encoding="utf-8")
    _git(workspace, "add", "proof.txt")
    _git(workspace, "commit", "-qm", "base")
    _git(workspace, "remote", "add", "origin", ".")
    _git(workspace, "update-ref", "refs/remotes/origin/main", "HEAD")
    monkeypatch.setenv("SYMPHONY_WORKSPACE_ROOT", str(workspace_root))
    monkeypatch.setenv("SYMPHONY_RECONCILER_STATE", str(tmp_path / "state"))
    item = {
        "issue_identifier": "JOV-4999",
        "workspace_path": str(workspace),
        "attempt": 1,
        "error": "port_exit 78",
    }

    RECONCILER._reconcile_item(item, "retrying", False)
    receipt_path = tmp_path / "state/receipts/JOV-4999.json"
    parked = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert parked["controllerState"] == "blocked"
    assert parked["retryPolicy"]["retryable"] is False

    routing_path = workspace / ".symphony-routing.json"
    routing_path.write_text(json.dumps(_routing_receipt()), encoding="utf-8")
    routing_path.chmod(0o600)
    RECONCILER._reconcile_item(item, "retrying", False)
    still_blocked = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert still_blocked["controllerState"] == "blocked"
    item = {**item, "error": None}
    RECONCILER._reconcile_item(item, "retrying", False)
    admitted = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert admitted["generation"] != parked["generation"]
    assert admitted["controllerState"] == "ready"
    assert admitted["transition"] == "admitted_generation_ready"
    assert admitted["nextAutomatedAction"] == "normal_model_run_admitted_generation"
    assert admitted["nextRetryAt"] is None
    assert admitted["attempt"] == 0

    RECONCILER._reconcile_item(item, "retrying", False)
    repeated = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert repeated["controllerState"] == "ready"
    assert repeated["generation"] == admitted["generation"]
    assert repeated["nextRetryAt"] is None
    assert repeated["attempt"] == 0
