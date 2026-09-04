#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[3]
PROJECTOR = ROOT / "scripts/symphony/fleet_admission_receipt.py"
GATE = ROOT / "scripts/symphony/gem-priority-gate.py"
DRAIN = ROOT / "scripts/drain-pr-queue.sh"
DEFERRED = ROOT / "scripts/lib/queue-deferred-release-admission.mjs"
SHA = "a3eeefdd4dc681d1c9b5b4385720d661f5129137"
SPEC = importlib.util.spec_from_file_location("fleet_admission_receipt", PROJECTOR)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {PROJECTOR}")
PROJECT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROJECT)
GATE_SPEC = importlib.util.spec_from_file_location("gem_priority_gate", GATE)
if GATE_SPEC is None or GATE_SPEC.loader is None:
    raise RuntimeError(f"could not load {GATE}")
GATE_MODULE = importlib.util.module_from_spec(GATE_SPEC)
GATE_SPEC.loader.exec_module(GATE_MODULE)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


from proof_fixtures import evidence

def capacity_evidence(target=4):
    return evidence(target, now_iso())


def signals(**overrides):
    review = {
        "schema": "jovie-independent-review/v1",
        "status": "passed",
        "authority": "Gem",
        "reviewer": "Gem",
        "reviewId": "review-admission",
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
        "concurrencyEvidence": capacity_evidence(),
    }
    payload.update(overrides)
    return payload


def huge_classifications() -> dict[str, object]:
    files = [f"apps/web/generated/pr-file-{index:05d}.tsx" for index in range(160)]
    evidence = [
        {"number": number, "status": "complete", "files": files}
        for number in range(1, 61)
    ]
    overlap = [f"apps/web/shared/overlap-{index:04d}.ts" for index in range(400)]
    return {
        "dispositions": [
            {"number": number, "state": "repair", "issue": f"JOV-{number}"}
            for number in range(1, 61)
        ],
        "counts": {"repair": 60},
        "unclassified": [],
        "duplicateIssueLanes": [
            {"issue": "JOV-1", "prs": [1, 2], "overlap": overlap}
        ],
        "expiredHolds": [],
        "changedFileEvidence": evidence,
    }


def evaluate_receipt(**overrides):
    return GATE_MODULE.evaluate(signals(**overrides), now_iso())


def inject_inventories(receipt: dict[str, object]) -> dict[str, object]:
    closure = dict(receipt["signals"]["closureHealth"])
    closure["classifications"] = huge_classifications()
    closure["episodes"] = {"controller": {"since": now_iso(), "active": True}}
    closure["stackHealth"] = {"roots": [], "violations": [], "repairActions": []}
    closure["repairActions"] = []
    signals_value = dict(receipt["signals"])
    signals_value["closureHealth"] = closure
    return {**receipt, "signals": signals_value}


def drain_authorization_jq() -> str:
    text = DRAIN.read_text(encoding="utf-8")
    start = text.index('.schema == "jovie-fleet-gate/v1" and')
    end = text.index("' <<<\"$FLEET_GATE_JSON\"", start)
    return text[start:end]


