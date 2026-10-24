"""Regression tests for scripts/lanes/git_housekeeping.py (isolated fixture tempdirs).

Run with:
    python3 -m unittest scripts/tests/test_git_housekeeping.py -v
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import git_housekeeping  # noqa: E402

git_housekeeping.install_process_fixture_env()
git_housekeeping.install_isolated_tempdirs()


class IsolatedTempdirContractTest(unittest.TestCase):
    """The lanes host qualifies on its own ambient python3 (3.9), while CI pins
    3.12. The isolation wrapper must construct on every supported interpreter:
    before the fix, forwarding 3.12-only ``delete`` (and 3.10-only
    ``ignore_cleanup_errors``) raised TypeError inside every
    TemporaryDirectory fixture before any assertion ran (JOV-8913)."""

    def test_construction_with_prefix_and_cleanup_work_on_this_interpreter(self):
        with tempfile.TemporaryDirectory(prefix="probe-") as tmp:
            path = Path(tmp)
            self.assertTrue(path.is_dir())
            self.assertIn(f"jovie-lanes-{os.getpid()}-probe-", path.name)
        self.assertFalse(path.exists(), "cleanup removes the isolated tree")

    def test_construction_with_explicit_dir_works_on_this_interpreter(self):
        with tempfile.TemporaryDirectory(prefix="outer-") as outer:
            with tempfile.TemporaryDirectory(prefix="inner-", dir=outer) as tmp:
                self.assertEqual(Path(tmp).parent, Path(outer).resolve())
            self.assertFalse(Path(tmp).exists())

    def test_ignore_cleanup_errors_forwarding_never_explodes(self):
        # 3.10+ forwards the kwarg; 3.9 must drop it instead of forwarding.
        with tempfile.TemporaryDirectory(
            prefix="kwargs-", ignore_cleanup_errors=True
        ) as tmp:
            self.assertTrue(Path(tmp).is_dir())

    def test_delete_false_is_honored_or_refused_never_silently_ignored(self):
        if sys.version_info >= (3, 12):
            held = tempfile.TemporaryDirectory(prefix="held-", delete=False)
            try:
                self.assertTrue(Path(held.name).exists(), "delete=False keeps the tree")
            finally:
                shutil.rmtree(held.name, ignore_errors=True)
            return
        with self.assertRaises(NotImplementedError):
            tempfile.TemporaryDirectory(prefix="held-", delete=False)


if __name__ == "__main__":
    unittest.main()
