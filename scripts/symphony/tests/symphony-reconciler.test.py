#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/symphony-reconciler.py"
SPEC = importlib.util.spec_from_file_location("symphony_reconciler", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def stale_capacity_receipt() -> dict[str, object]:
    return {
        "schema": "jovie-fleet-gate/v1",
        "observedAt": MODULE._iso(MODULE._now()),
        "state": "GREEN",
        "signals": {"concurrencyEvidence": {"accepted": False}},
        "workAdmission": {
            "allowed": True,
            "newIssueLeaseAllowed": False,
            "newImplementationAllowed": False,
        },
        "remediationAdmission": {
            "allowed": True,
            "localAllowed": True,
            "pushAllowed": False,
            "maxConcurrent": 1,
        },
        "concurrency": {
            "gem": {
                "maxConcurrent": 1,
                "runtimeFloor": 1,
                "evidenceAccepted": False,
                "newMutationAllowed": True,
            }
        },
    }


class StaleCapacityLocalRemediationTests(unittest.TestCase):
    def _git(self, workspace: pathlib.Path, *args: str) -> None:
        subprocess.run(
            ["git", *args],
            cwd=workspace,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_stale_capacity_admits_exactly_one_local_repair(self):
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "gate.json"
            gate.write_text(json.dumps(stale_capacity_receipt()), encoding="utf-8")
            self.assertEqual(
                MODULE._stale_capacity_local_remediation_limit(gate),
                (1, "fleet_gate_stale_capacity_local_only"),
            )

    def test_floor_receipt_admits_one_local_repair_regardless_of_intake_fields(self):
        """symphony-concurrency-autoscale-v1: missing evidence runs at the
        runtime floor with push and new leases allowed; the local alternate
        repair lane stays bounded to exactly one attempt."""
        for field, value in (
            ("pushAllowed", True),
            ("newIssueLeaseAllowed", True),
            ("newImplementationAllowed", True),
            ("maxConcurrent", 2),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                receipt = stale_capacity_receipt()
                target = (
                    receipt["remediationAdmission"]
                    if field in {"pushAllowed", "maxConcurrent"}
                    else receipt["workAdmission"]
                )
                target[field] = value
                if field == "maxConcurrent":
                    receipt["concurrency"]["gem"]["maxConcurrent"] = value
                gate = pathlib.Path(tmp) / "gate.json"
                gate.write_text(json.dumps(receipt), encoding="utf-8")
                limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
                self.assertEqual(limit, 1)

    def test_zero_capacity_receipt_never_admits_local_repair(self):
        for section in ("remediationAdmission", "concurrency"):
            with self.subTest(section=section), tempfile.TemporaryDirectory() as tmp:
                receipt = stale_capacity_receipt()
                if section == "concurrency":
                    receipt["concurrency"]["gem"]["maxConcurrent"] = 0
                else:
                    receipt["remediationAdmission"]["maxConcurrent"] = 0
                gate = pathlib.Path(tmp) / "gate.json"
                gate.write_text(json.dumps(receipt), encoding="utf-8")
                limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
                self.assertEqual(limit, 0)

    def test_stale_capacity_requires_runtime_floor_not_remote_concurrency(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt = stale_capacity_receipt()
            receipt["concurrency"]["gem"]["runtimeFloor"] = 0
            gate = pathlib.Path(tmp) / "gate.json"
            gate.write_text(json.dumps(receipt), encoding="utf-8")
            limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
            self.assertEqual(limit, 0)

    def test_red_gate_receipt_never_admits_local_repair(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt = stale_capacity_receipt()
            receipt["state"] = "RED"
            gate = pathlib.Path(tmp) / "gate.json"
            gate.write_text(json.dumps(receipt), encoding="utf-8")
            limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
            self.assertEqual(limit, 0)

    def test_old_gate_receipt_cannot_repeat_local_repairs(self):
        receipt = stale_capacity_receipt()
        receipt["observedAt"] = "2026-01-01T00:00:00+00:00"
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "gate.json"
            gate.write_text(json.dumps(receipt), encoding="utf-8")
            limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
        self.assertEqual(limit, 0)

    def test_null_gate_fields_fail_closed(self):
        for field in (
            "remediationAdmission",
            "workAdmission",
            "concurrency",
            "signals",
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                receipt = stale_capacity_receipt()
                receipt[field] = None
                gate = pathlib.Path(tmp) / "gate.json"
                gate.write_text(json.dumps(receipt), encoding="utf-8")
                limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
                self.assertEqual(limit, 0)

    def test_router_not_started_consumes_local_repair_attempt(self):
        self.assertIn("not_started", MODULE.CONSUMED_LOCAL_REPAIR_STATUSES)

    def test_legacy_local_repair_receipt_holds_same_runtime_revision(self):
        state = {
            "workspace": None,
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {"schema": "symphony-workspace-revision/v1"},
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        previous = {
            "reason": "ci_failed",
            "resourceScope": {
                "head": state["head"],
                "base": state["base"],
                "runtimeRevision": "runtime-current",
            },
            "alternateModel": {"status": "repair_failed"},
            "nextAutomatedAction": "escalate_ci_platform_dependency",
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed"},
                    "retrying",
                    False,
                    runtime,
                )
            )

        write.assert_not_called()
        event.assert_any_call(
            "JOV-1",
            "completed_local_repair_held",
            reason="ci_failed",
            alternate="repair_failed",
            next="escalate_ci_platform_dependency",
            retry_at=None,
        )

    def test_legacy_local_repair_receipt_allows_new_runtime_revision_attempt(self):
        state = {
            "workspace": None,
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {"schema": "symphony-workspace-revision/v1"},
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        previous = {
            "reason": "ci_failed",
            "resourceScope": {
                "head": state["head"],
                "base": state["base"],
                "runtimeRevision": "runtime-old",
            },
            "alternateModel": {"status": "repair_failed"},
        }
        decision = {
            "state": "retrying",
            "retryable": True,
            "maxAttempts": 3,
            "due_at": "2030-01-01T00:00:00+00:00",
            "attempt": 1,
            "failure": None,
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(
                MODULE, "controller_retry_decision", return_value=decision
            ),
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed"},
                    "retrying",
                    False,
                    runtime,
                )
            )

        write.assert_called_once()
        receipt = write.call_args.args[1]
        self.assertEqual(receipt["runtimeRevision"], "runtime-current")
        self.assertNotIn(
            "completed_local_repair_held",
            [call.args[1] for call in event.call_args_list],
        )

    def test_consumed_local_repair_does_not_block_ready_generation(self):
        state = {
            "workspace": None,
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "statusDigest": "fresh-routing",
            },
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        previous = {
            "generation": "previous-full-generation",
            "localRepairGeneration": MODULE._local_repair_generation(
                "JOV-1", "ci_failed", state, runtime
            ),
            "reason": "ci_failed",
            "resourceScope": {
                "head": state["head"],
                "base": state["base"],
                "runtimeRevision": "runtime-current",
                "workspaceRevision": {
                    "schema": "symphony-workspace-revision/v1",
                    "statusDigest": "failed-repair",
                },
            },
            "alternateModel": {"status": "repair_failed"},
        }
        decision = {
            "state": "ready",
            "retryable": True,
            "maxAttempts": 3,
            "due_at": None,
            "attempt": 0,
            "failure": None,
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(
                MODULE, "controller_retry_decision", return_value=decision
            ) as retry_decision,
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed"},
                    "retrying",
                    False,
                    runtime,
                )
            )

        retry_decision.assert_called_once()
        write.assert_called_once()
        receipt = write.call_args.args[1]
        self.assertEqual(receipt["transition"], "admitted_generation_ready")
        self.assertEqual(
            receipt["nextAutomatedAction"], "normal_model_run_admitted_generation"
        )
        self.assertNotIn(
            "completed_local_repair_held",
            [call.args[1] for call in event.call_args_list],
        )

    def test_failed_local_repair_stays_held_without_fresh_routing_revision(self):
        state = {
            "workspace": None,
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "statusDigest": "failed-repair",
            },
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        previous = {
            "generation": "previous-full-generation",
            "localRepairGeneration": MODULE._local_repair_generation(
                "JOV-1", "ci_failed", state, runtime
            ),
            "reason": "ci_failed",
            "resourceScope": {
                "head": state["head"],
                "base": state["base"],
                "runtimeRevision": "runtime-current",
                "workspaceRevision": state["workspaceRevision"],
            },
            "nextAutomatedAction": "escalate_ci_platform_dependency",
            "alternateModel": {"status": "repair_failed"},
        }
        decision = {
            "state": "ready",
            "retryable": True,
            "maxAttempts": 3,
            "due_at": None,
            "attempt": 0,
            "failure": None,
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(
                MODULE, "controller_retry_decision", return_value=decision
            ),
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed"},
                    "retrying",
                    True,
                    runtime,
                )
            )

        write.assert_not_called()
        event.assert_any_call(
            "JOV-1",
            "completed_local_repair_held",
            reason="ci_failed",
            alternate="repair_failed",
            next="escalate_ci_platform_dependency",
            retry_at=None,
        )

    def test_failed_local_repair_stays_consumed_after_base_advance(self):
        previous_state = {
            "workspace": None,
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "statusDigest": "failed-repair",
            },
        }
        current_state = {
            **previous_state,
            "base": "c" * 40,
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        previous = {
            "generation": "previous-full-generation",
            "localRepairGeneration": MODULE._legacy_base_scoped_local_repair_generation(
                "JOV-1", "ci_failed", previous_state, runtime
            ),
            "reason": "ci_failed",
            "resourceScope": {
                "head": previous_state["head"],
                "base": previous_state["base"],
                "runtimeRevision": "runtime-current",
                "workspaceRevision": previous_state["workspaceRevision"],
            },
            "nextAutomatedAction": "escalate_ci_platform_dependency",
            "alternateModel": {"status": "repair_failed"},
        }
        decision = {
            "state": "ready",
            "retryable": True,
            "maxAttempts": 3,
            "due_at": None,
            "attempt": 0,
            "failure": None,
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=current_state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(
                MODULE, "controller_retry_decision", return_value=decision
            ),
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed"},
                    "retrying",
                    True,
                    runtime,
                )
            )

        write.assert_not_called()
        event.assert_any_call(
            "JOV-1",
            "completed_local_repair_held",
            reason="ci_failed",
            alternate="repair_failed",
            next="escalate_ci_platform_dependency",
            retry_at=None,
        )

    def test_started_local_repair_ready_decision_records_interruption_revision(self):
        state = {
            "workspace": "/tmp/workspaces/JOV-1",
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "statusDigest": "partial-edit",
            },
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": ["isolated-repair"]}
        previous = {
            "generation": "previous-full-generation",
            "localRepairGeneration": MODULE._local_repair_generation(
                "JOV-1", "ci_failed", state, runtime
            ),
            "reason": "ci_failed",
            "resourceScope": {
                "head": state["head"],
                "base": state["base"],
                "runtimeRevision": "runtime-current",
                "workspaceRevision": {
                    "schema": "symphony-workspace-revision/v1",
                    "statusDigest": "pre-repair",
                },
            },
            "alternateModel": {"status": "repair_started"},
        }
        decision = {
            "state": "ready",
            "retryable": True,
            "maxAttempts": 3,
            "due_at": None,
            "attempt": 0,
            "failure": None,
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(
                MODULE, "controller_retry_decision", return_value=decision
            ),
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed"},
                    "retrying",
                    True,
                    runtime,
                )
            )

        write.assert_called_once()
        receipt = write.call_args.args[1]
        self.assertEqual(receipt["transition"], "github_runner_handoff_required")
        self.assertEqual(receipt["alternateModel"]["status"], "repair_interrupted")
        self.assertEqual(
            receipt["resourceScope"]["workspaceRevision"],
            state["workspaceRevision"],
        )
        event.assert_any_call(
            "JOV-1",
            "completed_local_repair_held",
            reason="ci_failed",
            alternate="repair_started",
            next="escalate_ci_platform_dependency",
            retry_at=None,
        )

    def test_dirty_content_digest_handles_untracked_symlink_target_encoding(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = pathlib.Path(tmp)
            (workspace / "target").write_text("target\n", encoding="utf-8")
            os.symlink("target", workspace / "link")

            def git_bytes(_workspace: pathlib.Path, *args: str) -> bytes | None:
                if args[0] == "diff":
                    return b""
                if args[0] == "ls-files":
                    return b"link\0"
                return None

            actual_readlink = os.readlink
            with (
                mock.patch.object(MODULE, "_git_bytes", side_effect=git_bytes),
                mock.patch.object(MODULE.os, "readlink", side_effect=lambda path, **kw: "\udcff" if pathlib.Path(path).name == "link" else actual_readlink(path, **kw)),
            ):
                digest = MODULE._workspace_dirty_content_digest(workspace, "?? link")

        self.assertIsInstance(digest, str)

    def test_dirty_content_digest_changes_same_status_generation(self):
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            workspace = root / "JOV-1"
            workspace.mkdir()
            self._git(workspace, "init", "-b", "main")
            self._git(workspace, "config", "user.name", "Test Runner")
            self._git(workspace, "config", "user.email", "test@example.com")
            tracked = workspace / "tracked.txt"
            tracked.write_text("base\n", encoding="utf-8")
            self._git(workspace, "add", "tracked.txt")
            self._git(workspace, "commit", "-m", "base")
            self._git(workspace, "update-ref", "refs/remotes/origin/main", "HEAD")

            with mock.patch.dict(os.environ, {"SYMPHONY_WORKSPACE_ROOT": str(root)}):
                tracked.write_text("first repair\n", encoding="utf-8")
                first = MODULE._workspace_state(str(workspace), "JOV-1")
                tracked.write_text("second repair\n", encoding="utf-8")
                second = MODULE._workspace_state(str(workspace), "JOV-1")

        first_revision = first["workspaceRevision"]
        second_revision = second["workspaceRevision"]
        self.assertTrue(first_revision["dirty"])
        self.assertEqual(first_revision["statusDigest"], second_revision["statusDigest"])
        self.assertNotEqual(
            first_revision["contentDigest"],
            second_revision["contentDigest"],
        )
        self.assertNotEqual(
            MODULE._generation("JOV-1", "ci_failed", first, runtime),
            MODULE._generation("JOV-1", "ci_failed", second, runtime),
        )

    def test_successful_local_repair_same_generation_returns_normal_loop(self):
        state = {
            "workspace": None,
            "head": "a" * 40,
            "base": "b" * 40,
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "dirty": True,
                "statusDigest": "same-status",
            },
        }
        runtime = {"runtimeRevision": "runtime-current", "capabilities": []}
        previous_retry = "2030-01-01T00:00:00+00:00"
        previous = {
            "generation": MODULE._generation("JOV-1", "ci_failed", state, runtime),
            "localRepairGeneration": MODULE._local_repair_generation(
                "JOV-1", "ci_failed", state, runtime
            ),
            "reason": "ci_failed",
            "resourceScope": {
                "head": state["head"],
                "base": state["base"],
                "runtimeRevision": "runtime-current",
            },
            "launcherFailure": {"retryable": True, "exhausted": True},
            "retryPolicy": {"retryable": False, "maxAttempts": 3},
            "controllerState": "blocked",
            "attempt": 3,
            "nextAutomatedAction": "normal_model_update_test_ready_native_merge",
            "nextRetryAt": previous_retry,
            "alternateModel": {
                "status": "repair_handoff_ready",
                "selection": "local_model_ready",
                "summary": "left a repair in the workspace",
            },
        }
        decision = {
            "state": "blocked",
            "retryable": False,
            "maxAttempts": 3,
            "due_at": None,
            "attempt": 3,
            "failure": {"retryable": True, "exhausted": True},
        }

        with (
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(MODULE, "_read_receipt", return_value=previous),
            mock.patch.object(
                MODULE, "controller_retry_decision", return_value=decision
            ),
            mock.patch.object(MODULE, "_alternate_repair") as alternate_repair,
            mock.patch.object(MODULE, "_write_receipt") as write,
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertFalse(
                MODULE._reconcile_item(
                    {"issue_identifier": "JOV-1", "error": "ci_failed", "attempt": 3},
                    "blocked",
                    True,
                    runtime,
                )
            )

        alternate_repair.assert_not_called()
        write.assert_called_once()
        receipt = write.call_args.args[1]
        self.assertEqual(receipt["transition"], "returned_to_normal_loop")
        self.assertEqual(
            receipt["nextAutomatedAction"],
            "normal_model_update_test_ready_native_merge",
        )
        self.assertEqual(receipt["authoritativeOwner"], "symphony-elixir")
        self.assertEqual(receipt["controllerState"], "retrying")
        self.assertEqual(receipt["nextRetryAt"], "2030-01-01T00:00:00Z")
        self.assertEqual(receipt["alternateModel"]["status"], "repair_handoff_ready")
        self.assertEqual(receipt["retryPolicy"]["localRepairAttempts"], 1)
        self.assertNotIn(
            "completed_local_repair_held",
            [call.args[1] for call in event.call_args_list],
        )

    def test_main_delegates_only_one_stopped_workspace(self):
        items = [
            {"issue_identifier": "JOV-1", "error": "ci_failed"},
            {"issue_identifier": "JOV-2", "error": "ci_failed"},
            {"issue_identifier": "JOV-3", "error": "ci_failed"},
        ]
        calls: list[tuple[str, bool]] = []

        def reconcile(item, _source, permitted, _runtime):
            calls.append((str(item["issue_identifier"]), permitted))
            return permitted and item["issue_identifier"] == "JOV-2"

        with (
            mock.patch.object(
                MODULE, "runtime_preflight", return_value={"status": "ready"}
            ),
            mock.patch.object(MODULE, "_fetch_state", return_value={"retrying": items}),
            mock.patch.object(
                MODULE,
                "_stale_capacity_local_remediation_limit",
                return_value=(1, "fleet_gate_stale_capacity_local_only"),
            ),
            mock.patch.object(
                MODULE, "_acquire_local_remediation_lease", return_value=object()
            ),
            mock.patch.object(MODULE, "_release_local_remediation_lease"),
            mock.patch.object(MODULE, "_reconcile_item", side_effect=reconcile),
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertEqual(MODULE.main(), 0)

        self.assertEqual(
            calls,
            [("JOV-1", True), ("JOV-2", True), ("JOV-3", False)],
        )
        event.assert_any_call(
            "control-plane",
            "bounded_local_remediation_admitted",
            reason="fleet_gate_stale_capacity_local_only",
            capacity=1,
            observed=3,
            attempted=1,
        )

    def test_cross_process_lease_keeps_only_one_local_repair_owner(self):
        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch.dict(os.environ, {"SYMPHONY_RECONCILER_STATE": tmp}),
        ):
            first = MODULE._acquire_local_remediation_lease()
            self.assertIsNotNone(first)
            second = MODULE._acquire_local_remediation_lease()
            self.assertIsNone(second)
            MODULE._release_local_remediation_lease(first)
            replacement = MODULE._acquire_local_remediation_lease()
            self.assertIsNotNone(replacement)
            MODULE._release_local_remediation_lease(replacement)

    def test_alternate_repair_executes_only_in_local_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = pathlib.Path(tmp)
            state = {
                "workspace": str(workspace),
                "head": "a" * 40,
                "base": "b" * 40,
                "branch": "symphony/JOV-1-fix",
                "workspaceRevision": {"schema": "symphony-workspace-revision/v1"},
            }
            selection = {
                "model": "qwen-coder-local",
                "executor": {
                    "executable": "/bin/sh",
                    "argv": ["-c", "printf repaired > repair.marker"],
                },
            }
            with (
                mock.patch.object(
                    MODULE,
                    "_router_selection",
                    return_value=(selection, "local_model_ready"),
                ),
                mock.patch.object(MODULE, "_workspace_state", return_value=state),
            ):
                result, _state_after = MODULE._alternate_repair(
                    "JOV-1", "ci_failed", state
                )

            self.assertEqual(result["result"], "repair_handoff_ready")
            self.assertEqual((workspace / "repair.marker").read_text(), "repaired")

    def test_main_does_not_write_receipts_when_reconciler_lease_is_busy(self):
        for local_limit in (0, 1):
            with (
                self.subTest(local_limit=local_limit),
                mock.patch.object(
                    MODULE,
                    "runtime_preflight",
                    return_value={"status": "ready"},
                ),
                mock.patch.object(
                    MODULE,
                    "_fetch_state",
                    return_value={"retrying": [{"issue_identifier": "JOV-1"}]},
                ),
                mock.patch.object(
                    MODULE,
                    "_stale_capacity_local_remediation_limit",
                    return_value=(local_limit, "fleet_gate_state"),
                ),
                mock.patch.object(
                    MODULE,
                    "_acquire_local_remediation_lease",
                    return_value=None,
                ),
                mock.patch.object(MODULE, "_reconcile_item") as reconcile,
                mock.patch.object(MODULE, "_event") as event,
            ):
                self.assertEqual(MODULE.main(), 0)

            reconcile.assert_not_called()
            event.assert_any_call(
                "control-plane",
                "bounded_local_remediation_busy"
                if local_limit
                else "reconciliation_writer_busy",
                reason="fleet_gate_state",
                capacity=local_limit,
                observed=1,
            )

    def test_main_reports_idle_when_stale_capacity_does_not_attempt_repair(self):
        item = {"issue_identifier": "JOV-1", "error": "ci_failed"}
        with (
            mock.patch.object(
                MODULE, "runtime_preflight", return_value={"status": "ready"}
            ),
            mock.patch.object(
                MODULE, "_fetch_state", return_value={"retrying": [item]}
            ),
            mock.patch.object(
                MODULE,
                "_stale_capacity_local_remediation_limit",
                return_value=(1, "fleet_gate_stale_capacity_local_only"),
            ),
            mock.patch.object(
                MODULE, "_acquire_local_remediation_lease", return_value=object()
            ),
            mock.patch.object(MODULE, "_release_local_remediation_lease"),
            mock.patch.object(MODULE, "_reconcile_item", return_value=False),
            mock.patch.object(MODULE, "_event") as event,
        ):
            self.assertEqual(MODULE.main(), 0)

        event.assert_any_call(
            "control-plane",
            "bounded_local_remediation_idle",
            reason="fleet_gate_stale_capacity_local_only",
            capacity=1,
            observed=1,
            attempted=0,
        )


if __name__ == "__main__":
    unittest.main()
