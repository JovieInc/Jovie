#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
PATH = ROOT / "scripts/symphony/ovie_shipping_bridge.py"
SPEC = importlib.util.spec_from_file_location("ovie_shipping_bridge", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.path.insert(0, str(PATH.parent))
SPEC.loader.exec_module(MODULE)


def config(**overrides) -> MODULE.BridgeConfig:
    env = {
        "OVIE_SHIPPING_BRIDGE_TOKEN": "test-token",
        "SYMPHONY_STATE_URL": "http://127.0.0.1:4041/api/v1/state",
        "FLEET_RECEIPT_PATH": str(
            pathlib.Path(tempfile.mkdtemp()) / "fleet.json"
        ),
        "OVIE_SHIPPING_BRIDGE_STATE": tempfile.mkdtemp(),
    }
    env.update(overrides)
    return MODULE.BridgeConfig(env)


def symphony_state() -> dict:
    return {
        "generated_at": "2026-09-26T10:00:00Z",
        "running": [{"issue_identifier": "JOV-1", "head": "a" * 40}],
        "retrying": [],
        "blocked": [{"issue_identifier": "JOV-2", "head": "b" * 40}],
        "failed": [{"issue_identifier": "JOV-3"}],
    }


class AuthorityPayloadTest(unittest.TestCase):
    def test_symphony_runtime_proxies_state_with_schema(self) -> None:
        with mock.patch.object(
            MODULE, "_http_json", return_value=symphony_state()
        ):
            status, payload = MODULE.authority_payload(
                "symphony-runtime", config()
            )
        self.assertEqual(status, 200)
        self.assertEqual(payload["schema"], "symphony-runtime-state/v1")
        self.assertEqual(payload["running"][0]["issue_identifier"], "JOV-1")

    def test_symphony_task_carries_workspace_revisions(self) -> None:
        with mock.patch.object(
            MODULE, "_http_json", return_value=symphony_state()
        ):
            status, payload = MODULE.authority_payload(
                "symphony-task", config()
            )
        self.assertEqual(status, 200)
        self.assertEqual(payload["schema"], "symphony-workspace-revision/v1")
        self.assertEqual(
            payload["revisions"], {"JOV-1": "a" * 40, "JOV-2": "b" * 40}
        )
        self.assertEqual(len(payload["failed"]), 1)
        self.assertEqual(len(payload["blocked"]), 1)

    def test_symphony_unreachable_is_disconnected_not_fabricated(self) -> None:
        with mock.patch.object(
            MODULE, "_http_json", side_effect=OSError("refused")
        ):
            status, payload = MODULE.authority_payload(
                "symphony-runtime", config()
            )
        self.assertEqual(status, 503)
        self.assertEqual(payload["state"], "disconnected")
        self.assertNotIn("running", payload)

    def test_fleet_receipt_passed_through(self) -> None:
        cfg = config()
        pathlib.Path(cfg.fleet_receipt_path).write_text(
            json.dumps({"state": "GREEN", "signals": {"lease": {}}})
        )
        status, payload = MODULE.authority_payload("fleet-receipt", cfg)
        self.assertEqual(status, 200)
        self.assertEqual(payload["state"], "GREEN")
        self.assertEqual(payload["schema"], "jovie-fleet-gate/v1")

    def test_missing_fleet_receipt_is_disconnected(self) -> None:
        status, payload = MODULE.authority_payload(
            "fleet-receipt", config()
        )
        self.assertEqual(status, 503)
        self.assertEqual(payload["state"], "disconnected")

    def test_lease_guard_extracts_lease_signal(self) -> None:
        cfg = config()
        pathlib.Path(cfg.fleet_receipt_path).write_text(
            json.dumps(
                {
                    "state": "GREEN",
                    "signals": {
                        "lease": {
                            "observedAt": "2026-09-26T09:59:00Z",
                            "capacity": {"available": 2},
                        }
                    },
                }
            )
        )
        status, payload = MODULE.authority_payload("lease-guard-capacity", cfg)
        self.assertEqual(status, 200)
        self.assertEqual(payload["schema"], "symphony-lease-guard-report/v1")
        self.assertEqual(payload["capacity"]["available"], 2)

    def test_lease_guard_missing_signal_is_unavailable(self) -> None:
        cfg = config()
        pathlib.Path(cfg.fleet_receipt_path).write_text(
            json.dumps({"state": "GREEN", "signals": {}})
        )
        status, payload = MODULE.authority_payload("lease-guard-capacity", cfg)
        self.assertEqual(status, 503)
        self.assertEqual(payload["state"], "unavailable")

    def test_fixed_receipt_written_after_serve(self) -> None:
        cfg = config()
        with mock.patch.object(
            MODULE, "_http_json", return_value=symphony_state()
        ):
            status, _payload = MODULE.authority_payload("symphony-runtime", cfg)
            receipt = MODULE.write_receipt(
                cfg,
                {
                    "sourceId": "symphony-runtime",
                    "status": status,
                    "state": "fresh",
                    "sourceRevision": None,
                },
            )
        written = json.loads(receipt.read_text())
        self.assertEqual(written["schema"], "ovie-gem-bridge-receipt/v1")
        self.assertEqual(written["sourceId"], "symphony-runtime")
        self.assertEqual(written["status"], 200)
        self.assertTrue(written["emittedAt"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()
