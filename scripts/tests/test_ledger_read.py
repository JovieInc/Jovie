"""A torn ledger line must not block preserved repair recovery when this run's receipt is intact."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_lane_runner as harness  # noqa: E402  (loads lane_runner with the shared fixture env)

lane = harness.lane
setUpModule = harness.setUpModule
tearDownModule = harness.tearDownModule
TORN = '{"schema": "jovie-file-ove{"schema": "jovie-lane-run/v1", "runId": "x"'


class LedgerReadTest(unittest.TestCase):
    def test_skips_torn_and_non_object_lines_and_flags_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ledger.jsonl"
            path.write_text("\n".join([json.dumps({"runId": "a"}), TORN, "[]", "", json.dumps({"runId": "b"})]) + "\n")
            rows, malformed = lane.ledger_read.rows(path)
        self.assertEqual([row["runId"] for row in rows], ["a", "b"])
        self.assertTrue(malformed)

    def test_a_clean_ledger_is_not_flagged(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ledger.jsonl"
            path.write_text(json.dumps({"runId": "a"}) + "\n")
            self.assertEqual(lane.ledger_read.rows(path), ([{"runId": "a"}], False))

    def test_a_missing_ledger_raises(self):
        with self.assertRaises(OSError):
            lane.ledger_read.rows(Path("/nonexistent/ledger.jsonl"))


class TornLedgerRecoveryTest(unittest.TestCase):
    # The PreservedRecoveryTest fixture (repo, shell double, hold helper), without re-running its tests.
    locals().update({k: v for k, v in vars(harness.PreservedRecoveryTest).items()
                     if not k.startswith(("test_", "__"))})

    def test_an_unrelated_torn_line_does_not_hand_off_an_intact_preserved_run(self):
        self.hold()
        ledger = self.host.state / "runs/ledger.jsonl"
        ledger.write_text(TORN + "\n" + ledger.read_text())
        with patch.object(lane, "run_agent", side_effect=lane.RepairStopped("target-state-unavailable", None, "agent-running")):
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertNotEqual((receipt.get("recovery") or {}).get("reason"), "preserved-ledger-unreadable")

    def test_a_torn_ledger_without_the_receipt_still_hands_off(self):
        self.hold()
        (self.host.state / "runs/ledger.jsonl").write_text(TORN + "\n")
        with patch.object(lane.execution_attempt, "claim") as claim:
            receipt = lane.fix_red_pr(self.host, "codex", {"cmd": ["true"]}, self.pr)
        self.assertEqual(receipt["verdict"], "recovery-handoff")
        self.assertEqual(receipt["recovery"]["reason"], "preserved-ledger-unreadable")
        claim.assert_not_called()


if __name__ == "__main__":
    unittest.main()
