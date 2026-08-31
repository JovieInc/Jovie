from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-ops-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_ops_hud", SOURCE)
assert SPEC and SPEC.loader
hud = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hud)
OPS_ENV_KEYS = (
    "HUD_CASH_USD",
    "HUD_WEEKLY_BURN_USD",
    "HUD_WEEKLY_REVENUE_USD",
    "HUD_WEEKLY_REVENUE_PREV_USD",
    "HUD_ACTIVE_USERS",
    "HUD_ACTIVE_USERS_PREV",
    "HUD_SHIPS_THIS_WEEK",
    "HUD_SHIPS_LAST_WEEK",
    "HUD_BOTTLENECK",
    "HUD_BOTTLENECK_OWNER",
    "HUD_BOTTLENECK_START",
    "HUD_BOTTLENECK_HANDLE",
)


def stamp(seconds_ago: int = 0) -> str:
    value = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=seconds_ago)
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def pr_fleet_audit(**overrides) -> dict:
    payload = {
        "schema": "jovie-pr-fleet-closure-audit/v1",
        "repo": "JovieInc/Jovie",
        "source": "stable audit fixture",
        "observedAt": stamp(),
        "complete": True,
        "pageInfo": {"hasNextPage": False},
        "totalOpenPrs": 117,
        "counts": {
            "draft": 48,
            "greenReady": 15,
            "nativeQueue": 2,
            "remediating": 19,
            "blocked": 5,
            "conflictUnstable": 28,
            "ownerlessStalled": 0,
            "superseded": 0,
        },
        "queue": [
            {"number": 16490, "position": 1, "title": "Repair source freshness"},
            {"number": 16491, "position": 2, "title": "Add destination proof"},
        ],
    }
    payload.update(overrides)
    return payload


def live_state() -> dict:
    observed = stamp(10)
    return {
        "symphony": {
            "updated": observed,
            "error": None,
            "counts": {"implementing": 2, "retrying": 3, "queued": 4, "blocked": 1},
            "reason_buckets": {
                "capacity": 2,
                "timeout": 1,
                "launcher_failure": 0,
                "ci_check_failure": 0,
                "merge_queue_wait": 0,
                "ownership_input": 1,
                "other": 0,
            },
            "slots": {"available": 1, "total": 4},
            "workers": {"runner_jobs": 2, "runner_listeners": 8},
            "next_retry": stamp(-90),
            "jobs": [
                {"id": "JOV-5400", "started": stamp(600), "title": "Repair controller receipt"},
                {"id": "JOV-5401", "started": stamp(300), "title": "Verify native merge queue"},
            ],
            "blockers": [
                {
                    "id": "JOV-5399",
                    "attempt": 2,
                    "reason": "ownership_input",
                    "next": "operator review",
                    "owner": "Summer",
                    "title": "Needs founder decision",
                }
            ],
        },
        "fleet": {
            "schema": "jovie-fleet-gate/v1",
            "observedAt": observed,
            "updated": observed,
            "error": None,
            "state": "GREEN",
            "promotionMode": "normal",
            "reasons": [],
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
            "promotionAdmission": {"allowed": True},
            "remediationAdmission": {"allowed": True, "localAllowed": True, "pushAllowed": True},
            "deploymentAdmission": {"allowed": True},
            "alreadyAdmittedCohort": {"newIntakeAllowed": True},
        },
        "delivery": {
            "updated": observed,
            "error": None,
            "exact": True,
            "main_sha": "a" * 40,
            "prod_sha": "a" * 40,
            "deploy_status": "healthy",
            "pr_fleet": {
                "schema": hud.PR_FLEET_CLOSURE_AUDIT_SCHEMA,
                "updated": observed,
                "error": None,
                "source": "stable audit fixture",
                "repo": "JovieInc/Jovie",
                "total": 117,
                "counts": {
                    "draft": 48,
                    "ready": 15,
                    "queued": 2,
                    "remediating": 19,
                    "blocked": 5,
                    "conflict": 28,
                    "ownerless": 0,
                    "superseded": 0,
                },
                "queue": [
                    {"number": 16490, "position": 1, "title": "Repair source freshness"},
                    {"number": 16491, "position": 2, "title": "Add destination proof"},
                ],
            },
            "prs": {"total": 117, "ready": 15, "draft": 48, "queued": 2},
            "merged_recent": 12,
            "production_completions": 7,
            "latency": {
                "ci": {"sample": 30, "typical_seconds": 316, "slow_tail_seconds": 482},
                "merge": {
                    "sample": 21,
                    "typical_seconds": 64_800,
                    "slow_tail_seconds": 183_600,
                    "window_days": 30,
                },
            },
            "queue": [
                {"number": 16490, "position": 1, "title": "Repair source freshness"},
                {"number": 16491, "position": 2, "title": "Add destination proof"},
            ],
            "runs": [
                {"name": "CI", "sha": "a1b2c3d4", "status": "completed", "conclusion": "success", "updated": observed},
                {"name": "Production Controller", "sha": "e5f6a7b8", "status": "in_progress", "conclusion": "-", "updated": observed},
            ],
        },
        "issues": {
            "updated": observed,
            "error": None,
            "source": "linear",
            "degraded": False,
            "open": 43,
            "backlog": 20,
            "ready": 11,
        },
        "ops": {
            "updated": observed,
            "error": None,
            "verdict": "DEFAULT ALIVE",
            "verdict_status": "DEFAULT ALIVE",
            "verdict_detail": "measured weekly revenue covers weekly burn",
            "growth": {"pct": 6.2, "detail": "revenue first", "series": "revenue"},
            "yc_status": "YC BAR",
            "active_users": 1_234,
            "weekly_revenue_usd": 4_250,
            "ships_this_week": 5,
            "bottleneck": "JOV-5399 release controller decision",
            "bottleneck_owner": "Summer",
            "bottleneck_handle": "https://github.com/JovieInc/Jovie/pull/16490",
        },
    }


class RenderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.color = mock.patch.dict(os.environ, {"NO_COLOR": "1"})
        self.color.start()

    def tearDown(self) -> None:
        self.color.stop()

    def test_ultrawide_uses_full_canvas_and_required_hierarchy(self) -> None:
        output = hud.render(live_state(), width=430, height=90)
        lines = output.splitlines()
        self.assertEqual(len(lines), 89)
        self.assertTrue(all(len(line) == 430 for line in lines))
        titles = (
            "IMMEDIATE ATTENTION · #1 BOTTLENECK FIRST",
            "CURRENT WORK",
            "RECENT DELIVERY LOG",
            "SYSTEM HEALTH / ADMISSION",
            "SECONDARY CAPACITY / OWNERS / DETAIL",
            "BUSINESS PULSE",
            "DELIVERY SPEED · ISSUE OPEN → LANDED",
            "CURRENT LARGEST BOTTLENECK",
        )
        for title in titles:
            self.assertIn(title, output)
        offsets = [output.index(title) for title in titles]
        self.assertEqual(offsets, sorted(offsets))
        self.assertIn("localhost 4041/4042", output)
        self.assertIn("mergeQueueEntry · GitHub", output)
        self.assertIn("missing receipt timestamps; not inferred", output)

    def test_bottom_strip_has_exactly_three_operator_primary_regions(self) -> None:
        state = live_state()
        output = hud.render(state, width=430, height=90)
        bottom = "\n".join(output.splitlines()[-16:])
        for label in (
            "BUSINESS PULSE",
            "DELIVERY SPEED · ISSUE OPEN → LANDED",
            "CURRENT LARGEST BOTTLENECK",
        ):
            self.assertEqual(bottom.count(label), 1)
        self.assertIn("WOW GROWTH", bottom)
        self.assertIn("6.2%", bottom)
        self.assertIn("ACTIVE USERS", bottom)
        self.assertIn("1,234", bottom)
        self.assertIn("WEEKLY REVENUE", bottom)
        self.assertIn("$4,250", bottom)
        self.assertIn("P50", bottom)
        self.assertIn("18h 00m", bottom)
        self.assertIn("P95", bottom)
        self.assertIn("51h 00m", bottom)
        self.assertIn("JOV-5399 release controller decision", bottom)
        self.assertNotIn("IMPLEMENTING NOW", bottom)
        self.assertNotIn("RETRY WAIT", bottom)
        self.assertNotIn("NATIVE QUEUE", bottom)

    def test_ultrawide_height_76_preserves_primary_strip_actions(self) -> None:
        output = hud.render(live_state(), width=430, height=76)
        lines = output.splitlines()

        self.assertEqual(len(lines), 75)
        self.assertTrue(all(len(line) == 430 for line in lines))
        for text in (
            "BUSINESS PULSE",
            "WOW GROWTH",
            "ACTION · no action",
            "DEFAULT ALIVE",
            "DELIVERY SPEED · ISSUE OPEN → LANDED",
            "P50",
            "SOURCE · n=21",
            "CURRENT LARGEST BOTTLENECK",
            "HANDLE ·",
        ):
            self.assertIn(text, output)

    def test_short_ultrawide_keeps_secondary_capacity_rows_visible(self) -> None:
        output = hud.render(live_state(), width=430, height=76)
        secondary = output[
            output.index("SECONDARY CAPACITY / OWNERS / DETAIL") : output.index(
                "BUSINESS PULSE"
            )
        ]

        for text in ("Owner input", "Execution slots", "Runner jobs", "Linear open"):
            self.assertIn(text, secondary)

    def test_active_user_fallback_growth_names_series_in_primary_pulse(self) -> None:
        state = live_state()
        state["ops"]["growth"] = hud.wow_growth(4_250, None, 1_234, 1_120)

        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])

        self.assertIn("ACTIVE USER WOW", bottom)
        self.assertIn("10.2%", bottom)
        self.assertIn("WEEKLY REVENUE", bottom)
        self.assertIn("$4,250", bottom)

    def test_missing_growth_denominator_preserves_measured_survival_verdict(self) -> None:
        state = live_state()
        state["ops"]["growth"] = hud.wow_growth(4_250, None, 1_234, None)

        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])

        self.assertIn("WOW GROWTH", bottom)
        self.assertIn("UNAVAILABLE", bottom)
        self.assertIn("DEFAULT ALIVE", bottom)
        self.assertIn("survival verdict remains measured", bottom)
        self.assertNotIn("not proven without measured weekly revenue and burn", bottom)

    def test_missing_burn_data_requests_survival_input_even_when_growth_exists(self) -> None:
        state = live_state()
        verdict, status, detail = hud.default_alive_verdict(50_000, None, 4_250, 4_000)
        state["ops"].update(
            {
                "verdict": verdict,
                "verdict_status": status,
                "verdict_detail": detail,
                "growth": hud.wow_growth(4_250, 4_000, 1_234, 1_100),
                "weekly_burn_usd": None,
            }
        )

        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])

        self.assertIn("WOW GROWTH", bottom)
        self.assertIn("6.2%", bottom)
        self.assertIn("publish measured weekly burn", bottom)
        self.assertIn("DEFAULT ALIVE", bottom)
        self.assertIn("UNAVAILABLE", bottom)

    def test_missing_revenue_data_requests_revenue_not_burn(self) -> None:
        state = live_state()
        verdict, status, detail = hud.default_alive_verdict(50_000, 3_500, None, None)
        state["ops"].update(
            {
                "verdict": verdict,
                "verdict_status": status,
                "verdict_detail": detail,
                "growth": hud.wow_growth(None, None, 1_234, 1_100),
                "weekly_burn_usd": 3_500,
                "weekly_revenue_usd": None,
            }
        )

        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])

        self.assertIn("ACTIVE USER WOW", bottom)
        self.assertIn("publish measured weekly revenue", bottom)
        self.assertNotIn("publish measured weekly burn", bottom)

    def test_primary_regions_fail_closed_when_values_are_unmeasured(self) -> None:
        state = live_state()
        state["ops"].update(
            {
                "growth": {"pct": None, "series": "UNKNOWN", "detail": "unmeasured"},
                "active_users": None,
                "weekly_revenue_usd": None,
                "bottleneck": None,
                "bottleneck_handle": None,
            }
        )
        state["delivery"]["latency"]["merge"] = None
        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])
        self.assertGreaterEqual(bottom.count("UNAVAILABLE"), 4)
        self.assertIn("NOT PROVEN", bottom)
        self.assertIn("capture issue-open + landed receipt timestamps", bottom)
        self.assertIn("measured bottleneck unavailable", bottom)
        self.assertNotIn("WEEKLY REVENUE            $0", bottom)
        self.assertNotIn("0.0%", bottom)

    def test_section_evidence_states_are_distinct_and_source_backed(self) -> None:
        healthy = live_state()
        self.assertEqual(hud.section_evidence(healthy, "delivery")[0], "HEALTHY")

        unavailable = live_state()
        unavailable["issues"] = {
            "updated": stamp(),
            "error": "linear_unavailable",
            "source": "linear",
            "degraded": True,
        }
        self.assertEqual(hud.section_evidence(unavailable, "issues")[0], "UNAVAILABLE")

        degraded = live_state()
        degraded["delivery"]["error"] = "TimeoutError"
        self.assertEqual(hud.section_evidence(degraded, "delivery")[0], "DEGRADED")

        stale = live_state()
        stale["delivery"]["updated"] = "2026-01-01T00:00:00Z"
        self.assertEqual(hud.section_evidence(stale, "delivery")[0], "STALE")

    def test_primary_regions_explain_evidence_and_operator_action(self) -> None:
        state = live_state()
        state["ops"].update(
            {
                "growth": {"pct": None, "series": "UNKNOWN", "detail": "unmeasured"},
                "active_users": None,
                "weekly_revenue_usd": None,
            }
        )
        state["delivery"]["latency"]["merge"] = None
        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])
        self.assertIn("EVIDENCE", bottom)
        self.assertIn("UNAVAILABLE", bottom)
        self.assertIn("connect measured business source; do not infer $0", bottom)
        self.assertIn("NOT PROVEN", bottom)
        self.assertIn("capture issue-open + landed receipt timestamps", bottom)
        self.assertIn("HEALTHY", bottom)
        self.assertIn("follow named handle above", bottom)

    def test_bottleneck_region_requests_handle_before_follow_action(self) -> None:
        state = live_state()
        state["ops"]["bottleneck_handle"] = None

        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])

        self.assertIn("JOV-5399 release controller decision", bottom)
        self.assertIn("publish bottleneck handle", bottom)
        self.assertIn("HANDLE · measured handle unavailable", bottom)
        self.assertNotIn("follow named handle above", bottom)

    def test_stale_primary_metrics_keep_last_known_values_and_name_refresh_action(self) -> None:
        state = live_state()
        state["ops"]["updated"] = "2026-01-01T00:00:00Z"
        state["delivery"]["updated"] = "2026-01-01T00:00:00Z"
        bottom = "\n".join(hud.render(state, width=430, height=90).splitlines()[-16:])
        self.assertIn("6.2%", bottom)
        self.assertIn("18h 00m", bottom)
        self.assertGreaterEqual(bottom.count("STALE"), 2)
        self.assertIn("values are last-known", bottom)

    def test_verified_queue_and_workflow_states_render_as_pending(self) -> None:
        state = live_state()
        output = hud.render(state, width=430, height=90)
        self.assertIn("First-run queue", output)
        self.assertIn("PENDING", output)
        self.assertNotIn("WAITING", output)
        self.assertNotIn("IN_PROGRESS", output)

    def test_delivery_refresh_failure_is_degraded_not_missing_receipt(self) -> None:
        state = live_state()
        state["delivery"]["error"] = "TimeoutError"
        state["delivery"]["latency"]["merge"] = None
        rows = "\n".join(hud._delivery_speed_rows(state, 138))
        self.assertIn("DEGRADED", rows)
        self.assertIn("values are last-good", rows)
        self.assertNotIn("NOT PROVEN", rows)

    def test_degraded_delivery_marks_cached_throughput_rows_as_degraded(self) -> None:
        state = live_state()
        state["delivery"]["error"] = "TimeoutError"

        rows = "\n".join(hud._throughput_rows(state, 210))

        self.assertIn("Open PRs", rows)
        self.assertIn("117", rows)
        self.assertIn("DEGRADED", rows)
        self.assertIn("values are last-good", rows)
        self.assertNotIn("READY 15", rows)

    def test_pr_fleet_matrix_renders_exact_more_than_100_pr_counts(self) -> None:
        rows = "\n".join(hud._throughput_rows(live_state(), 210))

        for text in (
            "Open PRs",
            "117",
            "Draft",
            "48",
            "Green / ready",
            "15",
            "Native queue",
            "2",
            "Remediating",
            "19",
            "Blocked",
            "5",
            "Conflict / unstable",
            "28",
            "Ownerless / stalled",
            "Superseded",
            "stable audit fixture",
        ):
            self.assertIn(text, rows)

    def test_missing_pr_fleet_receipt_fails_closed_to_unknown_counts(self) -> None:
        state = live_state()
        state["delivery"].pop("pr_fleet")

        throughput = "\n".join(hud._throughput_rows(state, 210))
        work = "\n".join(hud._work_rows(state, 210))

        self.assertIn("UNKNOWN", throughput)
        self.assertIn("pr-fleet-closure-audit-missing", throughput)
        self.assertIn("Native queue", work)
        self.assertIn("UNKNOWN", work)
        self.assertNotIn("READY 15", throughput)

    def test_degraded_runtime_never_presents_last_good_capacity_as_current(self) -> None:
        state = live_state()
        state["symphony"]["error"] = "TimeoutError"
        state["symphony"]["jobs"] = []
        work = "\n".join(hud._work_rows(state, 210))
        secondary = "\n".join(hud._secondary_rows(state, 210))
        active_line = next(line for line in work.splitlines() if "Active work" in line)
        self.assertIn("DEGRADED", active_line)
        self.assertNotIn("IDLE", active_line)
        self.assertIn("Execution slots", secondary)
        self.assertIn("Runner jobs", secondary)
        execution_line = next(line for line in secondary.splitlines() if "Execution slots" in line)
        runner_line = next(line for line in secondary.splitlines() if "Runner jobs" in line)
        self.assertIn("DEGRADED", execution_line)
        self.assertIn("DEGRADED", runner_line)

    def test_synthesized_runtime_failure_defaults_are_unavailable(self) -> None:
        state = live_state()
        state["symphony"] = {
            "updated": stamp(),
            "error": "JOV:TimeoutError, LYB:TimeoutError",
            "synthesized": True,
            "counts": {"implementing": 0, "retrying": 0, "queued": 0, "blocked": 0},
            "jobs": [],
        }

        rows = "\n".join(hud._work_rows(state, 210))

        self.assertEqual(hud.section_evidence(state, "symphony")[0], "UNAVAILABLE")
        for label in ("Implementing", "First-run queue", "Retry wait"):
            line = next(row for row in rows.splitlines() if label in row)
            self.assertIn("UNAVAILABLE", line)
            self.assertNotIn("last-known 0", line)

    def test_degraded_runtime_marks_cached_job_rows_last_known(self) -> None:
        state = live_state()
        state["symphony"]["error"] = "TimeoutError"

        rows = "\n".join(hud._work_rows(state, 210))
        job_line = next(line for line in rows.splitlines() if "JOV-5400" in line)

        self.assertIn("DEGRADED", job_line)
        self.assertIn("last-known", job_line)
        self.assertNotIn("RUNNING", job_line)

    def test_unavailable_runtime_keeps_unknown_reason_buckets_unavailable(self) -> None:
        state = live_state()
        state["symphony"] = {
            "updated": stamp(),
            "error": "TimeoutError",
        }

        rows = "\n".join(hud._detail_rows(state, 210, expanded=True))
        capacity_line = next(line for line in rows.splitlines() if "Capacity" in line)
        timeout_line = next(line for line in rows.splitlines() if "Timeout" in line)

        self.assertIn("UNAVAILABLE", capacity_line)
        self.assertIn("UNAVAILABLE", timeout_line)
        self.assertNotIn("ATTENTION", capacity_line)
        self.assertNotIn("ATTENTION", timeout_line)

    def test_completed_workflow_failure_is_labeled_failed(self) -> None:
        state = live_state()
        state["delivery"]["queue"] = []
        state["delivery"]["runs"] = [
            {
                "name": "Production Controller",
                "sha": "deadbeef",
                "status": "completed",
                "conclusion": "failure",
                "updated": stamp(),
            }
        ]
        rows = "\n".join(hud._log_rows(state, 210))
        self.assertIn("FAILED", rows)
        self.assertNotIn("HEALTHY", rows)

    def test_degraded_delivery_marks_cached_workflow_log_entries_last_known(self) -> None:
        state = live_state()
        state["delivery"]["error"] = "TimeoutError"

        rows = "\n".join(hud._log_rows(state, 210))
        queue_line = next(line for line in rows.splitlines() if "MQ #16490" in line)
        run_line = next(line for line in rows.splitlines() if "CI" in line)

        self.assertIn("DEGRADED", queue_line)
        self.assertIn("last-known", queue_line)
        self.assertNotIn("PENDING", queue_line)
        self.assertIn("DEGRADED", run_line)
        self.assertIn("last-known", run_line)
        self.assertNotIn("HEALTHY", run_line)

    def test_stale_ops_marks_secondary_bottleneck_rows_last_known(self) -> None:
        state = live_state()
        state["ops"]["updated"] = "2026-01-01T00:00:00Z"

        rows = "\n".join(hud._detail_rows(state, 210))
        bottleneck_line = next(line for line in rows.splitlines() if "#1 bottleneck" in line)
        owner_line = next(line for line in rows.splitlines() if "Owner" in line)
        handle_line = next(line for line in rows.splitlines() if "Handle" in line)

        for line in (bottleneck_line, owner_line, handle_line):
            self.assertIn("STALE", line)
            self.assertIn("last-known", line)
        self.assertNotIn("OWNER INPUT", owner_line)
        self.assertNotIn("SOURCE", handle_line)

    def test_fleet_policy_warning_is_degraded_and_red_receipt_is_failing(self) -> None:
        state = live_state()
        state["fleet"].update(
            {
                "state": "AMBER",
                "promotionMode": "hold-intake",
                "reasons": [{"code": "production-deployment-unbound"}],
            }
        )
        amber = "\n".join(hud._attention_rows(state, 426))
        self.assertIn("DEGRADED", amber)
        self.assertIn("hold-intake", amber)
        self.assertNotIn("Fleet AMBER", amber)

        state["fleet"].update({"state": "RED", "promotionMode": "blocked"})
        red = "\n".join(hud._attention_rows(state, 426))
        self.assertIn("FAILING", red)
        self.assertIn("blocked", red)
        self.assertNotIn("Fleet RED", red)

    def test_ansi_mode_preserves_visible_width(self) -> None:
        with mock.patch.dict(os.environ, {"HUD_COLOR": "always"}, clear=False):
            os.environ.pop("NO_COLOR", None)
            output = hud.render(live_state(), width=430, height=90)
        ansi = re.compile(r"\x1b\[[0-9;]*m")
        visible = [ansi.sub("", line) for line in output.splitlines()]
        self.assertTrue(any("\x1b[" in line for line in output.splitlines()))
        self.assertTrue(all(len(line) == 430 for line in visible))

    def test_narrow_terminal_degrades_without_horizontal_overflow(self) -> None:
        output = hud.render(live_state(), width=100, height=50)
        lines = output.splitlines()
        self.assertEqual(len(lines), 49)
        self.assertTrue(all(len(line) == 100 for line in lines))
        self.assertIn("ATTENTION / ACTION", output)
        self.assertIn("CURRENT WORK", output)

    def test_compact_terminal_keeps_primary_regions_before_truncation(self) -> None:
        output = hud.render(live_state(), width=160, height=50)
        lines = output.splitlines()

        self.assertEqual(len(lines), 49)
        self.assertTrue(all(len(line) == 160 for line in lines))
        for title in (
            "BUSINESS PULSE",
            "DELIVERY SPEED · ISSUE OPEN → LANDED",
            "CURRENT LARGEST BOTTLENECK",
        ):
            self.assertIn(title, output)

    def test_larger_console_geometry_keeps_all_primary_lanes(self) -> None:
        output = hud.render(live_state(), width=286, height=60)
        lines = output.splitlines()
        self.assertEqual(len(lines), 59)
        self.assertTrue(all(len(line) == 286 for line in lines))
        for title in (
            "IMMEDIATE ATTENTION · #1 BOTTLENECK FIRST",
            "CURRENT WORK",
            "RECENT DELIVERY LOG",
            "SYSTEM HEALTH / ADMISSION",
            "SECONDARY CAPACITY / OWNERS / DETAIL",
            "BUSINESS PULSE",
            "DELIVERY SPEED · ISSUE OPEN → LANDED",
            "CURRENT LARGEST BOTTLENECK",
        ):
            self.assertIn(title, output)

    def test_stale_sources_are_prominent_and_last_known_is_not_zeroed(self) -> None:
        state = live_state()
        state["delivery"]["updated"] = "2026-01-01T00:00:00Z"
        state["delivery"]["pr_fleet"]["total"] = 17
        output = hud.render(state, width=430, height=90)
        self.assertIn("STALE", output)
        self.assertIn("GitHub/public health", output)
        self.assertIn("17", output)

    def test_unconfigured_linear_source_reports_unavailable_not_last_known(self) -> None:
        state = live_state()
        state["issues"] = {
            "updated": stamp(),
            "error": "linear_unconfigured",
            "source": "linear",
            "degraded": True,
        }
        output = hud.render(state, width=430, height=90)
        self.assertIn("UNAVAILABLE", hud.section_health(state, "issues"))
        self.assertNotIn("last-good", hud.section_health(state, "issues"))
        self.assertIn("restore configured Linear env; counts unavailable", output)
        self.assertNotIn("restore source; values remain last-known", output)

    def test_other_linear_failures_without_counts_remain_honest(self) -> None:
        state = live_state()
        state["issues"] = {
            "updated": stamp(),
            "error": "linear_unauthorized",
            "source": "linear",
            "degraded": True,
        }
        output = hud.render(state, width=430, height=90)
        self.assertIn("restore Linear source; counts unavailable", output)
        self.assertNotIn("restore source; values remain last-known", output)

    def test_amber_fleet_receipt_names_policy_reason_in_attention_lane(self) -> None:
        state = live_state()
        state["fleet"].update(
            {
                "state": "AMBER",
                "promotionMode": "hold-intake",
                "reasons": [{"code": "production-deployment-unbound"}],
            }
        )
        output = hud.render(state, width=430, height=90)
        self.assertIn("Fleet hold-intake", output)
        self.assertIn("DEGRADED", output)
        self.assertIn("production-deployment-unbound · typed AMBER fleet receipt", output)

    def test_unknown_business_metrics_never_render_as_fake_zero(self) -> None:
        state = live_state()
        state["ops"].update(
            {
                "verdict": "UNKNOWN",
                "verdict_status": "UNKNOWN",
                "verdict_detail": "unmeasured is not $0",
                "growth": {"pct": None, "detail": "unmeasured", "series": "UNKNOWN"},
                "active_users": None,
                "weekly_revenue_usd": None,
                "ships_this_week": None,
            }
        )
        output = hud.render(state, width=430, height=90)
        self.assertIn("unmeasured is not $0", output)
        self.assertIn("WEEKLY REVENUE", output)
        self.assertIn("UNAVAILABLE", output)

    def test_details_view_is_keyboard_addressable(self) -> None:
        output = hud.render(live_state(), width=430, height=90, view="details")
        self.assertIn("SECONDARY CAPACITY / OWNERS / ALL DETAIL", output)
        self.assertIn("RECENT DELIVERY LOG", output)

    def test_wide_rows_do_not_truncate_authoritative_content_that_fits(self) -> None:
        row = hud._metric(
            "Production Controller",
            "b5116de9",
            "IN_PROGRESS",
            "successful production workflow from the authoritative GitHub run",
            210,
        )
        self.assertEqual(len(row), 210)
        self.assertIn("Production Controller", row)
        self.assertIn("successful production workflow from the authoritative GitHub run", row)
        self.assertNotIn("...", row)

    def test_ultrawide_attention_preserves_a_long_bottleneck_when_it_fits(self) -> None:
        state = live_state()
        bottleneck = (
            "JOV-5399 exact production controller activation is blocked on the "
            "authoritative release receipt"
        )
        state["ops"]["bottleneck"] = bottleneck
        rows = "\n".join(hud._attention_rows(state, 426))
        self.assertIn(bottleneck, rows)
        self.assertNotIn("JOV-5399 exact production controller activation is blocked...", rows)

    def test_short_ultrawide_attention_keeps_summer_red_loop_visible(self) -> None:
        state = live_state()
        for key in ("symphony", "fleet", "delivery", "issues", "ops"):
            state[key]["error"] = "TimeoutError"
        state["delivery"]["summer_queue"] = {
            "schema": "jovie-summer-red-queue/v2",
            "authority": "Summer",
            "observedAt": stamp(),
            "terminalTombstones": [],
            "error": "red-loop",
            "items": [
                {
                    "issue": "JOV-SUMMER",
                    "outcome": "open",
                    "terminal": False,
                    "observedAt": stamp(),
                    "reason": "human-review-loop",
                }
            ],
        }

        output = hud.render(state, width=430, height=76)
        attention = output[
            output.index("IMMEDIATE ATTENTION") : output.index("CURRENT WORK")
        ]

        self.assertIn("Summer red queue", attention)
        self.assertIn("JOV-SUMMER", attention)

    def test_cached_summer_queue_items_inherit_delivery_evidence(self) -> None:
        state = live_state()
        state["delivery"]["error"] = "TimeoutError"
        state["delivery"]["summer_queue"] = {
            "schema": "jovie-summer-red-queue/v2",
            "authority": "Summer",
            "observedAt": stamp(),
            "terminalTombstones": [],
            "error": None,
            "items": [
                {
                    "issue": "JOV-5410",
                    "outcome": "open",
                    "terminal": False,
                    "observedAt": stamp(),
                    "reason": "human-review-loop",
                }
            ],
        }

        rows = "\n".join(hud._attention_rows(state, 426))
        line = next(row for row in rows.splitlines() if "JOV-5410" in row)

        self.assertIn("DEGRADED", line)
        self.assertIn("last-known", line)
        self.assertNotIn("PENDING", line)

    def test_constrained_rows_truncate_instead_of_overflowing(self) -> None:
        row = hud._metric(
            "Production Controller With Deliberately Long Name",
            "b5116de9",
            "IN_PROGRESS",
            "authoritative detail that cannot fit on a constrained terminal",
            64,
        )
        self.assertEqual(len(row), 64)
        self.assertIn("...", row)

    def test_standard_ultrawide_panel_preserves_backpressure_value(self) -> None:
        row = hud._metric(
            "Leases",
            "BACKPRESSURE",
            "ADMISSION",
            "new issue leases paused by typed fleet policy",
            138,
        )
        self.assertEqual(len(row), 138)
        self.assertIn("BACKPRESSURE", row)
        self.assertNotIn("BACKPRES...", row)

    def test_overview_hides_zero_retry_causes_but_details_preserve_them(self) -> None:
        state = live_state()
        overview = "\n".join(hud._detail_rows(state, 210, expanded=False))
        details = "\n".join(hud._detail_rows(state, 210, expanded=True))
        self.assertNotIn("Launcher", overview)
        self.assertNotIn("Merge queue", overview)
        self.assertIn("Launcher", details)
        self.assertIn("Merge queue", details)

    def test_ansi_hierarchy_styles_status_without_shouting_metadata(self) -> None:
        with mock.patch.dict(os.environ, {"HUD_COLOR": "always"}, clear=False):
            os.environ.pop("NO_COLOR", None)
            styled = hud.colorize_line(
                "│ Retry wait  4  ATTENTION  next due now · Symphony age 7s │"
            )
        self.assertFalse(styled.startswith("\x1b[1;33m"))
        self.assertIn("\x1b[1;33mATTENTION\x1b[0m", styled)
        self.assertIn("\x1b[2m · Symphony age 7s\x1b[0m", styled)

    def test_metadata_status_token_restores_dim_styling_after_reset(self) -> None:
        with mock.patch.dict(os.environ, {"HUD_COLOR": "always"}, clear=False):
            os.environ.pop("NO_COLOR", None)
            styled = hud.colorize_line(
                "│ Open PRs  17  DEGRADED  source · ATTENTION remains dim │"
            )

        self.assertIn("\x1b[1;33mDEGRADED\x1b[0m", styled)
        self.assertIn(
            "\x1b[2m · \x1b[1;33mATTENTION\x1b[0m\x1b[2m remains dim\x1b[0m",
            styled,
        )

    def test_default_alive_status_token_is_styled_once(self) -> None:
        styled = hud._style_status_tokens("DEFAULT ALIVE ACTIVE")

        self.assertIn("\x1b[1;32mDEFAULT ALIVE\x1b[0m", styled)
        self.assertIn("\x1b[1;32mACTIVE\x1b[0m", styled)
        self.assertNotRegex(styled, r"DEFAULT \x1b\[[0-9;]*mACTIVE")

    def test_linux_console_token_mapping_is_explicit_and_bounded(self) -> None:
        self.assertEqual(hud.ANSI_TOKEN_ROLES["surface.panel"], "black")
        self.assertEqual(hud.ANSI_TOKEN_ROLES["accent.ion"], "cyan")
        self.assertEqual(hud.ANSI_TOKEN_ROLES["status.success"], "green")
        self.assertEqual(hud.ANSI_TOKEN_ROLES["status.warning"], "yellow")
        self.assertEqual(hud.ANSI_TOKEN_ROLES["status.error"], "red")


