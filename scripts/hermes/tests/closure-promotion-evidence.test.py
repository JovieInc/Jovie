#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import pathlib
import re
import time
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts/hermes/closure_health.py"
SPEC = importlib.util.spec_from_file_location("closure_health", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def named_commit() -> dict[str, object]:
    status: dict[str, object] = {}
    suite: dict[str, object] = {
        "app": {"id": "ci-app", "slug": "github-actions"}
    }
    commit: dict[str, object] = {
        "oid": "b" * 40,
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
                    "databaseId": 200,
                    "name": name,
                    "status": "COMPLETED",
                    "conclusion": "SUCCESS",
                }
            ],
        }
    return commit


def evidence(checks: list[dict[str, object]]) -> dict[str, object]:
    return {
        "requiredCheckNames": sorted(MODULE.EXPECTED_REQUIRED_CHECKS),
        "requiredChecks": checks,
    }


class ClosurePromotionEvidenceTests(unittest.TestCase):
    def test_required_contract_matches_checked_in_ruleset(self):
        ruleset = (ROOT / ".github/rulesets/branch-protection.yml").read_text(
            encoding="utf-8"
        )
        source = frozenset(re.findall(r"- context: '([^']+)'", ruleset))

        self.assertEqual(MODULE.EXPECTED_REQUIRED_CHECKS, source)

    def test_evaluated_main_policy_combines_every_applicable_rule(self):
        names = sorted(MODULE.EXPECTED_REQUIRED_CHECKS)
        payload = [
            {
                "type": "required_status_checks",
                "parameters": {
                    "required_status_checks": [{"context": name} for name in names[:2]]
                },
            },
            {"type": "merge_queue", "parameters": {}},
            {
                "type": "required_status_checks",
                "parameters": {
                    "required_status_checks": [{"context": name} for name in names[2:]]
                },
            },
        ]

        def run(command: list[str], **_kwargs: object) -> mock.Mock:
            self.assertIn("rules/branches/main", command[2])
            return mock.Mock(returncode=0, stdout=json.dumps(payload))

        observed = MODULE._observe_live_required_checks(
            "JovieInc/Jovie", time.monotonic() + 5, run_impl=run
        )

        self.assertEqual(observed, MODULE.EXPECTED_REQUIRED_CHECKS)

    def test_snapshot_reads_complete_label_evidence_for_promotion_candidates(self):
        def run(command: list[str], **_kwargs: object) -> mock.Mock:
            query_arg = next(part for part in command if part.startswith("query="))
            self.assertIn("labels(first:100){totalCount nodes{name}}", query_arg)
            return mock.Mock(
                returncode=0,
                stdout=json.dumps(
                    [
                        {
                            "data": {
                                "repository": {
                                    "main": {"target": {"oid": "b" * 40}},
                                    "pullRequests": {
                                        "totalCount": 1,
                                        "nodes": [
                                            {
                                                "number": 16764,
                                                "title": "fix(ci): add exact promotion evidence foundation",
                                                "body": "",
                                                "baseRefName": "main",
                                                "headRefName": "codex/closure-promotion-evidence-foundation",
                                                "headRefOid": "a" * 40,
                                                "isDraft": False,
                                                "isCrossRepository": False,
                                                "mergeStateStatus": "CLEAN",
                                                "createdAt": "2026-08-30T16:00:00Z",
                                                "updatedAt": "2026-08-30T16:00:00Z",
                                                "author": {"login": "itstimwhite"},
                                                "labels": {"totalCount": 0, "nodes": []},
                                                "mergeQueueEntry": None,
                                                "changedFiles": 0,
                                                "files": {"totalCount": 0, "nodes": []},
                                            }
                                        ],
                                    },
                                    "merged": {"nodes": []},
                                }
                            }
                        }
                    ]
                ),
            )

        with mock.patch.object(MODULE.subprocess, "run", side_effect=run):
            observed = MODULE._run_graphql_snapshot("JovieInc/Jovie")

        pr = observed["prs"][0]
        self.assertEqual(MODULE._label_evidence(pr), {"status": "complete"})
        self.assertTrue(MODULE._needs_promotion_evidence(pr))

    def test_exact_named_evidence_requires_every_effective_producer_green(self):
        commit = named_commit()
        check_name = "Migration Guard"
        index = sorted(MODULE.EXPECTED_REQUIRED_CHECKS).index(check_name)
        commit["status"][f"legacy_{index}"] = {  # type: ignore[index]
            "context": check_name,
            "state": "FAILURE",
            "createdAt": "2026-08-30T16:02:00Z",
        }

        checks = MODULE._normalize_named_required_checks(
            commit, MODULE.EXPECTED_REQUIRED_CHECKS
        )

        self.assertFalse(MODULE._required_checks_green(evidence(checks)))
        observed = next(check for check in checks if check["name"] == check_name)
        self.assertEqual(len(observed["sources"]), 2)

    def test_latest_rerun_per_check_app_wins_and_truncation_fails_closed(self):
        commit = named_commit()
        check_name = "PR Ready"
        index = sorted(MODULE.EXPECTED_REQUIRED_CHECKS).index(check_name)
        connection = commit["requiredSuites"]
        older: dict[str, object] = {
            "app": {"id": "ci-app", "slug": "github-actions"}
        }
        for run_index, _name in enumerate(sorted(MODULE.EXPECTED_REQUIRED_CHECKS)):
            older[f"runs_{run_index}"] = {"totalCount": 0, "nodes": []}
        older[f"runs_{index}"] = {
            "totalCount": 1,
            "nodes": [
                {
                    "databaseId": 100,
                    "name": check_name,
                    "status": "COMPLETED",
                    "conclusion": "FAILURE",
                }
            ],
        }
        connection["nodes"].insert(0, older)  # type: ignore[index]
        connection["totalCount"] = 2  # type: ignore[index]
        checks = MODULE._normalize_named_required_checks(
            commit, MODULE.EXPECTED_REQUIRED_CHECKS
        )
        self.assertTrue(MODULE._required_checks_green(evidence(checks)))

        connection["nodes"][0][f"runs_{index}"]["nodes"][0]["conclusion"] = "SUCCESS"  # type: ignore[index]
        connection["nodes"][1][f"runs_{index}"]["nodes"][0]["conclusion"] = "FAILURE"  # type: ignore[index]
        checks = MODULE._normalize_named_required_checks(
            commit, MODULE.EXPECTED_REQUIRED_CHECKS
        )
        self.assertFalse(MODULE._required_checks_green(evidence(checks)))

        connection["totalCount"] = 3  # type: ignore[index]
        with self.assertRaisesRegex(ValueError, "incomplete"):
            MODULE._normalize_named_required_checks(
                commit, MODULE.EXPECTED_REQUIRED_CHECKS
            )

    def test_readback_caps_batches_and_preserves_every_candidate(self):
        candidates = [
            {"number": number, "headRefOid": f"{number:040x}"}
            for number in range(1, 27)
        ]
        batch_sizes: list[int] = []

        def read_batch(
            _repo: str,
            batch: list[dict[str, object]],
            _required: frozenset[str],
            _deadline: float,
            **_kwargs: object,
        ) -> dict[str, object]:
            batch_sizes.append(len(batch))
            return {
                "baseOid": "a" * 40,
                "prs": {int(item["number"]): item for item in batch},
            }

        with mock.patch.object(
            MODULE, "_readback_promotion_batch", side_effect=read_batch
        ):
            observed = MODULE._readback_promotion_state(
                "JovieInc/Jovie",
                candidates,
                MODULE.EXPECTED_REQUIRED_CHECKS,
                time.monotonic() + 5,
            )

        self.assertEqual(sorted(batch_sizes), [2, 4, 4, 4, 4, 4, 4])
        self.assertEqual(len(observed["prs"]), 26)

    def test_readback_rejects_pr_head_drift_before_accepting_exact_checks(self):
        candidate = {"number": 7, "headRefOid": "b" * 40}

        def run(_command: list[str], **_kwargs: object) -> mock.Mock:
            return mock.Mock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "data": {
                            "repository": {
                                "base": {"target": {"oid": "a" * 40}},
                                "pr_7": {
                                    "state": "OPEN",
                                    "headRefOid": "c" * 40,
                                    "baseRefName": "main",
                                    "isDraft": False,
                                    "isCrossRepository": False,
                                    "mergeStateStatus": "CLEAN",
                                    "updatedAt": "2026-08-30T16:00:00Z",
                                    "author": {"login": "itstimwhite"},
                                    "labels": {"totalCount": 0, "nodes": []},
                                    "mergeQueueEntry": None,
                                },
                                "commit_7": named_commit(),
                            }
                        }
                    }
                ),
            )

        observed = MODULE._readback_promotion_batch(
            "JovieInc/Jovie",
            [candidate],
            MODULE.EXPECTED_REQUIRED_CHECKS,
            time.monotonic() + 5,
            run_impl=run,
        )

        self.assertEqual(observed["baseOid"], "a" * 40)
        self.assertEqual(observed["prs"][7]["headOid"], "c" * 40)

    def test_compare_evidence_rejects_the_wrong_base_identity(self):
        candidate = {"number": 7, "headRefOid": "7" * 40}

        def run(_command: list[str], **_kwargs: object) -> mock.Mock:
            return mock.Mock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "status": "ahead",
                        "ahead_by": 1,
                        "behind_by": 0,
                        "base_commit": {"sha": "c" * 40},
                    }
                ),
            )

        observed = MODULE._observe_one_comparison(
            "JovieInc/Jovie",
            candidate,
            "a" * 40,
            time.monotonic() + 5,
            run_impl=run,
        )

        self.assertEqual(observed["status"], "malformed")


if __name__ == "__main__":
    unittest.main()
