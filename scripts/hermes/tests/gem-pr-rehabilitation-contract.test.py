#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import fcntl
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
        self.assertIn(".timerEnabled == true", workflow)
        self.assertIn("systemctl --user is-enabled --quiet gem-pr-drain.timer", workflow)
        self.assertIn("systemctl --user is-active --quiet gem-pr-drain.timer", workflow)
        self.assertIn("([.artifacts[].matches] | all)", workflow)
        self.assertIn(
            "systemctl --user is-enabled --quiet symphony-concurrency-controller.timer",
            workflow,
        )
        self.assertIn(
            "systemctl --user is-active --quiet symphony-concurrency-controller.timer",
            workflow,
        )

    def test_activation_seeds_capacity_before_guarded_runtime_restart(self):
        workflow = ACTIVATION.read_text(encoding="utf-8")
        stage = workflow.index(
            "update-symphony-burrito.sh --skip-binary --no-restart"
        )
        seed_capacity = workflow.index("install-gem-fleet-controller.sh", stage)
        refresh_gate = workflow.index("install-gem-pr-rehabilitation.sh", seed_capacity)
        restart = workflow.index(
            "update-symphony-burrito.sh --skip-binary\n",
            refresh_gate,
        )
        readback = workflow.index(
            "update-symphony-burrito.sh --runtime-readback",
            restart,
        )
        reattest = workflow.index("install-gem-fleet-controller.sh", readback)

        self.assertLess(stage, seed_capacity)
        self.assertLess(seed_capacity, refresh_gate)
        self.assertLess(refresh_gate, restart)
        self.assertLess(restart, readback)
        self.assertLess(readback, reattest)

    def test_activation_can_stage_capacity_when_official_service_is_inactive(self):
        workflow = ACTIVATION.read_text(encoding="utf-8")
        installer = FLEET_INSTALLER.read_text(encoding="utf-8")
        stage = workflow.index("FLEET_INSTALL_STAGE_ONLY=true")
        first_install = workflow.index(
            "bash scripts/hermes/install-gem-fleet-controller.sh", stage
        )
        guarded_restart = workflow.index(
            "update-symphony-burrito.sh --skip-binary\n", first_install
        )
        final_install = workflow.index(
            "bash scripts/hermes/install-gem-fleet-controller.sh", guarded_restart
        )

        self.assertLess(stage, first_install)
        self.assertLess(first_install, guarded_restart)
        self.assertLess(guarded_restart, final_install)
        self.assertIn('readonly STAGE_ONLY="${FLEET_INSTALL_STAGE_ONLY:-false}"', installer)
        self.assertEqual(installer.count("assert_official_service_ready"), 3)
        self.assertLess(
            installer.index('if [[ "${STAGE_ONLY}" == true ]]'),
            installer.rindex("assert_official_service_ready"),
        )

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

    def _install_runtime(
        self,
        directory: str,
        *,
        fail_enable: bool = False,
        stuck_service: bool = False,
        prior_enabled: bool = False,
        prior_active: bool = False,
    ) -> tuple[subprocess.CompletedProcess[str], pathlib.Path, pathlib.Path, pathlib.Path]:
        root = pathlib.Path(directory)
        fixture = root / "repo"
        home = root / "home"
        gem = root / "gem"
        fake_bin = root / "bin"
        log = root / "systemctl.log"
        enabled = root / "timer.enabled"
        active = root / "timer.active"
        shutil.copytree(HERMES, fixture / "scripts/hermes")
        (home / ".local/bin").mkdir(parents=True)
        unit_root = home / ".config/systemd/user"
        unit_root.mkdir(parents=True)
        (unit_root / "gem-pr-drain.timer").write_text(
            "old timer\n", encoding="utf-8"
        )
        if prior_enabled:
            enabled.touch()
        if prior_active:
            active.touch()
        fake_bin.mkdir()
        git_env = _git_env()
        subprocess.run(["git", "init", "-q", str(fixture)], check=True, env=git_env)
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
        systemctl = fake_bin / "systemctl"
        systemctl.write_text(
            """#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_SYSTEMCTL_LOG"
case "$*" in
  *"show-environment"*) exit 0 ;;
  *"is-active --quiet gem-pr-drain.timer"*) test -f "$FAKE_TIMER_ACTIVE"; exit $? ;;
  *"is-enabled --quiet gem-pr-drain.timer"*) test -f "$FAKE_TIMER_ENABLED"; exit $? ;;
  *"is-active --quiet gem-pr-drain.service"*)
    if [ "$FAKE_STUCK_SERVICE" = true ]; then exit 0; else exit 1; fi
    ;;
  *"enable --now gem-pr-drain.timer"*)
    : > "$FAKE_TIMER_ENABLED"
    : > "$FAKE_TIMER_ACTIVE"
    if [ "$FAKE_ENABLE_FAILURE" = true ]; then
      exit 9
    fi
    exit 0
    ;;
  *"enable gem-pr-drain.timer"*) : > "$FAKE_TIMER_ENABLED"; exit 0 ;;
  *"disable gem-pr-drain.timer"*) rm -f "$FAKE_TIMER_ENABLED"; exit 0 ;;
  *"stop gem-pr-drain.timer"*) rm -f "$FAKE_TIMER_ACTIVE"; exit 0 ;;
  *"start gem-pr-drain.timer"*) : > "$FAKE_TIMER_ACTIVE"; exit 0 ;;
  *"show gem-pr-drain.service --property=Result --value"*)
    printf '%s\n' success
    exit 0
    ;;
esac
exit 0
""",
            encoding="utf-8",
        )
        systemctl.chmod(0o755)
        sleep = fake_bin / "sleep"
        sleep.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        sleep.chmod(0o755)
        process = subprocess.run(
            [
                "bash",
                str(fixture / "scripts/hermes/install-gem-pr-rehabilitation.sh"),
                str(fixture),
            ],
            env={
                "HOME": str(home),
                "GEM_WORKSPACE": str(gem),
                "PATH": f"{fake_bin}:/usr/bin:/bin:/usr/sbin:/sbin",
                "FAKE_SYSTEMCTL_LOG": str(log),
                "FAKE_TIMER_ENABLED": str(enabled),
                "FAKE_TIMER_ACTIVE": str(active),
                "FAKE_ENABLE_FAILURE": "true" if fail_enable else "false",
                "FAKE_STUCK_SERVICE": "true" if stuck_service else "false",
            },
            text=True,
            capture_output=True,
            check=False,
        )
        return process, log, enabled, active

    def test_installer_enables_and_attests_the_recurring_timer(self):
        with tempfile.TemporaryDirectory() as directory:
            process, log, enabled, active = self._install_runtime(directory)
            self.assertEqual(process.returncode, 0, process.stderr)
            receipt = json.loads(
                (
                    pathlib.Path(directory)
                    / "gem/state/gem-pr-rehabilitation-attestation.json"
                ).read_text(encoding="utf-8")
            )
            commands = log.read_text(encoding="utf-8").splitlines()
            enabled_exists = enabled.exists()
            active_exists = active.exists()

        self.assertTrue(enabled_exists)
        self.assertTrue(active_exists)
        self.assertIn("--user enable --now gem-pr-drain.timer", commands)
        self.assertIn("--user is-enabled --quiet gem-pr-drain.timer", commands)
        self.assertTrue(receipt["timerEnabled"])
        self.assertTrue(receipt["timerActive"])

    def test_failed_install_restores_every_prior_timer_state(self):
        for prior_enabled in (False, True):
            for prior_active in (False, True):
                with self.subTest(
                    prior_enabled=prior_enabled, prior_active=prior_active
                ), tempfile.TemporaryDirectory() as directory:
                    process, log, enabled, active = self._install_runtime(
                        directory,
                        fail_enable=True,
                        prior_enabled=prior_enabled,
                        prior_active=prior_active,
                    )
                    commands = log.read_text(encoding="utf-8").splitlines()
                    enabled_exists = enabled.exists()
                    active_exists = active.exists()

                self.assertNotEqual(
                    process.returncode, 0, f"{process.stderr}\n{commands}"
                )
                self.assertEqual(enabled_exists, prior_enabled, commands)
                self.assertEqual(active_exists, prior_active, commands)
                expected_persistence_command = (
                    "--user enable gem-pr-drain.timer"
                    if prior_enabled
                    else "--user disable gem-pr-drain.timer"
                )
                self.assertIn(expected_persistence_command, commands)

    def test_early_stuck_service_failure_restores_prior_active_timer(self):
        with tempfile.TemporaryDirectory() as directory:
            process, log, enabled, active = self._install_runtime(
                directory,
                stuck_service=True,
                prior_enabled=False,
                prior_active=True,
            )
            commands = log.read_text(encoding="utf-8").splitlines()
            enabled_exists = enabled.exists()
            active_exists = active.exists()

        self.assertEqual(process.returncode, 3, process.stderr)
        self.assertFalse(enabled_exists, commands)
        self.assertTrue(active_exists, commands)
        self.assertIn("--user disable gem-pr-drain.timer", commands)
        self.assertIn("--user start gem-pr-drain.timer", commands)


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
            "closure": gem / "scripts/closure_health.py",
            "consumer": gem / "scripts/gem-pr-drain.py",
            "registry_module": gem / "scripts/gem_repo_registry.py",
            "registry_config": gem / "config/gem-repo-registry.json",
            "workflow": symphony / "WORKFLOW.md",
            "attestation": gem / "state/gem-service-attestation.json",
            "controller_receipt": gem / "state/symphony-concurrency.json",
        }
        (gem / "scripts").mkdir(parents=True)
        (gem / "config").mkdir(parents=True)
        symphony.mkdir(parents=True)
        (home / ".config/symphony").mkdir(parents=True)
        (home / ".config/systemd/user").mkdir(parents=True)
        fake_bin.mkdir()
        paths["gate"].write_text("old gate\n", encoding="utf-8")
        paths["closure"].write_text("old closure\n", encoding="utf-8")
        paths["consumer"].write_text("old consumer\n", encoding="utf-8")
        # Stale installed module looks beside itself (scripts/config/...),
        # which is the FileNotFoundError that rolled back activation.
        paths["registry_module"].write_text(
            "from pathlib import Path\n"
            "REGISTRY = Path(__file__).with_name('config') / 'gem-repo-registry.json'\n"
            "def by_github(github):\n"
            "    raise FileNotFoundError(REGISTRY)\n",
            encoding="utf-8",
        )
        paths["registry_config"].write_text("{}\n", encoding="utf-8")
        paths["workflow"].write_text("old workflow\n", encoding="utf-8")

        systemctl = fake_bin / "systemctl"
        systemctl.write_text(
            """#!/bin/sh
case "$*" in
  *"show-environment"*) exit 0 ;;
  *"is-active --quiet gem-pr-drain.timer"*) exit 1 ;;
  *"is-active --quiet gem-pr-drain.service"*) exit 1 ;;
  *"is-active --quiet symphony-concurrency-controller.service"*)
    [ "${FAKE_STUCK_CONTROLLER:-false}" = true ]
    exit
    ;;
  *"stop symphony-concurrency-controller.service"*) exit 0 ;;
  *"disable --now gem-oauth-concurrency-evidence.timer"*)
    [ "${FAKE_RETIREMENT_FAILURE:-false}" != true ]
    exit
    ;;
  *"list-unit-files gem-oauth-concurrency-evidence.timer"*)
    [ "${FAKE_RETIREMENT_FAILURE:-false}" = true ] && printf 'gem-oauth-concurrency-evidence.timer enabled\n'
    exit 0
    ;;
  *"is-active --quiet gem-oauth-concurrency-evidence.timer"*) exit 1 ;;
  *"is-enabled --quiet gem-oauth-concurrency-evidence.timer"*) exit 1 ;;
  *"enable --now symphony-concurrency-controller.timer"*)
    [ -z "${FAKE_TIMER_ENABLE_MARKER:-}" ] || : > "$FAKE_TIMER_ENABLE_MARKER"
    exit 0
    ;;
  *"daemon-reload"*)
    if { [ -n "${FAKE_WORKFLOW_OVERLAY_VALUE:-}" ] || [ "${FAKE_WORKFLOW_UNRELATED_DRIFT:-false}" = true ]; } &&
       [ ! -e "$FAKE_WORKFLOW_MUTATION_MARKER" ]; then
      if [ -n "${FAKE_WORKFLOW_OVERLAY_VALUE:-}" ]; then
        sed "s/max_concurrent_agents: [0-9][0-9]*$/max_concurrent_agents: ${FAKE_WORKFLOW_OVERLAY_VALUE}/" \
          "$FAKE_WORKFLOW_OVERLAY_TARGET" > "$FAKE_WORKFLOW_OVERLAY_TARGET.fake"
        mv "$FAKE_WORKFLOW_OVERLAY_TARGET.fake" "$FAKE_WORKFLOW_OVERLAY_TARGET"
      fi
      if [ "${FAKE_WORKFLOW_UNRELATED_DRIFT:-false}" = true ]; then
        printf '\n# unrelated runtime drift\n' >> "$FAKE_WORKFLOW_OVERLAY_TARGET"
      fi
      : > "$FAKE_WORKFLOW_MUTATION_MARKER"
    fi
    exit 0
    ;;
  *"is-active --quiet symphony-elixir.service"*)
    [ "${FAKE_RUNTIME_FAILURE:-false}" != true ]
    exit
    ;;
  *"show symphony-elixir.service --property=MainPID"*) printf '3131\n'; exit 0 ;;
  *"show symphony-elixir.service --property=ControlGroup"*)
    printf '/user.slice/user-1000.slice/user@1000.service/app.slice/symphony-elixir.service\n'
    exit 0
    ;;
  *"start symphony-concurrency-controller.service"*)
    [ "${FAKE_CONTROLLER_FAILURE:-false}" != true ] || exit 1
    python3 - "$FAKE_CONTROLLER_RECEIPT" "$FAKE_WORKFLOW_OVERLAY_TARGET" "$FAKE_CONTROLLER_TARGET" <<'PY'
import datetime
import hashlib
import json
import pathlib
import re
import sys

receipt_path, workflow_path, controller_path = map(pathlib.Path, sys.argv[1:])
workflow = workflow_path.read_bytes()
controller = controller_path.read_bytes()
target = int(re.search(rb"max_concurrent_agents:\\s*(\\d+)", workflow).group(1))
receipt_path.parent.mkdir(parents=True, exist_ok=True)
receipt_path.write_text(json.dumps({
    "schema": "symphony-concurrency/v1",
    "mode": "applied",
    "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "resourceScope": {"workflow": str(workflow_path)},
    "target": target,
    "workflowSha256": hashlib.sha256(workflow).hexdigest(),
    "controllerSha256": hashlib.sha256(controller).hexdigest(),
}) + "\\n")
PY
    exit 0
    ;;
esac
exit 0
""",
            encoding="utf-8",
        )
        systemctl.chmod(0o755)
        sleep = fake_bin / "sleep"
        sleep.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        sleep.chmod(0o755)
        curl = fake_bin / "curl"
        curl.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' "
            "'{\"counts\":{\"running\":0,\"retrying\":0,\"blocked\":0}}'\n",
            encoding="utf-8",
        )
        curl.chmod(0o755)
        ss = fake_bin / "ss"
        ss.write_text(
            "#!/bin/sh\n"
            "[ \"${FAKE_RUNTIME_FAILURE:-false}\" != true ] || exit 1\n"
            "printf 'LISTEN 0 128 127.0.0.1:4041 0.0.0.0:* users:((\\\"beam.smp\\\",pid=4242,fd=42))\\n'\n",
            encoding="utf-8",
        )
        ss.chmod(0o755)
        flock = fake_bin / "flock"
        flock.write_text(
            "#!/usr/bin/env python3\n"
            "import fcntl, sys\n"
            "args = sys.argv[1:]\n"
            "fd = int(args[-1])\n"
            "operation = fcntl.LOCK_UN if '-u' in args else fcntl.LOCK_EX\n"
            "if '-n' in args:\n"
            "    operation |= fcntl.LOCK_NB\n"
            "try:\n"
            "    fcntl.flock(fd, operation)\n"
            "except BlockingIOError:\n"
            "    raise SystemExit(1)\n",
            encoding="utf-8",
        )
        flock.chmod(0o755)
        proc_root = root / "proc"
        for pid in ("3131", "4242"):
            (proc_root / pid).mkdir(parents=True)
            (proc_root / pid / "cgroup").write_text(
                "0::/user.slice/user-1000.slice/user@1000.service/app.slice/symphony-elixir.service\n",
                encoding="utf-8",
            )
        env = {
            "HOME": str(home),
            "GEM_WORKSPACE": str(gem),
            "SYMPHONY_RUNTIME": str(symphony),
            "FAKE_WORKFLOW_MUTATION_MARKER": str(root / "workflow-mutated"),
            "FAKE_WORKFLOW_OVERLAY_TARGET": str(paths["workflow"]),
            "FAKE_CONTROLLER_RECEIPT": str(paths["controller_receipt"]),
            "FAKE_CONTROLLER_TARGET": str(
                home / ".local/bin/symphony-concurrency-controller"
            ),
            "FAKE_TIMER_ENABLE_MARKER": str(root / "timer-enabled"),
            "GEM_PROC_ROOT": str(proc_root),
            "PATH": f"{fake_bin}:/usr/bin:/bin:/usr/sbin:/sbin",
        }
        return paths, env

    def _install(
        self,
        fixture: pathlib.Path,
        env: dict[str, str],
        *,
        fail_restart: bool = False,
        fail_controller: bool = False,
        fail_retirement: bool = False,
        stuck_controller: bool = False,
        workflow_overlay: str = "",
        unrelated_workflow_drift: bool = False,
        stage_only: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["bash", str(fixture / FLEET_INSTALLER.relative_to(ROOT)), str(fixture)],
            env={
                **env,
                "FAKE_RUNTIME_FAILURE": "true" if fail_restart else "false",
                "FAKE_CONTROLLER_FAILURE": "true" if fail_controller else "false",
                "FAKE_RETIREMENT_FAILURE": "true" if fail_retirement else "false",
                "FAKE_STUCK_CONTROLLER": "true" if stuck_controller else "false",
                "FAKE_WORKFLOW_OVERLAY_VALUE": workflow_overlay,
                "FAKE_WORKFLOW_UNRELATED_DRIFT": (
                    "true" if unrelated_workflow_drift else "false"
                ),
                "FLEET_INSTALL_STAGE_ONLY": "true" if stage_only else "false",
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
        self.assertIn("scripts/hermes/closure_health.py", process.stdout)
        self.assertIn("scripts/hermes/gem_rehabilitation_policy.py", process.stdout)
        self.assertIn("scripts/hermes/gem_repo_registry.py", process.stdout)
        self.assertIn("scripts/hermes/config/gem-repo-registry.json", process.stdout)

    def test_verify_only_fails_when_policy_cannot_satisfy_the_consumer_import(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(
                directory, policy_source="POLICY_FIXTURE = True\n"
            )
            process = self._verify(fixture, directory)

        self.assertNotEqual(process.returncode, 0)
        self.assertIn("cannot import name 'bounded_selection'", process.stderr)

    def test_verify_only_rejects_untracked_install_source(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(fixture),
                    "rm",
                    "--cached",
                    "scripts/hermes/provider_useful_turns.py",
                ],
                check=True,
                capture_output=True,
                text=True,
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
                    "remove tracked provider helper",
                ],
                check=True,
                env=_git_env(),
            )
            process = self._verify(fixture, directory)

        self.assertNotEqual(process.returncode, 0)
        self.assertIn("install source is not tracked at HEAD", process.stderr)

    def test_install_attests_the_exact_installed_policy_without_claiming_runtime_load(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env)
            installed_policy = paths["policy"].read_bytes()
            installed_closure = paths["closure"].read_bytes()
            installed_registry = paths["registry_module"].read_bytes()
            installed_registry_config = paths["registry_config"].read_bytes()
            attestation = json.loads(paths["attestation"].read_text(encoding="utf-8"))

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(
            installed_policy,
            (HERMES / "gem_rehabilitation_policy.py").read_bytes(),
        )
        self.assertEqual(
            installed_closure,
            (HERMES / "closure_health.py").read_bytes(),
        )
        self.assertEqual(
            installed_registry,
            (HERMES / "gem_repo_registry.py").read_bytes(),
        )
        self.assertEqual(
            installed_registry_config,
            (HERMES / "config/gem-repo-registry.json").read_bytes(),
        )
        self.assertIn(b"def resolve_registry_path", installed_registry)
        self.assertTrue(attestation["policy"]["matches"])
        self.assertTrue(attestation["gate"]["matches"])
        self.assertTrue(attestation["closureHealth"]["matches"])
        self.assertTrue(attestation["controllerTick"]["matchesInstalledFiles"])
        self.assertFalse(attestation["controllerTick"]["matchesInstalledRuntime"])
        self.assertEqual(attestation["controllerTick"]["runtimeProof"]["status"], "UNKNOWN")
        self.assertTrue(attestation["controllerTimer"]["enabled"])
        self.assertTrue(attestation["controllerTimer"]["active"])
        self.assertTrue(
            all(
                item["matches"]
                for item in attestation["capacityPipeline"].values()
            )
        )
        self.assertEqual(
            attestation["policy"]["sourceSha256"],
            attestation["policy"]["installedSha256"],
        )
        self.assertEqual(attestation["workflow"]["matchMode"], "exact")
        self.assertEqual(attestation["workflow"]["sourceMaxConcurrentAgents"], 1)
        self.assertEqual(attestation["workflow"]["installedMaxConcurrentAgents"], 1)
        self.assertEqual(attestation["listener"]["wrapperPid"], 3131)
        self.assertEqual(attestation["listener"]["pid"], 4242)

    def test_stage_only_runs_one_tick_without_enabling_the_timer(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            timer_marker = pathlib.Path(env["FAKE_TIMER_ENABLE_MARKER"])
            process = self._install(fixture, env, stage_only=True)
            receipt_exists = paths["controller_receipt"].is_file()
            attestation_exists = paths["attestation"].is_file()

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertTrue(receipt_exists)
        self.assertFalse(timer_marker.exists())
        self.assertFalse(attestation_exists)
        self.assertIn("staged fleet capacity pipeline", process.stdout)

    def test_install_attests_controller_owned_bounded_concurrency_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, workflow_overlay="4")
            installed_workflow = paths["workflow"].read_text(encoding="utf-8")
            attestation = json.loads(paths["attestation"].read_text(encoding="utf-8"))

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("max_concurrent_agents: 4", installed_workflow)
        self.assertTrue(attestation["workflow"]["matches"])
        self.assertEqual(
            attestation["workflow"]["matchMode"], "bounded_concurrency_overlay"
        )
        self.assertEqual(attestation["workflow"]["sourceMaxConcurrentAgents"], 1)
        self.assertEqual(attestation["workflow"]["installedMaxConcurrentAgents"], 4)
        self.assertNotEqual(
            attestation["workflow"]["sourceSha256"],
            attestation["workflow"]["installedSha256"],
        )

    def test_install_preserves_validated_thirty_seat_runtime_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            workflow_source = (
                fixture / "scripts/hermes/symphony/WORKFLOW.md"
            ).read_text(encoding="utf-8")
            paths["workflow"].write_text(
                workflow_source.replace(
                    "max_concurrent_agents: 1", "max_concurrent_agents: 30"
                ),
                encoding="utf-8",
            )
            process = self._install(fixture, env)
            installed_workflow = paths["workflow"].read_text(encoding="utf-8")
            attestation = json.loads(
                paths["attestation"].read_text(encoding="utf-8")
            )

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("max_concurrent_agents: 30", installed_workflow)
        self.assertEqual(
            attestation["workflow"]["matchMode"],
            "bounded_concurrency_overlay",
        )
        self.assertEqual(attestation["workflow"]["installedMaxConcurrentAgents"], 30)

    def test_install_rejects_out_of_bounds_concurrency_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, workflow_overlay="41")
            restored_workflow = paths["workflow"].read_text(encoding="utf-8")
            attestation_exists = paths["attestation"].exists()

        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(restored_workflow, "old workflow\n")
        self.assertFalse(attestation_exists)
        self.assertIn("refusing stale Gem service attestation", process.stderr)

    def test_install_rejects_unrelated_workflow_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, unrelated_workflow_drift=True)
            restored_workflow = paths["workflow"].read_text(encoding="utf-8")
            attestation_exists = paths["attestation"].exists()

        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(restored_workflow, "old workflow\n")
        self.assertFalse(attestation_exists)
        self.assertIn("refusing stale Gem service attestation", process.stderr)

    def test_install_refuses_unhealthy_official_service_before_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, fail_restart=True)
            restored = {
                name: paths[name].read_text(encoding="utf-8")
                for name in ("gate", "closure", "consumer", "workflow", "registry_module", "registry_config")
            }
            policy_exists = paths["policy"].exists()
            backup_root_exists = (pathlib.Path(directory) / "gem/state/backups").exists()

        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(restored["gate"], "old gate\n")
        self.assertEqual(restored["closure"], "old closure\n")
        self.assertEqual(restored["consumer"], "old consumer\n")
        self.assertEqual(restored["workflow"], "old workflow\n")
        self.assertIn("FileNotFoundError", restored["registry_module"])
        self.assertEqual(restored["registry_config"], "{}\n")
        self.assertFalse(policy_exists)
        self.assertFalse(backup_root_exists)
        self.assertIn("official Symphony service symphony-elixir.service is not active", process.stderr)

    def test_install_rolls_back_when_first_controller_tick_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, fail_controller=True)
            restored_gate = paths["gate"].read_text(encoding="utf-8")
            attestation_exists = paths["attestation"].exists()

        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(restored_gate, "old gate\n")
        self.assertFalse(attestation_exists)

    def test_install_refuses_an_inflight_controller_before_backup_or_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, stuck_controller=True)
            gate = paths["gate"].read_text(encoding="utf-8")
            backup_root_exists = (paths["gem"] / "state/backups").exists()

        self.assertEqual(process.returncode, 3, process.stderr)
        self.assertEqual(gate, "old gate\n")
        self.assertFalse(backup_root_exists)
        self.assertIn(
            "symphony-concurrency-controller.service is still active",
            process.stderr,
        )

    def test_install_rolls_back_when_legacy_writer_cannot_be_retired(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, fail_retirement=True)
            restored_gate = paths["gate"].read_text(encoding="utf-8")
            attestation_exists = paths["attestation"].exists()

        self.assertEqual(process.returncode, 6)
        self.assertEqual(restored_gate, "old gate\n")
        self.assertFalse(attestation_exists)
        self.assertIn("failed to retire legacy capacity writer", process.stderr)

    def test_contended_install_lock_exits_before_runtime_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            lock = paths["gem"] / "state/fleet-controller-install.lock"
            lock.parent.mkdir(parents=True, exist_ok=True)
            with lock.open("w") as held:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                process = self._install(fixture, env)
            gate = paths["gate"].read_text(encoding="utf-8")

        self.assertEqual(process.returncode, 5, process.stderr)
        self.assertEqual(gate, "old gate\n")
        self.assertIn("install lock is already held", process.stderr)

    def test_fleet_installer_replaces_stale_registry_before_target_smoke(self):
        installer = FLEET_INSTALLER.read_text(encoding="utf-8")
        copy_at = installer.find('install_atomic "${REGISTRY_MODULE_SOURCE}"')
        smoke_at = installer.find('smoke_consumer_import "${CONSUMER_TARGET}"')
        self.assertNotEqual(copy_at, -1)
        self.assertNotEqual(smoke_at, -1)
        self.assertLess(copy_at, smoke_at)
        self.assertIn('install_atomic "${REGISTRY_CONFIG_SOURCE}"', installer)


class ModelPolicyContractTests(unittest.TestCase):
    def test_grok_is_current_and_bounded_to_edit_only_tools(self):
        registry = json.loads(
            (HERMES / "config/model-registry.json").read_text(encoding="utf-8")
        )
        grok = next(model for model in registry["models"] if model["id"] == "grok-4.6")
        arguments = grok["agent_argv"]
        self.assertEqual(grok["model"], "grok-4.6")
        self.assertIn("{cwd}", arguments)
        self.assertIn("-m", arguments)
        self.assertIn("--always-approve", arguments)
        self.assertIn("--disable-web-search", arguments)
        self.assertIn("--no-subagents", arguments)
        self.assertIn("-p", arguments)
        self.assertNotIn("agent", arguments)


if __name__ == "__main__":
    unittest.main()
