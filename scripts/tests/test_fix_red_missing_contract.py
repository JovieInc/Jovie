"""Orphan-sweep contract paths that are not in the tree drop without a model."""

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_missing_contract as missing  # noqa: E402

GUARD = missing.GUARD
LANES = """export const OTHER = ['scripts/keep-me.test.mjs'];
export const SCRIPT_CONTRACT_NODE_TESTS = Object.freeze([
  'scripts/keep.test.mjs',
  'scripts/linear-team-drift.test.mjs', // JOV-13101 team drift guard.
  'node --test scripts/present.test.mjs scripts/absent.test.mjs',
]);
export const SCRIPT_CONTRACT_VITEST_TESTS = Object.freeze([
  'scripts/lib/__tests__/source-validation-dedup-workflow.test.mjs',
  'scripts/lib/__tests__/kept.test.mjs',
]);
"""
PRESENT = {
    "scripts/keep.test.mjs",
    "scripts/present.test.mjs",
    "scripts/lib/__tests__/kept.test.mjs",
    "node",
    "--test",
}


def pr(*names):
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": name, "conclusion": "FAILURE"} for name in names]}


def log_for(path="scripts/linear-team-drift.test.mjs"):
    prefix = "Source Validation\tUNKNOWN STEP\t2026-11-19T23:59:55.1059027Z "
    return (
        prefix + "GitHub API 502 for /repos/JovieInc/Jovie/pulls/1: Server Error\n"
        + prefix + "API rate limit exceeded\n"
        + prefix + "\x1b[31m\x1b[1mAssertionError\x1b[22m: "
        + f"{path}: expected false to be true // Object.is equality\x1b[39m\n"
        + prefix + f"FAIL workspace-scripts lib/__tests__/ci-script-test-inventory.test.mjs > {GUARD}\n"
        + prefix + f"##[error]AssertionError: {path}: expected false to be true // Object.is equality\n"
        + prefix + "##[error]Process completed with exit code 1.\n"
    )


class MissingContractTest(unittest.TestCase):
    def test_the_guard_outranks_passing_fixture_platform_noise(self):
        got = classes.classify(pr("Source Validation"), {"Source Validation": log_for()})
        self.assertEqual((got["cls"], got["action"]), (missing.CLASS, missing.ACTION))
        self.assertEqual(got["files"], ["scripts/linear-team-drift.test.mjs"])
        self.assertIn(got["action"], classes.DETERMINISTIC)
        self.assertIsNone(missing.hit("API rate limit exceeded\nHTTP 500\n"))
        self.assertIsNone(missing.hit(log_for() + "FAIL scripts/other.test.mjs > something else broke\n"))
        self.assertIsNone(missing.hit(log_for() + "##[error]size-500: scripts/a.mjs: grew 1 -> 2\n"))

    def test_drop_removes_only_missing_paths_inside_the_contract_arrays(self):
        def exists(rel):
            return rel in PRESENT

        rewritten = missing.drop_missing_entries(LANES, exists)
        self.assertIn("'scripts/keep.test.mjs'", rewritten)
        self.assertIn("'scripts/lib/__tests__/kept.test.mjs'", rewritten)
        self.assertIn("export const OTHER = ['scripts/keep-me.test.mjs'];", rewritten)
        self.assertNotIn("linear-team-drift", rewritten)
        self.assertNotIn("source-validation-dedup-workflow", rewritten)
        self.assertIn("'node --test scripts/present.test.mjs'", rewritten)
        self.assertNotIn("absent.test.mjs", rewritten)
        self.assertEqual(missing.remaining_missing(rewritten, exists), [])
        self.assertIsNone(missing.drop_missing_entries(rewritten, exists))
        self.assertIsNone(missing.drop_missing_entries("export const SCRIPT_CONTRACT_NODE_TESTS = [];\n", exists))

    def test_commit_refuses_a_path_it_cannot_clear_and_pushes_a_fast_forward(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / missing._TARGET
            target.parent.mkdir(parents=True)
            target.write_text(LANES)
            calls = []

            def sh(args, cwd, log, timeout):
                del cwd, log, timeout
                calls.append(args)
                stdout = missing._TARGET + "\n" if args[:3] == ["git", "diff", "--name-only"] else ""
                return SimpleNamespace(returncode=0, stdout=stdout)

            receipt = {}
            # --test is not a file in this tree, so the partially edited command stays red.
            self.assertIsNone(missing.commit_push(
                sh, {"headRefName": "ha/example"}, root, None, receipt,
                ["scripts/linear-team-drift.test.mjs"]))
            self.assertEqual(calls, [])
            self.assertIn("linear-team-drift", target.read_text())

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lanes = LANES.replace(
                "'node --test scripts/present.test.mjs scripts/absent.test.mjs'",
                "'scripts/present.test.mjs'",
            )
            target = root / missing._TARGET
            target.parent.mkdir(parents=True)
            target.write_text(lanes)
            (root / "scripts/present.test.mjs").parent.mkdir(parents=True, exist_ok=True)
            (root / "scripts/present.test.mjs").write_text("test\n")
            (root / "scripts/keep.test.mjs").write_text("test\n")
            kept = root / "scripts/lib/__tests__/kept.test.mjs"
            kept.parent.mkdir(parents=True)
            kept.write_text("test\n")
            calls = []

            def sh(args, cwd, log, timeout):
                del cwd, log, timeout
                calls.append(args)
                stdout = missing._TARGET + "\n" if args[:3] == ["git", "diff", "--name-only"] else ""
                return SimpleNamespace(returncode=0, stdout=stdout)

            receipt = {}
            done = missing.commit_push(
                sh, {"headRefName": "ha/example"}, root, None, receipt,
                ["scripts/linear-team-drift.test.mjs"])
            self.assertEqual(done.returncode, 0)
            self.assertEqual(receipt["resolution"], "dropped-missing-contract")
            self.assertNotIn("linear-team-drift", target.read_text())
            self.assertEqual(calls[-1], ["git", "push", "-q", "origin", "HEAD:ha/example"])
            self.assertIsNone(missing.commit_push(
                lambda *args, **kwargs: None, {"headRefName": "ha/example"}, root, None, {},
                ["../scripts/linear-team-drift.test.mjs"]))


if __name__ == "__main__":
    unittest.main()
