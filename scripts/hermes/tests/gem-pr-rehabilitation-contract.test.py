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
FLEET_INSTALLER = HERMES / "install-gem-fleet-controller.sh"
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

    def test_installed_layout_does_not_look_beside_the_module(self) -> None:
        """Drain import on Gem copies this module to gem-workspace/scripts/.

        The installer places the JSON at gem-workspace/config/, not
        gem-workspace/scripts/config/. A with_name('config') default
        reproduces the FileNotFoundError that rolled back activation.
        """
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            scripts = root / "scripts"
            config = root / "config"
            scripts.mkdir()
            config.mkdir()
            shutil.copy2(REGISTRY_SOURCE, scripts / "gem_repo_registry.py")
            sample = {
                "schema_version": 1,
                "repos": [
                    {
                        "id": "jovie",
                        "github": "JovieInc/Jovie",
                        "class": "product",
                        "owner": "gem",
                        "kpi": "ship",
                        "local_path": "/home/timwhite/Jovie",
                        "default_branch": "main",
                        "policies": {"health": True, "pr_drain": True, "issue_intake": True},
                    }
                ],
            }
            (config / "gem-repo-registry.json").write_text(json.dumps(sample), encoding="utf-8")
            spec = importlib.util.spec_from_file_location(
                "gem_repo_registry_installed", scripts / "gem_repo_registry.py"
            )
            assert spec and spec.loader
            installed = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = installed
            spec.loader.exec_module(installed)
            resolved = installed.resolve_registry_path(
                module_file=scripts / "gem_repo_registry.py",
                env={},
            )
            self.assertEqual(resolved, (config / "gem-repo-registry.json").resolve())
            self.assertNotEqual(
                resolved,
                scripts / "config" / "gem-repo-registry.json",
            )
            self.assertTrue(resolved.is_file())
            repos = installed.load_registry(resolved)
            self.assertEqual(repos[0].github, "JovieInc/Jovie")
            # Importing drain after PYTHONPATH=scripts must not FileNotFound
            # on scripts/config/gem-repo-registry.json.
            env = {**os.environ}
            env.pop("GEM_REPO_REGISTRY", None)
            drain = HERMES / "gem-pr-drain.py"
            # Use the shipped resolver, not drain's module-level by_github
            # against the source tree.
            self.assertEqual(
                installed.resolve_registry_path(module_file=scripts / "gem_repo_registry.py", env={}),
                (root / "config" / "gem-repo-registry.json").resolve(),
            )

    def test_env_override_wins_for_registry_path(self) -> None:
        override = pathlib.Path("/tmp/explicit-gem-repo-registry.json")
        got = REGISTRY.resolve_registry_path(
            module_file=HERMES / "gem_repo_registry.py",
            env={"GEM_REPO_REGISTRY": str(override)},
        )
        self.assertEqual(got, override)

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


