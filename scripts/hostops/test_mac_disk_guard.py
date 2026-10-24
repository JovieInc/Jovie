"""Tests for mac_disk_guard: run with `python3 -m unittest scripts/hostops/test_mac_disk_guard.py`."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mac_disk_guard as g  # noqa: E402

DAY = 86400


def age(path: Path, seconds: float) -> None:
    t = time.time() - seconds
    os.utime(path, (t, t), follow_symlinks=False)


def age_tree(root: Path, seconds: float) -> None:
    for dirpath, dirnames, filenames in os.walk(root):
        for name in filenames + dirnames:
            p = Path(dirpath) / name
            if not p.is_symlink():
                age(p, seconds)
    age(root, seconds)


def git(*args: str, cwd: Path) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@x", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@x", "HUSKY": "0"}
    return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", *args], cwd=cwd, env=env,
                          check=True, capture_output=True, text=True).stdout


class IdleCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "src/deep").mkdir(parents=True)
        (self.tmp / "src/deep/a.ts").write_text("x")
        (self.tmp / "node_modules/pkg").mkdir(parents=True)
        (self.tmp / "node_modules/pkg/i.js").write_text("x")
        age_tree(self.tmp, 3 * DAY)

    def test_old_tree_is_idle(self):
        self.assertTrue(g.is_idle(self.tmp, DAY))

    def test_recent_nested_file_makes_tree_active(self):
        # The regression that wiped active node_modules: a recent file deep in the
        # tree must count, with no reliance on `find -newermt`.
        (self.tmp / "src/deep/a.ts").write_text("y")
        self.assertFalse(g.is_idle(self.tmp, DAY))

    def test_recent_build_output_does_not_count(self):
        (self.tmp / "node_modules/pkg/i.js").write_text("y")
        (self.tmp / ".next").mkdir()
        (self.tmp / ".next/trace").write_text("y")
        age(self.tmp / ".next", 3 * DAY)
        age(self.tmp, 3 * DAY)
        self.assertTrue(g.is_idle(self.tmp, DAY))

    def test_recent_git_admin_activity_counts(self):
        admin = Path(tempfile.mkdtemp()) / "admin"
        admin.mkdir()
        (admin / "HEAD").write_text("ref: refs/heads/x\n")
        (self.tmp / ".git").write_text(f"gitdir: {admin}\n")
        age(self.tmp / ".git", 3 * DAY)
        age(self.tmp, 3 * DAY)
        self.assertFalse(g.is_idle(self.tmp, DAY))
        age(admin / "HEAD", 3 * DAY)
        self.assertTrue(g.is_idle(self.tmp, DAY))
        # A fresh index (git status) or a rewritten reflog file (gc) is not activity...
        (admin / "index").write_text("x")
        (admin / "logs").mkdir()
        old_entry = f"{'0' * 40} {'1' * 40} t <t@x> {int(time.time() - 3 * DAY)} +0000\tcommit: x\n"
        (admin / "logs/HEAD").write_text(old_entry)
        self.assertTrue(g.is_idle(self.tmp, DAY))
        # ...but a new reflog entry is.
        new_entry = f"{'1' * 40} {'2' * 40} t <t@x> {int(time.time())} +0000\tcheckout: y\n"
        (admin / "logs/HEAD").write_text(old_entry + new_entry)
        self.assertFalse(g.is_idle(self.tmp, DAY))

    def test_symlink_not_followed(self):
        target = Path(tempfile.mkdtemp())
        (target / "fresh").write_text("y")
        os.symlink(target, self.tmp / "src/link")
        age(self.tmp / "src/link", 3 * DAY)
        age(self.tmp / "src", 3 * DAY)
        self.assertTrue(g.is_idle(self.tmp, DAY))


class ProcessCheck(unittest.TestCase):
    def test_cwd_inside_and_prefix_sibling(self):
        root = Path(tempfile.mkdtemp())
        wt = root / "wt-a"
        (wt / "apps").mkdir(parents=True)
        (root / "wt-ab").mkdir()
        self.assertTrue(g.has_process_inside(wt, [str(wt / "apps")]))
        self.assertTrue(g.has_process_inside(wt, [str(wt)]))
        self.assertFalse(g.has_process_inside(wt, [str(root / "wt-ab")]))

    def test_lsof_failure_fails_closed(self):
        self.assertTrue(g.has_process_inside(Path("/nowhere"), None))


class BuildDirs(unittest.TestCase):
    def test_top_most_only(self):
        root = Path(tempfile.mkdtemp())
        (root / "node_modules/.pnpm/x/node_modules").mkdir(parents=True)
        (root / "apps/web/.next/cache").mkdir(parents=True)
        (root / "apps/web/node_modules").mkdir(parents=True)
        (root / ".turbo").mkdir()
        found = sorted(str(p.relative_to(root)) for p in g.build_dirs(root))
        self.assertEqual(found, [".turbo", "apps/web/.next", "apps/web/node_modules", "node_modules"])


class Playwright(unittest.TestCase):
    def test_keeps_newest_in_use_and_referenced(self):
        cache = Path(tempfile.mkdtemp())
        for name in ("chromium-1208", "chromium-1223", "chromium-1234", "webkit-2287",
                     "chromium_headless_shell-1208", "chromium_headless_shell-1223", "ffmpeg-1011"):
            (cache / name).mkdir()
        (cache / "cli-update-check.json").write_text("{}")
        in_use = {str(cache / "chromium_headless_shell-1208/bin/shell")}
        out = sorted(p.name for p in g.playwright_removals(cache, in_use, {"chromium-1223"}))
        self.assertEqual(out, ["chromium-1208"])

    def test_referenced_from_browsers_json(self):
        root = Path(tempfile.mkdtemp())
        bj = root / "wt-x/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/browsers.json"
        bj.parent.mkdir(parents=True)
        bj.write_text(json.dumps({"browsers": [{"name": "chromium-headless-shell", "revision": "1223"},
                                               {"name": "chromium", "revision": "1223"}]}))
        self.assertEqual(g.referenced_playwright_dirs([root]),
                         {"chromium_headless_shell-1223", "chromium-1223"})


class Simulators(unittest.TestCase):
    def test_stale_selection(self):
        now = time.time()
        old = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 30 * DAY))
        new = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 2 * DAY))
        data = {"devices": {"rt": [
            {"name": "iPhone 15", "udid": "A", "state": "Shutdown", "lastBootedAt": old},
            {"name": "iPhone 16", "udid": "B", "state": "Shutdown", "lastBootedAt": new},
            {"name": "iPhone 17 Pro Max", "udid": "C", "state": "Shutdown", "lastBootedAt": old},
            {"name": "iPad", "udid": "D", "state": "Booted", "lastBootedAt": old},
        ]}}
        self.assertEqual([d["udid"] for d in g.stale_simulators(data, now)], ["A"])

    def test_never_booted_uses_data_dir_mtime(self):
        d = Path(tempfile.mkdtemp())
        age(d, 30 * DAY)
        data = {"devices": {"rt": [{"name": "x", "udid": "E", "state": "Shutdown", "dataPath": str(d)},
                                   {"name": "y", "udid": "F", "state": "Shutdown", "dataPath": "/missing"}]}}
        self.assertEqual([x["udid"] for x in g.stale_simulators(data, time.time())], ["E"])


class Worktrees(unittest.TestCase):
    """Real git: a bare origin, a clone with linked worktrees."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        origin = self.root / "origin.git"
        git("init", "-q", "--bare", "-b", "main", str(origin), cwd=self.root)
        self.repo = self.root / "repo"
        git("clone", "-q", str(origin), str(self.repo), cwd=self.root)
        (self.repo / "f").write_text("1")
        git("add", "f", cwd=self.repo)
        git("commit", "-qm", "init", cwd=self.repo)
        git("push", "-q", "origin", "main", cwd=self.repo)

    def add_wt(self, name: str, commit: bool, push: bool) -> Path:
        path = self.root / name
        git("worktree", "add", "-q", "-b", name, str(path), "origin/main", cwd=self.repo)
        if commit:
            (path / name).write_text(name)
            git("add", name, cwd=path)
            git("commit", "-qm", name, cwd=path)
        if push:
            git("push", "-q", "-u", "origin", name, cwd=path)
        return path

    def disp(self, path: Path) -> str | None:
        wt = next(w for w in g.list_worktrees(self.repo) if w["path"].resolve() == path.resolve())
        return g.branch_disposition(self.repo, wt.get("branch"), wt["head"])

    def test_merged_gone_and_unmerged(self):
        merged = self.add_wt("merged", commit=False, push=False)
        unpushed = self.add_wt("unpushed", commit=True, push=False)
        gone = self.add_wt("gone", commit=True, push=True)
        live = self.add_wt("live", commit=True, push=True)
        git("push", "-q", "origin", "--delete", "gone", cwd=self.repo)
        git("fetch", "-q", "--prune", "origin", cwd=self.repo)
        self.assertEqual(self.disp(merged), "merged")
        self.assertIsNone(self.disp(unpushed))   # local-only commit: keep
        self.assertEqual(self.disp(gone), "gone")
        self.assertIsNone(self.disp(live))       # open branch on origin: keep
        self.assertIsNone(g.branch_disposition(self.repo, "main", "HEAD"))

    def test_clean_vs_dirty(self):
        wt = self.add_wt("dirty", commit=False, push=False)
        self.assertTrue(g.is_clean(wt))
        (wt / "untracked").write_text("work")
        self.assertFalse(g.is_clean(wt))

    def test_sweep_removes_only_safe_worktrees(self):
        merged = self.add_wt("merged", commit=False, push=False)
        dirty = self.add_wt("dirtymerged", commit=False, push=False)
        (dirty / "wip").write_text("unsaved")
        busy = self.add_wt("busy", commit=False, push=False)
        live = self.add_wt("live", commit=True, push=True)
        idle_unmerged = self.add_wt("idle", commit=True, push=True)
        (idle_unmerged / "node_modules/x").mkdir(parents=True)
        (idle_unmerged / "apps/.next").mkdir(parents=True)
        for p in (merged, dirty, busy, live, idle_unmerged):
            age_tree(p, 3 * DAY)
        for admin in (self.repo / ".git/worktrees").iterdir():
            age_tree(admin, 3 * DAY)
        (live / "f").write_text("edit")  # active, unmerged
        # Fixture reflogs were written seconds ago; age them like the trees.
        real_reflog = g.last_reflog_time
        g.last_reflog_time = lambda _p: time.time() - 3 * DAY
        self.addCleanup(setattr, g, "last_reflog_time", real_reflog)

        sweep = g.Sweep(dry_run=False, target=1 << 62, log=lambda _r: None)
        sweep.cwds = [str(busy)]
        sweep.merged_worktrees([self.repo])
        self.assertFalse(merged.exists())
        self.assertTrue(dirty.exists() and (dirty / "wip").exists())
        self.assertTrue(busy.exists())
        self.assertTrue(live.exists())
        self.assertTrue(idle_unmerged.exists())
        # Branch refs survive worktree removal.
        self.assertIn("merged", git("branch", "--list", "merged", cwd=self.repo))

        sweep.idle_build_dirs([self.repo])
        self.assertFalse((idle_unmerged / "node_modules").exists())
        self.assertFalse((idle_unmerged / "apps/.next").exists())
        self.assertTrue((idle_unmerged / "idle").exists())

    def test_tmp_pack_cleanup(self):
        pack = self.repo / ".git/objects/pack"
        stale, fresh = pack / "tmp_pack_old", pack / "tmp_pack_new"
        stale.write_bytes(b"x" * 10)
        fresh.write_bytes(b"x" * 10)
        age(stale, 2 * 3600)
        sweep = g.Sweep(dry_run=False, target=1 << 62, log=lambda _r: None)
        sweep.tmp_packs([self.repo])
        self.assertFalse(stale.exists())
        self.assertTrue(fresh.exists())


