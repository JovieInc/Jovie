#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/symphony-reconciler.py"
SPEC = importlib.util.spec_from_file_location("symphony_reconciler", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

GATE_SOURCE = ROOT / "scripts/hermes/gem-priority-gate.py"
GATE_SPEC = importlib.util.spec_from_file_location(
    "gem_priority_gate_for_reconciler", GATE_SOURCE
)
if GATE_SPEC is None or GATE_SPEC.loader is None:
    raise RuntimeError(f"could not load {GATE_SOURCE}")
GATE_MODULE = importlib.util.module_from_spec(GATE_SPEC)
GATE_SPEC.loader.exec_module(GATE_MODULE)

CONTRACT_SOURCE = ROOT / "scripts/hermes/gem_gate_contract.py"
CONTRACT_SPEC = importlib.util.spec_from_file_location(
    "gem_gate_contract_for_reconciler", CONTRACT_SOURCE
)
if CONTRACT_SPEC is None or CONTRACT_SPEC.loader is None:
    raise RuntimeError(f"could not load {CONTRACT_SOURCE}")
CONTRACT_MODULE = importlib.util.module_from_spec(CONTRACT_SPEC)
CONTRACT_SPEC.loader.exec_module(CONTRACT_MODULE)

DRAIN_SOURCE = ROOT / "scripts/hermes/gem-pr-drain.py"
DRAIN_SPEC = importlib.util.spec_from_file_location(
    "gem_pr_drain_for_reconciler", DRAIN_SOURCE
)
if DRAIN_SPEC is None or DRAIN_SPEC.loader is None:
    raise RuntimeError(f"could not load {DRAIN_SOURCE}")
DRAIN_MODULE = importlib.util.module_from_spec(DRAIN_SPEC)
DRAIN_SPEC.loader.exec_module(DRAIN_MODULE)


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
            "maxConcurrent": 0,
        },
        "concurrency": {
            "gem": {
                "maxConcurrent": 0,
                "runtimeFloor": 1,
                "evidenceAccepted": False,
                "newMutationAllowed": False,
            }
        },
    }


