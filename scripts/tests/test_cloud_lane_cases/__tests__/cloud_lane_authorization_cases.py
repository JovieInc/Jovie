"""CloudAuthorizationTest: collected through test_cloud_lane.py in existing CI selectors."""
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
import cloud_lane_quarantine as quarantine


class CloudAuthorizationTest(CloudLaneFixture):
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
        with patch.object(quarantine, "POLICY_PATH", Path(self.tmp.name) / "missing.json"):
            self.assertEqual(self.auth(base.patch(mutate_add("docs/n.md")), base)["reason"],
                             "policy-unreadable")
        bad = Path(self.tmp.name) / "bad.json"
        bad.write_text("{not json")
        with patch.object(quarantine, "POLICY_PATH", bad):
            self.assertEqual(self.auth(base.patch(mutate_add("docs/n.md")), base)["reason"],
                             "policy-unreadable")
        empty = Path(self.tmp.name) / "empty.json"
        empty.write_text(json.dumps({"deny": {"prefixes": [], "names": [], "regexes": []}}))
        with patch.object(quarantine, "POLICY_PATH", empty):
            self.assertEqual(self.auth(base.patch(mutate_add("docs/n.md")), base)["reason"],
                             "policy-unreadable")

    def test_quarantine_git_runs_without_credentials_or_hooks(self):
        base = Base(self.tmp.name)
        seen = []
        real = quarantine._qgit

        def spy(env, args, input_text=None):
            seen.append((dict(env), ["git", "-c", "core.hooksPath=/dev/null", *args]))
            return real(env, args, input_text=input_text)
        with patch.object(quarantine, "_qgit", spy):
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

    def test_extracted_safety_cases_remain_protected_by_existing_policy(self):
        base = Base(self.tmp.name)
        for file in sorted((ROOT / "scripts/tests/test_cloud_lane_cases").rglob("*.py")):
            path = file.relative_to(ROOT).as_posix()
            with self.subTest(path=path):
                result = self.auth(base.patch(mutate_add(path)), base)
                self.assertFalse(result["ok"])
                self.assertEqual(result["reason"], "sensitive:" + path)
