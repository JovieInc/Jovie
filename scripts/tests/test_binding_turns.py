"""A provider seat shared with a repository binding alternates while Jovie work is pending."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_lane_runner as harness  # noqa: E402  (loads lane_runner with the shared fixture env)

lane = harness.lane
binding_turns = lane.binding_turns
# The worker fixtures (free devin seat, disk capacity, qualification) are module-scoped there.
setUpModule = harness.setUpModule
tearDownModule = harness.tearDownModule


class BindingTurnsTest(unittest.TestCase):
    def test_yields_only_after_a_binding_turn_while_jovie_work_waits(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertFalse(binding_turns.yields(state, "codex", True))
            binding_turns.record(state, "codex", True)
            self.assertTrue(binding_turns.yields(state, "codex", True))
            self.assertFalse(binding_turns.yields(state, "codex", False))
            self.assertFalse(binding_turns.yields(state, "grok", True))  # per provider seat
            binding_turns.record(state, "codex", False)
            self.assertFalse(binding_turns.yields(state, "codex", True))

    def test_record_never_raises_on_an_unwritable_state(self):
        binding_turns.record(Path("/dev/null/not-a-dir"), "codex", True)


class WorkerFairShareTest(unittest.TestCase):
    setUp = harness.WorkerTest.setUp
    tearDown = getattr(harness.WorkerTest, "tearDown", unittest.TestCase.tearDown)

    def test_pending_jovie_work_gets_the_seat_after_a_binding_turn(self):
        with patch.object(lane, "jovie_repair_pending", return_value=True), \
                patch.object(lane.bindings, "work", return_value="pr-opened") as bound, \
                patch.object(lane, "run_issue", return_value={"verdict": "landing"}) as jovie:
            lane.worker(self.host, "devin")
            self.assertEqual(bound.call_count, 1)
            jovie.assert_not_called()
            lane.worker(self.host, "devin")  # last turn served the binding: Jovie goes next
            self.assertEqual(bound.call_count, 1)
            self.assertEqual(jovie.call_args.args[4].identifier, "JOV-3")
            lane.worker(self.host, "devin")  # and the binding gets the turn after that
            self.assertEqual(bound.call_count, 2)

    def test_binding_keeps_the_seat_when_no_jovie_work_is_pending(self):
        with patch.object(lane, "jovie_repair_pending", return_value=False), \
                patch.object(lane.bindings, "work", return_value="pr-opened") as bound:
            lane.worker(self.host, "devin")
            lane.worker(self.host, "devin")
        self.assertEqual(bound.call_count, 2)


if __name__ == "__main__":
    unittest.main()
