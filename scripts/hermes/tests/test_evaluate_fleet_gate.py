#!/usr/bin/env python3
"""Drive the shipped evaluate-fleet-gate.sh wrapper (FGR/QDR/MQ shared path)."""

from __future__ import annotations

import base64
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
            "repository": "JovieInc/Jovie",
            "status": "known",
            "eligiblePrs": 0,
            "greenReadyPrs": 0,
            "target": 15,
            "laneCapacity": {
                "schema": "jovie-lane-capacity/v2",
                "observedAt": now_iso(),
                "repositories": {"JovieInc/Jovie": {"ready": 0, "budget": 15}},
                "defaultLaneBudget": 4,
                "lanes": {},
                "sharedResources": {},
            },
        },
        "closureHealth": {
            "schema": "jovie-closure-health/v1",
            "repository": "JovieInc/Jovie",
            "status": "healthy",
            "authority": "Summer",
            "newIssueIntakeAllowed": True,
            "promotionContinues": True,
            "remediationContinues": True,
            "reasons": [],
        },
        "independentReview": review,
        "concurrencyEvidence": {
            "schema": "gem-concurrency-evidence/v1",
            "target": 4,
            "approved": True,
            "cleanRuns": 1,
            "severeIncidents": 0,
            "observedAt": now_iso(),
            "accepted": True,
        },
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
        self.assertEqual(outputs["new_issue_intake_allowed"], "true")
        self.assertEqual(outputs["promotion_allowed"], "false")
        self.assertEqual(outputs["gate_rc"], "0")

        code, outputs, receipt = run_wrapper(signals())
        self.assertEqual(code, 0)
        self.assertEqual(receipt["state"], "GREEN")
        self.assertEqual(outputs["work_allowed"], "true")
        self.assertEqual(outputs["new_issue_intake_allowed"], "true")
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
        self.assertEqual(outputs["new_issue_intake_allowed"], "false")
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

    def test_summer_closure_stop_line_emits_no_new_intake_but_keeps_work_lane_live(self):
        closure = {
            "schema": "jovie-closure-health/v1",
            "status": "red",
            "authority": "Summer",
            "newIssueIntakeAllowed": False,
            "promotionContinues": True,
            "remediationContinues": True,
            "reasons": ["duplicate-issue-lanes-unresolved"],
        }

        code, outputs, receipt = run_wrapper(signals(closureHealth=closure))

        self.assertEqual(code, 0)
        self.assertEqual(outputs["work_allowed"], "true")
        self.assertEqual(outputs["new_issue_intake_allowed"], "false")
        self.assertEqual(outputs["promotion_allowed"], "true")
        self.assertTrue(receipt["remediationAdmission"]["pushAllowed"])

    def test_unknown_main_with_exact_sha_is_schema_valid_and_blocks_promotion(self):
        code, outputs, receipt = run_wrapper(
            signals(main={"status": "unknown", "sha": SHA})
        )

        self.assertEqual(code, 0)
        self.assertEqual(receipt["signals"]["main"]["sha"], SHA)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertEqual(outputs["promotion_allowed"], "false")
        self.assertEqual(outputs["gate_rc"], "0")

    def test_expected_sha_binds_fleet_consumer_to_exact_main(self):
        code, outputs, receipt = run_wrapper(signals(), expected_sha=SHA)
        self.assertEqual(code, 0)
        self.assertEqual(receipt["signals"]["main"]["sha"], SHA)
        self.assertEqual(outputs["mode"], "normal")

        code, outputs, receipt = run_wrapper(signals(), expected_sha="b" * 40)
        self.assertEqual(code, 2)
        self.assertEqual(receipt["signals"]["main"]["sha"], SHA)
        self.assertNotEqual(outputs.get("mode"), "normal")

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

    def test_wrapper_transports_a_bounded_admission_projection(self):
        files = [f"apps/web/generated/File{index:04d}.tsx" for index in range(80)]
        closure = {
            **signals()["closureHealth"],
            "classifications": {
                "changedFileEvidence": [{"number": 1, "status": "complete", "files": files}],
                "duplicateIssueLanes": [{"issue": "JOV-1", "prs": [1, 2], "overlap": files}],
            },
            "episodes": {"controller": {"since": now_iso(), "active": True}},
        }
        code, outputs, receipt = run_wrapper(signals(closureHealth=closure))
        self.assertEqual(code, 0)
        self.assertIn("classifications", receipt["signals"]["closureHealth"])
        projection = json.loads(base64.b64decode(outputs["receipt_b64"]))
        self.assertNotIn("classifications", projection["signals"]["closureHealth"])
        self.assertNotIn("episodes", projection["signals"]["closureHealth"])
        self.assertEqual(projection["promotionMode"], "normal")
        self.assertLess(len(outputs["receipt_b64"]), 32_768)

    def test_queue_consumers_pass_only_the_bounded_projection(self):
        action = (ROOT / ".github/actions/evaluate-fleet-gate/action.yml").read_text()
        autoenroll = (
            ROOT / ".github/workflows/merge-queue-autoenroll.yml"
        ).read_text()
        deferred_release = (
            ROOT / ".github/workflows/queue-deferred-release.yml"
        ).read_text()
        wrapper = SCRIPT.read_text()
        self.assertIn(
            "DRAIN_FLEET_GATE_B64: ${{ needs.fleet-policy.outputs.receipt_b64 }}",
            autoenroll,
        )
        for needle in (
            "main_sha: ${{ steps.main-head.outputs.sha }}",
            "expected-sha: ${{ steps.main-head.outputs.sha }}",
            "ref: ${{ needs.fleet-policy.outputs.main_sha }}",
        ):
            self.assertIn(needle, autoenroll)
        for workflow in (autoenroll, deferred_release):
            self.assertIn(
                "receipt_b64: ${{ steps.policy.outputs.receipt_b64 }}", workflow
            )
        self.assertIn("Base64 bounded admission projection", action)
        self.assertIn(
            "value: ${{ steps.evaluate.outputs.receipt_b64 }}",
            action,
        )
        self.assertIn(
            'needs.fleet-policy.outputs.receipt_b64 }}" | base64 -d',
            deferred_release,
        )
        self.assertIn("fleet_admission_receipt.py", wrapper)
        self.assertIn("base64 -w0 <\"$admission\"", wrapper)
        self.assertNotIn("base64 -w0 <\"$receipt\"", wrapper)
        self.assertIn("has(\"classifications\") | not", wrapper)


if __name__ == "__main__":
    unittest.main()
