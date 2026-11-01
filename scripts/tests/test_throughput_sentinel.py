"""Hermetic tests for the throughput sentinel (no gh, no network, own temp state)."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from unittest import mock
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
        self.assertEqual(sorted(alerts), ["throughput-idle-not-demand:codex", "throughput-no-push:JovieInc/Jovie:codex"])  # grok has no demand
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

    def test_merge_gate_pool_alarm_names_the_faster_pool(self):
        def flow(pools):
            return obs(pushes1h={"JovieInc/Jovie|codex": 1},
                       releaseFlow={"mergeGroupRuns": 3, "mergeGroupJobs": 40, "mergeGroupStartP50Min": 0.1,
                                    "mergeGroupStartByPool": pools})
        hosted = {"n": 40, "p50S": 3.0, "p95S": 33.0}
        slow_fixed = {"n": 13, "p50S": 120.0, "p95S": 451.0}
        alert = ts.judge(flow({"hosted": hosted, "self-hosted": slow_fixed}))["throughput-merge-gate-pool"]
        self.assertIn("self-hosted p50 120.0s", alert)
        self.assertIn("deleting repo variable MERGE_GATE_POOL", alert)
        # Within the margin, or too few self-hosted jobs: no alarm.
        self.assertNotIn("throughput-merge-gate-pool", ts.judge(flow({"hosted": hosted, "self-hosted": {"n": 13, "p50S": 30.0, "p95S": 60.0}})))
        self.assertNotIn("throughput-merge-gate-pool", ts.judge(flow({"hosted": hosted, "self-hosted": {"n": 2, "p50S": 900.0, "p95S": 900.0}})))
        # Hosted saturated with nothing on the gem pool: suggest the fallback.
        saturated = ts.judge(flow({"hosted": {"n": 20, "p50S": 141.0, "p95S": 167.0}}))["throughput-merge-gate-pool"]
        self.assertIn("MERGE_GATE_POOL=fixed", saturated)
        self.assertEqual(ts.runner_pool(["self-hosted", "jovie-fixed"]), "self-hosted")
        self.assertEqual(ts.runner_pool(["ubuntu-latest"]), "hosted")
        self.assertEqual(ts.runner_pool(None), "hosted")

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
                jobs = [{"created_at": iso(NOW - 500), "started_at": iso(NOW - 500 + wait),
                         "labels": ["self-hosted", "Linux", "X64", "jovie-fixed"] if run_id == 12 else ["ubuntu-latest"]}]
                return SimpleNamespace(returncode=0, stdout=json.dumps({"jobs": jobs}), stderr="")
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                {"workflow_runs": [{"id": 7, "run_started_at": iso(NOW - 50 * 60)}]}))

        with tempfile.TemporaryDirectory() as raw:
            signal, error = ts.sample_release_flow(Path(raw), NOW, run)
            self.assertIsNone(error)
            self.assertEqual((signal["mergeGroupRuns"], signal["mergeGroupStartP50Min"], signal["leaseHeldMin"]),
                             (3, 10.0, 50.0))  # skipped run ignored, three jobs sampled
            self.assertEqual(signal["mergeGroupStartByPool"],
                             {"hosted": {"n": 2, "p50S": 360.0, "p95S": 600.0},
                              "self-hosted": {"n": 1, "p50S": 900.0, "p95S": 900.0}})
            again, _ = ts.sample_release_flow(Path(raw), NOW + 10, run)
            self.assertEqual(len(calls), 6)  # 1 runs + 3 jobs + 1 lease + 1 queued count; cached for five minutes
            self.assertEqual(again["leaseRunIds"], [7])
            failing = lambda args, **kw: SimpleNamespace(returncode=1, stdout="", stderr="boom")
            signal, error = ts.sample_release_flow(Path(raw), NOW + 3600, failing)
            self.assertIn("boom", error)


class ClaimErrorTest(unittest.TestCase):
    def test_claim_error_rate_over_twenty_percent_alarms_per_lane(self):
        dead = {"provider": "codex", "endedAt": iso(NOW - 60), "verdict": "failed",
                "reasons": ["claim-error:JSONDecodeError:Unterminated string starting at: line 1 column 421"]}
        ok = {"provider": "codex", "endedAt": iso(NOW - 120), "verdict": "fix-pushed", "reasons": []}
        old = {"provider": "codex", "endedAt": iso(NOW - 7200), "verdict": "failed", "reasons": dead["reasons"]}
        rows = ts.claim_errors_by_lane([dead] * 3 + [ok] * 4 + [old] * 9, NOW)
        self.assertEqual((rows["codex"]["runs"], rows["codex"]["claimErrors"]), (7, 3))
        alerts = ts.judge({"now": NOW, "sentinel": {"claimErrors30m": rows}})
        self.assertIn("throughput-claim-errors:codex", alerts)
        healthy = ts.judge({"now": NOW, "sentinel": {"claimErrors30m": ts.claim_errors_by_lane([dead] + [ok] * 9, NOW)}})
        self.assertNotIn("throughput-claim-errors:codex", healthy)
        few = ts.judge({"now": NOW, "sentinel": {"claimErrors30m": ts.claim_errors_by_lane([dead] * 3, NOW)}})
        self.assertNotIn("throughput-claim-errors:codex", few)


class QueueUnmergeableTest(unittest.TestCase):
    def test_unmergeable_entry_is_dequeued_commented_and_routed_after_the_grace(self):
        qm = importlib.util.module_from_spec(importlib.util.spec_from_file_location("queue_unmergeable", ROOT / "scripts/lanes/queue_unmergeable.py"))
        qm.__spec__.loader.exec_module(qm)
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            if any("mergeQueue" in a for a in args):
                nodes = [{"state": "UNMERGEABLE", "position": 3, "pullRequest": {"id": "PR_1", "number": 23519, "headRefOid": "a" * 40}},
                         {"state": "AWAITING_CHECKS", "position": 1, "pullRequest": {"id": "PR_2", "number": 7, "headRefOid": "b" * 40}}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": nodes}}}}}))
            return SimpleNamespace(returncode=0, stderr="", stdout="{}")

        with tempfile.TemporaryDirectory() as raw:
            first = qm.sweep(Path(raw), run, NOW)
            self.assertEqual((first["dequeued"], [r["pr"] for r in first["seen"]]), ([], [23519]))
            second = qm.sweep(Path(raw), run, NOW + qm.GRACE_S + 1)
            self.assertEqual(second["dequeued"], [23519])
            flat = "\n".join(" ".join(c) for c in calls)
            self.assertIn("dequeuePullRequest", flat)
            self.assertIn("lane-fix-conflict", flat)
            self.assertIn("queue-dequeue", flat)
            self.assertIn("23519", (Path(raw) / qm.LOG_FILE).read_text())
            self.assertNotIn("PR_2", " ".join(" ".join(c) for c in calls if any("dequeue" in a for a in c)))


class QueueBreakerTest(unittest.TestCase):
    def test_headgreen_failed_build_of_a_still_queued_entry_is_not_counted(self):
        qb = importlib.util.module_from_spec(importlib.util.spec_from_file_location("queue_breaker", ROOT / "scripts/lanes/queue_breaker.py"))
        qb.__spec__.loader.exec_module(qb)
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            flat = " ".join(args)
            if "workflows/ci.yml/runs" in flat:
                rows = [{"id": 11, "head_branch": "gh-readonly-queue/main/pr-700-abc", "conclusion": "failure", "updated_at": iso(NOW - 600), "head_sha": "live1"},
                        {"id": 12, "head_branch": "gh-readonly-queue/main/pr-700-def", "conclusion": "failure", "updated_at": iso(NOW - 3000), "head_sha": "old2"}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": None, "workflow_runs": rows}))
            if "mergeQueue" in flat:
                nodes = [{"state": "AWAITING_CHECKS", "headCommit": {"oid": "LIVE1"}, "pullRequest": {"id": "PR_X", "number": 700, "headRefOid": "a" * 40}}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": nodes}}}}}))
            return SimpleNamespace(returncode=0, stderr="", stdout="{}")

        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(raw, run, now=NOW)
        # One failure is the live entry (never ejected under HEADGREEN); one failure is not a trip.
        self.assertEqual(out["tripped"], [])
        self.assertFalse(any("dequeuePullRequest" in " ".join(c) for c in calls))

    def test_two_group_failures_in_three_hours_dequeue_hold_and_keep_the_head_blocked(self):
        qb = importlib.util.module_from_spec(importlib.util.spec_from_file_location("queue_breaker", ROOT / "scripts/lanes/queue_breaker.py"))
        qb.__spec__.loader.exec_module(qb)
        calls, labels = [], []
        head = {"sha": "a" * 40}
        gone = []

        def run(args, **kwargs):
            calls.append(args)
            path = args[-1] if args[0] == "api" else ""
            flat = " ".join(args)
            if "branch=main" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": []}))
            if "workflows/ci.yml/runs" in flat:
                rows = [{"id": 11, "head_branch": "gh-readonly-queue/main/pr-23471-abc", "conclusion": "failure", "updated_at": iso(NOW - 600), "head_sha": "s1"},
                        {"id": 12, "head_branch": "gh-readonly-queue/main/pr-23471-def", "conclusion": "failure", "updated_at": iso(NOW - 3000), "head_sha": "s2"},
                        {"id": 13, "head_branch": "gh-readonly-queue/main/pr-500-abc", "conclusion": "failure", "updated_at": iso(NOW - 600), "head_sha": "s3"},
                        {"id": 14, "head_branch": "gh-readonly-queue/main/pr-23471-old", "conclusion": "failure", "updated_at": iso(NOW - 40000), "head_sha": "s4"}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
            if "mergeQueue" in flat:
                nodes = ([] if gone else [{"state": "AWAITING_CHECKS", "pullRequest": {"id": "PR_X", "number": 23471, "headRefOid": "a" * 40}}]) + [
                         {"state": "QUEUED", "pullRequest": {"id": "PR_Y", "number": 500, "headRefOid": "b" * 40}}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": nodes}}}}}))
            if path.endswith("/jobs?per_page=100"):
                jobs = [{"id": 9, "name": "ci-fast (remaining)", "conclusion": "failure", "steps": [{"name": "Run structural ci-fast lane", "conclusion": "failure"}]},
                        {"id": 8, "name": "ci-fast", "conclusion": "failure", "steps": []}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"jobs": jobs}))
            if path.endswith("/logs"):
                return SimpleNamespace(returncode=0, stderr="", stdout="x\n2026 ##[error]UpdateTest failed: 1 != 0\n")
            if "/labels" in flat:
                labels.append(flat)
                return SimpleNamespace(returncode=0, stderr="", stdout="[]")
            if "/pulls/" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"state": "open", "head": head, "labels": []}))
            return SimpleNamespace(returncode=0, stderr="", stdout="{}")

        with tempfile.TemporaryDirectory() as raw:
            first = qb.sweep(Path(raw), run, NOW)
            gone.append(1)  # dequeued
            self.assertEqual(first["tripped"], [23471])
            flat = "\n".join(" ".join(c) for c in calls)
            self.assertIn("dequeuePullRequest", flat)
            self.assertIn("ci-fast (remaining)", flat)
            self.assertIn("UpdateTest failed", flat)
            self.assertNotIn("PR_Y", "\n".join(" ".join(c) for c in calls if any("dequeue" in a for a in c)))
            labels.clear()
            # Same head, label cleared by a green Source Validation: the hold is put back.
            again = qb.sweep(Path(raw), run, NOW + 600)
            self.assertEqual(again["reblocked"], [23471])
            self.assertTrue(any("issues/23471/labels" in l for l in labels))
            # A new head releases the PR.
            head["sha"] = "c" * 40
            labels.clear()
            released = qb.sweep(Path(raw), run, NOW + 1200)
            self.assertEqual((released["reblocked"], labels), ([], []))
            # ...and the breaker removes its own label itself, only that one, and forgets the PR.
            self.assertEqual(released["released"], [23471])
            self.assertEqual(json.loads((Path(raw) / qb.STATE_FILE).read_text()), {})

    def test_failures_on_head_a_never_hold_the_fixed_head_b(self):
        qb = importlib.util.module_from_spec(importlib.util.spec_from_file_location("queue_breaker", ROOT / "scripts/lanes/queue_breaker.py"))
        qb.__spec__.loader.exec_module(qb)
        calls, pushed_at = [], NOW - 300  # head B was committed 5 min ago, after both failures on head A

        def run(args, **kwargs):
            calls.append(args)
            flat = " ".join(args)
            if "workflows/ci.yml/runs" in flat:
                rows = [{"id": 21, "head_branch": "gh-readonly-queue/main/pr-23570-aaa", "conclusion": "failure", "head_sha": "g1",
                         "created_at": iso(NOW - 2400), "updated_at": iso(NOW - 2000)},
                        {"id": 22, "head_branch": "gh-readonly-queue/main/pr-23570-bbb", "conclusion": "failure", "head_sha": "g2",
                         "created_at": iso(NOW - 1500), "updated_at": iso(NOW - 900)}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
            if "mergeQueue" in flat:
                node = {"state": "AWAITING_CHECKS", "pullRequest": {"id": "PR_Z", "number": 23570, "headRefOid": "b" * 40}}
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": [node]}}}}}))
            if "/commits/" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"commit": {"committer": {"date": iso(pushed_at)}}}))
            return SimpleNamespace(returncode=0, stderr="", stdout="{}")

        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)  # head B is in the queue and passing: nothing to trip
            self.assertEqual((out["tripped"], out["reblocked"], out["errors"]), ([], [], []))
            flat = "\n".join(" ".join(c) for c in calls)
            self.assertNotIn("dequeuePullRequest", flat)
            self.assertNotIn("lane-fix-red", flat)
            # Two failures that DO start after head B was pushed still trip it (the breaker is per head, not off).
            pushed_at = NOW - 3000
            again = qb.sweep(Path(raw), run, NOW)
            self.assertEqual(again["tripped"], [23570])

    BRAND = "tests/unit/brand/agent-display-name.test.ts brand guard finds the forbidden wording"

    def _breaker(self):
        qb = importlib.util.module_from_spec(importlib.util.spec_from_file_location("queue_breaker", ROOT / "scripts/lanes/queue_breaker.py"))
        qb.__spec__.loader.exec_module(qb)
        return qb

    def _attribution_world(self, calls, *, peer_line=None, peer_contains=False, main_line=None,
                           with_own_failures=True, with_peer=True):
        """Fake gh world for attribution: PR #24111 queued on head a*40 with two own merge-group
        failures on `Unit Tests (7/14)` and the brand-guard error line; an optional peer group
        failure for #24105 (same signal by default, group without #24111) and an optional
        main-branch red. Jobs and logs are keyed by run and job id."""
        brand = self.BRAND
        peer_line = brand if peer_line is None else peer_line

        def run(args, **kwargs):
            calls.append(args)
            flat = " ".join(args)
            path = args[-1] if args and args[0] == "api" else ""
            if "branch=main" in flat:
                rows = [{"id": 77, "updated_at": iso(NOW - 1500)}] if main_line is not None else []
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
            if "workflows/ci.yml/runs" in flat:
                rows = []
                if with_own_failures:
                    rows += [{"id": 31, "head_branch": "gh-readonly-queue/main/pr-24111-aaa", "conclusion": "failure",
                              "created_at": iso(NOW - 700), "updated_at": iso(NOW - 600), "head_sha": "p" * 40},
                             {"id": 32, "head_branch": "gh-readonly-queue/main/pr-24111-bbb", "conclusion": "failure",
                              "created_at": iso(NOW - 1300), "updated_at": iso(NOW - 1200), "head_sha": "q" * 40}]
                if with_peer:
                    rows.append({"id": 33, "head_branch": "gh-readonly-queue/main/pr-24105-ccc", "conclusion": "failure",
                                 "created_at": iso(NOW - 1000), "updated_at": iso(NOW - 900), "head_sha": "e" * 40})
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
            if "mergeQueue" in flat:
                nodes = [{"state": "AWAITING_CHECKS", "headCommit": {"oid": "z" * 40},
                          "pullRequest": {"id": "PR_V", "number": 24111, "headRefOid": "a" * 40}}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": nodes}}}}}))
            if "/compare/" in flat:
                commits = [{"commit": {"message": "peer entry (#24105)"}}]
                if peer_contains:
                    commits.append({"commit": {"message": "this group carries the tripped PR (#24111)"}})
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"commits": commits}))
            if path.endswith("/jobs?per_page=100"):
                run_id = int(path.split("/runs/")[1].split("/")[0])
                job_id = {31: 91, 32: 92, 33: 93, 77: 97}[run_id]
                jobs = [{"id": job_id, "name": "Unit Tests (7/14)", "conclusion": "failure",
                         "steps": [{"name": "Run unit tests", "conclusion": "failure"}]}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"jobs": jobs}))
            if path.endswith("/logs"):
                job_id = int(path.split("/jobs/")[1].split("/")[0])
                line = peer_line if job_id == 93 else (main_line if job_id == 97 else brand)
                return SimpleNamespace(returncode=0, stderr="", stdout=f"setup\n##[error]{line}\n")
            if "/pulls/24111" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"state": "open", "head": {"sha": "a" * 40}, "labels": []}))
            return SimpleNamespace(returncode=0, stderr="", stdout="{}")

        return run

    def test_a_shared_peer_failure_skips_the_trip(self):
        """2026-11-01: main's brand-guard break failed every group whatever PR it carried, so a
        green queued PR whose own head checks pass must not be tripped, dequeued or labeled."""
        calls = []
        qb = self._breaker()
        run = self._attribution_world(calls)
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            flat = "\n".join(" ".join(c) for c in calls)
            log = (Path(raw) / qb.LOG_FILE).read_text()
            state = json.loads((Path(raw) / qb.STATE_FILE).read_text())
        self.assertEqual(out["tripped"], [])
        self.assertEqual(out.get("skipped-shared"), [24111])
        self.assertNotIn("dequeuePullRequest", flat)
        self.assertNotIn("issues/24111/labels", flat)
        self.assertIn("/compare/main...", flat)  # containment was actually checked
        self.assertIn("skipped-shared-failure", log)
        self.assertIn('"kind": "peer"', log)
        self.assertEqual(state, {})

    def test_a_peer_group_containing_the_pr_is_not_shared_evidence(self):
        calls = []
        qb = self._breaker()
        run = self._attribution_world(calls, peer_contains=True)
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            flat = "\n".join(" ".join(c) for c in calls)
        self.assertEqual(out["tripped"], [24111])
        self.assertNotIn("skipped-shared", out)
        self.assertIn("dequeuePullRequest", flat)

    def test_a_peer_failing_a_different_signal_still_trips(self):
        """Genuine red detection is not weakened: a peer failing something else is not evidence."""
        calls = []
        qb = self._breaker()
        run = self._attribution_world(calls, peer_line="OwnBreak failed: 1 != 0")
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            flat = "\n".join(" ".join(c) for c in calls)
        self.assertEqual(out["tripped"], [24111])
        self.assertNotIn("skipped-shared", out)
        self.assertIn("dequeuePullRequest", flat)

    def test_a_main_branch_red_skips_the_single_pr_trip(self):
        """With no other queued PR, a main-branch CI red on the same signal is the evidence."""
        calls = []
        qb = self._breaker()
        run = self._attribution_world(calls, with_peer=False, main_line=self.BRAND)
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            flat = "\n".join(" ".join(c) for c in calls)
            log = (Path(raw) / qb.LOG_FILE).read_text()
        self.assertEqual(out["tripped"], [])
        self.assertEqual(out.get("skipped-shared"), [24111])
        self.assertNotIn("dequeuePullRequest", flat)
        self.assertIn('"kind": "main"', log)

    def test_a_shared_failure_hold_is_released_instead_of_reblocked(self):
        """The relay cleared the label on a required-green head; a shared failure must not put it
        back (each re-application wakes dequeue-held and churns the green queued PR again)."""
        calls = []
        qb = self._breaker()
        run = self._attribution_world(calls, with_own_failures=False)
        with tempfile.TemporaryDirectory() as raw:
            (Path(raw) / qb.STATE_FILE).write_text(json.dumps(
                {"24111": {"head": "a" * 40, "at": NOW - 2000,
                           "check": {"job": "Unit Tests (7/14)", "step": "Run unit tests", "line": self.BRAND}}}))
            out = qb.sweep(Path(raw), run, NOW)
            flat = "\n".join(" ".join(c) for c in calls)
            log = (Path(raw) / qb.LOG_FILE).read_text()
            state = json.loads((Path(raw) / qb.STATE_FILE).read_text())
        self.assertEqual(out.get("released-shared"), [24111])
        self.assertEqual(out["reblocked"], [])
        self.assertNotIn("issues/24111/labels", flat)
        self.assertIn("released-shared-failure", log)
        self.assertEqual(state, {})

    def _cluster_world(self, calls, *, peers=(24105, 24106), peer_test="tests/unit/brand/agent-display-name.test.ts",
                       labels=(), removed=None):
        """Peers whose groups all CONTAIN #24111 (so the peer rule can say nothing) and whose first error line is the
        generic exit-code line: only the shared top failing test links them (2026-11-01 routing.json poison)."""
        removed = [] if removed is None else removed
        runs = [{"id": 31, "head_branch": "gh-readonly-queue/main/pr-24111-aaa", "conclusion": "failure",
                 "created_at": iso(NOW - 700), "updated_at": iso(NOW - 600), "head_sha": "p" * 40},
                {"id": 32, "head_branch": "gh-readonly-queue/main/pr-24111-bbb", "conclusion": "failure",
                 "created_at": iso(NOW - 1300), "updated_at": iso(NOW - 1200), "head_sha": "q" * 40}]
        runs += [{"id": 40 + i, "head_branch": f"gh-readonly-queue/main/pr-{pr}-ccc", "conclusion": "failure",
                  "created_at": iso(NOW - 1000), "updated_at": iso(NOW - 900 - i), "head_sha": "e" * 40} for i, pr in enumerate(peers)]

        def run(args, **kwargs):
            calls.append(args)
            flat = " ".join(args)
            path = args[-1] if args and args[0] == "api" else ""
            if "branch=main" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": []}))
            if "workflows/ci.yml/runs" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": runs}))
            if "mergeQueue" in flat:
                nodes = [{"state": "AWAITING_CHECKS", "headCommit": {"oid": "z" * 40},
                          "pullRequest": {"id": "PR_V", "number": 24111, "headRefOid": "a" * 40}}]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"data": {"repository": {"mergeQueue": {"entries": {"nodes": nodes}}}}}))
            if "/compare/" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"commits": [{"commit": {"message": "carries (#24111)"}}]}))
            if path.endswith("/jobs?per_page=100"):
                run_id = int(path.split("/runs/")[1].split("/")[0])
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"jobs": [
                    {"id": run_id, "name": "Unit Tests (7/14)", "conclusion": "failure", "steps": [{"name": "Run unit tests", "conclusion": "failure"}]}]}))
            if path.endswith("/logs"):
                job_id = int(path.split("/jobs/")[1].split("/")[0])
                test = peer_test if job_id >= 40 else "tests/unit/brand/agent-display-name.test.ts"
                return SimpleNamespace(returncode=0, stderr="", stdout=f"\x1b[31m FAIL \x1b[0m unit {test} > brand\n##[error]Process completed with exit code {job_id}.\n")
            if "-X" in args and "DELETE" in args:
                removed.append(flat)
                return SimpleNamespace(returncode=0, stderr="", stdout="[]")
            if "/pulls/24111" in flat:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"state": "open", "head": {"sha": "a" * 40},
                                                                                   "labels": [{"name": n} for n in labels]}))
            return SimpleNamespace(returncode=0, stderr="", stdout="{}")

        return run

    def test_three_pr_groups_failing_the_same_top_test_skip_the_trip(self):
        calls = []
        qb = self._breaker()
        run = self._cluster_world(calls)
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
            log = (Path(raw) / qb.LOG_FILE).read_text()
        flat = "\n".join(" ".join(c) for c in calls)
        self.assertEqual((out["tripped"], out.get("skipped-shared")), ([], [24111]))
        self.assertNotIn("dequeuePullRequest", flat)
        self.assertIn('"kind": "cluster"', log)
        self.assertIn("agent-display-name.test.ts", log)

    def test_two_pr_groups_on_one_test_is_not_a_cluster(self):
        calls = []
        qb = self._breaker()
        run = self._cluster_world(calls, peers=(24105,))
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
        self.assertEqual(out["tripped"], [24111])

    def test_peers_failing_other_tests_do_not_make_a_cluster(self):
        calls = []
        qb = self._breaker()
        run = self._cluster_world(calls, peer_test="tests/unit/other.test.ts")
        with tempfile.TemporaryDirectory() as raw:
            out = qb.sweep(Path(raw), run, NOW)
        self.assertEqual(out["tripped"], [24111])

    def test_a_held_pr_with_a_shared_signature_loses_its_label_and_gets_a_receipt(self):
        calls, removed = [], []
        qb = self._breaker()
        run = self._cluster_world(calls, labels=("lane-fix-red",), removed=removed)
        with tempfile.TemporaryDirectory() as raw:
            (Path(raw) / qb.STATE_FILE).write_text(json.dumps(
                {"24111": {"head": "a" * 40, "at": NOW - 2000, "check": {"job": "Unit Tests (7/14)", "line": "x",
                                                                        "test": "tests/unit/brand/agent-display-name.test.ts"}}}))
            out = qb.sweep(Path(raw), run, NOW)
            log = [json.loads(l) for l in (Path(raw) / qb.LOG_FILE).read_text().splitlines()]
            state = json.loads((Path(raw) / qb.STATE_FILE).read_text())
        self.assertEqual(out.get("released-shared"), [24111])
        self.assertEqual(len(removed), 1)
        self.assertIn("issues/24111/labels/lane-fix-red", removed[0])
        self.assertEqual((log[-1]["action"], log[-1]["label_removed"], log[-1]["shared"]["kind"]), ("released-shared-failure", True, "cluster"))
        self.assertEqual(state, {})


class QueueTimingsTest(unittest.TestCase):
    def test_queue_timings_report_group_ci_and_enqueue_to_merge(self):
        receipts = []

        def run(args, **kwargs):
            path = args[-1]
            if "workflows/ci.yml/runs" in path:
                rows = [{"status": "completed", "conclusion": c, "created_at": iso(NOW - 3600), "updated_at": iso(NOW - 3600 + secs)}
                        for c, secs in (("success", 600), ("success", 1200), ("cancelled", 300), ("failure", 700))]
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": rows}))
            if "/pulls?" in path:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps([{"number": 5, "merged_at": iso(NOW), "head": {"sha": "a" * 40}}]))
            if "/statuses" in path:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(receipts))
            events = [{"event": "added_to_merge_queue", "created_at": iso(NOW - 3600)},
                      {"event": "removed_from_merge_queue", "created_at": iso(NOW - 2400), "actor": {"login": "github-merge-queue[bot]"}},
                      {"event": "added_to_merge_queue", "created_at": iso(NOW - 1200)}]
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(events))

        with tempfile.TemporaryDirectory() as raw:
            signal, error = ts.sample_queue_timings(Path(raw), NOW, run)
            self.assertIsNone(error)
            self.assertEqual(signal["groupCi"]["runs"], 4)
            self.assertEqual((signal["groupCi"]["cancelledShare"], signal["groupCi"]["failureShare"]), (0.25, 0.25))
            self.assertEqual(signal["groupCi"]["successP95Min"], 20.0)
            self.assertEqual((signal["enqueueToMerge"]["lastEnqueueP50Min"], signal["enqueueToMerge"]["firstEnqueueP50Min"]), (20.0, 60.0))
            self.assertEqual((signal["dequeues"]["silentGithub"], signal["dequeues"]["requeueLagP50Min"]), (1, 20.0))
            self.assertEqual((signal["dequeues"]["autoRequeues"], signal["dequeues"]["pushToMainRequeues"]), (0, 1))
            self.assertEqual(signal["dequeues"]["pushRequeueLagP50Min"], 20.0)
        # A why= receipt written between the removal and the re-add makes it an auto re-queue.
        receipts.append({"context": ts.REARM_CONTEXT, "description": "n=1;sha=" + "a" * 40 + ";run=9;why=unattributed", "created_at": iso(NOW - 1195)})
        with tempfile.TemporaryDirectory() as raw:
            signal, _ = ts.sample_queue_timings(Path(raw), NOW, run)
            self.assertEqual((signal["dequeues"]["autoRequeues"], signal["dequeues"]["pushToMainRequeues"]), (1, 0))
            self.assertEqual((signal["dequeues"]["autoRequeueLagP50Min"], signal["dequeues"]["pushRequeueLagP50Min"]), (20.0, None))


class IdleNotDemandTest(unittest.TestCase):
    def test_idle_for_any_reason_but_no_demand_while_demand_exists_alarms_per_lane(self):
        pushed = {"JovieInc/Jovie|codex": 1}
        gated = obs(pushes1h=pushed, idleExitsByProvider1h={"codex": {"repair-inventory-oversize": 2, "linear-rate-limited": 2}})
        alert = ts.judge(gated)["throughput-idle-not-demand:codex"]
        self.assertIn("none for lack of demand", alert)
        self.assertIn("repair-inventory-oversize x2", alert)
        mixed = obs(pushes1h=pushed, idleExitsByProvider1h={"codex": {"maintenance-only-idle": 1, "linear-rate-limited": 3}})
        self.assertNotIn("throughput-idle-not-demand:codex", ts.judge(mixed))
        few = obs(pushes1h=pushed, idleExitsByProvider1h={"codex": {"linear-rate-limited": 2}})
        self.assertNotIn("throughput-idle-not-demand:codex", ts.judge(few))
        nodemand = obs(pushes1h=pushed, idleExitsByProvider1h={"grok": {"linear-rate-limited": 5}})  # grok has no demand
        self.assertNotIn("throughput-idle-not-demand:grok", ts.judge(nodemand))

    def test_capped_stores_are_measured_against_their_own_limits(self):
        with tempfile.TemporaryDirectory() as raw:
            state = Path(raw)
            (state / "api-budget.json").write_bytes(b"x" * 50000)
            (state / "linear-usage.json").write_bytes(b"x" * 10)
            rows = {r["id"]: r for r in ts.growth_bounds(state, {})}
            self.assertAlmostEqual(rows["api-budget-bytes"]["fraction"], 0.763, places=3)
            alerts = ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, growth=list(rows.values())))
            self.assertIn("growth-bound:api-budget-bytes", alerts)
            self.assertNotIn("growth-bound:linear-usage-bytes", alerts)


class RepoFlowTest(unittest.TestCase):
    def flow(self, prs, merged1h=0):
        return {"observedAt": NOW - 60, "openPrs": prs, "merged1h": merged1h}

    def test_clean_pr_with_no_merges_and_stale_conflicts_alarm_per_repo(self):
        repo = "JovieInc/LogYourBody"
        old = NOW - 90 * 60
        clean = {"number": 1, "draft": False, "state": "CLEAN", "author": "a", "updatedAt": old}
        dirty = {"number": 2, "draft": False, "state": "DIRTY", "author": "app/dependabot", "updatedAt": NOW - 5 * 86400}
        alerts = ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, repos={repo: self.flow([clean, dirty])}))
        self.assertIn("#1", alerts[f"throughput-no-merge:{repo}"])
        self.assertIn("#2 DIRTY by app/dependabot", alerts[f"throughput-pr-stuck:{repo}"])
        merged = ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, repos={repo: self.flow([clean], merged1h=1)}))
        self.assertNotIn(f"throughput-no-merge:{repo}", merged)
        fresh = dict(clean, updatedAt=NOW - 600)
        self.assertEqual(ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, repos={repo: self.flow([fresh])})), {})
        draft = dict(dirty, draft=True)
        self.assertEqual(ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, repos={repo: self.flow([draft])})), {})
        stale = {"observedAt": NOW - 7200, "openPrs": [clean, dirty], "merged1h": 0}
        self.assertEqual(ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, repos={repo: stale})), {})

    def test_the_default_gh_reader_goes_through_the_shared_client_at_poll_priority(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import apiclient.gh as client
        seen = []
        def fake(args, priority="default", **kw):
            seen.append((args, priority))
            return {"code": 75, "stdout": "", "stderr": "github-quota-deferred", "deferred": True}
        with mock.patch.object(client, "run_gh", fake), tempfile.TemporaryDirectory() as raw:
            _, error = ts.sample_repo_flow(Path(raw), "JovieInc/LogYourBody", NOW)
        self.assertEqual(seen[0][1], "poll")
        self.assertEqual(seen[0][0][:2], ["pr", "list"])
        self.assertIn("deferred", error)

    def test_sampler_reads_two_lists_and_caches(self):
        calls = []

        def run(args, **kw):
            calls.append(args)
            if "open" in args:
                rows = [{"number": 7, "isDraft": False, "createdAt": iso(NOW - 9), "updatedAt": iso(NOW - 4000),
                         "mergeStateStatus": "CLEAN", "author": {"login": "tim"}}]
            else:
                rows = [{"number": 6, "mergedAt": iso(NOW - 600)}, {"number": 5, "mergedAt": iso(NOW - 9000)}]
            return SimpleNamespace(returncode=0, stdout=json.dumps(rows), stderr="")

        with tempfile.TemporaryDirectory() as raw:
            signal, error = ts.sample_repo_flow(Path(raw), "JovieInc/LogYourBody", NOW, run)
            self.assertIsNone(error)
            self.assertEqual((signal["merged1h"], signal["openPrs"][0]["state"], len(calls)), (1, "CLEAN", 2))
            ts.sample_repo_flow(Path(raw), "JovieInc/LogYourBody", NOW + 5, run)
            self.assertEqual(len(calls), 2)
            bad = lambda args, **kw: SimpleNamespace(returncode=1, stdout="", stderr="HTTP 502")
            _, error = ts.sample_repo_flow(Path(raw), "JovieInc/LogYourBody", NOW + 9999, bad)
            self.assertIn("502", error)


class mock_max:
    def __init__(self, module, value):
        self.module, self.value = module, value

    def __enter__(self):
        self.old = self.module.IDLE_LOG_MAX_BYTES
        self.module.IDLE_LOG_MAX_BYTES = self.value

    def __exit__(self, *exc):
        self.module.IDLE_LOG_MAX_BYTES = self.old



class SupplyFlowTest(unittest.TestCase):
    def graphql(self, nodes, depth):
        body = {"data": {"repository": {"mergeQueue": {"entries": {"totalCount": depth}},
                                         "pullRequests": {"pageInfo": {"hasNextPage": False, "endCursor": None},
                                                          "nodes": nodes}}}}
        return lambda args, **_: SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")

    def pr(self, number, status="CLEAN", queued=False, labels=(), draft=False):
        return {"number": number, "isDraft": draft, "isInMergeQueue": queued, "isCrossRepository": False,
                "mergeStateStatus": status, "createdAt": iso(NOW), "headRefOid": "a" * 40,
                "labels": {"nodes": [{"name": name} for name in labels]}}

    def test_queue_starved_alarm_needs_ten_minutes_of_clean_unqueued_with_depth_at_most_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            nodes = [self.pr(1), self.pr(2, "DIRTY"), self.pr(3, labels=["hold"]), self.pr(4, draft=True),
                     self.pr(5, "CLEAN", queued=True), self.pr(6, "BLOCKED")]
            first, error = ts.sample_supply_flow(Path(tmp), NOW, self.graphql(nodes, 1))
            self.assertIsNone(error)
            self.assertEqual(first["counts"], {"BLOCKED": 1, "CLEAN-unqueued": 1, "DIRTY": 1, "held": 1, "queued": 1})
            self.assertEqual(first["cleanUnqueued"], [1])
            self.assertEqual(ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, supplyFlow=first)), {})
            later, _ = ts.sample_supply_flow(Path(tmp), NOW + 700, self.graphql(nodes, 1))
            self.assertGreater(later["starvedForS"], 600)
            alerts = ts.judge({**obs(pushes1h={"JovieInc/Jovie|codex": 1}, supplyFlow=later), "now": NOW + 700})
            self.assertIn("throughput-queue-starved", alerts)
            self.assertIn("#1", alerts["throughput-queue-starved"])
            deep, _ = ts.sample_supply_flow(Path(tmp), NOW + 1500, self.graphql(nodes, 6))
            self.assertEqual(deep["starvedForS"], 0)

    def test_lanes_tick_dispatches_the_enroll_sweep_after_ten_minutes_once_per_window(self):
        calls = []

        def run(args, **_):
            calls.append(args)
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        with tempfile.TemporaryDirectory() as tmp:
            first, _ = ts.sample_supply_flow(Path(tmp), NOW, self.graphql([self.pr(1)], 1))
            self.assertIsNone(ts.backstop_enroll(Path(tmp), first, NOW + 60, run))
            later, _ = ts.sample_supply_flow(Path(tmp), NOW + 700, self.graphql([self.pr(1)], 1))
            receipt = ts.backstop_enroll(Path(tmp), later, NOW + 700, run)
            self.assertTrue(receipt["ok"])
            self.assertEqual(calls, [["workflow", "run", "merge-queue-green-enroll.yml", "-R", "JovieInc/Jovie", "--ref", "main"]])
            ts.backstop_enroll(Path(tmp), later, NOW + 800, run)
            self.assertEqual(len(calls), 1)

    def test_remediation_dead_man_alarms_after_thirty_silent_minutes_with_waiting_prs(self):
        with tempfile.TemporaryDirectory() as tmp:
            supply, _ = ts.sample_supply_flow(Path(tmp), NOW, self.graphql([self.pr(1, "DIRTY"), self.pr(2, "BLOCKED")], 3))
            old = iso(NOW - 3600)
            run = lambda args, **_: SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": [{"created_at": old}]}), stderr="")
            live = ts.remediation_liveness(Path(tmp), supply, NOW, run)
            self.assertEqual((live["waiting"], live["silentForS"]), (2, 3600))
            alerts = ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, supplyFlow=supply, remediation=live))
            self.assertIn("throughput-remediation-silent", alerts)
            fresh = {**live, "silentForS": 300}
            self.assertNotIn("throughput-remediation-silent", ts.judge(obs(pushes1h={"JovieInc/Jovie|codex": 1}, supplyFlow=supply, remediation=fresh)))
            supply["prs"]["1"]["since"] = NOW - 3600
            empty = lambda *a, **k: SimpleNamespace(returncode=0, stdout='{"workflow_runs":[]}', stderr="")
            self.assertEqual(ts.remediation_liveness(Path(tmp), supply, NOW, empty)["silentForS"], 3600)

    def test_enqueue_records_green_to_enqueue_dwell_and_supply_dwell_alarm(self):
        with tempfile.TemporaryDirectory() as tmp:
            ts.sample_supply_flow(Path(tmp), NOW, self.graphql([self.pr(1)], 4))
            after, _ = ts.sample_supply_flow(Path(tmp), NOW + 130, self.graphql([self.pr(1, queued=True)], 5))
            self.assertEqual(after["greenToEnqueueS"], [130.0])
            dirty = [self.pr(n, "DIRTY") for n in range(10, 14)]
            ts.sample_supply_flow(Path(tmp), NOW + 300, self.graphql(dirty, 5))
            late, _ = ts.sample_supply_flow(Path(tmp), NOW + 300 + 7 * 3600, self.graphql(dirty, 5))
            alerts = ts.judge({**obs(pushes1h={"JovieInc/Jovie|codex": 1}, supplyFlow=late), "now": NOW + 300 + 7 * 3600})
            self.assertIn("throughput-supply-dwell:DIRTY", alerts)


if __name__ == "__main__":
    unittest.main()
