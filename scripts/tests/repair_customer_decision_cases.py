"""Customer decision cases inherited by the existing repair-evidence runner."""
import json
import subprocess
from pathlib import Path

import fix_red_classes as classes
import pr_events as events

ROOT = Path(__file__).resolve().parents[2]


class CustomerDecisionCases:
    def test_schema_mentions_do_not_replace_an_explicit_customer_decision(self):
        body = "## Summary\nThe customer-changelog/v1 decision is missing.\n"
        updated = events.repair_evidence_body(self.PR, body, customer_decision={"releaseWorthy": False})
        self.assertIn(body, updated)
        self.assertIn('<!-- customer-changelog/v1 {"releaseWorthy":false} -->', updated)
        self.assertTrue(events.red_section_complete(updated))
        self.assertEqual(events.repair_evidence_body(self.PR, updated,
                                                   customer_decision={"releaseWorthy": False}), updated)
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateCustomerNoteContract } from './scripts/lib/daily-changelog-publication.mjs';
const bodies = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(bodies.map(body => evaluateCustomerNoteContract({
  files: ['apps/web/lib/merch/mockup-enrichment.ts'], body, createdAt: '2026-11-10T00:00:00Z',
}))));
"""], cwd=ROOT, input=json.dumps([body, updated]), text=True, capture_output=True, check=True, timeout=15)
        before, after = json.loads(checked.stdout)
        self.assertEqual(before["reason"], "missing-metadata")
        self.assertEqual(after, {"passed": True, "applicable": True, "reason": "internal"})

    def test_section_repairs_preserve_the_original_customer_decision_verbatim(self):
        decision = '<!-- customer-changelog/v1 {"releaseWorthy":true,"text":"Approved copy"} -->'
        old_win = self.WIN + decision + "\n"
        cases = [
            ("## Red-before-green\nTBD\n" + decision, {}),
            (events.red_before_green_block(self.PR) + "\n" + old_win,
             {"win_section": self.WIN, "previous_win_section": old_win}),
        ]
        for body, fields in cases:
            with self.subTest(body=body):
                updated = events.repair_evidence_body(self.PR, body, customer_decision={"releaseWorthy": False}, **fields)
                self.assertIn(decision, updated)
                self.assertEqual(updated.count("<!-- customer-changelog/v1"), 1)
                self.assertNotIn('{"releaseWorthy":false}', updated)
                self.assertTrue(events.red_section_complete(updated))

    def test_internal_stamp_accepts_schema_mentions_but_preserves_existing_notes(self):
        body = "Repair the customer-changelog/v1 decision.\n"
        self.assertEqual(classes.stamp_internal_changelog(body), body + classes.INTERNAL_CHANGELOG_NOTE + "\n")
        for note in ('<!-- customer-changelog/v1 {"releaseWorthy":true} -->',
                     '<!-- customer-changelog/v1 malformed -->',
                     '<!--\ncustomer-changelog/v1 {"releaseWorthy":false}\n-->',
                     '<!-- customer-changelog/v1 {"releaseWorthy":true}'):
            with self.subTest(note=note):
                self.assertIsNone(classes.stamp_internal_changelog(body + note))
