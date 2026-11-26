#!/usr/bin/env python3
"""Structural coverage for the official OpenAI Symphony bootstrap."""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / "WORKFLOW.md"
BURRITO_NOTE = ROOT / "docs/ops/openai-symphony-burrito.md"
RETIRED_INTAKE_ARTIFACTS = (
    ROOT / ".github/workflows/jovie-intake-controller.yml",
    ROOT / "scripts/backlog-orchestrator/intake-controller-workflow.test.mjs",
    ROOT / "scripts/backlog-orchestrator/intake-event-controller.mjs",
    ROOT / "scripts/backlog-orchestrator/intake-event-controller.test.mjs",
)


class OpenAISymphonyInstallTests(unittest.TestCase):
    def test_official_workflow_uses_jovie_team_scope_and_codex_app_server(
        self,
    ) -> None:
        workflow = WORKFLOW.read_text()

        self.assertRegex(workflow, re.compile(r"^\s+kind: linear$", re.MULTILINE))
        self.assertIn('team_key: "JOV"', workflow)
        self.assertNotIn("project_slug:", workflow)
        self.assertIn("api_key: $LINEAR_API_KEY", workflow)
        self.assertIn("    excluded_labels:\n      - no-symphony", workflow)
        self.assertRegex(
            workflow,
            re.compile(r"^  required_labels: \[\]$", re.MULTILINE),
        )

        active_states = re.search(
            r"^  active_states:\n(?P<items>(?:    - .+\n)+)(?=  terminal_states:)",
            workflow,
            re.MULTILINE,
        )
        self.assertIsNotNone(active_states)
        assert active_states is not None
        self.assertEqual(
            [
                line.removeprefix("    - ")
                for line in active_states["items"].splitlines()
            ],
            ["Todo", "In Progress", "Merging", "Rework"],
        )

        terminal_states = re.search(
            r"^  terminal_states:\n(?P<items>(?:    - .+\n)+)(?=^polling:)",
            workflow,
            re.MULTILINE,
        )
        self.assertIsNotNone(terminal_states)
        assert terminal_states is not None
        self.assertEqual(
            {
                line.removeprefix("    - ")
                for line in terminal_states["items"].splitlines()
            },
            {"Closed", "Cancelled", "Canceled", "Duplicate", "Done"},
        )
        self.assertRegex(
            workflow,
            re.compile(r"^\s+command: codex .* app-server$", re.MULTILINE),
        )
        self.assertIn(
            "retain the exact failed run, attempt, deployment identity,\n  and owner",
            workflow,
        )
        self.assertIn(
            "must not become a global source-merge gate",
            workflow,
        )

    def test_codex_clone_is_blobless_with_complete_ancestry(self) -> None:
        workflow = WORKFLOW.read_text()
        hook = re.search(
            r"^  after_create: \|\n(?P<script>(?:    .+\n)+)",
            workflow,
            re.MULTILINE,
        )
        self.assertIsNotNone(hook)
        assert hook is not None
        self.assertEqual(
            hook["script"].splitlines(),
            [
                "    git clone --filter=blob:none git@github.com:JovieInc/Jovie.git .",
                "    JOVIE_AGENT_PROFILE=coder ./scripts/setup.sh",
            ],
        )

    def test_codex_clone_checks_out_head_and_fetches_historical_blobs_on_demand(self) -> None:
        # Run the hook's actual clone flags against a local filter-capable origin.
        # No provider credentials or external network are needed for this probe.
        command = re.search(
            r"^    (git clone .+)$", WORKFLOW.read_text(), re.MULTILINE
        )
        self.assertIsNotNone(command)
        assert command is not None
        env = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith("GIT_")
        }
        env.update(
            {
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_AUTHOR_NAME": "fixture",
                "GIT_AUTHOR_EMAIL": "fixture@example.com",
                "GIT_COMMITTER_NAME": "fixture",
                "GIT_COMMITTER_EMAIL": "fixture@example.com",
                "GIT_AUTHOR_DATE": "2026-01-01T00:00:00Z",
                "GIT_COMMITTER_DATE": "2026-01-01T00:00:00Z",
            }
        )
        with tempfile.TemporaryDirectory(prefix="codex-blobless-") as directory:
            root = Path(directory)
            source, work = root / "source", root / "work"

            def git(cwd: Path, *args: str, no_lazy_fetch: bool = False) -> str:
                return subprocess.check_output(
                    ["git", *args],
                    cwd=cwd,
                    env={
                        **env,
                        **({"GIT_NO_LAZY_FETCH": "1"} if no_lazy_fetch else {}),
                    },
                    text=True,
                    stderr=subprocess.PIPE,
                    timeout=15,
                ).strip()

            git(root, "init", "--quiet", "--initial-branch=main", str(source))
            git(source, "config", "uploadpack.allowFilter", "true")
            (source / "historical.txt").write_text("historical blob")
            (source / "current.txt").write_text("initial tree")
            git(source, "add", ".")
            git(source, "commit", "-qm", "initial")
            historical_blob = git(source, "rev-parse", "HEAD:historical.txt")
            git(source, "rm", "-q", "historical.txt")
            (source / "current.txt").write_text("current tree")
            git(source, "add", ".")
            git(source, "commit", "-qm", "head")
            args = shlex.split(command[1])[1:]
            args[-2:] = [source.as_uri(), str(work)]
            git(root, *args)
            self.assertEqual(
                git(work, "rev-parse", "HEAD"), git(source, "rev-parse", "HEAD")
            )
            self.assertEqual(git(work, "rev-list", "--count", "HEAD"), "2")
            self.assertEqual(
                git(work, "rev-parse", "--is-shallow-repository"), "false"
            )
            self.assertEqual((work / "current.txt").read_text(), "current tree")
            self.assertEqual(
                git(work, "config", "remote.origin.partialclonefilter"), "blob:none"
            )
            self.assertEqual(git(work, "config", "remote.origin.promisor"), "true")
            missing = git(
                work, "rev-list", "--objects", "--missing=print", "HEAD",
                no_lazy_fetch=True,
            )
            self.assertIn("?" + historical_blob, missing.splitlines())
            self.assertEqual(git(work, "show", "HEAD^:historical.txt"), "historical blob")

    def test_burrito_note_binds_the_supported_team_adapter(self) -> None:
        note = BURRITO_NOTE.read_text()

        self.assertLessEqual(len(note.splitlines()), 20)
        self.assertIn("JovieInc/symphony-ops", note)
        self.assertIn("fae11882085d83d8d2a58f0f864a9eb1b6e40db8", note)
        self.assertIn("1c0fb6c8e8ef9031a2c861e62af5f9e66cee39cb", note)
        self.assertIn(
            "aa7159e51fe41d3c712e3870ba82a314e93eb384e8189c649dd0f69aec1ef989",
            note,
        )
        self.assertIn("must not be started with this workflow", note)
        self.assertNotIn("github.com/openai/symphony/releases/download", note)

    def test_homemade_intake_and_admission_wrappers_stay_deleted(self) -> None:
        for artifact in RETIRED_INTAKE_ARTIFACTS:
            with self.subTest(artifact=artifact.relative_to(ROOT)):
                self.assertFalse(artifact.exists())


if __name__ == "__main__":
    unittest.main()
