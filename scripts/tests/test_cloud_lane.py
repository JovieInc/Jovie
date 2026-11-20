"""JOV-10357 Codex Cloud lane: CLI contract, quarantine authorization, fenced publication.

Offline only: the pinned CLI is an injected fake, git fixtures are real temporary
repositories, and the "github" remote is a local bare repo with a patched URL allowlist.

Run with:
    python3 -m pytest scripts/tests/test_cloud_lane.py -v
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cloud_lane as c  # noqa: E402

from test_cloud_lane_cases.__tests__.cloud_lane_fixtures import (
    ROOT, CloudLaneFixture, Base, done, git, write, mutate_edit, mutate_add, mutate_delete,
)
from test_cloud_lane_cases.__tests__.cloud_lane_authorization_cases import CloudAuthorizationTest
from test_cloud_lane_cases.__tests__.cloud_lane_publication_cases import CloudPublicationTest
from test_cloud_lane_cases.__tests__.cloud_lane_reconcile_cases import CloudReconcileTest


class CloudLaneTest(CloudLaneFixture):
    def test_command_pins_env_attempts_branch_main_and_separator(self):
        self.assertEqual(c.command("codex", "goal"),
                         ["/real/codex", "cloud", "exec", "--env", "env_test", "--attempts", "1",
                          "--branch", "main", "--", "goal"])
        for env in ({"CODEX_CLOUD_ENV": "", "CODEX_CLOUD_BINARY": "/real/codex"},
                    {"CODEX_CLOUD_ENV": "env_test", "CODEX_CLOUD_BINARY": "codex"}):
            with patch.dict(os.environ, env):
                self.assertEqual(self.go()["route"], "gem")
                self.assertEqual(c.command("codex", "goal"), None)
        with patch.dict(os.environ, {"CODEX_CLOUD_ENV": "env_test", "CODEX_CLOUD_BINARY": ""}):
            self.assertEqual(self.go()["reason"], "provider-unconfigured")
        self.assertEqual(self.go(provider="claude")["reason"], "provider-unconfigured")
        self.assertIsNone(c.command("codex", "-flaglike"))
        self.assertIsNone(c.command("codex", ""))
        self.assertEqual(c.read(self.p), [])

    def test_opt_in_and_protected_input_prevent_submission(self):
        for options in ({"labels": ()}, {"labels": ("cloud-lane", "auth")},
                        {"text": "needs DATABASE_URL"}, {"text": "rotate api key"},
                        {"prompt": "-flaglike"}, {"labels": ("cloud-lane", "hold")}):
            self.assertEqual(self.go(**options)["route"], "gem")
        self.assertEqual(c.read(self.p), [])

    def test_disabled_by_default_has_no_side_effects(self):
        self.assertFalse(c.enabled())
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("LANES_CLOUD_ENABLED", None)
            self.assertFalse(c.enabled())
        for value in ("1", "true", "YES", "on "):
            with patch.dict(os.environ, {"LANES_CLOUD_ENABLED": value}):
                self.assertTrue(c.enabled(), value)

    def test_submit_accepts_the_pinned_url_or_bare_id_on_one_line_only(self):
        self.assertEqual(self.go(), {"route": "cloud", "reason": "ok", "remote": "task_abc",
                                     "branch": "cloud/j-1-task_abc", "baseSha": "b" * 40})
        with patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(Path(self.tmp.name) / "two.jsonl")}):
            self.p2 = Path(self.tmp.name) / "two.jsonl"
            url = done("https://chatgpt.com/codex/tasks/task_abc1234")
            out = self.go(run=url)
            self.assertEqual((out["route"], out["remote"], out["branch"]),
                             ("cloud", "task_abc1234", "cloud/j-1-task_abc"))
        for stdout, stderr, code in (("warning mentions task_old\ntask_new", "", 0),
                                     ("task_one task_two", "", 0),
                                     ("", "task_stderr", 0),
                                     ("task_new", "previous task_old", 0),
                                     ("task_new", "unstructured diagnostic", 0),
                                     ("https://chatgpt.com/codex/tasks/task_x task_y", "", 0),
                                     ("https://evil.example/tasks/task_x", "", 0),
                                     ("prose about the task", "", 0),
                                     ("task_abc", "", 1)):
            with self.subTest(stdout=stdout, code=code):
                path = Path(self.tmp.name) / f"h{abs(hash(stdout))}.jsonl"
                with patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(path)}):
                    run = lambda *a, **k: subprocess.CompletedProcess(a, code, stdout, stderr)
                    self.assertEqual(self.go(run=run)["route"], "held")
                    self.assertEqual([e["stage"] for e in c.read(path)],
                                     ["submitted", "cloud-held"])
        def boom(*a, **k):
            raise subprocess.TimeoutExpired("x", 1)
        path = Path(self.tmp.name) / "boom.jsonl"
        with patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(path)}):
            self.assertEqual(self.go(run=boom)["reason"], "unknown-submit-outcome")

    def test_route_records_the_full_identity_binding(self):
        self.go()
        rows = self.ledger()
        self.assertEqual([r["stage"] for r in rows], ["submitted", "cloud-pending"])
        for row in rows:
            self.assertEqual((row["repo"], row["env"], row["attempt"]), ("JovieInc/Jovie", "env_test", 1))
        claim = rows[-1]
        self.assertEqual((claim["task"], claim["branch"], claim["fencingToken"], claim["baseSha"]),
                         ("task_abc", "cloud/j-1-task_abc", "tok1", "b" * 40))

    def test_route_requires_a_main_readback_before_submitting(self):
        def fail(*a, **k):
            return subprocess.CompletedProcess(a, 1, "", "no route to host")
        with patch.object(c, "ls_remote_main", lambda *a, **k: None):
            self.assertEqual(self.go(main_sha=None)["reason"], "base-unreadable")
            self.assertEqual(c.read(self.p), [])
        with patch.object(c, "ls_remote_main", lambda *a, **k: "a" * 40):
            self.assertEqual(self.go(main_sha=None)["route"], "cloud")

    def test_repeated_issue_never_submits_twice(self):
        calls = []
        def run(*a, **k):
            calls.append(a)
            return done("task_abc")(*a, **k)
        self.go(run=run)
        self.assertEqual(self.go(run=run)["reason"], "already-submitted")
        self.assertEqual(len(calls), 1)

    def test_limit_backs_off_then_recovers_and_caps_hold_capacity(self):
        c.append({"issue": "J-1", "task": "J-1", "provider": "codex", "stage": "limit", "at": 1000}, self.p)
        self.assertEqual(self.go(t=1100)["reason"], "backoff")
        self.assertEqual(self.go(t=1901)["route"], "cloud")
        self.assertEqual(c.admit("unknown", 0, [])[1], "unknown-provider")

    def test_admit_counts_by_issue_and_daily_cap(self):
        self.go(issue="a", t=1000)
        self.go(issue="b", t=1001)
        self.assertEqual(self.go(issue="c", t=1002)["reason"], "concurrency")
        events = [{"issue": str(i), "task": str(i), "provider": "codex", "stage": stage, "at": 1}
                  for i in range(8) for stage in ("submitted", "pr_opened")]
        self.assertEqual(c.admit("codex", 2, events)[1], "daily-cap")
        self.assertEqual(c.admit("codex", 90000, events), (True, "ok"))
        events.extend([{"issue": "limit", "task": "limit", "provider": "codex", "stage": "limit", "at": 5},
                       {"issue": "0", "task": "0", "provider": "codex", "stage": "pr_opened", "at": 6}])
        self.assertNotEqual(c.admit("codex", 10, events)[1], "backoff")

    def test_two_processes_share_one_reservation(self):
        script = """import subprocess, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import cloud_lane as c