class FleetAdmissionReceiptTests(unittest.TestCase):
    def project_mode(self, **overrides):
        receipt = inject_inventories(evaluate_receipt(**overrides))
        source_bytes = len(json.dumps(receipt).encode())
        projection = PROJECT.project_fleet_admission_receipt(receipt)
        self.assertGreater(source_bytes, PROJECT.MAX_ADMISSION_JSON_BYTES)
        encoded = json.dumps(projection, separators=(",", ":")).encode()
        self.assertLessEqual(len(encoded), PROJECT.MAX_ADMISSION_JSON_BYTES)
        closure = projection["signals"]["closureHealth"]
        self.assertNotIn("classifications", closure)
        self.assertNotIn("episodes", closure)
        self.assertNotIn("stackHealth", closure)
        self.assertNotIn("repairActions", closure)
        return receipt, projection

    def test_exact_large_fixture_is_bounded_and_strips_inventories(self):
        source, projection = self.project_mode()
        self.assertGreater(
            len(base64.b64encode(json.dumps(source).encode())),
            131_072,
        )
        self.assertEqual(projection["schema"], "jovie-fleet-gate/v1")
        self.assertEqual(projection["promotionMode"], source["promotionMode"])
        self.assertEqual(projection["state"], source["state"])

    def test_normal_isolated_draft_hold_and_blocked_preserve_admission_fields(self):
        cases = [
            ({}, "normal"),
            ({"production": {"status": "red", "deployedSha": SHA}}, "isolated-only"),
            ({"main": {"status": "red", "sha": SHA}}, "draft-only"),
            ({"production": {"status": "green", "deployedSha": "b" * 40}}, "hold-intake"),
            ({"integrity": {"status": "active", "reason": "credential-compromise", "detail": "keys leaked"}}, "blocked"),
        ]
        jq = shutil.which("jq")
        self.assertIsNotNone(jq)
        for overrides, mode in cases:
            with self.subTest(mode=mode):
                _source, projection = self.project_mode(**overrides)
                self.assertEqual(projection["promotionMode"], mode)
                if mode != "normal":
                    accepted = subprocess.run(
                        [jq, "-e", "--arg", "mode", mode, drain_authorization_jq()],
                        input=json.dumps(projection),
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    self.assertEqual(accepted.returncode, 0, accepted.stderr)
                self.assertEqual(
                    projection["isolatedPromotionAdmission"]["allowed"],
                    _source["isolatedPromotionAdmission"]["allowed"],
                )
                self.assertEqual(
                    projection["promotionAdmission"]["allowed"],
                    _source["promotionAdmission"]["allowed"],
                )
                self.assertEqual(
                    projection["productionUnboundRepairAdmission"]["allowed"],
                    _source["productionUnboundRepairAdmission"]["allowed"],
                )
                self.assertEqual(
                    projection["signals"]["main"]["sha"],
                    _source["signals"]["main"]["sha"],
                )

    def test_deferred_release_observation_fallback_survives_projection(self):
        receipt = evaluate_receipt(
            controller={"status": "failed"},
            queue={"status": "unknown", "eligiblePrs": None, "target": 15},
        )
        receipt = inject_inventories(receipt)
        projection = PROJECT.project_fleet_admission_receipt(receipt)
        result = subprocess.run(
            ["node", str(DEFERRED), "fleet"],
            input=json.dumps(projection),
            capture_output=True,
            text=True,
            check=False,
            cwd=str(ROOT),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["allowed"])
        self.assertEqual(payload["mode"], "deferred-release-only")

    def test_missing_and_contradictory_admission_fields_are_rejected(self):
        receipt = evaluate_receipt()
        missing = dict(receipt)
        missing.pop("workAdmission")
        with self.assertRaises(PROJECT.AdmissionProjectionError):
            PROJECT.project_fleet_admission_receipt(missing)

        hold = evaluate_receipt(
            production={"status": "green", "deployedSha": "b" * 40}
        )
        self.assertEqual(hold["promotionMode"], "hold-intake")
        contradictory = dict(hold)
        contradictory["alreadyAdmittedCohort"] = {
            **hold["alreadyAdmittedCohort"],
            "preserve": False,
        }
        with self.assertRaises(PROJECT.AdmissionProjectionError):
            PROJECT.project_fleet_admission_receipt(contradictory)

        wrong_schema = dict(receipt)
        wrong_schema["schema"] = "jovie-fleet-gate/v0"
        with self.assertRaises(PROJECT.AdmissionProjectionError):
            PROJECT.project_fleet_admission_receipt(wrong_schema)

        blocked = PROJECT.project_fleet_admission_receipt(
            GATE_MODULE.failed_evaluation_receipt(RuntimeError("observe failed"))
        )
        self.assertEqual(blocked["promotionMode"], "blocked")
        self.assertFalse(blocked["promotionAdmission"]["allowed"])
        self.assertFalse(blocked["isolatedPromotionAdmission"]["allowed"])
        self.assertNotIn("stackHealth", blocked["signals"]["closureHealth"])
        self.assertNotIn("repairActions", blocked["signals"]["closureHealth"])
        self.assertEqual(blocked["productionUnboundRepairAdmission"]["maxConcurrent"], 0)

    def test_unbound_repair_receipt_accepts_max_concurrent_above_one(self):
        hold = evaluate_receipt(
            production={"status": "green", "deployedSha": "b" * 40}
        )
        self.assertEqual(hold["promotionMode"], "hold-intake")
        self.assertEqual(hold["productionUnboundRepairAdmission"]["maxConcurrent"], 4)
        self.assertFalse(hold["productionUnboundRepairAdmission"]["deploymentsAllowed"])
        self.assertEqual(hold["isolatedPromotionAdmission"].get("maxConcurrent"), 1)

        scaled = dict(hold)
        scaled["productionUnboundRepairAdmission"] = {
            **hold["productionUnboundRepairAdmission"],
            "maxConcurrent": 40,
        }
        projection = PROJECT.project_fleet_admission_receipt(scaled)
        self.assertEqual(
            projection["productionUnboundRepairAdmission"]["maxConcurrent"], 40
        )
        self.assertFalse(
            projection["productionUnboundRepairAdmission"]["deploymentsAllowed"]
        )
        jq = shutil.which("jq")
        self.assertIsNotNone(jq)
        accepted = subprocess.run(
            [jq, "-e", "--arg", "mode", "hold-intake", drain_authorization_jq()],
            input=json.dumps(projection),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(accepted.returncode, 0, accepted.stderr)

        serial = dict(hold)
        serial["productionUnboundRepairAdmission"] = {
            **hold["productionUnboundRepairAdmission"],
            "maxConcurrent": 1,
        }
        still_valid = PROJECT.project_fleet_admission_receipt(serial)
        self.assertEqual(
            still_valid["productionUnboundRepairAdmission"]["maxConcurrent"], 1
        )

        for invalid in (0, 41, True, "4"):
            broken = dict(hold)
            broken["productionUnboundRepairAdmission"] = {
                **hold["productionUnboundRepairAdmission"],
                "maxConcurrent": invalid,
            }
            with self.subTest(maxConcurrent=invalid):
                with self.assertRaises(PROJECT.AdmissionProjectionError):
                    PROJECT.project_fleet_admission_receipt(broken)

        promote = dict(hold)
        promote["productionUnboundRepairAdmission"] = {
            **hold["productionUnboundRepairAdmission"],
            "deploymentsAllowed": True,
        }
        with self.assertRaises(PROJECT.AdmissionProjectionError):
            PROJECT.project_fleet_admission_receipt(promote)

    def test_cli_projects_stdin_and_fails_closed(self):
        receipt = inject_inventories(evaluate_receipt())
        ok = subprocess.run(
            ["python3", str(PROJECTOR)],
            input=json.dumps(receipt),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(ok.returncode, 0, ok.stderr)
        projection = json.loads(ok.stdout)
        self.assertNotIn(
            "classifications", projection["signals"]["closureHealth"]
        )
        refused = subprocess.run(
            ["python3", str(PROJECTOR)],
            input="{}",
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Fleet admission projection failed", refused.stderr)


class LargeAdmissionDrainLaunchTests(unittest.TestCase):
    def test_projected_large_receipt_launches_the_drain_path(self):
        receipt = inject_inventories(
            evaluate_receipt(production={"status": "red", "deployedSha": SHA})
        )
        self.assertEqual(receipt["promotionMode"], "isolated-only")
        projection = PROJECT.project_fleet_admission_receipt(receipt)
        encoded = base64.b64encode(
            json.dumps(projection, separators=(",", ":")).encode()
        ).decode()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            fake_gh = tmp_path / "gh"
            fake_gh.write_text(
                "#!/usr/bin/env bash\n[[ \"$1 $2\" == \"pr list\" ]] && echo '[]' && exit 0\nexit 2\n"
            )
            fake_gh.chmod(fake_gh.stat().st_mode | stat.S_IXUSR)
            env = {
                **os.environ,
                "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
                "DRAIN_EXPECT_GH": str(fake_gh),
                "DRAIN_MUTATION_AUTHORIZATION": "test-fixture",
                "MERGE_QUEUE_BACKEND": "test-label-fixture",
                "DRY_RUN": "1",
                "DRAIN_PROMOTION_MODE": "isolated-only",
                "DRAIN_FLEET_GATE_B64": encoded,
            }
            result = subprocess.run(
                ["bash", str(DRAIN)],
                cwd=str(ROOT),
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("Argument list too long", result.stderr)
        self.assertNotIn("malformed or stale fleet receipt", result.stderr)
        self.assertIn("queue depth:", result.stdout)


if __name__ == "__main__":
    unittest.main()
