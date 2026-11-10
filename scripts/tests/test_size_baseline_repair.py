"""The size-500 peel: classify the company-guards log, move trailing tests, never the baseline."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import size_baseline_repair as repair  # noqa: E402


def pr(name="Company guards"):
    return {"mergeStateStatus": "BLOCKED", "headRefName": "glm/example",
            "statusCheckRollup": [{"name": name, "conclusion": "FAILURE"},
                                  {"name": "PR Ready", "conclusion": "FAILURE"}]}


class SizeBaselineRepairTest(unittest.TestCase):
    def test_classify_names_the_grown_test_and_routes_shrink(self):
        log = ("##[error]size-500: scripts/tests/test_lane_runner.py: grew 17833 -> 17941\n"
               "##[warning]API rate limit exceeded inside a passing fixture\n"
               "##[error]size-500: scripts/lanes/lane_runner.py: grew 11721 -> 11729\n")
        got = classes.classify(pr(), {"Company guards": log})
        self.assertEqual((got["cls"], got["action"]), ("size-baseline", "shrink-size"))
        self.assertIn(got["action"], classes.DETERMINISTIC)
        self.assertEqual(got["files"], ["scripts/tests/test_lane_runner.py", "scripts/lanes/lane_runner.py"])

    def test_peel_drops_only_the_trailing_class_and_keeps_a_mid_file_main(self):
        text = ("class First(unittest.TestCase):\n    def test_a(self):\n        pass\n\n"
                "if __name__ == \"__main__\":\n    raise SystemExit(0)\n\n"
                "class Last(unittest.TestCase):\n    def test_b(self):\n        pass\n")
        last = text[text.index("class Last"):]
        kept, chunk = repair.peel(text, text.count("\n") - last.count("\n"))
        self.assertIn("class First", kept)
        self.assertIn("if __name__", kept)
        self.assertNotIn("class Last", kept)
        self.assertEqual(chunk, last)
        self.assertLessEqual(kept.count("\n"), text.count("\n") - last.count("\n"))
        with self.assertRaises(ValueError):
            repair.peel("class Only(unittest.TestCase):\n    pass\n", 1)

    def test_rebase_rewrites_a_custom_base_and_leaves_testcase(self):
        chunk = "class Gate(unittest.TestCase):\n    pass\nclass Idle(SweepTest):\n    pass\n"
        rewritten = repair.rebase(chunk)
        self.assertIn("class Gate(unittest.TestCase):", rewritten)
        self.assertIn("class Idle(_src.SweepTest):", rewritten)

    def test_apply_writes_a_sibling_and_does_not_touch_the_baseline_or_production(self):
        root = Path(self.id().replace(".", "_"))
        # Relative to the test's temp directory so a crash cannot land in the repo.
        import tempfile
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(tmp, ignore_errors=True))
        tests = tmp / "scripts" / "tests"
        lanes = tmp / "scripts" / "lanes"
        guards = tmp / "scripts" / "company-guards"
        for path in (tests, lanes, guards):
            path.mkdir(parents=True)
        source = "class Keep(unittest.TestCase):\n    def test_keep(self):\n        pass\n\nclass Move(unittest.TestCase):\n    def test_move(self):\n        pass\n"
        (tests / "test_sample.py").write_text(source)
        (lanes / "lane_runner.py").write_text("class Prod:\n    pass\n" * 5)
        baseline = {"scripts/tests/test_sample.py": source.count("\n") - 3,
                    "scripts/lanes/lane_runner.py": 1}
        baseline_path = guards / "size-baseline.json"
        baseline_path.write_text(json.dumps(baseline))
        before = baseline_path.read_bytes()
        written = repair.apply_root(tmp, ["scripts/tests/test_sample.py", "scripts/lanes/lane_runner.py",
                                          "scripts/company-guards/size-baseline.json"])
        self.assertEqual(written, ["scripts/tests/test_sample.py", "scripts/tests/test_sample_overflow.py"])
        self.assertLessEqual((tests / "test_sample.py").read_text().count("\n"), baseline["scripts/tests/test_sample.py"])
        self.assertIn("class Move", (tests / "test_sample_overflow.py").read_text())
        self.assertEqual((lanes / "lane_runner.py").read_text(), "class Prod:\n    pass\n" * 5)
        self.assertEqual(baseline_path.read_bytes(), before)

    def test_shrink_pushes_without_force(self):
        calls = []

        def fake_run(args, **kwargs):
            calls.append(list(args))
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(repair, "apply_root", return_value=["scripts/tests/test_sample.py"]), \
                patch.object(repair.subprocess, "run", fake_run):
            receipt = {}
            done = repair.shrink_size_fix(None, {"headRefName": "glm/example"}, {"files": ["x"]},
                                          Path("."), None, receipt)
        self.assertEqual(done.returncode, 0)
        self.assertEqual(receipt["resolution"], "shrunk-size-baseline")
        self.assertEqual(calls[-1], ["git", "push", "-q", "origin", "HEAD:glm/example"])
        self.assertNotIn("--force", calls[-1])
        self.assertNotIn("--force-with-lease", calls[-1])


if __name__ == "__main__":
    unittest.main()