class FleetControllerInstallerContractTests(unittest.TestCase):
    def _fixture(
        self, directory: str, *, policy_source=None
    ) -> pathlib.Path:
        fixture = pathlib.Path(directory) / "repo"
        shutil.copytree(HERMES, fixture / "scripts/hermes")
        if policy_source is not None:
            (fixture / "scripts/hermes/gem_rehabilitation_policy.py").write_text(
                policy_source, encoding="utf-8"
            )
        git_env = _git_env()
        subprocess.run(
            ["git", "init", "-q", str(fixture)], check=True, env=git_env
        )
        subprocess.run(
            ["git", "-C", str(fixture), "add", "scripts/hermes"],
            check=True,
            env=git_env,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(fixture),
                "-c",
                "user.name=Gem Test",
                "-c",
                "user.email=gem-test@example.invalid",
                "commit",
                "-qm",
                "fixture",
            ],
            check=True,
            env=git_env,
        )
        return fixture

    def _runtime(self, directory: str) -> tuple[dict[str, pathlib.Path], dict[str, str]]:
        root = pathlib.Path(directory)
        gem = root / "gem"
        symphony = root / "symphony"
        home = root / "home"
        fake_bin = root / "bin"
        paths = {
            "gem": gem,
            "policy": gem / "scripts/gem_rehabilitation_policy.py",
            "gate": gem / "scripts/gem-priority-gate.py",
            "consumer": gem / "scripts/gem-pr-drain.py",
            "workflow": symphony / "WORKFLOW.jovie-ui-pilot.md",
            "attestation": gem / "state/gem-service-attestation.json",
        }
        (gem / "scripts").mkdir(parents=True)
        symphony.mkdir(parents=True)
        (home / ".config/systemd/user").mkdir(parents=True)
        fake_bin.mkdir()
        paths["gate"].write_text("old gate\n", encoding="utf-8")
        paths["consumer"].write_text("old consumer\n", encoding="utf-8")
        paths["workflow"].write_text("old workflow\n", encoding="utf-8")

        systemctl = fake_bin / "systemctl"
        systemctl.write_text(
            """#!/bin/sh
case "$*" in
  *"show-environment"*) exit 0 ;;
  *"is-active --quiet gem-pr-drain.timer"*) exit 1 ;;
  *"is-active --quiet gem-pr-drain.service"*) exit 1 ;;
  *"restart symphony-ui-pilot.service"*)
    [ "${FAKE_RESTART_FAILURE:-false}" != true ]
    exit
    ;;
  *"is-active --quiet symphony-ui-pilot.service"*) exit 0 ;;
esac
exit 0
""",
            encoding="utf-8",
        )
        systemctl.chmod(0o755)
        curl = fake_bin / "curl"
        curl.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' "
            "'{\"counts\":{\"running\":0,\"retrying\":0,\"blocked\":0}}'\n",
            encoding="utf-8",
        )
        curl.chmod(0o755)
        env = {
            "HOME": str(home),
            "GEM_WORKSPACE": str(gem),
            "SYMPHONY_RUNTIME": str(symphony),
            "PATH": f"{fake_bin}:/usr/bin:/bin:/usr/sbin:/sbin",
        }
        return paths, env

    def _install(
        self,
        fixture: pathlib.Path,
        env: dict[str, str],
        *,
        fail_restart: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["bash", str(fixture / FLEET_INSTALLER.relative_to(ROOT)), str(fixture)],
            env={
                **env,
                "FAKE_RESTART_FAILURE": "true" if fail_restart else "false",
            },
            text=True,
            capture_output=True,
            check=False,
        )

    def _verify(
        self, fixture: pathlib.Path, directory: str
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["bash", str(fixture / FLEET_INSTALLER.relative_to(ROOT)), str(fixture)],
            env={
                "HOME": directory,
                "GEM_WORKSPACE": str(pathlib.Path(directory) / "gem"),
                "SYMPHONY_RUNTIME": str(pathlib.Path(directory) / "symphony"),
                "FLEET_INSTALL_VERIFY_ONLY": "true",
                "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            },
            text=True,
            capture_output=True,
            check=False,
        )

    def test_verify_only_hashes_the_runtime_policy_and_imports_the_consumer(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            process = self._verify(fixture, directory)

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("fleet controller install sources verified", process.stdout)
        self.assertIn("scripts/hermes/gem_rehabilitation_policy.py", process.stdout)

    def test_verify_only_fails_when_policy_cannot_satisfy_the_consumer_import(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(
                directory, policy_source="POLICY_FIXTURE = True\n"
            )
            process = self._verify(fixture, directory)

        self.assertNotEqual(process.returncode, 0)
        self.assertIn("cannot import name 'bounded_selection'", process.stderr)

    def test_install_attests_the_exact_runtime_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env)
            installed_policy = paths["policy"].read_bytes()
            attestation = json.loads(paths["attestation"].read_text(encoding="utf-8"))

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(
            installed_policy,
            (HERMES / "gem_rehabilitation_policy.py").read_bytes(),
        )
        self.assertTrue(attestation["policy"]["matches"])
        self.assertEqual(
            attestation["policy"]["sourceSha256"],
            attestation["policy"]["installedSha256"],
        )

    def test_failed_install_removes_a_new_policy_during_atomic_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, fail_restart=True)
            restored = {
                name: paths[name].read_text(encoding="utf-8")
                for name in ("gate", "consumer", "workflow")
            }
            policy_exists = paths["policy"].exists()

        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(restored["gate"], "old gate\n")
        self.assertEqual(restored["consumer"], "old consumer\n")
        self.assertEqual(restored["workflow"], "old workflow\n")
        self.assertFalse(policy_exists)
        self.assertIn("fleet controller install rolled back", process.stderr)


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
