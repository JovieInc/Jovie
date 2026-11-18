"""Quoted coverage-include brace lists union; any other edit stays unresolved."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


class CoverageIncludeMergeTest(unittest.TestCase):
    def test_unions_coverage_include_braces_and_rejects_edits(self):
        ours = (
            "node --experimental-strip-types --test "
            "--test-coverage-include='src/{core,executor}.ts' src/*.test.mjs && "
            "node --test --test-coverage-include='worker/{mesh-worker}.mjs' worker/*.test.mjs"
        )
        theirs = (
            "node --experimental-strip-types --test "
            "--test-coverage-include='src/{core,executor,mcp}.ts' src/*.test.mjs"
        )
        merged = (
            "node --experimental-strip-types --test "
            "--test-coverage-include='src/{core,executor,mcp}.ts' src/*.test.mjs && "
            "node --test --test-coverage-include='worker/{mesh-worker}.mjs' worker/*.test.mjs"
        )
        conflict = (
            "{\n<<<<<<< HEAD\n"
            f'    "test": "{ours}",\n'
            "=======\n"
            f'    "test": "{theirs}",\n'
            ">>>>>>> origin/main\n}\n"
        )
        resolved = classes.resolve_and_chain_text(conflict)
        self.assertEqual(resolved, '{\n    "test": "' + merged + '",\n}\n')
        reordered = conflict.replace("core,executor}.ts", "executor,core}.ts", 1)
        self.assertIsNone(classes.resolve_and_chain_text(reordered))
        flagged = theirs.replace(" src/*.test.mjs", " --strict src/*.test.mjs")
        self.assertIsNone(classes.resolve_and_chain_text(conflict.replace(theirs, flagged, 1)))
        drifted = conflict.replace(f'    "test": "{ours}",\n', "    const drifted = true;\n")
        self.assertIsNone(classes.resolve_and_chain_text(drifted))

    def test_unions_quoted_pytest_paths_in_main_order(self):
        from fix_red_conflict_resolvers import merge_pytest_file_list
        main = "  'scripts/tests/test_a.py scripts/tests/test_reason_events.py'.split(\n"
        head = "  'scripts/tests/test_a.py scripts/tests/test_fix_red_coverage_include.py'.split(\n"
        union = "  'scripts/tests/test_a.py scripts/tests/test_reason_events.py scripts/tests/test_fix_red_coverage_include.py'.split(\n"
        self.assertEqual(merge_pytest_file_list(head, main), union)
        conflict = "<<<<<<< HEAD\n" + head + "=======\n" + main + ">>>>>>> origin/main\n"
        self.assertEqual(classes.resolve_additive_identifier_list_text(conflict), union)
        self.assertIsNone(merge_pytest_file_list("  'scripts/tests/test_reason_events.py scripts/tests/test_a.py'.split(\n", main))
        self.assertIsNone(merge_pytest_file_list("  'scripts/tests/test_a.py scripts/tests/test_a.py'.split(\n", main))
        self.assertIsNone(merge_pytest_file_list(head + main, main))
        self.assertIsNone(classes.resolve_additive_identifier_list_text(conflict.replace(".split(", ".join(", 1)))


class PytestCountConflictTest(unittest.TestCase):
    def test_counts_union_and_keeps_assertions_but_rejects_unrelated_edits(self):
        from fix_red_conflict_resolvers import resolve_pytest_count_conflict
        head = "  'scripts/tests/test_a.py scripts/tests/test_head.py'.split(\n"
        main = "  'scripts/tests/test_a.py scripts/tests/test_main.py'.split(\n"
        hunk = ("<<<<<<< HEAD\n    expect(LANES_PYTEST_FILES).toHaveLength(2);\n"
                "    expect(whole).toContain('scripts/tests/test_head.py');\n=======\n"
                "    expect(LANES_PYTEST_FILES).toHaveLength(2);\n"
                "    expect(whole).toContain('scripts/tests/test_main.py');\n>>>>>>> origin/main\n")
        expected = ("    expect(LANES_PYTEST_FILES).toHaveLength(3);\n"
                    "    expect(whole).toContain('scripts/tests/test_main.py');\n"
                    "    expect(whole).toContain('scripts/tests/test_head.py');\n")
        self.assertEqual(resolve_pytest_count_conflict(hunk, head, main), expected)
        self.assertIsNone(resolve_pytest_count_conflict(hunk.replace('Length(2)', 'Length(9)', 1), head, main))
        self.assertIsNone(resolve_pytest_count_conflict(hunk.replace('test_head.py', 'test_other.py'), head, main))
        self.assertIsNone(resolve_pytest_count_conflict(hunk + hunk, head, main))
        self.assertIsNone(resolve_pytest_count_conflict(hunk.replace('=======', '    dangerous();\n======='), head, main))


if __name__ == "__main__":
    unittest.main()
