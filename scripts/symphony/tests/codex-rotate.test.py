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
LAUNCHER = ROOT / "scripts/symphony/codex-rotate"


class CodexAccountEligibilityTests(unittest.TestCase):
    def test_authentication_and_effective_provider_filter(self):
        # Execute the production heredoc, so the gate traces the actual selector.
        source = LAUNCHER.read_text().split("python3 - <<'PY'\n", 1)[1].split("\nPY", 1)[0]
        namespace = {"__name__": "account_order", "__file__": str(LAUNCHER) + ":account_order"}
        import contextlib
        import io
        from unittest import mock
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            account = root / "candidate"
            account.mkdir()
            state = root / "state.json"
            state.write_text('{}')
            with mock.patch.dict(os.environ, ACCOUNTS_ROOT=str(root), STATE_FILE=str(state)), contextlib.redirect_stdout(io.StringIO()):
                exec(compile(source, str(LAUNCHER) + ":account_order", "exec"), namespace)
            eligible = namespace["codex_account"]
            for auth, config, expected in [
                ('{"auth_mode":"chatgpt"}', 'model = "test"', True),
                ('{"auth_mode":"chatgpt"}', 'model_provider = "openai"', True),
                ('{"auth_mode":"chatgpt"}', 'model_provider = "openrouter"', False),
                ('{"auth_mode":"apikey"}', '', False),
                ('{}', '', False),
                ('[]', '', False),
                ('broken', '', False),
                ('{"auth_mode":"chatgpt"}', 'invalid = [', False),
                ('{"auth_mode":"chatgpt"}', 'profile = "other"\n[profiles.other]\nmodel_provider = "openrouter"', False),
                ('{"auth_mode":"chatgpt"}', 'profile = "other"\n[profiles.other]\nmodel_provider = "openai"', True),
                ('{"auth_mode":"chatgpt"}', 'profile = "missing"', False),
                ('{"auth_mode":"chatgpt"}', 'profile = []', False),
                ('{"auth_mode":"chatgpt"}', 'profile = "other"\nprofiles = []', False),
            ]:
                with self.subTest(auth=auth, config=config):
                    (account / "auth.json").write_text(auth)
                    (account / "config.toml").write_text(config)
                    self.assertEqual(eligible(account), expected)
            (account / "config.toml").unlink()
            self.assertFalse(eligible(account))


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
            (account / "auth.json").write_text('{"auth_mode":"chatgpt"}\n')
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

    def test_active_openrouter_profile_is_never_launched(self):
        (self.accounts / "account-a/config.toml").write_text('model_provider = "openrouter"\n')
        result = self.start(FAKE_CODEX_SLEEP=0)
        self.assertEqual(result.wait(timeout=5), 0)
        self.assertFalse((self.events / "account-a.started").exists())
        self.assertTrue((self.events / "account-b.started").exists())
        self.assertFalse((self.accounts / "locks/account-a.lock").exists())

    def test_compatible_account_cooldown_order_is_preserved(self):
        cooldowns = {"account-a": int(time.time()) + 600}
        (self.accounts / "state.json").write_text(json.dumps({"active": "account-a", "cooldowns": cooldowns}))
        result = self.start(FAKE_CODEX_SLEEP=0)
        self.assertEqual(result.wait(timeout=5), 0)
        self.assertFalse((self.events / "account-a.started").exists())
        self.assertTrue((self.events / "account-b.started").exists())
        self.assertEqual(json.loads((self.accounts / "state.json").read_text())["cooldowns"], cooldowns)

    def test_all_cooling_accounts_return_typed_capacity_without_lock_or_launch(self):
        now = int(time.time())
        cooldowns = {"account-a": now + 900, "account-b": now + 300}
        state_path = self.accounts / "state.json"
        state_path.write_text(
            json.dumps(
                {
                    "active": "account-a",
                    "cooldowns": cooldowns,
                    "last_error": {},
                }
            )
        )
        before = state_path.read_bytes()

        result = subprocess.run(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self.env(CODEX_ACCOUNT_WAIT_SECONDS=0),
            check=False,
            timeout=5,
        )

        self.assertEqual(result.returncode, 75)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"CAPACITY_UNAVAILABLE", result.stderr)
        self.assertIn(b"reason=account_cooldown", result.stderr)
        self.assertIn(f"retryAt={cooldowns['account-b']}".encode(), result.stderr)
        wait_seconds = int(result.stderr.split(b"waitSeconds=", 1)[1].split()[0])
        self.assertGreaterEqual(wait_seconds, 295)
        self.assertLessEqual(wait_seconds, 300)
        self.assertEqual(list(self.events.iterdir()), [])
        self.assertFalse((self.accounts / "locks/account-a.lock").exists())
        self.assertFalse((self.accounts / "locks/account-b.lock").exists())
        self.assertEqual(state_path.read_bytes(), before)

    def test_malformed_account_state_fails_closed_without_lock_or_launch(self):
        state_path = self.accounts / "state.json"
        for malformed in (
            "not-json",
            json.dumps([]),
            json.dumps({"active": None, "cooldowns": []}),
            json.dumps(
                {
                    "active": None,
                    "cooldowns": {"account-a": "not-an-epoch"},
                }
            ),
        ):
            with self.subTest(malformed=malformed):
                state_path.write_text(malformed)
                before = state_path.read_bytes()
                shutil.rmtree(self.accounts / "locks", ignore_errors=True)
                for event in self.events.iterdir():
                    event.unlink()

                result = subprocess.run(
                    [str(LAUNCHER), "exec", "test"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=self.env(CODEX_ACCOUNT_WAIT_SECONDS=0),
                    check=False,
                    timeout=5,
                )

                self.assertEqual(result.returncode, 75)
                self.assertEqual(result.stdout, b"")
                self.assertIn(b"CAPACITY_UNAVAILABLE", result.stderr)
                self.assertIn(b"reason=account_state_invalid", result.stderr)
                self.assertEqual(list(self.events.iterdir()), [])
                self.assertFalse((self.accounts / "locks/account-a.lock").exists())
                self.assertFalse((self.accounts / "locks/account-b.lock").exists())
                self.assertEqual(state_path.read_bytes(), before)

    def test_expired_cooldowns_recover_without_state_mutation(self):
        now = int(time.time())
        state_path = self.accounts / "state.json"
        state_path.write_text(
            json.dumps(
                {
                    "active": "account-b",
                    "cooldowns": {
                        "account-a": now - 2,
                        "account-b": now - 1,
                    },
                    "last_error": {},
                }
            )
        )
        result = self.start(FAKE_CODEX_SLEEP=0)

        self.assertEqual(result.wait(timeout=5), 0)
        self.assertFalse((self.events / "account-a.started").exists())
        self.assertTrue((self.events / "account-b.started").exists())
        state = json.loads(state_path.read_text())
        self.assertEqual(state["active"], "account-b")
        self.assertEqual(
            state["cooldowns"],
            {"account-a": now - 2, "account-b": now - 1},
        )

    def test_no_codex_accounts_does_not_launch_or_change_state(self):
        for name in ("account-a", "account-b"):
            (self.accounts / name / "auth.json").write_text('{"auth_mode":"apikey"}\n')
        before = (self.accounts / "state.json").read_bytes()
        result = self.start(CODEX_ACCOUNT_WAIT_SECONDS=0)
        self.assertEqual(result.wait(timeout=5), 75)
        self.assertEqual(list(self.events.iterdir()), [])
        self.assertEqual((self.accounts / "state.json").read_bytes(), before)

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
            "echo '{\"method\":\"error\",\"params\":{\"error\":{\"message\":\"usage limit; try again at 2030-01-02T03:04:05Z\",\"codexErrorInfo\":\"UsageLimitExceeded\"}}}'\n"
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
        self.assertIn('"method":"error"', result.stdout)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], 1893553445)
        self.assertEqual(state["last_error"]["account-a"]["reason"], "limit_or_auth")

    def test_app_server_non_error_payload_with_quota_like_content_does_not_cool(self):
        normal = self.root / "normal-app-server"
        normal.write_text(
            "#!/usr/bin/env bash\n"
            "cat <<'EOF'\n"
            '{"method":"thread/tokenUsage/updated","params":{"threadId":"thr-429-rate-limit","tokenUsage":{"total":{"inputTokens":4290}}}}\n'
            '{"id":429,"method":"mcpServer/elicitation/request","params":{"threadId":"thr-ok","turnId":"turn-ok","serverName":"ovie","mode":"form","message":"Describe a rate limit or usage limit","requestedSchema":{"type":"object","properties":{"note":{"type":"string"}}}}}\n'
            '{"method":"item/completed","params":{"item":{"type":"mcpToolCall","id":"call-429-usage-limit","server":"ovie","tool":"probe","status":"completed","result":{"content":[{"type":"text","text":"429 rate limit usage limit token_invalidated"}]}}}}\n'
            "EOF\n"
            "echo 'debug payload mentions rate limit and 429' >&2\n"
            "exit 0\n"
        )
        normal.chmod(0o755)

        result = subprocess.run(
            [str(LAUNCHER), "app-server"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=self.env(CODEX_REAL_BIN=normal),
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, "debug payload mentions rate limit and 429\n")
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["active"], "account-a")
        self.assertEqual(state["cooldowns"], {})
        self.assertEqual(state["last_error"], {})

    def test_failed_app_server_auth_event_uses_bounded_default_cooldown(self):
        unauthorized = self.root / "unauthorized-app-server"
        unauthorized.write_text(
            "#!/usr/bin/env bash\n"
            "echo '{\"method\":\"turn/completed\",\"params\":{\"turn\":{\"status\":\"failed\",\"error\":{\"message\":\"authentication failed\",\"codexErrorInfo\":\"Unauthorized\"}}}}'\n"
            "exit 0\n"
        )
        unauthorized.chmod(0o755)
        before = int(time.time())

        result = subprocess.run(
            [str(LAUNCHER), "app-server"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=self.env(
                CODEX_REAL_BIN=unauthorized,
                CODEX_DEFAULT_COOLDOWN_SECONDS=60,
            ),
            check=False,
        )

        self.assertEqual(result.returncode, 75)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertGreaterEqual(state["cooldowns"]["account-a"], before + 60)
        self.assertLessEqual(state["cooldowns"]["account-a"], int(time.time()) + 60)
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
