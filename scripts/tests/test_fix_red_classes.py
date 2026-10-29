import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class ClassifyTest(unittest.TestCase):
    def test_signatures_map_to_classes_and_actions(self):
        cases = {
            "github-quota-deferred; fleet evidence retry": ("quota-deferred", "rerun"),
            "HttpError: API rate limit exceeded for installation": ("platform-infra", "rerun"),
            "Unwired: scripts/a.test.mjs, scripts/b.test.mjs. Wire each file into a ci-fast lane": ("ci-fast-wiring", "wire-ci-fast"),
            "use atomic_state.atomic_write_text for whole-file state: [('x.py','f','open-w')]": ("atomic-write", "agent"),
            "red-before-green: include Failing command:": ("pr-body", "agent"),
            "AssertionError: expected 1": ("other", "agent"),
        }
        for log, (cls, action) in cases.items():
            got = classes.classify(pr("Source Validation"), {"Source Validation": log})
            self.assertEqual((got["cls"], got["action"]), (cls, action), log)

    def test_unwired_files_are_extracted_and_aggregates_ignored(self):
        got = classes.classify(pr("Source Validation"), {"Source Validation":
                               "Unwired: scripts/a.test.mjs, scripts/b.test.mjs. Wire each file into a ci-fast lane"})
        self.assertEqual(got["files"], ["scripts/a.test.mjs", "scripts/b.test.mjs"])
        self.assertEqual(got["checks"], ["Source Validation"])

    def test_mixed_classes_go_to_the_model_and_behind_branches_sync_main(self):
        mixed = classes.classify(pr("A", "B"), {"A": "API rate limit exceeded", "B": "AssertionError"})
        self.assertEqual((mixed["cls"], mixed["action"]), ("mixed", "agent"))
        behind = classes.classify(pr("A", merge="BEHIND"), {"A": "AssertionError"})
        self.assertEqual((behind["cls"], behind["action"]), ("stale-branch", "sync-main"))
        still = classes.classify(pr("A", merge="BEHIND"), {"A": "API rate limit exceeded"})
        self.assertEqual(still["action"], "rerun", "a deterministic log outranks the stale-branch default")

    def test_adjacent_insertions_keep_both_sides_and_refuse_overlaps(self):
        kept = classes.resolve_adjacent_insertions(
            "before\n<<<<<<< ours\nours\n||||||| base\n=======\ntheirs\n>>>>>>> theirs\nafter\n")
        self.assertEqual(kept, "before\nours\ntheirs\nafter\n")
        self.assertIsNone(classes.resolve_adjacent_insertions(
            "<<<<<<< ours\npr\n||||||| base\na\n=======\nmain\n>>>>>>> theirs\n"))
        self.assertIsNone(classes.resolve_adjacent_insertions(
            "<<<<<<< HEAD\npr\n=======\nmain\n>>>>>>> origin/main\n"))
        same = classes.resolve_adjacent_insertions(
            "<<<<<<< ours\nsame\n||||||| base\n=======\nsame\n>>>>>>> theirs\n")
        self.assertEqual(same, "same\n")

    def test_key_ignores_volatile_numbers_but_separates_failures(self):
        a = classes.classify(pr("T"), {"T": "AssertionError: expected 12 to equal 3"})
        b = classes.classify(pr("T"), {"T": "AssertionError: expected 99 to equal 4"})
        c = classes.classify(pr("T"), {"T": "TypeError: x is not a function"})
        self.assertEqual(a["key"], b["key"])
        self.assertNotEqual(a["key"], c["key"])


class WireTest(unittest.TestCase):
    LIST = "export const SCRIPT_CONTRACT_NODE_TESTS = Object.freeze([\n  'scripts/x.test.mjs',\n]);\nexport const SCRIPT_CONTRACT_VITEST_TESTS = Object.freeze([\n  'scripts/y.test.mjs',\n]);\n"

    def tree(self, tmp):
        root = Path(tmp)
        (root / "scripts").mkdir()
        (root / "scripts/ci-fast-lanes.mjs").write_text(self.LIST)
        (root / "scripts/n.test.mjs").write_text("import test from 'node:test';\n")
        (root / "scripts/v.test.mjs").write_text("import { it } from 'vitest';\n")
        return root

    def test_files_land_in_the_matching_list_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/n.test.mjs", "scripts/v.test.mjs"]),
                             ["scripts/n.test.mjs", "scripts/v.test.mjs"])
            text = (root / "scripts/ci-fast-lanes.mjs").read_text()
            node, vitest = text.split("SCRIPT_CONTRACT_VITEST_TESTS")
            self.assertIn("'scripts/n.test.mjs'", node)
            self.assertIn("'scripts/v.test.mjs'", vitest)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/n.test.mjs"]), [], "already listed")

    def test_missing_or_out_of_tree_files_are_left_to_the_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.tree(tmp)
            self.assertEqual(classes.wire_ci_fast(root, ["scripts/gone.test.mjs", "../x.test.mjs", "apps/web/a.test.ts"]), [])
            self.assertEqual((root / "scripts/ci-fast-lanes.mjs").read_text(), self.LIST)


class MeasureTest(unittest.TestCase):
    def rows(self):
        out = []
        for i in range(30):  # one PR/fingerprint streak: first runs push 50%, after one miss 10%
            out.append({"kind": "fix-red", "pr": i, "provider": "codex", "verdict": "fix-pushed" if i % 2 else "fix-no-change",
                        "startedAt": f"2026-10-25T00:{i:02d}:00Z", "requestSource": {"checks": [["T", "FAILURE"]]}})
        for i in range(30):
            out.append({"kind": "fix-red", "pr": i, "provider": "codex", "verdict": "fix-pushed" if i == 0 else "fix-no-change",
                        "startedAt": f"2026-10-25T01:{i:02d}:00Z", "requestSource": {"checks": [["T", "FAILURE"]]}})
        out.append({"kind": "fix-red", "pr": 1, "verdict": "skipped", "reasons": ["infra-rerun:quota-deferred"],
                    "startedAt": "2026-10-25T02:00:00Z"})
        return out

    def test_measure_counts_model_runs_separately_from_routed_ones(self):
        now = classes._epoch({"startedAt": "2026-10-26T00:00:00Z"})
        got = classes.measure(self.rows(), now, 1, {"codex": 0.5}, merged_prs={1, 3})
        self.assertEqual((got["llmRuns"], got["routedWithoutModel"], got["pushed"]), (60, 1, 16))
        self.assertEqual(got["routedByClass"], {"quota-deferred": 1})
        self.assertEqual(got["spendUsd"], 30.0)
        self.assertEqual(got["usdPerMergedFix"], 15.0)

    def test_breaker_n_is_measured_from_where_pushes_stop_and_never_below_two(self):
        rows = self.rows()
        self.assertEqual(classes.breaker_n(rows), 2)
        self.assertEqual(classes.breaker_n([]), classes.DEFAULT_BREAKER_N)


if __name__ == "__main__":
    unittest.main()
