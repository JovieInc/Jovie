"""PR repair quotes commit references without hiding real mentions or changing proof."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import pr_events as events


class RevisionReferenceTests(unittest.TestCase):
    SHA = "036b3506525bb56da96330731090028d357c4b04"

    def test_repair_quotes_bare_full_revision_references_and_is_idempotent(self):
        for sha in (self.SHA, self.SHA.upper()):
            with self.subTest(sha=sha):
                body = f"Environment: main @{sha}. Owner @itstimwhite."
                updated = events.repair_evidence_body({}, body)
                self.assertEqual(updated, f"Environment: main `@{sha}`. Owner @itstimwhite.")
                self.assertEqual(events.repair_evidence_body({}, updated), updated)

    def test_repair_preserves_code_links_metadata_and_real_mentions(self):
        for body in (
            f"`main @{self.SHA}`", f"``main `@{self.SHA}```",
            f"```text\nFAIL @{self.SHA}\n```", f"~~~text\nFAIL @{self.SHA}\n~~~",
            f'<!-- receipt {{"revision":"@{self.SHA}"}} -->',
            f"https://example.com/@{self.SHA}", f"[source](https://example.com/@{self.SHA})",
            "Owner @someone-unknown. Package @scope/name. Email name@example.com.",
            "main @036b350", f"@{self.SHA}a", f"@{self.SHA}/name",
        ):
            with self.subTest(body=body):
                self.assertEqual(events.repair_evidence_body({}, body), body)

    def test_repair_preserves_red_proof_and_customer_decision_while_quoting_prose(self):
        proof = ("## Red-before-green\n\n- Failing command: `node guard.mjs`\n\n"
                 f"```text\nFAIL mention: @{self.SHA}\n```\n")
        decision = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
        body = f"Environment: main @{self.SHA}\n\n" + proof + "\n" + decision
        updated = events.repair_evidence_body({}, body, customer_decision={"releaseWorthy": False})
        self.assertIn(f"main `@{self.SHA}`", updated)
        self.assertIn(proof, updated)
        self.assertEqual(updated.count(decision), 1)
        self.assertTrue(events.red_section_complete(updated))

    def test_repair_quotes_eight_char_hex_prefixes_for_the_mention_guard(self):
        prefix = "036b3506"
        body = f"Copied from main @{prefix}."
        updated = events.repair_evidence_body({}, body)
        self.assertEqual(updated, f"Copied from main `@{prefix}`.")
        self.assertEqual(events.repair_evidence_body({}, updated), updated)
        script = (
            "import { readFileSync } from 'node:fs';\n"
            "const re = /(?<![\\w@./`-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}"
            "[A-Za-z0-9])?(?:\\[bot\\])?)(?![\\w-]*\\/|\\w*\\.\\w)/g;\n"
            "const text = readFileSync(0, 'utf8');\n"
            "const stripped = text.replace(/```[\\s\\S]*?```/g, ' ')"
            ".replace(/`[^`\\n]*`/g, ' ');\n"
            "const hits = [...stripped.matchAll(re)].map((match) => match[1]);\n"
            "console.log(JSON.stringify(hits));\n"
        )
        checked = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            input=updated,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(checked.stdout), [])
