import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


class SplitPlanTest(unittest.TestCase):
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


