#!/usr/bin/env python3

from __future__ import annotations

import fcntl
import json
import os
import pathlib
import shutil
import signal
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

    def start_app_server(self, **env):
        return subprocess.Popen(
            [str(LAUNCHER), "--config", "model=test", "app-server"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self.env(**env),
        )

    def hold_account_lock(self, name="account-a"):
        lock_path = self.accounts / "locks" / f"{name}.lock"
        lock_path.parent.mkdir(exist_ok=True)
        descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.addCleanup(os.close, descriptor)
        return descriptor

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

    # JOV-5031: fail-closed startup. A bounded account wait must end in a
    # typed capacity exit, never in an orphan launcher behind a dead reader.

    def test_four_starters_one_account_bounded_capacity_failures(self):
        shutil.rmtree(self.accounts / "account-b")
        holder = self.start(FAKE_CODEX_SLEEP=3)
        deadline = time.time() + 3
        while not (self.events / "account-a.started").exists() and time.time() < deadline:
            time.sleep(0.02)
        self.assertTrue((self.events / "account-a.started").exists())

        waiters = [
            self.start_app_server(CODEX_ACCOUNT_WAIT_SECONDS=2) for _ in range(3)
        ]
        for waiter in waiters:
            started = time.time()
            _stdout, stderr = waiter.communicate(timeout=15)
            elapsed = time.time() - started
            self.assertEqual(waiter.returncode, 75)
            # The bounded wait must end the attempt far below the historical
            # 900s account wait and leave no process behind.
            self.assertLess(elapsed, 10)
            self.assertIn(b"CAPACITY_UNAVAILABLE", stderr)
            self.assertIn(b"account_busy", stderr)
        self.assertEqual(holder.wait(timeout=10), 0)
        # Only the account holder ever launched codex; waiters exited before
        # acquiring anything.
        self.assertFalse((self.events / "account-b.started").exists())

    def test_app_server_wait_emits_heartbeats_then_typed_timeout(self):
        self.hold_account_lock("account-a")
        self.hold_account_lock("account-b")
        started = time.time()
        waiter = self.start_app_server(
            CODEX_ACCOUNT_WAIT_SECONDS=5, CODEX_ROTATE_HEARTBEAT_SECONDS=1
        )
        stdout, stderr = waiter.communicate(timeout=20)
        elapsed = time.time() - started
        self.assertEqual(waiter.returncode, 75)
        self.assertGreaterEqual(elapsed, 4)
        self.assertLess(elapsed, 12)
        heartbeats = [line for line in stdout.splitlines() if line.strip()]
        # While the reader lives, keepalives hold the initialization window
        # open; each is a JSON-RPC notification without an id.
        self.assertGreaterEqual(len(heartbeats), 3)
        for line in heartbeats:
            payload = json.loads(line)
            self.assertEqual(payload["method"], "codex-rotate/account-wait")
            self.assertNotIn("id", payload)
        self.assertIn(b"CAPACITY_UNAVAILABLE", stderr)

    def test_exec_mode_wait_stays_silent_and_fails_typed(self):
        self.hold_account_lock("account-a")
        self.hold_account_lock("account-b")
        result = subprocess.run(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self.env(CODEX_ACCOUNT_WAIT_SECONDS=2),
            check=False,
            timeout=15,
        )
        self.assertEqual(result.returncode, 75)
        # CLI stdout is never polluted with keepalive lines.
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"CAPACITY_UNAVAILABLE", result.stderr)

    def test_lock_releases_when_holder_dies_after_waiter_timeout(self):
        shutil.rmtree(self.accounts / "account-b")
        holder = subprocess.Popen(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=self.env(FAKE_CODEX_SLEEP=30),
            start_new_session=True,
        )
        deadline = time.time() + 3
        while not (self.events / "account-a.started").exists() and time.time() < deadline:
            time.sleep(0.02)
        waiter = self.start_app_server(CODEX_ACCOUNT_WAIT_SECONDS=2)
        _stdout, stderr = waiter.communicate(timeout=15)
        self.assertEqual(waiter.returncode, 75)
        self.assertIn(b"CAPACITY_UNAVAILABLE", stderr)

        # The lock fd is inherited by the launched codex child, so the account
        # releases only when the whole launcher tree dies.
        os.killpg(holder.pid, signal.SIGKILL)
        holder.wait(timeout=5)
        successor = self.start(FAKE_CODEX_SLEEP=0)
        self.assertEqual(successor.wait(timeout=10), 0)


if __name__ == "__main__":
    unittest.main()
