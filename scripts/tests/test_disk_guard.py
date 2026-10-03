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
            clean = make_tree(repo.parent / "wt-clean", ["src/f.ts"], age_s=13 * 3600)
            dirty = make_tree(repo.parent / "wt-dirty", ["src/f.ts"], age_s=13 * 3600)
            make_tree(dirty / "apps/web/.next", ["cache.bin"], age_s=13 * 3600)
            make_tree(dirty / "apps/web/test-results", ["r.xml"], age_s=13 * 3600)
            young = make_tree(repo.parent / "wt-young", ["src/f.ts"], age_s=60)
            removed, calls = [], []

            def run(args, **kw):
                calls.append(args)
                if args[:3] == ["git", "worktree", "list"]:
                    return self.porcelain(str(repo), str(clean), str(dirty), str(young))
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

    def test_failed_removal_is_recorded_not_raised(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()
            stale = make_tree(repo.parent / "wt", ["f.ts"], age_s=20 * 3600)

            def run(args, **kw):
                if args[:3] == ["git", "worktree", "list"]:
                    return self.porcelain(str(repo), str(stale))
                if args[3:4] == ["status"]:
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                return SimpleNamespace(returncode=1, stdout="", stderr="locked")

            report = {"actions": [], "errors": []}
            guard.sweep_worktrees(SimpleNamespace(repo=repo), run, NOW, report)
            self.assertTrue(stale.exists())
            self.assertTrue(report["errors"])


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

    def test_low_disk_runs_every_sweep_and_reports_pressure(self):
        saved = (guard.free_pct, guard.shutil.which)
        guard.free_pct = lambda path: 10.0
        guard.shutil.which = lambda name: "/bin/" + name if name in ("xcrun", "pnpm") else None
        ran, cwds = [], {}

        def run(args, **kw):
            ran.append(args[0] if isinstance(args, list) else args)
            cwds[args[0]] = kw.get("cwd")
            if args[:3] == ["git", "worktree", "list"]:
                return self._porcelain_empty()
            # No lane install in flight: pgrep finds nothing.
            return SimpleNamespace(returncode=1, stdout="", stderr="") if args[0] == "pgrep" else ok(args)

        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp), run=run, now=NOW)
            finally:
                guard.free_pct, guard.shutil.which = saved
            self.assertTrue(report["low"])
            self.assertFalse(report["critical"])
            self.assertIn("xcrun", ran)
            self.assertIn("pnpm", ran)
            self.assertEqual(cwds["pnpm"], Path.home())

    def test_store_prune_skips_while_an_install_is_in_flight(self):
        """The prune deletes store content an in-flight install still links (JOV-7301):
        pgrep seeing `pnpm install` must skip it, and the lock must serialize the rest."""
        saved = guard.shutil.which
        guard.shutil.which = lambda name: "/bin/" + name
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = self.host(tmp)
                report = {"actions": [], "errors": []}
                guard.sweep_host_tools(host, lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr=""), report)
                self.assertIn("skipped pnpm store prune: install in progress", report["actions"])

                report = {"actions": [], "errors": []}
                fd = guard.store_lock(host, exclusive=False)
                try:  # a contended exclusive prune is skipped without waiting on the install
                    guard.sweep_host_tools(host, lambda *a, **k: SimpleNamespace(returncode=1, stdout="", stderr=""), report)
                finally:
                    os.close(fd)
                self.assertIn("skipped pnpm store prune: install in progress", report["actions"])
        finally:
            guard.shutil.which = saved

    def _porcelain_empty(self):
        return SimpleNamespace(returncode=0, stdout="worktree /repo\nHEAD x\nbranch refs/heads/main\n", stderr="")

    def test_critical_disk_survives_in_the_receipt_for_the_doctor(self):
        saved = guard.free_pct
        guard.free_pct = lambda path: 4.0
        with tempfile.TemporaryDirectory() as tmp:
            try:
                report = guard.check(self.host(tmp), run=ok, now=NOW)
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
                report = guard.check(self.host(tmp), run=ok, now=NOW)
            finally:
                guard.free_pct, guard.sweep_derived_data = saved
            self.assertTrue(report["errors"])


if __name__ == "__main__":
    unittest.main()
