"""Remote Hyperagent lifecycle regressions; all external calls are deterministic."""
import importlib.util
import json
import hashlib
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import hyperagent_lane as remote


class HyperagentLaneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "attempt.provider.jsonl"
        self.calls, self.gates = [], []
        self.now = 1000
        self.meta = {"agentId": "agent-1", "model": "z-ai/glm-5.3", "repository": "JovieInc/Jovie",
                     "verifiedAt": 1000, "expiresAt": 1100, "balanceUsd": 5, "maxCostUsd": 1,
                     "allInCap": True, "currentInstructions": True, "executionMode": "auto", "source": "hyperagent-settings-readback", "evidenceSha256": "c" * 64}
        self.spec = {"model": "z-ai/glm-5.3", "verifiedRemote": self.meta}
        self.payload = {"thread": {"id": "thread-1", "namedAgentId": "agent-1"},
                        "isRunning": False, "awaitingApproval": False,
                        "messages": [{"role": "assistant", "content": "https://github.com/JovieInc/Jovie/pull/7 head: " + "a" * 40}]}
        self.pr = {"number": 7, "url": "https://github.com/JovieInc/Jovie/pull/7", "state": "OPEN",
                   "title": "fix: JOV-6871", "body": "<!-- linear-issue-id:JOV-6871 -->\n<!-- hyperagent-attempt-id:" + hashlib.sha256(b"attempt-1").hexdigest() + " -->",
                   "headRefName": "hyperagent/jov-6871-attempt", "headRefOid": "a" * 40}
        self.gate_result = {"verdict": "verified-not-queued", "pr": 7, "headSha": "a" * 40}

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, name, args):
        self.calls.append((name, args))
        if name == "list_agents":
            return {"agents": [{"id": "agent-1", "executionMode": "auto"}]}
        if name == "create_thread":
            return {"threadId": "thread-1"}
        return self.payload

    def gate(self, pr):
        self.gates.append(pr)
        return self.gate_result

    def run_remote(self, **kwargs):
        return remote.run(self.spec, "JOV-6871", "attempt-1", "hyperagent/jov-6871-attempt", "prompt",
                          self.path, self.call, lambda number: self.pr, self.gate,
                          timeout=3, clock=lambda: self.now, pause=self.tick, **kwargs)

    def tick(self, seconds):
        self.now += seconds

    def test_remote_pr_is_gated_without_local_commits(self):
        result = self.run_remote()
        self.assertEqual(result["verdict"], "verified-not-queued")
        self.assertEqual(result["remoteThreadId"], "thread-1")
        self.assertEqual(len(self.gates), 1)
        self.assertEqual(self.gates[0]["headRefOid"], "a" * 40)
        self.assertIn("hyperagent-attempt-id", self.calls[1][1]["message"])
        self.assertNotIn("attempt-1", self.calls[1][1]["namingHint"])

    def test_missing_pr_is_a_hold(self):
        self.payload["messages"] = [{"role": "assistant", "content": "Finished the plan"}]
        self.assertEqual(self.run_remote()["reasons"], ["remote-pr-missing"])
        self.assertFalse(self.gates)

    def test_ambiguous_prs_are_not_chosen_by_recency(self):
        self.payload["messages"][0]["content"] += " https://github.com/JovieInc/Jovie/pull/8"
        self.assertEqual(self.run_remote()["reasons"], ["remote-pr-ambiguous"])
        self.assertFalse(self.gates)

    def test_lost_create_response_does_not_dispatch_again(self):
        original = self.call
        def lost(name, args):
            if name == "create_thread":
                self.calls.append((name, args))
                raise RuntimeError("lost response Bearer private-fixture")
            return original(name, args)
        self.call = lost
        first = self.run_remote()
        second = self.run_remote()
        self.assertEqual(first["reasons"], ["remote-create-outcome-unknown"])
        self.assertEqual(second["reasons"], ["remote-create-outcome-unknown"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)
        self.assertNotIn("private-fixture", self.path.read_text())

    def test_duplicate_completion_does_not_regate_or_create(self):
        self.assertEqual(self.run_remote(), self.run_remote())
        self.assertEqual(len(self.gates), 1)
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_restart_resumes_known_thread_without_send_or_create(self):
        self.payload["awaitingApproval"] = True
        self.assertEqual(self.run_remote()["reasons"], ["remote-approval-required"])
        self.payload["awaitingApproval"] = False
        result = self.run_remote()
        self.assertEqual(result["pr"], 7)
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)
        self.assertFalse(any(n == "send_message" for n, _ in self.calls))

    def test_oauth_expiry_is_redacted_and_preserves_existing_thread(self):
        self.payload["awaitingApproval"] = True
        self.run_remote()
        original = self.call
        def expired(name, args):
            if name == "get_thread":
                raise RuntimeError("401 oauth expired hat_private_fixture")
            return original(name, args)
        self.call = expired
        result = self.run_remote()
        self.assertEqual(result["reasons"], ["remote-oauth-expired"])
        self.assertEqual(result["remoteThreadId"], "thread-1")
        self.assertNotIn("hat_private", json.dumps(result) + self.path.read_text())

    def test_quota_exhaustion_never_swaps_model_or_creates_twice(self):
        self.payload["awaitingApproval"] = True
        self.run_remote()
        original = self.call
        self.call = lambda n, a: (_ for _ in ()).throw(RuntimeError("402 quota exhausted")) if n == "get_thread" else original(n, a)
        self.assertEqual(self.run_remote()["reasons"], ["remote-quota-exhausted"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_timeout_preserves_remote_job_instead_of_claiming_cancelled(self):
        self.payload["isRunning"] = True
        result = self.run_remote()
        self.assertEqual(result["reasons"], ["remote-running-timeout"])
        self.assertEqual(result["remoteThreadId"], "thread-1")
        self.payload["isRunning"] = False
        self.assertEqual(self.run_remote()["pr"], 7)
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_identity_issue_branch_and_head_mismatch_hold(self):
        for field, value in [("url", "https://github.com/itstimwhite/Jovie/pull/7"),
                             ("body", "JOV-6871"), ("headRefName", "unrelated/branch"),
                             ("headRefOid", "b" * 40), ("title", "JOV-68710"), ("state", "CLOSED")]:
            with self.subTest(field=field):
                self.path.unlink(missing_ok=True)
                old = self.pr[field]
                self.pr[field] = value
                self.assertEqual(self.run_remote()["reasons"], ["remote-pr-attribution-mismatch"])
                self.pr[field] = old
        self.assertFalse(self.gates)

    def test_unknown_or_stale_model_cap_repository_proof_blocks_before_dispatch(self):
        for field, value in [("model", "auto"), ("repository", "other/repo"), ("verifiedAt", 500),
                             ("balanceUsd", None), ("maxCostUsd", 10), ("allInCap", False),
                             ("currentInstructions", False), ("expiresAt", 999), ("executionMode", "confirm"), ("source", "models-static"), ("evidenceSha256", None)]:
            with self.subTest(field=field):
                old = self.meta[field]
                self.meta[field] = value
                self.assertEqual(self.run_remote()["reasons"], ["remote-preflight-unverified"])
                self.meta[field] = old
        self.assertFalse(self.calls)

    def test_missing_lifecycle_status_never_counts_as_completion(self):
        del self.payload["isRunning"]
        self.assertEqual(self.run_remote()["reasons"], ["remote-status-unverified"])
        self.assertFalse(self.gates)

    def test_malformed_preflight_object_is_held_with_no_transport(self):
        self.spec["verifiedRemote"] = ["untrusted"]
        self.assertEqual(self.run_remote()["reasons"], ["remote-preflight-unverified"])
        self.assertFalse(self.calls)

    def test_same_receipt_cannot_be_reused_for_different_attempt(self):
        self.run_remote()
        result = remote.run(self.spec, "JOV-9", "attempt-2", "other", "prompt", self.path,
                            self.call, lambda n: self.pr, self.gate, clock=lambda: self.now)
        self.assertEqual(result["reasons"], ["remote-receipt-attribution-mismatch"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_malformed_receipt_holds_instead_of_starting_over(self):
        self.path.write_text("{broken\n")
        self.assertEqual(self.run_remote()["reasons"], ["remote-receipt-unreadable"])
        self.assertFalse(self.calls)

    def test_concurrent_attempt_cannot_dispatch_or_gate(self):
        import fcntl
        with self.path.open("a+") as journal:
            fcntl.flock(journal, fcntl.LOCK_EX)
            self.assertEqual(self.run_remote()["reasons"], ["remote-attempt-active"])
        self.assertFalse(self.calls)

    def test_agent_mode_change_holds_before_create(self):
        self.call = lambda n, a: {"agents": [{"id": "agent-1", "executionMode": "confirm"}]}
        self.assertEqual(self.run_remote()["reasons"], ["remote-agent-identity-unverified"])
        self.assertNotIn("intent", json.loads(self.path.read_text().splitlines()[-1]))

    def test_missing_create_id_is_unknown_and_never_retried(self):
        original = self.call
        def missing(name, args):
            if name == "create_thread":
                self.calls.append((name, args))
                return {}
            return original(name, args)
        self.call = missing
        self.assertEqual(self.run_remote()["reasons"], ["remote-create-outcome-unknown"])
        self.run_remote()
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_thread_uses_actual_named_agent_identity_field(self):
        self.payload["thread"] = {"id": "thread-1", "agentId": "agent-1", "namedAgentId": "other"}
        self.assertEqual(self.run_remote()["reasons"], ["remote-thread-attribution-mismatch"])
        self.assertFalse(self.gates)

    def test_malformed_messages_and_foreign_pr_hold(self):
        self.payload["messages"] = None
        self.assertEqual(self.run_remote()["reasons"], ["remote-status-unverified"])
        self.payload["messages"] = [{"role": "assistant", "content": "https://github.com/other/repo/pull/7"}]
        self.assertEqual(self.run_remote()["reasons"], ["remote-pr-attribution-mismatch"])
        self.assertFalse(self.gates)

    def test_expired_proof_at_completion_cannot_promote(self):
        original = self.call
        def expires(name, args):
            payload = original(name, args)
            if name == "get_thread":
                self.now = 1101
            return payload
        self.call = expires
        self.assertEqual(self.run_remote()["reasons"], ["remote-preflight-unverified"])
        self.assertFalse(self.gates)

    def test_lost_gate_response_does_not_regate_the_head(self):
        def lost_gate(pr):
            self.gates.append(pr)
            raise RuntimeError("network reply lost private-fixture")
        self.gate = lost_gate
        self.assertEqual(self.run_remote()["reasons"], ["remote-read-unavailable"])
        self.assertEqual(self.run_remote()["reasons"], ["remote-gate-outcome-unknown"])
        self.assertEqual(len(self.gates), 1)
        self.assertNotIn("private-fixture", self.path.read_text())


class ProductionRemoteEntryTest(unittest.TestCase):
    def setUp(self):
        from scripts.tests.test_lane_runner import lane, issue
        import time
        self.lane, self.issue = lane, issue("JOV-6871")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = lane.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))
        self.calls, self.gates = [], []
        self.approval = False
        self.model = "z-ai/glm-5.3"
        self.spec = {"model": self.model, "verifiedRemote": {
            "agentId": "agent-1", "model": self.model, "repository": "JovieInc/Jovie",
            "verifiedAt": time.time(), "expiresAt": time.time() + 120,
            "balanceUsd": 5, "maxCostUsd": 1, "allInCap": True,
            "currentInstructions": True, "executionMode": "auto", "source": "hyperagent-settings-readback", "evidenceSha256": "c" * 64}}
        identity = lane.execution_attempt.identity("linear-work", {"issue": "JOV-6871", "outcome": "draft-pr"},
                     {"title": self.issue.title, "description": self.issue.description})
        self.branch = f"hyperagent/jov-6871-{identity['identityDigest'][:15]}"
        self.pr = {"number": 7, "url": "https://github.com/JovieInc/Jovie/pull/7", "state": "OPEN",
                   "title": "fix: JOV-6871", "headRefName": self.branch, "headRefOid": "a" * 40,
                   "body": "<!-- linear-issue-id:JOV-6871 -->"}
        from unittest.mock import patch
        # Host attestation never leaks into fixtures; tests that need one write their own.
        self.attestation = Path(self.tmp.name) / "attestation.json"
        attest = patch.object(remote, "ATTESTATION", self.attestation)
        attest.start()
        self.addCleanup(attest.stop)
        def read(args, **kwargs):
            self.assertEqual(args[:3], ["gh", "pr", "view"])
            return type("Read", (), {"returncode": 0, "stdout": json.dumps(self.pr)})()
        def adopt(host, provider, pr):
            self.gates.append((provider, pr))
            return {"verdict": "verified-not-queued", "pr": 7, "prUrl": pr["url"], "headSha": pr["headRefOid"]}
        for patcher in [patch.object(lane, "sh", side_effect=read),
                        patch.object(lane, "context_pack", return_value="fixture context"),
                        patch.object(lane, "adopt_pr", side_effect=adopt),
                        patch("runpy.run_path", return_value={"mcp_call": self.call}),
                        patch.object(lane.shutil, "which", return_value="fixture-hyperagent")]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def call(self, name, args):
        self.calls.append((name, args))
        if name == "list_agents":
            return {"agents": [{"id": "agent-1", "executionMode": "auto"}]}
        if name == "create_thread":
            self.pr["body"] += " " + re.search(r"<!-- hyperagent-attempt-id:[a-f0-9]+ -->", args["message"])[0]
            return {"threadId": "thread-1"}
        return {"thread": {"id": "thread-1", "namedAgentId": "agent-1"}, "isRunning": False,
                "awaitingApproval": self.approval, "messages": [{"role": "assistant",
                "content": self.pr["url"] + " head: " + self.pr["headRefOid"]}]}

    def run_entry(self):
        return self.lane.run_issue(self.host, "hyperagent", self.spec, None, self.issue)

    def test_actual_entry_adopts_same_pr_with_one_fenced_attempt_and_no_local_agent(self):
        result = self.run_entry()
        self.assertEqual(result["verdict"], "verified-not-queued")
        self.assertEqual(result["remoteThreadId"], "thread-1")
        self.assertEqual(result["headSha"], "a" * 40)
        self.assertEqual(self.gates, [("hyperagent", self.pr)])
        self.assertFalse((self.host.state / "worktrees").exists())
        rows = [json.loads(l) for l in (self.host.state / "runs/execution-attempts.jsonl").read_text().splitlines()]
        self.assertEqual(sum(r["event"] == "attempt_started" for r in rows), 1)
        self.assertEqual(sum(r["event"] == "attempt_finished" for r in rows), 1)
        self.assertEqual(sum(r.get("reservation", {}).get("spend", 0) for r in rows), 1)
        self.assertEqual(self.run_entry()["verdict"], "remote-held")
        self.assertEqual(len(self.gates), 1)
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_actual_entry_restart_keeps_live_fence_and_resumes_approval_hold(self):
        self.approval = True
        held = self.run_entry()
        self.assertEqual(held["reasons"], ["remote-approval-required"])
        before = held["execution"]
        self.approval = False
        completed = self.run_entry()
        self.assertEqual(completed["pr"], 7)
        self.assertEqual(completed["execution"]["fencingToken"], before["fencingToken"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_generated_remote_draft_is_discovered_adopted_and_counts_toward_wip(self):
        from unittest.mock import patch
        self.run_entry()
        draft = {**self.pr, "isDraft": True, "mergeStateStatus": "CLEAN"}
        dated = {**draft, "number": 9, "headRefName": "hyperagent/jov-9-20260930t123000"}
        providers = {"hyperagent": {"enabled": False}, "devin": {"enabled": True}}
        lane = self.lane
        with patch.object(lane, "open_prs_summary", return_value=[draft, dated]):
            found = lane.lane_prs("hyperagent", providers)
            self.assertEqual(found, [draft, dated])
            self.assertEqual(lane.lane_prs("devin", providers), [draft, dated], "disabled lane's orphan remains owned")
            with patch.object(lane, "load_providers", return_value=providers), patch.object(lane, "repo_prs", return_value=[]):
                self.assertEqual(lane.fix_candidates("hyperagent"), [draft, dated])
        with patch.object(lane, "sh", return_value=type("Read", (), {"stdout": json.dumps([draft, dated]), "returncode": 0})()):
            light = lane.lane_prs("hyperagent", providers, fields=lane.LIGHT_PR_FIELDS)
            self.assertTrue(lane.over_budget("hyperagent", light, slots=1))
            self.assertFalse(lane.over_budget("hyperagent", light[:1], slots=1))
            self.assertIn("JOV-6871", lane.in_flight_issues())
        with patch.object(lane, "claimed_elsewhere", return_value=False), patch.object(lane, "post_claim"):
            first = lane.claim_adoptable_pr(self.host, "hyperagent", found)
            second = lane.claim_adoptable_pr(self.host, "hyperagent", found)
            try:
                self.assertEqual(first.pr, draft)
                self.assertEqual(second.pr, dated)
                self.assertTrue(first.lock.held)
                self.assertTrue(second.lock.held)
                self.assertIsNone(lane.claim_adoptable_pr(self.host, "hyperagent", found))
            finally:
                if first is not None:
                    first.lock.release()
                if second is not None:
                    second.lock.release()
        older = {**draft, "number": 5, "headRefName": "hyperagent/jov-6871-20260929t100000"}
        self.assertEqual(lane.best_per_issue([older, draft]), [draft])
        self.assertEqual(lane.sweep_plan([older, draft], now=100, pushes={7: 100}), ([], []), "an unclassified sibling must remain preserved")

    def test_generated_digest_ownership_is_exact_and_only_extends_hyperagent(self):
        from unittest.mock import patch
        lane = self.lane
        branches = [self.branch, "hyperagent/jov-6871-20260930t123000", self.branch + "0",
                    self.branch[:-1], self.branch + "-extra", self.branch.replace("hyperagent/", "devin/"),
                    self.branch.upper(), "hyperagent/jov-6871-arbitrary"]
        prs = [{**self.pr, "number": n, "headRefName": branch, "body": ""} for n, branch in enumerate(branches)]
        with patch.object(lane, "open_prs_summary", return_value=prs):
            self.assertEqual(lane.lane_prs("hyperagent", {"hyperagent": {}}), prs[:2])
        found = lane.LANE_BRANCH.match(self.branch)
        self.assertIsNotNone(found)
        self.assertEqual((found.group("lane"), found.group("issue")), ("hyperagent", "jov-6871"))
        with patch.object(lane, "sh", return_value=type("Read", (), {"stdout": json.dumps(prs), "returncode": 0})()):
            self.assertEqual(lane.in_flight_issues(), frozenset({"JOV-6871"}))

    def test_actual_entry_unknown_metadata_never_reads_transport_or_changes_provider(self):
        self.spec.pop("verifiedRemote")
        result = self.run_entry()
        self.assertEqual(result["reasons"], ["remote-preflight-unverified"])
        self.assertFalse(self.calls)
        self.assertFalse(self.gates)

    def test_actual_entry_unreadable_journal_is_redacted_and_not_redispatched(self):
        self.approval = True
        self.run_entry()
        evidence = next((self.host.state / "runs").glob("*.provider.jsonl"))
        evidence.write_text("malformed-private-fixture")
        result = self.run_entry()
        self.assertEqual(result["reasons"], ["remote-adapter-unavailable"])
        self.assertNotIn("private-fixture", json.dumps(result))
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_actual_entry_expired_lease_cannot_be_renewed_or_redispatched(self):
        from unittest.mock import patch
        self.approval = True
        first = self.run_entry()
        expired = first["execution"]["leaseExpiresAt"] + 1
        self.spec["verifiedRemote"].update(verifiedAt=expired, expiresAt=expired + 120)
        with patch.object(self.lane.time, "time", return_value=expired):
            result = self.run_entry()
        self.assertEqual(result["reasons"], ["resume_not_admitted"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_actual_entry_refreshes_the_proof_from_live_identity_and_owner_attestation(self):
        import time
        self.spec = {"model": self.model, "agentId": "agent-1", "agentName": "GLM 5.3 Developer"}
        self.attestation.write_text(json.dumps(owner_attestation(time.time() + 3600)))
        self.agents = [{"id": "agent-1", "name": "GLM 5.3 Developer", "executionMode": "auto"}]
        original = self.call

        def call(name, args):
            if name == "list_agents":
                self.calls.append((name, args))
                return {"agents": self.agents}
            return original(name, args)

        from unittest.mock import patch
        with patch("runpy.run_path", return_value={"mcp_call": call}):
            result = self.run_entry()
        self.assertEqual(result["proofRefresh"], "fresh")
        self.assertEqual(result["verdict"], "verified-not-queued")
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_actual_entry_without_an_mcp_call_holds_instead_of_crashing(self):
        from unittest.mock import patch
        with patch("runpy.run_path", return_value={}):
            result = self.run_entry()
        self.assertEqual(result["verdict"], "remote-held")
        self.assertFalse(self.calls)

    def test_actual_entry_without_attestation_holds_before_any_remote_call(self):
        self.spec = {"model": self.model, "agentId": "agent-1", "agentName": "GLM 5.3 Developer"}
        result = self.run_entry()
        self.assertEqual(result["proofRefresh"], "owner-attestation-missing")
        self.assertEqual(result["reasons"], ["remote-preflight-unverified"])
        self.assertFalse(self.calls)


def owner_attestation(expires, **extra):
    return {"agentId": "agent-1", "model": "z-ai/glm-5.3", "repository": "JovieInc/Jovie",
            "currentInstructions": True, "allInCap": True, "balanceUsd": 20, "maxCostUsd": 2,
            "attestedAt": 0, "expiresAt": expires, "attestedBy": "owner", **extra}


class ProofRefreshTest(unittest.TestCase):
    """JOV-7706: the proof joins a live list_agents identity read and the owner's attestation."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "attestation.json"
        self.spec = {"model": "z-ai/glm-5.3", "agentId": "agent-1", "agentName": "GLM 5.3 Developer"}
        self.agents = [{"id": "agent-1", "name": "GLM 5.3 Developer", "executionMode": "auto"}]
        self.now = 10_000

    def call(self, name, _args):
        assert name == "list_agents"
        if isinstance(self.agents, Exception):
            raise self.agents
        return {"agents": self.agents}

    def refresh(self, attestation=None):
        if attestation is not None:
            self.path.write_text(attestation if isinstance(attestation, str) else json.dumps(attestation))
        return remote.refresh_proof(self.spec, self.call, self.now, self.path)

    def test_fresh_proof_is_verified_and_short_lived(self):
        proof, reason = self.refresh(owner_attestation(self.now + 3600))
        self.assertIsNone(reason)
        self.assertEqual(proof["source"], "hyperagent-identity+owner-attestation")
        self.assertEqual(proof["expiresAt"], self.now + remote.PROOF_TTL_S)
        self.assertTrue(remote.verified({**self.spec, "verifiedRemote": proof}, self.now))
        soon, _ = self.refresh(owner_attestation(self.now + 60))
        self.assertEqual(soon["expiresAt"], self.now + 60)

    def test_every_missing_or_mismatched_input_holds(self):
        self.assertEqual(self.refresh(), (None, "owner-attestation-missing"))
        self.assertEqual(self.refresh("{not json")[1], "owner-attestation-unreadable")
        self.assertEqual(self.refresh("[]")[1], "owner-attestation-unreadable")
        self.assertEqual(self.refresh(owner_attestation(self.now - 1))[1], "owner-attestation-expired")
        self.assertEqual(self.refresh(owner_attestation(self.now + 60, agentId="other"))[1],
                         "owner-attestation-mismatch")
        self.assertEqual(self.refresh(owner_attestation(self.now + 60, allInCap=False))[1],
                         "owner-attestation-incomplete")
        self.assertEqual(self.refresh(owner_attestation(self.now + 60, maxCostUsd=50))[1],
                         "owner-attestation-incomplete")
        self.agents = [{"id": "agent-1", "name": "Renamed", "executionMode": "auto"}]
        self.assertEqual(self.refresh(owner_attestation(self.now + 60))[1], "remote-agent-identity-unverified")
        self.agents = [{"id": "agent-1", "name": "GLM 5.3 Developer", "executionMode": "confirm"}]
        self.assertEqual(self.refresh()[1], "remote-agent-not-auto")
        self.agents = RuntimeError("HTTP 401 invalid_grant")
        self.assertEqual(self.refresh()[1], "remote-oauth-expired")

    def test_unreadable_attestation_path_holds(self):
        self.path.mkdir()
        self.assertEqual(self.refresh(), (None, "owner-attestation-unreadable"))

    def test_health_entrypoint(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        self.path.write_text(json.dumps(owner_attestation(self.now + 3600, agentId="cmtj3n2q901i407adklzzq01t")))
        self.agents = [{"id": "cmtj3n2q901i407adklzzq01t", "name": "GLM 5.3 Developer", "executionMode": "auto"}]
        with patch.object(remote, "ATTESTATION", self.path), redirect_stdout(io.StringIO()) as out:
            self.assertEqual(remote.main(["health"], call=self.call, clock=lambda: self.now), 0)
            self.agents = []
            self.assertEqual(remote.main(["health"], call=self.call, clock=lambda: self.now), 1)
            with patch("shutil.which", return_value=None):
                self.assertEqual(remote.main(["health"]), 1)
        self.assertIn("available: true agent=GLM 5.3 Developer", out.getvalue())
        self.assertIn("reason=transport-missing", out.getvalue())
        with redirect_stdout(io.StringIO()), patch("sys.stderr", io.StringIO()):
            self.assertEqual(remote.main(["nope"]), 2)

    def test_run_refreshes_an_expired_proof_and_holds_when_it_cannot(self):
        calls = []

        def call(name, args):
            calls.append(name)
            if name == "list_agents":
                return {"agents": [{"id": "agent-1", "executionMode": "auto"}]}
            if name == "create_thread":
                return {"threadId": "t"}
            return {"thread": {"id": "t", "namedAgentId": "agent-1"}, "isRunning": False,
                    "awaitingApproval": False, "messages": [{"role": "assistant",
                    "content": "https://github.com/JovieInc/Jovie/pull/7 head: " + "a" * 40}]}

        marker = "<!-- hyperagent-attempt-id:" + hashlib.sha256(b"a1").hexdigest() + " -->"
        pr = {"number": 7, "url": "https://github.com/JovieInc/Jovie/pull/7", "state": "OPEN",
              "title": "JOV-1 fix", "body": "<!-- linear-issue-id:JOV-1 --> " + marker,
              "headRefName": "hyperagent/jov-1-x", "headRefOid": "a" * 40}
        fresh = {"agentId": "agent-1", "model": "z-ai/glm-5.3", "repository": "JovieInc/Jovie",
                 "currentInstructions": True, "allInCap": True, "balanceUsd": 5, "maxCostUsd": 1,
                 "executionMode": "auto", "source": remote.PROOF_SOURCES[1], "evidenceSha256": "d" * 64,
                 "verifiedAt": self.now, "expiresAt": self.now + 60}
        stale = {**fresh, "verifiedAt": 0, "expiresAt": 1}
        spec = {"model": "z-ai/glm-5.3", "verifiedRemote": stale}
        run = lambda refresh, path: remote.run(spec, "JOV-1", "a1", "hyperagent/jov-1-x", "p", path, call,
                                               lambda n: pr, lambda p: {"verdict": "landing"},
                                               clock=lambda: self.now, pause=lambda s: None, refresh=refresh)
        held = run(lambda s, n: (None, "owner-attestation-expired"), Path(self.tmp.name) / "a.jsonl")
        self.assertEqual(held["reasons"], ["remote-preflight-unverified"])
        self.assertEqual(calls, [])
        done = run(lambda s, n: (fresh, None), Path(self.tmp.name) / "b.jsonl")
        self.assertEqual(done["verdict"], "landing")


if __name__ == "__main__":
    unittest.main()
