"""Regression tests for scripts/lanes/worktree_sweep.py (worktree retirement, JOV-7704).

Real git repositories with a bare remote: the sweeper's safety rests on git's own answers.

Run with:
    python3 -m unittest scripts/tests/test_worktree_sweep.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("worktree_sweep", ROOT / "scripts/lanes/worktree_sweep.py")
sweeper = importlib.util.module_from_spec(SPEC)
sys.modules["worktree_sweep"] = sweeper
SPEC.loader.exec_module(sweeper)

DAY = 86400.0
GIT_ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@example.com", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}


def git(cwd, *args):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True,
                            env={**os.environ, **GIT_ENV})
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def no_processes(args, **kw):
    """Real git; an empty, readable process inventory."""
    if args[0] in ("ps", "lsof"):
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    return subprocess.run(args, **{**kw, "env": {**os.environ, **GIT_ENV, **(kw.get("env") or {})}})


class SweepTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name).resolve()
        self.remote = self.base / "remote.git"
        git(self.base, "init", "-q", "--bare", "-b", "main", str(self.remote))
        self.repo = self.base / "repo"
        git(self.base, "clone", "-q", str(self.remote), str(self.repo))
        (self.repo / "a.txt").write_text("a\n")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-qm", "init")
        git(self.repo, "push", "-q", "origin", "HEAD:main")
        self.roots = [self.base / "wts"]
        self.now = time.time() + 2 * DAY  # every reflog entry reads two days idle

    def worktree(self, name, *, root=None):
        path = (root or self.roots[0]) / name
        git(self.repo, "worktree", "add", "-q", "-b", name, str(path), "origin/main")
        return path

    def sweep(self, **kw):
        kw.setdefault("run", no_processes)
        kw.setdefault("now", self.now)
        return sweeper.sweep([self.repo], self.roots, [self.base / "never"], date="20261003", **kw)

    def remote_branches(self):
        return git(self.remote, "for-each-ref", "--format=%(refname:short)", "refs/heads/backup").split()

    def test_clean_pushed_idle_worktree_is_removed_without_backup(self):
        path = self.worktree("clean")
        report = self.sweep()
        self.assertFalse(path.exists())
        self.assertEqual(report["removed"], [{"path": str(path), "reason": "idle"}])
        self.assertEqual(self.remote_branches(), [])

    def test_dirty_and_unpushed_work_is_backed_up_before_removal(self):
        path = self.worktree("dirty")
        (path / "b.txt").write_text("committed but unpushed\n")
        git(path, "add", "b.txt")
        git(path, "commit", "-qm", "local only")
        (path / "a.txt").write_text("edited\n")
        (path / "new.txt").write_text("untracked\n")
        (path / "node_modules/pkg").mkdir(parents=True)
        (path / "node_modules/pkg/index.js").write_text("build output\n")
        report = self.sweep(now=time.time() + 2 * DAY)
        self.assertFalse(path.exists())
        self.assertEqual(report["backups"], ["backup/mac/dirty-20261003"])
        files = git(self.remote, "ls-tree", "-r", "--name-only", "backup/mac/dirty-20261003").split()
        self.assertEqual(sorted(files), ["a.txt", "b.txt", "new.txt"], "build dirs never reach the backup")
        self.assertEqual(git(self.remote, "show", "backup/mac/dirty-20261003:a.txt"), "edited")

    def test_failed_backup_keeps_checkout_and_strips_build_output(self):
        path = self.worktree("unsaved")
        (path / "a.txt").write_text("edited\n")
        (path / ".next").mkdir()
        git(self.repo, "remote", "set-url", "origin", str(self.base / "missing.git"))
        report = self.sweep()
        self.assertTrue((path / "a.txt").exists())
        self.assertFalse((path / ".next").exists())
        self.assertEqual(report["stripped"], [str(path)])

    def test_live_process_recent_activity_and_scope_protect_checkouts(self):
        live = self.worktree("live")
        recent = self.worktree("recent")
        outside = self.worktree("outside", root=self.base / "elsewhere")
        never = self.worktree("never", root=self.base / "never")
        self.roots.append(self.base / "never")

        def run(args, **kw):
            if args[0] == "lsof":
                return SimpleNamespace(returncode=0, stdout=f"p1\nn{live}/apps/web\n", stderr="")
            return no_processes(args, **kw)

        os.utime(recent, None)
        (recent / "a.txt").write_text("edited just now\n")
        report = self.sweep(run=run, now=time.time() + 60)
        self.assertTrue(live.exists() and recent.exists() and outside.exists() and never.exists())
        self.assertEqual(report["removed"], [])
        report = self.sweep(run=run)
        self.assertTrue(live.exists(), "a process cwd inside the checkout always protects it")
        self.assertFalse(recent.exists())
        self.assertTrue(outside.exists() and never.exists())
        self.assertTrue(self.repo.exists(), "the primary clone is never a candidate")

    def test_locked_or_unreadable_worktrees_are_kept_and_reported(self):
        locked = self.worktree("locked")
        git(self.repo, "worktree", "lock", "--reason", "agent owns it", str(locked))
        broken = self.worktree("broken")
        (broken / ".git").write_text("gitdir: /nowhere\n")
        report = self.sweep()
        self.assertTrue(locked.exists(), "an explicit git worktree lock outranks idleness")
        self.assertTrue(broken.exists(), "unreadable git state is never proof the work is saved")
        self.assertEqual(len(report["errors"]), 1)
        self.assertIn("remove:", report["errors"][0])
        self.assertEqual(report["kept"], 1)

    def test_unreadable_process_inventory_removes_nothing(self):
        path = self.worktree("idle")

        def run(args, **kw):
            if args[0] == "lsof":
                return SimpleNamespace(returncode=2, stdout="", stderr="denied")
            return no_processes(args, **kw)

        report = self.sweep(run=run)
        self.assertTrue(path.exists())
        self.assertEqual(report["errors"], ["process-state-unavailable"])

    def test_closed_pr_branch_retires_after_grace_even_before_idle_threshold(self):
        path = self.worktree("merged-pr")
        self.sweep(now=time.time() + 60, closed={self.repo: {"merged-pr"}})
        self.assertTrue(path.exists(), "a just-touched checkout keeps its grace hour")
        report = self.sweep(now=time.time() + 2 * 3600, closed={self.repo: {"merged-pr"}})
        self.assertFalse(path.exists())
        self.assertEqual(report["removed"][0]["reason"], "pr-closed")

    def test_preserved_repair_expires_by_ttl_or_closed_pr_with_backup(self):
        kept = self.worktree("kept-repair")
        closed = self.worktree("closed-repair")
        expired = self.worktree("expired-repair")
        for path in (kept, closed, expired):
            (path / sweeper.PRESERVED_REPAIR).write_text(json.dumps({"pr": 1}))
            (path / "a.txt").write_text("repair in progress\n")
        old = self.now - 4 * DAY
        os.utime(expired / sweeper.PRESERVED_REPAIR, (old, old))
        os.utime(expired / "a.txt", (old, old))
        for path in (kept, closed):
            os.utime(path / "a.txt", (old, old))
        report = self.sweep(closed={self.repo: {"closed-repair"}})
        self.assertTrue(kept.exists(), "a preserved repair younger than its TTL stays")
        self.assertFalse(closed.exists())
        self.assertFalse(expired.exists())
        self.assertEqual(sorted(r["reason"] for r in report["removed"]), ["preserved-expired", "preserved-pr-closed"])
        self.assertEqual(sorted(self.remote_branches()),
                         ["backup/mac/closed-repair-20261003", "backup/mac/expired-repair-20261003"])
        files = git(self.remote, "ls-tree", "-r", "--name-only", "backup/mac/closed-repair-20261003").split()
        self.assertNotIn(sweeper.PRESERVED_REPAIR, files)


class ScopeTest(unittest.TestCase):
    def test_glob_roots_match_only_direct_children(self):
        home = Path("/home/u")
        roots = [home / "jovie-wt-*", home / ".codex/worktrees"]
        never = [home / ".cache"]
        self.assertTrue(sweeper.in_scope(home / "jovie-wt-fix", roots, never))
        self.assertTrue(sweeper.in_scope(home / "jovie-wt-fix/nested", roots, never))
        self.assertTrue(sweeper.in_scope(home / ".codex/worktrees/abcd/Jovie", roots, never))
        self.assertFalse(sweeper.in_scope(home / "Jovie", roots, never))
        self.assertFalse(sweeper.in_scope(home / "src/jovie-wt-fix", roots, never))
        self.assertFalse(sweeper.in_scope(home / ".cache/jovie-wt-x", roots + [home / ".cache"], never))


class SpawnTest(unittest.TestCase):
    def test_spawns_once_per_interval_and_sooner_under_pressure(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(sweeper.subprocess, "Popen") as popen:
            state, repo = Path(tmp) / "state", Path(tmp) / "repo"
            self.assertEqual(sweeper.maybe_spawn(state, repo, 50.0, now=10_000.0), "no-repo")
            (repo / ".git").mkdir(parents=True)
            self.assertEqual(sweeper.maybe_spawn(state, repo, 50.0, now=10_000.0), "spawned")
            self.assertEqual(sweeper.maybe_spawn(state, repo, 50.0, now=10_000.0 + 900), "not-due")
            self.assertEqual(sweeper.maybe_spawn(state, repo, 4.0, now=10_000.0 + 900), "spawned",
                             "critical disk shortens the interval instead of blocking the sweep")
            self.assertEqual(popen.call_count, 2)
            self.assertIn("--repo", popen.call_args.args[0])


class HostWiringTest(unittest.TestCase):
    def test_closed_branches_reads_one_rest_page_for_github_remotes(self):
        calls = []

        def run(args, **kw):
            calls.append(args)
            if args[:2] == ["git", "-C"]:
                return SimpleNamespace(returncode=0, stdout="git@github.com:JovieInc/Jovie.git\n", stderr="")
            return SimpleNamespace(returncode=0, stdout="codex/jov-1\ndevin/jov-2\n", stderr="")

        self.assertEqual(sweeper.closed_branches(Path("/r"), run), {"codex/jov-1", "devin/jov-2"})
        self.assertIn("repos/JovieInc/Jovie/pulls?state=closed", calls[-1][2])
        local = lambda args, **kw: SimpleNamespace(returncode=0, stdout="/srv/mirror.git\n", stderr="")
        self.assertEqual(sweeper.closed_branches(Path("/r"), local), set(), "non-GitHub remotes make no API call")

        def offline(args, **kw):
            if args[0] == "gh":
                raise subprocess.TimeoutExpired(args, 60)
            return run(args, **kw)

        self.assertEqual(sweeper.closed_branches(Path("/r"), offline), set())

    def test_process_argv_paths_protect_and_spawn_failure_fails_closed(self):
        def run(args, **kw):
            if args[0] == "ps":
                return SimpleNamespace(returncode=0, stdout="node /w/wt-a/node_modules/.bin/next dev\n", stderr="")
            return SimpleNamespace(returncode=1, stdout="", stderr="")

        live = sweeper.live_paths(run)
        self.assertTrue(sweeper.busy(Path("/w/wt-a"), live))
        self.assertFalse(sweeper.busy(Path("/w/wt-b"), live))
        self.assertIsNone(sweeper.live_paths(lambda *a, **k: (_ for _ in ()).throw(OSError("no lsof"))))

    def test_defaults_cover_agent_roots_and_skip_shared_caches(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / "Jovie/.git").mkdir(parents=True)
            (home / "LogYourBody").mkdir()  # not a repository: skipped
            lanes_repo = home / "devin-sweep/Jovie"
            (lanes_repo / ".git").mkdir(parents=True)
            self.assertEqual(sweeper.default_repos(home, lanes_repo), [lanes_repo, home / "Jovie"])
            roots, never = sweeper.default_roots(home, home / "state"), sweeper.default_never(home)
            for path in (home / ".codex/worktrees/a1/Jovie", home / "conductor/workspaces/x/y",
                         home / "state/worktrees/run", home / "jovie-wt-fix"):
                self.assertTrue(sweeper.in_scope(path, roots, never), path)
            for path in (home / ".cache/pnpm", home / "Library/pnpm/store", home / "Jovie"):
                self.assertFalse(sweeper.in_scope(path, roots, never), path)

    def test_main_holds_the_cleanup_lock_and_records_its_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state"
            state.mkdir()
            (state / "worktree-sweep.json").write_text(json.dumps({"startedAt": 5.0}))
            report = {"removed": [], "backups": ["backup/mac/x-1"], "stripped": [], "kept": 3, "errors": []}
            with patch.object(sweeper, "sweep", return_value=report) as run_sweep, \
                    patch.object(sweeper, "default_repos", return_value=[]):
                self.assertEqual(sweeper.main(["--state", str(state), "--repo", tmp]), 0)
                run_sweep.assert_called_once()
                saved = json.loads((state / "worktree-sweep.json").read_text())
                self.assertEqual((saved["startedAt"], saved["backups"]), (5.0, ["backup/mac/x-1"]))
                import fcntl
                with open(state / "disk-cleanup.lock", "a") as held:
                    fcntl.flock(held, fcntl.LOCK_EX)
                    self.assertEqual(sweeper.main(["--state", str(state), "--repo", tmp]), 0)
                run_sweep.assert_called_once()  # a held cleanup lock skips the run


if __name__ == "__main__":
    unittest.main()
