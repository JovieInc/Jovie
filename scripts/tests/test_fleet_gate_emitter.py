"""Fleet-gate receipt from the lanes tick: on input change only, detached, never on dispatch's path."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("fleet_gate_emitter", ROOT / "scripts/lanes/fleet_gate_emitter.py")
F = importlib.util.module_from_spec(spec)
sys.modules["fleet_gate_emitter"] = F
spec.loader.exec_module(F)
MAIN, NEXT = "a" * 40, "b" * 40


class FleetGateEmitterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.state, self.gem = root / "lanes", root / "gem-workspace"
        (self.state / "cache").mkdir(parents=True)
        (self.gem / "state" / "gem-priority-gate").mkdir(parents=True)
        self.env = {"GEM_WORKSPACE": str(self.gem), "FLEET_GATE_ALLOW_LIVE_PERSIST": "1", "PATH": "/usr/bin:/bin",
                    "LANES_FLEET_GATE": "1"}
        self.main, self.spawned = MAIN, []
        patcher = patch.object(F, "main_sha", side_effect=lambda repo: self.main)
        patcher.start()
        self.addCleanup(patcher.stop)

    def spawn(self, command, env, out, rc):
        self.spawned.append((command, env))
        return 999_999_999  # never a live pid

    def tick(self, release="tree-1"):
        return F.tick(self.state, self.state, release, env=self.env, spawn=self.spawn)

    def finish(self, code=0):
        (self.state / "fleet-gate-emit.rc").write_text(f"{code}\n")

    def test_emits_once_per_input_change_and_once_per_release(self):
        self.assertEqual(self.tick()["status"], "emitting")
        command, env = self.spawned[0]
        self.assertEqual(command[1:], [str(F.GATE), "--consumer", "fleet"])
        self.assertNotIn("FLEET_GATE_ALLOW_LIVE_PERSIST", env, "the tick writes the live receipt")
        self.assertEqual(env["GEM_WORKSPACE"], str(self.gem))
        self.assertEqual(len(env["FLEET_GATE_INPUT_GENERATION"]), 64)
        self.finish()
        for _ in range(3):
            self.assertEqual(self.tick()["status"], "unchanged", "no clock: an unchanged key does nothing")
        self.assertEqual(len(self.spawned), 1)
        self.main = NEXT
        self.assertEqual(self.tick()["reason"], "inputs")
        self.finish()
        (self.state / "cache" / "open-prs-labels-v2.json").write_text(json.dumps(
            {"at": 1, "value": [{"number": 7, "headRefOid": "c" * 40, "isInMergeQueue": True, "labels": []}]}))
        self.assertEqual(self.tick()["reason"], "inputs", "queue membership moved")
        self.finish()
        self.assertEqual(self.tick(release="tree-2")["reason"], "release", "one replay per install")
        self.finish()
        self.assertEqual(self.tick(release="tree-2")["status"], "unchanged")
        self.assertEqual(len(self.spawned), 4)
        record = json.loads((self.state / F.STATE_FILE).read_text())
        self.assertEqual((record["lastExit"], record["inputs"]["main"]), (0, NEXT))

    def receipt(self, generation, age_s, now):
        stamp = F.datetime.fromtimestamp(now - age_s, F.timezone.utc).isoformat()
        (self.gem / "state" / "gem-priority-gate" / "latest.json").write_text(json.dumps(
            {"state": "AMBER" if age_s % 2 else "GREEN", "reasons": [{"code": str(age_s)}],
             "observedAt": stamp, "inputGeneration": generation}))

    def test_its_own_receipt_and_restamped_evidence_never_re_trigger_it(self):
        now = 2_000_000_000.0
        tick = lambda at: F.tick(self.state, self.state, "tree-1", env=self.env, spawn=self.spawn, now=at)
        self.assertEqual(tick(now)["status"], "emitting")
        key = self.spawned[0][1]["FLEET_GATE_INPUT_GENERATION"]
        self.finish()
        # The gate's own write (any verdict) and a re-observed but unchanged integrity file.
        self.receipt(key, 1, now + 60)
        (self.gem / "state" / "integrity.json").write_text(json.dumps({"status": "clear", "observedAt": "t1"}))
        self.assertEqual(tick(now + 60)["status"], "emitting", "new integrity content is input")
        self.finish()
        key = self.spawned[-1][1]["FLEET_GATE_INPUT_GENERATION"]
        for at, stamp in ((now + 120, "t2"), (now + 3600, "t3")):
            self.receipt(key, 7, at)
            (self.gem / "state" / "integrity.json").write_text(json.dumps({"status": "clear", "observedAt": stamp}))
            self.assertEqual(tick(at)["status"], "unchanged")
        self.assertEqual(len(self.spawned), 2)

    def test_a_foreign_receipt_is_restamped_once_before_it_ages_out(self):
        now = 2_000_000_000.0
        tick = lambda at: F.tick(self.state, self.state, "tree-1", env=self.env, spawn=self.spawn, now=at)
        tick(now)
        self.finish()
        self.receipt("workflow", 10, now + 30)  # a push-triggered workflow run wrote a fresh receipt
        self.assertEqual(tick(now + 30)["status"], "unchanged")
        later = now + F.RESTAMP_AFTER_S + 30
        self.receipt("workflow", F.RESTAMP_AFTER_S, later)
        self.assertEqual(tick(later)["reason"], "restamp")
        self.finish()
        self.assertEqual(tick(later + 60)["status"], "unchanged", "at most one restamp per interval")
        self.assertEqual(len(self.spawned), 2)

    def test_a_running_observation_is_not_restarted(self):
        with patch.object(F, "_alive", return_value=True):
            self.tick()
            self.main = NEXT
            self.assertEqual(self.tick()["status"], "running")
        self.assertEqual(len(self.spawned), 1)

    def test_off_outside_gem_in_self_tests_and_never_raises(self):
        self.assertEqual(F.tick(self.state, self.state, "t", env={"GEM_WORKSPACE": str(self.state / "nope")},
                                spawn=self.spawn)["status"], "off")
        unforced = {k: v for k, v in self.env.items() if k != "LANES_FLEET_GATE"}
        self.assertEqual(F.tick(self.state, self.state, "t", env=unforced, spawn=self.spawn)["status"], "off",
                         "a checkout (not an installed release) never writes the live receipt")
        self.assertFalse(F.enabled({**unforced, "LANES_SELFTEST": "1"}, self.state))
        self.assertEqual(F.tick(self.state, self.state, "t", env={**self.env, "LANES_FLEET_GATE": "0"},
                                spawn=self.spawn)["status"], "off")
        self.main = None
        self.assertEqual(self.tick()["status"], "main-unknown")
        self.main = MAIN
        boom = F.tick(self.state, self.state, "t", env=self.env,
                      spawn=lambda *a: (_ for _ in ()).throw(OSError("fork failed")))
        self.assertEqual(boom["status"], "error")
        self.assertEqual(self.spawned, [])

    def test_the_detached_runner_records_its_exit(self):
        out, rc = self.state / "o.json", self.state / "rc"
        pid = F._spawn([sys.executable, "-c", "print('{}')"], {"PATH": "/usr/bin:/bin"}, out, rc)
        for _ in range(100):
            if rc.exists() and rc.read_text().strip():
                break
            subprocess.run(["sleep", "0.05"])
        self.assertEqual((rc.read_text().strip(), out.read_text().strip()), ("0", "{}"))
        self.assertGreater(pid, 0)
        self.assertTrue((ROOT / "scripts/fleet-gate/gem-priority-gate.py").exists())


if __name__ == "__main__":
    unittest.main()
