"""CloudPublicationTest: collected through test_cloud_lane.py in existing CI selectors."""
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

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import cloud_lane as c  # noqa: E402

from .cloud_lane_fixtures import (
    ROOT, CloudLaneFixture, Base, done, git, write, mutate_edit, mutate_add, mutate_delete,
)


class CloudPublicationTest(CloudLaneFixture):
    def test_publish_transfers_verifies_pushes_once_and_opens_a_draft(self):
        base, remote, publish = self.remote()
        verdict = self.auth(base.patch(mutate_add("docs/note.md")), base)
        calls = []
        head = {}
        def gh_run(args):
            calls.append(list(args))
            if args[:2] == ["pr", "view"]:
                head.setdefault("sha", None)
                payload = {"number": 9, "isDraft": True, "baseRefName": "main",
                           "headRefName": "cloud/jov-1-task_abc1", "headRefOid": head["sha"],
                           "url": "https://github.com/JovieInc/Jovie/pull/9"}
                return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")
            if args[:2] == ["pr", "create"]:
                commit = [e for e in c.read(self.p) if e["stage"] == "pushed"][-1]["commitSha"]
                head["sha"] = commit
                return subprocess.CompletedProcess(args, 0,
                                                   "https://github.com/JovieInc/Jovie/pull/9\n", "")
            raise AssertionError(args)
        result = self.publish(base, remote, publish, verdict, gh=gh_run)
        c.discard(verdict["quarantine"])
        self.assertEqual(result["route"], "pr_opened")
        self.assertEqual(result["pr"], 9)
        commit = result["commitSha"]
        self.assertEqual(git(["rev-parse", "cloud/jov-1-task_abc1"], remote).stdout.strip(), commit)
        self.assertEqual(git(["rev-parse", commit + "^{tree}"], publish).stdout.strip(),
                         verdict["candTree"])
        self.assertEqual(git(["rev-list", "--parents", "-n", "1", commit], publish).stdout.split(),
                         [commit, base.sha])
        create = next(call for call in calls if call[:2] == ["pr", "create"])
        self.assertIn("--draft", create)
        body = create[create.index("--body") + 1]
        self.assertIn("Refs J-1", body)
        self.assertIn("Codex-Cloud-Task: task_abc12345", body)
        self.assertIn("Base: " + base.sha, body)
        self.assertIn("- docs/note.md", body)
        self.assertNotIn("@", body)
        self.assertNotRegex(body, r"(?i)\b(closes?|fixes?|resolves?)\b")
        stages = [e["stage"] for e in c.read(self.p)]
        self.assertIn("intent:push", stages)
        self.assertIn("pushed", stages)
        self.assertIn("intent:pr", stages)
        self.assertEqual(stages[-1], "cloud-draft-created")

    def test_publish_holds_on_url_rewrites_wrong_urls_and_moved_base(self):
        base, remote, publish = self.remote()
        verdict = self.auth(base.patch(mutate_add("docs/n.md")), base)
        with patch.object(c, "PUSH_URL_RE", re.compile(r"https://github\.com/JovieInc/Jovie")):
            self.assertEqual(c.publish_candidate(
                "J-1", "task_abc12345", verdict["quarantine"], verdict["candTree"], base.sha,
                "cloud/jov-1-task_abc1", repo_dir=publish, url="https://github.com/Evil/Repo.git",
                path=self.p, fencing_token="tok1", paths=verdict["paths"])["reason"],
                "push-url-invalid")
        git(["config", "url.https://evil.example/.insteadOf", str(remote)], publish)
        self.assertEqual(self.publish(base, remote, publish, verdict)["reason"], "push-url-rewrite")
        git(["config", "--unset", "url.https://evil.example/.insteadOf"], publish)
        git(["commit", "-q", "--allow-empty", "-m", "main moved"], base.dir)
        git(["push", "-q", str(remote), "HEAD:refs/heads/main"], base.dir)
        self.assertEqual(self.publish(base, remote, publish, verdict)["reason"], "base-moved")
        c.discard(verdict["quarantine"])

    def test_publish_never_retries_as_plain_push_or_over_a_foreign_branch(self):
        base, remote, publish = self.remote()
        verdict = self.auth(base.patch(mutate_add("docs/n.md")), base)
        git(["commit", "-q", "--allow-empty", "-m", "foreign"], base.dir)
        sha = git(["rev-parse", "HEAD"], base.dir).stdout.strip()
        git(["push", "-q", str(remote), f"{sha}:refs/heads/cloud/jov-1-task_abc1"], base.dir)
        result = self.publish(base, remote, publish, verdict)
        self.assertEqual(result["route"], "held")
        self.assertEqual(result["reason"], "branch-exists")
        self.assertEqual(git(["rev-parse", "cloud/jov-1-task_abc1"], remote).stdout.strip(), sha)
        c.discard(verdict["quarantine"])

    def test_publish_readback_mismatch_and_pr_failure_hold(self):
        base, remote, publish = self.remote()
        verdict = self.auth(base.patch(mutate_add("docs/n.md")), base)
        result = self.publish(base, remote, publish, verdict, gh=self.gh(head="wrong"))
        self.assertEqual(result["reason"], "readback-mismatch")
        c.discard(verdict["quarantine"])

        verdict = self.auth(base.patch(mutate_add("docs/n2.md")), base)
        result = self.publish(base, remote, publish, verdict, task="task_fail1",
                              branch="cloud/jov-1-fail1",
                              gh=self.gh(create_url="", branch="cloud/jov-1-fail1"))
        self.assertEqual(result["reason"], "pr-create-failed")
        c.discard(verdict["quarantine"])
        for index, bad in enumerate((done("no url", 1),
                                     done("https://github.com/JovieInc/Jovie/pull/notanumber"))):
            branch = f"cloud/jov-1-fail{index + 2}"
            verdict = self.auth(base.patch(mutate_add(f"docs/fail{index}.md")), base)
            result = self.publish(base, remote, publish, verdict, task=f"task_fail{index + 2}",
                                  branch=branch, gh=(lambda b: lambda args: b(args))(bad))
            self.assertEqual(result["reason"], "pr-create-failed", result)
            c.discard(verdict["quarantine"])

    def test_draft_only_source_never_readies_merges_or_enqueues(self):
        source = "\n".join(path.read_text() for path in
                           sorted((ROOT / "scripts/lanes").glob("cloud_lane*.py")))
        for banned in ('"pr", "ready"', "--auto", "merge", "enqueue", "gh pr merge"):
            self.assertNotIn(banned, source, banned)
        self.assertIn('"pr", "create", "--draft"', source)
        self.assertEqual(c.RETAINED_VERDICTS,
                         {"cloud-pending", "cloud-held", "cloud-draft-created"})

    def test_default_github_client_has_one_attempt_no_wait_and_bounded_execution(self):
        import cloud_lane_process
        sys.path.insert(0, str(ROOT / "scripts"))
        from apiclient import gh as client
        args = ["pr", "create", "--draft"]
        raw = subprocess.CompletedProcess(args, 75, "", "quota-deferred")
        def admitted(argv, **kwargs):
            self.assertEqual(argv, args)
            self.assertEqual(kwargs["priority"], "repair")
            self.assertEqual(kwargs["max_attempts"], 1)
            self.assertEqual(kwargs["max_wait_ms"], 0)
            self.assertEqual(kwargs["run"](argv, {}), (75, "", "quota-deferred"))
            return {"code": 75, "stdout": "", "stderr": "quota-deferred"}
        with patch.object(client, "run_gh", side_effect=admitted), \
                patch.object(client.subprocess, "run", return_value=raw) as process:
            result = cloud_lane_process.budgeted_gh(args)
        process.assert_called_once_with(["gh", *args], env={}, capture_output=True,
                                        text=True, timeout=120)
        self.assertEqual((result.returncode, result.stderr), (75, "quota-deferred"))
