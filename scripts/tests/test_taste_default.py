"""Hermetic tests for the founder-taste default-with-deadline lane."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
spec = importlib.util.spec_from_file_location("taste_default", ROOT / "scripts/lanes/taste_default.py")
td = importlib.util.module_from_spec(spec)
spec.loader.exec_module(td)

SHA = "381a4282e16abd02365dd7f2328c9e65d56ab70e"
NOW = 1_800_000_000.0


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def lifecycle(issue="JOV-1", owed=("founder-taste",), verified=True, at=NOW - 3600):
    manifest = {"schema": "jovie.validation-manifest/v1", "issue": issue, "receiptNotBefore": "2026-10-20T00:00:00Z"}
    lines = [f"Validation lifecycle kept {issue} in Validating.",
             *([f"Verified production generation: {SHA}."] if verified else []),
             *[f"- {kind}: no current receipt (UI change)" for kind in owed],
             "<!-- validation-manifest:v1", json.dumps(manifest), "-->", "<!-- validation-lifecycle:v1 abc123 -->"]
    return {"body": "\n".join(lines), "createdAt": iso(at)}


def issue(identifier="JOV-1", entered=NOW - 3 * 86400, comments=None):
    return {"id": f"uuid-{identifier}", "identifier": identifier, "title": f"Title of {identifier}",
            "history": {"nodes": [{"createdAt": iso(entered), "toState": {"name": "Validating"}},
                                  {"createdAt": iso(entered - 9999), "toState": {"name": "Merging"}}]},
            "comments": {"nodes": comments if comments is not None else [lifecycle(issue=identifier, at=entered + 60)]}}


class TasteDefaultTest(unittest.TestCase):
    def test_wait_clock_starts_when_the_issue_last_entered_validating(self):
        ask = td.taste_ask(issue(entered=NOW - 3 * 86400), NOW)
        self.assertEqual((ask["sha"], ask["due"]), (SHA, True))
        young = td.taste_ask(issue(entered=NOW - 40 * 3600), NOW)
        self.assertFalse(young["due"])
        self.assertAlmostEqual(young["deadlineAt"] - NOW, 8 * 3600, delta=1)

    def test_only_a_verified_generation_that_still_owes_taste_is_asked(self):
        self.assertIsNone(td.taste_ask(issue(comments=[lifecycle(owed=("screen-audit",))]), NOW))
        self.assertIsNone(td.taste_ask(issue(comments=[lifecycle(verified=False)]), NOW))
        self.assertIsNone(td.taste_ask(issue(comments=[lifecycle(issue="JOV-9")]), NOW))
        self.assertIsNone(td.taste_ask(issue(comments=[]), NOW))
        # The alternating deployment-missing comment does not hide the verified ask beneath it.
        newest_unverified = lifecycle(verified=False, at=NOW - 60)
        self.assertEqual(td.taste_ask(issue(comments=[lifecycle(at=NOW - 7200), newest_unverified]), NOW)["sha"], SHA)

    def test_receipt_is_a_default_accepted_pass_on_the_verified_generation(self):
        ask = td.taste_ask(issue(), NOW)
        args = td.receipt_args("JOV-1", ask)
        self.assertEqual(args[:2], ["receipt", "--issue"])
        self.assertEqual(args[args.index("--kind") + 1], "founder-taste")
        self.assertEqual(args[args.index("--status") + 1], "pass")
        self.assertEqual(args[args.index("--sha") + 1], SHA)
        self.assertTrue(args[args.index("--evidence") + 1].startswith("default-accepted:"))
        self.assertEqual(args[args.index("--episode-started-at") + 1], "2026-10-20T00:00:00Z")

    def pass_(self, issues, *, dry_run=False, existing=None, authorization="Bearer app"):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        if existing:
            td.write_state(state, existing)
        comments, calls = [], []

        class Linear:
            def __init__(self, env):
                pass
            def gql(self, query, variables):
                if "pageInfo" in query:
                    return {"issues": {"nodes": issues, "pageInfo": {"hasNextPage": False, "endCursor": None}}}
                return {"issues": {"nodes": [{"id": "digest-issue"}]}}
            def comment(self, issue_id, body):
                comments.append((issue_id, body))

        host = SimpleNamespace(state=state, repo=state / "repo", linear_env=None)
        def run(args, **kw):
            calls.append((list(args), kw))
            return subprocess.CompletedProcess(args, 0, "", "")
        with patch.object(td.outcome_lane, "app_authorization", return_value=authorization), \
                patch.object(td.outcome_lane, "node24_path", return_value="/n24/bin"):
            result = td.run_pass(host, SimpleNamespace(Linear=Linear), now=NOW, dry_run=dry_run, run=run)
        return result, calls, comments, state

    def test_due_issues_get_a_receipt_and_waiting_ones_only_a_digest_entry(self):
        due, waiting = issue("JOV-1", entered=NOW - 3 * 86400), issue("JOV-2", entered=NOW - 20 * 3600)
        result, calls, comments, state = self.pass_([due, waiting])
        self.assertEqual((result["recorded"], result["waiting"], result["digest"]), (["JOV-1"], 1, "posted"))
        node = calls[0]
        self.assertEqual(node[0][0], "node")
        self.assertEqual(node[1]["env"]["LINEAR_API_KEY"], "Bearer app")
        self.assertTrue(node[1]["env"]["PATH"].startswith("/n24/bin"))
        self.assertEqual(len(calls), 1)
        self.assertEqual(comments[0][0], "digest-issue")
        self.assertIn("JOV-2", comments[0][1])
        self.assertIn("default in 28h", comments[0][1])
        self.assertIn("JOV-1", comments[0][1])
        self.assertEqual(td.read_state(state)["JOV-1"]["result"], "recorded")
        # Same facts a minute later: no second receipt, no second digest.
        again, calls2, comments2, _ = self.pass_([due, waiting], existing=td.read_state(state))
        self.assertEqual((calls2, comments2), ([], []))

    def test_dry_run_and_missing_credentials_write_nothing(self):
        result, calls, comments, state = self.pass_([issue()], dry_run=True)
        self.assertEqual((calls, comments, result["recorded"]), ([], [], ["JOV-1"]))
        self.assertEqual(td.read_state(state), {})
        result, calls, comments, _ = self.pass_([issue()], authorization=None)
        self.assertEqual((result["status"], calls), ("linear-app-unavailable", []))

    def test_tick_is_hourly_and_skipped_in_selftests(self):
        with tempfile.TemporaryDirectory() as raw:
            host = SimpleNamespace(state=Path(raw))
            spawned = []
            spawn = lambda *a, **k: spawned.append(a)
            clean = {k: v for k, v in __import__("os").environ.items()
                     if k not in ("LANES_SELFTEST", "LANES_EXECUTION_BACKEND", "LANES_TASTE_DEFAULT")}
            with patch.dict("os.environ", clean, clear=True):
                self.assertEqual(td.tick(host, None, spawn=spawn)["status"], "spawned")
                self.assertEqual(td.tick(host, None, spawn=spawn)["status"], "not-due")
            with patch.dict("os.environ", {"LANES_SELFTEST": "1"}):
                self.assertEqual(td.tick(host, None, spawn=spawn)["status"], "selftest-skipped")
            self.assertEqual(len(spawned), 1)


if __name__ == "__main__":
    unittest.main()
