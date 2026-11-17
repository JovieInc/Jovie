import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_js_scan as scan  # noqa: E402
import fix_red_size_split as split  # noqa: E402


def _pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [
        {"name": name, "conclusion": "FAILURE"} for name in (names or ("Company guards",))
    ] + [{"name": "PR Ready", "conclusion": "FAILURE"}]}


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

    def test_legacy_sync_signatures_keep_their_original_classes(self):
        cases = {
            "size-500: scripts/ci-fast-lanes.mjs: grew 3516 -> 3518": ("size-baseline-grew", "sync-main"),
            "✖ committed ID registry covers every extracted row (12ms)": ("copy-registry-gap", "sync-main"),
        }
        for log, expected in cases.items():
            got = classes.classify(_pr("Source Validation"), {"Source Validation": log})
            self.assertEqual((got["cls"], got["action"]), expected, log)

    def test_baselined_size_growth_and_registry_gap_sync_main_while_blocked(self):
        guards = (
            "size-500: apps/web/lib/chat/system-prompt.ts: grew 512 -> 514\n"
            "size-500: scripts/ci-fast-lanes.mjs: grew 3516 -> 3518\n"
            "company-guards: FAIL (2)\n"
        )
        units = (
            "✔ does not fail over for another quota class: API rate limit exceeded for user ID 123.\n"
            "✖ failing tests:\n"
            "✖ committed ID registry covers every extracted row (290.906772ms)\n"
        )
        grew_only = classes.classify(_pr("Company guards", merge="BLOCKED"), {"Company guards": guards})
        self.assertEqual((grew_only["cls"], grew_only["action"]), ("size-baseline-grew", "sync-main"))
        both = classes.classify(
            _pr("Company guards", "Affected Unit Tests (4/4)", merge="BLOCKED"),
            {"Company guards": guards, "Affected Unit Tests (4/4)": units},
        )
        self.assertEqual((both["cls"], both["action"]), ("stale-branch", "sync-main"))
        passing = (
            "✔ committed ID registry covers every extracted row\n"
            "API rate limit exceeded for user ID 123\n"
        )
        fixture = classes.classify(
            _pr("Affected Unit Tests (4/4)", merge="BLOCKED"),
            {"Affected Unit Tests (4/4)": passing},
        )
        self.assertEqual(fixture["action"], "rerun")
        mixed = classes.classify(
            _pr("Company guards", "Affected Unit Tests (4/4)", merge="BLOCKED"),
            {"Company guards": guards, "Affected Unit Tests (4/4)": "AssertionError: expected 1\n"},
        )
        self.assertEqual((mixed["cls"], mixed["action"]), ("mixed", "agent"))

    def test_multi_declarator_is_not_one_binding(self):
        stmts = scan.parse_statements("const a = 1, b = 2;\n")
        self.assertEqual([stmt.kind for stmt in stmts], ["other"])

    def test_unsupported_imports_refuse_the_split_without_losing_side_effects(self):
        self.assertIsNone(split.split_unbaselined_vitest(
            "import './side-effects.mjs';\n" + _fat(), "scripts/lib/__tests__/example.test.mjs"))

    def test_legacy_size_patterns_never_override_annotated_error_validation(self):
        size = "size-500: scripts/lib/__tests__/example.test.mjs: 631 lines, over 500 and not baselined\n"
        grew = "size-500: scripts/ci-fast-lanes.mjs: grew 3516 -> 3518\n"
        for log in ("##[error]" + size + "##[error]" + grew,
                    "##[error]" + size + "##[error]unrelated failure\n"):
            got = classes.classify(_pr(), {"Company guards": log})
            self.assertEqual(got["action"], classes.AGENT)
        known = classes.classify(_pr(), {"Company guards": size + "\nUnwired: scripts/a.test.mjs. Wire each file into a ci-fast lane"})
        self.assertEqual(known["action"], classes.WIRE_CI_FAST)

    def test_split_adapter_uses_the_current_owner_and_keeps_annotated_logs_strict(self):
        import fix_red_compose
        import fix_red_size_500
        owner = SimpleNamespace(split_size_fix=object(), fix_red_screen_cert=__import__('fix_red_screen_cert'),
            sh=object(), failed_logs=object(), wire_ci_fast_fix=object(), atomic_state_fix=object(),
            renumber_migrations_fix=object(), snap_spacing_fix=object(), strip_cache_exports_fix=object(),
            merge_narrowed_preflight_fix=object(), register_domain_writes_fix=object())
        self.assertIs(fix_red_compose.deterministic_fixer(owner, classes.SPLIT_SIZE), owner.split_size_fix)
        path = "scripts/lib/__tests__/example.test.mjs"
        size = f"size-500: {path}: 631 lines, over 500 and not baselined\n"
        route = {"files": [path]}
        strict = SimpleNamespace(returncode=0)
        with patch.object(fix_red_size_500, "bind", return_value=lambda *args: strict), \
                patch.object(split, "apply", return_value="legacy") as apply:
            self.assertEqual(split.bind(None, {"guard": size})(None, {}, route, Path('.'), None, {}), "legacy")
            apply.assert_called_once()
            apply.reset_mock()
            self.assertIs(split.bind(None, {"guard": "##[error]" + size})(None, {}, route, Path('.'), None, {}), strict)
            apply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
