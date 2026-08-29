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
            ("maxConcurrent", 1),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                receipt = stale_capacity_receipt()
                target = (
                    receipt["remediationAdmission"]
                    if field in {"pushAllowed", "maxConcurrent"}
                    else receipt["workAdmission"]
                )
                target[field] = value
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
                mock.patch.object(MODULE, "_event"),
            ):
                self.assertEqual(MODULE.main(), 0)

            reconcile.assert_not_called()


if __name__ == "__main__":
    unittest.main()
