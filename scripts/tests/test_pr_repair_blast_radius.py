"""Explicit blast-radius receipts for the existing PR repair machine."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from types import SimpleNamespace

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import pr_events as events


class BlastRadiusEvidenceTests(unittest.TestCase):
    PR = {"number": 24799}
    PROOF = {"What could break": "Existing repair receipts could be overwritten.",
             "Proof": "Regression suite verifies preservation and idempotency."}

    def test_explicit_receipt_passes_canonical_fleet_policy(self):
        body = events.repair_evidence_body(self.PR, "## Summary\nRepair CI.\n", blast_radius=self.PROOF)
        self.assertIn("## Blast radius\n", body)
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import {readFileSync} from 'node:fs';
import {evaluateFleetRules} from './scripts/pr-fleet-rules.mjs';
console.log(JSON.stringify(evaluateFleetRules({pr:{title:'test: repair evidence',body:readFileSync(0,'utf8')},files:[]})));
"""], cwd=ROOT, input=body, text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(checked.stdout), {"errors": [], "warnings": []})
        self.assertEqual(events.repair_evidence_body(self.PR, body, blast_radius=self.PROOF), body)

    def test_preserves_existing_receipt_and_ignores_log_headings(self):
        original = "## Blast radius\n\n- What could break: Existing claim\n- Proof: Original proof\n"
        self.assertEqual(events.repair_evidence_body(self.PR, original, blast_radius=self.PROOF), original)
        fenced = "## Red-before-green\n\n- Failing command: node guard\n```text\nFAIL\n## Blast radius\n```\n"
        repaired = events.repair_evidence_body(self.PR, fenced, blast_radius=self.PROOF)
        self.assertIn(fenced, repaired)
        self.assertIn("- Proof: " + self.PROOF["Proof"], repaired)

    def test_requires_explicit_single_line_fields(self):
        self.assertNotIn("## Blast radius", events.repair_evidence_body(self.PR, "Summary"))
        for evidence in ({}, {**self.PROOF, "Proof": ""}, {**self.PROOF, "Proof": 1},
                         {**self.PROOF, "Proof": "proof\n## Injected"},
                         {**self.PROOF, "What could break": "claim\rhidden"}, "guessed"):
            with self.subTest(evidence=evidence), self.assertRaises(ValueError):
                events.repair_evidence_body(self.PR, "Summary", blast_radius=evidence)

    def test_existing_publisher_forwards_explicit_proof(self):
        writes = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="## Summary\nRepair CI.\n")
            writes.append(Path(args[-1]).read_text())
            return SimpleNamespace(returncode=0)

        self.assertTrue(events.ensure_red_before_green(self.PR, sh=shell, blast_radius=self.PROOF))
        self.assertEqual(len(writes), 1)
        self.assertIn("- Proof: " + self.PROOF["Proof"], writes[0])


if __name__ == "__main__":
    unittest.main()
