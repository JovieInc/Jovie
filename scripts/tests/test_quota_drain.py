"""Quota-drain detector and bounded diagnostic regressions."""
import json
import tempfile
import unittest
from pathlib import Path

from scripts.tests.test_doctor import doctor, obs

class QuotaDrainTests(unittest.TestCase):
    ALERT = {"bucket": "github-token", "remaining": 3000, "ratePerMinute": 200,
             "emptyAt": "2026-10-26T01:00:00.000Z", "resetAt": "2026-10-26T01:35:00.000Z", "minutesEarly": 35}

    def test_alert_names_the_bucket_and_is_silent_without_a_projection(self):
        alert = doctor.judge(obs(quotaDrain={"alerts": [self.ALERT]}))["quota-drain"]
        self.assertIn("github-token has 3000 left at ~200/min", alert)
        self.assertIn("35 min before its reset", alert)
        self.assertNotIn("quota-drain", doctor.judge(obs(quotaDrain={"alerts": []})))
        self.assertNotIn("quota-drain", doctor.judge(obs()))

    def test_sampler_parses_exit_three_caches_and_keeps_a_stale_read_on_failure(self):
        import tempfile
        from types import SimpleNamespace
        report = {"schema": "jovie-actions-quota-drain/v1", "generatedAt": "x", "alerts": [self.ALERT]}
        out = "::notice::ignored\n".replace("::notice::ignored\n", "") + json.dumps(report) + "\n::warning title=x::y\n"
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=3, stdout=out, stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            signal, error = doctor.sample_quota_drain(Path(tmp), 1000.0, run)
            self.assertEqual((len(signal["alerts"]), error), (1, None))
            self.assertEqual(calls[0][2:], ["drain", "--json", "--hours", "1"])
            read_calls = len(calls)  # the drain read, plus the tally pass while a bucket is draining
            again, _ = doctor.sample_quota_drain(Path(tmp), 1100.0, run)
            self.assertEqual(len(calls), read_calls, "a fresh cache is not re-read")
            self.assertEqual(again["alerts"][0]["bucket"], "github-token")
            broken = lambda *a, **k: SimpleNamespace(returncode=2, stdout="", stderr="boom")
            stale, error = doctor.sample_quota_drain(Path(tmp), 5000.0, broken)
            self.assertEqual(len(stale["alerts"]), 1)
            self.assertIn("boom", error)

    def test_alert_names_the_top_github_token_callers_from_the_tally(self):
        signal = {"alerts": [self.ALERT], "topCallers": [
            {"key": "Lane Fix Relay / relay", "githubTokenPerHour": 480, "githubTokenPerRun": 3.8}]}
        alert = doctor.judge(obs(quotaDrain=signal))["quota-drain"]
        self.assertIn("Top github.token callers: Lane Fix Relay / relay ~480/h", alert)

    def test_sampler_attaches_the_tally_only_while_a_bucket_is_draining(self):
        import tempfile
        from types import SimpleNamespace
        drain = {"schema": "jovie-actions-quota-drain/v1", "generatedAt": "x", "alerts": [self.ALERT]}
        quiet = {"schema": "jovie-actions-quota-drain/v1", "generatedAt": "x", "alerts": []}
        tally = {"schema": "jovie-gh-call-tally/v1", "complete": True, "rows": [
            {"key": "Lane Fix Relay / relay", "githubTokenPerHour": 480, "githubTokenPerRun": 3.8}]}
        calls = []

        def run_for(report):
            def run(args, **kwargs):
                calls.append(args[2])
                if args[2] == "tally":
                    return SimpleNamespace(returncode=0, stdout=json.dumps(tally) + "\n", stderr="")
                return SimpleNamespace(returncode=3 if report["alerts"] else 0, stdout=json.dumps(report) + "\n", stderr="")
            return run
        with tempfile.TemporaryDirectory() as tmp:
            signal, _ = doctor.sample_quota_drain(Path(tmp), 1000.0, run_for(drain))
            self.assertEqual(signal["topCallers"][0]["key"], "Lane Fix Relay / relay")
            self.assertEqual(calls, ["drain", "tally"])
        for invalid in ({"complete": False}, {"schema": "wrong"}, {"complete": None},
                        {"rows": ["malformed"]}, {"rows": [{"key": "bad", "githubTokenPerHour": True}]}):
            broken = {**tally, **invalid}
            def invalid_tally(args, **kwargs):
                if args[2] == "tally":
                    self.assertEqual(args[-2:], ["--max-reads", "8"])
                    self.assertEqual(kwargs["timeout"], 150)
                return SimpleNamespace(returncode=0, stdout=json.dumps(broken if args[2] == "tally" else drain), stderr="")
            with tempfile.TemporaryDirectory() as tmp:
                signal, error = doctor.sample_quota_drain(Path(tmp), 1000.0, invalid_tally)
                self.assertIsNone(error)
                self.assertEqual(signal["alerts"], [self.ALERT])
                self.assertNotIn("topCallers", signal)
        calls.clear()
        with tempfile.TemporaryDirectory() as tmp:
            signal, _ = doctor.sample_quota_drain(Path(tmp), 1000.0, run_for(quiet))
            self.assertNotIn("topCallers", signal)
            self.assertEqual(calls, ["drain"])
