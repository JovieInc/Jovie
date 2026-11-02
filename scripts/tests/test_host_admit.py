"""Unit tests for the host admission gate (scripts/hostops/host_admit.py). No real load is read:
the sampler, clock and sleep are injected."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/hostops"))
import host_admit as ha  # noqa: E402

CONFIG = ha.load_config(ROOT / "scripts/hostops/host-admit.json")


def sample(load1=4.0, cores=16, mem=30.0, running=0):
    return {"load1": load1, "cores": cores, "memGiB": mem, "running": running}


class DecideTest(unittest.TestCase):
    def test_admits_with_headroom(self):
        self.assertEqual(ha.decide("typecheck", CONFIG, "build", sample()).decision, "admit")

    def test_waits_at_class_cap(self):
        verdict = ha.decide("typecheck", CONFIG, "build", sample(running=3))
        self.assertEqual(verdict.decision, "wait")
        self.assertIn("cap 3/3", verdict.reason)

    def test_waits_over_load_ceiling(self):
        verdict = ha.decide("agent", CONFIG, "build", sample(load1=60.0))
        self.assertEqual(verdict.decision, "wait")
        self.assertIn("load 60.0", verdict.reason)

    def test_waits_under_memory_floor(self):
        verdict = ha.decide("test-suite", CONFIG, "build", sample(mem=3.0))
        self.assertEqual(verdict.decision, "wait")
        self.assertIn("MemAvailable", verdict.reason)

    def test_unknown_memory_does_not_block(self):
        self.assertEqual(ha.decide("hook-light", CONFIG, "build", sample(mem=None)).decision, "admit")

    def test_hook_light_admitted_where_heavy_classes_wait(self):
        busy = sample(load1=40.0)
        self.assertEqual(ha.decide("hook-light", CONFIG, "build", busy).decision, "admit")
        for cls in ("agent", "lane", "typecheck", "test-suite"):
            self.assertEqual(ha.decide(cls, CONFIG, "build", busy).decision, "wait", cls)

    def test_orchestrator_refuses_execution_classes(self):
        for cls in ("agent", "lane", "typecheck", "test-suite"):
            verdict = ha.decide(cls, CONFIG, "orchestrator", sample())
            self.assertEqual(verdict.decision, "refuse", cls)
            self.assertIn("orchestrator", verdict.reason)

    def test_orchestrator_hook_light_ignores_macos_load(self):
        self.assertEqual(ha.decide("hook-light", CONFIG, "orchestrator", sample(load1=60.0, cores=10)).decision, "admit")

    def test_unknown_class_refused(self):
        self.assertEqual(ha.decide("bogus", CONFIG, "build", sample()).decision, "refuse")

    def test_platform_profiles(self):
        with patch.dict(os.environ, {"HOST_ADMIT_PROFILE": ""}):
            self.assertEqual(ha.profile_name(CONFIG, "Darwin"), "orchestrator")
            self.assertEqual(ha.profile_name(CONFIG, "Linux"), "build")


class CountTest(unittest.TestCase):
    def test_matchers_use_executable_position(self):
        self.assertTrue(ha.matches(["/usr/bin/node", "/home/u/.npm-global/bin/codex", "exec", "x"], {"exe": ["codex"], "arg": "exec"}))
        self.assertTrue(ha.matches(["claude", "-p", "do it"], {"exe": ["claude"], "arg": "-p"}))
        self.assertFalse(ha.matches(["claude", "--dangerously-skip-permissions", "/loop"], {"exe": ["claude"], "arg": "-p"}))
        self.assertFalse(ha.matches(["bash", "-c", "echo codex exec"], {"exe": ["codex"], "arg": "exec"}))

    def test_children_of_counted_process_collapse_to_one(self):
        spec = {"processes": [{"exe": ["vitest.mjs"]}]}
        procs = [ha.Proc(10, 1, None, ["node", "/x/vitest.mjs", "run"]),
                 ha.Proc(11, 10, None, ["node", "/x/vitest.mjs", "worker"]),
                 ha.Proc(12, 10, None, ["node", "/x/vitest.mjs", "worker"]),
                 ha.Proc(20, 1, None, ["node", "/y/vitest.mjs", "run"])]
        self.assertEqual(ha.count_running(spec, [], procs), 2)

    def test_lease_and_its_matching_descendant_count_once(self):
        spec = {"processes": [{"exe": ["tsc"]}]}
        procs = [ha.Proc(5, 1, None, ["pnpm", "typecheck"]), ha.Proc(6, 5, None, ["node", "/x/tsc", "-p"])]
        self.assertEqual(ha.count_running(spec, [{"pid": 5}], procs), 1)

    def test_reservations_count(self):
        self.assertEqual(ha.count_running({}, [{"pid": 1, "expiresAt": 9e12}], []), 1)


class LeaseTest(unittest.TestCase):
    def test_dead_and_expired_leases_pruned(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            ha.write_lease(state, "lane", {"pid": 111, "start": None, "token": "a"})
            ha.write_lease(state, "lane", {"pid": 222, "start": None, "token": "b"})
            ha.write_lease(state, "lane", {"pid": 333, "token": "c", "expiresAt": 100.0})
            live = ha.read_leases(state, "lane", alive=lambda pid, start: pid == 222, now=200.0)
            self.assertEqual([l["pid"] for l in live], [222])
            self.assertEqual(len(list((state / "leases/lane").glob("*.json"))), 1)


class AdmitTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"HOST_ADMIT_STATE": self.tmp.name, "HOST_ADMIT_PROFILE": "build",
                                           ha.HELD_ENV: ""})
        self.env.start()
        self.now = [0.0]

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def clock(self):
        return self.now[0]

    def sleep(self, seconds):
        self.now[0] += seconds

    def log(self):
        return [json.loads(l) for l in (Path(self.tmp.name) / "admissions.jsonl").read_text().splitlines()]

    def test_admit_writes_lease_and_log(self):
        result = ha.admit("typecheck", config=CONFIG, sampler=lambda *a: sample(), clock=self.clock, sleep=self.sleep)
        self.assertTrue(result.admitted)
        self.assertTrue(result.lease_path.exists())
        row = self.log()[-1]
        self.assertEqual((row["class"], row["decision"]), ("typecheck", "admit"))
        for key in ("ts", "host", "load1", "memGiB", "wait_ms"):
            self.assertIn(key, row)
        result.release()
        self.assertFalse(result.lease_path)

    def test_bounded_wait_then_defer(self):
        result = ha.admit("typecheck", wait_s=60, config=CONFIG, sampler=lambda *a: sample(load1=99.0),
                          clock=self.clock, sleep=self.sleep, quiet=True)
        self.assertEqual((result.decision, result.exit_code), ("defer", ha.EXIT_DEFER))
        self.assertIn("load", result.reason)
        self.assertGreaterEqual(self.now[0], 60)
        self.assertEqual(self.log()[-1]["decision"], "defer")

    def test_waits_until_capacity_frees(self):
        loads = iter([99.0, 99.0, 5.0])
        result = ha.admit("test-suite", wait_s=600, config=CONFIG, sampler=lambda *a: sample(load1=next(loads)),
                          clock=self.clock, sleep=self.sleep, quiet=True)
        self.assertEqual(result.decision, "admit")
        self.assertGreater(result.wait_ms, 0)

    def test_dry_run_never_leases_or_waits(self):
        result = ha.admit("agent", dry_run=True, config=CONFIG, sampler=lambda *a: sample(load1=99.0),
                          clock=self.clock, sleep=self.sleep)
        self.assertEqual(result.decision, "defer")
        self.assertEqual(self.now[0], 0.0)
        self.assertFalse((Path(self.tmp.name) / "leases").exists() and any((Path(self.tmp.name) / "leases").rglob("*.json")))
        self.assertTrue(self.log()[-1]["dryRun"])

    def test_refuse_on_orchestrator(self):
        with patch.dict(os.environ, {"HOST_ADMIT_PROFILE": "orchestrator"}):
            result = ha.admit("typecheck", config=CONFIG, sampler=lambda *a: sample(), clock=self.clock, sleep=self.sleep)
        self.assertEqual((result.decision, result.exit_code), ("refuse", ha.EXIT_REFUSE))

    def test_nested_same_class_skips_the_queue(self):
        with patch.dict(os.environ, {ha.HELD_ENV: "test-suite"}):
            result = ha.admit("test-suite", config=CONFIG, sampler=lambda *a: sample(running=99),
                              clock=self.clock, sleep=self.sleep)
        self.assertEqual(result.decision, "nested")
        self.assertTrue(result.admitted)

    def test_stats_percentiles(self):
        rows = [{"ts": "2026-11-02T00:00:00Z", "class": "agent", "decision": "admit", "wait_ms": w} for w in range(0, 100)]
        rows.append({"ts": "2026-11-02T00:00:00Z", "class": "agent", "decision": "defer", "wait_ms": 600000})
        report = ha.stats(rows)["agent"]
        self.assertEqual((report["admit"], report["defer"]), (100, 1))
        self.assertEqual(report["waitP50ms"], 50)
        self.assertEqual(report["waitP95ms"], 94)


class CliTest(unittest.TestCase):
    def run_cli(self, *args, profile="build"):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, "HOST_ADMIT_STATE": tmp, "HOST_ADMIT_PROFILE": profile, ha.HELD_ENV: ""}
            return subprocess.run([str(ROOT / "scripts/hostops/host-admit"), *args], env=env,
                                  capture_output=True, text=True, timeout=60)

    def test_refused_class_exits_77_without_running(self):
        done = self.run_cli("typecheck", "--", "echo", "ran", profile="orchestrator")
        self.assertEqual(done.returncode, ha.EXIT_REFUSE)
        self.assertNotIn("ran", done.stdout)

    def test_admitted_command_runs_with_held_env(self):
        done = self.run_cli("hook-light", "--", "sh", "-c", f"echo ${ha.HELD_ENV}", profile="orchestrator")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(done.stdout.strip(), "hook-light")

    def test_missing_command_is_usage_error(self):
        self.assertEqual(self.run_cli("agent").returncode, ha.EXIT_USAGE)


if __name__ == "__main__":
    unittest.main()
