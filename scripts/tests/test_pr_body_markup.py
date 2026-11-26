"""PR repair quotes commit references without hiding real mentions or changing proof."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import pr_events as events


class RevisionReferenceTests(unittest.TestCase):
    SHA = "036b3506525bb56da96330731090028d357c4b04"

    def test_repair_quotes_only_explicit_literal_mentions_and_is_idempotent(self):
        body = "The new @critical test. Owner @someone-unknown. Tag @critical-path."
        updated = events.repair_evidence_body({}, body, literal_mentions=("@critical",))
        self.assertEqual(updated, "The new `@critical` test. Owner @someone-unknown. Tag @critical-path.")
        self.assertEqual(events.repair_evidence_body({}, updated, literal_mentions=("@critical",)), updated)
        self.assertEqual(events.repair_evidence_body({}, "Tag @critical", literal_mentions=("@critical",)),
                         "Tag `@critical`")

    def test_existing_publisher_can_repair_only_a_literal_mention(self):
        edited = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="The @critical test.")
            self.assertEqual(args[:2], ["pr", "edit"])
            edited.append(Path(args[-1]).read_text())
            return SimpleNamespace(returncode=0)

        self.assertTrue(events.ensure_red_before_green({"number": 7}, sh=shell,
                                                       literal_mentions=("@critical",)))
        self.assertEqual(edited, ["The `@critical` test."])

    def test_literal_mentions_preserve_proof_metadata_links_and_code(self):
        for body in (
            "`@critical`", "``literal `@critical` text``", "```text\nFAIL @critical\n```",
            "~~~text\nFAIL @critical\n~~~", '<!-- receipt {"tag":"@critical"} -->',
            "https://example.com/@critical", "[source](https://example.com/@critical)",
            "Package @critical/name. Email name@critical.com.",
        ):
            with self.subTest(body=body):
                self.assertEqual(events.repair_evidence_body({}, body, literal_mentions=("@critical",)), body)
        proof = "## Red-before-green\n\n- Failing command: `vitest run`\n\n```text\nFAIL @critical\n```\n"
        decision = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
        body = "The @critical test.\n\n" + proof + "\n" + decision
        updated = events.repair_evidence_body({}, body, literal_mentions=("@critical",),
                                              customer_decision={"releaseWorthy": False})
        self.assertIn("The `@critical` test.", updated)
        self.assertIn(proof, updated)
        self.assertEqual(updated.count(decision), 1)
        self.assertTrue(events.red_section_complete(updated))

    def test_literal_mentions_require_explicit_complete_mention_tokens(self):
        for invalid in ("@critical", ("critical",), ("@critical/path",), ("@critical\n",), (None,)):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                events.repair_evidence_body({}, "The @critical test.", literal_mentions=invalid)

    def test_repair_quotes_bare_full_revision_references_and_is_idempotent(self):
        for sha in (self.SHA, self.SHA.upper()):
            with self.subTest(sha=sha):
                body = f"Environment: main @{sha}. Owner @itstimwhite."
                updated = events.repair_evidence_body({}, body)
                self.assertEqual(updated, f"Environment: main `@{sha}`. Owner @itstimwhite.")
                self.assertEqual(events.repair_evidence_body({}, updated), updated)

    def test_default_revision_repair_quotes_references_at_end_of_body(self):
        for sha in (self.SHA, self.SHA[:8]):
            with self.subTest(sha=sha):
                self.assertEqual(events.repair_evidence_body({}, f"main @{sha}"), f"main `@{sha}`")

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


class MachineReceiptTests(unittest.TestCase):
    PR = {"number": 23251, "headRefOid": "a" * 40}

    def test_repair_adds_explicit_machine_receipt_once_and_preserves_existing_decision(self):
        machine = "Machine: built scripts/lanes/pr_events.py"
        updated = events.repair_evidence_body(self.PR, "Summary", machine_receipt=machine)
        self.assertEqual(updated.count(machine), 1)
        self.assertEqual(events.repair_evidence_body(self.PR, updated, machine_receipt=machine), updated)
        existing = "Summary\nMachine-gap: JOV-1234\n"
        preserved = events.repair_evidence_body(self.PR, existing, machine_receipt=machine)
        self.assertIn("Machine-gap: JOV-1234", preserved)
        self.assertNotIn(machine, preserved)
        self.assertNotIn("Machine:", events.repair_evidence_body(self.PR, "Summary"))
        for invalid in ("built scripts/machine.py", "Machine: built", "Machine: built x\nMachine-gap: JOV-1234"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                events.repair_evidence_body(self.PR, "Summary", machine_receipt=invalid)

    def test_ensure_can_publish_only_a_machine_receipt_without_inventing_red_evidence(self):
        machine = "Machine: built scripts/lanes/pr_events.py"
        written = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="Summary\n")
            written.append(Path(args[args.index("--body-file") + 1]).read_text())
            return SimpleNamespace(returncode=0)

        self.assertTrue(events.ensure_red_before_green({"number": 23251}, sh=shell, machine_receipt=machine))
        self.assertEqual(written, ["Summary\n\n" + machine + "\n"])
