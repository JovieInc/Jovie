"""Contract tests for the durable execution-attempt ledger (JOV-5926)."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import threading
import unittest
import copy
import io
import runpy
from datetime import datetime, timezone
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "scripts/lanes/execution_attempt.py"
SPEC = importlib.util.spec_from_file_location("execution_attempt", MODULE)
attempt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(attempt)
LOCAL = {"kind": "local-test"}
def policy(**overrides):
    return {"attempts": 2, "concurrency": 1, "wallSeconds": 60, "spend": 2, "mutations": 2,
            "leaseSeconds": 10, "version": "test-v1", **overrides}
def owner(name="worker-a"):
    return {"owner": name, "runtime": "test", "provider": "fixture", "model": "none", "tool": "unit", "accountPool": "test"}
class ExecutionAttemptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "ledger.jsonl"
        self.ident = attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 7}, {"head": "a" * 40})
    def claim(self, now=100, ident=None, path=None, coordination=LOCAL, **kwargs):
        return attempt.claim(path or self.path, ident or self.ident, kwargs.get("owner", owner()), kwargs.get("policy", policy()),
            {"triggerId": kwargs.get("trigger", "delivery-1"), "correlationId": "corr", "causationId": "cause"}, now, coordination=coordination)
    def finish(self, ident, claimed, result, detail, now):
        return attempt.finish(self.path, ident, claimed["fencingToken"], result, detail, now, coordination=LOCAL)
    def test_identity_and_two_process_local_lock(self):
        self.assertEqual(self.ident, attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 7}, {"head": "a" * 40}))
        request = {"command": "claim", "path": str(self.path), "ident": self.ident, "owner": owner(), "policy": policy(),
                   "trigger": {"triggerId": "same"}, "now": 100, "coordination": LOCAL}
        env = {**attempt.os.environ, "LANES_STATE": str(Path(self.tmp.name) / "state")}
        env.pop(attempt.lifecycle.FD_ENV, None)
        children = [subprocess.Popen([sys.executable, str(MODULE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env) for _ in range(2)]
        results = [json.loads(child.communicate(json.dumps(request))[0]) for child in children]
        self.assertEqual([row["admitted"] for row in results].count(True), 1)
    def test_resume_preserves_live_owner_fence_lease_and_budget(self):
        claimed = self.claim()
        before = self.path.read_text()
        resumed = attempt.resume(self.path, self.ident, claimed["fencingToken"], owner(), now=105, coordination=LOCAL)
        self.assertTrue(resumed["admitted"])
        self.assertTrue(resumed["resumed"])
        self.assertEqual(resumed["fencingToken"], claimed["fencingToken"])
        self.assertEqual(resumed["leaseExpiresAt"], 110)
        self.assertEqual(resumed["remainingBudgets"], claimed["remainingBudgets"])
        self.assertEqual(self.path.read_text(), before)
    def test_resume_rejects_foreign_owner_wrong_fence_expiry_and_terminal(self):
        claimed = self.claim()
        for who, fence, now in [(owner("other"), claimed["fencingToken"], 105),
                                (owner(), "wrong", 105), (owner(), claimed["fencingToken"], 110)]:
            self.assertFalse(attempt.resume(self.path, self.ident, fence, who, now=now, coordination=LOCAL)["admitted"])
        self.finish(self.ident, claimed, "succeeded", {}, 106)
        self.assertFalse(attempt.resume(self.path, self.ident, claimed["fencingToken"], owner(), now=107, coordination=LOCAL)["admitted"])
    def test_github_coordination_dedupes_racing_local_paths(self):
        rows, lock, barrier = [], threading.Lock(), threading.Barrier(2)
        def fake_rows(*_):
            with lock: return rows[:], rows[-1]["_remote"]["statusId"] if rows else None
        def fake_append(_coordination, _ident, row, head):
            barrier.wait()
            with lock:
                if rows: return None
                event = "event-1"; rows.append({**row, "_remote": {"prevStatusId": head, "eventId": event, "statusId": 1}}); return event
        real = attempt._github_rows, attempt._github_append
        attempt._github_rows, attempt._github_append = fake_rows, fake_append
        self.addCleanup(lambda: (setattr(attempt, "_github_rows", real[0]), setattr(attempt, "_github_append", real[1])))
        coordination = {"kind": "github-status", "repository": "JovieInc/Jovie", "sha": "a" * 40}
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda host: self.claim(path=Path(self.tmp.name) / f"host-{host}.jsonl", coordination=coordination), "ab"))
        self.assertEqual(sorted(result.get("admitted", False) for result in results), [False, True])
    def test_gh_without_a_token_env_uses_gh_own_auth(self):
        seen = {}
        def fake_run(args, **kwargs):
            seen["env"] = kwargs.get("env")
            return subprocess.CompletedProcess(args, 0, "[[]]", "")
        real = attempt.subprocess.run, dict(attempt.os.environ)
        attempt.subprocess.run = fake_run
        for key in ("GH_TOKEN", "GITHUB_TOKEN"): attempt.os.environ.pop(key, None)
        try:
            self.assertEqual(attempt._gh({"tokenEnv": "GH_TOKEN"}, "GET", "repos/x/y/statuses"), [[]])
            self.assertIsNone(seen["env"], "the lanes' gh shim supplies the token")
        finally:
            attempt.subprocess.run = real[0]; attempt.os.environ.clear(); attempt.os.environ.update(real[1])
    def test_crash_restart_and_redelivery_stay_terminal(self):
        first = self.claim()
        self.assertEqual(self.claim(now=101)["reason"], "duplicate_active")
        self.assertEqual(self.claim(now=111)["terminalState"], "failed_unknown")
        self.assertTrue(all(self.claim(now=112 + index, trigger=f"delivery-{index}")["reason"] == "generation_terminal" for index in range(100)))
        self.assertEqual(first["attempt"], 1)
    def test_retry_quarantine_and_diagnosis(self):
        detail = {"failureClass": "provider_outage", "failureFingerprint": "provider:503", "evidenceDigest": "e", "costs": {}, "dependencies": ["provider"]}
        first = self.claim(); self.assertEqual(self.finish(self.ident, first, "failed_known", detail, 101)["retryDecision"], "retry")
        terminal = self.finish(self.ident, self.claim(now=102), "failed_known", detail, 103)
        self.assertEqual((terminal["retryDecision"], terminal["terminalState"]), ("quarantine", "quarantined"))
        self.assertEqual(len(terminal["diagnosis"]["attempts"]), 2)
    def test_unreadable_target_keeps_attempt_spend_fence_and_repeated_failure_bounds(self):
        detail = {"failureClass": "target_state_unavailable", "failureFingerprint": "target-read",
                  "confidence": "unknown", "dependencies": ["codex", "github-target-state"]}
        first = self.claim()
        attempt.boundary(self.path, self.ident, first["fencingToken"], {"spend": 1, "mutations": 1}, 100.5, coordination=LOCAL)
        ended = self.finish(self.ident, first, "failed_known", detail, 101)
        self.assertEqual((ended["retryDecision"], ended["terminalState"]), ("retry", None))
        with self.assertRaisesRegex(RuntimeError, "stale-fencing-token"):
            attempt.boundary(self.path, self.ident, first["fencingToken"], {}, 101.5, coordination=LOCAL)
        second = self.claim(now=102)
        self.assertEqual(second["attempt"], 2)
        self.assertEqual(second["remainingBudgets"]["attempts"], 0)
        self.assertEqual(second["remainingBudgets"]["spend"], 1)
        self.assertNotEqual(first["fencingToken"], second["fencingToken"])
        with self.assertRaisesRegex(RuntimeError, "stale-fencing-token"):
            attempt.boundary(self.path, self.ident, first["fencingToken"], {}, 102.5, coordination=LOCAL)
        attempt.boundary(self.path, self.ident, second["fencingToken"], {"spend": 1, "mutations": 1}, 102.5, coordination=LOCAL)
        terminal = self.finish(self.ident, second, "failed_known", detail, 103)
        self.assertEqual((terminal["retryDecision"], terminal["terminalState"]), ("quarantine", "quarantined"))
        self.assertEqual(terminal["remainingBudgets"]["spend"], 0)
        self.assertEqual(terminal["remainingBudgets"]["mutations"], 0)
        self.assertEqual(self.claim(now=104)["reason"], "generation_terminal")

    def test_deterministic_unknown_and_new_revision_fail_closed(self):
        deterministic = {"failureClass": "deterministic_code", "failureFingerprint": "assert:x", "costs": {}, "dependencies": []}
        self.assertEqual(self.finish(self.ident, self.claim(), "failed_known", deterministic, 101)["terminalState"], "failed_known")
        revised = attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 7}, {"head": "b" * 40})
        closed = self.finish(revised, self.claim(now=102, ident=revised), "suceeded", {"costs": {}, "dependencies": []}, 103)
        self.assertEqual((closed["result"], closed["terminalState"], closed["failureClass"]), ("failed_unknown", "failed_unknown", "malformed_result"))
        self.assertEqual(self.claim(now=104, ident=revised)["reason"], "generation_terminal")
    def test_budgets_reservations_and_fencing_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "execution-policy-malformed"): self.claim(policy=policy(concurrency=0))
        claimed = self.claim(policy=policy(spend=1, mutations=1)); fence = claimed["fencingToken"]
        with self.assertRaisesRegex(ValueError, "execution-reservation-malformed"): attempt.boundary(self.path, self.ident, fence, {"spend": -1}, 101, coordination=LOCAL)
        self.assertTrue(attempt.boundary(self.path, self.ident, fence, {"spend": 1, "mutations": 1}, 101, coordination=LOCAL)["admitted"])
        with self.assertRaisesRegex(RuntimeError, "execution-budget-exhausted"): attempt.boundary(self.path, self.ident, fence, {"spend": .01}, 102, coordination=LOCAL)
        self.finish(self.ident, claimed, "succeeded", {"costs": {}, "dependencies": []}, 103)
        with self.assertRaisesRegex(RuntimeError, "stale-fencing-token"): attempt.boundary(self.path, self.ident, fence, {}, 104, coordination=LOCAL)
    def test_zero_cost_policy_admits_only_zero_boundaries_and_keeps_terminal_fence(self):
        claimed = self.claim(policy=policy(attempts=1, spend=0, mutations=0))
        self.assertTrue(claimed["admitted"])
        fence = claimed["fencingToken"]
        self.assertTrue(attempt.boundary(self.path, self.ident, fence, {}, 101, coordination=LOCAL)["admitted"])
        for cost in ({"spend": .01}, {"mutations": 1}):
            with self.subTest(cost=cost), self.assertRaisesRegex(RuntimeError, "execution-budget-exhausted"):
                attempt.boundary(self.path, self.ident, fence, cost, 102, coordination=LOCAL)
        self.assertEqual(self.claim(now=103)["reason"], "duplicate_active")
        self.finish(self.ident, claimed, "succeeded", {"costs": {}, "dependencies": []}, 104)
        self.assertEqual(self.claim(now=105)["reason"], "generation_terminal")
        self.assertEqual(len([r for r in attempt._rows(self.path) if r['event'] == 'attempt_started']), 1)
    def test_fully_spent_positive_caps_still_stop_the_next_attempt(self):
        claimed = self.claim(policy=policy(spend=1))
        attempt.boundary(self.path, self.ident, claimed["fencingToken"], {"spend": 1}, 101, coordination=LOCAL)
        self.finish(self.ident, claimed, "failed_known", {"failureClass": "provider_outage"}, 102)
        self.assertEqual(self.claim(now=103, policy=policy(spend=1))["reason"], "spend_budget_exhausted")
class GithubCoordinationBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.coord = {"kind": "github-status", "repository": "Fixture/Repo", "sha": "a" * 40}
        self.ident = attempt.identity("fixture", {"pr": 1}, {"head": "a" * 40})

    def row(self, **fields):
        return {**self.ident, "schema": attempt.SCHEMA, "event": "attempt_finished", "attempt": 1, **fields}

    def status(self, number, previous=None, **fields):
        row = self.row(_remote={"prevStatusId": previous}, **fields)
        return {"id": number, "context": f"jovie-execution/{self.ident['identityDigest']}",
                "target_url": f"https://fixture.invalid/#jovie-execution={attempt._pack(row)}"}

    def test_transport_rejects_http_failure_but_ref_conflict_is_a_lost_race(self):
        response = subprocess.CompletedProcess([], 1, "", "HTTP422 ref exists")
        with patch.object(attempt.subprocess, "run", return_value=response):
            self.assertIsNone(attempt._gh(self.coord, "POST", "fixture/refs", {"ref": "refs/fixture"}))
            with self.assertRaisesRegex(RuntimeError, "execution-coordinator-http-1"):
                attempt._gh(self.coord, "GET", "fixture/statuses")

    def test_transport_passes_only_declared_fixture_auth_and_json(self):
        response = subprocess.CompletedProcess([], 0, "{}", "")
        with patch.dict(attempt.os.environ, {"GH_TOKEN": "fixture-only-token"}, clear=True), \
             patch.object(attempt.subprocess, "run", return_value=response) as run:
            self.assertEqual(attempt._gh(self.coord, "POST", "fixture/statuses", {"state": "pending"}), {})
            args, kwargs = run.call_args
            self.assertEqual(args[0], ["gh", "api", "-X", "POST", "fixture/statuses", "--input", "-"])
            self.assertEqual(json.loads(kwargs["input"]), {"state": "pending"})
            self.assertEqual(kwargs["env"], {"GH_TOKEN": "fixture-only-token"})
            self.assertEqual(kwargs["timeout"], 30)

    def test_history_validates_identity_and_bounded_page_shape(self):
        for coord in [{**self.coord, "repository": "missing-owner-separator"}, {**self.coord, "sha": "not-a-sha"}]:
            with self.subTest(coord=coord), patch.object(attempt, "_gh") as transport:
                with self.assertRaisesRegex(ValueError, "execution-coordinator-malformed"):
                    attempt._github_rows(coord, self.ident)
                transport.assert_not_called()
        for pages in [None, [[]] * 101, ["not-a-page"]]:
            with self.subTest(pages=pages), patch.object(attempt, "_gh", return_value=pages):
                with self.assertRaisesRegex(RuntimeError, "execution-coordinator-history-unbounded"):
                    attempt._github_rows(self.coord, self.ident)

    def test_history_rejects_missing_or_foreign_receipts(self):
        bad = self.status(1)
        bad["target_url"] = "https://fixture.invalid/no-receipt"
        for status, error in [(bad, "receipt-malformed"),
                              (self.status(1, schema="wrong"), "receipt-mismatch"),
                              (self.status(1, identityDigest="other"), "receipt-mismatch")]:
            with self.subTest(error=error), patch.object(attempt, "_gh", return_value=[[status]]):
                with self.assertRaisesRegex(RuntimeError, error):
                    attempt._github_rows(self.coord, self.ident)

    def test_history_selects_one_canonical_branch_and_ignores_other_contexts(self):
        pages = [[self.status(12), {"context": "other", "id": 999}, self.status(9)],
                 [self.status(18, previous=9), self.status(20, previous=12)]]
        with patch.object(attempt, "_gh", return_value=pages):
            rows, head = attempt._github_rows(self.coord, self.ident)
        self.assertEqual([r["_remote"]["statusId"] for r in rows], [9, 18])
        self.assertEqual(head, 18)

    def test_append_ref_collision_does_not_publish_a_status(self):
        with patch.object(attempt, "_gh", return_value=None) as transport:
            self.assertIsNone(attempt._github_append(self.coord, self.ident, self.row(event="attempt_started"), None))
            self.assertEqual(transport.call_count, 1)
            self.assertIn("/git/refs", transport.call_args.args[2])

    def test_append_maps_terminal_states_and_preserves_predecessor(self):
        for terminal, expected in [(None, "pending"), ("succeeded", "success"),
                                   ("no_op_stale", "success"), ("superseded", "success"),
                                   ("failed_known", "failure")]:
            with self.subTest(terminal=terminal), patch.object(attempt, "_gh", return_value={} ) as transport:
                event = attempt._github_append(self.coord, self.ident, self.row(terminalState=terminal), 7)
                self.assertEqual(transport.call_count, 2)
                body = transport.call_args.args[3]
                self.assertEqual(body["state"], expected)
                packed = body["target_url"].split("#jovie-execution=", 1)[1]
                row = attempt._unpack(packed)
                self.assertEqual(row["_remote"], {"prevStatusId": 7, "eventId": event})
                self.assertEqual(row["identityDigest"], self.ident["identityDigest"])

    def test_append_rejects_oversize_before_status_publication(self):
        with patch.object(attempt, "_gh") as transport:
            with self.assertRaisesRegex(RuntimeError, "receipt-too-large"):
                attempt._github_append({**self.coord, "targetUrl": "https://fixture.invalid/" + "x" * 2000},
                                       self.ident, self.row(), None)
            transport.assert_not_called()

    def test_remote_contention_is_bounded_and_creates_no_local_receipt(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(attempt, "_github_rows", return_value=([], None)), \
             patch.object(attempt, "_github_append", return_value=None) as append:
            path = Path(directory) / "ledger.jsonl"
            with self.assertRaisesRegex(RuntimeError, "execution-coordinator-contention"):
                attempt._locked(path, self.ident, self.coord, lambda _: ({"admitted": True}, [self.row()]))
            self.assertEqual(append.call_count, 4)
            self.assertFalse(path.exists())

class CompletedFailureReconciliationTest(unittest.TestCase):
    """Exercise the production GitHub adapter with ended journals, not caller proof flags."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name); (self.state / "runs").mkdir()
        self.path = self.state / "execution.jsonl"
        self.sha, self.branch, self.pr, self.now = "a" * 40, "codex/jov-6225-focus", 7, 20000
        self.coord = {"kind": "github-status", "repository": "JovieInc/Jovie", "sha": self.sha}
        self.creator = {"login": "jovie-bot[bot]", "type": "Bot", "id": 12}
        self.identities, self.statuses, self.journal = [], [], []
        for number in range(2):
            ident = attempt.identity("pr-remediation", {"repository": "JovieInc/Jovie", "pr": self.pr, "failure": number}, {"headSha": self.sha})
            self.identities.append(ident)
            local = self.state / f"worker-{number}.jsonl"
            who = {"owner": attempt.socket.gethostname().split(".")[0], "runtime": "symphony-lanes", "provider": "devin", "model": "swe-2-medium", "tool": "fix_red_pr", "accountPool": "devin"}
            start = attempt.claim(local, ident, who, policy(wallSeconds=10800, leaseSeconds=6300, mutations=4),
                                  {"triggerId": f"run-{number}", "correlationId": "pr-7", "causationId": self.sha}, 100 + number * 20, LOCAL)
            attempt.boundary(local, ident, start["fencingToken"], {"spend": 1, "mutations": 1}, 101 + number * 20, LOCAL)
            ended = attempt.finish(local, ident, start["fencingToken"], "failed_known",
                                   {"failureClass": "repair_incomplete", "failureFingerprint": f"failure-{number}", "evidenceDigest": f"proof-{number}", "mutationsPerformed": [], "dependencies": ["devin"]}, 110 + number * 20, LOCAL)
            previous = None
            for row in attempt._rows(local):
                status = self.add_status(ident, row, previous); previous = status["id"]
            self.journal.append({"schema": "jovie-lane-run/v1", "runId": f"run-{number}", "provider": "devin", "kind": "fix-red", "pr": self.pr,
                                 "branch": self.branch, "headBefore": self.sha, "headAfter": self.sha, "requestSource": {"head": self.sha},
                                 "endedAt": datetime.fromtimestamp(ended["at"], timezone.utc).isoformat(), "verdict": "fix-no-change", "execution": ended})
        self.bank = {"7": {"sha": self.sha, "count": 2, "endedAt": 130, "pushed": False, "repairRunId": "run-1", "repairBranch": self.branch, "repairHeadBefore": self.sha, "repairVerdict": "fix-no-change"}}
        self.current = {"number": 7, "state": "open", "merged": False, "head": {"sha": self.sha, "ref": self.branch}, "labels": []}
        self.statuses.append({"id": 80, "context": "Fork PR Gate", "state": "success", "creator": self.creator})
        self.checks = [{"id": 100 + i, "name": name, "head_sha": self.sha, "status": "completed", "conclusion": "success", "app": {"slug": "github-actions"}} for i, name in enumerate(sorted(attempt.RECONCILE_CHECKS))]
        self.comments, self.posts, self.refs = [], [], {}
        self.flush()
        self.transport = patch.object(attempt, "_gh", side_effect=self.gh); self.transport.start(); self.addCleanup(self.transport.stop)
    def flush(self):
        (self.state / "fix-attempts.json").write_text(json.dumps(self.bank))
        (self.state / "runs/ledger.jsonl").write_text("".join(json.dumps(row) + "\n" for row in self.journal))
    def add_status(self, ident, row, previous=None):
        number = max((item["id"] for item in self.statuses), default=0) + 1
        packed = {**row, "_remote": {"prevStatusId": previous, "eventId": f"fixture-{number}"}}
        status = {"id": number, "context": f"jovie-execution/{ident['identityDigest']}", "state": "pending", "creator": dict(self.creator), "target_url": f"https://github.com/JovieInc/Jovie/commit/{self.sha}#jovie-execution={attempt._pack(packed)}"}
        self.statuses.append(status); return status
    def rewrite(self, index, change):
        status = self.statuses[index]
        row = attempt._unpack(status["target_url"].split("#jovie-execution=", 1)[1]); change(row)
        status["target_url"] = status["target_url"].split("#", 1)[0] + "#jovie-execution=" + attempt._pack(row)
    def gh(self, coord, method, endpoint, body=None):
        if method == "POST":
            if endpoint.endswith("/git/refs"):
                if body["ref"] in self.refs: return None
                self.refs[body["ref"]] = {"ref": body["ref"], "object": {"sha": body["sha"]}}; return self.refs[body["ref"]]
            self.assertIn("/statuses/", endpoint)
            self.posts.append(body)
            self.statuses.append({**body, "id": max(item["id"] for item in self.statuses) + 1, "creator": dict(self.creator)})
            return {}
        if "/pulls/" in endpoint: return [copy.deepcopy(self.current)]
        if "/statuses?" in endpoint: return [copy.deepcopy(self.statuses)]
        if "/check-runs?" in endpoint: return [{"total_count": len(self.checks), "check_runs": copy.deepcopy(self.checks)}]
        if "/comments?" in endpoint: return [copy.deepcopy(self.comments)]
        if "/git/ref/" in endpoint: return [copy.deepcopy(self.refs.get("refs/" + endpoint.split("/git/ref/", 1)[1], {}))]
        self.fail(f"unexpected endpoint: {endpoint}")
    def reconcile(self, number=0):
        return attempt.reconcile_completed_failure(self.path, self.identities[number], self.pr, coordination=self.coord, state=self.state, now=self.now)
    def blocked(self, error):
        before = (self.state / "fix-attempts.json").read_bytes(), (self.state / "runs/ledger.jsonl").read_bytes()
        with self.assertRaisesRegex((RuntimeError, ValueError, KeyError), error): self.reconcile()
        self.assertEqual(self.posts, [])
        self.assertEqual(before, ((self.state / "fix-attempts.json").read_bytes(), (self.state / "runs/ledger.jsonl").read_bytes()))
    def test_both_completed_identities_append_once_without_forging_worker_success_or_reset(self):
        original = copy.deepcopy(self.statuses)
        before = (self.state / "fix-attempts.json").read_bytes(), (self.state / "runs/ledger.jsonl").read_bytes()
        self.path.write_text(json.dumps({**self.identities[0], "schema": attempt.SCHEMA, "event": "audit"}) + "\n")
        prefix = self.path.read_bytes()
        for number in range(2):
            result = self.reconcile(number)
            self.assertEqual((result["result"], result["terminalState"], result["retryDecision"]), ("failed_known", "no_op_stale", "stop"))
            self.assertEqual(result["remainingBudgets"], self.journal[number]["execution"]["remainingBudgets"])
            self.assertEqual(result["failureFingerprint"], f"failure-{number}")
            self.assertEqual(len(result["proof"]["excludedContexts"]), 2)
            self.assertTrue(self.reconcile(number)["alreadyReconciled"])
        self.assertEqual(len(self.posts), 4)
        self.assertEqual(len(self.refs), 6)
        self.assertEqual(sum(ref.endswith("/attempt-2") for ref in self.refs), 2)
        self.assertEqual([body["state"] for body in self.posts], ["pending", "success", "pending", "success"])
        self.assertFalse(any(attempt._unpack(body["target_url"].split("#jovie-execution=", 1)[1])["event"] == "attempt_started" for body in self.posts))
        self.assertEqual(self.statuses[:len(original)], original)
        self.assertTrue(self.path.read_bytes().startswith(prefix))
        self.assertEqual(before, ((self.state / "fix-attempts.json").read_bytes(), (self.state / "runs/ledger.jsonl").read_bytes()))
        self.assertEqual(attempt.claim(self.path, self.identities[0], owner(), policy(), {}, now=self.now, coordination=self.coord)["reason"], "generation_terminal")
    def test_latest_bank_run_cannot_certify_the_other_identity(self):
        self.journal.pop(0); self.flush(); self.blocked("own-ended-receipt-missing")
    def test_duplicate_ended_receipts_are_ambiguous(self):
        self.journal.append(copy.deepcopy(self.journal[0])); self.flush(); self.blocked("own-ended-receipt-missing-or-ambiguous")
    def test_server_creator_is_required_and_embedded_creator_cannot_spoof_it(self):
        self.rewrite(0, lambda row: row.update(creator=self.creator))
        self.statuses[0]["creator"] = {"login": "someone", "type": "User"}
        self.blocked("untrusted-status-creator")
    def test_missing_server_creator_fails_closed(self):
        self.statuses[1].pop("creator"); self.blocked("untrusted-status-creator")
    def test_complete_original_owner_is_required_for_every_excluded_context(self):
        self.rewrite(3, lambda row: row["owner"].pop("model")); self.blocked("owner-or-trigger-mismatch")
    def test_foreign_host_owner_is_not_adopted(self):
        self.rewrite(0, lambda row: row["owner"].update(owner="another-host")); self.blocked("owner-or-trigger-mismatch")
    def test_wrong_pr_trigger_is_rejected(self):
        self.rewrite(0, lambda row: row["trigger"].update(correlationId="pr-8")); self.blocked("owner-or-trigger-mismatch")
    def test_journal_provider_branch_generation_fence_or_outcome_mismatch_blocks(self):
        baseline = copy.deepcopy(self.journal)
        changes = [lambda r: r.update(provider="other"), lambda r: r.update(branch="another-branch"), lambda r: r.update(headBefore="b" * 40),
                   lambda r: r["execution"].update(fencingToken="other"), lambda r: r.update(headAfter="b" * 40), lambda r: r.update(verdict="fix-pushed")]
        for change in changes:
            with self.subTest(change=change):
                self.journal = copy.deepcopy(baseline); change(self.journal[0]); self.flush(); self.blocked("own-ended-receipt-mismatch")
    def test_ended_timestamp_matches_own_finish_with_producer_second_precision(self):
        self.journal[0]["endedAt"] = datetime.fromtimestamp(109.2, timezone.utc).isoformat(); self.flush()
        self.assertTrue(self.reconcile()["reconciled"])
    def test_wrong_or_future_ended_time_is_not_proof(self):
        self.journal[0]["endedAt"] = datetime.fromtimestamp(self.now + 1, timezone.utc).isoformat(); self.flush(); self.blocked("ended-time-mismatch")
    def test_live_attempt_blocks_even_if_its_old_lease_expired(self):
        self.statuses.pop(5); self.blocked("live-or-unfinished-attempt")
    def test_forked_or_orphan_history_is_not_canonical_exclusion(self):
        row = attempt._unpack(self.statuses[0]["target_url"].split("#jovie-execution=", 1)[1])
        self.add_status(self.identities[0], row); self.blocked("ambiguous-history")
    def test_orphan_receipt_is_rejected(self):
        self.rewrite(2, lambda row: row["_remote"].update(prevStatusId=999)); self.blocked("orphan-history")
    def test_unknown_or_terminal_failure_does_not_turn_green(self):
        self.rewrite(2, lambda row: row.update(result="failed_unknown")); self.blocked("not-ended-retryable-failure")
    def test_actual_mutation_cannot_be_declared_stale(self):
        self.rewrite(2, lambda row: row.update(mutationsPerformed=["push"])); self.blocked("not-ended-retryable-failure")
    def test_new_head_or_closed_pr_cannot_consume_old_recovery(self):
        self.current["head"]["sha"] = "b" * 40; self.blocked("pr-changed-or-held")
    def test_changed_bank_count_owner_or_head_cannot_reset_attempt_budget(self):
        baseline = copy.deepcopy(self.bank)
        for field, value in [("count", 1), ("pushed", True), ("sha", "b" * 40), ("repairBranch", "other"), ("endedAt", None), ("repairHeadBefore", "b" * 40)]:
            with self.subTest(field=field):
                self.bank = copy.deepcopy(baseline); self.bank["7"][field] = value; self.flush(); self.blocked("bank-binding-mismatch")
    def test_bank_latest_run_must_also_have_its_own_ended_proof(self):
        self.bank["7"]["repairRunId"] = "other-run"; self.flush(); self.blocked("bank-ended-run-mismatch")
    def test_current_source_failure_or_pending_check_is_truthfully_blocked(self):
        for conclusion, status in [("failure", "completed"), (None, "in_progress")]:
            with self.subTest(conclusion=conclusion):
                self.checks[0].update(conclusion=conclusion, status=status); self.blocked("current-check-unresolved")
    def test_latest_check_failure_supersedes_older_green(self):
        self.checks.append({**self.checks[0], "id": 999, "conclusion": "failure"}); self.blocked("current-check-unresolved")
    def test_same_display_name_cannot_hide_independent_app_or_suite_failure(self):
        for status, conclusion in [("in_progress", None), ("completed", "failure")]:
            with self.subTest(status=status):
                baseline = self.checks[:len(attempt.RECONCILE_CHECKS)]
                self.checks = baseline + [
                    {"id": 800, "name": "Independent Review", "head_sha": self.sha, "status": status, "conclusion": conclusion, "app": {"id": 1, "slug": "review-a"}, "check_suite": {"id": 10}},
                    {"id": 900, "name": "Independent Review", "head_sha": self.sha, "status": "completed", "conclusion": "success", "app": {"id": 2, "slug": "review-b"}, "check_suite": {"id": 11}}]
                self.blocked("current-check-unresolved")
    def test_missing_required_check_and_untrusted_app_block(self):
        removed = self.checks.pop(); self.blocked("required-check-missing")
        self.checks.append(removed); self.checks[0]["app"] = {"slug": "another-app"}; self.blocked("required-check-unverified")
    def test_independent_runtime_pending_status_is_never_excluded(self):
        self.statuses.append({"id": 900, "context": "Visual Review", "state": "pending"}); self.blocked("current-status-unresolved")
    def test_active_remote_claim_and_hold_are_preserved(self):
        self.comments.append({"body": f"🤖 lane claim kind=fix sha={self.sha} host=mac at={datetime.fromtimestamp(self.now - 1, timezone.utc).isoformat()}"})
        self.blocked("current-claim-active")
        self.comments.clear(); (self.state / "held.json").write_text('{"7":{"reason":"human"}}'); self.blocked("held-disposition")
    def test_unreadable_api_and_incomplete_checks_publish_nothing(self):
        with patch.object(attempt, "_gh", side_effect=RuntimeError("protected-reserve-denied")): self.blocked("protected-reserve-denied")
        real = self.gh
        def truncated(coord, method, endpoint, body=None):
            result = real(coord, method, endpoint, body)
            if "/check-runs?" in endpoint: result[0]["total_count"] += 1
            return result
        with patch.object(attempt, "_gh", side_effect=truncated): self.blocked("checks-incomplete")
    def test_normal_bank_mutex_cannot_be_bypassed(self):
        with open(self.state / "fix-attempts.json.lock", "a+") as lock:
            attempt.fcntl.flock(lock, attempt.fcntl.LOCK_EX | attempt.fcntl.LOCK_NB)
            self.blocked("bank-lock-busy")
    def test_stale_cas_snapshot_is_rejected_without_append(self):
        with patch.object(attempt, "_github_rows", return_value=([], None)): self.blocked("canonical-history-changed")
    def test_no_local_only_or_caller_asserted_proof_can_authorize_reconciliation(self):
        self.coord["kind"] = "local-test"; self.blocked("live-coordination-required")
    def test_revoked_branch_is_not_reauthorized_by_green_source(self):
        (self.state / "runs/publication-revocations.jsonl").write_text(json.dumps({"schema": "jovie-publication-revocation/v1", "branch": self.branch}) + "\n")
        self.blocked("publication-revoked")
    def test_foreign_generation_invalid_identity_and_future_event_block(self):
        ident = self.identities[0]
        self.identities[0] = {**ident, "identityDigest": "other"}; self.blocked("identity-invalid")
        self.identities[0] = ident
        self.rewrite(0, lambda row: row.update(at=self.now + 1)); self.blocked("event-time-invalid")
    def test_boundary_after_finish_and_wrong_attempt_are_not_ended_evidence(self):
        self.rewrite(1, lambda row: row.update(fencingToken="missing")); self.blocked("unbound-boundary")
    def test_independent_execution_context_is_not_a_stale_remediation(self):
        ident = attempt.identity("runtime-acceptance", {"pr": 7}, {"headSha": self.sha})
        self.add_status(ident, {**ident, "schema": attempt.SCHEMA, "event": "attempt_started", "at": 100})
        self.blocked("independent-execution-unresolved")
    def test_altered_prior_disposition_does_not_gain_idempotent_success(self):
        self.reconcile(); self.posts.clear()
        self.rewrite(len(self.statuses) - 1, lambda row: row.update(endedReceiptDigest="wrong"))
        self.blocked("prior-disposition-mismatch")
    def test_missing_required_fork_receipt_and_wrong_check_head_block(self):
        fork = self.statuses.pop(); self.blocked("fork-gate-unverified")
        self.statuses.append(fork); self.checks[0]["head_sha"] = "b" * 40; self.blocked("check-head-mismatch")
    def test_cli_uses_maintained_journal_and_clock_instead_of_json_authority(self):
        request = {"command": "reconcile", "path": str(self.path), "ident": self.identities[0], "pr": self.pr, "coordination": self.coord,
                   "state": "/caller-replacement-state", "now": 1}
        output = io.StringIO()
        def transport(args, **kwargs):
            body = json.loads(kwargs["input"]) if kwargs.get("input") else None
            return subprocess.CompletedProcess(args, 0, json.dumps(self.gh(self.coord, args[3], args[4], body)), "")
        with patch.dict(attempt.os.environ, {"LANES_STATE": str(self.state)}), patch.object(attempt.time, "time", return_value=self.now), \
             patch.object(attempt.lifecycle, "run", side_effect=transport), patch.object(sys, "stdin", io.StringIO(json.dumps(request))), patch.object(sys, "stdout", output):
            runpy.run_path(str(MODULE), run_name="__main__")
        result = json.loads(output.getvalue())
        self.assertEqual(result["at"], self.now)
        self.assertEqual(result["result"], "failed_known")
        self.assertEqual(len(self.posts), 2)
    def test_cli_reports_blocked_operation_with_nonzero_exit(self):
        request = {"command": "reconcile", "path": str(self.path), "ident": self.identities[0], "pr": self.pr, "coordination": LOCAL}
        output = io.StringIO()
        with patch.dict(attempt.os.environ, {"LANES_STATE": str(self.state)}), patch.object(sys, "stdin", io.StringIO(json.dumps(request))), patch.object(sys, "stdout", output), self.assertRaises(SystemExit) as exited:
            runpy.run_path(str(MODULE), run_name="__main__")
        self.assertEqual(exited.exception.code, 2)
        self.assertIn("live-coordination-required", json.loads(output.getvalue())["error"])
    def test_remote_worker_winning_next_slot_prevents_any_success_append(self):
        ref = attempt._completion_ref(self.identities[0], 2)
        self.refs[ref] = {"ref": ref, "object": {"sha": self.sha}}
        self.blocked("next-slot-already-reserved")
    def test_remote_claim_racing_final_append_cannot_acquire_sealed_slot(self):
        real, races = self.gh, []
        def raced(coord, method, endpoint, body=None):
            if method == "POST" and body.get("state") == "success":
                # The real claim protocol must acquire attempt-2 before publishing
                # attempt_started. Even an old remote worker uses this same ref.
                row = {**self.identities[0], "schema": attempt.SCHEMA, "event": "attempt_started", "attempt": 2}
                races.append(attempt._github_append(self.coord, self.identities[0], row, 999))
            return real(coord, method, endpoint, body)
        with patch.object(attempt, "_gh", side_effect=raced): self.assertTrue(self.reconcile()["reconciled"])
        self.assertEqual(races, [None])
        self.assertEqual([body["state"] for body in self.posts], ["pending", "success"])
    def test_proof_is_refreshed_after_remote_fence_before_success(self):
        real = self.gh
        def changed(coord, method, endpoint, body=None):
            result = real(coord, method, endpoint, body)
            if method == "POST" and body.get("state") == "pending": self.checks[0]["conclusion"] = "failure"
            return result
        with patch.object(attempt, "_gh", side_effect=changed), self.assertRaisesRegex(RuntimeError, "current-check-unresolved"): self.reconcile()
        self.assertEqual([body["state"] for body in self.posts], ["pending"])
        self.checks[0]["conclusion"] = "success"
        self.assertTrue(self.reconcile()["reconciled"], "trusted pending seal can resume after current proof recovers")
        self.assertEqual([body["state"] for body in self.posts], ["pending", "success"])
    def test_lost_remote_seal_binding_remains_pending_and_blocks_success(self):
        real = self.gh
        def removed(coord, method, endpoint, body=None):
            result = real(coord, method, endpoint, body)
            if method == "POST" and body.get("state") == "pending": self.refs.clear()
            return result
        with patch.object(attempt, "_gh", side_effect=removed), self.assertRaisesRegex(RuntimeError, "remote-fence-unverified"): self.reconcile()
        self.assertEqual([body["state"] for body in self.posts], ["pending"])
    def test_real_budget_exhausted_claim_after_pending_seal_is_a_no_write_stop(self):
        real, races = self.gh, []
        def raced(coord, method, endpoint, body=None):
            if method == "POST" and body.get("state") == "success":
                races.append(attempt.claim(self.state / "remote.jsonl", self.identities[0], owner("remote"), policy(), {}, now=self.now, coordination=self.coord))
            return real(coord, method, endpoint, body)
        with patch.object(attempt, "_gh", side_effect=raced): self.assertTrue(self.reconcile()["reconciled"])
        self.assertEqual(races[0]["reason"], "generation_completion_fenced")
        self.assertEqual([body["state"] for body in self.posts], ["pending", "success"])
    def test_unseen_pending_seal_fences_real_budget_decision_append(self):
        real, races = self.gh, []
        def raced(coord, method, endpoint, body=None):
            if method == "POST" and body.get("state") == "pending":
                try: attempt.claim(self.state / "remote.jsonl", self.identities[0], owner("remote"), policy(), {}, now=self.now, coordination=self.coord)
                except RuntimeError as error: races.append(str(error))
            return real(coord, method, endpoint, body)
        with patch.object(attempt, "_gh", side_effect=raced): self.assertTrue(self.reconcile()["reconciled"])
        self.assertEqual(races, ["execution-coordinator-contention"])
        self.assertEqual([body["state"] for body in self.posts], ["pending", "success"])
    def test_real_budget_decision_winning_remote_append_remains_failure(self):
        real, triggered = self.gh, []
        def raced(coord, method, endpoint, body=None):
            if method == "POST" and str(body.get("ref", "")).endswith("/attempt-2") and not triggered:
                triggered.append(True)
                result = attempt.claim(self.state / "remote.jsonl", self.identities[0], owner("remote"), policy(), {}, now=self.now, coordination=self.coord)
                self.assertEqual(result["reason"], "wallSeconds_budget_exhausted")
            return real(coord, method, endpoint, body)
        with patch.object(attempt, "_gh", side_effect=raced), self.assertRaisesRegex(RuntimeError, "unsupported-history"): self.reconcile()
        self.assertEqual([body["state"] for body in self.posts], ["failure"])


