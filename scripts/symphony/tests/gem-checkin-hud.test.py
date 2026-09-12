#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import pathlib
import re
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/gem-checkin-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_checkin_hud", SOURCE)
HUD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HUD
SPEC.loader.exec_module(HUD)
NOW = dt.datetime(2026, 8, 31, 12, 0, tzinfo=dt.timezone.utc)
SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BANNED = ("GEM OPERATIONS", "FLEET POLICY", "$0", "FAIL 0")
GREEN = re.compile(r"\033\[(?:1;)?(?:32|92)m|\033\[38;5;(?:2|10|22|28|34|40|46|76|82|112|118)m")
STARTED = "2026-08-31T11:57:00Z"


def strip(text: str) -> str:
    return re.sub(r"\033\[[0-9;]*m", "", text)


def receipt(**overrides):
    base = {"linearIssueId": "JOV-1001", "symphonyRef": "job-1", "mergeQueueRef": "mq-1", "prodSha": SHA, "receiptAt": "2026-08-29T12:00:00Z"}
    base.update(overrides)
    return base


def paint(symphony=None, mq=None, review=None, measured=None, width=200, height=None, sha="469d4bb", ship_path=None, tps=None, pr_flow=None, system_pressure=None):
    if symphony is not None:
        symphony = {"generated_at": NOW.isoformat(), **symphony}
    return HUD.render(
        symphony=symphony or {"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True, "generated_at": NOW.isoformat(), "totals": None, "rate_limits": None, "seconds_running": None},
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
        return HUD.fetch_symphony("http://127.0.0.1:4041/api/v1/state", cap=8), opener


class ExecutionTruthTests(unittest.TestCase):
    def setUp(self):
        HUD.FRAME_SOURCE_CACHE.clear()
        HUD.LINEAR_PROJECT_CACHE.clear()
        HUD.LINEAR_RETRY_AFTER_SECONDS = 0.0
        HUD.LINEAR_REQUEST_ERROR = None

    def test_stale_cached_attempt_cannot_remain_running_or_retain_tokens(self):
        state, _ = fetch_state(official_state())
        HUD.retain_last_good_source("symphony", state, now=NOW)
        retained = HUD.retain_last_good_source("symphony", {"ok": False}, now=NOW)
        self.assertFalse(retained["ok"])
        self.assertIsNone(retained["running"])
        self.assertIsNone(retained["totals"])
        self.assertEqual(HUD.execution_state(retained["rows"][0], now=NOW), "STALE")
        self.assertEqual(state["running"], 1)
        self.assertNotIn("stale", state["rows"][0])
        text = strip(paint(retained, width=430, height=90))
        self.assertIn("API STALE / UNAVAILABLE", text)
        self.assertIn("Current native job snapshot unavailable", text)
        self.assertNotIn("SESSION / RECENT EVENT", text)

    def test_missing_old_future_and_boundary_snapshots(self):
        for age, fresh in [(None, False), (31, False), (-11, False), (30, True), (0, True)]:
            state, _ = fetch_state(official_state(generated_at=None if age is None else (NOW - dt.timedelta(seconds=age)).isoformat()))
            view = HUD.current_execution_view(state, now=NOW)
            self.assertEqual(view["ok"], fresh)
            self.assertEqual(view["running"], 1 if fresh else None)

    def test_session_activity_needs_session_tokens_and_recent_event(self):
        row = {"kind": "running", "session_id": "session-1", "tokens_total": 12, "last_event_at": NOW.isoformat()}
        self.assertEqual(HUD.execution_state(row, now=NOW), "SESSION / RECENT EVENT")
        for change, expected in [({"session_id": None}, "STARTING / NO SESSION"), ({"tokens_total": 0}, "SESSION / NO TOKENS"), ({"last_event_at": None}, "SESSION / PROGRESS UNKNOWN"), ({"last_event_at": STARTED}, "SESSION / NO RECENT PROGRESS"), ({"kind": "blocked"}, "BLOCKED"), ({"kind": "retrying"}, "RETRYING"), ({"kind": "queued"}, "QUEUED"), ({"kind": "unexpected"}, "UNKNOWN")]:
            self.assertEqual(HUD.execution_state({**row, **change}, now=NOW), expected)

    def test_execution_identity_requires_current_bound_proof(self):
        proof = {
            "issue_identifier": "JOV-1", "attempt": 2, "session_id": "session-1", "lease_id": "lease-1",
            "service": "symphony-elixir.service", "host": "gem", "pid": 4242,
            "process_started_at": STARTED, "process_instance_id": "pid-start-1",
            "artifact_sha256": "a" * 64, "source_revision": SHA,
            "workflow_config_sha256": "b" * 64, "observed_at": NOW.isoformat(),
            "provider": "openai", "model": "gpt-5.6-sol", "account_alias": "sol-1",
        }
        row = HUD._normalize_row({
            "identifier": "JOV-1", "attempt": 2, "session_id": "session-1",
            "last_event_at": NOW.isoformat(), "tokens": {"total_tokens": 10},
            "execution": proof, "model": "selected-model",
        }, "running")
        self.assertTrue(row["execution_proof_valid"])
        self.assertEqual(row["executed_model"], "gpt-5.6-sol")
        self.assertEqual(row["executed_account_alias"], "sol-1")
        for field, value in (("pid", 4243), ("session_id", "old-session"), ("attempt", 1)):
            forged = dict(proof)
            forged[field] = value
            candidate = HUD._normalize_row({
                "identifier": "JOV-1", "attempt": 2, "session_id": "session-1", "codex_app_server_pid": 4242,
                "execution": forged,
            }, "running")
            self.assertFalse(candidate["execution_proof_valid"])
            self.assertIsNone(candidate["executed_model"])
        incomplete = dict(proof)
        del incomplete["workflow_config_sha256"]
        candidate = HUD._normalize_row({
            "identifier": "JOV-1", "attempt": 2, "session_id": "session-1", "execution": incomplete,
        }, "running")
        self.assertFalse(candidate["execution_proof_valid"])
        self.assertIsNone(candidate["executed_provider"])

    def test_configured_or_selected_model_is_never_executed(self):
        row = HUD._normalize_row({"identifier": "JOV-1", "model": "configured-sol", "provider": "selected-provider", "account": "selected-alias", "attempt": 1, "session_id": "session-1", "last_event_at": NOW.isoformat(), "tokens": {"total_tokens": 10}}, "running")
        text = strip("\n".join(HUD.execution_lines(row, 430, now=NOW)))
        self.assertIn("Executed: UNKNOWN", text)
        self.assertIn("provider UNKNOWN", text)
        self.assertIn("account UNKNOWN", text)
        self.assertIn("requested configured-sol", text)
        for state in ("blocked", "retrying", "queued"):
            self.assertIn(state.upper(), strip("\n".join(HUD.execution_lines({**row, "kind": state}, 430, now=NOW))))

    def test_queued_is_preserved_and_unknown_job_status_not_running(self):
        state, _ = fetch_state({"jobs": [{"identifier": "JOV-1", "status": "queued"}, {"identifier": "JOV-2", "status": "mystery"}], "generated_at": NOW.isoformat()})
        self.assertEqual(state["queued"], 1)
        self.assertIsNone(state["running"])
        self.assertEqual([row["id"] for row in state["rows"]], ["JOV-1"])

    def test_wrapper_active_is_not_api_or_capacity_proof(self):
        state = {"ok": False, "rows": [], "service_state": "active", "cap": 30, "linear_gate_until": "2026-08-31T13:00:00Z"}
        text = strip("\n".join(HUD.execution_summary(state, 430, now=NOW)))
        self.assertIn("service active", text)
        self.assertIn("API STALE / UNAVAILABLE", text)
        self.assertIn("RUNNING: UNKNOWN/30", text)
        self.assertIn("Execution identity UNKNOWN", text)

    def test_execution_summary_makes_idle_running_and_failures_obvious(self):
        idle = strip("\n".join(HUD.execution_summary({"ok": True, "rows": [], "running": 0, "cap": 2, "service_state": "active", "generated_at": NOW.isoformat()}, 430, now=NOW)))
        self.assertIn("ACTIVE SLOTS · RUNNING: 0/2", idle)
        self.assertEqual(idle.count("VACANT"), 2)
        self.assertIn("Nothing running", idle)
        self.assertNotIn("Execution identity", idle)
        rows = [{"kind": "running", "id": "JOV-1", "session_id": "s1", "tokens_total": 12, "last_event_at": NOW.isoformat(), "executed_provider": "openai", "executed_model": "gpt-test"}]
        busy = strip("\n".join(HUD.execution_summary({"ok": True, "rows": rows, "running": 1, "cap": 2, "service_state": "active", "generated_at": NOW.isoformat()}, 430, now=NOW)))
        self.assertIn("RUNNING: 1/2", busy)
        self.assertIn("JOV-1", busy)
        self.assertIn("Recent progress · openai/gpt-test", busy)
        self.assertEqual(busy.count("VACANT"), 1)

    def test_active_slots_reserve_capacity_and_bound_overflow_truthfully(self):
        rows = [{"kind": "running", "id": f"JOV-{i}", "session_id": f"s-{i}", "tokens_total": 1, "last_event_at": NOW.isoformat()} for i in range(5)]
        full = strip("\n".join(HUD.execution_summary({"ok": True, "rows": rows, "running": 5, "cap": 10, "generated_at": NOW.isoformat()}, 240, now=NOW)))
        self.assertIn("RUNNING: 5/10", full)
        self.assertEqual(full.count("Recent progress"), 5)
        self.assertEqual(full.count("VACANT"), 5)
        self.assertTrue(full.splitlines()[0].endswith("API FRESH · just now ┐"))
        bounded = strip("\n".join(HUD.execution_summary({"ok": True, "rows": rows, "running": 5, "cap": 12, "generated_at": NOW.isoformat()}, 240, now=NOW, max_slots=4)))
        self.assertIn("… 1 more active runs", bounded)
        self.assertNotIn("VACANT", bounded)
        stale = strip("\n".join(HUD.execution_summary({"ok": False, "stale": True, "rows": rows, "running": None, "cap": 2, "generated_at": NOW.isoformat()}, 240, now=NOW)))
        self.assertIn("RUNNING: UNKNOWN/2", stale)
        self.assertEqual(stale.count("runtime snapshot unavailable or stale"), 2)
        self.assertNotIn("VACANT", stale)

    def test_notification_event_does_not_replace_useful_last_message(self):
        row = {
            "kind": "blocked",
            "id": "JOV-9",
            "title": "Recover worker",
            "last_event": "notification",
            "last_message": "provider quota exhausted",
        }
        text = strip("\n".join(HUD.execution_lines(row, 430, now=NOW)))
        self.assertIn("provider quota exhausted", text)

    def test_next_action_tracks_actual_failure_state(self):
        active = strip("\n".join(HUD.execution_summary({"ok": True, "rows": [{"kind": "running", "session_id": "s", "tokens_total": 1, "last_event_at": NOW.isoformat()}], "running": 1, "retrying": 0, "blocked": 0}, 430, now=NOW)))
        idle = strip("\n".join(HUD.execution_summary({"ok": True, "rows": [], "running": 0, "cap": 1}, 430, now=NOW)))
        self.assertIn("RUNNING: 1/UNKNOWN", active)
        self.assertIn("Recent progress", active)
        self.assertIn("RUNNING: 0/1", idle)
        self.assertIn("Nothing running", idle)
        self.assertNotIn("Execution identity", idle)

    def test_compact_shows_stable_stage_table_without_execution_cards(self):
        row = {"kind": "running", "id": "JOV-1", "title": "Visible work", "session_id": "session-1", "tokens_total": 10, "last_event_at": NOW.isoformat(), "executed_model": "gpt-5.6-sol"}
        state = {"ok": True, "generated_at": NOW.isoformat(), "rows": [row], "running": 1}
        text = strip(paint(state, width=120, height=40))
        self.assertIn("Visible work", text)
        self.assertIn("Recent progress", text)
        failed = {**row, "last_event": "turn_failed"}
        self.assertEqual(HUD.execution_state(failed, now=NOW), "SESSION / ERROR")
        self.assertIn("Executed: UNKNOWN", strip("\n".join(HUD.execution_lines(failed, 430, now=NOW))))
        for width, height in ((80, 24), (120, 30)):
            state["rows"] = [{**row, "id": f"JOV-{i}"} for i in range(4)]
            compact = strip(paint(state, width=width, height=height))
            self.assertIn("JOV-0", compact)
            self.assertIn("Visible work", compact)
            self.assertIn("Recent progress", compact)
        for width in (120, 200):
            state["rows"] = [{**row, "id": f"JOV-{i}", "kind": "queued"} for i in range(4)]
            text = strip(paint(state, width=width, height=40))
            self.assertIn("WAITING", text)
            self.assertNotIn("12 more", text)
            for line in text.splitlines():
                self.assertLessEqual(len(line), width)

    def test_recovered_ultrawide_board_separates_retry_and_stale(self):
        state = {"ok": False, "rows": [{"id": "JOV-1", "kind": "running", "stale": True, "model": "configured-sol"}, {"id": "JOV-2", "kind": "retrying", "due_at": "2026-08-31T12:05:00Z"}]}
        lines = HUD.execution_board(state, 430, 20, now=NOW)
        text = strip("\n".join(lines))
        self.assertIn("STALE · 1 receipts", text)
        self.assertIn("RETRYING · 1 receipts", text)
        self.assertIn("model UNKNOWN", text)
        self.assertIn("in 5m", text)
        self.assertNotIn("configured-sol", text)
        self.assertLessEqual(len(lines), 20)
        self.assertTrue(all(len(strip(line)) == 430 for line in lines))

    def test_ultrawide_preserves_review_queue(self):
        for width, height in ((300, 60), (430, 90)):
            text = strip(paint(review=7, width=width, height=height))
            self.assertIn("REVIEW 7", text)

    def test_full_canvas_does_not_scroll_last_line(self):
        frame = paint(width=430, height=90)
        self.assertEqual(frame.count("\n"), 89)
        self.assertFalse(frame.endswith("\n"))

    def test_runtime_context_uses_only_bounded_local_readers(self):
        gate = {"schema": "symphony-linear-rate-limit-gate/v1", "recordedAt": STARTED, "resetAt": "2026-08-31T13:00:00Z"}
        with mock.patch.object(HUD.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="active\n")) as run, mock.patch.object(HUD, "load_json_dict", return_value=gate), mock.patch.object(HUD.Path, "read_text", return_value='command: codex -c model="configured-sol"'):
            context = HUD.read_runtime_context(now=NOW)
            self.assertEqual(context["service_state"], "active")
            self.assertEqual(context["configured_model"], "configured-sol")
            self.assertIsNotNone(context["linear_gate_until"])
            self.assertEqual(run.call_args.kwargs["timeout"], 1)
            self.assertNotIn("restart", run.call_args.args[0])
        with mock.patch.object(HUD.subprocess, "run", side_effect=OSError), mock.patch.object(HUD, "load_json_dict", return_value={}), mock.patch.object(HUD.Path, "read_text", side_effect=OSError):
            self.assertEqual(HUD.read_runtime_context(now=NOW)["service_state"], "UNKNOWN")

    def test_runtime_context_surfaces_cursor_cli_health_receipt(self):
        gate = {"schema": "symphony-linear-rate-limit-gate/v1", "recordedAt": STARTED, "resetAt": "2026-08-31T13:00:00Z"}
        health = {"schema": HUD.CURSOR_HEALTH_SCHEMA, "status": "unhealthy", "reasons": ["wrapper_missing", "binary_missing"]}

        def load(path):
            return health if "symphony-cursor-cli" in str(path) else gate

        patches = (mock.patch.object(HUD.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="active\n")), mock.patch.object(HUD, "load_json_dict", side_effect=load), mock.patch.object(HUD.Path, "read_text", return_value='command: cursor-agent --model "cursor-grok-4.6-high-fast"'))
        with patches[0], patches[1], patches[2]:
            context = HUD.read_runtime_context(now=NOW)
            self.assertEqual(context["cursor_cli"], "wrapper_missing,binary_missing")
        for update, expected in (({"status": "admission_held", "throughput": "admission_held", "reasons": []}, "admission_held"), ({"status": "unhealthy", "throughput": "dormant_with_capacity", "reasons": ["dormant_with_capacity"]}, "dormant_with_capacity")):
            health.update(update)
            with mock.patch.object(HUD.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="active\n")), mock.patch.object(HUD, "load_json_dict", side_effect=load), mock.patch.object(HUD.Path, "read_text", return_value='command: cursor-agent --model "cursor-grok-4.6-high-fast"'):
                self.assertEqual(HUD.read_runtime_context(now=NOW)["cursor_cli"], expected)


