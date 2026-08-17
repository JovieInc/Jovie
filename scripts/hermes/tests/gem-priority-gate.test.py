#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
GATE = ROOT / "scripts/hermes/gem-priority-gate.py"
AUTOENROLL_WORKFLOW = ROOT / ".github/workflows/merge-queue-autoenroll.yml"
# Historical stub printed by the __main__ except block before JOV-5067.
# Auto-Enroll jq fail-closed on this shape: missing observedAt, signals,
# isolatedPromotionAdmission, and promotionMode.
LEGACY_FLEET_GATE_STUB = {
    "schema": "jovie-fleet-gate/v1",
    "state": "RED",
    "workAdmission": {"allowed": False},
    "promotionAdmission": {"allowed": False},
    "deploymentAdmission": {"allowed": False},
}
SPEC = importlib.util.spec_from_file_location("gem_priority_gate", GATE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {GATE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, url: str, payload: dict[str, object], status: int = 200):
        self._url = url
        self._payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self) -> str:
        return self._url

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


def urlopen_router(payloads: dict[str, object]):
    def _open(url: str, timeout: float = 0):
        for suffix, payload in payloads.items():
            if url.endswith(suffix):
                if isinstance(payload, Exception):
                    raise payload
                return FakeResponse(url, payload)
        raise AssertionError(f"unexpected urlopen target: {url}")

    return _open


class MainReleaseReadySelectionTests(unittest.TestCase):
    def test_ignores_newer_skipped_check_when_a_success_exists(self):
        latest = MODULE.select_main_release_ready(
            [
                {
                    "conclusion": "skipped",
                    "started_at": "2026-08-17T19:46:00Z",
                    "completed_at": "2026-08-17T19:46:00Z",
                },
                {
                    "conclusion": "success",
                    "started_at": "2026-08-17T19:45:12Z",
                    "completed_at": "2026-08-17T19:45:16Z",
                },
            ]
        )
        self.assertEqual(latest["conclusion"], "success")

    def test_prefers_in_progress_over_stale_success(self):
        latest = MODULE.select_main_release_ready(
            [
                {
                    "conclusion": "success",
                    "started_at": "2026-08-17T19:40:00Z",
                    "completed_at": "2026-08-17T19:40:10Z",
                },
                {
                    "conclusion": None,
                    "status": "in_progress",
                    "started_at": "2026-08-17T19:47:00Z",
                },
            ]
        )
        self.assertEqual(latest.get("status"), "in_progress")

    def test_all_skipped_falls_back_to_latest_skip(self):
        latest = MODULE.select_main_release_ready(
            [
                {
                    "conclusion": "skipped",
                    "started_at": "2026-08-17T19:40:00Z",
                },
                {
                    "conclusion": "skipped",
                    "started_at": "2026-08-17T19:41:00Z",
                },
            ]
        )
        self.assertEqual(latest["started_at"], "2026-08-17T19:41:00Z")


class ProductionHealthTests(unittest.TestCase):
    def test_default_uses_the_dedicated_deploy_health_contract(self):
        with (
            mock.patch.dict(os.environ, {"JOVIE_PRODUCTION_HEALTH_URL": ""}),
            mock.patch.object(sys, "argv", [str(GATE)]),
        ):
            args = MODULE.parse_args()

        self.assertEqual(args.production_url, "https://jov.ie/api/health/deploy")

    def test_default_queue_backpressure_threshold_is_fifteen(self):
        with mock.patch.object(sys, "argv", [str(GATE)]):
            args = MODULE.parse_args()

        self.assertEqual(args.queue_target, 15)

    def test_deploy_health_healthy_is_green_and_bound_to_deployed_sha(self):
        url = "https://jov.ie/api/health/deploy"
        router = urlopen_router(
            {
                "/api/health/deploy": {"status": "healthy"},
                "/api/health/build-info": {"commitSha": "a" * 40},
            }
        )

        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=router):
            observed = MODULE.observe_production(url)

        self.assertEqual(
            observed,
            {
                "status": "green",
                "url": url,
                "reportedStatus": "healthy",
                "deployedSha": "a" * 40,
            },
        )

    def test_legacy_ok_status_remains_compatible_for_explicit_overrides(self):
        url = "https://example.test/health"
        router = urlopen_router(
            {
                "/health": {"status": "ok"},
                "/build-info": {"commitSha": "a" * 40},
            }
        )

        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=router):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "green")
        self.assertEqual(observed["reportedStatus"], "ok")
        self.assertEqual(observed["deployedSha"], "a" * 40)

    def test_green_health_without_build_info_is_green_but_unbound(self):
        url = "https://jov.ie/api/health/deploy"
        router = urlopen_router(
            {
                "/api/health/deploy": {"status": "healthy"},
                "/api/health/build-info": MODULE.urllib.error.URLError("down"),
            }
        )

        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=router):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "green")
        self.assertIsNone(observed["deployedSha"])
        self.assertIn("build-info-observation-failed", observed["buildInfoError"])

    def test_unhealthy_deploy_contract_is_red(self):
        url = "https://jov.ie/api/health/deploy"
        response = FakeResponse(url, {"status": "unhealthy"})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "red")
        self.assertEqual(observed["reportedStatus"], "unhealthy")

    def test_malformed_unhashable_status_fails_closed(self):
        url = "https://jov.ie/api/health/deploy"
        response = FakeResponse(url, {"status": {"unexpected": True}})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "red")
        self.assertEqual(observed["reportedStatus"], {"unexpected": True})


MAIN_SHA = "a3eeefdd4dc681d1c9b5b4385720d661f5129137"

