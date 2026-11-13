"""Screen-debt merge. Split from test_fix_red_source_edits.py (size-500)."""
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_source_edits as edits  # noqa: E402


class SubtractiveScreenDebtTest(unittest.TestCase):
    REL = "docs/design-system/cert-screens.json"

    def setUp(self):
        self.base = {"schema": "jovie.cert-screens/v1", "debt": {
            "kept.tsx": "a11y,states",
            "drop-head.tsx": "states",
            "also.tsx": "tests",
            "drop-main.tsx": "a11y",
        }}
        self.ours = json.loads(json.dumps(self.base))
        self.theirs = json.loads(json.dumps(self.base))
        del self.ours["debt"]["drop-head.tsx"]
        del self.theirs["debt"]["drop-main.tsx"]

    def resolve(self, rel=None, blobs=None):
        values = blobs or [json.dumps(value) for value in (self.base, self.ours, self.theirs)]

        def sh(args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=values[int(args[-1][1]) - 1])

        return edits.resolve_subtractive_screen_debt(Path("."), rel or self.REL, sh)

    def test_keeps_main_order_and_drops_either_sides_removals(self):
        result = json.loads(self.resolve())
        self.assertEqual(list(result["debt"]), ["kept.tsx", "also.tsx"])
        self.assertEqual(result["debt"]["kept.tsx"], "a11y,states")
        self.assertEqual(result["schema"], self.base["schema"])

    def test_unions_criterion_shrinks_and_drops_a_cleared_row(self):
        self.base["debt"]["split.tsx"] = "a11y,states"
        self.ours = json.loads(json.dumps(self.base))
        self.theirs = json.loads(json.dumps(self.base))
        del self.ours["debt"]["drop-head.tsx"]
        del self.theirs["debt"]["drop-main.tsx"]
        self.ours["debt"]["kept.tsx"] = "states"
        self.theirs["debt"]["kept.tsx"] = "a11y"
        self.theirs["debt"]["split.tsx"] = "a11y"
        result = json.loads(self.resolve())
        self.assertEqual(list(result["debt"]), ["also.tsx", "split.tsx"])
        self.assertEqual(result["debt"]["split.tsx"], "a11y")
        self.assertEqual(result["schema"], self.base["schema"])

    def test_refuses_additions_edits_and_other_paths(self):
        for mutate in (
            lambda: self.ours["debt"].update({"new.tsx": "states"}),
            lambda: self.ours["debt"].update({"kept.tsx": "changed"}),
            lambda: self.ours["debt"].update({"kept.tsx": "states,a11y"}),
            lambda: self.theirs.update(schema="other"),
            lambda: self.ours["debt"].update({"kept.tsx": ""}),
            lambda: self.theirs["debt"].update({"added.tsx": "states"}),
        ):
            self.setUp()
            mutate()
            self.assertIsNone(self.resolve())
        self.assertIsNone(self.resolve("docs/design-system/component-certification.json"))
        self.assertIsNone(self.resolve(blobs=['{"debt":{},"debt":{}}'] * 3))
        self.assertIsNone(self.resolve(blobs=["not JSON"] * 3))
