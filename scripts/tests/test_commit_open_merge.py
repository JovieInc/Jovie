import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_source_edits as edits  # noqa: E402
import lane_runner as lane  # noqa: E402


class CommitOpenMergeTest(unittest.TestCase):
    REL = "docs/design-system/cert-screens.json"
    MISSING = 'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "lint-staged" not found\n'

    def test_install_argv_matches_the_lane_worktree_install(self):
        self.assertEqual(edits.MERGE_COMMIT_INSTALL, lane.WORKTREE_INSTALL)

    def script(self, outcomes):
        calls = []

        def sh(args, **kwargs):
            index = len(calls)
            calls.append((list(args), kwargs))
            if index >= len(outcomes):
                raise AssertionError(f"unexpected call {args}")
            code, stdout, stderr = outcomes[index]
            return SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr)

        return calls, sh

    def test_missing_lint_staged_installs_once_and_retries_the_commit(self):
        calls, sh = self.script([
            (0, "", ""),
            (1, "", self.MISSING),
            (0, "", ""),
            (0, "", ""),
        ])
        guards = []
        self.assertTrue(edits.commit_open_merge(
            Path("/work"), [self.REL], sh, None, guard=lambda: guards.append("guard")))
        self.assertEqual(guards, ["guard", "guard"])
        self.assertEqual(calls[0][0], ["git", "add", "--", self.REL])
        self.assertEqual(calls[1][0], ["git", "commit", "--no-edit"])
        self.assertEqual(calls[2][0], edits.MERGE_COMMIT_INSTALL)
        self.assertEqual(calls[2][1]["timeout"], 1800)
        self.assertEqual(calls[2][1]["cwd"], Path("/work"))
        self.assertEqual(calls[3][0], ["git", "commit", "--no-edit"])
        self.assertFalse(any(args[:2] == ["git", "merge"] for args, _ in calls))

    def test_another_hook_failure_aborts_without_install(self):
        calls, sh = self.script([(0, "", ""), (1, "", "biome check failed\n"), (0, "", "")])
        self.assertFalse(edits.commit_open_merge(Path("/work"), ["a"], sh, None))
        self.assertEqual([args for args, _ in calls], [
            ["git", "add", "--", "a"],
            ["git", "commit", "--no-edit"],
            ["git", "merge", "--abort"],
        ])

    def test_a_lint_staged_report_that_is_not_a_missing_binary_does_not_install(self):
        calls, sh = self.script([
            (1, "", "lint-staged failed: biome found 1 error\n"),
            (0, "", ""),
        ])
        self.assertFalse(edits.commit_open_merge(Path("/work"), None, sh, None))
        self.assertEqual(calls[1][0], ["git", "merge", "--abort"])

    def test_a_failed_install_aborts_without_a_second_commit(self):
        calls, sh = self.script([
            (1, self.MISSING, ""),
            (1, "", "install failed\n"),
            (0, "", ""),
        ])
        self.assertFalse(edits.commit_open_merge(Path("/work"), None, sh, None))
        self.assertEqual([args for args, _ in calls], [
            ["git", "commit", "--no-edit"],
            edits.MERGE_COMMIT_INSTALL,
            ["git", "merge", "--abort"],
        ])

    def test_a_failed_retry_aborts_without_a_third_commit(self):
        calls, sh = self.script([
            (1, "", self.MISSING),
            (0, "", ""),
            (1, "", self.MISSING),
            (0, "", ""),
        ])
        self.assertFalse(edits.commit_open_merge(Path("/work"), None, sh, None))
        commits = [args for args, _ in calls if args == ["git", "commit", "--no-edit"]]
        self.assertEqual(len(commits), 2)
        self.assertEqual(calls[-1][0], ["git", "merge", "--abort"])

    def test_a_clean_commit_does_not_install(self):
        calls, sh = self.script([(0, "", "")])
        self.assertTrue(edits.commit_open_merge(Path("/work"), None, sh, None))
        self.assertEqual(calls[0][0], ["git", "commit", "--no-edit"])

    def test_add_failure_aborts_without_a_commit(self):
        calls, sh = self.script([(1, "", "add failed\n"), (0, "", "")])
        self.assertFalse(edits.commit_open_merge(Path("/work"), [self.REL], sh, None))
        self.assertEqual(calls[1][0], ["git", "merge", "--abort"])

    def test_push_false_stops_after_a_clean_merge(self):
        calls, sh = self.script([(0, "", "")])
        self.assertTrue(edits.resolve_additive_list_conflict(
            Path("."), "feature", None, sh=sh, merge_entries=lambda _: None, push=False))
        self.assertEqual(calls[0][0], ["git", "merge", "--no-edit", "origin/main"])
        self.assertFalse(any(args[:2] == ["git", "push"] for args, _ in calls))


if __name__ == "__main__":
    unittest.main()
