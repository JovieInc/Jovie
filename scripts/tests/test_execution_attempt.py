"""Contract tests for the durable execution-attempt ledger (JOV-5926)."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import threading
import unittest
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
if __name__ == "__main__": unittest.main()
