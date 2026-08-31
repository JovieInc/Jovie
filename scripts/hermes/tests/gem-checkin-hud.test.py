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


def paint(symphony=None, mq=None, review=None, measured=None, width=200, height=None, sha="469d4bb", ship_path=None, tps=None, pr_flow=None, system_pressure=None):
    return HUD.render(
        symphony=symphony or {"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True, "totals": None, "rate_limits": None, "seconds_running": None},
        mq=mq or {"ok": True, "count": 0, "rows": []},
        review=review,
        measured=measured or {},
        now=NOW,
        width=width,
        height=height,
        sha=sha,
        ship_path=ship_path,
        tps=tps,
        pr_flow=pr_flow,
        system_pressure=system_pressure,
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
        return HUD.fetch_symphony("http://127.0.0.1:4041/api/v1/state", cap=40), opener


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
        for token in ("ALIVE", "WOW", "SHIPS", "#1", "AGENTS", "-/-", "FAILURES", "QUEUE", "unmeasured"):
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
        for token in ("ST", "TRY/TURN", "TOKENS", "ELAPSED", "WORKSPACE / PR"):
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
        self.assertIn("4041", opener.call_args.args[0])
        self.assertIn("4041", HUD.DEFAULT_SYMPHONY)
        self.assertEqual(state["running"], 1)
        self.assertEqual(state["retrying"], 1)
        self.assertEqual(state["rows"][0]["id"], "JOV-5488")
        self.assertEqual(state["rows"][1]["id"], "JOV-5491")
        self.assertEqual(state["rows"][1]["attempt"], 2)
        self.assertEqual(state["rows"][1]["turn"], 4)
        plain = strip(paint(state, {"ok": True, "count": 1, "rows": [{"kind": "mq", "number": 16796, "title": "check-in HUD + burrito", "enqueued": STARTED, "position": 5}]}, 11, measured={"ships": {"receipts": [receipt()]}}))
        for token in ("JOV-5491", "2/4", "3m", "JOV-5488", "in 5m", "1/40", "FAILURES", "QUEUE", "Symphony :4041 up", "hook_failed 1", "totals in 45.7K out 23.5K", "receipted this week"):
            self.assertIn(token, plain)
        self.assertNotIn("OpenAI", plain)
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

    def test_missing_ship_receipts_are_unknown_never_zero(self):
        self.assertIsNone(HUD.count_ships_this_week(None, now=NOW)["thisWeek"])
        plain = strip(paint(measured={}))
        self.assertGreaterEqual(plain.count("UNKNOWN"), 3)
        self.assertGreaterEqual(plain.count("unmeasured"), 3)
        self.assertNotIn("receipted this week", plain)

    def test_workflow_cap_reads_max_concurrent_agents(self):
        self.assertEqual(HUD.read_workflow_cap(ROOT / "scripts/hermes/symphony/WORKFLOW.md"), 40)

    def test_official_state_totals_render_tps_runtime_in_out(self):
        state, _ = fetch_state(official_state())
        self.assertEqual(state["seconds_running"], 942)
        self.assertEqual(state["totals"]["total_tokens"], 69134)
        tps = HUD.compute_throughput(state["totals"], [{"at": "2026-08-31T11:59:55Z", "total_tokens": 64134, "seconds_running": 937}], now=NOW)
        self.assertAlmostEqual(tps, 1000.0)
        plain = strip(paint(state, tps=tps, width=430))
        for token in ("AGENTS", "1/40", "THROUGHPUT", "1K tps", "FAILURES", "TOKENS", "69.1K", "Runtime 15m 42s", "claude-sonnet-4.5", "4,950/5,000"):
            self.assertIn(token, plain)
        self.assertAlmostEqual(HUD.compute_throughput(state["totals"], [], now=NOW), 69134 / 942)

    def test_null_rate_limits_render_dash_never_invented(self):
        state, _ = fetch_state(official_state(rate_limits=None))
        self.assertIsNone(state["rate_limits"])
        plain = strip(paint(state, width=430))
        self.assertIn("Rate limits -", plain)
        self.assertNotIn("4,950/5,000", plain)
        self.assertNotIn("unlimited", plain)

    def test_missing_ci_series_is_dash_not_zero(self):
        plain = strip(paint(width=430))
        for token in ("AGENTS", "Todo/pickup", "ci-fast", "PR Ready", "merge_group CI", "n=- p95 -"):
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

    def test_full_height_reserves_current_work_rows_without_layout_shift(self):
        empty = strip(paint(width=200, height=40))
        busy_state, _ = fetch_state(
            official_state(
                running=[
                    {
                        "issue_identifier": f"JOV-{index}",
                        "title": f"Worker {index}",
                        "started_at": STARTED,
                    }
                    for index in range(30)
                ],
                counts={"running": 30, "retrying": 0, "blocked": 0},
            )
        )
        busy = strip(paint(busy_state, width=200, height=40))
        self.assertEqual(len(empty.splitlines()), 40)
        self.assertEqual(len(busy.splitlines()), 40)
        self.assertIn("CURRENT WORK", busy)
        self.assertIn("more active receipts", busy)

    def test_header_has_quiet_identity_description_and_natural_freshness(self):
        state, _ = fetch_state(official_state(generated_at="2026-08-31T11:58:00Z"))
        plain = strip(paint(state, width=200, height=40))
        self.assertIn("● JOVIE", plain)
        self.assertIn(HUD.PRODUCT_DESCRIPTION, plain)
        self.assertIn("Updated 2 minutes ago", plain)
        self.assertNotIn("2026-08-31T", plain)

    def test_shared_shipping_information_architecture_is_explicit(self):
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["capacity"]["representation"], "active-over-limit")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["throughput"]["representation"], "token-rate")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["failures"]["representation"], "count-and-list")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["tokens"]["representation"], "total-and-per-work-item")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["queue"]["representation"], "count")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["pr_flow"]["representation"], "open-and-rolling-24h")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["system_pressure"]["representation"], "thresholded-host-projection")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["ci_matrix"]["representation"], "bounded-server-aggregate")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["shipping_path"]["representation"], "segmented-stage-bar")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["current_work"]["representation"], "receipt-table")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["freshness"]["representation"], "relative-local-time")

    def test_failures_are_semantic_and_unavailable_never_becomes_zero(self):
        unavailable = paint(
            {"ok": False, "running": None, "retrying": None, "blocked": None, "cap": 40, "rows": [], "up": False},
            width=200,
            height=40,
        )
        failing = paint(
            {"ok": True, "running": 1, "retrying": 2, "blocked": 1, "cap": 40, "rows": [], "up": True},
            width=200,
            height=40,
        )
        self.assertIn("FAILURES", strip(unavailable))
        self.assertNotIn("FAILURES 0", strip(unavailable))
        self.assertIn("FAILURES", strip(failing))
        self.assertIn("\033[38;2;255;72;210m3", failing)

    def test_numeric_work_columns_are_right_aligned_and_vendor_is_hidden(self):
        state, _ = fetch_state(official_state())
        plain = strip(paint(state, width=200, height=40))
        header = next(line for line in plain.splitlines() if "TRY/TURN" in line)
        row = next(line for line in plain.splitlines() if "JOV-5491" in line)
        self.assertEqual(header.index("TOKENS") + len("TOKENS"), row.index("12.3K") + len("12.3K"))
        self.assertEqual(header.index("ELAPSED") + len("ELAPSED"), row.index("3m") + len("3m"))
        self.assertNotIn("OpenAI", plain)

    def test_token_notation_boundaries_are_uppercase_and_promote_units(self):
        cases = (
            (999, "999"),
            (1_000, "1K"),
            (999_900, "999.9K"),
            (1_000_000, "1M"),
            (1_000_000_000, "1B"),
        )
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(HUD.compact_tokens(value), expected)
        self.assertEqual(HUD.compact_tokens(None, incoming=500, outgoing=500), "1K")

    def test_token_notation_rounds_fractional_throughput_before_compacting(self):
        self.assertEqual(HUD.compact_tokens(73.6), "74")
        state, _ = fetch_state(official_state())
        plain = strip(paint(state, width=240, height=60, tps=73.6))
        self.assertIn("74 tps", plain)
        self.assertNotIn("73 tps", plain)

    def test_token_notation_covers_rows_overview_and_footer(self):
        state, _ = fetch_state(
            official_state(
                codex_totals={
                    "input_tokens": 999_900,
                    "output_tokens": 1_000_000,
                    "total_tokens": 1_000_000_000,
                    "seconds_running": 1000,
                },
                running=[
                    {
                        "issue_identifier": "JOV-9000",
                        "title": "Normalize tokens",
                        "started_at": STARTED,
                        "tokens": {"total_tokens": 1_000_000, "input_tokens": 999, "output_tokens": 999_001},
                    }
                ],
            )
        )
        plain = strip(paint(state, width=240, height=70, tps=1_000))
        for token in ("1K tps", "1B", "999.9K in · 1M out", "JOV-9000", "1M", "totals in 999.9K out 1M"):
            self.assertIn(token, plain)
        self.assertIsNone(re.search(r"\b[0-9]+(?:,[0-9]{3})+\s+(?:in|out|tps)\b", plain))
        for token in ("1k", "999.9k", "1m", "1b"):
            self.assertNotIn(token, plain)

    def test_queue_position_is_own_column_for_pr_and_missing_reference(self):
        output = paint(
            symphony={"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True, "totals": None, "rate_limits": None, "seconds_running": None},
            mq={
                "ok": True,
                "count": 2,
                "rows": [
                    {"kind": "mq", "number": 16796, "title": "Has PR", "enqueued": STARTED, "position": 5},
                    {"kind": "mq", "number": None, "title": "Missing PR", "enqueued": STARTED, "position": 6},
                ],
            },
            width=220,
            height=70,
        )
        plain = strip(output)
        header = next(line for line in plain.splitlines() if "POS" in line and "WORKSPACE / PR" in line)
        pr_line = next(line for line in plain.splitlines() if "#16796" in line)
        missing_line = next(line for line in plain.splitlines() if "Missing PR" in line)
        pos_col = header.index("POS")
        id_col = header.index("ID")
        title_col = header.index("TITLE")
        workspace_col = header.index("WORKSPACE / PR")
        self.assertEqual(pr_line[pos_col:id_col].strip(), "5")
        self.assertEqual(pr_line[id_col:title_col].strip(), "#16796")
        self.assertEqual(pr_line[workspace_col:].strip(), "-")
        self.assertEqual(missing_line[pos_col:id_col].strip(), "6")
        self.assertEqual(missing_line[id_col:title_col].strip(), "-")
        self.assertEqual(missing_line[workspace_col:].strip(), "-")
        self.assertNotIn("pos 6", plain)
        self.assertNotIn("pos 5", plain)

    def test_pr_flow_uses_explicit_rolling_window_and_truthful_unknowns(self):
        known = strip(
            paint(
                width=430,
                pr_flow={"ok": True, "open_count": 103, "opened_24h": 41, "merged_24h": 37, "generated_at": "2026-08-31T11:58:00Z"},
            )
        )
        for token in ("PR FLOW", "rolling prior 24h", "GitHub", "Updated 2 minutes ago", "OPEN NOW", "103", "OPENED 24H", "41", "MERGED 24H", "37", "NET FLOW", "+4"):
            self.assertIn(token, known)
        unknown = strip(paint(width=430, pr_flow={"ok": False}))
        self.assertIn("source unavailable", unknown)
        self.assertNotIn("OPEN NOW 0", unknown)

    def test_pressure_and_ci_matrix_keep_unknowns_semantic_and_bounded(self):
        pressure = {
            "ok": True,
            "generated_at": "2026-08-31T11:58:00Z",
            "cpu": {"status": "failure", "signal_pct": 131, "load1": 49.0, "cores": 16, "psi": 74},
            "memory": {"status": "healthy", "available_pct": 62, "psi": 1},
            "io": {"status": "warning", "used_pct": 91, "available_pct": 9, "psi": 12, "full": 1},
            "network": {"status": "unknown", "util_pct": None, "mbps": None, "speed_mbps": 1000},
            "slots": {"status": "warning", "util_pct": 80, "running": 32, "cap": 40},
        }
        matrix = {
            "ok": True,
            "open_count": 103,
            "opened_24h": 1,
            "merged_24h": 2,
            "generated_at": "2026-08-31T11:58:00Z",
            "query_ms": 412,
            "ci_matrix": [
                {"number": number, "title": f"Work {number}", "fast": "success", "ready": "pending", "security": "unknown", "visual": "failure", "all": "pending"}
                for number in range(1, 12)
            ],
        }
        output = paint(width=430, height=90, pr_flow=matrix, system_pressure=pressure)
        plain = strip(output)
        for token in ("SYSTEM PRESSURE", "CPU / LOAD", "131%", "MEMORY", "62% available", "DISK / I/O", "9% available", "NETWORK", "rate window pending", "WORKER SLOTS", "32/40", "CI MATRIX", "cached GitHub rollup", "8/103 rows", "412ms", "✓ PASS", "… RUN", "? UNKNOWN", "× FAIL"):
            self.assertIn(token, plain)
        self.assertNotIn("#9 Work 9", plain)
        self.assertIn("\033[38;2;255;72;210m131%", output)

    def test_github_flow_is_one_server_aggregate_and_absent_checks_are_unknown(self):
        payload = {
            "data": {
                "repository": {"pullRequests": {"totalCount": 103}},
                "opened": {"issueCount": 41},
                "merged": {"issueCount": 37},
            }
        }
        with mock.patch.object(HUD, "_gh_json", return_value=payload) as request:
            counts = HUD._github_flow_counts(NOW - dt.timedelta(hours=24), timeout=3)
        self.assertEqual(counts, {"open_count": 103, "opened_24h": 41, "merged_24h": 37})
        request.assert_called_once()
        self.assertIn("graphql", request.call_args.args[0])
        self.assertEqual(HUD.aggregate_check_status([]), "unknown")
        self.assertEqual(HUD.aggregate_check_status([{"name": "Visual", "status": "completed", "conclusion": "failure"}]), "failure")
        self.assertEqual(HUD.aggregate_check_status([{"name": "Visual", "status": "in_progress"}]), "pending")

    def test_gem_ship_hud_service_uses_repo_source_renderer(self):
        template = (ROOT / "scripts/hermes/systemd/gem-ship-hud.service.template").read_text(encoding="utf-8")
        installer = (ROOT / "scripts/hermes/install-gem-ship-hud.sh").read_text(encoding="utf-8")
        self.assertIn("{{JOVIE_REPO}}/scripts/hermes/gem-checkin-tty1.sh", template)
        self.assertIn("WorkingDirectory={{JOVIE_REPO}}", template)
        self.assertNotIn(".local/bin/gem-ship-hud.py", template)
        self.assertIn("gem-ship-hud-activation/v1", installer)
        self.assertIn("GEM_SHIP_HUD_EXPECTED_REVISION", installer)
        self.assertIn("sourceSha256", installer)
        self.assertIn("systemdStartTimestamp", installer)


if __name__ == "__main__":
    unittest.main()
