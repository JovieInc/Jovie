"""A fix-red run is only admitted when its identity can still pay for the repair dispatch (JOV-11407).

2026-11-07: PR23540, PR23593 and PR23620 were admitted, did worktree setup and a dependency install,
then the repair-dispatch boundary raised execution-budget-exhausted and the run ended failed/harness-error.
"""
from __future__ import annotations

import inspect
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_lane_runner as harness  # noqa: E402  (loads lane_runner with the shared fixture env)

lane = harness.lane
attempt = lane.execution_attempt
setUpModule = harness.setUpModule
tearDownModule = harness.tearDownModule

LOCAL = {"kind": "local-test"}
DISPATCH = {"spend": 1, "mutations": 1}
POLICY = {"attempts": 3, "concurrency": 1, "wallSeconds": 600, "spend": 3, "mutations": 6, "leaseSeconds": 100, "version": "t"}
OWNER = {"owner": "h", "runtime": "t", "provider": "p", "model": "m", "tool": "fix_red_pr", "accountPool": "p"}


class DispatchBudgetTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        self.path = Path(tmp.name) / "ledger.jsonl"
        self.ident = attempt.identity("pr-remediation", {"repo": "JovieInc/Jovie", "pr": 23540}, {"head": "a" * 40})

    def claim(self, now, **kwargs):
        return attempt.claim(self.path, self.ident, OWNER, POLICY, {"triggerId": f"t{now}", "correlationId": "c", "causationId": "x"},
                             now, coordination=LOCAL, **kwargs)

    def spend_mutations(self, now, count):
        first = self.claim(now)
        self.assertTrue(first["admitted"])
        for index in range(count):
            attempt.boundary(self.path, self.ident, first["fencingToken"], {"spend": 0, "mutations": 1}, now + 1, LOCAL, boundary_id=f"m{index}")
        attempt.finish(self.path, self.ident, first["fencingToken"], "failed_known", {"failureClass": "repair_incomplete"}, now + 2, coordination=LOCAL)

    def test_a_spent_mutation_budget_is_refused_at_claim_with_a_reason(self):
        self.spend_mutations(100, 6)
        refused = self.claim(200, min_reservation=DISPATCH)
        self.assertFalse(refused["admitted"])
        self.assertEqual(refused["reason"], "mutations_budget_exhausted")
        self.assertEqual(refused["terminalState"], "budget_exhausted")

    def test_one_mutation_short_is_refused_but_exactly_enough_is_admitted(self):
        self.spend_mutations(100, 5)
        self.assertTrue(self.claim(200, min_reservation=DISPATCH)["admitted"])

    def test_claim_without_a_reservation_keeps_its_behaviour(self):
        self.spend_mutations(100, 6)
        refused = self.claim(200)  # other callers keep the used >= cap rule
        self.assertEqual(refused["reason"], "mutations_budget_exhausted")

    def test_fix_red_claims_with_the_dispatch_reservation(self):
        source = inspect.getsource(lane._fix_red_pr)
        self.assertIn('min_reservation={"spend": 1, "mutations": 1}', source)
        self.assertIn('{"spend": 1, "mutations": 1}, coordination=coordination, boundary_id="repair-dispatch"', source)


if __name__ == "__main__":
    unittest.main()
