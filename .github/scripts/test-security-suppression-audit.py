#!/usr/bin/env python3
"""Regression tests for the security suppression audit CLI."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


SCRIPT = Path(__file__).with_name("security-suppression-audit.py")


def run_audit(mode: str, payload: Any, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "input.json"
        source.write_text(json.dumps(payload), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--mode", mode, "--input", str(source)],
            check=check,
            capture_output=True,
            text=True,
        )


class SecuritySuppressionAuditTest(unittest.TestCase):
    def test_audit_preserves_reason_and_counts_type_and_author(self) -> None:
        payload = [
            {
                "body": "<!-- jovie-security-suppression "
                '{"type":"secret-scan","reason":"fixture with } brace"} -->',
                "author": "alice",
                "pr_number": 42,
            },
            {
                "body": "<!-- jovie-security-suppression "
                '{"type":"secret-scan","reason":"second reason"} -->',
                "user": None,
                "pr_number": 43,
            },
        ]

        result = json.loads(run_audit("audit", payload).stdout)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["byType"], {"secret-scan": 2})
        self.assertEqual(result["byAuthor"], {"alice": 1, "unknown": 1})
        self.assertEqual(
            result["suppressedFindings"][0]["reason"], "fixture with } brace"
        )
        self.assertTrue(result["suppressionNotice"]["unsuppressible"])

    def test_normalize_keeps_suppressed_findings_and_notice(self) -> None:
        payload = {
            "findings": [],
            "suppressedFindings": [
                {"type": "dependency", "reason": "owner accepted"}
            ],
        }

        result = json.loads(run_audit("normalize", payload).stdout)

        self.assertEqual(
            result["suppressedFindings"][0]["reason"], "owner accepted"
        )
        self.assertEqual(
            result["suppressionNotice"]["id"], "security.suppressions.active"
        )
        self.assertTrue(result["suppressionNotice"]["unsuppressible"])

    def test_audit_omits_notice_when_empty(self) -> None:
        result = json.loads(
            run_audit("audit", [{"body": "no marker here", "author": "alice"}]).stdout
        )

        self.assertEqual(result["total"], 0)
        self.assertNotIn("suppressionNotice", result)
        self.assertEqual(result["suppressedFindings"], [])

    def test_malformed_marker_fails_closed(self) -> None:
        completed = run_audit(
            "audit",
            [{"body": "<!-- jovie-security-suppression [] -->"}],
            check=False,
        )

        self.assertEqual(completed.returncode, 2)
        self.assertIn("payload must be a JSON object", completed.stderr)

    def test_summary_escapes_untrusted_markdown_cells(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "input.json"
            summary = Path(directory) / "summary.md"
            source.write_text(
                json.dumps(
                    [
                        {
                            "body": "<!-- jovie-security-suppression "
                            '{"type":"secret|scan","reason":"<b>line|one\\nline two</b>"} -->',
                            "author": "alice",
                            "pr_number": 42,
                        }
                    ]
                ),
                encoding="utf-8",
            )

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--mode",
                    "audit",
                    "--input",
                    str(source),
                    "--summary-output",
                    str(summary),
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            rendered = summary.read_text(encoding="utf-8")
            self.assertIn("secret\\|scan", rendered)
            self.assertIn("&lt;b&gt;line\\|one line two&lt;/b&gt;", rendered)


if __name__ == "__main__":
    unittest.main()
