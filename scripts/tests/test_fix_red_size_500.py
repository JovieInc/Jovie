import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_size_500 as size500  # noqa: E402
import size500_scan  # noqa: E402
from fix_red_source_edits import size_500_route  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "headRefName": "glm/jov-12692-stale-capture-diagnosis",
            "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


def _over_limit() -> str:
    lines = [
        "import { readFileSync, writeFileSync } from 'node:fs';",
        "import { delimiter } from 'node:path';",
        "import { afterEach, describe, expect, it } from 'vitest';",
        "const fixtureRoots = [];",
        "afterEach(() => { for (const item of fixtureRoots) writeFileSync(item, 'x'); });",
        "const root = 'outer-root';",
        "const onlyFirst = 'protocol-only';",
        "function cacheFixture() {",
        "  const root = 'inner-root';",
        "  fixtureRoots.push(root);",
        "  return readFileSync(root);",
        "}",
        "describe('failed visual workflow notification protocol', () => {",
        "  it('keeps the path delimiter', () => expect(delimiter).toBe(delimiter));",
    ]
    lines.extend(
        f"  it('case {index}', () => expect(onlyFirst + root).toContain('protocol-only'));"
        for index in range(470)
    )
    lines.append("});")
    lines.append("describe('current capture bindings before refresh admission', () => {")
    lines.append("  it('names the stale component and the failing class in the refusal', () => {")
    lines.append("    expect(cacheFixture()).toBeTruthy();")
    lines.append("  });")
    lines.extend(
        f"  it('extra {index}', () => expect(cacheFixture()).toBeTruthy());" for index in range(40)
    )
    lines.extend(["});", ""])
    return "\n".join(lines)


_UNBASED = (
    "##[warning]vacuous-verdict: apps/web/lib/seo/page-certification.ts: 1 vacuous verdict site(s)\n"
    "##[error]size-500: scripts/lib/__tests__/component-story-completion.test.mjs: 509 lines, over 500 and not baselined\n"
    "##[error]Process completed with exit code 1.\n"
)
_GREW = (
    "##[error]size-500: scripts/lanes/lane_runner.py: grew 11721 -> 11736\n"
    "##[error]Process completed with exit code 1.\n"
)


class Size500SplitTest(unittest.TestCase):
    def test_reference_closure_keeps_each_part_under_the_ceiling(self):
        text = _over_limit()
        self.assertGreater(size500.line_count(text), 500)
        result = size500.split_test("scripts/lib/__tests__/demo.test.mjs", text)
        self.assertIsNotNone(result)
        files = dict(result["files"])
        first = files["scripts/lib/__tests__/demo.test.mjs"]
        second = files["scripts/lib/__tests__/demo.size500-2.test.mjs"]
        self.assertLessEqual(size500.line_count(first), 500)
        self.assertLessEqual(size500.line_count(second), 500)
        self.assertIn("failed visual workflow", first)
        self.assertNotIn("function cacheFixture", first)
        self.assertNotIn("names the stale component", first)
        self.assertIn("function cacheFixture", second)
        self.assertIn("afterEach", second)
        self.assertIn("fixtureRoots", second)
        self.assertIn("names the stale component", second)
        self.assertNotIn("failed visual workflow", second)
        self.assertNotIn("outer-root", second)
        self.assertNotIn("protocol-only", second)
        self.assertNotIn("readFileSync", first)
        self.assertIn("readFileSync", second)
        self.assertIn("import { delimiter } from 'node:path';", first)
        self.assertNotIn("delimiter", second)

    def test_for_of_and_template_interpolation_are_references(self):
        self.assertEqual(
            size500_scan._local_bindings("for (const item of fixtureRoots) {\n  use(item);\n}\n"),
            {"item"},
        )
        self.assertNotIn("delimiter", size500_scan._local_bindings("const path = `${delimiter}`;\n"))
        self.assertEqual(size500_scan._local_bindings("const { of: name } = source;\n"), {"name"})
        self.assertEqual(size500_scan._local_bindings("const of = 1;\n"), {"of"})

    def test_spread_call_counts_as_a_reference(self):
        spread = size500_scan._statements("const record = {\n  ...storyReceipt(hash),\n};\n")
        self.assertIn("storyReceipt", spread[0]["idents"])
        prop = size500_scan._statements("obj.digest('hex');\n")
        self.assertNotIn("digest", prop[0]["idents"])

    def test_a_single_block_or_a_non_test_cannot_split(self):
        huge = "describe('only', () => {\n" + "\n".join(f"  it('c{i}', () => {{}});" for i in range(600)) + "\n});\n"
        self.assertIsNone(size500.split_test("scripts/lib/__tests__/demo.test.mjs", huge))
        self.assertIsNone(size500.split_test("scripts/lib/demo.mjs", _over_limit()))
        self.assertIsNone(size500.split_test("scripts/lib/__tests__/demo.test.mjs", "describe('a', () => {});\n"))

    def test_ci_fast_insert_is_idempotent_and_requires_one_parent(self):
        parent = "scripts/lib/__tests__/demo.test.mjs"
        sibling = "scripts/lib/__tests__/demo.size500-2.test.mjs"
        source = f"const tests = [\n  '{parent}',\n];\n"
        once = size500.insert_siblings(source, parent, [sibling])
        self.assertEqual(once, f"const tests = [\n  '{parent}',\n  '{sibling}',\n];\n")
        self.assertEqual(size500.insert_siblings(once, parent, [sibling]), once)
        self.assertIsNone(size500.insert_siblings(source + source, parent, [sibling]))
        self.assertIsNone(size500.insert_siblings("const tests = [];\n", parent, [sibling]))


