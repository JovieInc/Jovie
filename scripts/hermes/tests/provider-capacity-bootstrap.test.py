#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/provider-capacity-bootstrap.py"
PROVIDER = ROOT / "scripts/hermes/provider_useful_turns.py"
sys.path.insert(0, str(SOURCE.parent))
SPEC = importlib.util.spec_from_file_location("provider_capacity_bootstrap", SOURCE)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BootstrapTests(unittest.TestCase):
    def account(self, root: pathlib.Path, name: str = "account-a") -> pathlib.Path:
        account = root / name
        account.mkdir()
        (account / "auth.json").write_text("not-inspected", encoding="utf-8")
        (account / "config.toml").write_text('model = "test"\n', encoding="utf-8")
        return account

    def run_bootstrap(
        self,
        root: pathlib.Path,
        launcher: pathlib.Path,
    ) -> tuple[subprocess.CompletedProcess[str], dict]:
        ledger = root / "proof.jsonl"
        argv = [
                sys.executable,
                str(SOURCE),
                "--accounts-root",
                str(root / "accounts"),
                "--ledger",
                str(ledger),
                "--launcher",
                str(launcher),
                "--helper",
                str(PROVIDER),
                "--state",
                str(root / "bootstrap-state.json"),
                "--timeout-seconds",
                "5",
            ]
        stdout = io.StringIO()
        with mock.patch.object(sys, "argv", argv[1:]), redirect_stdout(stdout):
            returncode = MODULE.main()
        result = subprocess.CompletedProcess(
            argv, returncode, stdout=stdout.getvalue(), stderr=""
        )
        return result, json.loads(result.stdout)

    def test_empty_ledger_canary_creates_one_identity_bound_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            accounts = root / "accounts"
            accounts.mkdir()
            self.account(accounts)
            ledger = root / "proof.jsonl"
            identity = MODULE.profile_identity("openai", "account-a")
            launcher = root / "launcher"
            launcher.write_text(
                "#!/usr/bin/env python3\n"
                "import datetime, json, os, pathlib, sys\n"
                "assert '--ephemeral' in sys.argv and '--json' in sys.argv\n"
                "assert 'read-only' in sys.argv\n"
                f"identity = {identity!r}\n"
                "row = {'schema':'gem-provider-useful-turn/v1','provider':'openai','profile':identity,'model':'gpt-5.6-sol','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'rc':0,'useful':True,'outputDigest':'a'*64,'outputBytes':20,'tokens':{'input':5,'output':2,'total':7}}\n"
                "path = pathlib.Path(os.environ['GEM_PROVIDER_TURN_LEDGER'])\n"
                "path.write_text(json.dumps(row) + '\\n', encoding='utf-8')\n",
                encoding="utf-8",
            )
            launcher.chmod(0o755)

            result, summary = self.run_bootstrap(root, launcher)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(summary["attempted"], 1)
            self.assertEqual(summary["succeeded"], 1)
            self.assertEqual(summary["ready"], 1)
            receipt = MODULE.build_capacity_receipt(
                ledger,
                datetime.now(timezone.utc),
                {"openai": [identity]},
            )
            self.assertEqual(receipt["target"], 1)

    def test_failed_canary_is_backed_off_on_the_next_timer_tick(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            accounts = root / "accounts"
            accounts.mkdir()
            self.account(accounts)
            launcher = root / "launcher"
            launcher.write_text("#!/usr/bin/env bash\nexit 1\n", encoding="utf-8")
            launcher.chmod(0o755)

            first, first_summary = self.run_bootstrap(root, launcher)
            second, second_summary = self.run_bootstrap(root, launcher)

            self.assertEqual(first.returncode, 0)
            self.assertEqual(second.returncode, 0)
            self.assertEqual(first_summary["attempted"], 1)
            self.assertEqual(second_summary["attempted"], 0)
            self.assertEqual(second_summary["deferred"], 1)
            state = json.loads((root / "bootstrap-state.json").read_text())
            record = next(iter(state["profiles"].values()))
            self.assertEqual(record["failures"], 1)
            self.assertGreater(record["nextAttemptAt"], record["lastAttemptAt"])

    def test_zero_exit_without_proof_is_still_backed_off(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            accounts = root / "accounts"
            accounts.mkdir()
            self.account(accounts)
            launcher = root / "launcher"
            launcher.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            launcher.chmod(0o755)

            first, first_summary = self.run_bootstrap(root, launcher)
            second, second_summary = self.run_bootstrap(root, launcher)

            self.assertEqual(first.returncode, 0)
            self.assertEqual(first_summary["succeeded"], 0)
            self.assertEqual(first_summary["ready"], 0)
            self.assertEqual(second_summary["attempted"], 0)
            self.assertEqual(second_summary["deferred"], 1)

    def test_launcher_spawn_failure_is_typed_zero_and_backed_off(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            accounts = root / "accounts"
            accounts.mkdir()
            self.account(accounts)
            launcher = root / "launcher"
            launcher.write_text("not executable\n", encoding="utf-8")

            first, first_summary = self.run_bootstrap(root, launcher)
            second, second_summary = self.run_bootstrap(root, launcher)

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(first_summary["attempted"], 1)
            self.assertEqual(first_summary["succeeded"], 0)
            self.assertEqual(first_summary["ready"], 0)
            self.assertEqual(second_summary["attempted"], 0)
            self.assertEqual(second_summary["deferred"], 1)

    def test_batch_is_bounded_and_state_keys_are_opaque(self):
        labels = [f"account-{index}" for index in range(20)]
        selected, deferred = MODULE.select_attempts(
            labels,
            set(),
            {"schema": MODULE.STATE_SCHEMA, "profiles": {}},
            now_epoch=100,
            maximum=8,
        )
        self.assertEqual(selected, labels[:8])
        self.assertEqual(deferred, 12)
        state = MODULE.update_attempt_state(
            {"schema": MODULE.STATE_SCHEMA, "profiles": {}},
            {"account-0": False},
            now_epoch=100,
        )
        self.assertNotIn("account-0", json.dumps(state))

    def test_non_object_state_resets_to_typed_empty_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "state.json"
            for value in ([], "invalid", None):
                with self.subTest(value=value):
                    path.write_text(json.dumps(value), encoding="utf-8")
                    self.assertEqual(
                        MODULE.read_state(path),
                        {"schema": MODULE.STATE_SCHEMA, "profiles": {}},
                    )


if __name__ == "__main__":
    unittest.main()
