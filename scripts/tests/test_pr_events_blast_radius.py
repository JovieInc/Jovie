"""Keep explicit repair blast-radius evidence complete and author-owned."""
import json
import subprocess
import unittest

from .test_pr_events_repair_evidence import ROOT, Shell, events


class RepairBlastRadiusTests(unittest.TestCase):
    PR = {"number": 7}
    BLAST = {
        "What could break": "Paid checkouts and retries share the fulfillment worker.",
        "Proof": "The real handler tests preserve paid fulfillment and draft identity.",
    }

    def test_explicit_blast_radius_passes_canonical_fleet_and_is_idempotent(self):
        original = 'Summary\n<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n'
        updated = events.repair_evidence_body(
            self.PR, original, blast_radius=self.BLAST,
            customer_decision={"releaseWorthy": False})
        self.assertTrue(updated.startswith(original))
        self.assertEqual(updated.count("customer-changelog/v1"), 1)
        self.assertEqual(events.repair_evidence_body(
            self.PR, updated, blast_radius=self.BLAST), updated)
        checked = subprocess.run(
            ["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
const warnings = body => evaluateFleetRules({pr: {title: 'chore: repair evidence', body}, files: []}).warnings;
console.log(JSON.stringify(JSON.parse(readFileSync(0, 'utf8')).map(warnings)));
"""], cwd=ROOT, input=json.dumps([original, updated]), text=True,
            capture_output=True, check=True, timeout=15)
        before, after = json.loads(checked.stdout)
        self.assertTrue(any(w.startswith("blast-radius:") for w in before))
        self.assertEqual(after, [])

    def test_existing_author_evidence_is_preserved_and_hidden_headings_are_ignored(self):
        original = "Summary\n\n## Blast radius\n\nExisting author proof.\n"
        self.assertEqual(events.repair_evidence_body(
            self.PR, original, blast_radius=self.BLAST), original)
        for hidden in ("<!--\n## Blast radius\n-->\n", "```text\n## Blast radius\n```\n"):
            updated = events.repair_evidence_body(self.PR, hidden, blast_radius=self.BLAST)
            self.assertTrue(updated.startswith(hidden))
            self.assertIn("- Proof: " + self.BLAST["Proof"], updated)

    def test_blast_radius_requires_explicit_single_line_fields(self):
        self.assertNotIn("## Blast radius", events.repair_evidence_body(self.PR, "Summary"))
        for invalid in ({}, "verified", {**self.BLAST, "Proof": ""},
                        {**self.BLAST, "Proof": "ok\n## Other"}, {**self.BLAST, "Proof": 1}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                events.repair_evidence_body(self.PR, "Summary", blast_radius=invalid)

    def test_ensure_writes_blast_radius_without_requiring_a_red_check(self):
        shell = Shell({("pr", "view"): "Summary"})
        self.assertTrue(events.ensure_red_before_green(self.PR, sh=shell, blast_radius=self.BLAST))
        self.assertEqual(len(shell.made("pr", "edit")), 1)

    def test_blast_radius_composes_with_explicit_literal_mentions(self):
        evidence = {**self.BLAST, "Proof": "The @critical test tag passes."}
        updated = events.repair_evidence_body(
            self.PR, "Summary", blast_radius=evidence, literal_mentions=("@critical",))
        self.assertIn("- Proof: The `@critical` test tag passes.", updated)
        self.assertEqual(updated.count("## Blast radius"), 1)
