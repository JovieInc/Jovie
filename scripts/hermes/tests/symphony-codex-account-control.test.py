#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, os, pathlib, subprocess, tempfile, time, unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
HELPER = ROOT / "scripts/hermes/symphony-codex-account-control.py"

def load_helper():
    spec = importlib.util.spec_from_file_location("symphony_codex_account_control", HELPER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class SymphonyCodexAccountControlTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.accounts = self.root / "accounts"
        self.accounts.mkdir()
        self.env_file = self.root / "codex-account.env"
        self.codex = self.root / "codex"
        self.done = self.root / "login-done"
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
            "readiness": {"jovie": {"checkedAt": now - 60, "expiresAt": now - 60, "source": "authenticated_completion_probe/v1"}},
            "last_error": {},
        }))

    def tearDown(self):
        self.tmp.cleanup()

    def env(self, **extra):
        env = os.environ.copy()
        env.update({
            "CODEX_ACCOUNTS_ROOT": str(self.accounts),
            "CODEX_ACCOUNTS_STATE": str(self.accounts / "state.json"),
            "SYMPHONY_CODEX_ACCOUNT_ENV": str(self.env_file),
            "CODEX_REAL_BIN": str(self.codex),
            "FAKE_CODEX_DONE": str(self.done),
        })
        env.update(extra)
        return env

    def run_helper(self, *args, **extra):
        return subprocess.run([str(HELPER), *args], env=self.env(**extra), capture_output=True, text=True, check=False, timeout=20)

    def test_inspect_lists_only_approved_labels_and_keeps_states_distinct(self):
        result = self.run_helper("inspect")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["schema"], "symphony-codex-account-control/v1")
        self.assertEqual(payload["service"], "symphony-elixir.service")
        labels = [row["label"] for row in payload["accounts"]]
        self.assertEqual(labels, ["meetjovie", "jovie", "timwhite-co"])
        self.assertNotIn("personal", labels)
        by_label = {row["label"]: row["state"] for row in payload["accounts"]}
        self.assertEqual(by_label, {"meetjovie": "usage-exhausted", "jovie": "stale", "timwhite-co": "unknown"})
        binding = payload["binding"]
        self.assertEqual(binding["boundLabel"], "personal")
        self.assertFalse(binding["recognized"] or binding["selectable"] or binding["canSwitch"] or binding["canRestart"])
        self.assertTrue(binding["reviewOnly"])

    def test_reconnect_is_locked_secret_free_and_emits_selected_account_receipt(self):
        started = self.run_helper("reconnect", "--account", "meetjovie")
        self.assertEqual(started.returncode, 0, started.stderr)
        session = json.loads(started.stdout)["session"]
        self.assertEqual(session["account"], "meetjovie")
        self.assertEqual(session["userCode"], "ABCD-1234")
        self.assertEqual(session["verificationUri"], "https://auth.openai.com/codex/device")
        self.assertNotIn("redacted-token-material", started.stdout)
        self.assertNotIn("access_token", started.stdout)
        self.done.write_text("ok\n")
        deadline = time.time() + 8
        receipt = None
        while time.time() < deadline:
            current = json.loads(self.run_helper("inspect").stdout).get("session") or {}
            if current.get("phase") == "succeeded":
                receipt = current.get("receipt")
                break
            time.sleep(0.1)
        self.assertEqual(receipt["schema"], "symphony-codex-account-reconnect/v1")
        self.assertEqual(receipt["account"], "meetjovie")
        self.assertEqual(receipt["result"], "selected-account-verified")
        self.assertNotIn("personal", json.dumps(receipt))

    def test_unapproved_account_stays_unselectable(self):
        result = self.run_helper("reconnect", "--account", "personal")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["error"], "account_not_approved")
        self.assertIsNone(payload.get("session"))
        self.assertEqual([row["label"] for row in payload["accounts"]], ["meetjovie", "jovie", "timwhite-co"])

    def test_device_auth_parser_drops_secret_material(self):
        module = load_helper()
        code, uri = module.parse_device_auth(
            "Visit https://auth.openai.com/codex/device\ncode ABCD-1234\naccess_token=redacted-token-material"
        )
        self.assertEqual((code, uri), ("ABCD-1234", "https://auth.openai.com/codex/device"))
        now = int(time.time())
        self.assertEqual(module.classify_account_state(
            auth_present=True, cooldown_until=now + 10, readiness_expires=now + 10, now=now,
        ), "usage-exhausted")

if __name__ == "__main__":
    unittest.main()
