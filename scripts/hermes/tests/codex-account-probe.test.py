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


if __name__ == "__main__":
    unittest.main()