GREEN_SIGNALS: dict[str, object] = {
    "main": {"status": "green", "sha": MAIN_SHA},
    "production": {"status": "green", "deployedSha": MAIN_SHA},
    "controller": {"status": "green"},
    "integrity": {"status": "clear"},
    "queue": {
        "status": "known",
        "eligiblePrs": 0,
        "greenReadyPrs": 0,
        "target": 15,
    },
    "independentReview": {
        "schema": "jovie-independent-review/v1",
        "status": "passed",
        "authority": "Gem",
        "reviewer": "Gem",
        "reviewId": "review-2026-08-13-1200",
        "headSha": MAIN_SHA,
        "scope": "exact-main-head",
        "observedAt": MODULE.isoformat(MODULE.utc_now()),
    },
    "concurrencyEvidence": None,
}


def run_main(
    argv: list[str], signals: dict[str, object] | None = None
) -> tuple[int, str, str]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    with (
        mock.patch.object(sys, "argv", argv),
        mock.patch.object(
            MODULE,
            "observe_signals",
            return_value=dict(GREEN_SIGNALS if signals is None else signals),
        ),
        contextlib.redirect_stdout(stdout),
        contextlib.redirect_stderr(stderr),
    ):
        exit_code = MODULE.main()
    return exit_code, stdout.getvalue(), stderr.getvalue()


AUTOENROLL_RECEIPT_JQ = """
.schema == "jovie-fleet-gate/v1" and
(.observedAt | type == "string") and
(.signals.main.sha | test("^[0-9a-f]{40}$")) and
(.signals.integrity.status | IN("clear", "resolved", "active", "invalid")) and
(.promotionAdmission.allowed | type == "boolean") and
(.isolatedPromotionAdmission.allowed | type == "boolean") and
(.promotionMode | IN("normal", "isolated-only", "draft-only", "hold-intake", "blocked"))
""".strip()


def autoenroll_receipt_query() -> str:
    content = (ROOT / "scripts/hermes/evaluate-fleet-gate.sh").read_text(encoding="utf-8")
    for clause in AUTOENROLL_RECEIPT_JQ.split(" and\n"):
        if clause not in content:
            raise AssertionError(
                f"evaluate-fleet-gate.sh is missing fleet receipt jq clause: {clause}"
            )
    return AUTOENROLL_RECEIPT_JQ


def receipt_satisfies_autoenroll(receipt: dict[str, object]) -> bool:
    sha = (
        receipt.get("signals", {}).get("main", {}).get("sha")
        if isinstance(receipt.get("signals"), dict)
        else None
    )
    integrity = (
        receipt.get("signals", {}).get("integrity", {}).get("status")
        if isinstance(receipt.get("signals"), dict)
        else None
    )
    promotion = receipt.get("promotionAdmission")
    isolated = receipt.get("isolatedPromotionAdmission")
    return (
        receipt.get("schema") == "jovie-fleet-gate/v1"
        and isinstance(receipt.get("observedAt"), str)
        and isinstance(sha, str)
        and bool(re.fullmatch(r"[0-9a-f]{40}", sha))
        and integrity in {"clear", "resolved", "active", "invalid"}
        and isinstance(promotion, dict)
        and isinstance(promotion.get("allowed"), bool)
        and isinstance(isolated, dict)
        and isinstance(isolated.get("allowed"), bool)
        and receipt.get("promotionMode")
        in {"normal", "isolated-only", "draft-only", "hold-intake", "blocked"}
    )


