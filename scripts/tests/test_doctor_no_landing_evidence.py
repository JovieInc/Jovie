"""Regression tests for the no-landing alert's evidence line (JOV-13034).

Overflow from test_doctor.py (size-pinned). The no-landing condition used to name
only counts, so every condition generation filed 'Root cause: UNKNOWN' — the same
blindness JOV-12820 fixed for failed-runs. The alert must carry the reason classes
the doctor already holds.

Run with:
    python3 -m unittest scripts/tests/test_doctor_no_landing_evidence.py -v
"""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


doctor = load("doctor")

_devin_free_fixture = mock.patch('devin_free_policy.admission_open', return_value=True)


def setUpModule():
    _devin_free_fixture.start()


def tearDownModule():
    _devin_free_fixture.stop()


def obs(**overrides):
    base = {"now": 1_000_000.0, "tick": {"at": "2026-11-19T17:15:48Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 6 * 3600 + 60, "runs24h": 12, "busy": 1,
            "codex": {"generatedAt": doctor.epoch_iso(1_000_000), "count": 2, "available": ["a"],
                      "accounts": {"a": {"available": True, "leased": False, "resetsInS": 0},
                                   "b": {"available": True, "leased": False, "resetsInS": 0}}},
            "pool": 329, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "openPRCount": 47, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
            "hudExpected": True, "hudBeatAge": 3}
    base.update(overrides)
    return base


def landing_obs(**overrides):
    return obs(lastLandingAge=600, **overrides)


class NoLandingEvidenceTests(unittest.TestCase):
    def test_quiet_lane_still_has_no_no_landing_alert(self):
        self.assertNotIn("no-landing", doctor.judge(landing_obs()))

    def test_threshold_crossing_keeps_the_counts_line(self):
        alerts = doctor.judge(obs())
        self.assertIn("1 slots busy with 329 eligible new issues", alerts["no-landing"])
        self.assertIn("6h ago", alerts["no-landing"])

    def test_failed_runs_name_their_reason_classes(self):
        alerts = doctor.judge(obs(failed24h=9, failed24hByReason={"timeout": 6, "claim-error": 3}))
        alert = alerts["no-landing"]
        self.assertIn("9 harness-failed runs in 24h (timeout 6, claim-error 3)", alert)

    def test_gate_timeouts_name_the_wait(self):
        alerts = doctor.judge(obs(gateTimeouts24h=4, gateWaitMedianS24h=900, gateWaitMaxS24h=2400))
        alert = alerts["no-landing"]
        self.assertIn("4 gate timeouts in 24h (p50/max wait 900/2400s)", alert)

    def test_last_work_age_names_the_stall(self):
        alerts = doctor.judge(obs(lastWorkAge=3 * 3600))
        self.assertIn("last lane run ended 180m ago", alerts["no-landing"])

    def test_no_failure_signal_says_so_instead_of_inventing_one(self):
        alerts = doctor.judge(obs())
        self.assertIn("no 24h harness failures or gate timeouts", alerts["no-landing"])
        self.assertNotIn("failed-runs", alerts)
        self.assertNotIn("gate-timeouts", alerts)


if __name__ == "__main__":
    unittest.main()