class ReadableWorkTests(unittest.TestCase):
    def test_titles_join_by_identifier_without_inventing_execution(self):
        raw = official_state(running=[{"issue_identifier": "JOV-1"}], blocked=[{"issue_identifier": "JOV-2", "error": "waiting on JOV-9", "blocked_at": STARTED}])
        state, _ = fetch_state(raw)
        metadata = {"ok": True, "generated_at": NOW.isoformat(), "issues": {"JOV-1": {"title": "Publish release notes"}, "JOV-2": {"title": "Restore worker cache", "assignee": {"name": "Tim"}}}}
        joined = HUD.enrich_issue_titles(state, metadata, now=NOW)
        by_id = {r["id"]: r for r in joined["rows"]}
        self.assertEqual((by_id["JOV-1"]["title"], by_id["JOV-2"]["title"], by_id["JOV-2"]["issue_assignee"]), ("Publish release notes", "Restore worker cache", "Tim"))
        self.assertIsNone(by_id["JOV-1"]["session_id"])
        self.assertFalse(by_id["JOV-1"]["execution_proof_valid"])
        self.assertIsNone(state["rows"][0]["title"])
        text = strip(paint(joined, width=240, height=60))
        for token in ("Publish release notes", "Restore worker cache", "waiting on JOV-9", "Blocked 3 minutes ago", "issue owner Tim"):
            self.assertIn(token, text)
        self.assertNotIn(":4041 title absent", text)

    def test_title_sources_and_stale_metadata_fail_closed(self):
        for item in ({"issue_title": "Root title"}, {"issue": {"title": "Nested title"}}, {"running": {"issue_title": "Run title"}}):
            self.assertIsNotNone(HUD._normalize_row(item, "running")["title"])
        state = {"rows": [{"id": "JOV-1"}, {"id": "JOV-2", "title": "Runtime title"}]}
        metadata = {"ok": True, "generated_at": NOW.isoformat(), "issues": {"JOV-1": {"title": "Linear title"}, "JOV-2": {"title": "Different"}}}
        for change in ({"ok": False}, {"stale": True}, {"generated_at": STARTED}, {"generated_at": None}, {"issues": {}}, {"generated_at": (NOW + dt.timedelta(minutes=1)).isoformat()}):
            joined = HUD.enrich_issue_titles(state, {**metadata, **change}, now=NOW)
            self.assertIsNone(joined["rows"][0]["title"])
            self.assertIn("UNKNOWN", HUD.work_title(joined["rows"][0]))
            self.assertIn("Linear", HUD.work_title(joined["rows"][0]))
            self.assertEqual(joined["rows"][1]["title"], "Runtime title")

    def test_recent_merges_use_merge_time_before_limit_and_stable_ties(self):
        rows = [{"number": i, "title": f"Change {i}", "merged_at": (NOW - dt.timedelta(hours=10-i)).isoformat(), "updatedAt": NOW.isoformat()} for i in range(8)]
        rows.insert(0, {"number": 9999, "title": "Old merge, recent edit", "merged_at": STARTED.replace("11:57", "01:00"), "updatedAt": NOW.isoformat()})
        rows.insert(0, {"number": 10000, "title": "No merge date", "updatedAt": NOW.isoformat()})
        flow = {"ok": True, "merged_rows": rows}
        self.assertEqual([r["number"] for r in HUD.recent_merges(flow)[:5]], [7, 6, 5, 4, 3])
        for width, height in ((80, 24), (120, 40), (240, 60), (430, 90)):
            text = strip(paint(pr_flow=flow, width=width, height=height))
            self.assertLess(text.index("#7 ·"), text.index("#6 ·"))
            self.assertNotIn("#9999", text)
            self.assertNotIn("#10000", text)
        ties = [{"number": n, "merged_at": NOW.isoformat()} for n in (9, 2, 4)]
        self.assertEqual(HUD.recent_merges({"ok": True, "merged_rows": ties}), ties)
        self.assertEqual(HUD.recent_merges({**flow, "stale": True}), [])
        self.assertEqual(HUD.recent_merges({"ok": False}), [])
        self.assertEqual((len(rows), strip(paint(pr_flow=flow, width=215, height=45)).count(" · Change ")), (10, 5))

    def test_github_updated_prefix_proves_latest_merges_before_truncation(self):
        recent = [{"number": i, "mergedAt": (NOW-dt.timedelta(minutes=i)).isoformat(), "updatedAt": NOW.isoformat()} for i in range(5)]
        old = [{"number": 100+i, "mergedAt": STARTED, "updatedAt": NOW.isoformat()} for i in range(95)]
        records = old[:90] + recent + [{**r, "updatedAt": STARTED} for r in old[90:]]
        with mock.patch.object(HUD, "_gh_json", return_value=records) as fetch:
            # Three-minute boundary overlaps fourth-minute fifth merge: fail closed.
            self.assertIsNone(HUD._pr_list("merged", "number,mergedAt", "10", timeout=2))
            records[-1]["updatedAt"] = (NOW-dt.timedelta(hours=1)).isoformat()
            actual = HUD._pr_list("merged", "number,mergedAt", "10", timeout=2)
            self.assertEqual([r["number"] for r in actual[:3]], [0, 1, 2])
            args = fetch.call_args.args[0]
            self.assertEqual(args[args.index("--search")+1], "sort:updated-desc")
            self.assertEqual(args[args.index("--limit")+1], "100")
            records[-1]["updatedAt"] = None
            self.assertIsNone(HUD._pr_list("merged", "number,mergedAt", "10", timeout=2))
            fetch.return_value = recent
            self.assertEqual(len(HUD._pr_list("merged", "number,mergedAt", "10", timeout=2)), 5)
            fetch.return_value = [{"number": 1, "mergedAt": None}]
            self.assertIsNone(HUD._pr_list("merged", "number,mergedAt", "10", timeout=2))
            fetch.return_value = None
            self.assertIsNone(HUD._pr_list("merged", "number,mergedAt", "10", timeout=2))
            HUD._pr_list("open", "number", "10", timeout=2)
            self.assertNotIn("--search", fetch.call_args.args[0])

    def test_missing_or_reduced_cap_keeps_live_titles_and_reports_overflow(self):
        rows = [{"kind": "running", "id": f"JOV-{i}", "title": f"Title {i}"} for i in range(3)]
        for cap in (None, 0, 1):
            state = {"ok": True, "running": 3, "cap": cap, "rows": rows, "linear_gate_until": "2026-08-31T12:05:00Z"}
            text = strip(paint(state, width=240, height=60))
            for i in range(3): self.assertIn(f"Title {i}", text)
            self.assertIn("Intake paused: Linear rate limit", text)
            bounded = strip("\n".join(HUD.execution_summary(state, 120, now=NOW, max_slots=1)))
            self.assertIn("2 more active runs", bounded)

    def test_linear_live_schema_has_no_total_count_and_retains_titles(self):
        self.assertNotIn("totalCount", HUD.LINEAR_STAGES_QUERY)
        payload = {"data": {"issues": {"nodes": [{"identifier": "JOV-1", "title": "Actual title", "state": {"name": "Todo"}}], "pageInfo": {"hasNextPage": False}}}}
        with mock.patch.object(HUD, "_linear_request", return_value=payload): result = HUD.fetch_linear_project()
        self.assertTrue(result["ok"])
        self.assertEqual(result["total_count"], 1)
        self.assertEqual(result["issues"]["JOV-1"]["title"], "Actual title")

    def test_projection_refresh_rejects_old_order_cache_and_omits_expensive_merged_checks(self):
        with mock.patch.object(HUD, "load_json_dict", return_value={"ok": True, "generated_at": NOW.isoformat()}), mock.patch.object(HUD, "_now", return_value=NOW), mock.patch.object(HUD, "_pr_list", return_value=[]) as listing, mock.patch.object(HUD, "_gh_json", return_value={}), mock.patch.object(HUD, "fetch_mq", return_value={}), mock.patch.object(HUD, "_github_flow_counts", return_value=None), mock.patch.object(HUD, "write_json"):
            projection = HUD.fetch_github_ship(allow_background=False)
            self.assertTrue(projection["ok"])
            self.assertEqual(listing.call_count, 2)
            self.assertEqual(listing.call_args_list[1].args[0], "merged")
            self.assertNotIn("statusCheckRollup", listing.call_args_list[1].args[1])
            self.assertEqual(projection["merge_order"], "mergedAt-complete-top5-v1")
            with mock.patch.object(HUD, "load_json_dict", return_value=projection):
                self.assertTrue(HUD.fetch_github_ship()["cache_hit"])
                self.assertEqual(listing.call_count, 2)

    def test_blocker_does_not_substitute_title_event_or_start_for_cause_and_age(self):
        row = {"id": "JOV-3", "title": "Fix artwork", "last_event": "notification", "started": STARTED}
        text = strip("\n".join(HUD.blocker_lines(row, 120, now=NOW)))
        self.assertIn("runtime did not report a failure reason", text)
        self.assertIn("blocked time not reported", text)
        self.assertNotIn("3 minutes ago", text)
        self.assertEqual(text.count("Fix artwork"), 1)
        self.assertNotIn("notification", text)
        retry = strip("\n".join(HUD.blocker_lines({**row, "last_message": "Dependency JOV-9 pending", "due_at": "2026-08-31T12:05:00Z"}, 80, now=NOW)))
        self.assertIn("Dependency JOV-9 pending", retry)
        self.assertIn("Retry in 5m", retry)

    def test_symbols_and_unknown_are_distinct(self):
        for status, glyph in (("success", "✓"), ("failure", "✕"), ("pending", "…"), (None, "? UNKNOWN"), ("unexpected", "? UNKNOWN")):
            text = strip(HUD._matrix_status(status, 10)).strip()
            self.assertEqual(text, glyph)
            self.assertNotIn("PASS", text)
            self.assertNotIn("FAIL", text)

    def test_attention_survives_crowded_small_terminal_and_stale_rows_disappear(self):
        state = {"ok": True, "cap": 10, "running": 10, "blocked": 1, "retrying": 0, "rows": [
            *[{"kind": "running", "id": f"JOV-{i}", "title": f"Distinct title {i}", "last_message": "Working"} for i in range(10)],
            {"kind": "blocked", "id": "JOV-B", "title": "Restore cache", "error": "Dependency JOV-9 unavailable", "blocked_at": STARTED},
        ]}
        for width, height in ((80, 24), (120, 40), (240, 60), (430, 90)):
            text = strip(paint(state, width=width, height=height))
            self.assertEqual(len(text.splitlines()), height)
            self.assertTrue(all(len(line) == width for line in text.splitlines()))
            for token in ("Distinct title 0", "Restore cache", "Dependency JOV-9", "Next:", "RECENTLY MERGED"):
                self.assertIn(token, text)
            stale = strip(paint({**state, "generated_at": STARTED}, width=width, height=height))
            self.assertNotIn("JOV-B", stale)
            self.assertNotIn("Distinct title", stale)
            self.assertIn("BLOCKED: UNKNOWN", stale)
        unknown = strip("\n".join(HUD.execution_summary({"ok": True, "cap": 1, "rows": []}, 120, now=NOW)))
        self.assertIn("occupancy UNKNOWN", unknown)
        self.assertNotIn("VACANT", unknown)


