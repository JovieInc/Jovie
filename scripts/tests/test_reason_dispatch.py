"""Reason scheduling regressions use the native lane fixtures without inheriting their test suites."""
from __future__ import annotations

import contextlib
import io
import importlib
import json
import os
import plistlib
import shlex
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
        return SimpleNamespace(Locked=FakeLock, LinearRateLimited=lane_runner.LinearRateLimited,
                               disk_guard=SimpleNamespace(check=lambda _: {"admitted": True}))

    def test_fixture_import_preserves_native_multiprocessing_targets_with_both_module_names(self):
        code = """
import importlib, pickle, sys
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
            history = (host.state / "runs/reason-checks" / (receipt["observedAt"][:10] + ".jsonl")).read_text().splitlines()
            self.assertEqual(json.loads(history[-1]), receipt)

    def test_native_tick_cli_uses_the_existing_check(self):
        import lane_runner
        with patch.object(lane_runner, "load_github_env"), \
                patch.object(lane_runner, "Host") as host, \
                patch.object(reason, "checked_tick", return_value={"status": "idle"}) as checked, \
                patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(reason.guarded_main(["tick"]), 0)
            self.assertEqual(checked.call_args.args[:2], (host.return_value, lane_runner))
            self.assertEqual(json.loads(output.getvalue()), {"status": "idle"})


class IndependentWakeTest(unittest.TestCase):
    @contextlib.contextmanager
    def installed(self, platform="Linux", policy="", collision=False, enabled="1"):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            units, plists, binaries = (root / name for name in ("units", "plists", "bin"))
            for directory in (units, plists, binaries):
                directory.mkdir()
            main = units / "jovie-lanes.service.d"
            main.mkdir()
            (main / "40-policy.conf").write_text("[Service]\n" + policy)
            protected = units / "jovie-lanes-reason.service.d/50-main-40-policy.conf"
            if collision:
                protected.parent.mkdir()
                protected.write_text("operator-owned\n")
            script = (reason.HERE / "install.sh").read_text()
            script = script.replace("$HOME/.config/systemd/user", str(units))
            script = script.replace("$HOME/Library/LaunchAgents", str(plists))
            installer = root / "install.sh"
            installer.write_text(script)
            def stub(name, text):
                executable = binaries / name
                executable.write_text(text)
                executable.chmod(0o755)
            stub("node", "#!/bin/sh\nexit 0\n")
            stub("uname", f"#!/bin/sh\nprintf '{platform}\\n'\n")
            for name in ("systemctl", "launchctl"):
                stub(name, f'#!/bin/sh\nprintf "{name} %s\\n" "$*" >> "$INSTALL_COMMAND_LOG"\n')
            stub("python3", f"#!{sys.executable}\n" + """
import json, os, pathlib, sys
if sys.argv[1] == '-c':
    code = sys.argv[2]; sys.argv = [sys.argv[0], *sys.argv[3:]]
    exec(code, {'__name__': '__main__'}); sys.exit(0)
if os.environ.get('REASON_WAKE_ONLY') and sys.argv[1:] != [os.environ['LANES_STATE'] + '/current/reason_lane.py', 'tick']:
    sys.exit(86)
current = pathlib.Path(os.environ['LANES_STATE']) / 'current'
current.mkdir(parents=True, exist_ok=True)
(current / '.release.json').write_text(json.dumps({'sourceCommit': 'c' * 40, 'objects': {'scripts/lanes': 'a' * 40}}))
with open(os.environ['INSTALL_COMMAND_LOG'], 'a') as log:
    log.write(' '.join(sys.argv[1:]) + '\\n')
