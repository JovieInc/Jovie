#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import pathlib
import stat
import subprocess
import tempfile
import textwrap
import threading
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/hermes"
CONTROLLER = SOURCE_DIR / "symphony-codex-exhausted.py"
WRAPPER = SOURCE_DIR / "symphony-codex-exhausted"
SIDECAR = SOURCE_DIR / "symphony-grok-sidecar"
RUNTIME_NAMES = (WRAPPER.name, CONTROLLER.name, SIDECAR.name)


class LinearHandler(http.server.BaseHTTPRequestHandler):
    requests: list[tuple[str | None, str]] = []

    def do_POST(self):  # noqa: N802 - stdlib handler API
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        self.__class__.requests.append((self.headers.get("Authorization"), body))
        payload = {"data": {"issues": {"nodes": [{"identifier": n} for n in ("JOV-1", "JOV-2", "JOV-3")]}}}
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
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        python = self.bin / "python3"
        python.write_text("#!/bin/sh\nexec /usr/bin/python3 \"$@\"\n")
        python.chmod(0o755)
        self.state = self.root / "state.json"
        self.state.write_text(json.dumps({"active": None, "cooldowns": {"jovie": 1}, "last_error": {}}))
        self.events = self.root / "events.log"
        grok = self.home / ".local/bin/grok-ship-one"
        grok.parent.mkdir(parents=True)
        grok.write_text("#!/bin/sh\nexit 0\n")
        grok.chmod(0o755)

    def tearDown(self):
        self.tmp.cleanup()

    def env(self, **overrides):
        env = os.environ.copy()
        for key in list(env):
            if key.startswith(("GEM_", "SYMPHONY_")) or key in {"LINEAR_API_KEY", "LINEAR_API_URL"}:
                env.pop(key)
        env.update({
            "HOME": str(self.home),
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "GEM_CODEX_ACCOUNTS_STATE": str(self.state),
            "GEM_CODEX_CANARY_TIMEOUT_SECONDS": "1.0",
        })
        env.update({key: str(value) for key, value in overrides.items()})
        return env

    def command(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\nset -eu\n" + textwrap.dedent(body))
        path.chmod(0o755)
        return path

    def run_controller(self, *args, controller=CONTROLLER, **env):
        return subprocess.run(
            ["/usr/bin/python3", str(controller), *args], capture_output=True, text=True,
            env=self.env(**env), check=False,
        )

    def run_install(self, destination, controller=CONTROLLER, **env):
        return self.run_controller("install", "--destination-root", destination, controller=controller, **env)

    def crash_install(self, destination, replace_number, controller=CONTROLLER):
        startup = pathlib.Path(tempfile.mkdtemp(dir=self.root))
        (startup / "sitecustomize.py").write_text(
            "import os, signal\n"
            "real_replace = os.replace\n"
            "count = 0\n"
            "def replace(source, target):\n"
            "    global count\n"
            "    count += 1\n"
            "    if count == int(os.environ['INSTALL_CRASH_AFTER_REPLACE']):\n"
            "        os.kill(os.getpid(), signal.SIGKILL)\n"
            "    return real_replace(source, target)\n"
            "os.replace = replace\n"
        )
        return self.run_install(
            destination, controller=controller, INSTALL_CRASH_AFTER_REPLACE=replace_number,
            PYTHONPATH=startup,
        )

    def install_runtime(self, destination=None, controller=CONTROLLER):
        destination = destination or self.home / ".local/bin"
        result = self.run_install(destination, controller=controller)
        self.assertEqual(result.returncode, 0, result.stderr)
        return pathlib.Path(destination)

    def assert_complete_install(self, destination, source_dir=SOURCE_DIR):
        current = destination / ".symphony-codex-auth-fallback/current"
        self.assertTrue(current.is_symlink())
        release = current.resolve()
        for name in RUNTIME_NAMES:
            self.assertEqual((release / name).read_bytes(), (source_dir / name).read_bytes())
            self.assertTrue((destination / name).is_file())
            self.assertEqual(stat.S_IMODE((destination / name).stat().st_mode), 0o755)
            self.assertNotEqual((destination / name).read_bytes(), (source_dir / name).read_bytes())

    def distinct_source(self, label):
        source = self.root / f"source-{label}"
        source.mkdir()
        for path in (WRAPPER, CONTROLLER, SIDECAR):
            target = source / path.name
            target.write_bytes(path.read_bytes() + f"\n# {label}-{path.name}\n".encode())
            target.chmod(0o755)
        return source / CONTROLLER.name

    def linear_url(self):
        LinearHandler.requests = []
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LinearHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return f"http://127.0.0.1:{server.server_port}/graphql"

    def test_incident_auth_invalidation_is_exhausted_and_scrubbed(self):
        self.command("codex-rotate", "echo 'token_invalidated refresh_token_invalidated SECRET' >&2; exit 1")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate")
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        self.assertNotIn("token_invalidated", result.stdout + result.stderr)
        self.assertNotIn("SECRET", result.stdout + result.stderr)

    def test_live_canary_requires_luna_and_exact_marker(self):
        canary = self.command("codex-rotate", "printf '%s\\n' \"$*\" > \"$GEM_EVENTS\"; printf 'GEM_MODEL_READY\\n'")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events)
        self.assertEqual((result.stdout, result.returncode), ("no\n", 1))
        self.assertEqual(self.events.read_text(), "--config shell_environment_policy.inherit=none --config model=gpt-5.6-luna exec --sandbox read-only --skip-git-repo-check Reply with exactly: GEM_MODEL_READY\n")

    def test_probe_ambiguity_fails_closed(self):
        canary = self.command("codex-rotate", "sleep 1; echo GEM_MODEL_READY")
        cases = [
            "not-json",
            json.dumps({"cooldowns": {}}),
            json.dumps({"active": None, "cooldowns": {}, "last_error": {}}),
        ]
        for contents in cases:
            self.state.write_text(contents)
            result = self.run_controller(GEM_CODEX_ROTATE_BIN=canary)
            self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        self.state.unlink()
        self.assertEqual(self.run_controller(GEM_CODEX_ROTATE_BIN=canary).stdout, "yes\n")
        self.state.write_text(json.dumps({"active": None, "cooldowns": {}, "last_error": {}}))
        for command in (
            {"GEM_CODEX_ROTATE_BIN": self.root / "missing"},
            {"GEM_CODEX_ROTATE_BIN": self.command("partial", "echo 'GEM_MODEL_READY extra'")},
            {"GEM_CODEX_ROTATE_BIN": canary},
        ):
            result = self.run_controller(**command)
            self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_environment_overrides_are_scrubbed_before_explicit_values(self):
        env = self.env(GEM_CODEX_CANARY_TIMEOUT_SECONDS="0.5")
        self.assertEqual(env["GEM_CODEX_CANARY_TIMEOUT_SECONDS"], "0.5")
        self.assertNotIn("LINEAR_API_KEY", env)
        self.assertNotIn("SYMPHONY_GROK_MAX", env)

    def test_usable_recovery_starts_and_verifies_symphony_before_idle(self):
        canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        self.command("systemctl", "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; [ \"$2\" != is-active ] || exit \"${GEM_ACTIVE_RC:-0}\"")
        destination = self.install_runtime()
        result = subprocess.run([destination / "symphony-grok-sidecar"], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events), check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text().splitlines(), [
            "systemctl --user list-units --type=service --state=active grok-ship-*.service --no-legend --no-pager",
            "systemctl --user start symphony-ui-pilot.service",
            "systemctl --user is-active --quiet symphony-ui-pilot.service",
        ])
        self.assertIn("idle", result.stderr)

    def test_usable_recovery_fails_closed_on_unknown_grok_state_or_symphony(self):
        canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        systemctl = self.command("systemctl", "[ \"$2\" = list-units ] && exit 1; [ \"$2\" = start ] && exit 1; exit 0")
        destination = self.install_runtime()
        result = subprocess.run([destination / "symphony-grok-sidecar"], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=canary), check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("grok_state_query_failed", result.stderr)
        self.assertNotIn("idle", result.stderr)

    def test_usable_recovery_defers_while_grok_ship_is_active(self):
        canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        self.command("systemctl", "[ \"$2\" = list-units ] && printf 'grok-ship-JOV-1.service loaded active running\\n'; exit 0")
        destination = self.install_runtime()
        result = subprocess.run([destination / "symphony-grok-sidecar"], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=canary), check=False)
        self.assertEqual(result.returncode, 0)
        self.assertIn("recovery_deferred", result.stderr)

    def test_exhausted_recovery_stops_symphony_and_bounds_grok_launches(self):
        self.command("codex-rotate", "exit 1")
        self.command("systemctl", "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; if [ \"$2\" = is-active ]; then [ \"$4\" = grok-ship-JOV-2 ] && exit 0; exit 1; fi; exit 0")
        self.command("systemd-run", "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"")
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate", GEM_EVENTS=self.events,
                         LINEAR_API_KEY="linear-secret", LINEAR_API_URL=self.linear_url()), check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        self.assertEqual(events[0], "systemctl --user stop symphony-ui-pilot.service")
        self.assertEqual(len([line for line in events if line.startswith("systemd-run")]), 2)
        self.assertNotIn("linear-secret", result.stdout + result.stderr + self.events.read_text())
        self.assertIn("first: 20", LinearHandler.requests[0][1])

    def test_linear_env_is_strict_and_malformed_auth_does_not_block_usable_path(self):
        self.command("codex-rotate", "echo GEM_MODEL_READY")
        env_file = self.home / ".config/symphony/linear.env"
        env_file.parent.mkdir(parents=True)
        env_file.write_text("LINEAR_API_KEY='unterminated\n")
        self.command("systemctl", "[ \"$2\" = is-active ] && exit 0; exit 0")
        result = subprocess.run([self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate"), check=False)
        self.assertEqual(result.returncode, 0)

    def test_partial_or_invalid_install_fails_before_destination_mutation(self):
        partial = self.root / "partial"
        partial.mkdir()
        (partial / RUNTIME_NAMES[0]).write_text("#!/bin/sh\nexit 0\n")
        (partial / RUNTIME_NAMES[0]).chmod(0o755)
        result = self.run_install(partial)
        self.assertEqual(result.returncode, 2)
        invalid_source = self.distinct_source("invalid")
        (invalid_source.parent / WRAPPER.name).write_text("invalid")
        destination = self.root / "invalid-destination"
        destination.mkdir()
        sentinel = destination / "sentinel"
        sentinel.write_text("keep")
        result = self.run_install(destination, controller=invalid_source)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(sentinel.read_text(), "keep")

    def test_fresh_install_recovers_at_each_atomic_cutover(self):
        for replace_number in range(1, 5):
            destination = self.root / f"fresh-{replace_number}"
            crashed = self.crash_install(destination, replace_number)
            self.assertLess(crashed.returncode, 0)
            if (destination / ".symphony-codex-auth-fallback/current").is_symlink():
                self.assertTrue((destination / ".symphony-codex-auth-fallback/current").resolve().is_dir())
            recovered = self.run_install(destination)
            self.assertEqual(recovered.returncode, 0, recovered.stderr)
            self.assert_complete_install(destination)

    def test_upgrade_recovers_without_losing_known_good_current_release(self):
        source_a = self.distinct_source("A")
        source_b = self.distinct_source("B")
        for replace_number in range(1, 5):
            destination = self.root / f"upgrade-{replace_number}"
            self.install_runtime(destination, controller=source_a)
            current_a = (destination / ".symphony-codex-auth-fallback/current").resolve()
            crashed = self.crash_install(destination, replace_number, controller=source_b)
            self.assertLess(crashed.returncode, 0)
            current = destination / ".symphony-codex-auth-fallback/current"
            self.assertTrue(current.is_symlink())
            self.assertIn(
                (current / CONTROLLER.name).read_bytes(),
                {(current_a / CONTROLLER.name).read_bytes(), (source_b.parent / CONTROLLER.name).read_bytes()},
            )
            self.assertEqual(self.run_install(destination, controller=source_b).returncode, 0)
            self.assertEqual((current / CONTROLLER.name).read_bytes(), (source_b.parent / CONTROLLER.name).read_bytes())

    def test_reentry_after_interrupted_upgrade_selects_new_complete_release(self):
        destination = self.root / "reentry"
        source_a = self.distinct_source("A")
        source_b = self.distinct_source("B")
        source_c = self.distinct_source("C")
        self.install_runtime(destination, controller=source_a)
        crashed = self.crash_install(destination, 2, controller=source_b)
        self.assertLess(crashed.returncode, 0)
        self.assertEqual(self.run_install(destination, controller=source_c).returncode, 0)
        current = destination / ".symphony-codex-auth-fallback/current"
        self.assertEqual((current / CONTROLLER.name).read_bytes(), (source_c.parent / CONTROLLER.name).read_bytes())

    def test_custom_destination_launcher_resolves_its_sibling_bundle(self):
        destination = self.install_runtime(self.root / "custom-bin")
        canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        result = subprocess.run([destination / WRAPPER.name], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=canary), check=False)
        self.assertEqual((result.stdout, result.returncode), ("no\n", 1))


if __name__ == "__main__":
    unittest.main()