class ExecutionAttemptCliLifecycleTest(unittest.TestCase):
    def setUp(self):
        import os
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name) / "state"; self.state.mkdir()
        self.path = Path(self.tmp.name) / "execution.jsonl"
        self.ident = attempt.identity("pr-remediation", {"pr": 7}, {"head": "a" * 40})
        self.env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                    "LANES_STATE": str(self.state),
                    "PYTHONPYCACHEPREFIX": str(Path(self.tmp.name) / "bytecode")}
        self.started = attempt.claim(self.path, self.ident, owner(), policy(), {"triggerId": "fixture"},
                                     now=100, coordination=LOCAL)

    def request(self, command):
        common = {"command": command, "path": str(self.path), "ident": self.ident,
                  "coordination": LOCAL, "now": 101}
        if command == "claim":
            return {**common, "ident": attempt.identity("pr-remediation", {"pr": 8}, {"head": "b" * 40}),
                    "owner": owner(), "policy": policy(), "trigger": {"triggerId": "second"}}
        if command == "boundary":
            return {**common, "fence": self.started["fencingToken"], "reservation": {"spend": 0, "mutations": 0}}
        if command == "finish":
            return {**common, "fence": self.started["fencingToken"], "result": "succeeded", "detail": {}}
        return {**common, "pr": 7,
                "coordination": {"kind": "github-status", "repository": "JovieInc/Jovie", "sha": "a" * 40},
                "state": "/caller-replacement-state"}

    def cli(self, request):
        output = io.StringIO(); exit_code = 0
        with patch.dict(attempt.os.environ, self.env, clear=True), \
             patch.object(attempt.lifecycle, "run", side_effect=AssertionError("offline transport tripwire")) as remote, \
             patch.object(sys, "stdin", io.StringIO(json.dumps(request))), patch.object(sys, "stdout", output):
            try:
                runpy.run_path(str(MODULE), run_name="__main__")
            except SystemExit as error:
                exit_code = error.code
        return exit_code, json.loads(output.getvalue()), remote.call_count

    def assert_mutations_held(self, reason):
        before = self.path.read_bytes()
        for command in ("claim", "boundary", "finish", "reconcile"):
            with self.subTest(command=command):
                code, result, remote_calls = self.cli(self.request(command))
                self.assertEqual(code, 2)
                self.assertIn(reason, result["error"])
                self.assertEqual(remote_calls, 0)
                self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse((self.state / "fix-attempts.json.lock").exists())

    def test_all_mutating_cli_routes_refuse_owned_or_malformed_drain(self):
        marker = self.state / "lifecycle-drain.json"
        for content in ("owned operator hold", "{malformed"):
            with self.subTest(content=content):
                marker.write_text(content)
                self.assert_mutations_held("natural controller drain")
                self.assertEqual(marker.read_text(), content)
        self.assertFalse((self.state / "lifecycle.lock").exists())

    def test_all_mutating_cli_routes_refuse_real_exclusive_lock_without_drain(self):
        import fcntl, os
        fd = os.open(self.state / "lifecycle.lock", os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assert_mutations_held("temporarily unavailable")
        finally:
            os.close(fd)

    def test_pure_identity_remains_available_under_drain_and_exclusion_without_state_write(self):
        import fcntl, os
        marker = self.state / "lifecycle-drain.json"; marker.write_text("hold")
        fd = os.open(self.state / "lifecycle.lock", os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        request = {"command": "identity", "domain": "pr-remediation", "work": {"pr": 7}, "generation": {"head": "a" * 40}}
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            before = {path.name: path.read_bytes() for path in self.state.iterdir()}
            code, result, remote_calls = self.cli(request)
            self.assertEqual((code, result, remote_calls), (0, self.ident, 0))
            self.assertEqual({path.name: path.read_bytes() for path in self.state.iterdir()}, before)
        finally:
            os.close(fd)
        self.env["LANES_STATE"] = str(Path(self.tmp.name) / "absent-state")
        self.assertEqual(self.cli(request), (0, self.ident, 0))
        self.assertFalse(Path(self.env["LANES_STATE"]).exists())

    def test_unblocked_local_mutations_keep_fences_history_and_spent_count(self):
        claim_request = self.request("claim")
        code, claimed, calls = self.cli(claim_request)
        self.assertEqual((code, calls), (0, 0)); self.assertTrue(claimed["admitted"])
        fence, ident = claimed["fencingToken"], claim_request["ident"]
        code, boundary, calls = self.cli({"command": "boundary", "path": str(self.path), "ident": ident,
            "fence": fence, "reservation": {"spend": 1, "mutations": 1}, "now": 102, "coordination": LOCAL})
        self.assertEqual((code, calls), (0, 0)); self.assertTrue(boundary["admitted"])
        finish_request = {"command": "finish", "path": str(self.path), "ident": ident, "fence": fence,
            "result": "failed_known", "detail": {"failureClass": "repair_incomplete", "failureFingerprint": "fixture"},
            "now": 103, "coordination": LOCAL}
        code, ended, calls = self.cli(finish_request)
        self.assertEqual((code, calls), (0, 0))
        self.assertEqual((ended["result"], ended["retryDecision"], ended["remainingBudgets"]["attempts"]),
                         ("failed_known", "retry", 1))
        rows = [json.loads(line) for line in self.path.read_text().splitlines()]
        self.assertEqual([row["event"] for row in rows],
                         ["attempt_started", "attempt_started", "boundary_admitted", "attempt_finished"])
        self.assertTrue(all(row["fencingToken"] == fence for row in rows[1:]))
        before = self.path.read_bytes()
        self.assertEqual(self.cli(finish_request)[0], 2)
        self.assertEqual(self.path.read_bytes(), before)

    def test_valid_but_unlocked_inherited_descriptor_cannot_bypass_operator_exclusion(self):
        import fcntl, os
        path = self.state / "lifecycle.lock"
        exclusive = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        unrelated = os.open(path, os.O_RDWR)
        try:
            fcntl.flock(exclusive, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.env[attempt.lifecycle.FD_ENV] = str(unrelated)
            self.assert_mutations_held("temporarily unavailable")
        finally:
            os.close(unrelated); os.close(exclusive)

    def test_real_inherited_shared_ownership_survives_child_cli_exit(self):
        import fcntl, os
        with attempt.lifecycle.Guard(self.state) as parent:
            request = self.request("claim")
            child = subprocess.run([sys.executable, str(MODULE)], input=json.dumps(request),
                capture_output=True, text=True, timeout=10,
                **attempt.lifecycle.spawn_kwargs(env=self.env))
            self.assertEqual(child.returncode, 0); self.assertTrue(json.loads(child.stdout)["admitted"])
            parent.validate()
            fd = os.open(self.state / "lifecycle.lock", os.O_RDWR)
            try:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(fd)
        fd = os.open(self.state / "lifecycle.lock", os.O_RDWR)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            os.close(fd)

if __name__ == "__main__": unittest.main()
