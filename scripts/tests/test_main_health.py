"""Main-health alarm: deliberate-red cases, including the 2026-10-29 pricing census incident shape."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main_health as mh  # noqa: E402


def run_row(conclusion, at, sha):
    return {"conclusion": conclusion, "created_at": at, "head_sha": sha * 40, "html_url": f"https://example/{sha}"}


class MainHealthTests(unittest.TestCase):
    def test_green_main_raises_nothing(self):
        state = mh.evaluate([run_row("success", "2026-10-29T18:00:00Z", "a")])
        self.assertEqual(state["status"], "ok")
        self.assertEqual(mh.judge(state), {})

    def test_failed_run_pages_with_first_bad_commit_and_clears_on_green(self):
        runs = [run_row("failure", "2026-10-29T18:30:00Z", "c"), run_row("failure", "2026-10-29T18:10:00Z", "b"),
                run_row("success", "2026-10-29T17:50:00Z", "a")]
        alerts = mh.judge(mh.evaluate(runs))
        self.assertEqual(list(alerts), ["main-health"])
        self.assertIn("2 consecutive", alerts["main-health"])
        self.assertIn("bbbbbbbbb", alerts["main-health"])
        self.assertEqual(mh.judge(mh.evaluate([run_row("success", "2026-10-29T19:00:00Z", "d")] + runs)), {})

    def test_cancelled_and_skipped_runs_say_nothing(self):
        runs = [run_row("cancelled", "2026-10-29T18:30:00Z", "c"), run_row("success", "2026-10-29T18:00:00Z", "a")]
        self.assertEqual(mh.evaluate(runs)["status"], "ok")
        self.assertEqual(mh.evaluate([run_row("skipped", "2026-10-29T18:30:00Z", "c")])["status"], "unknown")

    def test_unreadable_api_keeps_last_state_and_reports(self):
        def broken(args, **kw):
            return SimpleNamespace(returncode=1, stdout="", stderr="HTTP 502")
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "main-health.json").write_text(json.dumps({"status": "failing", "failedStreak": 1, "observedAt": 1.0}))
            data, error = mh.sample(Path(tmp), 10_000.0, run=broken)
        self.assertEqual(data["status"], "failing")
        self.assertIn("HTTP 502", error)

    def test_fresh_sample_is_read_from_the_workflow_runs_and_cached(self):
        body = json.dumps({"workflow_runs": [run_row("failure", "2026-10-29T18:30:00Z", "c")]})
        calls = []
        def ok(args, **kw):
            calls.append(args)
            return SimpleNamespace(returncode=0, stdout=body, stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            data, error = mh.sample(Path(tmp), 10_000.0, run=ok)
            again, _ = mh.sample(Path(tmp), 10_100.0, run=ok)
        self.assertIsNone(error)
        self.assertEqual(data["status"], "failing")
        self.assertEqual(len(calls), 1)
        self.assertIn("main-health.yml", calls[0][1])
        self.assertEqual(again["status"], "failing")
        self.assertFalse(mh.feed_block(data)["healthy"])


if __name__ == "__main__":
    unittest.main()
