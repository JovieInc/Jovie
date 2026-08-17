#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import importlib.util
import pathlib
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-ops-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_ops_hud", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
HUD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HUD
SPEC.loader.exec_module(HUD)


def fixture_state():
    stamp = "2026-08-16T12:00:00Z"
    return {
        "symphony": {
            "updated": stamp,
            "error": None,
            "workers": {"runner_listeners": 4, "runner_jobs": 1, "symphony_jobs": 1},
            "counts": {"implementing": 1, "retrying": 2, "queued": 3, "blocked": 0},
            "reason_buckets": {
                "capacity": 1, "timeout": 1, "launcher_failure": 0,
                "ci_check_failure": 0, "merge_queue_wait": 0,
                "ownership_input": 0, "other": 0,
            },
            "slots": {"total": 4, "available": 0},
            "next_retry": "2026-08-16T12:01:00Z",
            "jobs": [],
            "blockers": [],
        },
        "delivery": {
            "updated": stamp,
            "error": None,
            "main_sha": "a" * 40,
            "prod_sha": "a" * 40,
            "exact": True,
            "deploy_status": "healthy",
            "prs": {"total": 4, "draft": 1, "ready": 3, "queued": 1},
            "queue": [],
            "runs": [],
            "merged_recent": 7,
            "production_completions": 2,
            "latency": {"ci": {"sample": 4, "typical_seconds": 240, "slow_tail_seconds": 420}},
        },
        "issues": {
            "updated": stamp,
            "error": None,
            "source": "linear",
            "degraded": False,
            "open": 30,
            "backlog": 20,
            "ready": 7,
        },
    }


class VersionedHudContractTests(unittest.TestCase):
    def test_fixture_renders_fixed_width_operational_sections(self):
        moment = dt.datetime(2026, 8, 16, 12, 0, 30, tzinfo=dt.timezone.utc)
        with (
            mock.patch.object(HUD, "now", return_value=moment),
            mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}),
        ):
            output = HUD.render(fixture_state())

        lines = output.rstrip("\n").splitlines()
        self.assertTrue(lines)
        self.assertTrue(all(len(line) == HUD.GRID_WIDTH for line in lines))
        for title in (
            "GEM OPERATIONS", "[ SYMPHONY ]", "[ WAIT REASONS ]",
            "[ DELIVERY FUNNEL ]", "[ CYCLE TIME ]", "[ DETAILS / NEXT ACTION ]",
        ):
            self.assertIn(title, output)
        self.assertIn("LINEAR", output)
        self.assertIn("AUTHORITATIVE", output)
        self.assertIn("Linear Backlog state", output)

    def test_linear_is_authoritative_when_available(self):
        with (
            mock.patch.object(
                HUD,
                "fetch_linear_issues",
                return_value={"open": 13, "backlog": 8, "ready": 3},
            ),
            mock.patch.object(HUD, "fetch_github_issues") as github,
        ):
            result = HUD.fetch_issue_source()

        self.assertEqual(result["source"], "linear")
        self.assertFalse(result["degraded"])
        self.assertEqual(result["backlog"], 8)
        self.assertEqual(result["ready"], 3)
        github.assert_not_called()

    def test_linear_counts_paginated_workflow_states(self):
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
        with mock.patch.object(HUD, "linear_graphql", side_effect=pages) as graphql:
            result = HUD.fetch_linear_issues()

        self.assertEqual(result, {"open": 5, "backlog": 2, "ready": 2})
        self.assertEqual(graphql.call_count, 3)
        self.assertEqual(graphql.call_args_list[2].args[1]["after"], "next")

    def test_github_fallback_is_explicitly_degraded(self):
        with (
            mock.patch.object(
                HUD,
                "fetch_linear_issues",
                side_effect=HUD.urllib.error.HTTPError(
                    HUD.LINEAR_API, 401, "unauthorized", {}, None
                ),
            ),
            mock.patch.object(
                HUD,
                "fetch_github_issues",
                return_value={"open": 11, "backlog": 11, "ready": 2},
            ),
        ):
            result = HUD.fetch_issue_source()

        self.assertEqual(result["source"], "github")
        self.assertTrue(result["degraded"])
        self.assertEqual(result["linear_error"], "unauthorized")

        state = fixture_state()
        state["issues"] = result
        with mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}):
            output = HUD.render(state)
        self.assertIn("GITHUB", output)
        self.assertIn("DEGRADED", output)
        self.assertIn("read-only GitHub fallback", output)

    def test_github_counts_only_issues_and_ready_labels(self):
        pages = [
            [
                {"number": 1, "labels": [{"name": "agent-ready"}]},
                {"number": 2, "labels": [{"name": "ready-for-intake"}]},
                {"number": 3, "labels": [{"name": "infra"}]},
                {
                    "number": 4,
                    "pull_request": {"url": "ignored"},
                    "labels": [{"name": "agent-ready"}],
                },
            ]
        ]
        with mock.patch.object(HUD, "run_json", return_value=pages):
            result = HUD.fetch_github_issues()

        self.assertEqual(result, {"open": 3, "backlog": 3, "ready": 2})

    def test_refresh_retains_last_good_counts_when_both_sources_fail(self):
        state = fixture_state()
        with (
            mock.patch.object(HUD, "fetch_symphony", return_value=state["symphony"]),
            mock.patch.object(HUD, "fetch_delivery", return_value=state["delivery"]),
            mock.patch.object(
                HUD,
                "fetch_issue_source",
                side_effect=HUD.IssueSourceUnavailable("linear_unavailable;github_timeout"),
            ),
            mock.patch.object(HUD, "save_state"),
        ):
            result = HUD.refresh(state, remote=True)

        self.assertEqual(result["issues"]["backlog"], 20)
        self.assertEqual(result["issues"]["ready"], 7)
        self.assertEqual(result["issues"]["error"], "linear_unavailable;github_timeout")
        self.assertTrue(result["issues"]["degraded"])
        with mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}):
            output = HUD.render(result)
        self.assertIn("LAST GOOD", output)
        self.assertIn("last-known counts", output)

    def test_refresh_marks_sources_unavailable_without_last_good_counts(self):
        state = fixture_state()
        del state["issues"]
        with (
            mock.patch.object(HUD, "fetch_symphony", return_value=state["symphony"]),
            mock.patch.object(HUD, "fetch_delivery", return_value=state["delivery"]),
            mock.patch.object(
                HUD,
                "fetch_issue_source",
                side_effect=HUD.IssueSourceUnavailable("linear_error;github_timeout"),
            ),
            mock.patch.object(HUD, "save_state"),
        ):
            result = HUD.refresh(state, remote=True)

        with mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}):
            output = HUD.render(result)
        self.assertIn("UNAVAILABLE", output)
        self.assertIn("both read-only sources unavailable", output)


if __name__ == "__main__":
    unittest.main()
