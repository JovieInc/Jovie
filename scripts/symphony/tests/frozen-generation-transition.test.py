#!/usr/bin/env python3
"""Process-backed shadow service tests for frozen generation replacement."""

from __future__ import annotations

import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[3]
TARGET = ROOT / "scripts/symphony/symphony-frozen-generation-transition"
LOADER = SourceFileLoader("frozen_transition", str(TARGET))
SPEC = importlib.util.spec_from_file_location("frozen_transition", TARGET, loader=LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load {TARGET}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


FAKE_SYSTEMCTL = r'''#!/usr/bin/env python3
import json, os, pathlib, signal, subprocess, sys

state_path = pathlib.Path(os.environ["SHADOW_SYSTEMD_STATE"])

def load():
    return json.loads(state_path.read_text())

def save(value):
    temporary = state_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value))
    os.replace(temporary, state_path)

args = [arg for arg in sys.argv[1:] if arg != "--user"]
command = args.pop(0)
if command == "list-units":
    state = load()
    print("symphony-elixir.service loaded active running Official")
    print("symphony-lyb.service loaded active running Protected")
    if state.get("otherFrozen"):
        print("other.service loaded active running Other")
elif command == "show":
    service = args.pop(0)
    properties = [args[index + 1] for index, value in enumerate(args[:-1]) if value == "--property"]
    state = load()
    if service == "symphony-elixir.service":
        values = {
            "MainPID": str(state["mainPid"]), "InvocationID": state["invocationId"],
            "ControlGroup": state["controlGroup"], "FreezerState": state["freezerState"],
            "Restart": "always", "KillMode": "control-group", "RefuseManualStop": "yes",
            "ActiveState": "active",
        }
    elif service == "symphony-lyb.service":
        values = {"MainPID": str(state["protectedPid"]), "FreezerState": "running",
                  "ActiveState": "active", "ControlGroup": "/protected"}
    else:
        values = {"FreezerState": "frozen" if state.get("otherFrozen") else "running"}
    for prop in properties:
        print(f"{prop}={values[prop]}")
elif command == "kill":
    state = load()
    requested = next(value.split("=", 1)[1] for value in args if value.startswith("--signal="))
    signo = getattr(signal, "SIG" + requested)
    try:
        os.kill(state["mainPid"], signo)
    except ProcessLookupError:
        pass
elif command == "thaw":
    state = load()
    process = subprocess.Popen([os.environ["SHADOW_NEW_BINARY"]], cwd=os.environ["SHADOW_WORKSPACE"],
                               start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    state.update(mainPid=process.pid, invocationId="new-invocation", freezerState="running")
    save(state)
elif command == "freeze":
    state = load()
    try:
        os.kill(state["mainPid"], signal.SIGSTOP)
    except ProcessLookupError:
        pass
    state["freezerState"] = "frozen"
    save(state)
else:
    raise SystemExit(f"unsupported shadow command: {command}")
'''


OLD_WORKER = r'''#!/usr/bin/env python3
import os, pathlib, time
path = pathlib.Path(os.environ["SHADOW_OLD_MARKER"])
while True:
    with path.open("a") as handle:
        handle.write("old\n")
        handle.flush()
    time.sleep(0.02)
'''


NEW_WORKER = r'''#!/usr/bin/env python3
import os, pathlib, time
pathlib.Path(os.environ["SHADOW_NEW_MARKER"]).write_text("new\n")
while True:
    time.sleep(0.1)
'''


class FrozenTransitionShadowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.state_dir = self.home / ".local/state/symphony-elixir"
        self.provider_root = self.state_dir / "provider-generations"
        self.provider_root.mkdir(parents=True)
        self.workspace = self.root / "workspaces/JOV-1"
        self.workspace.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(self.workspace)], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "config", "user.name", "Test"], check=True)
        (self.workspace / "tracked.txt").write_text("preserved\n")
        (self.workspace / "session.checkpoint").write_text("session-1\n")
        subprocess.run(["git", "-C", str(self.workspace), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.workspace), "commit", "-qm", "fixture"], check=True)
        (self.workspace / "tracked.txt").write_text("preserved edit\n")

        self.old_marker = self.root / "old.log"
        self.new_marker = self.root / "new.log"
        self.old_binary = self.executable("old-worker", OLD_WORKER)
        self.new_binary = self.executable("new-worker", NEW_WORKER)
        self.installed_binary = self.home / ".local/bin/symphony"
        self.installed_binary.parent.mkdir(parents=True)
        self.installed_binary.write_bytes(self.old_binary.read_bytes())
        self.installed_binary.chmod(0o755)
        self.old_workflow = self.home / ".config/symphony/WORKFLOW.md"
        self.old_workflow.parent.mkdir(parents=True)
        self.old_workflow.write_text("old workflow\n")
        self.new_workflow = self.root / "new-WORKFLOW.md"
        self.new_workflow.write_text("new workflow\n")

        self.old_provider = self.provider_generation("old")
        self.new_provider = self.provider_generation("new")
        (self.provider_root / "current").symlink_to(self.old_provider)

        environment = {**os.environ, "SHADOW_OLD_MARKER": str(self.old_marker)}
        self.old_process = subprocess.Popen([sys.executable, str(self.old_binary)], cwd=self.workspace, env=environment, start_new_session=True)
        self.addCleanup(self.cleanup_process, self.old_process)
        for _ in range(100):
            if self.old_marker.exists():
                break
            if self.old_process.poll() is not None:
                self.fail(f"shadow old worker exited with {self.old_process.returncode}")
            time.sleep(0.02)
        self.assertTrue(self.old_marker.exists(), "shadow old worker never produced a heartbeat")
        os.kill(self.old_process.pid, signal.SIGSTOP)
        self.old_lines_at_freeze = self.old_marker.read_text().splitlines()

        self.control_group = "/user.slice/symphony-elixir.service"
        self.cgroup_root = self.root / "cgroup"
        cgroup = self.cgroup_root / self.control_group.lstrip("/")
        cgroup.mkdir(parents=True)
        (cgroup / "cgroup.procs").write_text(f"{self.old_process.pid}\n")
        self.proc_root = self.root / "proc"
        proc = self.proc_root / str(self.old_process.pid)
        proc.mkdir(parents=True)
        (proc / "cwd").symlink_to(self.workspace)
        (proc / "cmdline").write_bytes(str(self.old_binary).encode() + b"\0")

        self.systemd_state = self.root / "systemd-state.json"
        self.systemd_state.write_text(json.dumps({
            "mainPid": self.old_process.pid, "protectedPid": 424242,
            "invocationId": "old-invocation", "controlGroup": self.control_group,
            "freezerState": "frozen", "otherFrozen": False,
        }))
        self.fake_systemctl = self.executable("systemctl", FAKE_SYSTEMCTL)
        self.receipt = self.state_dir / "receipts/test.json"
        self.manifest = self.make_manifest()
        self.env_patch = mock.patch.dict(os.environ, {
            "SHADOW_SYSTEMD_STATE": str(self.systemd_state),
            "SHADOW_NEW_BINARY": str(self.installed_binary),
            "SHADOW_WORKSPACE": str(self.workspace),
            "SHADOW_NEW_MARKER": str(self.new_marker),
        })
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def executable(self, name: str, content: str) -> Path:
        path = self.root / name
        path.write_text(content)
        path.chmod(0o755)
        return path

    def provider_generation(self, version: str) -> Path:
        generation = self.provider_root / version
        generation.mkdir()
        hashes = {}
        for name in ("agent-router", "codex-router", "codex-probe", "cursor-adapter", "entry"):
            path = generation / name
            path.write_text(f"#!/bin/sh\necho {version}-{name}\n")
            path.chmod(0o755)
            hashes[name] = MODULE.digest(path)
        (generation / "manifest.json").write_text(json.dumps({"schema": MODULE.PROVIDER_SCHEMA, "sha256": hashes}))
        return generation

    def make_manifest(self) -> dict:
        return {
            "schema": MODULE.SCHEMA,
            "authorization": "explicit-maintenance-replacement",
            "service": MODULE.OFFICIAL_SERVICE,
            "protectedService": MODULE.PROTECTED_SERVICE,
            "protectedPid": 424242,
            "expected": {"mainPid": self.old_process.pid, "invocationId": "old-invocation", "controlGroup": self.control_group},
            "stateDir": str(self.state_dir),
            "targetHome": str(self.home),
            "receiptPath": str(self.receipt),
            "apiUrl": "http://127.0.0.1:4041/api/v1/state",
            "protectedApiUrl": "http://127.0.0.1:4042/api/v1/state",
            "timeoutSeconds": 5,
            "assets": [
                {"name": "binary", "source": str(self.new_binary), "destination": str(self.installed_binary), "sha256": MODULE.digest(self.new_binary), "mode": 0o755},
                {"name": "workflow", "source": str(self.new_workflow), "destination": str(self.old_workflow), "sha256": MODULE.digest(self.new_workflow), "mode": 0o644},
            ],
            "providerGeneration": str(self.new_provider),
            "workspaces": [{"issue": "JOV-1", "state": "running", "sessionId": "session-1", "path": str(self.workspace), "checkpointFiles": ["session.checkpoint"]}],
        }

    def kill_process(self, pid: int) -> None:
        try:
            os.kill(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass

    def cleanup_process(self, process: subprocess.Popen) -> None:
        self.kill_process(process.pid)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass

    def new_pid(self) -> int | None:
        state = json.loads(self.systemd_state.read_text())
        pid = int(state["mainPid"])
        return pid if pid != self.old_process.pid else None

    def run_transition(self):
        with mock.patch.object(MODULE, "json_health", return_value={"counts": {"running": 0}}):
            return MODULE.transition(self.manifest, systemctl=str(self.fake_systemctl), cgroup_root=self.cgroup_root, proc_root=self.proc_root)

    def test_shadow_service_never_resumes_old_generation_and_starts_new(self):
        receipt = self.run_transition()
        self.addCleanup(self.kill_process, receipt["new"]["mainPid"])
        for _ in range(100):
            if self.new_marker.exists():
                break
            time.sleep(0.02)
        self.assertEqual(self.old_marker.read_text().splitlines(), self.old_lines_at_freeze)
        self.assertTrue(self.new_marker.exists(), "shadow replacement never produced its start marker")
        self.assertEqual(self.new_marker.read_text(), "new\n")
        self.assertEqual(receipt["old"]["mainPid"], self.old_process.pid)
        self.assertNotEqual(receipt["new"]["mainPid"], self.old_process.pid)
        self.assertEqual(receipt["protected"]["mainPid"], 424242)
        self.assertEqual(self.installed_binary.read_bytes(), self.new_binary.read_bytes())
        self.assertEqual(self.old_workflow.read_text(), "new workflow\n")
        self.assertEqual((self.provider_root / "current").resolve(), self.new_provider.resolve())
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "succeeded")

    def test_other_frozen_user_service_refuses_before_asset_mutation(self):
        state = json.loads(self.systemd_state.read_text())
        state["otherFrozen"] = True
        self.systemd_state.write_text(json.dumps(state))
        before = self.installed_binary.read_bytes()
        with self.assertRaisesRegex(MODULE.TransitionError, "only frozen user service"):
            self.run_transition()
        self.assertEqual(self.installed_binary.read_bytes(), before)
        self.assertEqual((self.provider_root / "current").resolve(), self.old_provider.resolve())

    def test_protected_pid_drift_refuses_before_asset_mutation(self):
        self.manifest["protectedPid"] = 999
        with self.assertRaisesRegex(MODULE.TransitionError, "protected service identity drift"):
            self.run_transition()
        self.assertEqual(self.installed_binary.read_bytes(), self.old_binary.read_bytes())

    def test_target_scope_timeout_and_url_contracts_fail_closed(self):
        cases = [
            ({"stateDir": str(self.root)}, "stateDir is outside"),
            ({"receiptPath": str(self.root / "outside.json")}, "receiptPath is outside"),
            ({"timeoutSeconds": 4}, "timeoutSeconds"),
            ({"apiUrl": "http://127.0.0.1:9999/api/v1/state"}, "health URLs"),
            ({"expected": {**self.manifest["expected"], "mainPid": 1}}, "identity drift"),
        ]
        for update, message in cases:
            candidate = {**self.manifest, **update}
            with self.subTest(message=message), mock.patch.object(MODULE, "json_health", return_value={}), self.assertRaisesRegex(MODULE.TransitionError, message):
                MODULE.transition(candidate, systemctl=str(self.fake_systemctl), cgroup_root=self.cgroup_root, proc_root=self.proc_root)

    def test_provider_current_must_be_managed_symlink(self):
        current = self.provider_root / "current"
        current.unlink()
        current.write_text("unmanaged")
        with mock.patch.object(MODULE, "json_health", return_value={}), self.assertRaisesRegex(MODULE.TransitionError, "current pointer is not managed"):
            MODULE.transition(self.manifest, systemctl=str(self.fake_systemctl), cgroup_root=self.cgroup_root, proc_root=self.proc_root)

    def test_staged_hash_drift_rolls_back_and_leaves_service_frozen(self):
        self.manifest["assets"][0]["sha256"] = "0" * 64
        with self.assertRaisesRegex(MODULE.TransitionError, "staged asset hash mismatch"):
            self.run_transition()
        self.assertEqual(self.installed_binary.read_bytes(), self.old_binary.read_bytes())
        self.assertEqual(self.old_workflow.read_text(), "old workflow\n")
        self.assertEqual((self.provider_root / "current").resolve(), self.old_provider.resolve())
        self.assertEqual(json.loads(self.systemd_state.read_text())["freezerState"], "frozen")
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "failed-closed")

    def test_workspace_contract_rejects_incomplete_checkpoint_identity(self):
        valid = self.manifest["workspaces"][0]
        cases = [
            ([], "at least one"),
            ([{**valid, "issue": "bad"}], "issue identifier"),
            ([{**valid, "state": "paused"}], "state must"),
            ([{**valid, "sessionId": "bad session"}], "sessionId"),
            ([{**valid, "checkpointFiles": []}], "replay checkpoint is absent"),
            ([{**valid, "state": "preserved"}], "exactly one running"),
            ([{**valid, "checkpointFiles": ["../../new-WORKFLOW.md"]}], "checkpoint escapes"),
        ]
        for entries, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(MODULE.TransitionError, message):
                MODULE.workspace_snapshot(entries)

    def test_process_capture_requires_main_and_workspace_binding(self):
        cgroup = self.cgroup_root / self.control_group.lstrip("/") / "cgroup.procs"
        workspaces = MODULE.workspace_snapshot(self.manifest["workspaces"])
        cgroup.write_text("999\n")
        with self.assertRaisesRegex(MODULE.TransitionError, "MainPID"):
            MODULE.process_snapshot(self.control_group, self.cgroup_root, self.proc_root, workspaces, self.old_process.pid)
        unrelated = self.root / "unrelated"
        unrelated.mkdir()
        (self.proc_root / str(self.old_process.pid) / "cwd").unlink()
        (self.proc_root / str(self.old_process.pid) / "cwd").symlink_to(unrelated)
        cgroup.write_text(f"{self.old_process.pid}\n")
        with self.assertRaisesRegex(MODULE.TransitionError, "no service process"):
            MODULE.process_snapshot(self.control_group, self.cgroup_root, self.proc_root, workspaces, self.old_process.pid)

    def test_post_start_workspace_drift_rolls_back_and_refreezes(self):
        real_snapshot = MODULE.workspace_snapshot
        calls = 0

        def changed(entries):
            nonlocal calls
            calls += 1
            result = real_snapshot(entries)
            if calls == 2:
                result[0]["git"]["statusSha256"] = "f" * 64
            return result

        with mock.patch.object(MODULE, "workspace_snapshot", side_effect=changed), mock.patch.object(MODULE, "json_health", return_value={}):
            with self.assertRaisesRegex(MODULE.TransitionError, "workspace or checkpoint"):
                MODULE.transition(self.manifest, systemctl=str(self.fake_systemctl), cgroup_root=self.cgroup_root, proc_root=self.proc_root)
        pid = self.new_pid()
        if pid:
            self.addCleanup(self.kill_process, pid)
        self.assertEqual(self.installed_binary.read_bytes(), self.old_binary.read_bytes())
        self.assertEqual(self.old_workflow.read_text(), "old workflow\n")
        self.assertEqual((self.provider_root / "current").resolve(), self.old_provider.resolve())
        self.assertEqual(json.loads(self.systemd_state.read_text())["freezerState"], "frozen")
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "failed-closed")


