#!/usr/bin/env python3
from __future__ import annotations
import fcntl, importlib.util, json, os, pathlib, signal, subprocess, tempfile, time, unittest
from unittest import mock
ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-gate-next-admission.py"
RUN_BACKLOG = ROOT / "scripts/backlog-orchestrator/run-backlog.sh"
SPEC = importlib.util.spec_from_file_location("gem_gate_next_admission", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE_SHA = "a" * 40
IDENTITY = {
    "GITHUB_RUN_ID": "32419475562",
    "GITHUB_RUN_ATTEMPT": "1",
    "GITHUB_EVENT_NAME": "workflow_dispatch",
    "GITHUB_SHA": SOURCE_SHA,
}
PEAK_STUB = """#!/usr/bin/env python3
import fcntl, os, sys, time
from pathlib import Path
try:
    active = Path(os.environ["ACTIVE_DIR"])
    live = active / "live"; live.mkdir(parents=True, exist_ok=True)
    marker = live / f"{os.getpid()}-{sys.argv[1]}"
    marker.write_text("1")
    (active / "invocations.log").open("a").write(sys.argv[1] + "\\n")
    time.sleep(float(os.environ.get("HOLD_SECONDS", "0.4")))
    lock = (active / "peak.lock").open("a+")
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
    count = len(list(live.iterdir()))
    peak = active / "peak"
    prev = int(peak.read_text()) if peak.exists() else 0
    if count > prev: peak.write_text(str(count))
    fcntl.flock(lock.fileno(), fcntl.LOCK_UN); lock.close()
    marker.unlink(missing_ok=True)
    print('{"status":"blocked","mutations":0}')
except OSError: sys.exit(0)
"""
def _receipt(state: pathlib.Path) -> dict:
    latest = state / "gem-gate-next-admission.json"
    if latest.exists():
        return json.loads(latest.read_text(encoding="utf-8"))
    runs = sorted((state / "gem-gate-next-admission-runs").glob("*.json"))
    if not runs:
        raise AssertionError("no admission receipt was written")
    return json.loads(runs[-1].read_text(encoding="utf-8"))
class GemGateNextAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = pathlib.Path(self.tmp.name) / "state"
        self.state.mkdir()
        self.active = pathlib.Path(self.tmp.name) / "active"
        self.active.mkdir()
        self.backlog = pathlib.Path(self.tmp.name) / "run-backlog.sh"
        self.backlog.write_text(PEAK_STUB, encoding="utf-8")
        self.backlog.chmod(0o755)
    def tearDown(self):
        self.tmp.cleanup()
    def env(self, **overrides):
        env = os.environ.copy()
        env.update(IDENTITY)
        env.update(
            {
                "JOVIE_GEM_ADMISSION_TEST": "1",
                "JOVIE_GEM_ADMISSION_HOSTNAME": "gem",
                "JOVIE_GEM_ADMISSION_STATE_DIR": str(self.state),
                "JOVIE_GEM_ADMISSION_RUN_BACKLOG": str(self.backlog),
                "JOVIE_GEM_ADMISSION_LOCK_TIMEOUT_SECONDS": "2",
                "JOVIE_GEM_ADMISSION_RECONCILE_TIMEOUT_SECONDS": "3",
                "JOVIE_GEM_ADMISSION_GATE_NEXT_TIMEOUT_SECONDS": "3",
                "ACTIVE_DIR": str(self.active),
                "HOLD_SECONDS": "0.4",
            }
        )
        env.update({key: str(value) for key, value in overrides.items()})
        return env
    def run_wrapper(self, args, env=None):
        return subprocess.run(
            ["python3", str(SOURCE), *args],
            cwd=str(ROOT),
            env=self.env() if env is None else env,
            capture_output=True,
            text=True,
        )
    def test_unserialized_children_overlap(self):
        env = self.env(HOLD_SECONDS="0.5")
        procs = [
            subprocess.Popen([str(self.backlog), "gate-next"], env=env)
            for _ in range(2)
        ]
        self.assertEqual([proc.wait() for proc in procs], [0, 0])
        self.assertGreaterEqual(int((self.active / "peak").read_text()), 2)
    def test_fleet_and_intake_serialize_to_one_owner(self):
        env = self.env(HOLD_SECONDS="0.6")
        fleet = subprocess.Popen(
            ["python3", str(SOURCE), "--mode=fleet"], cwd=str(ROOT), env=env
        )
        time.sleep(0.15)
        intake = subprocess.Popen(
            ["python3", str(SOURCE), "--mode=intake", "--issue=JOV-5257"],
            cwd=str(ROOT),
            env=env,
        )
        self.assertEqual(fleet.wait(), 0)
        self.assertEqual(intake.wait(), 0)
        self.assertEqual(int((self.active / "peak").read_text()), 1)
        log = (self.active / "invocations.log").read_text(encoding="utf-8")
        self.assertIn("reconcile", log)
        self.assertGreaterEqual(log.count("gate-next"), 2)
        receipt = _receipt(self.state)
        self.assertEqual(receipt["exitClassification"], "ok")
        self.assertTrue((self.state / "gem-gate-next-admission.lock").exists())
    def test_sigkill_releases_kernel_lock_without_deleting_lock_file(self):
        holder = subprocess.Popen(
            ["python3", str(SOURCE), "--mode=fleet"],
            cwd=str(ROOT),
            env=self.env(HOLD_SECONDS="0.25"),
        )
        lock = self.state / "gem-gate-next-admission.lock"
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and not lock.exists():
            time.sleep(0.05)
        holder.send_signal(signal.SIGKILL)
        self.assertEqual(holder.wait(), -signal.SIGKILL)
        self.assertTrue(lock.exists())
        successor = self.run_wrapper(
            ["--mode=intake", "--issue=JOV-5253"],
            env=self.env(HOLD_SECONDS="0.1"),
        )
        self.assertEqual(successor.returncode, 0)
        self.assertTrue(lock.exists())
    def test_held_lock_timeout_invokes_no_child(self):
        lock = (self.state / "gem-gate-next-admission.lock").open("a+", encoding="utf-8")
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            result = self.run_wrapper(
                ["--mode=fleet"],
                env=self.env(JOVIE_GEM_ADMISSION_LOCK_TIMEOUT_SECONDS="0.4"),
            )
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            lock.close()
        receipt = _receipt(self.state)
        self.assertEqual(result.returncode, MODULE.EXIT_FAIL_CLOSED)
        self.assertFalse((self.active / "invocations.log").exists())
        self.assertEqual(
            (receipt["exitClassification"], receipt["mutations"], receipt["childInvoked"], receipt["retryCeiling"], receipt["nextAction"]),
            ("busy", 0, False, 0, "do-not-retry"),
        )
    def test_child_timeout_and_lost_response_require_reconcile(self):
        timed = self.run_wrapper(
            ["--mode=intake", "--issue=JOV-5257"],
            env=self.env(HOLD_SECONDS="2", JOVIE_GEM_ADMISSION_GATE_NEXT_TIMEOUT_SECONDS="0.2"),
        )
        receipt = _receipt(self.state)
        self.assertEqual(timed.returncode, MODULE.EXIT_RECONCILE_REQUIRED)
        self.assertEqual(receipt["exitClassification"], "reconcile-required")
        self.assertEqual(receipt["nextAction"], "reconcile-linear-receipts-and-leases")
        self.assertEqual(receipt["mutations"], "possible")
        args = MODULE.parse_args(["--mode=fleet"])
        identity = {"runId": "1", "runAttempt": "1", "event": "push", "sourceSha": SOURCE_SHA}
        with (
            mock.patch.object(MODULE, "state_dir", return_value=self.state),
            mock.patch.object(MODULE, "run_child", side_effect=RuntimeError("lost response")),
        ):
            code = MODULE.run_locked_children(0, args, None, identity, "now")
        lost = _receipt(self.state)
        self.assertEqual(code, MODULE.EXIT_RECONCILE_REQUIRED)
        self.assertEqual(lost["phase"], "child-lost")
    def test_child_error_is_not_replayed(self):
        failing = pathlib.Path(self.tmp.name) / "fail.sh"
        failing.write_text("#!/usr/bin/env bash\nexit 7\n", encoding="utf-8")
        failing.chmod(0o755)
        result = self.run_wrapper(
            ["--mode=fleet"], env=self.env(JOVIE_GEM_ADMISSION_RUN_BACKLOG=str(failing))
        )
        receipt = _receipt(self.state)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(receipt["exitClassification"], "child-error")
        self.assertEqual(receipt["nextAction"], "observe-child-receipt")
    def test_validation_fail_closed_before_mutation(self):
        cases = [
            (["--mode=intake"], {}),
            (["--mode=intake", "--issue=not-an-issue"], {}),
            (["--mode=fleet", "--issue=JOV-5257"], {}),
            (["--mode=fleet"], {"JOVIE_GEM_ADMISSION_HOSTNAME": "not-gem"}),
            (["--mode=fleet"], {"GITHUB_RUN_ID": ""}),
            (["--mode=fleet"], {"JOVIE_GEM_ADMISSION_EXPECTED_SHA": "b" * 40}),
        ]
        for args, extra in cases:
            with self.subTest(args=args, extra=extra):
                env = self.env(**extra)
                if extra.get("GITHUB_RUN_ID") == "":
                    env.pop("GITHUB_RUN_ID", None)
                result = self.run_wrapper(args, env=env)
                receipt = _receipt(self.state)
                self.assertEqual(result.returncode, MODULE.EXIT_FAIL_CLOSED)
                self.assertFalse((self.active / "invocations.log").exists())
                self.assertEqual(receipt["exitClassification"], "validation")
                self.assertFalse(receipt["childInvoked"])
    def test_stale_receipt_never_authorizes_lock_deletion_or_ownership(self):
        lock = self.state / "gem-gate-next-admission.lock"
        lock.write_text("{not json", encoding="utf-8")
        (self.state / "gem-gate-next-admission.json").write_text(
            '{"pid": 1, "hostname": "other"}\n', encoding="utf-8"
        )
        result = self.run_wrapper(
            ["--mode=intake", "--issue=JOV-5257"], env=self.env(HOLD_SECONDS="0.05")
        )
        receipt = _receipt(self.state)
        self.assertEqual(result.returncode, 0)
        self.assertTrue(lock.exists())
        self.assertGreater(receipt["pid"], 1)
        self.assertEqual(receipt["hostname"], "gem")
    def test_direct_mutating_entry_is_blocked_without_lock_proof(self):
        isolated = {**os.environ, "HOME": str(self.tmp.name), "LINEAR_API_KEY": ""}
        blocked = subprocess.run(
            ["bash", str(RUN_BACKLOG), "gate-next"],
            cwd=str(ROOT), capture_output=True, text=True, env=isolated,
        )
        dry = subprocess.run(
            ["bash", str(RUN_BACKLOG), "gate-next", "--dry-run"],
            cwd=str(ROOT), capture_output=True, text=True, env=isolated,
        )
        self.assertEqual(blocked.returncode, 2)
        self.assertIn("requires gem-gate-next-admission lock proof", blocked.stderr)
        self.assertNotIn("requires gem-gate-next-admission lock proof", dry.stderr)
    def test_production_state_dir_stays_fixed_outside_test_harness(self):
        self.assertEqual(
            MODULE.DEFAULT_STATE_DIR, pathlib.Path("/home/timwhite/gem-workspace/state")
        )
        with mock.patch.dict(os.environ, {"JOVIE_GEM_ADMISSION_STATE_DIR": "/tmp/not-gem"}):
            os.environ.pop("JOVIE_GEM_ADMISSION_TEST", None)
            self.assertEqual(MODULE.state_dir(), MODULE.DEFAULT_STATE_DIR)
    def test_workflows_share_wrapper_and_keep_distinct_github_groups(self):
        fleet = (ROOT / ".github/workflows/fleet-gate-refresh.yml").read_text()
        intake = (ROOT / ".github/workflows/jovie-intake-controller.yml").read_text()
        wrapper = SOURCE.read_text()
        self.assertIn("group: fleet-gate-event-admission", fleet)
        self.assertIn("group: jovie-intake-admission", intake)
        self.assertIn("gem-gate-next-admission.py --mode=fleet", fleet)
        self.assertIn('gem-gate-next-admission.py --mode=intake --issue="$ISSUE_IDENTIFIER"', intake)
        self.assertNotIn("run-backlog.sh gate-next", fleet + intake)
        self.assertNotIn("run-backlog.sh reconcile", fleet)
        self.assertIn('f"--issue={issue}"', wrapper)
        self.assertIn("RECONCILE_TIMEOUT_SECONDS = 180", wrapper)
        self.assertIn("GATE_NEXT_TIMEOUT_SECONDS = 60", wrapper)
        self.assertIn("timeout-minutes: 12", fleet)
        self.assertIn("timeout-minutes: 8", intake)
if __name__ == "__main__":
    unittest.main()
