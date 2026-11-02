"""Dormant Codex adapter: single-writer submission and conservative reconciliation."""
import ast
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import cloud_lane as c  # noqa: E402


def done(out="", code=0):
    return lambda *a, **k: subprocess.CompletedProcess(a, code, out, "")


class CloudLane(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.p = Path(self.tmp.name) / "l.jsonl"
        self.env = patch.dict(os.environ, {"CODEX_CLOUD_ENV": "env_test", "CODEX_CLOUD_BINARY": "/real/codex"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def go(self, task="J-1", labels=("cloud-lane",), text="fix typo", run=None, t=1000.0,
           provider="codex", branch="cloud/j-1", prompt="do it"):
        return c.route(task, provider, labels, text, branch, prompt, run=run or done("task_abc"),
                       now=lambda: t, path=self.p)

    def test_command_uses_explicit_real_binary_and_single_attempt(self):
        self.assertEqual(c.command("codex", "fix/x", "goal"),
                         ["/real/codex", "cloud", "exec", "--env", "env_test", "--attempts", "1", "--branch", "fix/x", "goal"])
        for env in ({"CODEX_CLOUD_ENV": "", "CODEX_CLOUD_BINARY": "/real/codex"},
                    {"CODEX_CLOUD_ENV": "env_test", "CODEX_CLOUD_BINARY": "codex"}):
            with patch.dict(os.environ, env):
                self.assertEqual(self.go()["reason"], "provider-unconfigured")
        self.assertEqual(self.go(provider="claude")["reason"], "provider-unconfigured")
        self.assertEqual(c.read(self.p), [])

    def test_opt_in_and_protected_input_prevent_submission(self):
        for options in ({"labels": ()}, {"labels": ("cloud-lane", "auth")},
                        {"text": "needs DATABASE_URL"}, {"prompt": "rotate api key"},
                        {"labels": ("cloud-lane", "hold")}):
            self.assertEqual(self.go(**options)["route"], "gem")
        self.assertEqual(c.read(self.p), [])

    def test_submit_records_remote_and_unmeasured_cost(self):
        self.assertEqual(self.go(), {"route": "cloud", "reason": "ok", "remote": "task_abc"})
        self.assertEqual([e["stage"] for e in c.read(self.p)], ["submitted", "accepted"])
        self.assertIsNone(c.stats(c.read(self.p))["codex"]["cost_usd"])

    def test_repeated_task_or_branch_never_submits_twice(self):
        calls = []
        def run(*a, **kw):
            calls.append(a)
            return done("task_abc")(*a, **kw)
        self.go(run=run)
        self.assertEqual(self.go(branch="different", run=run)["reason"], "already-submitted")
        self.assertEqual(self.go(task="different", run=run)["reason"], "already-submitted")
        self.assertEqual(len(calls), 1)

    def test_inflight_reservation_blocks_reentrant_submit(self):
        def run(*a, **kw):
            self.assertEqual(self.go()["reason"], "already-submitted")
            return done("task_abc")(*a, **kw)
        self.assertEqual(self.go(run=run)["route"], "cloud")

    def test_limit_backs_off_then_recovers(self):
        c.append({"task": "J-1", "branch": "cloud/j-1", "provider": "codex", "stage": "limit", "at": 1000}, self.p)
        self.assertEqual(self.go(t=1100)["reason"], "backoff")
        self.assertEqual(self.go(t=1901)["route"], "cloud")
        self.assertEqual(c.admit("unknown", 0, [])[1], "unknown-provider")

    def test_limits_and_success_reset_backoff(self):
        self.go(task="a", branch="a")
        self.go(task="b", branch="b")
        self.assertEqual(self.go(task="c", branch="c")["reason"], "concurrency")
        events = [{"provider": "codex", "task": str(i), "stage": stage, "at": 1}
                  for i in range(8) for stage in ("submitted", "pr_opened")]
        self.assertEqual(c.admit("codex", 2, events)[1], "daily-cap")
        self.assertEqual(c.admit("codex", 90000, events), (True, "ok"))
        events.extend([{"provider": "codex", "stage": "limit", "task": "limit", "at": 5},
                       {"provider": "codex", "stage": "pr_opened", "task": "0", "at": 6}])
        self.assertNotEqual(c.admit("codex", 10, events)[1], "backoff")

    def test_unknown_submissions_hold_and_preserve_capacity(self):
        def boom(*a, **kw):
            raise subprocess.TimeoutExpired("x", 1)
        for run in (boom, done("accepted but no id"), done("network failed", 1), done("task_abc 429", 1), done("capacity 429", 1)):
            with self.subTest(run=run):
                self.p.unlink(missing_ok=True)
                self.assertEqual(self.go(run=run)["route"], "held")
                self.assertEqual(self.go()["reason"], "already-submitted")
                events = c.read(self.p)
                self.assertEqual(c.admit("codex", 1001, events + [
                    {"provider": "codex", "stage": "submitted", "task": "second", "at": 1000}])[1], "concurrency")

    def test_status_is_read_only_and_unknown_never_completes(self):
        self.assertEqual(c.status("J-1", path=self.p)["reason"], "remote-id-missing")
        self.go()
        before = self.p.read_text()
        calls = []
        def run(cmd, **kw):
            calls.append(cmd)
            return done("completed")()
        self.assertEqual(c.status("J-1", run=run, path=self.p)["status"], "completed")
        self.assertEqual(calls, [["/real/codex", "cloud", "status", "task_abc"]])
        self.assertEqual(c.status("J-1", run=done("", 1), path=self.p)["route"], "held")
        def boom(*a, **kw):
            raise OSError("offline")
        self.assertEqual(c.status("J-1", run=boom, path=self.p)["route"], "held")
        with patch.dict(os.environ, {"CODEX_CLOUD_BINARY": ""}):
            self.assertEqual(c.status("J-1", path=self.p)["reason"], "provider-unconfigured")
        self.assertEqual(self.p.read_text(), before)

    def test_result_capture_requires_correlated_remote_id_and_is_idempotent(self):
        self.assertIsNone(c.poll("J-1", "codex", "cloud/j-1", gh=done("[]"), path=self.p))
        self.go()
        for out in ("invalid", "[]", "{}", '[{"body":"task_abcd"}]', '[{"number":4,"url":"u","body":"unrelated existing PR"}]'):
            self.assertIsNone(c.poll("J-1", "codex", "cloud/j-1", gh=done(out), path=self.p))
        self.assertIsNone(c.poll("J-1", "codex", "cloud/j-1", gh=done('[ {"body":"task_abc"}]', 1), path=self.p))
        capture = lambda: c.poll("J-1", "codex", "cloud/j-1", gh=done(
            '[{"number":5,"url":"u","body":"Codex task_abc"}]'), now=lambda: 1060.0, path=self.p)
        self.assertEqual(capture()["number"], 5)
        self.assertEqual(capture()["number"], 5)
        self.assertEqual(sum(e["stage"] == "pr_opened" for e in c.read(self.p)), 1)
        stats = c.stats(c.read(self.p))["codex"]
        self.assertEqual((stats["tasks"], stats["prs"], stats["time_to_pr_p50_s"]), (1, 1, 60.0))
        self.assertEqual(self.go()["route"], "held")

    def test_ledger_and_stats_cli(self):
        self.p.write_text("bad json\n")
        with self.assertRaises(ValueError):
            c.read(self.p)
        self.assertEqual(self.go()["reason"], "ledger-unreadable")
        self.p.write_text("{}\n")
        self.assertEqual(self.go()["reason"], "ledger-unreadable")
        self.assertIsNone(c.pct([], .5))
        with patch.object(c, "read", return_value=[]), patch("builtins.print"):
            self.assertEqual(c.main(["stats"]), 0)
            self.assertEqual(c.main([]), 2)

    def test_malformed_ledger_value_types_hold_without_submission(self):
        valid = {"task": "J-1", "provider": "codex", "stage": "submitted", "at": 1}
        for key, value in [("task", []), ("provider", {}), ("stage", []), ("at", "bad"),
                           ("at", True), ("at", float("nan")), ("at", -1), ("at", 10 ** 1000), ("branch", []), ("remote", {})]:
            with self.subTest(key=key, value=value):
                self.p.write_text(json.dumps({**valid, key: value}) + "\n")
                self.assertEqual(self.go()["reason"], "ledger-unreadable")
                self.assertEqual(c.status("J-1", path=self.p)["reason"], "ledger-unreadable")
                self.assertIsNone(c.poll("J-1", "codex", "cloud/j-1", gh=done(), path=self.p))

    def test_retry_after_rejection_still_occupies_capacity(self):
        c.append({"task": "J-1", "branch": "cloud/j-1", "provider": "codex", "stage": "limit", "at": 1}, self.p)
        self.assertEqual(self.go(t=1000)["route"], "cloud")
        self.assertEqual(self.go(task="second", branch="second", t=1001)["route"], "cloud")
        self.assertEqual(self.go(task="third", branch="third", t=1002)["reason"], "concurrency")

    def test_independent_task_collision_cannot_be_hidden_by_rejected_attempt(self):
        c.append({"task": "other", "branch": "cloud/j-1", "provider": "codex", "stage": "submitted", "at": 1}, self.p)
        c.append({"task": "J-1", "branch": "cloud/j-1", "provider": "codex", "stage": "limit", "at": 2}, self.p)
        self.assertEqual(self.go()["reason"], "already-submitted")

    def test_two_processes_share_one_reservation(self):
        calls = str(self.p.with_suffix(".calls"))
        script = """import sys, subprocess
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import cloud_lane as c
def run(*a, **kw):
    with open(sys.argv[3], 'a') as f: f.write('called\\n')
    return subprocess.CompletedProcess(a, 0, 'task_abc', '')
result = c.route('J-1', 'codex', ['cloud-lane'], 'typo', 'cloud/j-1', 'fix typo', run=run, path=sys.argv[2])
print(result['route'])
"""
        commands = [sys.executable, "-c", script, str(ROOT / "scripts/lanes"), str(self.p), calls]
        children = [subprocess.Popen(commands, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
        results = [child.communicate(timeout=10) for child in children]
        self.assertTrue(all(child.returncode == 0 for child in children), results)
        self.assertEqual(sorted(out.strip() for out, _ in results), ["cloud", "held"])
        self.assertEqual(Path(calls).read_text().splitlines(), ["called"])

    def test_no_runtime_activation(self):
        runner = ast.parse((ROOT / "scripts/lanes/lane_runner.py").read_text())
        imported = {n.module for n in ast.walk(runner) if isinstance(n, ast.ImportFrom)}
        imported.update(alias.name for n in ast.walk(runner) if isinstance(n, ast.Import) for alias in n.names)
        self.assertNotIn("cloud_lane", imported)
        routes = json.loads((ROOT / "scripts/lanes/routing.json").read_text())
        self.assertNotIn("cloud_lane", json.dumps(routes))
        self.assertNotIn("CODEX_CLOUD", json.dumps(routes))


if __name__ == "__main__":
    unittest.main()
