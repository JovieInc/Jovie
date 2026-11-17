import sys
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

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
    def test_division_preserves_operand_references_and_regexes_stay_opaque(self):
        for expression in ('done / total', 'done/total', 'object.return / total', 'done /* note */ / total'):
            with self.subTest(expression=expression):
                names = scan.code_names('const ratio = ' + expression + '; const re = /opaque/; function f() { return /hidden/.test(total); }')
                self.assertIn('total', names)
                self.assertNotIn('opaque', names)
                self.assertNotIn('hidden', names)
        text = _fat().replace("const label = 'main';", 'const divisor = 2;')
        text = text.replace("expect(label).toBe('main');", 'expect(4 / divisor).toBe(2);')
        pieces = split.split_unbaselined_vitest(text, 'example.test.mjs')
        self.assertIsNotNone(pieces)
        self.assertIn('export const divisor = 2;', pieces['example.fixtures.mjs'])
        for name in ('example.test.mjs', 'example.cases.mjs'):
            imports = ''.join(stmt.text for stmt in scan.parse_statements(pieces[name]) if stmt.kind == 'import')
            self.assertIn('divisor', imports)

    def test_module_bindings_used_by_mock_factories_refuse_without_writes(self):
        text = _fat().replace("const label = 'main';", "const label = 'main';\nconst state = vi.hoisted(() => ({ answer: 42 }));\nvi.mock('./mod.mjs', () => ({ main: () => state.answer }));")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'example.test.mjs'
            source.write_text(text)
            shell = Mock()
            self.assertIsNone(split.apply(shell, {'headRefName': 'glm/test'}, root, None, {}, [source.name]))
            self.assertEqual(source.read_text(), text)
            self.assertEqual(list(root.iterdir()), [source])
            shell.assert_not_called()
        literal = _fat().replace("const label = 'main';", "const label = 'main';\nvi.mock('./mod.mjs', () => ({ main: () => 42 }));")
        self.assertIsNotNone(split.split_unbaselined_vitest(literal, 'example.test.mjs'))

    def test_cases_import_stays_top_level_and_template_fixture_is_unchanged(self):
        marker = 'const sample = `before\nimport phantom\nafter`;'
        text = _fat().replace("    expect(helper().name).toBe('box');", marker + "\n    expect(helper().name).toBe('box');")
        pieces = split.split_unbaselined_vitest(text, 'example.test.mjs')
        self.assertIsNotNone(pieces)
        owner = pieces['example.test.mjs']
        self.assertIn(marker, owner)
        imports = [stmt.text for stmt in scan.parse_statements(owner) if stmt.kind == 'import']
        self.assertEqual(sum("import './example.cases.mjs';" in stmt for stmt in imports), 1)

    def test_unmodelled_setup_and_suites_preserve_the_original_by_refusing_a_split(self):
        markers = ["label = 'main';", "expect(label).toBe('main');",
                   "describe.each([1])('matrix', () => { it('keeps matrix', () => expect(label).toBe('main')); });",
                   "describe.skip('skipped', () => { it('keeps skipped', () => expect(label).toBe('main')); });"]
        for marker in markers:
            with self.subTest(marker=marker):
                text = _fat().replace("const label = 'main';", "let label = 'before';\n" + marker)
                with tempfile.TemporaryDirectory() as temp:
                    root = Path(temp)
                    source = root / 'example.test.mjs'
                    source.write_text(text)
                    shell = Mock()
                    self.assertIsNone(split.apply(shell, {'headRefName': 'glm/test'}, root,
                                                  None, {}, ['example.test.mjs']))
                    self.assertEqual(source.read_text(), text)
                    self.assertEqual(list(root.iterdir()), [source])
                    shell.assert_not_called()

    def test_exit_annotations_keep_plain_size_routes_without_ignoring_real_errors(self):
        path = 'scripts/lib/__tests__/example.test.mjs'
        size = f'size-500: {path}: 631 lines, over 500 and not baselined\n'
        grew = 'size-500: scripts/ci-fast-lanes.mjs: grew 3516 -> 3518\n'
        exit_line = '2026-11-17T05:00:00Z ##[error]Process completed with exit code 1.\n'
        for log in (size, grew):
            expected = classes.classify(_pr(), {'Company guards': log})
            got = classes.classify(_pr(), {'Company guards': log + exit_line})
            self.assertEqual((got['cls'], got['action']), (expected['cls'], expected['action']))
        with patch.object(split, 'apply', return_value='legacy') as apply:
            self.assertEqual(split.bind(None, {'guard': size + exit_line})(
                None, {}, {'files': [path]}, Path('.'), None, {}), 'legacy')
            apply.assert_called_once()
            apply.reset_mock()
            self.assertIsNone(split.bind(None, {'guard': size + exit_line + '##[error]unexpected failure\n'})(
                None, {}, {'files': [path]}, Path('.'), None, {}))
            apply.assert_not_called()

    def test_generated_syntax_is_checked_before_any_git_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'example.test.mjs'
            source.write_text(_fat())
            calls = []
            receipt = {}

            def shell(args, **kwargs):
                calls.append(args)
                if args[:2] == ['node', '--check']:
                    return subprocess.run(args, cwd=kwargs['cwd'], capture_output=True)
                return SimpleNamespace(returncode=0, stdout='example.test.mjs\n')

            got = split.apply(shell, {'headRefName': 'glm/test'}, root, None, receipt, [source.name])
            self.assertEqual(got.returncode, 0)
            self.assertEqual([args[:2] for args in calls[:3]], [['node', '--check']] * 3)
            self.assertEqual(receipt['resolution'], 'split-size-500')
            self.assertEqual(calls[-1], ['git', 'push', '-q', 'origin', 'HEAD:glm/test'])

    def test_failed_or_unavailable_validator_restores_all_outputs(self):
        for failure in ('invalid-syntax', 'missing-node', 'timeout'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                source = root / 'example.test.mjs'
                original = _fat()
                source.write_text(original)
                pieces = split.split_unbaselined_vitest(original, source.name)
                pieces['example.cases.mjs'] += '\nconst broken = ;\n'
                calls = []

                def shell(args, **kwargs):
                    calls.append(args)
                    if failure == 'missing-node':
                        raise FileNotFoundError('node')
                    if failure == 'timeout':
                        raise subprocess.TimeoutExpired(args, 120)
                    if args[:2] == ['node', '--check']:
                        return subprocess.run(args, cwd=kwargs['cwd'], capture_output=True)
                    return SimpleNamespace(returncode=0)

                with patch.object(split, 'split_unbaselined_vitest', return_value=pieces):
                    self.assertIsNone(split.apply(shell, {'headRefName': 'glm/test'}, root,
                                                  None, {}, [source.name]))
                self.assertEqual(source.read_text(), original)
                self.assertEqual(list(root.iterdir()), [source])
                self.assertFalse(any(args[0] == 'git' for args in calls))

    def test_uncertain_git_timeout_does_not_roll_back_or_publish_a_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'example.test.mjs'
            source.write_text(_fat())
            receipt = {}
            calls = []

            def shell(args, **kwargs):
                calls.append(args)
                if args[0] == 'git':
                    raise subprocess.TimeoutExpired(args, 120)
                return SimpleNamespace(returncode=0)

            with self.assertRaises(subprocess.TimeoutExpired):
                split.apply(shell, {'headRefName': 'glm/test'}, root, None, receipt, [source.name])
            self.assertEqual(calls[-1][:2], ['git', 'add'])
            self.assertEqual(len(list(root.iterdir())), 3)
            self.assertEqual(receipt, {})

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

    def test_mixed_plain_and_annotated_size_checks_refuse_a_partial_publication(self):
        import fix_red_size_500
        size = "size-500: scripts/lib/__tests__/%s.test.mjs: 631 lines, over 500 and not baselined\n"
        logs = {"Plain": size % "a", "Annotated": "##[error]" + size % "b"}
        pr = _pr(*logs)
        route = classes.classify(pr, logs)
        self.assertEqual(route["action"], classes.SPLIT_SIZE)
        self.assertEqual(route["files"], ["scripts/lib/__tests__/a.test.mjs", "scripts/lib/__tests__/b.test.mjs"])
        strict = Mock()
        with patch.object(fix_red_size_500, "bind", return_value=strict), patch.object(split, "apply") as apply:
            self.assertIsNone(split.bind(None, logs)(None, pr, route, Path('.'), None, {}))
        strict.assert_not_called()
        apply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
