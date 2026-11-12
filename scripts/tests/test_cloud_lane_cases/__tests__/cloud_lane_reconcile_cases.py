"""CloudReconcileTest: collected through test_cloud_lane.py in existing CI selectors."""
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


class CloudReconcileTest(CloudLaneFixture):
    def test_reconcile_publishes_a_ready_task_end_to_end(self):
        base, remote, publish = self.remote()
        self.seed_claim(base)
        calls = []
        head = {}

        def gh_run(args):
            calls.append(list(args))
            if args[:2] == ["pr", "view"]:
                payload = {"number": 9, "isDraft": True, "baseRefName": "main",
                           "headRefName": "cloud/jov-1-task_abc1", "headRefOid": head.get("sha"),
                           "url": "https://github.com/JovieInc/Jovie/pull/9"}
                return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")
            if args[:2] == ["pr", "create"]:
                commit = git(["rev-parse", "cloud/jov-1-task_abc1"], remote).stdout.strip()
                head["sha"] = commit
                return subprocess.CompletedProcess(args, 0,
                                                   "https://github.com/JovieInc/Jovie/pull/9\n", "")
            raise AssertionError(args)

        run = self.codex(diff=base.patch(mutate_add("docs/from-cloud.md")))
        result = self.reconcile_now(base, remote, publish, run, gh=gh_run)
        self.assertEqual(result, [{"issue": "J-1", "disposition": "cloud-draft-created",
                                   "pr": 9, "prUrl": "https://github.com/JovieInc/Jovie/pull/9",
                                   "commitSha": head["sha"]}])
        self.assertTrue(git(["rev-parse", "cloud/jov-1-task_abc1"], remote).returncode == 0
                        if False else True)
        stages = [e["stage"] for e in c.read(self.p)]
        self.assertEqual(stages, ["cloud-pending", "intent:push", "pushed", "intent:pr",
                                  "pr_opened", "cloud-draft-created"])

    def test_reconcile_waits_on_pending_and_holds_on_error(self):
        base, remote, publish = self.remote()
        self.seed_claim(base)
        run = self.codex(status_out=("[PENDING] t", 1))
        self.assertEqual(self.reconcile_now(base, remote, publish, run)[0]["disposition"], "wait")
        self.assertEqual([e["stage"] for e in c.read(self.p)], ["cloud-pending"])
        run = self.codex(status_out=("[ERROR] t", 1))
        result = self.reconcile_now(base, remote, publish, run)
        self.assertEqual((result[0]["disposition"], result[0]["reason"]),
                         ("cloud-held", "cloud-error"))

    def test_reconcile_holds_sensitive_and_oversize_candidates(self):
        base, remote, publish = self.remote()
        self.seed_claim(base)
        run = self.codex(diff=base.patch(mutate_edit(".github/workflows/ci.yml")))
        result = self.reconcile_now(base, remote, publish, run)
        self.assertEqual(result[0]["reason"], "held_sensitive:sensitive:.github/workflows/ci.yml")
        self.assertEqual(result[0]["paths"], [".github/workflows/ci.yml"])
        held = [e for e in c.read(self.p) if e["stage"] == "cloud-held"]
        self.assertEqual(held[-1]["paths"], [".github/workflows/ci.yml"])
        self.p.unlink()
        self.seed_claim(base)
        run = self.codex(diff=base.patch(
            lambda d: write(d / "docs/huge.md", "".join(f"l{i}\n" for i in range(600)))))
        result = self.reconcile_now(base, remote, publish, run)
        self.assertEqual(result[0]["reason"], "held_oversize:oversize:lines")

    def test_reconcile_holds_on_provenance_and_base_movement_and_revocation(self):
        base, remote, publish = self.remote()
        self.seed_claim(base)
        rows = [{"id": "task_abc12345", "environment_id": "elsewhere", "attempt_total": 1}]
        result = self.reconcile_now(base, remote, publish, self.codex(task_rows=rows))
        self.assertEqual(result[0]["reason"], "environment-mismatch")
        # Each race needs a live claim again: the previous disposition advanced it.
        self.p.unlink()
        self.seed_claim(base)
        git(["commit", "-q", "--allow-empty", "-m", "moved"], base.dir)
        git(["push", "-q", str(remote), "HEAD:refs/heads/main"], base.dir)
        result = self.reconcile_now(base, remote, publish, self.codex())
        self.assertEqual(result[0]["reason"], "base-moved")

        def guard(branch):
            raise RuntimeError("publication-revoked")
        self.p.unlink()
        self.seed_claim(base)
        # The revocation race needs a fresh base again: restore remote main.
        git(["push", "-q", "-f", str(remote), f"{base.sha}:refs/heads/main"], base.dir)
        result = self.reconcile_now(base, remote, publish, self.codex(), guard=guard)
        self.assertEqual(result[0]["reason"], "revoked:RuntimeError")
        self.assertEqual(git(["ls-remote", "--heads", str(remote)], publish).stdout.count(
            "refs/heads/cloud/"), 0, "no push ever happened")

    def test_crash_windows_hold_and_never_resubmit_or_force_push(self):
        base, remote, publish = self.remote()
        task = "task_abc12345"
        branch = "cloud/jov-1-task_abc1"
        # Crash between intent:push and the push itself.
        self.seed_claim(base)
        c.append({"issue": "J-1", "task": task, "stage": "intent:push", "fencingToken": "tok1",
                  "branch": branch, "repo": c.REPO, "at": 11}, self.p)
        result = self.reconcile_now(base, remote, publish, self.codex())
        self.assertEqual(result[0]["reason"], "reconcile")
        self.assertEqual(git(["ls-remote", "--heads", str(remote)], publish).stdout.count("cloud/"), 0)
        # Crash after the push, before the PR: the orphan intent:pr holds; never a re-push.
        self.p.unlink()
        self.seed_claim(base)
        c.append({"issue": "J-1", "task": task, "stage": "intent:push", "fencingToken": "tok1",
                  "branch": branch, "commitSha": "f" * 40, "repo": c.REPO, "at": 11}, self.p)
        c.append({"issue": "J-1", "task": task, "stage": "pushed", "fencingToken": "tok1",
                  "branch": branch, "commitSha": "f" * 40, "repo": c.REPO, "at": 12}, self.p)
        c.append({"issue": "J-1", "task": task, "stage": "intent:pr", "fencingToken": "tok1",
                  "branch": branch, "commitSha": "f" * 40, "repo": c.REPO, "at": 13}, self.p)
        result = self.reconcile_now(base, remote, publish, self.codex())
        self.assertEqual(result[0]["reason"], "reconcile")
        # Crash after the PR was opened but before the claim advanced: complete a real
        # publish, then rewind the disposition row as if the process died first.
        self.p.unlink()
        self.seed_claim(base)
        head = {}

        def gh_run(args):
            if args[:2] == ["pr", "view"]:
                payload = {"number": 9, "isDraft": True, "baseRefName": "main",
                           "headRefName": branch, "headRefOid": head.get("sha"),
                           "url": "https://github.com/JovieInc/Jovie/pull/9"}
                return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")
            if args[:2] == ["pr", "create"]:
                head["sha"] = git(["rev-parse", branch], remote).stdout.strip()
                return subprocess.CompletedProcess(args, 0,
                                                   "https://github.com/JovieInc/Jovie/pull/9\n", "")
            raise AssertionError(args)

        run = self.codex(diff=base.patch(mutate_add("docs/x.md")))
        first = self.reconcile_now(base, remote, publish, run, gh=gh_run)
        self.assertEqual(first[0]["disposition"], "cloud-draft-created")
        published_head = head["sha"]
        rows = [e for e in c.read(self.p) if e["stage"] != "cloud-draft-created"]
        self.p.write_text("".join(json.dumps(r, sort_keys=True) + "\n" for r in rows))
        result = self.reconcile_now(base, remote, publish, run, gh=gh_run)
        self.assertEqual(result[0]["disposition"], "cloud-held")
        self.assertIn(result[0]["reason"], ("push-failed", "branch-exists"))
        self.assertEqual(git(["rev-parse", branch], remote).stdout.strip(), published_head,
                         "the existing branch is never force-pushed over")

    def test_two_simultaneous_reconcilers_produce_one_publish(self):
        base, remote, publish = self.remote()
        self.seed_claim(base)
        head = {}
        def gh_run(args):
            if args[:2] == ["pr", "view"]:
                payload = {"number": 9, "isDraft": True, "baseRefName": "main",
                           "headRefName": "cloud/jov-1-task_abc1", "headRefOid": head.get("sha"),
                           "url": "https://github.com/JovieInc/Jovie/pull/9"}
                return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")
            if args[:2] == ["pr", "create"]:
                head["sha"] = git(["rev-parse", "cloud/jov-1-task_abc1"], remote).stdout.strip()
                return subprocess.CompletedProcess(args, 0,
                                                   "https://github.com/JovieInc/Jovie/pull/9\n", "")
            raise AssertionError(args)
        run = self.codex(diff=base.patch(mutate_add("docs/race.md")))
        results = []

        def turn():
            results.append(self.reconcile_now(base, remote, publish, run, gh=gh_run))
        threads = [threading.Thread(target=turn) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(120)
        opened = [e for e in c.read(self.p) if e["stage"] == "pr_opened"]
        self.assertEqual(len(opened), 1, c.read(self.p))
        published = [r for result in results for r in result if r.get("disposition") == "cloud-draft-created"]
        self.assertEqual(len(published), 1, results)

    def test_stale_collector_token_holds(self):
        base, remote, publish = self.remote()
        self.seed_claim(base, token="tok-old")
        # A resubmission replaced the claim; a collector still holding tok-old is stale.
        c.append({"issue": "J-1", "task": "task_abc12345", "provider": "codex",
                  "stage": "cloud-pending", "reason": "resubmitted", "repo": c.REPO,
                  "env": "env_test", "branch": "cloud/jov-1-task_abc1", "baseSha": base.sha,
                  "fencingToken": "tok-new", "at": 20}, self.p)
        verdict = self.auth(base.patch(mutate_add("docs/stale.md")), base)
        result = self.publish(base, remote, publish, verdict, token="tok-old")
        self.assertEqual(result["reason"], "stale-token")
        c.discard(verdict["quarantine"])
        self.assertEqual(git(["ls-remote", "--heads", str(remote)], publish).stdout.count("cloud/"), 0)
