#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import pathlib
import re
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-checkin-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_checkin_hud", SOURCE)
HUD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HUD
SPEC.loader.exec_module(HUD)
NOW = dt.datetime(2026, 8, 31, 12, 0, tzinfo=dt.timezone.utc)
SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BANNED = ("GEM OPERATIONS", "FLEET POLICY", "$0", "FAIL 0")
GREEN = re.compile(r"\033\[(?:1;)?(?:32|92)m|\033\[38;5;(?:2|10|22|28|34|40|46|76|82|112|118)m")
TEAM_JOV = re.compile(r"team\s*:\s*JOV|team\s*\(\s*key\s*:\s*\"JOV\"", re.I)


def strip(text: str) -> str:
    return re.sub(r"\033\[[0-9;]*m", "", text)


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


def paint(symphony=None, mq=None, review=None, measured=None, width=200, sha="469d4bb"):
    return HUD.render(
        symphony=symphony
        or {"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True, "totals": None},
        mq=mq or {"ok": True, "count": 0, "rows": []},
        review=review,
        measured=measured or {},
        now=NOW,
        width=width,
        sha=sha,
    )


class UltrawideHudTests(unittest.TestCase):
    def test_banned_ops_labels_and_invented_zero_never_appear(self):
        output = paint(
            {"ok": False, "running": None, "retrying": None, "blocked": None, "cap": None, "rows": [], "up": False},
            {"ok": False, "count": None, "rows": []},
            None,
            {},
        )
        plain = strip(output)
        source = SOURCE.read_text(encoding="utf-8")
        for banned in BANNED:
            self.assertNotIn(banned, plain)
            self.assertNotIn(banned, source)
        self.assertIsNone(GREEN.search(output))
        self.assertIsNone(GREEN.search(source))
        self.assertNotIn("lin_", source)
        self.assertIn("ALIVE", plain)
        self.assertIn("WOW", plain)
        self.assertIn("SHIPS", plain)
        self.assertIn("#1", plain)
        self.assertIn("RUN -/-", plain)
        self.assertIn("RETRY -", plain)
        self.assertIn("MQ -", plain)
        self.assertIn("Review -", plain)
        self.assertIn("unmeasured", plain)
        self.assertNotIn("cash", plain.lower())

    def test_alive_tile_does_not_invent_cash_when_measured_missing(self):
        plain = strip(paint(measured={}))
        self.assertIn("UNKNOWN", plain)
        self.assertIn("unmeasured", plain)
        self.assertNotIn("cash", plain.lower())
        self.assertNotIn("$", plain)
        self.assertNotIn("80,000", plain)
        self.assertNotIn("burn", plain.lower())
        self.assertNotIn("weekly revenue", plain.lower())

    def test_review_query_is_project_filtered_never_team_jov(self):
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("440ea404-041f-461e-ae45-dd6a2e98e4a1", source)
        self.assertIn("symphony-ui-pilot-96d6b9c5b2d5", source)
        self.assertIn("project(id: $id)", HUD.LINEAR_QUERY)
        self.assertIn("In Review", HUD.LINEAR_QUERY)
        self.assertIsNone(TEAM_JOV.search(source))
        self.assertNotIn("team:JOV", source)
        self.assertNotIn("team: JOV", source)
        self.assertEqual(HUD.LIVE_PROJECT_ID, "440ea404-041f-461e-ae45-dd6a2e98e4a1")

    def test_layout_uses_terminal_width_not_fixed_skinny_list(self):
        output = paint(width=200)
        plain = strip(output)
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("get_terminal_size", source)
        self.assertIn("ST", plain)
        self.assertIn("ATTEMPT", plain)
        self.assertIn("TURN", plain)
        self.assertIn("TOKENS", plain)
        self.assertIn("ELAPSED", plain)
        self.assertIn("WS/PR", plain)
        header = plain.splitlines()[0]
        self.assertGreaterEqual(len(header), 80)
        self.assertGreaterEqual(max(len(line) for line in plain.splitlines()), 160)
        self.assertNotIn("─" * 56 + "\n", output)
        self.assertIn("JOVIE", header)
        self.assertIn("main", header)
        self.assertIn("469d4bb", header)

    def test_omits_zero_buckets_and_never_prints_fail_zero(self):
        plain = strip(
            paint(
                {"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True},
                {"ok": True, "count": 0, "rows": []},
                0,
            )
        )
        self.assertNotIn("RUN ", plain)
        self.assertNotIn("RETRY 0", plain)
        self.assertNotIn("MQ 0", plain)
        self.assertNotIn("Review 0", plain)
        self.assertNotIn("FAIL 0", plain)
        self.assertIn("JOVIE", plain)
        self.assertIn("main", plain)

    def test_running_issue_from_official_state_renders_id_attempt_elapsed(self):
        started = "2026-08-31T11:57:00Z"
        payload = {
            "counts": {"running": 1, "retrying": 1, "blocked": 0},
            "running": [
                {
                    "issue_identifier": "JOV-5491",
                    "title": "Add Ovi quick launchers",
                    "url": "https://linear.app/jovie/issue/JOV-5491",
                    "attempt": 2,
                    "workspace_path": "/home/tim/symphony-elixir-workspaces/JOV-5491",
                    "started_at": started,
                    "turn_count": 4,
                    "tokens": {"input_tokens": 8234, "output_tokens": 4101, "total_tokens": 12335},
                    "last_message": "turn completed",
                    "last_event": "turn_completed",
                    "seconds": 180,
                }
            ],
            "retrying": [
                {
                    "issue_identifier": "JOV-5488",
                    "error": "hook_failed: after_create exploded\nmore",
                    "attempt": 3,
                    "due_at": "2026-08-31T12:05:00Z",
                    "workspace_path": "/home/tim/symphony-elixir-workspaces/JOV-5488",
                }
            ],
            "blocked": [],
            "codex_totals": {"input_tokens": 45678, "output_tokens": 23456, "total_tokens": 69134},
            "hook_failed": 1,
            "generated_at": "2026-08-31T12:00:00Z",
        }
        fake = mock.Mock()
        fake.read.return_value = json.dumps(payload).encode()
        fake.__enter__ = mock.Mock(return_value=fake)
        fake.__exit__ = mock.Mock(return_value=False)
        with mock.patch.object(HUD.urllib.request, "urlopen", return_value=fake) as opener:
            state = HUD.fetch_symphony("http://127.0.0.1:4043/api/v1/state", cap=3)
        self.assertIn("4043", opener.call_args.args[0])
        self.assertEqual(state["running"], 1)
        self.assertEqual(state["retrying"], 1)
        self.assertEqual(state["rows"][0]["id"], "JOV-5488")
        self.assertEqual(state["rows"][1]["id"], "JOV-5491")
        self.assertEqual(state["rows"][1]["attempt"], 2)
        self.assertEqual(state["rows"][1]["turn"], 4)
        output = paint(
            state,
            {
                "ok": True,
                "count": 1,
                "rows": [{"kind": "mq", "number": 16796, "title": "check-in HUD + burrito", "enqueued": started, "position": 5}],
            },
            11,
            measured={"ships": {"receipts": [receipt()]}},
        )
        plain = strip(output)
        self.assertIn("JOV-5491", plain)
        self.assertIn("2", plain)
        self.assertIn("3m", plain)
        self.assertIn("4", plain)
        self.assertIn("JOV-5488", plain)
        self.assertIn("in 5m", plain)
        running_line = next(line for line in plain.splitlines() if line.startswith("●") and "JOV-5491" in line)
        self.assertTrue(running_line.rstrip().endswith("JOV-5491") or "…/JOV-5491" in running_line or running_line.rstrip().endswith("…"))
        self.assertLess(plain.index("JOV-5488"), plain.index("JOV-5491"))
        self.assertLess(plain.index("JOV-5491"), plain.index("#16796"))
        self.assertIn("RUN 1/3", plain)
        self.assertIn("RETRY 1", plain)
        self.assertIn("MQ 1", plain)
        self.assertIn("Review 11", plain)
        self.assertIn("burrito :4043 up", plain)
        self.assertIn("hook_failed 1", plain)
        self.assertIn("totals in 45678 out 23456", plain)
        self.assertIn("receipted this week", plain)
        self.assertNotIn("GEM OPERATIONS", plain)
        self.assertNotIn("$0", plain)

    def test_ships_are_receipted_this_week_only_and_sparklines_need_series(self):
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
        missing = strip(paint(measured={"ships": {"receipts": [receipt()]}}))
        self.assertIn("1", missing)
        self.assertNotIn("█", missing)
        drawn = strip(
            paint(
                measured={
                    "alive": {
                        "cashUsd": 80000,
                        "weeklyBurnUsd": 4000,
                        "weeklyRevenueUsd": 6000,
                        "weeklyRevenueGrowthRate": 0.08,
                    },
                    "wow": {"thisWeekRevenueUsd": 6000, "lastWeekRevenueUsd": 5000},
                    "ships": {"receipts": [receipt()]},
                    "series": {"alive": [10, 20, 40, 80], "wow": [0.02, 0.05, 0.08, 0.11], "ships": [0, 1, 1, 2]},
                }
            )
        )
        self.assertTrue(any(ch in drawn for ch in HUD.BARS))
        self.assertIn("20.0%", drawn)
        self.assertIn("$80,000", drawn)
        self.assertNotIn("$0", drawn)

    def test_workflow_cap_reads_max_concurrent_agents(self):
        cap = HUD.read_workflow_cap(ROOT / "scripts/hermes/symphony/WORKFLOW.md")
        self.assertEqual(cap, 3)


if __name__ == "__main__":
    unittest.main()
