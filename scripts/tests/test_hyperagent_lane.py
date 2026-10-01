from contextlib import contextmanager
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
        self.real_adopt = lane.adopt_pr
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
        def read(args, **kwargs):
            self.assertEqual(args[:3], ["gh", "pr", "view"])
            fields = args[args.index("--json") + 1].split(",")
            return type("Read", (), {"returncode": 0, "stdout": json.dumps({k: v for k, v in self.pr.items() if k in fields})})()
        self.read = read
        def adopt(host, provider, pr, *, sensitive=False):
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
        terminal_ledger = (self.host.state / "runs/execution-attempts.jsonl").read_text()
        repeated = self.run_entry()
        self.assertEqual(repeated["verdict"], "remote-held")
        self.assertEqual(repeated["reasons"], ["generation_terminal"])
        self.assertEqual((self.host.state / "runs/execution-attempts.jsonl").read_text(), terminal_ledger)
        self.assertEqual(len(self.gates), 1)
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def assert_sensitive_gate(self, lines, reasons, review_expected):
        from unittest.mock import patch
        from contextlib import ExitStack
        from types import SimpleNamespace
        lane = self.lane
        commands = []
        def command(args, **kwargs):
            commands.append(args)
            if args[:3] == ["gh", "pr", "view"]:
                return self.read(args, **kwargs)
            return SimpleNamespace(returncode=0, stdout=(
                f"{lines - 1}\t0\tscripts/lanes/lane_runner.py\n1\t0\tscripts/tests/test_hyperagent_lane.py\n" if args[:3] == ["git", "diff", "--numstat"] else ""))
        with ExitStack() as stack:
            stack.enter_context(patch.object(lane, "adopt_pr", side_effect=self.real_adopt))
            stack.enter_context(patch.object(lane, "sh", side_effect=command))
            for name in ("require_disk", "add_worktree", "install_dependencies", "remove_worktree", "record_held"):
                stack.enter_context(patch.object(lane, name))
            stack.enter_context(patch.object(lane, "provider_may_run", return_value=True))
            stack.enter_context(patch.object(lane, "check_commands", return_value=[]))
            review = stack.enter_context(patch.object(lane, "sensitive_review", return_value=(False, ["sensitive-review-fixture"])))
            result = self.run_entry()
        self.assertEqual(result["verdict"], "remote-repair-required")
        self.assertEqual(result["reasons"], reasons)
        self.assertEqual(review.call_count, int(review_expected))
        self.assertFalse(any(args[:3] in (["gh", "pr", "ready"], ["gh", "pr", "merge"]) for args in commands))

    def test_sensitive_issue_remote_entry_enforces_existing_500_line_cap(self):
        self.issue.labels = ["Area:Auth"]
        self.assert_sensitive_gate(600, ["diff-too-large:600"], False)

    def test_sensitive_issue_remote_entry_runs_independent_review(self):
        self.issue.labels = ["Billing"]
        self.assert_sensitive_gate(2, ["sensitive-review-fixture"], True)

    def test_sensitive_pr_label_cannot_be_downgraded_by_ordinary_issue(self):
        self.pr["labels"] = [{"name": "sensitive-surface"}]
        self.assert_sensitive_gate(2, ["sensitive-review-fixture"], True)

    def test_expired_remote_attempt_is_reconciled_without_another_dispatch(self):
        from unittest.mock import patch
        self.approval = True
        held = self.run_entry()
        self.assertEqual(held["reasons"], ["remote-approval-required"])
        expired_at = held["execution"]["leaseExpiresAt"]
        self.spec["verifiedRemote"].update(verifiedAt=expired_at, expiresAt=expired_at + 120)
        calls_before = list(self.calls)
        journal = next((self.host.state / "runs").glob("*.provider.jsonl"))
        journal_before = journal.read_text()
        with patch("time.time", return_value=expired_at):
            reconciled = self.run_entry()
            repeated = self.run_entry()
        self.assertEqual(reconciled["reasons"], ["expired_attempt_reconciled"])
        self.assertEqual(repeated["reasons"], ["generation_terminal"])
        rows = [json.loads(line) for line in
                (self.host.state / "runs/execution-attempts.jsonl").read_text().splitlines()]
        self.assertEqual(sum(row["event"] == "attempt_started" for row in rows), 1)
        self.assertEqual(sum(row["event"] == "attempt_finished" for row in rows), 1)
        self.assertEqual(rows[-1]["failureClass"], "lost_worker")
        self.assertEqual(rows[-1]["terminalState"], "failed_unknown")
        self.assertEqual(self.calls, calls_before)
        self.assertEqual(journal.read_text(), journal_before)
        self.assertFalse(self.gates)

    def test_live_remote_attempt_keeps_foreign_owner_out_without_renewal(self):
        from unittest.mock import patch
        self.approval = True
        held = self.run_entry()
        path = self.host.state / "runs/execution-attempts.jsonl"
        ledger_before, calls_before = path.read_text(), list(self.calls)
        with patch.object(self.lane, "HOST", "another-worker"):
            duplicate = self.run_entry()
        self.assertEqual(duplicate["reasons"], ["duplicate_active"])
        self.assertEqual(duplicate["execution"]["fencingToken"], held["execution"]["fencingToken"])
        self.assertEqual(path.read_text(), ledger_before)
        self.assertEqual(self.calls, calls_before)
        self.assertFalse(self.gates)

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
            self.assertIsNone(lane.claim_adoptable_pr(self.host, "hyperagent", [draft]))
            self.assertEqual(lane.claim_adoptable_pr(self.host, "hyperagent", found), dated)
            self.assertIsNone(lane.claim_adoptable_pr(self.host, "hyperagent", found))
        older = {**draft, "number": 5, "headRefName": "hyperagent/jov-6871-20260929t100000"}
        self.assertEqual(lane.best_per_issue([older, draft]), [draft])
        self.assertEqual(lane.sweep_plan([older, draft], now=100, pushes={7: 100}), ([(older, 7)], []))

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
        self.assertEqual(result["reasons"], ["expired_attempt_reconciled"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    @contextmanager
    def worker_fixture(self):
        from unittest.mock import patch
        from contextlib import ExitStack
        from types import SimpleNamespace
        lane = self.lane
        state = {"name": "Todo"}
        moves = []
        linear = SimpleNamespace(lane_issues=lambda label: [self.issue] if state["name"] == "Todo" else [],
            state_of=lambda ident: state["name"], get_issue=lambda ident: (self.issue, state["name"]),
            move=lambda ident, name: (moves.append((ident, name)), state.update(name=name)), comment=lambda *args: None)
        with ExitStack() as stack:
            for name, value in {"Linear": lambda env: linear, "load_providers": lambda: {"hyperagent": {**self.spec, "label": "hyperagent"}},
                "lane_prs": lambda *args, **kw: [], "fix_candidates": lambda *args: [], "requeue_verified": lambda *args, **kw: None,
                "escalate_exhausted": lambda *args: None, "claim_red_pr": lambda *args: None, "claim_adoptable_pr": lambda *args: None,
                "sweep_lane_prs": lambda *args: None, "in_flight_issues": lambda: frozenset(), "reexec": lambda *args: 0}.items():
                stack.enter_context(patch.object(lane, name, value))
            stack.enter_context(patch.object(lane.disk_guard, "check", return_value={"admitted": True}))
            stack.enter_context(patch.object(lane.pr_events, "queued_prs", return_value=[]))
            stack.enter_context(patch.object(lane.pr_events, "claim_event_pr", return_value=None))
            yield lane, state, moves

    def test_worker_resumes_only_its_receipt_owned_current_in_progress_issue(self):
        with self.worker_fixture() as (lane, state, moves):
            proof = self.spec.pop("verifiedRemote")
            self.assertEqual(lane.worker(self.host, "hyperagent"), 1)
            self.assertFalse(self.calls)
            self.spec["verifiedRemote"] = proof
            self.approval = True
            self.assertEqual(lane.worker(self.host, "hyperagent"), 1)
            before = [json.loads(x) for x in (self.host.state / "runs/ledger.jsonl").read_text().splitlines()][-1]
            with (self.host.state / "runs/ledger.jsonl").open("a") as ledger:
                ledger.write(json.dumps({"provider": "hyperagent", "kind": "adopt", "pr": 99}) + "\n")
            self.approval = False
            lane.worker(self.host, "hyperagent")
            after = [json.loads(x) for x in (self.host.state / "runs/ledger.jsonl").read_text().splitlines()][-1]
        self.assertEqual(after["verdict"], "verified-not-queued")
        self.assertEqual(after["execution"]["fencingToken"], before["execution"]["fencingToken"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)
        self.assertEqual(moves, [(self.issue.id, "In Progress")])

    def test_known_predispatch_failure_retries_without_unknown_creation_or_renewal(self):
        from unittest.mock import patch
        original = self.call
        def failing(name, args):
            if name == "list_agents": raise OSError("read unavailable")
            return original(name, args)
        with patch("runpy.run_path", return_value={"mcp_call": failing}):
            held = self.run_entry()
        self.assertEqual(held["execution"]["result"], "failed_known")
        self.assertEqual(held["execution"]["retryDecision"], "retry")
        self.assertIsNone(held["execution"]["terminalState"])
        completed = self.run_entry()
        self.assertEqual(completed["verdict"], "verified-not-queued")
        self.assertNotEqual(completed["execution"]["fencingToken"], held["execution"]["fencingToken"])

    def test_repeated_known_mode_mismatch_quarantines_without_paid_dispatch(self):
        from unittest.mock import patch
        with patch("runpy.run_path", return_value={"mcp_call": lambda *args: {"agents": []}}):
            results = [self.run_entry() for _ in range(self.lane.MAX_FAILURES)]
            last = self.run_entry()
        self.assertEqual(results[1]["execution"]["terminalState"], "quarantined")
        self.assertEqual(last["reasons"], ["generation_terminal"])
        self.assertFalse(self.calls)
        self.assertFalse(self.gates)

    def test_pending_selection_preserves_foreign_revision_and_terminal_ownership(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        self.approval = True
        self.run_entry()
        proof = self.spec.pop("verifiedRemote")
        self.run_entry()  # retain prior ownership across temporarily missing settings
        self.spec["verifiedRemote"] = proof
        lane = self.lane
        linear = SimpleNamespace(get_issue=lambda ident: (self.issue, "In Progress"))
        self.assertEqual(lane.pending_hyperagent_issue(self.host, self.spec, linear), self.issue)
        with patch.object(lane, "HOST", "foreign-owner"):
            self.assertIsNone(lane.pending_hyperagent_issue(self.host, self.spec, linear))
        self.issue.description += " changed revision"
        self.assertIsNone(lane.pending_hyperagent_issue(self.host, self.spec, linear))
        self.issue.description = self.issue.description.removesuffix(" changed revision")
        linear.get_issue = lambda ident: (self.issue, "Todo")
        self.assertIsNone(lane.pending_hyperagent_issue(self.host, self.spec, linear))
        linear.get_issue = lambda ident: (self.issue, "Done")
        self.assertIsNone(lane.pending_hyperagent_issue(self.host, self.spec, linear))
        self.approval = False
        self.run_entry()
        linear.get_issue = lambda ident: (self.issue, "In Progress")
        self.assertEqual(lane.pending_hyperagent_issue(self.host, self.spec, linear), self.issue)

    def test_existing_thread_read_failure_cannot_become_retryable_no_dispatch(self):
        from unittest.mock import patch
        self.approval = True
        held = self.run_entry()
        ledger = self.host.state / "runs/execution-attempts.jsonl"
        before = ledger.read_text()
        with patch("runpy.run_path", return_value={"mcp_call": lambda *args: (_ for _ in ()).throw(OSError("read unavailable"))}):
            result = self.run_entry()
        self.assertEqual(result["verdict"], "remote-held")
        self.assertEqual(result["execution"]["fencingToken"], held["execution"]["fencingToken"])
        self.assertEqual(ledger.read_text(), before)
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_distinct_known_read_failures_exhaust_existing_attempt_budget(self):
        from unittest.mock import patch
        reasons = iter(("401", "402", "read unavailable"))
        def failed_read(*args): raise OSError(next(reasons))
        with patch("runpy.run_path", return_value={"mcp_call": failed_read}):
            results = [self.run_entry() for _ in range(self.lane.MAX_FAILURES)]
        self.assertEqual(results[-1]["execution"]["terminalState"], "budget_exhausted")
        self.assertEqual(self.run_entry()["reasons"], ["generation_terminal"])
        self.assertFalse(self.calls)

    def test_reserved_boundary_without_create_intent_cannot_be_retired_or_rebound(self):
        from unittest.mock import patch
        self.approval = True
        first = self.run_entry()
        journal = next((self.host.state / "runs").glob("*.provider.jsonl"))
        state = json.loads(journal.read_text().splitlines()[-1])
        state.pop("intent"); state.pop("threadId")
        journal.write_text(json.dumps(state) + "\n")
        ledger = self.host.state / "runs/execution-attempts.jsonl"
        before = ledger.read_text()
        with patch("runpy.run_path", return_value={"mcp_call": lambda *args: {"agents": []}}):
            held = self.run_entry()
        self.assertEqual(held["execution"]["fencingToken"], first["execution"]["fencingToken"])
        self.assertEqual(ledger.read_text(), before)
        self.assertNotIn("knownPreDispatchFailure", journal.read_text())

    def test_retry_journal_cannot_rebind_without_matching_known_finished_disposition(self):
        from unittest.mock import patch
        with patch("runpy.run_path", return_value={"mcp_call": lambda *args: {"agents": []}}):
            self.run_entry()
        ledger = self.host.state / "runs/execution-attempts.jsonl"
        rows = [json.loads(x) for x in ledger.read_text().splitlines()]
        rows[-1]["failureClass"] = "repair_incomplete"
        ledger.write_text("".join(json.dumps(row) + "\n" for row in rows))
        result = self.run_entry()
        self.assertEqual(result["reasons"], ["remote-receipt-attribution-mismatch"])
        self.assertFalse(self.calls)

    def test_transport_setup_failure_keeps_local_pending_ownership_without_claim(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        with patch.object(self.lane.shutil, "which", return_value=None):
            held = self.run_entry()
        self.assertEqual(held["verdict"], "remote-held")
        self.assertFalse((self.host.state / "runs/execution-attempts.jsonl").exists())
        for target in ("transport", "context"):
            patcher = patch("runpy.run_path", side_effect=OSError("unavailable")) if target == "transport" else patch.object(self.lane, "context_pack", side_effect=OSError("unavailable"))
            with self.subTest(target=target), patcher:
                self.assertEqual(self.run_entry()["verdict"], "remote-held")
                self.assertFalse((self.host.state / "runs/execution-attempts.jsonl").exists())
        linear = SimpleNamespace(get_issue=lambda ident: (self.issue, "In Progress"))
        self.assertEqual(self.lane.pending_hyperagent_issue(self.host, self.spec, linear), self.issue)
        self.assertEqual(self.run_entry()["verdict"], "verified-not-queued")
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_digest_remote_prs_never_enter_generic_adoption_or_red_repair(self):
        from unittest.mock import patch
        draft = {**self.pr, "isDraft": True, "mergeStateStatus": "DIRTY"}
        dated = {**draft, "number": 9, "headRefName": "hyperagent/jov-9-20260930t123000"}
        lane = self.lane
        with patch.object(lane, "claimed_elsewhere", return_value=False), patch.object(lane, "post_claim"):
            for provider in ("hyperagent", "devin"):
                with self.subTest(provider=provider):
                    self.assertIsNone(lane.claim_adoptable_pr(self.host, provider, [draft]))
                    self.assertIsNone(lane.claim_red_pr(self.host, provider, [draft]))
            self.assertEqual(lane.claim_adoptable_pr(self.host, "devin", [draft, dated]), dated)

    def test_worker_terminal_known_mode_failure_moves_backlog_without_paid_dispatch(self):
        from unittest.mock import patch
        with self.worker_fixture() as (lane, state, moves), patch("runpy.run_path", return_value={"mcp_call": lambda *args: {"agents": []}}):
            lane.worker(self.host, "hyperagent"); lane.worker(self.host, "hyperagent")
            self.assertEqual(state["name"], "Backlog")
            self.assertEqual(moves, [(self.issue.id, "In Progress"), (self.issue.id, "Backlog")])
        self.assertFalse(self.calls)

    def test_corrupt_candidate_and_empty_journal_do_not_block_owned_pending_issue(self):
        from types import SimpleNamespace
        from scripts.tests.test_lane_runner import issue
        self.approval = True; self.run_entry()
        ledger = self.host.state / "runs/ledger.jsonl"; good = json.loads(ledger.read_text().splitlines()[-1]); bad = issue("JOV-99")
        ident = self.lane.execution_attempt.identity("linear-work", {"issue": bad.identifier, "outcome": "draft-pr"}, {"title": bad.title, "description": bad.description})
        row = {**good, "issue": bad.identifier, "linearIssueId": bad.id, "execution": {**good["execution"], **ident}}
        (self.host.state / "runs" / (ident["identityDigest"] + ".provider.jsonl")).write_text("")
        linear = SimpleNamespace(get_issue=lambda ident: (bad if ident == bad.id else self.issue, "In Progress"))
        for prior, binding in ((None, {}), ("bad", {}), (["bad"], {}), (row["execution"], "bad"), (row["execution"], ["bad"])):
            with self.subTest(prior=prior, binding=binding):
                chain = [{**row, "execution": prior}, {**row, "execution": None, "pendingBinding": binding}, good]
                ledger.write_text("{broken\n[]\n" + "".join(json.dumps(r) + "\n" for r in ([row, good] if prior is None else chain)))
                self.assertEqual(self.lane.pending_hyperagent_issue(self.host, self.spec, linear), self.issue)

    def test_worker_filters_digest_github_events_before_generic_claim(self):
        from unittest.mock import patch
        with self.worker_fixture() as (lane, state, moves), patch.object(lane.pr_events, "queued_prs", return_value=[self.pr]), patch.object(lane.pr_events, "claim_event_pr", side_effect=lambda host, module, name, events: self.assertEqual(events, [])):
            self.spec.pop("verifiedRemote"); lane.worker(self.host, "hyperagent")
        self.assertFalse(self.calls)

    def test_completed_held_remote_worker_records_repair_dependency_in_backlog(self):
        from unittest.mock import patch
        with self.worker_fixture() as (lane, state, moves), patch.object(lane, "adopt_pr", return_value={"verdict": "held", "pr": 7, "prUrl": self.pr["url"], "headSha": self.pr["headRefOid"], "reasons": ["diff-too-large:600"]}):
            lane.worker(self.host, "hyperagent")
            self.assertEqual(state["name"], "Backlog")
            receipt = json.loads((self.host.state / "runs/ledger.jsonl").read_text().splitlines()[-1])
            self.assertEqual(receipt["verdict"], "remote-repair-required")
            self.assertEqual(receipt["dependencies"], ["automatic-hyper-repair-unavailable"])
            self.assertEqual(receipt["reasons"], ["diff-too-large:600"])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_completed_gate_timeout_retries_same_head_with_fresh_issue_sensitivity(self):
        from unittest.mock import patch
        gates = []
        def gate(host, name, pr, *, sensitive=False):
            gates.append(sensitive)
            return {"verdict": "gate-timeout" if len(gates) == 1 else "verified-not-queued", "pr": 7, "prUrl": pr["url"], "headSha": pr["headRefOid"], "reasons": ["gate-timeout:900s:x1"] if len(gates) == 1 else []}
        with self.worker_fixture() as (lane, state, moves), patch.object(lane, "adopt_pr", side_effect=gate):
            lane.worker(self.host, "hyperagent"); self.issue.labels = ["Billing"]
            lane.worker(self.host, "hyperagent")
            self.assertEqual(state["name"], "Backlog")
            receipt = json.loads((self.host.state / "runs/ledger.jsonl").read_text().splitlines()[-1])
            self.assertEqual(receipt["dependencies"], ["automatic-guarded-review-budget-unavailable"])
        self.assertEqual(gates, [False])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_unauthenticated_digest_requeue_retains_entry_and_never_enqueues(self):
        from unittest.mock import patch
        path = self.host.state / "requeue.json"; path.write_text(json.dumps({"7": self.pr["headRefOid"]}))
        with patch.object(self.lane, "sh") as command:
            self.lane.requeue_verified(self.host, [self.pr])
        command.assert_not_called()
        self.assertEqual(json.loads(path.read_text()), {"7": self.pr["headRefOid"]})

    def test_completed_verified_not_queued_retries_exact_enqueue_with_local_zero_spend_fence(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        self.run_entry(); path = self.host.state / "requeue.json"; path.write_text(json.dumps({"7": self.pr["headRefOid"]})); commands = []
        def command(args, **kw):
            commands.append(args)
            return self.read(args, **kw) if args[:3] == ["gh", "pr", "view"] else SimpleNamespace(returncode=0, stdout="")
        requeue = self.lane.requeue_verified
        with self.worker_fixture() as (lane, state, moves), patch.object(lane, "sh", side_effect=command):
            state["name"] = "In Progress"; linear = lane.Linear(None)
            retry = lambda pr: lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue, expected_pr=pr, enqueue=True)["verdict"] == "landing"
            requeue(self.host, [self.pr], remote_retry=retry)
            self.assertEqual(json.loads(path.read_text()), {})
            self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue)["verdict"], "landing")
        self.assertEqual(sum(args[:3] == ["gh", "pr", "merge"] for args in commands), 1)
        merge = next(args for args in commands if args[:3] == ["gh", "pr", "merge"])
        self.assertEqual(merge[merge.index("--match-head-commit") + 1], self.pr["headRefOid"])
        rows = [json.loads(x) for x in (self.host.state / "runs/execution-attempts.jsonl").read_text().splitlines()]
        local = [r for r in rows if r.get("owner", {}).get("tool") == "hyperagent-qualification"]
        self.assertEqual(sum(r["event"] == "attempt_started" for r in local), 1)
        reservations = [r["reservation"] for r in rows if r["identityDigest"] == local[0]["identityDigest"] and r["event"] == "boundary_admitted"]
        self.assertEqual(reservations, [{"spend": 0, "mutations": 1}])
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_completed_context_rejects_foreign_changed_and_unfinished_provenance(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        self.run_entry(); lane = self.lane; linear = SimpleNamespace(get_issue=lambda ident: (self.issue, "In Progress"))
        before = list(self.gates); original = self.pr.copy()
        for field, value in (("headRefOid", "b" * 40), ("headRefName", "other"), ("body", ""), ("title", "other")):
            with self.subTest(field=field):
                self.pr[field] = value
                self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue, enqueue=True)["verdict"], "remote-held")
                self.pr.update(original)
        for target, value in (("owner", "foreign"), ("disabled", False), ("proof", False)):
            with self.subTest(target=target):
                with patch.object(lane, "HOST", value if target == "owner" else lane.HOST):
                    old = self.spec.get("enabled", True); self.spec["enabled"] = value if target == "disabled" else old
                    proof = self.spec["verifiedRemote"]["allInCap"]; self.spec["verifiedRemote"]["allInCap"] = value if target == "proof" else proof
                    self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue, enqueue=True)["verdict"], "remote-held")
                    self.spec["enabled"] = old; self.spec["verifiedRemote"]["allInCap"] = proof
        ledger = self.host.state / "runs/execution-attempts.jsonl"; rows = [json.loads(x) for x in ledger.read_text().splitlines()]
        rows[-1]["result"] = rows[-1]["terminalState"] = "failed_unknown"; ledger.write_text("".join(json.dumps(r) + "\n" for r in rows))
        self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue, enqueue=True)["verdict"], "remote-held")
        self.assertEqual(self.gates, before)

    def test_completed_gate_continuation_is_bounded_and_preserves_original_journal(self):
        from unittest.mock import patch
        gate = {"verdict": "gate-timeout", "pr": 7, "prUrl": self.pr["url"], "headSha": self.pr["headRefOid"], "reasons": ["gate-timeout:900s:x1"]}
        with self.worker_fixture() as (lane, state, moves), patch.object(lane, "adopt_pr", return_value=gate) as adoption:
            lane.worker(self.host, "hyperagent")
            for _ in range(lane.MAX_GATE_TIMEOUTS): lane.worker(self.host, "hyperagent")
            self.assertEqual(state["name"], "Backlog")
            self.assertEqual(adoption.call_count, 1 + lane.MAX_GATE_TIMEOUTS)
            lane.worker(self.host, "hyperagent"); self.assertEqual(adoption.call_count, 1 + lane.MAX_GATE_TIMEOUTS)
        journal = json.loads(next((self.host.state / "runs").glob("*.provider.jsonl")).read_text().splitlines()[-1])
        self.assertEqual(journal["result"]["verdict"], "gate-timeout")
        self.assertEqual(journal["completionResult"]["verdict"], "remote-repair-required")
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_unknown_qualification_outcome_never_regates_or_enqueues(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        self.run_entry(); lane = self.lane; linear = SimpleNamespace(get_issue=lambda ident: (self.issue, "In Progress"))
        journal = next((self.host.state / "runs").glob("*.provider.jsonl")); state = json.loads(journal.read_text().splitlines()[-1])
        state["completionIntent"] = {"operation": "enqueue", "head": self.pr["headRefOid"], "sensitive": False}; journal.write_text(json.dumps(state) + "\n")
        with patch.object(lane, "adopt_pr") as gate:
            self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue, enqueue=True)["verdict"], "remote-held")
            gate.assert_not_called()
        self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_shared_requeue_missing_lane_inventory_preserves_unknown_and_exact_digest(self):
        from unittest.mock import patch
        path = self.host.state / "requeue.json"
        for live in (None, self.pr, {**self.pr, "state": "CLOSED"}, {**self.pr, "headRefOid": "b" * 40}):
            with self.subTest(live=live):
                path.write_text(json.dumps({"7": self.pr["headRefOid"]}))
                with patch.object(self.lane, "reconcile_fix_target", return_value=live), patch.object(self.lane, "sh") as command:
                    self.lane.requeue_verified(self.host, [])
                    command.assert_not_called()
                self.assertEqual(json.loads(path.read_text()), {"7": self.pr["headRefOid"]} if live is None or live == self.pr else {})

    def test_legacy_completed_held_worker_handoff_and_known_gate_failure(self):
        from unittest.mock import patch
        for verdict in ("held", "failed", "skipped"):
            with self.subTest(verdict=verdict):
                self.setUp(); base = {"pr": 7, "prUrl": self.pr["url"], "headSha": self.pr["headRefOid"], "reasons": ["preserved-reason"]}
                with self.worker_fixture() as (lane, state, moves), patch.object(lane, "adopt_pr", return_value={**base, "verdict": "held" if verdict == "held" else "gate-timeout"}):
                    lane.worker(self.host, "hyperagent"); state["name"] = "In Progress"
                    if verdict == "held":
                        ledger = self.host.state / "runs/ledger.jsonl"; rows = ledger.read_text().splitlines(); row = json.loads(rows[-1]); row["verdict"] = "held"; row.pop("pendingBinding", None); rows[-1] = json.dumps(row); ledger.write_text("\n".join(rows) + "\n")
                    with patch.object(lane, "adopt_pr", return_value={**base, "verdict": verdict}) as gate:
                        lane.worker(self.host, "hyperagent")
                        self.assertEqual(state["name"], "Backlog"); self.assertEqual(gate.call_count, 0 if verdict == "held" else 1)
                    receipt = json.loads((self.host.state / "runs/ledger.jsonl").read_text().splitlines()[-1]); self.assertEqual(receipt["verdict"], "remote-repair-required")
                    self.assertEqual(receipt["reasons"], ["preserved-reason"])
                    if verdict != "held":
                        self.assertEqual(receipt["qualificationExecution"]["result"], "failed_known")
                        self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, lane.Linear(None), self.issue)["verdict"], "remote-held")
                        state["name"] = "In Progress"
                        self.assertEqual(lane.reconcile_hyperagent_completion(self.host, self.spec, lane.Linear(None), self.issue)["verdict"], "remote-repair-required")
                self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_actual_gate_rejects_changed_head_before_enqueue(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        merges = []
        def command(args, **kw):
            if args[:3] == ["gh", "pr", "merge"]:
                merges.append(args); return SimpleNamespace(returncode=1 if "--match-head-commit" in args else 0, stdout="")
            return SimpleNamespace(returncode=0, stdout="1\t1\tscripts/test_example.py\n" if args[:3] == ["git", "diff", "--numstat"] else "")
        with patch.object(self.lane, "sh", side_effect=command), patch.object(self.lane, "check_commands", return_value=[]):
            result = self.lane.gate_pr(self.host, self.pr, self.host.state, None)
        self.assertEqual(result["verdict"], "verified-not-queued")
        self.assertEqual(merges[0][merges[0].index("--match-head-commit") + 1], self.pr["headRefOid"])

    def test_queue_retry_requires_authenticated_current_gate_sensitivity(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        for escalation in ("Billing", "pr-label", "missing", "tampered", "pre-sensitive"):
            with self.subTest(escalation=escalation):
                self.setUp()
                if escalation == "pre-sensitive": self.issue.labels = ["Billing"]
                self.run_entry(); lane = self.lane; gates = []; queues = []
                journal = next((self.host.state / "runs").glob("*.provider.jsonl")); state = json.loads(journal.read_text().splitlines()[-1])
                if escalation == "Billing": self.issue.labels = ["Billing"]
                if escalation == "pr-label": self.pr["labels"] = [{"name": lane.SENSITIVE_PR_LABEL}]
                if escalation in ("missing", "tampered"):
                    state["result"].pop("gateSensitive", None)
                    if escalation == "tampered": state["result"]["gateSensitive"] = True
                    journal.write_text(json.dumps(state) + "\n")
                    if escalation == "missing":
                        ledger = self.host.state / "runs/execution-attempts.jsonl"; rows = [json.loads(x) for x in ledger.read_text().splitlines()]; rows[-1].pop("gateSensitive", None); ledger.write_text("".join(json.dumps(r) + "\n" for r in rows))
                def command(args, **kw):
                    if args[:3] in (["gh", "pr", "ready"], ["gh", "pr", "merge"]): queues.append(args)
                    return self.read(args, **kw) if args[:3] == ["gh", "pr", "view"] else SimpleNamespace(returncode=0, stdout="")
                def gate(host, name, pr, *, sensitive=False):
                    self.assertFalse(queues); gates.append(sensitive)
                    return {"verdict": "verified-not-queued", "pr": 7, "prUrl": pr["url"], "headSha": pr["headRefOid"], "reasons": []}
                linear = SimpleNamespace(get_issue=lambda ident: (self.issue, "In Progress"))
                with patch.object(lane, "sh", side_effect=command), patch.object(lane, "adopt_pr", side_effect=gate):
                    result = lane.reconcile_hyperagent_completion(self.host, self.spec, linear, self.issue, enqueue=True)
                self.assertEqual(len(queues), 2 if escalation == "pre-sensitive" else 0)
                self.assertEqual(result["verdict"], "landing" if escalation == "pre-sensitive" else "remote-held" if escalation == "tampered" else "verified-not-queued" if escalation == "missing" else "remote-repair-required")
                self.assertEqual(gates, [False] if escalation == "missing" else [])
                if escalation in ("Billing", "pr-label"): self.assertEqual(result["dependencies"], ["automatic-guarded-review-budget-unavailable"])
                self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)

    def test_actual_worker_preserves_retry_repair_disposition_without_second_run(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        for condition in ("Billing", "pr-label", "exhausted"):
            with self.subTest(condition=condition):
                self.setUp(); self.run_entry(); lane = self.lane; retry = lane.requeue_verified; comments = []; commands = []
                if condition == "Billing": self.issue.labels = ["Billing"]
                if condition == "pr-label": self.pr["labels"] = [{"name": lane.SENSITIVE_PR_LABEL}]
                path = self.host.state / "requeue.json"; path.write_text(json.dumps({"7": self.pr["headRefOid"]}))
                def command(args, **kw):
                    commands.append(args)
                    return self.read(args, **kw) if args[:3] == ["gh", "pr", "view"] else SimpleNamespace(returncode=1 if args[:3] == ["gh", "pr", "merge"] else 0, stdout="")
                with self.worker_fixture() as (module, state, moves), patch.object(lane, "requeue_verified", retry), patch.object(lane, "lane_prs", return_value=[self.pr]), patch.object(lane, "sh", side_effect=command), patch.object(lane, "run_issue") as run, patch.object(lane, "adopt_pr") as gate:
                    state["name"] = "In Progress"; lane.Linear(None).comment = lambda ident, text: comments.append(text)
                    for _ in range(lane.MAX_FAILURES if condition == "exhausted" else 1): lane.worker(self.host, "hyperagent")
                    self.assertEqual(state["name"], "Backlog"); run.assert_not_called(); gate.assert_not_called()
                receipt = json.loads((self.host.state / "runs/ledger.jsonl").read_text().splitlines()[-1]); dependency = "automatic-hyper-repair-unavailable" if condition == "exhausted" else "automatic-guarded-review-budget-unavailable"
                self.assertEqual(receipt["verdict"], "remote-repair-required"); self.assertEqual(receipt["issue"], self.issue.identifier)
                self.assertEqual(receipt["dependencies"], [dependency]); self.assertIn(dependency, comments[-1]); self.assertFalse(any("queued;" in text for text in comments))
                self.assertEqual(json.loads(path.read_text()), {"7": self.pr["headRefOid"]})
                journal = json.loads(next((self.host.state / "runs").glob("*.provider.jsonl")).read_text().splitlines()[-1]); self.assertEqual(journal["completionResult"]["verdict"], "remote-repair-required")
                self.assertEqual(sum(n == "create_thread" for n, _ in self.calls), 1)
                if condition != "exhausted": self.assertFalse(any(args[:3] in (["gh", "pr", "ready"], ["gh", "pr", "merge"]) for args in commands))


if __name__ == "__main__":
    unittest.main()
