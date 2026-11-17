"""Failure-path and custody regressions for Linux lane resource scopes."""
from __future__ import annotations
import contextlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import worker_resources as resources
import lane_runner as lane

UNIT = "jovie-lane-codex-" + "a" * 32 + ".scope"


class WorkerResourceTest(unittest.TestCase):
    def test_defaults_allow_two_eight_gib_forks_and_remain_finite(self):
        limits = resources.limits_from_env({})
        self.assertGreater(limits["memoryMax"], 16 * resources.GIB)
        self.assertLess(limits["memoryHigh"], limits["memoryMax"])
        self.assertEqual(limits["memorySwapMax"], 0)
        self.assertEqual(limits["tasksMax"], 512)

    def test_explicit_resource_configuration_fails_closed(self):
        self.assertEqual(resources.limits_from_env({"LANES_WORKER_CPU_PERCENT": "300"})["cpuPercent"], 300)
        for value in ("0", "-1", "max", "infinity", "1.2", ""):
            with self.subTest(value=value), self.assertRaises(resources.ResourceHeld):
                resources.limits_from_env({"LANES_WORKER_TASKS_MAX": value})
        with self.assertRaises(resources.ResourceHeld):
            resources.limits_from_env({"LANES_WORKER_MEMORY_HIGH_BYTES": str(30 * resources.GIB)})

    def cgroup(self, root):
        group = root / "user.slice" / UNIT
        group.mkdir(parents=True)
        limits = resources.DEFAULT_LIMITS
        for filename, key in (("memory.max", "memoryMax"), ("memory.high", "memoryHigh"),
                              ("memory.swap.max", "memorySwapMax"), ("pids.max", "tasksMax")):
            (group / filename).write_text(str(limits[key]))
        (group / "cpu.max").write_text("200000 100000")
        proc = root / "proc-cgroup"
        proc.write_text("0::/user.slice/" + UNIT + "\n")
        return group, proc

    def test_receipt_uses_actual_kernel_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            group, proc = self.cgroup(root)
            receipt = resources.observed_limits(UNIT, resources.DEFAULT_LIMITS,
                                                proc_cgroup=proc, cgroup_root=root)
            self.assertEqual(receipt["limits"], resources.DEFAULT_LIMITS)
            self.assertEqual(receipt["cgroup"], "/user.slice/" + UNIT)
            self.assertEqual(receipt["workerPid"], os.getpid())
            self.assertTrue(receipt["ok"])

    def test_wrong_missing_or_unbounded_kernel_limits_refuse_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            group, proc = self.cgroup(root)
            for filename, bad in (("memory.max", "max"), ("memory.high", "1"),
                                   ("memory.swap.max", "max"), ("pids.max", "max"),
                                   ("cpu.max", "max 100000"), ("cpu.max", "100000 100000"),
                                   ("cpu.max", "200000 0")):
                original = (group / filename).read_text()
                with self.subTest(file=filename, value=bad), self.assertRaises(resources.ResourceHeld):
                    (group / filename).write_text(bad)
                    resources.observed_limits(UNIT, resources.DEFAULT_LIMITS, proc_cgroup=proc, cgroup_root=root)
                (group / filename).write_text(original)
            for line in ("1:memory:/legacy\n", "0::/other.scope\n", "0::/../" + UNIT + "\n"):
                with self.subTest(line=line), self.assertRaises(resources.ResourceHeld):
                    proc.write_text(line)
                    resources.observed_limits(UNIT, resources.DEFAULT_LIMITS, proc_cgroup=proc, cgroup_root=root)
            with self.assertRaises(resources.ResourceHeld):
                resources.observed_limits("other.scope", resources.DEFAULT_LIMITS, proc_cgroup=proc, cgroup_root=root)

    def test_scope_preserves_auth_environment_and_all_lock_descriptors(self):
        calls = []
        with tempfile.TemporaryFile() as lock:
            def popen(command, **kwargs):
                calls.append((command, kwargs))
                self.assertIn(lock.fileno(), kwargs["pass_fds"])
                fd = int(command[command.index("--receipt-fd") + 1])
                unit = command[command.index("--unit") + 1]
                limits = json.loads(command[command.index("--limits") + 1])
                receipt = {"schema": resources.SCHEMA, "ok": True, "unit": unit, "limits": limits}
                os.write(fd, (json.dumps(receipt) + "\n").encode())
            env = {"PATH": "/fixture/bin", "CODEX_HOME": "/fixture/auth", "LANES_LIFECYCLE_FD": str(lock.fileno()),
                   "LITERAL": "$unchanged"}
            with patch.object(resources.subprocess, "Popen", side_effect=popen), \
                    patch.object(resources.sys, "platform", "linux"):
                receipt = resources.spawn(["python3", "lane_runner.py", "worker", "--provider", "codex"],
                                          provider="codex", env=env, pass_fds=(lock.fileno(),),
                                          start_new_session=True)
            command, kwargs = calls[0]
            self.assertEqual(len(calls), 1)
            self.assertEqual(kwargs["env"], env)
            self.assertIn("--scope", command)
            self.assertIn("--expand-environment=no", command)
            self.assertIn("--property=MemorySwapMax=0", command)
            self.assertTrue(receipt["ok"])
            os.fstat(lock.fileno())

    def test_missing_systemd_never_retries_unbounded(self):
        with patch.object(resources.sys, "platform", "linux"), \
                patch.object(resources.subprocess, "Popen", side_effect=FileNotFoundError("systemd-run")) as spawn, \
                patch.object(resources.subprocess, "run") as stop, self.assertRaises(resources.ResourceHeld):
            resources.spawn(["worker"], provider="codex", env={})
        self.assertEqual(spawn.call_count, 1)
        self.assertEqual(spawn.call_args.args[0][0], "systemd-run")
        stop.assert_not_called()

    def test_failed_start_stops_only_its_generated_scope(self):
        for cleanup_failure in (False, True):
            with self.subTest(cleanup_failure=cleanup_failure), \
                    patch.object(resources.sys, "platform", "linux"), \
                    patch.object(resources.subprocess, "Popen") as spawn, \
                    patch.object(resources, "receive_receipt", side_effect=resources.ResourceHeld("timeout")), \
                    patch.object(resources.subprocess, "run", side_effect=OSError() if cleanup_failure else None) as stop, \
                    self.assertRaises(resources.ResourceHeld):
                resources.spawn(["worker"], provider="codex", env={})
            self.assertEqual(spawn.call_count, 1)
            unit_arg = next(a for a in spawn.call_args.args[0] if a.startswith("--unit="))
            self.assertEqual(stop.call_args.args[0], ["systemctl", "--user", "stop", unit_arg.split("=", 1)[1]])

    def test_receipt_cannot_substitute_another_scope(self):
        with patch.object(resources.sys, "platform", "linux"), \
                patch.object(resources.subprocess, "Popen") as spawn, \
                patch.object(resources, "receive_receipt", return_value={"unit": "other.scope"}), \
                patch.object(resources.subprocess, "run"), self.assertRaises(resources.ResourceHeld):
            resources.spawn(["worker"], provider="codex", env={})
        self.assertEqual(spawn.call_count, 1)

    def test_invalid_provider_never_spawns(self):
        with patch.object(resources.sys, "platform", "linux"), \
                patch.object(resources.subprocess, "Popen") as spawn, self.assertRaises(resources.ResourceHeld):
            resources.spawn(["worker"], provider="../../other", env={})
        spawn.assert_not_called()

    def test_local_test_and_non_linux_preserve_existing_dispatch(self):
        for platform, env in (("linux", {"LANES_EXECUTION_BACKEND": "local-test"}), ("darwin", {})):
            with self.subTest(platform=platform), patch.object(resources.sys, "platform", platform), \
                    patch.object(resources.subprocess, "Popen") as spawn:
                receipt = resources.spawn(["worker"], provider="codex", env=env)
            self.assertEqual(spawn.call_args.args[0], ["worker"])
            self.assertIn(receipt["mode"], ("local-test", "non-linux"))

    def test_receipt_parser_refuses_invalid_failed_oversized_and_eof(self):
        for payload in (b"garbage\n", b"[]\n", b'{"schema":"wrong","ok":true}\n', b"x" * 4100, b""):
            with self.subTest(payload=payload[:30]):
                read, write = os.pipe()
                try:
                    os.write(write, payload)
                    os.close(write)
                    with self.assertRaises(resources.ResourceHeld):
                        resources.receive_receipt(read, timeout=.05)
                finally:
                    os.close(read)
        read, write = os.pipe()
        try:
            with self.assertRaises(resources.ResourceHeld):
                resources.receive_receipt(read, timeout=.001)
        finally:
            os.close(read)
            os.close(write)

    def test_child_verifies_before_exec_and_keeps_auth_env(self):
        read, write = os.pipe()
        receipt = {"schema": resources.SCHEMA, "ok": True, "unit": UNIT}
        try:
            with patch.object(resources, "observed_limits", return_value=receipt) as verify, \
                    patch.object(resources.os, "execvpe") as execute:
                code = resources.main(["--unit", UNIT, "--receipt-fd", str(write), "--limits", "{}", "--", "worker", "$literal"])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(os.read(read, 4096)), receipt)
            verify.assert_called_once()
            self.assertEqual(execute.call_args.args, ("worker", ["worker", "$literal"], os.environ))
        finally:
            os.close(read)

    def test_child_refuses_unverified_limits_and_invalid_command(self):
        with patch.object(resources, "observed_limits", side_effect=resources.ResourceHeld("mismatch")), \
                patch.object(resources.os, "execvpe") as execute:
            self.assertEqual(resources.main(["--unit", UNIT, "--receipt-fd", "99", "--limits", "{}", "--", "worker"]), 78)
            self.assertEqual(resources.main(["--unit", UNIT, "--receipt-fd", "1", "--limits", "{}"]), 78)
        execute.assert_not_called()


