#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
LAUNCHER = ROOT / "scripts/hermes/codex-rotate"


@unittest.skipUnless(shutil.which("flock"), "requires util-linux flock")
class CodexRotateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.accounts = self.root / "accounts"
        self.accounts.mkdir()
        for name in ("account-a", "account-b"):
            account = self.accounts / name
            account.mkdir()
            (account / "auth.json").write_text("{}\n")
            (account / "config.toml").write_text('model = "test"\n')
        (self.accounts / "state.json").write_text(
            json.dumps({"active": "account-a", "cooldowns": {}, "last_error": {}})
        )
        self.events = self.root / "events"
        self.events.mkdir()
        self.codex = self.root / "codex"
        self.codex.write_text(
            "#!/usr/bin/env bash\n"
            "set -eu\n"
            "touch \"$EVENTS_DIR/$(basename \"$CODEX_HOME\").started\"\n"
            "sleep \"${FAKE_CODEX_SLEEP:-1}\"\n"
        )
        self.codex.chmod(0o755)

    def tearDown(self):
        self.tmp.cleanup()

    def env(self, **overrides):
        env = os.environ.copy()
        env.update(
            {
                "CODEX_ACCOUNTS_ROOT": str(self.accounts),
                "CODEX_REAL_BIN": str(self.codex),
                "CODEX_ACCOUNT_WAIT_SECONDS": "5",
                "EVENTS_DIR": str(self.events),
                "FAKE_CODEX_SLEEP": "1",
            }
        )
        env.update({key: str(value) for key, value in overrides.items()})
        return env

    def start(self, **env):
        return subprocess.Popen(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=self.env(**env),
        )

    def test_concurrent_launches_lease_distinct_accounts(self):
        first = self.start()
        deadline = time.time() + 3
        while not (self.events / "account-a.started").exists() and time.time() < deadline:
            time.sleep(0.02)
        second = self.start()
        self.assertEqual(first.wait(timeout=5), 0)
        self.assertEqual(second.wait(timeout=5), 0)
        self.assertTrue((self.events / "account-a.started").exists())
        self.assertTrue((self.events / "account-b.started").exists())

    def test_excess_launch_waits_for_a_released_slot(self):
        first = self.start(FAKE_CODEX_SLEEP=2)
        second = self.start(FAKE_CODEX_SLEEP=2)
        time.sleep(0.3)
        third = self.start(FAKE_CODEX_SLEEP=0)
        self.assertIsNone(third.poll())
        self.assertEqual(first.wait(timeout=5), 0)
        self.assertEqual(second.wait(timeout=5), 0)
        self.assertEqual(third.wait(timeout=5), 0)

    def test_limit_failure_records_the_provider_retry_time(self):
        limited = self.root / "limited-codex"
        limited.write_text(
            "#!/usr/bin/env bash\n"
            "echo 'usage limit; try again at 2030-01-02T03:04:05Z' >&2\n"
            "exit 1\n"
        )
        limited.chmod(0o755)
        result = subprocess.run(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=self.env(CODEX_REAL_BIN=limited),
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], 1893553445)
        self.assertEqual(state["last_error"]["account-a"]["reason"], "limit_or_auth")

    def test_app_server_stdout_limit_quarantines_zero_exit_account(self):
        limited = self.root / "limited-app-server"
        limited.write_text(
            "#!/usr/bin/env bash\n"
            "echo '{\"type\":\"error\",\"message\":\"usage limit; try again at 2030-01-02T03:04:05Z\"}'\n"
            "exit 0\n"
        )
        limited.chmod(0o755)
        result = subprocess.run(
            [str(LAUNCHER), "app-server"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env=self.env(CODEX_REAL_BIN=limited),
            check=False,
        )
        self.assertEqual(result.returncode, 75)
        self.assertIn('"type":"error"', result.stdout)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], 1893553445)
        self.assertEqual(state["last_error"]["account-a"]["reason"], "limit_or_auth")


if __name__ == "__main__":
    unittest.main()
