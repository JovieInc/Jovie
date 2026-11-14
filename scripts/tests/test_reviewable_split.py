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