class Size500RouteTest(unittest.TestCase):
    def test_unbaselined_errors_split_and_growth_still_syncs_main(self):
        routed = classes.classify(pr("Company guards"), {"Company guards": _UNBASED})
        self.assertEqual((routed["cls"], routed["action"]), ("size-500-unbaselined", "split-size-500"))
        self.assertEqual(routed["files"], ["scripts/lib/__tests__/component-story-completion.test.mjs"])
        grew = classes.classify(pr("Company guards"), {"Company guards": _GREW})
        self.assertEqual((grew["cls"], grew["action"]), ("size-500-stale", "sync-main"))
        self.assertEqual(size_500_route(_GREW), ("size-500-stale", "sync-main"))

    def test_mixed_errors_warnings_and_known_signatures_do_not_split(self):
        self.assertIsNone(size500.unbaselined_hit(_GREW + _UNBASED))
        self.assertIsNone(size500.unbaselined_hit("##[error]Process completed with exit code 1.\n"))
        self.assertIsNone(size_500_route(None))
        mixed = classes.classify(pr("Company guards"), {"Company guards": _GREW + _UNBASED})
        self.assertEqual(mixed["action"], "agent")
        ranked = classes.classify(pr("Company guards"), {"Company guards": _UNBASED + "API rate limit exceeded\n"})
        self.assertEqual(ranked["action"], "rerun")


class Size500FixerTest(unittest.TestCase):
    def _layout(self, root: Path, check_code: int):
        rel = "scripts/lib/__tests__/demo.test.mjs"
        target = root / rel
        target.parent.mkdir(parents=True)
        original = _over_limit()
        target.write_text(original)
        ci = root / "scripts/ci-fast-lanes.mjs"
        ci.parent.mkdir(parents=True, exist_ok=True)
        ci.write_text(f"export const tests = [\n  '{rel}',\n];\n")
        calls = []

        def sh(args, cwd=None, log=None, timeout=None):
            calls.append(list(args))
            code = check_code if args[:2] == ["node", "--check"] else 0
            stdout = "scripts/lib/__tests__/demo.test.mjs\n" if args[:3] == ["git", "diff", "--cached"] else ""
            return SimpleNamespace(returncode=code, stdout=stdout)

        return rel, original, calls, sh

    def test_fixer_commits_a_fast_forward_and_never_forces(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel, _original, calls, sh = self._layout(root, 0)
            fixer = size500.bind(sh, {"Company guards": _UNBASED.replace(
                "scripts/lib/__tests__/component-story-completion.test.mjs", rel)})
            receipt = {}
            result = fixer(object(), pr("Company guards"), {}, root, None, receipt)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(receipt["resolution"], "split-size-500")
            pushed = [args for args in calls if args[:3] == ["git", "push", "-q"]]
            self.assertEqual(pushed, [["git", "push", "-q", "origin", "HEAD:glm/jov-12692-stale-capture-diagnosis"]])
            self.assertFalse(any("--force" in arg or "--force-with-lease" in arg for args in calls for arg in args))
            self.assertLessEqual(size500.line_count((root / rel).read_text()), 500)

    def test_a_syntax_failure_restores_the_tree_and_does_not_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel, original, calls, sh = self._layout(root, 1)
            fixer = size500.bind(sh, {"Company guards": _UNBASED.replace(
                "scripts/lib/__tests__/component-story-completion.test.mjs", rel)})
            self.assertIsNone(fixer(object(), pr("Company guards"), {}, root, None, {}))
            self.assertEqual((root / rel).read_text(), original)
            self.assertFalse((root / "scripts/lib/__tests__/demo.size500-2.test.mjs").exists())
            self.assertFalse(any(args[:2] == ["git", "commit"] for args in calls))


if __name__ == "__main__":
    unittest.main()
