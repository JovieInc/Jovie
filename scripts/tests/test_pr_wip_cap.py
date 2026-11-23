"""Per-agent WIP cap: finish before starting (Tim 2026-11-22, "Do all three").

An agent at its cap takes no new issue and pr:open refuses a new PR, naming the PRs to land,
repair or hand off first. claude/ branches are capped per session. Split from test_pr_wip.py
(size budget). Run with:
    python3 -m unittest scripts.tests.test_pr_wip_cap -v
"""
from __future__ import annotations

import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_pr_wip import HEALTHY, POLICY, pr, pr_wip  # noqa: E402  (helpers only, no TestCase)


class WipCapAdmission(unittest.TestCase):
    def test_twelve_prs_against_eight_refuse_new_work_and_name_the_prs_to_land(self):
        """Tim 2026-11-22: finish before starting. A full producer gets wip-cap, oldest PRs first."""
        prs = [pr(n, f"codex/jov-{n}", draft=n < 10, state="DIRTY" if n < 6 else "BLOCKED") for n in range(12)]
        policy = {**POLICY, "caps": {"codex": 8}}
        out = pr_wip.admit(prs, "codex", policy, capacity=HEALTHY)
        self.assertEqual((out["allowed"], out["used"], out["cap"], out["reason"]), (False, 12, 8, "wip-cap"))
        self.assertEqual(len(out["landFirst"]), 10)
        self.assertIn("land", out["nextAction"])
        self.assertEqual(out["reservation"], "at-request", "a prospective check does not invent an entire PR's quota cost")

    def test_one_below_the_cap_admits(self):
        prs = [pr(n, f"codex/jov-{n}") for n in range(7)]
        out = pr_wip.admit(prs, "codex", {**POLICY, "caps": {"codex": 8}}, capacity=HEALTHY)
        self.assertEqual((out["allowed"], out["wipUsed"], out["reason"]), (True, 7, "within-capacity"))

    def test_capacity_exhaustion_wins_over_the_cap(self):
        exhausted = {"allowed": False, "known": True, "reason": "github-quota:core", "blockers": ["github-quota:core"]}
        prs = [pr(n, f"codex/jov-{n}") for n in range(12)]
        self.assertEqual(pr_wip.admit(prs, "codex", {**POLICY, "caps": {"codex": 8}}, capacity=exhausted)["reason"],
                         "github-quota:core")

    def test_unreadable_inventory_fails_open_but_says_so(self):
        out = pr_wip.admit(None, "codex", POLICY, capacity=HEALTHY)
        self.assertEqual((out["allowed"], out["wipKnown"]), (True, False))

    def test_shared_prefix_is_capped_per_session_not_across_sessions(self):
        policy = {**POLICY, "caps": {"claude": 60}, "perSession": ["claude"], "perSessionCap": 3}
        everyone = [pr(n, f"claude/thread-{n}") for n in range(40)]
        mine = [pr(n, f"claude/thread-{n}") for n in range(3)]
        full = pr_wip.admit(everyone, "claude", policy, capacity=HEALTHY, session_prs=mine)
        self.assertEqual((full["allowed"], full["reason"], full["wipScope"], full["wipCap"]), (False, "wip-cap", "session", 3))
        room = pr_wip.admit(everyone, "claude", policy, capacity=HEALTHY, session_prs=mine[:2])
        self.assertTrue(room["allowed"])
        no_session = pr_wip.admit(everyone, "claude", policy, capacity=HEALTHY)
        self.assertEqual((no_session["allowed"], no_session["wipScope"]), (True, "producer"))

    def test_handed_off_prs_do_not_count_toward_the_cap(self):
        prs = [pr(n, f"codex/jov-{n}", labels=["lane-fix-escalating"]) for n in range(12)]
        self.assertTrue(pr_wip.admit(prs, "codex", {**POLICY, "caps": {"codex": 8}}, capacity=HEALTHY)["allowed"])


class WipCapCommand(unittest.TestCase):
    def test_cli_reads_the_inventory_and_exits_3_at_the_cap(self):
        prs = [pr(n, f"codex/jov-{n}") for n in range(12)]
        policy = {**POLICY, "caps": {"codex": 8}}
        with patch.object(pr_wip, "observe_capacity", return_value=HEALTHY), patch.object(pr_wip, "load_policy", return_value=policy), \
                patch.object(pr_wip, "fetch_open_prs", return_value=prs), patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(pr_wip.main(["admit", "--branch", "codex/jov-99", "--session", ""]), 3)
        self.assertEqual(json.loads(output.getvalue())["reason"], "wip-cap")

    def test_cli_counts_a_per_session_producer_by_its_marker(self):
        policy = {**POLICY, "caps": {"claude": 60}, "perSession": ["claude"], "perSessionCap": 3}
        with patch.object(pr_wip, "observe_capacity", return_value=HEALTHY), patch.object(pr_wip, "load_policy", return_value=policy), \
                patch.object(pr_wip, "fetch_open_prs", return_value=[pr(n, f"claude/x-{n}") for n in range(30)]), \
                patch.object(pr_wip, "fetch_session_prs", return_value=[pr(1, "claude/x-1")]) as session, \
                patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(pr_wip.main(["admit", "--branch", "claude/new", "--session", "session_abc123"]), 0)
        session.assert_called_once_with("session_abc123")

    def test_session_search_rejects_unsafe_ids(self):
        self.assertIsNone(pr_wip.fetch_session_prs('x" OR', run_gh=lambda *a, **k: self.fail("no call")))


class WipCapLaneBudget(unittest.TestCase):
    def test_a_lane_at_its_wip_cap_takes_no_new_issue(self):
        import lane_runner as lane
        cap = pr_wip.cap_for("codex", pr_wip.load_policy())
        prs = [pr(n, f"codex/jov-{n}-20261101") for n in range(cap + 4)]
        full = lane.new_issue_budget("codex", 3, prs, capacity=HEALTHY)
        self.assertEqual((full["allowed"], full["reason"], full["wip"], full["wipCap"]), (False, "wip-cap", cap + 4, cap))
        self.assertTrue(full["capacity"]["landFirst"])
        room = lane.new_issue_budget("codex", 3, prs[:cap - 1], capacity=HEALTHY)
        self.assertEqual((room["allowed"], room["reason"]), (True, "within-budget"))
        exhausted = {"allowed": False, "known": True, "reason": "github-quota:core", "blockers": ["github-quota:core"]}
        self.assertFalse(lane.new_issue_budget("codex", 3, prs[:1], capacity=exhausted)["allowed"])
        self.assertEqual(lane.new_issue_budget("codex", 0, prs, capacity=HEALTHY)["reason"], "provider-disabled")

    def test_a_lane_sharing_the_claude_prefix_is_held_by_the_producer_backstop(self):
        import lane_runner as lane
        cap = pr_wip.cap_for("claude", pr_wip.load_policy())
        sessions = [pr(n, f"claude/thread-{n}") for n in range(cap - 1)]
        self.assertTrue(lane.new_issue_budget("claude", 2, sessions, capacity=HEALTHY)["allowed"])
        full = lane.new_issue_budget("claude", 2, sessions + [pr(900, "claude/jov-9-20261122")], capacity=HEALTHY)
        self.assertEqual((full["allowed"], full["reason"]), (False, "wip-cap"))
        self.assertTrue(full["capacity"]["landFirst"])


if __name__ == "__main__":
    unittest.main()
