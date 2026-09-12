#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import subprocess

import proof_fixtures as F
import gem_gate_contract as C
import symphony_accepted_completion as A
import symphony_proof_context as T

RESULT_LEASE_KEYS = ("identifier", "issueRevision", "repository", "provider", "model", "modelId",
                     "executorPath", "executorSha256", "executorProfile", "profile", "authStatePath",
                     "authStateSha256", "authPoolIdentity", "leaseIdentity")


class AcceptedCompletionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.now = datetime.now(timezone.utc); self.issue = "JOV-999"
        self.executor = self.root / "cursor-agent"
        self.executor.write_text("#!/bin/sh\nexit 0\n"); self.executor.chmod(0o700)
        self.auth_state = self.root / "cursor-auth.json"; self.auth_state.write_text('{"account":"opaque-test-seat"}')
        self.receipt_dir = self.root / "receipts"; self.receipt_dir.mkdir()
        self.result_dir = self.receipt_dir / "completions"; self.result_dir.mkdir()
        self.lease, self.result, self.result_path, self.pr = self.add_completion(
            issue=self.issue, issue_revision="issue-revision-1", lease_identity="c" * 64,
            base_head="a" * 40, head="d" * 40, pr_number=99, observed_at=self.now,
        )
        self.lease_path = self.receipt_dir / f"{self.issue}.json"; self.profile = self.lease["profile"]; self.executor_profile = self.lease["executorProfile"]
        self.rules = [{"type": "required_status_checks", "parameters": {"required_status_checks": [
            {"context": "PR Ready", "integration_id": 123}, {"context": "Migration Guard"}]}}]
        self.context = self.root / "proof-context.json"
        self.attestations = self.root / "attestations"
        self.ledger = self.root / "useful-turn-proofs.jsonl"
        self.capacity = self.root / "concurrency.json"
        self.provider_capacity = self.root / "provider-capacity.json"
        self.service = self.root / "service.json"
        self.service.write_text(json.dumps({"schema": "gem-service-attestation/v1",
            "sourceRevision": F.RUNTIME["sourceRevision"], "active": True, "healthy": True,
            "service": C.V2_OFFICIAL_RUNTIME_SERVICE, "observedAt": self.now.isoformat(),
            "runtime": {"generation": F.GENERATION, "executableSha256": T.digest(F.RUNTIME_BINARY),
                        "workflowPath": str(F.SOURCE / "scripts/symphony/WORKFLOW.md")},
            **{name: {"matches": True} for name in ("unit", "policy", "gate", "closureHealth")},
            "workflow": {"matches": True, "installedSha256": T.digest(F.SOURCE / "scripts/symphony/WORKFLOW.md")}}))
    def add_completion(self, *, issue, issue_revision, lease_identity, base_head, head,
                       pr_number, observed_at, auth_state=None):
        auth_state = auth_state or self.auth_state
        model = "cursor-grok-4.6-high"
        profile = T.provider_pool_identity("cursor", model, self.executor, auth_state)
        lease = {
            "schema": "symphony-fallback-lease/v1", "observedAt": observed_at.isoformat(),
            "identifier": issue, "issueRevision": issue_revision, "baseRevision": base_head,
            "bundleRevision": "b" * 64, "unit": f"fallback-ship-{issue}-123456789012",
            "provider": "cursor", "model": model, "modelId": "cursor-grok-4.6",
            "repository": "JovieInc/Jovie", "executorPath": str(self.executor.resolve()),
            "executorSha256": T.digest(self.executor),
            "executorProfile": T.executor_identity("cursor", model, self.executor),
            "authStatePath": str(auth_state.resolve()), "authStateSha256": T.digest(auth_state),
            "authPoolIdentity": profile, "profile": profile, "leaseIdentity": lease_identity,
            "ownership": "isolated-implementation-only",
        }
        lease_path = self.receipt_dir / f"{issue}.json"
        lease_path.write_text(json.dumps(lease)); lease_path.chmod(0o600)
        result = {
            "schema": "symphony-fallback-result/v1", "observedAt": observed_at.isoformat(),
            **{key: lease[key] for key in RESULT_LEASE_KEYS},
            "selectedModel": model, "selectedProfile": profile,
            "leaseReceiptSha256": hashlib.sha256(lease_path.read_bytes()).hexdigest(),
            "executionBaseHead": base_head, "executionFinalHead": head, "headSha": head,
            "prNumber": pr_number, "executorRc": 0,
        }
        result["resultId"] = A._digest(result)
        result_path = self.result_dir / f"{issue}-{head}.json"
        result_path.write_text(json.dumps(result)); result_path.chmod(0o600)
        pr = {
            "state": "MERGED", "number": pr_number, "headRefOid": head,
            "mergedAt": observed_at.isoformat(), "title": f"fix: {issue}", "body": "",
            "statusCheckRollup": [
                {"__typename": "CheckRun", "name": "PR Ready", "conclusion": "SUCCESS",
                 "workflowName": "CI", "app": {"databaseId": 123, "slug": "github-actions"}},
                {"__typename": "StatusContext", "context": "Migration Guard", "state": "SUCCESS",
                 "creator": {"__typename": "Bot", "login": "jovie-bot"}},
            ],
        }
        return lease, result, result_path, pr
    def args(self):
        return A.parser().parse_args([
            "--receipt-dir", str(self.receipt_dir), "--result-dir", str(self.result_dir),
            "--source-root", str(F.SOURCE),
            "--binary", str(F.RUNTIME_BINARY), "--workflow", str(F.SOURCE / "scripts/symphony/WORKFLOW.md"),
            "--service-attestation", str(self.service), "--context", str(self.context),
            "--attestation-dir", str(self.attestations), "--ledger", str(self.ledger),
            "--capacity", str(self.capacity), "--provider-capacity", str(self.provider_capacity),
        ])
    def github(self, repository, pr_number):
        self.assertEqual((repository, pr_number), ("JovieInc/Jovie", 99))
        return self.pr, self.rules
    def assert_github_rejected(self, pr, rules=None, *, head="d" * 40, number=99):
        with self.assertRaises(ValueError):
            A.validate_github_outcome(pr, rules or self.rules, expected_issue=self.issue,
                                      expected_head=head, expected_pr=number, now=self.now)
    def test_merged_exact_head_completion_restores_capacity_and_replays_idempotently(self):
        first = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual((first["target"], first["approved"], first["accepted"][0]["state"]),
                         (1, True, "accepted"))
        proof = json.loads(self.ledger.read_text())
        self.assertEqual(proof["source"], {"repository": "JovieInc/Jovie", "pr": 99, "headSha": "d" * 40})
        self.assertEqual((proof["producer"], proof["ci"]["conclusion"], proof["lease"]["issueRevision"]),
                         (C.V2_ACCEPTED_COMPLETION_SOURCE, "SUCCESS", "issue-revision-1"))
        with mock.patch.dict(os.environ, {"SYMPHONY_PROOF_CONTEXT": str(self.context)}):
            self.assertTrue(T.validate_local_receipt(json.loads(self.capacity.read_text()), self.now)[0])
        second = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual(second["accepted"][0]["state"], "replayed")
        self.assertEqual(len(self.ledger.read_text().splitlines()), 1)
        provider = json.loads(self.provider_capacity.read_text())["providers"]["cursor"]
        self.assertEqual((provider["limit"], provider["usefulCompletions"]), (1, 1))
    def test_refresh_rejects_stale_future_missing_or_malformed_service_observation(self):
        service = json.loads(self.service.read_text())
        for observed in (None, "invalid", (self.now - timedelta(seconds=601)).isoformat(),
                         (self.now + timedelta(seconds=1)).isoformat()):
            with self.subTest(observed=observed):
                self.service.write_text(json.dumps({**service, "observedAt": observed}))
                self.context.write_bytes(b"existing context must survive")
                with self.assertRaisesRegex(ValueError, "service attestation"):
                    A.reconcile(self.args(), github=self.github, now=self.now)
                self.assertEqual(self.context.read_bytes(), b"existing context must survive")
                self.assertFalse(self.ledger.exists())
                self.assertFalse(self.capacity.exists())

    def test_refresh_preserves_service_observation_age_at_600_second_boundary(self):
        service = json.loads(self.service.read_text())
        observed = self.now - timedelta(seconds=600)
        service["observedAt"] = observed.isoformat()
        self.service.write_text(json.dumps(service))
        A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual(json.loads(self.context.read_text())["observedAt"], observed.isoformat())
        before = self.context.read_bytes()
        with self.assertRaisesRegex(ValueError, "service attestation"):
            A.reconcile(self.args(), github=self.github, now=self.now + timedelta(seconds=1))
        self.assertEqual(self.context.read_bytes(), before)

    def test_refresh_rejects_service_identity_or_runtime_changed_since_observation(self):
        service = json.loads(self.service.read_text())
        changes = [
            {"service": "retired.service"},
            {"runtime": None},
            *({"runtime": {**service["runtime"], key: value}} for key, value in (
                ("generation", "0" * 64), ("executableSha256", "0" * 64),
                ("workflowPath", str(self.root / "different-workflow.md")))),
            {"workflow": {"matches": True, "installedSha256": "0" * 64}},
        ]
        for change in changes:
            with self.subTest(change=change):
                self.service.write_text(json.dumps({**service, **change}))
                self.context.write_bytes(b"existing context must survive")
                with self.assertRaisesRegex(ValueError, "service attestation"):
                    A.reconcile(self.args(), github=self.github, now=self.now)
                self.assertEqual(self.context.read_bytes(), b"existing context must survive")
                self.assertFalse(self.ledger.exists())

    def test_required_ci_failure_never_writes_completion(self):
        self.pr["statusCheckRollup"][1]["state"] = "FAILURE"
        result = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual((result["target"], result["approved"]), (0, False))
        self.assertFalse(self.ledger.exists())
        self.assertEqual(list(self.attestations.glob("*.json")), [])
    def test_conflicting_duplicate_check_and_wrong_app_identity_are_rejected(self):
        conflicting = {**self.pr, "statusCheckRollup": [*self.pr["statusCheckRollup"],
            {"__typename": "CheckRun", "name": "PR Ready", "conclusion": "FAILURE",
             "workflowName": "CI", "app": {"databaseId": 123}}]}
        wrong_app = {**self.pr, "statusCheckRollup": [
            {**self.pr["statusCheckRollup"][0], "app": {"databaseId": 456}},
            self.pr["statusCheckRollup"][1]]}
        for invalid in (conflicting, wrong_app):
            self.assert_github_rejected(invalid)
        unpinned_rules = [{"type": "required_status_checks", "parameters": {"required_status_checks": [
            {"context": "PR Ready"}, {"context": "Migration Guard"}]}}]
        live_pr = {**self.pr, "statusCheckRollup": [
            {**self.pr["statusCheckRollup"][0], "app": {"databaseId": 15368, "slug": "github-actions"}},
            self.pr["statusCheckRollup"][1]]}
        accepted = A.validate_github_outcome(live_pr, unpinned_rules, expected_issue=self.issue,
                                             expected_head="d" * 40, expected_pr=99, now=self.now)
        self.assertEqual(accepted["requiredChecks"]["PR Ready@app:15368:github-actions"], "SUCCESS")
        self.assertEqual(accepted["requiredChecks"]["Migration Guard@status:Bot:jovie-bot"], "SUCCESS")
        for changed in (
            [{**live_pr["statusCheckRollup"][0], "app": None}, live_pr["statusCheckRollup"][1]],
            [{**live_pr["statusCheckRollup"][0], "app": {"databaseId": 999, "slug": "github-actions"}},
             live_pr["statusCheckRollup"][1]],
            [live_pr["statusCheckRollup"][0],
             {**live_pr["statusCheckRollup"][1], "creator": {"__typename": "User", "login": "jovie-bot"}}],
        ):
            with self.subTest(changed=changed):
                self.assert_github_rejected({**live_pr, "statusCheckRollup": changed}, unpinned_rules)
    def test_exact_result_requires_current_lease_pr_head_and_executor_work(self):
        for change in (
            {"leaseReceiptSha256": "f" * 64},
            {"executionBaseHead": "d" * 40},
            {"executionFinalHead": "e" * 40},
            {"provider": "grok"},
        ):
            with self.subTest(change=change):
                result = {**self.result, **change}
                result.pop("resultId", None)
                result["resultId"] = A._digest(result)
                path = self.result_dir / "candidate.json"
                path.write_text(json.dumps(result))
                path.chmod(0o600)
                with self.assertRaises(ValueError):
                    A.validate_result(result, path, self.receipt_dir)
        self.assert_github_rejected(self.pr, head="e" * 40)
        self.assert_github_rejected(self.pr, number=100)
    def test_nonmerged_wrong_issue_and_missing_ci_workflow_are_rejected(self):
        for change in (
            {"state": "OPEN"},
            {"title": "unrelated", "body": ""},
            {"title": f"not the issue {self.issue}0", "body": ""},
            {"title": f"not the issue {self.issue}-followup", "body": ""},
            {"statusCheckRollup": [{"__typename": "StatusContext", "context": "PR Ready", "state": "SUCCESS"},
                                    {"__typename": "StatusContext", "context": "Migration Guard", "state": "SUCCESS"}]},
        ):
            with self.subTest(change=change):
                self.assert_github_rejected({**self.pr, **change})
    def test_github_inventory_reads_one_exact_pr_with_check_app_identity(self):
        calls = []
        def runner(argv, **kwargs):
            calls.append(argv)
            if argv[:3] == ["gh", "api", "graphql"]:
                action = {**self.pr["statusCheckRollup"][0], "checkSuite": {
                    "app": self.pr["statusCheckRollup"][0]["app"],
                    "workflowRun": {"workflow": {"name": "CI"}}}}
                contexts = {"nodes": [action, self.pr["statusCheckRollup"][1]],
                            "pageInfo": {"hasNextPage": False, "endCursor": None}}
                commit = {"oid": self.pr["headRefOid"], "statusCheckRollup": {"contexts": contexts}}
                pull = {**self.pr, "state": "CLOSED", "merged": True,
                        "commits": {"nodes": [{"commit": commit}]}}
                payload = {"data": {"repository": {"pullRequest": pull}}}
            else:
                payload = self.rules
            return subprocess.CompletedProcess(argv, 0, json.dumps(payload), "")
        pr, rules = A.github_outcome("JovieInc/Jovie", 99, runner=runner)
        self.assertEqual((pr["state"], pr["number"], rules), ("MERGED", 99, self.rules))
        self.assertEqual(pr["statusCheckRollup"][0]["app"]["databaseId"], 123)
        self.assertIn("number=99", calls[0])

    def test_github_inventory_rejects_partial_graphql_errors(self):
        def runner(argv, **kwargs):
            return subprocess.CompletedProcess(
                argv, 0, json.dumps({"errors": [{"message": "app unreadable"}], "data": {}}), "",
            )
        with self.assertRaisesRegex(ValueError, "inventory unavailable"):
            A.github_outcome("JovieInc/Jovie", 99, runner=runner)

    def test_executor_substitution_and_hermes_are_rejected(self):
        original = self.executor.read_text()
        self.executor.write_text(original + "# changed\n")
        with self.assertRaisesRegex(ValueError, "identity"):
            A.validate_lease(self.lease, self.lease_path)
        self.executor.write_text(original)
        hermes = self.root / "hermes"
        hermes.write_text(original)
        hermes.chmod(0o700)
        lease = {**self.lease, "executorPath": str(hermes), "executorSha256": T.digest(hermes),
                 "profile": T.executor_identity("cursor", self.lease["model"], hermes)}
        with self.assertRaisesRegex(ValueError, "forbidden"):
            A.validate_lease(lease, self.lease_path)
        original_auth = self.auth_state.read_text()
        self.auth_state.write_text('{"account":"substituted"}')
        with self.assertRaisesRegex(ValueError, "identity"):
            A.validate_lease(self.lease, self.lease_path)
        self.auth_state.write_text(original_auth)

    def test_missing_or_mismatched_lease_identity_is_rejected(self):
        for change in ({"leaseIdentity": ""}, {"profile": "f" * 64}, {"repository": "JovieInc/LogYourBody"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                A.validate_lease({**self.lease, **change}, self.lease_path)

    def test_same_completion_id_conflict_is_refused(self):
        A.reconcile(self.args(), github=self.github, now=self.now)
        proof = json.loads(self.ledger.read_text())
        target = self.attestations / f"{proof['probeId']}.json"
        changed = {**proof, "outputBytes": proof["outputBytes"] + 1}
        target.write_text(json.dumps(changed))
        target.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "conflicts"):
            A.persist_proof(proof, attestation_dir=self.attestations, ledger=self.ledger)

    def test_capacity_failure_cannot_publish_global_completion_proof(self):
        with mock.patch.object(A.provider_capacity, "write_state", side_effect=OSError("rejected")):
            result = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual((result["target"], result["approved"], result["accepted"]), (0, False, []))
        self.assertEqual((self.provider_capacity.exists(), self.ledger.exists()), (False, False))
        self.assertEqual(list(self.attestations.glob("*.json")), [])

    def test_each_partial_proof_write_rolls_back_provider_and_global_evidence(self):
        before = A.provider_capacity.record_observation(
            self.provider_capacity, provider="cursor", kind="quota_pressure",
            event_id="prior-pressure", observed_at=self.now.isoformat(),
        )
        def fail_at(stage):
            def failure(proof, *, attestation_dir=None, ledger=None, **kwargs):
                if stage > 0:
                    A._write_private(attestation_dir / f"{proof['probeId']}.json", proof)
                if stage > 1:
                    with ledger.open("ab") as stream:
                        stream.write(A._canonical(proof) + b"\n")
                raise OSError(f"proof write failed at stage {stage}")
            return failure
        for stage in range(3):
            with self.subTest(stage=stage), mock.patch.object(
                A, "_persist_proof_locked", side_effect=fail_at(stage),
            ):
                result = A.reconcile(self.args(), github=self.github, now=self.now)
            self.assertEqual((result["target"], result["approved"], result["accepted"]), (0, False, []))
            self.assertEqual(json.loads(self.provider_capacity.read_text()), before)
            self.assertEqual((self.ledger.exists(), list(self.attestations.glob("*.json"))), (False, []))

    def test_projection_write_failure_recovers_from_committed_evidence_without_double_count(self):
        with mock.patch.object(A.projector, "_write_atomic", side_effect=OSError("projection failed")):
            with self.assertRaisesRegex(OSError, "projection failed"):
                A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual(len(self.ledger.read_text().splitlines()), 1)
        provider = json.loads(self.provider_capacity.read_text())["providers"]["cursor"]
        self.assertEqual((provider["limit"], provider["usefulCompletions"]), (1, 1))
        recovered = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual((recovered["target"], recovered["approved"], recovered["accepted"][0]["state"]),
                         (1, True, "replayed"))
        self.assertEqual(len(self.ledger.read_text().splitlines()), 1)
        provider = json.loads(self.provider_capacity.read_text())["providers"]["cursor"]
        self.assertEqual((provider["limit"], provider["usefulCompletions"]), (1, 1))

    def test_persistence_conflict_cannot_credit_provider_capacity(self):
        first = A.reconcile(self.args(), github=self.github, now=self.now)
        proof = json.loads(self.ledger.read_text())
        self.provider_capacity.unlink()
        self.ledger.unlink()
        target = self.attestations / f"{proof['probeId']}.json"
        target.write_text(json.dumps({**proof, "outputBytes": proof["outputBytes"] + 1}))
        target.chmod(0o600)
        result = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual(first["target"], 1)
        self.assertEqual((result["target"], result["approved"]), (0, False))
        self.assertFalse(self.provider_capacity.exists())
        self.assertFalse(self.ledger.exists())

    def test_delayed_merge_cannot_clear_newer_provider_pressure(self):
        pressure_at = self.now
        merged_at = self.now - timedelta(hours=1)
        self.pr["mergedAt"] = merged_at.isoformat()
        before = A.provider_capacity.record_observation(
            self.provider_capacity, provider="cursor", kind="quota_pressure",
            event_id="newer-pressure", observed_at=pressure_at.isoformat(),
        )
        result = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual((result["target"], result["approved"]), (0, False))
        self.assertFalse(self.ledger.exists())
        self.assertEqual(json.loads(self.provider_capacity.read_text()), before)

    def test_two_distinct_merges_from_same_seat_keep_one_seat_and_two_events(self):
        first = A.reconcile(self.args(), github=self.github, now=self.now)
        self.assertEqual(first["target"], 1)
        issue = "JOV-1000"
        lease, _, _, second_pr = self.add_completion(
            issue=issue, issue_revision="issue-revision-2", lease_identity="e" * 64,
            base_head="b" * 40, head="e" * 40, pr_number=100,
            observed_at=self.now + timedelta(minutes=1),
        )
        # Exercise a cold rebuild with filenames sorting newer before older;
        # reconciliation must apply accepted provider events chronologically.
        self.ledger.unlink()
        self.provider_capacity.unlink()
        self.capacity.unlink()
        for artifact in self.attestations.glob("*.json"):
            artifact.unlink()
        def github(repository, pr_number):
            self.assertEqual(repository, "JovieInc/Jovie")
            return (self.pr if pr_number == 99 else second_pr), self.rules
        second = A.reconcile(self.args(), github=github, now=self.now + timedelta(minutes=1))
        self.assertEqual((second["target"], second["approved"]), (1, True))
        self.assertEqual(len(self.ledger.read_text().splitlines()), 2)
        provider = json.loads(self.provider_capacity.read_text())["providers"]["cursor"]
        self.assertEqual((provider["limit"], provider["usefulCompletions"]), (1, 2))
        second_auth = self.root / "cursor-auth-second.json"
        second_auth.write_text('{"account":"independent-test-pool"}')
        third_issue = "JOV-1001"
        _, _, _, third_pr = self.add_completion(
            issue=third_issue, issue_revision="issue-revision-3", lease_identity="f" * 64,
            base_head="c" * 40, head="f" * 40, pr_number=101,
            observed_at=self.now + timedelta(minutes=2), auth_state=second_auth,
        )
        def github_with_distinct_pool(repository, pr_number):
            self.assertEqual(repository, "JovieInc/Jovie")
            return {99: self.pr, 100: second_pr, 101: third_pr}[pr_number], self.rules
        third = A.reconcile(
            self.args(), github=github_with_distinct_pool, now=self.now + timedelta(minutes=2),
        )
        self.assertEqual((third["target"], third["approved"]), (2, True))
        provider = json.loads(self.provider_capacity.read_text())["providers"]["cursor"]
        self.assertEqual((provider["limit"], provider["usefulCompletions"]), (2, 3))

    def test_same_merged_source_cannot_credit_two_leases_or_provider_pools(self):
        second_issue = "JOV-1000"
        second_auth = self.root / "cursor-auth-second.json"
        second_auth.write_text('{"account":"independent-test-pool"}')
        self.add_completion(
            issue=second_issue, issue_revision="issue-revision-2", lease_identity="e" * 64,
            base_head="a" * 40, head="d" * 40, pr_number=99, observed_at=self.now,
            auth_state=second_auth,
        )
        shared_pr = {**self.pr, "title": f"fix: {self.issue} and {second_issue}"}
        def github(repository, pr_number):
            self.assertEqual((repository, pr_number), ("JovieInc/Jovie", 99))
            return shared_pr, self.rules
        result = A.reconcile(self.args(), github=github, now=self.now)
        self.assertEqual((result["target"], result["approved"]), (1, True))
        self.assertEqual(len(result["accepted"]), 1)
        self.assertGreaterEqual(result["rejected"].get("ValueError", 0), 1)
        self.assertEqual(len(self.ledger.read_text().splitlines()), 1)
        provider = json.loads(self.provider_capacity.read_text())["providers"]["cursor"]
        self.assertEqual((provider["limit"], provider["usefulCompletions"]), (1, 1))
        proof = json.loads(self.ledger.read_text())
        duplicate = {**proof, "issue": second_issue,
                     "lease": {**proof["lease"], "issueRevision": "issue-revision-2",
                               "receiptSha256": "f" * 64, "leaseIdentity": "e" * 64}}
        payload = {key: duplicate[key] for key in ("issue", "source", "ci", "lease")}
        raw = A._canonical(payload)
        duplicate.update(probeId=hashlib.sha256(raw).hexdigest(),
                         outputDigest=hashlib.sha256(raw).hexdigest(), outputBytes=len(raw))
        attestations = {proof["probeId"]: proof, duplicate["probeId"]: duplicate}
        accepted, rejected = C.v2_accepted_useful_turn_proofs(
            [proof, duplicate], self.now,
            expected_runtime=proof["runtime"], expected_contract_sha=proof["contractSha256"],
            attestations=attestations,
        )
        self.assertEqual(accepted, [])
        self.assertEqual(rejected.get("duplicate-source"), 2)

    def test_contract_rejects_substituted_issue_source_ci_and_lease(self):
        A.reconcile(self.args(), github=self.github, now=self.now)
        proof = json.loads(self.ledger.read_text())
        for key, value in (
            ("issue", "BAD"),
            ("source", {**proof["source"], "headSha": "bad"}),
            ("ci", {**proof["ci"], "conclusion": "FAILURE"}),
            ("lease", {**proof["lease"], "receiptSha256": "bad"}),
        ):
            with self.subTest(key=key):
                self.assertEqual(C.v2_validate_useful_turn_proof({**proof, key: value}, self.now)[1], "unaccepted-completion")


if __name__ == "__main__":
    unittest.main()