def run(*a, **kw):
    with open(sys.argv[3], 'a') as f: f.write('called\\n')
    return subprocess.CompletedProcess(a, 0, 'task_abc', '')
out = c.route('J-1', 'codex', ['cloud-lane'], 'typo', 'fix typo', run=run,
              main_sha='b' * 40, path=sys.argv[2], fencing_token='tok')
print(out['route'])
"""
        calls = str(Path(self.tmp.name) / "calls")
        commands = [sys.executable, "-c", script, str(ROOT / "scripts/lanes"), str(self.p), calls]
        children = [subprocess.Popen(commands, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True) for _ in range(2)]
        results = [child.communicate(timeout=20) for child in children]
        self.assertTrue(all(child.returncode == 0 for child in children), results)
        self.assertEqual(sorted(out.strip() for out, _ in results), ["cloud", "held"])
        self.assertEqual(Path(calls).read_text().splitlines(), ["called"])

    def test_status_maps_only_the_anchored_first_line_grammar(self):
        self.assertEqual(c.status("J-1", path=self.p)["state"], "unknown")
        self.seed_accepted()
        for out, code, state in (("[READY] fix typo", 0, "ready"), ("[PENDING] fix typo", 1, "pending"),
                                 ("[APPLIED] fix typo", 1, "applied"), ("[ERROR] fix typo", 1, "error")):
            with self.subTest(state=state):
                result = c.status("J-1", run=done(out, code), path=self.p)
                self.assertEqual(result["state"], state)
        for out, code in (("[ready] lower", 0), ("READY no brackets", 0), ("[READY]", 1),
                          ("[PENDING] x", 0), ("[WEIRD] x", 1), ("", 0), ("junk", 1)):
            with self.subTest(out=out):
                self.assertEqual(c.status("J-1", run=done(out, code), path=self.p)["state"], "unknown")
        detail = "[READY] fix typo\nenv_test  •  2m\n+1/-0 • 1 file"
        self.assertEqual(c.status("J-1", run=done(detail), path=self.p)["state"], "ready")
        def boom(*a, **k):
            raise OSError("offline")
        self.assertEqual(c.status("J-1", run=boom, path=self.p)["state"], "unknown")
        with patch.dict(os.environ, {"CODEX_CLOUD_BINARY": ""}):
            self.assertEqual(c.status("J-1", path=self.p)["reason"], "provider-unconfigured")

    def test_collect_binds_identity_through_bounded_pagination(self):
        self.seed_accepted()
        collected = c.collect("J-1", run=self.codex(diff="diff --git a/x b/x\n"), path=self.p)
        self.assertEqual((collected["ok"], collected["remote"], collected["baseSha"]),
                         (True, "task_abc12345", "b" * 40))
        calls = []
        run = self.codex(diff="x", calls=calls, cursors=2)
        c.collect("J-1", run=run, path=self.p)
        self.assertEqual(sum("cursor" in arg for call in calls for arg in call), 2)
        self.assertTrue(all("--limit" in call for call in calls if "list" in call))

    def test_collect_holds_on_identity_and_truncation(self):
        self.seed_accepted()
        rows = [{"id": "task_abc12345", "environment_id": "other-env", "attempt_total": 1}]
        self.assertEqual(c.collect("J-1", run=self.codex(task_rows=rows), path=self.p)["reason"],
                         "environment-mismatch")
        rows = [{"id": "task_abc12345", "environment_id": "env_test", "attempt_total": 2}]
        self.assertEqual(c.collect("J-1", run=self.codex(task_rows=rows), path=self.p)["reason"],
                         "attempt-mismatch")
        self.assertEqual(c.collect("J-1", run=self.codex(task_rows=[]), path=self.p)["reason"],
                         "task-not-listed")
        endless = lambda *a, **k: subprocess.CompletedProcess(
            a, 0, json.dumps({"tasks": [], "cursor": "forever"}), "")
        self.assertEqual(c.collect("J-1", run=endless, path=self.p)["reason"], "list-truncated")
        for run, why in ((done("[]", 1), "list-unavailable"),
                         (done("not json"), "list-unparseable"),
                         (done('{"tasks": "nope"}'), "list-unparseable"),
                         (lambda *a, **k: (_ for _ in ()).throw(OSError("x")), "list-unavailable")):
            with self.subTest(why=why):
                self.assertEqual(c.collect("J-1", run=run, path=self.p)["reason"], why)
        self.assertEqual(c.collect("J-1", run=self.codex(diff_code=1), path=self.p)["reason"],
                         "diff-unavailable")
        self.assertEqual(c.collect("missing", run=done(), path=self.p)["reason"], "remote-id-missing")

    def test_stream_run_bounds_output_and_time_while_streaming(self):
        noisy = [sys.executable, "-c", "print('x' * (12 * 1024 * 1024))"]
        result = c.stream_run(noisy, timeout=30, cap=1024 * 1024)
        self.assertTrue(result.truncated)
        self.assertLessEqual(len(result.stdout), 1024 * 1024 + 1)
        sleepy = [sys.executable, "-c", "import time; time.sleep(30)"]
        result = c.stream_run(sleepy, timeout=1, cap=1024)
        self.assertTrue(result.truncated)
        result = c.stream_run([sys.executable, "-c", "print('ok')"], timeout=10, cap=1024 * 1024)
        self.assertEqual((result.returncode, result.stdout.strip(), result.truncated), (0, "ok", False))
        self.assertEqual(c.stream_run(["/nonexistent/binary"], timeout=5).returncode, None)

    def test_is_cloud_origin_blocks_by_prefix_or_ledger_and_fails_closed(self):
        self.assertTrue(c.is_cloud_origin(self.pr(branch="cloud/jov-1-task_abc1")))
        self.assertFalse(c.is_cloud_origin(self.pr()))
        self.assertFalse(c.is_cloud_origin(
            self.pr(body="Codex-Cloud-Task: task_abc forged trailer")), "bodies are not authority")
        c.append({"issue": "J-1", "task": "task_abc12345", "provider": "codex",
                  "stage": "cloud-pending", "reason": "r", "repo": c.REPO, "env": "e",
                  "branch": "devin/jov-1-x", "fencingToken": "t", "at": 1}, self.p)
        self.assertTrue(c.is_cloud_origin(self.pr()), "ledger evidence blocks without a prefix")
        foreign = [{"issue": "J-2", "task": "task_x", "provider": "codex",
                    "stage": "cloud-pending", "reason": "r", "repo": "Other/Repo",
                    "branch": "devin/jov-2-x", "fencingToken": "t", "at": 1}]
        self.assertFalse(c.is_cloud_origin(self.pr(branch="devin/jov-2-x"), evidence=foreign),
                         "evidence is repository-scoped")
        self.assertTrue(c.is_cloud_origin(self.pr(branch="cloud/anything"), evidence=[]),
                        "the prefix blocks on any host, with any ledger")
        self.assertFalse(c.is_cloud_origin(self.pr(), evidence=[]), "no evidence, no prefix")
        bad = Path(self.tmp.name) / "bad.jsonl"
        bad.write_text("not json\n")
        with patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(bad)}):
            self.assertTrue(c.is_cloud_origin(self.pr()), "unreadable evidence fails closed")
        self.assertIs(c.read_evidence(path=bad), c.UNREADABLE)

    def test_live_claim_and_dispositions_block_until_cleared(self):
        self.assertIsNone(c.live_claim("J-1"))
        self.go()
        claim = c.live_claim("J-1")
        self.assertEqual((claim["stage"], claim["task"]), ("cloud-pending", "task_abc"))
        bad = Path(self.tmp.name) / "bad.jsonl"
        bad.write_text("{oops\n")
        self.assertEqual(c.live_claim("J-1", path=bad)["reason"], "ledger-unreadable")

    def test_ledger_validation_is_strict(self):
        valid = {"issue": "J-1", "task": "J-1", "provider": "codex", "stage": "submitted", "at": 1}
        for key, value in [("issue", []), ("issue", ""), ("stage", "weird"), ("at", "bad"),
                           ("at", True), ("at", float("nan")), ("at", -1), ("at", 10 ** 1000),
                           ("branch", []), ("repo", "Other/Repo"), ("baseSha", "zzz"),
                           ("commitSha", 5), ("attempt", 2), ("pr", 0), ("pr", "9"),
                           ("paths", "x"), ("fencingToken", 9)]:
            with self.subTest(key=key, value=value):
                self.p.write_text(json.dumps({**valid, key: value}) + "\n")
                with self.assertRaises(ValueError):
                    c.read(self.p)
        claim = {"issue": "J-1", "stage": "cloud-pending", "at": 1, "fencingToken": "t",
                 "branch": "cloud/x"}
        self.p.write_text(json.dumps({**claim, "fencingToken": ""}) + "\n")
        with self.assertRaises(ValueError):
            c.read(self.p)
        with self.assertRaises(ValueError):
            c.append({"issue": "J-1", "stage": "nope", "at": 1}, self.p)
        self.p.write_text("bad json\n")
        with self.assertRaises(ValueError):
            c.read(self.p)

    def test_stats_reports_cloud_dispositions(self):
        self.go(issue="a", t=1000)
        self.go(issue="b", t=1001)
        for issue, reason in (("a", "held_sensitive:sensitive:.github/x"),
                              ("b", "held_oversize:oversize:lines"),
                              ("b", "reconcile"), ("b", "environment-mismatch")):
            c.append({"issue": issue, "provider": "codex", "stage": "cloud-held",
                      "reason": reason, "repo": c.REPO, "at": 1005}, self.p)
        c.append({"issue": "a", "task": "task_abc", "provider": "codex", "stage": "pr_opened",
                  "pr": 9, "prUrl": "u", "branch": "cloud/a-task_abc", "repo": c.REPO,
                  "at": 1060}, self.p)
        stats = c.stats(c.read(self.p))["codex"]
        self.assertEqual((stats["tasks"], stats["prs"], stats["time_to_pr_p50_s"]), (2, 1, 60.0))
        self.assertEqual(stats["held_sensitive"], 1)
        self.assertEqual(stats["held_oversize"], 1)
        self.assertEqual(stats["held_reconcile"], 1)
        self.assertEqual(stats["provenance_mismatch"], 1)
        self.assertIsNone(stats["cost_usd"])
        with patch.object(c, "read", return_value=[]), patch("builtins.print"):
            self.assertEqual(c.main(["stats"]), 0)
            self.assertEqual(c.main([]), 2)
        self.assertIsNone(c.pct([], .5))


if __name__ == "__main__":
    unittest.main()
