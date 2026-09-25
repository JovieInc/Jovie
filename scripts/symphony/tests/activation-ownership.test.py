#!/usr/bin/env python3
"""Execute the real activation entry with isolated ownership and mutator fixtures."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "scripts/symphony/symphony_official_runtime.py"
UNIT = ROOT / "scripts/symphony/systemd/symphony-elixir.service"
SPEC = importlib.util.spec_from_file_location("symphony_official_runtime", HELPER)
H = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = H
SPEC.loader.exec_module(H)


class ActivationOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name).resolve()
        self.unit = self.home / ".config/systemd/user/symphony-elixir.service"
        self.unit.parent.mkdir(parents=True)
        self.unit.write_bytes(UNIT.read_bytes())
        self.dropins = self.unit.with_name(self.unit.name + ".d")
        self.dropins.mkdir()
        self.proc = self.home / "proc"
        self.events = self.home / "mutations"
        self.state = self.home / "ownership.json"
        self.bin = self.home / "bin"
        self.bin.mkdir()
        self.argv = shlex.split(next(line.split("=", 1)[1] for line in UNIT.read_text().splitlines()
                                     if line.startswith("ExecStart=")))
        self.argv = [part.replace("%h", str(self.home)) for part in self.argv]
        self.fields = dict(Id="symphony-elixir.service", LoadState="loaded", ActiveState="inactive",
                           SubState="dead", MainPID="0", ControlPID="0", InvocationID="",
                           ControlGroup="", NeedDaemonReload="no", Transient="no", SourcePath="",
                           FragmentPath=str(self.unit), DropInPaths="")
        self.properties = {
            "ExecStartEx": {"type": "a(sasasttttuii)", "data": [[self.argv[0], self.argv, [], 0, 0, 0, 0, 0, 0, 0]]},
            **{name: {"type": "a(sasasttttuii)", "data": []} for name in
               ("ExecStartPreEx", "ExecStartPostEx", "ExecConditionEx", "ExecReloadEx", "ExecStopEx", "ExecStopPostEx")},
            "Type": {"type": "s", "data": "simple"},
            "WorkingDirectory": {"type": "s", "data": str(self.home)},
            "Environment": {"type": "as", "data": ["HOME=" + str(self.home),
                "PATH=" + str(self.home) + "/.local/bin:" + str(self.home) + "/.hermes/bin:" + str(self.home) + "/.npm-global/bin:/usr/bin:/bin"]},
            "EnvironmentFiles": {"type": "a(sb)", "data": [
                [str(self.home / ".config/symphony/codex-account.env"), False],
                [str(self.home / ".config/symphony/linear.env"), True]]},
        }
        self.write_executable("systemctl", r"""import json, os, sys
from pathlib import Path
state=json.loads(Path(os.environ['OWNERSHIP_FIXTURE']).read_text())
if sys.argv[1:3] == ['--user', 'show']:
    print('\n'.join(key+'='+value for key,value in state['fields'].items()))
else:
    with open(os.environ['MUTATIONS'], 'a') as out: out.write('systemctl:'+str(sys.argv[1:])+'\n')
""")
        self.write_executable("busctl", r"""import json, os, sys
from pathlib import Path
state=json.loads(Path(os.environ['OWNERSHIP_FIXTURE']).read_text())
assert sys.argv[1:4] == ['--user', '--json=short', 'get-property']
for name in sys.argv[7:]: print(json.dumps(state['properties'][name]))
""")
        for name in ("bash", "install"):
            self.write_executable(name, "import os,sys\nwith open(os.environ['MUTATIONS'], 'a') as out: out.write(" + repr(name + ":") + "+str(sys.argv[1:])+'\\n')\n")
        # Trace the real child helper for the existing runtime CI coverage merger.
        self.write_executable("python3", """import json, os, pathlib, runpy, sys, trace
args=[arg for arg in sys.argv[1:] if arg != '-B']
if not os.environ.get('SYMPHONY_RUNTIME_COVERAGE_DIR'):
    os.execv(sys.executable, [sys.executable, '-B', *args])
