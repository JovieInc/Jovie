import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


class SplitPlanTest(unittest.TestCase):
    def test_cli_measures_repeated_paths_at_each_stack_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan, first, second = (root / name for name in ("plan.json", "first", "second"))
            plan.write_text(json.dumps({"layerChanges": [{"ci.yml": 1490}, {"ci.yml": 900}],
                                        "layers": [["ci.yml"], ["ci.yml"]]}))
            first.write_text("1400\t90\tci.yml\n")
            second.write_text("800\t100\tci.yml\n")
            args = ["split-plan", "--plan", str(plan), "--layer-numstat", str(first),
                    "--layer-numstat", str(second)]
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(classes.main(args), 0)
            self.assertEqual(json.loads(output.getvalue())["reviewableLines"], [1490, 900])
            # A small final net diff cannot hide an oversized intermediate PR.
            for text in ("1501\t0\tci.yml\n", "-\t-\tci.yml\n", ""):
                first.write_text(text)
                with self.subTest(text=text), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    classes.main(args)

    def test_cli_verifies_plan_against_git_numstat_including_tests(self):
        with tempfile.TemporaryDirectory() as directory:
            plan, numstat = Path(directory) / "plan.json", Path(directory) / "numstat"
            plan.write_text(json.dumps({"changes": {"source.mjs": 800, "source.test.mjs": 701},
                                        "layers": [["source.mjs"], ["source.test.mjs"]]}))
            numstat.write_text("700\t100\tsource.mjs\n701\t0\tsource.test.mjs\n")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(classes.main(["split-plan", "--plan", str(plan),
                                               "--numstat", str(numstat)]), 0)
            self.assertEqual(json.loads(output.getvalue())["reviewableLines"], [800, 701])
            # A stale plan cannot undercount the head, omit tests, or hide binary changes.
            for rows in ("801\t0\tsource.mjs\n701\t0\tsource.test.mjs\n",
                         "800\t0\tsource.mjs\n", "-\t-\tsource.mjs\n",
                         "800\t0\tsource.mjs\n800\t0\tsource.mjs\n", "bad row\n"):
                numstat.write_text(rows)
                with self.subTest(rows=rows), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                    classes.main(["split-plan", "--plan", str(plan), "--numstat", str(numstat)])
                self.assertEqual(error.exception.code, 2)

    def test_counts_tests_and_requires_complete_disjoint_layers(self):
        changes = {"source.mjs": 800, "source.test.mjs": 701, "generated.json": 0}
        self.assertEqual(classes.reviewable_split(changes, [["source.mjs", "generated.json"],
                                                         ["source.test.mjs"]]), [800, 701])
        for layers in ([["source.mjs", "source.test.mjs", "generated.json"]],
                       [["source.mjs"], ["source.mjs", "source.test.mjs", "generated.json"]],
                       [["source.mjs", "source.test.mjs"]],
                       [["unknown"], list(changes)], [[], list(changes)]):
            with self.subTest(layers=layers), self.assertRaises(ValueError):
                classes.reviewable_split(changes, layers)

    def test_boundary_and_invalid_measurements_fail_closed(self):
        self.assertEqual(classes.reviewable_split({"a": 1500}, [["a"]]), [1500])
        for counts in ({"a": -1}, {"a": True}, {"a": "1500"}, {"a": None}):
            with self.subTest(counts=counts), self.assertRaises(ValueError):
                classes.reviewable_split(counts, [["a"]])
        for cap in (0, -1, True):
            with self.assertRaises(ValueError):
                classes.reviewable_split({"a": 1}, [["a"]], cap)


class PackGroupsTest(unittest.TestCase):
    def test_first_fit_keeps_groups_together_under_the_cap(self):
        import reviewable_split as split

        changes = {"huge": 1000, "other": 900, "machine": 100}
        groups = [["huge"], ["other"], ["machine"]]
        self.assertEqual(split.pack_groups(groups, changes, 1000),
                         [["huge"], ["other", "machine"]])
        pinned = split.pack_groups(groups, changes, 1000, pin=["machine"])
        self.assertEqual(pinned[0][0], "machine")
        self.assertEqual(split.reviewable_split(changes, pinned, 1000), [1000, 1000])

    def test_layer_cost_counts_before_a_group_shares_a_layer(self):
        import reviewable_split as split

        changes = {"a": 700, "b": 700}
        packed = split.pack_groups([["a"], ["b"]], changes, 1500, cost=lambda _paths: 200)
        self.assertEqual(packed, [["a"], ["b"]])
        self.assertEqual(split.pack_groups([["a"], ["b"]], changes, 1500), [["a", "b"]])
        with self.assertRaises(ValueError):
            split.pack_groups([["a"]], {"a": 1400}, 1500, cost=lambda _paths: 200)

    def test_cli_packs_measured_numstat_including_tests(self):
        import reviewable_split as split

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            numstat, groups = root / "numstat", root / "groups.json"
            numstat.write_text("600\t200\tsource.mjs\n701\t0\tsource.test.mjs\n")
            groups.write_text(json.dumps([["source.mjs", "source.test.mjs"]]))
            # 800 + 701 counts the test. The default cap rejects that one group.
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                split.main(["pack", "--numstat", str(numstat), "--groups", str(groups)])
            self.assertEqual(error.exception.code, 2)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(split.main(
                    ["pack", "--numstat", str(numstat), "--groups", str(groups), "--cap", "1501"]), 0)
            self.assertEqual(json.loads(output.getvalue())["reviewableLines"], [1501])
