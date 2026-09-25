#!/usr/bin/env python3
"""Exercise real source comparison, /proc ownership, and atomic writer fencing."""
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import emit_gem_service_attestation as E

REV = "3" * 40
CONFIG = "a" * 40
NOW = datetime(2026, 9, 12, 15, tzinfo=timezone.utc)
WORKFLOW = b"---\nagent:\n  max_concurrent_agents: 5\n  max_turns: 2\n---\nprompt\n"


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.gem = self.root / "gem"
        (self.gem / "scripts").mkdir(parents=True)
        self.package = self.root / "symphony"
        self.package.write_bytes(b"verified-release-package")
        self.install = self.root / REV
        self.exe = self.install / ".burrito/bin/beam.smp"
        self.exe.parent.mkdir(parents=True)
        self.exe.write_bytes(b"erts-executable")
        self.workflow = self.root / "WORKFLOW.md"
        self.workflow.write_bytes(WORKFLOW)
        self.unit = self.root / "symphony-elixir.service"
        self.unit.write_bytes(b"canonical-unit")
        for name in ["gem_rehabilitation_policy.py", "gem-priority-gate.py", "closure_health.py"]:
            (self.gem / "scripts" / name).write_bytes(name.encode())
        self.sources = dict(zip(E.SURFACES.values(), [b"canonical-unit", b"gem_rehabilitation_policy.py", b"gem-priority-gate.py", b"closure_health.py", WORKFLOW]))
        self.sidecar = self.root / "package.provenance.json"
        self.release = {"repository": "JovieInc/symphony", "source_sha": REV, "target": "linux_x86_64",
                        "artifact": f"symphony-{REV}-linux_x86_64", "sha256": E.digest(self.package.read_bytes()),
                        "make_all": {"conclusion": "success"}}
        self.sidecar.write_text(json.dumps(self.release))
        self.group = "/user.slice/symphony-elixir.service"
        self.fields = {"MainPID": "123", "ControlGroup": self.group, "InvocationID": "verified-invocation",
                       "ActiveState": "active", "NeedDaemonReload": "no", "FragmentPath": str(self.unit), "DropInPaths": ""}
        self.proc = self.root / "proc"
        for pid, parent in [(123, 1), (456, 123)]:
            p = self.proc / str(pid)
            (p / "fd").mkdir(parents=True)
            (p / "net").mkdir()
            (p / "stat").write_text(f"{pid} (beam) " + " ".join(["S", str(parent)] + ["0"] * 17 + [str(pid * 100)]))
            (p / "cgroup").write_text(f"0::{self.group}\n")
            (p / "cmdline").write_bytes((str(self.exe) + "\0" + str(self.workflow) + "\0").encode())
            (p / "exe").symlink_to(self.exe)
            (p / "net/tcp").write_text("header\n")
            (p / "net/tcp6").write_text("header\n")
        self.listener = self.proc / "456"
        (self.listener / "fd/3").symlink_to("socket:[567]")
        (self.listener / "net/tcp").write_text("header\n0: 0100007F:0FC9 00000000:0000 0A 0 0 0 0 0 567\n")
        (self.listener / "environ").write_bytes(f"SYMPHONY_INSTALL_DIR={self.install}\0".encode())
        self.ss = 'LISTEN 0 4096 127.0.0.1:4041 0.0.0.0:* users:(("beam.smp",pid=456,fd=3))'
        self.state = {"generated_at": NOW.isoformat()}
        def command(args):
            if args[0] == "git": return CONFIG
            if args[0] == "ss": return self.ss
            return "\n".join(f"{k}={v}" for k, v in self.fields.items())
        def source_bytes(root, revision, path):
            if path not in self.sources: raise subprocess.CalledProcessError(128, ["git"])
            return self.sources[path]
        for patch in [mock.patch.object(E, "command", side_effect=command),
                      mock.patch.object(E, "source_bytes", side_effect=source_bytes),
                      mock.patch.object(E.trust, "PROC_ROOT", self.proc),
                      mock.patch.object(E.trust, "service_identity", return_value=(123, self.group)),
                      mock.patch.object(E.urllib.request, "urlopen", side_effect=lambda *a, **k: io.BytesIO(json.dumps(self.state).encode()))]:
            patch.start()
            self.addCleanup(patch.stop)

    def observe(self):
        return E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, proc_root=self.proc, now=NOW)

    def installer_fixture(self, root, *, mode, failure='none', mixed_legacy=False):
        repo = root / 'repo'
        source_names = [
            'emit_gem_service_attestation.py', 'symphony_proof_context.py',
            'gem_gate_contract.py', 'symphony_official_runtime.py',
            'verify_upstream_burrito_payload.py', 'systemd/gem-service-attestation.service',
        ]
        for name in source_names:
            path = repo / 'scripts/symphony' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f'fixture source: {name}\n')

        git_env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
        git_env.update(
            GIT_CONFIG_COUNT='3', GIT_CONFIG_KEY_0='maintenance.auto', GIT_CONFIG_VALUE_0='false',
            GIT_CONFIG_KEY_1='gc.auto', GIT_CONFIG_VALUE_1='0',
            GIT_CONFIG_KEY_2='maintenance.autoDetach', GIT_CONFIG_VALUE_2='false',
        )
        subprocess.run(['git', 'init', '-q', str(repo)], env=git_env, check=True)
        subprocess.run(['git', '-C', str(repo), 'add', '.'], env=git_env, check=True)
        subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Fixture', '-c',
                        'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'],
                       env=git_env, check=True)

        binding = root / 'approved-binding.json'
        binding.write_text('{"schema":"fixture-binding"}\n')
        binding_sha256 = hashlib.sha256(binding.read_bytes()).hexdigest()
        config = root / '.config/symphony'
        config.mkdir(parents=True, exist_ok=True)
        if mode == 'upstream-preservation':
            values = [
                'GEM_SERVICE_ATTESTATION_MODE=upstream-preservation',
                f'SYMPHONY_UPSTREAM_BINDING={binding}',
                f'SYMPHONY_UPSTREAM_BINDING_SHA256={binding_sha256}',
            ]
            if mixed_legacy:
                values.extend([
                    f'SYMPHONY_RELEASE_PROVENANCE={self.sidecar}',
                    f'JOVIE_CONFIGURATION_SOURCE_ROOT={repo}',
                    f'JOVIE_CONFIGURATION_SOURCE_REVISION={CONFIG}',
                ])
        else:
            values = [
                'GEM_SERVICE_ATTESTATION_MODE=legacy',
                f'SYMPHONY_RELEASE_PROVENANCE={self.sidecar}',
                f'JOVIE_CONFIGURATION_SOURCE_ROOT={repo}',
                f'JOVIE_CONFIGURATION_SOURCE_REVISION={CONFIG}',
            ]
        (config / 'runner-source.env').write_text('\n'.join(values) + '\n')

        env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
        env.update(HOME=str(root), GEM_SERVICE_ATTESTATION_VERIFY_ONLY='false', FAILURE=failure)
        bins = root / 'bin'
        bins.mkdir()
        (bins / 'systemctl').write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/systemctl.log"
