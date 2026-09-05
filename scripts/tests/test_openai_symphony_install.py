#!/usr/bin/env python3
"""Structural coverage for the upstream OpenAI Symphony cutover."""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class OpenAISymphonyInstallTests(unittest.TestCase):
    def test_official_workflow_and_elixir_installer(self) -> None:
        self.assertFalse((ROOT / "WORKFLOW.md").exists())
        workflow = (ROOT / "scripts/symphony/WORKFLOW.md").read_text()
        self.assertIn('team_key: "JOV"', workflow)
        self.assertIn("api_key: $LINEAR_API_KEY", workflow)
        self.assertNotIn("project_slug", workflow)
        self.assertNotIn("required_labels:", workflow)
        self.assertIn("excluded_labels:", workflow)
        self.assertIn("    - no-symphony", workflow)
        self.assertNotIn("    - needs-human", workflow)
        self.assertIn(
            "git clone --depth 1 https://github.com/JovieInc/Jovie.git .", workflow
        )
        self.assertRegex(
            workflow,
            re.compile(r"^\s+command: \./scripts/symphony/symphony-codex-router app-server$", re.M),
        )
        self.assertIn("symphony-codex-router", workflow)
        self.assertIn("interval_ms: 30000", workflow)
        self.assertIn("max_concurrent_agents: 8", workflow)
        self.assertIn("port: 4041", workflow)
        self.assertIn("- Rework", workflow)
        self.assertIn("- Merging", workflow)

        installer = (ROOT / "scripts/install-openai-symphony.sh").read_text()
        self.assertIn('SYMPHONY_VERSION="v0.0.2-jovie.2"', installer)
        self.assertIn("github.com/JovieInc/symphony/releases/download", installer)
        self.assertIn("macos_arm64", installer)
        self.assertIn("shasum -a 256 -c", installer)
        self.assertIn('"$SYMPHONY_INSTALL_DIR/symphony"', installer)
        updater = (ROOT / "scripts/symphony/update-symphony-burrito.sh").read_text()
        self.assertIn('SYMPHONY_VERSION="${SYMPHONY_VERSION:-v0.0.2-jovie.2}"', updater)
        self.assertIn("github.com/JovieInc/symphony/releases/download", updater)
        self.assertIn("symphony-elixir.service", updater)
        self.assertIn('SUM_NAME="${BIN_NAME}.sha256"', updater)

    def test_workflow_runtime_references_are_canonical_and_executable(self) -> None:
        workflow = (ROOT / "scripts/symphony/WORKFLOW.md").read_text()
        references = set(
            re.findall(
                r"(?:\./)?(scripts/symphony/symphony-[A-Za-z0-9._-]+)",
                workflow,
            )
        )
        self.assertEqual(
            references,
            {
                "scripts/symphony/symphony-codex-router",
                "scripts/symphony/symphony-nvme-package-cache.sh",
            },
        )
        self.assertNotIn("scripts/hermes/symphony-", workflow)
        for reference in references:
            target = ROOT / reference
            self.assertTrue(target.is_file(), reference)
            self.assertTrue(target.stat().st_mode & 0o111, reference)

    def test_activation_uses_one_staged_promotion(self) -> None:
        activation = (
            ROOT / ".github/workflows/gem-delivery-controller-activation.yml"
        ).read_text()
        activate = "bash scripts/symphony/update-symphony-burrito.sh --skip-binary"
        self.assertEqual(activation.count(activate), 1)
        self.assertNotIn("--skip-binary --no-restart", activation)

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
