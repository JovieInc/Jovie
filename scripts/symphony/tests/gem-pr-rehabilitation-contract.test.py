#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

# Pre-push leaks these into children and poisons fixture-repo git commands.
_LEAKED_GIT_ENV_VARS = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_PREFIX",
    "GIT_INDEX_FILE",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
)


def _git_env() -> dict[str, str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in _LEAKED_GIT_ENV_VARS
        and not key.startswith("GIT_CONFIG_KEY_")
        and not key.startswith("GIT_CONFIG_VALUE_")
    }
    # Fixture repositories are deleted immediately after their assertions. Keep
    # Git from starting detached maintenance that can race TemporaryDirectory's
    # cleanup and leave a newly-created file under .git after rmtree scans it.
    env.update(
        {
            "GIT_CONFIG_COUNT": "3",
            "GIT_CONFIG_KEY_0": "maintenance.auto",
            "GIT_CONFIG_VALUE_0": "false",
            "GIT_CONFIG_KEY_1": "maintenance.autoDetach",
            "GIT_CONFIG_VALUE_1": "false",
            "GIT_CONFIG_KEY_2": "gc.auto",
            "GIT_CONFIG_VALUE_2": "0",
        }
    )
    return env


ROOT = pathlib.Path(__file__).resolve().parents[3]
HERMES = ROOT / "scripts/symphony"
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

CYCLE_SOURCE = HERMES / "gem-repo-drain-cycle.py"
CYCLE_SPEC = importlib.util.spec_from_file_location("gem_repo_drain_cycle", CYCLE_SOURCE)
assert CYCLE_SPEC and CYCLE_SPEC.loader
CYCLE = importlib.util.module_from_spec(CYCLE_SPEC)
CYCLE_SPEC.loader.exec_module(CYCLE)


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

    def test_issue_intake_products_map_from_registry_ids(self):
        by_id = {repo.id: repo.github for repo in REGISTRY.issue_intake_repos()}
        self.assertEqual(by_id["jovie"], "JovieInc/Jovie")
        self.assertEqual(by_id["logyourbody"], "JovieInc/LogYourBody")
        self.assertEqual(by_id["ovie"], "JovieInc/ovie")
        self.assertEqual(REGISTRY.product_id_for_issue("JOV-12"), "jovie")
        self.assertEqual(REGISTRY.product_id_for_issue("LYB-9"), "logyourbody")
        self.assertEqual(REGISTRY.product_id_for_github("JovieInc/ovie"), "ovie")


