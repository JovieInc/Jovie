"""Real-Git proof for the existing Design gate; loaded by test_design_gate."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import design_gate_check  # noqa: E402

def complete_brief(capability="smart-links", imagery="photo", component="PublicProfileHero",
                   pen="node Ab12Cd", sections=("hero", "cta")):
    section_lines = "\n".join(f"- {section_id}" for section_id in sections)
    copy_lines = "\n".join(
        f"- {section_id}: Publish the certified page without inventing a claim."
        for section_id in sections)
    imagery_lines = "\n".join(f"- {section_id}: {imagery}" for section_id in sections)
    return f"""## 1. IA / message
Message: Artists see one public page that explains what Jovie publishes for them.

## 2. Certified capabilities
Capability ids:
- {capability}

## 3. Outcome
Outcome: A founder can publish a certified artist page without inventing claims.

## 4. Problem → solution
Problem: Landing pages ship claims the product cannot prove yet.
Solution: The page sells only the certified public-profile outcome.

## 5. Layout
Sections:
{section_lines}

## 6. Copy
Copy:
{copy_lines}

## 7. Imagery
Imagery:
{imagery_lines}

## 8. Art direction
Component: {component}

## 9. Creative exploration
Pen: {pen}
ImageGen:
"""


class GitEvidenceTest(unittest.TestCase):
    """Exercise the workflow shell and evaluator with real immutable git history."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        (self.repo / ".git/info/exclude").write_text("scripts/\n", encoding="utf-8")
        self.git("config", "user.name", "Design gate test")
        self.git("config", "user.email", "design-gate@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.write("README.md", "initial")
        self.write("apps/web/components/marketing/renamed.tsx", "rename me")
        self.write("apps/web/data/marketing/deleted.ts", "delete me")
        self.commit("initial")
        self.ancestor = self.git("rev-parse", "HEAD").strip()
        self.git("checkout", "-b", "feature")
        self.write("apps/web/app/(marketing)/pay/space café\npage.tsx", "gated")
        self.write("docs/renamed.tsx", "rename me")
        (self.repo / "apps/web/components/marketing/renamed.tsx").unlink()
        (self.repo / "apps/web/data/marketing/deleted.ts").unlink()
        self.commit("feature")
        self.head = self.git("rev-parse", "HEAD").strip()
        self.git("checkout", "main")
        self.write("apps/web/app/(home)/base-only.tsx", "not a PR change")
        self.commit("base advanced")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.git("merge", "--no-ff", "feature", "-m", "event merge")
        self.merge = self.git("rev-parse", "HEAD").strip()
        self.event = self.root / "event.json"
        self.set_event()
        self.summary = self.root / "summary.md"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.gh_log = self.root / "gh-called"
        # A normal listing, an installation 403, and truncated API output must
        # all use exactly the same git proof. Any gh invocation leaves evidence.
        self.gh_mode("normal")
        self.env = {
            **os.environ, "GITHUB_SHA": self.merge, "GITHUB_EVENT_PATH": str(self.event),
            "GITHUB_STEP_SUMMARY": str(self.summary), "RUNNER_TEMP": str(self.root),
            "DESIGN_GATE_ENFORCE": "true", "LINEAR_API_KEY": "",
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
        }
        scripts = self.repo / "scripts/lanes"
        scripts.mkdir(parents=True)
        for name in ("design_gate.py", "design_gate_check.py", "certified-capabilities.gen.json"):
            shutil.copyfile(ROOT / "scripts/lanes" / name, scripts / name)

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], check=True,
                              capture_output=True, text=True).stdout

    def write(self, path, content):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def commit(self, message):
        self.git("add", ".")
        self.git("commit", "-m", message)

    def set_event(self, *, head=None, base=None, body="No brief here."):
        self.event.write_text(json.dumps({"pull_request": {
            "head": {"sha": head or self.head}, "base": {"sha": base or self.base},
            "body": body,
        }}), encoding="utf-8")

    def gh_mode(self, mode):
        responses = {
            "normal": "printf '%s\\n' 'apps/web/app/(marketing)/pay/page.tsx'",
            "quota": "echo 'HTTP 403: API rate limit exceeded for installation' >&2; exit 1",
            "truncated": "printf '%s\\n' 'README.md'; exit 0",
        }
        gh = self.bin / "gh"
        gh.write_text('#!/bin/sh\necho called >> "' + str(self.gh_log) + '"\n'
                      + responses[mode] + "\n", encoding="utf-8")
        gh.chmod(0o755)

    def workflow(self):
        workflow = ROOT / ".github/workflows/design-gate.yml"
        if not workflow.exists():
            self.skipTest("workflow is outside the lane release archive")
        return workflow.read_text(encoding="utf-8")

    def run_workflow(self):
        # Run every actual run: block in order, including Changed files on the
        # pre-fix workflow. This catches acquisition failures before evaluation.
        blocks = re.findall(r"^        run: \|\n((?:          .*\n|\n)+)", self.workflow(), re.M)
        self.assertTrue(blocks)
        script = "set -euo pipefail\n" + "\n".join(textwrap.dedent(block) for block in blocks)
        script = script.replace("${{ github.repository }}", "JovieInc/Jovie")
        script = script.replace("${{ github.event.pull_request.number }}", "1")
        return subprocess.run(["bash", "-c", script], cwd=self.repo, env=self.env,
                              capture_output=True, text=True, timeout=30)

    def test_workflow_evaluates_and_enforces_with_normal_quota_and_truncated_api(self):
        for mode in ("normal", "quota", "truncated"):
            with self.subTest(mode=mode):
                self.gh_mode(mode)
                result = self.run_workflow()
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("Design brief incomplete", result.stdout)
                self.assertIn("Changed-path proof:", result.stdout)
                self.assertNotIn("base-only.tsx", self.summary.read_text())
                self.assertFalse(self.gh_log.exists(), "changed paths must not use the API")
                self.env["DESIGN_GATE_ENFORCE"] = ""
                warned = self.run_workflow()
                self.assertEqual(warned.returncode, 0, warned.stderr)
                self.assertIn("::warning::Design brief incomplete", warned.stdout)
                self.env["DESIGN_GATE_ENFORCE"] = "true"

    def test_rename_out_of_gated_tree_still_checks_the_brief(self):
        self.git("checkout", "-b", "rename-only", self.ancestor)
        self.write("docs/renamed.tsx", "rename me")
        (self.repo / "apps/web/components/marketing/renamed.tsx").unlink()
        # This existing workflow path selects the job without changing its trigger.
        self.write(".github/workflows/design-gate.yml", "# fixture-only edit\n")
        self.commit("rename only")
        self.head = self.git("rev-parse", "HEAD").strip()
        self.git("checkout", "-b", "rename-base", self.base)
        self.git("merge", "--no-ff", "rename-only", "-m", "rename event merge")
        self.merge = self.git("rev-parse", "HEAD").strip()
        self.env["GITHUB_SHA"] = self.merge
        self.set_event()
        for enforce, code, annotation in (("true", 1, "error"), ("", 0, "warning")):
            with self.subTest(enforce=enforce):
                self.env["DESIGN_GATE_ENFORCE"] = enforce
                result = self.run_workflow()
                self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                self.assertIn(f"::{annotation}::Design brief incomplete", result.stdout)
                self.assertNotIn("No marketing or landing paths", result.stdout)
        self.assertFalse(self.gh_log.exists())

    def test_git_paths_preserve_renames_deletions_whitespace_and_stale_event_base(self):
        self.set_event(base=self.ancestor)
        files = design_gate_check.files_from_git(str(self.event), self.repo, self.merge)
        self.assertEqual(set(files), {
            "apps/web/app/(marketing)/pay/space café\npage.tsx",
            "apps/web/components/marketing/renamed.tsx",
            "apps/web/data/marketing/deleted.ts", "docs/renamed.tsx",
        })

    def test_complete_brief_passes_during_quota_exhaustion(self):
        self.gh_mode("quota")
        self.write("docs/design/briefs/test.md", complete_brief())
        self.set_event(body="Design brief: docs/design/briefs/test.md")
        result = self.run_workflow()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Design brief is complete.", result.stdout)
        self.assertFalse(self.gh_log.exists())

    def test_local_diff_has_no_api_3000_file_cap(self):
        self.git("checkout", "feature")
        for index in range(3001):
            self.write(f"a/{index:04}.txt", "path")
        self.commit("more than one API listing")
        self.head = self.git("rev-parse", "HEAD").strip()
        self.git("checkout", "-b", "cap-base", self.base)
        self.git("merge", "--no-ff", "feature", "-m", "new event merge")
        self.merge = self.git("rev-parse", "HEAD").strip()
        self.set_event()
        files = design_gate_check.files_from_git(str(self.event), self.repo, self.merge)
        self.assertEqual(len(files), 3005)
        self.assertIn("apps/web/components/marketing/renamed.tsx", files)

    def test_missing_or_mismatched_identity_never_reaches_brief_evaluation(self):
        self.env["DESIGN_GATE_ENFORCE"] = ""  # Acquisition errors always fail closed.
        for field, value in (("head", self.ancestor), ("head", "0" * 40),
                             ("base", "f" * 40), ("base", self.head),
                             ("head", "--all")):
            with self.subTest(field=field, value=value):
                self.set_event(**{field: value})
                with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                    design_gate_check.files_from_git(str(self.event), self.repo, self.merge)
                result = self.run_workflow()
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Design brief", result.stdout)
                self.assertFalse(self.summary.exists())
        self.set_event()
        with self.assertRaisesRegex(ValueError, "checkout"):
            design_gate_check.files_from_git(str(self.event), self.repo, self.base)
        self.env["GITHUB_SHA"] = self.base
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.env["GITHUB_SHA"] = ""
        self.assertNotEqual(self.run_workflow().returncode, 0)
        self.assertFalse(self.summary.exists())
        with self.assertRaises(SystemExit) as usage:
            design_gate_check.main(["--git-diff"])
        self.assertEqual(usage.exception.code, 2)

    def test_shallow_or_missing_history_fails_closed(self):
        shallow = self.root / "shallow"
        subprocess.run(["git", "clone", "--depth=1", self.repo.as_uri(), str(shallow)],
                       check=True, capture_output=True)
        with self.assertRaisesRegex(ValueError, "shallow"):
            design_gate_check.files_from_git(str(self.event), shallow, self.merge)
        (self.repo / ".git/objects" / self.ancestor[:2] / self.ancestor[2:]).unlink()
        with self.assertRaises(subprocess.CalledProcessError):
            design_gate_check.files_from_git(str(self.event), self.repo, self.merge)

    def test_complete_filtered_history_needs_no_historical_blobs(self):
        self.git("config", "uploadpack.allowFilter", "true")
        filtered = self.root / "filtered"
        subprocess.run(
            ["git", "clone", "--filter=blob:none", "--no-checkout",
             self.repo.as_uri(), str(filtered)],
            check=True, capture_output=True,
        )
        # No checkout was materialized; path evidence must use only ancestry/trees.
        subprocess.run(
            ["git", "-C", str(filtered), "remote", "set-url", "origin",
             (self.root / "unavailable-origin").as_uri()],
            check=True, capture_output=True,
        )
        files = design_gate_check.files_from_git(str(self.event), filtered, self.merge)
        self.assertEqual(set(files), {
            "apps/web/app/(marketing)/pay/space café\npage.tsx",
            "apps/web/components/marketing/renamed.tsx",
            "apps/web/data/marketing/deleted.ts", "docs/renamed.tsx",
        })

    def test_ambiguous_merge_bases_fail_closed(self):
        tree = self.git("rev-parse", self.ancestor + "^{tree}").strip()
        left = self.git("commit-tree", tree, "-p", self.ancestor, "-m", "left").strip()
        right = self.git("commit-tree", tree, "-p", self.ancestor, "-m", "right").strip()
        base = self.git("commit-tree", tree, "-p", left, "-p", right, "-m", "base").strip()
        head = self.git("commit-tree", tree, "-p", right, "-p", left, "-m", "head").strip()
        merge = self.git("commit-tree", tree, "-p", base, "-p", head, "-m", "merge").strip()
        self.git("checkout", "--detach", merge)
        self.set_event(base=base, head=head)
        with self.assertRaisesRegex(ValueError, "unambiguous"):
            design_gate_check.files_from_git(str(self.event), self.repo, merge)

    def test_proven_empty_diff_can_skip_but_non_merge_checkout_fails(self):
        tree = self.git("rev-parse", self.ancestor + "^{tree}").strip()
        head = self.git("commit-tree", tree, "-p", self.ancestor, "-m", "empty").strip()
        merge = self.git("commit-tree", tree, "-p", self.base, "-p", head, "-m", "merge").strip()
        self.git("checkout", "--detach", merge)
        self.set_event(head=head)
        self.assertEqual(design_gate_check.files_from_git(str(self.event), self.repo, merge), [])
        self.git("checkout", "--detach", head)
        with self.assertRaisesRegex(ValueError, "parents"):
            design_gate_check.files_from_git(str(self.event), self.repo, head)

    def test_truncated_or_failed_git_output_is_not_a_complete_path_list(self):
        real_run = subprocess.run

        def truncated_git(args, **kwargs):
            if "diff" in args:
                return subprocess.CompletedProcess(args, 0, b"README.md", b"")
            return real_run(args, **kwargs)

        with mock.patch.object(design_gate_check.subprocess, "run", side_effect=truncated_git):
            with self.assertRaisesRegex(ValueError, "truncated"):
                design_gate_check.files_from_git(str(self.event), self.repo, self.merge)

        def failed_git(args, **kwargs):
            if "diff" in args:
                raise subprocess.CalledProcessError(128, args, output=b"README.md\0")
            return real_run(args, **kwargs)

        with mock.patch.object(design_gate_check.subprocess, "run", side_effect=failed_git):
            with mock.patch.object(design_gate_check, "check") as evaluate:
                with mock.patch.dict(os.environ, self.env):
                    code = design_gate_check.main(["--event", str(self.event),
                                                  "--git-diff", "--repo", str(self.repo)])
                self.assertEqual(code, 1)
                evaluate.assert_not_called()

    def test_checkout_is_pinned_and_complete_without_persisted_credentials(self):
        workflow = self.workflow()
        self.assertIn("ref: ${{ github.sha }}", workflow)
        self.assertIn("fetch-depth: 0", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertNotIn("GH_TOKEN", workflow)
        self.assertNotIn("write", workflow.split("permissions:")[1].split("concurrency:")[0])
