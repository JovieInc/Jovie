"""Focus-canon red logs strip only a real class token, and only on that shard."""
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_focus_canon as focus  # noqa: E402

HEADER = "apps/web/components/shell/sidebar-header-icon-button.ts"
RAIL = "apps/web/components/shell/rail-motion.ts"
FOCUS_LINE = (
    "{path}: 1 ad hoc focus style(s) (baseline 0). Delete them: "
    "apps/web/styles/focus.css draws the one focus outline."
)


def pr():
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": "Affected Unit Tests (4/4)", "conclusion": "FAILURE"},
        {"name": "PR Ready", "conclusion": "FAILURE"}]}


def job_log(*paths, extra=""):
    body = "\n".join(f'+   "{FOCUS_LINE.format(path=path)}",' for path in paths)
    return (
        "API rate limit exceeded\n"
        "schedule-trigger-guard: FAIL\n"
        f"{body}\n"
        "##[error]web-source-read-tests failed (exit 1); read its output above.\n"
        "##[error]Process completed with exit code 1.\n"
        f"{extra}"
    )


class FocusCanonStripTest(unittest.TestCase):
    def test_a_comment_only_mention_is_unchanged(self):
        source = "/**\n * `focus-ring-themed` off the first control.\n */\nexport const x = 1;\n"
        self.assertEqual(focus.strip_source(source), source)

    def test_a_class_token_loses_one_space(self):
        source = "export const box =\n  'focus-ring-themed relative inline-flex size-7';\n"
        self.assertEqual(
            focus.strip_source(source),
            "export const box =\n  'relative inline-flex size-7';\n")

    def test_an_unsafe_call_writes_nothing(self):
        source = "cn('focus-ring-themed', x)\n"
        self.assertIsNone(focus.strip_source(source))

    def test_the_shard_log_routes_here_even_when_fixtures_echo_quota(self):
        log = job_log(RAIL, HEADER)
        got = classes.classify(pr(), {"Affected Unit Tests (4/4)": log})
        self.assertEqual((got["cls"], got["action"]), ("focus-canon", "strip-focus-canon"))
        self.assertIn(focus.ACTION, classes.DETERMINISTIC)
        self.assertEqual(got["files"], [RAIL, HEADER])

    def test_a_second_marked_error_is_not_this_class(self):
        script = job_log(HEADER, extra="##[error]script-contracts failed (exit 1); read its output above.\n")
        self.assertIsNone(focus.hit(script))
        wall = job_log(
            HEADER,
            extra="::error file=scripts/lib/__tests__/no-wall-clock-assertions.test.mjs::AssertionError: expected []\n")
        self.assertIsNone(focus.hit(wall))
        self.assertNotEqual(
            classes.classify(pr(), {"Affected Unit Tests (4/4)": script})["action"],
            "strip-focus-canon")

    def test_the_baseline_is_never_a_rewrite_target(self):
        log = 'apps/web/focus-canon.baseline.json: 1 ad hoc focus style(s) (baseline 0).\n'
        self.assertEqual(focus.paths(log), [])

    def test_fixer_commits_only_a_safe_class_file(self):
        calls = []

        def sh(argv, cwd=None, log=None, timeout=None):
            del log, timeout
            calls.append(list(argv))
            if argv[:2] == ["git", "diff"]:
                return SimpleNamespace(returncode=0, stdout=HEADER + "\n")
            return SimpleNamespace(returncode=0, stdout="")

        with tempfile.TemporaryDirectory() as tmp:
            full = Path(tmp) / HEADER
            full.parent.mkdir(parents=True)
            full.write_text("'focus-ring-themed relative size-7';\n", encoding="utf-8")
            receipt = {}
            fixer = focus.bind(sh, {"Affected Unit Tests (4/4)": job_log(HEADER)})
            result = fixer(None, {"headRefName": "claude/ds-focus-canon"}, {"files": []}, tmp, None, receipt)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(full.read_text(encoding="utf-8"), "'relative size-7';\n")
            self.assertNotIn("--force", calls[-1])
            self.assertEqual(calls[-1][:4], ["git", "push", "-q", "origin"])
            self.assertEqual(receipt["strippedFocus"], [HEADER])
            self.assertFalse((Path(tmp) / "apps/web/focus-canon.baseline.json").exists())
