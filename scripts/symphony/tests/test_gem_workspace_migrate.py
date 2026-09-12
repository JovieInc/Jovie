#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/symphony/gem-workspace-migrate.py"


def load_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("gem_workspace_migrate_under_test", SCRIPT)
    if spec is None or spec.loader is None:
        raise AssertionError("could not load migration module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GemWorkspaceMigrateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_candidate_mapping_is_versioned_and_deterministic(self) -> None:
        logical, backing, bucket = self.module.candidate("elixir", "JOV-5122")
        self.assertEqual(logical, Path("/home/timwhite/symphony-elixir-workspaces/JOV-5122"))
        self.assertEqual(backing.name, "JOV-5122")
        self.assertIn("jovie-elixir", str(backing))
        self.assertIn(bucket, range(4))
        qualification = self.module.candidate("qualification", "faq-a14f41af-runtime")
        self.assertEqual(qualification[0], Path("/home/timwhite/codex-qualification/faq-a14f41af-runtime"))
        with self.assertRaises(self.module.Refusal):
            self.module.candidate("qualification", "../escape")

    def test_plan_is_read_only_and_reports_unknown_when_api_is_unavailable(self) -> None:
        args = types.SimpleNamespace(namespace="elixir", identifier="JOV-5122", api_url="http://unavailable")
        logical, backing, bucket = self.module.candidate(args.namespace, args.identifier)
        token = self.module.authorization_token(args.namespace, args.identifier, logical, backing)
        with mock.patch.object(self.module, "proc_references", return_value=[]), mock.patch.object(
            self.module, "official_state_clear", side_effect=OSError("offline")
        ):
            receipt = self.module.plan(args, logical, backing, bucket, token)
        self.assertIsNone(receipt["officialStateClear"])
        self.assertFalse(receipt["mutationPerformed"])
        self.assertEqual(receipt["authorizationToken"], token)

    def test_mutation_requires_exact_plan_token(self) -> None:
        args = types.SimpleNamespace(apply=False, authorization_token="")
        with self.assertRaisesRegex(self.module.Refusal, "exact plan authorization token"):
            self.module.require_apply(args, "expected")
        args.apply = True
        args.authorization_token = "wrong"
        with self.assertRaisesRegex(self.module.Refusal, "exact plan authorization token"):
            self.module.require_apply(args, "expected")
        args.authorization_token = "expected"
        self.module.require_apply(args, "expected")

    def test_official_state_blocks_issue_or_workspace_path(self) -> None:
        logical = Path("/home/timwhite/symphony-elixir-workspaces/JOV-5122")
        payloads = (
            {"running": [{"issue_identifier": "JOV-5122"}], "retrying": []},
            {"running": [], "retrying": [{"workspace_path": str(logical)}]},
        )
        for payload in payloads:
            with self.subTest(payload=payload), mock.patch.object(self.module, "fetch_state", return_value=payload):
                self.assertFalse(self.module.official_state_clear("elixir", "JOV-5122", logical, "fixture"))

    def test_inactive_gate_checks_api_and_proc_twice(self) -> None:
        with mock.patch.object(self.module, "official_state_clear", side_effect=[True, True]) as api, mock.patch.object(
            self.module, "proc_references", side_effect=[[], []]
        ) as proc:
            self.module.assert_inactive_twice("elixir", "JOV-1", Path("/logical"), Path("/backing"), "fixture", 0)
        self.assertEqual(api.call_count, 2)
        self.assertEqual(proc.call_count, 2)

    def test_tree_digest_covers_content_metadata_and_xattrs(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            file = root / "value.txt"
            file.write_text("one", encoding="utf-8")
            first = self.module.tree_digest(root)
            file.write_text("two", encoding="utf-8")
            second = self.module.tree_digest(root)
            self.assertNotEqual(first, second)

    def test_readback_refuses_same_boot_and_cleanup_refuses_early(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            state_file = Path(temp) / "state.json"
            payload = {
                "schema": self.module.SCHEMA,
                "stage": "switched",
                "switchBootId": "boot-a",
                "destinationInventory": {},
                "qualificationOwnerReceiptDigest": None,
                "sourceBackup": str(Path(temp) / "source"),
            }
            state_file.write_text(json.dumps(payload), encoding="utf-8")
            args = types.SimpleNamespace(apply=True, authorization_token="token", namespace="elixir", identifier="JOV-1")
            with mock.patch.object(self.module, "boot_id", return_value="boot-a"), mock.patch.object(
                self.module, "require_apply"
            ), self.assertRaisesRegex(self.module.Refusal, "later boot"):
                self.module.readback_stage(args, Path(temp) / "logical", Path(temp) / "backing", "token", state_file)

    def test_copy_stage_checks_content_metadata_and_rechecks_inactivity(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            logical = root / "logical"
            backing = root / "backing"
            state_file = root / "state.json"
            logical.mkdir()
            (logical / "value.txt").write_text("payload", encoding="utf-8")
            args = types.SimpleNamespace(
                apply=True,
                authorization_token="token",
                namespace="elixir",
                identifier="JOV-1",
                api_url="fixture",
                probe_pause_seconds=0,
            )

            def rsync(command: list[str]) -> subprocess.CompletedProcess[str]:
                if "-aHAX" in command:
                    shutil.copytree(logical, backing, dirs_exist_ok=True, copy_function=shutil.copy2)
                return subprocess.CompletedProcess(command, 0, "", "")

            with mock.patch.object(self.module, "assert_storage_topology"), mock.patch.object(
                self.module, "assert_inactive_twice"
            ) as inactive, mock.patch.object(self.module, "run_checked", side_effect=rsync), mock.patch.object(
                self.module, "RECEIPT_ROOT", root / "receipts"
            ):
                payload = self.module.copy_stage(args, logical, backing, 0, "token", state_file)

            self.assertEqual(payload["stage"], "copied")
            self.assertEqual(self.module.tree_inventory(logical), payload["sourceInventory"])
            self.assertEqual(inactive.call_count, 2)
            self.assertEqual(json.loads(state_file.read_text())["stage"], "copied")

    def test_switch_failure_rolls_back_source_and_managed_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            logical = root / "JOV-1"
            backing = root / "backing"
            state_root = root / "managed"
            state_file = root / "state.json"
            logical.mkdir()
            backing.mkdir()
            (logical / "value.txt").write_text("payload", encoding="utf-8")
            shutil.copy2(logical / "value.txt", backing / "value.txt")
            inventory = self.module.tree_inventory(logical)
            state_file.write_text(
                json.dumps({"schema": self.module.SCHEMA, "stage": "copied", "authorizationToken": "token", "sourceInventory": inventory, "destinationInventory": inventory, "qualificationOwnerReceiptDigest": None}),
                encoding="utf-8",
            )
            args = types.SimpleNamespace(
                apply=True,
                authorization_token="token",
                namespace="elixir",
                identifier="JOV-1",
                api_url="fixture",
                probe_pause_seconds=0,
            )
            with mock.patch.object(self.module, "STATE_ROOT", state_root), mock.patch.object(
                self.module, "assert_inactive_twice"
            ), mock.patch.object(self.module, "run_checked", side_effect=self.module.Refusal("mount failed")), mock.patch.object(
                self.module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")
            ):
                with self.assertRaisesRegex(self.module.Refusal, "mount failed"):
                    self.module.switch_stage(args, logical, backing, 0, "token", state_file)

            self.assertTrue((logical / "value.txt").is_file())
            self.assertFalse((state_root / "manifests/elixir--JOV-1.env").exists())
            self.assertFalse((state_root / "markers/elixir--JOV-1.marker").exists())

    def test_later_boot_readback_marks_cleanup_token_but_retention_blocks_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            mounted = root / "mounted"
            source = root / "source"
            state_file = root / "state.json"
            mounted.mkdir()
            source.mkdir()
            (mounted / "value.txt").write_text("payload", encoding="utf-8")
            inventory = self.module.tree_inventory(mounted)
            state_file.write_text(
                json.dumps({"schema": self.module.SCHEMA, "stage": "switched", "namespace": "elixir", "identifier": "JOV-1", "switchBootId": "boot-a", "destinationInventory": inventory, "qualificationOwnerReceiptDigest": None, "runtimeReadback": None, "sourceBackup": str(source)}),
                encoding="utf-8",
            )
            args = types.SimpleNamespace(
                apply=True,
                authorization_token="token",
                cleanup_token="",
                namespace="elixir",
                identifier="JOV-1",
                api_url="fixture",
                probe_pause_seconds=0,
                retention_seconds=86400,
            )
            with mock.patch.object(self.module, "boot_id", return_value="boot-b"), mock.patch.object(
                self.module, "assert_inactive_twice"
            ) as inactive, mock.patch.object(self.module, "RECEIPT_ROOT", root / "receipts"), mock.patch.object(
                self.module, "runtime_readback", return_value=None
            ):
                payload = self.module.readback_stage(args, mounted, mounted, "token", state_file)
            self.assertEqual(payload["stage"], "boot_verified")
            self.assertTrue(payload["cleanupToken"])
            self.assertEqual(inactive.call_count, 1)
            args.cleanup_token = str(payload["cleanupToken"])
            with mock.patch.object(self.module, "assert_inactive_twice"), self.assertRaisesRegex(
                self.module.Refusal, "retention delay"
            ):
                self.module.cleanup_stage(args, mounted, mounted, "token", state_file)
            self.assertTrue(source.is_dir())

    def test_qualification_requires_matching_terminal_owner_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            args = types.SimpleNamespace(namespace="qualification", identifier="fixture-a", qualification_owner_receipt="")
            with self.assertRaisesRegex(self.module.Refusal, "terminal owner receipt"):
                self.module.qualification_receipt_digest(args)
            receipt = root / "fixture-a.json"
            receipt.write_text(
                json.dumps({"schema": "codex-qualification-terminal/v1", "identifier": "fixture-a", "terminal": True, "owner": "qualification-run"}),
                encoding="utf-8",
            )
            args.qualification_owner_receipt = str(receipt)
            with mock.patch.object(self.module, "QUALIFICATION_RECEIPT_ROOT", root):
                digest = self.module.qualification_receipt_digest(args)
            self.assertEqual(digest, self.module.hashlib.sha256(receipt.read_bytes()).hexdigest())
            receipt.write_text(
                json.dumps({"schema": "codex-qualification-terminal/v1", "identifier": "fixture-a", "terminal": False, "owner": "qualification-run"}),
                encoding="utf-8",
            )
            with mock.patch.object(self.module, "QUALIFICATION_RECEIPT_ROOT", root), self.assertRaisesRegex(
                self.module.Refusal, "does not prove terminal"
            ):
                self.module.qualification_receipt_digest(args)

    def test_runtime_readback_binds_git_and_package_cache_to_logical_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            logical = Path(temp) / "JOV-1"
            logical.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=logical, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=logical, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=logical, check=True)
            (logical / "README.md").write_text("source\n", encoding="utf-8")
            subprocess.run(["git", "add", "README.md"], cwd=logical, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=logical, check=True)
            package = logical / ".symphony/package-cache/pnpm-store/v3/files/sample"
            package.parent.mkdir(parents=True)
            package.write_text("cached", encoding="utf-8")

            receipt = self.module.runtime_readback("elixir", logical)

            self.assertEqual(receipt["logicalPath"], str(logical))
            self.assertRegex(str(receipt["head"]), r"^[0-9a-f]{40}$")
            self.assertTrue(receipt["packageStoreExists"])
            self.assertTrue(receipt["packageStoreReadableSample"])


if __name__ == "__main__":
    unittest.main()
