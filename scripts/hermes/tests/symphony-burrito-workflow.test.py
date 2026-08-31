#!/usr/bin/env python3

from __future__ import annotations

import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW = (ROOT / "WORKFLOW.md").read_text(encoding="utf-8")
UNIT = (ROOT / "scripts/hermes/systemd/symphony-burrito.service").read_text(encoding="utf-8")
UPDATER = (ROOT / "scripts/hermes/update-symphony-burrito.sh").read_text(encoding="utf-8")

TOKEN_RE = re.compile(
    r"lin_(?:api_|oauth_)?[A-Za-z0-9]{12,}|api_key:\s*(?!\$LINEAR_API_KEY\b)\S+"
)


class OfficialBurritoContractTests(unittest.TestCase):
    def test_workflow_uses_linear_env_and_real_project_slug(self):
        self.assertIn("kind: linear", WORKFLOW)
        self.assertIn('project_slug: "jovie-ba6736cbfbb9"', WORKFLOW)
        self.assertIn("api_key: $LINEAR_API_KEY", WORKFLOW)
        self.assertIn("https://github.com/JovieInc/Jovie.git", WORKFLOW)
        self.assertIn("codex app-server", WORKFLOW)
        self.assertIn("port: 4043", WORKFLOW)
        hook = WORKFLOW.split("after_create:", 1)[1].split("agent:", 1)[0]
        self.assertIn("git clone --depth 1 https://github.com/JovieInc/Jovie.git .", hook)
        self.assertNotIn("git@", hook)
        self.assertNotIn("mix ", WORKFLOW)
        self.assertIn("openai/symphony", WORKFLOW)
        self.assertIn(".codex/skills/commit", WORKFLOW)
        self.assertIn("gbrain search", WORKFLOW)
        self.assertIn("max_concurrent_agents: 1", WORKFLOW)
        self.assertNotIn("team:JOV", WORKFLOW)
        self.assertIsNone(TOKEN_RE.search(WORKFLOW), "WORKFLOW must not embed a Linear token")

    def test_unit_binds_4043_and_restarts(self):
        self.assertIn("--port 4043", UNIT)
        self.assertIn("Restart=always", UNIT)
        self.assertIn(".hermes/bin", UNIT)
        self.assertIn("CODEX_HOME=%h/.codex-accounts/meetjovie", UNIT)

    def test_updater_verifies_linux_x86_64_burrito_then_restarts(self):
        self.assertIn("linux_x86_64", UPDATER)
        self.assertIn("sha256", UPDATER)
        self.assertIn("openai/symphony", UPDATER)
        self.assertIn("install -m 0755", UPDATER)
        self.assertIn("systemctl --user restart symphony-burrito.service", UPDATER)
        self.assertIn("symphony-burrito-update.timer", UPDATER)
        self.assertIn("WORKFLOW.md", UPDATER)
        self.assertTrue((ROOT / "scripts/hermes/gem-checkin-tty1.sh").is_file())
        self.assertNotIn("GEM OPERATIONS", (ROOT / "scripts/hermes/gem-checkin-tty1.sh").read_text())
        self.assertNotIn("FLEET POLICY", (ROOT / "scripts/hermes/gem-checkin-tty1.sh").read_text())


if __name__ == "__main__":
    unittest.main()
