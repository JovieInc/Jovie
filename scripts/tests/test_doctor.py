"""Regression tests for scripts/lanes/doctor.py (nothing fails silently).

Run with:
    python3 -m unittest scripts/tests/test_doctor.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
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

    def test_tracker_failure_still_records_the_alert_and_retries_the_open(self):
        state = doctor.reconcile({"hud-stale": "x"}, {}, None, 5.0)
        self.assertEqual(state["alerts"], {"hud-stale": "x"})
        self.assertEqual(state["issues"]["hud-stale"]["id"], None)
        tracker = FakeTracker()
        state = doctor.reconcile({"hud-stale": "x"}, state, tracker, 65.0)
        self.assertEqual(tracker.opened, [("hud-stale", "x")], "an alert whose issue never opened is retried")
        self.assertEqual(state["issues"]["hud-stale"]["id"], "id-hud-stale")

    def test_tracker_titles_carry_the_host_and_reuse_an_existing_issue(self):
        class FakeLinear:
            def __init__(self):
                self.calls = []

            def gql(self, query, variables):
                self.calls.append(query)
                if "title:{eq:$t}" in query:
                    return {"issues": {"nodes": [{"id": "existing-1"}]}}
                raise AssertionError("must not create when one exists")
        linear = FakeLinear()
        tracker = doctor.Tracker(linear, "gem")
        self.assertEqual(tracker.title("disk-low"), "Symphony doctor: disk-low (gem)")
        self.assertEqual(tracker.open("disk-low", "x"), "existing-1")


class StatusFeedTest(unittest.TestCase):
    def test_feed_counts_running_and_idle_slots_per_lane(self):
        import fcntl
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "slots").mkdir()
            for name in ("devin.0.lock", "devin.1.lock", "codex.0.lock", "gate.0.lock"):
                (state / "slots" / name).touch()
            held = open(state / "slots" / "devin.0.lock", "w")
            fcntl.flock(held, fcntl.LOCK_EX)
            host = type("Host", (), {"state": state})()
            lane = type("Lane", (), {"HOST": "gem"})
            feed = doctor.status_feed(host, lane, obs(pool=12, lastLandingAge=30), {"disk-low": "x"}, {"release": "abc1234"})
            held.close()
        self.assertEqual((feed["running"], feed["idle"], feed["pool"], feed["release"]), (1, 2, 12, "abc1234"))
        self.assertEqual(feed["lanes"]["devin"], {"running": 1, "slots": 2})
        self.assertEqual(feed["alerts"], {"disk-low": "x"})
        self.assertNotIn("gate", feed["lanes"])
        self.assertEqual((feed["held_by_reason"], feed["failed_by_reason"]), ({}, {}))

    def test_feed_publishes_held_and_failed_records_by_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "held.json").write_text(json.dumps({
                "1": {"sha": "a", "evidence": ["gate-timeout:x3"]},
                "2": {"sha": "b", "reason": "missing-test", "next_action": "fix-loop"}}))
            (state / "failures.json").write_text(json.dumps({
                "JOV-1": {"count": 1, "at": 0, "reason": "agent-timeout"}, "JOV-2": {"count": 2, "at": 0}, "JOV-3": 1}))
            host = type("Host", (), {"state": state, "linear_env": state / "missing.env"})()
            lane = type("Lane", (), {"Linear": staticmethod(lambda env: (_ for _ in ()).throw(OSError("x"))),
                                     "load_providers": staticmethod(lambda: {}),
                                     "load_github_env": staticmethod(lambda: None), "HOST": "gem"})
            codex = type("Codex", (), {"status": staticmethod(lambda: {})})
            os.environ["LANES_SELFTEST"] = "1"  # no open-PR read from a unit test
            try:
                observed = doctor.observe(host, lane, codex)
            finally:
                os.environ.pop("LANES_SELFTEST", None)
            (state / "slots").mkdir()
            feed = doctor.status_feed(host, lane, observed, {}, {})
        self.assertEqual(feed["held_by_reason"], {"gate-timeout": 1, "missing-test": 1})
        self.assertEqual(feed["failed_by_reason"], {"agent-timeout": 1, "legacy": 2})


class PublishTest(unittest.TestCase):
    def test_only_the_primary_host_publishes(self):
        saved = doctor.PRIMARY_FLAG
        with tempfile.TemporaryDirectory() as tmp:
            doctor.PRIMARY_FLAG = Path(tmp) / "primary"
            host = type("Host", (), {"state": Path(tmp)})()
            try:
                self.assertIsNone(doctor.publish_status(host, None, {"x": 1}))
                self.assertFalse((Path(tmp) / "lanes-status.json").exists(), "a non-primary host writes nothing")
            finally:
                doctor.PRIMARY_FLAG = saved


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
            os.environ["LANES_SELFTEST"] = "1"  # no gist from a unit test
            try:
                result = doctor.run(host, lane, codex, tracker)
            finally:
                os.environ.pop("LANES_SELFTEST", None)
            self.assertIn("provider-down:devin", result["alerts"])
            self.assertIn("linear-down", result["alerts"])
            written = json.loads((state / "doctor.json").read_text())
            self.assertEqual(set(written["alerts"]) >= {"provider-down:devin", "linear-down"}, True)
            self.assertEqual(sorted(k for k, _ in tracker.opened), sorted(result["alerts"]))


if __name__ == "__main__":
    unittest.main()
