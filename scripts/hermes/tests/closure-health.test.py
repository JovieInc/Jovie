#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import pathlib
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts/hermes/closure_health.py"
SPEC = importlib.util.spec_from_file_location("closure_health", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

UTC = timezone.utc
NOW = datetime(2026, 8, 28, 5, 0, tzinfo=UTC)


def pr(
    number: int,
    *,
    title: str,
    merge_state: str = "CLEAN",
    draft: bool = False,
    queued: bool = False,
    labels: tuple[str, ...] = (),
    updated_at: datetime = NOW,
    author: str = "summer-test",
) -> dict[str, object]:
    return {
        "number": number,
        "title": title,
        "headRefName": f"symphony/test-pr-{number}",
        "isDraft": draft,
        "mergeStateStatus": merge_state,
        "createdAt": (updated_at - timedelta(hours=1)).isoformat(),
        "updatedAt": updated_at.isoformat(),
        "author": {"login": author},
        "labels": {"nodes": [{"name": label} for label in labels]},
        "mergeQueueEntry": (
            {"position": 1, "enqueuedAt": updated_at.isoformat()}
            if queued
            else None
        ),
    }


def snapshot(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "controller": {
            "status": "green",
            "runId": 42,
            "observedAt": NOW.isoformat(),
        },
        "openPrs": 2,
        "eligiblePrs": 2,
        "greenReadyPrs": 2,
        "nativeQueueCount": 1,
        "latestMergeAt": (NOW - timedelta(hours=1)).isoformat(),
        "classifications": {
            "dispositions": [
                {"number": 1, "state": "queued"},
                {"number": 2, "state": "promote"},
            ],
            "unclassified": [],
            "duplicateIssueLanes": [],
            "expiredHolds": [],
        },
    }
    value.update(overrides)
    return value


class ClosureClassificationTests(unittest.TestCase):
    def test_every_open_pr_receives_a_deterministic_lifecycle_disposition(self):
        result = MODULE.classify_open_prs(
            [
                pr(1, title="feat: ship JOV-101", queued=True),
                pr(2, title="feat: ship JOV-102"),
                pr(3, title="fix: repair JOV-103", merge_state="DIRTY"),
                pr(4, title="wip: JOV-104", draft=True),
            ],
            NOW,
        )

        self.assertEqual(
            {item["number"]: item["state"] for item in result["dispositions"]},
            {1: "queued", 2: "promote", 3: "repair", 4: "held"},
        )
        held = next(item for item in result["dispositions"] if item["number"] == 4)
        self.assertEqual(held["owner"], "summer-test")
        self.assertEqual(held["reason"], "draft")
        self.assertIsInstance(held["expiresAt"], str)
        self.assertEqual(result["unclassified"], [])

    def test_duplicate_issue_lanes_choose_one_canonical_pr_and_stop_the_line(self):
        result = MODULE.classify_open_prs(
            [
                pr(8, title="feat: ship JOV-777", merge_state="DIRTY"),
                pr(9, title="feat: ship JOV-777", queued=True),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [{"issue": "JOV-777", "prs": [8, 9]}])
        dispositions = {item["number"]: item for item in result["dispositions"]}
        self.assertEqual(dispositions[9]["state"], "queued")
        self.assertEqual(dispositions[8]["state"], "close")
        self.assertEqual(dispositions[8]["reason"], "duplicate-of-pr-9")

    def test_malformed_identity_and_expired_hold_are_explicit(self):
        missing_number = pr(1, title="feat: invalid JOV-900")
        missing_number["number"] = None
        multiple_lanes = pr(2, title="feat: bridge JOV-901 to JOV-902")
        expired = pr(
            3,
            title="feat: held JOV-903",
            draft=True,
            updated_at=NOW - timedelta(days=8),
        )
        no_owner = pr(4, title="feat: held JOV-904", draft=True, author="")
        missing_updated = pr(5, title="feat: stale JOV-905")
        missing_updated["updatedAt"] = "not-a-date"

        result = MODULE.classify_open_prs(
            [missing_number, multiple_lanes, expired, no_owner, missing_updated],
            NOW,
        )

        reasons = {item["number"]: item["reason"] for item in result["unclassified"]}
        self.assertEqual(reasons[None], "missing-pr-number")
        self.assertEqual(reasons[2], "multiple-issue-lane-identities")
        self.assertEqual(reasons[4], "missing-hold-owner")
        self.assertEqual(reasons[5], "missing-updated-at")
        self.assertEqual(result["expiredHolds"], [3])


class ClosureHealthEvaluationTests(unittest.TestCase):
    def test_healthy_writer_and_progress_allow_new_intake(self):
        result = MODULE.evaluate_closure_health(snapshot(), previous=None, now=NOW)

        self.assertEqual(result["status"], "healthy")
        self.assertTrue(result["newIssueIntakeAllowed"])
        self.assertEqual(result["authority"], "Summer")
        self.assertTrue(result["promotionContinues"])
        self.assertTrue(result["remediationContinues"])

    def test_controller_and_empty_queue_episodes_cross_bounded_red_thresholds(self):
        stalled = snapshot(
            controller={"status": "failed", "runId": 43, "observedAt": NOW.isoformat()},
            nativeQueueCount=0,
        )
        first = MODULE.evaluate_closure_health(stalled, previous=None, now=NOW)
        self.assertEqual(first["status"], "grace")
        self.assertFalse(first["newIssueIntakeAllowed"])

        controller_red = MODULE.evaluate_closure_health(
            stalled,
            previous=first,
            now=NOW + timedelta(minutes=11),
        )
        self.assertEqual(controller_red["status"], "red")
        self.assertIn("queue-controller-red-over-10m", controller_red["reasons"])

        queue_red = MODULE.evaluate_closure_health(
            snapshot(nativeQueueCount=0),
            previous=first,
            now=NOW + timedelta(minutes=16),
        )
        self.assertEqual(queue_red["status"], "red")
        self.assertIn("native-queue-empty-with-eligible-over-15m", queue_red["reasons"])

    def test_duplicate_lanes_and_stale_merge_progress_are_immediate_red(self):
        duplicate = snapshot(
            latestMergeAt=(NOW - timedelta(hours=25)).isoformat(),
            classifications={
                "dispositions": [{"number": 1, "state": "promote"}],
                "unclassified": [],
                "duplicateIssueLanes": [{"issue": "JOV-77", "prs": [1, 2]}],
                "expiredHolds": [],
            },
        )

        result = MODULE.evaluate_closure_health(duplicate, previous=None, now=NOW)

        self.assertEqual(result["status"], "red")
        self.assertIn("duplicate-issue-lanes-unresolved", result["reasons"])
        self.assertIn("no-merge-progress-over-24h", result["reasons"])
        self.assertFalse(result["newIssueIntakeAllowed"])

    def test_unclassified_pr_crosses_fifteen_minute_deliberate_red(self):
        unclassified = snapshot(
            classifications={
                "dispositions": [{"number": 2, "state": "promote"}],
                "unclassified": [{"number": 1, "reason": "missing-owner"}],
                "duplicateIssueLanes": [],
                "expiredHolds": [],
            }
        )
        first = MODULE.evaluate_closure_health(unclassified, previous=None, now=NOW)
        self.assertEqual(first["status"], "grace")

        result = MODULE.evaluate_closure_health(
            unclassified,
            previous=first,
            now=NOW + timedelta(minutes=16),
        )

        self.assertEqual(result["status"], "red")
        self.assertIn("unclassified-open-pr-over-15m", result["reasons"])

    def test_malformed_observation_and_expired_hold_fail_closed(self):
        result = MODULE.evaluate_closure_health(
            {
                "controller": {"status": "surprise"},
                "openPrs": True,
                "eligiblePrs": 1,
                "greenReadyPrs": 1,
                "nativeQueueCount": 0,
                "classifications": {
                    "unclassified": [],
                    "duplicateIssueLanes": [],
                    "expiredHolds": [7],
                },
            },
            previous=None,
            now=NOW,
        )

        self.assertEqual(result["status"], "red")
        self.assertIn("closure-observation-unknown", result["reasons"])
        self.assertIn("expired-held-prs", result["reasons"])
        self.assertIsNone(result["openPrs"])


class ClosureObservationTests(unittest.TestCase):
    def test_graphql_snapshot_aggregates_pages_and_requires_completeness(self):
        pages = [
            {
                "data": {
                    "repository": {
                        "pullRequests": {
                            "totalCount": 2,
                            "nodes": [pr(1, title="feat: JOV-1")],
                        },
                        "merged": {
                            "nodes": [
                                {
                                    "number": 98,
                                    "mergedAt": (NOW - timedelta(hours=1)).isoformat(),
                                },
                                {"number": 99, "mergedAt": NOW.isoformat()},
                            ]
                        },
                    }
                }
            },
            {
                "data": {
                    "repository": {
                        "pullRequests": {
                            "totalCount": 2,
                            "nodes": [pr(2, title="feat: JOV-2")],
                        }
                    }
                }
            },
        ]
        completed = mock.Mock(stdout=MODULE.json.dumps(pages))
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed) as run:
            result = MODULE._run_graphql_snapshot("JovieInc/Jovie")

        self.assertEqual([item["number"] for item in result["prs"]], [1, 2])
        self.assertEqual(result["latestMergeAt"], MODULE.isoformat(NOW))
        self.assertIn("owner=JovieInc", run.call_args.args[0])
        self.assertIn("name=Jovie", run.call_args.args[0])

        pages[0]["data"]["repository"]["pullRequests"]["totalCount"] = 3
        completed.stdout = MODULE.json.dumps(pages)
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(ValueError, "snapshot incomplete"):
                MODULE._run_graphql_snapshot("JovieInc/Jovie")
        with self.assertRaisesRegex(ValueError, "owner/name"):
            MODULE._repo_parts("Jovie")

    def test_queue_controller_maps_terminal_active_and_missing_runs(self):
        cases = [
            ({"status": "completed", "conclusion": "success"}, "green"),
            ({"status": "completed", "conclusion": "failure"}, "failed"),
            ({"status": "in_progress", "conclusion": None}, "recovering"),
            ({"status": "mystery", "conclusion": None}, "unknown"),
        ]
        for latest, expected in cases:
            with self.subTest(status=latest["status"], conclusion=latest["conclusion"]):
                latest.update(
                    {
                        "id": 42,
                        "html_url": "https://example.test/run/42",
                        "updated_at": NOW.isoformat(),
                    }
                )
                completed = mock.Mock(
                    stdout=MODULE.json.dumps({"workflow_runs": [latest]})
                )
                with mock.patch.object(
                    MODULE.subprocess, "run", return_value=completed
                ):
                    result = MODULE._observe_queue_controller("JovieInc/Jovie")
                self.assertEqual(result["status"], expected)

        completed = mock.Mock(stdout=MODULE.json.dumps({"workflow_runs": []}))
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            self.assertEqual(
                MODULE._observe_queue_controller("JovieInc/Jovie"),
                {"status": "unknown", "reason": "controller-run-missing"},
            )

    def test_live_observer_emits_typed_health_and_fails_closed_on_transport(self):
        prs = [
            pr(1, title="feat: JOV-1", queued=True),
            pr(2, title="wip: JOV-2", draft=True),
        ]
        with mock.patch.object(
            MODULE,
            "_run_graphql_snapshot",
            return_value={
                "prs": prs,
                "latestMergeAt": (NOW - timedelta(hours=1)).isoformat(),
            },
        ), mock.patch.object(
            MODULE,
            "_observe_queue_controller",
            return_value={"status": "green", "runId": 42},
        ):
            result = MODULE.observe_closure_health(
                "JovieInc/Jovie", previous=None, now=NOW
            )

        self.assertEqual(result["status"], "healthy")
        self.assertEqual(result["openPrs"], 2)
        self.assertEqual(result["eligiblePrs"], 1)
        self.assertEqual(result["nativeQueueCount"], 1)

        with mock.patch.object(
            MODULE, "_run_graphql_snapshot", side_effect=ValueError("bad snapshot")
        ):
            failed = MODULE.observe_closure_health(
                "JovieInc/Jovie", previous=None, now=NOW
            )
        self.assertEqual(failed["status"], "red")
        self.assertFalse(failed["newIssueIntakeAllowed"])
        self.assertEqual(failed["reasons"], ["closure-observation-unknown"])
        self.assertIn("bad snapshot", failed["error"])


if __name__ == "__main__":
    unittest.main()
