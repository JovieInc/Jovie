#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
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


class ProductionHealthTests(unittest.TestCase):
    def test_default_uses_the_dedicated_deploy_health_contract(self):
        with (
            mock.patch.dict(os.environ, {"JOVIE_PRODUCTION_HEALTH_URL": ""}),
            mock.patch.object(sys, "argv", [str(GATE)]),
        ):
            args = MODULE.parse_args()

        self.assertEqual(args.production_url, "https://jov.ie/api/health/deploy")

    def test_deploy_health_healthy_is_green(self):
        url = "https://jov.ie/api/health/deploy"
        response = FakeResponse(url, {"status": "healthy"})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(
            observed,
            {
                "status": "green",
                "url": url,
                "reportedStatus": "healthy",
            },
        )

    def test_legacy_ok_status_remains_compatible_for_explicit_overrides(self):
        url = "https://example.test/health"
        response = FakeResponse(url, {"status": "ok"})

        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.observe_production(url)

        self.assertEqual(observed["status"], "green")
        self.assertEqual(observed["reportedStatus"], "ok")

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


GREEN_SIGNALS: dict[str, object] = {
    "main": {"status": "green"},
    "production": {"status": "green"},
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


if __name__ == "__main__":
    unittest.main()
