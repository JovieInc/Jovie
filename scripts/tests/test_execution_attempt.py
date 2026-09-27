"""Contract tests for the durable execution-attempt ledger (JOV-5926)."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "scripts/lanes/execution_attempt.py"
SPEC = importlib.util.spec_from_file_location("execution_attempt", MODULE)
attempt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(attempt)
def policy(**overrides):
    return {"attempts": 2, "concurrency": 1, "wallSeconds": 60, "spend": 2, "mutations": 2,
            "leaseSeconds": 10, "version": "test-v1", **overrides}
def owner(name="worker-a"):
    return {"owner": name, "runtime": "test", "provider": "fixture", "model": "none",
            "tool": "unit", "accountPool": "test"}


class ExecutionAttemptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "ledger.jsonl"
        self.ident = attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 7},
                                      {"head": "a" * 40, "failure": "typecheck:x"})

    def tearDown(self):
        self.tmp.cleanup()

    def claim(self, now=100, ident=None, **kwargs):
        return attempt.claim(self.path, ident or self.ident, kwargs.get("owner", owner()),
                             kwargs.get("policy", policy()), {"triggerId": kwargs.get("trigger", "delivery-1"),
                                                              "correlationId": "corr", "causationId": "cause"}, now)

    def test_identity_ignores_redelivery_and_process_provenance(self):
        same = attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 7},
                                {"head": "a" * 40, "failure": "typecheck:x"})
        self.assertEqual(self.ident, same)
        self.assertNotIn("delivery-1", json.dumps(self.ident))

    def test_two_processes_share_one_first_cost_boundary(self):
        request = {"command": "claim", "path": str(self.path), "ident": self.ident,
                   "owner": owner(), "policy": policy(), "trigger": {"triggerId": "same"}, "now": 100}
        children = [subprocess.Popen([sys.executable, str(MODULE)], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, text=True) for _ in range(2)]
        results = [json.loads(child.communicate(json.dumps(request))[0]) for child in children]
        self.assertEqual([row["admitted"] for row in results].count(True), 1)
        self.assertEqual([row.get("reason") for row in results].count("duplicate_active"), 1)

    def test_crash_restart_reconciles_same_attempt_and_redelivery_stays_terminal(self):
        first = self.claim(now=100)
        self.assertEqual(self.claim(now=101)["reason"], "duplicate_active")
        reconciled = self.claim(now=111)
        self.assertEqual((reconciled["reason"], reconciled["terminalState"]),
                         ("expired_attempt_reconciled", "failed_unknown"))
        for index in range(100):
            replay = self.claim(now=112 + index, trigger=f"delivery-{index}")
            self.assertEqual((replay["reason"], replay["terminalState"]),
                             ("generation_terminal", "failed_unknown"))
        rows = [json.loads(line) for line in self.path.read_text().splitlines()]
        self.assertEqual(sum(row["event"] == "attempt_started" for row in rows), 1)
        self.assertEqual(first["attempt"], 1)

    def test_provider_outage_retries_once_then_identical_failure_quarantines(self):
        first = self.claim()
        ended = attempt.finish(self.path, self.ident, first["fencingToken"], "failed_known",
                               {"failureClass": "provider_outage", "failureFingerprint": "provider:503",
                                "evidenceDigest": "e1", "costs": {"api": 1}, "dependencies": ["provider"]}, 101)
        self.assertEqual((ended["retryDecision"], ended["terminalState"]), ("retry", None))
        second = self.claim(now=102, trigger="different-run-id")
        terminal = attempt.finish(self.path, self.ident, second["fencingToken"], "failed_known",
                                  {"failureClass": "provider_outage", "failureFingerprint": "provider:503",
                                   "evidenceDigest": "e2", "costs": {"api": 1}, "dependencies": ["provider"]}, 103)
        self.assertEqual((terminal["retryDecision"], terminal["terminalState"]),
                         ("quarantine", "quarantined"))
        self.assertEqual(len(terminal["diagnosis"]["attempts"]), 2)
        self.assertEqual(terminal["diagnosis"]["nextAction"],
                         "collect new authoritative evidence or certify a bounded policy override")
        flaky_ident = attempt.identity("eval", {"object": "prod"}, {"deploy": "flaky"})
        flaky = self.claim(now=104, ident=flaky_ident)
        flaky_end = attempt.finish(self.path, flaky_ident, flaky["fencingToken"], "failed_known",
                                   {"failureClass": "flaky_infra", "failureFingerprint": "runner:lost",
                                    "evidenceDigest": "e3", "costs": {}, "dependencies": ["runner"]}, 105)
        self.assertEqual(flaky_end["retryDecision"], "retry")

    def test_deterministic_and_unknown_fail_closed_but_new_revision_is_independent(self):
        first = self.claim()
        terminal = attempt.finish(self.path, self.ident, first["fencingToken"], "failed_known",
                                  {"failureClass": "deterministic_code", "failureFingerprint": "assert:x",
                                   "evidenceDigest": "e", "costs": {}, "dependencies": []}, 101)
        self.assertEqual(terminal["terminalState"], "failed_known")
        revised = attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 7},
                                   {"head": "b" * 40, "failure": "typecheck:x"})
        self.assertTrue(self.claim(now=102, ident=revised)["admitted"])
        unknown = self.claim(now=102, ident=attempt.identity("eval", {"object": "prod"}, {"deploy": "c" * 40}))
        closed = attempt.finish(self.path, unknown, unknown["fencingToken"], "failed_unknown",
                                {"failureClass": "malformed_result", "failureFingerprint": "empty",
                                 "evidenceDigest": "e", "costs": {}, "dependencies": []}, 103)
        self.assertEqual(closed["terminalState"], "failed_unknown")
        stale_ident = attempt.identity("pr-remediation", {"pr": 8}, {"head": "stale"})
        stale = self.claim(now=104, ident=stale_ident)
        stale_end = attempt.finish(self.path, stale_ident, stale["fencingToken"], "no_op_stale",
                                   {"evidenceDigest": "newer-head", "costs": {}, "dependencies": []}, 105)
        self.assertEqual(stale_end["terminalState"], "no_op_stale")

    def test_spend_mutation_and_fencing_are_enforced_at_exact_boundaries(self):
        claimed = self.claim(policy=policy(spend=1, mutations=1))
        fence = claimed["fencingToken"]
        admitted = attempt.boundary(self.path, self.ident, fence, {"spend": 1, "mutations": 1}, 101)
        self.assertTrue(admitted["admitted"])
        with self.assertRaisesRegex(RuntimeError, "execution-budget-exhausted"):
            attempt.boundary(self.path, self.ident, fence, {"spend": 0.01, "mutations": 0}, 102)
        ended = attempt.finish(self.path, self.ident, fence, "succeeded",
                               {"evidenceDigest": "result", "costs": {"api": 1}, "dependencies": []}, 103)
        self.assertEqual(ended["terminalState"], "succeeded")
        with self.assertRaisesRegex(RuntimeError, "stale-fencing-token"):
            attempt.boundary(self.path, self.ident, fence, {"spend": 0, "mutations": 0}, 104)


if __name__ == "__main__":
    unittest.main()
