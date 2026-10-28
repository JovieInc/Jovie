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
            self.assertIn("attempts=2 pushed-or-rerun=1 cost=$0.0420 api_calls=13", text)

    def test_claim_format_matches_the_lanes_parser(self):
        body = f"🤖 lane claim kind=fix sha=abc host={swarm.HOST} at={swarm.iso()}"
        fields = dict(p.split("=", 1) for p in body.split()[3:] if "=" in p)
        self.assertEqual((fields["kind"], fields["sha"], fields["host"]), ("fix", "abc", "gha-swarm"))


if __name__ == "__main__":
    unittest.main()
