"""A provider seat alternates PR repairs with new Linear issues, so filed fixes are not starved."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_lane_runner as harness  # noqa: E402  (loads lane_runner with the shared fixture env)

lane = harness.lane
issue_turns = lane.issue_turns
setUpModule = harness.setUpModule
tearDownModule = harness.tearDownModule


class IssueTurnsTest(unittest.TestCase):
    def test_an_issue_turn_follows_a_repair_turn(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertFalse(issue_turns.due(state, "codex"))
            issue_turns.record(state, "codex", served_repair=True, found_issue=False)
            self.assertTrue(issue_turns.due(state, "codex"))
            self.assertFalse(issue_turns.due(state, "grok"))  # per provider seat
            issue_turns.record(state, "codex", served_repair=False, found_issue=True)
            self.assertFalse(issue_turns.due(state, "codex"))

    def test_an_empty_issue_turn_pauses_issue_turns(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            issue_turns.record(state, "codex", served_repair=False, found_issue=False)  # nothing to build
            issue_turns.record(state, "codex", served_repair=True, found_issue=False)
            self.assertFalse(issue_turns.due(state, "codex"))
            later = (state / "issue-turns/codex.empty").stat().st_mtime + issue_turns.EMPTY_BACKOFF_S
            self.assertTrue(issue_turns.due(state, "codex", now=later))

    def test_record_never_raises_on_an_unwritable_state(self):
        issue_turns.record(Path("/dev/null/not-a-dir"), "codex", served_repair=True, found_issue=False)


class WorkerIssueTurnTest(unittest.TestCase):
    setUp = harness.WorkerTest.setUp
    tearDown = getattr(harness.WorkerTest, "tearDown", unittest.TestCase.tearDown)

    def test_a_waiting_issue_gets_the_seat_after_a_repair(self):
        red = {"number": 77, "headRefName": "codex/jov-1-x", "headRefOid": "a" * 40}
        with patch.object(lane, "claim_red_pr", return_value=red), \
                patch.object(lane, "claim_adoptable_pr", return_value=None), \
                patch.object(lane.pr_events, "claim_event_pr", return_value=None), \
                patch.object(lane, "claim_escalation_pr", return_value=None), \
                patch.object(lane, "fix_red_pr", return_value={"verdict": "fix-pushed"}) as repair, \
                patch.object(lane, "run_issue", return_value={"verdict": "landing"}) as build:
            lane.worker(self.host, "devin")
            self.assertEqual(repair.call_count, 1)
            build.assert_not_called()
            lane.worker(self.host, "devin")  # last turn was a repair: the waiting issue goes next
            self.assertEqual(repair.call_count, 1)
            self.assertEqual(build.call_args.args[4].identifier, "JOV-3")
            lane.worker(self.host, "devin")  # and the repair gets the turn after that
            self.assertEqual(repair.call_count, 2)


if __name__ == "__main__":
    unittest.main()
