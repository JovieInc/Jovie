"""Tests peeled from scripts/tests/test_worktree_sweep.py so that file stays within the size-500 baseline."""
from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path

_root = Path(__file__).resolve().parents[2]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
_src = importlib.import_module("scripts.tests.test_worktree_sweep")


def _bind_source_names() -> None:
    for name, value in vars(_src).items():
        if name.startswith("__"):
            continue
        if isinstance(value, type) and issubclass(value, unittest.TestCase):
            continue
        globals().setdefault(name, value)


_bind_source_names()
del _bind_source_names


def setUpModule() -> None:
    start = getattr(_src, "setUpModule", None)
    if start is not None:
        start()


def tearDownModule() -> None:
    stop = getattr(_src, "tearDownModule", None)
    if stop is not None:
        stop()
class CleanIdleSweepTest(_src.SweepTest):
    """JOV-10172: a clean, fully pushed checkout retires after CLEAN_IDLE_S (default 3h)
    instead of waiting the full 12h; dirty or unpushed work never uses that tier."""

    def test_clean_pushed_checkout_retires_early_with_the_clean_idle_reason(self):
        path = self.worktree("early")
        report = self.sweep(now=time.time() + 4 * 3600)  # past 3h, short of 12h
        self.assertFalse(path.exists())
        self.assertEqual(report["removed"], [{"path": str(path), "reason": "clean-idle"}])
        self.assertEqual(self.remote_snapshots(), [], "nothing to preserve: no snapshot")

    def test_dirty_checkout_waits_for_the_full_window_and_snapshot_path(self):
        path = self.worktree("dirty-early")
        (path / "untracked.txt").write_text("unsaved\n")
        report = self.sweep(now=time.time() + 4 * 3600)
        self.assertTrue(path.exists(), "dirty work is never clean-idle retired")
        self.assertEqual(report["removed"], [])
        self.assertEqual(report["kept"], 1)
        report = self.sweep(now=time.time() + 2 * DAY)
        self.assertFalse(path.exists())
        self.assertEqual(report["removed"][0]["reason"], "idle")
        self.assertTrue(self.remote_snapshots(), "the 12h tier still snapshots it")

    def test_unpushed_checkout_waits_for_the_full_window(self):
        path = self.worktree("unpushed-early")
        (path / "c.txt").write_text("committed but unpushed\n")
        git(path, "add", "c.txt")
        git(path, "commit", "-qm", "local only")
        report = self.sweep(now=time.time() + 4 * 3600)
        self.assertTrue(path.exists(), "unpushed work is never clean-idle retired")
        self.assertEqual(report["removed"], [])

    def test_the_tier_can_be_turned_off_and_returns_to_the_full_window(self):
        path = self.worktree("off")
        report = self.sweep(now=time.time() + 4 * 3600, clean_idle_s=None)
        self.assertTrue(path.exists())
        self.assertEqual(report["kept"], 1)
        report = self.sweep(now=time.time() + 13 * 3600, clean_idle_s=None)
        self.assertFalse(path.exists())
        self.assertEqual(report["removed"][0]["reason"], "idle")

    def test_default_threshold_is_three_hours(self):
        self.assertEqual(sweeper.CLEAN_IDLE_S, 3 * 3600)
        # A checkout idle between the closed-PR grace and the clean threshold stays.
        path = self.worktree("grace")
        report = self.sweep(now=time.time() + 2 * 3600)
        self.assertTrue(path.exists())
        self.assertEqual(report["kept"], 1)



def _drop_inherited_tests() -> None:
    for value in list(globals().values()):
        if not isinstance(value, type) or not issubclass(value, unittest.TestCase):
            continue
        for name in dir(value):
            if name.startswith("test_") and name not in vars(value):
                setattr(value, name, None)


_drop_inherited_tests()
del _drop_inherited_tests
