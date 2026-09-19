#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts/symphony/hold_autoresolve.py"
RUNTIME_PATH = ROOT / "scripts/symphony/symphony_official_runtime.py"
UTC = timezone.utc
NOW = datetime(2026, 9, 19, 13, 4, tzinfo=UTC)


def _load(path: pathlib.Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


HOLD = _load(MODULE_PATH, "hold_autoresolve")
RUNTIME = _load(RUNTIME_PATH, "symphony_official_runtime_hold")


def released_but_red(*, observed_at: str = "2026-09-05T00:00:00Z") -> dict:
    return {
        "schema": HOLD.CLOSURE_HOLD_SCHEMA,
        "status": "released",
        "reason": "closure-health-not-green",
        "closureStatus": "red",
        "newIssueIntakeAllowed": False,
        "observedAt": observed_at,
    }


class HoldAutoresolveTest(unittest.TestCase):
    def test_hold_requires_typed_reason_and_observed_at(self):
        with self.assertRaises(ValueError):
            HOLD.require_typed_hold({"schema": HOLD.CLOSURE_HOLD_SCHEMA, "status": "holding"})
        HOLD.require_typed_hold(
            {
                "schema": HOLD.CLOSURE_HOLD_SCHEMA,
                "kind": "closure-hold",
                "status": "holding",
                "reason": "closure-health-not-green",
                "observedAt": "2026-09-19T13:04:00Z",
            }
        )

    def test_released_hold_cannot_report_active_red(self):
        payload = released_but_red()
        self.assertFalse(HOLD.is_active_red_hold(payload))
        sanitized = HOLD.autoresolve_hold(payload, gate_state="AMBER")
        self.assertEqual(sanitized["status"], "released")
        self.assertEqual(sanitized["closureStatus"], "healthy")
        self.assertTrue(sanitized["newIssueIntakeAllowed"])
        self.assertFalse(sanitized["active"])
        self.assertFalse(HOLD.is_active_red_hold(sanitized))

    def test_autoresolve_when_gate_green(self):
        holding = {
            "schema": HOLD.CLOSURE_HOLD_SCHEMA,
            "status": "holding",
            "reason": "closure-health-not-green",
            "closureStatus": "red",
            "newIssueIntakeAllowed": False,
            "observedAt": "2026-09-05T00:00:00Z",
        }
        self.assertTrue(HOLD.is_active_red_hold(holding))
        cleared = HOLD.autoresolve_hold(
            holding, gate_state="GREEN", observe_only=False, now=NOW
        )
        self.assertEqual(cleared["status"], "cleared")
        self.assertEqual(cleared["reason"], "gate-green-autoresolve")
        self.assertEqual(cleared["closureStatus"], "healthy")
        self.assertTrue(cleared["newIssueIntakeAllowed"])
        self.assertFalse(cleared["active"])
        self.assertTrue(cleared["autoresolved"])
        self.assertFalse(HOLD.is_active_red_hold(cleared))

        observe_only = HOLD.autoresolve_hold(
            released_but_red(),
            gate_state={"state": "GREEN"},
            observe_only=True,
            now=NOW,
        )
        self.assertEqual(observe_only["status"], "cleared")
        self.assertEqual(observe_only["closureStatus"], "healthy")

    def test_founder_permission_holds_are_not_autoresolved(self):
        payload = {
            "schema": HOLD.ADMISSION_HOLD_SCHEMA,
            "kind": "admission_hold",
            "status": "holding",
            "reason": "external-recipient-required",
            "holdClass": "external-recipient",
            "closureStatus": "red",
            "newIssueIntakeAllowed": False,
            "observedAt": "2026-09-19T13:04:00Z",
        }
        self.assertTrue(HOLD.is_active_red_hold(payload))
        self.assertFalse(
            HOLD.should_autoresolve(payload, gate_state="GREEN", observe_only=True)
        )

    def test_runtime_write_never_persists_released_red(self):
        fields = HOLD.closure_hold_write_fields(
            {
                "reason": "closure-health-not-green",
                "closureStatus": "red",
                "newIssueIntakeAllowed": False,
            },
            status="released",
            now=NOW,
        )
        self.assertEqual(fields["closureStatus"], "healthy")
        self.assertTrue(fields["newIssueIntakeAllowed"])
        self.assertFalse(fields["active"])

    def test_runtime_reader_ignores_released_but_red_host_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "closure-hold.json"
            path.write_text(json.dumps(released_but_red()), encoding="utf-8")
            self.assertIsNone(RUNTIME.read_active_closure_hold(path))

    def test_runtime_autoresolve_rewrites_stale_red_when_gate_green(self):
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "fleet-gate.json"
            hold = pathlib.Path(tmp) / "closure-hold.json"
            observed = NOW.isoformat().replace("+00:00", "Z")
            gate.write_text(
                json.dumps(
                    {
                        "schema": "jovie-fleet-gate/v1",
                        "observedAt": observed,
                        "state": "GREEN",
                        "signals": {
                            "closureHealth": {
                                "schema": "jovie-closure-health/v1",
                                "status": "healthy",
                                "authority": "Summer",
                                "newIssueIntakeAllowed": True,
                                "promotionContinues": True,
                                "remediationContinues": True,
                                "reasons": [],
                            }
                        },
                        "closureAdmission": {
                            "allowed": True,
                            "newIssueIntakeAllowed": True,
                            "newImplementationAllowed": True,
                            "fallbackPrGenerationAllowed": True,
                            "authority": "Summer",
                            "status": "healthy",
                            "promotionContinues": True,
                            "remediationContinues": True,
                        },
                    }
                ),
                encoding="utf-8",
            )
            hold.write_text(json.dumps(released_but_red()), encoding="utf-8")
            stop = RUNTIME.ClosureStopLine(
                receipt_path=gate,
                hold_receipt_path=hold,
                dead_letter_dir=pathlib.Path(tmp) / "dead-letters",
            )
            cleared = RUNTIME.autoresolve_closure_hold_if_green(
                stop, observe_only=True, now=NOW
            )
            self.assertEqual(cleared["status"], "cleared")
            self.assertEqual(cleared["closureStatus"], "healthy")
            self.assertTrue(cleared["newIssueIntakeAllowed"])
            on_disk = json.loads(hold.read_text(encoding="utf-8"))
            self.assertEqual(on_disk["status"], "cleared")
            self.assertFalse(HOLD.is_active_red_hold(on_disk))


if __name__ == "__main__":
    unittest.main()
