#!/usr/bin/env python3
"""Hook and selection tests for the governor-bounded-codex protected-item gate."""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
CHECK = ROOT / "scripts/symphony/profiles/governor-bounded-codex/protected-intake-check.py"
LIST = ROOT / "scripts/symphony/profiles/governor-bounded-codex/protected-items.json"
WORKFLOW = ROOT / "scripts/symphony/profiles/governor-bounded-codex/WORKFLOW.md"


def load_check():
    spec = importlib.util.spec_from_file_location("protected_intake_check", CHECK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resolved(identifier, labels, pull_requests, branch):
    return {
        "identifier": identifier,
        "labels": labels,
        "pull_requests": pull_requests,
        "branch": branch,
        "linkage": "resolved",
    }


class ProtectedIntakeCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.latch = self.root / "latch.json"
        self._env = os.environ.copy()
        os.environ["SYMPHONY_PROTECTED_INTAKE_LATCH"] = str(self.latch)
        os.environ.pop("SYMPHONY_INTAKE_LINKAGE_FILE", None)
        os.environ.pop("SYMPHONY_PROTECTED_ITEMS", None)

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self._env)
        self.tmp.cleanup()

    def run_check(self, *args: str, linkage: dict | None = None) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        if linkage is not None:
            path = self.root / "linkage.json"
            path.write_text(json.dumps(linkage), encoding="utf-8")
            env["SYMPHONY_INTAKE_LINKAGE_FILE"] = str(path)
        return subprocess.run(
            [sys.executable, str(CHECK), *args],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )

    def batch(self, issues: list[dict], list_path: pathlib.Path | None = None) -> subprocess.CompletedProcess[str]:
        path = self.root / "issues.json"
        path.write_text(json.dumps({"issues": issues}), encoding="utf-8")
        args = ["--issues-file", str(path)]
        if list_path is not None:
            args.extend(["--list", str(list_path)])
        return self.run_check(*args)

    def test_checked_in_list_contains_the_protected_set(self) -> None:
        payload = json.loads(LIST.read_text(encoding="utf-8"))
        self.assertEqual(payload["pull_requests"], [17453, 17156, 18299, 17511])
        self.assertEqual(payload["issues"], ["JOV-5914", "JOV-6519"])
        self.assertEqual(
            payload["branches"],
            [
                "kimi/JOV-5914-fix",
                "cursor/symphony-cursor-capacity-5844",
                "cursor/gem-gate-issue-blocked-intake-c699",
                "codex/homepage-canonical-sizing-20260909",
            ],
        )
        self.assertEqual(payload["labels"], ["hold", "protected", "human-only"])
        self.assertEqual(payload["label_patterns"], ["zz-upstream*"])
        self.assertNotIn("needs-human", payload["labels"])
        self.assertNotIn("human-review-required", payload["labels"])

    def test_workflow_runs_the_check_before_workspace_creation(self) -> None:
        source = WORKFLOW.read_text(encoding="utf-8")
        hook = source.split("after_create: |", 1)[1].split("before_run:", 1)[0]
        check = hook.index("symphony-protected-intake-check")
        create = hook.index('jovie-symphony-workspace-create" "$PWD"')
        self.assertLess(check, create)
        self.assertIn("|| exit $?", hook)
        self.assertEqual(source.count("max_concurrent_agents: 5"), 1)
        excluded = source.split("excluded_labels:", 1)[1].split("active_states:", 1)[0]
        for label in ("hold", "protected", "human-only"):
            self.assertIn(f"    - {label}\n", excluded)
        self.assertNotIn("human-review-required", excluded)
        self.assertNotIn("needs-human", excluded)
        self.assertNotIn("no-auto", excluded)

    def test_protected_agent_ready_issues_are_not_selected(self) -> None:
        cases = [
            resolved("JOV-5914", ["agent-ready"], [], None),
            resolved("JOV-6519", ["agent-ready"], [], None),
            resolved("JOV-7701", ["agent-ready"], [17453], None),
            resolved("JOV-7702", ["agent-ready"], [17156], None),
            resolved("JOV-7703", ["agent-ready"], [18299], None),
            resolved("JOV-7704", ["agent-ready"], [17511], None),
            resolved("JOV-7705", ["agent-ready"], [], "kimi/JOV-5914-fix"),
            resolved("JOV-7706", ["agent-ready"], [], "cursor/symphony-cursor-capacity-5844"),
            resolved("JOV-7707", ["agent-ready"], [], "cursor/gem-gate-issue-blocked-intake-c699"),
            resolved("JOV-7708", ["agent-ready"], [], "codex/homepage-canonical-sizing-20260909"),
            resolved("JOV-7709", ["agent-ready", "hold"], [], None),
            resolved("JOV-7710", ["agent-ready", "protected"], [], None),
            resolved("JOV-7711", ["agent-ready", "human-only"], [], None),
            resolved("JOV-7712", ["agent-ready", "zz-upstream-cutover"], [], None),
            resolved("JOV-7713", ["agent-ready", "ZZ-Upstream-other"], [], None),
            resolved("JOV-7201", ["agent-ready"], [], None),
            resolved("JOV-7202", ["agent-ready", "human-review-required"], [], None),
            resolved("JOV-7203", ["agent-ready", "needs-human"], [], None),
        ]
        completed = self.batch(cases)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        decision = json.loads(completed.stdout)
        self.assertIsNone(decision["blocked"])
        self.assertEqual(decision["admitted"], ["JOV-7201", "JOV-7202", "JOV-7203"])
        refused = {item["identifier"]: item["match"] for item in decision["refused"]}
        self.assertEqual(refused["JOV-5914"], "issue")
        self.assertEqual(refused["JOV-7701"], "pull_request")
        self.assertEqual(refused["JOV-7705"], "branch")
        self.assertEqual(refused["JOV-7709"], "label")
        self.assertEqual(refused["JOV-7712"], "label")

    def test_missing_or_malformed_list_blocks_selection(self) -> None:
        issue = [resolved("JOV-7201", ["agent-ready"], [], None)]
        missing = self.batch(issue, self.root / "absent.json")
        self.assertNotEqual(missing.returncode, 0)
        self.assertEqual(json.loads(missing.stdout)["blocked"], "protected-list-unavailable")
        self.assertEqual(json.loads(missing.stdout)["admitted"], [])

        malformed_path = self.root / "malformed.json"
        malformed_path.write_text("{", encoding="utf-8")
        malformed = self.batch(issue, malformed_path)
        self.assertNotEqual(malformed.returncode, 0)
        self.assertEqual(json.loads(malformed.stdout)["blocked"], "protected-list-unavailable")

        empty = self.root / "empty.json"
        empty.write_text(json.dumps({"schema": "symphony-protected-items/v1"}), encoding="utf-8")
        incomplete = self.batch(issue, empty)
        self.assertEqual(json.loads(incomplete.stdout)["blocked"], "protected-list-unavailable")

    def test_unresolved_linkage_blocks_unprotected_issues_too(self) -> None:
        completed = self.batch(
            [
                {"identifier": "JOV-7801", "labels": ["agent-ready"], "linkage": "unresolved"},
                resolved("JOV-7201", ["agent-ready"], [], None),
            ]
        )
        self.assertNotEqual(completed.returncode, 0)
        decision = json.loads(completed.stdout)
        self.assertEqual(decision["blocked"], "linkage-unresolved")
        self.assertEqual(decision["admitted"], [])

    def test_workspace_hook_refuses_before_creating_a_workspace(self) -> None:
        workspace = self.root / "JOV-5914"
        completed = self.run_check(
            "--workspace",
            str(workspace),
            linkage={"JOV-5914": resolved("JOV-5914", ["agent-ready"], [17156], "kimi/JOV-5914-fix")},
        )
        self.assertEqual(completed.returncode, 78, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "protected-item")
        self.assertFalse(workspace.exists())
        self.assertFalse(self.latch.exists())

    def test_workspace_hook_blocks_later_intake_when_linkage_is_unresolved(self) -> None:
        first = self.root / "JOV-7801"
        unresolved = self.run_check("--workspace", str(first), linkage={})
        self.assertEqual(unresolved.returncode, 75)
        self.assertEqual(unresolved.stdout.strip(), "linkage-unresolved")
        self.assertFalse(first.exists())
        self.assertTrue(self.latch.is_file())

        later = self.root / "JOV-7201"
        blocked = self.run_check(
            "--workspace",
            str(later),
            linkage={"JOV-7201": resolved("JOV-7201", ["agent-ready"], [], None)},
        )
        self.assertEqual(blocked.returncode, 75)
        self.assertEqual(blocked.stdout.strip(), "linkage-unresolved")
        self.assertFalse(later.exists())

    def test_workspace_hook_admits_an_unprotected_issue_without_creating_files(self) -> None:
        workspace = self.root / "JOV-7201"
        completed = self.run_check(
            "--workspace",
            str(workspace),
            linkage={"JOV-7201": resolved("JOV-7201", ["agent-ready"], [], None)},
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "admitted")
        self.assertFalse(workspace.exists())

    def test_missing_list_on_the_workspace_hook_refuses_without_a_workspace(self) -> None:
        workspace = self.root / "JOV-7201"
        completed = self.run_check("--workspace", str(workspace), "--list", str(self.root / "absent.json"))
        self.assertEqual(completed.returncode, 66)
        self.assertEqual(completed.stdout.strip(), "protected-list-unavailable")
        self.assertFalse(workspace.exists())

    def test_live_linkage_failure_is_unresolved_without_calling_the_network(self) -> None:
        module = load_check()
        calls = {"urlopen": 0}

        def explode(*_args, **_kwargs):
            calls["urlopen"] += 1
            raise AssertionError("network lookup is not allowed in this test")

        os.environ.pop("LINEAR_API_KEY", None)
        with mock.patch.object(module.urllib.request, "urlopen", explode):
            with self.assertRaises(module.LinkageUnresolved):
                module.linear_issue("JOV-7201")
        self.assertEqual(calls["urlopen"], 0)

        def fail_linear(_identifier):
            raise module.LinkageUnresolved("linear down")

        with self.assertRaises(module.LinkageUnresolved):
            module.resolve_live("JOV-7201", linear=fail_linear, github=lambda *_args: [])

    def test_truncated_github_linkage_is_unresolved(self) -> None:
        module = load_check()
        calls = {"n": 0}

        def truncated(*_args, **_kwargs):
            calls["n"] += 1
            return subprocess.CompletedProcess(
                args=["gh"],
                returncode=0,
                stdout=json.dumps({"total_count": 21, "items": []}),
                stderr="",
            )

        with mock.patch.object(module.subprocess, "run", truncated):
            with self.assertRaises(module.LinkageUnresolved) as raised:
                module.github_pulls("JOV-7201", None)
        self.assertEqual(calls["n"], 1)
        self.assertIn("github linkage truncated", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
