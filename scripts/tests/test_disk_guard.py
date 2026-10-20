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
import git_housekeeping  # noqa: E402  (load() puts scripts/lanes on sys.path)

git_housekeeping.install_process_fixture_env()
git_housekeeping.install_isolated_tempdirs()
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


class CwdHolderTest(unittest.TestCase):
    """Gem 2026-10-20: Docker overlay/nsfs lsof warnings made every lane-end cleanup
    preserve its worktree, and reparented dev servers kept checkouts busy."""
    OVERLAY = ("lsof: WARNING: can't stat() overlay file system /var/lib/docker/overlay2/abc/merged\n"
               "      Output information may be incomplete.\n"
               "lsof: WARNING: can't stat() nsfs file system /run/docker/netns/def\n"
               "      Output information may be incomplete.\n")

    def lsof(self, stdout="", stderr="", code=0):
        return lambda args, **kw: SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr)

    def test_unrelated_mount_warnings_do_not_hide_idleness_or_activity(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve()
            self.assertIsNone(guard.busy_reason(path, self.lsof(stderr=self.OVERLAY)))
            self.assertEqual(guard.busy_reason(path, self.lsof(f"p42\nfcwd\nn{path}/apps/web\n", self.OVERLAY)),
                             "process-still-running")

    def test_other_or_enclosing_warnings_still_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve()
            for stderr in ("WARNING: cannot stat mount",
                           f"lsof: WARNING: can't stat() overlay file system {path.parent}\n",
                           "lsof: no pwd entry for UID 1000\n"):
                with self.subTest(stderr=stderr):
                    self.assertEqual(guard.busy_reason(path, self.lsof(stderr=stderr)), "process-state-unavailable")
            self.assertEqual(guard.busy_reason(path, self.lsof(code=2)), "process-state-unavailable")

    def test_reap_stops_only_processes_working_in_the_run_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve()
            alive = {101, 102, 103}
            listing = lambda: "".join(f"p{pid}\nfcwd\nn{path if pid != 103 else '/elsewhere'}\n"
                                      for pid in sorted(alive))
            kills = []
            def kill(pid, sig):
                kills.append((pid, sig))
                if pid == 101 or sig == 9:
                    alive.discard(pid)  # 101 honours SIGTERM; 102 needs SIGKILL
            run = lambda args, **kw: SimpleNamespace(returncode=0, stdout=listing(), stderr="")
            self.assertEqual(guard.reap_cwd_holders(path, run, kill, sleep=lambda s: None), [101, 102])
            self.assertEqual(kills, [(101, 15), (102, 15), (102, 9)])
            self.assertIn(103, alive)
            self.assertIsNone(guard.busy_reason(path, run))
            # An unreadable inventory reaps nothing.
            self.assertEqual(guard.reap_cwd_holders(path, self.lsof(code=2), kill), [])


class CheckTest(unittest.TestCase):
    def setUp(self):
        # These tests model disk pressure, not the operator's actual cleanup scope.
        self.cleanup = tempfile.TemporaryDirectory()
        self.addCleanup(self.cleanup.cleanup)
        scratch = Path(self.cleanup.name)
        derived = guard.sweep_derived_data
        isolated = [
            patch.object(guard, "runner_roots", return_value=[]),
            patch.object(guard, "retired_workspace_roots", return_value=[]),
            patch.object(guard, "log_dirs", side_effect=lambda host: [host.state / "runs"]),
            patch.object(guard.worktree_pool, "shed", return_value=[]),
            patch.object(guard.shutil, "which", return_value=None),
            patch.object(guard, "sweep_derived_data",
                         side_effect=lambda now, report: derived(now, report, root=scratch / "DerivedData")),
        ]
        for isolation in isolated:
            isolation.start()
            self.addCleanup(isolation.stop)

    def host(self, tmp):
        return SimpleNamespace(state=Path(tmp), repo=Path(tmp))

    def test_low_disk_fixture_preserves_an_operator_workspace(self):
        # A synthetic low-disk host must not inherit real cleanup roots. Reproduce
        # the escaped sweep with a fake operator home, never the developer's HOME.
        import worktree_sweep

        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            home = scratch / "operator-home"
            retained = make_tree(home / "symphony-elixir-workspaces/JOV-1",
                                 [".git", "source.txt"], age_s=24 * 3600)
            state = scratch / "state"
            state.mkdir()

            def run(args, **kwargs):
                output = "origin\n" if "remote" in args else "0\n" if "rev-list" in args else ""
                return SimpleNamespace(returncode=0, stdout=output, stderr="")

            with patch.object(Path, "home", return_value=home), \
                    patch.object(guard, "free_pct", return_value=10.0), \
                    patch.object(guard, "RETIRED_WORKSPACE_ABSOLUTE", []), \
                    patch.object(guard, "mount_points", return_value=set()), \
                    patch.object(guard.git_housekeeping, "quiesce"), \
                    patch.object(guard, "sweep_derived_data"), \
                    patch.object(guard, "sweep_runner_work"), \
                    patch.object(guard, "sweep_worktree_pool"), \
                    patch.object(guard.shutil, "which", return_value=None):
                guard.check(self.host(state), run=run, now=NOW, sweep=True)
            self.assertEqual((retained / "source.txt").read_text(), "x")

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
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard, "mount_points", return_value=set()):
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
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard, "mount_points", return_value=set()):
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

    def test_runner_owned_paths_survive_idle_busy_or_unobservable_workers(self):
        names = ("_actions", "_temp", "_tool", "_update")
        runner = self.runner("r1", transient=names)
        unknown = self.root / "unknown"
        (unknown / "_work/_temp").mkdir(parents=True)
        alias = self.root / "alias"
        alias.symlink_to(runner, target_is_directory=True)
        for output in ("", f"{runner}/bin/Runner.Worker spawnclient 1 2\n",
                       "Runner.Worker spawnclient 1 2\n"):
            report = self.report()
            run = unittest.mock.Mock(return_value=SimpleNamespace(returncode=0, stdout=output))
            guard.sweep_runner_work(run, report, roots=[runner, unknown, alias])
            for name in (*names, "Jovie"):
                self.assertEqual((runner / "_work" / name / "f").read_text(), "x")
            self.assertTrue((unknown / "_work/_temp").exists())
            self.assertEqual(report["errors"], [])
            self.assertEqual(report["actions"], [f"preserved runner-owned work {runner}"])
            run.assert_not_called()

    def test_job_start_after_idle_snapshot_keeps_actions_and_tools(self):
        runner = self.runner("r1", transient=("_actions", "_temp", "_tool", "_update"))
        action = runner / "_work/_actions/actions/checkout/v7/action.yml"
        action.parent.mkdir(parents=True)
        action.write_text("checked-out action")
        worker_started = False
        observations = []
        real_is_file = Path.is_file

        def is_file(path):
            nonlocal worker_started
            result = real_is_file(path)
            if path == runner / ".runner":
                # The old sweep checks registration after observing idle workers.
                # A job can start in that interval, before any recursive delete.
                worker_started = True
            return result

        def run(*args, **kwargs):
            observations.append(worker_started)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(Path, "is_file", is_file), \
                patch.object(guard.shutil, "rmtree", wraps=guard.shutil.rmtree) as delete:
            guard.sweep_runner_work(run, self.report(), roots=[runner])
            self.assertTrue(worker_started)
            self.assertEqual(action.read_text(), "checked-out action")
            for name in ("_temp", "_tool", "_update"):
                self.assertTrue((runner / "_work" / name / "f").exists())
            delete.assert_not_called()
        self.assertEqual(observations, [], "a process snapshot is not ownership")

    def git(self, *args, cwd):
        # self.env strips GIT_* so a host cannot point fixtures at its checkout.
        # Re-apply housekeeping: Git 2.55 would otherwise detach maintenance and
        # the retired-workspace sweep would see a locked index or a nonempty objects dir.
        subprocess.run(["git", *args], cwd=cwd, env=git_housekeeping.apply_fixture_env(self.env),
                       check=True, capture_output=True)

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
        self.assertIn("/JOV-2-" + guard.datetime.fromtimestamp(NOW, guard.timezone.utc).strftime("%Y%m%d") + "-",
                      backups[0])
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
            env = git_housekeeping.apply_fixture_env(
                {key: value for key, value in os.environ.items() if not key.startswith("GIT_")})
            subprocess.run(["git", "init", "-q", str(repo)], check=True, env=env)
            for name in guard.HARNESS_ARTIFACTS:
                (repo / name).write_text("harness\n")
            with patch.dict(os.environ, env, clear=True):
                self.assertTrue(guard.is_clean(repo, subprocess.run), "only harness artifacts: clean")
                (repo / "unsaved.py").write_text("work\n")
                self.assertFalse(guard.is_clean(repo, subprocess.run), "a real untracked file is work")

