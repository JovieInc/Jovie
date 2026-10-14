"""Regression tests for scripts/lanes/disk_guard.py (disk-pressure guard, JOV-6769).

Run with:
    python3 -m unittest scripts/tests/test_disk_guard.py -v
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

    def test_low_disk_with_reclaimable_state_produces_actions(self):
        """The reported bug: reclaimable=true but actions=[]. A low-disk sweep
        over reclaimable retired-workspace state must actually act (backed-up
        or removed workspaces), so the receipt never says reclaimable with an
        empty action list."""
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            retired = state / "symphony-elixir-workspaces"
            stale_ws = retired / "JOV-8000"
            make_tree(stale_ws, ["README.md"], age_s=3 * 86400)
            host = SimpleNamespace(state=state, repo=state)
            saved_free, saved_roots = guard.free_pct, guard.retired_workspace_roots
            guard.free_pct = lambda path: 10.0
            guard.retired_workspace_roots = lambda: [retired]
            try:
                report = guard.check(host, run=ok, now=NOW, sweep=True)
            finally:
                guard.free_pct, guard.retired_workspace_roots = saved_free, saved_roots
            self.assertTrue(report["low"])
            self.assertTrue(report["reclaimable"])
            self.assertTrue(report["actions"], "reclaimable=true must produce actions")
            self.assertTrue(any("workspace" in a for a in report["actions"]))
            # A non-checkout workspace loses regenerable output but keeps its
            # directory (safe bounds: only verifiable checkouts are removed).

    def test_tick_spawned_sweep_acts_and_the_receipt_survives_observation(self):
        """The tick drives reclaim (maybe_sweep) and an observation-only check
        afterwards must not flatten the sweep's actions to []."""
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            retired = state / "symphony-elixir-workspaces"
            stale_ws = retired / "JOV-8001"
            make_tree(stale_ws, ["README.md"], age_s=3 * 86400)
            host = SimpleNamespace(state=state, repo=state)
            saved_free, saved_roots = guard.free_pct, guard.retired_workspace_roots
            guard.free_pct = lambda path: 10.0
            guard.retired_workspace_roots = lambda: [retired]
            spawns = []
            try:
                # (a) the tick's maybe_sweep spawns exactly one detached sweep
                def popen(*a, **k):
                    spawns.append(a)
                    return None
                self.assertEqual(guard.maybe_sweep(host, 10.0, now=NOW, popen=popen), "spawned")
                self.assertEqual(len(spawns), 1)
                # throttled: a second tick within the interval does not spawn
                self.assertEqual(guard.maybe_sweep(host, 10.0, now=NOW + 60), "not-due")
                # healthy disk never spawns
                self.assertEqual(guard.maybe_sweep(host, 60.0, now=NOW), "not-low")
                # (b) the detached child sweeps in-process
                report = guard.check(host, run=ok, now=NOW + 60, sweep=True)
                self.assertTrue(report["reclaimable"])
                self.assertTrue(report["actions"])
                self.assertTrue(any("workspace" in a for a in report["actions"]))
                # (c) a later observation-only check carries the sweep's actions
                observed = guard.check(host, run=ok, now=NOW + 120, sweep=False)
                self.assertTrue(observed["actions"], "observation must not flatten sweep actions")
                self.assertTrue(any("workspace" in a for a in observed["actions"]))
            finally:
                guard.free_pct, guard.retired_workspace_roots = saved_free, saved_roots

    def test_observation_only_never_carries_stale_actions_when_disk_recovered(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            host = SimpleNamespace(state=state, repo=state)
            # no prior receipt: nothing to carry, still empty actions
            saved_free = guard.free_pct
            guard.free_pct = lambda path: 60.0
            try:
                report = guard.check(host, run=ok, now=NOW, sweep=False)
            finally:
                guard.free_pct = saved_free
            self.assertEqual(report["actions"], [])

    def test_sweep_runs_where_autoscale_stops_growth_and_reports_reclaimable(self):
        # Gem 04:12Z: autoscale blocked growth at <= 15% free, the sweep ran only below 15%.
        self.assertEqual(guard.LOW_PCT, float(guard.autoscale.DISK_INCREASE_MIN))
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(guard, "free_pct", return_value=guard.LOW_PCT), \
                patch.object(guard, "sweep_derived_data") as sweep:
            report = guard.check(self.host(tmp), sweep=True)
        sweep.assert_called_once()
        self.assertTrue(report["low"])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "symphony-elixir-workspaces"
            self.assertFalse(guard.reclaimable(None, roots=[root]))
            (root / "JOV-1").mkdir(parents=True)
            self.assertTrue(guard.reclaimable(None, roots=[root]))

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



class RetiredHostLoopTest(unittest.TestCase):
    """Runner _work, retired Symphony workspaces and old logs: the gem-disk-reclaim duties."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@example.com",
                        GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@example.com")

    def report(self):
        return {"actions": [], "errors": []}

    def runner(self, name, transient=("_temp", "_tool"), job="Jovie"):
        root = self.root / name
        for child in (*transient, job):
            (root / "_work" / child).mkdir(parents=True)
            (root / "_work" / child / "f").write_text("x")
        (root / ".runner").write_text("{}")
        (root / "run.sh").write_text("")
        return root

    def test_selftest_sees_no_host_roots(self):
        with patch.dict(os.environ, {"LANES_SELFTEST": "1"}):
            self.assertEqual((guard.runner_roots(), guard.retired_workspace_roots()), ([], []))
            self.assertEqual(guard.log_dirs(SimpleNamespace(state=self.root)), [self.root / "runs"])

    def test_idle_runner_loses_transient_work_busy_runner_keeps_it(self):
        idle, busy, unknown = self.runner("r1"), self.runner("r2"), self.root / "r3"
        (unknown / "_work/_temp").mkdir(parents=True)
        ps = SimpleNamespace(returncode=0, stderr="",
                             stdout=f"{busy}/bin/Runner.Listener run\n{busy}/bin/Runner.Worker spawnclient 1 2\n")
        report = self.report()
        guard.sweep_runner_work(lambda *a, **k: ps, report, roots=[idle, busy, unknown])
        self.assertEqual(sorted(p.name for p in (idle / "_work").iterdir()), ["Jovie"], "job checkout stays warm")
        self.assertTrue((busy / "_work/_temp/f").exists())
        self.assertTrue((unknown / "_work/_temp").exists(), "not a runner install")
        self.assertIn(f"preserved busy runner {busy}", report["actions"])

    def test_unattributable_or_unobservable_worker_holds_every_runner(self):
        idle = self.runner("r1")
        for ps in (SimpleNamespace(returncode=0, stdout="Runner.Worker spawnclient 1 2\n", stderr=""),
                   SimpleNamespace(returncode=1, stdout="", stderr="ps: denied")):
            report = self.report()
            guard.sweep_runner_work(lambda *a, **k: ps, report, roots=[idle])
            self.assertTrue((idle / "_work/_temp/f").exists())
            self.assertEqual(report["errors"], ["runner-state-unavailable"])

    def git(self, *args, cwd):
        subprocess.run(["git", *args], cwd=cwd, env=self.env, check=True, capture_output=True)

    def checkout(self, root, name, origin):
        path = root / name
        self.git("clone", "-q", str(origin), str(path), cwd=self.root)
        (path / "a.txt").write_text(name)
        self.git("add", "a.txt", cwd=path)
        self.git("commit", "-q", "-m", name, cwd=path)
        self.git("push", "-q", "origin", f"HEAD:refs/heads/{name}", cwd=path)
        self.git("fetch", "-q", "origin", cwd=path)
        return path

    def age(self, *paths):
        for path in paths:
            for entry in [path, *path.rglob("*")]:
                os.utime(entry, (NOW - 48 * 3600, NOW - 48 * 3600), follow_symlinks=False)

    def run_cmd(self, args, **kwargs):
        if args[0] in ("ps", "lsof"):
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        return subprocess.run(args, env=kwargs.pop("env", None) or self.env, **kwargs)

    def test_retired_workspaces_back_up_work_then_go_never_through_mounts(self):
        origin = self.root / "origin.git"
        self.git("init", "-q", "--bare", str(origin), cwd=self.root)
        root = self.root / "symphony-workspaces"; root.mkdir()
        clean = self.checkout(root, "JOV-1", origin)
        dirty = self.checkout(root, "JOV-2", origin)
        (dirty / "wip.txt").write_text("unsaved")
        orphan = self.checkout(root, "JOV-3", origin)
        self.git("remote", "remove", "origin", cwd=orphan)
        (orphan / "wip.txt").write_text("unsaved")
        (orphan / "node_modules/x").mkdir(parents=True)
        plain = root / "JOV-4"; (plain / "node_modules/x").mkdir(parents=True); (plain / "notes.md").write_text("n")
        mounted = self.checkout(root, "JOV-5", origin)
        fresh = self.checkout(root, "JOV-6", origin)
        self.age(clean, dirty, orphan, plain, mounted)
        os.utime(fresh / "a.txt", (NOW, NOW))
        report = self.report()
        with patch.dict(os.environ, self.env, clear=True), patch.object(guard, "free_pct", return_value=10.0), \
                patch.object(guard, "mount_points", return_value={mounted}):
            guard.sweep_retired_workspaces(SimpleNamespace(state=self.root), self.run_cmd, NOW, report, roots=[root])
        self.assertFalse(clean.exists())
        self.assertFalse(dirty.exists())
        backups = subprocess.run(["git", "for-each-ref", "--format=%(refname)", "refs/heads/backup"],
                                 cwd=origin, env=self.env, capture_output=True, text=True).stdout.split()
        self.assertEqual(len(backups), 1, report)
        self.assertTrue(backups[0].endswith("/JOV-2-" + guard.datetime.fromtimestamp(NOW, guard.timezone.utc).strftime("%Y%m%d")))
        shown = subprocess.run(["git", "show", f"{backups[0]}:wip.txt"], cwd=origin, env=self.env,
                               capture_output=True, text=True).stdout
        self.assertEqual(shown, "unsaved")
        self.assertTrue((orphan / "wip.txt").exists(), "unsaved work without a backup stays")
        self.assertFalse((orphan / "node_modules").exists())
        self.assertTrue((plain / "notes.md").exists(), "a non-git dir cannot prove it holds no work")
        self.assertFalse((plain / "node_modules").exists())
        self.assertTrue((mounted / "a.txt").exists())
        self.assertIn(f"preserved mounted workspace {mounted}", report["actions"])
        self.assertTrue(fresh.exists(), "recently used workspaces stay")
        self.assertEqual(report["errors"], [])

    def test_retired_workspaces_need_a_low_filesystem_and_a_mount_table(self):
        root = self.root / "ws"; (root / "JOV-1").mkdir(parents=True)
        self.age(root / "JOV-1")
        for pct, mounts, error in ((50.0, set(), []), (10.0, None, ["retired-workspaces:mounts-unavailable"])):
            report = self.report()
            with patch.object(guard, "free_pct", return_value=pct), patch.object(guard, "mount_points", return_value=mounts):
                guard.sweep_retired_workspaces(SimpleNamespace(state=self.root), self.run_cmd, NOW, report, roots=[root])
            self.assertTrue((root / "JOV-1").exists())
            self.assertEqual(report["errors"], error)

    def test_mount_table_decodes_escaped_paths(self):
        table = self.root / "mountinfo"
        table.write_text("36 35 8:1 / / rw - ext4 /dev/sda1 rw\n"
                         "40 36 8:17 /shard /srv/worktrees/jovie/JOV\\0401 rw - ext4 /dev/sdb1 rw\n")
        with patch.object(guard, "MOUNTINFO", table):
            self.assertEqual(guard.mount_points(), {Path("/"), Path("/srv/worktrees/jovie/JOV 1")})
        with patch.object(guard, "MOUNTINFO", self.root / "absent"):
            self.assertIsNone(guard.mount_points())

    def test_old_logs_go_ledgers_and_fresh_logs_stay(self):
        runs = self.root / "runs"; runs.mkdir()
        names = ("old.log", "old.prompt.md", "ledger.jsonl", "fresh.log")
        for name in names:
            (runs / name).write_text("x")
        for name in names[:3]:
            os.utime(runs / name, (NOW - guard.LOG_IDLE_S - 1,) * 2)
        os.utime(runs / "fresh.log", (NOW,) * 2)
        report = self.report()
        guard.sweep_old_logs(None, NOW, report, dirs=[runs])
        self.assertEqual(sorted(p.name for p in runs.iterdir()), ["fresh.log", "ledger.jsonl"])
        self.assertEqual(report["actions"], [f"removed 2 old log(s) from {runs}"])

    def test_low_disk_sweep_runs_the_host_loop_steps(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard, "free_pct", return_value=10.0), \
                patch.object(guard, "sweep_runner_work") as runners, \
                patch.object(guard, "sweep_retired_workspaces") as workspaces, \
                patch.object(guard, "sweep_old_logs") as logs, \
                patch.object(guard, "sweep_worktrees"), patch.object(guard, "sweep_host_tools"), \
                patch.object(guard, "sweep_derived_data"), patch.object(guard, "sweep_worktree_pool"):
            guard.check(SimpleNamespace(state=Path(tmp), repo=Path(tmp)), run=ok, now=NOW, sweep=True)
        runners.assert_called_once(); workspaces.assert_called_once(); logs.assert_called_once()


class HarnessArtifactTest(unittest.TestCase):
    def test_harness_files_are_not_uncommitted_source(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
            subprocess.run(["git", "init", "-q", str(repo)], check=True, env=env)
            for name in guard.HARNESS_ARTIFACTS:
                (repo / name).write_text("harness\n")
            with patch.dict(os.environ, env, clear=True):
                self.assertTrue(guard.is_clean(repo, subprocess.run), "only harness artifacts: clean")
                (repo / "unsaved.py").write_text("work\n")
                self.assertFalse(guard.is_clean(repo, subprocess.run), "a real untracked file is work")

if __name__ == "__main__":
    unittest.main()
