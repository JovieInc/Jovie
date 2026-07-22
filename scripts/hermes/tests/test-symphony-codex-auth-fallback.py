#!/usr/bin/env python3

import json
import os
import pathlib
import stat
import subprocess
import tempfile
import textwrap
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
CONTROLLER = ROOT / "scripts/hermes/symphony-codex-auth-fallback.py"


class FallbackTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tempdir.name)
        self.state = self.root / "codex-state.json"
        self.state.write_text(json.dumps({"cooldowns": {"jovie": 1}}))
        self.bin = self.root / "bin"
        self.bin.mkdir()

    def tearDown(self):
        self.tempdir.cleanup()

    def write_command(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\nset -eu\n" + textwrap.dedent(body))
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        return path

    def env(self, **extra):
        env = os.environ.copy()
        env.update(
            {
                "GEM_CODEX_ACCOUNTS_STATE": str(self.state),
                "GEM_CODEX_CANARY_TIMEOUT_SECONDS": "0.5",
            }
        )
        env.update({key: str(value) for key, value in extra.items()})
        return env

    def run_controller(self, *args, **env):
        return subprocess.run(
            ["python3", str(CONTROLLER), *args],
            capture_output=True,
            text=True,
            env=self.env(**env),
            check=False,
        )

    def test_stale_expired_cooldown_does_not_mask_failed_live_canary(self):
        canary = self.write_command(
            "codex-rotate",
            """
            echo 'token_invalidated refresh_token_invalidated' >&2
            exit 1
            """,
        )
        self.state.write_text(
            json.dumps(
                {
                    "cooldowns": {"jovie": 1},
                    "last_error": "limit_or_auth",
                }
            )
        )

        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)

        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        self.assertNotIn("token_invalidated", result.stdout + result.stderr)

    def test_successful_live_canary_reports_usable_even_with_stale_cooldown(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")

        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)

        self.assertEqual((result.stdout, result.returncode), ("no\n", 1))

    def test_unknown_state_fails_closed(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        self.state.write_text("not-json")

        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)

        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_missing_executable_fails_closed(self):
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=self.root / "missing")

        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_partial_ready_text_is_not_exact_ready_evidence(self):
        canary = self.write_command("codex-rotate", "echo 'GEM_MODEL_READY extra'")

        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)

        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_timeout_fails_closed(self):
        canary = self.write_command("codex-rotate", "sleep 1\necho GEM_MODEL_READY")

        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)

        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_usable_transition_starts_symphony_before_idling_grok(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        systemctl = self.write_command(
            "systemctl",
            """
            printf 'systemctl %s\\n' "$*" >> "$GEM_EVENTS"
            """,
        )
        idle = self.write_command(
            "idle-grok",
            "printf 'idle-grok\\n' >> \"$GEM_EVENTS\"",
        )
        events = self.root / "events.log"

        result = self.run_controller(
            "reconcile",
            GEM_CODEX_ROTATE_BIN=canary,
            GEM_SYSTEMCTL=systemctl,
            GEM_GROK_IDLE_COMMAND=idle,
            GEM_EVENTS=events,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            events.read_text().splitlines(),
            [
                "systemctl start symphony-ui-pilot.service",
                "systemctl is-active --quiet symphony-ui-pilot.service",
                "idle-grok",
            ],
        )

    def test_exhausted_transition_stops_symphony_then_launches_bounded_grok(self):
        canary = self.write_command("codex-rotate", "exit 1")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"",
        )
        grok = self.write_command(
            "grok-candidate",
            "printf 'grok-candidate %s\\n' \"$1\" >> \"$GEM_EVENTS\"",
        )
        events = self.root / "events.log"

        result = self.run_controller(
            "reconcile",
            GEM_CODEX_ROTATE_BIN=canary,
            GEM_SYSTEMCTL=systemctl,
            GEM_GROK_CANDIDATES=f"{grok} one\n{grok} two",
            GEM_EVENTS=events,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            events.read_text().splitlines(),
            [
                "systemctl stop symphony-ui-pilot.service",
                "grok-candidate one",
                "grok-candidate two",
            ],
        )


if __name__ == "__main__":
    unittest.main()
