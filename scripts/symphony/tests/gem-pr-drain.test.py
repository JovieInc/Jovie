#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import pathlib
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/gem-pr-drain.py"
SPEC = importlib.util.spec_from_file_location("gem_pr_drain", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

GATE_SOURCE = ROOT / "scripts/symphony/gem-priority-gate.py"
GATE_SPEC = importlib.util.spec_from_file_location("gem_gate_for_drain", GATE_SOURCE)
if GATE_SPEC is None or GATE_SPEC.loader is None:
    raise RuntimeError(f"could not load {GATE_SOURCE}")
GATE_MODULE = importlib.util.module_from_spec(GATE_SPEC)
GATE_SPEC.loader.exec_module(GATE_MODULE)


class JovieDrainRetirementTests(unittest.TestCase):
    OTHER_REPOS = {
        "JovieInc/LogYourBody", "JovieInc/ovie", "JovieInc/BubblegumFactory",
        "JovieInc/gbrain", "JovieInc/retouching", "itstimwhite/gbrain",
    }

    def test_cycle_selects_six_other_repositories_without_dispatching_jovie(self):
        cycle_path = ROOT / "scripts/symphony/gem-repo-drain-cycle.py"
        spec = importlib.util.spec_from_file_location("retired_jovie_cycle", cycle_path)
        cycle = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cycle)
        with mock.patch.object(cycle.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run, \
             mock.patch.object(cycle.sys, "argv", [str(cycle_path)]), redirect_stdout(io.StringIO()):
            self.assertEqual(cycle.main(), 0)
        self.assertEqual(len(run.call_args_list), 6)
        self.assertEqual(
            {call.kwargs["env"]["GEM_PR_DRAIN_REPO"] for call in run.call_args_list},
            self.OTHER_REPOS,
        )
        from gem_repo_registry import by_github
        jovie = by_github("JovieInc/Jovie")
        self.assertFalse(jovie.pr_drain)
        self.assertTrue(jovie.health)
        self.assertTrue(jovie.issue_intake)

    def test_direct_jovie_writer_refuses_before_any_external_tool(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            calls = root / "tool-calls"
            for name in ("gh", "node", "curl", "git"):
                tool = root / name
                tool.write_text(f'#!/bin/sh\nprintf invoked >> "{calls}"\nexit 99\n')
                tool.chmod(0o755)
            result = subprocess.run(
                [sys.executable, str(SOURCE)], cwd=ROOT, capture_output=True, text=True,
                env={**os.environ, "PATH": str(root), "GEM_WORKSPACE": str(root),
                     "GEM_PR_DRAIN_REPO": "JovieInc/Jovie",
                     "GEM_REPO_REGISTRY": str(ROOT / "scripts/symphony/config/gem-repo-registry.json")},
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertFalse(calls.exists())
            receipt = json.loads(result.stdout)
            self.assertIn("PR drain disabled by Gem repo policy for JovieInc/Jovie", receipt["errors"][0])
            self.assertEqual(receipt["status"], "error")
            artifacts = list(root.glob("state/gem-pr-drain/**/latest.json"))
            self.assertEqual(len(artifacts), 1)
            self.assertEqual(json.loads(artifacts[0].read_text()), receipt)


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
        },
        observed_at,
    )


class JovieOwnershipTests(unittest.TestCase):
    def test_legacy_human_and_taste_labels_never_exclude_pr_remediation(self):
        for label in (
            "needs-human",
            "needs-human-review",
            "human-review-required",
            "needs:taste",
            "needs-human-taste",
            "taste",
            "no-auto",
        ):
            candidate = self._open_pr(
                42, mergeable_state="behind", created_at="2026-08-28T20:00:00Z"
            )
            candidate["labels"] = [{"name": label}]
            with self.subTest(label=label):
                self.assertFalse(MODULE.excluded(candidate))
                self.assertEqual(
                    MODULE.priority_class(candidate), "existing_pr_remediation"
                )

    def test_machine_holds_still_exclude_pr_remediation(self):
        for label in ("hold", "gated"):
            candidate = self._open_pr(
                43, mergeable_state="behind", created_at="2026-08-28T20:00:00Z"
            )
            candidate["labels"] = [{"name": label}]
            with self.subTest(label=label):
                self.assertTrue(MODULE.excluded(candidate))
                self.assertEqual(MODULE.priority_class(candidate), "machine_hold")

    def test_jovie_and_legacy_alias_can_be_stabilized_when_allowlisted(self):
        for repo in ("JovieInc/Jovie", "itstimwhite/Jovie"):
            self.assertTrue(MODULE.is_jovie_repository(repo))
            self.assertTrue(MODULE.repo_drain_enabled(repo, True))

    def test_other_repositories_can_still_follow_their_registry_policy(self):
        self.assertFalse(MODULE.repo_drain_enabled("other/repo", False))
        self.assertTrue(MODULE.repo_drain_enabled("other/repo", True))

    def test_stale_capacity_receipt_closes_remote_drain(self):
        """Missing or stale useful-turn evidence cannot authorize mutation."""
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
        update_one.assert_not_called()
        remote.assert_not_called()

    def test_closed_capacity_contract_rejects_mismatched_mutation(self):
        receipt = stale_capacity_receipt()
        validated = MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")
        self.assertEqual(MODULE.effective_capacity(8, validated), 0)
        self.assertEqual(validated["concurrency"]["gem"]["runtimeFloor"], 1)
        for field, value, expected in (
            ("maxConcurrent", 2, "remediation concurrency contradicts Gem concurrency"),
        ):
            with self.subTest(field=field, value=value):
                broken = json.loads(json.dumps(receipt))
                broken["remediationAdmission"][field] = value
                with self.assertRaisesRegex(RuntimeError, expected):
                    MODULE.validate_gate_result(0, json.dumps(broken), "remediation")

    def test_failed_gate_receipt_is_valid_local_only_capacity_remediation(self):
        receipt = GATE_MODULE.failed_evaluation_receipt(ValueError("capacity unavailable"))
        validated = MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")
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

    def test_unproven_capacity_authenticates_no_remote_writer(self):
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
        self.assertEqual(document["capacity"], 0)
        self.assertEqual(document["selected"], [])
        update_one.assert_not_called()

    def test_push_blocked_remediation_capacity_is_zero(self):
        gate = {"remediationAdmission": {"pushAllowed": False, "maxConcurrent": 1}}
        self.assertEqual(MODULE.effective_capacity(8, gate), 0)

    def test_closed_receipt_accepts_push_disabled_outside_red(self):
        receipt = stale_capacity_receipt()
        receipt["remediationAdmission"]["pushAllowed"] = False
        receipt["remediationAdmission"]["activities"] = [
            activity
            for activity in receipt["remediationAdmission"]["activities"]
            if activity != "expected-head-pr-update"
        ]

        validated = MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")
        self.assertEqual(MODULE.effective_capacity(8, validated), 0)

    def test_floor_receipt_rejects_remediation_above_gem_concurrency(self):
        receipt = stale_capacity_receipt()
        receipt["remediationAdmission"]["maxConcurrent"] = 2

        with self.assertRaisesRegex(
            RuntimeError,
            "remediation concurrency contradicts Gem concurrency",
        ):
            MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")

    def test_null_capacity_evidence_fails_closed_with_typed_contract_error(self):
        receipt = stale_capacity_receipt()
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
            "head": {"ref": "codex/fix", "sha": "a" * 40},
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
            "head": {"ref": "codex/fix", "sha": "a" * 40},
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
            "head": {"ref": "codex/fix", "sha": "a" * 40},
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
            "head": {"ref": f"branch-{number}", "sha": f"{number:040x}"},
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
            mock.patch.object(MODULE, "run", side_effect=[pr["head"]["sha"], ""]) as run,
        ):
            with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
                MODULE, "STATE", pathlib.Path(tmp)
            ):
                result = MODULE.ready_autonomous_draft(pr)
        self.assertEqual(result["result"], "ok")
        self.assertEqual(run.call_args_list[0].args[:3], ("gh", "api", "repos/JovieInc/Jovie/pulls/16211"))
        self.assertEqual(run.call_args_list[1].args[:3], ("gh", "pr", "ready"))
        self.assertEqual(run.call_args_list[1].args[3], "16211")

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
                mock.patch.object(MODULE, "run", return_value="b" * 40) as run,
            ):
                changed = MODULE.ready_autonomous_draft(pr)
            self.assertEqual(changed["reason"], "expected_head_changed_fail_closed")
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[:3], ("gh", "api", "repos/JovieInc/Jovie/pulls/16211"))

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


if __name__ == "__main__":
    unittest.main()
