#!/usr/bin/env python3

from __future__ import annotations

import http.server
import importlib.util
import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile
import textwrap
import threading
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/hermes"
CONTROLLER = SOURCE_DIR / "symphony-codex-exhausted.py"
WRAPPER = SOURCE_DIR / "symphony-codex-exhausted"
SIDECAR = SOURCE_DIR / "symphony-grok-sidecar"
GROK_SHIP = SOURCE_DIR / "grok-ship-one"
RUNTIME_ARTIFACTS = (WRAPPER, CONTROLLER, SIDECAR, GROK_SHIP)
RUNTIME_NAMES = tuple(path.name for path in RUNTIME_ARTIFACTS)


class LinearHandler(http.server.BaseHTTPRequestHandler):
    requests: list[tuple[str | None, str]] = []
    nodes = [
        {
            "identifier": identifier,
            "team": {"key": identifier.split("-", 1)[0]},
            "labels": {"nodes": [{"name": name} for name in labels]},
        }
        for identifier, labels in (
            ("JOV-1", ("symphony", "plan-approved", "admission-approved")),
            ("JOV-2", ("symphony", "plan-approved", "admission-approved")),
            ("LYB-3", ("symphony", "plan-approved", "admission-approved")),
            ("JOV-4", ("symphony", "needs:human")),
            ("LYB-5", ("symphony", "plan-approved")),
        )
    ]
    # Override for single-issue admission re-checks (simulates a label guard
    # flagging an issue AFTER the reconcile list query observed it as admitted).
    single_issue_labels: dict[str, list[str]] = {}

    def do_POST(self):  # noqa: N802 - stdlib handler API
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        self.__class__.requests.append((self.headers.get("Authorization"), body))
        if "issues(" in body:
            payload = {"data": {"issues": {"nodes": self.__class__.nodes}}}
        else:
            match = re.search(r'"id"\s*:\s*"([^"]+)"', body)
            identifier = match.group(1) if match else ""
            team = identifier.split("-", 1)[0] if "-" in identifier else "JOV"
            node = next((n for n in self.__class__.nodes if n["identifier"] == identifier), None)
            if node is None:
                payload = {"data": {"issue": None}}
            else:
                labels = self.__class__.single_issue_labels.get(identifier) or [
                    x["name"] for x in node["labels"]["nodes"]
                ]
                payload = {
                    "data": {
                        "issue": {
                            "id": f"uuid-{identifier}",
                            "identifier": identifier,
                            "title": f"Ship {identifier}",
                            "description": "Bounded admitted work.",
                            "url": f"https://linear.example/{identifier}",
                            "state": {"id": f"{team}-todo", "name": "Todo"},
                            "team": {
                                "key": team,
                                "states": {
                                    "nodes": [
                                        {"id": f"{team}-progress", "name": "In Progress"},
                                        {"id": f"{team}-review", "name": "In Review"},
                                    ]
                                },
                            },
                            "labels": {"nodes": [{"name": name} for name in labels]},
                        }
                    }
                }
        encoded = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args):
        return


