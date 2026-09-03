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
    body: str = "",
    merge_state: str = "CLEAN",
    draft: bool = False,
    cross_repository: bool | None = False,
    queued: bool = False,
    queue_state: str = "AWAITING_CHECKS",
    labels: tuple[str, ...] = (),
    updated_at: datetime = NOW,
    author: str = "summer-test",
    files: tuple[str, ...] | None = None,
    change_type: str = "MODIFIED",
    changed_files: int | None = None,
    files_payload: object | None = None,
    base_ref: str = "main",
    head_ref: str | None = None,
    head_oid: str | None = None,
    created_at: datetime | None = None,
) -> dict[str, object]:
    exact_head = head_oid or f"{number if isinstance(number, int) else 0:040x}"[-40:]
    payload: dict[str, object] = {
        "number": number,
        "title": title,
        "body": body,
        "baseRefName": base_ref,
        "headRefName": head_ref or f"symphony/test-pr-{number}",
        "headRefOid": exact_head,
        "isDraft": draft,
        "isCrossRepository": cross_repository,
        "mergeStateStatus": merge_state,
        "createdAt": (created_at or updated_at - timedelta(hours=1)).isoformat(),
        "updatedAt": updated_at.isoformat(),
        "author": {"login": author},
        "labels": {"nodes": [{"name": label} for label in labels]},
        "mergeQueueEntry": (
            {
                "position": 1,
                "enqueuedAt": updated_at.isoformat(),
                "state": queue_state,
            }
            if queued
            else None
        ),
    }
    if files_payload is not None:
        payload["files"] = files_payload
        if changed_files is not None:
            payload["changedFiles"] = changed_files
        return payload
    if files is None and changed_files is None:
        return payload
    nodes = [{"path": path, "changeType": change_type} for path in (files or ())]
    expected = len(nodes) if changed_files is None else changed_files
    payload["changedFiles"] = expected
    payload["files"] = {"totalCount": expected, "nodes": nodes}
    return payload


def snapshot(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "repository": "JovieInc/Jovie",
        "controller": {
            "status": "green",
            "runId": 42,
            "observedAt": NOW.isoformat(),
        },
        "openPrs": 2,
        "eligiblePrs": 2,
        "greenReadyPrs": 2,
        "nativeQueueCount": 1,
        "latestMergeAt": (NOW - timedelta(minutes=30)).isoformat(),
        "classifications": {
            "dispositions": [
                {
                    "number": 1,
                    "state": "queued",
                    "queueState": "AWAITING_CHECKS",
                },
                {"number": 2, "state": "promote"},
            ],
            "unclassified": [],
            "duplicateIssueLanes": [],
            "expiredHolds": [],
            "changedFileEvidence": [],
        },
    }
    value.update(overrides)
    return value


def stack_pr(
    number: int,
    base_ref: str,
    *,
    body: str = "",
    merge_state: str = "CLEAN",
    draft: bool = True,
) -> dict[str, object]:
    return pr(
        number,
        title=f"wip: stack layer {number}",
        body=body,
        merge_state=merge_state,
        draft=draft,
        base_ref=base_ref,
        head_ref=f"stack/test-{number}",
    )


STACK_BODY = "<!-- stack-integrator: summer-test -->\n<!-- stack-deadline: 2026-09-02T00:00:00Z -->"


def stack_health(layers: list[dict[str, object]]) -> tuple[dict[str, object], dict[str, object]]:
    result = MODULE.classify_open_prs(layers, NOW)
    return result, MODULE.evaluate_closure_health(
        snapshot(
            openPrs=len(layers),
            eligiblePrs=len(layers),
            greenReadyPrs=len(layers),
            classifications=result,
        ),
        previous=None,
        now=NOW,
    )


