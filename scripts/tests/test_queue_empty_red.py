"""Empty-queue stall alarm (2026-11-10 replay). Hermetic: no gh, no network, own temp state."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import queue_empty_red as qer  # noqa: E402
import throughput_sentinel as ts  # noqa: E402

NOW = 1_800_000_000.0


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def obs(groupOutcomes, supplyFlow):
    return {"now": NOW, "groupOutcomes": groupOutcomes, "sentinel": {"supplyFlow": supplyFlow}}


def judge(world):
    return qer.judge(world)


class QueueEmptyRedTest(unittest.TestCase):
    def test_an_empty_queue_behind_red_merge_groups_is_a_stall_2026_11_10(self):
        # 2026-11-10 20:11Z to 2026-11-11 04:13Z: one clock-expired test failed every merge group. The breaker and the
        # failure hold ejected each entry, so the queue was empty, zero merged, and rule 2 (depth > 0) read healthy.
        world = obs(groupOutcomes={"observedAt": NOW - 120, "decided": 6, "failed": 6, "failedPrs": ["24790", "24801", "24811"],
                                   "newestConclusion": "failure", "newestEndedAt": NOW - 5 * 3600, "lastGreenAt": None,
                                   "failedRunIds": [3, 2, 1]},
                    supplyFlow={"observedAt": NOW - 60, "queueDepth": 0, "counts": {"held": 4}, "cleanUnqueued": []})
        world["mergeThroughput"] = {"observedAt": NOW - 60, "queueDepth": 0, "mergedPerHour": 0,
                                    "queueWaitP50Minutes": None, "ejectionRate": None}
        alerts = judge(world)
        blind = {"now": NOW, "sentinel": {"pushes1h": {}}, "mergeThroughput": world["mergeThroughput"]}
        self.assertNotIn("throughput-queue-no-merge", ts.judge(blind))  # the depth > 0 rule is blind here by design
        self.assertIn("6 of the last 6", alerts["throughput-queue-empty-red"])
        self.assertIn("#24790", alerts["throughput-queue-empty-red"])
        self.assertIn("4 held", alerts["throughput-queue-empty-red"])

        def variant(merge=None, **groups):
            copy = json.loads(json.dumps(world))
            copy["groupOutcomes"].update(groups)
            copy["mergeThroughput"].update(merge or {})
            return judge(copy)
        self.assertEqual(variant(newestConclusion="success"), {})  # a green group after the reds is recovery
        self.assertEqual(variant(merge={"mergedPerHour": 2}), {})  # something merged
        self.assertEqual(variant(observedAt=NOW - 7200), {})  # a stale sample is not evidence
        # One PR failing its own groups three times with nothing waiting is that PR's problem, not main's.
        quiet = json.loads(json.dumps(world))
        quiet["groupOutcomes"].update(failedPrs=["24790"])
        quiet["sentinel"]["supplyFlow"]["counts"] = {}
        self.assertEqual(judge(quiet), {})
        # Mostly-red groups on several PRs alarm without held PRs while the newest failure is recent...
        recent = json.loads(json.dumps(world))
        recent["sentinel"]["supplyFlow"]["counts"] = {}
        recent["groupOutcomes"].update(newestEndedAt=NOW - 1800, decided=6, failed=4)
        self.assertIn("throughput-queue-empty-red", judge(recent))
        # ...and an old red streak with nobody waiting is a quiet night, not a stall.
        recent["groupOutcomes"].update(newestEndedAt=NOW - 7 * 3600)
        self.assertEqual(judge(recent), {})
        # Held PRs without a mostly-red streak alarm only while the newest failed group is recent: a stale red group
        # and three PRs held for other reasons must not blame main.
        held_only = json.loads(json.dumps(world))
        held_only["groupOutcomes"].update(failedPrs=["24790"], decided=6, failed=1, newestEndedAt=NOW - 7 * 3600)
        held_only["sentinel"]["supplyFlow"]["counts"] = {"held": 3}
        self.assertEqual(judge(held_only), {})
        held_only["groupOutcomes"].update(newestEndedAt=NOW - 1800)
        self.assertIn("3 held", judge(held_only)["throughput-queue-empty-red"])

    def test_group_outcome_sampler_reads_decided_groups_of_any_age_once_per_five_minutes(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args[-1])
            rows = [{"id": 9, "conclusion": "cancelled", "updated_at": iso(NOW - 60), "head_branch": "gh-readonly-queue/main/pr-9-a"},
                    {"id": 8, "conclusion": "failure", "updated_at": iso(NOW - 3 * 3600), "head_branch": "gh-readonly-queue/main/pr-24811-b"},
                    {"id": 7, "conclusion": "failure", "updated_at": iso(NOW - 4 * 3600), "head_branch": "gh-readonly-queue/main/pr-24801-c"},
                    {"id": 6, "conclusion": "failure", "updated_at": iso(NOW - 5 * 3600), "head_branch": "gh-readonly-queue/main/pr-24811-d"},
                    {"id": 5, "conclusion": "success", "updated_at": iso(NOW - 9 * 3600), "head_branch": "gh-readonly-queue/main/pr-24700-e"}]
            return SimpleNamespace(returncode=0, stdout=json.dumps({"workflow_runs": rows}), stderr="")

        with tempfile.TemporaryDirectory() as raw:
            signal, error = qer.sample(Path(raw), NOW, run)
            self.assertIsNone(error)
            self.assertEqual((signal["decided"], signal["failed"], signal["failedPrs"], signal["newestConclusion"]),
                             (4, 3, ["24801", "24811"], "failure"))
            self.assertEqual((signal["newestEndedAt"], signal["lastGreenAt"], signal["failedRunIds"]),
                             (NOW - 3 * 3600, NOW - 9 * 3600, [8, 7, 6]))
            qer.sample(Path(raw), NOW + 60, run)
            self.assertEqual(len(calls), 1)
            self.assertNotIn("created=", calls[0])  # no trailing-hour window: a stalled queue has no recent groups
            broken = lambda args, **kw: SimpleNamespace(returncode=1, stdout="", stderr="HTTP 502")
            kept, error = qer.sample(Path(raw), NOW + 3600, broken)
            self.assertIn("HTTP 502", error)
            self.assertEqual(kept["failed"], 3)


if __name__ == "__main__":
    unittest.main()
