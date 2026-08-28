#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import pathlib
import sys
import tempfile
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
    stamp = HUD.iso()
    next_retry = HUD.iso(HUD.now() + dt.timedelta(minutes=1))
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
            "next_retry": next_retry,
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
        "fleet": {
            "schema": "jovie-fleet-gate/v1",
            "observedAt": stamp,
            "updated": stamp,
            "error": None,
            "state": "GREEN",
            "promotionMode": "normal",
            "reasons": [],
            "alreadyAdmittedCohort": {
                "preserve": True,
                "newIntakeAllowed": True,
                "semantics": "normal",
            },
            "signals": {
                "queue": {
                    "status": "known",
                    "eligiblePrs": 19,
                    "greenReadyPrs": 4,
                    "target": 15,
                }
            },
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
            "promotionAdmission": {"allowed": True},
            "remediationAdmission": {
                "allowed": True,
                "localAllowed": True,
                "pushAllowed": True,
            },
            "deploymentAdmission": {"allowed": True},
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
            "[ FLEET POLICY ]", "[ DELIVERY FUNNEL ]", "[ CYCLE TIME ]",
            "[ DETAILS / NEXT ACTION ]",
        ):
            self.assertIn(title, output)
        self.assertIn("LINEAR", output)
        self.assertIn("AUTHORITATIVE", output)
        self.assertIn("Linear Backlog state", output)

    def test_production_unbound_is_rendered_as_release_pause_not_fleet_hold(self):
        state = fixture_state()
        state["fleet"].update(
            {
                "state": "AMBER",
                "promotionMode": "hold-intake",
                "reasons": [
                    {
                        "code": "production-deployment-unbound",
                        "layer": "promotion",
                        "severity": "warning",
                    }
                ],
                "promotionAdmission": {"allowed": False},
            }
        )

        with mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}):
            output = HUD.render(state)

        rows = {
            label: next(line for line in output.splitlines() if f"| {label}" in line)
            for label in (
                "Fleet work",
                "Issue leasing",
                "PR remediation",
                "Native queue",
                "Production promotion",
            )
        }
        self.assertIn("ACTIVE", rows["Fleet work"])
        self.assertIn("ACTIVE", rows["Issue leasing"])
        self.assertIn("ACTIVE", rows["PR remediation"])
        self.assertIn("FLOWING", rows["Native queue"])
        self.assertIn("PAUSED", rows["Production promotion"])
        self.assertIn("exact-main release only", rows["Production promotion"])

    def test_red_fleet_keeps_local_diagnosis_but_blocks_remote_mutation(self):
        state = fixture_state()
        state["fleet"].update(
            {
                "state": "RED",
                "promotionMode": "blocked",
                "reasons": [
                    {
                        "code": "credential-compromise",
                        "layer": "integrity",
                        "severity": "critical",
                    }
                ],
                "alreadyAdmittedCohort": {
                    "preserve": False,
                    "newIntakeAllowed": False,
                    "semantics": "dequeue-until-exact-production-recovers",
                },
                "workAdmission": {
                    "allowed": False,
                    "newIssueLeaseAllowed": False,
                },
                "promotionAdmission": {"allowed": False},
                "remediationAdmission": {
                    "allowed": True,
                    "localAllowed": True,
                    "pushAllowed": False,
                },
                "deploymentAdmission": {"allowed": False},
            }
        )

        lanes = HUD.fleet_lane_statuses(state["fleet"])

        self.assertEqual(lanes["work"][0], "BLOCKED")
        self.assertEqual(lanes["leases"][0], "BLOCKED")
        self.assertEqual(lanes["remediation"][0], "LOCAL ONLY")
        self.assertEqual(lanes["queue"][0], "BLOCKED")
        self.assertEqual(lanes["promotion"][0], "BLOCKED")
        self.assertEqual(lanes["deployment"][0], "BLOCKED")

    def test_stale_or_failed_fleet_receipt_never_projects_active_authority(self):
        for receipt in (
            {
                **fixture_state()["fleet"],
                "observedAt": "2020-01-01T00:00:00Z",
                "updated": "2020-01-01T00:00:00Z",
            },
            {**fixture_state()["fleet"], "error": "OSError"},
        ):
            with self.subTest(receipt=receipt):
                lanes = HUD.fleet_lane_statuses(receipt)
                self.assertEqual(
                    {status for status, _detail in lanes.values()}, {"UNKNOWN"}
                )

    def test_mixed_blocked_reasons_never_describe_promotion_as_safe_pause(self):
        receipt = fixture_state()["fleet"]
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

        lanes = HUD.fleet_lane_statuses(receipt)

        self.assertEqual(lanes["promotion"][0], "BLOCKED")
        self.assertNotIn("clean queue stay separate", lanes["promotion"][1])

    def test_fleet_receipt_reader_fails_closed_on_untyped_admission(self):
        receipt = fixture_state()["fleet"]
        receipt["workAdmission"] = {"allowed": "true", "newIssueLeaseAllowed": True}
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "latest.json"
            path.write_text(json.dumps(receipt), encoding="utf-8")

            with self.assertRaises(ValueError):
                HUD.fetch_fleet_gate(path)

    def test_fleet_receipt_reader_rejects_naive_and_future_timestamps(self):
        for observed_at in ("2026-08-17T22:00:00", "2099-01-01T00:00:00Z"):
            receipt = fixture_state()["fleet"]
            receipt["observedAt"] = observed_at
            with self.subTest(observed_at=observed_at), tempfile.TemporaryDirectory() as tmp:
                path = pathlib.Path(tmp) / "latest.json"
                path.write_text(json.dumps(receipt), encoding="utf-8")

                with self.assertRaises(ValueError):
                    HUD.fetch_fleet_gate(path)

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
            ) as github,
        ):
            result = HUD.fetch_issue_source()

        self.assertEqual(result["source"], "linear")
        self.assertTrue(result["degraded"])
        self.assertEqual(result["error"], "linear_unauthorized")
        github.assert_not_called()

        state = fixture_state()
        state["issues"] = result
        with mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}):
            output = HUD.render(state)
        self.assertIn("LINEAR", output)
        self.assertIn("UNAVAILABLE", output)

    def test_github_counts_only_issues_and_ready_labels(self):
        with self.assertRaisesRegex(RuntimeError, "GitHub Issue fallback retired"):
            HUD.fetch_github_issues()

    def test_refresh_retains_last_good_counts_when_both_sources_fail(self):
        state = fixture_state()
        with (
            mock.patch.object(HUD, "fetch_symphony", return_value=state["symphony"]),
            mock.patch.object(HUD, "fetch_fleet_gate", return_value=state["fleet"]),
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
            mock.patch.object(HUD, "fetch_fleet_gate", return_value=state["fleet"]),
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

    def test_hud_renders_persisted_summer_queue_without_inventing_items(self):
        state = fixture_state()
        state["delivery"]["summer_queue"] = {
            "schema": "jovie-summer-red-queue/v1",
            "authority": "Summer",
            "items": [{
                "issue": "JOV-5390", "stallClass": "size-guard", "outcome": "escalated",
                "reason": "retry-budget-exhausted:size-guard",
            }],
            "error": None,
        }
        with mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}):
            output = HUD.render(state)
        self.assertIn("JOV-5390", output)
        self.assertIn("retry-budget-exhausted:size-guard", output)
        self.assertIn("canonical persisted stall state", output)

    def test_hud_is_display_only_for_summer_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "summer-queue.json"
            path.write_text(json.dumps({
                "schema": "jovie-summer-red-queue/v1",
                "authority": "Summer",
                "items": [{"issue": "JOV-12", "stallClass": "queue-eviction"}],
            }), encoding="utf-8")
            before = path.read_text(encoding="utf-8")
            loaded = HUD.load_summer_queue(path)
            self.assertEqual(before, path.read_text(encoding="utf-8"))
            self.assertEqual(loaded["items"][0]["issue"], "JOV-12")
            missing = HUD.load_summer_queue(pathlib.Path(tmp) / "missing.json")
        self.assertEqual(missing["items"], [])
        self.assertIn("summer-queue-unavailable", missing["error"])


if __name__ == "__main__":
    unittest.main()
