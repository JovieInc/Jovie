#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import pathlib
import re
import subprocess
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts/symphony/closure_health.py"
SPEC = importlib.util.spec_from_file_location("closure_health", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

UTC = timezone.utc
NOW = datetime(2026, 8, 28, 5, 0, tzinfo=UTC)
DEFAULT_PROMOTION_EVIDENCE = object()


def exact_green_promotion_evidence(number: int) -> dict[str, object]:
    return {
        "status": "complete",
        "headOid": f"{number:040x}",
        "baseOid": "a" * 40,
        "comparisonStatus": "ahead",
        "aheadBy": 1,
        "behindBy": 0,
        "requiredCheckNames": sorted(MODULE.EXPECTED_REQUIRED_CHECKS),
        "requiredChecks": [
            {
                "name": name,
                "kind": "required-check",
                "sources": [
                    (
                        {
                            "producer": "legacy-status",
                            "name": name,
                            "kind": "status-context",
                            "state": "SUCCESS",
                        }
                        if name == "Fork PR Gate"
                        else {
                            "producer": "check-app:ci",
                            "name": name,
                            "kind": "check-run",
                            "status": "COMPLETED",
                            "conclusion": "SUCCESS",
                        }
                    )
                ],
            }
            for name in sorted(MODULE.EXPECTED_REQUIRED_CHECKS)
        ],
    }


def live_required_ruleset() -> list[dict[str, object]]:
    return [
        {
            "type": "required_status_checks",
            "ruleset_id": 10512119,
            "parameters": {
                "required_status_checks": [
                    {"context": name}
                    for name in sorted(MODULE.EXPECTED_REQUIRED_CHECKS)
                ]
            },
        }
    ]


def exact_named_check_commit(
    number: int, *, check_status: str = "COMPLETED", check_conclusion: str | None = "SUCCESS"
) -> dict[str, object]:
    status: dict[str, object] = {}
    suite: dict[str, object] = {"app": {"id": "ci", "slug": "github-actions"}}
    commit: dict[str, object] = {
        "oid": f"{number:040x}",
        "status": status,
        "requiredSuites": {"totalCount": 1, "nodes": [suite]},
    }
    for index, name in enumerate(sorted(MODULE.EXPECTED_REQUIRED_CHECKS)):
        suite[f"runs_{index}"] = {"totalCount": 0, "nodes": []}
        if name == "Fork PR Gate":
            status[f"legacy_{index}"] = {
                "context": name,
                "state": "SUCCESS",
                "createdAt": "2026-08-30T16:00:00Z",
            }
            continue
        suite[f"runs_{index}"] = {
            "totalCount": 1,
            "nodes": [
                {
                    "databaseId": 100 + index,
                    "name": name,
                    "status": check_status,
                    "conclusion": check_conclusion,
                }
            ],
        }
    return commit


def promotion_pr_state(number: int, *, head_oid: str | None = None) -> dict[str, object]:
    return {
        "state": "OPEN",
        "headRefOid": head_oid or f"{number:040x}",
        "baseRefName": "main",
        "isDraft": False,
        "isCrossRepository": False,
        "mergeStateStatus": "CLEAN",
        "updatedAt": NOW.isoformat(),
        "author": {"login": "summer-test"},
        "labels": {"totalCount": 0, "nodes": []},
        "mergeQueueEntry": None,
    }


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
    promotion_evidence: object = DEFAULT_PROMOTION_EVIDENCE,
) -> dict[str, object]:
    exact_head = head_oid or f"{number if isinstance(number, int) else 0:040x}"[-40:]
    payload: dict[str, object] = {
        "number": number,
        "title": title,
        "body": body,
        "baseRefName": base_ref,
        "headRefName": head_ref or f"symphony/test-pr-{number}",
        "headRefOid": exact_head,
        "baseRefOid": "a" * 40,
        "currentBaseOid": "a" * 40 if base_ref == "main" else None,
        "isDraft": draft,
        "isCrossRepository": cross_repository,
        "mergeStateStatus": merge_state,
        "createdAt": (created_at or updated_at - timedelta(hours=1)).isoformat(),
        "updatedAt": updated_at.isoformat(),
        "author": {"login": author},
        "labels": {
            "totalCount": len(labels),
            "nodes": [{"name": label} for label in labels],
        },
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
    if promotion_evidence is DEFAULT_PROMOTION_EVIDENCE:
        payload["promotionEvidence"] = exact_green_promotion_evidence(number)
    elif promotion_evidence is not None:
        payload["promotionEvidence"] = promotion_evidence
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
        "classifications": MODULE.classify_open_prs(
            [
                pr(1, title="feat: ship JOV-1", queued=True),
                pr(2, title="feat: ship JOV-2"),
            ],
            NOW,
        ),
    }
    value.update(overrides)
    if "classifications" in overrides and "openPrs" not in overrides:
        lifecycle_actions = value["classifications"].get("lifecycleActions")
        if isinstance(lifecycle_actions, list):
            value["openPrs"] = len(lifecycle_actions)
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
        self.assertEqual(action["repository"], "JovieInc/Jovie")
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

    def test_required_check_contract_matches_source_ruleset(self):
        ruleset = (ROOT / ".github/rulesets/branch-protection.yml").read_text(
            encoding="utf-8"
        )
        source_contexts = frozenset(re.findall(r"- context: '([^']+)'", ruleset))

        self.assertEqual(MODULE.EXPECTED_REQUIRED_CHECKS, source_contexts)

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

    def test_mixed_84_row_inventory_has_one_machine_owned_lifecycle_action_each(self):
        rows = []
        for number in range(1001, 1084):
            variant = number % 5
            rows.append(
                pr(
                    number,
                    title=f"change: JOV-{number}",
                    queued=variant == 0,
                    draft=variant == 1,
                    merge_state="DIRTY" if variant == 2 else "CLEAN",
                    labels=("duplicate",) if variant == 3 else (),
                )
            )
        rows.append(pr(17156, title="protected: JOV-17156", draft=True))

        actions = MODULE.classify_open_prs(rows, NOW)["lifecycleActions"]

        self.assertEqual(len(actions), 84)
        self.assertEqual(len({item["lifecycleKey"] for item in actions}), 84)
        self.assertEqual(len({item["actionKey"] for item in actions}), 84)
        self.assertTrue(
            all(
                item["owner"] == item["writer"]
                and item["owner"]
                in {"controller", "gem", "github-native-merge-queue", "symphony"}
                and item["disposition"]
                in {"active-remediation", "terminal"}
                for item in actions
            )
        )

    def test_lifecycle_mapping_preserves_native_queue_and_machine_routes(self):
        actions = MODULE.classify_open_prs(
            [
                pr(10, title="queued JOV-10", queued=True),
                pr(11, title="promote JOV-11"),
                pr(12, title="repair JOV-12", merge_state="DIRTY"),
                pr(13, title="draft JOV-13", draft=True),
                pr(14, title="duplicate JOV-14", labels=("duplicate",)),
            ],
            NOW,
        )["lifecycleActions"]
        by_pr = {item["pr"]: item for item in actions}

        self.assertEqual(
            (by_pr[10]["owner"], by_pr[10]["action"]),
            ("github-native-merge-queue", "preserve-native-queue-ownership"),
        )
        self.assertEqual(
            (by_pr[11]["owner"], by_pr[11]["action"]),
            ("gem", "reconcile-exact-head-queue-admission"),
        )
        self.assertEqual(
            (by_pr[12]["owner"], by_pr[12]["action"]),
            ("gem", "exact-head-branch-update"),
        )
        self.assertEqual(by_pr[13]["owner"], "symphony")
        self.assertTrue(by_pr[14]["terminal"])

    def test_protected_pr_is_inventoried_as_terminal_machine_exclusion(self):
        action = MODULE.classify_open_prs(
            [pr(17156, title="protected JOV-17156", draft=True)], NOW
        )["lifecycleActions"][0]

        self.assertEqual(action["sourceState"], "protected")
        self.assertEqual(action["disposition"], "terminal")
        self.assertEqual(action["owner"], "gem")
        self.assertEqual(action["action"], "preserve-protected-pr-exclusion")

    def test_legacy_human_taste_and_no_auto_labels_never_create_a_hold(self):
        rows = [
            pr(20 + index, title=f"ready JOV-{20 + index}", labels=(label,))
            for index, label in enumerate(
                (
                    "needs-human",
                    "human-review-required",
                    "needs:taste",
                    "needs-human-taste",
                    "taste",
                    "no-auto",
                    "no-auto-merge",
                    "no-automerge",
                )
            )
        ]
        result = MODULE.classify_open_prs(rows, NOW)

        self.assertEqual(
            {item["state"] for item in result["dispositions"]}, {"promote"}
        )
        self.assertTrue(
            all(item["owner"] == "gem" for item in result["lifecycleActions"])
        )

    def test_malformed_row_fails_closed_without_dropping_other_lifecycle_actions(self):
        malformed = pr(31, title="malformed JOV-31")
        malformed["headRefOid"] = None
        result = MODULE.classify_open_prs(
            [pr(30, title="ready JOV-30"), malformed], NOW
        )
        by_pr = {item["pr"]: item for item in result["lifecycleActions"]}

        self.assertEqual(len(result["lifecycleActions"]), 2)
        self.assertEqual(by_pr[30]["sourceState"], "promote")
        self.assertEqual(by_pr[31]["sourceState"], "unclassified")
        self.assertEqual(by_pr[31]["owner"], "controller")
        self.assertIsNone(by_pr[31]["headSha"])

    def test_native_merge_queue_policy_remains_20_1_5(self):
        ruleset = (ROOT / ".github/rulesets/branch-protection.yml").read_text(
            encoding="utf-8"
        )
        guard = (ROOT / "scripts/lib/merge-queue-guard.mjs").read_text(
            encoding="utf-8"
        )
        for source in (ruleset, guard):
            self.assertRegex(source, r"check_response_timeout_minutes:\s*20")
            self.assertRegex(source, r"max_entries_to_build:\s*1")
            self.assertRegex(source, r"max_entries_to_merge:\s*5")

    def test_clean_pr_with_stale_base_is_repair_not_promote(self):
        evidence = exact_green_promotion_evidence(12)
        evidence["behindBy"] = 3
        result = MODULE.classify_open_prs(
            [pr(12, title="fix: current JOV-112", promotion_evidence=evidence)], NOW
        )

        disposition = result["dispositions"][0]
        self.assertEqual(disposition["state"], "repair")
        self.assertEqual(disposition["reason"], "stale-base")
        self.assertEqual(disposition["behindBy"], 3)

    def test_clean_pr_requires_exact_live_required_check_set(self):
        failing = exact_green_promotion_evidence(13)
        failing["requiredChecks"][0]["sources"][0]["state"] = "FAILURE"  # type: ignore[index]
        missing = exact_green_promotion_evidence(14)
        missing["requiredChecks"] = missing["requiredChecks"][:-1]  # type: ignore[index]

        result = MODULE.classify_open_prs(
            [
                pr(13, title="fix: checks JOV-113", promotion_evidence=failing),
                pr(14, title="fix: checks JOV-114", promotion_evidence=missing),
            ],
            NOW,
        )

        dispositions = {item["number"]: item for item in result["dispositions"]}
        self.assertEqual(dispositions[13]["reason"], "required-checks-not-green")
        self.assertEqual(dispositions[14]["reason"], "required-check-evidence-missing")

    def test_checkable_unstable_and_github_success_conclusions_can_promote(self):
        evidence = exact_green_promotion_evidence(17)
        check_runs = [
            check["sources"][0]
            for check in evidence["requiredChecks"]  # type: ignore[union-attr]
            if check["sources"][0]["kind"] == "check-run"
        ]
        check_runs[0]["conclusion"] = "SKIPPED"
        check_runs[1]["conclusion"] = "NEUTRAL"

        result = MODULE.classify_open_prs(
            [
                pr(
                    17,
                    title="fix: advisory JOV-117",
                    merge_state="UNSTABLE",
                    promotion_evidence=evidence,
                )
            ],
            NOW,
        )

        self.assertEqual(result["dispositions"][0]["state"], "promote")

    def test_live_required_check_policy_drift_is_repair(self):
        evidence = exact_green_promotion_evidence(18)
        evidence["requiredCheckNames"] = [
            *evidence["requiredCheckNames"],  # type: ignore[list-item]
            "New Required Gate",
        ]

        result = MODULE.classify_open_prs(
            [pr(18, title="fix: policy JOV-118", promotion_evidence=evidence)], NOW
        )

        self.assertEqual(
            result["dispositions"][0]["reason"], "required-check-policy-drift"
        )

    def test_clean_pr_without_exact_evidence_is_repair_not_promote(self):
        result = MODULE.classify_open_prs(
            [pr(15, title="fix: evidence JOV-115", promotion_evidence=None)], NOW
        )

        disposition = result["dispositions"][0]
        self.assertEqual(disposition["state"], "repair")
        self.assertEqual(disposition["reason"], "promotion-evidence-missing")

    def test_non_main_clean_pr_is_not_a_promotion_candidate(self):
        result = MODULE.classify_open_prs(
            [pr(16, title="fix: stacked JOV-116", base_ref="stack-parent")], NOW
        )

        disposition = result["dispositions"][0]
        self.assertEqual(disposition["state"], "repair")
        self.assertEqual(disposition["reason"], "non-main-base")

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
        self.assertEqual(health["status"], "red")
        self.assertFalse(health["newIssueIntakeAllowed"])
        self.assertIn("internally-repairable-prs-open", health["reasons"])
        self.assertNotIn("duplicate-issue-lanes-unresolved", health["reasons"])

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

    def test_declared_native_stack_is_not_a_duplicate_lane(self):
        contract = (
            "## Native stack contract (JOV-INV-020)\n"
            "- Linear lane: JOV-5158\n"
            "- Root: #16894 at 2a08234388c342c9c503bd622370f07bcf0b7201\n"
        )
        result = MODULE.classify_open_prs(
            [
                pr(
                    30,
                    title="feat: register thumbnail candidates",
                    body=(
                        contract
                        + "- Immediate parent: #16894 at 2a08234388c342c9c503bd622370f07bcf0b7201"
                    ),
                    head_ref="codex/jov-5158-youtube-pilot-stack",
                    files=("scripts/shared.py", "scripts/a.py"),
                ),
                pr(
                    31,
                    title="feat: reconcile review decisions",
                    body="Extends #30 with approve/reject.\n" + contract,
                    head_ref="codex/jov-5158-youtube-decision-gate",
                    queued=True,
                    files=("scripts/shared.py", "scripts/b.py"),
                ),
                pr(
                    32,
                    title="feat: preview service (JOV-5862, 2/4)",
                    body="Layer 2 of the JOV-5862 stack.",
                    head_ref="eve/jov-5862-02-preview-service",
                    files=("scripts/shared.py", "scripts/c.py"),
                ),
                pr(
                    33,
                    title="feat: preview route (JOV-5862, 3/4)",
                    body="Layer 3 of the JOV-5862 stack.",
                    head_ref="eve/jov-5862-03-preview-route",
                    files=("scripts/shared.py", "scripts/d.py"),
                ),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        self.assertEqual(result["unclassified"], [])
        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "healthy")
        self.assertNotIn("duplicate-issue-lanes-unresolved", health["reasons"])

    def test_native_stack_layer_slash_wording_is_not_a_duplicate_lane(self):
        # Live shape from the JOV-5853 Summer stack (2026-09-04): bodies declare
        # "native stack layer N/M" (no "of", no N/M in the title).
        result = MODULE.classify_open_prs(
            [
                pr(
                    40,
                    title="feat(eve): bind Summer bottleneck runtime (JOV-5853)",
                    body="JOV-5853 native stack layer 3/7.\n\nImmediate parent: #39 @ 337b440a3510c71dab03845fd2b926ec6e9a8b58\n",
                    head_ref="codex/jov-5853-summer-stack-03-runtime",
                    files=("scripts/shared.py", "scripts/runtime.py"),
                ),
                pr(
                    41,
                    title="fix(eve): harden Summer Blob adapters (JOV-5853)",
                    body="JOV-5853 native stack layer 4/7.\n\nImmediate parent: #40 @ 337b440a3510c71dab03845fd2b926ec6e9a8b58\n",
                    head_ref="codex/jov-5853-summer-stack-04-adapters",
                    merge_state="DIRTY",
                    files=("scripts/shared.py", "scripts/adapters.py"),
                ),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        self.assertEqual(result["unclassified"], [])

    def test_branch_chained_and_cumulative_nested_lanes_are_stack_evidence(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    34,
                    title="feat: ship JOV-783",
                    files=("scripts/a.py",),
                    head_ref="stack/jov-783-root",
                ),
                pr(
                    35,
                    title="feat: ship JOV-783",
                    files=("scripts/a.py", "scripts/b.py"),
                    base_ref="stack/jov-783-root",
                    head_ref="stack/jov-783-mid",
                ),
                pr(
                    36,
                    title="feat: ship JOV-783",
                    merge_state="DIRTY",
                    files=("scripts/a.py", "scripts/b.py", "scripts/c.py"),
                ),
            ],
            NOW,
        )

        self.assertEqual(result["duplicateIssueLanes"], [])
        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "red")
        self.assertNotIn("duplicate-issue-lanes-unresolved", health["reasons"])
        self.assertIn("internally-repairable-prs-open", health["reasons"])

    def test_parallel_competing_lanes_with_identical_files_still_flag(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    37,
                    title="feat: ship JOV-784",
                    files=("scripts/shared.py", "scripts/a.py"),
                ),
                pr(
                    38,
                    title="feat: ship JOV-784",
                    merge_state="DIRTY",
                    files=("scripts/shared.py", "scripts/a.py"),
                ),
            ],
            NOW,
        )

        self.assertEqual(
            result["duplicateIssueLanes"],
            [
                {
                    "issue": "JOV-784",
                    "prs": [37, 38],
                    "overlap": ["scripts/a.py", "scripts/shared.py"],
                }
            ],
        )
        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "red")
        self.assertIn("duplicate-issue-lanes-unresolved", health["reasons"])

    def test_partial_stack_signals_fail_closed(self):
        result = MODULE.classify_open_prs(
            [
                pr(
                    39,
                    title="feat: ship JOV-785",
                    files=("scripts/shared.py", "scripts/a.py"),
                ),
                pr(
                    40,
                    title="feat: ship JOV-785",
                    body="Extends #39.\n## Native stack contract (JOV-INV-020)",
                    files=("scripts/shared.py", "scripts/b.py"),
                ),
                pr(
                    41,
                    title="feat: ship JOV-785",
                    merge_state="DIRTY",
                    files=("scripts/shared.py", "scripts/c.py"),
                ),
            ],
            NOW,
        )

        self.assertEqual(
            result["duplicateIssueLanes"],
            [
                {
                    "issue": "JOV-785",
                    "prs": [39, 40, 41],
                    "overlap": ["scripts/shared.py"],
                }
            ],
        )
        health = MODULE.evaluate_closure_health(
            snapshot(classifications=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "red")
        self.assertIn("duplicate-issue-lanes-unresolved", health["reasons"])

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
                    "headOid": f"{10:040x}",
                    "baseOid": "a" * 40,
                    "eventBaseOid": "a" * 40,
                    "baseRefName": "main",
                    "state": "close",
                    "reason": "duplicate",
                }
            ],
        )

    def test_truncated_lifecycle_labels_fail_closed_before_disposition(self):
        candidate = pr(11, title="feat: label proof JOV-779")
        candidate["labels"] = {
            "totalCount": 101,
            "nodes": [{"name": f"label-{index}"} for index in range(100)],
        }

        result = MODULE.classify_open_prs([candidate], NOW)

        self.assertEqual(result["dispositions"], [])
        self.assertEqual(
            result["unclassified"],
            [{"number": 11, "reason": "label-evidence-truncated"}],
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
    def test_lifecycle_action_digest_is_cross_runtime_canonical(self):
        identity = {
            "repository": "JovieInc/Jovie",
            "pr": 17001,
            "headSha": "a" * 40,
            "issue": None,
            "disposition": "active-remediation",
            "sourceState": "repair",
            "owner": "symphony",
            "writer": "symphony",
            "action": "create-bounded-ci-repair-pr",
            "reason": "required-checks-not-green",
            "terminal": False,
        }

        self.assertEqual(
            MODULE._lifecycle_action_digest(identity),
            "5a34f15f28cdfed416aa498dd84fdf5d048f68f9f183f782c1a2b95800f28c52",
        )

    def test_health_fails_closed_when_one_open_pr_lacks_owned_lifecycle_action(self):
        observed = snapshot()
        observed["classifications"]["lifecycleActions"] = observed[
            "classifications"
        ]["lifecycleActions"][:-1]

        health = MODULE.evaluate_closure_health(observed, None, NOW)

        self.assertEqual(health["status"], "red")
        self.assertIn("lifecycle-action-inventory-incomplete", health["reasons"])

    def test_health_fails_closed_for_malformed_or_unbound_lifecycle_content(self):
        mutations = {
            "missing-pr": (lambda action: action.update(pr=None), True),
            "missing-head": (lambda action: action.update(headSha=None), True),
            "missing-action": (lambda action: action.pop("action"), True),
            "missing-reason": (lambda action: action.pop("reason"), True),
            "missing-observed-at": (lambda action: action.pop("observedAt"), True),
            "unbound-lifecycle-key": (
                lambda action: action.update(lifecycleKey="JovieInc/Jovie:pr:999"),
                True,
            ),
            "wrong-repository": (
                lambda action: action.update(repository="JovieInc/LogYourBody"),
                True,
            ),
            "unbound-action-key": (
                lambda action: action.update(headSha="b" * 40),
                False,
            ),
            "wrong-native-queue-writer": (
                lambda action: action.update(owner="gem", writer="gem"),
                True,
            ),
        }

        for name, (mutate, rebind_action_key) in mutations.items():
            with self.subTest(name=name):
                observed = snapshot()
                action = dict(observed["classifications"]["lifecycleActions"][0])
                mutate(action)
                if rebind_action_key:
                    action["actionKey"] = MODULE._lifecycle_action_digest(
                        MODULE._lifecycle_action_identity(action)
                    )
                observed["classifications"] = {
                    **observed["classifications"],
                    "lifecycleActions": [
                        action,
                        observed["classifications"]["lifecycleActions"][1],
                    ],
                }

                health = MODULE.evaluate_closure_health(observed, None, NOW)

                self.assertEqual(health["status"], "red")
                self.assertFalse(health["newIssueIntakeAllowed"])
                self.assertIn(
                    "lifecycle-action-inventory-incomplete", health["reasons"]
                )

    def test_boundary_offset_timestamp_is_treated_as_missing_history(self):
        self.assertIsNone(MODULE.parse_time("0001-01-01T00:00:00+14:00"))

    def test_healthy_writer_and_progress_allow_new_intake(self):
        result = MODULE.evaluate_closure_health(snapshot(), previous=None, now=NOW)

        self.assertEqual(result["status"], "healthy")
        self.assertTrue(result["newIssueIntakeAllowed"])
        self.assertEqual(result["authority"], "Summer")
        self.assertTrue(result["promotionContinues"])
        self.assertTrue(result["remediationContinues"])
        self.assertEqual(result["stackHealth"], MODULE.empty_stack_health())
        self.assertEqual(result["repairActions"], [])

    def test_malformed_stack_health_stays_bounded_for_fleet_refresh_ingress(self):
        result = MODULE.evaluate_closure_health(
            snapshot(
                classifications={
                    "dispositions": [
                        {"number": 1, "state": "promote"},
                    ],
                    "unclassified": [],
                    "duplicateIssueLanes": [],
                    "expiredHolds": [],
                    "changedFileEvidence": [],
                    "stackHealth": {"maxDepth": 4},
                    "repairActions": {"rootPr": 1},
                }
            ),
            previous=None,
            now=NOW,
        )

        self.assertEqual(result["status"], "red")
        self.assertIn("closure-observation-unknown", result["reasons"])
        self.assertEqual(result["stackHealth"], MODULE.empty_stack_health())
        self.assertEqual(result["repairActions"], [])

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

    def test_unmergeable_native_queue_episode_crosses_bounded_red_threshold(self):
        churning = snapshot(
            openPrs=1,
            eligiblePrs=1,
            greenReadyPrs=1,
            classifications=MODULE.classify_open_prs(
                [
                    pr(
                        7,
                        title="fix: repair JOV-707",
                        queued=True,
                        queue_state="UNMERGEABLE",
                    )
                ],
                NOW,
            ),
        )

        first = MODULE.evaluate_closure_health(churning, previous=None, now=NOW)
        self.assertEqual(first["status"], "grace")
        self.assertNotIn("native-queue-unmergeable", first["reasons"])
        self.assertEqual(first["unmergeableNativeQueuePrs"], [7])
        self.assertEqual(
            first["episodes"]["unmergeableQueue"]["since"],
            MODULE.isoformat(NOW),
        )
        self.assertFalse(first["newIssueIntakeAllowed"])

        result = MODULE.evaluate_closure_health(
            churning,
            previous=first,
            now=NOW + timedelta(minutes=16),
        )

        self.assertEqual(result["status"], "red")
        self.assertIn("native-queue-unmergeable", result["reasons"])
        self.assertEqual(result["unmergeableNativeQueuePrs"], [7])
        self.assertEqual(
            result["episodes"]["unmergeableQueue"]["since"],
            MODULE.isoformat(NOW),
        )
        self.assertFalse(result["newIssueIntakeAllowed"])

    def test_unmergeable_native_queue_episode_clears_when_mergeable(self):
        churning = snapshot(
            openPrs=1,
            eligiblePrs=1,
            greenReadyPrs=1,
            classifications=MODULE.classify_open_prs(
                [
                    pr(
                        7,
                        title="fix: repair JOV-707",
                        queued=True,
                        queue_state="UNMERGEABLE",
                    )
                ],
                NOW,
            ),
        )
        first = MODULE.evaluate_closure_health(churning, previous=None, now=NOW)
        self.assertIn("unmergeableQueue", first["episodes"])

        cleared = MODULE.evaluate_closure_health(
            snapshot(
                openPrs=1,
                eligiblePrs=1,
                greenReadyPrs=1,
                classifications=MODULE.classify_open_prs(
                    [
                        pr(
                            7,
                            title="fix: repair JOV-707",
                            queued=True,
                            queue_state="AWAITING_CHECKS",
                        )
                    ],
                    NOW,
                ),
            ),
            previous=first,
            now=NOW + timedelta(minutes=5),
        )

        self.assertEqual(cleared["status"], "healthy")
        self.assertNotIn("unmergeableQueue", cleared["episodes"])
        self.assertNotIn("native-queue-unmergeable", cleared["reasons"])
        self.assertEqual(cleared["unmergeableNativeQueuePrs"], [])
        self.assertTrue(cleared["newIssueIntakeAllowed"])

    def test_unclassified_pr_crosses_fifteen_minute_deliberate_red(self):
        missing_provenance = pr(1, title="fix: JOV-1")
        missing_provenance["isCrossRepository"] = None
        unclassified = snapshot(
            classifications=MODULE.classify_open_prs(
                [missing_provenance, pr(2, title="fix: JOV-2")], NOW
            )
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
        lyb_classifications = MODULE.classify_open_prs(
            [
                pr(1, title="feat: ship LYB-1", queued=True),
                pr(2, title="feat: ship LYB-2"),
            ],
            NOW,
            repository="JovieInc/LogYourBody",
        )
        current = MODULE.evaluate_closure_health(
            snapshot(
                repository="JovieInc/LogYourBody",
                nativeQueueCount=0,
                classifications=lyb_classifications,
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
    def test_promotion_evidence_binds_compare_checks_and_final_readback(self):
        candidate = pr(
            21,
            title="fix: exact JOV-121",
            promotion_evidence=None,
        )
        calls: list[list[str]] = []

        def run(command: list[str], **_kwargs: object) -> mock.Mock:
            calls.append(command)
            if command[1:3] == ["api", "graphql"]:
                payload = {
                    "data": {
                        "repository": {
                            "base": {"target": {"oid": "a" * 40}},
                            "pr_21": promotion_pr_state(21),
                            "commit_21": exact_named_check_commit(21),
                        }
                    }
                }
            elif "rules/branches/main" in command[2]:
                payload = live_required_ruleset()
            elif "compare/" in command[2]:
                payload = {
                    "status": "ahead",
                    "ahead_by": 1,
                    "behind_by": 0,
                    "base_commit": {"sha": "a" * 40},
                }
            else:
                raise AssertionError(f"unexpected command: {command}")
            return mock.Mock(returncode=0, stdout=json.dumps(payload))

        observed = MODULE.observe_promotion_evidence(
            "JovieInc/Jovie", [candidate], "a" * 40, run_impl=run
        )[0]

        evidence = observed["promotionEvidence"]
        self.assertEqual(evidence["status"], "complete")
        self.assertEqual(evidence["behindBy"], 0)
        self.assertIn("rules/branches/main", calls[0][2])
        self.assertEqual(calls[1][0:3], ["gh", "api", "graphql"])
        self.assertIn(f"{'a' * 40}...{21:040x}", calls[2][2])
        self.assertIn("rules/branches/main", calls[3][2])
        self.assertEqual(calls[4][0:3], ["gh", "api", "graphql"])

    def test_promotion_evidence_fails_closed_when_head_moves_during_observation(self):
        candidate = pr(22, title="fix: race JOV-122", promotion_evidence=None)
        graphql_calls = 0

        def run(command: list[str], **_kwargs: object) -> mock.Mock:
            nonlocal graphql_calls
            if command[1:3] == ["api", "graphql"]:
                graphql_calls += 1
                final_readback = graphql_calls == 2
                payload = {
                    "data": {
                        "repository": {
                            "base": {"target": {"oid": "a" * 40}},
                            "pr_22": promotion_pr_state(
                                22,
                                head_oid="f" * 40 if final_readback else None,
                            ),
                            "commit_22": exact_named_check_commit(22),
                        }
                    }
                }
            elif "rules/branches/main" in command[2]:
                payload = live_required_ruleset()
            elif "compare/" in command[2]:
                payload = {
                    "status": "ahead",
                    "ahead_by": 1,
                    "behind_by": 0,
                    "base_commit": {"sha": "a" * 40},
                }
            else:
                raise AssertionError(f"unexpected command: {command}")
            return mock.Mock(returncode=0, stdout=json.dumps(payload))

        observed = MODULE.observe_promotion_evidence(
            "JovieInc/Jovie", [candidate], "a" * 40, run_impl=run
        )[0]

        self.assertEqual(observed["promotionEvidence"]["status"], "stale")

    def test_final_readback_catches_same_sha_required_check_regression(self):
        candidate = pr(24, title="fix: check race JOV-124", promotion_evidence=None)
        graphql_calls = 0

        def run(command: list[str], **_kwargs: object) -> mock.Mock:
            nonlocal graphql_calls
            if command[1:3] == ["api", "graphql"]:
                graphql_calls += 1
                payload = {
                    "data": {
                        "repository": {
                            "base": {"target": {"oid": "a" * 40}},
                            "pr_24": promotion_pr_state(24),
                            "commit_24": exact_named_check_commit(
                                24,
                                check_status=(
                                    "IN_PROGRESS" if graphql_calls == 2 else "COMPLETED"
                                ),
                                check_conclusion=(
                                    None if graphql_calls == 2 else "SUCCESS"
                                ),
                            ),
                        }
                    }
                }
            elif "rules/branches/main" in command[2]:
                payload = live_required_ruleset()
            elif "compare/" in command[2]:
                payload = {
                    "status": "ahead",
                    "ahead_by": 1,
                    "behind_by": 0,
                    "base_commit": {"sha": "a" * 40},
                }
            else:
                raise AssertionError(f"unexpected command: {command}")
            return mock.Mock(returncode=0, stdout=json.dumps(payload))

        observed = MODULE.observe_promotion_evidence(
            "JovieInc/Jovie", [candidate], "a" * 40, run_impl=run
        )[0]
        result = MODULE.classify_open_prs([observed], NOW)

        self.assertEqual(graphql_calls, 2)
        self.assertEqual(result["dispositions"][0]["state"], "repair")
        self.assertEqual(
            result["dispositions"][0]["reason"], "required-checks-not-green"
        )

    def test_promotion_evidence_fails_closed_on_live_required_policy_drift(self):
        candidate = pr(23, title="fix: policy drift JOV-123", promotion_evidence=None)
        calls: list[list[str]] = []

        def run(command: list[str], **_kwargs: object) -> mock.Mock:
            calls.append(command)
            payload = live_required_ruleset()
            payload[0]["parameters"]["required_status_checks"].append(  # type: ignore[index]
                {"context": "New Required Gate"}
            )
            return mock.Mock(returncode=0, stdout=json.dumps(payload))

        observed = MODULE.observe_promotion_evidence(
            "JovieInc/Jovie", [candidate], "a" * 40, run_impl=run
        )[0]

        self.assertEqual(observed["promotionEvidence"]["status"], "policy-drift")
        self.assertEqual(len(calls), 1)

    def test_atomic_named_query_never_pages_the_mutable_rollup(self):
        fields = MODULE._required_check_fields(MODULE.EXPECTED_REQUIRED_CHECKS)

        self.assertNotIn("statusCheckRollup", fields)
        self.assertNotIn("after:", fields)
        self.assertIn(
            f"requiredSuites:checkSuites(first:{MODULE.REQUIRED_CHECK_SUITE_PAGE})",
            fields,
        )
        self.assertNotIn("checkSuites(first:50,filterBy", fields)
        for name in MODULE.EXPECTED_REQUIRED_CHECKS:
            self.assertIn(f"context(name:{json.dumps(name)})", fields)
            self.assertIn(f"checkName:{json.dumps(name)}", fields)

    def test_final_atomic_readback_ignores_legacy_human_label(self):
        candidate = pr(25, title="fix: lifecycle JOV-125", promotion_evidence=None)
        initial_pr = {
            **promotion_pr_state(25),
            "headOid": f"{25:040x}",
            "checkEvidenceStatus": "complete",
            "requiredChecks": exact_green_promotion_evidence(25)["requiredChecks"],
        }
        final_pr = {
            **initial_pr,
            "isDraft": False,
            "labels": {"totalCount": 1, "nodes": [{"name": "needs-human"}]},
            "mergeQueueEntry": {
                "position": 1,
                "enqueuedAt": NOW.isoformat(),
                "state": "AWAITING_CHECKS",
            },
        }
        with mock.patch.object(
            MODULE,
            "_observe_live_required_checks",
            return_value=MODULE.EXPECTED_REQUIRED_CHECKS,
        ), mock.patch.object(
            MODULE,
            "_readback_promotion_state",
            side_effect=[
                {"baseOid": "a" * 40, "prs": {25: initial_pr}},
                {"baseOid": "a" * 40, "prs": {25: final_pr}},
            ],
        ), mock.patch.object(
            MODULE,
            "_observe_one_comparison",
            return_value={
                "status": "complete",
                "headOid": f"{25:040x}",
                "baseOid": "a" * 40,
                "comparisonStatus": "ahead",
                "aheadBy": 1,
                "behindBy": 0,
            },
        ):
            observed = MODULE.observe_promotion_evidence(
                "JovieInc/Jovie", [candidate], "a" * 40
            )[0]

        disposition = MODULE.classify_open_prs([observed], NOW)["dispositions"][0]
        self.assertEqual(disposition["state"], "queued")
        self.assertEqual(disposition["reason"], "native-queue-entry")

    def test_final_atomic_readback_drops_a_now_closed_pr(self):
        candidate = pr(26, title="fix: closed JOV-126", promotion_evidence=None)
        current = {
            **promotion_pr_state(26),
            "headOid": f"{26:040x}",
            "checkEvidenceStatus": "complete",
            "requiredChecks": exact_green_promotion_evidence(26)["requiredChecks"],
        }
        with mock.patch.object(
            MODULE,
            "_observe_live_required_checks",
            return_value=MODULE.EXPECTED_REQUIRED_CHECKS,
        ), mock.patch.object(
            MODULE,
            "_readback_promotion_state",
            side_effect=[
                {"baseOid": "a" * 40, "prs": {26: current}},
                {
                    "baseOid": "a" * 40,
                    "prs": {26: {**current, "state": "CLOSED"}},
                },
            ],
        ), mock.patch.object(
            MODULE,
            "_observe_one_comparison",
            return_value={
                "status": "complete",
                "headOid": f"{26:040x}",
                "baseOid": "a" * 40,
                "comparisonStatus": "ahead",
                "aheadBy": 1,
                "behindBy": 0,
            },
        ):
            observed = MODULE.observe_promotion_evidence(
                "JovieInc/Jovie", [candidate], "a" * 40
            )

        self.assertEqual(observed, [])

    def test_more_than_25_green_candidates_are_all_compared(self):
        candidates = [
            pr(number, title=f"fix: bounded JOV-{number}", promotion_evidence=None)
            for number in range(30, 56)
        ]
        state = {
            "baseOid": "a" * 40,
            "prs": {
                number: {
                    **promotion_pr_state(number),
                    "headOid": f"{number:040x}",
                    "checkEvidenceStatus": "complete",
                    "requiredChecks": exact_green_promotion_evidence(number)[
                        "requiredChecks"
                    ],
                }
                for number in range(30, 56)
            },
        }
        with mock.patch.object(
            MODULE,
            "_observe_live_required_checks",
            return_value=MODULE.EXPECTED_REQUIRED_CHECKS,
        ), mock.patch.object(
            MODULE, "_readback_promotion_state", return_value=state
        ), mock.patch.object(
            MODULE,
            "_observe_one_comparison",
            side_effect=lambda _repo, candidate, base_oid, _deadline, **_kwargs: {
                "status": "complete",
                "headOid": candidate["headRefOid"],
                "baseOid": base_oid,
                "comparisonStatus": "ahead",
                "aheadBy": 1,
                "behindBy": 0,
            },
        ) as compare:
            observed = MODULE.observe_promotion_evidence(
                "JovieInc/Jovie", candidates, "a" * 40
            )

        self.assertEqual(
            {item["promotionEvidence"]["status"] for item in observed},
            {"complete"},
        )
        self.assertEqual(compare.call_count, 26)

    def test_comparison_phase_has_one_aggregate_deadline(self):
        candidates = [
            pr(number, title=f"fix: deadline JOV-{number}", promotion_evidence=None)
            for number in range(60, 63)
        ]
        state = {
            "baseOid": "a" * 40,
            "prs": {
                number: {
                    **promotion_pr_state(number),
                    "headOid": f"{number:040x}",
                    "checkEvidenceStatus": "complete",
                    "requiredChecks": exact_green_promotion_evidence(number)[
                        "requiredChecks"
                    ],
                }
                for number in range(60, 63)
            },
        }

        def expire_after_one(futures: object, *, timeout: float):
            self.assertLessEqual(timeout, MODULE.PROMOTION_EVIDENCE_PHASE_SECONDS)
            self.assertGreater(timeout, 0)
            ordered = list(futures)
            return {ordered[0]}, set(ordered[1:])

        with mock.patch.object(
            MODULE,
            "_observe_live_required_checks",
            return_value=MODULE.EXPECTED_REQUIRED_CHECKS,
        ), mock.patch.object(
            MODULE, "_readback_promotion_state", return_value=state
        ), mock.patch.object(
            MODULE,
            "_observe_one_comparison",
            side_effect=lambda _repo, candidate, base_oid, _deadline, **_kwargs: {
                "status": "complete",
                "headOid": candidate["headRefOid"],
                "baseOid": base_oid,
                "comparisonStatus": "ahead",
                "aheadBy": 1,
                "behindBy": 0,
            },
        ), mock.patch.object(
            MODULE, "wait", side_effect=expire_after_one
        ) as bounded_wait:
            observed = MODULE.observe_promotion_evidence(
                "JovieInc/Jovie", candidates, "a" * 40
            )

        self.assertEqual(
            {
                item["number"]: item["promotionEvidence"]["status"]
                for item in observed
            },
            {60: "complete", 61: "deadline-exceeded", 62: "deadline-exceeded"},
        )
        self.assertEqual(bounded_wait.call_count, 1)

    def test_graphql_snapshot_aggregates_pages_and_requires_completeness(self):
        pages = [
            {
                "data": {
                    "repository": {
                        "main": {"target": {"oid": "a" * 40}},
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
        self.assertEqual(result["mainOid"], "a" * 40)
        self.assertEqual(result["latestMergeAt"], MODULE.isoformat(NOW))
        self.assertIn("owner=JovieInc", run.call_args.args[0])
        self.assertIn("name=Jovie", run.call_args.args[0])
        query_arg = next(
            argument
            for argument in run.call_args.args[0]
            if argument.startswith("query=")
        )
        self.assertIn("number title body headRefName headRefOid", query_arg)
        self.assertIn('main:ref(qualifiedName:"refs/heads/main")', query_arg)
        self.assertIn("headRefOid baseRefName baseRefOid", query_arg)
        self.assertIn("isCrossRepository", query_arg)
        self.assertIn("labels(first:100){totalCount nodes{name}}", query_arg)
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

    def test_graphql_snapshot_retries_command_failure_and_keeps_redacted_stderr(self):
        pages = [
            {
                "data": {
                    "repository": {
                        "main": {"target": {"oid": "a" * 40}},
                        "pullRequests": {"totalCount": 0, "nodes": []},
                        "merged": {"nodes": []},
                    }
                }
            }
        ]
        transient = subprocess.CalledProcessError(
            1,
            ["gh", "api", "graphql"],
            stderr="GraphQL transport reset Authorization: bearer-sensitive",
        )
        completed = mock.Mock(stdout=MODULE.json.dumps(pages))
        with mock.patch.object(
            MODULE.subprocess, "run", side_effect=[transient, completed]
        ) as run:
            result = MODULE._run_graphql_snapshot("JovieInc/Jovie")

        self.assertEqual(result["mainOid"], "a" * 40)
        self.assertEqual(run.call_count, 2)

        limited = subprocess.CalledProcessError(
            1,
            ["gh", "api", "graphql"],
            stderr="HTTP 429 rate limit Authorization: bearer-sensitive",
        )
        with mock.patch.object(
            MODULE.subprocess, "run", side_effect=limited
        ) as run:
            with self.assertRaisesRegex(ValueError, "HTTP 429 rate limit") as raised:
                MODULE._run_graphql_snapshot("JovieInc/Jovie")
        self.assertEqual(run.call_count, 1)
        self.assertNotIn("bearer-sensitive", str(raised.exception))
        self.assertIn("[REDACTED]", str(raised.exception))

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

    def test_live_observer_propagates_one_end_to_end_deadline(self):
        expected_deadline = 10.0 + MODULE.CLOSURE_OBSERVATION_SECONDS
        with mock.patch.object(
            MODULE.time, "monotonic", return_value=10.0
        ), mock.patch.object(
            MODULE,
            "_run_graphql_snapshot",
            return_value={"prs": [], "mainOid": "a" * 40, "latestMergeAt": None},
        ) as snapshot_read, mock.patch.object(
            MODULE, "observe_promotion_evidence", return_value=[]
        ) as promotion_read, mock.patch.object(
            MODULE, "_observe_queue_controller", return_value={"status": "green"}
        ) as controller_read:
            MODULE.observe_closure_health("JovieInc/Jovie", previous=None, now=NOW)

        self.assertEqual(snapshot_read.call_args.args[1], expected_deadline)
        self.assertEqual(promotion_read.call_args.args[3], expected_deadline)
        self.assertEqual(controller_read.call_args.args[1], expected_deadline)
        self.assertEqual(controller_read.call_count, 1)

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
                "mainOid": "a" * 40,
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
                "mainOid": "a" * 40,
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

    @staticmethod
    def _controller_runs(*runs: dict[str, object]) -> mock.Mock:
        return mock.Mock(stdout=MODULE.json.dumps({"workflow_runs": list(runs)}))

    def test_in_progress_latest_run_judges_latest_completed_run(self):
        completed_success = {
            "id": 41,
            "status": "completed",
            "conclusion": "success",
            "html_url": "https://example.test/run/41",
            "updated_at": (NOW - timedelta(minutes=2)).isoformat(),
        }
        in_flight = {
            "id": 42,
            "status": "in_progress",
            "conclusion": None,
            "html_url": "https://example.test/run/42",
            "updated_at": NOW.isoformat(),
        }
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(in_flight, completed_success),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(result["status"], "green")
        self.assertEqual(result["runId"], 41)
        self.assertEqual(result["runStatus"], "completed")
        self.assertEqual(result["conclusion"], "success")
        self.assertEqual(result["activeRunId"], 42)

        health = MODULE.evaluate_closure_health(
            snapshot(controller=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "healthy")
        self.assertNotIn("controller", health["episodes"])
        self.assertTrue(health["newIssueIntakeAllowed"])

    def test_in_progress_latest_run_keeps_latest_completed_failure_red(self):
        completed_failure = {
            "id": 41,
            "status": "completed",
            "conclusion": "failure",
            "html_url": "https://example.test/run/41",
            "updated_at": (NOW - timedelta(minutes=2)).isoformat(),
        }
        in_flight = {
            "id": 42,
            "status": "queued",
            "conclusion": None,
            "html_url": "https://example.test/run/42",
            "updated_at": NOW.isoformat(),
        }
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(in_flight, completed_failure),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["runId"], 41)
        self.assertEqual(result["activeRunId"], 42)

        stalled = snapshot(controller=result)
        first = MODULE.evaluate_closure_health(stalled, previous=None, now=NOW)
        self.assertEqual(first["status"], "grace")
        self.assertFalse(first["newIssueIntakeAllowed"])
        later = MODULE.evaluate_closure_health(
            stalled,
            previous=first,
            now=NOW + timedelta(minutes=11),
        )
        self.assertEqual(later["status"], "red")
        self.assertIn("queue-controller-red-over-10m", later["reasons"])

    def test_only_active_runs_stay_recovering_without_completed_evidence(self):
        runs = [
            {
                "id": 42,
                "status": "in_progress",
                "conclusion": None,
                "html_url": "https://example.test/run/42",
                "updated_at": NOW.isoformat(),
            },
            {
                "id": 41,
                "status": "queued",
                "conclusion": None,
                "html_url": "https://example.test/run/41",
                "updated_at": (NOW - timedelta(minutes=1)).isoformat(),
            },
        ]
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(*runs),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(result["status"], "recovering")
        self.assertEqual(result["runId"], 42)
        self.assertEqual(result["runStatus"], "in_progress")
        self.assertNotIn("activeRunId", result)

    def test_missing_runs_fail_closed(self):
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(
            result,
            {"status": "unknown", "reason": "controller-run-missing"},
        )
        health = MODULE.evaluate_closure_health(
            snapshot(controller=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "grace")
        self.assertFalse(health["newIssueIntakeAllowed"])

    def test_cancelled_latest_run_judges_latest_verdict_run(self):
        cancelled = {
            "id": 43,
            "status": "completed",
            "conclusion": "cancelled",
            "html_url": "https://example.test/run/43",
            "updated_at": NOW.isoformat(),
        }
        completed_success = {
            "id": 41,
            "status": "completed",
            "conclusion": "success",
            "html_url": "https://example.test/run/41",
            "updated_at": (NOW - timedelta(minutes=2)).isoformat(),
        }
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(cancelled, completed_success),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(result["status"], "green")
        self.assertEqual(result["runId"], 41)
        self.assertEqual(result["conclusion"], "success")

        health = MODULE.evaluate_closure_health(
            snapshot(controller=result),
            previous=None,
            now=NOW,
        )
        self.assertEqual(health["status"], "healthy")
        self.assertNotIn("controller", health["episodes"])

    def test_cancelled_latest_run_keeps_latest_verdict_failure_red(self):
        cancelled = {
            "id": 43,
            "status": "completed",
            "conclusion": "cancelled",
            "html_url": "https://example.test/run/43",
            "updated_at": NOW.isoformat(),
        }
        completed_failure = {
            "id": 41,
            "status": "completed",
            "conclusion": "failure",
            "html_url": "https://example.test/run/41",
            "updated_at": (NOW - timedelta(minutes=2)).isoformat(),
        }
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(cancelled, completed_failure),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["runId"], 41)

        stalled = snapshot(controller=result)
        first = MODULE.evaluate_closure_health(stalled, previous=None, now=NOW)
        self.assertEqual(first["status"], "grace")
        later = MODULE.evaluate_closure_health(
            stalled,
            previous=first,
            now=NOW + timedelta(minutes=11),
        )
        self.assertEqual(later["status"], "red")
        self.assertIn("queue-controller-red-over-10m", later["reasons"])

    def test_only_cancelled_and_active_runs_stay_recovering(self):
        in_flight = {
            "id": 44,
            "status": "in_progress",
            "conclusion": None,
            "html_url": "https://example.test/run/44",
            "updated_at": NOW.isoformat(),
        }
        cancelled = {
            "id": 43,
            "status": "completed",
            "conclusion": "cancelled",
            "html_url": "https://example.test/run/43",
            "updated_at": (NOW - timedelta(minutes=1)).isoformat(),
        }
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=self._controller_runs(in_flight, cancelled),
        ):
            result = MODULE._observe_queue_controller("JovieInc/Jovie")

        self.assertEqual(result["status"], "recovering")
        self.assertEqual(result["runId"], 44)


if __name__ == "__main__":
    unittest.main()
