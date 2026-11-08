import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_js_scan as scan  # noqa: E402
import fix_red_size_split as split  # noqa: E402


def _pr():
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": "Company guards", "conclusion": "FAILURE"},
        {"name": "PR Ready", "conclusion": "FAILURE"},
    ]}


def _fat() -> str:
    head = """import { describe, expect, it } from 'vitest';
import { main } from './mod.mjs';
import { run } from './unused-run.mjs';
const label = 'main';
function helper(items = { 1: [box()] }) {
  return box();
}
const box = () => ({ name: 'box' });
describe('kept suite', () => {
  it('calls the helper', () => {
    expect(helper().name).toBe('box');
    expect(label).toBe('main');
  });
});
"""
    moved: list[str] = []
    index = 0
    while split.count_lines(head + "".join(moved)) <= split.LIMIT:
        moved.append(
            "describe('moved %d', () => {\n"
            "  it('keeps title %d', () => {\n"
            "    const probe = { cmd: 'node x' };\n"
            "    expect(probe.run).toBe(undefined);\n"
            "    expect(label).toBe('main');\n"
            "  });\n"
            "});\n" % (index, index)
        )
        index += 1
    return head + "".join(moved)


class SplitSizeTest(unittest.TestCase):
    def test_over_500_moves_trailing_suites_and_keeps_titles(self):
        text = _fat()
        self.assertGreater(split.count_lines(text), split.LIMIT)
        pieces = split.split_unbaselined_vitest(text, "scripts/lib/__tests__/example.test.mjs")
        self.assertIsNotNone(pieces)
        self.assertTrue(all(split.count_lines(body) <= split.LIMIT for body in pieces.values()))
        owner = pieces["scripts/lib/__tests__/example.test.mjs"]
        fixtures = pieces["scripts/lib/__tests__/example.fixtures.mjs"]
        cases = pieces["scripts/lib/__tests__/example.cases.mjs"]
        self.assertIn("it('calls the helper'", owner)
        self.assertIn("export function helper", fixtures)
        self.assertIn("keeps title", cases)
        self.assertIn("import './example.cases.mjs'", owner)
        self.assertNotIn("unused-run.mjs", owner + cases)
        self.assertNotIn("from './mod.mjs'", fixtures)
        for line in text.splitlines():
            if "it('" in line:
                self.assertIn(line.strip(), owner + cases)

    def test_short_file_and_grew_line_are_not_splits(self):
        self.assertIsNone(split.split_unbaselined_vitest("describe('only', () => {});\n", "a.test.mjs"))
        log = (
            "size-500: scripts/lib/__tests__/synthetic-canary-liveness.test.mjs: "
            "631 lines, over 500 and not baselined\n"
            "size-500: scripts/ci-fast-lanes.mjs: grew 3516 -> 3518\n"
        )
        self.assertEqual(split.paths_from_log(log), [
            "scripts/lib/__tests__/synthetic-canary-liveness.test.mjs"])
        got = classes.classify(_pr(), {"Company guards": log})
        self.assertEqual((got["cls"], got["action"]), ("size-500-new", "split-size-500"))
        self.assertIn(classes.SPLIT_SIZE, classes.DETERMINISTIC)
        self.assertEqual(got["files"], ["scripts/lib/__tests__/synthetic-canary-liveness.test.mjs"])

    def test_multi_declarator_is_not_one_binding(self):
        stmts = scan.parse_statements("const a = 1, b = 2;\n")
        self.assertEqual([stmt.kind for stmt in stmts], ["other"])


if __name__ == "__main__":
    unittest.main()
