"""Retained sole-baseline citation and bounded existing-controller regressions."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fix_red_classes as classes

def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class BaselineLockTest(unittest.TestCase):
    def test_passing_fixture_text_cannot_authorize_a_lock_citation(self):
        message = ("locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> "
                   "in Locked areas for apps/web/typecheck-tests-baseline.json.")
        for noise in ("✔ handles " + message, "echo '" + message + "'", repr(message)):
            with self.subTest(noise=noise):
                self.assertIsNone(classes.baseline_locking_pr(noise))
                got = classes.classify(pr("Source Validation"), {
                    "Source Validation": noise + "\nAssertionError: actual product defect"})
                self.assertNotEqual(got["cls"], "baseline-lock")

    def test_a_separate_second_locked_path_requires_its_own_provenance(self):
        known = ("##[error]locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> "
                 "in Locked areas for apps/web/typecheck-tests-baseline.json.")
        other = known.replace("apps/web/typecheck-tests-baseline.json", "apps/web/ui-feel-ratchet.baseline.json")
        self.assertIsNone(classes.baseline_locking_pr(known + "\n" + other))

    def test_real_github_log_formats_keep_the_same_scope_and_fingerprint(self):
        message = ("locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> "
                   "in Locked areas for apps/web/typecheck-tests-baseline.json.")
        key = classes.classify(pr("Fleet Rules Evidence"), {"Fleet Rules Evidence": message})["key"]
        for prefix in ("##[error]", "::error::", "2026-11-20T18:00:00.000Z ##[error]",
                       "Fleet\tAssess\t2026-11-20T18:00:00Z ##[error]", "\x1b[31m##[error]"):
            with self.subTest(prefix=prefix):
                text = prefix + message
                self.assertEqual(classes.baseline_locking_pr(text), 16597)
                self.assertEqual(classes.classify(pr("Fleet Rules Evidence"), {"Fleet Rules Evidence": text})["key"], key)

    def test_sole_typecheck_baseline_lock_cites_16597_and_a_second_path_does_not(self):
        sole = (
            "##[error]red-before-green: include Failing command: plus a red-output fence\n"
            "##[error]locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> "
            "in Locked areas for apps/web/typecheck-tests-baseline.json. "
            'Add to the PR body: "## Locked areas\\nGBrain: design/design-operating-system".'
        )
        extra = sole.replace(
            "apps/web/typecheck-tests-baseline.json.",
            "apps/web/typecheck-tests-baseline.json, apps/web/ui-feel-ratchet.baseline.json.",
        )
        later = (
            "locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> in Locked areas for "
            "apps/web/ui-feel-ratchet.baseline.json, apps/web/typecheck-tests-baseline.json."
        )
        got = classes.classify(pr("Fleet Rules Evidence"), {"Fleet Rules Evidence": sole})
        self.assertEqual((got["cls"], got["action"]), ("baseline-lock", "cite-baseline-lock"))
        self.assertEqual(classes.baseline_locking_pr(sole), 16597)
        self.assertIsNone(classes.baseline_locking_pr(extra))
        self.assertIsNone(classes.baseline_locking_pr(later))
        self.assertIsNone(classes.baseline_locking_pr(""))
        other = classes.classify(pr("Fleet Rules Evidence"), {"Fleet Rules Evidence": extra})
        self.assertEqual(other["action"], classes.STAMP_REPAIR)
        # Preserve current main's generic body repair; it must not auto-cite another lock.
        self.assertNotEqual(other["cls"], "baseline-lock")


    def test_sole_typecheck_baseline_lock_cites_16597_once_per_head(self):
        import test_lane_runner as existing
        harness = existing.FixRedTest()
        harness.setUp()
        self.addCleanup(harness.doCleanups)
        self.addCleanup(harness.tearDown)
        lane = existing.lane
        log = (
            "##[error]locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> "
            "in Locked areas for apps/web/typecheck-tests-baseline.json."
        )
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(lane.pr_events, "ensure_red_before_green", return_value=True) as ensure:
            _, receipt, agent, again = harness.run_gate(tmp, log)
            self.assertEqual(receipt["reasons"], ["infra-rerun:baseline-lock"])
            self.assertEqual(receipt["failureFingerprint"]["cls"], "baseline-lock")
            agent.assert_not_called()
            again.assert_not_called()
            ensure.assert_called_once()
            self.assertEqual(ensure.call_args.kwargs["locking_pr"], 16597)
            self.assertIn("typecheck-tests-baseline.json", ensure.call_args.args[1])
            _, second, agent2, _ = harness.run_gate(tmp, log)
            agent2.assert_called_once()
            self.assertNotEqual(second["reasons"][:1], ["infra-rerun:baseline-lock"])
        cited = {**harness.pr(), "body": "## Locked areas\nLocking PR: #16597\n"}
        with tempfile.TemporaryDirectory() as tmp:
            _, receipt, agent, _ = harness.run_gate(tmp, log, pr=cited)
            agent.assert_called_once()
            self.assertNotEqual(receipt["reasons"][:1], ["infra-rerun:baseline-lock"])


    def test_plain_fleet_signature_keeps_the_original_known_mapping(self):
        message = ("locked-areas: cite GBrain: <slug/page> or Locking PR: #<number> "
                   "in Locked areas for apps/web/typecheck-tests-baseline.json.")
        got = classes.classify(pr("Fleet Rules Evidence"), {"Fleet Rules Evidence": message})
        self.assertEqual((got["cls"], got["action"]), ("baseline-lock", "cite-baseline-lock"))


    def test_real_failure_or_failed_rerun_still_reaches_the_agent(self):
        import test_lane_runner as existing
        harness = existing.FixRedTest()
        harness.setUp()
        self.addCleanup(harness.doCleanups)
        self.addCleanup(harness.tearDown)
        with tempfile.TemporaryDirectory() as tmp:
            _, receipt, agent, again = harness.run_gate(tmp, "AssertionError: expected 1 to equal 2")
            agent.assert_called_once()
            again.assert_not_called()
        with tempfile.TemporaryDirectory() as tmp:
            _, receipt, agent, _ = harness.run_gate(tmp, "API rate limit exceeded", rerun=False)
            agent.assert_called_once()
