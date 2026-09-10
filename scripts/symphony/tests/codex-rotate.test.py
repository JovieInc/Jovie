#!/usr/bin/env python3

from __future__ import annotations

import fcntl
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[3]
LAUNCHER = ROOT / "scripts/symphony/codex-rotate"

# Fake codex speaking the app-server JSON-RPC transport from a config file.
# `app-server` argv that never receives an initialize request is the launcher's
# work child and follows the config's "work" spec instead.
RPC_CODEX_FAKE = '''#!PYTHON_EXE
import json
import os
import select
import sys

config = json.loads(open(os.environ["RPC_CONFIG"]).read())


def record(entry):
    log = config.get("rpcLog")
    if log:
        with open(log, "a") as stream:
            stream.write(json.dumps(entry) + "\\n")


def send(payload):
    sys.stdout.write(json.dumps(payload) + "\\n")
    sys.stdout.flush()


def respond(request):
    record({"method": request.get("method"), "params": request.get("params")})
    method = request.get("method")
    if method == "initialize":
        send({"id": request["id"], "result": {"userAgent": "fake-codex/1"}})
        return
    behavior = config.get("rpc", {}).get(method, {"mode": "error"})
    if method == "account/rateLimitResetCredit/consume" and behavior.get("applyPostStateFile"):
        with open(behavior["applyPostStateFile"]) as stream:
            post = stream.read()
        with open(config["stateFile"], "w") as stream:
            stream.write(post)
    if behavior.get("mode") == "drop":
        os._exit(1)
    if behavior.get("mode") == "error":
        send({"id": request["id"], "error": {"code": -32000, "message": behavior.get("message", "rpc failure")}})
        return
    if method == "account/rateLimits/read":
        with open(config["stateFile"]) as stream:
            snapshot = json.load(stream)
        send({"id": request["id"], "result": snapshot})
        return
    if method == "account/rateLimitResetCredit/consume":
        send({"id": request["id"], "result": behavior.get("result", {"outcome": "reset"})})
        return
    send({"id": request["id"], "error": {"code": -32601, "message": "unknown method"}})


def rpc_serve(first_line):
    pending = [first_line] if first_line is not None else []
    while True:
        if pending:
            line = pending.pop(0)
        else:
            line = sys.stdin.readline()
            if not line:
                return
        try:
            request = json.loads(line)
        except ValueError:
            continue
        if not isinstance(request, dict) or "id" not in request or "method" not in request:
            continue
        respond(request)


def work():
    spec = config.get("work", {})
    for line in spec.get("stdout", []):
        print(line, flush=True)
    if spec.get("stderr"):
        sys.stderr.write(spec["stderr"] + "\\n")
    sys.exit(spec.get("exit", 0))


if "app-server" in sys.argv:
    first_line = None
    if select.select([sys.stdin], [], [], 0.5)[0]:
        line = sys.stdin.readline()
        try:
            candidate = json.loads(line)
        except ValueError:
            candidate = None
        if isinstance(candidate, dict) and candidate.get("method") == "initialize" and "id" in candidate:
            first_line = line
    if first_line is not None:
        rpc_serve(first_line)
    else:
        work()
else:
    work()
'''


def rate_limit_state(primary_used, primary_reset, secondary_used, secondary_reset,
                     reached=None, credits=None, allowed=None):
    """Wire-shaped account/rateLimits/read result (app-server v2, camelCase)."""
    state = {
        "rateLimits": {
            "limitId": "codex",
            "primary": {"usedPercent": primary_used, "windowDurationMins": 300, "resetsAt": primary_reset},
            "secondary": {"usedPercent": secondary_used, "windowDurationMins": 10080, "resetsAt": secondary_reset},
            "rateLimitReachedType": reached,
        }
    }
    if allowed is not None:
        state["ordinaryUsageAllowed"] = allowed
    if credits is not None:
        state["rateLimitResetCredits"] = {
            "availableCount": sum(1 for credit in credits if credit["status"] == "available"),
            "credits": credits,
        }
    return state