case "$*" in
  "--user is-active --quiet gem-service-attestation.timer") test -f "$HOME/timer-active" ;;
  "--user is-active --quiet gem-service-attestation.service") exit 1 ;;
  "--user stop gem-service-attestation.timer") rm -f "$HOME/timer-active" ;;
  "--user start gem-service-attestation.timer")
    touch "$HOME/timer-active"
    if [ "$FAILURE" = timer-start ] && [ ! -f "$HOME/start-failed" ]; then
      touch "$HOME/start-failed"; exit 2
    fi ;;
  "--user list-unit-files gem-service-attestation.timer") printf 'gem-service-attestation.timer enabled\\n' ;;
  *) exit 0 ;;
esac
''')
        (bins / 'python3').write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/python.log"
case "$*" in
  *--check*) [ "$FAILURE" != check ] || exit 2 ;;
  *)
    [ "$FAILURE" != publish ] || exit 2
    case "$*" in *--upstream-binding*)
      mkdir -p "$HOME/gem-workspace/state"
      printf '{"schema":"symphony-upstream-preservation/v1","activation":"not-activated","admission":"unverified"}\\n' > "$HOME/gem-workspace/state/symphony-upstream-preservation.json"
      ;;
    esac ;;
esac
exit 0
''')
        for executable in bins.iterdir():
            executable.chmod(0o755)
        env['PATH'] = str(bins) + os.pathsep + env['PATH']
        targets = [root / 'gem-workspace/scripts' / name for name in [
            'emit-gem-service-attestation.py', 'symphony_proof_context.py',
            'gem_gate_contract.py', 'symphony_official_runtime.py',
            'verify_upstream_burrito_payload.py',
        ]]
        targets.append(root / '.config/systemd/user/gem-service-attestation.service')
        return repo, env, binding, binding_sha256, targets

    def test_healthy_observation_binds_release_not_config_or_prior_receipt(self):
        dest = self.gem / "state/gem-service-attestation.json"
        dest.parent.mkdir()
        dest.write_text(json.dumps({"sourceRevision": "f" * 40, "healthy": True}))
        receipt = E.publish(dest, self.observe)
        self.assertTrue(receipt["healthy"])
        self.assertEqual(receipt["sourceRevision"], REV)
        self.assertEqual(receipt["configurationSourceRevision"], CONFIG)
        self.assertEqual(receipt["listener"]["pid"], 456)
        self.assertEqual(receipt["runtime"]["workflowPath"], str(self.workflow))
        self.assertEqual(json.loads(dest.read_text()), receipt)
        self.assertNotEqual(receipt["runtime"]["packageSha256"], receipt["runtime"]["executableSha256"])
        self.state["generated_at"] = (NOW + timedelta(seconds=301)).isoformat()
        later = E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, proc_root=self.proc, now=NOW + timedelta(seconds=301))
        self.assertNotEqual(receipt["observedAt"], later["observedAt"])
        self.assertEqual(receipt["sourceRevision"], later["sourceRevision"])

    def test_unknown_override_or_changed_config_is_unhealthy_not_self_compared(self):
        override = self.root / "local-override.conf"
        override.write_bytes(b"unapproved-override")
        self.fields["DropInPaths"] = str(override)
        result = self.observe()
        self.assertFalse(result["healthy"])
        self.assertIsNone(result["unitOverrides"][0]["sourceSha256"])
        self.fields["DropInPaths"] = ""
        self.unit.write_bytes(b"modified-unit")
        self.assertFalse(self.observe()["unit"]["matches"])
        self.fields["NeedDaemonReload"] = "yes"
        self.assertFalse(self.observe()["daemonReloaded"])

    def test_owned_unit_dropins_match_source_and_stay_healthy(self):
        mounts = self.root / "workspace-mounts.conf"
        guard = self.root / "90-symphony-safe-restart-guard.conf"
        mounts.write_bytes(
            b"[Service]\nExecStartPre=/usr/bin/sudo -n /usr/local/sbin/jovie-symphony-workspace restore-all\n"
        )
        guard.write_bytes(b"[Unit]\nRefuseManualStop=yes\n")
        self.sources[
            "scripts/symphony/systemd/symphony-elixir.service.d/workspace-mounts.conf"
        ] = mounts.read_bytes()
        self.sources[
            "scripts/symphony/systemd/symphony-elixir.service.d/90-symphony-safe-restart-guard.conf"
        ] = guard.read_bytes()
        self.fields["DropInPaths"] = f"{mounts} {guard}"
        result = self.observe()
        self.assertTrue(result["healthy"])
        self.assertEqual(
            [item["name"] for item in result["unitOverrides"]],
            ["workspace-mounts.conf", "90-symphony-safe-restart-guard.conf"],
        )
        self.assertTrue(all(item["matches"] for item in result["unitOverrides"]))

    def bounded_observation(self):
        return E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem,
                         proc_root=self.proc, now=NOW, profile="governor-bounded")

    def install_bounded_fixture(self):
        source_root = Path(E.__file__).parent / "profiles/governor-bounded"
        workflow = (source_root / "WORKFLOW.md").read_bytes()
        self.sources[E.BOUNDED_PROFILE + "/WORKFLOW.md"] = workflow
        self.workflow.write_bytes(workflow)
        paths = []
        for name in sorted(E.BOUNDED_OVERRIDES):
            body = (source_root / "systemd" / name).read_bytes()
            self.sources[E.BOUNDED_PROFILE + "/systemd/" + name] = body
            target = self.root / name
            target.write_bytes(body)
            paths.append(str(target))
        self.fields["DropInPaths"] = " ".join(paths)
        return workflow

    def test_bounded_profile_requires_explicit_selection_and_all_reviewed_overrides(self):
        self.install_bounded_fixture()
        self.assertFalse(self.observe()["healthy"])
        result = self.bounded_observation()
        self.assertTrue(result["healthy"])
        self.assertEqual(result["configurationProfile"], "governor-bounded")
        for path in self.fields["DropInPaths"].split():
            with self.subTest(missing=path):
                with mock.patch.dict(self.fields, DropInPaths=self.fields["DropInPaths"].replace(path, "")):
                    self.assertFalse(self.bounded_observation()["healthy"])
        with self.assertRaises(ValueError):
            E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, profile="arbitrary")

    def test_bounded_profile_rejects_enrollment_provider_hook_and_restart_drift(self):
        original = self.install_bounded_fixture()
        for before, after in [
            (b"agents: 5", b"agents: 6"),
            (b"symphony-five-pr-repair-20260908", b"symphony"),
            (b"project_slug:", b"other_project:"),
            (b"command: /usr/bin/false", b"command: codex app-server"),
            (b"native-preflight", b"skip-preflight"),
        ]:
            with self.subTest(change=after):
                self.workflow.write_bytes(original.replace(before, after))
                self.assertFalse(self.bounded_observation()["healthy"])
        self.workflow.write_bytes(original.replace(b"agents: 5", b"agents: 1"))
        self.assertTrue(self.bounded_observation()["healthy"])
        self.workflow.write_bytes(original)
        router = (Path(E.__file__).parent / "profiles/governor-bounded-codex/WORKFLOW.md").read_bytes()
        self.workflow.write_bytes(router)
        self.assertFalse(self.bounded_observation()["healthy"])
        self.workflow.write_bytes(original)
        unit = self.root / "governor-restricted.conf"
        body = unit.read_bytes()
        for before, after in [(b"RestartSec=20", b"RestartSec=0"),
                              (b"Restart=always", b"Restart=no")]:
            unit.write_bytes(body.replace(before, after))
            self.assertFalse(self.bounded_observation()["healthy"])

    def test_review_candidate_preserves_restrictions_and_uses_continuous_service(self):
        original = self.install_bounded_fixture()
        config = original.decode().split("---", 2)[1]
        for restriction in [
            '    project_slug: "symphony-ui-pilot-96d6b9c5b2d5"',
            '  required_labels:\n    - symphony-five-pr-repair-20260908',
            '  root: /home/timwhite/codex-qualification',
            '  max_concurrent_agents: 5', '  max_retry_attempts: 1',
            '  command: /usr/bin/false',
            'native-preflight "${PWD##*/}" --before-run',
        ]:
            self.assertIn(restriction, config)
        unit = (self.root / "governor-restricted.conf").read_text().splitlines()
        self.assertIn("Restart=always", unit)
        self.assertIn("RestartSec=20", unit)
        self.assertIn("RuntimeMaxSec=infinity", unit)

    def install_codex_fixture(self):
        source_root = Path(E.__file__).parent / "profiles"
        workflow = (source_root / "governor-bounded-codex/WORKFLOW.md").read_bytes()
        bounded = (source_root / "governor-bounded/WORKFLOW.md").read_bytes()
        self.sources[E.CODEX_PROFILE + "/WORKFLOW.md"] = workflow
        self.sources[E.BOUNDED_PROFILE + "/WORKFLOW.md"] = bounded
        self.workflow.write_bytes(workflow)
        paths = []
        for name in sorted(E.BOUNDED_OVERRIDES):
            body = (source_root / "governor-bounded/systemd" / name).read_bytes()
            self.sources[E.BOUNDED_PROFILE + "/systemd/" + name] = body
            target = self.root / name
            target.write_bytes(body)
            paths.append(str(target))
        self.fields["DropInPaths"] = " ".join(paths)
        return workflow

    def codex_observation(self):
        return E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem,
                         proc_root=self.proc, now=NOW, profile="governor-bounded-codex")

    def test_codex_profile_matches_governor_bounded_except_router_command(self):
        root = Path(E.__file__).parent / "profiles"
        bounded = (root / "governor-bounded/WORKFLOW.md").read_text()
        codex = (root / "governor-bounded-codex/WORKFLOW.md").read_text()
        expected = bounded.replace(
            "  # Native Codex remains OUT. This profile grants no provider execution.\n"
            "  command: /usr/bin/false\n",
            "  # Native router with Codex Luna primary. Apps stay disabled.\n"
            "  command: env SYMPHONY_CODEX_DISABLE_APPS=1 symphony-agent-router app-server\n",
            1,
        ).replace(
            '  provider:\n'
            '    project_slug: "symphony-ui-pilot-96d6b9c5b2d5"\n'
            '    team_key: "JOV"\n'
            '    api_key: $LINEAR_API_KEY\n'
            '  required_labels:\n'
            '    - symphony-five-pr-repair-20260908\n'
            '  excluded_labels:\n'
            '    - no-symphony\n',
            '  provider:\n'
            '    team_key: "JOV"\n'
            '    api_key: $LINEAR_API_KEY\n'
            '  required_labels:\n'
            '    - agent-ready\n'
            '  # Scheduler filters are labels and states only. There is no identifier or\n'
            '  # pull-number denylist. JOV-5914, JOV-6519, #17453, and #17156 stay out only\n'
            '  # while they lack agent-ready. Adding agent-ready with no excluded label admits them.\n'
            '  excluded_labels:\n'
            '    - no-symphony\n'
            '    - billing\n'
            '    - blocked:payments\n'
            '    - stripe\n'
            '    - cost-monitoring\n'
            '    - blocked:auth\n'
            '    - auth\n'
            '    - area:auth\n'
            '    - infra\n'
            '    - area:infra\n'
            '    - infrastructure\n'
            '    - vercel\n',
            1,
        ).replace(
            "Intake is restricted to the configured project and required label within the Jovie Linear team. "
            "Native Codex execution is disabled in this profile. ",
            "Intake is team-wide on JOV for issues labeled `agent-ready`, including `Todo`. "
            "It is not limited to project `symphony-ui-pilot-96d6b9c5b2d5` or label "
            "`symphony-five-pr-repair-20260908`. "
            "Native Codex runs through symphony-agent-router with Apps disabled. ",
            1,
        ).replace(
            "Only the mechanical `no-symphony` dead-letter label excludes dispatch; "
            "legacy human-review labels never do.",
            "JOV-5914, JOV-6519, and GitHub PRs #17453 and #17156 are not excluded by "
            "identifier. They stay outside intake only while they lack `agent-ready`. "
            "Adding `agent-ready` with no excluded label selects them. "
            "Deploy, permissions, billing, and spend work is excluded by `vercel`, `infra`, "
            "`area:infra`, `infrastructure`, `blocked:auth`, `auth`, `area:auth`, `billing`, "
            "`blocked:payments`, `stripe`, and `cost-monitoring`, in addition to the mechanical "
            "`no-symphony` dead-letter label. Legacy human-review labels "
            "(`human-review-required`, `needs-human`, `no-auto`) never exclude dispatch.",
            1,
        )
        self.assertEqual(codex, expected)
        front = codex.split("---", 2)[1]
        self.assertNotIn("project_slug:", front)
        self.assertNotIn("symphony-five-pr-repair-20260908", front)
        self.assertIn("- agent-ready", front)
        for label in (
            "no-symphony", "billing", "blocked:payments", "stripe", "cost-monitoring",
            "blocked:auth", "auth", "area:auth", "infra", "area:infra", "infrastructure", "vercel",
        ):
            self.assertIn(f"    - {label}\n", front)
        self.assertIn("#17453", front)
        self.assertIn("#17156", front)
        self.assertIn("max_retry_attempts: 1", codex)
        self.assertEqual(codex.count("max_concurrent_agents: 5"), 1)
        self.assertNotIn("/usr/bin/false", codex)
        self.assertFalse((root / "governor-bounded-codex/systemd").exists())

    def test_codex_profile_attests_reviewed_install_without_a_separate_dropin_pin(self):
        original = self.install_codex_fixture()
        self.assertFalse(self.observe()["healthy"])
        self.assertFalse(self.bounded_observation()["healthy"])
        result = self.codex_observation()
        self.assertTrue(result["healthy"])
        self.assertEqual(result["configurationProfile"], "governor-bounded-codex")
        self.assertEqual(result["workflow"]["codex"], "in")
        self.assertEqual(result["workflow"]["sourceMaxConcurrentAgents"], 5)
        self.assertEqual(result["workflow"]["installedMaxConcurrentAgents"], 5)
        self.assertEqual(result["workflow"]["matchMode"], "exact")
        self.assertEqual({item["name"] for item in result["unitOverrides"]}, E.BOUNDED_OVERRIDES)
        self.assertTrue(all(item["matches"] for item in result["unitOverrides"]))
        for path in self.fields["DropInPaths"].split():
            with self.subTest(missing=path):
                with mock.patch.dict(self.fields, DropInPaths=self.fields["DropInPaths"].replace(path, "")):
                    self.assertFalse(self.codex_observation()["healthy"])
        self.workflow.write_bytes(original.replace(b"agents: 5", b"agents: 1"))
        lowered = self.codex_observation()
        self.assertTrue(lowered["healthy"])
        self.assertEqual(lowered["workflow"]["matchMode"], "bounded_concurrency_overlay")
        self.assertEqual(lowered["workflow"]["installedMaxConcurrentAgents"], 1)
        for replacement in (
            original.replace(b"agents: 5", b"agents: 6"),
            original.replace(E.CODEX_IN_COMMAND.encode(), b"command: /usr/bin/false"),
            original.replace(b"- agent-ready", b"- not-ready"),
            original.replace(b'team_key: "JOV"', b'team_key: "OTHER"'),
            original.replace(b"    - billing\n", b""),
        ):
            with self.subTest(change=replacement[:80]):
                self.workflow.write_bytes(replacement)
                self.assertFalse(self.codex_observation()["healthy"])

    def test_only_existing_concurrency_overlay_is_accepted(self):
        for value in [1, 41, 128]:
            self.workflow.write_bytes(WORKFLOW.replace(b"agents: 5", f"agents: {value}".encode()))
            result = self.observe()
            self.assertTrue(result["healthy"])
            self.assertEqual(result["workflow"]["installedMaxConcurrentAgents"], value)
        for data in [WORKFLOW.replace(b"agents: 5", b"agents: 0"), WORKFLOW.replace(b"agents: 5", b"agents: 01"),
                     WORKFLOW.replace(b"max_turns: 2", b"max_turns: 99"), WORKFLOW + b"  max_concurrent_agents: 5\n"]:
            self.workflow.write_bytes(data)
            self.assertFalse(self.observe()["healthy"])

    def test_release_package_source_and_service_must_be_bound(self):
        for field, value in [("repository", "other/repo"), ("source_sha", "f" * 40), ("target", "other"), ("sha256", "f" * 64), ("artifact", "other"), ("make_all", {"conclusion": "failure"})]:
            with self.subTest(field=field):
                self.sidecar.write_text(json.dumps({**self.release, field: value}))
                with self.assertRaises(ValueError): self.observe()
        self.sidecar.write_text(json.dumps(self.release))
        self.package.write_bytes(b"replaced-binary")
        with self.assertRaises(ValueError): self.observe()
        self.package.write_bytes(b"verified-release-package")
        (self.listener / "environ").write_bytes(f"SYMPHONY_INSTALL_DIR={self.root / ('f' * 40)}\0".encode())
        with self.assertRaisesRegex(ValueError, "running application"): self.observe()

    def test_malformed_provenance_and_concurrent_executable_change_are_rejected(self):
        for data in [[], {**self.release, "make_all": []}]:
            self.sidecar.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "invalid release"): self.observe()
        self.sidecar.write_text(json.dumps(self.release))
        original = E.trust.live_runtime
        def mutate_after_binding(*args):
            result = original(*args)
            self.exe.write_bytes(b"concurrently-replaced-runtime")
            return result
        with mock.patch.object(E.trust, "live_runtime", side_effect=mutate_after_binding):
            with self.assertRaisesRegex(ValueError, "changed during"): self.observe()

    def test_foreign_listener_wrong_port_and_non_descendant_are_rejected(self):
        for name, value in [("cgroup", "0::/foreign\n"), ("net/tcp", "header\n"),
                            ("stat", "456 (beam) " + " ".join(["S", "1"] + ["0"] * 17 + ["45600"]))]:
            path = self.listener / name
            original = path.read_text()
            path.write_text(value)
            with self.assertRaises(ValueError): self.observe()
            path.write_text(original)
        self.ss = "no listener"
        with self.assertRaisesRegex(ValueError, "listener"): self.observe()
        self.fields["ActiveState"] = "inactive"
        with self.assertRaisesRegex(ValueError, "inactive"): self.observe()

    def test_stale_state_and_restart_during_read_cannot_publish(self):
        for offset in [-601, 61]:
            self.state["generated_at"] = (NOW + timedelta(seconds=offset)).isoformat()
            with self.assertRaisesRegex(ValueError, "state observation stale"): self.observe()
        self.state["generated_at"] = NOW.isoformat()
        with mock.patch.object(E, "service_fields", side_effect=[dict(self.fields), {**self.fields, "MainPID": "999"}]):
            with self.assertRaisesRegex(ValueError, "changed during"): self.observe()
        with mock.patch.object(E, "command", return_value="wrong-configuration-source"):
            with self.assertRaisesRegex(ValueError, "source revision"): self.observe()
        with self.assertRaisesRegex(ValueError, "clock"):
            E.observe(self.sidecar, self.root, CONFIG, self.package, self.gem, now=NOW.replace(tzinfo=None))

    def test_competing_writer_cannot_measure_or_overwrite_and_errors_preserve_evidence(self):
        dest = self.root / "receipt.json"
        dest.write_text('original')
        measure = mock.Mock(return_value={"healthy": True})
        with dest.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError): E.publish(dest, measure)
        measure.assert_not_called()
        with self.assertRaises(ValueError): E.publish(dest, mock.Mock(side_effect=ValueError("unbound")))
        self.assertEqual(dest.read_text(), 'original')
        with mock.patch.object(E.os, 'replace', side_effect=OSError('failed')):
            with self.assertRaises(OSError): E.publish(dest, measure)
        self.assertEqual(list(self.root.glob('.service-attestation-*')), [])

    def test_entrypoint_check_does_not_write_and_failure_is_redacted(self):
        args = ['publisher', '--provenance', str(self.sidecar), '--source-root', str(self.root), '--source-revision', CONFIG, '--check']
        for healthy, code in [(True, 0), (False, 2)]:
            with mock.patch.object(sys, 'argv', args), mock.patch.object(E, 'observe', return_value={"healthy": healthy}), mock.patch('builtins.print'), mock.patch.object(E, 'publish') as writer:
                self.assertEqual(E.main(), code)
                writer.assert_not_called()
        with mock.patch.object(sys, 'argv', args), mock.patch.object(E, 'observe', side_effect=ValueError('secret text')), mock.patch('builtins.print') as output:
            self.assertEqual(E.main(), 78)
            self.assertNotIn('secret text', str(output.call_args))

    def test_restart_retry_reobserves_actual_service_and_keeps_writer_lock(self):
        destination = self.root / 'receipt.json'
        destination.write_text('previous observation')
        attempts = []
        self.fields['ActiveState'] = 'activating'
        def measure():
            attempts.append(self.fields['ActiveState'])
            return self.observe()
        def recover(seconds):
            self.assertEqual(seconds, 5)
            self.assertEqual(destination.read_text(), 'previous observation')
            competing = mock.Mock()
            with self.assertRaises(BlockingIOError):
                E.publish(destination, competing)
            competing.assert_not_called()
            self.fields['ActiveState'] = 'active'
            self.fields['InvocationID'] = 'new-running-invocation'
        with mock.patch.object(E.time, 'sleep', side_effect=recover), mock.patch('sys.stderr', new_callable=io.StringIO):
            receipt = E.publish(destination, lambda: E.observe_with_retry(measure))
        self.assertEqual(attempts, ['activating', 'active'])
        self.assertEqual(receipt['runtime']['invocationId'], 'new-running-invocation')
        self.assertEqual(receipt['observedAt'], NOW.isoformat())
        self.assertEqual(json.loads(destination.read_text()), receipt)

    def test_retry_exhaustion_preserves_receipt_and_never_logs_secret_exception_text(self):
        destination = self.root / 'receipt.json'
        destination.write_text('previous observation')
        errors = [subprocess.TimeoutExpired(['secret-command'], 10),
                  OSError('secret-path'), ValueError('secret-response')]
        observer = mock.Mock(side_effect=errors)
        with mock.patch.object(E.time, 'sleep') as sleep, mock.patch('sys.stderr', new_callable=io.StringIO) as stderr:
            with self.assertRaises(ValueError):
                E.publish(destination, lambda: E.observe_with_retry(observer))
        self.assertEqual(observer.call_count, 3)
        self.assertEqual(sleep.call_args_list, [mock.call(5), mock.call(15)])
        self.assertEqual(destination.read_text(), 'previous observation')
        self.assertNotIn('secret', stderr.getvalue())
        attempts = [json.loads(line) for line in stderr.getvalue().splitlines()]
        self.assertEqual([row['retryInSeconds'] for row in attempts], [5, 15, None])
        self.assertEqual(attempts[0]['reason'], 'observation-command-timeout')
        self.assertEqual(E.failure_reason(subprocess.CalledProcessError(1, ['secret'])), 'observation-command-failed')

    def test_publisher_entrypoint_retries_observation_but_not_a_definitively_unhealthy_receipt(self):
        args = ['publisher', '--provenance', str(self.sidecar), '--source-root', str(self.root),
                '--source-revision', CONFIG, '--gem-root', str(self.gem)]
        for receipt, code in [({'healthy': True}, 0), ({'healthy': False}, 2)]:
            with mock.patch.object(sys, 'argv', args), \
                 mock.patch.object(E, 'observe', side_effect=[ValueError('official listener ambiguous or unavailable'), receipt]) as observer, \
                 mock.patch.object(E.time, 'sleep') as sleep, mock.patch('builtins.print'):
                self.assertEqual(E.main(), code)
                self.assertEqual(observer.call_count, 2)
                sleep.assert_called_once_with(5)
                self.assertEqual(json.loads((self.gem / 'state/gem-service-attestation.json').read_text()), receipt)

    def test_operator_profile_environment_and_explicit_override_reach_observer(self):
        args = ['publisher', '--provenance', str(self.sidecar), '--source-root', str(self.root),
                '--source-revision', CONFIG, '--check']
        for extra, expected in [([], 'governor-bounded'), (['--profile', 'canonical'], 'canonical')]:
            with mock.patch.dict(E.os.environ, JOVIE_CONFIGURATION_PROFILE='governor-bounded'), \
                 mock.patch.object(sys, 'argv', args + extra), \
                 mock.patch.object(E, 'observe', return_value={'healthy': False}) as observer, \
                 mock.patch('builtins.print'):
                self.assertEqual(E.main(), 2)
                self.assertEqual(observer.call_args.kwargs['profile'], expected)

    def test_installer_verify_accepts_git_mirror_and_forwards_selected_profile(self):
        repo = self.root / 'installer-source'
        repo.mkdir()
        env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        env.update(HOME=str(self.root), GEM_SERVICE_ATTESTATION_VERIFY_ONLY='true')
        subprocess.run(['git', 'init', '-q', str(repo)], env=env, check=True)
        base = repo / 'scripts/symphony'
        (base / 'systemd').mkdir(parents=True)
        for name in ['emit_gem_service_attestation.py', 'symphony_proof_context.py',
                     'gem_gate_contract.py', 'symphony_official_runtime.py',
                     'verify_upstream_burrito_payload.py', 'systemd/gem-service-attestation.service']:
            (base / name).write_text('fixture\n')
        subprocess.run(['git', '-C', str(repo), 'add', '.'], env=env, check=True)
        subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Fixture',
                        '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'],
                       env=env, check=True)
        mirror = self.root / 'mirror.git'
        subprocess.run(['git', 'clone', '-q', '--bare', str(repo), str(mirror)], env=env, check=True)
        config = self.root / '.config/symphony'
        config.mkdir(parents=True)
        (config / 'runner-source.env').write_text(
            f'SYMPHONY_RELEASE_PROVENANCE={self.sidecar}\n'
            f'JOVIE_CONFIGURATION_SOURCE_ROOT={mirror}\n'
            f'JOVIE_CONFIGURATION_SOURCE_REVISION={CONFIG}\n'
            'JOVIE_CONFIGURATION_PROFILE=governor-bounded\n')
        bins = self.root / 'test-bin'
        bins.mkdir()
        (bins / 'systemctl').write_text('#!/bin/sh\nexit 0\n')
        (bins / 'python3').write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
        for executable in bins.iterdir(): executable.chmod(0o755)
        env['PATH'] = str(bins) + os.pathsep + env['PATH']
        installer = Path(E.__file__).with_name('install-gem-service-attestation.sh')
        result = subprocess.run(['bash', str(installer), str(repo)], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--profile\ngovernor-bounded\n', result.stdout)
        (config / 'runner-source.env').write_text(
            (config / 'runner-source.env').read_text().replace(
                'JOVIE_CONFIGURATION_PROFILE=governor-bounded\n',
                'JOVIE_CONFIGURATION_PROFILE=governor-bounded-codex\n'))
        forwarded = subprocess.run(['bash', str(installer), str(repo)], env=env, capture_output=True, text=True)
        self.assertEqual(forwarded.returncode, 0, forwarded.stderr)
        self.assertIn('--profile\ngovernor-bounded-codex\n', forwarded.stdout)
        self.assertIn('--source-root\n' + str(mirror) + '\n', result.stdout)
        self.assertIn('--check\n', result.stdout)
        self.assertFalse((self.root / 'gem-workspace/scripts/emit-gem-service-attestation.py').exists())
        not_repo = self.root / 'not-a-repository'
        not_repo.mkdir()
        inputs = config / 'runner-source.env'
        inputs.write_text(inputs.read_text().replace(str(mirror), str(not_repo)))
        rejected = subprocess.run(['bash', str(installer), str(repo)], env=env, capture_output=True, text=True)
        self.assertEqual(rejected.returncode, 2)
        self.assertIn('not a git repository', rejected.stderr)
        self.assertEqual(rejected.stdout, '')

    def test_failed_installer_restores_sources_and_previous_timer_activity(self):
        for active, failure in ((a, f) for a in (True, False) for f in ("check", "publish", "timer-start")):
            with self.subTest(timer_active=active, failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                repo = root / 'repo'
                base = repo / 'scripts/symphony'
                (base / 'systemd').mkdir(parents=True)
                names = ['emit_gem_service_attestation.py', 'symphony_proof_context.py',
                         'gem_gate_contract.py', 'symphony_official_runtime.py',
                         'verify_upstream_burrito_payload.py', 'systemd/gem-service-attestation.service']
                for name in names:
                    (base / name).write_text('new fixture source\n')
                env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
                env.update(HOME=str(root), GEM_SERVICE_ATTESTATION_VERIFY_ONLY='false', FAILURE=failure,
                           GIT_CONFIG_COUNT='3', GIT_CONFIG_KEY_0='maintenance.auto', GIT_CONFIG_VALUE_0='false',
                           GIT_CONFIG_KEY_1='gc.auto', GIT_CONFIG_VALUE_1='0',
                           GIT_CONFIG_KEY_2='maintenance.autoDetach', GIT_CONFIG_VALUE_2='false')
                subprocess.run(['git', 'init', '-q', str(repo)], env=env, check=True)
                subprocess.run(['git', '-C', str(repo), 'add', '.'], env=env, check=True)
                subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Fixture', '-c',
                                'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], env=env, check=True)
                config = root / '.config/symphony'
                config.mkdir(parents=True)
                (config / 'runner-source.env').write_text(
                    f'SYMPHONY_RELEASE_PROVENANCE={self.sidecar}\n'
                    f'JOVIE_CONFIGURATION_SOURCE_ROOT={repo}\n'
                    f'JOVIE_CONFIGURATION_SOURCE_REVISION={CONFIG}\n'
                    'JOVIE_CONFIGURATION_PROFILE=governor-bounded\n')
                targets = [root / 'gem-workspace/scripts' / name for name in
                           ['emit-gem-service-attestation.py', 'symphony_proof_context.py', 'gem_gate_contract.py',
                            'symphony_official_runtime.py', 'verify_upstream_burrito_payload.py']]
                targets.append(root / '.config/systemd/user/gem-service-attestation.service')
                for target in targets:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text('original source\n')
                    target.chmod(0o644)
                targets[0].chmod(0o755)
                timer = root / 'timer-active'
                if active: timer.touch()
                bins = root / 'bin'
                bins.mkdir()
                (bins / 'systemctl').write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/systemctl.log"
case "$*" in
  "--user is-active --quiet gem-service-attestation.timer") test -f "$HOME/timer-active" ;;
  "--user is-active --quiet gem-service-attestation.service") exit 1 ;;
  "--user stop gem-service-attestation.timer") rm -f "$HOME/timer-active" ;;
  "--user start gem-service-attestation.timer")
    touch "$HOME/timer-active"
    if [ "$FAILURE" = timer-start ] && [ ! -f "$HOME/start-failed" ]; then
      touch "$HOME/start-failed"; exit 2
    fi ;;
  "--user list-unit-files gem-service-attestation.timer") printf 'gem-service-attestation.timer enabled\\n' ;;
  *) exit 0 ;;
