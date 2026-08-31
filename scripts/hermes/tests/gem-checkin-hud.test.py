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
STARTED = "2026-08-31T11:57:00Z"


def strip(text: str) -> str:
    return re.sub(r"\033\[[0-9;]*m", "", text)


def receipt(**overrides):
    base = {"linearIssueId": "JOV-1001", "symphonyRef": "job-1", "mergeQueueRef": "mq-1", "prodSha": SHA, "receiptAt": "2026-08-29T12:00:00Z"}
    base.update(overrides)
    return base


def paint(symphony=None, mq=None, review=None, measured=None, width=200, sha="469d4bb", ship_path=None, tps=None):
    return HUD.render(
        symphony=symphony or {"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True, "totals": None, "rate_limits": None, "seconds_running": None},
        mq=mq or {"ok": True, "count": 0, "rows": []},
        review=review,
        measured=measured or {},
        now=NOW,
        width=width,
        sha=sha,
        ship_path=ship_path,
        tps=tps,
    )


def official_state(**overrides):
    payload = {
        "counts": {"running": 1, "retrying": 0, "blocked": 0},
        "running": [{"issue_identifier": "JOV-5491", "title": "Add Ovi quick launchers", "attempt": 2, "started_at": STARTED, "turn_count": 4, "tokens": {"input_tokens": 8234, "output_tokens": 4101, "total_tokens": 12335}, "seconds": 180}],
        "retrying": [],
        "blocked": [],
        "codex_totals": {"input_tokens": 45678, "output_tokens": 23456, "total_tokens": 69134, "seconds_running": 942},
        "rate_limits": {"limit_id": "claude-sonnet-4.5", "primary": {"remaining": 4950, "limit": 5000, "reset_in_seconds": 60}, "secondary": None, "credits": {"unlimited": True, "has_credits": True, "balance": None}},
        "generated_at": "2026-08-31T12:00:00Z",
    }
    payload.update(overrides)
    return payload


def fetch_state(payload):
    fake = mock.Mock()
    fake.read.return_value = json.dumps(payload).encode()
    fake.__enter__ = mock.Mock(return_value=fake)
    fake.__exit__ = mock.Mock(return_value=False)
    with mock.patch.object(HUD.urllib.request, "urlopen", return_value=fake) as opener:
        return HUD.fetch_symphony("http://127.0.0.1:4043/api/v1/state", cap=3), opener


class UltrawideHudTests(unittest.TestCase):
    def test_banned_ops_labels_and_invented_zero_never_appear(self):
        output = paint({"ok": False, "running": None, "retrying": None, "blocked": None, "cap": None, "rows": [], "up": False}, {"ok": False, "count": None, "rows": []}, None, {})
        plain, source = strip(output), SOURCE.read_text(encoding="utf-8")
        for banned in BANNED:
            self.assertNotIn(banned, plain)
            self.assertNotIn(banned, source)
        self.assertIsNone(GREEN.search(output))
        self.assertIsNone(GREEN.search(source))
        self.assertNotIn("lin_", source)
        for token in ("ALIVE", "WOW", "SHIPS", "#1", "RUN -/-", "RETRY -", "MQ -", "Review -", "unmeasured"):
            self.assertIn(token, plain)
        self.assertNotIn("cash", plain.lower())

    def test_alive_tile_does_not_invent_cash_when_measured_missing(self):
        plain = strip(paint(measured={}))
        self.assertIn("UNKNOWN", plain)
        self.assertIn("unmeasured", plain)
        for token in ("cash", "burn", "weekly revenue"):
            self.assertNotIn(token, plain.lower())
        self.assertNotIn("$", plain)
        self.assertNotIn("80,000", plain)

    def test_review_query_is_project_filtered_never_team_jov(self):
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("440ea404-041f-461e-ae45-dd6a2e98e4a1", source)
        self.assertIn("symphony-ui-pilot-96d6b9c5b2d5", source)
        self.assertIn("project(id: $id)", HUD.LINEAR_QUERY)
        self.assertIn("project(id: $id)", HUD.LINEAR_STAGES_QUERY)
        self.assertIn("In Review", HUD.LINEAR_QUERY)
        self.assertIsNone(TEAM_JOV.search(source))
        self.assertNotIn("team:JOV", source)
        self.assertNotIn("team: JOV", source)
        self.assertEqual(HUD.LIVE_PROJECT_ID, "440ea404-041f-461e-ae45-dd6a2e98e4a1")

    def test_layout_uses_terminal_width_not_fixed_skinny_list(self):
        output = paint(width=200)
        plain, source = strip(output), SOURCE.read_text(encoding="utf-8")
        self.assertIn("get_terminal_size", source)
        for token in ("ST", "ATTEMPT", "TURN", "TOKENS", "ELAPSED", "WS/PR"):
            self.assertIn(token, plain)
        header = plain.splitlines()[0]
        self.assertGreaterEqual(len(header), 80)
        self.assertGreaterEqual(max(len(line) for line in plain.splitlines()), 160)
        self.assertNotIn("─" * 56 + "\n", output)
        self.assertIn("JOVIE", header)
        self.assertIn("main", header)
        self.assertIn("469d4bb", header)

    def test_omits_zero_buckets_and_never_prints_fail_zero(self):
        plain = strip(paint({"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True}, {"ok": True, "count": 0, "rows": []}, 0))
        for token in ("RUN ", "RETRY 0", "MQ 0", "Review 0", "FAIL 0"):
            self.assertNotIn(token, plain)
        self.assertIn("JOVIE", plain)
        self.assertIn("main", plain)

    def test_running_issue_from_official_state_renders_id_attempt_elapsed(self):
        payload = official_state(
            counts={"running": 1, "retrying": 1, "blocked": 0},
            running=[{"issue_identifier": "JOV-5491", "title": "Add Ovi quick launchers", "url": "https://linear.app/jovie/issue/JOV-5491", "attempt": 2, "workspace_path": "/home/tim/symphony-elixir-workspaces/JOV-5491", "started_at": STARTED, "turn_count": 4, "tokens": {"input_tokens": 8234, "output_tokens": 4101, "total_tokens": 12335}, "last_message": "turn completed", "last_event": "turn_completed", "seconds": 180}],
            retrying=[{"issue_identifier": "JOV-5488", "error": "hook_failed: after_create exploded\nmore", "attempt": 3, "due_at": "2026-08-31T12:05:00Z", "workspace_path": "/home/tim/symphony-elixir-workspaces/JOV-5488"}],
            hook_failed=1,
        )
        del payload["rate_limits"]
        payload["codex_totals"] = {"input_tokens": 45678, "output_tokens": 23456, "total_tokens": 69134}
        state, opener = fetch_state(payload)
        self.assertIn("4043", opener.call_args.args[0])
        self.assertEqual(state["running"], 1)
        self.assertEqual(state["retrying"], 1)
        self.assertEqual(state["rows"][0]["id"], "JOV-5488")
        self.assertEqual(state["rows"][1]["id"], "JOV-5491")
        self.assertEqual(state["rows"][1]["attempt"], 2)
        self.assertEqual(state["rows"][1]["turn"], 4)
        plain = strip(paint(state, {"ok": True, "count": 1, "rows": [{"kind": "mq", "number": 16796, "title": "check-in HUD + burrito", "enqueued": STARTED, "position": 5}]}, 11, measured={"ships": {"receipts": [receipt()]}}))
        for token in ("JOV-5491", "2", "3m", "4", "JOV-5488", "in 5m", "RUN 1/3", "RETRY 1", "MQ 1", "Review 11", "burrito :4043 up", "hook_failed 1", "totals in 45678 out 23456", "receipted this week"):
            self.assertIn(token, plain)
        running_line = next(line for line in plain.splitlines() if line.startswith("●") and "JOV-5491" in line)
        self.assertTrue(running_line.rstrip().endswith("JOV-5491") or "…/JOV-5491" in running_line or running_line.rstrip().endswith("…"))
        self.assertLess(plain.index("JOV-5488"), plain.index("JOV-5491"))
        self.assertLess(plain.index("JOV-5491"), plain.index("#16796"))
        self.assertNotIn("GEM OPERATIONS", plain)
        self.assertNotIn("$0", plain)

    def test_ships_are_receipted_this_week_only_and_sparklines_need_series(self):
        ships = HUD.count_ships_this_week({"receipts": [receipt(), receipt(linearIssueId="JOV-9", receiptAt="2026-07-01T00:00:00Z"), {"linearIssueId": "JOV-8", "prodSha": SHA}]}, now=NOW)
        self.assertEqual(ships["thisWeek"], 1)
        missing = strip(paint(measured={"ships": {"receipts": [receipt()]}}))
        self.assertIn("1", missing)
        self.assertNotIn("█", missing)
        drawn = strip(paint(measured={"alive": {"cashUsd": 80000, "weeklyBurnUsd": 4000, "weeklyRevenueUsd": 6000, "weeklyRevenueGrowthRate": 0.08}, "wow": {"thisWeekRevenueUsd": 6000, "lastWeekRevenueUsd": 5000}, "ships": {"receipts": [receipt()]}, "series": {"alive": [10, 20, 40, 80], "wow": [0.02, 0.05, 0.08, 0.11], "ships": [0, 1, 1, 2]}}))
        self.assertTrue(any(ch in drawn for ch in HUD.BARS))
        self.assertIn("20.0%", drawn)
        self.assertIn("$80,000", drawn)
        self.assertNotIn("$0", drawn)

    def test_workflow_cap_reads_max_concurrent_agents(self):
        self.assertEqual(HUD.read_workflow_cap(ROOT / "scripts/hermes/symphony/WORKFLOW.md"), 3)

    def test_official_state_totals_render_tps_runtime_in_out(self):
        state, _ = fetch_state(official_state())
        self.assertEqual(state["seconds_running"], 942)
        self.assertEqual(state["totals"]["total_tokens"], 69134)
        tps = HUD.compute_throughput(state["totals"], [{"at": "2026-08-31T11:59:55Z", "total_tokens": 64134, "seconds_running": 937}], now=NOW)
        self.assertAlmostEqual(tps, 1000.0)
        plain = strip(paint(state, tps=tps, width=430))
        for token in ("SYMPHONY STATUS", "Agents 1/3", "1,000 tps", "15m 42s", "in 45,678", "out 23,456", "total 69,134", "claude-sonnet-4.5", "4,950/5,000"):
            self.assertIn(token, plain)
        self.assertAlmostEqual(HUD.compute_throughput(state["totals"], [], now=NOW), 69134 / 942)

    def test_null_rate_limits_render_dash_never_invented(self):
        state, _ = fetch_state(official_state(rate_limits=None))
        self.assertIsNone(state["rate_limits"])
        plain = strip(paint(state, width=430))
        self.assertIn("Rate Limits -", plain)
        self.assertNotIn("4,950/5,000", plain)
        self.assertNotIn("unlimited", plain)

    def test_missing_ci_series_is_dash_not_zero(self):
        plain = strip(paint(width=430))
        for token in ("SYMPHONY STATUS", "Todo/pickup", "ci-fast", "PR Ready", "merge_group CI", "n=- p95 -"):
            self.assertIn(token, plain)
        for token in ("p95 0", "p95 0s", "n=0 p95 0", "$0", "GEM OPERATIONS"):
            self.assertNotIn(token, plain)
        measured = HUD.build_ship_path(
            symphony={"ok": True, "running": 1, "retrying": 2, "cap": 3},
            mq={"ok": True, "count": 3, "rows": [{"number": 1}]},
            linear={"ok": True, "todo": 4, "pickup_durations": [60, 120, 180, 240]},
            github={"ok": True, "pr_open": 2, "pr_open_durations": [300, 400], "ci_fast": 1, "ci_fast_queued": False, "ci_fast_durations": [90, 100, 110], "pr_ready": 0, "pr_ready_queued": False, "pr_ready_durations": None, "merge_group_in": 0, "merge_group_durations": None, "merged": 5, "merged_durations": None, "mq_durations": None},
        )
        ready = next(stage for stage in measured["stages"] if stage["id"] == "pr_ready")
        merged = next(stage for stage in measured["stages"] if stage["id"] == "merged")
        mq = next(stage for stage in measured["stages"] if stage["id"] == "mq")
        self.assertIsNone(ready["p95"])
        self.assertIsNone(merged["p95"])
        self.assertIsNone(mq["p95"])
        self.assertEqual(ready["count"], 0)
        self.assertEqual(measured["bottleneck"]["id"], "running")
        painted = strip(paint(ship_path=measured, width=430))
        self.assertIn("retrying agents 2", painted)
        self.assertIn("n=0 p95 -", painted)
        self.assertNotIn("p95 0", painted)

    def test_p95_empty_is_none_and_queue_beats_worst_p95(self):
        self.assertIsNone(HUD.p95_seconds([]))
        self.assertIsNone(HUD.p95_seconds(None))
        self.assertNotEqual(HUD.p95_seconds([10, 20, 30]), 0)
        path = HUD.build_ship_path(
            symphony={"ok": True, "running": 1, "retrying": 0, "cap": 3},
            mq={"ok": True, "count": 2, "rows": [{"number": 8}, {"number": 9}]},
            linear={"ok": False},
            github={"ok": True, "pr_open": 1, "ci_fast": 0, "ci_fast_durations": [30, 40, 50, 60, 400], "pr_ready": 0, "merge_group_in": 0, "merged": 1, "mq_durations": None},
        )
        self.assertEqual(path["bottleneck"]["id"], "mq")
        self.assertIn("MQ awaiting checks", path["bottleneck"]["reason"])


if __name__ == "__main__":
    unittest.main()
