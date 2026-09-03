#!/usr/bin/env python3
"""Structural coverage for the upstream OpenAI Symphony cutover."""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class OpenAISymphonyInstallTests(unittest.TestCase):
    def test_official_workflow_and_burrito_installer(self) -> None:
        workflow = (ROOT / "WORKFLOW.md").read_text()
        self.assertIn('project_slug: "ba6736cbfbb9"', workflow)
        self.assertIn("api_key: $LINEAR_API_KEY", workflow)
        self.assertIn(
            "git clone --depth 1 git@github.com:JovieInc/Jovie.git .", workflow
        )
        self.assertRegex(workflow, re.compile(r"^\s+command: codex .*app-server$", re.M))
        self.assertNotIn("symphony-codex-router", workflow)

        installer = (ROOT / "scripts/install-openai-symphony.sh").read_text()
        self.assertIn('SYMPHONY_VERSION="v0.0.2"', installer)
        self.assertIn("github.com/openai/symphony/releases/download", installer)
        self.assertIn("macos_arm64", installer)
        self.assertIn("shasum -a 256 -c", installer)
        self.assertIn('"$SYMPHONY_INSTALL_DIR/symphony"', installer)

    def test_homemade_issue_pickup_is_disabled(self) -> None:
        self.assertFalse(
            (ROOT / ".github/workflows/jovie-intake-controller.yml").exists()
        )
        self.assertFalse(
            (ROOT / "scripts/backlog-orchestrator/intake-event-controller.mjs").exists()
        )
        fleet = (ROOT / ".github/workflows/fleet-gate-refresh.yml").read_text()
        self.assertNotIn("run-backlog.sh gate-next", fleet)
        self.assertNotIn("symphony-concurrency-controller.py", fleet)
        self.assertNotIn("symphony-event-admission-heartbeat", fleet)

        backlog = (
            ROOT / "scripts/backlog-orchestrator/backlog-orchestrator.mjs"
        ).read_text()
        self.assertIn(
            "upstream openai/symphony owns Linear pickup and dispatch", backlog
        )
        disabled = subprocess.run(
            [
                "node",
                str(ROOT / "scripts/backlog-orchestrator/backlog-orchestrator.mjs"),
                "gate-next",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(disabled.returncode, 78)
        self.assertIn("upstream openai/symphony owns Linear pickup", disabled.stderr)

        webhook = (ROOT / "apps/web/app/api/webhooks/linear/route.ts").read_text()
        self.assertNotIn("linear-intake-changed", webhook)
        self.assertIn("Issue pickup is owned by upstream OpenAI Symphony", webhook)


if __name__ == "__main__":
    unittest.main()