esac
''')
                (bins / 'python3').write_text('''#!/bin/sh
case "$*" in
  *--check*) [ "$FAILURE" != check ] || exit 2 ;;
  *) [ "$FAILURE" != publish ] || exit 2 ;;
esac
exit 0
''')
                for path in bins.iterdir(): path.chmod(0o755)
                env['PATH'] = str(bins) + os.pathsep + env['PATH']
                result = subprocess.run(['bash', str(Path(E.__file__).with_name('install-gem-service-attestation.sh')),
                                         str(repo)], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(timer.exists(), active)
                self.assertTrue(all(target.read_text() == 'original source\n' for target in targets))
                self.assertEqual(targets[0].stat().st_mode & 0o777, 0o755)
                calls = (root / 'systemctl.log').read_text()
                self.assertIn('daemon-reload', calls)
                self.assertNotIn('restart symphony', calls)
                self.assertFalse((root / 'gem-workspace/state/gem-service-attestation.json').exists())

    def test_upstream_installer_rejects_incomplete_wrong_or_mixed_inputs_before_writes(self):
        installer = Path(E.__file__).with_name('install-gem-service-attestation.sh')
        cases = ('missing-binding', 'missing-digest', 'wrong-digest', 'mode-mismatch',
                 'runner-input-mismatch', 'mixed-legacy', 'legacy-with-upstream')
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source_mode = 'legacy' if case == 'legacy-with-upstream' else 'upstream-preservation'
                repo, env, binding, approved_sha256, targets = self.installer_fixture(
                    root, mode=source_mode, mixed_legacy=case == 'mixed-legacy')
                if case == 'mode-mismatch':
                    runner_env = root / '.config/symphony/runner-source.env'
                    runner_env.write_text(runner_env.read_text().replace(
                        'GEM_SERVICE_ATTESTATION_MODE=upstream-preservation',
                        'GEM_SERVICE_ATTESTATION_MODE=legacy'))
                if case == 'runner-input-mismatch':
                    runner_env = root / '.config/symphony/runner-source.env'
                    runner_env.write_text(runner_env.read_text().replace(
                        f'SYMPHONY_UPSTREAM_BINDING={binding}',
                        f'SYMPHONY_UPSTREAM_BINDING={root / "different-binding.json"}'))
                command = ['bash', str(installer), str(repo)]
                if source_mode == 'upstream-preservation':
                    command.extend(['--mode', 'upstream-preservation'])
                    if case != 'missing-binding':
                        command.extend(['--upstream-binding', str(binding)])
                    if case != 'missing-digest':
                        digest = '0' * 64 if case == 'wrong-digest' else approved_sha256
                        command.extend(['--upstream-binding-sha256', digest])
                else:
                    command.extend(['--upstream-binding', str(binding),
                                    '--upstream-binding-sha256', approved_sha256])
                result = subprocess.run(command, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertFalse((root / 'systemctl.log').exists())
                self.assertTrue(all(not target.exists() for target in targets))

    def test_upstream_installer_installs_separate_receipt_mode_and_keeps_legacy_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, env, binding, approved_sha256, targets = self.installer_fixture(
                root, mode='upstream-preservation')
            (root / 'timer-active').touch()
            state = root / 'gem-workspace/state'
            state.mkdir(parents=True)
            legacy_path = state / 'gem-service-attestation.json'
            legacy_content = '{"schema":"gem-service-attestation/v1","healthy":false}\n'
            legacy_path.write_text(legacy_content)
            installer = Path(E.__file__).with_name('install-gem-service-attestation.sh')
            result = subprocess.run([
                'bash', str(installer), str(repo), '--mode', 'upstream-preservation',
                '--upstream-binding', str(binding), '--upstream-binding-sha256', approved_sha256,
            ], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((state / 'symphony-upstream-preservation.json').exists(),
                            f'publisher output missing; stdout={result.stdout!r}; stderr={result.stderr!r}; '
                            f'python calls={(root / "python.log").read_text() if (root / "python.log").exists() else "none"!r}')
            self.assertEqual(legacy_path.read_text(), legacy_content)
            self.assertTrue(all(target.exists() for target in targets))
            installed_unit = targets[-1].read_text()
            source_unit = repo / 'scripts/symphony/systemd/gem-service-attestation.service'
            self.assertEqual(installed_unit, source_unit.read_text())
            self.assertEqual(targets[0].stat().st_mode & 0o777, 0o755)
            calls = (root / 'python.log').read_text().splitlines()
            self.assertEqual(len(calls), 2)
            self.assertIn('--upstream-binding ' + str(binding), calls[0])
            self.assertIn('--upstream-binding-sha256 ' + approved_sha256, calls[0])
            self.assertIn('--check', calls[0])
            self.assertNotIn('--check', calls[1])
            self.assertNotIn('--provenance', '\n'.join(calls))
            systemctl_calls = (root / 'systemctl.log').read_text()
            self.assertIn('start gem-service-attestation.timer', systemctl_calls)
            self.assertNotIn('restart symphony', systemctl_calls)

    def test_upstream_installer_verify_only_runs_check_without_install_or_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, env, binding, approved_sha256, targets = self.installer_fixture(
                root, mode='upstream-preservation')
            env['GEM_SERVICE_ATTESTATION_VERIFY_ONLY'] = 'true'
            installer = Path(E.__file__).with_name('install-gem-service-attestation.sh')
            result = subprocess.run([
                'bash', str(installer), str(repo), '--mode', 'upstream-preservation',
                '--upstream-binding', str(binding), '--upstream-binding-sha256', approved_sha256,
            ], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = (root / 'python.log').read_text().splitlines()
            self.assertEqual(len(calls), 1)
            self.assertIn('--upstream-binding ' + str(binding), calls[0])
            self.assertIn('--upstream-binding-sha256 ' + approved_sha256, calls[0])
            self.assertIn('--check', calls[0])
            self.assertTrue(all(not target.exists() for target in targets))
            self.assertFalse((root / 'gem-workspace/state/symphony-upstream-preservation.json').exists())
            systemctl_calls = (root / 'systemctl.log').read_text()
            self.assertIn('show-environment', systemctl_calls)
            self.assertNotIn('start gem-service-attestation.timer', systemctl_calls)
            self.assertNotIn('restart symphony', systemctl_calls)

    def test_upstream_installer_publish_failure_restores_files_timer_and_both_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, env, binding, approved_sha256, targets = self.installer_fixture(
                root, mode='upstream-preservation', failure='publish')
            (root / 'timer-active').touch()
            for target in targets:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('previous installed source\n')
                target.chmod(0o644)
            targets[0].chmod(0o755)
            state = root / 'gem-workspace/state'
            state.mkdir(parents=True)
            legacy_path = state / 'gem-service-attestation.json'
            preservation_path = state / 'symphony-upstream-preservation.json'
            legacy_content = '{"schema":"gem-service-attestation/v1","healthy":true}\n'
            preservation_content = '{"schema":"symphony-upstream-preservation/v1","admission":"unverified"}\n'
            legacy_path.write_text(legacy_content)
            preservation_path.write_text(preservation_content)
            installer = Path(E.__file__).with_name('install-gem-service-attestation.sh')
            result = subprocess.run([
                'bash', str(installer), str(repo), '--mode', 'upstream-preservation',
                '--upstream-binding', str(binding), '--upstream-binding-sha256', approved_sha256,
            ], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertTrue((root / 'timer-active').exists())
            self.assertTrue(all(target.read_text() == 'previous installed source\n' for target in targets))
            self.assertEqual(targets[0].stat().st_mode & 0o777, 0o755)
            self.assertEqual(legacy_path.read_text(), legacy_content)
            self.assertEqual(preservation_path.read_text(), preservation_content)
            calls = (root / 'systemctl.log').read_text()
            self.assertIn('daemon-reload', calls)
            self.assertNotIn('restart symphony', calls)

    def test_user_unit_dispatches_exactly_one_observer_mode_and_rejects_mixing(self):
        unit = Path(E.__file__).with_name('systemd') / 'gem-service-attestation.service'
        exec_line = next(line.split('=', 1)[1] for line in unit.read_text().splitlines()
                         if line.startswith('ExecStart='))
        words = shlex.split(exec_line)
        self.assertEqual(words[:2], ['/bin/sh', '-ec'])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_python = root / 'python3'
            fake_python.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$HOME/unit-args"\n')
            fake_python.chmod(0o755)
            script = words[2].replace('$$', '$').replace('%h', str(root))
            script = script.replace('/usr/bin/python3', str(fake_python))

            def run_unit(values):
                (root / 'unit-args').unlink(missing_ok=True)
                controlled = {
                    'GEM_SERVICE_ATTESTATION_MODE', 'SYMPHONY_RELEASE_PROVENANCE',
                    'JOVIE_CONFIGURATION_SOURCE_ROOT', 'JOVIE_CONFIGURATION_SOURCE_REVISION',
                    'JOVIE_CONFIGURATION_PROFILE', 'SYMPHONY_UPSTREAM_BINDING',
                    'SYMPHONY_UPSTREAM_BINDING_SHA256',
                }
                env = {key: value for key, value in os.environ.items() if key not in controlled}
                env.update(HOME=str(root), **values)
                return subprocess.run(['/bin/sh', '-ec', script], env=env, capture_output=True, text=True)

            legacy = run_unit({
                'SYMPHONY_RELEASE_PROVENANCE': '/approved/release.json',
                'JOVIE_CONFIGURATION_SOURCE_ROOT': '/workspace/jovie',
                'JOVIE_CONFIGURATION_SOURCE_REVISION': CONFIG,
            })
            self.assertEqual(legacy.returncode, 0, legacy.stderr)
            legacy_args = (root / 'unit-args').read_text()
            self.assertIn('--provenance\n/approved/release.json\n', legacy_args)
            self.assertIn('--source-revision\n' + CONFIG + '\n', legacy_args)
            self.assertNotIn('--upstream-binding', legacy_args)

            preserved = run_unit({
                'GEM_SERVICE_ATTESTATION_MODE': 'upstream-preservation',
                'SYMPHONY_UPSTREAM_BINDING': '/approved/preservation.json',
                'SYMPHONY_UPSTREAM_BINDING_SHA256': 'b' * 64,
            })
            self.assertEqual(preserved.returncode, 0, preserved.stderr)
            preserved_args = (root / 'unit-args').read_text()
            self.assertIn('--upstream-binding\n/approved/preservation.json\n', preserved_args)
            self.assertIn('--upstream-binding-sha256\n' + 'b' * 64 + '\n', preserved_args)
            self.assertNotIn('--provenance', preserved_args)

            mixed = run_unit({
                'GEM_SERVICE_ATTESTATION_MODE': 'upstream-preservation',
                'SYMPHONY_UPSTREAM_BINDING': '/approved/preservation.json',
                'SYMPHONY_UPSTREAM_BINDING_SHA256': 'b' * 64,
                'SYMPHONY_RELEASE_PROVENANCE': '/legacy/release.json',
            })
            self.assertEqual(mixed.returncode, 78)
            self.assertFalse((root / 'unit-args').exists())

            missing_digest = run_unit({
                'GEM_SERVICE_ATTESTATION_MODE': 'upstream-preservation',
                'SYMPHONY_UPSTREAM_BINDING': '/approved/preservation.json',
            })
            self.assertEqual(missing_digest.returncode, 78)
            self.assertFalse((root / 'unit-args').exists())
            unknown = run_unit({'GEM_SERVICE_ATTESTATION_MODE': 'unrecognized'})
            self.assertEqual(unknown.returncode, 78)
            self.assertFalse((root / 'unit-args').exists())


def load_tests(loader, tests, pattern):
    import importlib.util
    spec = importlib.util.spec_from_file_location("upstream_preservation_tests", Path(__file__).with_name("upstream-preservation.test.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    tests.addTests(loader.loadTestsFromModule(module))
    return tests


if __name__ == '__main__':
    unittest.main()
