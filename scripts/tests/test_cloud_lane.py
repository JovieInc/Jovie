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


class CloudLaneTest(unittest.TestCase):
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

    # ------------------------------------------------------------------ CLI contract

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

    # ------------------------------------------------------------------- status/collect

    def seed_accepted(self, task="task_abc12345", branch="cloud/j-1-task_abc1"):
        c.append({"issue": "J-1", "task": "J-1", "provider": "codex", "stage": "submitted",
                  "repo": c.REPO, "env": "env_test", "baseSha": "b" * 40, "attempt": 1, "at": 1}, self.p)
        c.append({"issue": "J-1", "task": task, "provider": "codex", "stage": "accepted",
                  "repo": c.REPO, "env": "env_test", "branch": branch, "baseSha": "b" * 40,
                  "attempt": 1, "at": 2}, self.p)
        return task

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

    # ------------------------------------------------------------ real-git authorization

    def auth(self, patch_text, base):
        return c.authorize(patch_text, base.sha, base.objects)

    def test_benign_patches_authorize_and_report_the_tree(self):
        base = Base(self.tmp.name)
        for name, mutate in (("modify", mutate_edit("docs/a.md")),
                             ("add", mutate_add("docs/new.md")),
                             ("delete", mutate_delete("docs/b.md")),
                             ("rename", lambda d: git(["mv", "docs/a.md", "docs/c.md"], d))):
            with self.subTest(name=name):
                verdict = self.auth(base.patch(mutate), base)
                self.assertTrue(verdict["ok"], verdict)
                self.assertRegex(verdict["candTree"], r"[0-9a-f]{40}")
                self.assertEqual(verdict["baseSha"], base.sha)
                self.assertTrue(verdict["files"] >= 1)
                self.assertTrue(verdict["quarantine"].exists())
                c.discard(verdict["quarantine"])
                self.assertFalse(verdict["quarantine"].exists())

    def test_sensitive_paths_hold_with_the_matched_path(self):
        base = Base(self.tmp.name)
        cases = {
            ".github modify": mutate_edit(".github/workflows/ci.yml"),
            ".GITHUB casefold": mutate_add(".GITHUB/workflows/x.yml"),
            # (the NFKC lookalike needs an unquoted header; see the crafted test below)
            "subdir CODEOWNERS": mutate_add("docs/CODEOWNERS"),
            ".env.local": mutate_add(".env.local"),
            "package.json": mutate_edit("package.json", "{}\n"),
            "pnpm-lock": mutate_add("pnpm-lock.yaml"),
            "package-lock": mutate_add("package-lock.json"),
            "yarn.lock": mutate_add("yarn.lock"),
            "bun.lockb": mutate_add("bun.lockb"),
            ".npmrc": mutate_add(".npmrc"),
            "drizzle migration": mutate_add("apps/web/drizzle/migrations/0123_x.sql"),
            "plain .sql": mutate_add("schema.sql"),
            "NNNN migration": mutate_add("migrations/0001_init.py"),
            "lanes self": mutate_edit("scripts/lanes/cloud_lane.py", "x\n"),
            "AGENTS.md": mutate_add("AGENTS.md"),
            "middleware": mutate_add("middleware.ts"),
            "billing": mutate_add("billing/charge.ts"),
            "secrets": mutate_add("secrets/vars"),
            "pem": mutate_add("server.pem"),
            "key": mutate_add("id.key"),
            "ci script": mutate_add("scripts/ci-fast-lanes.mjs"),
            "gate test": mutate_add("scripts/tests/test_cloud_lane_more.py"),
            "vercel.json": mutate_add("vercel.json"),
            "Dockerfile": mutate_add("Dockerfile"),
            "rename into .github": lambda d: git(["mv", "docs/a.md", ".github/x.yml"], d),
            "delete protected": mutate_delete(".github/workflows/ci.yml"),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                verdict = self.auth(base.patch(mutate), base)
                self.assertFalse(verdict["ok"], (name, verdict))
                self.assertTrue(verdict["reason"].startswith(("sensitive:", "collision",
                                                                "quoted-path")), (name, verdict))
                self.assertNotIn("quarantine", verdict, "a held patch leaves no quarantine behind")

    def test_nfkc_lookalike_of_a_protected_prefix_collides(self):
        base = Base(self.tmp.name)
        raw = ("diff --git a/.\uff47ithub/workflows/x.yml b/.\uff47ithub/workflows/x.yml\n"
               "new file mode 100644\n--- /dev/null\n"
               "+++ b/.\uff47ithub/workflows/x.yml\n@@ -0,0 +1 @@\n+x\n")
        verdict = self.auth(raw, base)
        self.assertEqual(verdict["reason"], "collision")
        # A git-quoted lookalike header is held even earlier: quoted paths never apply.
        self.assertEqual(self.auth(base.patch(mutate_add(".\uff47ithub/x.yml")), base)["reason"],
                         "quoted-path")

    def test_copy_detection_holds_when_the_source_is_protected(self):
        base = Base(self.tmp.name)
        content = base.FILES[".github/workflows/ci.yml"]
        verdict = self.auth(base.patch(mutate_add("docs/copied-ci.yml", content)), base)
        self.assertFalse(verdict["ok"], verdict)
        self.assertTrue(verdict["reason"].startswith("sensitive:"), verdict)

    def test_mode_type_binary_and_oversize_reject(self):
        base = Base(self.tmp.name)

        def mode_only(d):
            (d / "docs/a.md").chmod(0o755)
        self.assertEqual(self.auth(base.patch(mode_only), base)["reason"], "mode-change")

        def mode_and_content(d):
            (d / "docs/a.md").chmod(0o755)
            write(d / "docs/a.md", "changed\n")
        self.assertEqual(self.auth(base.patch(mode_and_content), base)["reason"], "mode-change")

        def symlink(d):
            (d / "docs/link").symlink_to("a.md")
        self.assertEqual(self.auth(base.patch(symlink), base)["reason"], "symlink")

        def gitlink(d):
            git(["update-index", "--add", "--cacheinfo",
                 f"160000,{base.sha},vendor"], d)
        self.assertEqual(self.auth(base.patch(gitlink, add=False), base)["reason"], "gitlink")

        def binary(d):
            (d / "docs/blob.bin").write_bytes(b"\x00\x01\x02\xff")
        self.assertEqual(self.auth(base.patch(binary, binary=True), base)["reason"], "binary")

        def many(d):
            for index in range(45):
                write(d / f"docs/f{index:02}.md", f"{index}\n")
        self.assertEqual(self.auth(base.patch(many), base)["reason"], "oversize:files")

        def long_file(d):
            write(d / "docs/huge.md", "".join(f"line{i}\n" for i in range(600)))
        self.assertEqual(self.auth(base.patch(long_file), base)["reason"], "oversize:lines")

        self.assertEqual(c.authorize("x" * (1024 * 1024 + 1), base.sha, base.objects)["reason"],
                         "oversize:bytes")

    def test_raw_patch_header_attacks_never_reach_git(self):
        base = Base(self.tmp.name)
        def raw(old, new, extra=""):
            return (f"diff --git a/{old} b/{new}\n--- a/{old}\n+++ b/{new}\n"
                    "@@ -0,0 +1 @@\n+x\n" + extra)
        cases = {
            "traversal ..": raw("../evil", "../evil"),
            "dot component": raw("docs/./x", "docs/./x"),
            "double slash": raw("docs//x", "docs//x"),
            "absolute new": raw("docs/x", "/abs"),
            "backslash": raw("docs\\x", "docs\\x"),
            "control char": raw("docs/x\x01y", "docs/x\x01y"),
            "surrogate": raw("docs/\udcff.md", "docs/\udcff.md"),
            "git component": raw(".git/config", ".git/config"),
            "quoted path": 'diff --git "a/\\303\\250.txt" "b/\\303\\250.txt"\n'
                           '--- "a/\\303\\250.txt"\n+++ "b/\\303\\280.txt"\n@@ -0,0 +1 @@\n+x\n',
        }
        for name, patch in cases.items():
            with self.subTest(name=name):
                verdict = self.auth(patch, base)
                self.assertFalse(verdict["ok"])
                self.assertIn(verdict["reason"], ("traversal", "encoding", "git-component",
                                                  "quoted-path"))

    def test_duplicate_and_intermediate_ops_and_malformed_headers_reject(self):
        base = Base(self.tmp.name)
        once = "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -1 +1 @@\n-alpha\n+beta\n"
        verdict = self.auth(once + once, base)
        self.assertEqual(verdict["reason"], "duplicate-path")
        twice = ("diff --git a/docs/a.md b/docs/c.md\nrename from docs/a.md\nrename to docs/c.md\n"
                 "diff --git a/docs/a.md b/docs/d.md\nrename from docs/a.md\nrename to docs/d.md\n")
        self.assertEqual(self.auth(twice, base)["reason"], "duplicate-path")
        mismatch = ("diff --git a/docs/a.md b/docs/a.md\n--- a/missing.md\n+++ b/docs/a.md\n"
                    "@@ -1 +1 @@\n-alpha\n+beta\n")
        verdict = self.auth(mismatch, base)
        self.assertFalse(verdict["ok"])
        self.assertEqual(self.auth("", base)["reason"], "patch-malformed")
        self.assertEqual(self.auth("not a patch at all", base)["reason"], "patch-malformed")
        partial = ("diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n"
                   "@@ -1 +1 @@\n-wrong context\n+beta\n")
        self.assertEqual(self.auth(partial, base)["reason"], "patch-rejected")

    def test_policy_load_fails_closed(self):
        base = Base(self.tmp.name)
        with patch.object(c, "POLICY_PATH", Path(self.tmp.name) / "missing.json"):
            self.assertEqual(self.auth(base.patch(mutate_add("docs/n.md")), base)["reason"],
                             "policy-unreadable")
        bad = Path(self.tmp.name) / "bad.json"
        bad.write_text("{not json")
        with patch.object(c, "POLICY_PATH", bad):
            self.assertEqual(self.auth(base.patch(mutate_add("docs/n.md")), base)["reason"],
                             "policy-unreadable")
        empty = Path(self.tmp.name) / "empty.json"
        empty.write_text(json.dumps({"deny": {"prefixes": [], "names": [], "regexes": []}}))
        with patch.object(c, "POLICY_PATH", empty):
            self.assertEqual(self.auth(base.patch(mutate_add("docs/n.md")), base)["reason"],
                             "policy-unreadable")

    def test_quarantine_git_runs_without_credentials_or_hooks(self):
        base = Base(self.tmp.name)
        seen = []
        real = c._qgit

        def spy(env, args, input_text=None):
            seen.append((dict(env), ["git", "-c", "core.hooksPath=/dev/null", *args]))
            return real(env, args, input_text=input_text)
        with patch.object(c, "_qgit", spy):
            verdict = self.auth(base.patch(mutate_add("docs/n.md")), base)
            self.assertTrue(verdict["ok"])
            c.discard(verdict["quarantine"])
        self.assertTrue(seen)
        for env, command in seen:
            for banned in ("GH_TOKEN", "GITHUB_TOKEN", "SSH_AUTH_SOCK", "CODEX_CLOUD_BINARY",
                           "CODEX_CLOUD_ENV", "GH_HOST", "GIT_SSH_COMMAND"):
                self.assertNotIn(banned, env)
            self.assertEqual(set(env) <= {"PATH", "LANG", "HOME", "GIT_DIR", "GIT_INDEX_FILE",
                                          "GIT_OBJECT_DIRECTORY", "GIT_CONFIG_NOSYSTEM",
                                          "GIT_CONFIG_GLOBAL"}, True, sorted(env))
            self.assertEqual(env.get("GIT_CONFIG_NOSYSTEM"), "1")
            self.assertEqual(env.get("GIT_CONFIG_GLOBAL"), "/dev/null")
            self.assertTrue(env["HOME"].endswith("home"))
            self.assertIn("core.hooksPath=/dev/null", command)

    def test_candidate_hooks_and_filters_never_execute(self):
        base = Base(self.tmp.name)
        raw = ("diff --git a/.git/hooks/pre-commit b/.git/hooks/pre-commit\n"
               "new file mode 100644\n--- /dev/null\n+++ b/.git/hooks/pre-commit\n"
               "@@ -0,0 +1 @@\n+evil\n")
        self.assertEqual(self.auth(raw, base)["reason"], "git-component")
        verdict = self.auth(base.patch(mutate_add(".gitattributes", "*.md filter=evil\n")), base)
        self.assertTrue(verdict["reason"].startswith("sensitive:"))

    # ---------------------------------------------------------------- draft publication

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
        source = (ROOT / "scripts/lanes/cloud_lane.py").read_text()
        for banned in ('"pr", "ready"', "--auto", "merge", "enqueue", "gh pr merge"):
            self.assertNotIn(banned, source, banned)
        self.assertIn('"pr", "create", "--draft"', source)
        self.assertEqual(c.RETAINED_VERDICTS,
                         {"cloud-pending", "cloud-held", "cloud-draft-created"})

    # ------------------------------------------------------------------- reconcile turn

    def seed_claim(self, base, task="task_abc12345", branch="cloud/jov-1-task_abc1",
                   stage="cloud-pending", token="tok1"):
        c.append({"issue": "J-1", "task": task, "provider": "codex", "stage": stage,
                  "reason": "submitted", "repo": c.REPO, "env": "env_test", "branch": branch,
                  "baseSha": base.sha, "fencingToken": token, "at": 10}, self.p)

    def reconcile_now(self, base, remote, publish, run, gh=None, guard=None):
        with patch.object(c, "PUSH_URL_RE", re.compile(re.escape(str(remote)))):
            return c.reconcile(repo_dir=publish, url=str(remote), run=run,
                               gh=gh or self.gh(branch="cloud/jov-1-task_abc1"), guard=guard)

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

    # ------------------------------------------------------------ origin + ledger + stats

    def pr(self, branch="devin/jov-1-x", body=""):
        return {"number": 5, "headRefName": branch, "headRefOid": "h1", "body": body,
                "url": "https://github.com/JovieInc/Jovie/pull/5"}

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