class ResourceDispatchHermeticTest(unittest.TestCase):
    def test_escalation_reconcile_stays_hermetic_inside_the_release_selftest(self):
        """JOV-10343: the reconcile's one budgeted gh read must never run inside a release self-test.
        LANES_SELFTEST is that guard. This sets the marker and drops the local-test backend so the
        assertion pins the marker even when a reconcile is due."""
        # 21 context managers in one with exceed Python's 20-block limit.
        with contextlib.ExitStack() as stack:
            tmp = stack.enter_context(tempfile.TemporaryDirectory())
            stack.enter_context(patch.dict(os.environ, {
                "SYMPHONY_AUTOSCALE": "off",
                "LANES_SELFTEST": "1",
                "LANES_EXECUTION_BACKEND": "",
            }))
            for target, name, kwargs in (
                (lane.autoscale, "mode", {"return_value": "off"}),
                (lane.disk_guard, "check", {"return_value": {"freePct": 50, "admitted": True}}),
                (lane.worktree_sweep, "maybe_spawn", {"return_value": "not-due"}),
                (lane, "ensure_full_history", {}),
                (lane, "load_providers", {"return_value": {"codex": {"slots": 1}}}),
                (lane, "provider_healthy", {"return_value": True}),
                (lane, "claim_remediation_events", {"return_value": {}}),
                (lane, "collect_shipping_origin", {"return_value": {}}),
                (lane, "Linear", {"side_effect": SystemExit("no LINEAR_API_KEY")}),
                (lane.linear_sync, "tick", {"return_value": {}}),
                (lane.macos_pool, "sample", {"return_value": {}}),
                (lane.epics, "reconcile", {"return_value": {}}),
                (lane.pr_events, "tick", {"return_value": {}}),
                (lane.reason_lane, "tick", {"return_value": {}}),
                (lane.continuity_clock, "tick", {"return_value": {"status": "current"}}),
                (lane.doctor, "run", {"return_value": {}}),
                (lane.escalation_reconcile, "due", {"return_value": True}),
            ):
                stack.enter_context(patch.object(target, name, **kwargs))
            probe = stack.enter_context(patch.object(
                lane.escalation_reconcile, "fetch_labeled",
                side_effect=AssertionError("self-test leak")))
            spawn = stack.enter_context(patch.object(lane.subprocess, "Popen"))

            def observed_scope(_fd):
                # Popen is synthetic: provide its exact scope's startup receipt
                # rather than waiting for a kernel child that cannot exist.
                command = spawn.call_args.args[0]
                self.assertEqual(command[0], "systemd-run")
                return {"schema": lane.worker_resources.SCHEMA, "ok": True,
                        "unit": command[command.index("--unit") + 1],
                        "limits": json.loads(command[command.index("--limits") + 1])}

            stack.enter_context(patch.object(lane.worker_resources, "receive_receipt",
                                            side_effect=observed_scope))
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            self.assertEqual(lane.dispatch(host), 0)
            probe.assert_not_called()
            self.assertEqual(spawn.call_count, 1)
            tick = json.loads((host.state / "tick.json").read_text())
            self.assertEqual(tick["spawned"], ["codex"])
            self.assertTrue(tick["workerResources"][0]["ok"])


if __name__ == "__main__":
    unittest.main()
