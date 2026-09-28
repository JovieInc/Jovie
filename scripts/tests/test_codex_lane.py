"""Regression tests for scripts/lanes/codex_lane.py (Codex accounts as a shipping lane).

Run with:
    python3 -m unittest scripts/tests/test_codex_lane.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("codex_lane", ROOT / "scripts/lanes/codex_lane.py")
codex = importlib.util.module_from_spec(SPEC)
sys.modules["codex_lane"] = codex
SPEC.loader.exec_module(codex)


def profile(root: Path, name: str, kind: str = "chatgpt") -> None:
    home = root / name
    home.mkdir(parents=True)
    auth = {"tokens": {"access_token": "t", "id_token": "i"}} if kind == "chatgpt" else {"OPENAI_API_KEY": "sk"}
    (home / "auth.json").write_text(json.dumps(auth))


class Isolated(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = (codex.ACCOUNTS_ROOT, codex.STATE)
        codex.ACCOUNTS_ROOT = root / "accounts"
        codex.STATE = root / "state" / "codex-accounts.json"
        profile(codex.ACCOUNTS_ROOT, "alpha")
        profile(codex.ACCOUNTS_ROOT, "beta")
        profile(codex.ACCOUNTS_ROOT, "openrouter", kind="apikey")
        (codex.ACCOUNTS_ROOT / "locks").mkdir()

    def tearDown(self):
        codex.ACCOUNTS_ROOT, codex.STATE = self.saved
        self.tmp.cleanup()


class AccountsTest(Isolated):
    def test_only_chatgpt_profiles_are_accounts(self):
        self.assertEqual(codex.accounts(), ["alpha", "beta"])

    def test_pick_is_least_recently_used_and_skips_exhausted(self):
        now = 1_000_000.0
        state = {"alpha": {"lastUsed": now - 10}, "beta": {"lastUsed": now - 100}}
        name, handle = codex.pick(state, now)
        self.assertEqual(name, "beta")
        handle.close()
        state["beta"]["exhaustedUntil"] = now + 3600
        name, handle = codex.pick(state, now)
        self.assertEqual(name, "alpha")
        handle.close()
        state["alpha"]["exhaustedUntil"] = now + 60
        self.assertEqual(codex.pick(state, now), (None, None))
        self.assertEqual(codex.pick(state, now + 61)[0], "alpha")

    def test_leases_are_exclusive_while_held(self):
        name, first = codex.pick({}, 1.0)
        second_name, second = codex.pick({}, 1.0)
        self.assertNotEqual(name, second_name)
        third = codex.pick({}, 1.0)
        self.assertEqual(third, (None, None))
        first.close()
        second.close()
        again, handle = codex.pick({}, 1.0)
        self.assertIsNotNone(again)
        handle.close()


class ClassifyTest(unittest.TestCase):
    def test_limit_message_banks_the_account_until_the_reported_reset(self):
        now = 1_000_000.0
        kind, until = codex.classify("...\nYou've hit your usage limit. Try again in 2 hours 30 minutes.\n", 1, now)
        self.assertEqual((kind, until), ("limit", now + 9000))

    def test_limit_without_a_reset_uses_the_default_cooldown(self):
        kind, until = codex.classify("error: usage limit reached", 1, 5.0)
        self.assertEqual((kind, until), ("limit", 5.0 + codex.DEFAULT_COOLDOWN_S))
        # A burst rate limit backs off briefly instead of banking the account for hours.
        self.assertEqual(codex.classify("error: rate limit exceeded", 1, 5.0), ("rate", 5.0 + codex.RATE_BACKOFF_S))

    def test_auth_failures_bank_for_a_day_and_success_clears(self):
        kind, until = codex.classify("codex: not logged in", 1, 0.0)
        self.assertEqual((kind, until), ("auth", 86400.0))
        self.assertEqual(codex.classify("codex\nOK\ntokens used\n12", 0, 0.0), ("ok", None))
        self.assertEqual(codex.classify("boom", 3, 0.0), ("error", None))

    def test_successful_run_that_mentions_rate_limits_is_not_exhausted(self):
        transcript = "reading rate-limiter.test.ts\nexpect 429 Too Many Requests\nquota fallback\n" + "work\n" * 40 + "Done."
        self.assertEqual(codex.classify(transcript, 0, 0.0), ("ok", None))

    def test_limit_text_early_in_a_failed_run_is_not_the_failure(self):
        transcript = "handles 429 retries\n" + "step\n" * 40 + "error: stream disconnected"
        self.assertEqual(codex.classify(transcript, 1, 0.0), ("error", None))

    def test_reset_clock_times_roll_to_the_next_occurrence(self):
        now = 1_000_000.0
        until = codex.parse_reset("Try again at 2026-09-27T01:00:00Z", now)
        self.assertEqual(until, 1790470800.0)
        soon = codex.parse_reset("try again at 11:59 PM", now)
        self.assertGreater(soon, now)
        self.assertLess(soon - now, 86400)


class StatusTest(Isolated):
    def test_status_reports_availability_resets_and_health_exit(self):
        now = 1_000_000.0
        state = {"alpha": {"exhaustedUntil": now + 120, "lastKind": "limit", "lastError": "usage limit", "runs": 3}}
        report = codex.status(now=now, state=state)
        self.assertEqual(report["available"], ["beta"])
        self.assertEqual(report["accounts"]["alpha"]["resetsInS"], 120)
        self.assertEqual(report["accounts"]["alpha"]["exhaustedUntil"], "1970-01-12T13:48:40Z")
        self.assertTrue(report["accounts"]["beta"]["available"])
        codex.write_state(state)
        self.assertEqual(codex.main(["health"]), 0)
        # health uses the wall clock: bank both accounts far into the future
        codex.write_state({"alpha": {"exhaustedUntil": 10 ** 12}, "beta": {"exhaustedUntil": 10 ** 12}})
        self.assertEqual(codex.main(["health"]), 1)

    def test_run_without_an_account_is_a_temporary_failure(self):
        codex.write_state({"alpha": {"exhaustedUntil": 10 ** 12}, "beta": {"exhaustedUntil": 10 ** 12}})
        with tempfile.NamedTemporaryFile("w", suffix=".md") as prompt:
            prompt.write("do it")
            prompt.flush()
            self.assertEqual(codex.main(["run", "--prompt-file", prompt.name]), codex.NO_ACCOUNT_EXIT)


class RunTest(Isolated):
    def run_with(self, script: str) -> int:
        codex.ROTATE_PAUSE_S = 0
        fake = codex.ACCOUNTS_ROOT.parent / "bin"
        fake.mkdir(exist_ok=True)
        (fake / "codex").write_text(script)
        (fake / "codex").chmod(0o755)
        saved = os.environ.get("PATH")
        os.environ["PATH"] = f"{fake}:{saved}"
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".md") as prompt, tempfile.TemporaryDirectory() as cwd:
                prompt.write("ship it")
                prompt.flush()
                return codex.main(["run", "--prompt-file", prompt.name, "--cwd", cwd])
        finally:
            os.environ["PATH"] = saved

    def test_every_account_spent_banks_all_and_hands_off(self):
        code = self.run_with("#!/bin/sh\ncat >/dev/null\necho 'You have hit your usage limit. Try again in 1 hour.'\nexit 1\n")
        self.assertEqual(code, codex.NO_ACCOUNT_EXIT)
        state = codex.read_state()
        self.assertEqual(sorted(n for n, e in state.items() if e.get("exhaustedUntil")), ["alpha", "beta"])
        self.assertTrue(all(state[n]["lastKind"] == "limit" and state[n]["runs"] == 1 for n in ("alpha", "beta")))

    def test_a_limit_mid_run_rotates_to_the_next_account_and_finishes(self):
        script = ("#!/bin/sh\ncat >/dev/null\n"
                  "if [ \"$(basename \"$CODEX_HOME\")\" = alpha ]; then echo 'error: 429 Too Many Requests'; exit 1; fi\n"
                  "echo OK\nexit 0\n")
        self.assertEqual(self.run_with(script), 0)
        state = codex.read_state()
        self.assertEqual(state["alpha"]["lastKind"], "rate")
        self.assertLess(state["alpha"]["exhaustedUntil"] - time.time(), codex.DEFAULT_COOLDOWN_S)
        self.assertEqual(state["beta"]["lastKind"], "ok")
        self.assertNotIn("exhaustedUntil", state["beta"])


if __name__ == "__main__":
    unittest.main()