def reset_credit(credit_id, expires_at, status="available", reset_type="codexRateLimits"):
    return {
        "id": credit_id,
        "resetType": reset_type,
        "status": status,
        "grantedAt": 1757000000,
        "expiresAt": expires_at,
        "title": None,
        "description": None,
    }


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


    def test_canonical_groups_preserve_private_identity_and_validate_paths(self):
        import contextlib
        import io
        from unittest import mock
        source = LAUNCHER.read_text().split("python3 - <<'PY'\n", 1)[1].split("\nPY", 1)[0]
        namespace = {"__name__": "account_order", "__file__": str(LAUNCHER) + ":account_order"}
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            state = root / "state.json"
            state.write_text('{}')
            output = io.StringIO()
            with mock.patch.dict(os.environ, ACCOUNTS_ROOT=str(root), STATE_FILE=str(state)), contextlib.redirect_stdout(output):
                exec(compile(source, str(LAUNCHER) + ":account_order", "exec"), namespace)
            group = namespace["account_groups"]
            for name, identity in (("alpha", "private-shared"), ("beta", "private-shared"), ("gamma", "private-other")):
                home = root / name
                home.mkdir()
                (home / "auth.json").write_text(json.dumps({"auth_mode": "chatgpt", "tokens": {"account_id": identity}}))
                (home / "config.toml").write_text('model = "test"')
            self.assertEqual(group(root), [["alpha", "beta"], ["gamma"]])
            (root / "beta/config.toml").write_text('model_provider = "openrouter"')
            self.assertEqual(group(root), [["alpha"], ["gamma"]])
            for tokens in (None, {}, {"account_id": ""}, {"account_id": True}):
                (root / "alpha/auth.json").write_text(json.dumps({"auth_mode": "chatgpt", "tokens": tokens}))
                with self.assertRaises(ValueError):
                    group(root)
            (root / "alpha/auth.json").write_bytes((root / "gamma/auth.json").read_bytes())
            alias = root / "alias"
            alias.symlink_to(root / "alpha", target_is_directory=True)
            with self.assertRaises(ValueError):
                group(root)
            alias.unlink()
            (root / "alpha").rename(root / "unsafe alias")
            with self.assertRaises(ValueError):
                group(root)
            self.assertNotIn("private-", output.getvalue())


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
            (account / "auth.json").write_text(json.dumps({"auth_mode": "chatgpt", "tokens": {"account_id": name}}))
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

    def duplicate_account(self):
        (self.accounts / "account-b/auth.json").write_bytes(
            (self.accounts / "account-a/auth.json").read_bytes()
        )

    def run_now(self):
        return subprocess.run(
            [str(LAUNCHER), "exec", "test"], capture_output=True,
            env=self.env(CODEX_ACCOUNT_WAIT_SECONDS=0, FAKE_CODEX_SLEEP=0), timeout=5,
        )

    def test_duplicate_identity_respects_existing_other_alias_lease(self):
        self.duplicate_account()
        self.hold_account_lock("account-b")
        before = (self.accounts / "state.json").read_bytes()
        result = self.run_now()
        self.assertEqual(result.returncode, 75)
        self.assertEqual(list(self.events.iterdir()), [])
        self.assertEqual((self.accounts / "state.json").read_bytes(), before)
        # A failed group acquisition must release the first alias too.
        self.hold_account_lock("account-a")

    def test_duplicate_identity_cannot_run_a_second_concurrent_job(self):
        self.duplicate_account()
        first = self.start(FAKE_CODEX_SLEEP=2)
        try:
            deadline = time.monotonic() + 3
            while not (self.events / "account-a.started").exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue((self.events / "account-a.started").exists())
            result = self.run_now()
            self.assertEqual(result.returncode, 75)
            self.assertFalse((self.events / "account-b.started").exists())
            self.assertEqual(first.wait(timeout=5), 0)
            # Normal release permits the next job, with the same account identity.
            self.assertEqual(self.run_now().returncode, 0)
        finally:
            if first.poll() is None:
                first.terminate()
                first.wait(timeout=5)

    def test_duplicate_identity_uses_latest_alias_cooldown(self):
        self.duplicate_account()
        until = int(time.time()) + 600
        state = self.accounts / "state.json"
        state.write_text(json.dumps({"active": "account-a", "cooldowns": {"account-b": until}}))
        before = state.read_bytes()
        result = self.run_now()
        self.assertEqual(result.returncode, 75)
        self.assertIn(f"retryAt={until}".encode(), result.stderr)
        self.assertEqual(list(self.events.iterdir()), [])
        self.assertEqual(state.read_bytes(), before)

    def test_missing_canonical_identity_never_launches(self):
        for value in (None, "", "  ", True, [], {}):
            with self.subTest(identity=value):
                for name in ("account-a", "account-b"):
                    (self.accounts / name / "auth.json").write_text(json.dumps(
                        {"auth_mode": "chatgpt", "tokens": {"account_id": value}}
                    ))
                before = (self.accounts / "state.json").read_bytes()
                result = self.run_now()
                self.assertEqual(result.returncode, 75)
                self.assertEqual(list(self.events.iterdir()), [])
                self.assertEqual((self.accounts / "state.json").read_bytes(), before)

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

    def test_limit_failure_without_rpc_ignores_error_text_retry_time(self):
        limited = self.root / "limited-codex"
        limited.write_text(
            "#!/usr/bin/env bash\n"
            "echo 'usage limit; try again at 2030-01-02T03:04:05Z' >&2\n"
            "exit 1\n"
        )
        limited.chmod(0o755)
        before = int(time.time())
        result = subprocess.run(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=self.env(
                CODEX_REAL_BIN=limited,
                CODEX_DEFAULT_COOLDOWN_SECONDS=60,
                CODEX_ROTATE_RPC_TIMEOUT=2,
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        state = json.loads((self.accounts / "state.json").read_text())
        cooldown = state["cooldowns"]["account-a"]
        # The "try again at" error text (2030-01-02T03:04:05Z = 1893553445)
        # must never steer the cooldown: without an RPC snapshot the account
        # parks on the bounded default instead.
        self.assertNotEqual(cooldown, 1893553445)
        self.assertGreaterEqual(cooldown, before + 60)
        self.assertLessEqual(cooldown, int(time.time()) + 60)
        self.assertEqual(state["last_error"]["account-a"]["reason"], "limit_or_auth")

    def test_app_server_stdout_limit_quarantines_zero_exit_account(self):
        limited = self.root / "limited-app-server"
        limited.write_text(
            "#!/usr/bin/env bash\n"
            "echo '{\"method\":\"error\",\"params\":{\"error\":{\"message\":\"usage limit; try again at 2030-01-02T03:04:05Z\",\"codexErrorInfo\":\"UsageLimitExceeded\"}}}'\n"
            "exit 0\n"
        )
        limited.chmod(0o755)
        before = int(time.time())
        result = subprocess.run(
            [str(LAUNCHER), "app-server"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env=self.env(
                CODEX_REAL_BIN=limited,
                CODEX_DEFAULT_COOLDOWN_SECONDS=60,
                CODEX_ROTATE_RPC_TIMEOUT=2,
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 75)
        self.assertIn('"method":"error"', result.stdout)
        state = json.loads((self.accounts / "state.json").read_text())
        cooldown = state["cooldowns"]["account-a"]
        # A bash fake cannot serve account/rateLimits/read, so the typed
        # limit parks on the bounded default rather than the 2030 error text.
        self.assertNotEqual(cooldown, 1893553445)
        self.assertGreaterEqual(cooldown, before + 60)
        self.assertLessEqual(cooldown, int(time.time()) + 60)
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


@unittest.skipUnless(shutil.which("flock"), "requires util-linux flock")
class CodexRotateRpcTests(unittest.TestCase):
    """Cooldown horizons come from account/rateLimits/read, never error text.

    The fake codex serves the app-server v2 read from a state file; the work
    child (non-app-server argv) always fails with a usage-limit stderr so
    every run takes the typed rate-limit path through the launcher.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.accounts = self.root / "accounts"
        self.accounts.mkdir()
        for name in ("account-a", "account-b"):
            account = self.accounts / name
            account.mkdir()
            (account / "auth.json").write_text(json.dumps(
                {"auth_mode": "chatgpt", "tokens": {"account_id": name}}
            ))
            (account / "config.toml").write_text('model = "test"\n')
        (self.accounts / "state.json").write_text(
            json.dumps({"active": "account-a", "cooldowns": {}, "last_error": {}})
        )
        self.rpc_log = self.root / "rpc.log"
        self.rpc_state = self.root / "rpc-state.json"
        self.rpc_config_path = self.root / "rpc-config.json"
        self.codex = self.root / "codex"
        self.codex.write_text(RPC_CODEX_FAKE.replace("PYTHON_EXE", sys.executable))
        self.codex.chmod(0o755)

    def tearDown(self):
        self.tmp.cleanup()

    def write_rpc(self, state, read=None, work=None):
        self.rpc_state.write_text(json.dumps(state))
        self.rpc_config_path.write_text(json.dumps({
            "stateFile": str(self.rpc_state),
            "rpcLog": str(self.rpc_log),
            "work": {"stderr": "usage limit; try again at 2099-01-02T03:04:05Z", "exit": 1}
            if work is None else work,
            "rpc": {"account/rateLimits/read": {"mode": "ok"} if read is None else read},
        }))

    def env(self, **overrides):
        env = os.environ.copy()
        env.update({
            "CODEX_ACCOUNTS_ROOT": str(self.accounts),
            "CODEX_REAL_BIN": str(self.codex),
            "CODEX_ACCOUNT_WAIT_SECONDS": "0",
            "CODEX_ROTATE_RPC_TIMEOUT": "5",
            "RPC_CONFIG": str(self.rpc_config_path),
        })
        env.update({key: str(value) for key, value in overrides.items()})
        return env

    def run_limited(self, **overrides):
        return subprocess.run(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=self.env(**overrides),
            check=False,
            timeout=30,
        )

    def state(self):
        return json.loads((self.accounts / "state.json").read_text())

    def test_cooldown_comes_from_rpc_snapshot_not_error_text(self):
        now = int(time.time())
        weekly_reset = now + 2 * 86400
        self.write_rpc(rate_limit_state(
            100, now + 1800, 100, weekly_reset,
            reached="rate_limit_reached", allowed=False,
        ))
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        # The error text advertises 2099-01-02; the RPC snapshot wins.
        text_epoch = int(datetime(2099, 1, 2, 3, 4, 5, tzinfo=timezone.utc).timestamp())
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        self.assertNotEqual(self.state()["cooldowns"]["account-a"], text_epoch)

    def test_rpc_read_failure_parks_on_bounded_default_cooldown(self):
        now = int(time.time())
        self.write_rpc(
            rate_limit_state(100, now + 1800, 100, now + 86400),
            read={"mode": "error"},
        )
        result = self.run_limited(CODEX_DEFAULT_COOLDOWN_SECONDS=60)
        self.assertEqual(result.returncode, 1)
        cooldown = self.state()["cooldowns"]["account-a"]
        self.assertGreaterEqual(cooldown, now + 60)
        self.assertLessEqual(cooldown, int(time.time()) + 60)

    def test_snapshot_contradicting_the_typed_event_parks_on_default(self):
        now = int(time.time())
        self.write_rpc(rate_limit_state(5, now + 1800, 10, now + 86400, allowed=True))
        result = self.run_limited(CODEX_DEFAULT_COOLDOWN_SECONDS=60)
        self.assertEqual(result.returncode, 1)
        cooldown = self.state()["cooldowns"]["account-a"]
        self.assertGreaterEqual(cooldown, now + 60)
        self.assertLessEqual(cooldown, int(time.time()) + 60)

    def test_implausible_reset_horizon_parks_on_default(self):
        now = int(time.time())
        self.write_rpc(rate_limit_state(
            100, now + 1800, 100, now + 90 * 86400,
            reached="rate_limit_reached", allowed=False,
        ))
        result = self.run_limited(CODEX_DEFAULT_COOLDOWN_SECONDS=60)
        self.assertEqual(result.returncode, 1)
        cooldown = self.state()["cooldowns"]["account-a"]
        self.assertGreaterEqual(cooldown, now + 60)
        self.assertLessEqual(cooldown, int(time.time()) + 60)

    def test_nullable_window_reset_never_crashes_the_read(self):
        now = int(time.time())
        # v2 windows may carry resetsAt=null; the exhausted weekly still binds.
        weekly_reset = now + 86400
        self.write_rpc(rate_limit_state(
            100, None, 100, weekly_reset,
            reached="rate_limit_reached", allowed=False,
        ))
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)


@unittest.skipUnless(shutil.which("flock"), "requires util-linux flock")
class CodexRotateBankedResetTests(unittest.TestCase):
    """Banked reset-credit redemption over the app-server JSON-RPC transport.

    The fake codex serves the account/rateLimits/read and
    account/rateLimitResetCredit/consume v2 methods from a config file; the
    work child (non-app-server argv) always fails with a usage-limit stderr so
    every run takes the typed rate-limit path through the launcher.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.accounts = self.root / "accounts"
        self.accounts.mkdir()
        for name in ("account-a", "account-b"):
            account = self.accounts / name
            account.mkdir()
            (account / "auth.json").write_text(json.dumps(
                {"auth_mode": "chatgpt", "tokens": {"account_id": name}}
            ))
            (account / "config.toml").write_text('model = "test"\n')
            (account / "lifecycle.json").write_text(json.dumps(
                {"paidAccessEndsAt": int(time.time()) + 30 * 86400, "renewalIntent": True}
            ))
        (self.accounts / "state.json").write_text(
            json.dumps({"active": "account-a", "cooldowns": {}, "last_error": {}})
        )
        self.receipts = self.root / "receipts"
        self.rpc_log = self.root / "rpc.log"
        self.rpc_state = self.root / "rpc-state.json"
        self.rpc_post = self.root / "rpc-post.json"
        self.rpc_config_path = self.root / "rpc-config.json"
        self.evidence = self.root / "concurrency.json"
        self.write_evidence()
        self.codex = self.root / "codex"
        self.codex.write_text(RPC_CODEX_FAKE.replace("PYTHON_EXE", sys.executable))
        self.codex.chmod(0o755)

    def tearDown(self):
        self.tmp.cleanup()

    def write_evidence(self, age_seconds=0, target=2):
        observed = datetime.fromtimestamp(
            time.time() - age_seconds, timezone.utc
        ).isoformat().replace("+00:00", "Z")
        self.evidence.write_text(json.dumps({
            "schema": "gem-concurrency-evidence/v1",
            "source": "execution-proven-useful-turns",
            "observedAt": observed,
            "target": target,
        }))

    def write_rpc(self, state, consume=None, read=None, work=None):
        self.rpc_state.write_text(json.dumps(state))
        self.rpc_config_path.write_text(json.dumps({
            "stateFile": str(self.rpc_state),
            "rpcLog": str(self.rpc_log),
            "work": {"stderr": "usage limit; try again at 2099-01-02T03:04:05Z", "exit": 1}
            if work is None else work,
            "rpc": {
                "account/rateLimits/read": {"mode": "ok"} if read is None else read,
                "account/rateLimitResetCredit/consume": {"mode": "ok"} if consume is None else consume,
            },
        }))

    def clear_cooldowns(self):
        # A later exhaustion event on the same weekly window only reaches
        # redemption after the probe (or a pre-mark_cooldown crash) frees the
        # account; simulate that instead of waiting out the cooldown.
        (self.accounts / "state.json").write_text(
            json.dumps({"active": "account-a", "cooldowns": {}, "last_error": {}})
        )

    def env(self, **overrides):
        env = os.environ.copy()
        env.update({
            "CODEX_ACCOUNTS_ROOT": str(self.accounts),
            "CODEX_REAL_BIN": str(self.codex),
            "CODEX_ACCOUNT_WAIT_SECONDS": "0",
            "CODEX_ROTATE_RPC_TIMEOUT": "5",
            "CODEX_CAPACITY_EVIDENCE": str(self.evidence),
            "CODEX_REDEMPTION_RECEIPTS_DIR": str(self.receipts),
            "RPC_CONFIG": str(self.rpc_config_path),
        })
        env.update({key: str(value) for key, value in overrides.items()})
        return env

    def run_limited(self, **overrides):
        return subprocess.run(
            [str(LAUNCHER), "exec", "test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=self.env(**overrides),
            check=False,
            timeout=30,
        )

    def rpc_calls(self, method):
        if not self.rpc_log.exists():
            return []
        return [
            json.loads(line)
            for line in self.rpc_log.read_text().splitlines()
            if json.loads(line).get("method") == method
        ]

    def receipts_now(self):
        if not self.receipts.exists():
            return []
        return [
            json.loads(path.read_text())
            for path in self.receipts.glob("codex-reset-credit-*.json")
        ]

    def state(self):
        return json.loads((self.accounts / "state.json").read_text())

    def exhausted_weekly(self, now, days=4, credits=None):
        return rate_limit_state(
            100, now + 1800, 100, now + days * 86400,
            reached="rate_limit_reached", allowed=False, credits=credits,
        )

    def recovered(self, now):
        return rate_limit_state(0, now + 1800, 0, now + 7 * 86400, allowed=True)

    def test_weekly_exhaustion_redeems_earliest_expiry_credit_and_clears_cooldown(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[
            reset_credit("credit-late", now + 10 * 86400),
            reset_credit("credit-early", now + 86400),
            reset_credit("credit-never", None),
            reset_credit("credit-spent", now + 3600, status="redeemed"),
            reset_credit("credit-foreign", now + 1800, reset_type="otherLimit"),
        ])
        self.rpc_post.write_text(json.dumps(self.recovered(now)))
        self.write_rpc(pre, consume={"mode": "ok", "applyPostStateFile": str(self.rpc_post)})
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        state = self.state()
        self.assertLessEqual(state["cooldowns"]["account-a"], int(time.time()))
        self.assertNotIn("account-a", state["last_error"])
        consumes = self.rpc_calls("account/rateLimitResetCredit/consume")
        self.assertEqual(len(consumes), 1)
        params = consumes[0]["params"]
        self.assertEqual(params["creditId"], "credit-early")
        receipts = self.receipts_now()
        self.assertEqual(len(receipts), 1)
        receipt = receipts[0]
        self.assertEqual(receipt["schema"], "codex-reset-credit-redemption/v1")
        self.assertEqual(receipt["decision"], "redeemed")
        self.assertEqual(receipt["reason"], "redeemed")
        self.assertEqual(receipt["consumeOutcome"], "reset")
        self.assertTrue(receipt["consumeAttempted"])
        self.assertTrue(receipt["readbackProven"])
        self.assertEqual(receipt["creditId"], "credit-early")
        self.assertEqual(receipt["naturalResetAt"], weekly_reset)
        self.assertEqual(receipt["idempotencyKey"], params["idempotencyKey"])
        self.assertEqual(receipt["evidence"]["target"], 2)
        self.assertIn("paidAccessEndsAt", receipt["lifecycle"])
        receipt_path = next(self.receipts.glob("codex-reset-credit-*.json"))
        self.assertEqual(receipt_path.stat().st_mode & 0o777, 0o600)

    def test_ambiguous_consume_reconciles_by_resending_with_the_same_key(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        # Run 1: the consume connection drops before any response; the effect
        # is unknown, so the account parks on the natural window.
        self.write_rpc(pre, consume={"mode": "drop"})
        first = self.run_limited()
        self.assertEqual(first.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        self.assertEqual(len(self.rpc_calls("account/rateLimitResetCredit/consume")), 1)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["decision"], "parked")
        self.assertEqual(receipt["reason"], "consume_ambiguous")
        self.assertTrue(receipt["consumeAttempted"])
        self.assertEqual(receipt["consumeSends"], 1)
        key = receipt["idempotencyKey"]
        # Run 2: a later event on the same window reuses the stable key — the
        # backend dedupes via alreadyRedeemed, so the resend cannot double-redeem.
        self.clear_cooldowns()
        self.rpc_post.write_text(json.dumps(self.recovered(now)))
        self.write_rpc(pre, consume={"mode": "ok", "applyPostStateFile": str(self.rpc_post)})
        second = self.run_limited()
        self.assertEqual(second.returncode, 1)
        consumes = self.rpc_calls("account/rateLimitResetCredit/consume")
        self.assertEqual(len(consumes), 2)
        self.assertEqual([call["params"]["idempotencyKey"] for call in consumes], [key, key])
        self.assertEqual([call["params"]["creditId"] for call in consumes], ["credit-early", "credit-early"])
        state = self.state()
        self.assertLessEqual(state["cooldowns"]["account-a"], int(time.time()))
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["decision"], "redeemed")
        self.assertEqual(receipt["consumeStatus"], "resent")
        self.assertEqual(receipt["consumeSends"], 2)
        self.assertTrue(receipt["readbackProven"])
        self.assertEqual(receipt["idempotencyKey"], key)
        self.assertEqual(receipt["priorConsume"]["consumeStatus"], "ambiguous")

    def test_resend_cap_parks_after_three_uncertain_consumes(self):
        import hashlib
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        key = hashlib.sha256(
            f"codex-reset-credit|account-a|{weekly_reset}".encode("utf-8")
        ).hexdigest()[:32]
        self.receipts.mkdir()
        (self.receipts / f"codex-reset-credit-{key}.json").write_text(json.dumps({
            "schema": "codex-reset-credit-redemption/v1",
            "account": "account-a",
            "idempotencyKey": key,
            "consumeAttempted": True,
            "consumeSends": 3,
            "consumeStatus": "ambiguous",
            "consumeOutcome": None,
            "recordedAt": "2026-09-10T00:00:00Z",
        }))
        self.write_rpc(pre)
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        self.assertEqual(self.rpc_calls("account/rateLimitResetCredit/consume"), [])
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["decision"], "parked")
        self.assertEqual(receipt["reason"], "resend_cap")
        self.assertEqual(receipt["consumeSends"], 3)

    def test_clean_consume_refusal_is_retried_with_the_same_key(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        self.write_rpc(pre, consume={"mode": "error"})
        first = self.run_limited()
        self.assertEqual(first.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["decision"], "parked")
        self.assertEqual(receipt["reason"], "consume_rejected")
        # A clean refusal consumed nothing, so the key may be retried.
        self.assertFalse(receipt["consumeAttempted"])
        key = receipt["idempotencyKey"]
        self.clear_cooldowns()
        self.rpc_post.write_text(json.dumps(self.recovered(now)))
        self.write_rpc(pre, consume={"mode": "ok", "applyPostStateFile": str(self.rpc_post)})
        second = self.run_limited()
        self.assertEqual(second.returncode, 1)
        consumes = self.rpc_calls("account/rateLimitResetCredit/consume")
        self.assertEqual(len(consumes), 2)
        self.assertEqual([call["params"]["idempotencyKey"] for call in consumes], [key, key])
        self.assertEqual(self.receipts_now()[0]["decision"], "redeemed")

    def test_consume_no_credit_outcome_parks_but_allows_retry(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        self.write_rpc(pre, consume={"mode": "ok", "result": {"outcome": "noCredit"}})
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["reason"], "consume_no_credit")
        self.assertEqual(receipt["consumeOutcome"], "noCredit")
        self.assertFalse(receipt["consumeAttempted"])

    def test_consume_nothing_to_reset_is_definitive_for_the_window(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        self.write_rpc(pre, consume={"mode": "ok", "result": {"outcome": "nothingToReset"}})
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["reason"], "consume_nothing_to_reset")
        self.assertTrue(receipt["consumeAttempted"])
        # A later event on the same window reconciles by readback only: the
        # snapshot never moved, so the account stays parked and no second
        # consume is sent.
        self.clear_cooldowns()
        second = self.run_limited()
        self.assertEqual(second.returncode, 1)
        self.assertEqual(len(self.rpc_calls("account/rateLimitResetCredit/consume")), 1)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["reason"], "consume_reconcile_unproven")
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)

    def test_already_redeemed_outcome_still_requires_readback_proof(self):
        now = int(time.time())
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        self.rpc_post.write_text(json.dumps(self.recovered(now)))
        self.write_rpc(pre, consume={
            "mode": "ok",
            "result": {"outcome": "alreadyRedeemed"},
            "applyPostStateFile": str(self.rpc_post),
        })
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["decision"], "redeemed")
        self.assertEqual(receipt["consumeOutcome"], "alreadyRedeemed")

    def test_unproven_readback_keeps_the_cooldown(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        # The consume reports success but the windows never move.
        self.write_rpc(pre, consume={"mode": "ok", "result": {"outcome": "reset"}})
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        receipt = self.receipts_now()[0]
        self.assertEqual(receipt["decision"], "parked")
        self.assertEqual(receipt["reason"], "readback_unproven")
        self.assertFalse(receipt["readbackProven"])

    def test_guardrail_inputs_fail_closed_without_a_consume(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        pre = self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)])
        for name, sabotage in (
            ("stale_evidence", lambda: self.write_evidence(age_seconds=3600)),
            ("future_evidence", lambda: self.write_evidence(age_seconds=-3600)),
            ("missing_evidence", lambda: self.evidence.unlink()),
            ("missing_lifecycle", lambda: (self.accounts / "account-a/lifecycle.json").unlink()),
            ("expired_paid_access", lambda: (self.accounts / "account-a/lifecycle.json").write_text(
                json.dumps({"paidAccessEndsAt": now - 60})
            )),
        ):
            with self.subTest(name=name):
                self.tearDown()
                self.setUp()
                self.write_rpc(pre)
                sabotage()
                result = self.run_limited()
                self.assertEqual(result.returncode, 1)
                self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
                self.assertEqual(self.rpc_calls("account/rateLimitResetCredit/consume"), [])
                self.assertEqual(self.receipts_now(), [])

    def test_primary_only_exhaustion_is_never_redeemed(self):
        now = int(time.time())
        primary_reset = now + 1800
        self.write_rpc(rate_limit_state(
            100, primary_reset, 20, now + 4 * 86400,
            reached="rate_limit_reached", allowed=False,
            credits=[reset_credit("credit-early", now + 86400)],
        ))
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], primary_reset)
        self.assertEqual(self.rpc_calls("account/rateLimitResetCredit/consume"), [])
        self.assertEqual(self.receipts_now(), [])

    def test_kill_switch_disables_redemption(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        self.write_rpc(self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)]))
        result = self.run_limited(CODEX_REDEEM_RESET_CREDITS=0)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        self.assertEqual(self.rpc_calls("account/rateLimitResetCredit/consume"), [])
        self.assertEqual(self.receipts_now(), [])

    def test_auth_failure_never_triggers_redemption(self):
        now = int(time.time())
        weekly_reset = now + 4 * 86400
        self.write_rpc(
            self.exhausted_weekly(now, credits=[reset_credit("credit-early", now + 86400)]),
            work={"stderr": "Error: token_invalidated", "exit": 1},
        )
        result = self.run_limited()
        self.assertEqual(result.returncode, 1)
        # Auth kinds never reach redemption; the cooldown still comes from the
        # authoritative RPC snapshot rather than any error text.
        self.assertEqual(self.state()["cooldowns"]["account-a"], weekly_reset)
        self.assertEqual(self.rpc_calls("account/rateLimitResetCredit/consume"), [])
        self.assertEqual(self.receipts_now(), [])


if __name__ == "__main__":
    unittest.main()
