"""Health composition keeps all existing doctor signals and main certification."""
from __future__ import annotations

import json
import os
import sys
import unittest
from contextlib import ExitStack
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(SCRIPTS / "lanes"), str(SCRIPTS)]
import health_checks as health  # noqa: E402


class AutomationLivenessReceiptTests(unittest.TestCase):
    now = datetime.fromisoformat("2026-11-27T09:00:00+00:00").timestamp()

    def artifact(self, *, branch="main", head_repo=1030964787, **overrides):
        return {
            "id": 15180208296, "name": "automation-liveness-receipts", "size_in_bytes": 12553,
            "created_at": "2026-11-27T07:43:33Z", "expires_at": "2027-02-25T07:42:06Z", "expired": False,
            "url": "https://api.github.com/repos/JovieInc/Jovie/actions/artifacts/15180208296",
            "workflow_run": {"id": 45960270786, "head_branch": branch, "head_sha": "a" * 40,
                             "repository_id": 1030964787, "head_repository_id": head_repo},
            **overrides,
        }

    def observation(self, rows, *, total=None, code=0):
        payload = json.dumps({"artifacts": rows, "total_count": len(rows) if total is None else total})
        lane = SimpleNamespace(REPO_SLUG="JovieInc/Jovie", shared=lambda _key, _ttl, fetch: fetch())
        with mock.patch("apiclient.gh.run_gh", return_value={"code": code, "stdout": payload}) as shell:
            observed = health.automation_liveness(lane, self.now)
        shell.assert_called_once_with(["api", "repos/JovieInc/Jovie/actions/artifacts"
                                              "?name=automation-liveness-receipts&per_page=20"], priority="poll",
                                      max_attempts=1, max_wait_ms=0, run=mock.ANY)
        return observed

    def test_stale_detector_report_is_preserved_without_looking_at_wrapper_conclusion(self):
        newer = "2026-11-27T08:59:00Z"
        rows = [self.artifact(branch="topic", created_at=newer), self.artifact(head_repo=9, created_at=newer),
                self.artifact(expired=True, created_at=newer), self.artifact()]
        self.assertEqual(self.observation(rows), {"installed": True, "lastRunAt": "2026-11-27T07:43:33Z"})
        self.assertEqual(self.observation([self.artifact(created_at=newer), *rows]),
                         {"installed": True, "lastRunAt": newer})

    def test_absent_or_untrusted_receipt_never_refreshes_the_detector(self):
        self.assertEqual(self.observation([]), {"installed": True, "lastRunAt": None})
        for invalid in (self.artifact(workflow_run={}), self.artifact(size_in_bytes=0),
                        self.artifact(url="https://elsewhere.test/artifact"), self.artifact(created_at="soon"),
                        self.artifact(created_at="2026-11-27T09:01:00Z"), self.artifact(expires_at="2026-11-27T08:00:00Z")):
            with self.subTest(invalid=invalid):
                self.assertEqual(self.observation([invalid]), {"installed": None})
        self.assertEqual(self.observation([self.artifact(branch="topic")], total=2), {"installed": None})
        self.assertEqual(self.observation([], code=1), {"installed": None})


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
