import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import migration_renumber as mr  # noqa: E402

MIG, META = mr.MIG_DIR, mr.META


class AssignTest(unittest.TestCase):
    def test_every_pr_computes_the_same_global_assignment_and_new_numbers_never_repeat(self):
        prs = {22412: [148], 22882: [149], 23067: [148], 23099: [148], 23189: [148], 23309: [149]}
        got = {}
        for number, nums in prs.items():
            others = {k: v for k, v in prs.items() if k != number}
            got[number] = mr.assign(number, others, nums, 148)
        taken = [new for mapping in got.values() for new in mapping.values()]
        self.assertEqual(len(taken), len(set(taken)))
        self.assertEqual(got[22412], {148: 150})
        self.assertTrue(all(new > 149 for new in taken))

    def test_the_lowest_pr_keeps_a_number_above_main_and_free(self):
        self.assertEqual(mr.assign(10, {20: [149]}, [149], 148), {})
        self.assertEqual(mr.assign(20, {10: [149]}, [149], 148), {149: 150})

    def test_three_way_merges_disjoint_schema_changes_and_refuses_real_conflicts(self):
        base = {"tables": {"a": {"cols": 1}}}
        mine = {"tables": {"a": {"cols": 1}, "b": {"cols": 2}}}
        theirs = {"tables": {"a": {"cols": 1}, "c": {"cols": 3}}}
        self.assertEqual(mr.three_way(base, mine, theirs), {"tables": {"a": {"cols": 1}, "c": {"cols": 3}, "b": {"cols": 2}}})
        with self.assertRaises(mr.Unmergeable):
            mr.three_way({"x": 1}, {"x": 2}, {"x": 3})


def git(root, *args):
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout


