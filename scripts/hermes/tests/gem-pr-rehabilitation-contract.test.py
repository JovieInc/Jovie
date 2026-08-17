#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

# Pre-push leaks these into children and poisons fixture-repo git commands.
_LEAKED_GIT_ENV_VARS = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_PREFIX",
    "GIT_INDEX_FILE",
)


def _git_env() -> dict[str, str]:
    return {
        key: value
        for key, value in os.environ.items()
        if key not in _LEAKED_GIT_ENV_VARS
    }


ROOT = pathlib.Path(__file__).resolve().parents[3]
HERMES = ROOT / "scripts/hermes"
REGISTRY_SOURCE = HERMES / "gem_repo_registry.py"
INSTALLER = HERMES / "install-gem-pr-rehabilitation.sh"
ACTIVATION = ROOT / ".github/workflows/gem-delivery-controller-activation.yml"
SPEC = importlib.util.spec_from_file_location("gem_repo_registry", REGISTRY_SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {REGISTRY_SOURCE}")
REGISTRY = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = REGISTRY
SPEC.loader.exec_module(REGISTRY)


class RegistryContractTests(unittest.TestCase):
    def test_jovie_stabilization_is_allowlisted_without_changing_issue_policy(self):
        policy = REGISTRY.by_github("JovieInc/Jovie")
        self.assertTrue(policy.pr_drain)
        self.assertTrue(policy.issue_intake)
        self.assertEqual(policy.default_branch, "main")

    def test_every_repository_is_unique_and_explicit(self):
        repositories = REGISTRY.load_registry()
        names = [repo.github.casefold() for repo in repositories]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(all(repo.local_path for repo in repositories))


class DeploymentContractTests(unittest.TestCase):
    def test_versioned_service_uses_versioned_cycle_registry_and_model_router(self):
        service = (HERMES / "systemd/gem-pr-drain.service").read_text(encoding="utf-8")
        self.assertIn("%h/gem-workspace/scripts/gem-repo-drain-cycle.py", service)
        self.assertIn("%h/gem-workspace/config/gem-repo-registry.json", service)
        self.assertIn("%h/gem-workspace/scripts/model-router.py", service)
        self.assertNotIn("/home/timwhite/Jovie/", service)

    def test_activation_requires_exact_rehabilitation_attestation(self):
        workflow = ACTIVATION.read_text(encoding="utf-8")
        self.assertIn("install-gem-pr-rehabilitation.sh", workflow)
        self.assertIn("gem-pr-rehabilitation-attestation/v1", workflow)
        self.assertIn(".sourceRevision == $sha", workflow)
        self.assertIn("([.artifacts[].matches] | all)", workflow)

    def test_verify_only_installer_is_source_clean_and_side_effect_free(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = pathlib.Path(directory) / "repo"
            shutil.copytree(HERMES, fixture / "scripts/hermes")
            git_env = _git_env()
            subprocess.run(
                ["git", "init", "-q", str(fixture)],
                check=True,
                env=git_env,
            )
            subprocess.run(
                ["git", "-C", str(fixture), "add", "scripts/hermes"],
                check=True,
                env=git_env,
            )
            subprocess.run(
                [
                    "git", "-C", str(fixture), "-c", "user.name=Gem Test",
                    "-c", "user.email=gem-test@example.invalid", "commit", "-qm", "fixture",
                ],
                check=True,
                env=git_env,
            )
            process = subprocess.run(
                ["bash", str(fixture / "scripts/hermes/install-gem-pr-rehabilitation.sh"), str(fixture)],
                env={
                    "HOME": directory,
                    "GEM_WORKSPACE": str(pathlib.Path(directory) / "gem"),
                    "GEM_REHABILITATION_VERIFY_ONLY": "true",
                    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                },
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("install sources verified", process.stdout)


class ModelPolicyContractTests(unittest.TestCase):
    def test_grok_is_current_and_bounded_to_edit_only_tools(self):
        registry = json.loads(
            (HERMES / "config/model-registry.json").read_text(encoding="utf-8")
        )
        grok = next(model for model in registry["models"] if model["id"] == "grok-4.6")
        arguments = grok["agent_argv"]
        self.assertEqual(grok["model"], "grok-4.6")
        self.assertIn("{cwd}", arguments)
        self.assertIn("acceptEdits", arguments)
        self.assertIn("Bash,WebFetch,WebSearch", arguments)
        self.assertIn("--no-subagents", arguments)
        self.assertNotIn("--always-approve", arguments)


if __name__ == "__main__":
    unittest.main()