class RefreshTests(unittest.TestCase):
    def test_linear_unconfigured_error_remains_typed_and_recoverable(self) -> None:
        with mock.patch.object(
            hud, "fetch_linear_issues", side_effect=RuntimeError("linear_unconfigured")
        ):
            result = hud.fetch_issue_source()
        self.assertEqual(result["error"], "linear_unconfigured")
        self.assertEqual(result["source"], "linear")
        self.assertTrue(result["degraded"])

    def test_local_and_remote_collectors_are_separated(self) -> None:
        collectors = {
            "fetch_symphony": mock.Mock(return_value={"updated": stamp(), "error": None}),
            "fetch_fleet_gate": mock.Mock(return_value={"updated": stamp(), "error": None}),
            "fetch_ops_metrics": mock.Mock(return_value={"updated": stamp(), "error": None}),
            "fetch_delivery": mock.Mock(return_value={"updated": stamp(), "error": None}),
            "fetch_issue_source": mock.Mock(return_value={"updated": stamp(), "error": None}),
            "save_state": mock.Mock(),
        }
        with mock.patch.multiple(hud, **collectors):
            state = hud.refresh({}, remote=False)
            self.assertEqual(set(state), {"symphony", "fleet", "ops"})
            hud.fetch_delivery.assert_not_called()
            hud.fetch_issue_source.assert_not_called()
            state = hud.refresh(state, remote=True)
            self.assertEqual(set(state), {"symphony", "fleet", "ops", "delivery", "issues"})
            hud.fetch_delivery.assert_called_once_with()
            hud.fetch_issue_source.assert_called_once_with()

    def test_failed_refresh_preserves_last_good_and_marks_error(self) -> None:
        original = {"updated": stamp(30), "error": None, "counts": {"implementing": 2}}
        state = {"symphony": dict(original)}
        with mock.patch.object(hud, "fetch_symphony", side_effect=TimeoutError), mock.patch.object(
            hud, "fetch_fleet_gate", return_value={"updated": stamp(), "error": None}
        ), mock.patch.object(hud, "fetch_ops_metrics", return_value={"updated": stamp(), "error": None}), mock.patch.object(
            hud, "save_state"
        ):
            result = hud.refresh(state, remote=False)
        self.assertEqual(result["symphony"]["updated"], original["updated"])
        self.assertEqual(result["symphony"]["counts"], original["counts"])
        self.assertEqual(result["symphony"]["error"], "TimeoutError")

    def test_fetch_symphony_marks_all_endpoint_failures_as_synthesized(self) -> None:
        with mock.patch.object(hud, "http_text", side_effect=TimeoutError), mock.patch.object(
            hud, "process_count", return_value=0
        ), mock.patch.object(hud, "configured_slots", return_value=4):
            result = hud.fetch_symphony()

        self.assertTrue(result["synthesized"])
        self.assertEqual(result["counts"]["implementing"], 0)
        self.assertIn("JOV:TimeoutError", result["error"])
        self.assertIn("LYB:TimeoutError", result["error"])

    def test_once_cli_routes_keyboard_view_and_canvas_arguments(self) -> None:
        state = live_state()
        stdout = io.StringIO()
        with mock.patch.object(
            hud.sys,
            "argv",
            ["gem-ops-hud", "--once", "--view", "details", "--width", "430", "--height", "90"],
        ), mock.patch.object(hud, "prepare_console"), mock.patch.object(
            hud, "load_state", return_value={}
        ), mock.patch.object(hud, "refresh", return_value=state), mock.patch.object(
            hud, "render", return_value="screen\n"
        ) as render, mock.patch.object(hud.sys, "stdout", stdout):
            result = hud.main()
        self.assertEqual(result, 0)
        self.assertEqual(stdout.getvalue(), "screen\n")
        render.assert_called_once_with(state, 430, 90, "details")