class MainRun(unittest.TestCase):
    def test_low_disk_sweeps_alerts_and_writes_receipt(self):
        root = Path(tempfile.mkdtemp())
        repo = root / "repo"
        git("init", "-q", "-b", "main", str(repo), cwd=root)
        pack = repo / ".git/objects/pack"
        for i in range(3):
            p = pack / f"tmp_pack_{i}"
            p.write_bytes(b"x")
            age(p, 2 * 3600)
        notes = []
        patches = {"STATE_DIR": root / "state", "OPS_LEDGER": root / "LEDGER.md",
                   "WORKTREE_ROOTS": [root], "notify": notes.append,
                   "free_bytes": lambda volume=None: 10 * g.GB}
        for name, value in patches.items():
            self.addCleanup(setattr, g, name, getattr(g, name))
            setattr(g, name, value)
        self.assertEqual(g.main(["--steps", "tmp-packs"]), 0)
        receipt = json.loads((root / "state/receipt.json").read_text())
        self.assertEqual(receipt["steps"][0]["actions"], 3)
        self.assertTrue(receipt["alert"])
        self.assertIn("runaway", receipt)
        self.assertEqual(len(notes), 2)
        ledger = (root / "LEDGER.md").read_text()
        self.assertIn("RUNAWAY", ledger)
        self.assertIn("ALERT", ledger)
        self.assertFalse(any(pack.glob("tmp_pack_*")))

    def test_kill_switch(self):
        root = Path(tempfile.mkdtemp())
        (root / "state").mkdir()
        (root / "state/disabled").touch()
        self.addCleanup(setattr, g, "STATE_DIR", g.STATE_DIR)
        g.STATE_DIR = root / "state"
        self.assertEqual(g.main([]), 0)
        self.assertIn('"disabled"', (root / "state/ledger.jsonl").read_text())
        self.assertFalse((root / "state/receipt.json").exists())


if __name__ == "__main__":
    unittest.main()
