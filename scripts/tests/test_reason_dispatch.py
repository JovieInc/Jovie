"""Reason scheduling regressions use the native lane fixtures without inheriting their test suites."""
from __future__ import annotations

import contextlib
import io
import importlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

def _fixture(name):
    full = f"scripts.tests.{name}"
    module = sys.modules.get(name) or sys.modules.get(full) or importlib.import_module(full)
    sys.modules.setdefault(name, module)
    sys.modules.setdefault(full, module)
    return module


lane_fixtures = _fixture("test_lane_runner")
reason_fixtures = _fixture("test_reason_lane")

lane, reason = lane_fixtures.lane, reason_fixtures.reason
FakeLock, CONFIG = reason_fixtures.FakeLock, reason_fixtures.CONFIG


class ReasonDispatchTest(unittest.TestCase):
    setUp = lane_fixtures.DispatchTest.setUp

    def test_code_dispatch_progresses_while_the_reason_queue_read_is_held(self):
        entered, release, code_started = threading.Event(), threading.Event(), threading.Event()
        workers, errors = [], []

        def held_queue(*args):
            entered.set()
            if not release.wait(3):
                raise AssertionError("test did not release the held queue")
            return []

        def dispatch():
            try:
                lane._dispatch(host, None)
            except BaseException as error:
                errors.append(error)

        def spawn(args, **kwargs):
            if args[-1] == "tick":
                child = threading.Thread(target=lambda: lane.reason_lane.tick(host, lane, lambda: None))
                workers.append(child)
                child.start()
                self.assertTrue(entered.wait(2))
            else:
                self.assertEqual(args[-2:], ["--provider", "codex"])
                code_started.set()
            return SimpleNamespace(pid=123)

        with contextlib.ExitStack() as stack:
            tmp = stack.enter_context(tempfile.TemporaryDirectory())
            stack.enter_context(patch.dict(os.environ, {
                "LANES_SELFTEST": "", "LANES_EXECUTION_BACKEND": "", "LANES_SLOTS_CODEX": "1"}))
            for target, name, kwargs in (
                (lane.autoscale, "mode", {"return_value": "off"}),
                (lane.disk_guard, "check", {"return_value": {"freePct": 50, "admitted": True}}),
                (lane.disk_guard, "maybe_sweep", {"return_value": "not-due"}),
                (lane.worktree_sweep, "maybe_spawn", {"return_value": "not-due"}),
                (lane.reason_lane, "queued_jobs", {"side_effect": held_queue}),
                (lane, "ensure_full_history", {}),
                (lane, "load_providers", {"return_value": {"codex": {"slots": 1}}}),
                (lane, "provider_healthy", {"return_value": True}),
                (lane, "quota_pressure", {"return_value": {"ok": True}}),
                (lane, "claim_remediation_events", {"return_value": {}}),
                (lane, "Linear", {"return_value": SimpleNamespace(admit=lambda _: True)}),
                (lane.linear_sync, "tick", {"return_value": {}}),
                (lane.board_intake, "tick", {"return_value": {}}),
                (lane.bindings, "extra_bindings", {"return_value": []}),
                (lane.binding_refill, "refill", {"return_value": {}}),
                (lane.binding_refill, "rank_pass", {"return_value": {}}),
                (lane.priority_admission, "run", {"return_value": {}}),
                (lane.decompose_pass, "maybe_spawn", {"return_value": {}}),
                (lane.escalation_reconcile, "due", {"return_value": False}),
                (lane.pr_events, "tick", {"return_value": {}}),
                (lane.epics, "reconcile", {"return_value": {}}),
                (lane.ownership, "reconcile", {"return_value": {}}),
                (lane, "in_flight_issues", {"return_value": set()}),
                (lane, "finish_dispatch", {"return_value": 0}),
                (lane.subprocess, "Popen", {"side_effect": spawn}),
            ):
                stack.enter_context(patch.object(target, name, **kwargs))
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            worker = threading.Thread(target=dispatch)
            worker.start()
            try:
                self.assertTrue(entered.wait(2))
                self.assertTrue(code_started.wait(2), "reason queue read held code dispatch")
                self.assertFalse(release.is_set())
            finally:
                release.set()
                worker.join(3)
                for child in workers:
                    child.join(3)
            self.assertFalse(worker.is_alive())
            self.assertFalse(errors)

    def test_reasoning_starts_before_unrelated_code_history_can_fail(self):
        order = []

        def reasoning(*args):
            order.append("reason")
            return {"status": "scheduled"}

        def history(*args):
            order.append("history")
            raise RuntimeError("code history unavailable")

        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(lane.autoscale, "mode", return_value="off"), \
                patch.object(lane.disk_guard, "check", return_value={"freePct": 50, "admitted": True}), \
                patch.object(lane.disk_guard, "maybe_sweep", return_value="not-due"), \
                patch.object(lane.worktree_sweep, "maybe_spawn", return_value="not-due"), \
                patch.object(lane.reason_lane, "schedule_tick", side_effect=reasoning) as reason_tick, \
                patch.object(lane, "ensure_full_history", side_effect=history), \
                patch.object(lane, "finish_dispatch", return_value=1) as finish:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            self.assertEqual(lane._dispatch(host, None), 1)
            reason_tick.assert_called_once()
            self.assertEqual(reason_tick.call_args.args[:2], (host, lane.THIS))
            self.assertEqual(order, ["reason", "history"])
            tick = finish.call_args.args[1]
            self.assertEqual(tick["reason"], {"status": "scheduled"})
            self.assertIn("code history unavailable", tick["error"])

    def test_code_history_failures_preserve_the_existing_reason_worker_lock(self):
        real_lock, probes = lane.Locked, []

        def tracked_lock(*args, **kwargs):
            probe = real_lock(*args, **kwargs)
            probes.append(probe)
            return probe

        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"LANES_SELFTEST": "", "LANES_EXECUTION_BACKEND": ""}), \
                patch.object(lane.autoscale, "mode", return_value="off"), \
                patch.object(lane.disk_guard, "check", return_value={"freePct": 50, "admitted": True}), \
                patch.object(lane.disk_guard, "maybe_sweep", return_value="not-due"), \
                patch.object(lane.worktree_sweep, "maybe_spawn", return_value="not-due"), \
                patch.object(lane, "ensure_full_history", side_effect=RuntimeError("code history unavailable")), \
                patch.object(lane.reason_lane, "queued_jobs") as queue, \
                patch.object(lane, "Locked", side_effect=tracked_lock), \
                patch.object(lane, "finish_dispatch", return_value=1) as finish:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            active = real_lock(host.state / "reason.lock", blocking=False)
            try:
                self.assertTrue(active.held)
                for _ in range(2):
                    self.assertEqual(lane._dispatch(host, None), 1)
                    self.assertEqual(finish.call_args.args[1]["reason"], {"status": "busy"})
                queue.assert_not_called()
            finally:
                active.release()
                for probe in probes:
                    if not probe.handle.closed:
                        probe.release()


