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


if __name__ == "__main__":
    unittest.main()
