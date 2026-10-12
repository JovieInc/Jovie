#!/usr/bin/env python3
"""Structural coverage for the official OpenAI Symphony bootstrap."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "WORKFLOW.md"
BURRITO_NOTE = ROOT / "docs/ops/openai-symphony-burrito.md"
RETIRED_INTAKE_ARTIFACTS = (
    ROOT / ".github/workflows/jovie-intake-controller.yml",
    ROOT / "scripts/backlog-orchestrator/intake-controller-workflow.test.mjs",
    ROOT / "scripts/backlog-orchestrator/intake-event-controller.mjs",
    ROOT / "scripts/backlog-orchestrator/intake-event-controller.test.mjs",
)


class OpenAISymphonyInstallTests(unittest.TestCase):
    def test_official_workflow_uses_jovie_team_scope_and_codex_app_server(
        self,
    ) -> None:
        workflow = WORKFLOW.read_text()

        self.assertRegex(workflow, re.compile(r"^\s+kind: linear$", re.MULTILINE))
        self.assertIn('team_key: "JOV"', workflow)
        self.assertNotIn("project_slug:", workflow)
        self.assertIn("api_key: $LINEAR_API_KEY", workflow)
        self.assertIn("    excluded_labels:\n      - no-symphony", workflow)
        self.assertRegex(
            workflow,
            re.compile(r"^  required_labels: \[\]$", re.MULTILINE),
        )

        active_states = re.search(
            r"^  active_states:\n(?P<items>(?:    - .+\n)+)(?=  terminal_states:)",
            workflow,
            re.MULTILINE,
        )
        self.assertIsNotNone(active_states)
        assert active_states is not None
        self.assertEqual(
            [
                line.removeprefix("    - ")
                for line in active_states["items"].splitlines()
            ],
            ["Todo", "In Progress", "Merging", "Rework"],
        )

        terminal_states = re.search(
            r"^  terminal_states:\n(?P<items>(?:    - .+\n)+)(?=^polling:)",
            workflow,
            re.MULTILINE,
        )
        self.assertIsNotNone(terminal_states)
        assert terminal_states is not None
        self.assertEqual(
            {
                line.removeprefix("    - ")
                for line in terminal_states["items"].splitlines()
            },
            {"Closed", "Cancelled", "Canceled", "Duplicate", "Done"},
        )
        self.assertIn(
            "git clone --depth 1 git@github.com:JovieInc/Jovie.git .", workflow
        )
        self.assertRegex(
            workflow,
            re.compile(r"^\s+command: codex .* app-server$", re.MULTILINE),
        )
        self.assertIn(
            "retain the exact failed run, attempt, deployment identity,\n  and owner",
            workflow,
        )
        self.assertIn(
            "must not become a global source-merge gate",
            workflow,
        )

    def test_burrito_note_binds_the_supported_team_adapter(self) -> None:
        note = BURRITO_NOTE.read_text()

        self.assertLessEqual(len(note.splitlines()), 20)
        self.assertIn("JovieInc/symphony-ops", note)
        self.assertIn("fae11882085d83d8d2a58f0f864a9eb1b6e40db8", note)
        self.assertIn("1c0fb6c8e8ef9031a2c861e62af5f9e66cee39cb", note)
        self.assertIn(
            "aa7159e51fe41d3c712e3870ba82a314e93eb384e8189c649dd0f69aec1ef989",
            note,
        )
        self.assertIn("must not be started with this workflow", note)
        self.assertNotIn("github.com/openai/symphony/releases/download", note)

    def test_homemade_intake_and_admission_wrappers_stay_deleted(self) -> None:
        for artifact in RETIRED_INTAKE_ARTIFACTS:
            with self.subTest(artifact=artifact.relative_to(ROOT)):
                self.assertFalse(artifact.exists())


if __name__ == "__main__":
    unittest.main()
