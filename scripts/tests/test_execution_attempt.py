"""Contract tests for the durable execution-attempt ledger (JOV-5926)."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import threading
import unittest
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
        children = [subprocess.Popen([sys.executable, str(MODULE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) for _ in range(2)]
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
                self.assertEqual(transport.call_count, 1)
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

if __name__ == "__main__": unittest.main()