sys.argv=args
tracer=trace.Trace(count=True, trace=False)
try: tracer.runfunc(runpy.run_path, args[0], run_name='__main__')
finally:
    rows=[[file,line,count] for (file,line),count in tracer.results().counts.items()]
    pathlib.Path(os.environ['SYMPHONY_RUNTIME_COVERAGE_DIR'],str(os.getpid())+'.json').write_text(json.dumps(rows))
""")

    def write_executable(self, name, body):
        path = self.bin / name
        path.write_text("#!" + sys.executable + "\n" + body)
        path.chmod(0o755)

    def entry(self, extra_env=None):
        self.state.write_text(json.dumps(dict(fields=self.fields, properties=self.properties)))
        workflow = (ROOT / ".github/workflows/gem-delivery-controller-activation.yml").read_text()
        step = workflow.split("- name: Install and attest the exact controller configuration\n", 1)[1].split("\n      - name:", 1)[0]
        script = textwrap.dedent(step.split("        run: |\n", 1)[1])
        env = {**os.environ, "HOME": str(self.home), "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
               "OWNERSHIP_FIXTURE": str(self.state), "MUTATIONS": str(self.events),
               "GITHUB_WORKSPACE": str(ROOT), "GEM_CONTROLLER_EXPECTED_REVISION": "a" * 40,
               "GITHUB_OUTPUT": str(self.home / "github-output"),
               "GEM_UPSTREAM_PRESERVATION_BINDING": "", "GEM_UPSTREAM_PRESERVATION_BINDING_SHA256": ""}
        env.update(extra_env or {})
        return subprocess.run(["/bin/bash", "-c", script], cwd=ROOT, env=env, capture_output=True, text=True, timeout=15)

    def test_actual_entry_holds_upstream_and_unknown_before_every_mutator(self):
        baseline = copy.deepcopy(self.properties)
        for active in (False, True):
            for mode in ("upstream", "unknown", "stale", "unloaded"):
                with self.subTest(active=active, mode=mode):
                    self.properties = copy.deepcopy(baseline)
                    self.events.unlink(missing_ok=True)
                    self.fields.update(NeedDaemonReload="no", LoadState="loaded", InvocationID="a" * 32 if active else "",
                                       ControlGroup="/user.slice/symphony-elixir.service" if active else "")
                    self.fields.update(ActiveState="active" if active else "inactive",
                                       SubState="running" if active else "dead", MainPID="123" if active else "0")
                    original = copy.deepcopy(self.properties)
                    if mode == "upstream":
                        self.properties["ExecStartEx"]["data"][0][0:2] = ["/immutable/upstream/symphony", ["/immutable/upstream/symphony", "WORKFLOW.md"]]
                    elif mode == "unknown": self.properties["ExecStartEx"]["data"] = []
                    elif mode == "stale": self.fields["NeedDaemonReload"] = "yes"
                    else: self.fields["LoadState"] = "not-found"
                    before = self.unit.read_bytes()
                    result = self.entry()
                    self.assertEqual(result.returncode, 76, result.stderr + result.stdout)
                    self.assertEqual(self.unit.read_bytes(), before)
                    self.assertFalse((self.home / ".local").exists())
                    self.assertFalse(self.events.exists(), self.events.read_text() if self.events.exists() else "")
                    self.assertNotIn("/immutable/upstream", result.stdout + result.stderr)
                    self.properties = original
                    self.fields.update(NeedDaemonReload="no", LoadState="loaded")

    def test_actual_entry_preserves_supported_inactive_managed_path(self):
        result = self.entry()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        events = self.events.read_text()
        self.assertIn("--prepare-stop-guard", events)
        self.assertIn("--provider-runtime-only", events)
        self.assertIn("--managed-controller-only", events)
        self.assertIn("daemon-reload", events)
        self.assertNotIn("healthy", result.stdout)

    def test_classification_retains_legacy_guard_and_requires_approved_upstream_evidence(self):
        import emit_gem_service_attestation as E
        with mock.patch.object(H, "activation_ownership_preflight", return_value={"allowed": True}):
            self.assertEqual(H.activation_classification(ROOT, None, None)["mode"], "canonical-managed")
        with mock.patch.object(H, "activation_ownership_preflight", return_value={"allowed": False}):
            self.assertEqual(H.activation_classification(ROOT, None, None)["mode"], "held")
            with mock.patch.object(E, "observe_upstream_preservation", return_value={"mode": "upstream-preserved"}):
                self.assertEqual(H.activation_classification(ROOT, "/binding", "a" * 64)["mode"], "upstream-preserved")
            with mock.patch.object(E, "observe_upstream_preservation", side_effect=ValueError("fixture")):
                self.assertEqual(H.activation_classification(ROOT, "/binding", "a" * 64)["mode"], "held")


    def observe(self):
        self.state.write_text(json.dumps(dict(fields=self.fields, properties=self.properties)))
        env = {"PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
               "OWNERSHIP_FIXTURE": str(self.state), "MUTATIONS": str(self.events)}
        with mock.patch.dict(os.environ, env):
            result = H.activation_ownership_preflight(ROOT, home=self.home, proc_root=self.proc)
        self.assertFalse(self.events.exists())
        return result

    def active_process(self):
        self.fields.update(ActiveState="active", SubState="running", MainPID="123",
                           InvocationID="a" * 32, ControlGroup="/user.slice/symphony-elixir.service")
        process = self.proc / "123"
        process.mkdir(parents=True)
        (process / "cmdline").write_bytes(("python3\0" + "\0".join(self.argv) + "\0").encode())
        (process / "cgroup").write_text("0::" + self.fields["ControlGroup"] + "\n")
        (process / "stat").write_text("123 (python3) S " + "0 " * 18 + "99 0\n")
        return process

    def test_active_process_must_match_loaded_command_and_generation(self):
        process = self.active_process()
        self.assertTrue(self.observe()["allowed"])
        original = (process / "cmdline").read_bytes()
        (process / "cmdline").write_bytes(b"/immutable/upstream/symphony\0WORKFLOW.md\0")
        self.assertFalse(self.observe()["allowed"])
        (process / "cmdline").write_bytes(original)
        (process / "cgroup").write_text("0::/other.service\n")
        self.assertFalse(self.observe()["allowed"])
        (process / "cgroup").write_text("0::" + self.fields["ControlGroup"] + "\n")
        (process / "stat").write_text("malformed")
        self.assertFalse(self.observe()["allowed"])

    def test_loaded_dropins_require_exact_supported_source_and_inventory(self):
        path = self.dropins / "90-symphony-safe-restart-guard.conf"
        expected = (ROOT / "scripts/symphony/systemd/symphony-elixir.service.d" / path.name).read_bytes()
        path.write_bytes(expected)
        self.fields["DropInPaths"] = str(path)
        self.assertTrue(self.observe()["allowed"])
        path.write_bytes(expected + b"# changed\n")
        self.assertFalse(self.observe()["allowed"])
        path.write_bytes(expected)
        unknown = self.dropins / "zz-upstream.conf"
        unknown.write_text("[Service]\nExecStart=/upstream\n")
        self.assertFalse(self.observe()["allowed"])  # present on disk, absent from loaded inventory
        self.fields["DropInPaths"] += " " + str(unknown)
        self.assertFalse(self.observe()["allowed"])
        unknown.unlink()
        self.fields["DropInPaths"] = str(path) + " " + str(path)
        self.assertFalse(self.observe()["allowed"])

    def test_absent_dropin_directory_is_supported_but_dangling_link_is_not(self):
        self.dropins.rmdir()
        self.assertTrue(self.observe()["allowed"])
        self.dropins.symlink_to(self.home / "not-created-yet")
        self.assertFalse(self.observe()["allowed"])

    def test_workspace_dropin_requires_effective_prestart_agreement(self):
        path = self.dropins / "workspace-mounts.conf"
        path.write_bytes((ROOT / "scripts/symphony/systemd/symphony-elixir.service.d" / path.name).read_bytes())
        self.fields["DropInPaths"] = str(path)
        self.assertFalse(self.observe()["allowed"])
        command = ["/usr/bin/sudo", "-n", "/usr/local/sbin/jovie-symphony-workspace", "restore-all"]
        self.properties["ExecStartPreEx"]["data"] = [[command[0], command, [], 0, 0, 0, 0, 0, 0, 0]]
        self.assertTrue(self.observe()["allowed"])

    def test_older_unit_symlink_and_special_file_remain_held(self):
        original = self.unit.read_bytes()
        self.unit.write_bytes(original + b"# older legitimate generation\n")
        self.assertFalse(self.observe()["allowed"])
        self.unit.unlink()
        self.unit.symlink_to(UNIT)
        self.assertFalse(self.observe()["allowed"])
        self.unit.unlink()
        os.mkfifo(self.unit)
        self.assertFalse(self.observe()["allowed"])

    def test_malformed_effective_properties_and_flags_fail_closed(self):
        baseline = copy.deepcopy(self.properties)
        cases = [
            ("ExecStartEx", {"type": "wrong", "data": []}),
            ("ExecStartEx", {"type": "a(sasasttttuii)", "data": None}),
            ("ExecStartEx", {"type": "a(sasasttttuii)", "data": [["SECRET-sentinel", [], []]]}),
            ("Type", {"type": "s", "data": "oneshot"}),
            ("WorkingDirectory", {"type": "s", "data": "/other"}),
            ("Environment", {"type": "as", "data": ["SECRET-sentinel"]}),
            ("EnvironmentFiles", {"type": "a(sb)", "data": []}),
        ]
        for name, value in cases:
            with self.subTest(name=name, value=value):
                self.properties = copy.deepcopy(baseline)
                self.properties[name] = value
                result = self.observe()
                self.assertFalse(result["allowed"])
                self.assertNotIn("SECRET-sentinel", json.dumps(result))
        self.properties = copy.deepcopy(baseline)
        self.properties["ExecStartEx"]["data"][0][2] = ["ignore-failure"]
        self.assertFalse(self.observe()["allowed"])
        self.properties = copy.deepcopy(baseline)
        self.properties["EnvironmentFiles"]["data"][0][1] = 0
        self.assertFalse(self.observe()["allowed"])

    def test_missing_ambiguous_and_transient_ownership_fails_closed(self):
        baseline = dict(self.fields)
        for key, value in (("Id", "other.service"), ("Transient", "yes"), ("SourcePath", "/generated"),
                           ("ControlPID", "12"), ("ActiveState", "activating"), ("MainPID", "false"),
                           ("MainPID", "001"), ("MainPID", "1"), ("FragmentPath", "/other")):
            with self.subTest(key=key):
                self.fields = {**baseline, key: value}
                self.assertFalse(self.observe()["allowed"])
        self.fields = dict(baseline)
        del self.fields["NeedDaemonReload"]
        self.assertFalse(self.observe()["allowed"])

    def test_read_failures_and_incomplete_typed_output_hold_without_diagnostics_leaks(self):
        self.write_executable("busctl", "raise SystemExit('SECRET-sentinel')\n")
        result = self.entry()
        self.assertEqual(result.returncode, 76)
        self.assertNotIn("SECRET-sentinel", result.stdout + result.stderr)
        self.assertFalse(self.events.exists())
        self.write_executable("busctl", "print('not json')\n")
        self.assertFalse(self.observe()["allowed"])
        self.write_executable("systemctl", "print('Id=symphony-elixir.service\\nId=other')\n")
        self.assertFalse(self.observe()["allowed"])

    def test_changed_or_stale_observation_never_authorizes_mutation(self):
        original = H._activation_snapshot
        count = 0
        def changed():
            nonlocal count
            count += 1
            fields, effective = original()
            if count == 2:
                fields["NeedDaemonReload"] = "yes"
            return fields, effective
        with mock.patch.object(H, "_activation_snapshot", side_effect=changed):
            self.assertFalse(self.observe()["allowed"])
        with mock.patch.object(H.time, "monotonic", side_effect=[0, 16]):
            self.assertFalse(self.observe()["allowed"])
        process = self.active_process()
        count = 0
        def changed_process():
            nonlocal count
            count += 1
            result = original()
            if count == 2:
                (process / "stat").write_text("123 (python3) S " + "0 " * 18 + "100 0\n")
            return result
        with mock.patch.object(H, "_activation_snapshot", side_effect=changed_process):
            self.assertFalse(self.observe()["allowed"])


if __name__ == "__main__":
    unittest.main()
