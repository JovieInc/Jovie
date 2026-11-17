import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


class QuotedPathListMergeTest(unittest.TestCase):
    def test_unions_one_assignment_line_in_main_order(self):
        text = (
            "before\n"
            "<<<<<<< HEAD\n"
            'LANE_TESTS = ["scripts/tests/test_fix_red_classes.py", "scripts/tests/test_reviewable_split.py",\n'
            "=======\n"
            'LANE_TESTS = ["scripts/tests/test_fix_red_classes.py", "scripts/tests/test_sourced_shell_conflict.py",\n'
            ">>>>>>> origin/main\n"
            '              "scripts/tests/test_codex_lane.py"]\n'
        )
        resolved = classes.resolve_additive_quoted_list_text(text)
        self.assertEqual(resolved, (
            "before\n"
            'LANE_TESTS = ["scripts/tests/test_fix_red_classes.py", '
            '"scripts/tests/test_sourced_shell_conflict.py", '
            '"scripts/tests/test_reviewable_split.py",\n'
            '              "scripts/tests/test_codex_lane.py"]\n'
        ))
        self.assertIsNone(classes.resolve_additive_identifier_list_text(text))

    def test_rejects_unknown_hunks(self):
        prose = "<<<<<<< HEAD\nkeep both sides.\n=======\nkeep main.\n>>>>>>> origin/main\n"
        self.assertIsNone(classes.merge_additive_quoted_path_line(
            'LANE_TESTS = ["scripts/a.py", "scripts/b.py",\n',
            'LANE_TESTS = ["scripts/b.py", "scripts/a.py",\n',
        ))
        self.assertIsNone(classes.merge_additive_quoted_path_line(
            'LANE_TESTS = ["scripts/a.py", "scripts/a.py",\n',
            'LANE_TESTS = ["scripts/a.py",\n',
        ))
        self.assertIsNone(classes.merge_additive_quoted_path_line(
            'LANE_TESTS = ["scripts/a.py"]\n',
            'ITEMS = ["scripts/a.py"]\n',
        ))
        self.assertIsNone(classes.resolve_additive_quoted_list_text(prose))
        self.assertIsNone(classes.merge_additive_quoted_path_line("LANE_TESTS = [\n", 'LANE_TESTS = ["scripts/a.py",\n'))

    def test_sorts_double_quoted_json_paths_after_the_union(self):
        text = (
            "[\n"
            "<<<<<<< HEAD\n"
            '  "tests/unit/ci/lighthouse-background-build.test.ts",\n'
            "=======\n"
            '  "tests/unit/ci/lighthouse-install-scope.test.ts",\n'
            ">>>>>>> origin/main\n"
            "]\n"
        )
        resolved = classes.resolve_additive_quoted_list_text(text)
        self.assertEqual(resolved, (
            "[\n"
            '  "tests/unit/ci/lighthouse-background-build.test.ts",\n'
            '  "tests/unit/ci/lighthouse-install-scope.test.ts",\n'
            "]\n"
        ))


class CommentedTestListMergeTest(unittest.TestCase):
    def test_keeps_main_comment_and_head_entry(self):
        ours = "  'scripts/lib/__tests__/product-lane-docs-only.test.mjs',\n"
        theirs = "  'scripts/lib/__tests__/sentry-autofix-recurrence-retry.test.mjs', // JOV-6813 marker-503 retry.\n"
        self.assertEqual(classes.merge_additive_quoted_entries(ours, theirs), theirs + ours)

    def test_rejects_changed_comments_for_same_entry_and_unknown_code(self):
        row = "  'scripts/a.test.mjs', // original\n"
        self.assertIsNone(classes.merge_additive_quoted_entries(row, row.replace('original', 'changed')))
        self.assertIsNone(classes.merge_additive_quoted_entries(row, "  'scripts/b.test.mjs', run()\n"))
