"""The size-500 peel: classify the company-guards log, move trailing tests, never the baseline."""
from __future__ import annotations

import ast
import json
import subprocess
import tempfile
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

    def test_peel_keeps_a_class_decorator_attached_to_the_moved_class(self):
        source = ("import unittest\nclass Keep(unittest.TestCase):\n    pass\n\n"
                  "@unittest.skip(\n    \"fixture\")\n"
                  "class Move(unittest.TestCase):\n    pass\n")
        kept, chunk = repair.peel(source, 4)
        ast.parse(kept)
        ast.parse(chunk)
        self.assertNotIn("@unittest.skip", kept)
        self.assertTrue(chunk.startswith("@unittest.skip("))

    def test_generated_overflow_imports_nested_files_and_co_moved_bases(self):
        source = ("import unittest\nclass Keep(unittest.TestCase):\n"
                  "    def test_keep(self):\n        self.assertTrue(True)\n\n"
                  "class Base(unittest.TestCase):\n"
                  "    def test_base(self):\n        self.assertTrue(True)\n\n"
                  "class Child(Base):\n"
                  "    def test_child(self):\n        self.assertTrue(True)\n")
        for rel in ("scripts/tests/test_sample.py", "scripts/fleet-gate/tests/test_deep.py"):
            with self.subTest(rel=rel), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                path = root / rel
                path.parent.mkdir(parents=True)
                path.write_text(source)
                baseline = root / repair.BASELINE_REL
                baseline.parent.mkdir(parents=True, exist_ok=True)
                baseline.write_text(json.dumps({rel: 5}))
                before = baseline.read_bytes()
                self.assertEqual(repair.apply_root(root, [rel]), [rel, repair.overflow_rel(rel)])
                checked = subprocess.run([sys.executable, "-I", "-c", \
                    "import runpy,sys,unittest,types; ns=runpy.run_path(sys.argv[1]); "
                    "suite=unittest.defaultTestLoader.loadTestsFromModule(types.SimpleNamespace(**ns)); "
                    "assert suite.countTestCases()==2,suite.countTestCases(); "
                    "result=unittest.TextTestRunner().run(suite); assert result.wasSuccessful()",
                    str(root / repair.overflow_rel(rel))], cwd=root, capture_output=True, text=True)
                self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
                self.assertEqual(baseline.read_bytes(), before)

    def test_rebase_reuses_bases_already_in_the_overflow(self):
        rewritten = repair.rebase("class NewChild(MovedBase):\n    pass\n",
                                  {"MovedBase"})
        self.assertIn("class NewChild(MovedBase):", rewritten)

    def test_apply_reuses_a_base_from_an_existing_overflow_module(self):
        rel = "scripts/tests/test_sample.py"
        source = ("import unittest\nclass Keep(unittest.TestCase):\n    pass\n\n"
                  "class NewChild(MovedBase):\n"
                  "    def test_child(self):\n        self.assertTrue(True)\n")
        existing = (repair.preamble(rel) + "class MovedBase(unittest.TestCase):\n"
                    "    def test_base(self):\n        self.assertTrue(True)\n")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / rel
            path.parent.mkdir(parents=True)
            path.write_text(source)
            dest = root / repair.overflow_rel(rel)
            dest.write_text(existing.rstrip("\n"))
            baseline = root / repair.BASELINE_REL
            baseline.parent.mkdir(parents=True)
            baseline.write_text(json.dumps({rel: 4}))
            repair.apply_root(root, [rel])
            checked = subprocess.run([sys.executable, "-I", "-c",
                "import runpy,sys,unittest,types; ns=runpy.run_path(sys.argv[1]); "
                "suite=unittest.defaultTestLoader.loadTestsFromModule(types.SimpleNamespace(**ns)); "
                "assert suite.countTestCases()==2,suite.countTestCases(); "
                "assert unittest.TextTestRunner().run(suite).wasSuccessful()", str(dest)],
                cwd=root, capture_output=True, text=True)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            self.assertIn("class MovedBase(unittest.TestCase):", dest.read_text())
            self.assertIn("class NewChild(MovedBase):", dest.read_text())

    def test_invalid_generated_modules_leave_both_files_and_baseline_unchanged(self):
        source = ("class Keep(unittest.TestCase):\n    pass\n\n"
                  "class Move(unittest.TestCase):\n    pass\n")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "scripts/tests/test_sample.py"
            path.parent.mkdir(parents=True)
            path.write_text(source)
            dest = path.with_name("test_sample_overflow.py")
            dest.write_text("def invalid(:\n")
            baseline = root / repair.BASELINE_REL
            baseline.parent.mkdir(parents=True)
            baseline.write_text(json.dumps({"scripts/tests/test_sample.py": 3}))
            before = [p.read_bytes() for p in (path, dest, baseline)]
            with self.assertRaises(SyntaxError):
                repair.apply_root(root, ["scripts/tests/test_sample.py"])
            self.assertEqual([p.read_bytes() for p in (path, dest, baseline)], before)

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
