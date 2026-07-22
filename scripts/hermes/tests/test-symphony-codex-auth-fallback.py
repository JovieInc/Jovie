#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import textwrap
import threading
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/hermes"
CONTROLLER = SOURCE_DIR / "symphony-codex-exhausted.py"
SIDECAR = SOURCE_DIR / "symphony-grok-sidecar"
WRAPPER = SOURCE_DIR / "symphony-codex-exhausted"
RUNTIME_NAMES = ("symphony-codex-exhausted", "symphony-codex-exhausted.py", "symphony-grok-sidecar")


class LinearServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


class LinearHandler(http.server.BaseHTTPRequestHandler):
    identifiers = ["JOV-1", "JOV-2", "JOV-3"]
    authorization = None
    requests = []

    def do_POST(self):  # noqa: N802 - stdlib handler API
        length = int(self.headers["Content-Length"])
        body = self.rfile.read(length).decode()
        self.__class__.requests.append((self.headers.get("Authorization"), body))
        payload = {"data": {"issues": {"nodes": [{"identifier": i} for i in self.identifiers]}}}
        encoded = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args):
        return


class FallbackTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tempdir.name)
        self.home = self.root / "home"
        self.home.mkdir()
        grok_ship_one = self.home / ".local/bin/grok-ship-one"
        grok_ship_one.parent.mkdir(parents=True)
        grok_ship_one.write_text("#!/bin/sh\nexit 0\n")
        grok_ship_one.chmod(0o755)
        self.state = self.root / "codex-state.json"
        self.state.write_text(
            json.dumps({"active": None, "cooldowns": {"jovie": 1}, "last_error": {}})
        )
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.events = self.root / "events.log"

    def tearDown(self):
        self.tempdir.cleanup()

    def write_command(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\nset -eu\n" + textwrap.dedent(body))
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        return path

    def env(self, **extra):
        env = os.environ.copy()
        for key in list(env):
            if key.startswith(("GEM_", "SYMPHONY_")) or key in {
                "LINEAR_API_KEY",
                "LINEAR_API_URL",
            }:
                env.pop(key)
        env.update(
            {
                "HOME": str(self.home),
                "GEM_CODEX_ACCOUNTS_STATE": str(self.state),
                "GEM_CODEX_CANARY_TIMEOUT_SECONDS": "0.5",
                "PATH": f"{self.bin}:{env['PATH']}",
            }
        )
        env.update({key: str(value) for key, value in extra.items()})
        return env

    def run_controller(self, *args, **env):
        return subprocess.run(
            ["python3", str(CONTROLLER), *args],
            capture_output=True,
            text=True,
            env=self.env(**env),
            check=False,
        )

    def install_runtime(self, destination=None):
        destination = destination or self.home / ".local/bin"
        result = self.run_install(destination)
        self.assertEqual(result.returncode, 0, result.stderr)
        return destination

    def run_install(self, destination, **extra):
        return subprocess.run(
            [sys.executable, str(CONTROLLER), "install", "--destination-root", str(destination)],
            capture_output=True,
            text=True,
            env=self.env(**extra),
            check=False,
        )

    def run_install_with_crash(self, destination, replace_number):
        startup = self.root / f"sitecustomize-{replace_number}"
        startup.mkdir()
        (startup / "sitecustomize.py").write_text(
            "import os\n"
            "import signal\n"
            "real_replace = os.replace\n"
            "replace_number = int(os.environ['INSTALL_CRASH_AFTER_REPLACE'])\n"
            "replace_count = 0\n"
            "def crash_at_boundary(source, target):\n"
            "    global replace_count\n"
            "    replace_count += 1\n"
            "    if replace_count == replace_number:\n"
            "        os.kill(os.getpid(), signal.SIGKILL)\n"
            "    return real_replace(source, target)\n"
            "os.replace = crash_at_boundary\n"
        )
        return self.run_install(
            destination,
            INSTALL_CRASH_AFTER_REPLACE=replace_number,
            PYTHONPATH=startup,
        )

    def assert_completed_install(self, destination):
        current = destination / ".symphony-codex-auth-fallback/current"
        self.assertTrue(current.is_symlink())
        release = current.resolve()
        for name, source in (
            ("symphony-codex-exhausted", WRAPPER),
            ("symphony-codex-exhausted.py", CONTROLLER),
            ("symphony-grok-sidecar", SIDECAR),
        ):
            self.assertEqual((release / name).read_bytes(), source.read_bytes())
            self.assertTrue((destination / name).is_file())
            self.assertNotEqual((destination / name).read_bytes(), source.read_bytes())

    def write_legacy_trio(self, destination):
        destination.mkdir(parents=True, exist_ok=True)
        legacy = {}
        for name in RUNTIME_NAMES:
            target = destination / name
            legacy[name] = f"#!/bin/sh\n# legacy {name}\nexit 0\n".encode()
            target.write_bytes(legacy[name])
            target.chmod(0o755)
        return legacy

    def start_linear(self):
        LinearHandler.requests = []
        server = LinearServer(("127.0.0.1", 0), LinearHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return f"http://127.0.0.1:{server.server_port}/graphql"

    def write_linear_env(self, contents):
        path = self.home / ".config/symphony/linear.env"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)
        return path

    def test_canary_uses_live_command_and_exact_marker(self):
        canary = self.write_command(
            "codex-rotate",
            "printf '%s\\n' \"$*\" >> \"$GEM_EVENTS\"; printf 'GEM_MODEL_READY\\n'",
        )
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events)
        self.assertEqual((result.stdout, result.returncode), ("no\n", 1))
        self.assertEqual(
            self.events.read_text().splitlines(),
            [
                "--config shell_environment_policy.inherit=none --config model=gpt-5.6-luna exec --sandbox read-only --skip-git-repo-check Reply with exactly: GEM_MODEL_READY"
            ],
        )

    def test_test_environment_scrubs_controller_variables_before_overrides(self):
        ambient = {
            "GEM_CODEX_CANARY_TIMEOUT_SECONDS": "99",
            "SYMPHONY_GROK_MAX": "99",
            "LINEAR_API_KEY": "ambient-secret",
            "LINEAR_API_URL": "http://ambient.invalid",
        }
        with mock.patch.dict(os.environ, ambient, clear=False):
            actual = self.env(GEM_CODEX_CANARY_TIMEOUT_SECONDS="0.5")
        self.assertEqual(actual["GEM_CODEX_CANARY_TIMEOUT_SECONDS"], "0.5")
        self.assertNotIn("SYMPHONY_GROK_MAX", actual)
        self.assertNotIn("LINEAR_API_KEY", actual)
        self.assertNotIn("LINEAR_API_URL", actual)

    def test_canary_timeout_does_not_change_control_timeout(self):
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "fallback_controller_timeout_isolation", CONTROLLER
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with mock.patch.dict(
            module.os.environ, {"GEM_CODEX_CANARY_TIMEOUT_SECONDS": "0.01"}
        ):
            self.assertEqual(module._timeout_seconds(), 0.01)
            self.assertEqual(
                module._control_timeout_seconds(), module.CONTROL_TIMEOUT_SECONDS
            )
            self.assertEqual(module._control_timeout_seconds(), 10.0)

    def test_stale_expired_cooldown_does_not_mask_failed_live_canary(self):
        canary = self.write_command(
            "codex-rotate",
            "echo 'token_invalidated refresh_token_invalidated SECRET' >&2; exit 1",
        )
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        self.assertNotIn("token_invalidated", result.stdout + result.stderr)
        self.assertNotIn("SECRET", result.stdout + result.stderr)

    def test_malformed_and_missing_state_fail_closed(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        for contents in ("not-json", json.dumps({"cooldowns": {}}), json.dumps({"active": 1, "cooldowns": {}, "last_error": {}})):
            self.state.write_text(contents)
            result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)
            self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        self.state.unlink()
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_missing_executable_timeout_and_partial_marker_fail_closed(self):
        missing = self.run_controller(GEM_CODEX_ROTATE_BIN=self.root / "missing")
        self.assertEqual((missing.stdout, missing.returncode), ("yes\n", 0))
        timeout = self.write_command("codex-rotate", "sleep 1; echo GEM_MODEL_READY")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=timeout)
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        partial = self.write_command("codex-rotate", "echo 'GEM_MODEL_READY extra'")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=partial)
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_usable_sidecar_starts_then_verifies_and_only_then_logs_idle(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; [ \"$2\" != is-active ] || exit \"${GEM_ACTIVE_RC:-0}\"",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.events.read_text().splitlines(),
            [
                "systemctl --user list-units --type=service --state=active grok-ship-*.service --no-legend --no-pager",
                "systemctl --user start symphony-ui-pilot.service",
                "systemctl --user is-active --quiet symphony-ui-pilot.service",
            ],
        )
        self.assertIn("idle", result.stderr)

    def test_usable_sidecar_failure_does_not_claim_idle(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; [ \"$2\" != is-active ] || exit 1",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(" idle", result.stderr)

    def test_usable_sidecar_start_failure_does_not_claim_idle(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; [ \"$2\" = start ] && exit 1; exit 0",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(" idle", result.stderr)

    def test_usable_sidecar_ignores_malformed_linear_env_before_idle(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        self.write_linear_env("LINEAR_API_KEY='unterminated\n")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; [ \"$2\" != is-active ] || exit \"${GEM_ACTIVE_RC:-0}\"",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.events.read_text().splitlines(),
            [
                "systemctl --user list-units --type=service --state=active grok-ship-*.service --no-legend --no-pager",
                "systemctl --user start symphony-ui-pilot.service",
                "systemctl --user is-active --quiet symphony-ui-pilot.service",
            ],
        )
        self.assertIn("idle", result.stderr)

    def test_usable_recovery_defers_while_grok_ship_unit_is_active(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; if [ \"$2\" = list-units ]; then printf 'grok-ship-JOV-1.service loaded active running\\n'; fi; exit 0",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("recovery_deferred", result.stderr)
        self.assertNotIn(" start symphony-ui-pilot.service", self.events.read_text())

    def test_grok_state_query_failure_is_not_idle(self):
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        self.write_command(
            "systemctl",
            "if [ \"$2\" = list-units ]; then exit 1; fi; exit 0",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary),
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("grok_state_query_failed", result.stderr)

    def test_grok_state_query_timeout_is_unknown(self):
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "fallback_controller_timeout", CONTROLLER
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with mock.patch.object(module, "_captured", return_value=None):
            self.assertIsNone(module._active_grok_units())

    def test_exhausted_sidecar_loads_linear_key_from_dotenv_without_leaking_it(self):
        canary = self.write_command("codex-rotate", "exit 1")
        linear_key = "file-linear-secret"
        self.write_linear_env(f"# only the key\nexport LINEAR_API_KEY='{linear_key}'\n")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; if [ \"$2\" = is-active ]; then [ \"$4\" = grok-ship-JOV-2 ] && exit 0; exit 1; fi; exit 0",
        )
        systemd_run = self.write_command(
            "systemd-run",
            "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_CODEX_ROTATE_BIN=canary,
                LINEAR_API_URL=self.start_linear(),
                GEM_EVENTS=self.events,
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(LinearHandler.requests[0][0], linear_key)
        self.assertNotIn(linear_key, result.stdout + result.stderr)
        self.assertNotIn(linear_key, self.events.read_text())

    def test_exhausted_sidecar_stops_symphony_skips_active_and_bounds_launches(self):
        canary = self.write_command("codex-rotate", "exit 1")
        systemctl = self.write_command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; if [ \"$2\" = is-active ]; then [ \"$4\" = grok-ship-JOV-2 ] && exit 0; exit 1; fi; exit 0",
        )
        systemd_run = self.write_command(
            "systemd-run",
            "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"",
        )
        destination = self.install_runtime()
        result = subprocess.run(
            [str(destination / "symphony-grok-sidecar")],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_CODEX_ROTATE_BIN=canary,
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.start_linear(),
                GEM_EVENTS=self.events,
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        self.assertEqual(events[0], "systemctl --user stop symphony-ui-pilot.service")
        self.assertIn("systemctl --user is-active --quiet grok-ship-JOV-2", events)
        launches = [line for line in events if line.startswith("systemd-run")]
        self.assertEqual(len(launches), 2)
        self.assertTrue(any("grok-ship-JOV-1" in line for line in launches))
        self.assertTrue(any("grok-ship-JOV-3" in line for line in launches))
        self.assertIn(
            f"systemd-run --user --unit=grok-ship-JOV-1 --collect -p Type=exec -p Environment=PATH={self.home}/.local/bin:/usr/bin:/bin {self.home}/.local/bin/grok-ship-one JOV-1",
            launches,
        )
        self.assertNotIn("linear-secret", result.stdout + result.stderr)
        self.assertNotIn("linear-secret", "\n".join(line for _, line in LinearHandler.requests))
        query = json.loads(LinearHandler.requests[0][1])["query"]
        self.assertIn("first: 20", query)
        self.assertIn('name: { eq: "symphony" }', query)
        self.assertIn('name: { in: ["Todo", "In Progress"] }', query)

    def test_installer_exact_artifacts_modes_content_and_fail_before_mutation(self):
        destination = self.home / "install/bin"
        self.install_runtime()
        installed = self.home / ".local/bin"
        current = installed / ".symphony-codex-auth-fallback/current"
        for name, source in (("symphony-codex-exhausted", WRAPPER), ("symphony-codex-exhausted.py", CONTROLLER), ("symphony-grok-sidecar", SIDECAR)):
            target = installed / name
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o755)
            self.assertNotEqual(target.read_bytes(), source.read_bytes())
            self.assertEqual((current / name).read_bytes(), source.read_bytes())

        source_root = self.root / "source/scripts/hermes"
        source_root.mkdir(parents=True)
        for source in (WRAPPER, CONTROLLER, SIDECAR):
            shutil.copy2(source, source_root / source.name)
        (source_root / WRAPPER.name).write_text("invalid")
        destination.mkdir(parents=True)
        sentinel = destination / "sentinel"
        sentinel.write_text("keep")
        result = subprocess.run(
            [sys.executable, str(source_root / CONTROLLER.name), "install", "--destination-root", str(destination)],
            capture_output=True,
            text=True,
            env=self.env(),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sentinel.read_text(), "keep")
        self.assertEqual(list(destination.iterdir()), [sentinel])

    def test_installer_rejects_partial_or_invalid_legacy_before_mutation(self):
        partial = self.root / "partial-legacy"
        partial.mkdir()
        (partial / RUNTIME_NAMES[0]).write_bytes(b"#!/bin/sh\nexit 0\n")
        (partial / RUNTIME_NAMES[0]).chmod(0o755)
        result = self.run_install(partial)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(sorted(path.name for path in partial.iterdir()), [RUNTIME_NAMES[0]])

        invalid = self.root / "invalid-legacy"
        self.write_legacy_trio(invalid)
        (invalid / RUNTIME_NAMES[1]).write_text("not an executable legacy controller")
        result = self.run_install(invalid)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(
            sorted(path.name for path in invalid.iterdir()), sorted(RUNTIME_NAMES)
        )

    def test_installer_rolls_back_induced_mid_migration_failure(self):
        destination = self.root / "legacy-bin"
        self.write_legacy_trio(destination)

        import importlib.util

        spec = importlib.util.spec_from_file_location("fallback_controller", CONTROLLER)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        real_replace = module.os.replace
        calls = 0

        def fail_once(source, target):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError("induced install failure")
            return real_replace(source, target)

        with mock.patch.object(module.os, "replace", side_effect=fail_once):
            self.assertEqual(module.install(str(destination)), 2)
        self.assertEqual(module.install(str(destination)), 0)
        self.assert_completed_install(destination)

    def test_executable_crash_points_recover_fresh_install(self):
        for replace_number in range(1, 6):
            destination = self.root / f"fresh-{replace_number}"
            crashed = self.run_install_with_crash(destination, replace_number)
            self.assertLess(crashed.returncode, 0)
            self.assertEqual(self.run_install(destination).returncode, 0)
            self.assert_completed_install(destination)

    def test_executable_crash_points_recover_legacy_migration(self):
        for replace_number in range(1, 7):
            destination = self.root / f"legacy-{replace_number}"
            self.write_legacy_trio(destination)
            crashed = self.run_install_with_crash(destination, replace_number)
            self.assertLess(crashed.returncode, 0)
            self.assertEqual(self.run_install(destination).returncode, 0)
            self.assert_completed_install(destination)

    def test_old_wrapper_reaches_prior_controller_after_python_launcher_replace(self):
        destination = self.root / "legacy-wrapper"
        self.write_legacy_trio(destination)
        legacy_controller = destination / "symphony-codex-exhausted.py"
        legacy_controller.write_bytes(CONTROLLER.read_bytes())
        legacy_controller.chmod(0o755)
        legacy_wrapper = (
            "#!/bin/sh\n"
            f"exec python3 '{legacy_controller}' \"$@\"\n"
        ).encode()
        wrapper = destination / "symphony-codex-exhausted"
        wrapper.write_bytes(legacy_wrapper)
        wrapper.chmod(0o755)
        old_wrapper = self.root / "old-symphony-codex-exhausted"
        old_wrapper.write_bytes(legacy_wrapper)
        old_wrapper.chmod(0o755)

        crashed = self.run_install_with_crash(destination, 5)
        self.assertLess(crashed.returncode, 0)
        installed_controller = destination / "symphony-codex-exhausted.py"
        installed_controller_contents = installed_controller.read_bytes()
        self.assertNotEqual(installed_controller_contents, CONTROLLER.read_bytes())
        self.assertIn(
            b'release_link = state_dir / "current"', installed_controller_contents
        )
        self.assertIn(
            b'controller = release_link / "symphony-codex-exhausted.py"',
            installed_controller_contents,
        )
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        result = subprocess.run(
            [str(old_wrapper), "probe"],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary),
            check=False,
        )
        self.assertEqual((result.stdout, result.returncode), ("no\n", 1))

    def test_executable_crash_points_recover_versioned_upgrade(self):
        for replace_number in range(1, 6):
            destination = self.root / f"versioned-{replace_number}"
            self.assertEqual(self.run_install(destination).returncode, 0)
            crashed = self.run_install_with_crash(destination, replace_number)
            self.assertLess(crashed.returncode, 0)
            self.assertEqual(self.run_install(destination).returncode, 0)
            self.assert_completed_install(destination)

    def test_custom_destination_wrappers_use_sibling_bundle(self):
        destination = self.root / "custom-bin"
        self.install_runtime(destination)
        canary = self.write_command("codex-rotate", "echo GEM_MODEL_READY")
        result = subprocess.run(
            [str(destination / "symphony-codex-exhausted")],
            capture_output=True,
            text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=canary),
            check=False,
        )
        self.assertEqual((result.stdout, result.returncode), ("no\n", 1))


if __name__ == "__main__":
    unittest.main()
