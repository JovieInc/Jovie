#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import pathlib
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-checkin-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_checkin_hud", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
HUD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HUD
SPEC.loader.exec_module(HUD)

NOW = dt.datetime(2026, 8, 31, 12, 0, tzinfo=dt.timezone.utc)
SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BANNED = ("GEM OPERATIONS", "FLEET POLICY")


def receipt(**overrides):
    base = {
        "linearIssueId": "JOV-1001",
        "symphonyRef": "job-1",
        "mergeQueueRef": "mq-1",
        "prodSha": SHA,
        "receiptAt": "2026-08-29T12:00:00Z",
    }
    base.update(overrides)
    return base


def paint(measured, symphony=None):
    return HUD.render(
        measured=measured,
        symphony=symphony or {"ok": True, "running": 2, "retrying": 1},
        now=NOW,
    )


class CheckinGlassTests(unittest.TestCase):
    def test_unmeasured_stays_unmeasured_and_never_fakes_zero_dollars(self):
        output = paint({})
        for banned in BANNED:
            self.assertNotIn(banned, output)
        self.assertIn("GEM CHECK-IN", output)
        self.assertIn("ALIVE", output)
        self.assertIn("UNKNOWN", output)
        self.assertIn("unmeasured", output)
        self.assertNotIn("$0", output)
        self.assertNotIn("█", output)
        self.assertIn("official burrito 127.0.0.1:4043", output)

    def test_measured_history_draws_sparkline_and_bars(self):
        output = paint(
            {
                "alive": {
                    "cashUsd": 80000,
                    "weeklyBurnUsd": 4000,
                    "weeklyRevenueUsd": 6000,
                    "weeklyRevenueGrowthRate": 0.08,
                },
                "wow": {
                    "thisWeekRevenueUsd": 6000,
                    "lastWeekRevenueUsd": 5000,
                },
                "ships": {"receipts": [receipt()]},
                "series": {
                    "alive": [10, 20, 40, 80],
                    "wow": [0.02, 0.05, 0.08, 0.11],
                    "ships": [0, 1, 1, 2],
                },
            }
        )
        for banned in BANNED:
            self.assertNotIn(banned, output)
        self.assertIn("ALIVE", output)
        self.assertIn("20.0%", output)
        self.assertIn("receipted this week", output)
        self.assertTrue(any(ch in output for ch in HUD.BARS))
        self.assertIn("█", output)
        self.assertIn("run 2", output)
        self.assertIn("retry 1", output)

    def test_zero_revenue_with_burn_is_dead(self):
        output = paint(
            {
                "alive": {
                    "cashUsd": 10000,
                    "weeklyBurnUsd": 1000,
                    "weeklyRevenueUsd": 0,
                }
            }
        )
        self.assertIn("DEAD", output)
        self.assertIn("$0", output)

    def test_zero_users_is_zero_percent_not_a_chart(self):
        output = paint(
            {
                "wow": {
                    "thisWeekActiveUsers": 0,
                    "lastWeekActiveUsers": 0,
                }
            }
        )
        self.assertIn("0.0%", output)
        self.assertIn("active-users", output)
        self.assertIn("unmeasured", output)
        self.assertNotIn("█", output)

    def test_merges_without_receipts_do_not_count(self):
        ships = HUD.count_ships_this_week(
            {
                "receipts": [
                    receipt(),
                    receipt(linearIssueId="JOV-9", receiptAt="2026-07-01T00:00:00Z"),
                    {"linearIssueId": "JOV-8", "prodSha": SHA},
                ]
            },
            now=NOW,
        )
        self.assertEqual(ships["thisWeek"], 1)
        self.assertIn("receipted this week", paint({"ships": {"receipts": [receipt()]}}))

    def test_forbidden_ops_labels_never_return(self):
        source = SOURCE.read_text(encoding="utf-8")
        for banned in BANNED:
            self.assertNotIn(banned, source)
            self.assertNotIn(banned, paint({"series": {"alive": [1, 2, 3]}}))


class SymphonyFetchTests(unittest.TestCase):
    def test_reads_official_state_counts(self):
        payload = json.dumps({"counts": {"running": 4, "retrying": 3}}).encode()
        fake = mock.Mock()
        fake.read.return_value = payload
        fake.__enter__ = mock.Mock(return_value=fake)
        fake.__exit__ = mock.Mock(return_value=False)
        with mock.patch.object(HUD.urllib.request, "urlopen", return_value=fake) as opener:
            state = HUD.fetch_symphony("http://127.0.0.1:4043/api/v1/state")
        opener.assert_called_once()
        self.assertEqual(state, {"ok": True, "running": 4, "retrying": 3})
        self.assertIn("4043", opener.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