class GitHousekeepingTest(unittest.TestCase):
    """Detached git writers must not fail cleanup or be swallowed as success."""

    def test_config_appends_without_dropping_existing_pairs(self):
        env = git_housekeeping.apply_housekeeping_env({
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "user.name",
            "GIT_CONFIG_VALUE_0": "kept",
        })
        self.assertEqual(env["GIT_CONFIG_KEY_0"], "user.name")
        self.assertEqual(env["GIT_CONFIG_VALUE_0"], "kept")
        pairs = [(env[f"GIT_CONFIG_KEY_{i}"], env[f"GIT_CONFIG_VALUE_{i}"])
                 for i in range(int(env["GIT_CONFIG_COUNT"]))]
        self.assertIn(("user.name", "kept"), pairs)
        self.assertIn(("maintenance.auto", "false"), pairs)
        again = git_housekeeping.apply_housekeeping_env(env)
        self.assertEqual(again["GIT_CONFIG_COUNT"], env["GIT_CONFIG_COUNT"])

    def test_remove_tree_waits_out_a_writer_refilling_git_objects(self):
        root = Path(tempfile.mkdtemp(prefix=f"jovie-lanes-{os.getpid()}-writer-"))
        pack = root / ".git" / "objects" / "pack"
        pack.mkdir(parents=True)
        script = (
            "import pathlib, sys, time\n"
            "pack = pathlib.Path(sys.argv[1])\n"
            "for i in range(40):\n"
            "    pack.mkdir(parents=True, exist_ok=True)\n"
            "    path = pack / f'tmp_pack_{i}'\n"
            "    path.write_text('x')\n"
            "    time.sleep(0.02)\n"
            "    path.unlink(missing_ok=True)\n"
        )
        proc = subprocess.Popen([sys.executable, "-c", script, str(pack)], cwd=root)
        try:
            git_housekeeping.remove_tree(root)
            proc.wait(timeout=5)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)
        self.assertFalse(root.exists())

    def test_remove_tree_stops_a_git_process_holding_the_checkout(self):
        root = Path(tempfile.mkdtemp(prefix=f"jovie-lanes-{os.getpid()}-git-"))
        env = git_housekeeping.apply_fixture_env(os.environ)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True, env=env)
        proc = subprocess.Popen(["git", "cat-file", "--batch"], cwd=root, env=env,
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            git_housekeeping.remove_tree(root)
            self.assertFalse(root.exists())
            self.assertIsNotNone(proc.wait(timeout=15))
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)

    def test_temporary_directory_stops_a_writer_that_only_names_the_directory(self):
        # DispatchTest teardown: disk_guard.maybe_sweep starts a child whose cwd
        # is the runner, while --state/--repo point at the temp dir. The child
        # keeps creating files there, so rmtree raises ENOTEMPTY. Cleanup must
        # wait for that child and stop it. A directory that remains still raises.
        directory = tempfile.TemporaryDirectory()
        root = Path(directory.name)
        script = (
            "import pathlib, sys, time\n"
            "root = pathlib.Path(sys.argv[1])\n"
            "end = time.time() + 30\n"
            "i = 0\n"
            "while time.time() < end:\n"
            "    root.mkdir(parents=True, exist_ok=True)\n"
            "    (root / f'held-{i}').write_text('x')\n"
            "    i += 1\n"
            "    time.sleep(0.01)\n"
        )
        proc = subprocess.Popen(
            [sys.executable, "-c", script, str(root)],
            cwd=Path("/tmp"),
            start_new_session=True,
        )
        try:
            deadline = time.time() + 2
            while time.time() < deadline and not any(root.glob("held-*")):
                time.sleep(0.01)
            self.assertTrue(any(root.glob("held-*")), "writer did not start")
            self.assertFalse(git_housekeeping.processes_under(root),
                             "this writer must not be visible by cwd")
            directory.cleanup()
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)
        self.assertFalse(root.exists())
        self.assertIsNotNone(proc.poll())

    def test_remove_tree_raises_for_a_file(self):
        root = Path(tempfile.mkdtemp(prefix=f"jovie-lanes-{os.getpid()}-file-"))
        target = root / "not-a-directory"
        target.write_text("keep")
        with self.assertRaises(OSError):
            git_housekeeping.remove_tree(target)
        self.assertEqual(target.read_text(), "keep")
        git_housekeeping.remove_tree(root)


if __name__ == "__main__":
    unittest.main()