class StableCanvasTests(unittest.TestCase):
    def test_service_reads_actual_console_geometry(self):
        import fcntl
        import os
        import struct
        import subprocess
        import termios
        template = (ROOT / "scripts/symphony/systemd/gem-ship-hud.service.template").read_text()
        command = next(line for line in template.splitlines() if line.startswith("ExecStart="))
        self.assertNotIn("--width", command)
        self.assertNotIn("--height", command)
        self.assertIn("UnsetEnvironment=COLUMNS LINES", template)
        master, slave = os.openpty()
        try:
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 215, 0, 0))
            probe = "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('hud',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.terminal_size()))"
            subprocess.run([sys.executable, "-c", probe, str(SOURCE)], stdout=slave, stderr=subprocess.PIPE, check=True, timeout=5, env={k: v for k, v in os.environ.items() if k not in {"COLUMNS", "LINES"}})
            self.assertEqual(json.loads(os.read(master, 4096).decode().strip()), [215, 45])
        finally:
            os.close(master)
            os.close(slave)

    def test_zero_one_five_zero_and_queue_blockers_keep_every_anchor(self):
        merges = {"ok": True, "generated_at": NOW.isoformat(), "merged_rows": [{"number": i, "title": f"Merge {i}", "merged_at": NOW.isoformat()} for i in range(5)], "ci_matrix": [{"number": 99, "title": "Check association", "fast": "success"}]}
        labels = ("ACTIVE SLOTS", "RECENTLY MERGED", "NEEDS ATTENTION", "WAITING", "OPERATOR HEALTH", "CI MATRIX", "Sources:")
        for width, height in ((80, 24), (120, 40), (215, 45), (430, 90)):
            anchors = []
            for count, blocked_count, queue_count in ((0, 0, 0), (1, 1, 4), (5, 3, 1), (0, 0, 0)):
                runs = [{"kind": "running", "id": f"JOV-{i}", "title": f"Distinct work {i} fix Slot 1 visibility", "session_id": f"s{i}", "tokens_total": 10, "last_event_at": NOW.isoformat(), "last_message": "Making progress\nwith a multiline report\t" * (i + 1)} for i in range(count)]
                blocks = [{"kind": "blocked", "id": f"BLOCK-{i}", "title": "Restore cache", "error": "Dependency JOV-9 unavailable", "blocked_at": STARTED} for i in range(blocked_count)]
                state = {"ok": True, "cap": 5, "running": count, "blocked": blocked_count, "retrying": 0, "rows": runs + blocks}
                mq = {"ok": True, "rows": [{"kind": "mq", "number": i, "title": f"Queue {i}"} for i in range(queue_count)]}
                plain = strip(paint(state, mq, width=width, height=height, pr_flow=merges))
                lines = plain.splitlines()
                anchors.append({label: next((i for i, line in enumerate(lines) if label in line), None) for label in labels})
                self.assertEqual((len(lines), set(map(len, lines))), (height, {width}))
                for slot in range(1, 6): self.assertEqual(sum(f"Slot {slot} ·" in line for line in lines), 1)
                if count == 0: self.assertNotIn("Execution identity UNKNOWN", plain)
                if count == 5: self.assertIn("Distinct work 1 fix Slot 1 visibility", plain)
                if blocked_count:
                    for text in ("Restore cache", "Dependency JOV-9", "Next:"): self.assertIn(text, plain)
                if height >= 45: self.assertEqual(plain.count(" · Merge "), 5)
            self.assertTrue(all(value == anchors[0] for value in anchors))
            if (width, height) == (215, 45):
                self.assertEqual(anchors[0]["RECENTLY MERGED"], 16)
                self.assertEqual(anchors[0]["CI MATRIX"], 33)

    def test_control_characters_cannot_move_the_console_cursor(self):
        self.assertEqual(HUD.clip("title\nreport\tline\r\x1b[2J", 40).strip(), "title report line  [2J")

    def test_fixed_slot_unknown_overflow_and_error_keep_evidence(self):
        unknown = strip("\n".join(HUD.fixed_slots({"ok": False, "rows": []}, 215, now=NOW, detail=True)))
        self.assertEqual(len(unknown.splitlines()), 12)
        self.assertNotIn("VACANT", unknown)
        state = {"ok": True, "running": 6, "cap": 5, "rows": [{"kind": "running", "id": "JOV-1", "title": "Repair", "error": "Quota exhausted", "session_id": "s", "tokens_total": 1, "last_event_at": NOW.isoformat()}]}
        plain = strip("\n".join(HUD.fixed_slots(state, 215, now=NOW, detail=True)))
        for text in ("1 more active runs", "Quota exhausted", "Attempt error", "assigned · issue details not reported"): self.assertIn(text, plain)


class OperatorReceiptTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = pathlib.Path(temporary.name)
        self.workflow = self.root / "WORKFLOW.md"
        self.workflow.write_text("max_concurrent_agents: 5")
        self.receipt = self.root / ".local/state/symphony-elixir/result.md"
        self.receipt.parent.mkdir(parents=True)
        self.receipt.write_text("Completed source repair")
        self.packet = {"updatedAt": NOW.isoformat(), "runtimeInvocation": "native-id", "workflowSha256": HUD.hashlib.sha256(self.workflow.read_bytes()).hexdigest(), "expiresAt": (NOW + dt.timedelta(minutes=5)).isoformat(), "intakeSummary": "No eligible leased issues", "nextAction": "Owner must deliver assignment validation", "externalRepairs": []}
        self.repair = {"nativeWorker": False, "issueIdentifier": "JOV-5552", "title": "Repair components", "status": "completed-source-repair", "active": False, "receiptPath": str(self.receipt), "receiptSha256": HUD.hashlib.sha256(self.receipt.read_bytes()).hexdigest()}
        for patch in (mock.patch.object(HUD, "DEFAULT_WORKFLOW", self.workflow), mock.patch.object(HUD.Path, "home", return_value=self.root), mock.patch.object(HUD, "load_json_dict", side_effect=lambda _: self.packet)):
            patch.start()
            self.addCleanup(patch.stop)

    def read(self, results=None):
        with mock.patch.object(HUD.subprocess, "run", side_effect=results or [mock.Mock(returncode=0, stdout="native-id\n")]):
            return HUD.read_operator_context(now=NOW)

    def test_completed_receipt_is_historical_and_hash_bound(self):
        self.packet["externalRepairs"] = [self.repair]
        result = self.read()
        self.assertEqual(result["intake_summary"], "No eligible leased issues")
        self.assertIn("source repair completed", result["external_summary"])
        self.assertIn("hosted CI unverified", result["external_summary"])
        self.assertNotIn("active", result["external_summary"])
        self.receipt.write_text("Changed receipt")
        self.assertNotIn("external_summary", self.read())
        self.receipt.unlink()
        self.assertNotIn("external_summary", self.read())

    def test_fifo_receipt_never_blocks_the_frame(self):
        import signal
        self.receipt.unlink()
        HUD.os.mkfifo(self.receipt)
        self.packet["externalRepairs"] = [self.repair]
        def timeout(*_): raise AssertionError("FIFO reader blocked")
        previous = signal.signal(signal.SIGALRM, timeout)
        signal.alarm(2)
        try: self.assertNotIn("external_summary", self.read())
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, previous)

    def test_stale_wrong_workflow_and_wrong_invocation_fail_closed(self):
        for key, value in (("updatedAt", STARTED.replace("11:57", "11:50")), ("updatedAt", None), ("updatedAt", (NOW + dt.timedelta(minutes=1)).isoformat()), ("workflowSha256", "wrong"), ("runtimeInvocation", None)):
            with mock.patch.dict(self.packet, {key: value}): self.assertEqual(self.read(), {})
        for result in (mock.Mock(returncode=0, stdout="other"), mock.Mock(returncode=1, stdout=""), OSError("unavailable")):
            self.assertEqual(self.read([result]), {})
        self.workflow.unlink()
        self.assertEqual(self.read(), {})

    def test_active_receipt_requires_matching_live_pid_invocation_and_unit(self):
        live = mock.Mock(returncode=0, stdout="ActiveState=active\nMainPID=42\nInvocationID=repair-id\n")
        self.packet["externalRepairs"] = [{**self.repair, "active": True, "pid": 42, "invocationId": "repair-id", "unit": "symphony-pr-repair-jov5552.service", "route": "Grok 4.6 operator"}]
        results = lambda: [mock.Mock(returncode=0, stdout="native-id"), live]
        for unit in ("symphony-pr-repair-jov5552.service", "symphony-pr-qualification-jov5552-6dba.service"):
            with mock.patch.dict(self.packet["externalRepairs"][0], {"unit": unit}): self.assertIn("External operator active", self.read(results())["external_summary"])
        for change in ({"pid": 0}, {"pid": 41}, {"invocationId": None}, {"invocationId": "old"}, {"unit": "unrelated.service"}, {"nativeWorker": True}):
            with mock.patch.dict(self.packet["externalRepairs"][0], change): self.assertNotIn("external_summary", self.read(results()))
        for response in (mock.Mock(returncode=0, stdout="ActiveState=inactive\nMainPID=0\n"), mock.Mock(returncode=1, stdout=""), OSError("unavailable")):
            self.assertNotIn("external_summary", self.read([mock.Mock(returncode=0, stdout="native-id"), response]))

    def test_expiry_and_invalid_external_receipts_do_not_invent_work(self):
        self.packet["expiresAt"] = STARTED
        with mock.patch.object(HUD.subprocess, "run", return_value=mock.Mock(returncode=0, stdout="native-id")):
            self.assertIn("Native trial stopped", HUD.read_operator_context(now=NOW, service_state="failed")["intake_summary"])
        self.packet["externalRepairs"] = "invalid"
        self.assertIn("receipt expired", self.read()["intake_summary"])
        self.packet["externalRepairs"] = [None, {**self.repair, "receiptPath": str(self.workflow)}, {**self.repair, "status": "unknown"}]
        self.assertNotIn("external_summary", self.read())
        self.receipt.write_bytes(b"x" * 1_000_001)
        self.packet["externalRepairs"] = [self.repair]
        self.assertNotIn("external_summary", self.read())


