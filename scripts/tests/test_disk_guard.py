"""Regression tests for scripts/lanes/disk_guard.py (disk-pressure guard, JOV-6769).

Run with:
    python3 -m unittest scripts/tests/test_disk_guard.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
import fcntl
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


guard = load("disk_guard")
NOW = 1_800_000_000.0


def make_tree(root: Path, names=(), age_s=0.0):
    """A directory whose every entry sits `age_s` in the past."""
    root.mkdir(parents=True, exist_ok=True)
    for name in names:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("x")
    stamp = NOW - age_s
    for entry in root.rglob("*"):
        os.utime(entry, (stamp, stamp))
    os.utime(root, (stamp, stamp))
    return root


def ok(args, **kw):
    return SimpleNamespace(returncode=0, stdout="", stderr="")


class IdleTest(unittest.TestCase):
    def test_recently_touched_sees_any_fresh_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            stale = make_tree(Path(tmp) / "stale", ["deep/nested/f.o"], age_s=26 * 3600)
            self.assertFalse(guard.recently_touched(stale, 12 * 3600, NOW))
            fresh = make_tree(Path(tmp) / "fresh", ["old.o"], age_s=26 * 3600)
            os.utime(fresh / "old.o", (NOW, NOW))
            self.assertTrue(guard.recently_touched(fresh, 12 * 3600, NOW))

    def test_derived_data_sweep_removes_only_idle_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = make_tree(root / "Jovie-abc", ["build/log.txt"], age_s=6 * 3600)
            young = make_tree(root / "Jovie-def", ["build/log.txt"], age_s=3600)
            report = {"actions": []}
            guard.sweep_derived_data(NOW, report, root=root)
            self.assertFalse(old.exists())
            self.assertTrue(young.exists())
            self.assertTrue(any("DerivedData" in a for a in report["actions"]))


class WorktreeTest(unittest.TestCase):
    def porcelain(self, *paths):
        return SimpleNamespace(returncode=0,
                               stdout="".join(f"worktree {p}\nHEAD x\nbranch refs/heads/b\n" for p in paths),
                               stderr="")

    def test_lists_linked_worktrees_but_never_the_main_checkout(self):
        calls = []

        def run(args, **kw):
            calls.append(args)
            return self.porcelain("/repo", "/state/worktrees/a", "/state/worktrees/b")
        self.assertEqual(guard.worktree_paths(Path("/repo"), run),
                         [Path("/state/worktrees/a"), Path("/state/worktrees/b")])

    def test_clean_idle_worktree_removed_dirty_one_keeps_checkout_and_loses_caches(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()
            clean = make_tree(repo.parent / "worktrees/wt-clean", ["src/f.ts"], age_s=13 * 3600)
            dirty = make_tree(repo.parent / "worktrees/wt-dirty", ["src/f.ts"], age_s=13 * 3600)
            make_tree(dirty / "apps/web/.next", ["cache.bin"], age_s=13 * 3600)
            make_tree(dirty / "apps/web/test-results", ["r.xml"], age_s=13 * 3600)
            young = make_tree(repo.parent / "worktrees/wt-young", ["src/f.ts"], age_s=60)
            external = make_tree(repo.parent / "user-checkout", ["src/f.ts"], age_s=13 * 3600)
            preserved = make_tree(repo.parent / "worktrees/preserved", [guard.PRESERVED_REPAIR], age_s=13 * 3600)
            removed, calls = [], []

            def run(args, **kw):
                calls.append(args)
                if args[:3] == ["git", "worktree", "list"]:
                    return self.porcelain(str(repo), str(clean), str(dirty), str(young), str(external), str(preserved))
                if args[3:4] == ["status"]:
                    return SimpleNamespace(returncode=0,
                                           stdout=" M dirty-file\n" if args[2] == str(dirty) else "", stderr="")
                if args[:3] == ["git", "worktree", "remove"]:
                    removed.append(args[-1])
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                return ok(args)

            report = {"actions": [], "errors": []}
            host = SimpleNamespace(repo=repo, state=Path(tmp))
            guard.sweep_worktrees(host, run, NOW, report)
            self.assertEqual(removed, [str(clean)], "clean+idle goes, branches are never deleted")
            self.assertTrue(dirty.exists())
            self.assertFalse((dirty / "apps/web/.next").exists())
            self.assertFalse((dirty / "apps/web/test-results").exists())
            self.assertTrue(young.exists(), "active worktrees are never touched")
            self.assertTrue(external.exists(), "unrelated checkouts and dependency lenders are never swept")
            self.assertTrue(preserved.exists(), "cancelled source remains preserved regardless of age")

    def test_failed_removal_is_recorded_not_raised(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()
            stale = make_tree(repo.parent / "worktrees/wt", ["f.ts"], age_s=20 * 3600)

            def run(args, **kw):
                if args[:3] == ["git", "worktree", "list"]:
                    return self.porcelain(str(repo), str(stale))
                if args[0] == "lsof":
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                if args[3:4] == ["status"]:
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                return SimpleNamespace(returncode=1, stdout="", stderr="locked")

            report = {"actions": [], "errors": []}
            guard.sweep_worktrees(SimpleNamespace(repo=repo, state=Path(tmp)), run, NOW, report)
            self.assertTrue(stale.exists())
            self.assertTrue(report["errors"])

    def test_busy_or_locked_worktrees_are_never_swept(self):
        for busy in ("process", "index-lock", "lsof-down"):
            with self.subTest(busy=busy), tempfile.TemporaryDirectory() as tmp:
                repo = Path(tmp) / "repo"
                repo.mkdir()
                stale = make_tree(repo.parent / "worktrees/wt", ["f.ts"], age_s=20 * 3600)
                if busy == "index-lock":
                    gitdir = repo / ".git/worktrees/wt"
                    gitdir.mkdir(parents=True)
                    (stale / ".git").write_text(f"gitdir: {gitdir}\n")
                    (gitdir / "index.lock").write_text("")
                    os.utime(stale / ".git", (0, 0))

                def run(args, **kw):
                    if args[:3] == ["git", "worktree", "list"]:
                        return self.porcelain(str(repo), str(stale))
                    if args[0] == "lsof":
                        if busy == "lsof-down":
                            return SimpleNamespace(returncode=2, stdout="", stderr="lsof failed")
                        out = f"p9\nn{stale}\n" if busy == "process" else ""
                        return SimpleNamespace(returncode=0, stdout=out, stderr="")
                    return SimpleNamespace(returncode=0, stdout="", stderr="")

                report = {"actions": [], "errors": []}
                guard.sweep_worktrees(SimpleNamespace(repo=repo, state=Path(tmp)), run, NOW, report)
                self.assertTrue(stale.exists())
                self.assertTrue(any("preserved busy" in a for a in report["actions"]))


class CheckTest(unittest.TestCase):
    def host(self, tmp):
        return SimpleNamespace(state=Path(tmp), repo=Path(tmp))

    def test_healthy_disk_sweeps_nothing(self):
        saved = guard.free_pct
        guard.free_pct = lambda path: 60.0
        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp))
            finally:
                guard.free_pct = saved
            self.assertEqual((report["low"], report["critical"], report["actions"]), (False, False, []))
            self.assertEqual(json.loads((Path(tmp) / "disk-pressure.json").read_text())["freePct"], 60.0)

    def test_low_disk_preserves_shared_store_while_sweeping_host_tools(self):
        saved = (guard.free_pct, guard.shutil.which)
        guard.free_pct = lambda path: 10.0
        guard.shutil.which = lambda name: "/bin/" + name if name in ("xcrun", "pnpm") else None
        ran, cwds = [], {}

        def run(args, **kw):
            ran.append(args[0] if isinstance(args, list) else args)
            cwds[args[0]] = kw.get("cwd")
            return self._porcelain_empty() if args[:3] == ["git", "worktree", "list"] else ok(args)

        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp), run=run, now=NOW, sweep=True)
            finally:
                guard.free_pct, guard.shutil.which = saved
            self.assertTrue(report["low"])
            self.assertFalse(report["critical"])
            self.assertIn("xcrun", ran)
            self.assertNotIn("pnpm", ran, "an active shared store must never be pruned")
            self.assertEqual(cwds["xcrun"], Path.home())
            self.assertIn("preserved shared pnpm store", report["actions"])

    def test_low_disk_sheds_idle_worktree_pool_slots(self):
        saved = (guard.free_pct, guard.worktree_pool.shed)
        guard.free_pct = lambda path: 10.0
        shed_repos = []
        guard.worktree_pool.shed = lambda repo: shed_repos.append(repo) or ["slot-a"]

        def run(args, **kw):
            return self._porcelain_empty() if args[:3] == ["git", "worktree", "list"] else ok(args)

        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp), run=run, now=NOW, sweep=True)
            finally:
                guard.free_pct, guard.worktree_pool.shed = saved
            self.assertEqual(shed_repos, [self.host(tmp).repo])
            self.assertIn("drained pool slot slot-a", report["actions"])

    def _porcelain_empty(self):
        return SimpleNamespace(returncode=0, stdout="worktree /repo\nHEAD x\nbranch refs/heads/main\n", stderr="")

    def test_critical_disk_survives_in_the_receipt_for_the_doctor(self):
        saved = guard.free_pct
        guard.free_pct = lambda path: 4.0
        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp), run=ok, now=NOW, sweep=True)
            finally:
                guard.free_pct = saved
            self.assertTrue(report["critical"])
            self.assertEqual(json.loads((Path(tmp) / "disk-pressure.json").read_text())["freePctAfter"], 4.0)

    def test_a_throwing_sweep_never_stops_the_others_or_the_caller(self):
        saved = (guard.free_pct, guard.sweep_derived_data)
        guard.free_pct = lambda path: 10.0
        guard.sweep_derived_data = lambda *a, **k: (_ for _ in ()).throw(OSError("ENOSPC mid-sweep"))
        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp), run=ok, now=NOW, sweep=True)
            finally:
                guard.free_pct, guard.sweep_derived_data = saved
            self.assertTrue(report["errors"])

    def test_critical_unknown_and_observation_only_never_sweep(self):
        for pct in (None, 0.1, 5.0, 10.0):
            with self.subTest(pct=pct), tempfile.TemporaryDirectory() as tmp, \
                    patch.object(guard, "free_pct", return_value=pct), \
                    patch.object(guard, "sweep_derived_data") as sweep:
                report = guard.check(self.host(tmp), sweep=pct != 10.0)
                sweep.assert_not_called()
                self.assertEqual(report["admitted"], pct == 10.0)
                self.assertEqual(report["reason"], "disk-unobservable" if pct is None else
                                 "disk-available" if pct == 10.0 else "disk-critical")

    def test_cleanup_lock_serializes_workers_and_recovers_after_release(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard, "free_pct", return_value=10.0), \
                patch.object(guard, "sweep_derived_data") as sweep, \
                patch.object(guard, "sweep_worktrees"), patch.object(guard, "sweep_host_tools"):
            host = self.host(tmp)
            with open(host.state / "disk-cleanup.lock", "a") as held:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                report = guard.check(host, sweep=True)
                self.assertEqual(report["cleanup"], "busy")
                sweep.assert_not_called()
            report = guard.check(host, sweep=True)
            self.assertEqual(report["cleanup"], "acquired")
            sweep.assert_called_once()

    def test_cleanup_stops_if_disk_becomes_critical_between_steps(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(guard, "free_pct", side_effect=[10.0, 10.0, 4.0, 4.0]), \
                patch.object(guard, "sweep_derived_data") as first, \
                patch.object(guard, "sweep_worktrees") as second:
            report = guard.check(self.host(tmp), sweep=True)
            first.assert_called_once()
            second.assert_not_called()
            self.assertFalse(report["admitted"])


if __name__ == "__main__":
    unittest.main()
