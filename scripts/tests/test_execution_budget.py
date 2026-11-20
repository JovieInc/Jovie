"""The wall-time budget counts time spent in attempts, not time since the first one started.

2026-11-07: PRs whose first attempt was before a 4-day stall were quarantined 30s into their next
run with wallSeconds_budget_exhausted, because elapsed calendar time counted as work.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import execution_attempt as attempt  # noqa: E402

DAY = 86_400.0


def start(token: str, at: float, lease: float = DAY) -> dict:
    return {"event": "attempt_started", "fencingToken": token, "at": at, "leaseExpiresAt": at + lease}


def finish(token: str, at: float) -> dict:
    return {"event": "attempt_finished", "fencingToken": token, "at": at}


class WallBudgetTest(unittest.TestCase):
    def test_idle_days_between_attempts_do_not_count(self):
        rows = [start("a", 0.0), finish("a", 40.0), start("b", 4 * DAY)]
        used = attempt._usage(rows, 4 * DAY + 20.0)
        self.assertEqual(used["wallSeconds"], 60.0)
        self.assertEqual(used["attempts"], 2)
        self.assertEqual(used["concurrency"], 1)

    def test_a_running_attempt_counts_until_now(self):
        self.assertEqual(attempt._usage([start("a", 100.0)], 400.0)["wallSeconds"], 300.0)

    def test_a_lost_attempt_counts_only_until_its_lease_expired(self):
        # 2026-11-07 PR23434: attempts lost in the Nov 2 stall were finished days later on reconcile.
        rows = [start("a", 0.0, lease=600.0), finish("a", 5 * DAY)]
        self.assertEqual(attempt._usage(rows, 5 * DAY)["wallSeconds"], 600.0)
        self.assertEqual(attempt._usage([start("b", 0.0, lease=600.0)], 5 * DAY)["wallSeconds"], 600.0)

    def test_no_attempts_spend_nothing(self):
        self.assertEqual(attempt._usage([], 1_000.0)["wallSeconds"], 0)


if __name__ == "__main__":
    unittest.main()
