"""Per-producer PR WIP cap, census and idle expiry (scripts/lanes/pr_wip.py).

Run with:
    python3 -m pytest scripts/tests/test_pr_wip.py -v
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import pr_wip  # noqa: E402

NOW = 1_793_500_000.0
DAY = 86400
POLICY = {"minCap": 2, "defaultCap": 3, "caps": {"codex": 2, "opus": 4}, "exemptProducers": ["tim", "dependabot"],
          "liveWindowHours": 48, "expire": {"enabled": False, "ownerlessIdleDays": 7, "anyIdleDays": 21,
                                            "maxClosesPerTick": 2}}


def iso(epoch: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def pr(number, branch, *, idle_days=0.0, age_days=1.0, labels=(), state="BLOCKED", draft=False, queued=False):
    return {"number": number, "headRefName": branch, "updatedAt": iso(NOW - idle_days * DAY),
            "createdAt": iso(NOW - age_days * DAY), "labels": [{"name": name} for name in labels],
            "mergeStateStatus": state, "isDraft": draft, "isInMergeQueue": queued}


class PolicyFile(unittest.TestCase):
    def test_checked_in_policy_is_valid_and_expiry_waits_for_the_invariant(self):
        policy = pr_wip.load_policy()
        self.assertEqual(policy["schema"], "jovie-pr-wip-policy/v1")
        self.assertTrue(all(isinstance(cap, int) and cap >= policy["minCap"] for cap in policy["caps"].values()))
        self.assertIn("tim", policy["exemptProducers"])
        # JOV-INV-011: automatic close needs an explicit duplicate label until the founder amends it.
        self.assertFalse(policy["expire"]["enabled"])


class Admission(unittest.TestCase):
    def test_producer_is_the_branch_prefix(self):
        self.assertEqual(pr_wip.producer_of("codex/jov-1-20261101"), "codex")
        self.assertEqual(pr_wip.producer_of("Opus/mesh"), "opus")
        self.assertEqual(pr_wip.producer_of("main"), "(none)")

    def test_cap_refuses_at_the_limit_and_ignores_held_and_other_producers(self):
        prs = [pr(1, "codex/a"), pr(2, "codex/b", labels=["hold"]), pr(3, "opus/x")]
        self.assertEqual(pr_wip.admit(prs, "codex", POLICY)["reason"], "within-wip")
        prs.append(pr(4, "codex/c"))
        decision = pr_wip.admit(prs, "codex", POLICY)
        self.assertEqual((decision["allowed"], decision["used"], decision["cap"]), (False, 2, 2))
        self.assertTrue(pr_wip.admit(prs, "glm", POLICY)["allowed"], "unlisted producers get defaultCap")

    def test_exempt_and_unknown_inventory_admit(self):
        many = [pr(n, "tim/x") for n in range(10)]
        self.assertEqual(pr_wip.admit(many, "tim", POLICY)["reason"], "wip-exempt")
        self.assertEqual(pr_wip.admit(None, "codex", POLICY)["reason"], "wip-unknown")
        self.assertTrue(pr_wip.admit(None, "codex", POLICY)["allowed"])

    def test_min_cap_floors_a_tiny_cap(self):
        self.assertEqual(pr_wip.cap_for("x", {**POLICY, "caps": {"x": 0}}), 2)


class Census(unittest.TestCase):
    def test_counts_age_mergeability_and_over_cap(self):
        prs = [pr(1, "codex/a", age_days=1, state="CLEAN"), pr(2, "codex/b", age_days=3, state="DIRTY"),
               pr(3, "opus/x", age_days=10, draft=True)]
        out = pr_wip.census(prs, NOW, POLICY)
        self.assertEqual((out["open"], out["drafts"]), (3, 1))
        self.assertEqual(out["mergeable"], {"CLEAN": 1, "DIRTY": 1, "BLOCKED": 1})
        self.assertEqual(out["ageP50Hours"], 72.0)
        self.assertEqual(out["ageP95Hours"], 240.0)
        self.assertEqual(out["overCap"], ["codex"])
        self.assertEqual(out["byProducer"]["codex"], {"open": 2, "wip": 2, "cap": 2, "overCap": True})
        json.dumps(out)  # the lanes feed is JSON


class Expiry(unittest.TestCase):
    def test_disabled_policy_closes_nothing_unless_forced(self):
        prs = [pr(1, "ui/old", idle_days=9)]
        self.assertEqual(pr_wip.expiry_candidates(prs, NOW, POLICY), [])
        self.assertEqual([row[0]["number"] for row in pr_wip.expiry_candidates(prs, NOW, POLICY, force=True)], [1])

    def test_ownerless_idle_and_long_idle_expire_but_held_live_and_queued_stay(self):
        policy = {**POLICY, "expire": {**POLICY["expire"], "enabled": True}}
        prs = [pr(1, "ui/old", idle_days=9),                       # ownerless, idle > 7d
               pr(2, "codex/old", idle_days=9), pr(3, "codex/new"),  # codex is live: kept
               pr(4, "codex/ancient", idle_days=30),               # live producer, idle > 21d
               pr(5, "tim/old", idle_days=60), pr(6, "ui/held", idle_days=60, labels=["hold"]),
               pr(7, "ui/queued", idle_days=60, queued=True)]
        found = pr_wip.expiry_candidates(prs, NOW, policy)
        self.assertEqual([row[0]["number"] for row in found], [4, 1], "oldest first")
        self.assertIn("idle 30 days", found[0][1])
        self.assertIn("no live owner", found[1][1])

    def test_expire_respects_the_per_tick_cap_and_keeps_failed_closes_open(self):
        policy = {**POLICY, "expire": {**POLICY["expire"], "enabled": True, "maxClosesPerTick": 2}}
        prs = [pr(n, f"ui/b{n}", idle_days=10 + n) for n in range(1, 5)]
        attempted = []

        def close(number, body):
            attempted.append(number)
            self.assertIn("branch `ui/b", body)
            return number != 4
        closed = pr_wip.expire(prs, NOW, policy, close)
        self.assertEqual(attempted, [4, 3])
        self.assertEqual([row["pr"] for row in closed], [3])


class LaneBudget(unittest.TestCase):
    def test_new_issue_budget_enforces_the_shared_wip_cap(self):
        import os
        os.environ.setdefault("LANES_EXECUTION_BACKEND", "local-test")
        import lane_runner as lane
        cap = pr_wip.cap_for("codex", pr_wip.load_policy())
        under = [pr(n, f"codex/jov-{n}-20261101") for n in range(cap - 1)]
        self.assertTrue(lane.new_issue_budget("codex", 3, under)["allowed"])
        at = under + [pr(999, "codex/jov-999-20261101")]
        budget = lane.new_issue_budget("codex", 3, at)
        self.assertEqual((budget["allowed"], budget["reason"], budget["wip"], budget["wipCap"]),
                         (False, "wip-cap", cap, cap))
        self.assertTrue(lane.new_issue_budget("codex", 3, None)["allowed"], "unknown inventory admits")
        self.assertEqual(lane.new_issue_budget("codex", 0, at)["reason"], "provider-disabled")


if __name__ == "__main__":
    unittest.main()