class RenumberTest(unittest.TestCase):
    def snap(self, ident, prev, tables):
        return json.dumps({"id": ident, "prevId": prev, "version": "7", "tables": tables})

    def build(self, root):
        git(root, "init", "-q", "-b", "main")
        git(root, "config", "user.email", "t@t")
        git(root, "config", "user.name", "t")
        (root / META).mkdir(parents=True)
        (root / MIG / "0147_a.sql").write_text("a")
        (root / META / "0147_snapshot.json").write_text(self.snap("s147", "s146", {"t": 1}))
        (root / META / "_journal.json").write_text(json.dumps({"version": "7", "entries": [
            {"idx": 147, "tag": "0147_a", "when": 10}]}))
        git(root, "add", "-A")
        git(root, "commit", "-qm", "base")
        git(root, "checkout", "-qb", "pr")
        (root / MIG / "0148_mine.sql").write_text("mine")
        (root / META / "0148_snapshot.json").write_text(self.snap("sMine", "s147", {"t": 1, "mine": 2}))
        (root / META / "_journal.json").write_text(json.dumps({"version": "7", "entries": [
            {"idx": 147, "tag": "0147_a", "when": 10}, {"idx": 148, "tag": "0148_mine", "when": 20}]}))
        git(root, "add", "-A")
        git(root, "commit", "-qm", "pr")
        git(root, "checkout", "-q", "main")
        (root / MIG / "0148_theirs.sql").write_text("theirs")
        (root / META / "0148_snapshot.json").write_text(self.snap("sTheirs", "s147", {"t": 1, "theirs": 3}))
        (root / META / "_journal.json").write_text(json.dumps({"version": "7", "entries": [
            {"idx": 147, "tag": "0147_a", "when": 10}, {"idx": 148, "tag": "0148_theirs", "when": 30}]}))
        git(root, "add", "-A")
        git(root, "commit", "-qm", "main moved")
        git(root, "checkout", "-q", "pr")

    def test_collision_with_main_is_renumbered_with_journal_and_merged_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.build(root)
            changed = mr.renumber(root, lambda *a: git(root, *a), "main", 5, {})
            self.assertIn(f"{MIG}/0149_mine.sql", changed)
            self.assertTrue((root / MIG / "0149_mine.sql").exists())
            self.assertFalse((root / MIG / "0148_mine.sql").exists())
            journal = json.loads((root / META / "_journal.json").read_text())["entries"]
            self.assertEqual([(e["idx"], e["tag"]) for e in journal], [(147, "0147_a"), (148, "0148_theirs"), (149, "0149_mine")])
            self.assertGreater(journal[-1]["when"], journal[-2]["when"])
            snap = json.loads((root / META / "0149_snapshot.json").read_text())
            self.assertEqual(snap["tables"], {"t": 1, "theirs": 3, "mine": 2})
            self.assertEqual((snap["id"], snap["prevId"]), ("sMine", "sTheirs"))

    def test_nothing_to_do_when_the_number_is_free(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.build(root)
            git(root, "checkout", "-q", "main")
            git(root, "checkout", "-q", "-B", "pr", "main")
            self.assertEqual(mr.renumber(root, lambda *a: git(root, *a), "main", 5, {}), [])

    def test_generated_metadata_is_renumbered_without_merging_snapshot_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.build(root)
            git(root, "checkout", "-q", "main")
            (root / MIG / "0160_custom.sql").write_text("custom")
            git(root, "add", "-A")
            git(root, "commit", "-qm", "sparse numbering")
            journal_path = root / META / "_journal.json"
            journal = json.loads(journal_path.read_text())
            original_entries = list(journal["entries"])
            journal["entries"].append({"idx": 149, "tag": "0149_generated", "when": 40})
            journal_path.write_text(json.dumps(journal))
            (root / MIG / "0149_generated.sql").write_text("generated sql")
            snapshot = self.snap("generated", "sTheirs", {"mine": 2, "theirs": 3})
            (root / META / "0149_snapshot.json").write_text(snapshot)

            changed = mr.normalize_generated(root, lambda *a: git(root, *a), "main", 5, {})

            self.assertIn(f"{MIG}/0161_generated.sql", changed)
            self.assertEqual((root / MIG / "0161_generated.sql").read_text(), "generated sql")
            self.assertEqual((root / META / "0161_snapshot.json").read_text(), snapshot)
            result = json.loads(journal_path.read_text())["entries"]
            self.assertEqual(result[:-1], original_entries)
            self.assertEqual(result[-1], {"idx": 149, "tag": "0161_generated", "when": 40})
            self.assertEqual(mr.normalize_generated(root, lambda *a: git(root, *a), "main", 5, {}), [])

    def test_generated_renumber_refuses_a_changed_base_journal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.build(root)
            before = (root / META / "_journal.json").read_text()
            with self.assertRaises(mr.Unmergeable):
                mr.normalize_generated(root, lambda *a: git(root, *a), "main", 5, {})
            self.assertEqual((root / META / "_journal.json").read_text(), before)


class LaneFixTest(RenumberTest):
    def test_the_lane_fix_renumbers_merges_main_and_pushes_without_a_model(self):
        import lane_runner as lane
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            work.mkdir()
            self.build(work)
            origin = Path(tmp) / "origin.git"
            git(tmp, "init", "-q", "--bare", str(origin))
            git(work, "remote", "add", "origin", str(origin))
            git(work, "push", "-q", "origin", "main", "pr")
            git(work, "fetch", "-q", "origin")
            pr = {"number": 5, "headRefName": "pr"}
            receipt = {}
            with patch.object(lane, "open_pr_migrations", return_value={}):
                done = lane.renumber_migrations_fix(None, pr, {}, work, None, receipt)
            self.assertEqual(done.returncode, 0)
            self.assertEqual(receipt["resolution"], "renumbered-migrations")
            git(work, "fetch", "-q", "origin")
            tree = git(work, "ls-tree", "-r", "--name-only", "origin/pr")
            self.assertIn("0149_mine.sql", tree)
            self.assertIn("0148_theirs.sql", tree)
            self.assertNotIn("0148_mine.sql", tree)
            # main is an ancestor of the pushed head: the branch was merged, never rewritten
            git(work, "merge-base", "--is-ancestor", "origin/main", "origin/pr")

    def test_an_unmergeable_snapshot_restores_the_worktree_for_the_model(self):
        import lane_runner as lane
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            work.mkdir()
            self.build(work)
            (work / META / "0148_snapshot.json").write_text(self.snap("sMine", "s147", {"t": 9}))
            git(work, "commit", "-qam", "conflicting change")
            origin = Path(tmp) / "origin.git"
            git(tmp, "init", "-q", "--bare", str(origin))
            git(work, "remote", "add", "origin", str(origin))
            git(work, "push", "-q", "origin", "main", "pr")
            git(work, "fetch", "-q", "origin")
            with patch.object(lane, "open_pr_migrations", return_value={}), \
                    patch.object(lane.migration_renumber, "three_way", side_effect=mr.Unmergeable("x")):
                self.assertIsNone(lane.renumber_migrations_fix(None, {"number": 5, "headRefName": "pr"}, {}, work, None, {}))
            self.assertTrue((work / MIG / "0148_mine.sql").exists())
            self.assertEqual(git(work, "status", "--porcelain").strip(), "")


class ClassifyTest(unittest.TestCase):
    def test_the_guard_failure_is_a_deterministic_class(self):
        import fix_red_classes as classes
        pr = {"statusCheckRollup": [{"name": "Migration numbers", "conclusion": "FAILURE"}]}
        got = classes.classify(pr, {"Migration numbers": "migration-numbers: FAILED\n  - migration 0148 is not above main's latest (0148); renumber it"})
        self.assertEqual((got["cls"], got["action"]), ("migration-number", "renumber-migrations"))


if __name__ == "__main__":
    unittest.main()
