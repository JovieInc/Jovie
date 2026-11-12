"""Real-Git regression tests for deterministic generated-conflict repair."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
import git_housekeeping  # noqa: E402

git_housekeeping.install_process_fixture_env()
git_housekeeping.install_isolated_tempdirs()
import lane_runner as lane  # noqa: E402

REGISTRY_HEADER = '{"schema": "jovie-automation-registry/v1"}\n'


class LockfileConflictTest(unittest.TestCase):
    """JOV-6837/JOV-7594: a generated-file-only conflict is resolved without a model; anything else is not."""

    def test_rechecks_target_immediately_before_runner_owned_install_and_push(self):
        for conflict in (True, False):
            calls = []
            def shell(args, **kwargs):
                calls.append(args)
                return SimpleNamespace(returncode=1 if args[:2] == ["git", "merge"] and conflict else 0,
                                       stdout="pnpm-lock.yaml\n" if args[:2] == ["git", "diff"] else "", stderr="")
            guard = Mock(side_effect=[None, lane.RepairStopped("target-pr-merged", {"state": "MERGED"}, "command")])
            with self.subTest(conflict=conflict), patch.object(lane, "sh", side_effect=shell):
                with self.assertRaises(lane.RepairStopped):
                    lane.resolve_generated_conflict(Path("/not-used"), "branch", None, guard=guard)
            self.assertFalse(any(cmd[:2] == ["pnpm", "install"] or cmd[:2] == ["git", "push"] for cmd in calls))

    def git(self, *args, cwd):
        return subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", *args], cwd=cwd,
                              check=True, capture_output=True, text=True).stdout.strip()

    def repo(self, tmp: Path, pr_changes: dict, main_changes: dict | None = None):
        origin, work = tmp / "origin.git", tmp / "work"
        self.git("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp)
        self.git("clone", "-q", str(origin), str(work), cwd=tmp)
        for name, text in {"package.json": "{}\n", "pnpm-lock.yaml": "base\n", "a.ts": "a\n"}.items():
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "base", cwd=work)
        self.git("push", "-q", "origin", "HEAD:main", cwd=work)
        self.git("checkout", "-q", "-b", "devin/jov-1-20260927", cwd=work)
        for name, text in pr_changes.items():
            (work / name).parent.mkdir(parents=True, exist_ok=True)
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "pr", cwd=work)
        self.git("push", "-q", "origin", "HEAD:devin/jov-1-20260927", cwd=work)
        self.git("checkout", "-q", "main", cwd=work)
        for name, text in (main_changes or {"pnpm-lock.yaml": "main\n", "a.ts": "main\n"}).items():
            (work / name).parent.mkdir(parents=True, exist_ok=True)
            (work / name).write_text(text)
        self.git("add", "-A", cwd=work)
        self.git("commit", "-qm", "main moves", cwd=work)
        self.git("push", "-q", "origin", "HEAD:main", cwd=work)
        self.git("checkout", "-q", "devin/jov-1-20260927", cwd=work)
        self.git("fetch", "-q", "origin", cwd=work)
        return origin, work

    def run_resolve(self, work: Path):
        real, calls = lane.sh, []

        def sh(args, cwd=None, timeout=600, env=None, log=None, stream=False):
            calls.append(args)
            if args[:2] == ["pnpm", "install"]:
                (Path(cwd) / "pnpm-lock.yaml").write_text("regenerated\n")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            if args == ["pnpm", "ci:topology:write"]:
                target = Path(cwd) / ".github/workflow-topology.gen.yml"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("regenerated\n")
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return real(args, cwd=cwd, timeout=timeout, env=env)
        lane.sh = sh
        try:
            with open(os.devnull, "w") as log:
                env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
                saved = dict(os.environ)
                os.environ.update(env)
                try:
                    return lane.resolve_generated_conflict(work, "devin/jov-1-20260927", log), calls
                finally:
                    os.environ.clear()
                    os.environ.update(saved)
        finally:
            lane.sh = real

    def test_lockfile_only_conflict_is_regenerated_and_pushed(self):
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            pushed = self.git("show", "devin/jov-1-20260927:pnpm-lock.yaml", cwd=origin)
            self.assertEqual(pushed, "regenerated")
            self.assertEqual(self.git("show", "devin/jov-1-20260927:a.ts", cwd=origin), "main")

    def test_generated_topology_conflict_is_regenerated_and_pushed(self):
        """JOV-7594: a generated-file conflict regenerates instead of hand-merging."""
        path = ".github/workflow-topology.gen.yml"
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {path: "pr\n"},
                                     main_changes={path: "main\n", "a.ts": "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertIn(["pnpm", "ci:topology:write"], calls)
            self.assertNotIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            self.assertEqual(self.git("show", f"devin/jov-1-20260927:{path}", cwd=origin), "regenerated")
            self.assertEqual(self.git("show", "devin/jov-1-20260927:a.ts", cwd=origin), "main")

    def test_append_only_registry_conflict_keeps_both_sides_without_a_model(self):
        """2026-10-29: canon/automation-registry.jsonl conflicted on 4 PRs; both sides' lines are the merge."""
        path = "canon/automation-registry.jsonl"
        header = REGISTRY_HEADER
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {path: header + '{"id":"base"}\n{"id":"pr"}\n'},
                                     main_changes={path: header + '{"id":"base"}\n{"id":"main"}\n', "a.ts": "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            merged = self.git("show", f"devin/jov-1-20260927:{path}", cwd=origin)
            self.assertIn('"id":"pr"', merged)
            self.assertIn('"id":"main"', merged)
            self.assertNotIn("<<<<<<<", merged)

    def test_repository_source_map_conflict_regenerates_from_both_sources(self):
        path = "docs/REPOSITORY_SOURCES.md"
        generator = "scripts/repository_docs.py"
        registry = json.dumps({
            "schemaVersion": 1, "repository": "JovieInc/fixture", "output": path,
            "entrypoints": ["package.json"], "imports": [],
            "sources": [{"path": name, "purpose": "fixture source"}
                        for name in ("a.ts", "package.json")],
        })
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {
                path: "pr\n", generator: (ROOT / generator).read_text(),
                "repository-docs.json": registry, "package.json": '{"name":"branch"}\n',
            }, main_changes={path: "main\n", "a.ts": "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            command = ["python3", generator, "--write"]
            self.assertEqual(calls.count(command), 1)
            restored = ["git", "checkout", "origin/main", "--", path]
            self.assertLess(calls.index(restored), calls.index(command))
            pushed = self.git("show", f"devin/jov-1-20260927:{path}", cwd=origin)
            self.assertEqual(pushed, (work / path).read_text().strip())
            for source in (b"main\n", b'{"name":"branch"}\n'):
                self.assertIn(hashlib.sha256(source).hexdigest(), pushed)
            self.assertNotIn("<<<<<<<", pushed)
            checked = subprocess.run(["python3", generator], cwd=work, capture_output=True, text=True)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)

    def test_rule_scopes_record_is_a_generated_resolver(self):
        self.assertEqual(lane.remediation.GENERATED_RESOLVERS["scripts/agent-context/rule-scopes.json"],
                         ("node", "scripts/agent-context/rule-scopes.mjs", "--write"))
        self.assertIn("canon/automation-registry.jsonl", lane.remediation.RESOLVABLE_CONFLICT_FILES)

    def test_registry_edits_to_the_same_id_stay_unresolved(self):
        path = "canon/automation-registry.jsonl"
        header = REGISTRY_HEADER
        with tempfile.TemporaryDirectory() as tmp:
            _, work = self.repo(Path(tmp), {path: header + '{"id":"base","value":"pr"}\n'},
                                main_changes={path: header + '{"id":"base","value":"main"}\n'})
            ok, _ = self.run_resolve(work)
            self.assertFalse(ok)
            self.assertEqual((work / path).read_text(), header + '{"id":"base","value":"pr"}\n')
    def test_sources_of_truth_conflict_regenerates_from_merged_source(self):
        path = "canon/SOURCES_OF_TRUTH.md"
        generator = "scripts/sources-of-truth.mjs"
        source = "canon/sources-of-truth.json"
        script = (
            "import {readFileSync,writeFileSync} from 'node:fs';\n"
            f"if(readFileSync('{path}','utf8') !== 'main\\n') throw Error('must restore main');\n"
            f"writeFileSync('{path}',JSON.parse(readFileSync('{source}','utf8')).domains.join('\\n'));\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {path: "pr\n", generator: script,
                                     source: '{"domains":["engineering-wins","proof-stats"]}'},
                                     main_changes={path: "main\n", "a.ts": "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertEqual(calls.count(["node", generator, "--write"]), 1)
            self.assertEqual(self.git("show", f"devin/jov-1-20260927:{path}", cwd=origin),
                             "engineering-wins\nproof-stats")
            self.assertEqual(self.git("show", "devin/jov-1-20260927:a.ts", cwd=origin), "main")

    def test_mixed_generated_conflicts_run_each_resolver_once(self):
        topology = ".github/workflow-topology.gen.yml"
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n", topology: "pr\n"},
                                     main_changes={"pnpm-lock.yaml": "main\n", topology: "main\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertEqual(calls.count(["pnpm", "install", "--lockfile-only", "--ignore-scripts"]), 1)
            self.assertEqual(calls.count(["pnpm", "ci:topology:write"]), 1)

    def test_cleanly_merged_generated_file_is_also_regenerated(self):
        topology = ".github/workflow-topology.gen.yml"
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n"},
                                     main_changes={"pnpm-lock.yaml": "main\n", topology: "main topology\n"})
            ok, calls = self.run_resolve(work)
            self.assertTrue(ok)
            self.assertEqual(calls.count(["pnpm", "ci:topology:write"]), 1)
            self.assertEqual(self.git("show", f"devin/jov-1-20260927:{topology}", cwd=origin), "regenerated")

    def test_a_source_conflict_is_left_to_the_agent_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            origin, work = self.repo(Path(tmp), {"pnpm-lock.yaml": "pr\n", "a.ts": "pr\n"})
            before = self.git("rev-parse", "devin/jov-1-20260927", cwd=origin)
            ok, calls = self.run_resolve(work)
            self.assertFalse(ok)
            self.assertNotIn(["pnpm", "install", "--lockfile-only", "--ignore-scripts"], calls)
            self.assertFalse((work / ".git" / "MERGE_HEAD").exists(), "merge aborted")
            self.assertEqual(self.git("rev-parse", "devin/jov-1-20260927", cwd=origin), before)

    def test_failed_generated_restore_or_generator_stops_before_staging(self):
        for failure in ("checkout", "generator"):
            calls = []
            def shell(args, **kwargs):
                calls.append(args)
                failed = (failure == "checkout" and args[:2] == ["git", "checkout"]
                          or failure == "generator" and args[0] == "pnpm")
                return SimpleNamespace(returncode=int(failed), stdout="", stderr="")
            with self.subTest(failure=failure), patch.object(lane, "sh", side_effect=shell):
                self.assertFalse(lane.regenerate_merged_generated(
                    Path("/not-used"), [".github/workflow-topology.gen.yml"], None))
            self.assertFalse(any(cmd[:2] == ["git", "add"] for cmd in calls))