class SchedulingTest(unittest.TestCase):
    def setUp(self):
        FakeLock.held_paths = set()
        environment = patch.dict(os.environ, {"LANES_SELFTEST": "", "LANES_EXECUTION_BACKEND": ""})
        environment.start()
        self.addCleanup(environment.stop)

    def lane(self):
        import lane_runner
        return SimpleNamespace(Locked=FakeLock, LinearRateLimited=lane_runner.LinearRateLimited)

    def test_fixture_import_preserves_native_multiprocessing_targets_with_both_module_names(self):
        code = """
import importlib, pickle, sys
import scripts.tests.conftest
native = importlib.import_module('scripts.tests.test_lane_runner')
target = native.repair_inventory_process
importlib.import_module('scripts.tests.test_binding_turns')
short = importlib.import_module('test_lane_runner')
assert short is not native, 'fixture must reproduce the native dual-name import topology'
importlib.import_module('scripts.tests.test_reason_dispatch')
pickle.dumps(target)
assert sys.modules['scripts.tests.test_lane_runner'] is native
assert sys.modules['test_lane_runner'] is short
"""
        result = subprocess.run([sys.executable, '-c', code], cwd=lane_fixtures.ROOT,
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_native_schedule_does_not_read_the_queue_or_probe_a_provider(self):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(reason, "queued_jobs", side_effect=AssertionError("queue read on code dispatcher")), \
                patch.object(reason, "healthy", side_effect=AssertionError("provider probe on code dispatcher")):
            host = SimpleNamespace(state=Path(tmp))
            calls = []
            self.assertEqual(reason.schedule_tick(host, self.lane(), spawn=lambda args, **kw: calls.append(args)),
                             {"status": "scheduled"})
            self.assertEqual(calls[0][-2:], [str(reason.HERE / "reason_lane.py"), "tick"])
            FakeLock.held_paths = {"reason.lock"}
            self.assertEqual(reason.schedule_tick(host, self.lane(), spawn=lambda *a, **kw: self.fail("busy spawn")),
                             {"status": "busy"})

    def test_native_schedule_never_launches_from_a_release_or_local_selftest(self):
        for env in ({"LANES_SELFTEST": "1"}, {"LANES_EXECUTION_BACKEND": "local-test"}):
            with self.subTest(env=env), patch.dict(os.environ, env):
                self.assertEqual(reason.schedule_tick(SimpleNamespace(), SimpleNamespace()),
                                 {"status": "selftest-skipped"})

    def test_queue_check_keeps_the_reason_lock_until_before_drain_spawn(self):
        probe = SimpleNamespace(held=True)
        probe.release = lambda: setattr(probe, "held", False)
        lane = self.lane()
        lane.Locked = lambda *a, **kw: probe
        queue = [{"id": "i"}]
        spawned = []

        def read_queue(*args):
            self.assertTrue(probe.held)
            return queue

        def spawn(args, **kwargs):
            self.assertFalse(probe.held, "native drain must be able to take the existing reason lock")
            spawned.append(args)

        with patch.object(reason, "queued_jobs", side_effect=read_queue):
            result = reason.tick(SimpleNamespace(state=Path("unused")), lane, lambda: None, CONFIG, spawn=spawn)
        self.assertEqual(result, {"status": "spawned", "queued": 1})
        self.assertEqual(spawned[0][-1], "drain")

    def test_native_check_persists_dependency_block_and_scheduling_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = SimpleNamespace(state=Path(tmp))
            with patch.object(reason, "tick", side_effect=RuntimeError("queue unavailable")):
                receipt = reason.checked_tick(host, self.lane(), lambda: None)
            stored = json.loads((host.state / "reason-tick.json").read_text())
            self.assertEqual(stored, receipt)
            self.assertEqual((stored["status"], stored["owner"]), ("blocked", "reason-lane"))
            self.assertIn("Restore the queue dependency", stored["nextAction"])
            with patch.object(reason, "tick", return_value={"status": "spawned", "queued": 1}):
                receipt = reason.checked_tick(host, self.lane(), lambda: None)
            self.assertEqual(receipt["status"], "spawned")
            self.assertIn("accepted run-lease and durable result", receipt["nextAction"])
            self.assertEqual(json.loads((host.state / "reason-tick.json").read_text()), receipt)

    def test_native_tick_cli_uses_the_existing_check(self):
        import lane_runner
        with patch.object(lane_runner, "load_github_env"), \
                patch.object(lane_runner, "Host") as host, \
                patch.object(reason, "checked_tick", return_value={"status": "idle"}) as checked, \
                patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(reason.guarded_main(["tick"]), 0)
            self.assertEqual(checked.call_args.args[:2], (host.return_value, lane_runner))
            self.assertEqual(json.loads(output.getvalue()), {"status": "idle"})
