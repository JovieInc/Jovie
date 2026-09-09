#!/usr/bin/env python3
"""Execute the real restart helper against an isolated user-systemd fixture."""
import contextlib
import io
import json
import os
import shlex
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "scripts/symphony/symphony-elixir-safe-restart"
GUARD_SOURCE = HELPER.read_text().split("<<'GUARD_PY'\n", 1)[1].split("\nGUARD_PY", 1)[0]
GUARD_FILENAME = str(HELPER) + ":stop_guard"
PRODUCTION_LEASE = 'exec 9>"/run/user/$(id -u)/symphony-elixir-safe-restart.lock"'

class GuardFileTests(unittest.TestCase):
    def test_production_lease_is_fixed_before_all_modes(self):
        source = HELPER.read_text()
        self.assertEqual(source.count(PRODUCTION_LEASE), 1)
        self.assertNotIn("XDG_RUNTIME_DIR", source)
        self.assertLess(source.index(PRODUCTION_LEASE), source.index('if [[ -n "$maintenance_manifest" ]]'))

    def test_actual_guard_writer_preserves_foreign_files_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            unit = home / ".config/systemd/user/symphony-elixir.service"
            unit.parent.mkdir(parents=True)
            unit.write_text("[Unit]\nDescription=fixture\n")
            directory = unit.with_name(unit.name + ".d")
            guard = directory / "90-symphony-safe-restart-guard.conf"
            def execute():
                with mock.patch.dict(os.environ, HOME=str(home)), contextlib.redirect_stdout(io.StringIO()):
                    exec(compile(GUARD_SOURCE, GUARD_FILENAME, "exec"), {"__file__": GUARD_FILENAME})
            execute()
            self.assertEqual(guard.read_text(), "[Unit]\nRefuseManualStop=yes\n")
            self.assertEqual(guard.stat().st_mode & 0o777, 0o644)
            before = guard.stat().st_ino
            execute()
            self.assertEqual(guard.stat().st_ino, before)
            guard.write_text("foreign")
            with self.assertRaises(SystemExit): execute()
            self.assertEqual(guard.read_text(), "foreign")
            guard.unlink()
            guard.symlink_to(unit)
            with self.assertRaises(SystemExit): execute()
            guard.unlink()
            unit.unlink()
            with self.assertRaises(SystemExit): execute()

