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


def stale_capacity_receipt():
    observed_at = GATE_MODULE.isoformat(GATE_MODULE.utc_now())
    main_sha = "a" * 40
    return GATE_MODULE.evaluate(
        {
            "main": {"status": "green", "sha": main_sha},
            "production": {"status": "green", "deployedSha": main_sha},
            "controller": {"status": "green"},
            "integrity": {"status": "clear"},
            "queue": {"status": "known", "eligiblePrs": 2, "greenReadyPrs": 2, "target": 15},
            "closureHealth": {
                "schema": "jovie-closure-health/v1", "status": "healthy",
                "authority": "Summer", "newIssueIntakeAllowed": True,
                "promotionContinues": True, "remediationContinues": True, "reasons": [],
            },
            "independentReview": {
                "schema": "jovie-independent-review/v1", "status": "passed",
                "authority": "Gem", "reviewer": "Gem", "reviewId": "stale-capacity",
                "headSha": main_sha, "scope": "exact-main-head", "observedAt": observed_at,
                "accepted": True, "reason": "fresh-exact-head-independent-review",
            },
            "concurrencyEvidence": {
                "schema": "gem-concurrency-evidence/v1", "target": 4, "approved": True,
                "cleanRuns": 1, "severeIncidents": 0, "observedAt": observed_at,
                "accepted": False, "error": "capacity-evidence-stale",
            },
        },
        observed_at,
    )


class JovieOwnershipTests(unittest.TestCase):
    def test_jovie_and_legacy_alias_can_be_stabilized_when_allowlisted(self):
        for repo in ("JovieInc/Jovie", "itstimwhite/Jovie"):
            self.assertTrue(MODULE.is_jovie_repository(repo))
            self.assertTrue(MODULE.repo_drain_enabled(repo, True))

    def test_other_repositories_can_still_follow_their_registry_policy(self):
        self.assertFalse(MODULE.repo_drain_enabled("other/repo", False))
        self.assertTrue(MODULE.repo_drain_enabled("other/repo", True))

    def test_stale_capacity_exits_cleanly_before_auth_inventory_or_mutation(self):
        receipt = stale_capacity_receipt()
        with tempfile.TemporaryDirectory() as tmp:
            state = pathlib.Path(tmp)
            stdout = io.StringIO()
            with (
                mock.patch.object(MODULE, "STATE", state),
                mock.patch.object(MODULE, "ARTIFACT", state / "latest.json"),
                mock.patch.object(MODULE, "POLICY_ENABLED", True),
                mock.patch.object(MODULE, "evaluate_remediation_gate", return_value=receipt),
                mock.patch.object(MODULE, "capacity", return_value=8),
                mock.patch.object(MODULE, "auth_status") as auth,
                mock.patch.object(MODULE, "inventory") as inventory,
                mock.patch.object(MODULE, "run") as remote,
                mock.patch.object(MODULE.sys, "argv", [str(SOURCE)]),
                redirect_stdout(stdout),
            ):
                exit_code = MODULE.main()
        document = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0, document)
        self.assertEqual(document["capacity"], 0)
        self.assertEqual(document["selected"], [])
        self.assertEqual(document["intake"], "blocked_missing_capacity_evidence")
        auth.assert_not_called()
        inventory.assert_not_called()
        remote.assert_not_called()

    def test_stale_capacity_contract_rejects_remote_or_multiple_mutation(self):
        receipt = stale_capacity_receipt()
        validated = MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")
        self.assertEqual(MODULE.effective_capacity(8, validated), 0)
        self.assertEqual(validated["concurrency"]["gem"]["runtimeFloor"], 1)
        for field, value, expected in (
            ("pushAllowed", True, "remote remediation must require"),
            ("maxConcurrent", 2, "stale capacity must block remote remediation"),
        ):
            with self.subTest(field=field):
                broken = json.loads(json.dumps(receipt))
                broken["remediationAdmission"][field] = value
                if field == "pushAllowed":
                    broken["remediationAdmission"]["activities"].append("expected-head-pr-update")
                with self.assertRaisesRegex(RuntimeError, expected):
                    MODULE.validate_gate_result(0, json.dumps(broken), "remediation")

    def test_failed_gate_receipt_is_valid_zero_capacity_remediation(self):
        receipt = GATE_MODULE.failed_evaluation_receipt(ValueError("capacity unavailable"))
        validated = MODULE.validate_gate_result(0, json.dumps(receipt), "remediation")
        self.assertEqual(validated["state"], "RED")
        self.assertEqual(validated["remediationAdmission"]["maxConcurrent"], 0)

    def test_typed_remediation_capacity_caps_host_parallelism(self):
        gate = {"remediationAdmission": {"maxConcurrent": 1}}
        self.assertEqual(MODULE.effective_capacity(4, gate), 1)
        self.assertEqual(MODULE.effective_capacity(1, gate), 1)
        self.assertEqual(
            MODULE.effective_capacity(
                4, {"remediationAdmission": {"maxConcurrent": 0}}
            ),
            0,
        )
        for maximum in (None, -1, True, 1.5):
            with self.subTest(maximum=maximum), self.assertRaises(ValueError):
                MODULE.effective_capacity(
                    4, {"remediationAdmission": {"maxConcurrent": maximum}}
                )

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
        with mock.patch.object(MODULE, "run", return_value="") as run:
            result = MODULE.ready_autonomous_draft(pr)
        self.assertEqual(result["result"], "ok")
        self.assertEqual(run.call_args.args[:3], ("gh", "pr", "ready"))
        self.assertEqual(run.call_args.args[3], "16211")

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