class DeploymentContractTests(unittest.TestCase):
    def test_versioned_service_uses_versioned_cycle_registry_and_model_router(self):
        service = (HERMES / "systemd/gem-pr-drain.service").read_text(encoding="utf-8")
        self.assertIn("%h/gem-workspace/scripts/gem-repo-drain-cycle.py", service)
        self.assertIn("/usr/bin/flock -n /tmp/gem-pr-drain.lock", service)
        self.assertIn("%h/gem-workspace/config/gem-repo-registry.json", service)
        self.assertIn("%h/gem-workspace/scripts/model-router.py", service)
        self.assertIn(
            "EnvironmentFile=-%h/.config/symphony/summer-bottleneck.env",
            service,
        )
        self.assertIn(
            "EnvironmentFile=-%h/.config/symphony/runner-source.env",
            service,
        )
        # The existing outbox consumer requires its dedicated outcome signing
        # key and Summer outbox verification keys. Keep that credential
        # boundary on the unattended drain unit so each timer cycle can run
        # the authenticated consumer instead of exiting with rc=78.
        self.assertIn(
            "EnvironmentFile=%h/.config/symphony/summer-bottleneck-signing.env",
            service,
        )
        self.assertNotIn("/home/timwhite/Jovie/", service)

    def test_jovie_producer_refreshes_once_even_when_jovie_drain_is_disabled(self):
        calls = []

        def run(args, **kwargs):
            calls.append((args, kwargs))
            return SimpleNamespace(returncode=2 if len(calls) == 1 else 0)

        with mock.patch.object(CYCLE.subprocess, "run", side_effect=run), mock.patch.dict(
            CYCLE.os.environ,
            {"GEM_WORKSPACE": "/tmp/gem-workspace"},
            clear=False,
        ):
            self.assertEqual(CYCLE.run_summer_bottleneck_producer(), 0)

        self.assertEqual(len(calls), 2)
        gate_args = calls[0][0]
        self.assertEqual(gate_args.count(CYCLE.JOVIE_REPOSITORY), 1)
        self.assertIn("gem-priority-gate.py", gate_args[1])
        self.assertIn("/tmp/gem-workspace/state/gem-priority-gate", gate_args)
        self.assertEqual(calls[1][0][-1], "--submit")
        self.assertIn("summer_bottleneck_producer.py", calls[1][0][1])

    def test_producer_failure_is_isolated_after_all_repository_cycles(self):
        repos = [
            SimpleNamespace(github="JovieInc/LogYourBody"),
            SimpleNamespace(github="JovieInc/ovie"),
        ]
        drains = []
        projections = []

        def run_drain(args, **kwargs):
            env = kwargs.get("env") or {}
            if "GEM_PR_DRAIN_REPO" in env:
                drains.append(env["GEM_PR_DRAIN_REPO"])
            else:
                projections.append(args[1])
            return SimpleNamespace(returncode=0)

        def summer():
            self.assertEqual(drains, [repo.github for repo in repos])
            return 1

        with mock.patch.object(CYCLE, "pr_drain_repos", return_value=repos), mock.patch.object(
            CYCLE.subprocess, "run", side_effect=run_drain
        ), mock.patch.object(CYCLE, "run_summer_bottleneck_producer", side_effect=summer) as producer, mock.patch.object(
            CYCLE, "run_summer_symphony_consumer", return_value=78
        ) as consumer, mock.patch.object(
            CYCLE.symphony_accepted_completion, "reconcile", return_value={"target": 1}
        ):
            self.assertEqual(CYCLE.main(), 1)

        producer.assert_called_once_with()
        consumer.assert_called_once_with()
        self.assertEqual(drains, [repo.github for repo in repos])
        self.assertEqual(len(projections), 1)
        self.assertIn("symphony_capacity_evidence.py", projections[0])

    def test_capacity_projection_runs_even_when_completion_reconcile_fails(self):
        repos = [SimpleNamespace(github="JovieInc/Jovie")]
        calls = []

        def run(args, **kwargs):
            env = kwargs.get("env") or {}
            if "GEM_PR_DRAIN_REPO" in env:
                calls.append("drain")
            else:
                calls.append("projection")
            return SimpleNamespace(returncode=0)

        with mock.patch.object(CYCLE, "pr_drain_repos", return_value=repos), mock.patch.object(
            CYCLE.subprocess, "run", side_effect=run
        ), mock.patch.object(
            CYCLE, "run_summer_bottleneck_producer", return_value=0
        ), mock.patch.object(
            CYCLE, "run_summer_symphony_consumer", return_value=0
        ), mock.patch.object(
            CYCLE.symphony_accepted_completion,
            "reconcile",
            side_effect=ValueError("service attestation drift"),
        ):
            self.assertEqual(CYCLE.main(), 0)

        self.assertEqual(calls, ["projection", "drain"])

    def test_capacity_projection_failure_is_isolated_from_drains(self):
        repos = [SimpleNamespace(github="JovieInc/Jovie")]
        drains = []

        def run(args, **kwargs):
            env = kwargs.get("env") or {}
            if "GEM_PR_DRAIN_REPO" in env:
                drains.append(env["GEM_PR_DRAIN_REPO"])
                return SimpleNamespace(returncode=0)
            return SimpleNamespace(returncode=1)

        with mock.patch.object(CYCLE, "pr_drain_repos", return_value=repos), mock.patch.object(
            CYCLE.subprocess, "run", side_effect=run
        ), mock.patch.object(
            CYCLE, "run_summer_bottleneck_producer", return_value=0
        ), mock.patch.object(
            CYCLE, "run_summer_symphony_consumer", return_value=0
        ), mock.patch.object(
            CYCLE.symphony_accepted_completion, "reconcile", return_value={"target": 0}
        ):
            self.assertEqual(CYCLE.main(), 0)

        self.assertEqual(drains, ["JovieInc/Jovie"])

    def test_capacity_projection_subprocess_failure_is_typed(self):
        with mock.patch.object(
            CYCLE.subprocess, "run", side_effect=OSError("exec format error")
        ):
            self.assertEqual(CYCLE.run_capacity_projection(), 1)

    def test_delivery_diagnostics_are_bounded_and_exclude_raw_credentials(self):
        samples = [
            (SimpleNamespace(returncode=1, stderr="Traceback\nHTTPError: HTTP Error 422: secret-token", stdout="secret-token"),
             {"errorType": "HTTPError", "httpStatus": 422}),
            (SimpleNamespace(returncode=78, stderr="secret-tokenError: hidden", stdout=""),
             {"errorType": "child-process-failed"}),
            (SimpleNamespace(returncode=0, stderr="secret-token", stdout=json.dumps({
                "eve": {"receipt": {"eventId": "summer_abc", "status": "accepted"}},
                "secret": "secret-token"})), {"eventId": "summer_abc", "status": "accepted"}),
            (SimpleNamespace(returncode=0, stdout=json.dumps({"taskKey": "a" * 64,
                "state": "held", "reason": "push-held", "eventId": "unsafe\nsecret-token"})),
             {"taskKey": "a" * 64, "state": "held", "reason": "push-held"}),
            (SimpleNamespace(returncode=0, stdout="not-json secret-token"), {}),
            (SimpleNamespace(returncode=0, stdout="[]"), {}),
            (SimpleNamespace(returncode=0, stdout='{"eve":null}'), {}),
            (SimpleNamespace(returncode=0, stdout='{"eve":{"receipt":null}}'), {}),
        ]
        for process, expected in samples:
            with self.subTest(process=process), contextlib.redirect_stdout(io.StringIO()) as output:
                CYCLE.report_delivery("publication", process)
                raw = output.getvalue()
                self.assertNotIn("secret-token", raw)
                self.assertLess(len(raw), 600)
                value = json.loads(raw)
                self.assertEqual(value["stage"], "publication")
                for key, item in expected.items():
                    self.assertEqual(value[key], item)

    def test_native_queue_execution_binds_consumer_projection_and_skips_other_receipts(self):
        fleet = pathlib.Path("/tmp/gem-workspace/state/gem-priority-gate/latest.json")
        task_key = "a" * 64
        source = "b" * 40
        digest = "c" * 64
        stdout = json.dumps({
            "schema": "jovie.summer-symphony-consumer-cycle/v1",
            "status": "projection-recorded",
            "taskKey": task_key,
            "issueIdentifier": "JOV-6329",
            "acknowledgement": "recorded",
            "action": "reconcile-native-queue-starvation",
            "sourceVersion": source,
            "snapshotDigest": digest,
        })
        argv = CYCLE.native_queue_execution_argv(stdout, fleet)
        self.assertEqual(argv[0], "node")
        self.assertTrue(argv[1].endswith("run-native-queue-execution.mjs"))
        self.assertEqual(argv[2:], [task_key, "JOV-6329", source, digest, str(fleet)])
        self.assertIsNone(CYCLE.native_queue_execution_argv(
            json.dumps({"status": "healthy-noop"}), fleet))
        self.assertIsNone(CYCLE.native_queue_execution_argv(
            json.dumps({
                "status": "projection-recorded",
                "taskKey": task_key,
                "issueIdentifier": "JOV-6329",
                "action": "remediate-selected-ci-audit-class",
                "sourceVersion": source,
                "snapshotDigest": digest,
            }),
            fleet,
        ))
        self.assertIsNone(CYCLE.native_queue_execution_argv("not-json", fleet))
        self.assertIsNone(CYCLE.native_queue_execution_argv("[]", fleet))
        self.assertIsNone(CYCLE.native_queue_execution_argv(
            json.dumps({
                "status": "projection-recorded",
                "taskKey": task_key,
                "issueIdentifier": "JOV-0",
                "action": "reconcile-native-queue-starvation",
                "sourceVersion": source,
                "snapshotDigest": digest,
            }),
            fleet,
        ))

    def test_consumer_success_runs_native_queue_execute_and_surfaces_its_failure(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            if args[0] == "node" and str(args[1]).endswith("summer-symphony-outbox-consumer.mjs"):
                return SimpleNamespace(
                    returncode=0,
                    stdout=json.dumps({
                        "status": "projection-recorded",
                        "taskKey": "a" * 64,
                        "issueIdentifier": "JOV-6401",
                        "action": "reconcile-native-queue-starvation",
                        "sourceVersion": "b" * 40,
                        "snapshotDigest": "c" * 64,
                    }),
                    stderr="",
                )
            return SimpleNamespace(returncode=1, stdout="", stderr="execution-write-rejected")

        with mock.patch.object(CYCLE.subprocess, "run", side_effect=run), mock.patch.dict(
            CYCLE.os.environ, {"GEM_WORKSPACE": "/tmp/gem-workspace"}, clear=False
        ), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(CYCLE.run_summer_symphony_consumer(), 1)

        self.assertEqual(len(calls), 2)
        self.assertTrue(str(calls[0][1]).endswith("summer-symphony-outbox-consumer.mjs"))
        self.assertTrue(str(calls[1][1]).endswith("run-native-queue-execution.mjs"))
        self.assertEqual(calls[1][2], "a" * 64)
        self.assertEqual(calls[1][3], "JOV-6401")
        stages = [json.loads(line)["stage"] for line in output.getvalue().splitlines() if line.strip()]
        self.assertEqual(stages, ["outbox-consumption", "native-queue-execution"])

    def test_consumer_failure_does_not_spawn_execute(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=78, stdout="", stderr="SUMMER_SYMPHONY_CONSUMER_REJECTED")

        with mock.patch.object(CYCLE.subprocess, "run", side_effect=run):
            self.assertEqual(CYCLE.run_summer_symphony_consumer(), 78)
        self.assertEqual(len(calls), 1)

    def test_execute_spawn_failure_is_typed(self):
        stdout = json.dumps({
            "status": "projection-recorded",
            "taskKey": "a" * 64,
            "issueIdentifier": "JOV-6402",
            "action": "reconcile-native-queue-starvation",
            "sourceVersion": "b" * 40,
            "snapshotDigest": "c" * 64,
        })
        with mock.patch.object(CYCLE.subprocess, "run", side_effect=OSError("exec format error")), mock.patch.dict(
            CYCLE.os.environ, {"GEM_WORKSPACE": "/tmp/gem-workspace"}, clear=False
        ):
            self.assertEqual(CYCLE.run_native_queue_starvation_execute(stdout), 1)

    def test_consumer_healthy_noop_does_not_spawn_execute(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=0, stdout='{"status":"healthy-noop"}', stderr="")

        with mock.patch.object(CYCLE.subprocess, "run", side_effect=run):
            self.assertEqual(CYCLE.run_summer_symphony_consumer(), 0)
        self.assertEqual(len(calls), 1)
        self.assertTrue(str(calls[0][1]).endswith("summer-symphony-outbox-consumer.mjs"))

    def test_gate_failure_stops_publication_and_consumer_reports_its_own_result(self):
        with mock.patch.object(CYCLE.subprocess, "run", return_value=SimpleNamespace(
                returncode=1, stderr="ValueError: invalid receipt")) as run, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(CYCLE.run_summer_bottleneck_producer(), 1)
            run.assert_called_once()
            self.assertEqual(json.loads(output.getvalue())["stage"], "fleet-observation")
        with mock.patch.object(CYCLE.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout='{"state":"healthy-noop"}')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(CYCLE.run_summer_symphony_consumer(), 0)
            self.assertEqual(json.loads(output.getvalue())["state"], "healthy-noop")

    def test_each_delivery_failure_marks_cycle_failed_without_suppressing_other_paths(self):
        for producer, consumer in ((1, 0), (0, 78), (OSError("missing"), 0),
                                   (0, subprocess.TimeoutExpired("consumer", 1)), (0, 0)):
            with self.subTest(producer=producer, consumer=consumer), mock.patch.object(
                    CYCLE, "pr_drain_repos", return_value=[]), mock.patch.object(
                    CYCLE, "run_capacity_projection", return_value=0), mock.patch.object(
                    CYCLE.symphony_accepted_completion, "reconcile"), mock.patch.object(
                    CYCLE, "run_summer_bottleneck_producer", side_effect=producer if isinstance(producer, Exception) else None,
                    return_value=producer) as publish, mock.patch.object(
                    CYCLE, "run_summer_symphony_consumer", side_effect=consumer if isinstance(consumer, Exception) else None,
                    return_value=consumer) as consume:
                self.assertEqual(CYCLE.main(), int(bool(producer or consumer)))
                publish.assert_called_once()
                consume.assert_called_once()

    def test_activation_requires_exact_rehabilitation_attestation(self):
        workflow = ACTIVATION.read_text(encoding="utf-8")
        self.assertIn("install-gem-pr-rehabilitation.sh", workflow)
        self.assertIn("gem-pr-rehabilitation-attestation/v1", workflow)
        self.assertIn(".sourceRevision == $sha", workflow)
        self.assertIn(".timerEnabled == true", workflow)
        self.assertIn("systemctl --user is-enabled --quiet gem-pr-drain.timer", workflow)
        self.assertIn("systemctl --user is-active --quiet gem-pr-drain.timer", workflow)
        self.assertIn("([.artifacts[].matches] | all)", workflow)

    def test_verify_only_installer_is_source_clean_and_side_effect_free(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = pathlib.Path(directory) / "repo"
            shutil.copytree(HERMES, fixture / "scripts/symphony")
            git_env = _git_env()
            subprocess.run(
                ["git", "init", "-q", str(fixture)],
                check=True,
                env=git_env,
            )
            subprocess.run(
                ["git", "-C", str(fixture), "add", "scripts/symphony"],
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
                ["bash", str(fixture / "scripts/symphony/install-gem-pr-rehabilitation.sh"), str(fixture)],
                env={
                    "HOME": directory,
                    "GEM_WORKSPACE": str(pathlib.Path(directory) / "gem"),
                    "GEM_REHABILITATION_VERIFY_ONLY": "true",
                    "PATH": f"{pathlib.Path(shutil.which('node')).parent}:/usr/bin:/bin:/usr/sbin:/sbin",
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
        defer_first_cycle: str = "false",
        fail_first_cycle: bool = False,
    ) -> tuple[subprocess.CompletedProcess[str], pathlib.Path, pathlib.Path, pathlib.Path]:
        root = pathlib.Path(directory)
        fixture = root / "repo"
        home = root / "home"
        gem = root / "gem"
        fake_bin = root / "bin"
        log = root / "systemctl.log"
        enabled = root / "timer.enabled"
        active = root / "timer.active"
        shutil.copytree(HERMES, fixture / "scripts/symphony")
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
            ["git", "-C", str(fixture), "add", "scripts/symphony"],
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
  *"start gem-pr-drain.service"*)
    if [ "$FAKE_FIRST_CYCLE_FAILURE" = true ]; then exit 9; else exit 0; fi
    ;;
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
                str(fixture / "scripts/symphony/install-gem-pr-rehabilitation.sh"),
                str(fixture),
            ],
            env={
                "HOME": str(home),
                "GEM_WORKSPACE": str(gem),
                "PATH": f"{fake_bin}:{pathlib.Path(shutil.which('node')).parent}:/usr/bin:/bin:/usr/sbin:/sbin",
                "FAKE_SYSTEMCTL_LOG": str(log),
                "FAKE_TIMER_ENABLED": str(enabled),
                "FAKE_TIMER_ACTIVE": str(active),
                "FAKE_ENABLE_FAILURE": "true" if fail_enable else "false",
                "FAKE_STUCK_SERVICE": "true" if stuck_service else "false",
                "GEM_REHABILITATION_DEFER_FIRST_CYCLE": defer_first_cycle,
                "FAKE_FIRST_CYCLE_FAILURE": "true" if fail_first_cycle else "false",
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
        self.assertEqual(receipt["lastCycleResult"], "success")

    def test_deferred_install_keeps_diagnostics_without_forcing_a_failed_cycle(self):
        with tempfile.TemporaryDirectory() as directory:
            process, log, enabled, active = self._install_runtime(
                directory, defer_first_cycle="true", fail_first_cycle=True
            )
            self.assertEqual(process.returncode, 0, process.stderr)
            commands = log.read_text().splitlines()
            self.assertNotIn("--user start gem-pr-drain.service", commands)
            self.assertNotIn("--user show gem-pr-drain.service --property=Result --value", commands)
            self.assertTrue(enabled.exists())
            self.assertTrue(active.exists())
            receipt = json.loads((pathlib.Path(directory) /
                "gem/state/gem-pr-rehabilitation-attestation.json").read_text())
            self.assertEqual(receipt["lastCycleResult"], "pending")
            self.assertTrue(all(row["matches"] for row in receipt["artifacts"].values()))
            # Execute the actual activation predicate: verified installation
            # with an unobserved first cycle must not pass runtime activation.
            match = re.search(
                r'jq -e --arg sha "\$PRODUCTION_SHA" \'(\s*\.schema == '
                r'"gem-pr-rehabilitation-attestation/v1".*?)\' '
                r'"\$GEM_WORKSPACE/state/gem-pr-rehabilitation-attestation.json"',
                ACTIVATION.read_text(), re.DOTALL,
            )
            self.assertIsNotNone(match)
            for result, expected in (("pending", 1), ("success", 0)):
                candidate = {**receipt, "lastCycleResult": result}
                check = subprocess.run(
                    ["jq", "-e", "--arg", "sha", receipt["sourceRevision"], match.group(1)],
                    input=json.dumps(candidate), capture_output=True, text=True, check=False,
                )
                self.assertEqual(check.returncode, expected, check.stderr)

    def test_default_first_cycle_failure_still_rolls_back(self):
        with tempfile.TemporaryDirectory() as directory:
            process, log, enabled, active = self._install_runtime(
                directory, fail_first_cycle=True, prior_enabled=True, prior_active=True
            )
            self.assertNotEqual(process.returncode, 0)
            self.assertIn("--user start gem-pr-drain.service", log.read_text())
            self.assertTrue(enabled.exists())
            self.assertTrue(active.exists())
            self.assertFalse((pathlib.Path(directory) /
                "gem/state/gem-pr-rehabilitation-attestation.json").exists())

    def test_deferred_install_still_rolls_back_a_timer_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            process, _, enabled, active = self._install_runtime(
                directory, defer_first_cycle="true", fail_enable=True
            )
            self.assertNotEqual(process.returncode, 0)
            self.assertFalse(enabled.exists())
            self.assertFalse(active.exists())

    def test_invalid_defer_setting_fails_before_systemd_or_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            process, log, _, _ = self._install_runtime(directory, defer_first_cycle="yes")
            self.assertEqual(process.returncode, 2)
            self.assertIn("must be true or false", process.stderr)
            self.assertFalse(log.exists())
            self.assertFalse((pathlib.Path(directory) / "gem/scripts").exists())

    def test_installer_ships_priority_gate_runtime_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            process, _, _, _ = self._install_runtime(directory)
            self.assertEqual(process.returncode, 0, process.stderr)
            installed_gate = (
                pathlib.Path(directory) / "gem/scripts/gem-priority-gate.py"
            )
            installed_context = (
                pathlib.Path(directory) / "gem/scripts/symphony_proof_context.py"
            )
            self.assertTrue(installed_context.is_file())
            installed_consumer = (
                pathlib.Path(directory)
                / "gem/scripts/summer-symphony-outbox-consumer.mjs"
            )
            self.assertTrue(installed_consumer.is_file())
            installed_controller_manifest = (
                pathlib.Path(directory)
                / "gem/config/existing-repair-controller-manifest.json"
            )
            self.assertEqual(
                json.loads(installed_controller_manifest.read_text(encoding="utf-8")),
                json.loads(
                    (
                        HERMES / "config/existing-repair-controller-manifest.json"
                    ).read_text(encoding="utf-8")
                ),
            )
            for name in ("symphony_capacity_evidence.py", "symphony_accepted_completion.py", "provider_capacity.py",
                         "summer_admissions.py", "summer_existing_repair.py", "summer_ci_audit.py"):
                self.assertTrue((installed_gate.parent / name).is_file(), name)
            # Execute the installed publisher and helpers, not just source
            # imports: accepted aggregate capacity cannot replace attestation.
            publisher_check = subprocess.run(
                [sys.executable, "-c", """
import json
from datetime import datetime, timezone
import summer_bottleneck_producer as publisher
now = datetime.now(timezone.utc)
at = now.isoformat()
revision = "a" * 40
fleet = {"schema": "jovie-fleet-gate/v1", "observedAt": at, "signals": {
    "closureHealth": {"status": "healthy", "openPrs": 0},
    "queue": {"status": "known", "source": "live", "greenReadyPrs": 0, "nativeQueueCount": 0},
    "lease": {"observedAt": at, "status": "ok", "capacity": {"available": 0}},
    "main": {"sha": revision}, "production": {"deployedSha": revision},
    "concurrencyEvidence": {"accepted": False}}}
runtime = {"generated_at": at, "running": [], "retrying": [], "blocked": []}
attestation = {"schema": "gem-service-attestation/v1", "observedAt": at,
    "service": "symphony-elixir.service", "sourceRevision": revision,
    "active": True, "healthy": True, "listener": {"port": 4041, "boundToService": True}}
snapshot = publisher.compose_snapshot(fleet, runtime, now, attestation)
assert snapshot["signals"]["runner"]["sourceRevision"] == revision
assert set(snapshot["signals"]["admissions"]) >= {
    "newImplementation", "ownedRemediation", "push", "providerEligibility", "downstreamHealth"}
assert snapshot["signals"]["admissions"]["providerEligibility"]["state"] == "UNKNOWN"
print("installed-publisher-observation-verified")
"""], cwd=installed_gate.parent,
                env={"HOME": str(pathlib.Path(directory) / "home"), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
                text=True, capture_output=True, check=False,
            )
            self.assertEqual(publisher_check.returncode, 0, publisher_check.stderr)
            self.assertIn("installed-publisher-observation-verified", publisher_check.stdout)
            import_check = subprocess.run(
                [sys.executable, str(installed_gate), "--help"],
                cwd=installed_gate.parent,
                env={
                    "HOME": str(pathlib.Path(directory) / "home"),
                    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                },
                text=True,
                capture_output=True,
                check=False,
            )
            receipt = json.loads(
                (
                    pathlib.Path(directory)
                    / "gem/state/gem-pr-rehabilitation-attestation.json"
                ).read_text(encoding="utf-8")
            )

        self.assertEqual(import_check.returncode, 0, import_check.stderr)
        self.assertTrue(receipt["artifacts"]["proofContext"]["matches"])
        self.assertTrue(receipt["artifacts"]["summerSymphonyConsumer"]["matches"])
        self.assertTrue(receipt["artifacts"]["summerBottleneckProducer"]["matches"])
        self.assertTrue(receipt["artifacts"]["summerAdmissions"]["matches"])
        self.assertTrue(receipt["artifacts"]["summerExistingRepair"]["matches"])
        self.assertTrue(
            receipt["artifacts"]["existingRepairControllerManifest"]["matches"]
        )
        self.assertTrue(receipt["artifacts"]["acceptedCompletion"]["matches"])
        self.assertTrue(receipt["artifacts"]["capacityEvidence"]["matches"])
        self.assertTrue(receipt["artifacts"]["providerCapacity"]["matches"])

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
    def test_install_repairs_canonical_overwrite_under_existing_bounded_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            settings = paths["workflow"].parent / "runner-source.env"
            settings.write_text("JOVIE_CONFIGURATION_PROFILE=governor-bounded\n")
            settings.chmod(0o600)
            canonical = (fixture / "scripts/symphony/WORKFLOW.md").read_text()
            paths["workflow"].write_text(canonical.replace("max_concurrent_agents: 8", "max_concurrent_agents: 1"))
            process = self._install(fixture, env)
            self.assertEqual(process.returncode, 0, process.stderr)
            expected = (fixture / "scripts/symphony/profiles/governor-bounded/WORKFLOW.md").read_text()
            self.assertEqual(paths["workflow"].read_text(), expected.replace("max_concurrent_agents: 5", "max_concurrent_agents: 1"))

    def test_upgrade_preserves_persisted_governor_profile_and_smaller_ceiling(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            settings = paths["workflow"].parent / "runner-source.env"
            settings.write_text("JOVIE_CONFIGURATION_PROFILE=governor-bounded\n")
            settings.chmod(0o600)
            bounded = (fixture / "scripts/symphony/profiles/governor-bounded/WORKFLOW.md").read_text()
            expected = bounded.replace("max_concurrent_agents: 5", "max_concurrent_agents: 1")
            paths["workflow"].write_text(expected)
            for _ in range(2):
                process = self._install(fixture, env)
                self.assertEqual(process.returncode, 0, process.stderr)
                self.assertEqual(paths["workflow"].read_text(), expected)
                receipt = next(json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"'))
                self.assertEqual(receipt["configurationProfile"], "governor-bounded")
                self.assertEqual(receipt["workflow"]["installedMaxConcurrentAgents"], 1)
                self.assertTrue(receipt["workflow"]["matches"])
            # A later reviewed source upgrade retains the same operator scope.
            source = fixture / "scripts/symphony/profiles/governor-bounded/WORKFLOW.md"
            source.write_text(bounded + "\nReviewed fixture upgrade.\n")
            subprocess.run(["git", "-C", str(fixture), "add", "."], check=True, env=_git_env())
            subprocess.run(["git", "-C", str(fixture), "-c", "user.name=Fixture", "-c",
                            "user.email=fixture@example.invalid", "commit", "-qm", "upgrade"], check=True, env=_git_env())
            process = self._install(fixture, env)
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertEqual(paths["workflow"].read_text(), expected + "\nReviewed fixture upgrade.\n")
            self.assertIn("command: /usr/bin/false", paths["workflow"].read_text())
            self.assertIn("required_labels:", paths["workflow"].read_text())
            self.assertIn("project_slug:", paths["workflow"].read_text())

    def test_profile_conflict_unknown_duplicate_and_untrusted_file_fail_before_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            settings = paths["workflow"].parent / "runner-source.env"
            cases = [("governor-bounded", {"JOVIE_CONFIGURATION_PROFILE": "canonical"}, 0o600),
                     ("unknown", {}, 0o600), ("governor-bounded", {}, 0o644),
                     ("governor-bounded\nJOVIE_CONFIGURATION_PROFILE=canonical", {}, 0o600)]
            for value, extra, mode in cases:
                settings.write_text("JOVIE_CONFIGURATION_PROFILE=" + value + "\n")
                settings.chmod(mode)
                before = paths["workflow"].read_bytes()
                process = self._install(fixture, {**env, **extra})
                self.assertNotEqual(process.returncode, 0)
                self.assertEqual(paths["workflow"].read_bytes(), before)
                self.assertEqual(paths["gate"].read_text(), "old gate\n")

    def test_bounded_profile_rejects_controller_ceiling_above_reviewed_maximum(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            settings = paths["workflow"].parent / "runner-source.env"
            settings.write_text("JOVIE_CONFIGURATION_PROFILE=governor-bounded\n")
            settings.chmod(0o600)
            before = (fixture / "scripts/symphony/profiles/governor-bounded/WORKFLOW.md").read_text()
            paths["workflow"].write_text(before)
            process = self._install(fixture, env, workflow_overlay="128")
            self.assertNotEqual(process.returncode, 0)
            self.assertEqual(paths["workflow"].read_text(), before)

    def test_fixture_git_runs_without_detached_maintenance(self):
        env = _git_env()

        def config_value(key: str) -> str:
            result = subprocess.run(
                ["git", "config", "--get", key],
                env=env,
                text=True,
                capture_output=True,
                check=True,
            )
            return result.stdout.strip()

        self.assertEqual(config_value("maintenance.auto"), "false")
        self.assertEqual(config_value("maintenance.autoDetach"), "false")
        self.assertEqual(config_value("gc.auto"), "0")

    def _fixture(
        self, directory: str, *, policy_source=None
    ) -> pathlib.Path:
        fixture = pathlib.Path(directory) / "repo"
        shutil.copytree(HERMES, fixture / "scripts/symphony")
        if policy_source is not None:
            (fixture / "scripts/symphony/gem_rehabilitation_policy.py").write_text(
                policy_source, encoding="utf-8"
            )
        git_env = _git_env()
        subprocess.run(
            ["git", "init", "-q", str(fixture)], check=True, env=git_env
        )
        subprocess.run(
            ["git", "-C", str(fixture), "add", "scripts/symphony"],
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
        workflow_overlay: str = "",
        unrelated_workflow_drift: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["bash", str(fixture / FLEET_INSTALLER.relative_to(ROOT)), str(fixture)],
            env={
                **env,
                "FAKE_RUNTIME_FAILURE": "true" if fail_restart else "false",
                "FAKE_WORKFLOW_OVERLAY_VALUE": workflow_overlay,
                "FAKE_WORKFLOW_UNRELATED_DRIFT": (
                    "true" if unrelated_workflow_drift else "false"
                ),
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
        self.assertIn("scripts/symphony/closure_health.py", process.stdout)
        self.assertIn("scripts/symphony/gem_rehabilitation_policy.py", process.stdout)
        self.assertIn("scripts/symphony/gem_repo_registry.py", process.stdout)
        self.assertIn("scripts/symphony/config/gem-repo-registry.json", process.stdout)

    def test_verify_only_fails_when_policy_cannot_satisfy_the_consumer_import(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(
                directory, policy_source="POLICY_FIXTURE = True\n"
            )
            process = self._verify(fixture, directory)

        self.assertNotEqual(process.returncode, 0)
        self.assertIn("cannot import name 'bounded_selection'", process.stderr)

    def test_install_preserves_existing_runtime_observation(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            paths["attestation"].parent.mkdir(parents=True, exist_ok=True)
            prior = '{"sourceRevision":"running-symphony","observedAt":"prior-observation"}'
            paths["attestation"].write_text(prior)
            process = self._install(fixture, env)
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertEqual(paths["attestation"].read_text(), prior)

    def test_install_verifies_configuration_the_exact_runtime_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env)
            installed_policy = paths["policy"].read_bytes()
            installed_closure = paths["closure"].read_bytes()
            installed_registry = paths["registry_module"].read_bytes()
            installed_registry_config = paths["registry_config"].read_bytes()
            attestation = next(json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"'))
            self.assertEqual(attestation["schema"], "gem-fleet-configuration-verification/v1")
            self.assertNotIn("sourceRevision", attestation)
            self.assertFalse(paths["attestation"].exists())

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
        self.assertEqual(
            attestation["policy"]["sourceSha256"],
            attestation["policy"]["installedSha256"],
        )
        self.assertEqual(attestation["workflow"]["matchMode"], "exact")
        self.assertEqual(attestation["workflow"]["sourceMaxConcurrentAgents"], 8)
        self.assertEqual(attestation["workflow"]["installedMaxConcurrentAgents"], 8)
        self.assertEqual(attestation["listener"]["wrapperPid"], 3131)
        self.assertEqual(attestation["listener"]["pid"], 4242)

    def test_install_verifies_configuration_controller_owned_bounded_concurrency_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, workflow_overlay="1")
            installed_workflow = paths["workflow"].read_text(encoding="utf-8")
            attestation = next(json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"'))
            self.assertEqual(attestation["schema"], "gem-fleet-configuration-verification/v1")
            self.assertNotIn("sourceRevision", attestation)
            self.assertFalse(paths["attestation"].exists())

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("max_concurrent_agents: 1", installed_workflow)
        self.assertTrue(attestation["workflow"]["matches"])
        self.assertEqual(
            attestation["workflow"]["matchMode"], "bounded_concurrency_overlay"
        )
        self.assertEqual(attestation["workflow"]["sourceMaxConcurrentAgents"], 8)
        self.assertEqual(attestation["workflow"]["installedMaxConcurrentAgents"], 1)
        self.assertNotEqual(
            attestation["workflow"]["sourceSha256"],
            attestation["workflow"]["installedSha256"],
        )

    def test_install_verifies_configuration_concurrency_above_source_default(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, workflow_overlay="128")
            attestation = next(json.loads(line) for line in process.stdout.splitlines() if line.startswith('{"'))
            self.assertEqual(attestation["schema"], "gem-fleet-configuration-verification/v1")
            self.assertNotIn("sourceRevision", attestation)
            self.assertFalse(paths["attestation"].exists())

        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertTrue(attestation["workflow"]["matches"])
        self.assertEqual(attestation["workflow"]["sourceMaxConcurrentAgents"], 8)
        self.assertEqual(attestation["workflow"]["installedMaxConcurrentAgents"], 128)

    def test_install_rejects_nonpositive_concurrency_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self._fixture(directory)
            paths, env = self._runtime(directory)
            process = self._install(fixture, env, workflow_overlay="0")
            restored_workflow = paths["workflow"].read_text(encoding="utf-8")
            attestation_exists = paths["attestation"].exists()

        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(restored_workflow, "old workflow\n")
        self.assertFalse(attestation_exists)
        self.assertIn("refusing unmatched Gem configuration", process.stderr)

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
        self.assertIn("refusing unmatched Gem configuration", process.stderr)

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
