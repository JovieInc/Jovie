"""The retained local changelog-preflight repair prompt contract."""
import os
import sys
import unittest
from pathlib import Path

os.environ['LANES_EXECUTION_BACKEND'] = 'local-test'
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lanes'))
import lane_runner as lane


class ChangelogRepairPromptTest(unittest.TestCase):
    def test_repair_prompt_preflights_the_customer_decision_without_replacing_approved_copy(self):
        prompt = lane.render_fix_prompt({"number": 23211, "headRefName": "fix/apple-music-visitor-storefront"},
                                      "Customer outcome decision missing or invalid (missing-metadata)")
        self.assertIn("exactly one customer-changelog/v1 decision", prompt)
        self.assertIn("preserve existing approved customer copy", prompt)
        self.assertIn("node scripts/changelog-source-guard.mjs --pr-file <pr.json> --body-file <body.md>", prompt)
        self.assertIn("not hosted CI proof", prompt)
