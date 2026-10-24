"""Hermetic tests for the throughput sentinel (no gh, no network, own temp state)."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
spec = importlib.util.spec_from_file_location("throughput_sentinel", ROOT / "scripts/lanes/throughput_sentinel.py")
ts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ts)

NOW = 1_800_000_000.0


def iso(epoch):
    return ts.datetime.fromtimestamp(epoch, ts.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def obs(**sentinel):
    return {"now": NOW, "linearError": None, "eligiblePool": 5, "openPRCount": 100,
            "eligiblePoolByProvider": {"codex": 3, "grok": 0},
            "capacityByProvider": {"codex": {"slots": 2, "running": 1, "oldestLeaseAge": 4000},
                                   "grok": {"slots": 2, "running": 0}},
            "heldByReason": {"conflict": 2},
            "sentinel": {"pushes1h": {}, "idleExits1h": {}, "idleExitsByProvider1h": {}, "growth": [], **sentinel}}


class ThroughputSentinelTest(unittest.TestCase):
    def test_no_push_alarm_is_per_lane_and_names_idle_reasons(self):
        alerts = ts.judge(obs(idleExitsByProvider1h={"codex": {"repair-inventory-source-stale": 9}}))
        self.assertEqual(list(alerts), ["throughput-no-push:JovieInc/Jovie:codex"])  # grok has no demand
        self.assertIn("stage claim->push", alerts["throughput-no-push:JovieInc/Jovie:codex"])
        self.assertIn("repair-inventory-source-stale x9", alerts["throughput-no-push:JovieInc/Jovie:codex"])
        self.assertEqual(ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1})), {})
        quiet = obs()
        quiet["eligiblePoolByProvider"] = {"codex": 0}
        self.assertEqual(ts.judge(quiet), {})
        unknown = obs()
        unknown["linearError"] = "down"
        self.assertEqual(ts.judge(unknown), {})  # demand unknown is not an alarm here

    def test_pushes_by_lane_counts_only_push_verdicts_in_the_hour(self):
        rows = [{"endedAt": iso(NOW - 60), "provider": "codex", "verdict": "pr-opened"},
                {"endedAt": iso(NOW - 60), "provider": "codex", "verdict": "failed"},
                {"endedAt": iso(NOW - 7200), "provider": "codex", "verdict": "pr-opened"},
                {"endedAt": iso(NOW - 10), "provider": "grok", "repository": "JovieInc/LogYourBody", "verdict": "landing"}]
        self.assertEqual(ts.pushes_by_lane(rows, NOW), {"JovieInc/Jovie|codex": 1, "JovieInc/LogYourBody|grok": 1})

    def test_queue_without_merges_and_release_flow_alarms(self):
        base = obs(pushes1h={"JovieInc/Jovie|codex": 1})
        base["mergeThroughput"] = {"observedAt": NOW - 60, "queueDepth": 18, "mergedPerHour": 0,
                                   "queueWaitP50Minutes": 35.8, "ejectionRate": 0.4}
        self.assertIn("throughput-queue-no-merge", ts.judge(base))
        base["mergeThroughput"]["mergedPerHour"] = 10
        self.assertEqual(ts.judge(base), {})
        base["mergeThroughput"] = {"observedAt": NOW - 7200, "queueDepth": 18, "mergedPerHour": 0}
        self.assertEqual(ts.judge(base), {})  # stale signal is not evidence
        slow = obs(pushes1h={"JovieInc/Jovie|codex": 1},
                   releaseFlow={"mergeGroupRuns": 3, "mergeGroupJobs": 6, "mergeGroupStartP50Min": 7.5, "mergeGroupStartMaxMin": 20,
                                "leaseHeldMin": 46.0, "leaseRunIds": [101, 102]})
        alerts = ts.judge(slow)
        self.assertIn("p50 7.5 min", alerts["throughput-merge-group-start-slow"])
        self.assertIn("101, 102", alerts["throughput-prod-lease-held"])
        ok = obs(pushes1h={"JovieInc/Jovie|codex": 1},
                 releaseFlow={"mergeGroupRuns": 1, "mergeGroupJobs": 2, "mergeGroupStartP50Min": 30, "leaseHeldMin": 44.9})
        self.assertEqual(ts.judge(ok), {})

    def test_one_dominant_idle_reason_alarms_only_with_demand_and_volume(self):
        busy = obs(pushes1h={"JovieInc/Jovie|codex": 1}, idleExits1h={"repair-inventory-oversize": 7, "linear-rate-limited": 3})
        self.assertIn("70%", ts.judge(busy)["throughput-idle-dominant"])
        split = obs(pushes1h={"JovieInc/Jovie|codex": 1}, idleExits1h={"a": 5, "b": 5})
        self.assertEqual(ts.judge(split), {})
        few = obs(pushes1h={"JovieInc/Jovie|codex": 1}, idleExits1h={"a": 5})
        self.assertEqual(ts.judge(few), {})
        maintenance = obs(pushes1h={"JovieInc/Jovie|codex": 1}, idleExits1h={"maintenance-only-idle": 9})
        self.assertEqual(ts.judge(maintenance), {})

    def test_idle_exit_log_is_bounded_and_counts_reasons(self):
        with tempfile.TemporaryDirectory() as raw:
            state = Path(raw)
            for index in range(4):
                ts.append_idle_exit(state, "JovieInc/Jovie", "codex", "repair-inventory-oversize", NOW - index)
            ts.append_idle_exit(state, "JovieInc/Jovie", "grok", "linear-rate-limited", NOW)
            ts.append_idle_exit(state, "JovieInc/Jovie", "grok", "old", NOW - 5000)
            rows = ts.read_idle_exits(state, NOW)
            self.assertEqual(sorted(r["reason"] for r in rows).count("repair-inventory-oversize"), 4)
            self.assertNotIn("old", [r["reason"] for r in rows])
            with mock_max(ts, 200):
                for _ in range(10):
                    ts.append_idle_exit(state, "JovieInc/Jovie", "codex", "x", NOW)
            self.assertLess((state / ts.IDLE_LOG).stat().st_size, 2000)

    def test_growth_bounds_alarm_at_seventy_percent(self):
        with tempfile.TemporaryDirectory() as raw:
            state = Path(raw)
            (state / "cache").mkdir()
            (state / "cache/open-prs-labels-v2.json").write_bytes(b"x" * 800)
            (state / "fix-attempts.json").write_bytes(b"x" * 900_000)
            (state / "held.json").write_bytes(b"x" * 10)
            (state / "outcome-queue.json").write_text(json.dumps({"scanned": 150}))
            rows = {r["id"]: r for r in ts.growth_bounds(state, {"inventoryBytes": 1000})}
            self.assertEqual(rows["repair-inventory-bytes"]["fraction"], 0.8)
            self.assertAlmostEqual(rows["fix-attempts-bytes"]["fraction"], 0.858, places=3)
            self.assertEqual(rows["outcome-candidate-scan"]["fraction"], 0.75)
            self.assertIsNone(rows["red-dispatch-ledger-bytes"]["used"])
            alerts = ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, growth=list(rows.values())))
            self.assertEqual(sorted(alerts), ["growth-bound:fix-attempts-bytes", "growth-bound:outcome-candidate-scan",
                                              "growth-bound:repair-inventory-bytes"])
            self.assertIn("86%", alerts["growth-bound:fix-attempts-bytes"])

    def test_release_flow_sampler_computes_wait_and_lease_from_rest_reads(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args[-1])
            if "event=merge_group" in args[-1]:
                runs = [{"id": 10 + n, "created_at": iso(NOW - 600 - 60 * n), "conclusion": "skipped" if n == 3 else None}
                        for n in range(4)]
                return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": runs}), stderr="")
            if "/jobs" in args[-1]:
                run_id = int(args[-1].split("/runs/")[1].split("/")[0])
                wait = {10: 120, 11: 600, 12: 900}[run_id]
                jobs = [{"created_at": iso(NOW - 500), "started_at": iso(NOW - 500 + wait)}]
                return SimpleNamespace(returncode=0, stdout=json.dumps({"jobs": jobs}), stderr="")
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                {"workflow_runs": [{"id": 7, "run_started_at": iso(NOW - 50 * 60)}]}))

        with tempfile.TemporaryDirectory() as raw:
            signal, error = ts.sample_release_flow(Path(raw), NOW, run)
            self.assertIsNone(error)
            self.assertEqual((signal["mergeGroupRuns"], signal["mergeGroupStartP50Min"], signal["leaseHeldMin"]),
                             (3, 10.0, 50.0))  # skipped run ignored, three jobs sampled
            again, _ = ts.sample_release_flow(Path(raw), NOW + 10, run)
            self.assertEqual(len(calls), 5)  # 1 runs + 3 jobs + 1 lease; cached for five minutes
            self.assertEqual(again["leaseRunIds"], [7])
            failing = lambda args, **kw: SimpleNamespace(returncode=1, stdout="", stderr="boom")
            signal, error = ts.sample_release_flow(Path(raw), NOW + 3600, failing)
            self.assertIn("boom", error)


class mock_max:
    def __init__(self, module, value):
        self.module, self.value = module, value

    def __enter__(self):
        self.old = self.module.IDLE_LOG_MAX_BYTES
        self.module.IDLE_LOG_MAX_BYTES = self.value

    def __exit__(self, *exc):
        self.module.IDLE_LOG_MAX_BYTES = self.old


if __name__ == "__main__":
    unittest.main()
