"""Measured deploy lag: samples, weekly p95 limits, the published p50/p95 metric."""
from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import deploy_health as dh  # noqa: E402
import deploy_lag as dl  # noqa: E402

REPO = "JovieInc/Jovie"
NOW = 1_792_900_000.0


def iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def deploys(count: int, age_of, start: float = NOW - 6 * 86400, step: float = 3600, offset: int = 0):
    """`count` successful deploys oldest first; compare() ages come from age_of(index)."""
    runs = [{"id": i + offset, "created_at": iso(start + i * step), "updated_at": iso(start + i * step + 600), "conclusion": "success", "head_sha": f"sha{i}"}
            for i in range(count)]
    def gh(path):
        after = int(path.split("...sha")[1])
        finished = start + after * step + 600
        return {"ahead_by": 2 + after % 5, "commits": [{"commit": {"committer": {"date": iso(finished - age_of(after))}}}]}
    return list(reversed(runs)), gh  # API order: newest first


class PairsTest(unittest.TestCase):
    def test_only_a_success_after_a_success_is_normal_lag(self):
        rows = [{"id": 3, "created_at": "2026-10-25T03:00:00Z", "conclusion": "success", "head_sha": "c"},
                {"id": 2, "created_at": "2026-10-25T02:00:00Z", "conclusion": "failure", "head_sha": "b"},
                {"id": 1, "created_at": "2026-10-25T01:00:00Z", "conclusion": "success", "head_sha": "a"},
                {"id": 0, "created_at": "2026-10-25T00:00:00Z", "conclusion": "success", "head_sha": "z"}]
        self.assertEqual([(b["id"], a["id"]) for b, a in dl.pairs(rows)], [(0, 1)])


class MeasuredLimitsTest(unittest.TestCase):
    def test_limits_are_the_trailing_7_day_p95_and_stay_frozen_for_a_week(self):
        runs, gh = deploys(60, lambda i: 600 + 60 * i)  # ages 10..69 min
        store = {}
        for _ in range(3):  # the backfill takes three passes of 20 compares
            store = dl.collect(store, REPO, runs, NOW, gh)
        store = dl.update_limits(store, NOW)
        ages = sorted(600 + 60 * i for i in range(1, 60))
        self.assertEqual(store["limits"]["ageS"], int(-(-dl.pct(ages, 0.95) // 1)))
        self.assertEqual(store["limits"]["n"], 59)
        frozen = dict(store["limits"])
        worse_runs, worse_gh = deploys(60, lambda i: 90_000)  # a degraded pipeline
        store = dl.update_limits(dl.collect(store, REPO, worse_runs, NOW + 3600, worse_gh), NOW + 3600)
        self.assertEqual(store["limits"], frozen, "no drift inside the week")
        later = NOW + dl.WEEK_S + 60
        runs2, gh2 = deploys(60, lambda i: 90_000, start=later - 6 * 86400, offset=1000)
        for _ in range(3):
            store = dl.collect(store, REPO, runs2, later, gh2)
        store = dl.update_limits(store, later)
        self.assertGreater(store["limits"]["ageS"], frozen["ageS"], "recomputed after a week from the trailing 7 days")

    def test_a_partial_backfill_never_freezes_limits(self):
        runs, gh = deploys(60, lambda i: 600)
        store = dl.update_limits(dl.collect({}, REPO, runs, NOW, gh), NOW)
        self.assertGreater(store["backlog"], 0)
        self.assertNotIn("limits", store)
        store["limits"] = {"commits": 1, "ageS": 1, "computedAt": NOW, "n": 20}  # written by the first live release
        self.assertEqual(dl.limits_or_seed(store, 6, 14760)["source"], "seed")
        for _ in range(2):
            store = dl.collect(store, REPO, runs, NOW, gh)
        store = dl.update_limits(store, NOW)
        self.assertTrue(store["limits"]["complete"])
        self.assertEqual(store["limits"]["n"], 59)

    def test_fewer_than_twenty_samples_keep_the_seed(self):
        runs, gh = deploys(10, lambda i: 600)
        store = dl.update_limits(dl.collect({}, REPO, runs, NOW, gh), NOW)
        self.assertNotIn("limits", store)
        self.assertEqual(dl.limits_or_seed(store, 6, 14760), {"commits": 6, "ageS": 14760, "computedAt": None, "n": 0, "source": "seed"})

    def test_the_backfill_is_spread_over_passes(self):
        runs, gh = deploys(60, lambda i: 600)
        store = dl.collect({}, REPO, runs, NOW, gh)
        self.assertEqual((len(store["samples"]), store["backlog"]), (dl.MAX_COMPARES_PER_PASS, 59 - dl.MAX_COMPARES_PER_PASS))
        store = dl.collect(store, REPO, runs, NOW, gh)
        self.assertEqual(len(store["samples"]), 2 * dl.MAX_COMPARES_PER_PASS)


class PublishedMetricTest(unittest.TestCase):
    def test_p50_p95_and_targets_are_published_per_repo(self):
        runs, gh = deploys(40, lambda i: 3600 + 60 * i)
        store = dl.collect(dl.collect({}, REPO, runs, NOW, gh), REPO, runs, NOW, gh)
        summary = dl.lag_summary(store, NOW)
        self.assertEqual((summary["targetP50Min"], summary["targetP95Min"]), (30, 90))
        self.assertTrue(60 < summary["p50Min"] < summary["p95Min"])
        self.assertEqual(summary["n"], len(store["samples"]))

    def test_the_feed_carries_limits_and_lag_and_the_alarm_uses_the_measured_limit(self):
        state = {**dh.evaluate(REPO, [{"created_at": "2026-10-25T00:00:00Z", "conclusion": "success", "head_sha": "x"}], {"ahead_by": 3, "commits": []}, NOW),
                 "oldestUnshippedAge": 5000, "limitCommits": 2, "limitAgeS": 9000}
        sample = {"observedAt": NOW, "repos": {REPO: state}, "limits": {REPO: {"commits": 2, "ageS": 9000}}, "lag": {REPO: {"p50Min": 50, "p95Min": 246}}}
        self.assertIn("production-deploy:jovie", dh.judge(sample, NOW), "3 commits behind a measured limit of 2")
        block = dh.feed_block(sample, NOW)
        self.assertEqual((block["limits"][REPO]["ageS"], block["lag"][REPO]["p95Min"]), (9000, 246))


if __name__ == "__main__":
    unittest.main()
