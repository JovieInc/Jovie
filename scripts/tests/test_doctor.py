"""Regression tests for scripts/lanes/doctor.py (nothing fails silently).

Run with:
    python3 -m unittest scripts/tests/test_doctor.py -v
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


doctor = load("doctor")


def obs(**overrides):
    base = {"now": 1_000_000.0, "tick": {"at": "2026-09-26T21:00:00Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 600, "runs24h": 12, "busy": 3,
            "codex": {"count": 2, "available": ["a"], "accounts": {"a": {"resetsInS": 0}, "b": {"resetsInS": 900}}},
            "pool": 40, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "hudExpected": True, "hudBeatAge": 3}
    base.update(overrides)
    return base


class JudgeTest(unittest.TestCase):
    def test_healthy_host_raises_nothing(self):
        self.assertEqual(doctor.judge(obs()), {})

    def test_each_rule_names_its_cause(self):
        alerts = doctor.judge(obs(
            tick={"at": "x", "unhealthy": ["devin"], "error": "Boom"},
            codex={"count": 2, "available": [], "accounts": {"a": {"resetsInS": 7200}, "b": {"resetsInS": 600}}},
            gateTimeouts24h=5, failed24h=10, diskFreePct=4.0, githubRemaining=100, hudBeatAge=500,
            lastLandingAge=8 * 3600))
        self.assertEqual(set(alerts), {"tick-error", "provider-down:devin", "codex-all-banked", "no-landing",
                                       "gate-timeouts", "failed-runs", "disk-low", "github-quota", "hud-stale"})
        self.assertIn("earliest reset in 10m", alerts["codex-all-banked"])
        self.assertIn("8h ago", alerts["no-landing"])
        self.assertIn("Boom", alerts["tick-error"])

    def test_pool_empty_needs_thirty_sustained_minutes(self):
        self.assertEqual(doctor.judge(obs(pool=0, busy=0), {"poolEmptySince": 1_000_000.0}), {})
        alerts = doctor.judge(obs(pool=0, busy=0), {"poolEmptySince": 1_000_000.0 - 1801})
        self.assertIn("Summer: route work", alerts["pool-empty"])

    def test_no_landing_needs_work_and_busy_slots(self):
        self.assertEqual(doctor.judge(obs(lastLandingAge=None, busy=0)), {})
        self.assertEqual(doctor.judge(obs(lastLandingAge=None, pool=0), {"poolEmptySince": 1_000_000.0}), {})
        self.assertIn("never in 24h", doctor.judge(obs(lastLandingAge=None))["no-landing"])

    def test_linear_and_codex_failures_are_their_own_alerts(self):
        self.assertIn("linear-down", doctor.judge(obs(linearError="HTTPError: 429", pool=None)))
        self.assertIn("codex-broken", doctor.judge(obs(codex={"error": "no codex", "accounts": {}, "available": []})))
        self.assertNotIn("hud-stale", doctor.judge(obs(hudExpected=False, hudBeatAge=None)))


class FakeTracker:
    def __init__(self):
        self.opened, self.reopened, self.closed = [], [], []

    def open(self, key, text):
        self.opened.append((key, text))
        return f"id-{key}"

    def reopen(self, issue_id, text):
        self.reopened.append((issue_id, text))

    def close(self, issue_id):
        self.closed.append(issue_id)


class ReconcileTest(unittest.TestCase):
    def test_new_alert_opens_once_clearing_closes_and_refire_reopens(self):
        tracker = FakeTracker()
        now = 1_000_000.0
        state = doctor.reconcile({"disk-low": "4% free"}, {}, tracker, now)
        self.assertEqual(tracker.opened, [("disk-low", "4% free")])
        self.assertEqual(state["issues"]["disk-low"], {"id": "id-disk-low", "closedAt": None})
        state = doctor.reconcile({"disk-low": "4% free"}, state, tracker, now + 60)
        self.assertEqual(len(tracker.opened), 1, "an open alert is not raised twice")
        state = doctor.reconcile({}, state, tracker, now + 120)
        self.assertEqual(tracker.closed, ["id-disk-low"])
        self.assertEqual(state["issues"]["disk-low"]["closedAt"], now + 120)
        state = doctor.reconcile({"disk-low": "again"}, state, tracker, now + 600)
        self.assertEqual(tracker.reopened, [("id-disk-low", "again")])
        self.assertEqual(len(tracker.opened), 1, "within the cool-off the same issue is reused")
        state = doctor.reconcile({}, state, tracker, now + 700)
        state = doctor.reconcile({"disk-low": "much later"}, state, tracker, now + 700 + doctor.COOL_OFF_S + 1)
        self.assertEqual(len(tracker.opened), 2, "after the cool-off a fresh issue is opened")

    def test_tracker_failure_still_records_the_alert(self):
        state = doctor.reconcile({"hud-stale": "x"}, {}, None, 5.0)
        self.assertEqual(state["alerts"], {"hud-stale": "x"})
        self.assertEqual(state["issues"]["hud-stale"]["id"], None)


class RunTest(unittest.TestCase):
    def test_run_writes_doctor_json_from_observations(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            (state / "runs").mkdir()
            (state / "tick.json").write_text(json.dumps({"at": "2026-09-26T21:00:00Z", "unhealthy": ["devin"], "error": None}))
            host = type("Host", (), {"state": state, "linear_env": state / "missing.env"})()

            class FakeLinear:
                def __init__(self, env):
                    raise OSError("no env")
            lane = type("Lane", (), {"Linear": FakeLinear, "load_providers": staticmethod(lambda: {}),
                                     "load_github_env": staticmethod(lambda: None), "HOST": "test"})
            codex = type("Codex", (), {"status": staticmethod(lambda: {"count": 0, "available": [], "accounts": {}})})
            tracker = FakeTracker()
            result = doctor.run(host, lane, codex, tracker)
            self.assertIn("provider-down:devin", result["alerts"])
            self.assertIn("linear-down", result["alerts"])
            written = json.loads((state / "doctor.json").read_text())
            self.assertEqual(set(written["alerts"]) >= {"provider-down:devin", "linear-down"}, True)
            self.assertEqual(sorted(k for k, _ in tracker.opened), sorted(result["alerts"]))


if __name__ == "__main__":
    unittest.main()
