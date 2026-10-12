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
    def test_official_workflow_uses_jovie_linear_and_codex_app_server(self) -> None:
        workflow = WORKFLOW.read_text()

        self.assertRegex(workflow, re.compile(r"^\s+kind: linear$", re.MULTILINE))
        self.assertIn('project_slug: "ba6736cbfbb9"', workflow)
        self.assertIn("api_key: $LINEAR_API_KEY", workflow)
        self.assertIn(
            "git clone --depth 1 git@github.com:JovieInc/Jovie.git .", workflow
        )
        self.assertRegex(
            workflow,
            re.compile(r"^\s+command: codex .* app-server$", re.MULTILINE),
        )

    def test_burrito_note_is_bounded_and_uses_only_upstream_release(self) -> None:
        note = BURRITO_NOTE.read_text()

        self.assertLessEqual(len(note.splitlines()), 20)
        self.assertIn("symphony-${version}-macos_arm64", note)
        self.assertIn("github.com/openai/symphony/releases/download", note)
        self.assertIn("shasum -a 256 -c", note)
        self.assertNotIn("JovieInc/symphony", note)

    def test_homemade_intake_and_admission_wrappers_stay_deleted(self) -> None:
        for artifact in RETIRED_INTAKE_ARTIFACTS:
            with self.subTest(artifact=artifact.relative_to(ROOT)):
                self.assertFalse(artifact.exists())


if __name__ == "__main__":
    unittest.main()
