"""Regression tests for the doctor failed-runs reason grouping (JOV-12820).

The failed-runs condition carried only a count and pointed at runs/ledger.jsonl for
reasons — but those reason strings never leave the gem host, so every condition
generation filed 'Root cause: UNKNOWN' and auto-closed unlearned. The doctor now
groups the reason prefixes it already holds and names them in the alert text and
the public feed.

Run with:
    python3 -m unittest scripts/tests/test_doctor_failed_runs_reasons.py -v
"""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    # test_doctor.py loads `doctor` (and its import-time state) first when both suites run
    # together; re-executing it here would reset that shared instance mid-run and pollute
    # its watchdog tests. Reuse the cached module when present.
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


doctor = load("doctor")

# Capacity fixtures model an eligible lane; expiry has its own real guard suite.
_devin_free_fixture = mock.patch('devin_free_policy.admission_open', return_value=True)


def setUpModule():
    _devin_free_fixture.start()


def tearDownModule():
    _devin_free_fixture.stop()


def obs(**overrides):
    base = {"now": 1_000_000.0, "tick": {"at": "2026-09-26T21:00:00Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 600, "runs24h": 12, "busy": 3,
            "codex": {"count": 2, "available": ["a"], "accounts": {"a": {"resetsInS": 0}, "b": {"resetsInS": 900}}},
            "pool": 40, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "openPRCount": 0, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
            "hudExpected": True, "hudBeatAge": 3}
    base.update(overrides)
    if "codex" not in overrides:
        base["codex"] = {"generatedAt": doctor.epoch_iso(base["now"]), "count": 2, "available": ["a"], "accounts": {
            "a": {"available": True, "leased": False, "resetsInS": 0},
            "b": {"available": False, "leased": False, "lastKind": "limit",
                  "exhaustedUntil": doctor.epoch_iso(base["now"] + 900), "resetsInS": 900}}}
    return base


class FailedRunReasonGroupingTest(unittest.TestCase):
    def test_failed_run_reason_counts_group_the_reason_prefix(self):
        receipts = [
            {"verdict": "failed", "reasons": ["harness-error:ChildProcessError:boom"]},
            {"verdict": "failed", "reasons": ["harness-error:RuntimeError:other"]},
            {"verdict": "failed", "reasons": ["timeout:claude"]},
            {"verdict": "skipped", "reasons": ["worktree-unavailable:disk-full"]},
            {"verdict": "landing"},
        ]
        self.assertEqual(doctor.failed_run_reason_counts(receipts),
                         {"harness-error": 2, "timeout": 1})

    def test_failed_run_reason_counts_treat_missing_reasons_as_unknown(self):
        self.assertEqual(doctor.failed_run_reason_counts([{"verdict": "failed"}]), {"?": 1})
        self.assertEqual(doctor.failed_run_reason_counts([]), {})

    def test_failed_runs_alert_names_the_reason_classes(self):
        alerts = doctor.judge(obs(failed24h=10,
                                  failed24hByReason={"harness-error": 7, "timeout": 3}))
        self.assertIn("failed-runs", alerts)
        self.assertIn("10 harness-failed runs in 24h", alerts["failed-runs"])
        self.assertIn("harness-error 7", alerts["failed-runs"])
        self.assertIn("timeout 3", alerts["failed-runs"])

    def test_failed_runs_alert_without_grouping_stays_actionable(self):
        alerts = doctor.judge(obs(failed24h=10))
        self.assertIn("failed-runs", alerts)
        self.assertIn("runs/ledger.jsonl", alerts["failed-runs"])


if __name__ == "__main__":
    unittest.main()
