#!/usr/bin/env python3

from __future__ import annotations

import os
import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / "scripts/hermes/symphony/WORKFLOW.md"
WORKFLOW = WORKFLOW_PATH.read_text(encoding="utf-8")
UNIT = (ROOT / "scripts/hermes/systemd/symphony-burrito.service").read_text(encoding="utf-8")
UPDATER = (ROOT / "scripts/hermes/update-symphony-burrito.sh").read_text(encoding="utf-8")
LIVE_SLUG = "symphony-ui-pilot-96d6b9c5b2d5"
TOKEN_RE = re.compile(r"lin_(?:api_|oauth_)?[A-Za-z0-9]{12,}|api_key:\s*(?!\$LINEAR_API_KEY\b)\S+")


class OfficialBurritoContractTests(unittest.TestCase):
    def test_live_queue_and_no_root_workflow(self):
        """Burrito runtime is ~/.config/symphony/WORKFLOW.md; product clone is not a Symphony config."""
        self.assertFalse((ROOT / "WORKFLOW.md").exists())
        self.assertTrue(WORKFLOW_PATH.is_file())
        self.assertIn("%h/.config/symphony/WORKFLOW.md", UNIT)
        self.assertIn(f'project_slug: "{LIVE_SLUG}"', WORKFLOW)
        self.assertNotIn("jovie-ba6736cbfbb9", WORKFLOW)
        self.assertIn("root: ~/symphony-elixir-workspaces", WORKFLOW)
        self.assertIn("max_concurrent_agents: 3", WORKFLOW)
        self.assertIn("api_key: $LINEAR_API_KEY", WORKFLOW)
        self.assertIn("codex app-server", WORKFLOW)
        hook = WORKFLOW.split("after_create:", 1)[1].split("agent:", 1)[0]
        self.assertIn("git clone --depth 1 https://github.com/JovieInc/Jovie.git .", hook)
        self.assertTrue("git@" not in hook and "mix " not in hook)
        self.assertIn("git + gh CLI only", WORKFLOW)
        self.assertIn("76869538009648d5b282a4bb21c3d157", WORKFLOW)
        self.assertIn("enabled=false", WORKFLOW)
        self.assertIn("create_branch", WORKFLOW)
        self.assertNotIn("team:JOV", WORKFLOW)
        self.assertIsNone(TOKEN_RE.search(WORKFLOW))
        self.assertIn("--port 4043", UNIT)
        self.assertIn("Restart=always", UNIT)
        self.assertIn("CODEX_HOME=%h/.codex-accounts/meetjovie", UNIT)
        self.assertIn("StandardOutput=journal", UNIT)
        self.assertNotIn("tty1", UNIT)

    def test_updater_config_copy_is_red_unless_live_match(self):
        self.assertIn("linux_x86_64", UPDATER)
        self.assertIn("sha256", UPDATER)
        self.assertIn("scripts/hermes/symphony/WORKFLOW.md", UPDATER)
        self.assertIn("CONFIG_COPY_RED", UPDATER)
        self.assertLess(UPDATER.index(LIVE_SLUG), UPDATER.index('install -m 0644 "$WORKFLOW_SRC" "$WORKFLOW_DST"'))
        tty1 = (ROOT / "scripts/hermes/gem-checkin-tty1.sh").read_text()
        self.assertIn("List HUD owns tty1", tty1)
        self.assertIn("gem-checkin-hud.py", tty1)
        self.assertNotIn("until a pickup has a PR", tty1)
        updater = ROOT / "scripts/hermes/update-symphony-burrito.sh"
        with tempfile.TemporaryDirectory() as tmp:
            dest = pathlib.Path(tmp) / "home/.config/symphony"
            dest.mkdir(parents=True)
            existing = dest / "WORKFLOW.md"
            existing.write_text("LIVE gem WORKFLOW — do not overwrite\n")
            wrong = pathlib.Path(tmp) / "wrong.md"
            wrong.write_text('project_slug: "jovie-ba6736cbfbb9"\n')
            env = {**os.environ, "SYMPHONY_BURRITO_HOME": str(pathlib.Path(tmp) / "home"), "SYMPHONY_WORKFLOW_SRC": str(wrong)}
            red = subprocess.run(["bash", str(updater), "--skip-binary", "--no-restart"], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(red.returncode, 0, red.stderr)
            self.assertIn("CONFIG_COPY_RED", red.stdout)
            self.assertEqual(existing.read_text(), "LIVE gem WORKFLOW — do not overwrite\n")
            env.pop("SYMPHONY_WORKFLOW_SRC")
            good = subprocess.run(["bash", str(updater), "--skip-binary", "--no-restart"], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertIn(LIVE_SLUG, existing.read_text())


if __name__ == "__main__":
    unittest.main()