class ManifestAndProviderValidationTest(unittest.TestCase):
    def test_manifest_rejects_missing_explicit_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps({"schema": MODULE.SCHEMA, "service": MODULE.OFFICIAL_SERVICE, "protectedService": MODULE.PROTECTED_SERVICE}))
            with self.assertRaisesRegex(MODULE.TransitionError, "authorization"):
                MODULE.load_manifest(path)

    def test_provider_rejects_symlink_member(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generation = root / "generation"
            generation.mkdir()
            target = root / "target"
            target.write_text("x")
            (generation / "agent-router").symlink_to(target)
            (generation / "manifest.json").write_text(json.dumps({"schema": MODULE.PROVIDER_SCHEMA, "sha256": {}}))
            with self.assertRaisesRegex(MODULE.TransitionError, "member is invalid"):
                MODULE.verify_provider_generation(generation, root)

    def test_provider_rejects_outside_invalid_manifest_and_hash_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            managed = base / "managed"
            managed.mkdir()
            outside = base / "outside"
            outside.mkdir()
            with self.assertRaisesRegex(MODULE.TransitionError, "outside its managed store"):
                MODULE.verify_provider_generation(outside, managed)

            generation = managed / "generation"
            generation.mkdir()
            (generation / "manifest.json").write_text("not-json")
            with self.assertRaisesRegex(MODULE.TransitionError, "invalid provider manifest"):
                MODULE.verify_provider_generation(generation, managed)

            (generation / "manifest.json").write_text(json.dumps({"schema": "wrong", "sha256": {}}))
            with self.assertRaisesRegex(MODULE.TransitionError, "schema is invalid"):
                MODULE.verify_provider_generation(generation, managed)

            hashes = {}
            for name in ("agent-router", "codex-router", "codex-probe", "cursor-adapter", "entry"):
                member = generation / name
                member.write_text("#!/bin/sh\n")
                member.chmod(0o755)
                hashes[name] = "0" * 64
            (generation / "manifest.json").write_text(json.dumps({"schema": MODULE.PROVIDER_SCHEMA, "sha256": hashes}))
            with self.assertRaisesRegex(MODULE.TransitionError, "hash mismatch"):
                MODULE.verify_provider_generation(generation, managed)


if __name__ == "__main__":
    unittest.main()
