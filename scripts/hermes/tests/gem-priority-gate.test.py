#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import re
import sys
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
GATE = ROOT / "scripts/hermes/gem-priority-gate.py"
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


class ProductionHealthTests(unittest.TestCase):
    def test_default_uses_the_dedicated_deploy_health_contract(self):
        with (
            mock.patch.dict(os.environ, {"JOVIE_PRODUCTION_HEALTH_URL": ""}),
            mock.patch.object(sys, "argv", [str(GATE)]),
        ):
            args = MODULE.parse_args()

        self.assertEqual(args.production_url, "https://jov.ie/api/health/deploy")

    def test_deploy_health_healthy_is_green_and_bound_to_deployed_sha(self):
        url = "https://jov.ie/api/health/deploy"
        router = urlopen_router(
            {
                "/api/health/deploy": {"status": "healthy"},
                "/api/health/build-info": {"commitSha": "a3eeefd"},
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
                "deployedSha": "a3eeefd",
            },
        )

    def test_legacy_ok_status_remains_compatible_for_explicit_overrides(self):
        url = "https://example.test/health"
        router = urlopen_router(
            {
                "/health": {"status": "ok"},
                "/build-info": {"commitSha": "a3eeefd"},
            }
        )

        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=router):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "green")
        self.assertEqual(observed["reportedStatus"], "ok")
        self.assertEqual(observed["deployedSha"], "a3eeefd")

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
    "production": {"status": "green", "deployedSha": MAIN_SHA[:7]},
    "controller": {"status": "green"},
    "integrity": {"status": "clear"},
    "queue": {"status": "known", "eligiblePrs": 0, "target": 5},
    "concurrencyEvidence": None,
}


def run_main(argv: list[str]) -> tuple[int, str, str]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    with (
        mock.patch.object(sys, "argv", argv),
        mock.patch.object(MODULE, "observe_signals", return_value=dict(GREEN_SIGNALS)),
        contextlib.redirect_stdout(stdout),
        contextlib.redirect_stderr(stderr),
    ):
        exit_code = MODULE.main()
    return exit_code, stdout.getvalue(), stderr.getvalue()


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
        self.assertTrue(receipt["workAdmission"]["newIssueLeaseAllowed"])

    def test_stale_deployment_sha_freezes_promotion(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "b" * 7}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
        self.assertFalse(receipt["workAdmission"]["newIssueLeaseAllowed"])
        self.assertIn(
            "production-deployment-unbound",
            {reason["code"] for reason in receipt["reasons"]},
        )

    def test_missing_deployed_sha_fails_closed(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green"}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertFalse(receipt["promotionAdmission"]["allowed"])
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

    def test_short_deployed_sha_never_binds(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "green", "deployedSha": "a3e"}
        receipt = self.evaluate(signals)
        self.assertFalse(receipt["promotionAdmission"]["allowed"])

    def test_red_production_keeps_the_isolated_exception(self):
        signals = dict(GREEN_SIGNALS)
        signals["production"] = {"status": "red"}
        receipt = self.evaluate(signals)
        self.assertEqual(receipt["state"], "AMBER")
        self.assertTrue(receipt["isolatedPromotionAdmission"]["allowed"])
        self.assertFalse(receipt["isolatedPromotionAdmission"]["deploymentsAllowed"])


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
        with (
            mock.patch.object(
                sys, "argv", [str(GATE), "--state-dir", str(state_dir), "--consumer", "fleet"]
            ),
            mock.patch.object(MODULE, "observe_signals", return_value=dict(GREEN_SIGNALS)),
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
        self.assertIn("--consumer fleet", content)
        self.assertNotIn("--dry-run", content)

    def test_production_controller_persists_promotion_receipt_without_dry_run(self):
        content = (self.WORKFLOWS / "production-controller.yml").read_text(encoding="utf-8")
        self.assertIn("--consumer promotion", content)
        self.assertNotIn("--dry-run", content)

    def test_scheduled_refresh_is_bounded_below_the_consumer_window(self):
        content = (self.WORKFLOWS / "fleet-gate-refresh.yml").read_text(encoding="utf-8")
        self.assertIn("schedule:", content)
        match = re.search(r"cron:\s*'\*/(\d+) \* \* \* \*'", content)
        self.assertIsNotNone(match, "fleet-gate-refresh.yml must run on a fixed minute interval")
        interval_minutes = int(match.group(1))
        stale_minutes = MODULE.RECEIPT_STALE_AFTER.total_seconds() / 60
        # Comfortably below the fail-closed window: at most half of it.
        self.assertLessEqual(interval_minutes * 2, stale_minutes)
        self.assertIn("ref: main", content)
        self.assertIn("gem-priority-gate.py", content)
        self.assertNotIn("--dry-run", content)
        self.assertIn("jovie-fixed", content)

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


if __name__ == "__main__":
    unittest.main()
