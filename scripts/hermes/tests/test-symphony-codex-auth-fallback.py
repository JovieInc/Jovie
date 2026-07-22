#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import textwrap
import threading
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/hermes"
CONTROLLER = SOURCE_DIR / "symphony-codex-exhausted.py"
SIDECAR = SOURCE_DIR / "symphony-grok-sidecar"
WRAPPER = SOURCE_DIR / "symphony-codex-exhausted"


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

    def install_runtime(self):
        destination = self.home / ".local/bin"
        result = subprocess.run(
            ["python3", str(CONTROLLER), "install", "--destination-root", str(destination)],
            capture_output=True,
            text=True,
            env=self.env(),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return destination

    def start_linear(self):
        LinearHandler.requests = []
        server = LinearServer(("127.0.0.1", 0), LinearHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return f"http://127.0.0.1:{server.server_port}/graphql"

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
                "--config shell_environment_policy.inherit=all --config model=gpt-5.6-luna exec --sandbox read-only --skip-git-repo-check Reply with exactly: GEM_MODEL_READY"
            ],
        )

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
        self.assertNotIn("linear-secret", result.stdout + result.stderr)
        self.assertNotIn("linear-secret", "\n".join(line for _, line in LinearHandler.requests))
        query = json.loads(LinearHandler.requests[0][1])["query"]
        self.assertIn('name: { eq: "symphony" }', query)
        self.assertIn('name: { in: ["Todo", "In Progress"] }', query)

    def test_installer_exact_artifacts_modes_content_and_fail_before_mutation(self):
        destination = self.home / "install/bin"
        self.install_runtime()
        installed = self.home / ".local/bin"
        for name, source in (("symphony-codex-exhausted", WRAPPER), ("symphony-codex-exhausted.py", CONTROLLER), ("symphony-grok-sidecar", SIDECAR)):
            target = installed / name
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o755)

        source_root = self.root / "source/scripts/hermes"
        source_root.mkdir(parents=True)
        for source in (WRAPPER, CONTROLLER, SIDECAR):
            shutil.copy2(source, source_root / source.name)
        (source_root / WRAPPER.name).write_text("invalid")
        destination.mkdir(parents=True)
        sentinel = destination / "sentinel"
        sentinel.write_text("keep")
        result = subprocess.run(
            ["python3", str(source_root / CONTROLLER.name), "install", "--destination-root", str(destination)],
            capture_output=True,
            text=True,
            env=self.env(),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sentinel.read_text(), "keep")
        self.assertEqual(list(destination.iterdir()), [sentinel])


if __name__ == "__main__":
    unittest.main()