class GrokLinearHandler(http.server.BaseHTTPRequestHandler):
    requests: list[dict] = []
    labels: dict[str, list[str]] = {}

    def do_POST(self):  # noqa: N802 - stdlib handler API
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.__class__.requests.append(payload)
        if "issueUpdate" in payload["query"]:
            response = {"data": {"issueUpdate": {"success": True}}}
        else:
            identifier = payload["variables"]["id"]
            team = identifier.split("-", 1)[0]
            labels = self.__class__.labels.get(identifier) or [
                "symphony",
                "plan-approved",
                "admission-approved",
            ]
            response = {
                "data": {
                    "issue": {
                        "id": f"uuid-{identifier}",
                        "identifier": identifier,
                        "title": f"Ship {identifier}",
                        "description": "Bounded admitted work.",
                        "url": f"https://linear.example/{identifier}",
                        "state": {"id": f"{team}-todo", "name": "Todo"},
                        "team": {
                            "key": team,
                            "states": {
                                "nodes": [
                                    {"id": f"{team}-progress", "name": "In Progress"},
                                    {"id": f"{team}-review", "name": "In Review"},
                                ]
                            },
                        },
                        "labels": {"nodes": [{"name": name} for name in labels]},
                    }
                }
            }
        encoded = json.dumps(response).encode()
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
        for path in RUNTIME_ARTIFACTS:
            target = source / path.name
            target.write_bytes(path.read_bytes() + f"\n# {label}-{path.name}\n".encode())
            target.chmod(0o755)
        return source / CONTROLLER.name

    def linear_url(self):
        LinearHandler.requests = []
        LinearHandler.single_issue_labels = {}
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LinearHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return f"http://127.0.0.1:{server.server_port}/graphql"

    def grok_linear_url(self):
        GrokLinearHandler.requests = []
        GrokLinearHandler.labels = {}
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), GrokLinearHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return f"http://127.0.0.1:{server.server_port}/graphql"

    def load_controller_module(self):
        spec = importlib.util.spec_from_file_location("symphony_codex_exhausted", CONTROLLER)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_incident_auth_invalidation_is_exhausted_and_scrubbed(self):
        self.command("codex-rotate", "echo 'token_invalidated refresh_token_invalidated SECRET' >&2; exit 1")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate")
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))
        self.assertNotIn("token_invalidated", result.stdout + result.stderr)
        self.assertNotIn("SECRET", result.stdout + result.stderr)

    def test_all_accounts_cooldown_is_exhausted_despite_kimi_fallback_probe(self):
        # Both accounts are capped; codex-rotate's kimi fallback would answer the
        # live probe with GEM_MODEL_READY anyway. The canary must decide from the
        # cooldown state alone and never consult the probe for this verdict.
        future = int(time.time()) + 3600
        self.state.write_text(json.dumps({
            "active": None,
            "cooldowns": {"jovie": future, "meetjovie": future},
            "last_error": {},
        }))
        kimi_canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=kimi_canary)
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_kimi_fallback_cannot_mask_cooldown_exhaustion_in_sidecar(self):
        future = int(time.time()) + 3600
        self.state.write_text(json.dumps({
            "active": None,
            "cooldowns": {"jovie": future, "meetjovie": future},
            "last_error": {},
        }))
        kimi_canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        self.command("systemctl", "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"; [ \"$2\" = is-active ] && exit 1; exit 0")
        self.command("systemd-run", "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"")
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=kimi_canary, GEM_EVENTS=self.events,
                         LINEAR_API_KEY="linear-secret", LINEAR_API_URL=self.linear_url()),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        self.assertEqual(events[0], "systemctl --user stop symphony-ui-pilot.service symphony-lyb.service")
        self.assertTrue(any(line.startswith("systemd-run") for line in events), events)
        self.assertIn("codex_exhausted", result.stderr)
        self.assertNotIn("codex_not_exhausted", result.stderr)

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
            "systemctl --user start symphony-ui-pilot.service symphony-lyb.service",
            "systemctl --user is-active --quiet symphony-ui-pilot.service symphony-lyb.service",
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
        self.assertEqual(events[0], "systemctl --user stop symphony-ui-pilot.service symphony-lyb.service")
        self.assertEqual(len([line for line in events if line.startswith("systemd-run")]), 2)
        self.assertTrue(any("grok-ship-LYB-3" in line for line in events))
        self.assertFalse(any("grok-ship-JOV-4" in line or "grok-ship-LYB-5" in line for line in events))
        self.assertNotIn("linear-secret", result.stdout + result.stderr + self.events.read_text())
        self.assertIn("first: 20", LinearHandler.requests[0][1])
        self.assertIn("labels { nodes { name } }", LinearHandler.requests[0][1])

    def test_default_grok_limit_is_four_and_blocked_labels_are_gates(self):
        module = self.load_controller_module()
        self.assertEqual(module.DEFAULT_GROK_MAX, 4)
        self.assertEqual(module.MAX_GROK_MAX, 10)
        self.assertIn("blocked", module.BLOCKED_ADMISSION_LABELS)
        self.assertIn("needs-human", module.BLOCKED_ADMISSION_LABELS)
        self.assertIn("needs:human", module.BLOCKED_ADMISSION_LABELS)
        # admission_decision is one predicate shared front-to-back.
        ok, _reason = module.admission_decision(
            "JOV", "JOV-1", {"symphony", "plan-approved", "admission-approved"}
        )
        self.assertTrue(ok)
        ok, reason = module.admission_decision(
            "JOV", "JOV-1",
            {"symphony", "plan-approved", "admission-approved", "blocked", "needs-human"},
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "blocked")

    def test_check_admission_verdicts_match_single_predicate(self):
        url = self.linear_url()
        LinearHandler.single_issue_labels = {
            "JOV-1": ["symphony", "plan-approved", "admission-approved", "needs-human"]
        }
        admitted = self.run_controller("check-admission", "JOV-2",
                                       LINEAR_API_KEY="linear-secret", LINEAR_API_URL=url)
        self.assertEqual(admitted.returncode, 0, admitted.stderr)
        meta = json.loads(admitted.stdout)
        self.assertEqual(meta["in_progress_state_id"], "JOV-progress")
        self.assertEqual(meta["in_review_state_id"], "JOV-review")
        # JOV-1 was flagged needs-human AFTER listing -> rejected by the SAME gate.
        blocked = self.run_controller("check-admission", "JOV-1",
                                      LINEAR_API_KEY="linear-secret", LINEAR_API_URL=url)
        self.assertEqual(blocked.returncode, 1)
        self.assertIn("not admitted:blocked", blocked.stderr)
        # JOV-4 carries needs:human and is missing required admission labels.
        missing = self.run_controller("check-admission", "JOV-4",
                                      LINEAR_API_KEY="linear-secret", LINEAR_API_URL=url)
        self.assertEqual(missing.returncode, 1)
        self.assertIn("not admitted", missing.stderr)

    def test_reconcile_skips_issue_flag_as_not_admitted_between_list_and_launch(self):
        # The list query sees candidates as admitted, but the launch-time re-check
        # (via single_issue_labels) finds blocked/needs-human added by a guard.
        self.command("codex-rotate", "exit 1")
        self.command("systemctl", 'if [ "$2" = is-active ]; then exit 1; fi; exit 0')
        self.command("systemd-run", "printf 'systemd-run %s\\n' \"$*\"")
        url = self.linear_url()
        LinearHandler.single_issue_labels = {
            "JOV-1": ["symphony", "plan-approved", "admission-approved", "blocked", "needs-human"],
            "JOV-2": ["symphony", "plan-approved", "admission-approved", "blocked", "needs-human"],
            "LYB-3": ["symphony", "plan-approved", "admission-approved", "blocked", "needs-human"],
        }
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate", GEM_EVENTS=self.events,
                         LINEAR_API_KEY="linear-secret", LINEAR_API_URL=url),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("not admitted", result.stderr)
        events = self.events.read_text() if self.events.exists() else ""
        self.assertNotIn("systemd-run", events)

    def test_reconcile_respects_active_grok_concurrency_cap(self):
        self.command("codex-rotate", "exit 1")
        self.command(
            "systemctl",
            'if [ "$2" = list-units ]; then\n'
            "  printf 'grok-ship-JOV-1.service loaded active running\\n'\n"
            "  printf 'grok-ship-JOV-2.service loaded active running\\n'\n"
            "  printf 'grok-ship-JOV-4.service loaded active running\\n'\n"
            "  exit 0\n"
            "fi\n"
            'if [ "$2" = is-active ]; then [ "$4" = grok-ship-JOV-2 ] && exit 0; exit 1; fi\n'
            "exit 0",
        )
        self.command("systemd-run", "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"")
        url = self.linear_url()
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate", GEM_EVENTS=self.events,
                         LINEAR_API_KEY="linear-secret", LINEAR_API_URL=url,
                         SYMPHONY_GROK_MAX="5"),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.events.exists(), result.stderr)
        launches = [line for line in self.events.read_text().splitlines() if line.startswith("systemd-run")]
        # 5 limit - 3 already-active grok ships = at most 2 more.
        self.assertEqual(len(launches), 2)

    def test_managed_grok_worker_routes_jov_and_lyb_and_updates_team_states(self):
        created = self.root / "pr-created"
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n',
        )
        self.command(
            "gh",
            '[ ! -f "$GROK_CREATED" ] && echo 0 || echo 1\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        destination = self.install_runtime()
        linear_url = self.grok_linear_url()
        workspace = self.root / "workspaces"
        logs = self.root / "logs"
        for identifier, repository in (("JOV-7", "JovieInc/Jovie"), ("LYB-8", "JovieInc/LogYourBody")):
            created.unlink(missing_ok=True)
            result = subprocess.run(
                [destination / GROK_SHIP.name, identifier],
                capture_output=True,
                text=True,
                env=self.env(
                    GEM_EVENTS=self.events,
                    GROK_CREATED=created,
                    GROK_SHIP_WS_ROOT=workspace,
                    GROK_SHIP_LOG_DIR=logs,
                    LINEAR_API_KEY="linear-secret",
                    LINEAR_API_URL=linear_url,
                ),
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f"git clone --depth 1 https://github.com/{repository}.git", self.events.read_text())
            self.assertIn(f"--cwd {workspace / identifier.split('-', 1)[0] / identifier}", self.events.read_text())
        mutations = [request["variables"]["input"]["stateId"] for request in GrokLinearHandler.requests if "issueUpdate" in request["query"]]
        self.assertEqual(mutations, ["JOV-progress", "JOV-review", "LYB-progress", "LYB-review"])

    def test_grok_ship_one_delegates_admission_and_respects_blocked(self):
        # grok-ship-one must not keep its own copy of the admission predicate:
        # it delegates to the controller's check-admission. A blocked/needs-human
        # issue is refused before any workspace/grok activity.
        created = self.root / "pr-created"
        self.command("git", 'printf "git %s\\n" "$*" >> "$GEM_EVENTS"')
        self.command("gh", "echo 0")
        self.command("grok", 'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"')
        destination = self.install_runtime()
        url = self.grok_linear_url()
        GrokLinearHandler.labels = {
            "JOV-9": ["symphony", "plan-approved", "admission-approved", "blocked", "needs-human"]
        }
        result = subprocess.run(
            [destination / GROK_SHIP.name, "JOV-9"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=url,
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("issue is not admitted", result.stderr)
        self.assertIn("not admitted", (self.root / "logs/JOV-9.log").read_text())
        events = self.events.read_text() if self.events.exists() else ""
        self.assertNotIn("git clone", events)
        self.assertNotIn("grok -", events)

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

    def test_legacy_three_artifact_release_upgrades_atomically(self):
        destination = self.root / "legacy-three"
        release = destination / ".symphony-codex-auth-fallback/releases/legacy"
        release.mkdir(parents=True)
        for source in (WRAPPER, CONTROLLER, SIDECAR):
            for target in (release / source.name, destination / source.name):
                target.write_bytes(source.read_bytes())
                target.chmod(0o755)
        (destination / ".symphony-codex-auth-fallback/current").symlink_to("releases/legacy")
        result = self.run_install(destination)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_complete_install(destination)

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
