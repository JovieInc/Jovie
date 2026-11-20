"""Size-500 stale growth. Split from test_fix_red_source_edits.py (size-500)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_source_edits as edits  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class Size500StaleTest(unittest.TestCase):
    LOG = "\n".join([
        "##[warning]vacuous-verdict: apps/web/lib/finance/metrics/engine.ts: 1 vacuous verdict site(s)",
        "##[error]size-500: apps/web/lib/agent-os/certification.ts: grew 1220 -> 1265",
        "##[error]size-500: scripts/lanes/lane_runner.py: grew 11721 -> 11736",
        "##[error]Process completed with exit code 1.",
        "company-guards: FAIL (2)",
    ])

    def test_blocked_size_growth_syncs_main(self):
        payload = pr("Company guards", merge="BLOCKED")
        payload["changedFiles"] = []
        got = classes.classify(payload, {"Company guards": self.LOG})
        self.assertEqual((got["cls"], got["action"]), ("size-500-stale", "sync-main"))
        self.assertIsNone(edits.size_500_stale_hit(None))
        self.assertIsNone(edits.size_500_stale_hit("##[error]Process completed with exit code 1."))

    def test_another_annotated_error_stays_with_the_model(self):
        log = self.LOG + "\n##[error]AssertionError: expected 1"
        got = classes.classify(pr("Company guards", merge="BLOCKED"), {"Company guards": log})
        self.assertEqual((got["cls"], got["action"]), ("other", "agent"))

    def test_a_known_signature_outranks_size_growth_in_the_same_log(self):
        log = "API rate limit exceeded\n" + self.LOG
        got = classes.classify(pr("Company guards"), {"Company guards": log})
        self.assertEqual(got["action"], "rerun")

    def test_size_growth_beside_another_failing_check_stays_mixed(self):
        got = classes.classify(pr("Company guards", "Unit Tests"), {
            "Company guards": self.LOG,
            "Unit Tests": "AssertionError: expected 1",
        })
        self.assertEqual((got["cls"], got["action"]), ("mixed", "agent"))

    def test_tracked_byte_stale_head_syncs_main(self):
        fit = "PR head has 10 tracked regular-file bytes, exceeding the 8-byte repository budget, while the merged tree fits at 7 bytes"
        over = "9 bytes of tracked regular files (merged tree; base 8 +1) exceeds the 8-byte combined-tree budget"
        self.assertEqual(classes.classify(pr("PR Size Guard"), {"PR Size Guard": fit})["action"], "sync-main")
        self.assertEqual(classes.classify(pr("PR Size Guard"), {"PR Size Guard": over})["action"], "agent")
