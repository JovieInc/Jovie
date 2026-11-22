"""The fingerprint breaker holds a PR for a window, not forever (Tim 2026-11-22, "cut the biggest wait").

A head that kept missing the same failure used to stay held with no expiry while still labeled
lane-fix-red, so nobody repaired it (#26066: seven same-head claims Nov 19-20, none after).
Split from test_lane_runner.py (size budget). Run with:
    python3 -m unittest test_fp_breaker_hold  (from scripts/tests)
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_pr_events as harness  # noqa: E402  (pr_events + an aliased lane_runner)

lane = harness.runner
ROUTE = {"cls": "other", "key": "abc123abc123", "action": "agent", "signature": "assertionerror"}
PR = {"number": 5, "title": "t", "headRefName": "devin/jov-1", "headRefOid": "h1"}


class FingerprintHoldTest(unittest.TestCase):
    def test_a_fingerprint_hold_ends_after_its_window_so_the_pr_is_retried(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            receipt = {"verdict": "fix-no-change", "runId": "r", "failureFingerprint": ROUTE}
            n = lane.fingerprint_breaker_n(host)
            for index in range(n):
                lane.note_breaker_run(host, PR, receipt, now=1000 + index)
            tripped = 1000 + n - 1
            hold = lane.pr_events.FP_HOLD_S
            self.assertTrue(lane.pr_events.pr_breaker_open(host, 5, tripped + hold - 1, "h1"))
            self.assertFalse(lane.pr_events.pr_breaker_open(host, 5, tripped + hold, "h1"),
                             "the same head gets another repair once the hold ends")
            later = tripped + hold + 10  # misses after the release trip it again, with a fresh hold
            for index in range(n):
                lane.note_breaker_run(host, PR, receipt, now=later + index)
            self.assertTrue(lane.pr_events.pr_breaker_open(host, 5, later + hold - 100, "h1"))
            self.assertEqual(len(list((host.state / "factory-signals").glob("*.json"))), 1,
                             "one machine-gap issue per class")

    def test_a_legacy_fingerprint_hold_without_a_stamp_releases(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            (host.state / "pr-breaker.json").write_text(json.dumps({"5": {"runs": [], "fpOpenHead": "h1"}}))
            self.assertFalse(lane.pr_events.pr_breaker_open(host, 5, 5_000_000, "h1"))


if __name__ == "__main__":
    unittest.main()
