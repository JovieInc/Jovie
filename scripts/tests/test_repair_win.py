"""Measured pin-bump evidence uses the real patch and a matching upstream comparison."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import repair_win
from types import SimpleNamespace
from scripts.tests import test_pr_events_repair_evidence as fixtures

events = fixtures.events


class CompanyGuardPinWinTests(unittest.TestCase):
    OLD, NEW = "a" * 40, "b" * 40

    def setUp(self):
        self.files = [{"filename": ".github/workflows/company-guards.yml", "status": "modified", "patch": (
            "@@ -1,2 +1,2 @@\n"
            f"-# company-guards.yml@{self.OLD}\n-# ci-ref: {self.OLD}\n"
            f"+# company-guards.yml@{self.NEW}\n+# ci-ref: {self.NEW}\n") }]
        self.comparison = {"status": "ahead", "ahead_by": 1, "behind_by": 0, "total_commits": 1,
                           "base_commit": {"sha": self.OLD}, "merge_base_commit": {"sha": self.OLD},
                           "commits": [{"sha": self.NEW}],
                           "html_url": f"https://github.com/JovieInc/ci/compare/{self.OLD}...{self.NEW}"}
        self.adopted = {"status": "identical", "ahead_by": 0, "behind_by": 0, "total_commits": 0,
                        "base_commit": {"sha": self.NEW}, "merge_base_commit": {"sha": self.NEW},
                        "commits": [],
                        "html_url": f"https://github.com/JovieInc/ci/compare/{self.NEW}...{self.NEW}"}

    def test_generated_evidence_fixes_fleet_and_reproduces_the_upstream_measurement(self):
        win = repair_win.company_guard_pin(self.files, self.comparison, adopted_comparison=self.adopted)
        self.assertIn("| commits | lower | 1 | 0 |", win)
        self.assertIn(f"node packages/api-client/cli.ts gh --priority repair -- api repos/JovieInc/ci/compare/{self.OLD}...{self.NEW} --jq .ahead_by", win)
        self.assertIn("- Verify: " + self.comparison["html_url"], win)
        self.assertNotIn("- Per-merge: yes", win)
        self.assertNotIn("- Pending: yes", win)
        decision = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
        body = events.repair_evidence_body(
            fixtures.RedBeforeGreenEvidenceTests.PR, decision, win_section=win,
            customer_decision={"releaseWorthy": False})
        self.assertIn(win, body)
        self.assertEqual(body.count("customer-changelog/v1"), 1)
        self.assertEqual(events.repair_evidence_body(
            fixtures.RedBeforeGreenEvidenceTests.PR, body, win_section=win), body)
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
const win = readFileSync(0, 'utf8');
console.log(JSON.stringify(['', win].map(body => evaluateFleetRules({
  pr: {title: 'chore(ci): bump company guards pin', body}, files: [],
}).errors)));
"""], cwd=ROOT, input=win, text=True, capture_output=True, check=True)
        before, after = json.loads(checked.stdout)
        self.assertTrue(any(error.startswith("win:") for error in before), before)
        self.assertEqual(after, [])

    def test_counts_multiple_upstream_commits_without_assuming_a_one_commit_bump(self):
        self.comparison.update(ahead_by=2, total_commits=2, commits=[{"sha": "c" * 40}, {"sha": self.NEW}])
        self.assertIn("| commits | lower | 2 | 0 |", repair_win.company_guard_pin(
            self.files, self.comparison, adopted_comparison=self.adopted))

    def test_after_value_requires_a_matching_observed_target_comparison(self):
        adopted = self.adopted
        win = repair_win.company_guard_pin(self.files, self.comparison, adopted_comparison=adopted)
        self.assertIn("| commits | lower | 1 | 0 |", win)
        for change in ({"status": "ahead"}, {"ahead_by": 1}, {"ahead_by": False},
                       {"behind_by": False}, {"total_commits": False}, {"commits": [{"sha": self.NEW}]},
                       {"base_commit": {"sha": self.OLD}}, {"merge_base_commit": {"sha": self.OLD}},
                       {"base_commit": 1}, {"merge_base_commit": []},
                       {"html_url": self.comparison["html_url"]}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, "adopted target"):
                repair_win.company_guard_pin(self.files, self.comparison,
                                            adopted_comparison={**adopted, **change})
        for key in adopted:
            incomplete = {**adopted}
            del incomplete[key]
            with self.subTest(missing=key), self.assertRaisesRegex(ValueError, "adopted target"):
                repair_win.company_guard_pin(self.files, self.comparison, adopted_comparison=incomplete)
        for malformed in (None, [], "zero"):
            with self.subTest(malformed=malformed), self.assertRaisesRegex(ValueError, "adopted target"):
                repair_win.company_guard_pin(self.files, self.comparison, adopted_comparison=malformed)

    def test_rejects_unbound_divergent_incomplete_or_non_numeric_comparisons(self):
        invalid = [
            {"html_url": "https://github.com/another/repo/compare/a...b"},
            {"base_commit": {"sha": "c" * 40}}, {"merge_base_commit": {"sha": "c" * 40}},
            {"commits": [{"sha": "c" * 40}]}, {"commits": []},
            {"commits": [{"sha": self.NEW}, {"sha": self.NEW}]},
            {"status": "diverged"}, {"status": "identical"}, {"behind_by": 1},
            {"ahead_by": 0}, {"ahead_by": -1}, {"ahead_by": True}, {"ahead_by": "1"},
            {"total_commits": 2}, {"total_commits": True}, {"behind_by": False},
        ]
        for change in invalid:
            with self.subTest(change=change), self.assertRaises(ValueError):
                repair_win.company_guard_pin(self.files, {**self.comparison, **change},
                                            adopted_comparison=self.adopted)
        for key in self.comparison:
            comparison = deepcopy(self.comparison)
            del comparison[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                repair_win.company_guard_pin(self.files, comparison, adopted_comparison=self.adopted)

    def test_rejects_duplicate_or_malformed_intermediate_commit_identifiers(self):
        for intermediate in (None, {}, {"sha": "c" * 8}, {"sha": False}, {"sha": self.NEW}):
            comparison = {**self.comparison, "ahead_by": 2, "total_commits": 2,
                          "commits": [intermediate, {"sha": self.NEW}]}
            with self.subTest(intermediate=intermediate), self.assertRaises(ValueError):
                repair_win.company_guard_pin(self.files, comparison, adopted_comparison=self.adopted)

    def test_rejects_missing_truncated_or_non_pin_workflow_changes(self):
        patch = self.files[0]["patch"]
        for changed in [[], [self.files[0], self.files[0]],
                        [{**self.files[0], "status": "added"}],
                        [{**self.files[0], "patch": None}],
                        [{**self.files[0], "patch": patch + "+permissions: write-all\n"}],
                        [{**self.files[0], "patch": patch.replace(f"+# ci-ref: {self.NEW}", f"+# ci-ref: {self.OLD}")}],
                        [{**self.files[0], "patch": patch.replace(f"-# ci-ref: {self.OLD}\n", "")}]]:
            with self.subTest(files=changed), self.assertRaises(ValueError):
                repair_win.company_guard_pin(changed, self.comparison, adopted_comparison=self.adopted)


class MeasuredWinPolicyTests(unittest.TestCase):
    PR = fixtures.RedBeforeGreenEvidenceTests.PR
    WIN = fixtures.RedBeforeGreenEvidenceTests.WIN

    def test_incomplete_measured_win_is_rejected_by_canonical_policy(self):
        for invalid in (
            "## Win\n\nnone\n",
            "## Win\n\n- Claim: Incomplete measured evidence.\n",
            self.WIN.replace("| 1 | 0 |", "| unknown | 0 |"),
            self.WIN.replace("- Area: quality", "- Area: unsupported"),
            self.WIN.replace("- Verify: https://github.com/JovieInc/Jovie/actions/runs/123\n", ""),
        ):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "measured win policy"):
                events.repair_evidence_body(self.PR, "Summary", win_section=invalid)

    def test_invalid_measured_win_never_reaches_publication(self):
        writes = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="Summary")
            writes.append(args)
            return SimpleNamespace(returncode=0, stdout="")

        with self.assertRaisesRegex(ValueError, "measured win policy"):
            events.ensure_red_before_green(self.PR, sh=shell, win_section="## Win\n\nnone\n")
        self.assertEqual(writes, [])


if __name__ == "__main__":
    unittest.main()
