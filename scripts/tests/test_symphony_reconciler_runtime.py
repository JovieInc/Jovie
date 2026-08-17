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
SOURCE = ROOT / "scripts/hermes/symphony-reconciler.py"
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
