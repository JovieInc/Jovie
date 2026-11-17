#!/usr/bin/env python3
"""Every fixture a release test reads ships in the release.

A release runs LANE_TESTS inside a tree staged from scripts/lanes plus RELEASE_EXTRAS only, so a
fixture a test reads must be in RELEASE_EXTRAS too. #24855 read the pool-feed idle-stretch fixture
at import without adding it, and its merge group failed: the staged self-test raised
FileNotFoundError, the update was refused, and the structural ci-fast lane went red.
"""
from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def publish_reason_fixture(reason, linear, issue, config, state):
    """Use the real seal/readback protocol when a scheduler fixture claims publication."""
    job = reason.parse_job(issue["identifier"], issue["title"], issue.get("description") or "")
    record = reason.result_record(job, {"confidence": "high", "agreement": 1, "reasons": ["fixture"]},
                                  None, None, "fixture", None, None)
    return reason.publish_result(linear, issue, job, config, state, {"record": record}, "", "fixture",
                                 render=reason.render_comment, is_expired=lambda _: False, run=None)


def release_lists(path=ROOT / "scripts/lanes/lane_runner.py"):
    """LANE_TESTS and RELEASE_EXTRAS as lane_runner.py declares them (literals, read without importing)."""
    found = {}
    for node in ast.parse(Path(path).read_text()).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) \
                and node.targets[0].id in ("LANE_TESTS", "RELEASE_EXTRAS"):
            found[node.targets[0].id] = ast.literal_eval(node.value)
    return found["LANE_TESTS"], found["RELEASE_EXTRAS"]

# A quoted repo path under the fixtures directory, or the directory itself.
FIXTURE_PATH = re.compile(r"""['"](scripts/tests/fixtures(?:/[\w.-]+)*)['"]""")


def unshipped_fixtures(extras, tests, root=ROOT):
    root = Path(root)
    shipped = set(extras)
    missing = []
    for rel in tests:
        for path in sorted(set(FIXTURE_PATH.findall((root / rel).read_text()))):
            if (root / path).is_dir():
                # A directory join can't be checked file by file; name each file it reads.
                missing.append(f"{rel} reads the fixtures directory {path}; name each file it reads")
            elif path not in shipped:
                missing.append(f"{rel} reads {path}")
    return missing


class ReleaseFixtureClosureTest(unittest.TestCase):
    def test_every_shipped_python_test_imports_from_only_declared_release_files(self):
        # Import every self-test from the installed tree, including its helpers.
        tests, extras = release_lists()
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp).resolve()
            shutil.copytree(ROOT / "scripts/lanes", bundle / "scripts/lanes",
                            ignore=shutil.ignore_patterns("__pycache__", ".mesh-runtime"))
            for name in [*extras, *tests]:
                destination = bundle / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, destination)
            driver = r"""
import importlib
import json
import sys
from pathlib import Path
bundle = Path(sys.argv[1])
sys.path[:0] = [str(bundle), str(bundle / "scripts/lanes")]
paths = json.loads(sys.argv[2])
for relative in paths:
    importlib.import_module(relative[:-3].replace("/", "."))
print(json.dumps({"imported": len(paths)}))
"""
            result = subprocess.run(
                [sys.executable, "-I", "-B", "-c", driver, str(bundle), json.dumps(tests)],
                cwd=bundle, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {"imported": len(tests)})

    def test_every_fixture_a_lane_test_reads_is_shipped(self):
        tests, extras = release_lists()
        self.assertIn("scripts/tests/test_release_fixtures.py", tests)
        self.assertEqual(unshipped_fixtures(extras, tests), [],
                         "add the fixture to RELEASE_EXTRAS in scripts/lanes/lane_runner.py")

    def test_the_check_names_an_unshipped_fixture_and_a_bare_directory(self):
        fixtures = "scripts/tests/" "fixtures"  # split so this file doesn't match its own check
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / fixtures).mkdir(parents=True)
            (root / fixtures / "a.json").write_text("{}\n")
            (root / "scripts/tests/test_a.py").write_text(
                f'A = ROOT / "{fixtures}/a.json"\nD = ROOT / "{fixtures}"\n')
            self.assertEqual(unshipped_fixtures([], ["scripts/tests/test_a.py"], root=root), [
                f"scripts/tests/test_a.py reads the fixtures directory {fixtures}; name each file it reads",
                f"scripts/tests/test_a.py reads {fixtures}/a.json"])
            self.assertEqual(unshipped_fixtures([f"{fixtures}/a.json"], ["scripts/tests/test_a.py"], root=root),
                             [f"scripts/tests/test_a.py reads the fixtures directory {fixtures}; name each file it reads"])


if __name__ == "__main__":
    unittest.main()
