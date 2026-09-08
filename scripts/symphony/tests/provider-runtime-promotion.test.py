#!/usr/bin/env python3
"""Exercise the actual provider filesystem transaction and launcher paths."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/symphony"))
HELPER = ROOT / "scripts/symphony/provider_runtime_promotion.py"
UPDATER = ROOT / "scripts/symphony/update-symphony-burrito.sh"
REAL_NPM = shutil.which("npm")
FILES = {
    "symphony-agent-router": "symphony-agent-router",
    "symphony-codex-router": "symphony-codex-router-hotfix",
    "codex-account-probe.sh": "codex-account-probe",
    "cursor-appserver-adapter.py": "cursor-appserver-adapter",
}


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.repo = self.root / "source"
        self.source = self.repo / "scripts/symphony"
        self.source.mkdir(parents=True)
        self.home = self.root / "home"
        self.bin = self.home / ".local/bin"
        self.bin.mkdir(parents=True)
        self.state = self.home / ".local/state/symphony-elixir"
        self.store = self.state / "provider-generations"
        for name, installed in FILES.items():
            self.write(self.bin / installed, self.content(name, "old"))
            self.write(self.source / name, self.content(name, "new"))
        self.write(self.bin / "symphony-codex-entry", (self.bin / "symphony-agent-router").read_text())
        shutil.copytree(ROOT / "scripts/symphony/codex-cli", self.source / "codex-cli")
        self.write(self.source / "codex-rotate", '#!/bin/sh\nexec "$CODEX_REAL_BIN" "$@"\n')
        from provider_cli_fixtures import install_fake_npm
        self.npm_fixture, self.npm = install_fake_npm(self.root)
        self.env_patch = patch.dict(os.environ, {"PATH": str(self.npm.parent) + os.pathsep + os.environ["PATH"]})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        # Exercise the actual updater dispatcher from a private source checkout,
        # with reviewed router sources and a deterministic package installer.
        self.updater = self.source / UPDATER.name
        for path in [UPDATER, HELPER, ROOT / "scripts/symphony/codex_cli_artifact.py"]:
            shutil.copyfile(path, self.source / path.name)

    def content(self, name, version):
        if name.endswith('.py'):
            return f'#!/usr/bin/env python3\nprint("{version}")\n'
        if name == "symphony-agent-router":
            return ('#!/usr/bin/env bash\nset -euo pipefail\n'
                    f'printf "{version}:"\n'
                    '"$SYMPHONY_CODEX_ROUTER"\n'
                    '"$SYMPHONY_CODEX_ACCOUNT_PROBE"\n'
                    '"$SYMPHONY_CURSOR_ADAPTER"\n')
        return f'#!/usr/bin/env bash\nprintf "{version}\\n"\n'

    def write(self, path, text):
        path.write_text(text)
        path.chmod(0o755)

    def run_helper(self, rollback=0, dry=0, stage=0, check=0):
        output = io.StringIO()
        status = 0
        with patch.object(sys, "argv", [str(HELPER), str(self.repo), str(self.home), str(self.state), str(rollback), str(dry), str(stage), str(check)]), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            try:
                runpy.run_path(str(HELPER), run_name="__main__")
            except SystemExit as exc:
                status = int(exc.code or 0)
        return status, output.getvalue()

    def launch(self, name):
        return subprocess.check_output([str(self.bin / name)], text=True).strip()

    def test_shared_rotate_cannot_change_a_published_generation(self):
        self.write(self.source / "symphony-codex-router",
                   '#!/bin/sh\nexec "${SYMPHONY_CODEX_ROTATE:-$HOME/.local/bin/codex-rotate}"\n')
        self.write(self.source / "codex-rotate", '#!/bin/sh\nprintf "reviewed-rotate\\n"\n')
        self.write(self.bin / "codex-rotate", '#!/bin/sh\nprintf "shared-old\\n"\n')
        self.assertEqual(self.run_helper()[0], 0)
        self.write(self.bin / "codex-rotate", '#!/bin/sh\nprintf "shared-changed\\n"\n')
        result = subprocess.check_output([str(self.bin / "symphony-codex-entry")],
                                         env={**os.environ, "HOME": str(self.home)}, text=True)
        self.assertEqual(result.strip(), "new:reviewed-rotate\nnew\nnew")

    def change_pin(self, version="0.153.5"):
        for name in ["package.json", "package-lock.json"]:
            path = self.source / "codex-cli" / name
            path.write_text(path.read_text().replace("0.153.4", version))

    def test_native_binary_and_rotate_ignore_shared_paths_and_environment(self):
        self.write(self.source / "symphony-codex-router",
                   '#!/bin/sh\nexec "$SYMPHONY_CODEX_ROTATE" fixture-work\n')
        protected = [self.bin / "codex", self.bin / "codex-rotate", self.bin / "lyb-codex"]
        for path in protected:
            self.write(path, '#!/bin/sh\nprintf "unqualified-shared\\n"\n')
        before = {path: path.read_bytes() for path in protected}
        self.assertEqual(self.run_helper()[0], 0)
        result = subprocess.run([str(self.bin / "symphony-codex-entry")], capture_output=True, text=True,
            env={**os.environ, "HOME": str(self.home), "CODEX_REAL_BIN": str(protected[0]),
                 "SYMPHONY_CODEX_ROTATE": str(protected[1])})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("native-qualified fixture-work", result.stdout)
        self.assertNotIn("unqualified-shared", result.stdout)
        self.assertEqual(before, {path: path.read_bytes() for path in protected})

    def test_pin_update_is_qualified_and_rollback_restores_exact_old_binary(self):
        self.assertEqual(self.run_helper()[0], 0)
        old = (self.store / "current").resolve()
        old_bytes = (old / "codex").read_bytes()
        self.change_pin()
        self.assertEqual(self.run_helper(check=1)[0], 10)
        self.assertEqual(self.run_helper()[0], 0)
        new = (self.store / "current").resolve()
        receipt = json.loads((new / "manifest.json").read_text())
        self.assertEqual(receipt["codex_cli"]["pin"]["version"], "0.153.5")
        self.assertNotEqual((new / "codex").read_bytes(), old_bytes)
        self.assertEqual(self.run_helper(rollback=1)[0], 0)
        self.assertEqual((self.store / "current").resolve(), old)
        self.assertEqual((old / "codex").read_bytes(), old_bytes)
        self.assertEqual(self.run_helper(check=1)[0], 10)
        # Old v1 generations remain valid rollback targets, even without any pin source.
        self.assertEqual(self.run_helper(rollback=1)[0], 0)
        self.assertEqual((self.store / "current").resolve(), new)

    def test_same_pin_source_update_needs_no_installer_or_auth(self):
        self.assertEqual(self.run_helper()[0], 0)
        old = (self.store / "current").resolve()
        self.npm.unlink()
        self.write(self.source / "codex-rotate", '#!/bin/sh\necho reviewed-next-wrapper\n')
        status, output = self.run_helper()
        self.assertEqual(status, 0, output)
        new = (self.store / "current").resolve()
        self.assertEqual((old / "codex").read_bytes(), (new / "codex").read_bytes())
        self.assertNotEqual((old / "codex-rotate").read_bytes(), (new / "codex-rotate").read_bytes())
        self.assertEqual(self.run_helper(check=1)[0], 0)

    def test_install_version_initialize_failures_preserve_first_install_and_cleanup(self):
        import codex_cli_artifact as cli
        aliases = [self.bin / name for name in ["symphony-agent-router", "symphony-codex-entry"]]
        before = {path: path.read_bytes() for path in aliases}
        expected = {"install": "pinned npm installation failed", "version": "native version mismatch",
                    "initialize": "initialize compatibility failed", "exit": "exited before response",
                    "malformed": "Expecting value", "flood": "response exceeded limit",
                    "timeout": "initialize timed out", "symlink": "native artifact missing"}
        for mode in expected:
            with self.subTest(mode=mode):
                self.npm_fixture.write_text(json.dumps({"mode": mode}))
                with patch.object(cli, "INIT_TIMEOUT", 3 if mode == "timeout" else 5):
                    status, output = self.run_helper()
                self.assertEqual(status, 10, output)
                self.assertIn(expected[mode], output)
                self.assertEqual(before, {path: path.read_bytes() for path in aliases})
                self.assertTrue(all(not path.is_symlink() for path in aliases))
                self.assertFalse((self.store / "current").exists())
                self.assertEqual(list(self.store.glob("source-*")), [])
                self.assertEqual(list(self.store.glob("**/.codex-qualify-*")), [])

    def test_initialize_process_ignoring_terminate_is_killed_before_publication(self):
        self.npm_fixture.write_text(json.dumps({"mode": "ignoreterm"}))
        status, output = self.run_helper()
        self.assertEqual(status, 0, output)
        self.assertEqual(self.run_helper(check=1)[0], 0)
        self.assertEqual(list(self.store.glob("**/.codex-qualify-*")), [])

    def test_failed_update_keeps_old_generation_launchable(self):
        self.assertEqual(self.run_helper()[0], 0)
        current = (self.store / "current").resolve()
        before = {path: os.readlink(path) for path in [self.store / "current", self.store / "previous",
                  self.bin / "symphony-agent-router", self.bin / "symphony-codex-entry"]}
        self.change_pin()
        self.npm_fixture.write_text(json.dumps({"mode": "initialize"}))
        self.assertEqual(self.run_helper()[0], 10)
        self.assertEqual(before, {path: os.readlink(path) for path in before})
        self.assertEqual((self.store / "current").resolve(), current)
        self.assertEqual(self.launch("symphony-codex-entry"), "new:new\nnew\nnew")
        self.assertEqual(len(list(self.store.glob("source-*"))), 1)

    def test_rejects_native_corruption_receipt_mismatch_and_unknown_schema(self):
        self.assertEqual(self.run_helper()[0], 0)
        current = (self.store / "current").resolve()
        binary = current / "codex"
        original = binary.read_bytes()
        binary.write_bytes(b"corrupt")
        self.assertEqual(self.run_helper(check=1)[0], 10)
        binary.write_bytes(original)
        manifest = current / "manifest.json"
        original = manifest.read_text()
        receipt = json.loads(original)
        receipt["codex_cli"]["binary_sha256"] = "0" * 64
        manifest.write_text(json.dumps(receipt))
        self.assertEqual(self.run_helper(check=1)[0], 10)
        receipt["schema"] = "unrecognized"
        manifest.write_text(json.dumps(receipt))
        self.assertEqual(self.run_helper(check=1)[0], 10)
        manifest.write_text(original)
        self.assertEqual(self.run_helper(check=1)[0], 0)

    def test_pin_rejects_floating_versions_extra_packages_and_wrong_integrity(self):
        pin_dir = self.source / "codex-cli"
        paths = [pin_dir / "package.json", pin_dir / "package-lock.json"]
        original = {path: path.read_text() for path in paths}
        mutations = [
            (0, lambda d: d["dependencies"].update({"@openai/codex": "^0.153.4"})),
            (0, lambda d: d.update({"scripts": {"install": "untrusted"}})),
            (1, lambda d: d.update({"lockfileVersion": 2})),
            (1, lambda d: d["packages"].update({"node_modules/unowned": {}})),
            (1, lambda d: d["packages"]["node_modules/@openai/codex"].update({"integrity": "sha1-abc"})),
            (1, lambda d: d["packages"]["node_modules/@openai/codex"].update({"resolved": "https://unowned.invalid/a.tgz"})),
            (1, lambda d: d["packages"]["node_modules/@openai/codex"].update({"integrity": "sha512-eA=="})),
        ]
        for index, mutate in mutations:
            with self.subTest(index=index, mutate=mutate):
                data = json.loads(original[paths[index]])
                mutate(data)
                paths[index].write_text(json.dumps(data))
                self.assertEqual(self.run_helper(dry=1)[0], 10)
                self.assertFalse(self.state.exists())
                paths[index].write_text(original[paths[index]])
        self.assertEqual(self.run_helper(dry=1)[0], 0)

    def test_real_npm_accepts_isolated_user_and_global_configuration(self):
        import codex_cli_artifact as cli
        self.assertIsNotNone(REAL_NPM, "CI's real npm must validate the installer arguments")
        scratch = self.root / "real-npm-smoke"
        scratch.mkdir()
        user, global_config = scratch / "user.npmrc", scratch / "global.npmrc"
        user.touch()
        global_config.touch()
        result = subprocess.run([REAL_NPM, "--version", "--userconfig=" + str(user),
                                 "--globalconfig=" + str(global_config)], cwd=scratch,
                                env=cli.clean_env(scratch, REAL_NPM), capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout.strip(), r"^\d+\.\d+\.\d+")

    def test_no_npm_or_timed_out_installer_does_not_publish(self):
        import codex_cli_artifact as cli
        with patch.object(cli.shutil, "which", return_value=None):
            self.assertEqual(self.run_helper()[0], 10)
        self.npm.write_text('#!/bin/sh\nexec sleep 30\n')
        with patch.object(cli, "INSTALL_TIMEOUT", 0.1):
            self.assertEqual(self.run_helper()[0], 10)
        self.assertFalse((self.store / "current").exists())
        self.assertEqual(list(self.store.glob("source-*")), [])

    def test_promotion_and_rollback_bind_both_aliases_to_complete_generation(self):
        self.assertEqual(self.run_helper()[0], 0)
        for name in ["symphony-agent-router", "symphony-codex-entry"]:
            self.assertEqual(self.launch(name), "new:new\nnew\nnew")
        first = (self.store / "current").resolve()
        self.assertEqual(self.run_helper(rollback=1)[0], 0)
        self.assertNotEqual((self.store / "current").resolve(), first)
        self.assertEqual(self.launch("symphony-codex-entry"), "old:old\nold\nold")
        self.assertEqual(self.run_helper()[0], 0)
        self.assertEqual(self.launch("symphony-agent-router"), "new:new\nnew\nnew")

    def test_check_binds_sources_launcher_and_aliases_to_current_generation(self):
        self.assertEqual(self.run_helper(check=1)[0], 10)
        self.assertEqual(self.run_helper()[0], 0)
        status, output = self.run_helper(check=1)
        self.assertEqual(status, 0, output)
        self.assertIn("PROVIDER_OK", output)
        source = self.source / "codex-account-probe.sh"
        original = source.read_text()
        self.write(source, self.content(source.name, "drifted"))
        self.assertEqual(self.run_helper(check=1)[0], 10)
        self.write(source, original)
        alias = self.bin / "symphony-codex-entry"
        alias.unlink()
        alias.symlink_to((self.store / "previous").resolve() / "entry")
        self.assertEqual(self.run_helper(check=1)[0], 10)

    def test_failed_readback_rolls_back_both_aliases(self):
        self.assertEqual(self.run_helper()[0], 0)
        previous = (self.store / "current").resolve()
        original = Path.resolve
        def fail_readback(path, *args, **kwargs):
            value = original(path, *args, **kwargs)
            if path == self.bin / "symphony-codex-entry":
                return self.root / "unexpected"
            return value
        with patch.object(Path, "resolve", fail_readback):
            status, output = self.run_helper()
        self.assertEqual(status, 10, output)
        self.assertEqual((self.store / "current").resolve(), previous)
        self.assertEqual(self.launch("symphony-agent-router"), "new:new\nnew\nnew")

    def test_interrupted_alias_bootstrap_resumes_without_mixed_launch(self):
        original = os.replace
        def interrupt(source, destination):
            if destination == self.bin / "symphony-codex-entry":
                raise OSError("injected alias install interruption")
            return original(source, destination)
        with patch("os.replace", interrupt):
            self.assertEqual(self.run_helper()[0], 10)
        self.assertEqual(self.launch("symphony-agent-router"), "old:old\nold\nold")
        self.assertEqual(self.run_helper()[0], 0)
        self.assertEqual(self.launch("symphony-codex-entry"), "new:new\nnew\nnew")

    def test_dry_run_does_not_create_state(self):
        status, output = self.run_helper(dry=1)
        self.assertEqual(status, 0, output)
        self.assertIn("PROVIDER_DRY_RUN", output)
        self.assertFalse(self.state.exists())
        self.assertEqual(self.run_helper(rollback=1)[0], 10)
        self.assertFalse((self.store / "current").exists())

    def test_stage_only_preserves_regular_and_managed_entrypoints(self):
        aliases = [self.bin / name for name in ["symphony-agent-router", "symphony-codex-entry"]]
        original = [path.read_bytes() for path in aliases]
        status, output = self.run_helper(stage=1)
        self.assertEqual(status, 0, output)
        self.assertIn("PROVIDER_STAGED", output)
        self.assertEqual([path.read_bytes() for path in aliases], original)
        self.assertFalse((self.store / "current").exists())
        self.assertFalse((self.store / "previous").exists())
        self.assertEqual(self.run_helper()[0], 0)
        pointers = {path: os.readlink(path) for path in [*aliases, self.store / "current", self.store / "previous"]}
        status, output = self.run_helper(stage=1)
        self.assertEqual(status, 0, output)
        self.assertEqual({path: os.readlink(path) for path in pointers}, pointers)
        generation = Path(next(line.removeprefix("PROVIDER_STAGED ") for line in output.splitlines() if line.startswith("PROVIDER_STAGED ")))
        self.assertNotEqual(generation, (self.store / "current").resolve())
        self.assertTrue((generation / "manifest.json").is_file())

    def test_stage_dry_run_and_incompatible_rollback_make_no_mutation(self):
        self.assertEqual(self.run_helper(stage=1, dry=1)[0], 0)
        self.assertFalse(self.state.exists())
        self.assertEqual(self.run_helper(stage=1, rollback=1)[0], 10)
        self.assertFalse(self.state.exists())
        result = subprocess.run(["bash", str(self.updater), "--stage-provider-runtime", "--provider-runtime-rollback"],
            env={**os.environ, "SYMPHONY_ELIXIR_HOME": str(self.home)}, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.state.exists())

    def test_stage_dispatch_uses_same_store_without_switching_current(self):
        result = subprocess.run(["bash", str(self.updater), "--stage-provider-runtime"],
            env={**os.environ, "SYMPHONY_ELIXIR_HOME": str(self.home)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        generation = Path(next(line.removeprefix("PROVIDER_STAGED ") for line in result.stdout.splitlines() if line.startswith("PROVIDER_STAGED ")))
        self.assertEqual(generation.parent, self.store)
        self.assertTrue((generation / "manifest.json").is_file())
        self.assertFalse((self.store / "current").exists())

    def test_installed_entry_copies_real_router_and_resolves_workspace_registry(self):
        workspace = self.root / "JOV-5954"
        config = workspace / "scripts/symphony/config"
        config.mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts/symphony/config/model-registry.json", config / "model-registry.json")
        (workspace / ".symphony-routing.json").write_text(json.dumps({"schema": "symphony-routing/v1", "issue": "JOV-5954", "model": "gpt-5.6-sol"}))
        env_dir = self.home / ".config/symphony"
        env_dir.mkdir(parents=True)
        (env_dir / "linear.env").write_text("LINEAR_API_KEY=fixture-only\n")
        account_state = self.home / ".codex-accounts/state.json"
        account_state.parent.mkdir()
        account_state.write_text("{}\n")
        guard, rotate = [self.root / name for name in ["guard", "rotate"]]
        exhausted = self.bin / "symphony-codex-exhausted.py"
        admission_calls = self.root / "admission-calls"
        self.write(guard, "#!/bin/sh\nexit 0\n")
        self.write(rotate, '#!/bin/sh\nprintf "MODEL_FREE_CODEX_HANDOFF %s\\n" "$*"\n')
        env = {**os.environ, "SYMPHONY_ELIXIR_HOME": str(self.home), "SYMPHONY_HOME": str(self.home),
               "SYMPHONY_WORKSPACE": str(workspace), "SYMPHONY_ISSUE_IDENTIFIER": "JOV-5954",
               "SYMPHONY_CAPACITY_GUARD": str(guard), "SYMPHONY_CODEX_EXHAUSTED": str(exhausted),
               "SYMPHONY_CODEX_ROTATE": str(rotate), "SYMPHONY_FALLBACK_LEASE_DIR": str(self.root / "leases"),
               "CODEX_ACCOUNTS_STATE": str(account_state), "SYMPHONY_ROUTER_HEARTBEAT_SECONDS": "0"}
        for name in ["symphony-agent-router", "symphony-codex-router", "codex-account-probe.sh"]:
            shutil.copyfile(ROOT / "scripts/symphony" / name, self.source / name)
        shutil.copyfile(rotate, self.source / "codex-rotate")
        install = subprocess.run(["bash", str(self.updater), "--provider-runtime-only"], env=env, capture_output=True, text=True)
        self.assertEqual(install.returncode, 0, install.stderr)
        result = subprocess.run([str(self.bin / "symphony-codex-entry"), "app-server"], cwd=workspace, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertNotIn('MODEL_FREE_CODEX_HANDOFF', result.stdout)
        self.assertFalse(admission_calls.exists())
        # The provider-generation fixture supplies admission separately, as the
        # managed-controller installer does. Never make a missing helper optional.
        self.write(exhausted, 'import sys\n'
                   'assert sys.argv[1:] in (["native-preflight", "JOV-5954"], ["pickup-check", "JOV-5954"])\n'
                   f'with open({str(admission_calls)!r}, "a") as calls: calls.write(sys.argv[1] + "\\n")\n')
        result = subprocess.run([str(self.bin / "symphony-codex-entry"), "app-server"], cwd=workspace, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(admission_calls.read_text().splitlines(), ['native-preflight', 'pickup-check'])
        self.assertIn('MODEL_FREE_CODEX_HANDOFF --config shell_environment_policy.inherit=all --config model="gpt-5.6-sol" app-server', result.stdout)
        self.assertEqual((workspace / "scripts/symphony/symphony-codex-router").read_bytes(),
                         (ROOT / "scripts/symphony/symphony-codex-router").read_bytes())

    def test_inflight_launch_keeps_its_generation_across_promotion(self):
        router = self.source / "symphony-agent-router"
        router.write_text(router.read_text().replace('printf "new:"',
            'touch "$PROMOTION_TEST_STARTED"\nwhile [ ! -f "$PROMOTION_TEST_RELEASE" ]; do sleep 0.01; done\nprintf "new:"'))
        self.assertEqual(self.run_helper()[0], 0)
        started, release = self.root / "started", self.root / "release"
        worker = subprocess.Popen([str(self.bin / "symphony-codex-entry")],
            env={**os.environ, "PROMOTION_TEST_STARTED": str(started), "PROMOTION_TEST_RELEASE": str(release)},
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 20
            while not started.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(started.exists())
            for name in FILES:
                self.write(self.source / name, self.content(name, "next"))
            self.assertEqual(self.run_helper()[0], 0)
            release.touch()
            output, error = worker.communicate(timeout=20)
            self.assertEqual(worker.returncode, 0, error)
            self.assertEqual(output.strip(), "new:new\nnew\nnew")
            self.assertEqual(self.launch("symphony-codex-entry"), "next:next\nnext\nnext")
        finally:
            if worker.poll() is None:
                worker.kill()
                worker.communicate()

    def test_concurrent_publishers_serialize_and_leave_complete_bundle(self):
        command = [sys.executable, str(HELPER), str(self.repo), str(self.home), str(self.state), "0", "0"]
        workers = [subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
        for worker in workers:
            output, error = worker.communicate(timeout=30)
            self.assertEqual(worker.returncode, 0, output + error)
        self.assertEqual(self.launch("symphony-agent-router"), "new:new\nnew\nnew")
        self.assertEqual(self.launch("symphony-codex-entry"), "new:new\nnew\nnew")

    def test_rejects_divergent_or_missing_aliases_and_bundle(self):
        entry = self.bin / "symphony-codex-entry"
        original = entry.read_text()
        self.write(entry, "#!/bin/sh\nexit 0\n")
        self.assertEqual(self.run_helper()[0], 10)
        entry.unlink()
        self.assertEqual(self.run_helper()[0], 10)
        self.write(entry, original)
        (self.bin / "codex-account-probe").unlink()
        self.assertEqual(self.run_helper()[0], 10)

    def test_rejects_corrupt_generation_and_unowned_alias(self):
        self.assertEqual(self.run_helper()[0], 0)
        generation = (self.store / "current").resolve()
        original = (generation / "codex-probe").read_text()
        self.write(generation / "codex-probe", "#!/bin/sh\nexit 99\n")
        self.assertEqual(self.run_helper()[0], 10)
        self.write(generation / "codex-probe", original)
        alias = self.bin / "symphony-codex-entry"
        alias.unlink()
        alias.symlink_to(generation / "entry")
        self.assertEqual(self.run_helper()[0], 10)

    def test_rejects_self_consistent_launcher_pointing_outside_generation(self):
        self.assertEqual(self.run_helper()[0], 0)
        generation = (self.store / "current").resolve()
        entry = generation / "entry"
        entry.write_text("#!/usr/bin/env bash\nexec /tmp/unowned-provider \"$@\"\n")
        entry.chmod(0o755)
        manifest = json.loads((generation / "manifest.json").read_text())
        manifest["sha256"]["entry"] = hashlib.sha256(entry.read_bytes()).hexdigest()
        (generation / "manifest.json").write_text(json.dumps(manifest))
        self.assertEqual(self.run_helper()[0], 10)

    def test_rejects_external_generation_and_missing_source(self):
        self.store.mkdir(parents=True)
        (self.store / "current").symlink_to(self.root)
        self.assertEqual(self.run_helper()[0], 10)

    def test_rollback_does_not_depend_on_current_source_health(self):
        self.assertEqual(self.run_helper()[0], 0)
        (self.source / "cursor-appserver-adapter.py").write_text("invalid Python syntax !")
        self.assertEqual(self.run_helper()[0], 10)
        (self.source / "symphony-agent-router").unlink()
        current = (self.store / "current").resolve()
        status, output = self.run_helper(rollback=1, dry=1)
        self.assertEqual(status, 0, output)
        self.assertIn("PROVIDER_ROLLBACK_DRY_RUN", output)
        self.assertEqual((self.store / "current").resolve(), current)
        self.assertEqual(self.run_helper(rollback=1)[0], 0)
        self.assertEqual(self.launch("symphony-codex-entry"), "old:old\nold\nold")
        self.assertEqual(self.run_helper()[0], 10)

    def test_updater_provider_mode_avoids_tracker_and_service_actions(self):
        # Real updater dispatch, real source validation, missing account/env/API
        # and a preserved live workflow all coexist with provider-only install.
        protected = [self.bin / "symphony", self.bin / "symphony-official-runtime",
                     self.home / ".config/symphony/WORKFLOW.md",
                     self.home / ".config/systemd/user/symphony-elixir.service"]
        for path in protected:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("preserve exact live bytes max_concurrent_agents: 1\n")
        before = {path: path.read_bytes() for path in protected}
        env = {**os.environ, "SYMPHONY_ELIXIR_HOME": str(self.home)}
        result = subprocess.run(["bash", str(self.updater), "--provider-runtime-only"], env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        first_generation = (self.store / "current").resolve(strict=True)
        self.assertEqual(before, {path: path.read_bytes() for path in protected})
        self.assertNotIn("ACTIVE_ISSUES", result.stdout)
        self.assertNotIn("RESTARTED", result.stdout)
        # A production activation encounters an already-managed current link.
        # The supported provider operation must promote through its lock and
        # retain an exact rollback generation without touching service config.
        promoted = subprocess.run(["bash", str(self.updater), "--provider-runtime-only"], env=env, text=True, capture_output=True)
        self.assertEqual(promoted.returncode, 0, promoted.stderr)
        self.assertNotEqual((self.store / "current").resolve(strict=True), first_generation)
        self.assertEqual((self.store / "previous").resolve(strict=True), first_generation)
        self.assertEqual(before, {path: path.read_bytes() for path in protected})
        for alias in (self.bin / "symphony-agent-router", self.bin / "symphony-codex-entry"):
            self.assertEqual(alias.resolve(strict=True), (self.store / "current").resolve(strict=True) / "entry")
        result = subprocess.run(["bash", str(self.updater), "--skip-binary", "--no-restart"], env=env, capture_output=True)
        self.assertEqual(result.returncode, 10)
        self.assertEqual(before, {path: path.read_bytes() for path in protected})
        for flag in ["--retire-legacy", "--check", "--runtime-readback"]:
            result = subprocess.run(["bash", str(self.updater), "--provider-runtime-only", flag], env=env, capture_output=True)
            self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
