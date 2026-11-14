#!/usr/bin/env python3
"""Every fixture a release test reads ships in the release.

A release runs LANE_TESTS inside a tree staged from scripts/lanes plus RELEASE_EXTRAS only, so a
fixture a test reads must be in RELEASE_EXTRAS too. #24855 read the pool-feed idle-stretch fixture
at import without adding it, and its merge group failed: the staged self-test raised
FileNotFoundError, the update was refused, and the structural ci-fast lane went red.
"""
from __future__ import annotations

import ast
import re
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


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