class SourceContractTests(unittest.TestCase):
    def test_production_unbound_pauses_only_release_promotion(self) -> None:
        receipt = live_state()["fleet"]
        receipt.update(
            {
                "state": "AMBER",
                "promotionMode": "hold-intake",
                "reasons": [{"code": "production-deployment-unbound"}],
                "promotionAdmission": {"allowed": False},
            }
        )

        lanes = hud.fleet_lane_statuses(receipt)

        self.assertEqual(lanes["work"][0], "ACTIVE")
        self.assertEqual(lanes["leases"][0], "ACTIVE")
        self.assertEqual(lanes["remediation"][0], "ACTIVE")
        self.assertEqual(lanes["queue"][0], "FLOWING")
        self.assertEqual(lanes["promotion"][0], "PAUSED")
        self.assertIn("exact-main", lanes["promotion"][1])

    def test_red_fleet_blocks_remote_mutation_but_keeps_local_diagnosis(self) -> None:
        receipt = live_state()["fleet"]
        receipt.update(
            {
                "state": "RED",
                "promotionMode": "blocked",
                "reasons": [{"code": "credential-compromise"}],
                "alreadyAdmittedCohort": {
                    "preserve": False,
                    "newIntakeAllowed": False,
                    "semantics": "dequeue-until-exact-production-recovers",
                },
                "workAdmission": {"allowed": False, "newIssueLeaseAllowed": False},
                "promotionAdmission": {"allowed": False},
                "remediationAdmission": {
                    "allowed": True,
                    "localAllowed": True,
                    "pushAllowed": False,
                },
                "deploymentAdmission": {"allowed": False},
            }
        )

        lanes = hud.fleet_lane_statuses(receipt)

        self.assertEqual(lanes["work"][0], "BLOCKED")
        self.assertEqual(lanes["leases"][0], "BLOCKED")
        self.assertEqual(lanes["remediation"][0], "LOCAL ONLY")
        self.assertEqual(lanes["queue"][0], "BLOCKED")
        self.assertEqual(lanes["promotion"][0], "BLOCKED")
        self.assertEqual(lanes["deployment"][0], "BLOCKED")

    def test_stale_or_failed_fleet_receipt_never_projects_authority(self) -> None:
        for receipt in (
            {
                **live_state()["fleet"],
                "observedAt": "2020-01-01T00:00:00Z",
                "updated": "2020-01-01T00:00:00Z",
            },
            {**live_state()["fleet"], "error": "OSError"},
        ):
            with self.subTest(receipt=receipt):
                lanes = hud.fleet_lane_statuses(receipt)
                self.assertEqual(
                    {status for status, _detail in lanes.values()}, {"NOT PROVEN"}
                )

    def test_mixed_blocked_reasons_never_describe_promotion_as_safe_pause(self) -> None:
        receipt = live_state()["fleet"]
        receipt.update(
            {
                "state": "AMBER",
                "promotionMode": "blocked",
                "reasons": [
                    {"code": "production-deployment-unbound"},
                    {"code": "queue-unknown"},
                ],
                "promotionAdmission": {"allowed": False},
            }
        )

        lanes = hud.fleet_lane_statuses(receipt)

        self.assertEqual(lanes["promotion"][0], "BLOCKED")
        self.assertNotIn("clean queue stay separate", lanes["promotion"][1])

    def test_fleet_reader_fails_closed_on_untyped_admission(self) -> None:
        receipt = live_state()["fleet"]
        receipt["workAdmission"] = {
            "allowed": "true",
            "newIssueLeaseAllowed": True,
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "latest.json"
            path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaises(ValueError):
                hud.fetch_fleet_gate(path)

    def test_fleet_reader_rejects_naive_and_future_timestamps(self) -> None:
        for observed_at in ("2026-08-17T22:00:00", "2099-01-01T00:00:00Z"):
            receipt = live_state()["fleet"]
            receipt["observedAt"] = observed_at
            with self.subTest(observed_at=observed_at), tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / "latest.json"
                path.write_text(json.dumps(receipt), encoding="utf-8")
                with self.assertRaises(ValueError):
                    hud.fetch_fleet_gate(path)

    def test_pr_fleet_reader_accepts_complete_typed_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "pr-fleet.json"
            path.write_text(json.dumps(pr_fleet_audit()), encoding="utf-8")

            result = hud.load_pr_fleet_closure_audit(path)

        self.assertIsNone(result["error"])
        self.assertEqual(result["total"], 117)
        self.assertEqual(sum(result["counts"].values()), 117)
        self.assertEqual(result["counts"]["ownerless"], 0)
        self.assertEqual(result["queue"][0]["number"], 16490)

    def test_pr_fleet_reader_fails_closed_on_partial_or_invalid_receipts(self) -> None:
        moment = dt.datetime(2026, 8, 31, 18, 37, tzinfo=dt.timezone.utc)
        observed = hud.iso(moment)
        stale = hud.iso(moment - dt.timedelta(minutes=11))
        cases = {
            "partial": (
                pr_fleet_audit(observedAt=observed, pageInfo={"hasNextPage": True}),
                "pr-fleet-closure-audit-partial-pagination",
            ),
            "missing-completion-proof": (
                pr_fleet_audit(
                    observedAt=observed,
                    complete=None,
                    pageInfo={"endCursor": None},
                ),
                "pr-fleet-closure-audit-partial-pagination",
            ),
            "stale": (
                pr_fleet_audit(observedAt=stale),
                "pr-fleet-closure-audit-stale",
            ),
            "source-mismatch": (
                pr_fleet_audit(observedAt=observed, repo="OtherOrg/OtherRepo"),
                "pr-fleet-closure-audit-source-mismatch",
            ),
            "total-mismatch": (
                pr_fleet_audit(observedAt=observed, totalOpenPrs=118),
                "pr-fleet-closure-audit-total-mismatch",
            ),
        }

        for name, (payload, expected_error) in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / "pr-fleet.json"
                path.write_text(json.dumps(payload), encoding="utf-8")
                with mock.patch.object(hud, "now", return_value=moment):
                    result = hud.load_pr_fleet_closure_audit(path)

            self.assertEqual(result["error"], expected_error)
            self.assertIsNone(result["total"])
            self.assertTrue(all(value is None for value in result["counts"].values()))

    def test_delivery_fetch_uses_typed_pr_fleet_audit_not_first_40_open_prs(self) -> None:
        self.assertNotIn("pullRequests(first: 40, states: OPEN", hud.GRAPHQL_QUERY)
        pr_fleet = hud.load_pr_fleet_closure_audit(
            self._write_pr_fleet_receipt(pr_fleet_audit())
        )

        def fake_run_json(args):
            if args[:3] == ["gh", "api", "graphql"]:
                return {
                    "data": {
                        "repository": {
                            "defaultBranchRef": {"target": {"oid": "a" * 40}},
                            "merged": {"nodes": []},
                        }
                    }
                }
            return {"workflow_runs": []}

        with mock.patch.object(hud, "run_json", side_effect=fake_run_json), mock.patch.object(
            hud,
            "http_json",
            side_effect=[{"commitSha": "a" * 40}, {"status": "healthy"}],
        ), mock.patch.object(
            hud, "load_summer_queue", return_value={"items": [], "error": None}
        ), mock.patch.object(
            hud, "load_pr_fleet_closure_audit", return_value=pr_fleet
        ):
            result = hud.fetch_delivery()

        self.assertEqual(result["prs"]["total"], 117)
        self.assertEqual(result["prs"]["ready"], 15)
        self.assertEqual(result["pr_fleet"]["counts"]["conflict"], 28)

    def _write_pr_fleet_receipt(self, payload: dict) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "pr-fleet.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_linear_is_authoritative_when_available(self) -> None:
        with mock.patch.object(
            hud,
            "fetch_linear_issues",
            return_value={"open": 13, "backlog": 8, "ready": 3},
        ):
            result = hud.fetch_issue_source()

        self.assertEqual(result["source"], "linear")
        self.assertFalse(result["degraded"])
        self.assertEqual(result["backlog"], 8)
        self.assertEqual(result["ready"], 3)

    def test_linear_counts_paginated_workflow_states(self) -> None:
        pages = [
            {"teams": {"nodes": [{"id": "team-id"}]}},
            {
                "issues": {
                    "nodes": [
                        {"state": {"type": "backlog"}},
                        {"state": {"type": "unstarted"}},
                        {"state": {"type": "started"}},
                    ],
                    "pageInfo": {"hasNextPage": True, "endCursor": "next"},
                }
            },
            {
                "issues": {
                    "nodes": [
                        {"state": {"type": "backlog"}},
                        {"state": {"type": "unstarted"}},
                    ],
                    "pageInfo": {"hasNextPage": False, "endCursor": None},
                }
            },
        ]
        with mock.patch.object(hud, "linear_graphql", side_effect=pages) as graphql:
            result = hud.fetch_linear_issues()

        self.assertEqual(result, {"open": 5, "backlog": 2, "ready": 2})
        self.assertEqual(graphql.call_count, 3)
        self.assertEqual(graphql.call_args_list[2].args[1]["after"], "next")

    def test_github_fallback_is_retired_when_linear_fails(self) -> None:
        with (
            mock.patch.object(
                hud,
                "fetch_linear_issues",
                side_effect=hud.urllib.error.HTTPError(
                    hud.LINEAR_API, 401, "unauthorized", {}, None
                ),
            ),
            mock.patch.object(
                hud,
                "fetch_github_issues",
                return_value={"open": 11, "backlog": 11, "ready": 2},
            ) as github,
        ):
            result = hud.fetch_issue_source()

        self.assertEqual(result["source"], "linear")
        self.assertTrue(result["degraded"])
        self.assertEqual(result["error"], "linear_unauthorized")
        github.assert_not_called()

        state = live_state()
        state["issues"] = result
        output = hud.render(state, width=430, height=90)
        self.assertIn("Linear issue source", output)
        self.assertIn("UNAVAILABLE", output)

    def test_github_issue_fallback_is_removed(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "GitHub Issue fallback retired"):
            hud.fetch_github_issues()


class BusinessMetricContractTests(unittest.TestCase):
    def test_default_alive_requires_revenue_covering_burn(self) -> None:
        verdict, status, detail = hud.default_alive_verdict(1_000, 100, 80, 70)

        self.assertEqual(verdict, "DEFAULT DEAD")
        self.assertEqual(status, "DEFAULT DEAD")
        self.assertIn("revenue $80/wk is below burn $100/wk", detail)
        self.assertIn("default alive requires revenue covering all-in burn", detail)
        self.assertIn("trend projects burn coverage", detail)

    def test_negative_financial_inputs_are_unavailable_before_verdict(self) -> None:
        overlay = {
            "source": "authoritative-fixture",
            "observedAt": stamp(),
            "cash_usd": 50_000,
            "weekly_burn_usd": -100,
            "weekly_revenue_usd": 0,
            "weekly_revenue_prev_usd": 0,
            "active_users": 0,
            "active_users_prev": 0,
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text(json.dumps(overlay), encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()

        self.assertIsNone(result["weekly_burn_usd"])
        self.assertEqual(result["weekly_revenue_usd"], 0)
        self.assertEqual(result["verdict"], "UNKNOWN")
        self.assertNotEqual(result["verdict"], "DEFAULT ALIVE")

    def test_negative_count_inputs_are_unavailable_before_growth_or_ship_counts(self) -> None:
        overlay = {
            "source": "authoritative-fixture",
            "observedAt": stamp(),
            "weekly_burn_usd": 100,
            "weekly_revenue_usd": 100,
            "active_users": -2,
            "active_users_prev": 10,
            "ships_this_week": -1,
            "ships_last_week": 3,
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text(json.dumps(overlay), encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()

        self.assertIsNone(result["active_users"])
        self.assertEqual(result["active_users_prev"], 10)
        self.assertIsNone(result["ships_this_week"])
        self.assertEqual(result["ships_last_week"], 3)
        self.assertIsNone(result["growth"]["pct"])

    def test_measured_overlay_drives_business_pulse_without_invented_values(self) -> None:
        overlay = {
            "source": "authoritative-fixture",
            "cash_usd": 50_000,
            "weekly_burn_usd": 3_500,
            "weekly_revenue_usd": 4_250,
            "weekly_revenue_prev_usd": 4_000,
            "active_users": 1_234,
            "active_users_prev": 1_100,
            "ships_this_week": 5,
            "ships_last_week": 4,
            "bottleneck": "JOV-5399 release controller decision",
            "bottleneck_handle": "https://github.com/JovieInc/Jovie/pull/16490",
            "bottleneck_start": stamp(3_600),
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text(json.dumps(overlay), encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()

        self.assertEqual(result["source"], "authoritative-fixture")
        self.assertAlmostEqual(result["growth"]["pct"], 6.25)
        self.assertEqual(result["active_users"], 1_234)
        self.assertEqual(result["weekly_revenue_usd"], 4_250)
        self.assertEqual(result["verdict"], "DEFAULT ALIVE")
        self.assertEqual(result["bottleneck"], overlay["bottleneck"])

    def test_missing_overlay_keeps_financial_and_user_metrics_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            missing = Path(temporary) / "missing.json"
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", missing), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()

        self.assertIsNone(result["updated"])
        self.assertEqual(result["error"], "measured-overlay-missing")
        self.assertFalse(result["overlay_present"])
        self.assertEqual(hud.section_evidence({"ops": result}, "ops")[0], "UNAVAILABLE")
        self.assertIsNone(result["weekly_revenue_usd"])
        self.assertIsNone(result["active_users"])
        self.assertIsNone(result["growth"]["pct"])
        self.assertEqual(result["verdict"], "UNKNOWN")
        self.assertIn("unmeasured is not $0", result["verdict_detail"])

    def test_empty_overlay_is_unavailable_not_healthy_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text("{}", encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()

        self.assertIsNotNone(result["updated"])
        self.assertIsNone(result["error"])
        self.assertTrue(result["overlay_present"])
        self.assertEqual(hud.section_evidence({"ops": result}, "ops")[0], "UNAVAILABLE")
        self.assertIsNone(result["weekly_revenue_usd"])
        self.assertIsNone(result["bottleneck"])

    def test_malformed_overlay_reports_parse_error_without_last_good_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text("{malformed", encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()

        self.assertIsNotNone(result["updated"])
        self.assertEqual(result["error"], "measured-overlay-malformed")
        self.assertTrue(result["overlay_present"])
        self.assertEqual(hud.section_evidence({"ops": result}, "ops")[0], "UNAVAILABLE")

    def test_overlay_observed_timestamp_drives_staleness(self) -> None:
        moment = dt.datetime(2026, 8, 31, 18, 20, tzinfo=dt.timezone.utc)
        observed = hud.iso(moment - dt.timedelta(seconds=hud.STALE_AFTER["ops"] + 1))
        overlay = {
            "source": "authoritative-fixture",
            "observedAt": observed,
            "weekly_burn_usd": 3_500,
            "weekly_revenue_usd": 4_250,
            "weekly_revenue_prev_usd": 4_000,
            "active_users": 1_234,
            "active_users_prev": 1_100,
            "bottleneck": "JOV-5399 release controller decision",
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text(json.dumps(overlay), encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.object(
                hud, "now", return_value=moment
            ), mock.patch.dict(
                os.environ,
                {key: "" for key in OPS_ENV_KEYS},
                clear=False,
            ):
                result = hud.fetch_ops_metrics()
                evidence = hud.section_evidence({"ops": result}, "ops")

        self.assertEqual(result["updated"], observed)
        self.assertEqual(result["error"], None)
        self.assertEqual(result["weekly_revenue_usd"], 4_250)
        self.assertEqual(result["bottleneck"], overlay["bottleneck"])
        self.assertEqual(evidence[0], "STALE")

    def test_partial_env_override_preserves_overlay_freshness_for_overlay_values(self) -> None:
        moment = dt.datetime(2026, 8, 31, 18, 20, tzinfo=dt.timezone.utc)
        observed = hud.iso(moment - dt.timedelta(seconds=hud.STALE_AFTER["ops"] + 1))
        overlay = {
            "source": "authoritative-fixture",
            "observedAt": observed,
            "cash_usd": 50_000,
            "weekly_burn_usd": 3_500,
            "weekly_revenue_usd": 4_250,
            "weekly_revenue_prev_usd": 4_000,
            "active_users": 1_234,
            "active_users_prev": 1_100,
        }
        env = {key: "" for key in OPS_ENV_KEYS}
        env["HUD_BOTTLENECK"] = "current operator bottleneck"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "measured.json"
            path.write_text(json.dumps(overlay), encoding="utf-8")
            with mock.patch.object(hud, "MEASURED_METRICS_FILE", path), mock.patch.object(
                hud, "now", return_value=moment
            ), mock.patch.dict(os.environ, env, clear=False):
                result = hud.fetch_ops_metrics()
                evidence = hud.section_evidence({"ops": result}, "ops")

        self.assertEqual(result["bottleneck"], "current operator bottleneck")
        self.assertEqual(result["weekly_revenue_usd"], 4_250)
        self.assertEqual(result["updated"], observed)
        self.assertEqual(result["source"], "authoritative-fixture+env")
        self.assertEqual(evidence[0], "STALE")

    def test_active_user_growth_is_labeled_as_fallback_not_revenue(self) -> None:
        result = hud.wow_growth(None, None, 110, 100)
        self.assertEqual(result["series"], "active users")
        self.assertEqual(result["pct"], 10.0)
        self.assertIn("no measured revenue", result["detail"])

    def test_zero_active_users_without_prior_week_keeps_growth_unknown(self) -> None:
        result = hud.wow_growth(None, None, 0, None)

        self.assertEqual(result["series"], "active users")
        self.assertEqual(result["this"], 0)
        self.assertIsNone(result["last"])
        self.assertIsNone(result["pct"])
        self.assertIn("prior week unmeasured", result["detail"])


class FrameTests(unittest.TestCase):
    def test_frame_writer_clears_only_the_first_or_resized_frame(self) -> None:
        calls = []
        writer = hud.TerminalFrameWriter()
        with mock.patch.object(
            hud, "_write_terminal_frame", side_effect=lambda output, clear: calls.append(clear)
        ):
            writer.write("first frame\n")
            writer.write("next  frame\n")
            writer.write("resized frame!\n")
        self.assertEqual(calls, [True, False, True])

    def test_terminal_payload_is_cursor_home_without_interframe_blank(self) -> None:
        first = hud._terminal_frame_payload("frame\n", clear=True)
        next_frame = hud._terminal_frame_payload("frame\n", clear=False)
        self.assertEqual(first.count(b"\x1b[2J"), 1)
        self.assertNotIn(b"\x1b[2J", next_frame)
        self.assertEqual(next_frame.count(b"\x1b[H"), 1)
        self.assertTrue(next_frame.startswith(b"\x1b[?25l\x1b[H"))
        self.assertTrue(next_frame.endswith(b"\x1b[0m\x1b[?25h"))

    def test_normal_frame_is_emitted_in_one_os_write(self) -> None:
        stdout = mock.Mock()
        stdout.fileno.return_value = 9
        with mock.patch.object(hud.sys, "stdout", stdout), mock.patch.object(
            hud.os, "write", side_effect=lambda descriptor, payload: len(payload)
        ) as write:
            hud._write_terminal_frame("complete frame\n", clear=False)
        self.assertEqual(write.call_count, 1)
        self.assertEqual(write.call_args.args[0], 9)

    def test_frame_write_fails_if_terminal_makes_no_progress(self) -> None:
        stdout = mock.Mock()
        stdout.fileno.return_value = 9
        with mock.patch.object(hud.sys, "stdout", stdout), mock.patch.object(
            hud.os, "write", return_value=0
        ):
            with self.assertRaisesRegex(OSError, "made no progress"):
                hud._write_terminal_frame("complete frame\n", clear=False)

    def test_live_loop_routes_frames_through_the_atomic_writer(self) -> None:
        state = live_state()
        writer = mock.Mock()
        writer_type = mock.Mock(return_value=writer)
        with mock.patch.object(
            hud.sys,
            "argv",
            ["gem-ops-hud", "--no-clear", "--width", "430", "--height", "90"],
        ), mock.patch.object(hud, "prepare_console"), mock.patch.object(
            hud, "load_state", return_value={}
        ), mock.patch.object(hud, "refresh", return_value=state), mock.patch.object(
            hud, "render", return_value="complete frame\n"
        ), mock.patch.object(hud, "TerminalFrameWriter", writer_type), mock.patch.object(
            hud.time, "sleep", side_effect=KeyboardInterrupt
        ):
            with self.assertRaises(KeyboardInterrupt):
                hud.main()
        writer_type.assert_called_once_with(allow_clear=False)
        writer.write.assert_called_once_with("complete frame\n")

class SummerQueueContractTests(unittest.TestCase):
    def test_hud_renders_persisted_summer_queue_without_inventing_items(self):
        state = live_state()
        state["delivery"]["summer_queue"] = {
            "schema": "jovie-summer-red-queue/v2",
            "authority": "Summer",
            "observedAt": hud.iso(),
            "terminalTombstones": [],
            "items": [{
                "issue": "JOV-5390", "stallClass": "size-guard", "outcome": "escalated",
                "terminal": True,
                "observedAt": hud.iso(),
                "reason": "retry-budget-exhausted:size-guard",
            }],
            "error": None,
        }
        output = hud.render(state, width=430, height=90)
        self.assertIn("JOV-5390", output)
        self.assertIn("retry-budget-exhausted:size-guard", output)
        self.assertIn("canonical persisted stall state", output)

    def test_hud_is_display_only_for_summer_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summer-queue.json"
            path.write_text(json.dumps({
                "schema": "jovie-summer-red-queue/v2",
                "authority": "Summer",
                "observedAt": hud.iso(),
                "terminalTombstones": [],
                "items": [{
                    "issue": "JOV-12",
                    "stallClass": "queue-eviction",
                    "outcome": "open",
                    "terminal": False,
                    "observedAt": hud.iso(),
                }],
            }), encoding="utf-8")
            before = path.read_text(encoding="utf-8")
            loaded = hud.load_summer_queue(path)
            self.assertEqual(before, path.read_text(encoding="utf-8"))
            self.assertEqual(loaded["items"][0]["issue"], "JOV-12")
            missing = hud.load_summer_queue(Path(tmp) / "missing.json")
        self.assertEqual(missing["items"], [])
        self.assertIn("summer-queue-unavailable", missing["error"])

    def test_fresh_queue_never_launders_stale_item_as_current_bottleneck(self):
        moment = dt.datetime(2026, 8, 28, 22, 0, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summer-queue.json"
            path.write_text(json.dumps({
                "schema": "jovie-summer-red-queue/v2",
                "authority": "Summer",
                "observedAt": hud.iso(moment),
                "terminalTombstones": [],
                "items": [{
                    "issue": "JOV-5335",
                    "pr": 16423,
                    "stallClass": "missing-failing-checks",
                    "outcome": "open",
                    "terminal": False,
                    "observedAt": "2026-08-23T06:15:00Z",
                    "reason": "land #16423",
                }],
            }), encoding="utf-8")
            with mock.patch.object(hud, "now", return_value=moment):
                loaded = hud.load_summer_queue(path)
                state = live_state()
                state["delivery"]["summer_queue"] = loaded
                output = hud.render(state, width=430, height=90)

        self.assertEqual(loaded["items"], [])
        self.assertEqual(loaded["updated"], hud.iso(moment))
        self.assertEqual(loaded["suppressed"]["stale"], 1)
        self.assertEqual(
            loaded["error"],
            "summer-queue-items-rejected:stale=1,malformed=0",
        )
        self.assertNotIn("JOV-5335", output)
        self.assertNotIn("land #16423", output)

    def test_summer_queue_receipt_fails_closed_on_invalid_or_stale_source_time(self):
        moment = dt.datetime(2026, 8, 28, 22, 0, tzinfo=dt.timezone.utc)
        cases = {
            "legacy-schema": (
                {
                    "schema": "jovie-summer-red-queue/v1",
                    "authority": "Summer",
                    "observedAt": hud.iso(moment),
                },
                "summer-queue-malformed",
            ),
            "missing-authority": ({"observedAt": hud.iso(moment)}, "summer-queue-malformed"),
            "missing-time": ({"authority": "Summer"}, "summer-queue-invalid-observedAt"),
            "naive-time": (
                {"authority": "Summer", "observedAt": "2026-08-28T22:00:00"},
                "summer-queue-invalid-observedAt",
            ),
            "future-time": (
                {"authority": "Summer", "observedAt": "2026-08-28T22:00:06Z"},
                "summer-queue-future-observedAt",
            ),
            "stale-time": (
                {"authority": "Summer", "observedAt": "2026-08-28T20:29:59Z"},
                "summer-queue-stale",
            ),
        }
        for name, (override, expected_error) in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "summer-queue.json"
                path.write_text(json.dumps({
                    "schema": "jovie-summer-red-queue/v2",
                    "items": [],
                    "terminalTombstones": [],
                    **override,
                }), encoding="utf-8")
                with mock.patch.object(hud, "now", return_value=moment):
                    loaded = hud.load_summer_queue(path)

            self.assertEqual(loaded["items"], [])
            self.assertEqual(loaded["error"], expected_error)

    def test_summer_queue_rejects_untyped_terminal_and_stale_items(self):
        moment = dt.datetime(2026, 8, 28, 22, 0, tzinfo=dt.timezone.utc)
        observed_at = hud.iso(moment)
        malformed = [
            "not-an-object",
            {"outcome": "unknown", "terminal": False, "observedAt": observed_at},
            {"outcome": "open", "terminal": "false", "observedAt": observed_at},
            {"outcome": "open", "terminal": True, "observedAt": observed_at},
            {"outcome": "healthy", "terminal": False, "observedAt": observed_at},
            {"outcome": "escalated", "terminal": False, "observedAt": observed_at},
            {"outcome": "open", "terminal": False, "observedAt": "2026-08-28T22:00:06Z"},
            {"outcome": "open", "terminal": False, "observedAt": None},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summer-queue.json"
            path.write_text(json.dumps({
                "schema": "jovie-summer-red-queue/v2",
                "authority": "Summer",
                "observedAt": observed_at,
                "terminalTombstones": [],
                "items": [
                    *malformed,
                    {
                        "issue": "JOV-OLD",
                        "outcome": "open",
                        "terminal": False,
                        "observedAt": "2026-08-28T20:29:59Z",
                    },
                ],
            }), encoding="utf-8")
            with mock.patch.object(hud, "now", return_value=moment):
                loaded = hud.load_summer_queue(path)

        self.assertEqual(loaded["items"], [])
        self.assertEqual(loaded["suppressed"]["stale"], 1)
        self.assertEqual(loaded["suppressed"]["malformed"], len(malformed))

    def test_terminal_linked_pr_and_issue_are_tombstoned_but_escalation_remains(self):
        moment = dt.datetime(2026, 8, 28, 22, 0, tzinfo=dt.timezone.utc)
        observed_at = hud.iso(moment)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summer-queue.json"
            path.write_text(json.dumps({
                "schema": "jovie-summer-red-queue/v2",
                "authority": "Summer",
                "observedAt": observed_at,
                "terminalTombstones": [{
                    "issue": "JOV-5335",
                    "pr": 16423,
                    "outcome": "healthy",
                    "terminal": True,
                    "observedAt": observed_at,
                    "reason": "linked-pr-merged-and-linear-done",
                }],
                "items": [
                    {
                        "issue": "JOV-5390",
                        "outcome": "escalated",
                        "terminal": True,
                        "observedAt": observed_at,
                        "reason": "founder-action-required",
                    },
                ],
            }), encoding="utf-8")
            with mock.patch.object(hud, "now", return_value=moment):
                loaded = hud.load_summer_queue(path)

        self.assertEqual([item["issue"] for item in loaded["items"]], ["JOV-5390"])
        self.assertEqual(loaded["terminalTombstones"][0]["issue"], "JOV-5335")
        self.assertEqual(loaded["terminalTombstones"][0]["pr"], 16423)
        self.assertEqual(loaded["terminalTombstones"][0]["observedAt"], observed_at)
        self.assertIsNone(loaded["error"])

    def test_terminal_tombstone_requires_typed_identity_and_timestamp(self):
        moment = dt.datetime(2026, 8, 28, 22, 0, tzinfo=dt.timezone.utc)
        for tombstone in (
            "not-an-object",
            {"issue": "JOV-1", "outcome": "healthy", "terminal": True, "observedAt": 1},
            {"pr": True, "outcome": "healthy", "terminal": True, "observedAt": hud.iso(moment)},
            {"issue": "JOV-1", "outcome": "open", "terminal": True, "observedAt": hud.iso(moment)},
        ):
            with self.subTest(tombstone=tombstone), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "summer-queue.json"
                path.write_text(json.dumps({
                    "schema": "jovie-summer-red-queue/v2",
                    "authority": "Summer",
                    "observedAt": hud.iso(moment),
                    "terminalTombstones": [tombstone],
                    "items": [],
                }), encoding="utf-8")
                with mock.patch.object(hud, "now", return_value=moment):
                    loaded = hud.load_summer_queue(path)

            self.assertEqual(loaded["items"], [])
            self.assertEqual(loaded["error"], "summer-queue-malformed-tombstone")

    def test_fresh_active_summer_item_is_preserved_with_source_timestamp(self):
        moment = dt.datetime(2026, 8, 28, 22, 0, tzinfo=dt.timezone.utc)
        observed_at = hud.iso(moment - dt.timedelta(minutes=5))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summer-queue.json"
            path.write_text(json.dumps({
                "schema": "jovie-summer-red-queue/v2",
                "authority": "Summer",
                "observedAt": observed_at,
                "terminalTombstones": [],
                "items": [{
                    "issue": "JOV-5400",
                    "pr": 16599,
                    "outcome": "open",
                    "terminal": False,
                    "observedAt": observed_at,
                    "reason": "ci-failed",
                }],
            }), encoding="utf-8")
            with mock.patch.object(hud, "now", return_value=moment):
                loaded = hud.load_summer_queue(path)

        self.assertEqual(loaded["updated"], observed_at)
        self.assertEqual([item["issue"] for item in loaded["items"]], ["JOV-5400"])
        self.assertIsNone(loaded["error"])


if __name__ == "__main__":
    unittest.main()