class StaleCapacityLocalRemediationTests(unittest.TestCase):
    def test_stale_capacity_admits_exactly_one_local_repair(self):
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "gate.json"
            gate.write_text(json.dumps(stale_capacity_receipt()), encoding="utf-8")
            self.assertEqual(
                MODULE._stale_capacity_local_remediation_limit(gate),
                (1, "fleet_gate_stale_capacity_local_only"),
            )

    def test_stale_capacity_rejects_remote_or_new_intake_permissions(self):
        for field, value in (
            ("pushAllowed", True),
            ("newIssueLeaseAllowed", True),
            ("newImplementationAllowed", True),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                receipt = stale_capacity_receipt()
                target = (
                    receipt["remediationAdmission"]
                    if field == "pushAllowed"
                    else receipt["workAdmission"]
                )
                target[field] = value
                gate = pathlib.Path(tmp) / "gate.json"
                gate.write_text(json.dumps(receipt), encoding="utf-8")
                limit, _reason = MODULE._stale_capacity_local_remediation_limit(gate)
                self.assertEqual(limit, 0)

    def test_stale_capacity_rejects_more_than_one_local_runtime_slot(self):
        receipt = stale_capacity_receipt()
        receipt["concurrency"]["gem"]["runtimeFloor"] = 2
        with tempfile.TemporaryDirectory() as tmp:
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

    def test_unavailable_non_object_and_future_gate_receipts_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = pathlib.Path(tmp)
            missing = directory / "missing.json"
            self.assertEqual(
                MODULE._stale_capacity_local_remediation_limit(missing),
                (0, "fleet_gate_unavailable"),
            )

            non_object = directory / "non-object.json"
            non_object.write_text("[]", encoding="utf-8")
            self.assertEqual(
                MODULE._stale_capacity_local_remediation_limit(non_object),
                (0, "fleet_gate_local_remediation_not_admitted"),
            )

            receipt = stale_capacity_receipt()
            receipt["observedAt"] = MODULE._iso(
                MODULE._now() + MODULE.dt.timedelta(minutes=2)
            )
            future = directory / "future.json"
            future.write_text(json.dumps(receipt), encoding="utf-8")
            self.assertEqual(
                MODULE._stale_capacity_local_remediation_limit(future),
                (0, "fleet_gate_local_remediation_not_admitted"),
            )

    def test_failed_red_gate_receipt_admits_only_local_runtime_floor(self):
        receipt = GATE_MODULE.failed_evaluation_receipt(
            ValueError("capacity evidence unavailable")
        )
        CONTRACT_MODULE.validate_gate_result(
            0, json.dumps(receipt), "remediation"
        )
        self.assertEqual(
            DRAIN_MODULE.effective_capacity(8, receipt),
            0,
        )
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "gate.json"
            gate.write_text(json.dumps(receipt), encoding="utf-8")
            self.assertEqual(
                MODULE._stale_capacity_local_remediation_limit(gate),
                (1, "fleet_gate_stale_capacity_local_only"),
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
            mock.patch.object(MODULE, "_event"),
        ):
            self.assertEqual(MODULE.main(), 0)

        self.assertEqual(
            calls,
            [("JOV-1", True), ("JOV-2", True), ("JOV-3", False)],
        )

    def test_main_without_capacity_reconciles_all_items_without_local_repair(self):
        items = [
            {"issue_identifier": "JOV-1", "error": "ci_failed"},
            {"issue_identifier": "JOV-2", "error": "ci_failed"},
        ]
        lease = object()
        with (
            mock.patch.object(
                MODULE, "runtime_preflight", return_value={"status": "ready"}
            ),
            mock.patch.object(MODULE, "_fetch_state", return_value={"retrying": items}),
            mock.patch.object(
                MODULE,
                "_stale_capacity_local_remediation_limit",
                return_value=(0, "fleet_gate_local_remediation_not_admitted"),
            ),
            mock.patch.object(
                MODULE, "_acquire_local_remediation_lease", return_value=lease
            ),
            mock.patch.object(
                MODULE, "_release_local_remediation_lease"
            ) as release,
            mock.patch.object(MODULE, "_reconcile_item", return_value=False) as reconcile,
            mock.patch.object(MODULE, "_event"),
        ):
            self.assertEqual(MODULE.main(), 0)

        self.assertEqual(
            [call.args[2] for call in reconcile.call_args_list],
            [False, False],
        )
        release.assert_called_once_with(lease)

    def test_permitted_item_exception_consumes_the_only_local_slot(self):
        items = [
            {"issue_identifier": "JOV-1", "error": "ci_failed"},
            {"issue_identifier": "JOV-2", "error": "ci_failed"},
        ]
        permissions: list[bool] = []

        def reconcile(_item, _source, permitted, _runtime):
            permissions.append(permitted)
            if len(permissions) == 1:
                raise OSError("executor failed after admission")
            return False

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
            mock.patch.object(MODULE, "_event"),
        ):
            self.assertEqual(MODULE.main(), 0)

        self.assertEqual(permissions, [True, False])

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
                mock.patch.object(
                    MODULE,
                    "_sandboxed_executor_command",
                    side_effect=lambda executable, argv, _workspace, _proxy: (
                        [executable, *argv],
                        "test_direct_executor",
                    ),
                ),
            ):
                result, _state_after = MODULE._alternate_repair(
                    "JOV-1", "ci_failed", state
                )

            self.assertEqual(result["result"], "repair_handoff_ready")
            self.assertEqual((workspace / "repair.marker").read_text(), "repaired")

    def test_missing_sandbox_fails_closed_without_starting_executor(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = pathlib.Path(tmp)
            selection = {
                "model": "qwen-coder-local",
                "executor": {
                    "executable": "/missing/hermes",
                    "argv": ["{prompt}"],
                },
            }
            state = {
                "workspace": str(workspace),
                "head": "a" * 40,
                "base": "b" * 40,
                "branch": "symphony/JOV-1-fix",
                "workspaceRevision": {"statusDigest": "before"},
            }
            with (
                mock.patch.object(
                    MODULE,
                    "_router_selection",
                    return_value=(selection, "local_model_ready"),
                ),
                mock.patch.object(
                    MODULE,
                    "_sandboxed_executor_command",
                    return_value=(None, "local_repair_sandbox_missing"),
                ),
                mock.patch.object(MODULE.subprocess, "run") as run,
            ):
                result, state_after = MODULE._alternate_repair(
                    "JOV-1", "ci_failed", state
                )

        self.assertEqual(result["result"], "repair_not_started")
        self.assertEqual(result["reason"], "local_repair_sandbox_missing")
        self.assertEqual(state_after, state)
        run.assert_not_called()

    @unittest.skipUnless(
        pathlib.Path("/usr/bin/bwrap").is_file(),
        "Bubblewrap is required for the live sandbox boundary test",
    )
    def test_bubblewrap_blocks_writes_outside_exact_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            agent_root = root / "agent"
            workspace = root / "workspace"
            proxy = root / "proxy"
            agent_root.mkdir()
            workspace.mkdir()
            proxy.mkdir()
            outside = root / "outside.marker"
            agent = agent_root / "agent.sh"
            agent.write_text(
                "#!/bin/sh\n"
                "touch /workspace/inside.marker\n"
                f"touch {outside} 2>/dev/null || true\n"
                "python3 -c 'import socket; socket.create_connection((\"1.1.1.1\", 53), 1)' "
                "2>/dev/null && exit 42 || touch /workspace/network-blocked.marker\n",
                encoding="utf-8",
            )
            agent.chmod(0o755)
            with mock.patch.dict(
                os.environ,
                {
                    "SYMPHONY_REPAIR_AGENT_ROOT": str(agent_root),
                    "SYMPHONY_REPAIR_BWRAP": "/usr/bin/bwrap",
                },
            ):
                command, reason = MODULE._sandboxed_executor_command(
                    str(agent), [], workspace, proxy
                )
            self.assertEqual(reason, "local_repair_sandbox_ready")
            self.assertIsNotNone(command)
            completed = MODULE.subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
                env={"PATH": "/usr/bin:/bin"},
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((workspace / "inside.marker").is_file())
            self.assertTrue((workspace / "network-blocked.marker").is_file())
            self.assertFalse(outside.exists())

    def test_failed_local_repair_terminates_into_github_runner_handoff(self):
        state_before = {
            "workspace": "/tmp/symphony-workspaces/JOV-1",
            "valid": True,
            "head": "a" * 40,
            "base": "b" * 40,
            "conflictedPaths": ["scripts/hermes/symphony-reconciler.py"],
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "statusDigest": "before",
            },
        }
        state_after = {
            **state_before,
            "workspaceRevision": {
                "schema": "symphony-workspace-revision/v1",
                "statusDigest": "after",
            },
        }
        runtime = {
            "runtimeRevision": "c" * 64,
            "capabilities": ["isolated-repair"],
            "receipt": {"schema": "symphony-runtime-receipt/v1"},
        }
        item = {
            "issue_identifier": "JOV-1",
            "workspace_path": state_before["workspace"],
            "error": "ci_failed",
            "attempt": 3,
        }
        failed = {
            "kind": "alternate_local_model",
            "model": MODULE.MODEL_ID,
            "selection": "local_model_ready",
            "result": "repair_failed",
            "summary": "focused test still fails",
        }

        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch.dict(os.environ, {"SYMPHONY_RECONCILER_STATE": tmp}),
            mock.patch.object(
                MODULE,
                "_workspace_state",
                side_effect=[state_before, state_after],
            ),
            mock.patch.object(
                MODULE, "_alternate_repair", return_value=(failed, state_after)
            ) as repair,
            mock.patch.object(MODULE, "_event"),
        ):
            self.assertTrue(MODULE._reconcile_item(item, "retrying", True, runtime))
            receipt = MODULE._read_receipt("JOV-1")
            self.assertIsNotNone(receipt)
            self.assertEqual(receipt["transition"], "github_runner_handoff_required")
            self.assertEqual(receipt["nextAutomatedAction"], "escalate_ci_platform_dependency")
            self.assertIsNone(receipt["nextRetryAt"])
            self.assertFalse(receipt["retryPolicy"]["retryable"])
            self.assertEqual(receipt["controllerState"], "blocked")
            self.assertEqual(receipt["authoritativeOwner"], "symphony-reconciler")
            self.assertEqual(receipt["retryPolicy"]["localRepairAttempts"], 1)
            self.assertEqual(receipt["retryPolicy"]["localRepairMaxAttempts"], 1)
            self.assertEqual(
                receipt["terminalEscalation"],
                {
                    "owner": "symphony-reconciler",
                    "requestedOwner": "CI Platform",
                    "route": "rolling-ci-fx",
                    "state": "handoff_unaccepted",
                    "reason": "repair_failed",
                    "trigger": "authenticated_ci_workflow_run",
                },
            )

            self.assertFalse(MODULE._reconcile_item(item, "retrying", True, runtime))
            repair.assert_called_once()

    def test_successful_local_repair_returns_ownership_to_symphony(self):
        state_before = {
            "workspace": "/tmp/symphony-workspaces/JOV-3",
            "valid": True,
            "head": "1" * 40,
            "base": "2" * 40,
            "conflictedPaths": ["scripts/hermes/symphony-reconciler.py"],
            "workspaceRevision": {"statusDigest": "before"},
        }
        state_after = {
            **state_before,
            "workspaceRevision": {"statusDigest": "after"},
        }
        runtime = {
            "runtimeRevision": "3" * 64,
            "capabilities": ["isolated-repair"],
            "receipt": {"schema": "symphony-runtime-receipt/v1"},
        }
        item = {
            "issue_identifier": "JOV-3",
            "workspace_path": state_before["workspace"],
            "error": "ci_failed",
            "attempt": 3,
        }
        repaired = {
            "kind": "alternate_local_model",
            "model": MODULE.MODEL_ID,
            "selection": "local_model_ready",
            "result": "repair_handoff_ready",
            "summary": "focused tests pass",
        }
        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch.dict(os.environ, {"SYMPHONY_RECONCILER_STATE": tmp}),
            mock.patch.object(
                MODULE, "_workspace_state", side_effect=[state_before, state_after]
            ),
            mock.patch.object(
                MODULE, "_alternate_repair", return_value=(repaired, state_after)
            ),
            mock.patch.object(MODULE, "_event"),
        ):
            self.assertTrue(MODULE._reconcile_item(item, "retrying", True, runtime))
            receipt = MODULE._read_receipt("JOV-3")

            self.assertFalse(MODULE._reconcile_item(item, "retrying", True, runtime))

        self.assertEqual(receipt["transition"], "returned_to_normal_loop")
        self.assertEqual(
            receipt["nextAutomatedAction"],
            "normal_model_update_test_ready_native_merge",
        )
        self.assertEqual(receipt["authoritativeOwner"], "symphony-ui-pilot")
        self.assertIsNotNone(receipt["nextRetryAt"])
        self.assertNotIn("terminalEscalation", receipt)

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
                mock.patch.object(MODULE, "_event"),
            ):
                self.assertEqual(MODULE.main(), 0)

            reconcile.assert_not_called()

    def test_started_local_attempt_is_persisted_before_executor_failure(self):
        state = {
            "workspace": "/tmp/symphony-workspaces/JOV-2",
            "valid": True,
            "head": "d" * 40,
            "base": "e" * 40,
            "conflictedPaths": ["scripts/hermes/symphony-reconciler.py"],
            "workspaceRevision": {"statusDigest": "unchanged"},
        }
        runtime = {
            "runtimeRevision": "f" * 64,
            "capabilities": ["isolated-repair"],
            "receipt": {"schema": "symphony-runtime-receipt/v1"},
        }
        item = {
            "issue_identifier": "JOV-2",
            "workspace_path": state["workspace"],
            "error": "ci_failed",
            "attempt": 3,
        }

        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch.dict(os.environ, {"SYMPHONY_RECONCILER_STATE": tmp}),
            mock.patch.object(MODULE, "_workspace_state", return_value=state),
            mock.patch.object(
                MODULE,
                "_alternate_repair",
                side_effect=OSError("lost executor"),
            ) as repair,
            mock.patch.object(MODULE, "_event"),
        ):
            with self.assertRaises(OSError):
                MODULE._reconcile_item(item, "retrying", True, runtime)
            started = MODULE._read_receipt("JOV-2")
            self.assertEqual(started["alternateModel"]["status"], "repair_started")
            self.assertEqual(started["retryPolicy"]["localRepairAttempts"], 1)

            self.assertFalse(MODULE._reconcile_item(item, "retrying", True, runtime))
            interrupted = MODULE._read_receipt("JOV-2")
            self.assertEqual(
                interrupted["alternateModel"]["status"],
                "repair_interrupted",
            )
            self.assertEqual(interrupted["controllerState"], "blocked")
            repair.assert_called_once()


if __name__ == "__main__":
    unittest.main()