def jq_accepts_autoenroll_receipt(receipt: dict[str, object]) -> bool:
    jq = shutil.which("jq")
    if jq is None:
        raise AssertionError("jq is required to prove the Auto-Enroll workflow contract")
    result = subprocess.run(
        [jq, "-e", autoenroll_receipt_query()],
        input=json.dumps(receipt),
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


class WriterLockTests(unittest.TestCase):
    def test_contested_lock_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            held = MODULE.acquire_writer_lock(state_dir)
            try:
                with self.assertRaises(TimeoutError):
                    MODULE.acquire_writer_lock(state_dir, timeout_seconds=0.3)
            finally:
                MODULE.release_writer_lock(held)

    def test_released_lock_allows_the_next_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            first = MODULE.acquire_writer_lock(state_dir)
            MODULE.release_writer_lock(first)
            second = MODULE.acquire_writer_lock(state_dir, timeout_seconds=1.0)
            MODULE.release_writer_lock(second)


class StaleAlarmTests(unittest.TestCase):
    def alarm(self, state_dir: pathlib.Path) -> str:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            MODULE.alarm_if_previous_receipt_stale(state_dir, MODULE.utc_now())
        return stderr.getvalue()

    def test_missing_receipt_alarms(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            state_dir.mkdir()
            self.assertIn("no persisted receipt exists", self.alarm(state_dir))

    def test_stale_receipt_alarms_with_age(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            state_dir.mkdir()
            stale_at = MODULE.utc_now() - MODULE.RECEIPT_STALE_AFTER - MODULE.timedelta(minutes=1)
            (state_dir / "latest.json").write_text(
                json.dumps({"schema": MODULE.SCHEMA, "observedAt": MODULE.isoformat(stale_at)}),
                encoding="utf-8",
            )
            self.assertIn("stale", self.alarm(state_dir))

    def test_malformed_receipt_alarms(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            state_dir.mkdir()
            (state_dir / "latest.json").write_text("not json", encoding="utf-8")
            self.assertIn("could not be read", self.alarm(state_dir))

    def test_fresh_receipt_stays_silent(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            state_dir.mkdir()
            (state_dir / "latest.json").write_text(
                json.dumps(
                    {"schema": MODULE.SCHEMA, "observedAt": MODULE.isoformat(MODULE.utc_now())}
                ),
                encoding="utf-8",
            )
            self.assertEqual(self.alarm(state_dir), "")


class PersistedRefreshTests(unittest.TestCase):
    def test_refresh_persists_canonical_receipt_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            exit_code, stdout, _stderr = run_main(
                [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
            )

            self.assertEqual(exit_code, 0)
            persisted = json.loads((state_dir / "latest.json").read_text(encoding="utf-8"))
            printed = json.loads(stdout)
            self.assertEqual(persisted, printed)
            self.assertEqual(persisted["schema"], "jovie-fleet-gate/v1")
            self.assertEqual(persisted["state"], "GREEN")
            # Refreshing the receipt must never turn this script into a second
            # promotion mutator: the native merge queue stays the sole authority.
            self.assertFalse(persisted["ownership"]["directGemPickup"])
            self.assertFalse(persisted["isolatedPromotionAdmission"]["deploymentsAllowed"])
            # The atomic write leaves no temporary sibling behind.
            self.assertFalse((state_dir / "latest.json.tmp").exists())

    def test_refresh_repairs_a_stale_receipt_and_alarms(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            state_dir.mkdir(parents=True)
            stale_at = MODULE.utc_now() - MODULE.RECEIPT_STALE_AFTER - MODULE.timedelta(hours=16)
            (state_dir / "latest.json").write_text(
                json.dumps({"schema": MODULE.SCHEMA, "observedAt": MODULE.isoformat(stale_at)}),
                encoding="utf-8",
            )

            exit_code, _stdout, stderr = run_main(
                [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
            )

            self.assertEqual(exit_code, 0)
            self.assertIn("stale", stderr)
            persisted = json.loads((state_dir / "latest.json").read_text(encoding="utf-8"))
            repaired_at = MODULE.parse_time(persisted["observedAt"])
            self.assertIsNotNone(repaired_at)
            self.assertLess(MODULE.utc_now() - repaired_at, MODULE.RECEIPT_STALE_AFTER)

    def test_dry_run_never_persists(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            exit_code, stdout, _stderr = run_main(
                [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet", "--dry-run"]
            )

            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(stdout)["state"], "GREEN")
            self.assertFalse((state_dir / "latest.json").exists())

    def test_evaluate_json_never_persists(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            exit_code, _stdout, _stderr = run_main(
                [
                    str(GATE),
                    "--state-dir",
                    str(state_dir),
                    "--consumer",
                    "fleet",
                    "--evaluate-json",
                    json.dumps(GREEN_SIGNALS),
                ]
            )

            self.assertEqual(exit_code, 0)
            self.assertFalse((state_dir / "latest.json").exists())

    def test_readback_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "gate"
            state_dir.mkdir()
            (state_dir / "latest.json").write_text(
                json.dumps({"schema": "other/v9", "observedAt": "elsewhere"}),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                MODULE.verify_persisted_receipt(state_dir, {"observedAt": MODULE.isoformat(MODULE.utc_now())})


class DeploymentBindingTests(unittest.TestCase):
    def evaluate(self, signals: dict[str, object]) -> dict[str, object]:
        return MODULE.evaluate(dict(signals), MODULE.isoformat(MODULE.utc_now()))

    def test_bound_production_is_green(self):
        receipt = self.evaluate(GREEN_SIGNALS)
        self.assertEqual(receipt["state"], "GREEN")
        self.assertTrue(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertTrue(receipt["remediationAdmission"]["localAllowed"])
        self.assertTrue(receipt["remediationAdmission"]["pushAllowed"])

    def test_fleet_hold_does_not_pause_pr_remediation(self):
        signals = dict(GREEN_SIGNALS)
        signals["main"] = {"status": "red", "sha": MAIN_SHA}

        receipt = self.evaluate(signals)

        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["remediationAdmission"]["allowed"])
        self.assertTrue(receipt["remediationAdmission"]["localAllowed"])
        self.assertTrue(receipt["remediationAdmission"]["pushAllowed"])
        self.assertEqual(receipt["remediationAdmission"]["maxConcurrent"], 4)
        self.assertEqual(
            receipt["remediationAdmission"]["authority"],
            "single-pr-writer-exact-head",
        )
        self.assertIn(
            "expected-head-pr-update", receipt["remediationAdmission"]["activities"]
        )

    def test_severe_gate_failure_keeps_diagnosis_live_but_blocks_remote_push(self):
        receipt = MODULE.failed_evaluation_receipt(ValueError("integrity unknown"))

        self.assertEqual(receipt["state"], "RED")
        self.assertFalse(receipt["workAdmission"]["allowed"])
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["remediationAdmission"]["allowed"])
        self.assertTrue(receipt["remediationAdmission"]["localAllowed"])
        self.assertFalse(receipt["remediationAdmission"]["pushAllowed"])
        self.assertIn("diagnose-pr", receipt["remediationAdmission"]["activities"])

    def test_queue_observation_uses_compact_merge_state_without_nested_rollups(self):
        prs = [
            {
                "number": 1,
                "isDraft": False,
                "labels": [],
                "mergeStateStatus": "CLEAN",
            },
            {
                "number": 2,
                "isDraft": False,
                "labels": [],
                "mergeStateStatus": "BLOCKED",
            },
            {
                "number": 3,
                "isDraft": True,
                "labels": [],
                "mergeStateStatus": "CLEAN",
            },
            {
                "number": 4,
                "isDraft": False,
                "labels": [{"name": "queue-deferred"}],
                "mergeStateStatus": "CLEAN",
            },
        ]
        completed = subprocess.CompletedProcess(
            args=["gh"], returncode=0, stdout=json.dumps(prs), stderr=""
        )

        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            observed = MODULE.observe_queue("JovieInc/Jovie", 15)

        self.assertEqual(observed["eligiblePrs"], 2)
        self.assertEqual(observed["greenReadyPrs"], 1)
        self.assertEqual(observed["target"], 15)

    def test_queue_observation_retries_transient_gateway_failure(self):
        timeout = subprocess.CalledProcessError(
            1, ["gh"], stderr="GraphQL: HTTP 504 Gateway Timeout"
        )
        completed = subprocess.CompletedProcess(
            args=["gh"],
            returncode=0,
            stdout=json.dumps([
                {"number": 1, "isDraft": False, "labels": [], "mergeStateStatus": "CLEAN"}
            ]),
            stderr="",
        )
        with (
            mock.patch.object(MODULE.subprocess, "run", side_effect=[timeout, completed]) as run,
            mock.patch.object(MODULE.time, "sleep") as sleep,
        ):
            observed = MODULE.observe_queue("JovieInc/Jovie", 15)

        self.assertEqual(observed["status"], "known")
        self.assertEqual(observed["greenReadyPrs"], 1)
        self.assertEqual(run.call_count, 2)
        sleep.assert_called_once_with(1)

    def test_queue_observation_preserves_unknown_after_nontransient_failure(self):
        failure = subprocess.CalledProcessError(1, ["gh"], stderr="authentication required")
        with mock.patch.object(MODULE.subprocess, "run", side_effect=failure):
            observed = MODULE.observe_queue("JovieInc/Jovie", 15)

        self.assertEqual(observed["status"], "unknown")

    def test_queue_observation_writes_and_reuses_last_known_after_transient_blip(self):
        completed = subprocess.CompletedProcess(
            args=["gh"],
            returncode=0,
            stdout=json.dumps([
                {"number": 1, "isDraft": False, "labels": [], "mergeStateStatus": "CLEAN"}
            ]),
            stderr="",
        )
        timeout = subprocess.CalledProcessError(
            1, ["gh"], stderr="HTTP 503: No server is currently available"
        )
        now = MODULE.datetime(2026, 8, 17, 18, 30, tzinfo=MODULE.UTC)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "queue-snapshot.json"
            with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
                live = MODULE.observe_queue(
                    "JovieInc/Jovie", 16, snapshot_path=path, now=now
                )
            written = json.loads(path.read_text(encoding="utf-8"))
            with (
                mock.patch.object(MODULE.subprocess, "run", side_effect=timeout),
                mock.patch.object(MODULE.time, "sleep"),
            ):
                cached = MODULE.observe_queue(
                    "JovieInc/Jovie",
                    16,
                    snapshot_path=path,
                    now=now + MODULE.timedelta(minutes=2),
                )

        self.assertEqual(live["status"], "known")
        self.assertEqual(live["source"], "live")
        self.assertEqual(written["schema"], "jovie-queue-snapshot/v1")
        self.assertEqual(written["greenReadyPrs"], 1)
        self.assertEqual(cached["status"], "known")
        self.assertEqual(cached["source"], "last-known")
        self.assertEqual(cached["greenReadyPrs"], 1)
        self.assertEqual(cached["target"], 16)
        self.assertIn("queue-observation-failed-used-last-known", cached["error"])

    def test_queue_observation_does_not_reuse_stale_or_auth_last_known(self):
        timeout = subprocess.CalledProcessError(
            1, ["gh"], stderr="HTTP 503: No server is currently available"
        )
        auth = subprocess.CalledProcessError(1, ["gh"], stderr="authentication required")
        now = MODULE.datetime(2026, 8, 17, 18, 30, tzinfo=MODULE.UTC)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "queue-snapshot.json"
            path.write_text(
                json.dumps(
                    {
                        "schema": "jovie-queue-snapshot/v1",
                        "status": "known",
                        "eligiblePrs": 4,
                        "greenReadyPrs": 2,
                        "target": 16,
                        "observedAt": MODULE.isoformat(now),
                    }
                ),
                encoding="utf-8",
            )
            with (
                mock.patch.object(MODULE.subprocess, "run", side_effect=timeout),
                mock.patch.object(MODULE.time, "sleep"),
            ):
                stale = MODULE.observe_queue(
                    "JovieInc/Jovie",
                    16,
                    snapshot_path=path,
                    now=now + MODULE.timedelta(minutes=11),
                )
            with mock.patch.object(MODULE.subprocess, "run", side_effect=auth):
                denied = MODULE.observe_queue(
                    "JovieInc/Jovie",
                    16,
                    snapshot_path=path,
                    now=now + MODULE.timedelta(minutes=1),
                )

        self.assertEqual(stale["status"], "unknown")
        self.assertEqual(denied["status"], "unknown")

    def test_stale_deployment_sha_freezes_promotion_but_allows_catchup_deploy(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 7}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertEqual(receipt["promotionMode"], "hold-intake")
        self.assertEqual(
            receipt["alreadyAdmittedCohort"],
            {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "preserve-cohort-and-continue-isolated-implementation",
            },
        )
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertEqual(
            receipt["productionUnboundRepairAdmission"],
            {
                "allowed": True,
                "condition": "production-deployment-unbound",
                "mainSha": MAIN_SHA,
                "deployedSha": "b" * 7,
                "scope": "event-scoped-exact-pr-head-with-bound-repair-attestation",
                "maxConcurrent": 1,
                "deploymentsAllowed": False,
                "authority": "canonical-merge-queue-controller",
            },
        )
        self.assertIn(
            "production-deployment-unbound",
            {reason["code"] for reason in receipt["reasons"]},
        )

    def test_same_prefix_different_commit_never_binds(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {
            "status": "green",
            "deployedSha": MAIN_SHA[:7] + "f" * 33,
        }
        receipt = self.evaluate(signals)

        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])

    def test_cli_allows_catchup_deployment_while_promotion_stays_closed(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 7}

        deployment_exit, deployment_stdout, _ = run_main(
            [str(GATE), "--consumer", "deployment", "--dry-run"], signals
        )
        promotion_exit, promotion_stdout, _ = run_main(
            [str(GATE), "--consumer", "promotion", "--dry-run"], signals
        )

        self.assertEqual(deployment_exit, 0)
        self.assertTrue(json.loads(deployment_stdout)["deploymentAdmission"]["allowed"])
        self.assertEqual(promotion_exit, 2)
        self.assertFalse(json.loads(promotion_stdout)["promotionAdmission"]["allowed"])

    def test_missing_deployed_sha_fails_closed(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green"}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])
        self.assertFalse(receipt["productionUnboundRepairAdmission"]["allowed"])
        self.assertIn(
            "production-deployment-unbound",
            {reason["code"] for reason in receipt["reasons"]},
        )

    def test_missing_main_sha_fails_closed(self):
        signals = dict(GREEN_SIGNALS)
        signals["main"] = {"status": "green"}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])

    def test_short_deployed_sha_never_binds(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "a3e"}
        receipt = self.evaluate(signals)
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])

    def test_malformed_deployed_sha_never_authorizes_deployment(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "not-a-sha"}
        receipt = self.evaluate(signals)
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])

    def test_queue_blocker_does_not_deadlock_current_main_deployment(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 7}
        signals["queue"] = {
            "status": "known",
            "eligiblePrs": 6,
            "greenReadyPrs": 1,
            "target": 15,
        }
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])

    def test_above_target_queue_remains_drainable_when_health_is_green(self):
        signals = dict(GREEN_SIGNALS)
        signals["queue"] = {
            "status": "known",
            "eligiblePrs": 40,
            "greenReadyPrs": 15,
            "target": 15,
        }

        receipt = self.evaluate(signals)

        self.assertEqual(receipt["state"], "GREEN")
        self.assertTrue(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertEqual(receipt["signals"]["queue"], signals["queue"])
        self.assertNotIn(
            "queue-above-target",
            {reason["code"] for reason in receipt["reasons"]},
        )

        signals["queue"]["greenReadyPrs"] = 14
        one_landed = self.evaluate(signals)
        self.assertTrue(one_landed["workAdmission"]["newIssueLeaseAllowed"])

    def test_malformed_queue_blocks_promotion_but_not_new_issue_leases(self):
        signals = dict(GREEN_SIGNALS)
        signals["queue"] = {"status": "known"}

        receipt = self.evaluate(signals)

        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertIn(
            "queue-unknown",
            {reason["code"] for reason in receipt["reasons"]},
        )

    def test_controller_failure_blocks_deployment(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 7}
        signals["controller"] = {"status": "failed"}
        receipt = self.evaluate(signals)
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])

    def test_red_production_keeps_the_isolated_exception(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "red"}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertEqual(receipt["promotionMode"], "isolated-only")
        self.assertTrue(receipt["isolatedPromotionAdmission"]["allowed"])
        self.assertFalse(receipt["isolatedPromotionAdmission"]["deploymentsAllowed"])
        self.assertFalse(receipt["deploymentAdmission"]["allowed"])

    def test_unbound_production_plus_queue_unknown_stays_blocked(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 7}
        signals["queue"] = {"status": "known"}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertEqual(receipt["promotionMode"], "blocked")
        self.assertFalse(receipt["alreadyAdmittedCohort"]["preserve"])


class IndependentReviewTests(unittest.TestCase):
    NOW = MODULE.datetime(2026, 8, 13, 12, 0, tzinfo=MODULE.UTC)

    def valid_review(self, **overrides: object) -> dict[str, object]:
        return {
            **GREEN_SIGNALS["independentReview"],
            "observedAt": MODULE.isoformat(self.NOW),
            **overrides,
        }

    def evaluate(self, review: object) -> dict[str, object]:
        signals = dict(GREEN_SIGNALS)
        signals["independentReview"] = review
        return MODULE.evaluate(signals, MODULE.isoformat(self.NOW))

    def test_valid_receipt_is_exact_head_and_explicitly_authorized(self):
        receipt = self.evaluate(self.valid_review())

        self.assertEqual(receipt["state"], "GREEN")
        self.assertTrue(receipt["reviewAdmission"]["allowed"])
        self.assertEqual(receipt["reviewAdmission"]["authority"], "Gem")
        self.assertEqual(receipt["reviewAdmission"]["scope"], "exact-main-head")
        self.assertEqual(receipt["reviewAdmission"]["headSha"], MAIN_SHA)
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertTrue(receipt["promotionAdmission"]["allowed"])

    def test_missing_receipt_blocks_promotion_but_keeps_isolated_leasing_live(self):
        receipt = self.evaluate(None)

        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["reviewAdmission"]["allowed"])
        self.assertEqual(
            receipt["reviewAdmission"]["reason"],
            "independent-review-receipt-missing",
        )
        self.assertTrue(receipt["workAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["deploymentAdmission"]["allowed"])
        self.assertTrue(receipt["remediationAdmission"]["localAllowed"])
        self.assertTrue(receipt["remediationAdmission"]["pushAllowed"])
        self.assertEqual(receipt["remediationAdmission"]["maxConcurrent"], 4)

    def test_malformed_stale_future_and_wrong_head_receipts_fail_closed(self):
        cases = (
            ({"schema": MODULE.INDEPENDENT_REVIEW_SCHEMA}, "independent-review-receipt-malformed"),
            (
                self.valid_review(
                    observedAt=MODULE.isoformat(
                        self.NOW - MODULE.RECEIPT_STALE_AFTER - MODULE.timedelta(seconds=1)
                    )
                ),
                "independent-review-receipt-stale",
            ),
            (
                self.valid_review(
                    observedAt=MODULE.isoformat(self.NOW + MODULE.timedelta(seconds=59))
                ),
                "independent-review-receipt-future",
            ),
            (
                self.valid_review(reviewer="Symphony Agent"),
                "independent-review-receipt-malformed",
            ),
            (
                self.valid_review(headSha="b" * 40),
                "independent-review-head-mismatch",
            ),
        )
        for review, reason in cases:
            with self.subTest(reason=reason):
                receipt = self.evaluate(review)
                self.assertFalse(receipt["reviewAdmission"]["allowed"])
                self.assertEqual(receipt["reviewAdmission"]["reason"], reason)
                self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
                self.assertFalse(receipt["promotionAdmission"]["allowed"])

    def test_review_does_not_bypass_bounded_concurrency_evidence(self):
        signals = dict(GREEN_SIGNALS)
        signals["independentReview"] = self.valid_review()
        signals["concurrencyEvidence"] = {
            "schema": MODULE.CONCURRENCY_SCHEMA,
            "target": 8,
            "approved": True,
            "cleanRuns": 20,
            "severeIncidents": 0,
            "observedAt": MODULE.isoformat(self.NOW),
            "accepted": True,
        }
        receipt = MODULE.evaluate(signals, MODULE.isoformat(self.NOW))

        self.assertTrue(receipt["reviewAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertEqual(receipt["remediationAdmission"]["maxConcurrent"], 8)

    def test_refresh_writes_receipt_only_when_main_release_ready_is_green(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "independent-review.json"
            main = {
                "status": "green",
                "sha": MAIN_SHA,
                "sourceGate": {
                    "name": "Main Release Ready",
                    "status": "completed",
                    "conclusion": "success",
                    "completedAt": "2026-08-13T12:00:00Z",
                },
            }
            observed = MODULE.refresh_independent_review_receipt(path, main, self.NOW)
            written = json.loads(path.read_text(encoding="utf-8"))

        self.assertTrue(observed["accepted"])
        self.assertEqual(observed["reason"], "fresh-exact-head-independent-review")
        self.assertEqual(written["headSha"], MAIN_SHA)
        self.assertEqual(written["authority"], "Gem")
        self.assertEqual(written["reviewer"], "Gem")
        self.assertTrue(written["reviewId"].startswith("main-release-ready:"))
        verdict = MODULE.validate_independent_review(written, MAIN_SHA, self.NOW)
        self.assertTrue(verdict["accepted"], verdict)

    def test_refresh_does_not_write_when_main_is_red(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "independent-review.json"
            observed = MODULE.refresh_independent_review_receipt(
                path,
                {"status": "red", "sha": MAIN_SHA},
                self.NOW,
            )
            self.assertFalse(path.exists())
        self.assertFalse(observed["accepted"])
        self.assertEqual(observed["reason"], "independent-review-receipt-missing")

    def test_unbound_production_plus_fresh_review_is_hold_intake(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 40}
        signals["independentReview"] = self.valid_review()
        receipt = MODULE.evaluate(signals, MODULE.isoformat(self.NOW))
        self.assertEqual(receipt["promotionMode"], "hold-intake")
        self.assertTrue(receipt["reviewAdmission"]["allowed"])
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])


class SemanticReadbackTests(unittest.TestCase):
    def test_exact_persisted_receipt_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            receipt = MODULE.evaluate(dict(GREEN_SIGNALS), MODULE.isoformat(MODULE.utc_now()))
            MODULE.write_receipt(receipt, state_dir)
            MODULE.verify_persisted_receipt(state_dir, receipt)

    def test_same_timestamp_semantic_mutation_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            receipt = MODULE.evaluate(dict(GREEN_SIGNALS), MODULE.isoformat(MODULE.utc_now()))
            MODULE.write_receipt(receipt, state_dir)
            mutated = dict(receipt)
            mutated["state"] = "RED"
            (state_dir / "latest.json").write_text(
                json.dumps(mutated, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            with self.assertRaises(ValueError):
                MODULE.verify_persisted_receipt(state_dir, receipt)


class HoldOrderingTests(unittest.TestCase):
    def receipt(self) -> dict[str, object]:
        return MODULE.evaluate(dict(GREEN_SIGNALS), MODULE.isoformat(MODULE.utc_now()))

    def test_hold_failure_publishes_no_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            # Block the hold path: a directory where the hold file belongs.
            (pathlib.Path(tmp) / ".gem-ship-paused-pr-queue").mkdir()
            with self.assertRaises(OSError):
                MODULE.write_receipt(self.receipt(), state_dir)
            self.assertFalse((state_dir / "latest.json").exists())

    def test_publish_failure_leaves_no_partial_green_authority(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            state_dir.mkdir(parents=True)
            # Block the receipt path so the publish fails after the hold commit.
            (state_dir / "latest.json").mkdir()
            with self.assertRaises(OSError):
                MODULE.write_receipt(self.receipt(), state_dir)
            # The hold was committed first; no fresh receipt was published.
            self.assertTrue((state_dir / "latest.json").is_dir())
            hold = json.loads(
                (pathlib.Path(tmp) / ".gem-ship-paused-pr-queue").read_text(encoding="utf-8")
            )
            self.assertEqual(hold["schema"], "gem-direct-pickup-hold/v1")


class WriterOrderingTests(unittest.TestCase):
    def test_observation_happens_before_the_writer_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            order: list[str] = []
            real_acquire = MODULE.acquire_writer_lock

            def record_observe(_args, _now):
                order.append("observe")
                return dict(GREEN_SIGNALS)

            def record_acquire(*args, **kwargs):
                order.append("lock")
                return real_acquire(*args, **kwargs)

            with (
                mock.patch.object(
                    sys, "argv", [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
                ),
                mock.patch.object(MODULE, "observe_signals", side_effect=record_observe),
                mock.patch.object(MODULE, "acquire_writer_lock", side_effect=record_acquire),
                contextlib.redirect_stdout(io.StringIO()),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                exit_code = MODULE.main()

            self.assertEqual(exit_code, 0)
            self.assertEqual(order, ["observe", "lock"])

    def test_newer_persisted_receipt_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            state_dir.mkdir(parents=True)
            future = MODULE.utc_now() + MODULE.timedelta(minutes=5)
            newer = MODULE.evaluate(dict(GREEN_SIGNALS), MODULE.isoformat(future))
            (state_dir / "latest.json").write_text(
                json.dumps(newer, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )

            exit_code, stdout, _stderr = run_main(
                [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
            )

            self.assertEqual(exit_code, 0)
            # The fresher authority is adopted verbatim, not downgraded.
            self.assertEqual(json.loads(stdout), json.loads(json.dumps(newer)))
            persisted = json.loads((state_dir / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(persisted["observedAt"], MODULE.isoformat(future))


class ScheduledFreshnessTests(unittest.TestCase):
    def run_at(self, state_dir: pathlib.Path, moment) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        signals = dict(GREEN_SIGNALS)
        signals["independentReview"] = {
            **signals["independentReview"],
            "observedAt": MODULE.isoformat(moment),
        }
        with (
            mock.patch.object(
                sys, "argv", [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
            ),
            mock.patch.object(MODULE, "observe_signals", return_value=signals),
            mock.patch.object(MODULE, "utc_now", return_value=moment),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = MODULE.main()
        return exit_code, stdout.getvalue(), stderr.getvalue()

    def test_scheduled_refresh_keeps_receipt_fresh_without_repo_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            t0 = MODULE.datetime(2026, 8, 13, 12, 0, tzinfo=MODULE.UTC)

            exit_code, _stdout, _stderr = self.run_at(state_dir, t0)
            self.assertEqual(exit_code, 0)

            # Advance past the 10-minute consumer window with no GitHub event;
            # the scheduled refresh lane is the only writer that can fire.
            t1 = t0 + MODULE.timedelta(minutes=15)
            exit_code, _stdout, stderr = self.run_at(state_dir, t1)

            self.assertEqual(exit_code, 0)
            self.assertIn("stale", stderr)
            persisted = json.loads((state_dir / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(persisted["observedAt"], MODULE.isoformat(t1))
            self.assertLess(
                t1 - MODULE.parse_time(persisted["observedAt"]),
                MODULE.RECEIPT_STALE_AFTER,
            )


class WorkflowContractTests(unittest.TestCase):
    WORKFLOWS = ROOT / ".github" / "workflows"

    def test_autoenroll_persists_fleet_receipt_without_dry_run(self):
        content = (self.WORKFLOWS / "merge-queue-autoenroll.yml").read_text(encoding="utf-8")
        self.assertIn("./.github/actions/evaluate-fleet-gate", content)
        self.assertIn("dry-run: 'false'", content)
        wrapper = (ROOT / "scripts/hermes/evaluate-fleet-gate.sh").read_text(encoding="utf-8")
        self.assertIn('--consumer "$consumer"', wrapper)
        self.assertIn("fleet | deployment", wrapper)
        self.assertIn(AUTOENROLL_RECEIPT_JQ.split(" and\n")[0], wrapper)

    def test_production_controller_uses_exact_subject_deployment_admission(self):
        content = (self.WORKFLOWS / "production-controller.yml").read_text(encoding="utf-8")
        self.assertIn("./.github/actions/evaluate-fleet-gate", content)
        self.assertIn("consumer: deployment", content)
        self.assertIn(
            "expected-sha: ${{ github.event.workflow_run.head_sha }}", content
        )
        self.assertIn("dry-run: 'false'", content)
        self.assertNotIn("python3 scripts/hermes/gem-priority-gate.py", content)
        wrapper = (ROOT / "scripts/hermes/evaluate-fleet-gate.sh").read_text(encoding="utf-8")
        self.assertIn(".deploymentAdmission.allowed", wrapper)
        self.assertIn("EXPECTED_SHA", wrapper)

    def test_refresh_is_event_driven_and_bounds_one_admission(self):
        content = (self.WORKFLOWS / "fleet-gate-refresh.yml").read_text(encoding="utf-8")
        self.assertNotIn("schedule:", content)
        self.assertNotIn("cron:", content)
        self.assertIn("pull_request:", content)
        self.assertIn("workflow_run:", content)
        self.assertIn("workflows: [CI, Production Controller]", content)
        self.assertNotIn("workflows: [CI, Production Controller, Queue-Deferred Release]", content)
        self.assertIn("push:", content)
        self.assertIn("branches: [main]", content)
        self.assertIn("ref: main", content)
        self.assertIn("node-version: '22'", content)
        self.assertIn("./.github/actions/evaluate-fleet-gate", content)
        self.assertIn("dry-run: 'false'", content)
        self.assertIn("jovie-fixed", content)
        self.assertIn("cancel-in-progress: false", content)
        self.assertIn("github.event.workflow_run.conclusion != 'cancelled'", content)
        self.assertIn("github.event.pull_request.merged != true", content)
        self.assertIn("github.event.label.name == 'hold'", content)
        self.assertIn("github.event.label.name == 'gated'", content)
        self.assertIn("github.event.label.name == 'queue-deferred'", content)
        self.assertIn("github.event.label.name == 'needs-human'", content)
        self.assertIn("JOVIE_AGENT_PROFILE: no_agent", content)
        self.assertIn("timeout 180s scripts/backlog-orchestrator/run-backlog.sh reconcile", content)
        self.assertIn("timeout 60s scripts/backlog-orchestrator/run-backlog.sh gate-next", content)
        self.assertIn("symphony-event-admission-heartbeat/v1", content)

    def test_stale_window_matches_the_consumer_fail_closed_window(self):
        gate_source = GATE.read_text(encoding="utf-8")
        python_minutes = re.search(
            r"RECEIPT_STALE_AFTER = timedelta\(minutes=(\d+)\)", gate_source
        )
        self.assertIsNotNone(python_minutes)
        admitter = (ROOT / "scripts" / "backlog-orchestrator" / "admitter.mjs").read_text(
            encoding="utf-8"
        )
        js_minutes = re.search(r"CONTROLLER_RECEIPT_MAX_AGE_MS = (\d+) \* 60 \* 1000", admitter)
        self.assertIsNotNone(js_minutes)
        self.assertEqual(python_minutes.group(1), js_minutes.group(1))


class AutoEnrollStubReceiptTests(unittest.TestCase):
    """JOV-5067: Auto-Enroll must skip on a schema-valid blocked receipt, not go red."""

    def test_legacy_stub_is_the_fail_closed_shape(self):
        self.assertFalse(receipt_satisfies_autoenroll(LEGACY_FLEET_GATE_STUB))
        self.assertFalse(jq_accepts_autoenroll_receipt(LEGACY_FLEET_GATE_STUB))

    def test_evaluation_failure_emits_schema_valid_blocked_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = pathlib.Path(tmp) / "state" / "gem-priority-gate"
            with mock.patch.object(
                MODULE, "evaluate", side_effect=ValueError("no persisted receipt exists")
            ):
                exit_code, stdout, _stderr = run_main(
                    [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
                )

        receipt = json.loads(stdout)
        self.assertEqual(exit_code, 2)
        self.assertTrue(receipt_satisfies_autoenroll(receipt))
        self.assertTrue(jq_accepts_autoenroll_receipt(receipt))
        self.assertEqual(receipt["promotionMode"], "blocked")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["isolatedPromotionAdmission"]["allowed"])
        self.assertEqual(
            receipt["concurrency"]["symphonyImplementation"],
            "event-driven-backpressure",
        )
        self.assertEqual(
            {reason["code"] for reason in receipt["reasons"]},
            {"gate-evaluation-failed"},
        )

    def test_unwritable_gem_workspace_keeps_the_live_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = pathlib.Path(tmp) / "not-a-directory"
            blocker.write_text("nope", encoding="utf-8")
            state_dir = blocker / "state" / "gem-priority-gate"
            exit_code, stdout, stderr = run_main(
                [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
            )

        receipt = json.loads(stdout)
        self.assertEqual(exit_code, 0)
        self.assertEqual(receipt["state"], "GREEN")
        self.assertTrue(receipt["promotionAdmission"]["allowed"])
        self.assertTrue(receipt_satisfies_autoenroll(receipt))
        self.assertTrue(jq_accepts_autoenroll_receipt(receipt))
        self.assertIn("live receipt not persisted", stderr)
        self.assertFalse(state_dir.exists())

    def test_failed_evaluation_receipt_helper_matches_autoenroll_jq(self):
        receipt = MODULE.failed_evaluation_receipt(OSError("Permission denied"))
        self.assertTrue(receipt_satisfies_autoenroll(receipt))
        self.assertTrue(jq_accepts_autoenroll_receipt(receipt))
        self.assertEqual(receipt["signals"]["main"]["sha"], MODULE.UNKNOWN_MAIN_SHA)
        self.assertEqual(receipt["signals"]["integrity"]["status"], "invalid")


class LeaseSignalTests(unittest.TestCase):
    """JOV-5031: the lease signal is additive and observation-only."""

    def write_guard(self, directory: pathlib.Path, body: str) -> str:
        guard = directory / "symphony-lease-guard"
        guard.write_text(body)
        guard.chmod(0o755)
        return str(guard)

    def test_missing_guard_is_typed_unknown_not_a_gate_failure(self):
        observed = MODULE.observe_lease("/nonexistent/symphony-lease-guard")
        self.assertEqual(observed["status"], "unknown")
        self.assertIn("lease-report-unavailable", observed["reason"])

    def test_valid_report_is_embedded_verbatim(self):
        with tempfile.TemporaryDirectory() as tmp:
            guard = self.write_guard(
                pathlib.Path(tmp),
                "#!/usr/bin/env bash\n"
                "cat <<'JSON'\n"
                '{"schema":"symphony-lease-guard-report/v1","ts":"2026-08-13T00:00:00Z",'
                '"tombstones":{"JOV-5029":{"state":"In Review","observedAt":1,"issueUpdatedAtEpoch":1}},'
                '"counters":{"checks":4,"suppressedStaleSnapshot":2},'
                '"orphanLaunchers":0,'
                '"capacity":{"state":"available","accounts":4,"locked":1,"cooldown":0,"available":3}}\n'
                "JSON\n",
            )
            observed = MODULE.observe_lease(guard)
        self.assertEqual(observed["status"], "ok")
        self.assertEqual(observed["tombstones"], 1)
        self.assertEqual(observed["orphanLaunchers"], 0)
        self.assertEqual(observed["counters"]["suppressedStaleSnapshot"], 2)
        self.assertEqual(observed["capacity"]["state"], "available")

    def test_failing_guard_is_typed_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            guard = self.write_guard(
                pathlib.Path(tmp), "#!/usr/bin/env bash\nexit 1\n"
            )
            observed = MODULE.observe_lease(guard)
        self.assertEqual(observed["status"], "unknown")
        self.assertEqual(observed["reason"], "lease-report-rc-1")

    def test_malformed_report_is_typed_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            guard = self.write_guard(
                pathlib.Path(tmp), "#!/usr/bin/env bash\necho 'not json'\n"
            )
            observed = MODULE.observe_lease(guard)
        self.assertEqual(observed["status"], "unknown")
        self.assertIn("lease-report-malformed", observed["reason"])

    def test_wrong_schema_is_typed_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            guard = self.write_guard(
                pathlib.Path(tmp),
                "#!/usr/bin/env bash\necho '{\"schema\":\"other/v9\"}'\n",
            )
            observed = MODULE.observe_lease(guard)
        self.assertEqual(observed["status"], "unknown")
        self.assertEqual(observed["reason"], "lease-report-schema-mismatch")


if __name__ == "__main__":
    unittest.main()
