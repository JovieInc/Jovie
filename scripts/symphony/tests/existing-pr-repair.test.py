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
import subprocess
import tempfile
import time
import unittest
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
guard = load("repair_guard", "symphony-lease-guard")
IDENT = "JOV-5552"
HEAD = "a" * 40
ISSUE_ID = "d1d9b064-5264-4907-a3ca-f599eb75b9de"
OWNER = "01a0818b-6e1b-7573-a2b1-a7ad52ea8328"
REVISION = "2026-09-08T12:00:00Z"


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
                "selected": {"id": "affected-only-unit-selection"},
                "source": {"sourceVersion": "b" * 40}, "existingRepair": target}
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
            },
        }
        return task, executor

    def run_isolated(self, task, executor=None):
        return repair.execute_isolated(task, controller.__file__, lambda _: self.issue, lambda _: [self.pr], executor=executor)

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

    def test_provider_grant_validation_and_grok_runner_are_source_and_assignment_bound(self):
        task, payload, executable = self.provider_granted_fixture()
        self.assertEqual(repair.load_validated_candidate(IDENT, controller.__file__), payload)
        for key, value in (("issuedAt", payload["issuedAt"] - 1),
                           ("expiresAt", payload["expiresAt"] + 1)):
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
        fresh_edge = copy.deepcopy(payload)
        fresh_edge["providerGrant"]["qualification"]["observedAt"] = repair.datetime.fromtimestamp(
            now - repair.MAX_QUALIFICATION_AGE_SECONDS + 1,
            repair.timezone.utc,
        ).isoformat().replace("+00:00", "Z")
        repair.validate_provider_grant(fresh_edge, now=now)
        stale = copy.deepcopy(fresh_edge)
        stale["providerGrant"]["qualification"]["observedAt"] = repair.datetime.fromtimestamp(
            now - repair.MAX_QUALIFICATION_AGE_SECONDS - 1,
            repair.timezone.utc,
        ).isoformat().replace("+00:00", "Z")
        with self.assertRaisesRegex(ValueError, "provider-grant-qualification-stale"):
            repair.validate_provider_grant(stale, now=now)
        runner = mock.Mock(return_value=mock.Mock(returncode=0, stdout="changed", stderr=""))
        adapter = repair.GrokOwnedRepairExecutor(run=runner)
        eligibility = adapter.qualify(task, payload)
        self.writer()
        with mock.patch.dict(os.environ, {"SYMPHONY_ISSUE_LEASE_FD": "9", "OPENAI_API_KEY": "secret"}), \
             mock.patch.object(repair, "_git_head", side_effect=[payload["head"], "b" * 40]):
            result = adapter.execute(task, payload, {**eligibility, "runId": "JOV-5552-run"})
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["_executionObservation"]["baseHead"], payload["head"])
        command = runner.call_args.args[0]
        self.assertEqual(command[0], str(executable))
        self.assertIn("grok-4.6", command)
        self.assertIn("--disable-web-search", command)
        self.assertIn("--no-subagents", command)
        self.assertNotIn("OPENAI_API_KEY", runner.call_args.kwargs["env"])

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

    def test_isolated_mode_never_enters_native_or_generic_fallback(self):
        task, executor = self.isolated_fixture()
        with self.assertRaisesRegex(ValueError, "assignment-schema-invalid"):
            repair.load(IDENT, controller.__file__)
        self.assertEqual(controller.check_admission(IDENT), 1)
        self.assertEqual(self.run_isolated(task)["reason"], "qualified-isolated-repair-executor-unavailable")
        self.assertFalse((self.root / f"{IDENT}.claim").exists())
        executor.execute.assert_not_called()

    def test_isolated_repair_claims_once_under_real_shared_lease(self):
        task, executor = self.isolated_fixture()
        def execute(*args, lease_fd):
            self.assertEqual(lease_fd, 9)
            self.assertEqual(os.fstat(9).st_ino, (self.leases / f"{IDENT}.lock").stat().st_ino)
            code = "import fcntl,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)"
            self.assertNotEqual(subprocess.run(["python3", "-c", code, str(self.leases / f"{IDENT}.lock")], capture_output=True).returncode, 0)
            return {"status": "succeeded"}
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
        self.assertEqual(self.run_isolated(task, executor)["reason"], "isolated-repair-claimed-outcome-unknown")
        self.assertEqual(executor.execute.call_count, 1)
        recovery = json.loads((self.root / f"{IDENT}.recovery.json").read_text())
        self.assertEqual(recovery["state"], "unknown")

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
