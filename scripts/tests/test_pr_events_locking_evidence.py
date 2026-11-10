"""Focused provenance placeholder regressions for lane repair evidence."""
import os
from pathlib import Path
import sys
import unittest

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import pr_events as events


class LockingEvidenceTests(unittest.TestCase):
    PR = {"number": 7, "headRefOid": "a" * 40, "statusCheckRollup": [
        {"name": "Source Validation", "conclusion": "FAILURE",
         "detailsUrl": "https://github.com/JovieInc/Jovie/actions/runs/123/job/456"}]}

    def test_explicit_locking_pr_repairs_empty_or_placeholder_sections(self):
        body = events.red_before_green_block(self.PR)
        following = "## Blast radius\nPreserve existing proof.\n"
        for placeholder in ("", "None.", "- None", "N/A", "Not applicable", "TODO", "TBD", "None.\n<!-- keep this note -->", "None.\n\nGenerated with Claude Code"):
            with self.subTest(placeholder=placeholder):
                original = body + "\n## Locked areas\n" + placeholder + "\n\n" + following
                updated = events.repair_evidence_body(self.PR, original, locking_pr=22331)
                self.assertEqual(updated.count("## Locked areas"), 1)
                self.assertIn("Locking PR: #22331", updated)
                self.assertTrue(updated.endswith(following))
                for note in ("<!-- keep this note -->", "Generated with Claude Code"):
                    if note in placeholder:
                        self.assertIn(note, updated)
                self.assertEqual(events.repair_evidence_body(self.PR, updated, locking_pr=22331), updated)
                self.assertEqual(events.repair_evidence_body(self.PR, original), original)

    def test_locking_repair_ignores_fenced_and_hidden_headings(self):
        example = "```markdown\n## Locked areas\nNone.\n```\n<!-- ## Locked areas -->\n"
        original = example + events.red_before_green_block(self.PR) + "\n## Locked areas\nNone.\n\n## Review\nKeep verdict.\n"
        updated = events.repair_evidence_body(self.PR, original, locking_pr=22331)
        self.assertTrue(updated.startswith(example))
        self.assertIn("Locking PR: #22331", updated)
        self.assertTrue(updated.endswith("## Review\nKeep verdict.\n"))