class ClosureClassificationTests(unittest.TestCase):
    def test_ready_ancestors_are_resolved_but_only_draft_groups_are_enforced(self):
        root = stack_pr(91, "main", draft=False)
        child = stack_pr(92, "stack/test-91", draft=False)
        ready = MODULE.classify_open_prs([root, child], NOW)
        self.assertEqual((ready["stackHealth"]["roots"], ready["repairActions"]), ([], []))
        child["isDraft"] = True
        mixed = MODULE.classify_open_prs([root, child], NOW)
        self.assertEqual(mixed["stackHealth"]["roots"][0]["prNumbers"], [91, 92])
        self.assertIn(
            "missing-stack-integrator",
            mixed["stackHealth"]["violations"][0]["codes"],
        )

    def test_four_layer_stack_with_owner_deadline_and_clean_path_is_green(self):
        layers = [
            stack_pr(101, "main", body=STACK_BODY),
            stack_pr(102, "stack/test-101"),
            stack_pr(103, "stack/test-102"),
            stack_pr(104, "stack/test-103"),
        ]
        result, health = stack_health(layers)
        self.assertEqual(result["stackHealth"]["violations"], [])
        self.assertEqual(result["repairActions"], [])
        self.assertEqual(health["status"], "healthy")
        self.assertTrue(health["newIssueIntakeAllowed"])

    def test_five_layer_stack_is_immediate_red_with_one_split_action(self):
        layers = [
            stack_pr(101, "main", body=STACK_BODY),
            stack_pr(102, "stack/test-101"),
            stack_pr(103, "stack/test-102"),
            stack_pr(104, "stack/test-103"),
            stack_pr(105, "stack/test-104"),
        ]
        result, health = stack_health(layers)
        self.assertEqual(result["stackHealth"]["violations"][0]["rootPr"], 101)
        self.assertIn(
            "stack-depth-over-4",
            result["stackHealth"]["violations"][0]["codes"],
        )
        self.assertEqual(len(result["repairActions"]), 1)
        self.assertEqual(result["repairActions"][0]["action"], MODULE.STACK_REPAIR_ACTION)
        self.assertEqual(result["repairActions"][0]["rootPr"], 101)
        action = result["repairActions"][0]
        self.assertEqual(action["memberHeads"][-1]["headSha"], layers[-1]["headRefOid"])
        self.assertEqual(result["repairActions"][0]["repository"], "JovieInc/Jovie")
        self.assertEqual(health["status"], "red")
        self.assertEqual(health["repository"], "JovieInc/Jovie")
        self.assertIn("draft-stack-policy-violation", health["reasons"])
        self.assertFalse(health["newIssueIntakeAllowed"])
        self.assertTrue(health["promotionContinues"])
        self.assertTrue(health["remediationContinues"])
        layers[-1]["headRefOid"] = "f" * 40
        head_key = MODULE.classify_open_prs(layers, NOW)["repairActions"][0]["taskKey"]
        layers[0]["body"] = STACK_BODY.replace("summer-test", "fx-test")
        metadata_key = MODULE.classify_open_prs(layers, NOW)["repairActions"][0]["taskKey"]
        layers[0]["body"] += "\n<!-- linear-issue-id:JOV-5362 -->"
        issue_key = MODULE.classify_open_prs(layers, NOW)["repairActions"][0]["taskKey"]
        self.assertNotEqual(action["taskKey"], head_key)
        self.assertNotEqual(head_key, metadata_key)
        self.assertNotEqual(metadata_key, issue_key)
        layers[-1]["headRefOid"] = None
        self.assertEqual(MODULE.classify_open_prs(layers, NOW)["repairActions"], [])

    def test_stack_requires_metadata_and_clean_ancestors(self):
        layers = [
            stack_pr(111, "main"),
            stack_pr(112, "stack/test-111", merge_state="DIRTY"),
        ]
        result = MODULE.classify_open_prs(layers, NOW)
        codes = result["stackHealth"]["violations"][0]["codes"]
        self.assertIn("missing-stack-integrator", codes)
        self.assertIn("missing-stack-deadline", codes)
        self.assertIn("non-clean-stack-ancestor", codes)
        self.assertEqual(len(result["repairActions"]), 1)

    def test_expired_stack_deadline_and_orphaned_base_are_red(self):
        expired = stack_pr(
            121,
            "main",
            body=(
                "<!-- stack-integrator: summer-test -->\n"
                "<!-- stack-deadline: 2026-08-27T00:00:00Z -->"
            ),
        )
        child = stack_pr(122, "stack/test-121")
        orphan = stack_pr(123, "stack/closed-ancestor")
        result, _ = stack_health([expired, child, orphan])
        by_root = {
            item["rootPr"]: item["codes"]
            for item in result["stackHealth"]["violations"]
        }
        self.assertIn("expired-stack-deadline", by_root[121])
        self.assertIn("orphaned-stack-base", by_root[123])
        self.assertEqual(
            [action["rootPr"] for action in result["repairActions"]], [121, 123]
        )
        self.assertEqual(
            {action["repository"] for action in result["repairActions"]},
            {"JovieInc/Jovie"},
        )

    def test_cyclic_draft_stack_emits_one_persistable_canonical_action(self):
        result = MODULE.classify_open_prs(
            [
                stack_pr(131, "stack/test-132", body=STACK_BODY),
                stack_pr(132, "stack/test-131"),
            ],
            NOW,
        )
        action = result["repairActions"][0]
        path = [entry["pr"] for entry in action["promotionPath"]]
        codes = result["stackHealth"]["violations"][0]["codes"]
        self.assertIn("cyclic-promotion-path", codes)
        self.assertEqual((action["rootPr"], action["prNumbers"]), (131, [131, 132]))
        self.assertEqual((path, action["maxDepth"]), ([131, 132], 2))
        self.assertEqual(len(path), len(set(path)))
        self.assertEqual([entry["pr"] for entry in action["memberHeads"]], path)

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

    def test_duplicate_issue_lanes_stop_the_line_without_guessing_a_loser(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    8,
                    title="feat: ship JOV-777",
                    merge_state="DIRTY",
                    files=("scripts/a.py", "scripts/shared.py"),
                ),
                pr(
                    9,
                    title="feat: ship JOV-777",
                    queued=True,
                    files=("scripts/b.py", "scripts/shared.py"),
                ),
            ],
            NOW,
        )

        self.assertEqual(
            result["duplicateIssueLanes"],
            [
                {
                    "issue": "JOV-777",
                    "prs": [8, 9],
                    "overlap": ["scripts/shared.py"],
                }
            ],
        )
        dispositions = {item["number"]: item for item in result["dispositions"]}
        self.assertEqual(dispositions[9]["state"], "queued")
        self.assertEqual(dispositions[9]["queueState"], "AWAITING_CHECKS")
        self.assertEqual(dispositions[8]["state"], "repair")
        evidence = {item["number"]: item for item in result["changedFileEvidence"]}
        self.assertEqual(evidence[8]["status"], "complete")
        self.assertEqual(evidence[9]["status"], "complete")

        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "red")
        self.assertIn("duplicate-issue-lanes-unresolved", health["reasons"])

    def test_held_or_draft_plus_active_is_not_a_duplicate_lane(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    8,
                    title="feat: ship JOV-777",
                    files=("scripts/shared.py",),
                ),
                pr(
                    9,
                    title="wip: JOV-777",
                    draft=True,
                    files=("scripts/shared.py",),
                ),
                pr(
                    10,
                    title="feat: held JOV-778",
                    files=("apps/web/a.ts",),
                ),
                pr(
                    11,
                    title="feat: held JOV-778",
                    labels=("hold",),
                    files=("apps/web/a.ts",),
                ),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        dispositions = {item["number"]: item["state"] for item in result["dispositions"]}
        self.assertEqual(
            dispositions,
            {8: "promote", 9: "held", 10: "promote", 11: "held"},
        )
        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "healthy")
        self.assertNotIn("duplicate-issue-lanes-unresolved", health["reasons"])

    def test_disjoint_active_artifacts_are_allowed(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    8,
                    title="feat: ship JOV-777",
                    merge_state="DIRTY",
                    files=("scripts/a.py",),
                ),
                pr(
                    9,
                    title="feat: ship JOV-777",
                    queued=True,
                    files=("scripts/b.py",),
                ),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        dispositions = {item["number"]: item["state"] for item in result["dispositions"]}
        self.assertEqual(dispositions, {8: "repair", 9: "queued"})
        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "healthy")
        self.assertTrue(health["newIssueIntakeAllowed"])

    def test_only_overlapping_prs_are_duplicate_participants(self):
        result = MODULE.classify_open_prs(
            [
                pr(20, title="feat: ship JOV-779", files=("scripts/shared.py",)),
                pr(21, title="fix: ship JOV-779", files=("scripts/shared.py",)),
                pr(22, title="test: ship JOV-779", files=("scripts/disjoint.py",)),
            ],
            NOW,
        )

        self.assertEqual(
            result["duplicateIssueLanes"],
            [
                {
                    "issue": "JOV-779",
                    "prs": [20, 21],
                    "overlap": ["scripts/shared.py"],
                }
            ],
        )

    def test_renamed_file_evidence_fails_closed_as_unclassified(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    23,
                    title="feat: ship JOV-780",
                    files=("scripts/new.py",),
                    change_type="RENAMED",
                ),
                pr(24, title="fix: ship JOV-780", files=("scripts/old.py",)),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        self.assertEqual(
            {item["number"]: item["reason"] for item in result["unclassified"]},
            {
                23: "changed-file-evidence-malformed",
                24: "changed-file-evidence-incomplete-peer",
            },
        )

    def test_cross_repository_pr_cannot_spoof_an_internal_issue_lane(self):
        result = MODULE.classify_open_prs(
            [
                pr(25, title="fix: ship JOV-781", files=("scripts/shared.py",)),
                pr(
                    26,
                    title="fix: forged JOV-781",
                    cross_repository=True,
                    files=("scripts/shared.py",),
                ),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        dispositions = {item["number"]: item for item in result["dispositions"]}
        self.assertEqual(dispositions[25]["issue"], "JOV-781")
        self.assertIsNone(dispositions[26]["issue"])

    def test_missing_repository_provenance_is_unclassified(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    27,
                    title="fix: ship JOV-782",
                    cross_repository=None,
                    files=("scripts/shared.py",),
                )
            ],
            NOW,
        )

        self.assertEqual(
            result["unclassified"],
            [{"number": 27, "reason": "missing-repository-provenance"}],
        )

    def test_incomplete_changed_file_evidence_fails_closed_as_unclassified(self):
        missing = pr(8, title="feat: ship JOV-777")
        truncated = pr(
            9,
            title="feat: ship JOV-777",
            files=("scripts/a.py",),
            changed_files=3,
        )
        malformed = pr(
            10,
            title="feat: ship JOV-778",
            files_payload={"totalCount": 1, "nodes": [{"path": ""}]},
            changed_files=1,
        )
        sibling = pr(
            11,
            title="feat: ship JOV-778",
            files=("scripts/b.py",),
        )

        result = MODULE.classify_open_prs(
            [missing, truncated, malformed, sibling],
            NOW,
        )

        reasons = {item["number"]: item["reason"] for item in result["unclassified"]}
        self.assertEqual(reasons[8], "changed-file-evidence-missing")
        self.assertEqual(reasons[9], "changed-file-evidence-truncated")
        self.assertEqual(reasons[10], "changed-file-evidence-malformed")
        self.assertEqual(reasons[11], "changed-file-evidence-incomplete-peer")
        self.assertEqual(result["duplicateIssueLanes"], [])
        self.assertEqual(
            [item["number"] for item in result["dispositions"]],
            [],
        )
        evidence = {item["number"]: item for item in result["changedFileEvidence"]}
        self.assertEqual(evidence[9]["status"], "truncated")
        self.assertEqual(evidence[9]["observedCount"], 1)
        self.assertEqual(evidence[9]["expectedCount"], 3)

        first = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(first["status"], "grace")
        self.assertNotIn("duplicate-issue-lanes-unresolved", first["reasons"])
        later = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=first,
            now=NOW + timedelta(minutes=16),
        )
        self.assertEqual(later["status"], "red")
        self.assertIn("unclassified-open-pr-over-15m", later["reasons"])

    def test_changed_file_evidence_requires_both_completeness_counts(self):
        missing_changed_files = pr(
            12,
            title="feat: ship JOV-779",
            files_payload={
                "totalCount": 1,
                "nodes": [{"path": "scripts/a.py", "changeType": "MODIFIED"}],
            },
        )
        missing_total_count = pr(
            13,
            title="feat: ship JOV-779",
            files_payload={
                "nodes": [{"path": "scripts/b.py", "changeType": "MODIFIED"}],
            },
            changed_files=1,
        )

        self.assertEqual(
            MODULE._changed_file_evidence(missing_changed_files)["status"],
            "malformed",
        )
        self.assertEqual(
            MODULE._changed_file_evidence(missing_total_count)["status"],
            "malformed",
        )

    def test_explicit_linear_marker_overrides_legacy_branch_and_title_identity(self):
        child = pr(
            10,
            title="feat: durable Summer substrate JOV-5212",
            body="<!-- linear-issue-id:JOV-5369 -->",
        )
        child["headRefName"] = "codex/jov-5212-durable-summer-turns"

        result = MODULE.classify_open_prs(
            [child, pr(11, title="fix: complete JOV-5212")],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        dispositions = {item["number"]: item for item in result["dispositions"]}
        self.assertEqual(dispositions[10]["issue"], "JOV-5369")
        self.assertEqual(dispositions[11]["issue"], "JOV-5212")

    def test_explicit_marker_aliases_must_agree_and_body_prose_is_not_identity(self):
        matching = pr(
            12,
            title="feat: legacy JOV-5212",
            body=(
                "<!-- linear-issue-id:JOV-5369 -->\n"
                "<!-- linear-issue-identifier:jov-5369 -->\n"
                "Depends on JOV-9999."
            ),
        )
        conflicting = pr(
            13,
            title="feat: legacy JOV-5212",
            body=(
                "<!-- linear-issue-id:JOV-5369 -->\n"
                "<!-- linear-issue-identifier:JOV-5370 -->"
            ),
        )
        prose_only = pr(
            14,
            title="feat: ship JOV-888",
            body="Depends on JOV-999 and relates to JOV-1000.",
        )

        result = MODULE.classify_open_prs(
            [matching, conflicting, prose_only],
            NOW,
        )

        dispositions = {item["number"]: item for item in result["dispositions"]}
        self.assertEqual(dispositions[12]["issue"], "JOV-5369")
        self.assertEqual(dispositions[14]["issue"], "JOV-888")
        reasons = {
            item["number"]: item["reason"] for item in result["unclassified"]
        }
        self.assertEqual(reasons[13], "multiple-issue-lane-identities")

    def test_close_requires_an_explicit_lifecycle_label(self):
        result = MODULE.classify_open_prs(
            [pr(10, title="feat: superseded JOV-778", labels=("duplicate",))],
            NOW,
        )

        self.assertEqual(
            result["dispositions"],
            [
                {
                    "number": 10,
                    "issue": "JOV-778",
                    "state": "close",
                    "reason": "duplicate",
                }
            ],
        )

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
        malformed_queue = pr(6, title="feat: queued JOV-906", queued=True)
        malformed_queue["mergeQueueEntry"] = {"position": 1}

        result = MODULE.classify_open_prs(
            [
                missing_number,
                multiple_lanes,
                expired,
                no_owner,
                missing_updated,
                malformed_queue,
            ],
            NOW,
        )

        reasons = {item["number"]: item["reason"] for item in result["unclassified"]}
        self.assertEqual(reasons[None], "missing-pr-number")
        self.assertEqual(reasons[2], "multiple-issue-lane-identities")
        self.assertEqual(reasons[4], "missing-hold-owner")
        self.assertEqual(reasons[5], "missing-updated-at")
        self.assertEqual(reasons[6], "malformed-native-queue-entry")
        self.assertEqual(result["expiredHolds"], [3])


class ClosureHealthEvaluationTests(unittest.TestCase):
    def test_boundary_offset_timestamp_is_treated_as_missing_history(self):
        self.assertIsNone(MODULE.parse_time("0001-01-01T00:00:00+14:00"))

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

    def test_malformed_previous_episode_containers_restart_bounded_grace(self):
        stalled = snapshot(
            controller={"status": "failed", "runId": 43, "observedAt": NOW.isoformat()},
            nativeQueueCount=0,
        )
        malformed_history = (
            {"episodes": None},
            {"episodes": []},
            {"episodes": {"controller": "invalid"}},
        )

        for previous in malformed_history:
            with self.subTest(previous=previous):
                result = MODULE.evaluate_closure_health(
                    stalled,
                    previous=previous,
                    now=NOW,
                )
                self.assertEqual(result["status"], "grace")
                self.assertEqual(
                    result["episodes"]["controller"]["since"],
                    MODULE.isoformat(NOW),
                )

    def test_duplicate_lanes_and_stale_merge_progress_are_immediate_red(self):
        duplicate = snapshot(
            latestMergeAt=(NOW - timedelta(hours=2)).isoformat(),
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
        self.assertIn("no-merge-progress-over-1h", result["reasons"])
        self.assertFalse(result["newIssueIntakeAllowed"])

    def test_unmergeable_native_queue_entry_is_immediate_red(self):
        classifications = MODULE.classify_open_prs(
            [
                pr(
                    7,
                    title="fix: repair JOV-707",
                    queued=True,
                    queue_state="UNMERGEABLE",
                )
            ],
            NOW,
        )

        result = MODULE.evaluate_closure_health(
            snapshot(
                openPrs=1,
                eligiblePrs=1,
                greenReadyPrs=1,
                classifications=classifications,
            ),
            previous=None,
            now=NOW,
        )

        self.assertEqual(result["status"], "red")
        self.assertIn("native-queue-unmergeable", result["reasons"])
        self.assertEqual(result["unmergeableNativeQueuePrs"], [7])
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

    def test_previous_closure_history_is_scoped_to_repository(self):
        previous = MODULE.evaluate_closure_health(
            snapshot(
                repository="JovieInc/Jovie",
                nativeQueueCount=0,
            ),
            previous=None,
            now=NOW,
        )
        current_now = NOW + timedelta(minutes=20)
        current = MODULE.evaluate_closure_health(
            snapshot(
                repository="JovieInc/LogYourBody",
                nativeQueueCount=0,
            ),
            previous=previous,
            now=current_now,
        )

        self.assertEqual(previous["status"], "grace")
        self.assertEqual(current["status"], "grace")
        self.assertEqual(
            current["episodes"]["emptyNativeQueue"]["since"],
            MODULE.isoformat(current_now),
        )

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
        query_arg = next(
            argument
            for argument in run.call_args.args[0]
            if argument.startswith("query=")
        )
        self.assertIn("number title body baseRefName headRefName headRefOid", query_arg)
        self.assertIn("isCrossRepository", query_arg)
        self.assertIn("changedFiles", query_arg)
        self.assertIn(f"files(first:{MODULE.CHANGED_FILES_PAGE})", query_arg)
        self.assertIn("nodes{path changeType}", query_arg)

        pages[0]["data"]["repository"]["pullRequests"]["totalCount"] = 3
        completed.stdout = MODULE.json.dumps(pages)
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(ValueError, "snapshot incomplete"):
                MODULE._run_graphql_snapshot("JovieInc/Jovie")

        pages[0]["data"]["repository"]["pullRequests"]["totalCount"] = 2
        pages[1]["errors"] = [{"message": "partial GraphQL failure"}]
        completed.stdout = MODULE.json.dumps(pages)
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(ValueError, "GraphQL errors"):
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
                "latestMergeAt": (NOW - timedelta(minutes=30)).isoformat(),
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
        self.assertEqual(result["repository"], "JovieInc/Jovie")
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
        self.assertEqual(failed["repository"], "JovieInc/Jovie")
        self.assertFalse(failed["newIssueIntakeAllowed"])
        self.assertEqual(failed["reasons"], ["closure-observation-unknown"])
        self.assertEqual(
            failed["stackHealth"],
            {
                "maxDepth": MODULE.STACK_MAX_DEPTH,
                "roots": [],
                "violations": [],
                "repairActions": [],
            },
        )
        self.assertEqual(failed["repairActions"], [])
        self.assertIn("bad snapshot", failed["error"])

    def test_live_observer_passes_repository_to_stack_repair_actions(self):
        prs = [
            stack_pr(201, "main", body=STACK_BODY),
            stack_pr(202, "stack/test-201"),
            stack_pr(203, "stack/test-202"),
            stack_pr(204, "stack/test-203"),
            stack_pr(205, "stack/test-204"),
        ]
        with mock.patch.object(
            MODULE,
            "_run_graphql_snapshot",
            return_value={
                "prs": prs,
                "latestMergeAt": (NOW - timedelta(minutes=30)).isoformat(),
            },
        ), mock.patch.object(
            MODULE,
            "_observe_queue_controller",
            return_value={"status": "green", "runId": 42},
        ):
            result = MODULE.observe_closure_health(
                "JovieInc/LogYourBody", previous=None, now=NOW
            )

        self.assertEqual(result["status"], "red")
        self.assertEqual(result["repository"], "JovieInc/LogYourBody")
        self.assertEqual(
            result["repairActions"][0]["repository"], "JovieInc/LogYourBody"
        )


if __name__ == "__main__":
    unittest.main()