@unittest.skipUnless(shutil.which("flock"), "requires real Linux flock")
class StopGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.bin = self.home / "bin"
        self.bin.mkdir()
        self.runtime = self.home / "run"
        self.runtime.mkdir()
        # Only the fixture copy relocates the fixed per-UID lease. Production
        # has no environment override that can split service serialization.
        source = HELPER.read_text()
        self.assertEqual(source.count(PRODUCTION_LEASE), 1)
        self.fixture_helper = self.home / "safe-restart"
        self.fixture_helper.write_text(source.replace(PRODUCTION_LEASE,
            "exec 9>" + shlex.quote(str(self.runtime / "symphony-elixir-safe-restart.lock"))))
        self.unit = self.home / ".config/systemd/user/symphony-elixir.service"
        self.unit.parent.mkdir(parents=True)
        self.unit.write_text("[Unit]\nDescription=fixture\n[Service]\nRestart=always\n")
        self.guard = self.unit.with_name(self.unit.name + ".d") / "90-symphony-safe-restart-guard.conf"
        self.events = self.home / "events"
        self.write("systemctl", r"""#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:]
home=Path(os.environ['HOME'])
with open(os.environ['EVENTS'], 'a') as f:f.write(json.dumps(args)+'\n')
if 'daemon-reload' in args:
    (home/'reloaded').touch()
    raise SystemExit(int(os.environ.get('RELOAD_FAIL','0')))
if 'show' in args:
    key=args[args.index('-p')+1]
    values={'MainPID':'123','InvocationID':'a'*32,'FragmentPath':str(home/'.config/systemd/user/symphony-elixir.service')}
    if key=='RefuseManualStop':
        print('yes' if (home/'.config/systemd/user/symphony-elixir.service.d/90-symphony-safe-restart-guard.conf').exists() and not os.environ.get('GUARD_DENIED') else 'no')
    elif key=='MainPID' and os.environ.get('PID_DRIFT') and (home/'reloaded').exists():print('456')
    else: print(values[key])
    raise SystemExit(0)
raise SystemExit(99)
""")
        self.write("curl", "#!/usr/bin/env python3\nimport os,json\nprint(os.environ.get('API_STATE', json.dumps(dict(running=[],retrying=[],blocked=[]))))\n")
        self.write("sudo", '#!/usr/bin/env bash\nif [[ "${PROCESS_REFS:-0}" == 1 ]]; then echo reference; fi\n')

    def write(self, name, text):
        path = self.bin / name
        path.write_text(text)
        path.chmod(0o755)

    def run_helper(self, mode="--prepare-stop-guard", **overrides):
        env={**os.environ, "HOME": str(self.home), "XDG_RUNTIME_DIR": str(self.runtime), "EVENTS": str(self.events), "PATH": str(self.bin)+os.pathsep+os.environ["PATH"], **overrides}
        result=subprocess.run(["bash", str(self.fixture_helper), mode], env=env, capture_output=True, text=True, timeout=5)
        calls=[json.loads(line) for line in self.events.read_text().splitlines()] if self.events.exists() else []
        self.assertFalse(any(any(command in call for command in ("kill","restart","stop","start")) for call in calls))
        return result

    def test_prepare_preserves_running_identity_and_unrelated_settings(self):
        before=self.unit.read_bytes()
        self.guard.parent.mkdir()
        unrelated=self.guard.parent/'zzz-other.conf'
        unrelated.write_text('[Service]\nRestart=always\n')
        result=self.run_helper()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('pid=123 unchanged; no restart',result.stdout)
        self.assertEqual(self.unit.read_bytes(),before)
        self.assertEqual(unrelated.read_text(),'[Service]\nRestart=always\n')
        self.assertEqual(self.run_helper('--check-only').returncode,0)

    def test_busy_or_process_references_refuse_before_guard_write(self):
        for overrides in ({'API_STATE':'{"running":[{}],"retrying":[],"blocked":[]}'}, {'PROCESS_REFS':'1'}):
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.run_helper(**overrides).returncode,0)
                self.assertFalse(self.guard.exists())

    def test_failed_reload_or_identity_readback_never_claims_success(self):
        for overrides in ({'RELOAD_FAIL':'1'},{'PID_DRIFT':'1'},{'GUARD_DENIED':'1'}):
            with self.subTest(overrides=overrides):
                (self.home/'reloaded').unlink(missing_ok=True)
                result=self.run_helper(**overrides)
                self.assertEqual(result.returncode,22,result.stderr)
                self.assertNotIn('stop guard prepared:',result.stdout)

    def test_existing_foreign_guard_is_never_overwritten(self):
        self.guard.parent.mkdir()
        self.guard.write_text('foreign')
        self.assertNotEqual(self.run_helper().returncode,0)
        self.assertEqual(self.guard.read_text(),'foreign')

    def test_alternate_xdg_cannot_escape_held_service_lease(self):
        import fcntl
        with (self.runtime / "symphony-elixir-safe-restart.lock").open("w") as lease:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            alternate = self.home / "other-runtime"
            alternate.mkdir()
            for mode in ("--prepare-stop-guard", "--check-only"):
                result = self.run_helper(mode, XDG_RUNTIME_DIR=str(alternate))
                self.assertEqual(result.returncode, 65, result.stderr)
            self.assertFalse(self.events.exists())
            self.assertFalse(self.guard.exists())

class ActivationAuthorityTests(unittest.TestCase):
    def test_exact_workflow_step_refuses_unverified_or_different_producer(self):
        import textwrap
        workflow=(ROOT/'.github/workflows/gem-delivery-controller-activation.yml').read_text()
        step=workflow.split('- name: Authorize exact production marker\n',1)[1].split('\n      - name:',1)[0]
        script=textwrap.dedent(step.split('        run: |\n',1)[1])
        self.assertLess(workflow.index('- name: Authorize exact production marker'),workflow.index('- name: Establish lingering user-systemd session'))
        self.assertLess(workflow.index('--prepare-stop-guard'),workflow.index('--provider-runtime-only'))
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            gh=root/'gh'
            gh.write_text('#!/usr/bin/env python3\nimport json\nprint(json.dumps(dict(id=123,name="Production Controller",path=".github/workflows/production-controller.yml",state="active")))\n')
            gh.chmod(0o755)
            node=root/'node'
            node.write_text('#!/usr/bin/env python3\nimport os,sys\nassert sys.argv[1]==".github/scripts/production-marker-state.mjs"\nassert "--sha" in sys.argv and "--controller-workflow-id" in sys.argv\nprint(os.environ["MARKER"])\n')
            node.chmod(0o755)
            for marker,expected in [
                ({'state':'none','reason':'no_marker'},False),
                ({'state':'pending'},False),
                ({'state':'manual'},False),
                ({'state':'verified','controllerRun':99,'controllerAttempt':1},False),
                ({'state':'verified','controllerRun':42,'controllerAttempt':2},False),
                ({'state':'verified','controllerRun':42,'controllerAttempt':1},True),
            ]:
                with self.subTest(marker=marker):
                    env={**os.environ,'PATH':str(root)+os.pathsep+os.environ['PATH'],'MARKER':json.dumps(marker),'PRODUCTION_SHA':'a'*40,'PRODUCTION_CONTROLLER_RUN':'42','PRODUCTION_CONTROLLER_ATTEMPT':'1','REPOSITORY':'JovieInc/Jovie'}
                    result=subprocess.run(['bash','-c',script],env=env,capture_output=True,text=True,timeout=5)
                    self.assertEqual(result.returncode==0,expected,result.stderr)

if __name__ == '__main__': unittest.main()
