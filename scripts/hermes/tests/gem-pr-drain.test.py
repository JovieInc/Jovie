#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-pr-drain.py"
SPEC = importlib.util.spec_from_file_location("gem_pr_drain", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

GATE_SOURCE = ROOT / "scripts/hermes/gem-priority-gate.py"
GATE_SPEC = importlib.util.spec_from_file_location("gem_gate_for_drain", GATE_SOURCE)
if GATE_SPEC is None or GATE_SPEC.loader is None:
    raise RuntimeError(f"could not load {GATE_SOURCE}")
GATE_MODULE = importlib.util.module_from_spec(GATE_SPEC)
GATE_SPEC.loader.exec_module(GATE_MODULE)
from provider_useful_turns import profile_identity  # noqa: E402


def provider_profiles(count: int) -> list[str]:
    return sorted(
        profile_identity("openai", f"profile-{index}") for index in range(count)
    )


def stale_capacity_receipt():
    observed_at = GATE_MODULE.isoformat(GATE_MODULE.utc_now())
    main_sha = "a" * 40
    return GATE_MODULE.evaluate(
        {
            "main": {"status": "green", "sha": main_sha},
            "production": {"status": "green", "deployedSha": main_sha},
            "controller": {"status": "green"},
            "integrity": {"status": "clear"},
            "queue": {
                "status": "known",
                "eligiblePrs": 2,
                "greenReadyPrs": 2,
                "target": 15,
            },
            "closureHealth": {
                "schema": "jovie-closure-health/v1",
                "status": "healthy",
                "authority": "Summer",
                "newIssueIntakeAllowed": True,
                "promotionContinues": True,
                "remediationContinues": True,
                "reasons": [],
            },
            "independentReview": {
                "schema": "jovie-independent-review/v1",
                "status": "passed",
                "authority": "Gem",
                "reviewer": "Gem",
                "reviewId": "review-stale-capacity",
                "headSha": main_sha,
                "scope": "exact-main-head",
                "observedAt": observed_at,
                "accepted": True,
                "reason": "fresh-exact-head-independent-review",
            },
            "concurrencyEvidence": {
                "schema": "gem-concurrency-evidence/v1",
                "target": 4,
                "approved": True,
                "cleanRuns": 1,
                "severeIncidents": 0,
                "observedAt": observed_at,
                "accepted": False,
                "error": "capacity-evidence-stale",
            },
            "lease": {
                "status": "ok",
                "capacity": {
                    "provider": "openai",
                    "state": "available",
                    "accounts": 4,
                    "locked": 0,
                    "cooldown": 0,
                    "available": 4,
                    "lockedProfiles": [],
                    "cooldownProfiles": [],
                    "availableProfiles": provider_profiles(4),
                    "eligibleProfiles": provider_profiles(4),
                },
            },
        },
        observed_at,
    )


def valid_capacity_receipt(target: int = 4):
    observed_at = GATE_MODULE.isoformat(GATE_MODULE.utc_now())
    receipt = stale_capacity_receipt()
    signals = dict(receipt["signals"])
    signals["independentReview"] = {
        **signals["independentReview"],
        "observedAt": observed_at,
    }
    rows = [
        {
            "schema": "gem-provider-useful-turn/v1",
            "provider": "openai",
            "profile": profile_identity("openai", f"profile-{index}"),
            "model": "gpt-5.6-sol",
            "completedAt": observed_at,
            "rc": 0,
            "useful": True,
            "outputDigest": f"{index + 1:064x}",
            "outputBytes": 16,
            "tokens": {"input": 12, "output": 4, "total": 16},
        }
        for index in range(target)
    ]
    signals["concurrencyEvidence"] = {
        "schema": "gem-concurrency-evidence/v1",
        "source": "execution-proven-useful-turns",
        "target": target,
        "approved": True,
        "severeIncidents": 0,
        "observedAt": observed_at,
        "rows": rows,
        "providers": {
            "openai": {
                "enrolled": target,
                "enrolledProfiles": provider_profiles(target),
                "ready": target,
                "enrollmentSource": "credential-file-presence-only",
                "readinessSource": "execution-proven-useful-turns",
            }
        },
    }
    return GATE_MODULE.evaluate(signals, observed_at)


class JovieOwnershipTests(unittest.TestCase):
    def test_jovie_and_legacy_alias_can_be_stabilized_when_allowlisted(self):
        for repo in ("JovieInc/Jovie", "itstimwhite/Jovie"):
            self.assertTrue(MODULE.is_jovie_repository(repo))
            self.assertTrue(MODULE.repo_drain_enabled(repo, True))

    def test_other_repositories_can_still_follow_their_registry_policy(self):
        self.assertFalse(MODULE.repo_drain_enabled("other/repo", False))
        self.assertTrue(MODULE.repo_drain_enabled("other/repo", True))

    def test_stale_capacity_receipt_closes_remote_drain(self):
        receipt = stale_capacity_receipt()
        first = self._open_pr(
            1, mergeable_state="behind", created_at="2026-08-28T20:00:00Z"
        )
        second = self._open_pr(
            2, mergeable_state="behind", created_at="2026-08-28T20:01:00Z"
        )

        with tempfile.TemporaryDirectory() as tmp:
            state = pathlib.Path(tmp)
            stdout = io.StringIO()
            with (
                mock.patch.object(MODULE, "STATE", state),
                mock.patch.object(MODULE, "ARTIFACT", state / "latest.json"),
                mock.patch.object(MODULE, "POLICY_ENABLED", True),
                mock.patch.object(MODULE, "evaluate_remediation_gate", return_value=receipt),
                mock.patch.object(MODULE, "capacity", return_value=8),
                mock.patch.object(MODULE, "auth_status", return_value=(True, "github_auth_ok")),
                mock.patch.object(MODULE, "inventory", return_value=([first, second], [first, second])),
                mock.patch.object(MODULE, "update_one") as update_one,
                mock.patch.object(MODULE, "run") as remote,
                mock.patch.object(MODULE.sys, "argv", [str(SOURCE), "--dry-run"]),
                redirect_stdout(stdout),
            ):
                exit_code = MODULE.main()

        document = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0, document)
        self.assertEqual(document["capacity"], 0)
        self.assertEqual(document["selected"], [])
        self.assertFalse(receipt["remediationAdmission"]["pushAllowed"])
        self.assertEqual(receipt["concurrency"]["gem"]["maxConcurrent"], 0)
        update_one.assert_not_called()
        remote.assert_not_called()

    def test_unproven_capacity_contract_rejects_mutation_claims(self):
        receipt = stale_capacity_receipt()
        validated = MODULE.validate_gate_result(2, json.dumps(receipt), "remediation")
        self.assertEqual(MODULE.effective_capacity(8, validated), 0)
        self.assertEqual(validated["concurrency"]["gem"]["runtimeFloor"], 1)
        for field, value, expected in (
            (
                "pushAllowed",
                True,
                "remote remediation requires non-RED state and execution-proven capacity",
            ),
            ("maxConcurrent", 2, "remediation concurrency contradicts Gem concurrency"),
        ):
            with self.subTest(field=field, value=value):
                broken = json.loads(json.dumps(receipt))
                broken["remediationAdmission"][field] = value
                if field == "pushAllowed":
                    broken["remediationAdmission"]["activities"].append(
                        "expected-head-pr-update"
                    )
                with self.assertRaisesRegex(RuntimeError, expected):
                    MODULE.validate_gate_result(2, json.dumps(broken), "remediation")

    def test_failed_gate_receipt_is_valid_but_denies_remediation_dispatch(self):
        receipt = GATE_MODULE.failed_evaluation_receipt(ValueError("capacity unavailable"))
        validated = MODULE.validate_gate_result(2, json.dumps(receipt), "remediation")
        self.assertEqual(validated["state"], "RED")
        self.assertEqual(validated["remediationAdmission"]["maxConcurrent"], 0)
        self.assertEqual(MODULE.effective_capacity(8, validated), 0)

    def test_typed_remediation_capacity_caps_host_parallelism(self):
        gate = {"remediationAdmission": {"pushAllowed": True, "maxConcurrent": 1}}
        self.assertEqual(MODULE.effective_capacity(4, gate), 1)
        self.assertEqual(MODULE.effective_capacity(1, gate), 1)
        for maximum in (None, 0, -1, True, 1.5):
            with self.subTest(maximum=maximum), self.assertRaises(ValueError):
                MODULE.effective_capacity(
                    4,
                    {
                        "remediationAdmission": {
                            "pushAllowed": True,
                            "maxConcurrent": maximum,
                        }
                    },
                )

    def test_execution_proven_capacity_authenticates_exactly_one_remote_writer(self):
        receipt = valid_capacity_receipt(1)
        first = self._open_pr(
            1, mergeable_state="behind", created_at="2026-08-28T20:00:00Z"
        )
        second = self._open_pr(
            2, mergeable_state="behind", created_at="2026-08-28T20:01:00Z"
        )

        with tempfile.TemporaryDirectory() as tmp:
            state = pathlib.Path(tmp)
            stdout = io.StringIO()
            gate_process = MODULE.subprocess.CompletedProcess(
                ["python3", str(GATE_SOURCE)],
                0,
                stdout=json.dumps(receipt),
                stderr="",
            )
            with (
                mock.patch.object(MODULE, "STATE", state),
                mock.patch.object(MODULE, "ARTIFACT", state / "latest.json"),
                mock.patch.object(MODULE, "POLICY_ENABLED", True),
                mock.patch.object(MODULE, "run_process", return_value=gate_process),
                mock.patch.object(MODULE, "auth_status", return_value=(True, "github_auth_ok")),
                mock.patch.object(MODULE, "inventory", return_value=([first, second], [first, second])),
                mock.patch.object(MODULE, "capacity", return_value=8),
                mock.patch.object(
                    MODULE,
                    "update_one",
                    side_effect=lambda pr: {
                        "number": pr["number"],
                        "action": "api_update_branch",
                        "result": "ok",
                    },
                ) as update_one,
                mock.patch.object(MODULE.sys, "argv", [str(SOURCE)]),
                redirect_stdout(stdout),
            ):
                MODULE.WORK_GATE_CACHE.update(
                    checked_at=0.0, blocker="fleet_gate_not_checked"
                )
                exit_code = MODULE.main()

        document = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0, document)
        self.assertEqual(document["capacity"], 1)
        self.assertEqual(len(document["selected"]), 1)
        self.assertEqual(update_one.call_count, 1)
        self.assertEqual(
            [item["number"] for item in document["processed"] if item.get("action") == "api_update_branch"],
            [document["selected"][0]["number"]],
        )

    def test_push_blocked_remediation_capacity_is_zero(self):
        gate = {"remediationAdmission": {"pushAllowed": False, "maxConcurrent": 1}}
        self.assertEqual(MODULE.effective_capacity(8, gate), 0)

    def test_floor_receipt_rejects_push_disabled_outside_red(self):
        receipt = valid_capacity_receipt(1)
        receipt["remediationAdmission"]["pushAllowed"] = False
        receipt["remediationAdmission"]["activities"] = [
            activity
            for activity in receipt["remediationAdmission"]["activities"]
            if activity != "expected-head-pr-update"
        ]

        with self.assertRaisesRegex(
            RuntimeError,
            "remote remediation requires non-RED state and execution-proven capacity",
        ):
            MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")

    def test_floor_receipt_rejects_remediation_above_gem_concurrency(self):
        receipt = valid_capacity_receipt(1)
        receipt["remediationAdmission"]["maxConcurrent"] = 2

        with self.assertRaisesRegex(
            RuntimeError,
            "remediation concurrency contradicts Gem concurrency",
        ):
            MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")

    def test_null_capacity_evidence_fails_closed_with_typed_contract_error(self):
        receipt = valid_capacity_receipt(1)
        receipt["signals"]["concurrencyEvidence"] = None

        with self.assertRaisesRegex(
            RuntimeError,
            "capacity evidence signal acceptance is not boolean",
        ):
            MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")

    def test_stale_capacity_blocks_autonomous_draft_remote_mutation(self):
        draft = self._open_pr(
            3, mergeable_state="clean", created_at="2026-08-28T20:02:00Z"
        )
        draft["draft"] = True
        draft["head"]["ref"] = "symphony/JOV-9999-stale-capacity"

        with (
            mock.patch.object(
                MODULE,
                "work_mutation_blocker",
                return_value="remediation_push_gate_green",
            ),
            mock.patch.object(MODULE, "run") as run,
        ):
            result = MODULE.ready_autonomous_draft(draft)

        self.assertEqual(result["result"], "skipped")
        self.assertEqual(result["reason"], "remediation_push_gate_green")
        run.assert_not_called()

    def test_exact_head_lease_allows_only_one_cross_process_writer(self):
        pr = {
            "number": 42,
            "head": {
                "ref": "codex/fix",
                "sha": "a" * 40,
                "repo": {"full_name": "JovieInc/Jovie", "fork": False},
            },
        }
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            MODULE, "STATE", pathlib.Path(tmp)
        ):
            first = MODULE.acquire_pr_lease(pr)
            self.assertIsNotNone(first)
            self.assertIsNone(MODULE.acquire_pr_lease(pr))
            first.seek(0)
            lease_document = json.loads(first.read())
            self.assertEqual(lease_document["repo"], MODULE.REPO)
            self.assertEqual(lease_document["pr"], 42)
            self.assertEqual(lease_document["expectedHead"], "a" * 40)
            MODULE.release_pr_lease(first)
            replacement = MODULE.acquire_pr_lease(pr)
            self.assertIsNotNone(replacement)
            MODULE.release_pr_lease(replacement)

    def test_lease_rejects_non_exact_head_before_creating_state(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            MODULE, "STATE", pathlib.Path(tmp)
        ):
            for head in ("short", "A" * 40, "z" * 40):
                with self.subTest(head=head), self.assertRaises(ValueError):
                    MODULE.acquire_pr_lease({"number": 42, "head": {"sha": head}})
            self.assertFalse((pathlib.Path(tmp) / "leases").exists())

    def test_fleet_hold_does_not_block_exact_head_branch_refresh(self):
        pr = {
            "number": 42,
            "head": {
                "ref": "codex/fix",
                "sha": "a" * 40,
                "repo": {"full_name": "JovieInc/Jovie", "fork": False},
            },
            "base": {"ref": "main"},
            "draft": False,
            "labels": [],
            "mergeable_state": "behind",
            "priority_class": "existing_pr_remediation",
        }
        gate = {
            "state": "AMBER",
            "remediationAdmission": {"allowed": True, "localAllowed": True, "pushAllowed": True},
            "promotionAdmission": {"allowed": False},
        }
        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch.object(MODULE, "STATE", pathlib.Path(tmp)),
                mock.patch.object(MODULE, "evaluate_remediation_gate", return_value=gate),
                mock.patch.object(MODULE, "gh_json", return_value=pr),
                mock.patch.object(MODULE, "run", return_value='{"message":"Updating pull request branch"}') as run,
            ):
                MODULE.WORK_GATE_CACHE.update(checked_at=0.0, blocker="fleet_gate_not_checked")
                result = MODULE.update_one(pr)

        self.assertEqual(result["action"], "api_update_branch")
        self.assertEqual(result["result"], "ok")
        self.assertIn("expected_head_sha=" + "a" * 40, run.call_args.args)

    def test_red_gate_keeps_local_diagnosis_but_blocks_remote_refresh(self):
        pr = {
            "number": 42,
            "head": {
                "ref": "codex/fix",
                "sha": "a" * 40,
                "repo": {"full_name": "JovieInc/Jovie", "fork": False},
            },
            "mergeable_state": "behind",
            "priority_class": "existing_pr_remediation",
        }
        gate = {
            "state": "RED",
            "remediationAdmission": {"allowed": True, "localAllowed": True, "pushAllowed": False},
            "promotionAdmission": {"allowed": False},
        }
        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch.object(MODULE, "STATE", pathlib.Path(tmp)),
                mock.patch.object(MODULE, "evaluate_remediation_gate", return_value=gate),
                mock.patch.object(MODULE, "run") as run,
            ):
                MODULE.WORK_GATE_CACHE.update(checked_at=0.0, blocker="fleet_gate_not_checked")
                result = MODULE.update_one(pr)

        self.assertEqual(result["action"], "work_admission_blocked")
        self.assertEqual(result["reason"], "remediation_push_gate_red")
        run.assert_not_called()

    def _open_pr(self, number: int, *, mergeable_state: str, created_at: str):
        return {
            "number": number,
            "created_at": created_at,
            "title": f"pr-{number}",
            "body": "",
            "draft": False,
            "labels": [],
            "mergeable_state": mergeable_state,
            "base": {"ref": "main"},
            "head": {
                "ref": f"branch-{number}",
                "sha": f"{number:040x}",
                "repo": {"full_name": "JovieInc/Jovie", "fork": False},
            },
            "maintainer_can_modify": True,
            "changed_files": [],
        }

    def test_dirty_skip_only_heads_do_not_consume_drain_capacity(self):
        """Live Gem selected oldest dirty PRs, skipped them, and never touched
        behind heads. Capacity must go to PRs drain can actually refresh.
        """
        dirty = [
            self._open_pr(n, mergeable_state="dirty", created_at=f"2026-08-17T09:0{n}:00Z")
            for n in range(1, 6)
        ]
        behind = self._open_pr(
            99, mergeable_state="behind", created_at="2026-08-19T12:00:00Z"
        )
        selected = MODULE.select_prs(
            dirty + [behind], main_green=True, worker_capacity=4
        )
        self.assertEqual([pr["number"] for pr in selected], [99])

    def test_dirty_conflict_backlog_does_not_pause_new_issue_intake(self):
        dirty = [
            self._open_pr(n, mergeable_state="dirty", created_at=f"2026-08-17T09:0{n}:00Z")
            for n in range(1, 11)
        ]
        count = MODULE.intake_backlog_count(dirty)
        self.assertEqual(count, 0)
        decision = MODULE.policy_decision(
            main_green=True, queue_count=count, target=5, worker_capacity=4
        )
        self.assertTrue(decision["new_issue_intake"])

    def test_ready_autonomous_draft_marks_grok_jov_drafts(self):
        pr = self._open_pr(16211, mergeable_state="unstable", created_at="2026-08-19T18:59:08Z")
        pr["draft"] = True
        pr["head"]["ref"] = "grok/JOV-4894-fix"
        with (
            mock.patch.object(MODULE, "work_mutation_blocker", return_value=None),
            mock.patch.object(MODULE, "gh_json", return_value=pr),
            mock.patch.object(MODULE, "run", return_value="") as run,
        ):
            with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
                MODULE, "STATE", pathlib.Path(tmp)
            ):
                result = MODULE.ready_autonomous_draft(pr)
        self.assertEqual(result["result"], "ok")
        self.assertEqual(run.call_args.args[:3], ("gh", "pr", "ready"))
        self.assertEqual(run.call_args.args[3], "16211")

    def test_ready_autonomous_draft_rechecks_gate_and_exact_head_before_mutation(self):
        pr = self._open_pr(16211, mergeable_state="unstable", created_at="2026-08-19T18:59:08Z")
        pr["draft"] = True
        pr["head"]["ref"] = "grok/JOV-4894-fix"
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            MODULE, "STATE", pathlib.Path(tmp)
        ):
            with (
                mock.patch.object(
                    MODULE,
                    "work_mutation_blocker",
                    return_value="remediation_push_gate_amber",
                ) as gate,
                mock.patch.object(MODULE, "run") as run,
            ):
                blocked = MODULE.ready_autonomous_draft(pr)
            self.assertEqual(blocked["reason"], "remediation_push_gate_amber")
            gate.assert_called_once_with(max_age=0)
            run.assert_not_called()

            with (
                mock.patch.object(MODULE, "work_mutation_blocker", return_value=None),
                mock.patch.object(
                    MODULE,
                    "gh_json",
                    return_value={
                        **pr,
                        "head": {**pr["head"], "sha": "b" * 40},
                    },
                ),
                mock.patch.object(MODULE, "run") as run,
            ):
                changed = MODULE.ready_autonomous_draft(pr)
            self.assertEqual(changed["reason"], "expected_head_changed_fail_closed")
            run.assert_not_called()

    def test_ready_draft_rechecks_protected_labels_under_lease(self):
        pr = self._open_pr(
            16212,
            mergeable_state="clean",
            created_at="2026-08-19T19:00:00Z",
        )
        pr["draft"] = True
        pr["head"]["ref"] = "symphony/JOV-9998-fix"
        current = json.loads(json.dumps(pr))
        current["labels"] = [{"name": "human-review-required"}]
        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch.object(MODULE, "STATE", pathlib.Path(tmp)),
                mock.patch.object(
                    MODULE, "work_mutation_blocker", return_value=None
                ),
                mock.patch.object(MODULE, "gh_json", return_value=current),
                mock.patch.object(MODULE, "run") as run,
            ):
                result = MODULE.ready_autonomous_draft(pr)
        self.assertEqual(result["reason"], "protected_human")
        run.assert_not_called()

    def test_update_branch_rechecks_protected_labels_under_lease(self):
        pr = self._open_pr(
            16213,
            mergeable_state="behind",
            created_at="2026-08-19T19:01:00Z",
        )
        current = json.loads(json.dumps(pr))
        current["labels"] = [{"name": "hold"}]
        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch.object(MODULE, "STATE", pathlib.Path(tmp)),
                mock.patch.object(
                    MODULE, "work_mutation_blocker", return_value=None
                ),
                mock.patch.object(MODULE, "gh_json", return_value=current),
                mock.patch.object(MODULE, "run") as run,
            ):
                result = MODULE.update_one(pr)
        self.assertEqual(result["reason"], "protected_human")
        run.assert_not_called()

    def test_ready_autonomous_draft_ignores_unrelated_drafts(self):
        pr = self._open_pr(1, mergeable_state="clean", created_at="2026-08-19T18:00:00Z")
        pr["draft"] = True
        pr["head"]["ref"] = "feat/manual"
        with mock.patch.object(MODULE, "run") as run:
            result = MODULE.ready_autonomous_draft(pr)
        self.assertEqual(result["result"], "skipped")
        self.assertEqual(result["reason"], "not_autonomous_draft")
        run.assert_not_called()

    def test_ready_autonomous_draft_skips_big_pr_and_dirty_heads(self):
        big = self._open_pr(15913, mergeable_state="unstable", created_at="2026-08-13T15:12:46Z")
        big["draft"] = True
        big["head"]["ref"] = "symphony/JOV-5041-fix"
        big["labels"] = [{"name": "big-pr"}]
        dirty = self._open_pr(16187, mergeable_state="dirty", created_at="2026-08-18T19:38:53Z")
        dirty["draft"] = True
        dirty["head"]["ref"] = "grok/JOV-5041-fix"
        with mock.patch.object(MODULE, "run") as run:
            self.assertEqual(MODULE.ready_autonomous_draft(big)["reason"], "too_large_for_queue")
            self.assertEqual(MODULE.ready_autonomous_draft(dirty)["reason"], "conflicting")
        run.assert_not_called()

    def test_protected_and_external_prs_are_observe_only(self):
        for label in (
            "hold",
            "no-auto",
            "human-review-required",
            "needs-human",
            "needs:human",
            "blocked",
            "no-symphony",
        ):
            with self.subTest(label=label):
                pr = self._open_pr(
                    17000,
                    mergeable_state="behind",
                    created_at="2026-09-04T12:00:00Z",
                )
                pr["labels"] = [{"name": label}]
                self.assertEqual(MODULE.mutation_disposition(pr), "protected_human")
                with mock.patch.object(MODULE, "run") as run:
                    result = MODULE.update_one(pr)
                self.assertEqual(result["reason"], "protected_human")
                run.assert_not_called()

        external = self._open_pr(
            17001,
            mergeable_state="behind",
            created_at="2026-09-04T12:01:00Z",
        )
        external["head"]["repo"] = {"full_name": "outside/contributor", "fork": True}
        self.assertEqual(MODULE.mutation_disposition(external), "protected_external")
        with mock.patch.object(MODULE, "run") as run:
            result = MODULE.update_one(external)
        self.assertEqual(result["reason"], "protected_external")
        run.assert_not_called()

    def test_ready_and_update_recheck_each_human_stop_label_under_lease(self):
        for label in ("needs-human", "needs:human", "blocked"):
            with self.subTest(label=label):
                ready = self._open_pr(
                    17002,
                    mergeable_state="clean",
                    created_at="2026-09-04T12:02:00Z",
                )
                ready["draft"] = True
                ready["head"]["ref"] = "symphony/JOV-17002-fix"
                update = self._open_pr(
                    17003,
                    mergeable_state="behind",
                    created_at="2026-09-04T12:03:00Z",
                )
                for original, operation in (
                    (ready, MODULE.ready_autonomous_draft),
                    (update, MODULE.update_one),
                ):
                    current = json.loads(json.dumps(original))
                    current["labels"] = [{"name": label}]
                    with tempfile.TemporaryDirectory() as tmp:
                        with (
                            mock.patch.object(MODULE, "STATE", pathlib.Path(tmp)),
                            mock.patch.object(
                                MODULE, "work_mutation_blocker", return_value=None
                            ),
                            mock.patch.object(MODULE, "gh_json", return_value=current),
                            mock.patch.object(MODULE, "run") as run,
                        ):
                            result = operation(original)
                    self.assertEqual(result["reason"], "protected_human")
                    run.assert_not_called()

    def test_ready_draft_protection_and_total_mutation_budget(self):
        drafts = []
        for number in range(17010, 17015):
            pr = self._open_pr(
                number,
                mergeable_state="clean",
                created_at=f"2026-09-04T12:{number - 17010:02d}:00Z",
            )
            pr["draft"] = True
            pr["head"]["ref"] = f"symphony/JOV-{number}-fix"
            drafts.append(pr)
        drafts[0]["labels"] = [{"name": "hold"}]
        selected = MODULE.select_ready_drafts(
            drafts, worker_capacity=3, selected_count=1
        )
        self.assertEqual([pr["number"] for pr in selected], [17011, 17012])

        fork = drafts[1]
        fork["head"]["repo"] = {"full_name": "itstimwhite/Jovie", "fork": True}
        fork["maintainer_can_modify"] = False
        with mock.patch.object(MODULE, "run") as run:
            result = MODULE.ready_autonomous_draft(fork)
        self.assertEqual(result["reason"], "protected_external")
        run.assert_not_called()

        already_ready = drafts[2]
        already_ready["draft"] = False
        with mock.patch.object(MODULE, "run") as run:
            result = MODULE.ready_autonomous_draft(already_ready)
        self.assertEqual(result["reason"], "not_autonomous_draft")
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
