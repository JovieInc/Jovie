"""Fair repair rotation (scripts/lanes/repair_order.py): event and polling claims share one order.

Run with:
    python3 -m unittest test_repair_order  (from scripts/tests)
"""
from __future__ import annotations

import json
import math
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_pr_events as harness  # noqa: E402  (pr_events + an aliased lane_runner, canned gh)

events, runner = harness.events, harness.runner
import repair_order  # noqa: E402  (pr_events put scripts/lanes on the path)
NOW = harness.NOW
DAY = 24 * 3600


def stamp(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def tried(sha="h1", count=0, claims=None, at=NOW - 2 * 3600):
    """An ended, no-push attempt on `sha`; a no-work refund leaves `count` at 0."""
    record = {"sha": sha, "count": count, "lane": "devin", "at": at, "endedAt": at + 600,
              "noWorkRefund": {"reason": "no-work", "at": at + 600}}
    if claims is not None:
        record["headClaims"] = claims
    return record


class KeyTest(unittest.TestCase):
    def test_claims_on_the_current_head_only(self):
        self.assertEqual(repair_order.head_claims(tried(claims=4), "h1"), 4)
        self.assertEqual(repair_order.head_claims(tried(claims=4), "h2"), 0, "a new head starts unclaimed")
        self.assertEqual(repair_order.head_claims(tried(count=1), "h1"), 1, "legacy records count attempts")
        self.assertEqual(repair_order.head_claims(tried(count=0), "h1"), 1, "a refunded claim still happened")
        self.assertEqual(repair_order.head_claims({"sha": "h1", "count": 0}, "h1"), 0)
        for bad in (None, [], {}, {"sha": None, "count": 3}):
            self.assertEqual(repair_order.head_claims(bad, "h1"), 0)
        self.assertEqual(repair_order.head_claims(tried(claims=2), None), 0)

    def test_wait_is_the_head_commit_time_and_unknown_sorts_last(self):
        self.assertEqual(repair_order.waiting_since({"lastCommitAt": "2033-05-18T03:33:20Z"}), NOW)
        for unknown in ({}, {"lastCommitAt": None}, {"lastCommitAt": "not a time"}):
            self.assertEqual(repair_order.waiting_since(unknown), math.inf)

    def test_fewest_claims_then_oldest_wait_then_number(self):
        rows = [harness.pr(number=3, lastCommitAt=stamp(NOW - 9 * DAY)),
                harness.pr(number=4, lastCommitAt=stamp(NOW - DAY)),
                harness.pr(number=5, lastCommitAt=stamp(NOW - 3 * DAY)),
                harness.pr(number=6), harness.pr(number=2)]
        attempts = {"3": tried(claims=10)}
        ordered = [row["number"] for row in sorted(rows, key=lambda row: repair_order.key(row, attempts))]
        self.assertEqual(ordered, [5, 4, 2, 6, 3])
        self.assertEqual(repair_order.key(harness.pr(number=9), None)[0], 0)


class EventClaimRotationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = SimpleNamespace(state=Path(self.tmp.name))
        proofs = {f"{n}:h1": {"schema": runner.GATE_RESULT_SCHEMA, "headSha": "h1", "verdict": "verified-not-queued",
                  "completedAt": runner.now_iso(), "policyDigest": runner.GATE_POLICY_DIGEST, "sensitive": False}
                  for n in (5, 6, 7)}
        (self.host.state / "verified.json").write_text(json.dumps(proofs))

    def attempts(self, value=None):
        path = self.host.state / "fix-attempts.json"
        if value is not None:
            path.write_text(json.dumps(value))
        return json.loads(path.read_text()) if path.exists() else {}

    def red(self, number, **extra):
        return harness.pr(number=number, branch=f"devin/jov-{number}-20260926t0900", kinds=["red"],
                          checks=[harness.RED_CHECK], **extra)

    def claim(self, rows):
        return events.claim_event_pr(self.host, harness.fake_lane(harness.Shell()), "devin", rows, NOW)

    def test_a_refunded_head_does_not_block_a_never_claimed_pr(self):
        # #23714 shape: claim, no push, refund, claim again on the same head while #6 waits.
        self.attempts({"5": tried(count=0, claims=3)})
        self.assertEqual(self.claim([self.red(5), self.red(6)])["number"], 6)

    def test_a_legacy_tried_head_goes_after_an_untried_one(self):
        self.attempts({"5": tried(count=1)})
        self.assertEqual(self.claim([self.red(5), self.red(6)])["number"], 6)

    def test_the_longest_waiting_head_goes_first_among_equals(self):
        rows = [self.red(5, lastCommitAt=stamp(NOW - DAY)), self.red(6, lastCommitAt=stamp(NOW - 6 * DAY)),
                self.red(7, lastCommitAt=stamp(NOW - 2 * DAY))]
        self.assertEqual(self.claim(rows)["number"], 6)

    def test_a_claim_counts_its_head_and_a_new_head_starts_over(self):
        self.attempts({"5": tried(count=0, claims=3)})
        self.assertEqual(self.claim([self.red(5)])["number"], 5, "eligibility is unchanged")
        record = self.attempts()["5"]
        self.assertEqual((record["count"], record["headClaims"]), (1, 4))
        self.attempts({"5": {**tried(count=0, claims=3), "sha": "h0"}})
        self.claim([self.red(5)])
        self.assertEqual(self.attempts()["5"]["headClaims"], 1)


class PollingRedRotationTest(unittest.TestCase):
    def red(self, number, **extra):
        return harness.pr(number=number, branch=f"codex/jov-{number}-20260926t0900", checks=[harness.RED_CHECK],
                          **extra)

    def test_polling_uses_the_same_rotation(self):
        attempts = {"5": tried(count=1, at=1_700_000_000.0)}
        self.assertEqual(runner.red_pr([self.red(5), self.red(6)], attempts)["number"], 6)
        rows = [self.red(5, lastCommitAt=stamp(NOW - DAY)), self.red(6, lastCommitAt=stamp(NOW - 4 * DAY))]
        self.assertEqual(runner.red_pr(rows, {})["number"], 6)

    def test_a_wip_capped_producer_still_goes_first(self):
        rows = [self.red(5), harness.pr(number=6, branch="devin/jov-6-20260926t0900", checks=[harness.RED_CHECK])]
        attempts = {"6": tried(count=1, at=1_700_000_000.0)}
        self.assertEqual(runner.red_pr(rows, attempts, capped=frozenset({"devin"}))["number"], 6)


if __name__ == "__main__":
    unittest.main()
