"""Offline CLI fakes and real Git fixtures shared by cloud lane cases."""
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


def done(out="", code=0, err=""):
    return lambda *a, **k: subprocess.CompletedProcess(a, code, out, err)


def git(args, cwd, input_text=None, env=None):
    return subprocess.run(["git", *args], cwd=str(cwd), input=input_text, env=env,
                          capture_output=True, text=True, timeout=120, check=True)


def write(path, text):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text)


class Base:
    """A base repository with a single commit; the objects source for quarantines."""

    FILES = {"docs/a.md": "alpha\n", "docs/b.md": "beta\n",
             ".github/workflows/ci.yml": "ci: yes\n", "scripts/app.py": "print(1)\n",
             "keep.txt": "keep\n"}

    _count = 0

    def __init__(self, root):
        Base._count += 1
        self.dir = Path(root) / f"base{Base._count}"
        self.dir.mkdir(parents=True, exist_ok=True)
        git(["init", "-b", "main"], self.dir)
        git(["config", "user.email", "t@t"], self.dir)
        git(["config", "user.name", "t"], self.dir)
        for name, text in self.FILES.items():
            write(self.dir / name, text)
        git(["add", "-A"], self.dir)
        git(["commit", "-qm", "base"], self.dir)
        self.sha = git(["rev-parse", "HEAD"], self.dir).stdout.strip()
        self.objects = Path(git(["rev-parse", "--absolute-git-dir"], self.dir).stdout.strip()) / "objects"

    def patch(self, mutate, binary=False, add=True):
        """Stage mutations in a scratch clone and diff them against the base commit."""
        Base._count += 1
        scratch = self.dir.parent / f"scratch{Base._count}"
        shutil.rmtree(scratch, ignore_errors=True)
        git(["clone", "-q", str(self.dir), str(scratch)], self.dir.parent)
        mutate(scratch)
        if add:
            git(["add", "-A"], scratch)
        args = ["diff", "--cached"] + (["--binary"] if binary else []) + [self.sha]
        return git(args, scratch).stdout


def mutate_edit(path, text="changed\n"):
    return lambda d: write(d / path, text)


def mutate_add(path, text="new\n"):
    return lambda d: write(d / path, text)


def mutate_delete(path):
    return lambda d: (d / path).unlink()




class CloudLaneFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.p = Path(self.tmp.name) / "l.jsonl"
        self.env = patch.dict(os.environ, {"CODEX_CLOUD_ENV": "env_test",
                                           "CODEX_CLOUD_BINARY": "/real/codex",
                                           "CLOUD_LANE_LEDGER": str(self.p)})
        self.env.start()
        self.addCleanup(self.env.stop)

    def ledger(self):
        return c.read(self.p)

    def go(self, issue="J-1", labels=("cloud-lane",), text="fix typo", prompt="do it",
           run=None, t=1000.0, provider="codex", main_sha="b" * 40, token="tok1"):
        return c.route(issue, provider, labels, text, prompt, run=run or done("task_abc"),
                       now=lambda: t, main_sha=main_sha, fencing_token=token)

    def seed_accepted(self, task="task_abc12345", branch="cloud/j-1-task_abc1"):
        c.append({"issue": "J-1", "task": "J-1", "provider": "codex", "stage": "submitted",
                  "repo": c.REPO, "env": "env_test", "baseSha": "b" * 40, "attempt": 1, "at": 1}, self.p)
        c.append({"issue": "J-1", "task": task, "provider": "codex", "stage": "accepted",
                  "repo": c.REPO, "env": "env_test", "branch": branch, "baseSha": "b" * 40,
                  "attempt": 1, "at": 2}, self.p)
        return task

    def list_pages(self, rows, cursor_pages=0):
        # The task lands on the LAST page; earlier pages only carry a cursor.
        return [{"tasks": [], "cursor": f"page{i}"} for i in range(cursor_pages)] + [
            {"tasks": rows, "cursor": None}]

    def codex(self, status_out=("[READY] t", 0), task_rows=None, diff="x", cursors=0, calls=None,
              diff_code=0):
        task_rows = [{"id": "task_abc12345", "environment_id": "env_test", "attempt_total": 1,
                      "url": "https://chatgpt.com/codex/tasks/task_abc12345", "status": "ready",
                      "title": "t"}] if task_rows is None else task_rows
        pages = self.list_pages(task_rows, cursors)
        def run(cmd, **kw):
            if calls is not None:
                calls.append(cmd)
            if cmd[1:3] == ["cloud", "status"]:
                return subprocess.CompletedProcess(cmd, status_out[1], status_out[0], "")
            if cmd[1:3] == ["cloud", "list"]:
                page = pages.pop(0) if len(pages) > 1 else (pages[0] if pages else
                                                            {"tasks": [], "cursor": None})
                return subprocess.CompletedProcess(cmd, 0, json.dumps(page), "")
            if cmd[1:3] == ["cloud", "diff"]:
                return subprocess.CompletedProcess(cmd, diff_code, diff, "")
            raise AssertionError(cmd)
        return run

    def auth(self, patch_text, base):
        return c.authorize(patch_text, base.sha, base.objects)

    def remote(self):
        Base._count += 1
        base = Base(Path(self.tmp.name) / f"r{Base._count}")
        root = base.dir.parent
        root.mkdir(exist_ok=True)
        remote = root / "remote.git"
        git(["clone", "-q", "--bare", str(base.dir), str(remote)], root)
        publish = root / "publish"
        git(["clone", "-q", str(base.dir), str(publish)], root)
        git(["config", "user.email", "t@t"], publish)
        git(["config", "user.name", "t"], publish)
        return base, remote, publish

    def gh(self, create_url="https://github.com/JovieInc/Jovie/pull/9", head=None, draft=True,
           base_ref="main", branch="cloud/jov-1-task_abc1", calls=None):
        def run(args):
            if calls is not None:
                calls.append(list(args))
            if args[:2] == ["pr", "create"]:
                return subprocess.CompletedProcess(args, 0, create_url + "\n", "")
            if args[:2] == ["pr", "view"]:
                payload = {"number": 9, "isDraft": draft, "baseRefName": base_ref,
                           "headRefName": branch, "headRefOid": head or "sha",
                           "url": "https://github.com/JovieInc/Jovie/pull/9"}
                return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")
            raise AssertionError(args)
        return run

    def publish(self, base, remote, publish, verdict, issue="J-1", task="task_abc12345",
                branch="cloud/jov-1-task_abc1", token="tok1", gh=None, url=None):
        if not any(e.get("issue") == issue and e["stage"] in c.CLAIM_STAGES
                   for e in c.read(self.p)):
            c.append({"issue": issue, "task": task, "provider": "codex",
                      "stage": "cloud-pending", "reason": "submitted", "repo": c.REPO,
                      "env": "env_test", "branch": branch, "baseSha": base.sha,
                      "fencingToken": token, "at": 10}, self.p)
        with patch.object(c, "PUSH_URL_RE", re.compile(re.escape(str(remote)))):
            return c.publish_candidate(issue, task, verdict["quarantine"], verdict["candTree"],
                                       base.sha, branch, repo_dir=publish, url=str(remote),
                                       path=self.p, fencing_token=token, gh=gh or self.gh(
                                           head="will-be-set", branch=branch),
                                       paths=verdict["paths"])

    def seed_claim(self, base, task="task_abc12345", branch="cloud/jov-1-task_abc1",
                   stage="cloud-pending", token="tok1"):
        c.append({"issue": "J-1", "task": task, "provider": "codex", "stage": stage,
                  "reason": "submitted", "repo": c.REPO, "env": "env_test", "branch": branch,
                  "baseSha": base.sha, "fencingToken": token, "at": 10}, self.p)

    def reconcile_now(self, base, remote, publish, run, gh=None, guard=None):
        with patch.object(c, "PUSH_URL_RE", re.compile(re.escape(str(remote)))):
            return c.reconcile(repo_dir=publish, url=str(remote), run=run,
                               gh=gh or self.gh(branch="cloud/jov-1-task_abc1"), guard=guard)

    def pr(self, branch="devin/jov-1-x", body=""):
        return {"number": 5, "headRefName": branch, "headRefOid": "h1", "body": body,
                "url": "https://github.com/JovieInc/Jovie/pull/5"}
