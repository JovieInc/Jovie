#!/usr/bin/env python3
"""Drive the shipped evaluate-fleet-gate.sh wrapper (FGR/QDR/MQ shared path)."""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/hermes/evaluate-fleet-gate.sh"
GATE = ROOT / "scripts/hermes/gem-priority-gate.py"
SHA = "a3eeefdd4dc681d1c9b5b4385720d661f5129137"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def signals(**overrides):
    review = {
        "schema": "jovie-independent-review/v1",
        "status": "passed",
        "authority": "Gem",
        "reviewer": "Gem",
        "reviewId": "review-wrapper",
        "headSha": SHA,
        "scope": "exact-main-head",
        "observedAt": now_iso(),
        "accepted": True,
    }
    payload = {
        "main": {"status": "green", "sha": SHA},
        "production": {"status": "green", "deployedSha": SHA},
        "controller": {"status": "green"},
        "integrity": {"status": "clear"},
        "queue": {
            "status": "known",
            "eligiblePrs": 0,
            "greenReadyPrs": 0,
            "target": 15,
        },
        "independentReview": review,
    }
    payload.update(overrides)
    return payload


def run_wrapper(payload, *, consumer="fleet", expected_sha=None):
    with tempfile.TemporaryDirectory() as tmp:
        out = pathlib.Path(tmp) / "github-output"
        receipt = pathlib.Path(tmp) / "receipt.json"
        env = os.environ.copy()
        env["FLEET_GATE_EVALUATE_JSON"] = json.dumps(payload)
        env["FLEET_GATE_DRY_RUN"] = "1"
        env["FLEET_GATE_RECEIPT"] = str(receipt)
        env["FLEET_GATE_CONSUMER"] = consumer
        env["GITHUB_OUTPUT"] = str(out)
        if expected_sha is not None:
            env["EXPECTED_SHA"] = expected_sha
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            capture_output=True,
            text=True,
            check=False,
            env=env,
            cwd=str(ROOT),
        )
        outputs = {}
        if out.exists():
            for line in out.read_text().splitlines():
                if "=" in line:
                    key, value = line.split("=", 1)
                    outputs[key] = value
        return result.returncode, outputs, json.loads(receipt.read_text()) if receipt.exists() else {}


class EvaluateFleetGateWrapperTests(unittest.TestCase):
    def test_script_and_action_are_the_single_evaluate_path(self):
        self.assertTrue(SCRIPT.is_file())
        self.assertTrue(os.access(SCRIPT, os.X_OK) or SCRIPT.exists())
        action = (ROOT / ".github/actions/evaluate-fleet-gate/action.yml").read_text()
        self.assertIn("bash scripts/hermes/evaluate-fleet-gate.sh", action)
        self.assertIn("gem-priority-gate.py", SCRIPT.read_text())

    def test_wrapper_calls_shipped_cli_on_amber_green_red(self):
        self.assertTrue(GATE.is_file())
        code, outputs, receipt = run_wrapper(signals(main={"status": "red", "sha": SHA}))
        self.assertEqual(code, 0)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertEqual(outputs["work_allowed"], "true")
        self.assertEqual(outputs["promotion_allowed"], "false")
        self.assertEqual(outputs["gate_rc"], "0")

        code, outputs, receipt = run_wrapper(signals())
        self.assertEqual(code, 0)
        self.assertEqual(receipt["state"], "GREEN")
        self.assertEqual(outputs["work_allowed"], "true")
        self.assertEqual(outputs["promotion_allowed"], "true")
        self.assertEqual(outputs["mode"], "normal")

        code, outputs, receipt = run_wrapper(
            signals(
                integrity={
                    "status": "active",
                    "reason": "credential-compromise",
                    "detail": "keys leaked",
                }
            )
        )
        self.assertEqual(code, 0)
        self.assertEqual(receipt["state"], "RED")
        self.assertEqual(outputs["work_allowed"], "false")
        self.assertEqual(outputs["gate_rc"], "2")

    def test_missing_review_still_allows_isolated_lease(self):
        code, outputs, receipt = run_wrapper(
            signals(
                independentReview={
                    "schema": "jovie-independent-review/v1",
                    "accepted": False,
                    "reason": "independent-review-receipt-missing",
                }
            )
        )
        self.assertEqual(code, 0)
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertEqual(outputs["promotion_allowed"], "false")

    def test_deployment_consumer_uses_deployment_admission_not_promotion(self):
        action = (ROOT / ".github/actions/evaluate-fleet-gate/action.yml").read_text()
        self.assertIn("FLEET_GATE_CONSUMER", action)
        self.assertIn("deployment_allowed", action)

        code, outputs, receipt = run_wrapper(signals(), consumer="deployment", expected_sha=SHA)
        self.assertEqual(code, 0)
        self.assertEqual(receipt["state"], "GREEN")
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])
        self.assertEqual(outputs["deployment_allowed"], "true")
        self.assertEqual(outputs["mode"], "normal")
        self.assertEqual(outputs["gate_rc"], "0")

        code, outputs, receipt = run_wrapper(
            signals(
                independentReview={
                    "schema": "jovie-independent-review/v1",
                    "accepted": False,
                    "reason": "independent-review-receipt-missing",
                }
            ),
            consumer="deployment",
            expected_sha=SHA,
        )
        self.assertEqual(code, 0)
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])
        self.assertEqual(outputs["deployment_allowed"], "true")
        self.assertEqual(outputs["promotion_allowed"], "false")
        self.assertEqual(outputs["mode"], "normal")

        code, outputs, receipt = run_wrapper(
            signals(
                integrity={
                    "status": "active",
                    "reason": "credential-compromise",
                    "detail": "keys leaked",
                }
            ),
            consumer="deployment",
            expected_sha=SHA,
        )
        self.assertEqual(code, 0)
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])
        self.assertEqual(outputs["deployment_allowed"], "false")
        self.assertEqual(outputs["gate_rc"], "2")
        self.assertEqual(outputs["mode"], "blocked")

        code, outputs, receipt = run_wrapper(
            signals(), consumer="deployment", expected_sha="b" * 40
        )
        self.assertEqual(code, 2)
        self.assertEqual(receipt["signals"]["main"]["sha"], SHA)
        self.assertNotEqual(outputs.get("mode"), "normal")

    def test_unknown_consumer_fails_closed(self):
        code, outputs, receipt = run_wrapper(signals(), consumer="promotion")
        self.assertEqual(code, 2)
        self.assertEqual(receipt, {})


if __name__ == "__main__":
    unittest.main()
