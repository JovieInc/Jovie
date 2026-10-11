"""Regression tests for scripts/lanes/worktree_pool.py (pre-installed worktree pool, JOV-7705).

Real git repositories in a temp dir; pnpm install and the typecheck warm-up are stubbed.

Run with:
    python3 -m pytest scripts/tests/test_worktree_pool.py -q
"""
from __future__ import annotations

import fcntl
import importlib.util
import io
import os
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("worktree_pool", ROOT / "scripts/lanes/worktree_pool.py")
pool_mod = importlib.util.module_from_spec(spec)
sys.modules["worktree_pool"] = pool_mod
spec.loader.exec_module(pool_mod)


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


class PoolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name).resolve()
        self.repo, self.root, self.out = base / "repo", base / "cache", base / "out"
        self.repo.mkdir()
        self.out.mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "t@example.com")
        git(self.repo, "config", "user.name", "t")
        (self.repo / "a.txt").write_text("one\n")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-q", "-m", "one")
        self.env = patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "", "JOVIE_WORKTREE_POOL": "1"})
        self.env.start()
        self.install = patch.object(pool_mod, "INSTALL", ["true"])
        self.install.start()
        self.disk = patch.object(pool_mod, "free_gb", return_value=100)
        self.disk.start()

    def tearDown(self):
        self.disk.stop()
        self.install.stop()
        self.env.stop()
        self.tmp.cleanup()

    def fill(self, **kw):
        kw.setdefault("warm", False)
        kw.setdefault("min_free_gb", 0)
        return pool_mod.fill(self.repo, kw.pop("size", 1), "main", root=self.root, **kw)

    def pool(self) -> Path:
        return pool_mod.pool_dir(self.repo, self.root)

    def test_empty_pool_takes_the_fresh_path_through_the_callers_sh(self):
        calls = []

        def sh(args, cwd=None, log=None):
            calls.append(args)
            subprocess.run(args, cwd=cwd, check=True, capture_output=True)
        source = pool_mod.take(self.repo, self.out / "w", "feat/x", "main", sh=sh, root=self.root)
        self.assertEqual(source, "fresh")
        self.assertEqual(calls, [["git", "worktree", "add", "-q", "-b", "feat/x", str(self.out / "w"), "main"]])
        self.assertEqual(git(self.out / "w", "branch", "--show-current"), "feat/x")

    def test_a_failed_fresh_add_through_a_non_raising_sh_raises(self):
        def sh(args, cwd=None, log=None):
            return subprocess.run(args, cwd=cwd, capture_output=True, text=True)  # records, never raises
        git(self.repo, "branch", "exists")
        with self.assertRaises(subprocess.CalledProcessError):
            pool_mod.take(self.repo, self.out / "w", "exists", "main", sh=sh, root=self.root)
        self.assertFalse((self.out / "w").exists())

    def test_filled_slot_is_moved_to_dest_on_the_new_branch_at_the_latest_base(self):
        self.assertEqual(len([a for a in self.fill() if a.startswith("built")]), 1)
        (self.repo / "a.txt").write_text("two\n")
        git(self.repo, "commit", "-qam", "two")
        dest = self.out / "w"
        self.assertEqual(pool_mod.take(self.repo, dest, "feat/y", "main", root=self.root), "pool")
        self.assertEqual(git(dest, "branch", "--show-current"), "feat/y")
        self.assertEqual((dest / "a.txt").read_text(), "two\n")
        self.assertEqual(pool_mod.ready_slots(self.pool()), [])
        self.assertEqual([p.name for p in self.pool().iterdir() if not p.name.startswith(".fill")], [])

    def test_detached_take_without_branch(self):
        self.fill()
        self.assertEqual(pool_mod.take(self.repo, self.out / "d", None, "main", root=self.root), "pool")
        self.assertEqual(git(self.out / "d", "branch", "--show-current"), "")

    def test_existing_branch_skips_the_pool_and_fails_like_worktree_add(self):
        self.fill()
        git(self.repo, "branch", "taken")
        with self.assertRaises(subprocess.CalledProcessError):
            pool_mod.take(self.repo, self.out / "w", "taken", "main", root=self.root)
        self.assertEqual(len(pool_mod.ready_slots(self.pool())), 1)

    def test_dirty_slot_is_discarded_and_the_fresh_path_used(self):
        self.fill()
        (pool_mod.ready_slots(self.pool())[0] / "stray.txt").write_text("x")
        log = io.StringIO()
        self.assertEqual(pool_mod.take(self.repo, self.out / "w", "feat/z", "main", log=log, root=self.root),
                         "fresh")
        self.assertIn("discarding slot", log.getvalue())
        self.assertFalse((self.out / "w" / "stray.txt").exists())

    def test_disabled_pool_is_never_consumed(self):
        self.fill()
        with patch.dict(os.environ, {"LANES_EXECUTION_BACKEND": "local-test"}):
            self.assertEqual(pool_mod.take(self.repo, self.out / "w", "feat/t", "main", root=self.root), "fresh")
            pool_mod.refill_in_background(self.repo)  # no-op when disabled
        self.assertEqual(len(pool_mod.ready_slots(self.pool())), 1)

    def test_not_a_git_checkout_reports_the_real_error(self):
        with self.assertRaises(subprocess.CalledProcessError):
            pool_mod.take(self.out, self.out / "w", "feat/n", "main", root=self.root)

    def test_fill_respects_the_disk_floor(self):
        actions = self.fill(min_free_gb=10**9)
        self.assertTrue(actions[-1].startswith("stopped:"), actions)
        self.assertEqual(pool_mod.ready_slots(self.pool()), [])

    def test_fill_rebuilds_stale_and_half_built_slots_but_spares_a_claim_in_flight(self):
        self.fill()
        old = pool_mod.ready_slots(self.pool())[0]
        aged = time.time() - pool_mod.SLOT_MAX_AGE_S - 60
        os.utime(self.pool() / f"{old.name}{pool_mod.READY}", (aged, aged))
        (self.pool() / "slot-halfbuilt").mkdir()
        (self.pool() / "slot-moving").mkdir()
        (self.pool() / f"slot-moving{pool_mod.CLAIMED}").touch()
        actions = self.fill()
        self.assertIn(f"removed stale {old.name}", actions)
        self.assertIn("removed stale slot-halfbuilt", actions)
        self.assertTrue((self.pool() / "slot-moving").exists())
        self.assertEqual(len(pool_mod.ready_slots(self.pool())), 1)

    def test_one_filler_at_a_time(self):
        pool = self.pool()
        pool.mkdir(parents=True)
        with open(pool / ".fill.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.assertEqual(self.fill(), ["busy: another filler holds the lock"])

    def test_failed_install_leaves_no_slot(self):
        with patch.object(pool_mod, "INSTALL", ["false"]):
            actions = self.fill()
        self.assertTrue(actions[-1].startswith("failed"), actions)
        self.assertEqual([p for p in self.pool().iterdir() if p.is_dir()], [])

    def test_warm_failure_is_not_fatal(self):
        with patch.object(pool_mod, "WARM", ["false"]):
            self.assertTrue(self.fill(warm=True)[-1].startswith("built"))

    def test_shed_drains_only_below_the_floor(self):
        self.fill()
        self.assertEqual(pool_mod.shed(self.repo, self.root, min_free_gb=0), [])
        self.assertEqual(len(pool_mod.shed(self.repo, self.root, min_free_gb=10**9)), 1)
        self.assertEqual(pool_mod.ready_slots(self.pool()), [])
        self.assertEqual(pool_mod.shed(self.out, self.root, min_free_gb=10**9), [])

    def finished(self, name="done") -> Path:
        path = self.out / name
        pool_mod.take(self.repo, path, f"feat/{name}", "main", root=self.root)
        (path / "node_modules").mkdir()
        (path / "node_modules" / "dep.js").write_text("installed")
        (path / ".next").mkdir()
        git(self.repo, "config", "core.excludesFile", str(self.out / "ignore"))
        (self.out / "ignore").write_text("node_modules\n.next\n")
        return path

    def test_a_clean_finished_worktree_is_recycled_with_its_install_and_without_build_output(self):
        path = self.finished()
        slot = pool_mod.recycle(self.repo, path, "main", root=self.root)
        self.assertIsNotNone(slot)
        self.assertFalse(path.exists())
        moved = self.pool() / slot
        self.assertEqual(pool_mod.ready_slots(self.pool()), [moved])
        self.assertEqual((moved / "node_modules" / "dep.js").read_text(), "installed")
        self.assertFalse((moved / ".next").exists())
        self.assertEqual(git(moved, "branch", "--show-current"), "")
        self.assertIn("feat/done", git(self.repo, "branch", "--list", "feat/done"))  # the work survives
        self.assertEqual(pool_mod.take(self.repo, self.out / "next", "feat/next", "main", root=self.root), "pool")
        self.assertTrue((self.out / "next" / "node_modules" / "dep.js").exists())

    def test_dirty_preserved_full_or_disabled_worktrees_are_not_recycled(self):
        path = self.finished()
        (path / "a.txt").write_text("uncommitted\n")
        self.assertIsNone(pool_mod.recycle(self.repo, path, "main", root=self.root))
        git(path, "checkout", "--", "a.txt")
        (path / pool_mod.PRESERVED_REPAIR).write_text("{}")
        self.assertIsNone(pool_mod.recycle(self.repo, path, "main", root=self.root))
        (path / pool_mod.PRESERVED_REPAIR).unlink()
        self.assertIsNone(pool_mod.recycle(self.repo, path, "main", root=self.root, min_free_gb=10**9))
        self.assertIsNone(pool_mod.recycle(self.repo, path, "main", size=0, root=self.root))
        with patch.dict(os.environ, {"JOVIE_WORKTREE_POOL": "0"}):
            self.assertIsNone(pool_mod.recycle(self.repo, path, "main", root=self.root))
        self.assertIsNone(pool_mod.recycle(self.repo, self.out / "missing", "main", root=self.root))
        log = io.StringIO()
        self.assertIsNone(pool_mod.recycle(self.repo, path, "no-such-base", log=log, root=self.root))
        self.assertIn("not recycled", log.getvalue())
        self.assertTrue(path.exists())

    def test_cli_never_removes_an_ignored_preserved_repair(self):
        path = self.finished("preserved")
        ignore = self.out / "ignore"
        ignore.write_text(ignore.read_text() + pool_mod.PRESERVED_REPAIR + "\n")
        marker = path / pool_mod.PRESERVED_REPAIR
        marker.write_text('{"unpublished": true}')
        self.assertTrue(pool_mod.is_clean(path), "the preservation marker is ignored")
        with patch.object(pool_mod, "CACHE_ROOT", self.root), redirect_stdout(io.StringIO()), \
             patch("sys.stderr", new_callable=io.StringIO):
            code = pool_mod.main(["--recycle", str(path), "--repo", str(self.repo), "--base", "main"])
        self.assertEqual(code, 1)
        self.assertTrue(path.exists())
        self.assertEqual(marker.read_text(), '{"unpublished": true}')
        self.assertIn("feat/preserved", git(self.repo, "branch", "--list", "feat/preserved"))

    def test_failed_ready_marker_restores_the_finished_checkout(self):
        path = self.finished("marker-failure")
        original_touch = Path.touch
        def fail_ready(marker, *args, **kwargs):
            if marker.suffix == pool_mod.READY:
                raise OSError("ready marker unavailable")
            return original_touch(marker, *args, **kwargs)
        log = io.StringIO()
        with patch.object(Path, "touch", fail_ready):
            self.assertIsNone(pool_mod.recycle(self.repo, path, "main", root=self.root, log=log))
        self.assertEqual((path / "node_modules/dep.js").read_text(), "installed")
        self.assertTrue(pool_mod.is_clean(path))
        self.assertIn(str(path), git(self.repo, "worktree", "list", "--porcelain"))
        self.assertEqual(list(self.pool().glob("slot-*")), [])
        self.assertIn("feat/marker-failure", git(self.repo, "branch", "--list", "feat/marker-failure"))
        self.assertIn("not recycled", log.getvalue())

    def test_cli_missing_recycle_path_refuses_without_mutation(self):
        missing = self.out / "missing"
        before = git(self.repo, "worktree", "list", "--porcelain")
        with patch.object(pool_mod, "CACHE_ROOT", self.root), redirect_stdout(io.StringIO()), \
                patch("sys.stderr", new_callable=io.StringIO) as errors:
            code = pool_mod.main(["--recycle", str(missing), "--repo", str(self.repo), "--base", "main"])
        self.assertEqual(code, 1)
        self.assertIn("missing", errors.getvalue())
        self.assertFalse(missing.exists())
        self.assertEqual(git(self.repo, "worktree", "list", "--porcelain"), before)
        self.assertFalse(self.pool().exists())
        self.assertFalse(pool_mod.is_clean(missing))

    def test_marker_and_rollback_failures_leave_no_orphan_and_keep_branch(self):
        path = self.finished("rollback-failure")
        original_run = pool_mod.run
        def fail_rollback(args, **kwargs):
            if args[:3] == ["git", "worktree", "move"] and args[-1] == str(path):
                raise subprocess.CalledProcessError(1, args)
            return original_run(args, **kwargs)
        with patch.object(Path, "touch", side_effect=OSError("marker unavailable")), \
                patch.object(pool_mod, "run", side_effect=fail_rollback):
            self.assertIsNone(pool_mod.recycle(self.repo, path, "main", root=self.root))
        self.assertEqual(list(self.pool().glob("slot-*")), [])
        self.assertNotIn(str(path), git(self.repo, "worktree", "list", "--porcelain"))
        self.assertNotIn(str(self.pool()), git(self.repo, "worktree", "list", "--porcelain"))
        self.assertIn("feat/rollback-failure", git(self.repo, "branch", "--list", "feat/rollback-failure"))

    def test_cli_recycles_removes_or_refuses(self):
        clean, full, dirty = self.finished("clean"), self.finished("full"), self.finished("dirty")
        (dirty / "a.txt").write_text("uncommitted\n")
        with patch.object(pool_mod, "CACHE_ROOT", self.root), redirect_stdout(io.StringIO()) as out, \
             patch("sys.stderr", new_callable=io.StringIO):
            common = ["--repo", str(self.repo), "--base", "main", "--size", "1"]
            self.assertEqual(pool_mod.main(["--recycle", str(clean), *common]), 0)
            self.assertEqual(pool_mod.main(["--recycle", str(full), *common]), 0)
            self.assertEqual(pool_mod.main(["--recycle", str(dirty), *common]), 1)
        self.assertIn("recycled into the pool", out.getvalue())
        self.assertIn("removed (pool full", out.getvalue())
        self.assertFalse(full.exists())
        self.assertTrue(dirty.exists())

    def test_cli_creates_a_worktree_and_reports_status(self):
        self.fill()
        with patch.object(pool_mod, "CACHE_ROOT", self.root), redirect_stdout(io.StringIO()) as out:
            self.assertEqual(pool_mod.main(["--repo", str(self.repo), "--status"]), 0)
            self.assertEqual(pool_mod.main([str(self.out / "c"), "-b", "feat/cli", "--base", "main",
                                            "--repo", str(self.repo), "--no-fetch", "--no-refill"]), 0)
            self.assertEqual(pool_mod.main(["--repo", str(self.repo), "--drain"]), 0)
        self.assertIn("ready 1/", out.getvalue())
        self.assertIn("ready from pool", out.getvalue())
        self.assertEqual(git(self.out / "c", "branch", "--show-current"), "feat/cli")

    def test_node_env_prefers_the_nvmrc_node(self):
        (self.out / ".nvmrc").write_text("v99.1.0\n")
        with tempfile.TemporaryDirectory() as home:
            bin_dir = Path(home) / ".nvm/versions/node/v99.1.0/bin"
            bin_dir.mkdir(parents=True)
            with patch.object(Path, "home", return_value=Path(home)):
                self.assertTrue(pool_mod.node_env(self.out)["PATH"].startswith(str(bin_dir)))
        self.assertEqual(pool_mod.node_env(self.out / "missing")["PATH"], os.environ["PATH"])


if __name__ == "__main__":
    unittest.main()
