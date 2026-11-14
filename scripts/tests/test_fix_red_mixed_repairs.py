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
