"""Mixed fix-red body repairs. Split from test_fix_red_classes.py (size budget)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class MixedRepairTest(unittest.TestCase):
    def test_mixed_body_repairs_stay_on_the_model_for_the_remaining_class(self):
        changelog = "Error: Customer outcome decision missing or invalid (missing-metadata)."
        red = 'red-before-green: this repair PR has no "## Red-before-green" section'
        touched = (
            "::error file=apps/web/components/jovie/tool-ui.tsx::[test-not-touched] "
            "Component changed but test apps/web/components/jovie/tool-ui.test.tsx "
            "was not touched in this diff."
        )
        names = ("Affected Unit Tests (4/4)", "Fleet Rules Evidence", "Source Validation")
        logs = {
            "Affected Unit Tests (4/4)": touched,
            "Fleet Rules Evidence": red,
            "Source Validation": changelog,
        }
        bare = classes.classify({**pr(*names), "body": "## Summary\n"}, logs)
        self.assertEqual((bare["cls"], bare["action"]), ("mixed", "agent"))
        self.assertEqual(bare["repairs"], ["stamp-changelog", "red-before-green"])
        self.assertNotIn(bare["action"], classes.DETERMINISTIC)
        noted = classes.stamp_internal_changelog("## Summary\n")
        complete = (
            noted
            + "\n## Red-before-green\n\n"
            + "- Failing command: `node scripts/component-ship-gate.mjs`\n"
            + "- Failing run (before fix): https://github.com/JovieInc/Jovie/actions/runs/42880446507\n\n"
            + "```text\nFAIL component-ship-gate\n```\n"
        )
        done = classes.classify({**pr(*names), "body": complete}, logs)
        self.assertEqual(done["repairs"], [])
        self.assertEqual(done["action"], "agent")
        single = classes.classify(pr("Source Validation"), {"Source Validation": changelog})
        self.assertEqual(single["repairs"], [])
        self.assertEqual(single["action"], "stamp-changelog")
        noise = classes.classify(pr("A", "B"), {"A": "API rate limit exceeded", "B": "AssertionError"})
        self.assertEqual(noise["repairs"], [])

    def test_a_red_body_beside_only_sync_main_classes_syncs_main(self):
        red = 'red-before-green: this repair PR has no "## Red-before-green" section'
        summary = (
            " FAIL  workspace-scripts lib/__tests__/design-system-source-ratchet.test.mjs"
            " > design-system source identity ratchet (JOV-5301)"
            " > exits zero from the CLI on the live tree\n"
        )
        names = ("PR Fleet Rules", "Source Validation")
        logs = {"PR Fleet Rules": red, "Source Validation": summary}
        bare = classes.classify({**pr(*names), "body": "## Summary\n"}, logs)
        self.assertEqual((bare["cls"], bare["action"]), ("mixed", "sync-main"))
        self.assertEqual(bare["repairs"], ["red-before-green"])
        self.assertEqual(bare["actions"], ["sync-main"])
        behind = classes.classify({**pr(*names, merge="BEHIND"), "body": "## Summary\n"}, logs)
        self.assertEqual((behind["cls"], behind["action"]), ("mixed", "sync-main"))
        self.assertEqual(behind["repairs"], ["red-before-green"])
        complete = (
            "## Summary\n\n## Red-before-green\n\n"
            "- Failing command: `node scripts/design-system-source-ratchet.mjs`\n"
            "- Failing run (before fix): https://github.com/JovieInc/Jovie/actions/runs/43692020331\n\n"
            "```text\nFAIL design-system-source-ratchet\n```\n"
        )
        done = classes.classify({**pr(*names), "body": complete}, logs)
        self.assertEqual(done["repairs"], [])
        self.assertEqual((done["cls"], done["action"]), ("mixed", "sync-main"))
        assertion = classes.classify(
            {**pr(*names), "body": "## Summary\n"},
            {"PR Fleet Rules": red, "Source Validation": "AssertionError: expected 1"},
        )
        self.assertEqual((assertion["cls"], assertion["action"]), ("mixed", "agent"))
        self.assertEqual(assertion["repairs"], ["red-before-green"])

    def test_a_measured_win_failure_is_one_deterministic_class(self):
        win = ("win: this PR needs a measured win "
               "(metric, before, after, method, evidence).")
        both = classes.classify(pr("Fleet Rules Evidence", "PR Fleet Rules"), {
            "Fleet Rules Evidence": win, "PR Fleet Rules": win})
        self.assertEqual((both["cls"], both["action"]), ("measured-win", "repair-win"))
        self.assertEqual(both["repairs"], [])
        self.assertEqual(both["actions"], ["repair-win"])
        quota = classes.classify(pr("Fleet Rules Evidence"), {
            "Fleet Rules Evidence": "github-quota-deferred; " + win})
        self.assertEqual((quota["cls"], quota["action"]), ("quota-deferred", "rerun"))
        mixed = classes.classify(pr("Fleet Rules Evidence", "Unit"), {
            "Fleet Rules Evidence": win, "Unit": "AssertionError: expected 1"})
        self.assertEqual((mixed["cls"], mixed["action"]), ("mixed", "agent"))
        self.assertEqual(mixed["repairs"], ["repair-win"])

    def test_measured_win_and_stale_design_source_use_body_repair_then_main_sync(self):
        win = "win: this PR needs a measured win (metric, before, after, method, evidence)."
        design = (
            "[design-system-source-ratchet] FAIL — 1895 identities (0 new / baseline 1907)\n"
            "new design identity: apps/web/components/shell/SettingsRow.tsx"
            "\traw-palette-class\ttext-rose-300\n"
        )
        logs = {"PR Fleet Rules": win, "Source Validation": design}
        for state in ("BLOCKED", "BEHIND"):
            with self.subTest(state=state):
                route = classes.classify(pr(*logs, merge=state), logs)
                self.assertEqual((route["cls"], route["action"]), ("mixed", "sync-main"))
                self.assertEqual(route["actions"], ["sync-main"])
                self.assertEqual(route["repairs"], ["repair-win"])

    def test_a_failed_win_measurement_still_stamps_the_changelog(self):
        from unittest.mock import patch
        import fix_red_mixed_repairs as mixed
        claimed = []
        route = {"repairs": ["stamp-changelog", "repair-win"]}
        with patch("fix_red_measured_win.optional_section", return_value=None), \
                patch("pr_events.ensure_red_before_green", return_value=True) as ensure:
            reason = mixed.apply_mixed_body_repairs(
                None, {"number": 1, "body": "## Summary\n"}, route,
                lambda *args: claimed.append(args) or True)
        self.assertEqual(reason, "infra-rerun:mixed-body-repairs")
        self.assertEqual(claimed, [(None, {"number": 1, "body": "## Summary\n"}, "mixed-body-repairs")])
        self.assertIsNone(ensure.call_args.kwargs.get("win_section"))
        self.assertEqual(ensure.call_args.kwargs["customer_decision"], {"releaseWorthy": False})
