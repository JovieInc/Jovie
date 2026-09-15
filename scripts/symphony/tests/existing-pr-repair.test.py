#!/usr/bin/env python3
"""Operator assignment, exact-head repair and real kernel lease regressions."""
import contextlib
import copy
import fcntl
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import signal
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1]


def load(name, filename):
    loader = importlib.machinery.SourceFileLoader(name, str(SOURCE / filename))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


repair = load("repair_under_test", "existing_pr_repair.py")
controller = load("repair_controller", "symphony-codex-exhausted.py")
REAL_STATUS_CHECK_READER = controller._pr_status_check_rollup
guard = load("repair_guard", "symphony-lease-guard")
IDENT = "JOV-5552"
HEAD = "a" * 40
ISSUE_ID = "d1d9b064-5264-4907-a3ca-f599eb75b9de"
OWNER = "01a0818b-6e1b-7573-a2b1-a7ad52ea8328"
REVISION = "2026-09-08T12:00:00Z"


def _accept_once(listener):
    try:
        connection, _address = listener.accept()
        connection.close()
    except OSError:
        pass


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.tmp = Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        self.root = self.tmp / "assignments"
        self.root.mkdir(mode=0o700)
        self.leases = self.tmp / "leases"
        self.leases.mkdir()
        self.admission = self.tmp / "admission"
        self.admission.mkdir()
        self.admission_paths = {
            "ADMISSION_FLEET_PATH": self.admission / "fleet.json",
            "ADMISSION_CONCURRENCY_PATH": self.admission / "concurrency.json",
            "ADMISSION_ATTESTATION_PATH": self.admission / "attestation.json",
        }
        for name, value in (("ROOT", self.root), ("LEASE_ROOT", self.leases), ("GUARD", SOURCE / "symphony-lease-guard")):
            self.stack.enter_context(mock.patch.object(repair, name, value))
        for name, value in self.admission_paths.items():
            self.stack.enter_context(mock.patch.object(repair, name, value))
        self.stack.enter_context(mock.patch.object(controller, "_repair_module", return_value=repair))
        self.stack.enter_context(mock.patch.dict(os.environ, {"SYMPHONY_OPEN_PR_INDEX": "", "SYMPHONY_ISSUE_LEASE_FD": ""}))
        original_read = Path.read_text
        self.cgroup = "0::/user.slice/user@1000.service/app.slice/symphony-elixir.service\n"
        self.stack.enter_context(mock.patch.object(Path, "read_text", autospec=True,
            side_effect=lambda path, *a, **kw: self.cgroup if str(path) == "/proc/self/cgroup" else original_read(path, *a, **kw)))
        self.pr = {"number": 16937, "headRefName": "jov-5552-metric-stat-card-consolidation", "headRefOid": HEAD,
                   "body": f"<!-- linear-issue-id:{IDENT} -->", "headRepository": {"nameWithOwner": "JovieInc/Jovie"},
                   "mergeStateStatus": "DIRTY", "mergeable": "CONFLICTING"}
        self.issue = {"id": ISSUE_ID, "identifier": IDENT, "updatedAt": REVISION, "title": "Repair", "description": "",
                      "state": {"id": "review", "name": "In Review"}, "labels": {"nodes": []},
                      "team": {"key": "JOV", "states": {"nodes": [{"id": "work", "name": "In Progress"}, {"id": "review", "name": "In Review"}]}}}
        self.workspace = self.tmp / "workspace"
        self.workspace.mkdir()
        def git(*args, **kwargs):
            return subprocess.run(["git", "-C", str(self.workspace), *args], check=True,
                                  capture_output=True, text=True, **kwargs).stdout.strip()
        git("init", "--quiet", "--initial-branch=" + self.pr["headRefName"])
        tree = git("mktree", input="")
        head = git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree, input="fixture\n")
        git("update-ref", "HEAD", head)
        git("remote", "add", "origin", "https://github.com/JovieInc/Jovie.git")
        self.pr["headRefOid"] = head
        self.stack.enter_context(mock.patch.object(os, "getcwd", return_value=str(self.workspace)))
        self.stack.enter_context(mock.patch.dict(os.environ, {"SYMPHONY_WORKSPACE": str(self.workspace)}))
        self.spec = {"identifier": IDENT, "issueId": ISSUE_ID, "repository": "JovieInc/Jovie", "pr": 16937,
                     "head": head, "workspace": str(self.workspace), "generation": "b" * 40, "authorizedBy": OWNER, "writerUnit": "symphony-elixir.service",
                     "issuedAt": time.time() - 1, "expiresAt": time.time() + 300, "newIssueIntakeAllowed": False}
        self.stack.enter_context(mock.patch.object(controller, "_complete_open_prs", side_effect=lambda repo: [self.pr]))
        self.stack.enter_context(mock.patch.object(controller, "_fetch_single_issue", side_effect=lambda ident: self.issue))
        self.stack.enter_context(mock.patch.object(controller, "_native_dispatch_prerequisite", return_value=None))
        self.stack.enter_context(mock.patch.object(controller, "_pr_status_check_rollup", return_value=None))
        self.stack.enter_context(mock.patch.object(controller, "gc_fallback_locks"))
        self.stack.enter_context(mock.patch.object(controller, "_fallback_lock_count", return_value=1))
        self.stack.enter_context(mock.patch.object(controller, "_fallback_lease_dir", return_value=self.leases))
        self.stack.enter_context(mock.patch.object(controller, "_emit_pickup"))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.stack.enter_context(contextlib.redirect_stderr(io.StringIO()))

    def isolated_fixture(self):
        self.issue["assignee"] = {"id": OWNER}
        self.spec.update(executionMode="isolated-cli", ownerId=OWNER, issueRevision=REVISION,
                         expiresAt=int(time.time()) + 300)
        payload = self.authorize()
        target = {key: payload[key] for key in ("identifier", "issueId", "ownerId", "issueRevision", "repository", "pr", "head", "workspace", "writerUnit")}
        target.update(mode="isolated-cli", assignmentDigest=repair.assignment_digest(payload),
                      expiresAt=repair.datetime.fromtimestamp(payload["expiresAt"], repair.timezone.utc).isoformat())
        task = {"schema": "jovie-symphony-repair-task/v3", "taskKey": "a" * 64, "decisionFingerprint": "a" * 64,
                "action": "execute-existing-owned-repair", "authority": "host-assigned-isolated-repair-only",
                "selected": {"id": "affected-only-unit-selection", "sourceRevision": "b" * 40,
                             "sourceDigest": "d" * 64, "owner": "ci-reliability", "handle": "audit:repair"},
                "source": {"sourceVersion": "b" * 40, "snapshotDigest": "e" * 64},
                "existingRepair": target}
        eligibility = {"qualified": True, "provider": "fixture-local", "model": "fixture-task-model", "funding": "included-local",
                       "taskAppropriate": True, "costAppropriate": True, "delegationPolicyBound": True,
                       "expiresAt": payload["expiresAt"], "authPoolIdentity": "b" * 64}
        executor = mock.Mock()
        executor.qualify.return_value = eligibility
        executor.execute.return_value = {
            "status": "succeeded",
            "detail": "fixture execution",
            "_executionObservation": {
                "baseHead": payload["head"],
                "finalHead": "b" * 40,
                "outputDigest": "c" * 64,
                "taskAcceptanceDigest": repair.task_acceptance_digest(task),
                "taskAccepted": True,
            },
        }
        return task, executor

    def run_isolated(self, task, executor=None, *, resolved=True, expected_final_head=None,
                     selected_check=True):
        observed_calls = 0
        planned_final_head = None

        def fetch_prs(_repo):
            nonlocal observed_calls, planned_final_head
            observed_calls += 1
            if observed_calls == 1 and executor is not None:
                result = getattr(executor.execute, "return_value", {})
                observation = result.get("_executionObservation", {}) if isinstance(result, dict) else {}
                planned_final_head = expected_final_head or observation.get("finalHead")
            if observed_calls > 1 and executor is not None:
                head = planned_final_head or self.pr.get("headRefOid")
                observation = {**self.pr, "headRefOid": head,
                               "mergeStateStatus": "CLEAN" if resolved else self.pr.get("mergeStateStatus"),
                               "mergeable": "MERGEABLE" if resolved else self.pr.get("mergeable")}
                if resolved and selected_check:
                    observation["statusCheckRollup"] = [{
                        "__typename": "CheckRun",
                        "name": task["selected"]["handle"],
                        "status": "COMPLETED",
                        "conclusion": "SUCCESS",
                    }]
                return [observation]
            return [self.pr]

        return repair.execute_isolated(task, controller.__file__, lambda _: self.issue,
                                       fetch_prs, executor=executor)


    def write_admission_receipts(self):
        now = repair.time.time()
        def timestamp(epoch):
            return repair.datetime.fromtimestamp(epoch, repair.timezone.utc).isoformat().replace("+00:00", "Z")
        runtime_revision = "c" * 40
        fleet = {
            "schema": repair.ADMISSION_FLEET_SCHEMA,
            "sourceRevision": "d" * 40,
            "observedAt": timestamp(now),
            "signals": {
                "main": {"sha": "f" * 40},
                "queue": {
                    "repository": "JovieInc/Jovie",
                    "status": "known",
                    "source": "live",
                },
            },
            "workAdmission": {
                "allowed": True, "newImplementationAllowed": True,
                "newIssueLeaseAllowed": True,
            },
            "closureAdmission": {
                "newImplementationAllowed": True,
                "newIssueIntakeAllowed": True,
                "remediationContinues": True,
            },
            "remediationAdmission": {
                "allowed": True, "localAllowed": True, "pushAllowed": True,
                "authority": "single-pr-writer-exact-head",
            },
        }
        attestation = {
            "schema": repair.ADMISSION_ATTESTATION_SCHEMA,
            "sourceRevision": runtime_revision,
            "observedAt": timestamp(now),
            "active": True,
            "healthy": True,
            "listener": {"port": 4041, "boundToService": True},
            "runtime": {"workflowPath": "/fixture/symphony-workflow.md",
                        "generation": "e" * 64, "invocationId": "f" * 32},
        }
        concurrency = {
            "schema": repair.ADMISSION_CONCURRENCY_SCHEMA,
            "sourceRevision": runtime_revision,
            "observedAt": timestamp(now),
            "provenance": {"sourceRevision": runtime_revision, "observedAt": timestamp(now)},
            "resourceScope": {
                "repository": "JovieInc/Jovie",
                "runtimeUrl": repair.ADMISSION_RUNTIME_URL,
                "workflow": "/fixture/symphony-workflow.md",
            },
            "provider": {
                "eligible": True,
                "source": "active-issue-authenticated-routes",
            },
            "downstream": {"healthy": True, "repository": "JovieInc/Jovie"},
        }
        for name, value in (("ADMISSION_FLEET_PATH", fleet),
                            ("ADMISSION_CONCURRENCY_PATH", concurrency),
                            ("ADMISSION_ATTESTATION_PATH", attestation)):
            self.admission_paths[name].write_text(json.dumps(value), encoding="utf-8")
        return fleet, concurrency, attestation

    def provider_granted_fixture(self):
        task, _executor = self.isolated_fixture()
        payload = repair.read_private(self.root / f"{IDENT}.json")
        router = self.tmp / "grok-router"
        auth = self.tmp / "grok-auth-state"
        executable = self.tmp / "grok-cli"
        router.write_text("#!/bin/sh\n", encoding="utf-8")
        auth.write_text("oidc-authenticated\n", encoding="utf-8")
        executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        router.chmod(0o700)
        auth.chmod(0o600)
        executable.chmod(0o700)
        account = "95834901-90c9-4bf0-a85a-6f73192cd9ee"
        pool = "d" * 64
        now = time.time()
        qualification = {
            "schema": repair.QUALIFICATION_SCHEMA,
            "marker": "GEM_GROK_QUALIFIED",
            "provider": "grok",
            "model": "grok-4.6",
            "cliVersion": "1.0.13",
            "observedAt": repair._iso_now(),
            "outputDigest": "e" * 64,
            "accountUserId": account,
            "authPoolIdentity": pool,
            "includedRemainingPercent": 77,
        }
        grant = {
            "schema": repair.PROVIDER_GRANT_SCHEMA,
            "grantId": "grant-jov-6224",
            "provider": "grok",
            "model": "grok-4.6",
            "routerId": "gem-grok-router-v1",
            "routerPath": str(router),
            "routerDigest": hashlib.sha256(router.read_bytes()).hexdigest(),
            "accountUserId": account,
            "authPoolIdentity": pool,
            "authStatePath": str(auth),
            "authStateSha256": hashlib.sha256(auth.read_bytes()).hexdigest(),
            "executablePath": str(executable),
            "executableSha256": hashlib.sha256(executable.read_bytes()).hexdigest(),
            "qualification": qualification,
            "identifier": payload["identifier"],
            "issueId": payload["issueId"],
            "repository": payload["repository"],
            "pr": payload["pr"],
            "head": payload["head"],
            "workspace": payload["workspace"],
            "issuedAt": payload["issuedAt"] + 1,
            "expiresAt": payload["expiresAt"] - 1,
            "funding": "included-local",
            "taskAppropriate": True,
            "costAppropriate": True,
            "delegationPolicyBound": True,
        }
        payload["providerGrant"] = grant
        self.stack.enter_context(mock.patch.object(repair.time, "time", return_value=now))
        digest = repair.assignment_digest(payload)
        task["existingRepair"]["assignmentDigest"] = digest
        repair._replace_private(self.root / f"{IDENT}.json", payload)
        return task, payload, executable

    def allowance_fixture(self):
        task, payload, executable = self.provider_granted_fixture()
        grant = payload["providerGrant"]
        auth = Path(grant["authStatePath"])
        auth.write_text(json.dumps({"existing-provider-account": {
            "user_id": grant["accountUserId"], "key": "test-only-provider-secret"}}))
        grant["authStateSha256"] = hashlib.sha256(auth.read_bytes()).hexdigest()
        task["existingRepair"]["assignmentDigest"] = repair.assignment_digest(payload)
        repair._replace_private(self.root / f"{IDENT}.json", payload)
        now = time.time()
        config = {"creditUsagePercent": 23.1, "monthlyLimit": {"val": 100},
                  "onDemandCap": {"val": 0}, "prepaidBalance": {"val": 0}, "currentPeriod": {
                      "start": repair.datetime.fromtimestamp(now - 3600, repair.timezone.utc).isoformat(),
                      "end": repair.datetime.fromtimestamp(now + 3600, repair.timezone.utc).isoformat()}}
        return task, payload, config

    def allowance_response(self, config, *, raw=None, status=200, url=None):
        response = io.BytesIO(json.dumps({"config": config}).encode() if raw is None else raw)
        response.status = status
        response.geturl = lambda: url or "https://cli-chat-proxy.grok.com/v1/billing?format=credits"
        return response

    def test_allowance_uses_authenticated_account_and_preserves_independent_evidence(self):
        _task, payload, config = self.allowance_fixture()
        opener = mock.Mock(return_value=self.allowance_response(config))
        observed = repair.observe_grok_allowance(payload, opener=opener)
        row, evidence = observed["providerEligibility"], observed["providerObservation"]
        self.assertEqual(row["state"], "ALLOWED")
        self.assertEqual(evidence["includedRemainingPercent"], 76)
        self.assertEqual(evidence["providerGrantDigest"], repair._digest(payload["providerGrant"]))
        self.assertEqual(evidence["outputDigest"], payload["providerGrant"]["qualification"]["outputDigest"])
        self.assertEqual(row["sourceDigest"], repair._digest(evidence))
        self.assertLessEqual(repair.datetime.fromisoformat(row["expiresAt"]).timestamp(), payload["expiresAt"])
        request = opener.call_args.args[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-only-provider-secret")
        self.assertEqual(opener.call_args.kwargs, {"timeout": 15})
        self.assertNotIn("test-only-provider-secret", json.dumps(observed))
        self.assertIsNone(repair._ProviderNoRedirect().redirect_request(None))
        config["creditUsagePercent"] = 100
        observed = repair.observe_grok_allowance(payload, opener=lambda *_a, **_k:self.allowance_response(config))
        self.assertEqual(observed["providerEligibility"]["state"], "HELD")
        self.assertIsNotNone(observed["providerEligibility"]["observedAt"])
        self.assertEqual(observed["providerObservation"]["includedRemainingPercent"], 0)

    def test_allowance_missing_unified_fields_or_invalid_numbers_never_implies_capacity(self):
        _task, payload, config = self.allowance_fixture()
        variants = [{"onDemandCap": {"val": 0}, "onDemandUsed": {"val": 0},
                     "prepaidBalance": {"val": 0}, "isUnifiedBillingUser": True},
                    None, [], {**config, "creditUsagePercent": True},
                    {**config, "creditUsagePercent": -1}, {**config, "creditUsagePercent": float("nan")},
                    {**config, "monthlyLimit": 0}, {**config, "monthlyLimit": True},
                    {**config, "onDemandCap": {"val": 1}}, {**config, "onDemandCap": None},
                    {**config, "prepaidBalance": {"val": 1}}, {**config, "prepaidBalance": None},
                    {**config, "prepaidBalance": {"val": False}},
                    {**config, "currentPeriod": None},
                    {**config, "currentPeriod": {"start":"2000-01-01", "end":"2999-01-01"}},
                    {**config, "currentPeriod": {"start":"2000-01-01T00:00:00Z", "end":"2001-01-01T00:00:00Z"}}]
        for value in variants:
            with self.subTest(value=value):
                observed = repair.observe_grok_allowance(payload, opener=lambda *_a, **_k:self.allowance_response(value))
                self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")
                self.assertIsNone(observed["providerObservation"])

    def test_allowance_network_auth_redirect_and_malformed_responses_fail_closed(self):
        _task, payload, config = self.allowance_fixture()
        for options in ({"raw": b"not-json"}, {"raw": b"x" * 65537}, {"raw": b"[]"},
                        {"status": 201}, {"url": "https://example.invalid/redirect"}):
            observed = repair.observe_grok_allowance(payload, opener=lambda *_a, **_k:self.allowance_response(config, **options))
            self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")
        for code in (401, 403, 429, 500):
            error = repair.urllib.error.HTTPError("https://cli-chat-proxy.grok.com", code, "test-only-provider-secret", {}, None)
            observed = repair.observe_grok_allowance(payload, opener=mock.Mock(side_effect=error))
            self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")
            self.assertNotIn("test-only-provider-secret", json.dumps(observed))
        with mock.patch.object(repair.urllib.request, "build_opener") as builder:
            builder.return_value.open.side_effect = TimeoutError("timeout")
            self.assertEqual(repair.observe_grok_allowance(payload)["providerEligibility"]["state"], "UNKNOWN")
            self.assertIsInstance(builder.call_args.args[0], type)

    def test_allowance_rejects_changed_auth_and_wrong_account_without_request(self):
        _task, payload, config = self.allowance_fixture()
        grant = payload["providerGrant"]
        auth = Path(grant["authStatePath"])
        for value in ({"account":{"user_id":"other", "key":"secret"}}, [],
                      {"account":{"user_id":grant["accountUserId"], "key":False}}):
            auth.write_text(json.dumps(value))
            grant["authStateSha256"] = hashlib.sha256(auth.read_bytes()).hexdigest()
            opener = mock.Mock()
            self.assertEqual(repair.observe_grok_allowance(payload, opener=opener)["providerEligibility"]["state"], "UNKNOWN")
            opener.assert_not_called()
        auth.write_text("changed after grant")
        opener = mock.Mock()
        self.assertEqual(repair.observe_grok_allowance(payload, opener=opener)["providerEligibility"]["state"], "UNKNOWN")
        opener.assert_not_called()

    def test_allowance_rechecks_auth_and_grant_after_request(self):
        _task, payload, config = self.allowance_fixture()
        auth = Path(payload["providerGrant"]["authStatePath"])
        def replaced(*_args, **_kwargs):
            auth.write_text("replaced during request")
            return self.allowance_response(config)
        observed = repair.observe_grok_allowance(payload, opener=replaced)
        self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")
        self.assertIsNone(observed["providerObservation"])

    def test_task_observer_publishes_quota_evidence_only_for_the_same_fresh_runtime_and_assignment(self):
        task, payload, config = self.allowance_fixture()
        self.write_admission_receipts()
        opener = mock.Mock(return_value=self.allowance_response(config))
        checks = [{"__typename":"CheckRun", "name":task["selected"]["handle"], "status":"COMPLETED", "conclusion":"FAILURE"}]
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=checks), \
             mock.patch.object(repair.urllib.request, "build_opener") as builder:
            builder.return_value.open = opener
            observed = repair.observe_task_admissions(IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"], source_revision=payload["generation"])
        self.assertEqual(observed["providerEligibility"]["state"], "ALLOWED")
        self.assertEqual(observed["downstreamHealth"]["state"], "ALLOWED")
        self.assertEqual(observed["assignmentDigest"], repair.assignment_digest(payload))
        self.assertEqual(observed["providerObservation"]["providerGrantDigest"], repair._digest(payload["providerGrant"]))
        opener.assert_called_once()

    def task_execution_observer_fixture(self):
        task, payload, config = self.allowance_fixture()
        fleet, concurrency, _attestation = self.write_admission_receipts()
        fleet["workAdmission"]["allowed"] = False
        concurrency["provider"]["eligible"] = False
        concurrency["downstream"]["healthy"] = False
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet))
        self.admission_paths["ADMISSION_CONCURRENCY_PATH"].write_text(json.dumps(concurrency))
        self.stack.enter_context(mock.patch.object(repair, "_task_admission_controller_module", return_value=controller))
        self.stack.enter_context(mock.patch.object(controller, "_pr_status_check_rollup", return_value=[{
            "__typename": "CheckRun", "name": task["selected"]["handle"],
            "status": "COMPLETED", "conclusion": "FAILURE",
        }]))
        builder = self.stack.enter_context(mock.patch.object(repair.urllib.request, "build_opener"))
        builder.return_value.open.side_effect = lambda *_a, **_k: self.allowance_response(config)
        return task, payload, config, fleet, builder.return_value.open

    def test_execution_uses_exact_task_observations_during_aggregate_and_new_work_holds(self):
        task, _payload, config, fleet, request = self.task_execution_observer_fixture()
        self.assertFalse(repair.read_current_execution_admission()["allowed"])
        admission = repair.read_task_execution_admission(task, controller.__file__)
        self.assertTrue(admission["allowed"])
        self.assertEqual(admission["newImplementation"]["state"], "HELD")
        self.assertEqual(admission["providerEligibility"]["reason"], "provider-included-allowance-observed")
        self.assertEqual(admission["downstreamHealth"]["reason"], "observed-target-available")
        self.assertFalse((self.root / f"{IDENT}.claim").exists())
        config["creditUsagePercent"] = 100
        self.assertEqual(repair.read_task_execution_admission(task, controller.__file__)["reason"],
                         "execution-admission-provider-eligibility-held")
        fleet["remediationAdmission"]["pushAllowed"] = False
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet))
        self.assertEqual(repair.read_task_execution_admission(task, controller.__file__)["reason"],
                         "execution-admission-push-held")
        self.assertEqual(request.call_count, 2)

    def test_execution_observation_rejects_changed_assignment_and_hold_during_authenticated_read(self):
        task, payload, config, fleet, request = self.task_execution_observer_fixture()
        def held(*_a, **_k):
            fleet["remediationAdmission"]["allowed"] = False
            self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet))
            return self.allowance_response(config)
        request.side_effect = held
        admission = repair.read_task_execution_admission(task, controller.__file__)
        self.assertEqual(admission["reason"], "execution-admission-owned-remediation-held")
        self.write_admission_receipts()
        task["existingRepair"]["assignmentDigest"] = "0" * 64
        admission = repair.read_task_execution_admission(task, controller.__file__)
        self.assertEqual(admission["reason"], "execution-admission-provider-eligibility-unknown")
        self.assertEqual(request.call_count, 1)

    def test_execution_rechecks_its_own_claim_but_rejects_duplicate_or_crossed_run(self):
        task, payload, _config, _fleet, request = self.task_execution_observer_fixture()
        live = repair.GrokOwnedRepairExecutor(controller=controller.__file__)
        live.require_admission(task)
        executor = mock.Mock()
        executor.qualify.return_value = live.qualify(task, payload)
        def execute(selected, assignment, eligibility, **_kwargs):
            run_id = eligibility["runId"]
            live.require_admission(selected, run_id=run_id)
            self.assertIsNone(repair.observe_task_admissions(IDENT, controller.__file__,
                selected_id=task["selected"]["id"], selected_handle=task["selected"]["handle"],
                source_revision=payload["generation"]))
            for invalid_run in (None, run_id + "-other"):
                self.assertFalse(repair.read_task_execution_admission(selected, controller.__file__,
                    run_id=invalid_run)["allowed"])
            pending = repair._receipt_path(IDENT, "pending-result")
            repair.exclusive_write(pending, {"pending": True})
            self.assertFalse(repair.read_task_execution_admission(selected, controller.__file__,
                run_id=run_id)["allowed"])
            pending.unlink()
            raise repair.ExecutionAdmissionHeld("fixture-stop-before-provider")
        executor.execute.side_effect = execute
        result = self.run_isolated(task, executor)
        self.assertEqual(result["reason"], "fixture-stop-before-provider")
        self.assertEqual(request.call_count, 2)
        duplicate = self.run_isolated(task, executor)
        self.assertEqual(duplicate["reason"], "isolated-repair-claimed-outcome-unknown")
        self.assertEqual(executor.execute.call_count, 1)

    def test_live_adapter_rechecks_exact_allowance_after_claim_before_spawning(self):
        task, _payload, config, _fleet, request = self.task_execution_observer_fixture()
        observations = 0
        def quota(*_a, **_k):
            nonlocal observations
            observations += 1
            current = dict(config, creditUsagePercent=100 if observations > 1 else 0)
            return self.allowance_response(current)
        request.side_effect = quota
        with mock.patch.object(repair.GrokOwnedRepairExecutor, "require_sandbox"), \
             mock.patch.object(repair, "_sandboxed_grok_command", side_effect=lambda command, *_a: (["fixture-systemd", "--property=RuntimeMaxSec=999s", "--", *command], {})), \
             mock.patch.object(repair, "_run_bounded") as spawn:
            result = self.run_isolated(task)
            self.assertEqual(result["reason"], "execution-admission-provider-eligibility-held")
            self.assertTrue((self.root / f"{IDENT}.claim").exists())
            self.assertEqual(observations, 2)
            duplicate = self.run_isolated(task)
            self.assertEqual(duplicate["reason"], "isolated-repair-claimed-outcome-unknown")
            spawn.assert_not_called()

    def assert_target_change_during_final_allowance_is_held(self, kind):
        task, _payload, config, _fleet, request = self.task_execution_observer_fixture()
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "FAILURE"}]
        reads = 0
        def allowance(*_args, **_kwargs):
            nonlocal reads
            reads += 1
            if reads == 2:
                if kind == "pr":
                    self.pr["headRefOid"] = "c" * 40
                elif kind == "issue":
                    self.issue["updatedAt"] = "2026-09-08T12:01:00Z"
                else:
                    checks[0]["conclusion"] = "SUCCESS"
            return self.allowance_response(config)
        request.side_effect = allowance
        with mock.patch.object(controller, "_pr_status_check_rollup", return_value=checks), \
             mock.patch.object(repair.GrokOwnedRepairExecutor, "require_sandbox"), \
             mock.patch.object(repair, "_sandboxed_grok_command") as sandbox, \
             mock.patch.object(repair, "_run_bounded") as spawn:
            result = self.run_isolated(task)
        self.assertEqual(result["status"], "held")
        self.assertEqual(reads, 2)
        self.assertTrue((self.root / f"{IDENT}.claim").exists())
        sandbox.assert_not_called()
        spawn.assert_not_called()

    def test_live_adapter_rejects_pr_change_during_final_allowance(self):
        self.assert_target_change_during_final_allowance_is_held("pr")

    def test_live_adapter_rejects_issue_change_during_final_allowance(self):
        self.assert_target_change_during_final_allowance_is_held("issue")

    def test_live_adapter_rejects_check_change_during_final_allowance(self):
        self.assert_target_change_during_final_allowance_is_held("check")

    def test_live_adapter_binds_both_deadlines_after_authenticated_reads_and_sandbox_preparation(self):
        task, payload, config, _fleet, request = self.task_execution_observer_fixture()
        now = [time.time()]
        reads = 0
        def allowance(*_a, **_k):
            nonlocal reads
            reads += 1
            if reads == 2:
                now[0] += 12
            return self.allowance_response(config)
        def sandbox(command, *_args):
            now[0] += 2  # Preparing the boundary must not extend either limit.
            return ["fixture-systemd", "--property=RuntimeMaxSec=999s", "--", *command], {}
        def spawn(command, **kwargs):
            remaining = repair._remaining_execution_timeout(payload, payload["providerGrant"])
            self.assertEqual(kwargs["timeout"], remaining)
            runtime = next(item for item in command if item.startswith("--property=RuntimeMaxSec="))
            seconds = float(runtime.removeprefix("--property=RuntimeMaxSec=").removesuffix("s"))
            self.assertLessEqual(seconds, remaining)
            self.assertLess(remaining - seconds, 0.0011)
            raise RuntimeError("fixture-stop-at-spawn")
        request.side_effect = allowance
        with mock.patch.object(repair.time, "time", side_effect=lambda: now[0]), \
             mock.patch.object(repair.GrokOwnedRepairExecutor, "require_sandbox"), \
             mock.patch.object(repair, "_sandboxed_grok_command", side_effect=sandbox), \
             mock.patch.object(repair, "_run_bounded", side_effect=spawn) as runner:
            with self.assertRaisesRegex(RuntimeError, "fixture-stop-at-spawn"):
                self.run_isolated(task)
        runner.assert_called_once()
        self.assertEqual(reads, 2)

    def assert_preparation_consumed_execution_window(self, remaining):
        task, payload, _config, _fleet, _request = self.task_execution_observer_fixture()
        now = [time.time()]
        def sandbox(command, *_args):
            now[0] = payload["providerGrant"]["expiresAt"] - remaining
            return ["fixture-systemd", "--property=RuntimeMaxSec=999s", "--", *command], {}
        with mock.patch.object(repair.time, "time", side_effect=lambda: now[0]), \
             mock.patch.object(repair.GrokOwnedRepairExecutor, "require_sandbox"), \
             mock.patch.object(repair, "_sandboxed_grok_command", side_effect=sandbox), \
             mock.patch.object(repair, "_run_bounded") as spawn:
            with self.assertRaisesRegex(ValueError, "execution-window-too-short"):
                self.run_isolated(task)
        spawn.assert_not_called()

    def test_live_adapter_refuses_window_consumed_by_sandbox_preparation(self):
        self.assert_preparation_consumed_execution_window(repair.PROCESS_CLEANUP_GRACE_SECONDS)

    def test_live_adapter_refuses_expiration_during_sandbox_preparation(self):
        self.assert_preparation_consumed_execution_window(-1)

    def test_systemd_runtime_binding_rejects_missing_duplicate_and_child_properties(self):
        for command in (["systemd", "--", "worker"],
                        ["systemd", "--", "--property=RuntimeMaxSec=1s"],
                        ["systemd", "--property=RuntimeMaxSec=1s", "--property=RuntimeMaxSec=2s", "--", "worker"]):
            with self.assertRaisesRegex(ValueError, "runtime-binding-invalid"):
                repair._bind_systemd_runtime_timeout(command, 5)
        with self.assertRaisesRegex(ValueError, "execution-window-too-short"):
            repair._bind_systemd_runtime_timeout(["systemd", "--property=RuntimeMaxSec=1s", "--", "worker"], 0)

    def test_provider_grant_validation_and_grok_runner_are_source_and_assignment_bound(self):
        task, payload, executable = self.provider_granted_fixture()
        self.assertEqual(repair.load_validated_candidate(IDENT, controller.__file__), payload)
        for key, value in (("issuedAt", payload["issuedAt"] - 1), ("expiresAt", payload["expiresAt"] + 1)):
            crossed = copy.deepcopy(payload)
            crossed["providerGrant"][key] = value
            with self.assertRaisesRegex(ValueError, "provider-grant-assignment-window-invalid"):
                repair.validate_provider_grant(crossed)
        naive = copy.deepcopy(payload)
        observed = repair.datetime.fromisoformat(
            naive["providerGrant"]["qualification"]["observedAt"].replace("Z", "+00:00")
        )
        naive["providerGrant"]["qualification"]["observedAt"] = observed.replace(
            tzinfo=None
        ).isoformat()
        with self.assertRaisesRegex(ValueError, "provider-grant-qualification-time-invalid"):
            repair.validate_provider_grant(naive)
        now = time.time()
        def observed(age):
            return repair.datetime.fromtimestamp(now - age, repair.timezone.utc).isoformat().replace("+00:00", "Z")
        fresh_edge = copy.deepcopy(payload)
        fresh_edge["providerGrant"]["qualification"]["observedAt"] = observed(repair.MAX_QUALIFICATION_AGE_SECONDS - 1)
        repair.validate_provider_grant(fresh_edge, now=now)
        stale = copy.deepcopy(fresh_edge)
        stale["providerGrant"]["qualification"]["observedAt"] = observed(repair.MAX_QUALIFICATION_AGE_SECONDS + 1)
        with self.assertRaisesRegex(ValueError, "provider-grant-qualification-stale"):
            repair.validate_provider_grant(stale, now=now)
        acceptance = repair.task_acceptance_digest(task)
        runner = mock.Mock(return_value=mock.Mock(returncode=0, stdout=f"changed\n{repair.TASK_ACCEPTANCE_MARKER} {acceptance}\n", stderr=""))
        adapter = repair.GrokOwnedRepairExecutor(run=runner)
        eligibility = adapter.qualify(task, payload)
        self.writer()
        with mock.patch.dict(os.environ, {"SYMPHONY_ISSUE_LEASE_FD": "9", "OPENAI_API_KEY": "secret",
                                         "SUMMER_GOVERNOR_ENFORCE_ENABLED": "true",
                                         "SUMMER_BOTTLENECK_SIGNING_PRIVATE_KEY": "secret", "DATABASE_URL": "postgresql://product-secret"}), \
             mock.patch.object(repair, "_git_head", side_effect=[payload["head"], "b" * 40]):
            result = adapter.execute(task, payload, {**eligibility, "runId": "JOV-5552-run"})
        self.assertEqual(result["status"], "succeeded")
        observation = result["_executionObservation"]
        self.assertEqual(observation["baseHead"], payload["head"])
        command = runner.call_args.args[0]
        self.assertEqual(command[0], str(executable))
        self.assertIn("grok-4.6", command)
        self.assertIn("--disable-web-search", command)
        self.assertIn("--no-subagents", command)
        child_env = runner.call_args.kwargs["env"]
        self.assertTrue(set(child_env).issubset(repair.CHILD_ENV_ALLOWLIST))
        for secret in ("OPENAI_API_KEY", "LINEAR_API_KEY", "SUMMER_GOVERNOR_ENFORCE_ENABLED",
                       "SUMMER_BOTTLENECK_SIGNING_PRIVATE_KEY", "DATABASE_URL"):
            self.assertNotIn(secret, child_env)
        self.assertEqual(child_env["HOME"], os.environ["HOME"])
        self.assertTrue(0 < runner.call_args.kwargs["timeout"] <= payload["providerGrant"]["expiresAt"] - time.time())
        self.assertTrue(observation["taskAccepted"])

    def test_grok_exit_zero_changed_head_without_exact_task_acceptance_stays_unverified(self):
        task, payload, _executable = self.provider_granted_fixture()
        runner = mock.Mock(return_value=mock.Mock(returncode=0, stdout="changed\n", stderr=""))
        adapter = repair.GrokOwnedRepairExecutor(run=runner)
        eligibility = adapter.qualify(task, payload)
        self.writer()
        with mock.patch.dict(os.environ, {"SYMPHONY_ISSUE_LEASE_FD": "9"}), \
             mock.patch.object(repair, "_git_head", side_effect=[payload["head"], "b" * 40]):
            result = adapter.execute(task, payload, {**eligibility, "runId": "JOV-5552-acceptance"})
        observation = result["_executionObservation"]
        self.assertEqual((result["status"], result["detail"], observation["taskAccepted"],
                          observation["taskAcceptanceDigest"]),
                         ("failed", "grok-execution-task-acceptance-unverified", False,
                          repair.task_acceptance_digest(task)))

    def test_current_execution_admission_requires_each_independent_authority(self):
        mutations = (
            ("ownedRemediation", lambda fleet, _concurrency, _attestation: fleet["remediationAdmission"].update(allowed=False)),
            ("push", lambda fleet, _concurrency, _attestation: fleet["remediationAdmission"].update(pushAllowed=False)),
            ("providerEligibility", lambda _fleet, concurrency, _attestation: concurrency["provider"].update(eligible=False)),
            ("downstreamHealth", lambda _fleet, concurrency, _attestation: concurrency["downstream"].update(healthy=False)),
        )
        for name, mutate in mutations:
            with self.subTest(name=name):
                fleet, concurrency, attestation = self.write_admission_receipts()
                mutate(fleet, concurrency, attestation)
                for path, value in ((self.admission_paths["ADMISSION_FLEET_PATH"], fleet),
                                    (self.admission_paths["ADMISSION_CONCURRENCY_PATH"], concurrency),
                                    (self.admission_paths["ADMISSION_ATTESTATION_PATH"], attestation)):
                    path.write_text(json.dumps(value), encoding="utf-8")
                observation = repair.read_current_execution_admission()
                self.assertFalse(observation["allowed"])
                self.assertEqual(observation[name]["state"], "HELD")

    def test_current_execution_admission_rejects_stale_naive_and_cross_revision_evidence(self):
        fleet, concurrency, attestation = self.write_admission_receipts()
        now = repair.time.time()
        stale = repair.datetime.fromtimestamp(
            now - repair.ADMISSION_MAX_AGE_SECONDS - 1, repair.timezone.utc
        ).isoformat().replace("+00:00", "Z")
        fleet["observedAt"] = stale
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet), encoding="utf-8")
        observation = repair.read_current_execution_admission(now=now)
        self.assertEqual(observation["push"]["state"], "UNKNOWN")
        self.assertFalse(observation["allowed"])

        fleet, concurrency, attestation = self.write_admission_receipts()
        concurrency["provenance"]["sourceRevision"] = "e" * 40
        self.admission_paths["ADMISSION_CONCURRENCY_PATH"].write_text(json.dumps(concurrency), encoding="utf-8")
        observation = repair.read_current_execution_admission(now=now)
        self.assertEqual(observation["providerEligibility"]["state"], "UNKNOWN")
        self.assertEqual(observation["downstreamHealth"]["state"], "UNKNOWN")

        fleet, concurrency, attestation = self.write_admission_receipts()
        attestation["observedAt"] = repair.datetime.fromtimestamp(
            now, repair.timezone.utc
        ).replace(tzinfo=None).isoformat()
        self.admission_paths["ADMISSION_ATTESTATION_PATH"].write_text(json.dumps(attestation), encoding="utf-8")
        observation = repair.read_current_execution_admission(now=now)
        self.assertEqual(observation["providerEligibility"]["state"], "UNKNOWN")
        self.assertFalse(observation["allowed"])

    def test_current_execution_admission_uses_gem_main_sha_and_live_queue_shape(self):
        fleet, _concurrency, _attestation = self.write_admission_receipts()
        observation = repair.read_current_execution_admission()
        self.assertEqual(observation["ownedRemediation"]["state"], "ALLOWED")
        self.assertEqual(observation["ownedRemediation"]["sourceRevision"], "f" * 40)
        fleet["sourceRevision"] = "a" * 40
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet), encoding="utf-8")
        observation = repair.read_current_execution_admission()
        self.assertEqual(observation["ownedRemediation"]["state"], "ALLOWED")
        self.assertEqual(observation["ownedRemediation"]["sourceRevision"], "f" * 40)

        for key, value in (("status", "unknown"), ("source", "cache")):
            fleet, _concurrency, _attestation = self.write_admission_receipts()
            fleet["signals"]["queue"][key] = value
            self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet), encoding="utf-8")
            observation = repair.read_current_execution_admission()
            self.assertEqual(observation["ownedRemediation"]["state"], "UNKNOWN")
            self.assertFalse(observation["allowed"])

    def test_current_execution_admission_fail_closed_on_malformed_sources(self):
        self.assertEqual(repair._admission_semantic_identity([{"observedAt": "volatile"}, 1]), [{}, 1])
        self.assertFalse(repair._admission_recent(None, 0))
        self.assertFalse(repair._admission_recent("not-a-time", 0))
        self.assertEqual(repair._admission_state(None), "UNKNOWN")
        for path in self.admission_paths.values():
            if path.exists():
                path.unlink()
        observation = repair.read_current_execution_admission(now="invalid-clock")
        self.assertFalse(observation["allowed"])
        self.assertEqual(observation["push"]["state"], "UNKNOWN")
        with self.assertRaisesRegex(repair.ExecutionAdmissionHeld, "held"):
            repair._require_execution_admission(lambda: {"allowed": False, "reason": "held"})
        with self.assertRaisesRegex(repair.ExecutionAdmissionHeld, "authority-unavailable"):
            repair._require_execution_admission(lambda: {"allowed": True})
        cleanup_target = self.root / "cleanup.json"
        with mock.patch.object(os, "replace", side_effect=OSError("replace failed")), \
             self.assertRaises(OSError):
            repair._replace_private(cleanup_target, {"ok": True})
        self.assertFalse(any(path.name.startswith(".cleanup.json.") for path in self.root.iterdir()))

    def test_delayed_outbox_rechecks_current_admission_before_claim(self):
        task, _payload, _executable = self.provider_granted_fixture()
        fleet, concurrency, attestation = self.write_admission_receipts()
        fleet["remediationAdmission"]["pushAllowed"] = False
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet), encoding="utf-8")
        result = self.run_isolated(task)
        self.assertEqual(result, {"status": "held", "reason": "execution-admission-push-held"})
        self.assertFalse((self.root / f"{IDENT}.claim").exists())

    def test_grok_execution_rechecks_admission_before_spawn(self):
        task, payload, _executable = self.provider_granted_fixture()
        fleet, concurrency, attestation = self.write_admission_receipts()
        acceptance = repair.task_acceptance_digest(task)
        runner = mock.Mock(return_value=mock.Mock(
            returncode=0,
            stdout=f"changed\n{repair.TASK_ACCEPTANCE_MARKER} {acceptance}\n",
            stderr="",
        ))
        adapter = repair.GrokOwnedRepairExecutor(
            run=runner, admission_reader=repair.read_current_execution_admission
        )
        eligibility = adapter.qualify(task, payload)
        self.writer()
        with mock.patch.dict(os.environ, {"SYMPHONY_ISSUE_LEASE_FD": "9"}), \
             mock.patch.object(repair, "_git_head", side_effect=[payload["head"], "b" * 40, payload["head"]]):
            result = adapter.execute(task, payload, {**eligibility, "runId": "JOV-5552-admission"})
            self.assertEqual(result["status"], "succeeded")
            fleet["remediationAdmission"]["pushAllowed"] = False
            self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet), encoding="utf-8")
            with self.assertRaisesRegex(repair.ExecutionAdmissionHeld, "execution-admission-push-held"):
                adapter.execute(task, payload, {**eligibility, "runId": "JOV-5552-held"})
        self.assertEqual(runner.call_count, 1)

    def test_correlated_result_recovery_ignores_later_admission_hold(self):
        task, executor = self.isolated_fixture()
        first = self.run_isolated(task, executor)
        fleet, _concurrency, _attestation = self.write_admission_receipts()
        fleet["remediationAdmission"]["pushAllowed"] = False
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet), encoding="utf-8")
        payload = repair.read_private(self.root / f"{IDENT}.json")
        with mock.patch.object(repair.time, "time", return_value=payload["expiresAt"] + 1):
            replay = self.run_isolated(task, executor)
        self.assertEqual(replay, first)
        self.assertEqual(executor.execute.call_count, 1)



    def test_grok_sandbox_mounts_only_the_workspace_cli_and_auth_state(self):
        _task, payload, executable = self.provider_granted_fixture()
        mcp_config = Path(payload["workspace"]) / ".mcp.json"
        mcp_config.write_text('{"mcpServers":{"leak":{"command":"cat"}}}', encoding="utf-8")
        workspace_secret = Path(payload["workspace"]) / ".env.local"
        workspace_secret.write_text("company-secret", encoding="utf-8")
        workspace_socket_path = Path(payload["workspace"]) / "company.sock"
        workspace_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        workspace_socket.bind(str(workspace_socket_path))
        workspace_socket.listen(1)
        with mock.patch.object(repair, "_bwrap_executable", return_value=Path("/usr/bin/bwrap")), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "10.0.0.5")]), \
             mock.patch.dict(os.environ, {
                 "OPENAI_API_KEY": "secret",
                 "SUMMER_BOTTLENECK_SIGNING_PRIVATE_KEY": "secret",
                 "SYMPHONY_ASSIGNMENT_PATH": "/host/assignment.json",
                 "GEM_SERVICE_ATTESTATION_PATH": "/host/attestation.json",
             }):
            command, child_env = repair._sandboxed_grok_command(
                [str(executable), "--probe"], payload, payload["providerGrant"], executable
            )
        mounts = []
        for index, value in enumerate(command[:-2]):
            if value in ("--bind", "--ro-bind"):
                mounts.append((value, command[index + 1], command[index + 2]))
        workspace = str(Path(payload["workspace"]).resolve())
        auth = str(Path(payload["providerGrant"]["authStatePath"]).resolve())
        executable_path = str(executable.resolve())
        resolver_path = str((SOURCE / repair.SANDBOX_RESOLV_CONF_NAME).resolve())
        self.assertIn(("--bind", workspace, workspace), mounts)
        self.assertIn(("--ro-bind", auth, auth), mounts)
        self.assertIn(("--ro-bind", executable_path, executable_path), mounts)
        self.assertIn(("--ro-bind", resolver_path, "/etc/resolv.conf"), mounts)
        self.assertIn(("--ro-bind", "/dev/null", str(mcp_config)), mounts)
        self.assertIn(("--ro-bind", "/dev/null", str(workspace_secret)), mounts)
        self.assertIn(("--ro-bind", "/dev/null", str(workspace_socket_path)), mounts)
        self.assertNotIn(("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf"), mounts)
        self.assertNotIn(("--bind", str(Path.home()), str(Path.home())), mounts)
        self.assertNotIn(("--ro-bind", str(Path.home()), str(Path.home())), mounts)
        self.assertEqual(child_env["HOME"], str(Path.home().resolve()))
        self.assertEqual(child_env["GIT_CONFIG_GLOBAL"], "/dev/null")
        for secret in ("OPENAI_API_KEY", "SUMMER_BOTTLENECK_SIGNING_PRIVATE_KEY",
                       "SYMPHONY_ASSIGNMENT_PATH", "GEM_SERVICE_ATTESTATION_PATH"):
            self.assertNotIn(secret, child_env)
        for flag in ("--tmpfs", "--clearenv", "--unshare-all", "--share-net", "--chdir",
                     "--property=IPAddressDeny=127.0.0.0/8", "--property=IPAddressDeny=::1/128"):
            self.assertIn(flag, command)
        workspace_socket.close()
        workspace_socket_path.unlink()

    def test_host_containment_helpers_require_root_owned_tools_and_effective_network_deny(self):
        original_platform = sys.platform
        with mock.patch.object(repair.sys, "platform", "darwin"):
            self.assertIsNone(repair._bwrap_executable())
            self.assertIsNone(repair._systemd_executable((Path("/missing"),)))
            self.assertIsNone(repair._systemctl_executable())
        self.assertEqual(sys.platform, original_platform)

        first = Path("/bwrap-insecure")
        second = Path("/bwrap-missing")
        third = Path("/bwrap-root-owned")
        stats = {
            first: mock.Mock(st_mode=stat.S_IFREG | 0o770, st_uid=0),
            third: mock.Mock(st_mode=stat.S_IFREG | 0o700, st_uid=0),
        }

        def lstat(path):
            if path == second:
                raise OSError("missing")
            return stats[path]

        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "BWRAP_PATHS", (first, second, third)), \
             mock.patch.object(Path, "lstat", autospec=True, side_effect=lambda path: lstat(path)), \
             mock.patch.object(repair.os, "access", return_value=True):
            self.assertEqual(repair._bwrap_executable(), third)
            self.assertEqual(repair._systemd_executable((first, second, third)), third)
            with mock.patch.object(repair, "BWRAP_PATHS", (first, second)):
                self.assertIsNone(repair._bwrap_executable())

        # On Linux the fixed boundary's first failure mode is the
        # system-manager tool check, not the darwin platform guard.
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "10.0.0.5")]), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=None):
            with self.assertRaisesRegex(ValueError,
                                        "linux-systemd-system-boundary-unavailable"):
                repair._systemd_network_sandbox_command(["/bin/true"])

        with mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "10.0.0.5")]):
            wrapped = repair._systemd_network_sandbox_command(["/bin/true"])
        self.assertEqual(wrapped[-2:], ["--", "/bin/true"])
        self.assertIn("--property=IPAddressDeny=127.0.0.0/8", wrapped)
        self.assertIn("--system", wrapped)
        self.assertNotIn("--user", wrapped)
        self.assertNotIn("--scope", wrapped)
        self.assertNotIn("--property=ProtectSystem=strict", wrapped)

    def test_linux_host_address_inventory_uses_all_interface_addresses(self):
        ip = Path("/usr/sbin/ip")
        inventory = json.dumps([
            {"ifname": "lo", "addr_info": [{"local": "127.0.0.1"}, {"local": "::1"}]},
            {"ifname": "eth0", "addr_info": [
                {"local": "192.168.12.116"}, {"local": "fe80::1%eth0"},
                {"local": "ff02::1"}, {"local": "::"},
            ]},
            {"ifname": "tailscale0", "addr_info": [
                {"local": "100.105.87.117"}, {"local": "fd7a:115c:a1e0::cc32:5778"},
            ]},
        ])
        result = subprocess.CompletedProcess([], 0, stdout=inventory)
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_ip_executable", return_value=ip), \
             mock.patch.object(repair.subprocess, "run", return_value=result) as run:
            self.assertEqual(repair._local_host_addresses(), (
                (socket.AF_INET, "100.105.87.117"),
                (socket.AF_INET, "192.168.12.116"),
                (socket.AF_INET6, "fd7a:115c:a1e0::cc32:5778"),
                (socket.AF_INET6, "fe80::1"),
            ))
        self.assertEqual(run.call_args.args[0], [str(ip), "-j", "addr", "show"])
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_ip_executable", return_value=ip), \
             mock.patch.object(repair.subprocess, "run",
                               return_value=subprocess.CompletedProcess([], 1, stdout="[]")):
            self.assertEqual(repair._linux_local_host_addresses(), ())

    def test_systemd_service_command_and_cleanup_are_fixed_and_exact(self):
        unit = "symphony-existing-repair-1234-deadbeef"
        with mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")):
            command = repair._systemd_service_command(
                ["/usr/bin/bwrap", "--version"], ["127.0.0.0/8", "192.168.12.116/32"],
                unit=unit, runtime_seconds=2.5,
            )
            self.assertEqual(command[:4], ["/usr/bin/sudo", "-n", "/usr/bin/systemd-run", "--system"])
            self.assertIn("--wait", command)
            self.assertIn("--pipe", command)
            self.assertIn("--uid=" + str(os.getuid()), command)
            self.assertIn("--gid=" + str(os.getgid()), command)
            self.assertIn("--property=RuntimeMaxSec=2.500s", command)
            self.assertIn("--property=IPAddressDeny=127.0.0.0/8", command)
            self.assertIn("--property=CapabilityBoundingSet=", command)
            self.assertNotIn("--user", command)
            self.assertIsNone(repair._systemd_unit_from_command(["--unit=arbitrary.service"]))
            self.assertIsNone(repair._systemd_cleanup_callback(
                ["/usr/bin/sudo", "-n", "/usr/bin/other", "--system", f"--unit={unit}"]
            ))
            callback = repair._systemd_cleanup_callback(command)
        self.assertEqual(repair._systemd_unit_from_command(command), unit)
        with mock.patch.object(repair, "_stop_systemd_unit") as stop:
            callback()
        stop.assert_called_once_with(unit)
        with self.assertRaisesRegex(ValueError, "linux-network-deny-entry-invalid"):
            with mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
                 mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")):
                repair._systemd_service_command(["/bin/true"], ["not-an-ip"], unit=unit)
        with self.assertRaisesRegex(ValueError, "systemd-service-runtime-invalid"):
            with mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
                 mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")):
                repair._systemd_service_command(["/bin/true"], [], unit=unit, runtime_seconds=0)
        with mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_systemctl_executable", return_value=Path("/usr/bin/systemctl")), \
             mock.patch.object(repair.subprocess, "run", side_effect=[
                 subprocess.CompletedProcess([], 5), subprocess.CompletedProcess([], 4),
                 subprocess.CompletedProcess([], 0, stdout="")
             ]) as run:
            repair._stop_systemd_unit(unit)
        self.assertEqual(run.call_args_list[1].args[0], ["/usr/bin/sudo", "-n", "/usr/bin/systemctl",
                                                         "--system", "--quiet", "is-active", unit])
        self.assertEqual(run.call_args_list[0].args[0], ["/usr/bin/sudo", "-n", "/usr/bin/systemctl",
                                                         "--system", "stop", unit])
        self.assertEqual(run.call_args_list[2].args[0], ["/usr/bin/sudo", "-n", "/usr/bin/systemctl",
                                                         "--system", "--quiet", "show", "--property=ControlGroup",
                                                         "--value", unit])
        with mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_systemctl_executable", return_value=Path("/usr/bin/systemctl")), \
             mock.patch.object(repair.subprocess, "run",
                               return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaisesRegex(ValueError, "linux-systemd-cleanup-failed"):
                repair._stop_systemd_unit(unit)

        # A failed stop command remains a cleanup failure; the exact command
        # above contains no unsupported --wait flag to hide the launcher error.

    def test_systemd_cleanup_requires_inactive_unit_and_empty_cgroup(self):
        unit = "symphony-existing-repair-1234-deadbeef"

        def cleanup(*results):
            with mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
                 mock.patch.object(repair, "_systemctl_executable", return_value=Path("/usr/bin/systemctl")), \
                 mock.patch.object(repair.subprocess, "run", side_effect=results) as run:
                repair._stop_systemd_unit(unit)
                return run

        with self.assertRaisesRegex(ValueError, "linux-systemd-cleanup-still-active"):
            cleanup(subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 0))
        with self.assertRaisesRegex(ValueError, "linux-systemd-cleanup-state-unavailable"):
            cleanup(subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 2))
        with self.assertRaisesRegex(ValueError, "linux-systemd-cleanup-cgroup-not-empty"):
            cleanup(subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 3),
                    subprocess.CompletedProcess([], 0, stdout="/repair.scope\n"))

        cleanup(subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 3),
                subprocess.CompletedProcess([], 0, stdout=""),
                subprocess.CompletedProcess([], 0, stdout="failed\n"))
        with self.assertRaisesRegex(ValueError, "linux-systemd-cleanup-still-active"):
            cleanup(subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 3),
                    subprocess.CompletedProcess([], 0, stdout=""),
                    subprocess.CompletedProcess([], 0, stdout="activating\n"))

    def test_systemd_network_sandbox_fails_on_address_inventory_churn_and_probe_errors(self):
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses", side_effect=[
                 [(socket.AF_INET, "192.168.12.116")], [(socket.AF_INET, "192.168.12.117")]
             ]), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")):
            with self.assertRaisesRegex(ValueError, "linux-local-network-addresses-changed"):
                repair._systemd_network_sandbox_command(["/bin/true"])

        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses", return_value=[]), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")):
            with self.assertRaisesRegex(ValueError, "linux-local-network-addresses-unavailable"):
                repair._systemd_network_sandbox_command(["/bin/true"])

        addresses = [(socket.AF_INET, "192.168.12.116")]
        completed = subprocess.CompletedProcess([], 1)
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses", side_effect=[addresses, addresses]), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_stop_systemd_unit") as stop, \
             mock.patch.object(repair.subprocess, "run", side_effect=OSError("systemd unavailable")):
            self.assertFalse(repair._systemd_network_boundary_available())
        self.assertTrue(stop.called)

    def test_network_boundary_probe_rejects_unavailable_and_ineffective_filters(self):
        executable = Path("/usr/bin/systemd-run")
        systemctl = Path("/usr/bin/systemctl")
        completed = lambda code: subprocess.CompletedProcess([], code)
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=executable), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair.subprocess, "run", return_value=completed(1)):
            self.assertFalse(repair._systemd_network_boundary_available())

        def simulated_systemd(denied_code, connect_denied):
            def run(command, **_kwargs):
                if command[0] == str(systemctl):
                    if "is-active" in command:
                        return completed(4)
                    if "show" in command:
                        return subprocess.CompletedProcess(command, 0, stdout="")
                    return completed(0)
                denied = any("IPAddressDeny=" in value for value in command)
                if not denied or connect_denied:
                    with socket.create_connection((command[-2], int(command[-1])), timeout=1):
                        pass
                return completed(denied_code if denied else 0)
            return run

        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=executable), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "127.0.0.1")]), \
             mock.patch.object(repair.subprocess, "run", side_effect=simulated_systemd(1, False)):
            self.assertTrue(repair._systemd_network_boundary_available())

        # A manager can accept IPAddressDeny while still allowing the connection;
        # that result is an unsupported boundary and must hold execution.
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=executable), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "127.0.0.1")]), \
             mock.patch.object(repair.subprocess, "run", side_effect=simulated_systemd(0, True)):
            self.assertFalse(repair._systemd_network_boundary_available())

    def test_network_and_workspace_safety_helpers_fail_closed_on_unproven_shapes(self):
        addresses = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.5", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.5", 0)),
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::1", 0, 0, 0)),
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("fe80::1%en0", 0, 0, 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("not-an-address", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("224.0.0.1", 0)),
        ]
        with mock.patch.object(repair.sys, "platform", "darwin"), \
             mock.patch.object(repair.socket, "getaddrinfo", return_value=addresses), \
             mock.patch.object(repair.socket, "gethostname", return_value="gem-host"):
            self.assertEqual(repair._local_host_addresses(), ((socket.AF_INET, "10.0.0.5"),))
        with mock.patch.object(repair.sys, "platform", "darwin"), \
             mock.patch.object(repair.socket, "getaddrinfo", side_effect=OSError("unavailable")):
            self.assertEqual(repair._local_host_addresses(), ())
        self.assertIn("10.0.0.5/32", repair._network_deny_entries("10.0.0.5"))
        self.assertIn("2001:db8::1/128", repair._network_deny_entries("2001:db8::1"))
        with mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "10.0.0.5")]):
            command = repair._systemd_network_sandbox_command(["/bin/true"])
        self.assertIn("--property=IPAddressDeny=10.0.0.5/32", command)

        with mock.patch.object(repair.os, "scandir", side_effect=OSError("unavailable")):
            with self.assertRaisesRegex(ValueError, "sandbox-workspace-scan-unavailable"):
                repair._sandbox_workspace_private_paths(self.workspace)
        with mock.patch.object(repair, "SANDBOX_WORKSPACE_SCAN_LIMIT", 0):
            with self.assertRaisesRegex(ValueError, "sandbox-workspace-scan-limit"):
                repair._sandbox_workspace_private_paths(self.workspace)
        with mock.patch.object(repair, "_read_admission_json", side_effect=OSError("unavailable")):
            self.assertIsNone(repair._task_admission_runtime_binding(time.time()))

    def test_workspace_scan_rejects_entry_failures_and_walks_unskipped_directories(self):
        nested = self.workspace / "source" / "nested"
        nested.mkdir(parents=True)
        (nested / ".env.local").write_text("secret", encoding="utf-8")
        (self.workspace / "node_modules").mkdir()
        (self.workspace / "node_modules" / ".env.local").write_text("ignored", encoding="utf-8")
        private = repair._sandbox_workspace_private_paths(self.workspace)
        self.assertIn(nested / ".env.local", private)
        self.assertNotIn(self.workspace / "node_modules" / ".env.local", private)

        entry = mock.Mock(path=str(self.workspace / "broken"), name="broken")
        entry.stat.side_effect = OSError("entry disappeared")
        with mock.patch.object(repair.os, "scandir", return_value=(entry,)):
            with self.assertRaisesRegex(ValueError, "sandbox-workspace-entry-unavailable"):
                repair._sandbox_workspace_private_paths(self.workspace)

    def test_selected_task_evidence_requires_one_successful_exact_check(self):
        task, _payload, _executable = self.provider_granted_fixture()
        handle = task["selected"]["handle"]
        check = {"__typename": "CheckRun", "name": handle,
                 "status": "COMPLETED", "conclusion": "SUCCESS"}
        evidence = repair._selected_check_evidence(
            task, {"statusCheckRollup": [check]}
        )
        self.assertEqual(evidence["check"], handle)
        context = {"__typename": "StatusContext", "context": handle, "state": "SUCCESS"}
        self.assertEqual(repair._selected_check_evidence(
            task, {"statusCheckRollup": [context]}
        )["result"], "SUCCESS")
        for rows in (
            [{"__typename": "CheckRun", "name": handle,
              "status": "COMPLETED", "conclusion": "FAILURE"}],
            [{"__typename": "Other", "name": handle}],
            [check, check],
        ):
            with self.subTest(rows=rows):
                self.assertIsNone(repair._selected_check_evidence(
                    task, {"statusCheckRollup": rows}
                ))

    def test_source_evaluation_preserves_unavailable_observation_and_unknown_check(self):
        task, payload, _executable = self.provider_granted_fixture()
        failing = lambda _identifier: (_ for _ in ()).throw(OSError("tracker unavailable"))
        evaluation = repair._evaluate_source_bound_target(
            task, payload, HEAD, "b" * 40, failing, lambda _repo: [], True
        )
        self.assertEqual(evaluation["reason"], "target-observation-unavailable")
        self.assertEqual(evaluation["taskResolved"], False)
        self.assertEqual(evaluation["digest"], repair._source_evaluation_digest(evaluation))

    def test_sandbox_fails_closed_when_required_system_path_is_unavailable(self):
        _task, payload, executable = self.provider_granted_fixture()
        with mock.patch.object(repair, "_bwrap_executable", return_value=Path("/usr/bin/bwrap")), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_root_owned_system_path", return_value=None):
            with self.assertRaisesRegex(ValueError, "sandbox-system-path-unavailable:/usr"):
                repair._sandboxed_grok_command([str(executable)], payload,
                                               payload["providerGrant"], executable)

    def test_sandbox_requires_controller_owned_resolver_config(self):
        _task, payload, executable = self.provider_granted_fixture()
        with mock.patch.object(repair, "_bwrap_executable", return_value=Path("/usr/bin/bwrap")), \
             mock.patch.object(repair, "_systemd_run_executable", return_value=Path("/usr/bin/systemd-run")), \
             mock.patch.object(repair, "_sudo_executable", return_value=Path("/usr/bin/sudo")), \
             mock.patch.object(repair.sys, "platform", "linux"), \
             mock.patch.object(repair, "_local_host_addresses",
                               return_value=[(socket.AF_INET, "10.0.0.5")]), \
             mock.patch.object(repair, "_sandbox_resolver_path",
                               side_effect=repair.ExecutionSandboxUnavailable("resolver missing")):
            with self.assertRaisesRegex(ValueError, "resolver missing"):
                repair._sandboxed_grok_command(
                    [str(executable)], payload, payload["providerGrant"], executable
                )

    def test_live_execution_holds_without_maintained_sandbox_before_claim(self):
        task, _payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        with mock.patch.object(repair, "_bwrap_executable", return_value=None), \
             mock.patch.object(repair, "_systemd_network_boundary_available", return_value=True), \
             mock.patch.object(repair, "read_task_execution_admission", return_value=repair.read_current_execution_admission()):
            result = self.run_isolated(task)
        self.assertEqual(result["status"], "held")
        self.assertIn("linux-bwrap-unavailable", result["reason"])
        self.assertFalse((self.root / f"{IDENT}.claim").exists())

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux mount namespace")
    def test_linux_sandbox_hides_host_files_but_keeps_exact_auth_and_workspace(self):
        if repair._bwrap_executable() is None:
            self.skipTest("root-owned bwrap is unavailable")
        if not repair._systemd_network_boundary_available():
            self.skipTest("systemd loopback boundary is unavailable")
        self.stack.enter_context(mock.patch.dict(os.environ, {
            "SUMMER_BOTTLENECK_SIGNING_PRIVATE_KEY": "private-fixture",
        }))
        _task, payload, executable = self.provider_granted_fixture()
        outside_secret = self.tmp / "outside-secret"
        outside_marker = self.tmp / "outside-marker"
        workspace_probe = self.workspace / "sandbox-probe.txt"
        mcp_config = self.workspace / ".mcp.json"
        mcp_config.write_text('{"mcpServers":{"leak":"company-secret"}}', encoding="utf-8")
        workspace_secret = self.workspace / ".env.local"
        workspace_secret.write_text("company-secret", encoding="utf-8")
        workspace_socket_path = self.workspace / "company.sock"
        workspace_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        workspace_socket.bind(str(workspace_socket_path))
        workspace_socket.listen(1)
        protected = [self.tmp / name for name in ("signing.key", "assignment.json", "attestation.json")]
        for path in protected:
            path.write_text("company-secret", encoding="utf-8")
        unix_socket_path = self.tmp / "company.sock"
        unix_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        unix_socket.bind(str(unix_socket_path))
        unix_socket.listen(1)
        local_listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        local_listener.bind(("127.0.0.1", 0))
        local_listener.listen(1)
        local_listener.settimeout(2)
        local_port = local_listener.getsockname()[1]
        accept_thread = threading.Thread(target=lambda: _accept_once(local_listener), daemon=True)
        accept_thread.start()
        outside_secret.write_text("company-secret", encoding="utf-8")
        probe = self.tmp / "probe-cli"
        probe.write_text(
            "#!/bin/sh\n"
            "secret=$1; marker=$2; result=$3; auth=$4; signing=$5; assignment=$6; attestation=$7; socket_path=$8; workspace_secret=$9; workspace_socket=${10}; port=${11}\n"
            "if test -f \"$secret\"; then printf visible > \"$result\"; else printf hidden > \"$result\"; fi\n"
            "if cat \"$auth\" >/dev/null 2>&1; then printf auth >> \"$result\"; fi\n"
            "if grep -q company-secret .mcp.json 2>/dev/null; then printf mcpvisible >> \"$result\"; else printf mcpblocked >> \"$result\"; fi\n"
            "for path in \"$signing\" \"$assignment\" \"$attestation\" \"$socket_path\"; do if test -e \"$path\"; then printf visible >> \"$result\"; else printf hidden >> \"$result\"; fi; done\n"
            "if grep -q company-secret \"$workspace_secret\" 2>/dev/null; then printf visible >> \"$result\"; else printf hidden >> \"$result\"; fi\n"
            "if test -S \"$workspace_socket\"; then printf visible >> \"$result\"; else printf hidden >> \"$result\"; fi\n"
            "if python3 - \"$port\" <<'PY' >/dev/null 2>&1\n"
            "import socket, sys\n"
            "with socket.create_connection(('127.0.0.1', int(sys.argv[1])), timeout=1): pass\n"
            "PY\n"
            "then printf localvisible >> \"$result\"; else printf localblocked >> \"$result\"; fi\n"
            "python3 - <<'PY' || exit 1\n"
            "import os, stat\n"
            "assert os.statvfs('/proc').f_flag & os.ST_RDONLY\n"
            "assert 'SUMMER_BOTTLENECK_SIGNING_PRIVATE_KEY' not in os.environ\n"
            "for path in ('/proc/kcore', '/proc/kallsyms', '/proc/kmsg'):\n"
            "    assert stat.S_ISCHR(os.stat(path).st_mode)\n"
            "    assert os.stat(path).st_rdev == os.stat('/dev/null').st_rdev\n"
            "PY\n"
            "printf procrestricted >> \"$result\"\n"
            "touch \"$marker\"\n",
            encoding="utf-8",
        )
        probe.chmod(0o700)
        command, child_env = repair._sandboxed_grok_command(
            [str(probe), str(outside_secret), str(outside_marker), str(workspace_probe),
             payload["providerGrant"]["authStatePath"], *map(str, protected), str(unix_socket_path),
             str(workspace_secret), str(workspace_socket_path), str(local_port)],
            payload, payload["providerGrant"], probe,
        )
        try:
            result = repair._run_bounded(
                command, cwd=str(self.workspace), env=child_env, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5, pass_fds=(),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                workspace_probe.read_text(encoding="utf-8"),
                "hiddenauthmcpblockedhiddenhiddenhiddenhiddenhiddenhiddenlocalblockedprocrestricted",
            )
            self.assertFalse(outside_marker.exists())
        finally:
            local_listener.close()
            unix_socket.close()
            workspace_socket.close()
            accept_thread.join(timeout=3)

    def test_bounded_runner_stops_descendants_without_touching_unrelated_session(self):
        with tempfile.TemporaryDirectory() as directory:
            descendant_path = Path(directory) / "descendant.pid"
            child = ("import os,pathlib,signal,time; c=os.fork(); "
                     f"p=pathlib.Path({str(descendant_path)!r}); "
                     "(p.write_text(str(os.getpid())),signal.signal(signal.SIGTERM,signal.SIG_IGN)) if c==0 else None; "
                     "time.sleep(10)")
            unrelated = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(10)"], start_new_session=True)
            try:
                with self.assertRaises(subprocess.TimeoutExpired):
                    repair._run_bounded([sys.executable, "-c", child], stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, timeout=0.5)
                self.assertIsNone(unrelated.poll())
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline and not descendant_path.exists():
                    time.sleep(0.02)
                self.assertTrue(descendant_path.is_file())
                while time.monotonic() < deadline:
                    try:
                        os.kill(int(descendant_path.read_text()), 0)
                    except ProcessLookupError:
                        break
                    time.sleep(0.02)
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(descendant_path.read_text()), 0)
            finally:
                unrelated.terminate()
                unrelated.wait(timeout=5)

    @unittest.skipUnless(os.name == "posix", "requires process sessions")
    def test_bounded_runner_cleans_descendant_after_successful_leader_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            descendant_path = Path(directory) / "descendant.pid"
            child = ("import os,pathlib,signal,time; c=os.fork(); "
                     f"p=pathlib.Path({str(descendant_path)!r}); "
                     "(signal.signal(signal.SIGTERM,signal.SIG_IGN),"
                     "p.write_text(str(os.getpid())),os.close(1),os.close(2),time.sleep(10)) if c==0 else os._exit(0)")
            result = repair._run_bounded([sys.executable, "-c", child],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                         text=True, timeout=2)
            self.assertEqual(result.returncode, 0)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and not descendant_path.exists():
                time.sleep(0.02)
            self.assertTrue(descendant_path.is_file())
            descendant_pid = int(descendant_path.read_text())
            while time.monotonic() < deadline:
                try:
                    os.kill(descendant_pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.02)
            with self.assertRaises(ProcessLookupError):
                os.kill(descendant_pid, 0)

    @unittest.skipUnless(os.name == "posix", "requires process sessions")
    def test_bounded_runner_stops_exact_service_when_launcher_exits_early(self):
        with tempfile.TemporaryDirectory() as directory:
            descendant_path = Path(directory) / "service-descendant.pid"
            stopped_path = Path(directory) / "service-stopped"
            child = ("import os,pathlib,time; c=os.fork(); "
                     f"p=pathlib.Path({str(descendant_path)!r}); "
                     "(p.write_text(str(os.getpid())),time.sleep(10)) if c==0 else os._exit(7)")

            def stop_service():
                stopped_path.write_text("stopped", encoding="utf-8")

            with mock.patch.object(repair, "_systemd_cleanup_callback", return_value=stop_service):
                result = repair._run_bounded(
                    [sys.executable, "-c", child], stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, timeout=2,
                )
            self.assertEqual(result.returncode, 7)
            self.assertEqual(stopped_path.read_text(encoding="utf-8"), "stopped")
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and not descendant_path.exists():
                time.sleep(0.02)
            self.assertTrue(descendant_path.is_file())
            # SIGKILL delivery to an orphaned descendant is immediate, but
            # reaping is asynchronous: the killed process lingers as a zombie
            # until its reaper (init on the runner) collects it, and
            # os.kill(pid, 0) keeps succeeding until then. Mirror the
            # descendants_without_touching test and poll for the reaped state
            # instead of asserting it instantaneously.
            while time.monotonic() < deadline:
                try:
                    os.kill(int(descendant_path.read_text()), 0)
                except ProcessLookupError:
                    break
                time.sleep(0.02)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(descendant_path.read_text()), 0)

    def test_bounded_runner_drains_large_stdout_and_stderr_with_bounded_capture(self):
        child = ("import sys; data='x'*262144; sys.stdout.write(data); sys.stdout.flush(); "
                 "sys.stderr.write(data); sys.stderr.flush()")
        result = repair._run_bounded([sys.executable, "-c", child],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertGreater(len(result.stdout.encode()), repair.MAX_PROVIDER_OUTPUT_BYTES)
        self.assertGreater(len(result.stderr.encode()), repair.MAX_PROVIDER_OUTPUT_BYTES)
        self.assertLessEqual(len(result.stdout.encode()), repair.MAX_PROVIDER_OUTPUT_BYTES + 4)
        self.assertLessEqual(len(result.stderr.encode()), repair.MAX_PROVIDER_OUTPUT_BYTES + 4)

    def test_bounded_runner_supports_binary_and_uncaptured_streams(self):
        binary = repair._run_bounded(
            [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'ok')"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5
        )
        self.assertEqual(binary.returncode, 0)
        self.assertEqual(binary.stdout, b"ok")
        uncaptured = repair._run_bounded(
            [sys.executable, "-c", "pass"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5
        )
        self.assertEqual(uncaptured.returncode, 0)
        self.assertIsNone(uncaptured.stdout)
        self.assertIsNone(uncaptured.stderr)

    def test_bounded_runner_times_out_without_captured_streams(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            repair._run_bounded(
                [sys.executable, "-c", "import time; time.sleep(10)"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=0.2
            )

    def test_process_group_signal_falls_back_when_group_lookup_is_unavailable(self):
        process = mock.Mock(pid=1234)
        process.send_signal.side_effect = OSError("gone")
        with mock.patch.object(repair.os, "getpgid", side_effect=OSError("gone")):
            repair._signal_owned_process_group(process, signal.SIGTERM)
        process.send_signal.assert_called_once_with(signal.SIGTERM)

    def test_terminate_process_retains_leader_pid_when_group_lookup_fails(self):
        process = mock.Mock(pid=1234)
        process.poll.return_value = 0
        with mock.patch.object(repair.os, "getpgid", side_effect=OSError("gone")), \
             mock.patch.object(repair, "_signal_owned_process_group") as signal_group:
            repair._terminate_owned_process(process)
        self.assertEqual(signal_group.call_args_list, [
            mock.call(process, signal.SIGTERM, 1234),
            mock.call(process, signal.SIGKILL, 1234),
        ])

    def test_terminate_process_escalates_after_term_grace_expires(self):
        process = mock.Mock(pid=1234)
        process.wait.side_effect = [subprocess.TimeoutExpired("repair", 5)]
        process.poll.return_value = 0
        with mock.patch.object(repair, "_signal_owned_process_group") as signal_group:
            repair._terminate_owned_process(process, 1234)
        self.assertEqual(signal_group.call_args_list, [
            mock.call(process, signal.SIGTERM, 1234),
            mock.call(process, signal.SIGKILL, 1234),
        ])
        process.wait.assert_called_once_with(timeout=5)

    def test_bounded_runner_terminates_when_selector_setup_fails(self):
        with mock.patch.object(repair.selectors, "DefaultSelector",
                               side_effect=RuntimeError("selector unavailable")), \
             mock.patch.object(repair, "_terminate_owned_process",
                               wraps=repair._terminate_owned_process) as terminate:
            with self.assertRaisesRegex(RuntimeError, "selector unavailable"):
                repair._run_bounded(
                    [sys.executable, "-c", "import time; time.sleep(10)"],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5
                )
        self.assertTrue(terminate.called)

    def test_bounded_runner_terminates_when_selector_drain_fails(self):
        class BrokenSelector:
            def __init__(self):
                self.fds = []

            def register(self, fd, _events, _name):
                self.fds.append(fd)
                if len(self.fds) == 1:
                    raise RuntimeError("selector register unavailable")

            def unregister(self, _fd):
                pass

            def close(self):
                pass

        with mock.patch.object(repair.selectors, "DefaultSelector", return_value=BrokenSelector()), \
             mock.patch.object(repair, "_terminate_owned_process",
                               wraps=repair._terminate_owned_process) as terminate:
            with self.assertRaisesRegex(RuntimeError, "selector register unavailable"):
                repair._run_bounded(
                    [sys.executable, "-c", "import time; time.sleep(10)"],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5
                )
        self.assertTrue(terminate.called)

    def test_bounded_runner_terminates_when_selector_select_fails(self):
        class BrokenSelector:
            def register(self, _fd, _events, _name):
                pass

            def select(self, _timeout):
                raise RuntimeError("selector select unavailable")

            def unregister(self, _fd):
                pass

            def close(self):
                pass

        with mock.patch.object(repair.selectors, "DefaultSelector", return_value=BrokenSelector()), \
             mock.patch.object(repair, "_terminate_owned_process",
                               wraps=repair._terminate_owned_process) as terminate:
            with self.assertRaisesRegex(RuntimeError, "selector select unavailable"):
                repair._run_bounded(
                    [sys.executable, "-c", "import time; time.sleep(10)"],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5
                )
        self.assertTrue(terminate.called)

    def test_bounded_runner_preserves_drain_failure_when_cleanup_fails(self):
        original_cleanup = repair._terminate_owned_process

        def cleanup_then_fail(process, pgid):
            original_cleanup(process, pgid)
            raise OSError("cleanup unavailable")

        with mock.patch.object(repair.selectors, "DefaultSelector",
                               side_effect=RuntimeError("selector unavailable")), \
             mock.patch.object(repair, "_terminate_owned_process",
                               side_effect=cleanup_then_fail):
            with self.assertRaisesRegex(RuntimeError, "selector unavailable") as raised:
                repair._run_bounded(
                    [sys.executable, "-c", "pass"],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5
                )
        self.assertIsInstance(raised.exception.__cause__, OSError)
        self.assertEqual(str(raised.exception.__cause__), "cleanup unavailable")

    def test_bounded_runner_terminates_when_selector_read_fails(self):
        class BrokenSelector:
            def __init__(self):
                self.fd = None
                self.name = None

            def register(self, fd, _events, name):
                self.fd, self.name = fd, name

            def select(self, _timeout):
                return [(mock.Mock(fd=self.fd, data=self.name), 1)]

            def unregister(self, _fd):
                pass

            def close(self):
                pass

        selector = BrokenSelector()
        original_read = repair.os.read

        def fail_selected_pipe(fd, length):
            if fd == selector.fd:
                raise OSError("pipe unavailable")
            return original_read(fd, length)

        with mock.patch.object(repair.selectors, "DefaultSelector", return_value=selector), \
             mock.patch.object(repair.os, "read", side_effect=fail_selected_pipe), \
             mock.patch.object(repair, "_terminate_owned_process",
                               wraps=repair._terminate_owned_process) as terminate:
            with self.assertRaisesRegex(OSError, "pipe unavailable"):
                repair._run_bounded(
                    [sys.executable, "-c", "import time; time.sleep(10)"],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5
                )
        self.assertTrue(terminate.called)

    def test_observer_binds_exact_target_and_keeps_provider_unknown_without_quota_source(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "FAILURE"}]
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=checks) as fetch_checks:
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"],
                source_revision=payload["generation"],
            )
        self.assertIsInstance(observed, dict)
        self.assertEqual(observed["schema"], repair.TASK_ADMISSIONS_SCHEMA)
        self.assertEqual(observed["assignmentDigest"], repair.assignment_digest(payload))
        self.assertEqual(observed["sourceRevision"], payload["generation"])
        self.assertEqual(observed["runtimeRevision"], "c" * 40)
        self.assertEqual(observed["runtimeGeneration"], "e" * 64)
        self.assertEqual(observed["runtimeInvocationId"], "f" * 32)
        self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")
        self.assertEqual(observed["providerEligibility"]["reason"],
                         "provider-included-allowance-unavailable")
        self.assertIsNone(observed["providerObservation"])
        self.assertEqual(observed["downstreamHealth"]["state"], "ALLOWED")
        self.assertEqual(observed["downstreamHealth"]["reason"], "observed-target-available")
        self.assertRegex(observed["downstreamHealth"]["sourceDigest"], r"^[a-f0-9]{64}$")
        self.assertEqual(fetch_checks.call_args_list, [mock.call("JovieInc/Jovie", payload["pr"])] * 2)

    def test_observer_returns_unknown_for_crossed_or_ambiguous_target(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        with mock.patch.object(controller, "_pr_status_check_rollup", return_value=[]):
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"], source_revision="c" * 40,
            )
        self.assertEqual(observed["sourceRevision"], "c" * 40)
        self.assertEqual(observed["providerEligibility"]["reason"],
                         "task-source-binding-mismatch")
        self.assertEqual(observed["downstreamHealth"]["reason"],
                         "task-source-binding-mismatch")

        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_complete_open_prs", return_value=[self.pr, self.pr.copy()]), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=[{
                 "__typename": "CheckRun", "name": task["selected"]["handle"],
                 "status": "COMPLETED", "conclusion": "SUCCESS",
             }]):
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"], source_revision=payload["generation"],
            )
        self.assertEqual(observed["downstreamHealth"]["state"], "UNKNOWN")
        self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")

    def test_observer_rejects_check_when_pr_head_changes_between_reads(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        changed = {**self.pr, "headRefOid": "c" * 40}
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_complete_open_prs",
                               side_effect=[[self.pr], [changed]]), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=[{
                 "__typename": "CheckRun", "name": task["selected"]["handle"],
                 "status": "COMPLETED", "conclusion": "SUCCESS",
             }]):
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"],
                source_revision=payload["generation"],
            )
        self.assertEqual(observed["downstreamHealth"]["state"], "UNKNOWN")
        self.assertEqual(observed["downstreamHealth"]["reason"],
                         "task-target-observation-unavailable")

    def test_observer_rejects_runtime_restart_after_authenticated_reads(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        runtime = ("c" * 40, "e" * 64, "f" * 32)
        restarted = ("c" * 40, "d" * 64, "f" * 32)
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "SUCCESS"}]
        with mock.patch.object(repair, "_task_admission_runtime_binding",
                               side_effect=[runtime, restarted]), \
             mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=checks):
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"],
                source_revision=payload["generation"],
            )
        self.assertEqual(observed["downstreamHealth"]["state"], "UNKNOWN")
        self.assertEqual(observed["downstreamHealth"]["reason"],
                         "task-runtime-binding-changed")
        self.assertEqual(observed["runtimeGeneration"], "d" * 64)

    def test_observer_holds_when_assignment_is_consumed_after_target_read(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "SUCCESS"}]
        def claimed_during_read(*_args):
            claim = self.root / f"{IDENT}.claim"
            if not claim.exists():
                repair.exclusive_write(claim, {"taskKey": task["taskKey"]})
            return checks
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_pr_status_check_rollup", side_effect=claimed_during_read):
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"],
                source_revision=payload["generation"],
            )
        self.assertEqual(observed["providerEligibility"]["state"], "UNKNOWN")
        self.assertEqual(observed["providerEligibility"]["reason"],
                         "provider-quota-observation-unavailable")
        self.assertEqual(observed["downstreamHealth"]["state"], "UNKNOWN")
        self.assertEqual(observed["downstreamHealth"]["reason"],
                         "task-observation-expired")

    def test_observer_holds_when_runtime_attestation_disappears_after_target_read(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        runtime = ("c" * 40, "e" * 64, "f" * 32)
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "SUCCESS"}]
        with mock.patch.object(repair, "_task_admission_runtime_binding",
                               side_effect=[runtime, None]), \
             mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=checks):
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"],
                source_revision=payload["generation"],
            )
        self.assertIsNone(observed)

    def test_observer_does_not_probe_after_assignment_is_consumed(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        claim = self.root / f"{IDENT}.claim"
        claim.write_text("claimed\n", encoding="utf-8")
        claim.chmod(0o600)
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_fetch_single_issue") as fetch_issue, \
             mock.patch.object(controller, "_complete_open_prs") as fetch_prs, \
             mock.patch.object(controller, "_pr_status_check_rollup") as fetch_checks:
            observed = repair.observe_task_admissions(
                IDENT, controller.__file__, selected_id=task["selected"]["id"],
                selected_handle=task["selected"]["handle"], source_revision=payload["generation"],
            )
        self.assertIsNone(observed)
        fetch_issue.assert_not_called()
        fetch_prs.assert_not_called()
        fetch_checks.assert_not_called()

    def test_observer_fail_closed_paths_cover_runtime_controller_and_check_shapes(self):
        task, payload, _executable = self.provider_granted_fixture()
        self.write_admission_receipts()
        kwargs = {
            "selected_id": task["selected"]["id"],
            "selected_handle": task["selected"]["handle"],
            "source_revision": payload["generation"],
        }
        with mock.patch.object(repair, "_task_admission_runtime_binding", return_value=None):
            self.assertIsNone(repair.observe_task_admissions(IDENT, controller.__file__, **kwargs))
        self.write_admission_receipts()
        with mock.patch.object(repair, "_task_admission_target_observation", side_effect=ValueError("incomplete")):
            observed = repair.observe_task_admissions(IDENT, controller.__file__, **kwargs)
        self.assertEqual(observed["downstreamHealth"]["state"], "UNKNOWN")
        self.assertIsNone(repair.observe_task_admissions(
            IDENT, controller.__file__, selected_id="unsupported-class",
            selected_handle=kwargs["selected_handle"], source_revision=payload["generation"],
        ))

        loaded = repair._task_admission_controller_module(controller.__file__)
        self.assertTrue(callable(loaded._fetch_single_issue))
        self.assertIsNone(repair._task_admission_selected_check(
            kwargs["selected_id"], kwargs["selected_handle"], None
        ))
        self.assertIsNotNone(repair._task_admission_selected_check(
            kwargs["selected_id"], kwargs["selected_handle"], [
                None,
                {"__typename": "Other", "name": kwargs["selected_handle"]},
                {"__typename": "CheckRun", "name": "other", "status": "COMPLETED",
                 "conclusion": "SUCCESS"},
                {"__typename": "StatusContext", "context": kwargs["selected_handle"],
                 "state": "SUCCESS"},
            ]
        ))
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_fetch_single_issue", return_value=None), \
             mock.patch.object(controller, "_complete_open_prs", return_value=[]):
            self.assertIsNone(repair._task_admission_target_observation(
                payload, controller.__file__, kwargs["selected_id"], kwargs["selected_handle"]
            ))
        with mock.patch.object(repair, "_task_admission_controller_module", return_value=controller), \
             mock.patch.object(controller, "_fetch_single_issue", return_value=self.issue), \
             mock.patch.object(controller, "_complete_open_prs", return_value=[self.pr]), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=[]):
            self.assertIsNone(repair._task_admission_target_observation(
                payload, controller.__file__, kwargs["selected_id"], kwargs["selected_handle"]
            ))

    def test_discovery_excludes_claimed_and_terminal_assignments(self):
        _task, payload, _executable = self.provider_granted_fixture()
        self.assertEqual(repair.candidates(controller.__file__), [payload])
        claim = self.root / f"{IDENT}.claim"
        claim.write_text("claimed\n", encoding="utf-8")
        claim.chmod(0o600)
        self.assertEqual(repair.candidates(controller.__file__), [])
        with self.assertRaisesRegex(ValueError, "assignment-consumed"):
            repair.load_validated_candidate(IDENT, controller.__file__)
        claim.unlink()
        execution = self.root / f"{IDENT}.execution.json"
        execution.write_text("terminal\n", encoding="utf-8")
        execution.chmod(0o600)
        self.assertEqual(repair.candidates(controller.__file__), [])
        with self.assertRaisesRegex(ValueError, "assignment-consumed"):
            repair.load_validated_candidate(IDENT, controller.__file__)

    def test_existing_controller_consumes_v3_without_generic_dispatch_or_tracker_write(self):
        task, executor = self.isolated_fixture()
        with mock.patch.object(controller.sys, "stdin", io.StringIO(json.dumps(task))), \
             mock.patch.object(controller, "reconcile") as generic, \
             mock.patch.object(controller, "_control") as control:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(controller.owned_repair_command(), 0)
            self.assertEqual(json.loads(output.getvalue())["status"], "held")
            generic.assert_not_called()
            control.assert_not_called()
        self.assertFalse((self.root / f"{IDENT}.claim").exists())

    def test_owned_inventory_adds_status_rows_only_to_exact_target_pr(self):
        task, _executor = self.isolated_fixture()
        other = {**self.pr, "number": self.pr["number"] + 1}
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "SUCCESS"}]
        with mock.patch.object(controller, "_complete_open_prs", return_value=[self.pr, other]), \
             mock.patch.object(controller, "_pr_status_check_rollup", return_value=checks):
            rows = controller._owned_repair_pr_inventory(task, "JovieInc/Jovie")
        self.assertEqual(rows[0]["statusCheckRollup"], checks)
        self.assertNotIn("statusCheckRollup", rows[1])

    def test_isolated_mode_never_enters_native_or_generic_fallback(self):
        task, executor = self.isolated_fixture()
        with self.assertRaisesRegex(ValueError, "assignment-schema-invalid"):
            repair.load(IDENT, controller.__file__)
        self.assertEqual(controller.check_admission(IDENT), 1)
        self.assertEqual(self.run_isolated(task)["reason"], "qualified-isolated-repair-executor-unavailable")
        self.assertFalse((self.root / f"{IDENT}.claim").exists())
        executor.execute.assert_not_called()

    def test_owned_status_read_rejects_head_change_between_inventory_and_checks(self):
        self.stack.enter_context(mock.patch.object(controller, "_pr_status_check_rollup", REAL_STATUS_CHECK_READER))
        task, _executor = self.isolated_fixture()
        checks = [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                   "status": "COMPLETED", "conclusion": "SUCCESS"}]
        with mock.patch.object(controller, "_complete_open_prs", return_value=[self.pr]), \
             mock.patch.object(controller, "_gh_json", return_value={
                 "headRefOid": "b" * 40, "statusCheckRollup": checks,
             }) as reader:
            self.assertEqual(controller._owned_repair_pr_inventory(task, "JovieInc/Jovie"), [self.pr])
            self.assertIn("headRefOid,statusCheckRollup", reader.call_args.args[0])
            reader.return_value["headRefOid"] = self.pr["headRefOid"]
            self.assertEqual(controller._owned_repair_pr_inventory(task, "JovieInc/Jovie")[0]["statusCheckRollup"], checks)
        for rows in ([self.pr, self.pr], [{**self.pr, "headRefOid": None}]):
            with mock.patch.object(controller, "_complete_open_prs", return_value=rows):
                self.assertEqual(controller._owned_repair_pr_inventory(task, "JovieInc/Jovie"), rows)
        with mock.patch.object(controller, "_complete_open_prs", return_value=None):
            self.assertIsNone(controller._owned_repair_pr_inventory(task, "JovieInc/Jovie"))
        with mock.patch.object(controller, "_complete_open_prs", return_value=[self.pr]):
            self.assertEqual(controller._owned_repair_pr_inventory({}, "JovieInc/Jovie"), [self.pr])
        for response in (None, {}, {"statusCheckRollup": []}):
            with mock.patch.object(controller, "_gh_json", return_value=response):
                expected = response.get("statusCheckRollup") if isinstance(response, dict) else None
                self.assertEqual(controller._pr_status_check_rollup("JovieInc/Jovie", 1), expected)

    def test_isolated_repair_claims_once_under_real_shared_lease(self):
        task, executor = self.isolated_fixture()
        def execute(*args, lease_fd):
            self.assertEqual(lease_fd, 9)
            self.assertEqual(os.fstat(9).st_ino, (self.leases / f"{IDENT}.lock").stat().st_ino)
            code = "import fcntl,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)"
            self.assertNotEqual(subprocess.run(["python3", "-c", code, str(self.leases / f"{IDENT}.lock")], capture_output=True).returncode, 0)
            return executor.execute.return_value
        executor.execute.side_effect = execute
        self.assertEqual(self.run_isolated(task, executor)["status"], "succeeded")
        self.assertEqual(self.run_isolated(task, executor)["status"], "succeeded")
        self.assertEqual(executor.execute.call_count, 1)
        execution = json.loads((self.root / f"{IDENT}.execution.json").read_text())["result"]
        self.assertEqual(execution["execution"]["verification"]["claimRecorded"], True)
        self.assertTrue((self.root / f"{IDENT}.acceptance.json").is_file())
        self.assertEqual(json.loads((self.root / f"{IDENT}.run.json").read_text())["status"], "succeeded")

    def test_isolated_repair_keeps_unknown_outcome_claim_after_executor_crash(self):
        task, executor = self.isolated_fixture()
        executor.execute.side_effect = OSError("uncertain executor result")
        with self.assertRaises(OSError):
            self.run_isolated(task, executor)
        self.assertTrue((self.root / f"{IDENT}.acceptance.json").is_file())
        self.assertEqual(json.loads((self.root / f"{IDENT}.run.json").read_text())["status"], "started")
        payload = repair.read_private(self.root / f"{IDENT}.json")
        with mock.patch.object(repair.time, "time", return_value=payload["expiresAt"] + 1):
            self.assertEqual(self.run_isolated(task, executor)["reason"], "isolated-repair-claimed-outcome-unknown")
        self.assertEqual(executor.execute.call_count, 1)
        recovery = json.loads((self.root / f"{IDENT}.recovery.json").read_text())
        self.assertEqual(recovery["state"], "unknown")

    def test_isolated_repair_replays_correlated_result_after_expiry_without_rerun(self):
        task, executor = self.isolated_fixture()
        first = self.run_isolated(task, executor)
        payload = repair.read_private(self.root / f"{IDENT}.json")
        self.assertEqual(repair.candidates(controller.__file__), [])
        with mock.patch.object(repair.time, "time", return_value=payload["expiresAt"] + 1):
            replay = self.run_isolated(task, executor)
        self.assertEqual(replay, first)
        self.assertEqual(executor.execute.call_count, 1)

    def test_changed_head_without_task_acceptance_is_recorded_but_unverified(self):
        task, executor = self.isolated_fixture()
        executor.execute.return_value["_executionObservation"]["taskAccepted"] = False
        result = self.run_isolated(task, executor)
        self.assertEqual((result["status"], result["execution"]["verification"]["headChanged"],
                          result["execution"]["verification"]["taskAccepted"]), ("failed", True, False))

    def test_changed_head_with_worker_marker_but_unfixed_task_stays_unverified(self):
        task, payload, executable = self.provider_granted_fixture()
        acceptance = repair.task_acceptance_digest(task)
        runner = mock.Mock(return_value=mock.Mock(
            returncode=0,
            stdout=f"changed\n{repair.TASK_ACCEPTANCE_MARKER} {acceptance}\n",
            stderr="",
        ))
        adapter = repair.GrokOwnedRepairExecutor(run=runner)
        eligibility = adapter.qualify(task, payload)
        with mock.patch.dict(os.environ, {"SYMPHONY_ISSUE_LEASE_FD": "9"}), \
             mock.patch.object(repair, "_git_head", side_effect=[payload["head"], "b" * 40]):
            result = self.run_isolated(task, adapter, resolved=False, expected_final_head="b" * 40)
        self.assertEqual(result, {"status": "held", "reason": "owned-repair-exact-head-checks-pending"})
        self.assertFalse((self.root / f"{IDENT}.execution.json").exists())

    def test_clean_mergeable_changed_head_without_selected_check_stays_unverified(self):
        task, executor = self.isolated_fixture()
        result = self.run_isolated(task, executor, resolved=True, selected_check=False)
        self.assertEqual(result, {"status": "held", "reason": "owned-repair-exact-head-checks-pending"})
        self.assertTrue((self.root / f"{IDENT}.pending-result.json").exists())
        self.assertFalse((self.root / f"{IDENT}.execution.json").exists())

    def resolved_pr(self, task, *, head="b" * 40):
        return {**self.pr, "headRefOid": head, "mergeStateStatus": "CLEAN", "mergeable": "MERGEABLE",
                "statusCheckRollup": [{"__typename": "CheckRun", "name": task["selected"]["handle"],
                                       "status": "COMPLETED", "conclusion": "SUCCESS"}]}

    def resume_pending(self, task, prs):
        return repair.execute_isolated(task, controller.__file__, lambda _: self.issue, lambda _: prs)

    def test_pending_result_resumes_exact_checks_without_a_second_provider_turn(self):
        task, executor = self.isolated_fixture()
        self.assertEqual(self.run_isolated(task, executor, selected_check=False)["status"], "held")
        # An intervening new-work/push hold does not prevent read-only reconciliation.
        fleet, _concurrency, _attestation = self.write_admission_receipts()
        fleet["remediationAdmission"]["pushAllowed"] = False
        self.admission_paths["ADMISSION_FLEET_PATH"].write_text(json.dumps(fleet))
        result = self.resume_pending(task, [self.resolved_pr(task)])
        self.assertEqual(result["status"], "succeeded")
        self.assertTrue(result["execution"]["verification"]["taskAccepted"])
        self.assertEqual(self.resume_pending(task, [self.resolved_pr(task)]), result)
        self.assertEqual(executor.execute.call_count, 1)

    def test_pending_result_names_missing_push_and_never_accepts_stale_head_checks(self):
        task, executor = self.isolated_fixture()
        self.run_isolated(task, executor, selected_check=False)
        result = self.resume_pending(task, [self.resolved_pr(task, head=task["existingRepair"]["head"])])
        self.assertEqual(result, {"status": "held", "reason": "owned-repair-host-push-required"})
        self.assertEqual(executor.execute.call_count, 1)
        self.assertFalse((self.root / f"{IDENT}.execution.json").exists())

    def test_pending_result_deadline_records_failure_without_rerunning(self):
        task, executor = self.isolated_fixture()
        self.run_isolated(task, executor, selected_check=False)
        payload = repair.read_private(self.root / f"{IDENT}.json")
        with mock.patch.object(repair.time, "time", return_value=payload["expiresAt"] + 1):
            result = self.resume_pending(task, [self.pr])
            self.assertEqual((result["status"], result["detail"]),
                             ("failed", "owned-repair-finalization-deadline-expired"))
            self.assertEqual(self.resume_pending(task, [self.pr]), result)
        self.assertEqual(executor.execute.call_count, 1)

    def test_crash_after_worker_result_before_source_observation_recovers(self):
        task, executor = self.isolated_fixture()
        with mock.patch.object(repair, "_evaluate_source_bound_target", side_effect=OSError("missed event")):
            with self.assertRaises(OSError):
                self.run_isolated(task, executor)
        self.assertTrue((self.root / f"{IDENT}.pending-result.json").exists())
        self.assertEqual(self.resume_pending(task, [self.resolved_pr(task)])["status"], "succeeded")
        self.assertEqual(executor.execute.call_count, 1)

    def test_crash_between_terminal_receipt_writes_recovers_without_new_observation(self):
        task, executor = self.isolated_fixture()
        original = repair.exclusive_write
        def interrupted(path, payload):
            if path.name == f"{IDENT}.execution.json":
                raise OSError("simulated restart")
            return original(path, payload)
        with mock.patch.object(repair, "exclusive_write", side_effect=interrupted):
            with self.assertRaises(OSError):
                self.run_isolated(task, executor)
        # The exact successful observation is already durable; API outage does not erase it.
        result = self.resume_pending(task, [])
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(executor.execute.call_count, 1)

    def test_pending_result_rejects_cross_bound_receipts(self):
        task, executor = self.isolated_fixture()
        self.run_isolated(task, executor, selected_check=False)
        path = self.root / f"{IDENT}.pending-result.json"
        original = repair.read_private(path)
        for key in ("schema", "taskKey", "assignmentDigest", "runId", "acceptanceDigest", "runDigest"):
            repair._replace_private(path, {**original, key: "crossed"})
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "pending-result-cross-bound"):
                self.resume_pending(task, [self.resolved_pr(task)])
        repair._replace_private(path, original)
        self.assertEqual(executor.execute.call_count, 1)

    def test_pending_result_keeps_real_shared_lease_and_rejects_replaced_inode(self):
        task, executor = self.isolated_fixture()
        self.run_isolated(task, executor, selected_check=False)
        path = self.leases / f"{IDENT}.lock"
        with path.open("r") as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.resume_pending(task, [self.resolved_pr(task)])
        replacement = path.with_suffix(".replacement")
        replacement.write_text("")
        replacement.replace(path)
        with self.assertRaisesRegex(ValueError, "resume-lease-changed"):
            self.resume_pending(task, [self.resolved_pr(task)])
        self.assertEqual(executor.execute.call_count, 1)


    def test_execution_window_reserves_process_cleanup_time(self):
        task, payload, _executable = self.provider_granted_fixture()
        grant = payload["providerGrant"]
        with self.assertRaisesRegex(ValueError, "execution-window-too-short"):
            repair._remaining_execution_timeout(
                payload, grant, now=grant["expiresAt"] - repair.PROCESS_CLEANUP_GRACE_SECONDS
            )

    def test_isolated_repair_rejects_competing_lease_and_does_not_claim(self):
        task, executor = self.isolated_fixture()
        with (self.leases / f"{IDENT}.lock").open("r") as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.run_isolated(task, executor)
        self.assertFalse((self.root / f"{IDENT}.claim").exists())
        executor.execute.assert_not_called()

    def test_isolated_repair_refuses_scope_owner_and_router_drift_before_claim(self):
        task, executor = self.isolated_fixture()
        for key, value in (("workspace", str(self.tmp)), ("head", "f" * 40), ("writerUnit", "other.service")):
            with self.subTest(key=key):
                changed = copy.deepcopy(task)
                changed["existingRepair"][key] = value
                with self.assertRaisesRegex(ValueError, "mismatch"):
                    self.run_isolated(changed, executor)
        self.issue["assignee"] = {"id": ISSUE_ID}
        with self.assertRaisesRegex(ValueError, "tracker-changed"):
            self.run_isolated(task, executor)
        self.issue["assignee"] = {"id": OWNER}
        executor.qualify.side_effect = [executor.qualify.return_value, {**executor.qualify.return_value, "authPoolIdentity": "c" * 64}]
        with self.assertRaisesRegex(ValueError, "router-changed"):
            self.run_isolated(task, executor)
        self.assertFalse((self.root / f"{IDENT}.claim").exists())

    def test_isolated_repair_requires_cost_task_and_delegation_eligibility(self):
        task, executor = self.isolated_fixture()
        baseline = executor.qualify.return_value
        for changes in ({"provider": "codex"}, {"funding": "paid-api"}, {"costAppropriate": False},
                        {"taskAppropriate": False}, {"delegationPolicyBound": False},
                        {"provider": "anthropic", "model": "router-selected-model"},
                        {"provider": "anthropic", "model": "router-selected-model",
                         "policyException": repair.ANTHROPIC_LAST_RESORT_POLICY_EXCEPTION},
                        {"provider": "anthropic", "model": "router-selected-model",
                         "lastResortEscalation": True}, {"expiresAt": 0}):
            executor.qualify.return_value = {**baseline, **changes}
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, "qualification-required"):
                self.run_isolated(task, executor)
        self.assertFalse((self.root / f"{IDENT}.claim").exists())
        executor.execute.assert_not_called()

    def test_isolated_repair_accepts_explicit_anthropic_last_resort_policy_binding(self):
        task, executor = self.isolated_fixture()
        executor.qualify.return_value = {
            **executor.qualify.return_value,
            "provider": "anthropic",
            "model": "router-selected-model",
            "policyException": repair.ANTHROPIC_LAST_RESORT_POLICY_EXCEPTION,
            "lastResortEscalation": True,
        }
        self.assertEqual(self.run_isolated(task, executor)["status"], "succeeded")
        executor.execute.assert_called_once()

    def test_early_preflight_never_consumes_assignment_and_final_gate_is_fresh(self):
        self.authorize()
        self.assertEqual(controller.pickup_check_command(IDENT, preflight=True, inherited=False), 0)
        self.assertFalse((self.root / f"{IDENT}.claim").exists())
        self.writer()
        for _ in range(2):
            self.assertEqual(controller.pickup_check_command(IDENT, preflight=True), 0)
            self.assertFalse((self.root / f"{IDENT}.claim").exists())
        with mock.patch.object(controller, "_native_dispatch_prerequisite", return_value="dispatch_gate_closed"):
            self.assertEqual(controller.pickup_check_command(IDENT), 75)
            self.assertFalse((self.root / f"{IDENT}.claim").exists())
        with mock.patch.object(controller, "_native_dispatch_prerequisite", side_effect=[None, "dispatch_gate_closed"]):
            self.assertEqual(controller.pickup_check_command(IDENT), 75)
            self.assertFalse((self.root / f"{IDENT}.claim").exists())
        self.assertEqual(controller.pickup_check_command(IDENT), 0)
        self.assertTrue((self.root / f"{IDENT}.claim").is_file())
        self.assertNotEqual(controller.pickup_check_command(IDENT), 0)

    def authorize(self):
        return repair.authorize(self.spec, controller.__file__, self.issue, [self.pr])

    def writer(self):
        self.stack.enter_context(mock.patch.dict(os.environ, SYMPHONY_ISSUE_LEASE_FD="9"))
        try:
            saved = os.dup(9)
        except OSError:
            saved = None
        fd = os.open(self.leases / f"{IDENT}.lock", os.O_RDWR)
        if fd != 9:
            os.dup2(fd, 9)
            os.close(fd)
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def close():
            os.close(9)
            if saved is not None:
                os.dup2(saved, 9)
                os.close(saved)
        self.stack.callback(close)

    def replace(self, payload):
        (self.root / f"{IDENT}.json").write_text(json.dumps(payload))

    def test_authorized_legacy_in_review_native_pickup_claims_once(self):
        payload = self.authorize()
        self.assertEqual(repair.load(IDENT, controller.__file__), payload)
        index = controller._autonomous_open_pr_index([IDENT])
        self.assertEqual(controller._open_pr_verdict(IDENT, index)[0], "remount")
        self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 0)
        self.writer()
        self.assertEqual(controller.pickup_check_command(IDENT), 0)
        self.assertEqual(json.loads((self.root / f"{IDENT}.claim").read_text()), payload)
        self.assertEqual(controller.pickup_check_command(IDENT), 78)
        self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 78)
        self.assertEqual(self.issue["state"]["name"], "In Review")

    def test_missing_assignment_does_not_authorize_legacy_or_in_review(self):
        self.assertEqual(controller._autonomous_open_pr_index([IDENT]), {})
        self.assertEqual(controller.pickup_check_command(IDENT), 78)
        self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 78)
        self.root.rmdir()
        self.assertEqual(repair.candidates(controller.__file__), [])

    def test_assignment_does_not_self_dispatch_sidecar_or_bypass_receipt(self):
        self.authorize()
        self.assertEqual(controller._github_remount_identifiers(), [])
        self.assertEqual(controller.check_admission(IDENT, remount=True), 1)
        self.assertEqual(controller.check_admission("JOV-99"), 1)

    def test_expired_future_malformed_wrong_issue_repo_source_are_refused(self):
        original = self.authorize()
        changes = [{"expiresAt": 0}, {"issuedAt": time.time() + 50}, {"expiresAt": time.time() + 5500},
                   {"issuedAt": True}, {"expiresAt": float("nan")}, {"schema": "fallback-lease/v1"},
                   {"identifier": "JOV-99"}, {"repository": "other/repo"}, {"issueId": "bad"},
                   {"pr": True}, {"head": "bad"}, {"authorizedBy": "self"}, {"generation": "bad"},
                   {"writerUnit": "fake"}, {"newIssueIntakeAllowed": True}, {"sourceHashes": {}},
                   {"leaseIdentity": {"device": True, "inode": 1}}]
        for delta in changes:
            with self.subTest(delta=delta):
                self.replace({**original, **delta})
                with self.assertRaises((ValueError, OSError)):
                    repair.load(IDENT, controller.__file__)
                self.assertEqual(controller.pickup_check_command(IDENT), 78)
        self.replace(original)
        (self.root / "junk.json").write_text("bad")
        self.assertEqual(repair.candidates(controller.__file__), [original])
        with self.assertRaises(ValueError):
            repair.assignment_path("../../escape")

    def test_untrusted_directory_file_symlink_hardlink_and_oversize(self):
        payload = self.authorize()
        path = self.root / f"{IDENT}.json"
        for mode in (0o644, 0o666):
            path.chmod(mode)
            with self.assertRaises(ValueError):
                repair.load(IDENT, controller.__file__)
        path.chmod(0o600)
        self.root.chmod(0o755)
        self.assertEqual(controller._repair_assignments(), [])
        self.root.chmod(0o700)
        other = self.root / "other"
        os.link(path, other)
        with self.assertRaises(ValueError):
            repair.load(IDENT, controller.__file__)
        other.unlink()
        path.write_text("x" * 16385)
        with self.assertRaises(ValueError):
            repair.load(IDENT, controller.__file__)
        path.unlink()
        other.write_text(json.dumps(payload))
        path.symlink_to(other)
        with self.assertRaises(OSError):
            repair.load(IDENT, controller.__file__)

    def test_wrong_head_pr_marker_fork_and_sibling_are_blocked(self):
        self.authorize()
        self.writer()
        original = copy.deepcopy(self.pr)
        changes = [{"headRefOid": "c" * 40}, {"number": 42}, {"body": "<!-- linear-issue-id:JOV-99 -->"},
                   {"body": self.pr["body"] * 2}, {"headRepository": {"nameWithOwner": "attacker/Jovie"}}]
        for delta in changes:
            with self.subTest(delta=delta):
                self.pr = {**original, **delta}
                self.assertEqual(controller.pickup_check_command(IDENT), 78 if delta.get("body") == "<!-- linear-issue-id:JOV-99 -->" else 75)
        self.pr = original
        with mock.patch.object(controller, "_complete_open_prs", return_value=[self.pr, {**self.pr, "number": 42}]):
            self.assertEqual(controller.pickup_check_command(IDENT), 75)
        with mock.patch.object(controller, "_complete_open_prs", return_value=None):
            self.assertEqual(controller.pickup_check_command(IDENT), 75)

    def test_wrong_tracker_state_hold_team_revision_never_admitted(self):
        self.authorize()
        self.writer()
        for delta in ({"id": OWNER}, {"identifier": "JOV-99"}, {"labels": {"nodes": [{"name": "hold"}]}},
                      {"team": {"key": "OTHER"}}, {"team": {"key": "JOV"}}, {"updatedAt": None}):
            previous = self.issue
            self.issue = {**previous, **delta}
            with self.subTest(delta=delta):
                self.assertEqual(controller.pickup_check_command(IDENT), 78)
            self.issue = previous
        for state in ("Canceled", "Duplicate", "Done", "Closed", "Todo", "In Progress"):
            self.issue["state"]["name"] = state
            self.assertEqual(controller.pickup_check_command(IDENT), 78)
        self.issue["state"]["name"] = "In Review"
        self.assertEqual(controller.repair_preflight_command(IDENT, "old"), 78)
        self.issue = None
        self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 78)

    def test_competing_writer_wrong_unit_missing_or_wrong_fd_and_replaced_inode(self):
        payload = self.authorize()
        self.cgroup = "0::/different.service"
        with self.assertRaisesRegex(ValueError, "unit-mismatch"):
            repair.check_writer(payload, inherited=False)
        self.cgroup = "0::/symphony-elixir.service"
        with mock.patch.dict(os.environ, {"SYMPHONY_ISSUE_LEASE_FD": ""}):
            with self.assertRaisesRegex(ValueError, "lease-missing"):
                repair.check_writer(payload, inherited=True)
        self.writer()
        # The same inherited writer is valid; an independent hook still sees busy.
        self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 0)
        with mock.patch.dict(os.environ, SYMPHONY_ISSUE_LEASE_FD=""):
            self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 78)
        fcntl.flock(9, fcntl.LOCK_UN)
        self.assertEqual(controller.repair_preflight_command(IDENT, REVISION), 78)
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
        path = self.leases / f"{IDENT}.lock"
        path.rename(path.with_suffix(".old"))
        path.touch()
        with self.assertRaisesRegex(ValueError, "lease-mismatch"):
            repair.check_writer(payload, inherited=True)
        changed = {**payload, "leaseIdentity": {"device": path.stat().st_dev, "inode": path.stat().st_ino}}
        with self.assertRaisesRegex(ValueError, "writer-lease-mismatch"):
            repair.check_writer(changed, inherited=True)

    def test_head_change_between_preflight_and_claim_is_blocked(self):
        self.authorize()
        self.writer()
        with mock.patch.object(controller, "_complete_open_prs", side_effect=[[self.pr], [{**self.pr, "headRefOid": "c" * 40}]]):
            self.assertEqual(controller.pickup_check_command(IDENT), 78)
        self.assertFalse((self.root / f"{IDENT}.claim").exists())

    def test_clean_pending_ci_pr_not_remounted(self):
        self.authorize()
        self.writer()
        self.pr.update(mergeStateStatus="CLEAN", mergeable="MERGEABLE")
        with mock.patch.object(controller, "_pr_has_product_failure_tombstone", return_value=False):
            self.assertEqual(controller.pickup_check_command(IDENT), 78)
        self.pr.update(mergeStateStatus="UNKNOWN")
        with mock.patch.object(controller, "_pr_has_failing_check", return_value=False):
            self.assertEqual(controller.pickup_check_command(IDENT), 78)

    def test_producer_exclusive_writer_head_issue_inventory_and_claim_fences(self):
        for issue, prs in (({}, [self.pr]), (self.issue, None), (self.issue, []), (self.issue, [{**self.pr, "headRefOid": "c" * 40}])):
            with self.assertRaises((ValueError, KeyError)):
                repair.authorize(self.spec, controller.__file__, issue, prs)
        payload = self.authorize()
        with self.assertRaises(FileExistsError):
            self.authorize()
        self.writer()
        with self.assertRaises(BlockingIOError):
            self.authorize()
        self.replace({**payload, "expiresAt": payload["expiresAt"] - 1})
        with self.assertRaisesRegex(ValueError, "replaced"):
            repair.claim(payload, controller.__file__)
        self.replace(payload)
        repair.claim(payload, controller.__file__)
        with self.assertRaises(ValueError):
            repair.claim(payload, controller.__file__)

    def test_cli_producer_and_installed_bundle_import(self):
        spec_path = self.tmp / "spec.json"
        spec_path.write_text(json.dumps(self.spec))
        self.assertEqual(controller.repair_assign_command(str(spec_path)), 0)
        self.assertEqual(controller.repair_assign_command(str(spec_path)), 78)
        self.assertIn("existing_pr_repair.py", controller._artifacts())
        # Install the real bundle into an isolated destination. Load the
        # installed controller and resolve the validator without repo imports.
        destination = self.tmp / "bin"
        self.assertEqual(controller.install(str(destination)), 0)
        installed = destination / controller.STATE_DIR_NAME / "current/symphony-codex-exhausted.py"
        loader = importlib.machinery.SourceFileLoader("installed_repair_controller", str(installed))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        loaded = importlib.util.module_from_spec(spec)
        loader.exec_module(loaded)
        loaded_repair = loaded._repair_module()
        self.assertEqual(loaded_repair.SCHEMA, repair.SCHEMA)
        self.assertEqual(Path(loaded_repair.__file__).resolve().parent, installed.resolve().parent)
        self.assertEqual(Path(loaded_repair.__file__).read_bytes(), (SOURCE / "existing_pr_repair.py").read_bytes())

    def test_native_guard_preflight_preserves_tombstone_and_terminal_fences(self):
        state_dir = self.tmp / "guard"
        workflow = self.tmp / "WORKFLOW.md"
        workflow.write_text(
            "---\n"
            "tracker:\n"
            "  provider:\n"
            "    team_key: \"JOV\"\n"
            "  active_states:\n"
            "    - Todo\n"
            "    - In Progress\n"
            "    - Rework\n"
            "    - Merging\n"
            "  terminal_states:\n"
            "    - Done\n"
            "---\n"
            "prompt\n"
        )
        normalized = {"identifier": IDENT, "teamKey": "JOV", "state": "In Review", "updatedAt": REVISION, "updatedAtEpoch": 100.0}
        with mock.patch.dict(os.environ, {"SYMPHONY_LEASE_GUARD_STATE_DIR": str(state_dir), "SYMPHONY_WORKFLOW_PATH": str(workflow)}), \
             mock.patch.object(guard, "_fetch_issue", return_value=normalized), \
             mock.patch.object(guard, "_active_states", return_value=frozenset({"todo", "in review"})), \
             mock.patch.object(guard, "_existing_repair_preflight", return_value=True):
            self.assertEqual(guard.initialize(), 0)
            with mock.patch.object(guard, "_existing_repair_preflight", return_value=False):
                self.assertEqual(guard.check(IDENT), 1)
            self.assertEqual(guard.check(IDENT), 0)
            state = guard._load_state()
            key = guard._tombstone_key(IDENT, guard._repository_for_identifier(IDENT))
            self.assertEqual(state["tombstones"][key]["state"], "In Review")
            self.assertEqual(guard.check(IDENT), 0)
            state["tombstones"][key]["issueUpdatedAtEpoch"] = 101.0
            guard._save_state(state)
            self.assertEqual(guard.check(IDENT), 1)
            for terminal in ("Canceled", "Duplicate", "Done"):
                state["tombstones"][key].update(state=terminal, issueUpdatedAtEpoch=99.0)
                guard._save_state(state)
                self.assertEqual(guard.check(IDENT), 1)
                self.assertEqual(guard.check(IDENT), 1)
                self.assertEqual(guard._load_state()["tombstones"][key]["state"], terminal)

    def test_actual_workspace_repository_branch_and_head_binding(self):
        payload = self.authorize()
        with mock.patch.object(os, "getcwd", return_value=str(self.tmp)):
            with self.assertRaisesRegex(ValueError, "workspace-mismatch"):
                repair.check_workspace(payload, self.pr)
        with self.assertRaisesRegex(ValueError, "workspace-head-mismatch"):
            repair.check_workspace({**payload, "head": "c" * 40}, self.pr)
        with self.assertRaisesRegex(ValueError, "workspace-branch-mismatch"):
            repair.check_workspace(payload, {**self.pr, "headRefName": "main"})
        with self.assertRaisesRegex(ValueError, "workspace-repository-mismatch"):
            repair.check_workspace({**payload, "repository": "other/repo"}, self.pr)
        nested = self.workspace / "nested"
        nested.mkdir()
        with mock.patch.object(os, "getcwd", return_value=str(nested)), mock.patch.dict(os.environ, {"SYMPHONY_WORKSPACE": str(nested)}):
            with self.assertRaisesRegex(ValueError, "workspace-root-mismatch"):
                repair.check_workspace({**payload, "workspace": str(nested)}, self.pr)

    def test_native_guard_delegation_is_exact_fresh_and_fail_closed(self):
        issue = {"state": "In Review", "updatedAt": REVISION}
        self.assertFalse(guard._existing_repair_preflight(IDENT, None))
        self.assertFalse(guard._existing_repair_preflight(IDENT, {"state": "Todo"}))
        with mock.patch.object(guard.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, f"REPAIR_PREFLIGHT_ADMITTED identifier={IDENT}\n")) as run:
            self.assertTrue(guard._existing_repair_preflight(IDENT, issue))
            self.assertEqual(run.call_args.args[0][-2:], ["--issue-revision", REVISION])
        for result in (subprocess.CompletedProcess([], 0, "fake"), subprocess.CompletedProcess([], 78, "")):
            with mock.patch.object(guard.subprocess, "run", return_value=result):
                self.assertFalse(guard._existing_repair_preflight(IDENT, issue))
        for error in (OSError(), subprocess.TimeoutExpired("repair", 45)):
            with mock.patch.object(guard.subprocess, "run", side_effect=error):
                self.assertFalse(guard._existing_repair_preflight(IDENT, issue))

    def test_pickup_pure_existing_new_and_competing_writer_boundaries(self):
        for held, reason in ((True, "fallback_lease_held"), (None, "lock_gc_unverifiable")):
            self.assertEqual(controller.pickup_refuse_reason(IDENT, issue=self.issue, pr_verdict="remount", held=held,
                             codex_writer=True, existing_pr_repair=True), reason)
        self.assertEqual(controller.pickup_refuse_reason("bad space", issue=self.issue, pr_verdict="none", held=False), "malformed_identifier")
        self.assertEqual(controller.pickup_refuse_reason(IDENT, issue=self.issue, pr_verdict="unknown", held=False), "open_pr_inventory_unknown")
        self.assertEqual(controller.pickup_check_command("bad space"), 78)
        self.issue["state"]["name"] = "Todo"
        self.assertEqual(controller.pickup_check_command(IDENT), 0)


if __name__ == "__main__":
    unittest.main()
