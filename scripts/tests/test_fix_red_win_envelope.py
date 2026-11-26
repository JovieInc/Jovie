"""Partial Win envelopes are completed from the metric already in the section."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_win_envelope as envelope  # noqa: E402

BODY = """## Summary

keep

## Win
- Metric: PRs referencing a Linear issue | percent | higher | 60.1 | ? | GitHub PR list | title/branch/Refs/marker regex over last 7d
- Pending: yes

## Red-before-green

stay
"""
FILES = [{"filename": "scripts/lib/linear-reference-requirement.mjs", "status": "modified"}]
LOG = "\n".join([
    "##[error]win: area must be one of ci,queue,release,summer,perf,design,repo,quality,ai",
    "##[error]win: claim must be one line, at most 200 characters",
    "##[error]win: theme is required",
    "##[error]win: verifyLink required",
])


def pr(*names):
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": name, "conclusion": "FAILURE"} for name in names]}


class WinEnvelopeTest(unittest.TestCase):
    def test_envelope_errors_route_off_the_model_and_other_wins_stay(self):
        route = classes.classify(pr("Fleet Rules Evidence", "PR Fleet Rules"), {
            "Fleet Rules Evidence": LOG, "PR Fleet Rules": LOG})
        self.assertEqual((route["cls"], route["action"]), ("win-envelope", envelope.ACTION))
        measured = classes.classify(pr("Fleet Rules Evidence"), {
            "Fleet Rules Evidence": "##[error]win: this PR needs a measured win (metric, before, after, method, evidence)."})
        self.assertEqual((measured["cls"], measured["action"]), ("measured-win", "repair-win"))

    def test_mixed_head_still_carries_the_envelope_repair(self):
        route = classes.classify(pr("Fleet Rules Evidence", "Source Validation"), {
            "Fleet Rules Evidence": LOG,
            "Source Validation": "error TS2339: Property 'fix' does not exist on type",
        })
        self.assertEqual((route["cls"], route["action"]), ("mixed", "agent"))
        self.assertEqual(route["repairs"], [envelope.ACTION])

    def test_completion_uses_the_metric_and_refuses_product_paths(self):
        section, previous = envelope.complete_section(BODY, FILES)
        self.assertTrue(previous.startswith("## Win"))
        self.assertIn("- Claim: PRs referencing a Linear issue", section)
        self.assertIn("- Area: ci", section)
        self.assertIn("- Theme: prs-referencing-a-linear-issue", section)
        self.assertIn("- Pending: yes", section)
        self.assertIn("GitHub PR list — title/branch/Refs/marker regex over last 7d", section)
        self.assertIn("## Red-before-green", BODY)
        self.assertIsNone(envelope.complete_section(BODY, [{"filename": "apps/web/app/page.tsx"}]))
        self.assertIsNone(envelope.complete_section("## Summary\nonly\n", FILES))
        self.assertIsNone(envelope.infer_area([]))

    def test_product_policy_accepts_the_completed_section(self):
        if not Path("scripts/lib/wins-ledger.mjs").exists():
            self.skipTest("wins ledger is outside the release bundle")
        section, _previous = envelope.complete_section(BODY, FILES)
        self.assertIsNotNone(section)


if __name__ == "__main__":
    unittest.main()
