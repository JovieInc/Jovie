import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import quota_rerun  # noqa: E402


class QuotaRerunDecisionTest(unittest.TestCase):
    FUTURE = "2099-01-01T00:00:00.000Z"
    PAST = "2000-01-01T00:00:00Z"

    def epoch(self, stamp):
        return quota_rerun.quota_reset_epoch(f"until {stamp}")

    def test_reset_epoch_uses_the_latest_stamp_and_ignores_junk(self):
        self.assertIsNone(quota_rerun.quota_reset_epoch(""))
        self.assertIsNone(quota_rerun.quota_reset_epoch("until not-a-date"))
        text = f"until {self.PAST}\nuntil {self.FUTURE}\n"
        self.assertEqual(self.epoch(self.FUTURE), quota_rerun.quota_reset_epoch(text))

    def test_future_reset_waits_without_spending_the_claim(self):
        reset = self.epoch(self.FUTURE)
        decision, row = quota_rerun.quota_rerun_decision(None, "h1", reset, reset - 10)
        self.assertEqual(decision, "wait")
        self.assertIsNone(row["claimedAt"])
        self.assertEqual(row["reset"], reset)
        again, kept = quota_rerun.quota_rerun_decision(row, "h1", reset, reset - 1)
        self.assertEqual(again, "wait")
        self.assertIsNone(kept["claimedAt"])

    def test_past_reset_reruns_once_including_a_legacy_head_string(self):
        reset = self.epoch(self.PAST)
        for stored in (None, "h1"):
            decision, row = quota_rerun.quota_rerun_decision(stored, "h1", reset, reset + 10)
            self.assertEqual(decision, "rerun", stored)
            self.assertEqual(row["claimedAt"], reset + 10)
            self.assertEqual(row["reset"], reset)
            again, _ = quota_rerun.quota_rerun_decision(row, "h1", reset, reset + 20)
            self.assertEqual(again, "spent")
        at_reset, _ = quota_rerun.quota_rerun_decision(None, "h1", reset, reset)
        self.assertEqual(at_reset, "rerun")

    def test_no_reset_reruns_once_and_a_legacy_string_stays_spent(self):
        decision, row = quota_rerun.quota_rerun_decision(None, "h1", None, 100.0)
        self.assertEqual(decision, "rerun")
        self.assertEqual(row["claimedAt"], 100.0)
        again, _ = quota_rerun.quota_rerun_decision(row, "h1", None, 110.0)
        self.assertEqual(again, "spent")
        spent, kept = quota_rerun.quota_rerun_decision("h1", "h1", None, 100.0)
        self.assertEqual((spent, kept), ("spent", "h1"))
        still, _ = quota_rerun.quota_rerun_decision(kept, "h1", None, 200.0)
        self.assertEqual(still, "spent")

    def test_bool_claim_and_other_head_do_not_count_as_spent(self):
        stored = {"head": "h1", "claimedAt": True, "reset": None}
        decision, _ = quota_rerun.quota_rerun_decision(stored, "h1", None, 100.0)
        self.assertEqual(decision, "rerun")
        fresh, _ = quota_rerun.quota_rerun_decision("other", "h1", None, 100.0)
        self.assertEqual(fresh, "rerun")
        with self.assertRaises(ValueError):
            quota_rerun.quota_rerun_decision(None, "", None, 100.0)
        with self.assertRaises(ValueError):
            quota_rerun.quota_rerun_decision(None, "h1", None, True)

    def test_lone_pr_ready_quota_log_stays_a_rerun_class(self):
        row = {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
            {"name": "PR Ready", "conclusion": "FAILURE"},
            {"name": "Source Validation", "conclusion": "SUCCESS"}]}
        log = f"github-quota-deferred until {self.FUTURE}"
        got = classes.classify(row, {"PR Ready": log})
        self.assertEqual((got["cls"], got["action"]), ("quota-deferred", "rerun"))
        names = [check["name"] for check in classes.real_failures(row)]
        self.assertEqual(names, ["PR Ready"])


if __name__ == "__main__":
    unittest.main()
