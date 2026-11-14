"""Health composition keeps all existing doctor signals and main certification."""
from __future__ import annotations

import os
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import health_checks as health  # noqa: E402


class HealthChecksTests(unittest.TestCase):
    def test_samples_each_provider_once_and_selftest_never_reads_them(self):
        providers = {
            "deployHealth": health.deploy_health, "releaseEvidence": health.release_evidence,
            "releaseGates": health.release_gates, "mainHealth": health.main_health,
            "groupOutcomes": health.queue_empty_red,
        }
        with ExitStack() as stack:
            probe = stack.enter_context(mock.patch.object(health.main_health, "idle_probe", return_value=None))
            calls = {key: stack.enter_context(mock.patch.object(provider, "sample", return_value=({"provider": key}, None)))
                     for key, provider in providers.items()}
            with mock.patch.dict(os.environ, {"LANES_SELFTEST": ""}):
                observed = health.observe(Path("fixture"), 1000)
            self.assertEqual(observed, {key: {"provider": key} for key in providers})
            for call in calls.values():
                call.assert_called_once_with(Path("fixture"), 1000)
                call.reset_mock()
            # The idle clock for Main Health runs on the doctor tick, fed the sample just read.
            probe.assert_called_once_with(Path("fixture"), {"provider": "mainHealth"}, 1000)
            probe.reset_mock()
            with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}):
                self.assertEqual(health.observe(Path("fixture"), 1000), dict.fromkeys(providers))
            for call in calls.values():
                call.assert_not_called()
            probe.assert_not_called()

    def test_all_incidents_reach_the_doctor_and_green_main_clears_its_key(self):
        sample = {"status": "failing", "failedStreak": 2, "failingSince": "2026-11-07T00:00:00Z",
                  "failingSha": "a" * 40, "url": "https://example.test/main-health"}
        observation = {"now": 1000, "mainHealth": sample, "deployHealth": {"provider": "deploy"},
                       "releaseEvidence": {"provider": "evidence"}, "releaseGates": {"provider": "gates"}}
        with mock.patch.object(health.deploy_health, "judge", return_value={"deploy": "red"}) as deploy, \
                mock.patch.object(health.release_evidence, "judge", return_value={"evidence": "red"}) as evidence, \
                mock.patch.object(health.release_gates, "judge", return_value={"gates": "red"}) as gates:
            alerts = health.judge(observation)
            self.assertEqual(set(alerts), {"deploy", "evidence", "gates", "main-health"})
            deploy.assert_called_once_with(observation["deployHealth"], 1000)
            evidence.assert_called_once_with(observation["releaseEvidence"], 1000)
            gates.assert_called_once_with(observation["releaseGates"], 1000)
            self.assertEqual(set(health.judge({**observation, "mainHealth": {"status": "ok"}})), {"deploy", "evidence", "gates"})

    def test_missing_health_signals_raise_no_incidents(self):
        self.assertEqual(health.judge({}), {})

    def test_feed_preserves_deploy_projection_and_exposes_main_certification(self):
        observation = {"now": 1000, "deployHealth": {"provider": "deploy"}, "mainHealth": {"status": "failing"}}
        with mock.patch.object(health.deploy_health, "feed_block", return_value={"deployment": "current"}) as deploy:
            feed = health.feed(observation)
        deploy.assert_called_once_with(observation["deployHealth"], 1000)
        self.assertEqual(feed["deployHealth"], {"deployment": "current"})
        self.assertFalse(feed["mainHealth"]["healthy"])
        self.assertEqual(health.feed({}), {"deployHealth": None, "mainHealth": None})


if __name__ == "__main__":
    unittest.main()
