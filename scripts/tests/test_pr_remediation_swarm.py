import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "swarm"))
import pr_remediation_swarm as swarm  # noqa: E402


class SwarmPolicyTest(unittest.TestCase):
    def test_sensitive_paths_route_to_the_codex_ladder(self):
        for path in ("apps/web/lib/auth/session.ts", "apps/web/lib/billing/plans.ts", "apps/web/drizzle/0042_x.sql",
                     ".github/workflows/ci.yml", "scripts/lanes/lane_runner.py", ".env.example", "canon/README.md"):
            self.assertTrue(swarm.SENSITIVE.search(path), path)
        for path in ("apps/web/components/Button.tsx", "docs/README.md", "scripts/ci-fast-lanes.mjs"):
            self.assertFalse(swarm.SENSITIVE.search(path), path)

    def test_launch_shepherd_prs_are_excluded(self):
        self.assertTrue({23495, 23519} <= swarm.EXCLUDED)

    def test_summarize_counts_outcomes_cost_and_calls(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "a.jsonl").write_text("\n".join(json.dumps(r) for r in (
                {"outcome": "agent-fixed", "costUsd": 0.012, "calls": 7},
                {"outcome": "gave-up", "costUsd": 0.03, "calls": 6})) + "\n")
            class A: pass
            a = A(); a.dir = str(d); a.out = str(d / "o.md")
            swarm.cmd_summarize(a)
            text = (d / "o.md").read_text()
            self.assertIn("attempts=2 reds=2 reds-pushed-or-rerun=1 conflicts=0 conflicts-cleared=0 cost=$0.0420 api_calls=13", text)

    def test_unreadable_ledger_fails_closed_for_model_but_not_for_deterministic(self):
        modes = {1: "red", 2: "conflict", 3: "red"}
        matrix = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=None, daily_cap_usd=5, attempt_cap_usd=0.1)
        self.assertEqual([m["pr"] for m in matrix], [1, 2, 3])  # $0 actions still dispatch
        self.assertFalse(any(m["agent"] for m in matrix))
        reached = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=500, daily_cap_usd=5, attempt_cap_usd=0.1)
        self.assertFalse(any(m["agent"] for m in reached))
        some = swarm.plan_matrix(modes, limit=10, by_quota=10, spent_cents=480, daily_cap_usd=5, attempt_cap_usd=0.1)
        self.assertEqual([m["agent"] for m in some], [True, True, False])  # 20c left = 2 attempts

    def test_day_spend_returns_none_when_the_read_fails(self):
        def boom(*args, **kwargs):
            raise RuntimeError("gh: HTTP 502")
        original = swarm.gh_json
        swarm.gh_json = boom
        try:
            self.assertIsNone(swarm.day_spend_cents("swarm-ledger"))
        finally:
            swarm.gh_json = original

    def test_day_spend_sums_todays_ledger_comments_once_per_run(self):
        today = swarm.iso()[:10]
        rows = [{"body": f"🤖 swarm-ledger run=1 cents=7 at={today}T01:00:00Z"},
                {"body": f"🤖 swarm-ledger run=1 cents=7 at={today}T01:00:01Z"},  # retried write, same run
                {"body": f"🤖 swarm-ledger run=2 cents=5 at={today}T02:00:00Z"},
                {"body": "unrelated comment"}]
        original = swarm.gh_json
        swarm.gh_json = lambda *a, **k: rows
        try:
            self.assertEqual(swarm.day_spend_cents("23528"), 12)
            self.assertIsNone(swarm.day_spend_cents(""))  # no ledger configured: closed
        finally:
            swarm.gh_json = original

    def test_claim_format_matches_the_lanes_parser(self):
        body = f"🤖 lane claim kind=fix sha=abc host={swarm.HOST} at={swarm.iso()}"
        fields = dict(p.split("=", 1) for p in body.split()[3:] if "=" in p)
        self.assertEqual((fields["kind"], fields["sha"], fields["host"]), ("fix", "abc", "gha-swarm"))


if __name__ == "__main__":
    unittest.main()