""")
            env = {**os.environ, "PATH": f"{binaries}:/usr/bin:/bin", "LANES_STATE": str(root / "state"),
                   "LANES_REPO": str(root / "repo"), "LANES_TMPDIR": str(root / "private-temp"),
                   "LANES_HUD": "0", "LANES_REASON_WAKE": enabled or "", "INSTALL_COMMAND_LOG": str(root / "commands")}
            if enabled is None: env.pop("LANES_REASON_WAKE")
            result = subprocess.run(["/bin/bash", str(installer)], env=env, capture_output=True, text=True, timeout=10)
            yield SimpleNamespace(root=root, units=units, plists=plists, env=env, result=result,
                                  installer=installer, protected=protected, main=main)

    def test_linux_and_macos_wakes_run_accepted_reason_tick_without_the_code_chain(self):
        policy = 'Environment=LANES_SLOTS_CLAUDE=0\nEnvironmentFile=-/fixture/existing.env\nCPUQuota=50%\nMemoryMax=75%\n'
        for platform in ("Linux", "Darwin"):
            with self.subTest(platform=platform), self.installed(platform, policy) as fixture:
                self.assertEqual(fixture.result.returncode, 0, fixture.result.stderr)
                if platform == "Darwin":
                    config = plistlib.loads((fixture.plists / "com.jovie.lanes-reason.plist").read_bytes())
                    main = plistlib.loads((fixture.plists / "com.jovie.lanes.plist").read_bytes())
                    self.assertEqual(config["StartInterval"], 300)
                    self.assertTrue(config["RunAtLoad"])
                    self.assertEqual(config["EnvironmentVariables"], {**main["EnvironmentVariables"], "LANES_REASON_WAKE": "1"})
                    command = config["ProgramArguments"][-1]
                else:
                    service = (fixture.units / "jovie-lanes-reason.service").read_text()
                    timer = (fixture.units / "jovie-lanes-reason.timer").read_text()
                    self.assertIn("KillMode=process", service)
                    self.assertIn("OnCalendar=*:0/5", timer)
                    self.assertNotIn("After=jovie-lanes", service)
                    command = shlex.split(next(line.split("=", 1)[1] for line in service.splitlines() if line.startswith("ExecStart=")))[-1]
                    shared = fixture.units / "jovie-lanes-reason.service.d/50-main-40-policy.conf"
                    self.assertTrue(shared.is_symlink())
                    self.assertEqual(shared.resolve(), (fixture.main / "40-policy.conf").resolve())
                    self.assertIn(f'TMPDIR={fixture.root / "private-temp"}',
                                  (fixture.units / "jovie-lanes-reason.service.d/65-temp-placement.conf").read_text())
                    self.assertIn("--user enable --now jovie-lanes-reason.timer", (fixture.root / "commands").read_text())
                self.assertEqual(shlex.split(command), ["exec", "python3", fixture.env["LANES_STATE"] + "/current/reason_lane.py", "tick"])
                result = subprocess.run(["/bin/bash", "-c", command], env={**fixture.env, "REASON_WAKE_ONLY": "1"},
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, "independent wake reached the held code chain")
                self.assertTrue((fixture.root / "commands").read_text().endswith("/current/reason_lane.py tick\n"))

    def test_reason_policy_never_copies_commands_or_replaces_operator_files(self):
        for policy, collision in (("ExecStart=/bin/false\n", False), ("Environment=X=%n\n", False),
                                  ("Environment=LANES_SLOTS_CLAUDE=0\n", True)):
            with self.subTest(policy=policy, collision=collision), self.installed(policy=policy, collision=collision) as fixture:
                self.assertNotEqual(fixture.result.returncode, 0)
                self.assertNotIn("--user enable", (fixture.root / "commands").read_text())
                if collision:
                    self.assertEqual(fixture.protected.read_text(), "operator-owned\n")

    def test_disk_admission_blocks_before_queue_client_and_provider_and_recovers(self):
        for disk in ({"admitted": False, "freePct": 1}, {"error": "unobservable"}, {}, None, {"admitted": "true"}, OSError("stat unavailable")):
            with self.subTest(disk=disk), tempfile.TemporaryDirectory() as tmp:
                host = SimpleNamespace(state=Path(tmp))
                def check(_):
                    if isinstance(disk, Exception):
                        raise disk
                    return disk
                api = SimpleNamespace(disk_guard=SimpleNamespace(check=check))
                with patch.object(reason, "tick") as tick:
                    receipt = reason.checked_tick(host, api, lambda: self.fail("denied client initialization"))
                tick.assert_not_called()
                self.assertEqual(receipt["blockedOn"], "disk-admission")
                self.assertEqual((receipt["status"], receipt["owner"]), ("blocked", "reason-lane"))
                self.assertTrue(receipt["nextAction"])
                self.assertEqual(json.loads((host.state / "reason-tick.json").read_text()), receipt)
                api.disk_guard.check = lambda _: {"admitted": True}
                with patch.object(reason, "tick", return_value={"status": "idle"}):
                    self.assertEqual(reason.checked_tick(host, api, lambda: None)["status"], "idle")

    def test_reason_tick_respects_operator_exclusive_and_drain_but_allows_shared_maintenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            lock = (host.state / "lifecycle.lock").open("a+")
            try:
                with patch.dict(sys.modules, {"lane_runner": lane}), patch.object(lane, "Host", return_value=host), \
                        patch.object(reason, "guarded_main", return_value=0) as effects:
                    lane.fcntl.flock(lock, lane.fcntl.LOCK_EX | lane.fcntl.LOCK_NB)
                    self.assertEqual(reason.main(["tick"]), 75)
                    effects.assert_not_called()
                    lane.fcntl.flock(lock, lane.fcntl.LOCK_SH)
                    self.assertEqual(reason.main(["tick"]), 0)
                    effects.assert_called_once_with(["tick"])
                    effects.reset_mock()
                    (host.state / "lifecycle-drain.json").write_text("operator-request")
                    self.assertEqual(reason.main(["tick"]), 75)
                    effects.assert_not_called()
            finally:
                lock.close()

    def test_dispatch_and_independent_wake_race_accepts_only_one_durable_drain(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_SELFTEST": "", "LANES_EXECUTION_BACKEND": ""}):
            host = SimpleNamespace(state=Path(tmp), linear_env=Path(tmp) / "env")
            job = {"id": "i-1", "identifier": "JOV-1", "title": "rank", "description": reason_fixtures.description()}
            linear = reason_fixtures.FakeLinear(jobs=[job])
            api = SimpleNamespace(Locked=lane.Locked, Linear=lambda _: linear, LinearRateLimited=lane.LinearRateLimited)
            barrier, rejected, results, errors = threading.Barrier(2), threading.Event(), [], []
            first_checked = threading.Event()
            def publish(*args, **kwargs):
                self.assertTrue(rejected.wait(3), "competing drain did not return busy")
                (host.state / "durable-result").write_text("accepted once")
                return importlib.import_module("scripts.tests.test_release_fixtures").publish_reason_fixture(reason, *args)
            def spawn(*args, **kwargs):
                first_checked.set()
                barrier.wait(3)
                result = reason.drain(host, api, CONFIG)
                results.append(result)
                if result["status"] == "busy":
                    rejected.set()
            def trigger(dispatch):
                try:
                    check = lambda *a, **kw: reason.tick(host, api, lambda: linear, CONFIG, spawn=spawn)
                    if dispatch:
                        reason.schedule_tick(host, api, spawn=check)
                    else:
                        check()
                except BaseException as error:
                    errors.append(error)
            with patch.object(reason, "queued_jobs", side_effect=lambda *_: [job] if linear.state_of("i-1") == "Todo" else []), \
                    patch.object(reason, "healthy", return_value=True), patch.object(reason, "budget_allows", return_value=True), \
                    patch.object(reason, "one_job", side_effect=publish) as accepted:
                workers = [threading.Thread(target=trigger, args=(dispatch,)) for dispatch in (True, False)]
                workers[0].start()
                self.assertTrue(first_checked.wait(3), "first queue check did not release its lock")
                workers[1].start()
                for worker in workers:
                    worker.join(5)
                self.assertFalse(any(worker.is_alive() for worker in workers))
                self.assertFalse(errors, errors)
                self.assertEqual(accepted.call_count, 1)
            self.assertEqual(sorted(result["status"] for result in results), ["busy", "idle"])
            self.assertEqual((host.state / "durable-result").read_text(), "accepted once")
            self.assertEqual(linear.moves.count(("i-1", "In Progress")), 1)

    def test_scheduled_child_retains_lifecycle_until_process_loss_then_can_retry(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"LANES_SELFTEST": "", "LANES_EXECUTION_BACKEND": ""}):
            host = SimpleNamespace(state=Path(tmp))
            read, write = os.pipe()
            child = None
            def spawn(args, **kwargs):
                self.assertEqual(args[-1], "tick")
                self.assertTrue(kwargs["start_new_session"])
                kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                code = f"import os; print('owned', flush=True); os.read({read}, 1)"
                kwargs["pass_fds"] = (*kwargs["pass_fds"], read)
                return subprocess.Popen([sys.executable, "-u", "-c", code], **kwargs)
            try:
                with lane.lifecycle.Guard(host.state):
                    def launch(*args, **kwargs):
                        nonlocal child
                        child = spawn(*args, **kwargs)
                    self.assertEqual(reason.schedule_tick(host, lane, spawn=launch)["status"], "scheduled")
                    self.assertEqual(child.stdout.readline().strip(), "owned")
                with (host.state / "lifecycle.lock").open("a+") as exclusive:
                    with self.assertRaises(BlockingIOError):
                        lane.fcntl.flock(exclusive, lane.fcntl.LOCK_EX | lane.fcntl.LOCK_NB)
                    child.kill()
                    child.communicate(timeout=5)
                    lane.fcntl.flock(exclusive, lane.fcntl.LOCK_EX | lane.fcntl.LOCK_NB)
                with lane.lifecycle.Guard(host.state):
                    self.assertEqual(reason.schedule_tick(host, lane, spawn=lambda *a, **kw: None)["status"], "scheduled")
            finally:
                os.close(read)
                os.close(write)
                if child is not None and child.poll() is None:
                    child.kill()
                    child.communicate(timeout=5)

    def test_receipt_storage_failure_blocks_admission_or_preserves_observed_spawn(self):
        module = reason._reason_dispatch
        for fail_at in (1, 2, 3):
            with self.subTest(fail_at=fail_at), tempfile.TemporaryDirectory() as tmp:
                host = SimpleNamespace(state=Path(tmp))
                api = SimpleNamespace(disk_guard=SimpleNamespace(check=lambda _: {"admitted": True}))
                writes, original = [], module.atomic_write_text
                def write(*args):
                    writes.append(args)
                    if fail_at < 3 and len(writes) == fail_at:
                        raise OSError("receipt volume unavailable")
                    return original(*args)
                with patch.object(module, "atomic_write_text", side_effect=write), \
                        patch.object(module, "append_json_object", side_effect=OSError("history unavailable") if fail_at == 3 else module.append_json_object), \
                        patch.object(reason, "tick", return_value={"status": "spawned", "queued": 1}) as tick:
                    receipt = reason.checked_tick(host, api, lambda: None)
                self.assertEqual(tick.call_count, min(fail_at - 1, 1))
                self.assertEqual((receipt["status"], receipt["blockedOn"]),
                                 ("blocked", "receipt-history" if fail_at == 3 else "receipt-storage"))
                self.assertTrue(receipt["nextAction"])
                if fail_at == 2:
                    self.assertEqual(receipt["observedStatus"], "spawned")
                    self.assertEqual(json.loads((host.state / "reason-tick.json").read_text())["status"], "checking")