class UltrawideHudTests(unittest.TestCase):
    def setUp(self):
        HUD.FRAME_SOURCE_CACHE.clear()
        HUD.LINEAR_PROJECT_CACHE.clear()
        HUD.LINEAR_RETRY_AFTER_SECONDS = 0.0
        HUD.LINEAR_REQUEST_ERROR = None

    def test_banned_ops_labels_and_invented_zero_never_appear(self):
        output = paint({"ok": False, "running": None, "retrying": None, "blocked": None, "cap": None, "rows": [], "up": False}, {"ok": False, "count": None, "rows": []}, None, {})
        plain, source = strip(output), SOURCE.read_text(encoding="utf-8")
        for banned in BANNED:
            self.assertNotIn(banned, plain)
            self.assertNotIn(banned, source)
        self.assertIsNone(GREEN.search(output))
        self.assertIsNone(GREEN.search(source))
        self.assertNotIn("lin_", source)
        for token in ("ACTIVE SLOTS", "RUNNING: UNKNOWN", "RECENTLY MERGED", "BLOCKED: UNKNOWN"):
            self.assertIn(token, plain)
        self.assertNotIn("cash", plain.lower())

    def test_alive_tile_does_not_invent_cash_when_measured_missing(self):
        plain = strip(paint(measured={}))
        self.assertIn("UNKNOWN", plain)
        self.assertNotIn("BUSINESS SIGNALS", plain)
        for token in ("cash", "burn", "weekly revenue"):
            self.assertNotIn(token, plain.lower())
        self.assertNotIn("$", plain)
        self.assertNotIn("80,000", plain)

    def test_review_query_is_team_filtered_never_project_gated(self):
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn('LIVE_TEAM_KEY = "JOV"', source)
        self.assertNotIn("440ea404-041f-461e-ae45-dd6a2e98e4a1", source)
        self.assertNotIn("symphony-ui-pilot-96d6b9c5b2d5", source)
        self.assertIn("team: { key: { eq: $teamKey } }", HUD.LINEAR_QUERY)
        self.assertIn("team: { key: { eq: $teamKey } }", HUD.LINEAR_STAGES_QUERY)
        self.assertNotIn("project(id:", HUD.LINEAR_QUERY)
        self.assertNotIn("project(id:", HUD.LINEAR_STAGES_QUERY)
        self.assertIn("In Review", HUD.LINEAR_QUERY)
        self.assertIn("Rework", HUD.LINEAR_STAGES_QUERY)
        self.assertIn("Merging", HUD.LINEAR_STAGES_QUERY)
        self.assertEqual(HUD.LIVE_TEAM_KEY, "JOV")

    def test_layout_uses_terminal_width_not_fixed_skinny_list(self):
        output = paint(width=200)
        plain, source = strip(output), SOURCE.read_text(encoding="utf-8")
        self.assertIn("get_terminal_size", source)
        for token in ("ACTIVE SLOTS", "RECENTLY MERGED", "BLOCKED:"):
            self.assertIn(token, plain)
        header = plain.splitlines()[0]
        self.assertGreaterEqual(len(header), 80)
        self.assertGreaterEqual(max(len(line) for line in plain.splitlines()), 160)
        self.assertNotIn("─" * 56 + "\n", output)
        self.assertIn("JOVIE", header)
        self.assertIn("HUD build", header)
        self.assertNotIn("· main ·", header)
        self.assertIn("469d4bb", header)

    def test_omits_zero_buckets_and_never_prints_fail_zero(self):
        plain = strip(paint({"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 3, "rows": [], "up": True}, {"ok": True, "count": 0, "rows": []}, 0))
        for token in ("RUN ", "RETRY 0", "MQ 0", "Review 0", "FAIL 0"):
            self.assertNotIn(token, plain)
        self.assertIn("JOVIE", plain)
        self.assertIn("HUD build", plain)

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
        for token in ("JOV-5491", "Add Ovi quick launchers", "RUNNING: 1/8", "JOV-5488", "hook_failed: after_create exploded", "Retry in 5m"):
            self.assertIn(token, plain)
        self.assertNotIn("OpenAI", plain)
        running_line = next(line for line in plain.splitlines() if "Slot 1" in line and "JOV-5491" in line)
        self.assertIn("Add Ovi quick launchers", running_line)
        self.assertNotIn("GEM OPERATIONS", plain)
        self.assertNotIn("$0", plain)

    def test_ships_are_receipted_this_week_only_and_sparklines_need_series(self):
        ships = HUD.count_ships_this_week({"receipts": [receipt(), receipt(linearIssueId="JOV-9", receiptAt="2026-07-01T00:00:00Z"), {"linearIssueId": "JOV-8", "prodSha": SHA}]}, now=NOW)
        self.assertEqual(ships["thisWeek"], 1)
        missing = strip(paint(measured={"ships": {"receipts": [receipt()]}}))
        self.assertIn("1", missing)
        self.assertNotIn("█", missing)
        drawn = strip(paint(measured={"alive": {"cashUsd": 80000, "weeklyBurnUsd": 4000, "weeklyRevenueUsd": 6000, "weeklyRevenueGrowthRate": 0.08}, "wow": {"thisWeekRevenueUsd": 6000, "lastWeekRevenueUsd": 5000}, "ships": {"receipts": [receipt()]}, "series": {"alive": [10, 20, 40, 80], "wow": [0.02, 0.05, 0.08, 0.11], "ships": [0, 1, 1, 2]}}))
        self.assertTrue(any(ch in HUD.sparkline([0, 1, 1, 2]) for ch in HUD.BARS))
        self.assertNotIn("BUSINESS SIGNALS", drawn)
        self.assertNotIn("$80,000", drawn)
        self.assertNotIn("$0", drawn)

    def test_missing_ship_receipts_are_unknown_never_zero(self):
        self.assertIsNone(HUD.count_ships_this_week(None, now=NOW)["thisWeek"])
        plain = strip(paint(measured={}))
        self.assertGreaterEqual(plain.count("UNKNOWN"), 3)
        self.assertIn("Recent merge source UNKNOWN", plain)
        self.assertNotIn("receipted this week", plain)

    def test_workflow_cap_reads_max_concurrent_agents(self):
        self.assertEqual(HUD.read_workflow_cap(ROOT / "scripts/symphony/WORKFLOW.md"), 8)

    def test_official_state_totals_render_tps_runtime_in_out(self):
        state, _ = fetch_state(official_state())
        self.assertEqual(state["seconds_running"], 942)
        self.assertEqual(state["totals"]["total_tokens"], 69134)
        tps = HUD.compute_throughput(
            state["totals"],
            [{"at": "2026-08-31T11:59:55Z", "output_tokens": 18456, "scope": "symphony:4041", "unit": "output_tokens"}],
            now=NOW,
        )
        self.assertAlmostEqual(tps, 1000.0)
        plain = strip(paint(state, tps=tps, width=430))
        for token in ("RUNNING: 1/8", "Add Ovi quick launchers", "Starting", "route UNKNOWN"):
            self.assertIn(token, plain)
        self.assertIsNone(HUD.compute_throughput(state["totals"], [], now=NOW))

    def test_output_rate_refuses_counter_reset_and_mixed_scope(self):
        totals = {"output_tokens": 100}
        self.assertIsNone(HUD.compute_throughput(totals, [{"at": "2026-08-31T11:59:55Z", "output_tokens": 200, "scope": "symphony:4041", "unit": "output_tokens"}], now=NOW))
        self.assertIsNone(HUD.compute_throughput(totals, [{"at": "2026-08-31T11:59:55Z", "output_tokens": 50, "scope": "other", "unit": "output_tokens"}], now=NOW))
        self.assertIsNone(HUD.compute_throughput(totals, [{"at": "2026-08-31T11:59:55Z", "output_tokens": 50, "scope": "symphony:4041", "unit": "total_tokens"}], now=NOW))
        self.assertIsNone(HUD.compute_throughput(totals, [{"at": "2026-08-31T11:59:59Z", "output_tokens": 50, "scope": "symphony:4041", "unit": "output_tokens"}], now=NOW))

    def test_null_rate_limits_render_dash_never_invented(self):
        state, _ = fetch_state(official_state(rate_limits=None))
        self.assertIsNone(state["rate_limits"])
        plain = strip(paint(state, width=430))
        self.assertIn("usable capacity UNKNOWN", plain)
        self.assertEqual(HUD.format_rate_limits(None), "UNKNOWN (not reported by Symphony API)")
        self.assertNotIn("4,950/5,000", plain)
        self.assertNotIn("unlimited", plain)

    def test_missing_ci_series_is_dash_not_zero(self):
        plain = strip("\n".join(HUD._ship_path_lines(HUD.empty_ship_path(), 430)))
        for token in ("Todo/pickup", "ci-fast", "PR Ready", "merge_group CI", "now=- samples=0 p95 -"):
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
        painted = strip("\n".join(HUD._ship_path_lines(measured, 430)))
        self.assertIn("retrying agents 2", painted)
        self.assertIn("now=0 samples=0 p95 -", painted)
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
        busy_state["cap"] = 30
        busy = strip(paint(busy_state, width=200, height=40))
        self.assertEqual(len(empty.splitlines()), 40)
        self.assertEqual(len(busy.splitlines()), 40)
        self.assertIn("ACTIVE SLOTS", busy)
        self.assertIn("more active runs", busy)

    def test_header_has_quiet_identity_description_and_natural_freshness(self):
        state, _ = fetch_state(official_state(generated_at="2026-08-31T11:58:00Z"))
        plain = strip(paint(state, width=200, height=40))
        self.assertIn("● JOVIE · SYMPHONY", plain)
        self.assertIn("HUD build", plain)
        self.assertIn("Updated 2 minutes ago", plain)
        self.assertNotIn("2026-08-31T", plain)

    def test_shared_shipping_information_architecture_is_explicit(self):
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["capacity"]["representation"], "active-over-limit")
        self.assertEqual(HUD.SHIPPING_DISPLAY_IA["throughput"]["representation"], "output-token-wall-rate")
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
            {"ok": False, "running": None, "retrying": None, "blocked": None, "cap": 8, "rows": [], "up": False},
            width=200,
            height=40,
        )
        failing = paint(
            {"ok": True, "running": 1, "retrying": 2, "blocked": 1, "cap": 8, "rows": [], "up": True},
            width=200,
            height=40,
        )
        self.assertIn("BLOCKED: UNKNOWN", strip(unavailable))
        self.assertNotIn("BLOCKED: 0", strip(unavailable))
        self.assertIn("BLOCKED: 1 · RETRYING: 2", strip(failing))
        self.assertIn("runtime did not report blocked/retry details", strip(failing))

    def test_numeric_work_columns_are_right_aligned_and_vendor_is_hidden(self):
        state, _ = fetch_state(official_state())
        widths = HUD._col_widths(200)
        header = strip(HUD._table_header(widths))
        row = strip(HUD._job_row(next(item for item in state["rows"] if item["kind"] == "running"), widths, now=NOW))
        self.assertEqual(header.index("TOKENS") + len("TOKENS"), row.index("12.3K") + len("12.3K"))
        self.assertEqual(header.index("ELAPSED") + len("ELAPSED"), row.index("3m") + len("3m"))
        self.assertNotIn("OpenAI", row)

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
        self.assertNotIn("output tok/s", plain)
        self.assertNotIn("73 output tok/s", plain)

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
        for token in ("JOV-9000", "Normalize tokens"):
            self.assertIn(token, plain)
        self.assertIsNone(re.search(r"\b[0-9]+(?:,[0-9]{3})+\s+(?:in|out|tps)\b", plain))
        for token in ("1k", "999.9k", "1m", "1b"):
            self.assertNotIn(token, plain)

    def test_queue_position_is_own_column_for_pr_and_missing_reference(self):
        widths = HUD._col_widths(220)
        header = strip(HUD._table_header(widths))
        pr_line = strip(HUD._job_row({"kind": "mq", "number": 16796, "title": "Has PR", "enqueued": STARTED, "position": 5}, widths, now=NOW))
        missing_line = strip(HUD._job_row({"kind": "mq", "number": None, "title": "Missing PR", "enqueued": STARTED, "position": 6}, widths, now=NOW))
        pos_col = header.index("POS")
        id_col = header.index("ID")
        stage_col = header.index("STAGE")
        title_col = header.index("TITLE")
        workspace_col = header.index("EVIDENCE / PR")
        self.assertEqual(pr_line[pos_col:id_col].strip(), "5")
        self.assertEqual(pr_line[id_col:stage_col].strip(), "#16796")
        self.assertEqual(pr_line[workspace_col:].strip(), "-")
        self.assertEqual(missing_line[pos_col:id_col].strip(), "6")
        self.assertEqual(missing_line[id_col:stage_col].strip(), "-")
        self.assertEqual(missing_line[workspace_col:].strip(), "-")
        self.assertNotIn("pos 6", missing_line)
        self.assertNotIn("pos 5", pr_line)

    def test_active_slots_and_recent_merge_are_separate_truth_sections(self):
        symphony = {
            "ok": True,
            "running": 1,
            "retrying": 0,
            "blocked": 0,
            "cap": 1,
            "rows": [{"kind": "running", "id": "JOV-1", "title": None, "session_id": None}],
            "up": True,
        }
        flow = {
            "ok": True,
            "open_count": 0,
            "opened_24h": 0,
            "merged_24h": 1,
            "ci_matrix": [],
            "merged_rows": [{"kind": "merged", "stage": "merged", "number": 17323, "title": "Repair HUD", "merged_at": NOW.isoformat()}],
        }
        plain = strip(paint(symphony=symphony, pr_flow=flow, width=430, height=90))
        self.assertEqual(plain.count("ACTIVE SLOTS"), 1)
        self.assertEqual(plain.count("RECENTLY MERGED"), 1)
        self.assertIn("JOV-1", plain)
        self.assertIn("MERGED", plain)
        self.assertIn("#17323", plain)
        self.assertIn("BLOCKED: 0", plain)

    def test_recent_merge_and_blocked_sections_are_bounded_and_stable(self):
        blocked = [
            {"kind": "blocked", "id": f"JOV-B{index}", "error": f"failure {index}", "blocked_at": STARTED}
            for index in range(7)
        ]
        merged = [
            {"kind": "merged", "number": 18000 + index, "title": f"Merged {index}", "merged_at": NOW.isoformat()}
            for index in range(6)
        ]
        plain = strip(
            paint(
                symphony={"ok": True, "running": 0, "retrying": 0, "blocked": 7, "cap": 1, "rows": blocked, "generated_at": NOW.isoformat()},
                pr_flow={"ok": True, "open_count": 0, "opened_24h": 0, "merged_24h": 6, "merged_rows": merged, "ci_matrix": []},
                width=430,
                height=90,
            )
        )
        self.assertLess(plain.index("ACTIVE SLOTS"), plain.index("RECENTLY MERGED"))
        self.assertLess(plain.index("RECENTLY MERGED"), plain.index("BLOCKED: 7"))
        for index in range(5):
            self.assertIn(f"#{18000 + index} · Merged", plain)
            self.assertIn(f"failure {index}", plain)
        self.assertNotIn("#18005 · MERGED", plain)
        self.assertNotIn("JOV-B5 ·", plain)
        self.assertIn("… and 2 more blocked", plain)

    def test_stale_blocked_rows_are_not_presented_as_current_failures(self):
        plain = strip(
            paint(
                symphony={
                    "ok": False,
                    "stale": True,
                    "running": None,
                    "retrying": None,
                    "blocked": None,
                    "cap": 1,
                    "rows": [{"kind": "blocked", "id": "JOV-STALE", "error": "old failure", "stale": True}],
                    "generated_at": NOW.isoformat(),
                },
                width=430,
                height=90,
            )
        )
        self.assertIn("BLOCKED: UNKNOWN", plain)
        self.assertIn("Blocked source UNKNOWN", plain)
        self.assertNotIn("JOV-STALE", plain)
        self.assertNotIn("old failure", plain)

    def test_rendered_table_exposes_failure_message_and_execution_identity(self):
        symphony = {
            "ok": True,
            "running": 1,
            "retrying": 0,
            "blocked": 0,
            "cap": 4,
            "rows": [
                {
                    "kind": "running",
                    "id": "JOV-44",
                    "title": "Repair provider",
                    "session_id": "session-1",
                    "last_event": "turn_failed",
                    "last_message": "quota exhausted",
                    "last_event_at": NOW.isoformat(),
                    "tokens_total": 1,
                    "executed_model": "gpt-5.6-sol",
                    "executed_provider": "codex",
                    "executed_account_alias": "seat-b",
                }
            ],
            "up": True,
        }
        plain = strip(paint(symphony=symphony, width=430, height=90))
        row = plain
        self.assertIn("JOV-44 · Repair provider", row)
        self.assertIn("✕ Attempt error", row)
        self.assertIn("codex/gpt-5.6-sol", row)
        self.assertIn("account seat-b", row)

    def test_ci_success_is_separate_from_admission_hold(self):
        self.assertEqual(HUD.admission_status({"isDraft": False, "mergeStateStatus": "BLOCKED"}, in_merge_queue=False), "blocked")
        self.assertEqual(HUD.admission_status({"isDraft": False, "mergeStateStatus": "CLEAN", "labels": [{"name": "hold"}]}, in_merge_queue=False), "blocked")
        self.assertEqual(HUD.admission_status({"isDraft": False, "mergeStateStatus": "CLEAN", "labels": []}, in_merge_queue=False), "clean")
        lines = HUD._ci_matrix_lines(
            {"ok": True, "generated_at": NOW.isoformat(), "ci_matrix": [{"number": 17323, "title": "Green checks, held admission", "fast": "success", "ready": "success", "security": "success", "visual": "success", "all": "success", "admission": "blocked"}]},
            200,
            now=NOW,
        )
        plain = strip("\n".join(lines))
        self.assertIn("✓", plain)
        self.assertNotIn("PASS", plain)
        self.assertIn("HOLD", plain)

    def test_pr_flow_uses_explicit_rolling_window_and_truthful_unknowns(self):
        known = strip(
            paint(
                width=430,
                pr_flow={"ok": True, "open_count": 103, "opened_24h": 41, "merged_24h": 37, "generated_at": "2026-08-31T11:58:00Z"},
            )
        )
        for token in ("PR FLOW", "rolling prior 24h", "GitHub", "Updated 2 minutes ago", "OPEN NOW", "103", "OPENED 24H", "41", "MERGED 24H", "37", "OPENED − MERGED", "+4"):
            self.assertIn(token, known)
        unknown = strip(paint(width=430, pr_flow={"ok": False}))
        self.assertIn("source unavailable", unknown)
        self.assertNotIn("OPEN NOW 0", unknown)

    def test_linear_inventory_paginates_and_rejects_incomplete_totals(self):
        page_one = {"data": {"issues": {"totalCount": 2, "nodes": [{"state": {"name": "Todo"}, "createdAt": STARTED, "startedAt": NOW.isoformat()}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor-1"}}}}
        page_two = {"data": {"issues": {"totalCount": 2, "nodes": [{"state": {"name": "In Review"}}], "pageInfo": {"hasNextPage": False, "endCursor": None}}}}
        with mock.patch.object(HUD, "_linear_request", side_effect=[page_one, page_two]) as request:
            result = HUD.fetch_linear_project()
        self.assertTrue(result["ok"])
        self.assertEqual((result["total_count"], result["pages"], result["todo"], result["review"]), (2, 2, 1, 1))
        self.assertEqual(request.call_args_list[1].kwargs["variables"], {"after": "cursor-1"})

        incomplete = {"data": {"issues": {"totalCount": 2, "nodes": [{"state": {"name": "Todo"}}], "pageInfo": {"hasNextPage": False, "endCursor": None}}}}
        with mock.patch.object(HUD, "_linear_request", return_value=incomplete):
            rejected = HUD.fetch_linear_project()
        self.assertFalse(rejected["ok"])
        self.assertIn("1/2", rejected["source_error"])

        without_metadata = {"data": {"issues": {"nodes": []}}}
        with mock.patch.object(HUD, "_linear_request", return_value=without_metadata):
            rejected = HUD.fetch_linear_project()
        self.assertFalse(rejected["ok"])
        self.assertIn("metadata incomplete", rejected["source_error"])

        partial_metadata = {"data": {"issues": {"totalCount": 0, "nodes": [], "pageInfo": {}}}}
        with mock.patch.object(HUD, "_linear_request", return_value=partial_metadata):
            rejected = HUD.fetch_linear_project()
        self.assertFalse(rejected["ok"])
        self.assertIn("metadata incomplete", rejected["source_error"])

        invalid_metadata = {"data": {"issues": {"totalCount": True, "nodes": {}, "pageInfo": {"hasNextPage": False}}}}
        with mock.patch.object(HUD, "_linear_request", return_value=invalid_metadata):
            rejected = HUD.fetch_linear_project()
        self.assertFalse(rejected["ok"])
        self.assertIn("metadata incomplete", rejected["source_error"])

        repeated = {"data": {"issues": {"totalCount": 2, "nodes": [{"state": {"name": "Todo"}}], "pageInfo": {"hasNextPage": True, "endCursor": "same"}}}}
        with mock.patch.object(HUD, "_linear_request", side_effect=[repeated, repeated]):
            rejected = HUD.fetch_linear_project()
        self.assertFalse(rejected["ok"])
        self.assertIn("cursor repeated", rejected["source_error"])

        over_budget = {"data": {"issues": {"totalCount": HUD.MAX_LINEAR_ISSUES + 1, "nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}}}
        with mock.patch.object(HUD, "_linear_request", return_value=over_budget):
            rejected = HUD.fetch_linear_project()
        self.assertFalse(rejected["ok"])
        self.assertIn("bounded total", rejected["source_error"])

    def test_linear_pagination_has_one_overall_fetch_budget(self):
        page_one = {"data": {"issues": {"totalCount": 2, "nodes": [{"state": {"name": "Todo"}}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor-1"}}}}
        with (
            mock.patch.object(HUD.time, "monotonic", side_effect=[10.0, 10.1, 18.1]),
            mock.patch.object(HUD, "_linear_request", return_value=page_one) as request,
        ):
            rejected = HUD.fetch_linear_project(timeout=8.0)
        self.assertFalse(rejected["ok"])
        self.assertIn("overall fetch budget", rejected["source_error"])
        self.assertEqual(request.call_count, 1)
        self.assertAlmostEqual(request.call_args.kwargs["timeout"], 7.9)

    def test_linear_cache_reuses_last_good_with_stale_error_and_backoff(self):
        good = {
            "ok": True,
            "review": 3,
            "todo": 20,
            "pickup_durations": [60.0],
            "total_count": 23,
            "pages": 1,
            "generated_at": STARTED,
        }
        failure = {
            "ok": False,
            "review": None,
            "todo": None,
            "pickup_durations": None,
            "generated_at": None,
            "source_error": "Linear HTTP 429 rate limited",
        }
        with mock.patch.object(HUD, "fetch_linear_project", side_effect=[good, failure]) as fetch:
            first = HUD.fetch_linear_project_cached(monotonic_now=0.0)
            cached = HUD.fetch_linear_project_cached(monotonic_now=30.0)
            HUD.LINEAR_RETRY_AFTER_SECONDS = 120.0
            stale = HUD.fetch_linear_project_cached(monotonic_now=61.0)
            backed_off = HUD.fetch_linear_project_cached(monotonic_now=100.0)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual((first["review"], cached["review"]), (3, 3))
        self.assertNotIn("stale", cached)
        self.assertTrue(stale["stale"])
        self.assertEqual(stale["generated_at"], STARTED)
        self.assertEqual(stale["source_error"], "Linear HTTP 429 rate limited")
        self.assertEqual(backed_off, stale)
        self.assertEqual(HUD.LINEAR_PROJECT_CACHE["next_fetch_at"], 181.0)

    def test_linear_http_429_records_retry_window_and_current_error(self):
        error = HUD.urllib.error.HTTPError(
            HUD.LINEAR_API,
            429,
            "Too Many Requests",
            {"Retry-After": "120"},
            None,
        )
        with (
            mock.patch.dict(HUD.os.environ, {"LINEAR_API_KEY": "test"}),
            mock.patch.object(HUD.urllib.request, "urlopen", side_effect=error),
        ):
            self.assertIsNone(HUD._linear_request("query { viewer { id } }", timeout=1.0))
        self.assertEqual(HUD.LINEAR_RETRY_AFTER_SECONDS, 120.0)
        self.assertEqual(HUD.LINEAR_REQUEST_ERROR, "Linear HTTP 429 rate limited")

    def test_pressure_and_ci_matrix_keep_unknowns_semantic_and_bounded(self):
        pressure = {
            "ok": True,
            "generated_at": "2026-08-31T11:58:00Z",
            "cpu": {"status": "failure", "signal_pct": 131, "load_pct": 131, "load1": 49.0, "cores": 16, "psi": 74},
            "memory": {"status": "healthy", "available_pct": 62, "psi": 1},
            "disk": {
                "status": "warning",
                "state": "fresh",
                "available_pct": 9,
                "used_pct": 91,
                "source": "shutil.disk_usage('/')",
                "unit": "capacity percent",
                "sampled_at": "2026-08-31T11:58:00Z",
            },
            "io": {
                "status": "warning",
                "state": "fresh",
                "some_avg10_pct": 24,
                "full_avg10_pct": 12,
                "source": "/proc/pressure/io",
                "unit": "stall percent over 10s",
                "sampled_at": "2026-08-31T11:58:00Z",
            },
            "network": {"status": "unknown", "util_pct": None, "mbps": None, "speed_mbps": 1000},
            "slots": {"status": "warning", "util_pct": 75, "running": 6, "cap": 8},
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
        for token in ("SYSTEM PRESSURE", "CPU LOAD / STALL", "load 131%", "MEMORY", "62% available", "ROOT DISK FREE", "9% free", "I/O FULL PSI", "12% full", "NETWORK", "rate window pending", "WORKER SLOTS", "6/8", "CI MATRIX", "8 of 103 open PRs", "✓", "…", "? UNKNOWN", "✕"):
            self.assertIn(token, plain)
        self.assertNotIn("/proc/", plain)
        self.assertNotIn("query_ms", plain)
        self.assertNotIn("DISK / I/O", plain)
        self.assertNotIn("#9 Work 9", plain)
        self.assertIn("\033[38;2;255;103;125mload 131%", output)

    def test_disk_capacity_and_io_pressure_are_separate_source_metrics(self):
        psi_samples = (
            {"some": 2.0, "full": None, "error": None},
            {"some": 1.0, "full": 0.0, "error": None},
            {"some": 24.0, "full": 12.0, "error": None},
        )
        disk_usage = mock.Mock(total=100, used=77, free=23)
        with (
            mock.patch.object(HUD.os, "cpu_count", return_value=16),
            mock.patch.object(HUD.os, "getloadavg", return_value=(8.0, 0.0, 0.0)),
            mock.patch.object(HUD, "_psi", side_effect=psi_samples),
            mock.patch.object(HUD.shutil, "disk_usage", return_value=disk_usage),
            mock.patch.object(HUD.Path, "read_text", return_value="MemTotal: 100 kB\nMemAvailable: 50 kB\n"),
            mock.patch.object(HUD, "_net_sample", return_value=None),
            mock.patch.object(HUD, "load_json_dict", return_value={}),
        ):
            pressure = HUD.fetch_system_pressure(
                {"running": 1, "cap": 4},
                state_path=ROOT / ".tmp-system-pressure.json",
                now=NOW,
            )

        disk = pressure["disk"]
        io = pressure["io"]
        self.assertEqual(disk["available_pct"], 23)
        self.assertEqual(disk["status"], "healthy")
        self.assertEqual(disk["source"], "shutil.disk_usage('/')")
        self.assertEqual(disk["unit"], "capacity percent")
        self.assertEqual(disk["state"], "fresh")
        self.assertEqual(disk["mount"], "/")
        self.assertAlmostEqual(disk["free_gib"], 23 / (1024**3))
        self.assertAlmostEqual(disk["total_gib"], 100 / (1024**3))
        self.assertEqual(io["some_avg10_pct"], 24)
        self.assertEqual(io["full_avg10_pct"], 12)
        self.assertEqual(io["status"], "warning")
        self.assertEqual(io["source"], "/proc/pressure/io")
        self.assertEqual(io["unit"], "stall percent")
        self.assertEqual(io["state"], "fresh")
        self.assertNotIn("available_pct", io)
        self.assertNotIn("used_pct", io)

        plain = strip(paint(width=430, height=90, system_pressure=pressure))
        lines = plain.splitlines()
        label_index = next(index for index, line in enumerate(lines) if "ROOT DISK FREE" in line and "I/O FULL PSI" in line)
        labels, values = lines[label_index], lines[label_index + 1]
        disk_column = labels.index("ROOT DISK FREE")
        io_column = labels.index("I/O FULL PSI")
        network_column = labels.index("NETWORK")
        self.assertIn("23% free", values[disk_column:io_column])
        self.assertNotIn("23%", values[io_column:network_column])
        self.assertIn("12% full", values[io_column:network_column])

    def test_disk_and_io_render_unknown_stale_and_error_without_invented_numbers(self):
        base = {
            "ok": True,
            "generated_at": "2026-08-31T11:58:00Z",
            "cpu": {},
            "memory": {},
            "network": {},
            "slots": {},
        }
        unknown = strip(
            paint(
                width=430,
                height=90,
                system_pressure={
                    **base,
                    "disk": {"status": "unknown", "state": "unknown", "available_pct": None, "used_pct": None, "source": "shutil.disk_usage('/')", "unit": "capacity percent", "sampled_at": None},
                    "io": {"status": "unknown", "state": "unknown", "some_avg10_pct": None, "full_avg10_pct": None, "source": "/proc/pressure/io", "unit": "stall percent over 10s", "sampled_at": None},
                },
            )
        )
        self.assertGreaterEqual(unknown.count("UNKNOWN"), 2)
        self.assertNotIn("0% free", unknown)
        self.assertNotIn("0% some", unknown)

        stale = strip(
            paint(
                width=430,
                height=90,
                system_pressure={
                    **base,
                    "stale": True,
                    "disk": {"status": "healthy", "state": "fresh", "available_pct": 23, "used_pct": 77, "source": "shutil.disk_usage('/')", "unit": "capacity percent", "sampled_at": "2026-08-31T11:58:00Z"},
                    "io": {"status": "warning", "state": "fresh", "some_avg10_pct": 24, "full_avg10_pct": 12, "source": "/proc/pressure/io", "unit": "stall percent over 10s", "sampled_at": "2026-08-31T11:58:00Z"},
                },
            )
        )
        self.assertIn("STALE · 23% free", stale)
        self.assertIn("STALE · 12% full", stale)

        errored = strip(
            paint(
                width=430,
                height=90,
                system_pressure={
                    **base,
                    "disk": {"status": "unknown", "state": "error", "available_pct": None, "used_pct": None, "source": "shutil.disk_usage('/')", "unit": "capacity percent", "sampled_at": None, "error": "unavailable"},
                    "io": {"status": "unknown", "state": "error", "some_avg10_pct": None, "full_avg10_pct": None, "source": "/proc/pressure/io", "unit": "stall percent over 10s", "sampled_at": None, "error": "unavailable"},
                },
            )
        )
        self.assertGreaterEqual(errored.count("ERROR"), 2)
        self.assertNotIn("0% free", errored)
        self.assertNotIn("0% full", errored)

    def test_pressure_collection_reports_source_errors_instead_of_false_healthy(self):
        with mock.patch.object(HUD.Path, "read_text", return_value="some avg10=4.00 avg60=1.00 total=1\nfull avg10=2.00 avg60=1.00 total=1\n"):
            self.assertEqual(HUD._psi(HUD.Path("/proc/pressure/io")), {"some": 4.0, "full": 2.0, "error": None})
        with mock.patch.object(HUD.Path, "read_text", side_effect=OSError("unavailable")):
            self.assertEqual(HUD._psi(HUD.Path("/proc/pressure/io")), {"some": None, "full": None, "error": "unavailable"})

        with (
            mock.patch.object(HUD.os, "cpu_count", return_value=16),
            mock.patch.object(HUD.os, "getloadavg", return_value=(8.0, 0.0, 0.0)),
            mock.patch.object(
                HUD,
                "_psi",
                side_effect=(
                    {"some": 2.0, "full": None, "error": None},
                    {"some": 1.0, "full": 0.0, "error": None},
                    {"some": 4.0, "full": 2.0, "error": None},
                ),
            ),
            mock.patch.object(HUD.shutil, "disk_usage", side_effect=OSError("unavailable")),
            mock.patch.object(HUD.Path, "read_text", side_effect=OSError("unavailable")),
            mock.patch.object(HUD, "_net_sample", return_value=None),
            mock.patch.object(HUD, "load_json_dict", return_value={}),
        ):
            pressure = HUD.fetch_system_pressure(
                {"running": 1, "cap": 4},
                state_path=ROOT / ".tmp-system-pressure.json",
                now=NOW,
            )

        self.assertEqual(pressure["disk"]["state"], "error")
        self.assertEqual(pressure["disk"]["error"], "unavailable")
        self.assertEqual(pressure["memory"]["state"], "error")
        self.assertEqual(pressure["memory"]["error"], "unavailable")
        plain = strip(paint(width=430, height=90, system_pressure=pressure))
        self.assertGreaterEqual(plain.count("ERROR"), 2)
        self.assertNotIn("0% free", plain)

    def test_each_health_metric_has_sourced_exact_normal_amber_red_boundaries(self):
        cases = (
            ("cpu", HUD.cpu_health_status, ((74.99, "healthy"), (75, "warning"), (124.99, "warning"), (125, "failure"), (None, "unknown"))),
            ("disk", HUD.disk_health_status, ((15, "healthy"), (14.99, "warning"), (5, "warning"), (4.99, "failure"), (None, "unknown"))),
            ("io", HUD.io_health_status, ((10, "healthy"), (10.01, "warning"), (19.99, "warning"), (20, "failure"), (None, "unknown"))),
            ("network", HUD.network_health_status, ((59.99, "healthy"), (60, "warning"), (84.99, "warning"), (85, "failure"), (None, "unknown"))),
            ("worker slots", HUD.worker_slot_health_status, ((100, "healthy"), (100.01, "warning"), (124.99, "warning"), (125, "failure"), (None, "unknown"))),
        )
        for metric, classifier, boundaries in cases:
            for value, expected in boundaries:
                with self.subTest(metric=metric, value=value):
                    self.assertEqual(classifier(value), expected)

    def test_network_uses_physical_default_route_and_parses_sysfs_speed(self):
        files = {
            "/proc/net/dev": "Inter-| Receive | Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n enp9s0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n docker0: 9000 0 0 0 0 0 0 0 10000 0 0 0 0 0 0 0\n veth1: 8000 0 0 0 0 0 0 0 7000 0 0 0 0 0 0 0\n",
            "/proc/net/route": "Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT\nenp9s0 00000000 00000000 0001 0 0 0 00000000 0 0 0\n",
            "/sys/class/net/enp9s0/operstate": "up\n",
            "/sys/class/net/enp9s0/speed": "1000\n",
        }

        def read_text(path, *args, **kwargs):
            key = str(path)
            if key in files:
                return files[key]
            raise OSError(key)

        def exists(path):
            return str(path) == "/sys/class/net/enp9s0/device"

        with mock.patch.object(HUD.Path, "read_text", autospec=True, side_effect=read_text), mock.patch.object(HUD.Path, "exists", autospec=True, side_effect=exists):
            sample = HUD._net_sample()
        self.assertEqual(sample, {"interface": "enp9s0", "rx": 1000, "tx": 2000, "speed_mbps": 1000})

        memory_cases = (
            (20, 9.99, "healthy"),
            (19.99, 9.99, "warning"),
            (10, 10, "warning"),
            (9.99, 0, "failure"),
            (50, 30, "failure"),
            (None, None, "unknown"),
        )
        for available_pct, psi_pct, expected in memory_cases:
            with self.subTest(metric="memory", available_pct=available_pct, psi_pct=psi_pct):
                self.assertEqual(HUD.memory_health_status(available_pct, psi_pct), expected)

    def test_legitimate_healthy_pressure_has_visible_text_cues_and_metric_contracts(self):
        sampled_at = "2026-08-31T12:00:00Z"
        pressure = {
            "ok": True,
            "generated_at": sampled_at,
            "cpu": {"status": "healthy", "state": "fresh", "signal_pct": 50, "load1": 8, "cores": 16, "psi": 2, "source": "getloadavg + /proc/pressure/cpu", "unit": "load/PSI percent", "sampled_at": sampled_at},
            "memory": {"status": "healthy", "state": "fresh", "available_pct": 50, "psi": 2, "source": "/proc/meminfo + /proc/pressure/memory", "unit": "free/PSI percent", "sampled_at": sampled_at},
            "disk": {"status": "healthy", "state": "fresh", "available_pct": 23, "used_pct": 77, "source": "shutil.disk_usage('/')", "unit": "capacity percent", "sampled_at": sampled_at},
            "io": {"status": "healthy", "state": "fresh", "some_avg10_pct": 8, "full_avg10_pct": 4, "source": "/proc/pressure/io", "unit": "stall percent over 10s", "sampled_at": sampled_at},
            "network": {"status": "healthy", "state": "fresh", "util_pct": 20, "mbps": 200, "speed_mbps": 1000, "source": "/proc/net/dev + /sys/class/net", "unit": "Mbps/link percent", "sampled_at": sampled_at},
            "slots": {"status": "healthy", "state": "fresh", "util_pct": 50, "running": 2, "cap": 4, "source": "Symphony state", "unit": "agents/capacity percent", "sampled_at": sampled_at},
        }
        plain = strip(paint(width=430, height=90, system_pressure=pressure))
        self.assertEqual(plain.count("✓ NORMAL"), 7)
        self.assertNotIn("× RED", plain)
        self.assertNotIn("! AMBER", plain)
        for metric in ("cpu", "memory", "disk", "io", "network", "slots"):
            with self.subTest(metric=metric):
                self.assertTrue(pressure[metric]["source"])
                self.assertTrue(pressure[metric]["unit"])
                self.assertEqual(pressure[metric]["sampled_at"], sampled_at)

    def test_operator_hierarchy_is_stable_and_critical_dominates_without_color(self):
        sampled_at = "2026-08-31T12:00:00Z"
        pressure = {
            "ok": True,
            "generated_at": sampled_at,
            "cpu": {"status": "failure", "state": "fresh", "signal_pct": 125, "load_pct": 125, "load1": 20, "cores": 16, "psi": 125, "source": "getloadavg + /proc/pressure/cpu", "unit": "load/PSI percent", "window": "load1 + PSI avg10", "denominator": "16 cores; red at 125%", "sampled_at": sampled_at},
            "memory": {"status": "healthy", "state": "fresh", "available_pct": 50, "psi": 2, "source": "/proc/meminfo + /proc/pressure/memory", "unit": "free/PSI percent", "window": "point + PSI avg10", "denominator": "100% memory; PSI red at 30%", "sampled_at": sampled_at},
            "disk": {"status": "warning", "state": "fresh", "available_pct": 10, "used_pct": 90, "source": "shutil.disk_usage('/')", "unit": "capacity percent", "window": "point", "denominator": "100% root volume", "sampled_at": sampled_at},
            "io": {"status": "healthy", "state": "fresh", "some_avg10_pct": 8, "full_avg10_pct": 4, "source": "/proc/pressure/io", "unit": "stall percent", "window": "avg10", "denominator": "red at 20% full stall", "sampled_at": sampled_at},
            "network": {"status": "healthy", "state": "fresh", "util_pct": 20, "mbps": 200, "speed_mbps": 1000, "source": "/proc/net/dev + /sys/class/net", "unit": "Mbps/link percent", "window": "5 seconds", "denominator": "1000 Mbps link", "sampled_at": sampled_at},
            "slots": {"status": "healthy", "state": "fresh", "util_pct": 50, "running": 2, "cap": 4, "source": "Symphony state", "unit": "agents/capacity percent", "window": "point", "denominator": "4 configured agents", "sampled_at": sampled_at},
        }
        critical_state = {
            "ok": True,
            "running": 2,
            "retrying": 1,
            "blocked": 1,
            "cap": 4,
            "rows": [
                {"kind": "blocked", "id": "JOV-1", "title": "Blocked release", "started": STARTED},
                {"kind": "running", "id": "JOV-2", "title": "Healthy worker", "started": STARTED},
            ],
            "up": True,
            "generated_at": sampled_at,
        }
        path = HUD.empty_ship_path()
        path["stages"][5].update({"count": 1, "queued": True, "queue_reason": "MQ awaiting checks"})
        path["bottleneck"] = {"id": "mq", "label": "merge queue", "reason": "MQ awaiting checks"}
        plain = strip(
            paint(
                symphony=critical_state,
                width=430,
                height=90,
                system_pressure=pressure,
                ship_path=path,
                pr_flow={"ok": True, "open_count": 1, "opened_24h": 1, "merged_24h": 0, "generated_at": sampled_at, "query_ms": 10, "ci_matrix": []},
            )
        )
        self.assertIn("× CRITICAL · OPERATOR HEALTH", plain)
        self.assertIn("STALLED/BLOCKED 1", plain)
        self.assertIn("CPU LOAD / STALL RED", plain)
        order = ["ACTIVE SLOTS", "RECENTLY MERGED", "BLOCKED:", "OPERATOR HEALTH", "SYSTEM PRESSURE", "CI MATRIX", "PR FLOW"]
        for before, after in zip(order, order[1:]):
            self.assertLess(plain.index(before), plain.index(after))
        self.assertLess(plain.index("JOV-2"), plain.index("JOV-1"))

    def test_only_operator_action_metrics_receive_hero_blocks(self):
        output = strip(
            paint(
                width=430,
                height=90,
                pr_flow={
                    "ok": True,
                    "open_count": 2,
                    "generated_at": NOW.isoformat(),
                    "ci_matrix": [{"number": 1, "all": "failure"}, {"number": 2, "all": "success"}],
                },
            )
        )
        for label in ("ACTIVE SLOTS", "RECENTLY MERGED", "NEEDS ATTENTION"):
            self.assertIn(label, output)
        self.assertNotIn("BUSINESS SIGNALS", output)
        self.assertNotIn("┏━ THROUGHPUT", output)
        self.assertNotIn("┏━ TOKENS", output)
        self.assertNotIn("OUTPUT RATE", output)
        self.assertLess(output.index("NEEDS ATTENTION"), output.index("SYSTEM PRESSURE"))

    def test_supported_terminal_layouts_are_exact_no_overflow_and_state_stable(self):
        fixtures = (
            {"ok": False, "running": None, "retrying": None, "blocked": None, "cap": None, "rows": [], "up": False},
            {"ok": True, "running": 1, "retrying": 1, "blocked": 0, "cap": 4, "rows": [{"kind": "retrying", "id": "JOV-1", "title": "Retrying"}], "up": True},
            {"ok": True, "running": 1, "retrying": 0, "blocked": 0, "cap": 4, "rows": [{"kind": "running", "id": "JOV-2", "title": "Running"}], "up": True},
        )
        for width, height in ((430, 90), (215, 45), (120, 40), (80, 24)):
            geometries = []
            for state in fixtures:
                plain = strip(paint(symphony=state, width=width, height=height))
                lines = plain.splitlines()
                geometries.append(tuple(len(line) for line in lines))
                with self.subTest(width=width, height=height, state=state.get("ok")):
                    self.assertEqual(len(lines), height)
                    self.assertTrue(all(len(line) == width for line in lines))
                    self.assertIn("ACTIVE SLOTS", plain)
                    self.assertIn("RECENTLY MERGED", plain)
                    self.assertIn("NEEDS ATTENTION", plain)
            self.assertEqual(geometries[0], geometries[1])
            self.assertEqual(geometries[1], geometries[2])

        narrow = strip(paint(width=80, height=24))
        self.assertIn("BLOCKED: 0", narrow)
        self.assertNotIn("CI MATRIX", narrow)
        self.assertNotIn("BUSINESS SIGNALS", narrow)

    def test_linux_console_uses_kernel_palette_sgr_without_truecolor(self):
        failure_pressure = {
            "ok": True,
            "generated_at": NOW.isoformat(),
            "cpu": {"status": "failure", "state": "fresh", "signal_pct": 130},
            **{name: {"status": "unknown", "state": "unknown"} for name in ("memory", "disk", "io", "network", "slots")},
        }
        with mock.patch.dict(HUD.os.environ, {"TERM": "linux"}, clear=False):
            frame = paint(width=120, height=40, system_pressure=failure_pressure)
        self.assertTrue(frame.startswith("\033[40m"))
        self.assertIn("\033[91m", frame)
        self.assertNotIn("38;2;", frame)
        self.assertNotIn("48;2;", frame)

    def test_metric_gauges_and_contracts_are_fixed_width_and_source_visible(self):
        self.assertEqual(HUD.metric_gauge(50, 100), "[█████░░░░░]")
        self.assertEqual(HUD.metric_gauge(None, 100), "[??????????]")
        self.assertEqual(len(HUD.metric_gauge(200, 100)), len(HUD.metric_gauge(0, 100)))
        pressure = {
            "ok": True,
            "generated_at": NOW.isoformat(),
            "cpu": {"status": "healthy", "state": "fresh", "signal_pct": 50, "load1": 8, "cores": 16, "psi": 2, "source": "getloadavg + /proc/pressure/cpu", "unit": "load/PSI percent", "window": "load1 + PSI avg10", "denominator": "16 cores; red at 125%", "sampled_at": NOW.isoformat()},
            "memory": {"status": "healthy", "state": "fresh", "available_pct": 50, "psi": 2, "source": "/proc/meminfo + /proc/pressure/memory", "unit": "free/PSI percent", "window": "point + PSI avg10", "denominator": "100% memory; PSI red at 30%", "sampled_at": NOW.isoformat()},
            "disk": {"status": "healthy", "state": "fresh", "available_pct": 23, "used_pct": 77, "source": "shutil.disk_usage('/')", "unit": "capacity percent", "window": "point", "denominator": "100% root volume", "sampled_at": NOW.isoformat()},
            "io": {"status": "healthy", "state": "fresh", "some_avg10_pct": 8, "full_avg10_pct": 4, "source": "/proc/pressure/io", "unit": "stall percent", "window": "avg10", "denominator": "red at 20% full stall", "sampled_at": NOW.isoformat()},
            "network": {"status": "healthy", "state": "fresh", "util_pct": 20, "mbps": 200, "speed_mbps": 1000, "source": "/proc/net/dev + /sys/class/net", "unit": "Mbps/link percent", "window": "5 seconds", "denominator": "1000 Mbps link", "sampled_at": NOW.isoformat()},
            "slots": {"status": "healthy", "state": "fresh", "util_pct": 50, "running": 2, "cap": 4, "source": "Symphony state", "unit": "agents/capacity percent", "window": "point", "denominator": "4 configured agents", "sampled_at": NOW.isoformat()},
        }
        plain = strip("\n".join(HUD._system_pressure_lines(pressure, 430, now=NOW)))
        for token in ("getloadavg + /proc/pressure/cpu", "shutil.disk_usage('/')", "/proc/pressure/io", "avg10", "red at 20% full stall", "1000 Mbps link"):
            self.assertIn(token, plain)
        self.assertEqual(plain.count("["), 6)
        for width in (120, 215, 430):
            compact = strip("\n".join(HUD._system_pressure_lines(pressure, width, now=NOW, show_details=False)))
            self.assertNotIn("/proc/", compact)
            matrix = strip("\n".join(HUD._ci_matrix_lines({"ok": True, "ci_matrix": [{"number": 1, "title": "A" * 120, "fast": "success"}]}, width, now=NOW)))
            self.assertLessEqual(matrix.splitlines()[1].index("FAST"), 74)
            self.assertEqual(matrix.splitlines()[1].index("FAST"), matrix.splitlines()[3].index("✓"))

    def test_refresh_uses_in_place_home_cursor_between_equal_size_frames(self):
        self.assertEqual(HUD.refresh_prefix(size_changed=False), "\033[?25l\033[H")
        self.assertEqual(HUD.refresh_prefix(size_changed=True), "\033[?25l\033[2J\033[H")
        self.assertNotIn("\033[2J", HUD.refresh_prefix(size_changed=False))
        self.assertEqual(HUD.metric_gauge(50, 100, width=0), "[]")

    def test_network_window_and_merge_queue_receipts_keep_source_time(self):
        prior_at = (NOW - dt.timedelta(seconds=5)).isoformat()
        disk_usage = mock.Mock(total=100, used=50, free=50)
        with (
            mock.patch.object(HUD.os, "cpu_count", return_value=4),
            mock.patch.object(HUD.os, "getloadavg", return_value=(1.0, 0.0, 0.0)),
            mock.patch.object(
                HUD,
                "_psi",
                side_effect=(
                    {"some": 1.0, "full": None, "error": None},
                    {"some": 1.0, "full": 0.0, "error": None},
                    {"some": 1.0, "full": 1.0, "error": None},
                ),
            ),
            mock.patch.object(HUD.shutil, "disk_usage", return_value=disk_usage),
            mock.patch.object(HUD.Path, "read_text", return_value="MemTotal: 100 kB\nMemAvailable: 50 kB\n"),
            mock.patch.object(HUD, "_net_sample", return_value={"rx": 10_000_000, "tx": 1_000_000, "speed_mbps": 100}),
            mock.patch.object(HUD, "load_json_dict", return_value={"at": prior_at, "rx": 0, "tx": 0}),
            mock.patch.object(HUD, "write_json") as write_json,
        ):
            pressure = HUD.fetch_system_pressure(
                {"running": 1, "cap": 4},
                state_path=ROOT / ".tmp-system-pressure.json",
                now=NOW,
            )
        self.assertEqual(pressure["network"]["window"], "5.0 seconds")
        self.assertEqual(pressure["network"]["mbps"], 16)
        self.assertEqual(pressure["network"]["util_pct"], 16)
        write_json.assert_called_once()

        payload = {
            "data": {
                "repository": {
                    "mergeQueue": {
                        "entries": {
                            "nodes": [
                                {"position": 3, "enqueuedAt": STARTED, "pullRequest": {"number": 17, "title": "Measured queue"}}
                            ]
                        }
                    }
                }
            }
        }
        completed = mock.Mock(stdout=json.dumps(payload))
        with mock.patch.object(HUD.subprocess, "run", return_value=completed), mock.patch.object(HUD, "_now", return_value=NOW):
            queue = HUD.fetch_mq()
        self.assertEqual(queue["rows"][0]["position"], 3)
        self.assertEqual(queue["generated_at"], NOW.isoformat())
        with mock.patch.object(HUD.subprocess, "run", side_effect=OSError("offline")):
            self.assertIsNone(HUD.fetch_mq()["generated_at"])

    def test_operator_health_includes_queue_tail_and_ci_failure_receipts(self):
        path = HUD.empty_ship_path()
        path["stages"][5].update(
            {
                "p95": 60,
                "sample_count": 20,
                "sampled_at": NOW.isoformat(),
                "stale": False,
            }
        )
        pressure = {
            "ok": True,
            **{
                key: {"status": "healthy", "state": "fresh"}
                for key in ("cpu", "memory", "disk", "io", "network", "slots")
            },
        }
        status, events = HUD._operator_health(
            symphony={"ok": True, "running": 1, "retrying": 0, "blocked": 0},
            pressure=pressure,
            mq={
                "rows": [
                    "invalid",
                    {"kind": "mq", "number": 17, "enqueued": (NOW - dt.timedelta(seconds=120)).isoformat()},
                ]
            },
            ship_path=path,
            pr_flow={"ci_matrix": [{"number": 9, "all": "failure"}]},
            now=NOW,
        )
        self.assertEqual(status, "failure")
        self.assertTrue(any(event.startswith("MQ AGE RED") for event in events))
        self.assertIn("CI FAILURE #9", events)

    def test_partial_pressure_failure_retains_only_that_metrics_last_good_value(self):
        HUD.FRAME_SOURCE_CACHE.clear()
        first_partial = HUD.retain_last_good_source(
            "pressure",
            {"ok": True, "disk": {"status": "unknown", "state": "error", "error": "unavailable"}},
            now=NOW,
        )
        self.assertNotIn("partial_stale", first_partial)
        sampled_at = (NOW - dt.timedelta(seconds=30)).isoformat()
        good = {
            "ok": True,
            "generated_at": sampled_at,
            "cpu": {"status": "healthy", "state": "fresh", "signal_pct": 50, "source": "cpu", "unit": "%", "window": "avg10", "denominator": "125", "sampled_at": sampled_at},
            "memory": {"status": "healthy", "state": "fresh", "available_pct": 50, "source": "memory", "unit": "%", "window": "point", "denominator": "100", "sampled_at": sampled_at},
            "disk": {"status": "healthy", "state": "fresh", "available_pct": 23, "used_pct": 77, "source": "disk", "unit": "%", "window": "point", "denominator": "100", "sampled_at": sampled_at},
            "io": {"status": "healthy", "state": "fresh", "full_avg10_pct": 4, "source": "io", "unit": "%", "window": "avg10", "denominator": "20", "sampled_at": sampled_at},
            "network": {"status": "healthy", "state": "fresh", "util_pct": 20, "mbps": 200, "speed_mbps": 1000, "source": "network", "unit": "%", "window": "5s", "denominator": "1000", "sampled_at": sampled_at},
            "slots": {"status": "healthy", "state": "fresh", "util_pct": 50, "running": 2, "cap": 4, "source": "slots", "unit": "%", "window": "point", "denominator": "4", "sampled_at": sampled_at},
        }
        HUD.retain_last_good_source("pressure", good, now=NOW)
        partial = json.loads(json.dumps(good))
        partial["generated_at"] = NOW.isoformat()
        partial["cpu"].update({"signal_pct": 60, "load_pct": 60, "sampled_at": NOW.isoformat()})
        partial["disk"] = {
            "status": "unknown",
            "state": "error",
            "available_pct": None,
            "used_pct": None,
            "error": "unavailable",
        }
        retained = HUD.retain_last_good_source("pressure", partial, now=NOW)
        self.assertEqual(retained["cpu"]["signal_pct"], 60)
        self.assertEqual(retained["disk"]["available_pct"], 23)
        self.assertEqual(retained["disk"]["state"], "stale")
        self.assertEqual(retained["disk"]["sampled_at"], sampled_at)
        plain = strip(paint(width=430, height=90, system_pressure=retained))
        self.assertIn("DEGRADED/ERROR", plain)
        self.assertIn("? STALE · 23% free", plain)
        self.assertIn("load 60% · PSI - · ✓ NORMAL", plain)

    def test_compact_critical_rows_and_medium_review_are_visible(self):
        path = HUD.empty_ship_path()
        path["stages"][5].update(
            {
                "p95": 60,
                "sample_count": 20,
                "sampled_at": NOW.isoformat(),
                "stale": False,
            }
        )
        compact = strip(
            paint(
                symphony={
                    "ok": True,
                    "running": 0,
                    "retrying": 0,
                    "blocked": 1,
                    "cap": 4,
                    "rows": [{"kind": "blocked", "id": "JOV-8", "title": "Release held", "started": STARTED}],
                    "up": True,
                },
                mq={"ok": True, "count": 1, "rows": [{"kind": "mq", "number": 17, "position": 3, "title": "Queue tail", "enqueued": STARTED}]},
                ship_path=path,
                width=120,
                height=40,
            )
        )
        self.assertIn("BLOCKED", compact)
        self.assertIn("Release held", compact)
        self.assertIn("#17/p3", compact)

        medium = strip(paint(review=3, width=200, height=40))
        self.assertIn("REVIEW 3", medium)
        crowded = strip(
            paint(
                symphony={
                    "ok": True,
                    "running": 30,
                    "retrying": 0,
                    "blocked": 0,
                    "cap": 40,
                    "rows": [{"kind": "running", "id": f"JOV-{index}", "title": "Work"} for index in range(30)],
                    "up": True,
                },
                width=200,
                height=24,
            )
        )
        self.assertEqual(len(crowded.splitlines()), 24)

    def test_frame_resolves_geometry_and_refresh_loop_only_clears_on_resize(self):
        HUD.FRAME_SOURCE_CACHE.clear()
        good = {"ok": True, "count": 4, "generated_at": STARTED}
        self.assertEqual(HUD.retain_last_good_source("mq", good, now=NOW), good)
        retained = HUD.retain_last_good_source("mq", {"ok": False}, now=NOW)
        self.assertEqual(retained["count"], 4)
        self.assertTrue(retained["stale"])
        self.assertEqual(retained["source_error"], "source unavailable")
        symphony_good = {
            "ok": True,
            "running": 1,
            "retrying": 0,
            "blocked": 0,
            "cap": 4,
            "rows": [],
            "up": True,
            "generated_at": STARTED,
        }
        HUD.retain_last_good_source("symphony", symphony_good, now=NOW)
        symphony_retained = HUD.retain_last_good_source("symphony", {"ok": False}, now=NOW)
        self.assertFalse(symphony_retained["up"])
        pressure_retained = {"ok": True, "stale": True, "source_error": "offline"}
        stale_path = HUD.empty_ship_path()
        stale_path["stages"][0].update({"count": 4, "p95": 60, "stale": True})
        status, events = HUD._operator_health(
            symphony=symphony_retained,
            pressure=pressure_retained,
            mq=retained,
            ship_path=stale_path,
            pr_flow=None,
            now=NOW,
        )
        self.assertEqual(status, "failure")
        self.assertIn("SYMPHONY SOURCE ERROR · LAST GOOD RETAINED", events)
        self.assertIn("PRESSURE SOURCE ERROR · LAST GOOD RETAINED", events)
        self.assertIn("MQ SOURCE ERROR · LAST GOOD RETAINED", events)
        self.assertIn("now=4 samples=0 p95 ST", strip("\n".join(HUD._ship_path_lines(stale_path, 200))))
        _, stale_events = HUD._operator_health(
            symphony=symphony_good,
            pressure={
                "ok": True,
                **{
                    key: {"status": "healthy", "state": "fresh"}
                    for key in ("cpu", "memory", "disk", "io", "network", "slots")
                },
            },
            mq={"ok": True, "count": 0, "rows": []},
            ship_path=stale_path,
            pr_flow=None,
            now=NOW,
        )
        self.assertIn("SHIP SOURCE STALE · LAST GOOD RETAINED", stale_events)
        stale_hero = strip(
            paint(
                symphony=symphony_retained,
                mq=retained,
                width=200,
                height=40,
                system_pressure=pressure_retained,
            )
        )
        self.assertIn("RUNNING: UNKNOWN", stale_hero)

        symphony = {"ok": True, "running": 0, "retrying": 0, "blocked": 0, "cap": 4, "rows": [], "up": True}
        with (
            mock.patch.object(HUD, "read_workflow_cap", return_value=4),
            mock.patch.object(HUD, "fetch_symphony", return_value=symphony),
            mock.patch.object(HUD, "fetch_mq", return_value={"ok": True, "count": 0, "rows": []}),
            mock.patch.object(HUD, "fetch_linear_project_cached", return_value={"ok": True, "review": 0, "todo": 0}),
            mock.patch.object(HUD, "fetch_review", side_effect=AssertionError("frame must not issue a second Linear request")),
            mock.patch.object(HUD, "fetch_github_ship", return_value={"ok": False}),
            mock.patch.object(HUD, "load_measured", return_value={}),
            mock.patch.object(HUD, "load_tps_snapshots", return_value=[]),
            mock.patch.object(HUD, "persist_tps_snapshot"),
            mock.patch.object(HUD, "fetch_system_pressure", return_value={"ok": False}),
            mock.patch.object(HUD, "fetch_sha", return_value="abcdef0"),
        ):
            rendered = strip(
                HUD.frame(
                    measured_path=ROOT / ".tmp-measured.json",
                    symphony_url="http://127.0.0.1:4041/api/v1/state",
                    width=80,
                    height=24,
                )
            )
        self.assertEqual(len(rendered.splitlines()), 24)
        self.assertTrue(all(len(line) == 80 for line in rendered.splitlines()))

        output = mock.Mock()
        diagnostics = mock.Mock()
        with (
            mock.patch.object(HUD.sys, "stdout", output),
            mock.patch.object(HUD.sys, "stderr", diagnostics),
            mock.patch.object(HUD, "terminal_size", return_value=(80, 24)),
            mock.patch.object(HUD, "frame", return_value="FRAME"),
            mock.patch.object(HUD.time, "sleep", side_effect=(None, KeyboardInterrupt)),
            self.assertRaises(KeyboardInterrupt),
        ):
            HUD.main(["--interval", "0.5"])
        writes = [call.args[0] for call in output.write.call_args_list]
        self.assertEqual(writes[0], "\033[?25l\033[2J\033[HFRAME")
        self.assertEqual(writes[1], "\033[?25l\033[HFRAME")
        self.assertEqual(writes[-1], "\033[?25h")
        self.assertIn("continuity=last-good-visible", diagnostics.write.call_args_list[0].args[0])
        self.assertIn("clear=yes", diagnostics.write.call_args_list[0].args[0])

    def test_queue_age_reaches_same_class_fresh_p95_is_red_at_exact_boundary(self):
        durations = [float(minutes * 60) for minutes in range(1, 21)]
        stage = HUD.stage_from_source(
            "mq",
            "merge queue",
            ok=True,
            count=1,
            durations=durations,
            sampled_at=NOW.isoformat(),
            stale=False,
        )
        self.assertEqual(stage["sample_count"], 20)
        self.assertEqual(stage["p95"], 19 * 60)
        at_boundary = HUD.queue_age_health(
            {"kind": "mq", "enqueued": (NOW - dt.timedelta(minutes=19)).isoformat()},
            stage,
            now=NOW,
        )
        self.assertEqual(at_boundary["status"], "failure")
        self.assertEqual(at_boundary["state"], "fresh")
        self.assertIn("× RED", at_boundary["label"])

        below = HUD.queue_age_health(
            {"kind": "mq", "enqueued": (NOW - dt.timedelta(minutes=18, seconds=59)).isoformat()},
            stage,
            now=NOW,
        )
        self.assertEqual(below["status"], "healthy")
        self.assertIn("✓ NORMAL", below["label"])

    def test_queue_age_is_unknown_when_baseline_is_insufficient_stale_or_wrong_class(self):
        row = {"kind": "mq", "enqueued": (NOW - dt.timedelta(hours=1)).isoformat()}
        insufficient = HUD.stage_from_source("mq", "merge queue", ok=True, count=1, durations=[60.0] * 19, sampled_at=NOW.isoformat(), stale=False)
        stale = HUD.stage_from_source("mq", "merge queue", ok=True, count=1, durations=[60.0] * 20, sampled_at=(NOW - dt.timedelta(seconds=301)).isoformat(), stale=False)
        fresh_at_boundary = HUD.stage_from_source("mq", "merge queue", ok=True, count=1, durations=[60.0] * 20, sampled_at=(NOW - dt.timedelta(seconds=300)).isoformat(), stale=False)
        wrong_class = HUD.stage_from_source("ci_fast", "ci-fast", ok=True, count=1, durations=[60.0] * 20, sampled_at=NOW.isoformat(), stale=False)

        self.assertEqual(HUD.queue_age_health(row, insufficient, now=NOW)["state"], "unknown")
        self.assertEqual(HUD.queue_age_health(row, stale, now=NOW)["state"], "stale")
        self.assertEqual(HUD.queue_age_health(row, wrong_class, now=NOW)["state"], "unknown")
        self.assertEqual(HUD.queue_age_health(row, fresh_at_boundary, now=NOW)["status"], "failure")
        self.assertIn("? UNMEASURED", HUD.queue_age_health(row, insufficient, now=NOW)["label"])
        self.assertIn("? STALE", HUD.queue_age_health(row, stale, now=NOW)["label"])

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
        template = (ROOT / "scripts/symphony/systemd/gem-ship-hud.service.template").read_text(encoding="utf-8")
        installer = (ROOT / "scripts/symphony/install-gem-ship-hud.sh").read_text(encoding="utf-8")
        self.assertIn("{{JOVIE_REPO}}/scripts/symphony/gem-checkin-tty1.sh", template)
        self.assertIn("WorkingDirectory={{JOVIE_REPO}}", template)
        self.assertNotIn(".local/bin/gem-ship-hud.py", template)
        self.assertIn("gem-ship-hud-activation/v1", installer)
        self.assertIn("GEM_SHIP_HUD_EXPECTED_REVISION", installer)
        self.assertIn("sourceSha256", installer)
        self.assertIn("systemdStartTimestamp", installer)


if __name__ == "__main__":
    unittest.main()
