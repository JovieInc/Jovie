"""Claude Code lane adapter: subscription-only auth, quota bank, run receipts (JOV-7706).

Run with:
    python3 -m pytest scripts/tests/test_claude_lane.py -v
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import claude_lane as claude  # noqa: E402

OPUS = "claude-opus-5-5"


def completed(stdout="", stderr="", code=0):
    return subprocess.CompletedProcess(["claude"], code, stdout, stderr)


class ClaudeLaneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / "claude-quota.json"
        self.receipt = Path(self.tmp.name) / "run.provider.jsonl"
        self.calls = []

    def tearDown(self):
        self.tmp.cleanup()

    def runner(self, result):
        def run(cmd, **kwargs):
            self.calls.append((cmd, kwargs))
            return result
        return run

    def go(self, result, model=OPUS, now=1000.0):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = claude.run(model, "do the issue", "/wt", str(self.receipt), now=lambda: now,
                              runner=self.runner(result), path=self.state)
        return code, out.getvalue(), err.getvalue()

    def test_child_env_strips_api_credentials_and_adds_setup_token(self):
        token = Path(self.tmp.name) / "claude.env"
        token.write_text("# comment\nCLAUDE_CODE_OAUTH_TOKEN='sk-ant-oat-x'\nOTHER=1\n")
        env = claude.child_env({"ANTHROPIC_API_KEY": "sk-ant-api", "ANTHROPIC_BASE_URL": "x", "PATH": "/bin"}, token)
        self.assertEqual(env, {"PATH": "/bin", "CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat-x"})
        self.assertEqual(claude.child_env({"PATH": "/bin"}, Path(self.tmp.name) / "missing"), {"PATH": "/bin"})

    def test_command_keeps_hooks_and_skips_prompts_without_session_files(self):
        cmd = claude.command(OPUS)
        self.assertNotIn("--bare", cmd)
        self.assertNotIn("--dangerously-skip-permissions", cmd)
        self.assertEqual(cmd[cmd.index("--permission-mode") + 1], "bypassPermissions")
        self.assertIn("--no-session-persistence", cmd)
        self.assertEqual(cmd[cmd.index("--model") + 1], OPUS)

    def test_successful_run_prints_answer_records_window_and_receipt(self):
        payload = {"result": "Opened PR https://github.com/JovieInc/Jovie/pull/9", "is_error": False,
                   "num_turns": 12, "total_cost_usd": 1.5, "duration_ms": 5}
        code, out, _ = self.go(completed(json.dumps(payload)))
        self.assertEqual(code, 0)
        self.assertIn("pull/9", out)
        cmd, kwargs = self.calls[0]
        self.assertEqual(kwargs["input"], "do the issue")
        self.assertEqual(kwargs["cwd"], "/wt")
        self.assertNotIn("ANTHROPIC_API_KEY", kwargs["env"])
        state = json.loads(self.state.read_text())
        self.assertEqual(state["runs"][0]["usage"]["num_turns"], 12)
        self.assertNotIn("bank", state)
        row = json.loads(self.receipt.read_text())
        self.assertEqual((row["model"], row["accountClass"], row["notionalCostUsd"]),
                         (OPUS, "claude-subscription", 1.5))

    def test_usage_limit_banks_until_the_reported_reset_and_blocks_the_next_run(self):
        code, _, _ = self.go(completed("", "Claude AI usage limit reached|1700000000", 1))
        self.assertEqual(code, claude.NO_CAPACITY_EXIT)
        state = json.loads(self.state.read_text())
        self.assertEqual(state["bank"]["until"], 1700000000.0)
        code, _, err = self.go(completed(json.dumps({"result": "x"})), now=2000.0)
        self.assertEqual(code, claude.NO_CAPACITY_EXIT)
        self.assertIn("usage-limit", err)
        self.assertEqual(len(self.calls), 1)

    def test_error_payload_with_burst_limit_backs_off_briefly(self):
        payload = {"result": "API Error: 429 rate_limit_error", "is_error": True}
        code, _, _ = self.go(completed(json.dumps(payload), code=0))
        self.assertEqual(code, claude.NO_CAPACITY_EXIT)
        bank = json.loads(self.state.read_text())["bank"]
        self.assertEqual((bank["kind"], bank["until"]), ("rate-limit", 1000 + claude.BURST_BACKOFF_S))

    def test_plain_failure_is_not_a_bank(self):
        code, _, _ = self.go(completed("not json", "boom", 2))
        self.assertEqual(code, 2)
        self.assertNotIn("bank", json.loads(self.state.read_text()))
        code, _, _ = self.go(completed(json.dumps({"result": "tool failed", "is_error": True})))
        self.assertEqual(code, 1)
        code, _, _ = self.go(completed("[1, 2]"))
        self.assertEqual(code, 0)

    def test_unknown_model_is_refused_before_any_call(self):
        code, _, err = self.go(completed(), model="claude-3-haiku")
        self.assertEqual(code, 2)
        self.assertEqual(self.calls, [])
        self.assertIn("not a lane model", err)

    def test_reset_clock_parsing(self):
        now = time.mktime((2026, 10, 3, 14, 0, 0, 0, 0, -1))
        self.assertEqual(claude.reset_at("resets 3pm", now) - now, 3600)
        self.assertEqual(claude.reset_at("resets at 1:30 pm", now) - now, 23 * 3600 + 1800)
        self.assertEqual(claude.reset_at("resets 12am", now) - now, 10 * 3600)
        self.assertIsNone(claude.reset_at("resets 25:99", now))
        self.assertIsNone(claude.reset_at("no reset", now))
        self.assertEqual(claude.classify_limit("You've hit your limit", now)["until"], now + claude.DEFAULT_BANK_S)
        self.assertIsNone(claude.classify_limit("compile error", now))

    def test_bank_is_kept_when_a_shorter_limit_arrives(self):
        claude.record_run(OPUS, 1, {"kind": "usage-limit", "until": 5000}, 100, self.state)
        state = claude.record_run(OPUS, 1, {"kind": "rate-limit", "until": 400}, 200, self.state)
        self.assertEqual(state["bank"]["until"], 5000)
        old = claude.record_run(OPUS, 0, None, 200 + claude.WINDOW_S + 1, self.state)
        self.assertEqual(len(old["runs"]), 1)

    def test_status_and_health_require_a_subscription_login(self):
        self.state.write_text(json.dumps({"runs": [{"at": 990, "model": OPUS}, "junk"]}))
        good = claude.status(1000, self.state, {"loggedIn": True, "authMethod": "claude.ai",
                                                "subscriptionType": "max"})
        self.assertTrue(good["available"])
        self.assertEqual(good["windowRunsByModel"], {OPUS: 1})
        self.assertFalse(claude.status(1000, self.state, {"loggedIn": True, "authMethod": "apiKey"})["available"])
        self.assertFalse(claude.subscription_login({"loggedIn": False, "authMethod": "claude.ai"}))
        self.state.write_text("[]")
        self.assertEqual(claude.read_state(self.state), {})

    def test_login_reads_auth_status_without_api_env(self):
        seen = {}

        def fake(cmd, **kwargs):
            seen.update(kwargs)
            return completed(json.dumps({"loggedIn": True, "authMethod": "claude.ai"}))

        with patch.object(claude.subprocess, "run", side_effect=fake):
            self.assertTrue(claude.login({"ANTHROPIC_API_KEY": "k"})["loggedIn"])
        self.assertNotIn("ANTHROPIC_API_KEY", seen["env"])
        with patch.object(claude.subprocess, "run", side_effect=OSError):
            self.assertEqual(claude.login(), {})
        with patch.object(claude.subprocess, "run", return_value=completed("[]")):
            self.assertEqual(claude.login(), {})

    def test_cli_entrypoints(self):
        prompt = Path(self.tmp.name) / "p.md"
        prompt.write_text("hello")
        with patch.object(claude, "run", return_value=0) as run:
            self.assertEqual(claude.main(["run", "--model", OPUS, "--prompt-file", str(prompt)]), 0)
        self.assertEqual(run.call_args.args[:2], (OPUS, "hello"))
        report = {"available": False, "authMethod": None, "banked": None, "windowRuns": 0}
        with patch.object(claude, "status", return_value=report), redirect_stdout(io.StringIO()) as out:
            self.assertEqual(claude.main(["health"]), 1)
            self.assertEqual(claude.main(["status"]), 0)
        self.assertIn("available: false", out.getvalue())


if __name__ == "__main__":
    unittest.main()
