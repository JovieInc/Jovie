#!/usr/bin/env python3

from __future__ import annotations

import json
import fcntl
import os
import pathlib
import subprocess
import tempfile
import time
import unittest
import sys


ROOT = pathlib.Path(__file__).resolve().parents[3]
PROBE = ROOT / "scripts/symphony/codex-account-probe.sh"


class CodexAccountProbeTests(unittest.TestCase):
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
        self.codex = self.root / "codex"
        self.codex.write_text("#!/usr/bin/env bash\nprintf '%s\\n' \"${PROBE_RESPONSE:-SYMPHONY_ACCOUNT_READY}\"\nexit \"${PROBE_EXIT:-0}\"\n")
        self.codex.chmod(0o755)

    def tearDown(self):
        self.tmp.cleanup()

    def write_state(self):
        future = int(time.time()) + 3600
        (self.accounts / "state.json").write_text(
            json.dumps({"active": None, "cooldowns": {"account-a": future, "account-b": future}, "last_error": {}})
        )
        return future

    def run_probe(self, **extra):
        env = os.environ.copy()
        env.update({"CODEX_ACCOUNTS_ROOT": str(self.accounts), "CODEX_REAL_BIN": str(self.codex)})
        env.update(extra)
        return subprocess.run([str(PROBE)], env=env, capture_output=True, text=True, check=False, timeout=20)

    def test_successful_probe_recovers_one_cooldown_with_typed_receipt(self):
        original = self.write_state()
        result = self.run_probe(PROBE_RESPONSE="SYMPHONY_ACCOUNT_READY")
        self.assertEqual(result.returncode, 0)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertLessEqual(state["cooldowns"]["account-a"], int(time.time()))
        self.assertNotEqual(state["cooldowns"]["account-a"], original)
        self.assertEqual(state["cooldowns"]["account-b"], original)
        self.assertEqual(
            state["readiness"]["account-a"]["source"],
            "authenticated_completion_probe/v1",
        )
        self.assertGreater(
            state["readiness"]["account-a"]["expiresAt"], int(time.time())
        )

    def test_config_only_provider_directory_does_not_poison_account_inventory(self):
        provider = self.accounts / "oss-local"
        provider.mkdir()
        (provider / "config.toml").write_text('model_provider = "oss-local"\n')
        self.write_state()

        result = self.run_probe(PROBE_RESPONSE="SYMPHONY_ACCOUNT_READY")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "RECOVERED account-a")

    def test_credentials_without_account_config_still_fail_closed(self):
        malformed = self.accounts / "partial-account"
        malformed.mkdir()
        (malformed / "auth.json").write_text('{"auth_mode":"chatgpt"}\n')
        original = self.write_state()

        result = self.run_probe(PROBE_RESPONSE="SYMPHONY_ACCOUNT_READY")

        self.assertEqual(result.returncode, 76)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], original)
        self.assertNotIn("readiness", state)

    def test_unrecognized_failure_is_indeterminate_and_preserves_cooldowns(self):
        original = self.write_state()
        result = self.run_probe(PROBE_EXIT="1")
        self.assertEqual(result.returncode, 76)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], original)
        self.assertEqual(state["cooldowns"]["account-b"], original)
        self.assertNotIn("readiness", state)

    def test_held_account_lock_prevents_probe_and_preserves_cooldown(self):
        original = self.write_state()
        locks = self.accounts / "locks"
        locks.mkdir()
        descriptor = os.open(locks / "account-a.lock", os.O_RDWR | os.O_CREAT)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = self.run_probe(PROBE_RESPONSE="SYMPHONY_ACCOUNT_READY")
        self.assertEqual(result.returncode, 0)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], original)
        self.assertLessEqual(state["cooldowns"]["account-b"], int(time.time()))

    def test_malformed_state_fails_closed_and_releases_the_state_lock(self):
        state_path = self.accounts / "state.json"
        state_path.write_text("{not-json\n")
        result = self.run_probe()
        self.assertEqual(result.returncode, 76)
        self.assertEqual(state_path.read_text(), "{not-json\n")
        descriptor = os.open(f"{state_path}.lock", os.O_RDWR | os.O_CREAT)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_one_recovery_uses_expiry_order_and_emits_one_typed_receipt(self):
        now = int(time.time())
        state_path = self.accounts / "state.json"
        state_path.write_text(json.dumps({
            "active": None,
            "cooldowns": {"account-a": now + 7200, "account-b": now + 3600},
            "last_error": {},
        }))
        result = self.run_probe(
            CODEX_ACCOUNT_PROBE_MAX_RECOVERIES="1",
            PROBE_RESPONSE="SYMPHONY_ACCOUNT_READY",
        )
        self.assertEqual(result.stdout.strip(), "RECOVERED account-b")
        state = json.loads(state_path.read_text())
        self.assertGreater(state["cooldowns"]["account-a"], now)
        self.assertLessEqual(state["cooldowns"]["account-b"], int(time.time()))
        self.assertEqual(set(state["readiness"]), {"account-b"})
        self.assertEqual(state["active"], "account-b")

    def test_concurrent_newer_error_wins_even_when_cooldown_is_unchanged(self):
        original = self.write_state()
        mutating_codex = self.root / "mutating-codex"
        mutating_codex.write_text(
            "#!/usr/bin/env bash\n"
            "python3 - \"$MUTATE_STATE\" \"$CODEX_HOME\" <<'PY'\n"
            "import json, pathlib, sys\n"
            "path = pathlib.Path(sys.argv[1])\n"
            "account = pathlib.Path(sys.argv[2]).name\n"
            "state = json.loads(path.read_text())\n"
            "state.setdefault('last_error', {})[account] = {'reason': 'newer'}\n"
            "path.write_text(json.dumps(state))\n"
            "PY\n"
            "printf 'SYMPHONY_ACCOUNT_READY\\n'\n"
        )
        mutating_codex.chmod(0o755)
        result = self.run_probe(
            CODEX_REAL_BIN=str(mutating_codex),
            CODEX_ACCOUNT_PROBE_MAX_RECOVERIES="1",
            MUTATE_STATE=str(self.accounts / "state.json"),
        )
        self.assertEqual(result.stdout, "")
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], original)
        self.assertEqual(state["last_error"]["account-a"], {"reason": "newer"})

    def test_multiple_accounts_share_one_total_timeout_budget(self):
        original = self.write_state()
        slow_codex = self.root / "slow-codex"
        slow_codex.write_text(
            "#!/usr/bin/env bash\nsleep 2\nprintf 'SYMPHONY_ACCOUNT_READY\\n'\n"
        )
        slow_codex.chmod(0o755)
        started = time.monotonic()
        result = self.run_probe(
            CODEX_REAL_BIN=str(slow_codex),
            CODEX_ACCOUNT_PROBE_TIMEOUT="2",
            CODEX_ACCOUNT_PROBE_TOTAL_TIMEOUT="1",
        )
        elapsed = time.monotonic() - started
        self.assertEqual(result.returncode, 76)
        self.assertLess(elapsed, 4.0)
        state = json.loads((self.accounts / "state.json").read_text())
        self.assertEqual(state["cooldowns"]["account-a"], original)
        self.assertEqual(state["cooldowns"]["account-b"], original)

    def test_held_state_lock_fails_closed_within_total_budget(self):
        original = self.write_state()
        state_path = self.accounts / "state.json"
        descriptor = os.open(f"{state_path}.lock", os.O_RDWR | os.O_CREAT, 0o600)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        started = time.monotonic()
        result = self.run_probe(CODEX_ACCOUNT_PROBE_TOTAL_TIMEOUT="1")
        self.assertEqual(result.returncode, 76)
        self.assertLess(time.monotonic() - started, 1.0)
        state = json.loads(state_path.read_text())
        self.assertEqual(state["cooldowns"]["account-a"], original)
        self.assertEqual(state["cooldowns"]["account-b"], original)

    def test_probe_pins_canonical_provider_and_luna_model(self):
        self.write_state()
        argv = self.root / "probe-argv"
        recording_codex = self.root / "recording-codex"
        recording_codex.write_text(
            "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" > \"$ARGV_FILE\"\n"
            "case \"$*\" in *'model_provider=\"openai\"'*) ;; *) exit 64;; esac\n"
            "printf 'SYMPHONY_ACCOUNT_READY\\n'\n"
        )
        recording_codex.chmod(0o755)
        result = self.run_probe(
            CODEX_REAL_BIN=str(recording_codex),
            CODEX_ACCOUNT_PROBE_MAX_RECOVERIES="1",
            ARGV_FILE=str(argv),
        )
        self.assertEqual(result.returncode, 0)
        arguments = argv.read_text()
        self.assertIn('--config model_provider="openai"', arguments)
        self.assertIn("--model gpt-5.6-luna", arguments)

    def test_authoritative_capacity_failure_is_clean_not_ready(self):
        original = self.write_state()
        result = self.run_probe(PROBE_EXIT="1", PROBE_RESPONSE="usage limit 429")
        self.assertEqual(result.returncode, 75)
        self.assertEqual(
            json.loads((self.accounts / "state.json").read_text())["cooldowns"]["account-a"],
            original,
        )

    def test_symlink_traversal_and_codex_home_override_fail_closed(self):
        future = int(time.time()) + 3600
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "auth.json").write_text('{"auth_mode":"chatgpt"}\n')
        (outside / "config.toml").write_text('model = "test"\n')
        (self.accounts / "alias").symlink_to(outside, target_is_directory=True)
        state = self.accounts / "state.json"
        for account in ("alias", "../outside", str(outside)):
            with self.subTest(account=account):
                state.write_text(json.dumps({
                    "active": None, "cooldowns": {account: future}, "last_error": {}
                }))
                self.assertEqual(self.run_probe().returncode, 76)
        state.write_text(json.dumps({
            "active": None, "cooldowns": {"account-a": future}, "last_error": {}
        }))
        (self.accounts / "account-a" / "env").write_text(
            f"CODEX_HOME={self.accounts / 'account-b'}\n"
        )
        self.assertEqual(self.run_probe().returncode, 76)
        self.assertGreater(json.loads(state.read_text())["cooldowns"]["account-a"], int(time.time()))

    def test_symlinked_or_duplicate_credential_files_fail_closed(self):
        future = int(time.time()) + 3600
        state = self.accounts / "state.json"
        (self.accounts / "account-a/auth.json").unlink()
        (self.accounts / "account-a/auth.json").symlink_to(
            self.accounts / "account-b/auth.json"
        )
        state.write_text(json.dumps({
            "active": None, "cooldowns": {"account-a": future}, "last_error": {}
        }))
        self.assertEqual(self.run_probe().returncode, 76)
        (self.accounts / "account-a/auth.json").unlink()
        os.link(self.accounts / "account-b/auth.json", self.accounts / "account-a/auth.json")
        state.write_text(json.dumps({
            "active": None,
            "cooldowns": {"account-a": future, "account-b": future},
            "last_error": {},
        }))
        self.assertEqual(self.run_probe().returncode, 76)

    def test_duplicate_identity_in_ready_locked_account_blocks_cooling_recovery(self):
        future = int(time.time()) + 3600
        state = self.accounts / "state.json"
        (self.accounts / "account-a/auth.json").unlink()
        os.link(self.accounts / "account-b/auth.json", self.accounts / "account-a/auth.json")
        state.write_text(json.dumps({
            "active": None,
            "cooldowns": {"account-a": future, "account-b": int(time.time()) - 1},
            "last_error": {},
        }))
        locks = self.accounts / "locks"
        locks.mkdir()
        descriptor = os.open(locks / "account-b.lock", os.O_RDWR | os.O_CREAT, 0o600)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = self.run_probe()
        self.assertEqual(result.returncode, 76)
        self.assertGreater(json.loads(state.read_text())["cooldowns"]["account-a"], int(time.time()))

    def test_state_symlink_alias_cannot_fork_lock_or_state_identity(self):
        original = self.write_state()
        canonical = self.accounts / "state.json"
        alias = self.accounts / "state-alias.json"
        alias.symlink_to(canonical)
        descriptor = os.open(f"{canonical}.lock", os.O_RDWR | os.O_CREAT, 0o600)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = self.run_probe(CODEX_ACCOUNTS_STATE=str(alias))
        self.assertEqual(result.returncode, 76)
        self.assertFalse(pathlib.Path(f"{alias}.lock").exists())
        self.assertEqual(json.loads(canonical.read_text())["cooldowns"]["account-a"], original)

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux subreaper")
    def test_completed_probe_reaps_late_double_fork_before_return(self):
        future = int(time.time()) + 3600
        state_path = self.accounts / "state.json"
        state_path.write_text(json.dumps({
            "active": None,
            "cooldowns": {"account-a": future},
            "last_error": {},
        }))
        late = self.root / "late"
        pid_file = self.root / "late.pid"
        cgroup_file = self.root / "late.cgroup"
        forker = self.root / "late-fork"
        forker.write_text(
            "#!/usr/bin/env python3\n"
            "import os, pathlib, signal, sys, time\n"
            "if os.fork() == 0:\n"
            "    os.setsid()\n"
            "    pathlib.Path(os.environ['PID_FILE']).write_text(str(os.getpid()))\n"
            "    pathlib.Path(os.environ['CGROUP_FILE']).write_text(pathlib.Path('/proc/self/cgroup').read_text())\n"
            "    time.sleep(0.25)\n"
            "    if os.fork() == 0:\n"
            "        signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
            "        time.sleep(1.5)\n"
            "        pathlib.Path(os.environ['LATE_FILE']).write_text('late')\n"
            "        time.sleep(30)\n"
            "    os._exit(0)\n"
            "print('probe failed', flush=True)\n"
            "raise SystemExit(1)\n"
        )
        forker.chmod(0o755)
        started = time.monotonic()
        result = self.run_probe(
            CODEX_REAL_BIN=str(forker),
            CODEX_ACCOUNT_PROBE_TIMEOUT="0.5",
            CODEX_ACCOUNT_PROBE_TOTAL_TIMEOUT="1",
            PID_FILE=str(pid_file),
            CGROUP_FILE=str(cgroup_file),
            LATE_FILE=str(late),
        )
        self.assertEqual(result.returncode, 76)
        self.assertLess(time.monotonic() - started, 4)
        self.assertTrue(pid_file.exists())
        self.assertIn("symphony-codex-probe-", cgroup_file.read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(int(pid_file.read_text()), 0)
        time.sleep(1.7)
        self.assertFalse(late.exists())
        self.assertEqual(json.loads(state_path.read_text())["cooldowns"]["account-a"], future)

    def test_poisoned_lock_override_cannot_bypass_canonical_lease(self):
        future = int(time.time()) + 3600
        state = self.accounts / "state.json"
        state.write_text(json.dumps({
            "active": None, "cooldowns": {"account-a": future}, "last_error": {}
        }))
        canonical = self.accounts / "locks"
        canonical.mkdir()
        descriptor = os.open(canonical / "account-a.lock", os.O_RDWR | os.O_CREAT)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = self.run_probe(
            CODEX_ACCOUNT_LOCKS_DIR=str(self.root / "attacker-locks")
        )
        self.assertEqual(result.returncode, 76)
        self.assertGreater(json.loads(state.read_text())["cooldowns"]["account-a"], int(time.time()))

    def test_invalid_timeouts_are_finite_and_descendants_are_reaped(self):
        self.write_state()
        pid_file = self.root / "pids"
        slow = self.root / "slow-tree"
        slow.write_text(
            "#!/usr/bin/env bash\n"
            "sleep 30 &\n"
            "printf '%s %s\\n' \"$$\" \"$!\" > \"$PID_FILE\"\n"
            "wait\n"
        )
        slow.chmod(0o755)
        for invalid in ("nan", "inf", "-inf", "0", "-1"):
            with self.subTest(value=invalid):
                pid_file.unlink(missing_ok=True)
                started = time.monotonic()
                result = self.run_probe(
                    CODEX_REAL_BIN=str(slow),
                    CODEX_ACCOUNT_PROBE_TIMEOUT=invalid,
                    CODEX_ACCOUNT_PROBE_TOTAL_TIMEOUT="0.25",
                    PID_FILE=str(pid_file),
                )
                self.assertEqual(result.returncode, 76)
                self.assertLess(time.monotonic() - started, 4.0)
                if pid_file.exists():
                    for raw_pid in pid_file.read_text().split():
                        with self.assertRaises(ProcessLookupError):
                            os.kill(int(raw_pid), 0)

    def test_account_lease_spans_probe_and_state_commit(self):
        self.write_state()
        started_file = self.root / "started"
        release_file = self.root / "release"
        gated = self.root / "gated-codex"
        gated.write_text(
            "#!/usr/bin/env bash\n"
            "touch \"$STARTED_FILE\"\n"
            "while [ ! -f \"$RELEASE_FILE\" ]; do sleep 0.02; done\n"
            "printf 'SYMPHONY_ACCOUNT_READY\\n'\n"
        )
        gated.chmod(0o755)
        env = os.environ.copy()
        env.update({
            "CODEX_ACCOUNTS_ROOT": str(self.accounts),
            "CODEX_REAL_BIN": str(gated),
            "STARTED_FILE": str(started_file),
            "RELEASE_FILE": str(release_file),
        })
        process = subprocess.Popen([str(PROBE)], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.time() + 3
        while not started_file.exists() and time.time() < deadline:
            time.sleep(0.02)
        self.assertTrue(started_file.exists())
        lock = os.open(self.accounts / "locks/account-a.lock", os.O_RDWR | os.O_CREAT)
        self.addCleanup(os.close, lock)
        with self.assertRaises(BlockingIOError):
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        release_file.touch()
        stdout, stderr = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, stderr)
        self.assertEqual(stdout.strip(), b"RECOVERED account-a")


HELPER = ROOT / "scripts/symphony/symphony-codex-account-control.py"


class SymphonyCodexAccountControlTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.accounts = pathlib.Path(self.tmp.name) / "accounts"
        self.accounts.mkdir()
        self.env_file = pathlib.Path(self.tmp.name) / "codex-account.env"
        self.codex = pathlib.Path(self.tmp.name) / "codex"
        self.done = pathlib.Path(self.tmp.name) / "login-done"
        self.codex.write_text(
            "#!/usr/bin/env bash\n"
            "printf '%s\\n' 'Visit https://auth.openai.com/codex/device' 'Enter code: ABCD-1234' 'access_token=redacted-token-material'\n"
            "while [ ! -f \"$FAKE_CODEX_DONE\" ]; do sleep 0.05; done\n"
            "exit \"${FAKE_CODEX_EXIT:-0}\"\n"
        )
        self.codex.chmod(0o755)
        self.env_file.write_text(f"CODEX_HOME={self.accounts / 'personal'}\n")
        (self.accounts / "personal").mkdir()
        for name in ("meetjovie", "jovie"):
            (self.accounts / name).mkdir()
            (self.accounts / name / "auth.json").write_text("{}\n")
        now = int(time.time())
        (self.accounts / "state.json").write_text(json.dumps({
            "active": None,
            "cooldowns": {"meetjovie": now + 3600},
            "readiness": {"jovie": {"checkedAt": now - 60, "expiresAt": now - 60}},
        }))

    def tearDown(self):
        self.tmp.cleanup()

    def run_helper(self, *args):
        env = os.environ.copy()
        env.update({
            "CODEX_ACCOUNTS_ROOT": str(self.accounts),
            "CODEX_ACCOUNTS_STATE": str(self.accounts / "state.json"),
            "SYMPHONY_CODEX_ACCOUNT_ENV": str(self.env_file),
            "CODEX_REAL_BIN": str(self.codex),
            "FAKE_CODEX_DONE": str(self.done),
        })
        return subprocess.run(
            [str(HELPER), *args], env=env, capture_output=True, text=True, check=False, timeout=20
        )

    def test_inspect_and_reconnect_keep_allowlist_states_and_receipt(self):
        inspect = self.run_helper("inspect")
        self.assertEqual(inspect.returncode, 0, inspect.stderr)
        payload = json.loads(inspect.stdout)
        by_label = {row["label"]: row["state"] for row in payload["accounts"]}
        self.assertEqual(list(by_label), ["meetjovie", "jovie", "timwhite-co"])
        self.assertEqual(by_label, {
            "meetjovie": "usage-exhausted", "jovie": "stale", "timwhite-co": "unknown",
        })
        binding = payload["binding"]
        self.assertEqual(binding["boundLabel"], "personal")
        self.assertFalse(binding["recognized"] or binding["selectable"] or binding["canSwitch"])
        denied = json.loads(self.run_helper("reconnect", "--account", "personal").stdout)
        self.assertEqual(denied["error"], "account_not_approved")
        started = self.run_helper("reconnect", "--account", "meetjovie")
        session = json.loads(started.stdout)["session"]
        self.assertEqual(session["userCode"], "ABCD-1234")
        self.assertNotIn("redacted-token-material", started.stdout)
        self.done.write_text("ok\n")
        receipt, deadline = None, time.time() + 8
        while time.time() < deadline:
            current = json.loads(self.run_helper("inspect").stdout).get("session") or {}
            if current.get("phase") == "succeeded":
                receipt = current.get("receipt"); break
            time.sleep(0.1)
        self.assertEqual(receipt["account"], "meetjovie")
        self.assertEqual(receipt["result"], "selected-account-verified")


if __name__ == "__main__":
    unittest.main()
