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


ROOT = pathlib.Path(__file__).resolve().parents[3]
PROBE = ROOT / "scripts/hermes/codex-account-probe.sh"


class CodexAccountProbeTests(unittest.TestCase):
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

    def test_successful_probe_recovers_cooldowns_with_short_lived_receipts(self):
        original = self.write_state()
        result = self.run_probe(PROBE_RESPONSE="SYMPHONY_ACCOUNT_READY")
        self.assertEqual(result.returncode, 0)
        state = json.loads((self.accounts / "state.json").read_text())
        for account in ("account-a", "account-b"):
            self.assertLessEqual(state["cooldowns"][account], int(time.time()))
            self.assertNotEqual(state["cooldowns"][account], original)
            self.assertEqual(state["readiness"][account]["source"], "authenticated_completion_probe/v1")
            self.assertGreater(state["readiness"][account]["expiresAt"], int(time.time()))

    def test_failed_probe_retains_cooldowns_and_creates_no_readiness_receipt(self):
        original = self.write_state()
        result = self.run_probe(PROBE_EXIT="1")
        self.assertEqual(result.returncode, 0)
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
        self.assertEqual(result.returncode, 0)
        self.assertEqual(state_path.read_text(), "{not-json\n")
        descriptor = os.open(f"{state_path}.lock", os.O_RDWR | os.O_CREAT)
        self.addCleanup(os.close, descriptor)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)


HELPER = ROOT / "scripts/hermes/symphony-codex-account-control.py"


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

