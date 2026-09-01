#!/usr/bin/env python3

from __future__ import annotations

import gzip
import json
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/hermes/gem-disk-reclaim.py"


def run(command: list[str], cwd: pathlib.Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)


def write_json(path: pathlib.Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")


class GemDiskReclaimTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.home = self.root / "home"
        self.gem = self.home / "gem-workspace"
        self.workspaces = self.home / "symphony-workspaces"
        self.runner = self.home / "actions-runner"
        self.state = self.root / "state.json"
        self.ps = self.root / "ps.txt"
        self.receipt = self.root / "receipt.json"
        self.disk_receipt = self.root / "disk-capacity.json"
        self.capacity_receipt = self.root / "concurrency.json"
        self.log_path = self.home / "symphony-ui-pilot-logs/stdout.log"
        self.gem.mkdir(parents=True)
        self.workspaces.mkdir(parents=True)
        self.runner.mkdir(parents=True)
        self.log_path.parent.mkdir(parents=True)
        self.ps.write_text("", encoding="utf-8")
        write_json(self.state, {"running": [], "retrying": []})

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def reclaim(self, *extra: str) -> subprocess.CompletedProcess[str]:
        command = [
            "python3",
            str(SCRIPT),
            "--home",
            str(self.home),
            "--gem-workspace",
            str(self.gem),
            "--workspace-root",
            str(self.workspaces),
            "--runner-root",
            str(self.runner),
            "--symphony-state-file",
            str(self.state),
            "--ps-fixture",
            str(self.ps),
            "--receipt",
            str(self.receipt),
            "--disk-receipt",
            str(self.disk_receipt),
            "--capacity-receipt",
            str(self.capacity_receipt),
            "--log-path",
            str(self.log_path),
            "--log-max-bytes",
            "128",
            "--log-retention",
            "2",
            "--min-free-bytes",
            "1",
            "--warning-free-bytes",
            "1",
            "--timeout-seconds",
            "60",
            *extra,
        ]
        return run(command, ROOT)

    def make_workspace(self, identifier: str = "JOV-1") -> pathlib.Path:
        workspace = self.workspaces / identifier
        workspace.mkdir()
        self.assertEqual(run(["git", "init", "-q"], workspace).returncode, 0)
        self.assertEqual(run(["git", "config", "user.email", "test@example.com"], workspace).returncode, 0)
        self.assertEqual(run(["git", "config", "user.name", "Test"], workspace).returncode, 0)
        (workspace / "README.md").write_text("base\n", encoding="utf-8")
        self.assertEqual(run(["git", "add", "README.md"], workspace).returncode, 0)
        self.assertEqual(run(["git", "commit", "-qm", "base"], workspace).returncode, 0)
        self.assertEqual(run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], workspace).returncode, 0)
        write_json(
            workspace / ".symphony-routing.json",
            {
                "schema": "symphony-routing/v1",
                "issue": identifier,
                "model": "codex",
                "modelId": "codex-default",
                "escalation": False,
                "classification": {
                    "risk": "medium",
                    "complexity": "standard",
                    "capabilities": ["code"],
                    "reasons": ["test"],
                },
                "candidates": [],
                "capacity": {"readable": True, "accounts": 1},
                "fingerprint": "a" * 24,
            },
        )
        return workspace

    def make_workspace_artifact(self, workspace: pathlib.Path, name: str = "node_modules") -> pathlib.Path:
        artifact = workspace / name / "pkg"
        artifact.mkdir(parents=True)
        (artifact / "file.txt").write_text("artifact\n", encoding="utf-8")
        return workspace / name

    def make_runner_artifact(self) -> pathlib.Path:
        (self.runner / ".runner").write_text("configured\n", encoding="utf-8")
        (self.runner / "run.sh").write_text("#!/bin/sh\n", encoding="utf-8")
        work = self.runner / "_work" / "_temp" / "Jovie"
        work.mkdir(parents=True)
        (work / "checkout.txt").write_text("reproducible\n", encoding="utf-8")
        return work

    def receipt_json(self) -> dict[str, object]:
        return json.loads(self.receipt.read_text(encoding="utf-8"))

    def test_dry_run_observes_without_deleting_and_writes_receipt(self) -> None:
        workspace = self.make_workspace()
        artifact = self.make_workspace_artifact(workspace)

        result = self.reclaim("--dry-run")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(artifact.exists())
        receipt = self.receipt_json()
        self.assertEqual(receipt["schema"], "gem-disk-reclaim/v1")
        self.assertEqual(receipt["mode"], "dry-run")
        self.assertEqual(receipt["summary"]["observed"], 1)
        self.assertEqual(receipt["summary"]["mutated"], 0)

    def test_active_workspace_is_preserved_from_official_state(self) -> None:
        workspace = self.make_workspace()
        artifact = self.make_workspace_artifact(workspace)
        write_json(
            self.state,
            {"running": [{"issue_identifier": "JOV-1", "workspace_path": str(workspace)}], "retrying": []},
        )

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(artifact.exists())
        receipt = self.receipt_json()
        report = receipt["workspaces"]["roots"][0]["workspaces"][0]
        self.assertEqual(report["reason"], "workspace_active_in_symphony_state")

    def test_dirty_or_unpublished_workspace_is_preserved(self) -> None:
        dirty = self.make_workspace("JOV-2")
        dirty_artifact = self.make_workspace_artifact(dirty)
        (dirty / "README.md").write_text("dirty\n", encoding="utf-8")
        unpublished = self.make_workspace("JOV-3")
        unpublished_artifact = self.make_workspace_artifact(unpublished)
        (unpublished / "change.txt").write_text("local\n", encoding="utf-8")
        self.assertEqual(run(["git", "add", "change.txt"], unpublished).returncode, 0)
        self.assertEqual(run(["git", "commit", "-qm", "local"], unpublished).returncode, 0)

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(dirty_artifact.exists())
        self.assertTrue(unpublished_artifact.exists())
        reasons = {
            item["identifier"]: item["reason"]
            for item in self.receipt_json()["workspaces"]["roots"][0]["workspaces"]
        }
        self.assertEqual(reasons["JOV-2"], "workspace_dirty")
        self.assertEqual(reasons["JOV-3"], "workspace_has_unpublished_commits")

    def test_active_runner_is_preserved_when_runner_worker_exists(self) -> None:
        artifact = self.make_runner_artifact()
        self.ps.write_text("123 /home/actions/bin/Runner.Worker\n", encoding="utf-8")

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(artifact.exists())
        root_report = self.receipt_json()["runners"]["roots"][0]
        self.assertEqual(root_report["reason"], "runner_worker_active")

    def test_runner_work_contents_are_removed_only_for_idle_exact_runner(self) -> None:
        artifact = self.make_runner_artifact()
        checkout = self.runner / "_work" / "Jovie" / "Jovie"
        (checkout / ".git").mkdir(parents=True)
        (checkout / "README.md").write_text("source\n", encoding="utf-8")

        first = self.reclaim("--apply")
        second = self.reclaim("--apply")

        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertFalse(artifact.exists())
        self.assertTrue(checkout.exists())
        self.assertTrue((self.runner / "_work").is_dir())
        self.assertTrue((self.runner / ".runner").is_file())
        root_report = self.receipt_json()["runners"]["roots"][0]
        self.assertEqual(root_report["preserved"][0]["reason"], "runner_work_child_not_allowlisted")
        self.assertEqual(self.receipt_json()["summary"]["mutated"], 0)

    def test_runner_allowlisted_artifact_with_git_history_fails_closed(self) -> None:
        artifact = self.make_runner_artifact()
        protected = artifact / ".git"
        protected.mkdir()

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 2)
        self.assertTrue(artifact.exists())
        receipt = self.receipt_json()
        self.assertEqual(receipt["status"], "error")
        self.assertTrue(
            any("refusing protected directory below candidate" in item for item in receipt["summary"]["violations"])
        )

    def test_unexpected_workspace_symlink_fails_closed(self) -> None:
        workspace = self.make_workspace()
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_text("preserve\n", encoding="utf-8")
        (workspace / "node_modules").symlink_to(outside, target_is_directory=True)

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 2)
        self.assertTrue((outside / "secret.txt").exists())
        self.assertTrue((workspace / "node_modules").is_symlink())
        receipt = self.receipt_json()
        self.assertEqual(receipt["status"], "error")
        self.assertIn("refusing workspace artifact symlink", receipt["summary"]["violations"][0])

    def test_symlinked_exact_roots_fail_closed(self) -> None:
        workspace_target = self.root / "workspace-target"
        workspace_target.mkdir()
        workspace_link = self.root / "workspace-link"
        workspace_link.symlink_to(workspace_target, target_is_directory=True)
        runner_target = self.root / "runner-target"
        runner_target.mkdir()
        runner_link = self.root / "runner-link"
        runner_link.symlink_to(runner_target, target_is_directory=True)

        result = self.reclaim(
            "--apply",
            "--workspace-root",
            str(workspace_link),
            "--runner-root",
            str(runner_link),
        )

        self.assertEqual(result.returncode, 2)
        violations = self.receipt_json()["summary"]["violations"]
        self.assertTrue(any("refusing workspace root symlink" in item for item in violations))
        self.assertTrue(any("refusing runner root symlink" in item for item in violations))

    def test_malformed_or_stale_symphony_state_preserves_workspace(self) -> None:
        workspace = self.make_workspace()
        artifact = self.make_workspace_artifact(workspace)
        write_json(self.state, {"running": [], "retrying": "stale"})

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(artifact.exists())
        report = self.receipt_json()["workspaces"]["roots"][0]["workspaces"][0]
        self.assertRegex(report["reason"], r"^symphony_state_unavailable:")

    def test_timeout_writes_fail_closed_receipt(self) -> None:
        result = self.reclaim("--apply", "--timeout-seconds", "0")

        self.assertEqual(result.returncode, 2)
        receipt = self.receipt_json()
        self.assertEqual(receipt["status"], "timeout")
        self.assertEqual(receipt["bounded"]["timeoutSeconds"], 0.0)

    def test_log_rotation_compresses_duplicate_lines_and_enforces_retention(self) -> None:
        self.log_path.write_text(("same line\n" * 6) + "other line\n", encoding="utf-8")
        previous = self.log_path.with_name("stdout.log.1.gz")
        with gzip.open(previous, "wb") as handle:
            handle.write(b"previous\n")
        oldest = self.log_path.with_name("stdout.log.2.gz")
        with gzip.open(oldest, "wb") as handle:
            handle.write(b"oldest\n")

        result = self.reclaim("--apply", "--log-max-bytes", "10", "--log-retention", "2")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log_path.read_text(encoding="utf-8"), "")
        with gzip.open(self.log_path.with_name("stdout.log.1.gz"), "rt", encoding="utf-8") as handle:
            rotated = handle.read()
        self.assertIn("same line\n", rotated)
        self.assertIn("repeated previous line 5 time(s)", rotated)
        with gzip.open(oldest, "rt", encoding="utf-8") as handle:
            self.assertEqual(handle.read(), "previous\n")
        self.assertFalse(self.log_path.with_name("stdout.log.3.gz").exists())

    def test_protected_credential_directories_are_not_scanned_or_deleted(self) -> None:
        workspace = self.make_workspace()
        protected = workspace / ".codex" / "node_modules"
        protected.mkdir(parents=True)
        (protected / "token.txt").write_text("secret-shaped but local\n", encoding="utf-8")
        self.make_workspace_artifact(workspace, ".turbo")

        result = self.reclaim("--apply")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(protected.exists())
        self.assertFalse((workspace / ".turbo").exists())

    def test_critical_disk_writes_unaccepted_capacity_to_stop_intake(self) -> None:
        fixture = self.root / "disk.json"
        write_json(
            fixture,
            {
                str(self.home): {
                    "total": 100 * 1024,
                    "used": 99 * 1024,
                    "free": 1024,
                }
            },
        )

        result = self.reclaim(
            "--apply",
            "--disk-fixture",
            str(fixture),
            "--min-free-bytes",
            str(2 * 1024),
            "--warning-free-bytes",
            str(4 * 1024),
        )

        self.assertEqual(result.returncode, 2)
        capacity = json.loads(self.capacity_receipt.read_text(encoding="utf-8"))
        self.assertEqual(capacity["schema"], "gem-concurrency-evidence/v1")
        self.assertIs(capacity["accepted"], False)
        self.assertEqual(capacity["reason"], "disk-free-critical")
        self.assertEqual(capacity["source"], "gem-disk-reclaim")


if __name__ == "__main__":
    unittest.main()
