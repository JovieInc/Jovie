#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import base64
import fcntl
import hashlib
import http.server
import importlib.machinery
import importlib.util
import io
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/symphony"
CONTROLLER = SOURCE_DIR / "symphony-codex-exhausted.py"
WRAPPER = SOURCE_DIR / "symphony-codex-exhausted"
SIDECAR = SOURCE_DIR / "symphony-grok-sidecar"
GROK_SHIP = SOURCE_DIR / "grok-ship-one"
CURSOR_STD = SOURCE_DIR / "cursor-agent-std"
MODEL_ROUTER = SOURCE_DIR / "model-router.py"
MODEL_REGISTRY = SOURCE_DIR / "config/model-registry.json"
RUNTIME_ARTIFACTS = (WRAPPER, CONTROLLER, SIDECAR, GROK_SHIP, CURSOR_STD, MODEL_ROUTER, MODEL_REGISTRY)
RUNTIME_NAMES = tuple(path.name for path in RUNTIME_ARTIFACTS)
LAUNCHER_NAMES = (WRAPPER.name, CONTROLLER.name, SIDECAR.name, GROK_SHIP.name, CURSOR_STD.name)


def _load_python_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class OfficialServiceOwnershipContract(unittest.TestCase):
    def test_recovery_targets_only_official_elixir_service(self):
        module = _load_python_module("symphony_codex_exhausted", CONTROLLER)
        official = _load_python_module(
            "symphony_official_runtime", SOURCE_DIR / "symphony_official_runtime.py"
        )
        self.assertEqual(module.PRIMARY_SERVICE, official.OFFICIAL_SERVICE_NAME)
        self.assertEqual(module.PRIMARY_SERVICE, "symphony-elixir.service")
        self.assertEqual(module.OPTIONAL_SERVICES, ())
        self.assertNotIn("symphony-ui-pilot.service", module.SERVICES)
        self.assertNotIn("symphony-lyb.service", module.SERVICES)
        for obsolete in official.OBSOLETE_TOKENS:
            if obsolete.endswith(".service"):
                self.assertNotIn(obsolete, module.SERVICES)


OWNERSHIP_COVERAGE_MARKERS = (
    'PRIMARY_SERVICE = "symphony-elixir.service"',
    "OPTIONAL_SERVICES: tuple[str, ...] = ()",
    "SERVICES = (PRIMARY_SERVICE, *OPTIONAL_SERVICES)",
)


def required_ownership_coverage_lines() -> set[int]:
    source_lines = CONTROLLER.read_text(encoding="utf-8").splitlines()
    required: set[int] = set()
    for marker in OWNERSHIP_COVERAGE_MARKERS:
        matches = [index for index, line in enumerate(source_lines, start=1) if marker in line]
        if len(matches) != 1:
            raise AssertionError(
                f"expected one official Symphony ownership marker {marker!r}, found {len(matches)}"
            )
        required.add(matches[0])
    return required


def verify_official_service_coverage(report_path: pathlib.Path) -> None:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    relative_controller = CONTROLLER.relative_to(ROOT).as_posix()
    file_coverage = report.get("files", {}).get(relative_controller)
    if not file_coverage:
        raise AssertionError(f"coverage report missing {relative_controller}")
    executed = set(file_coverage.get("executed_lines", []))
    missing = required_ownership_coverage_lines() - executed
    if missing:
        raise AssertionError(f"uncovered official Symphony ownership lines: {sorted(missing)}")


class OfficialServiceCoverageContract(unittest.TestCase):
    def test_accepts_exact_ownership_line_coverage(self):
        with tempfile.TemporaryDirectory() as directory:
            report_path = pathlib.Path(directory) / "coverage.json"
            report_path.write_text(
                json.dumps(
                    {
                        "files": {
                            CONTROLLER.relative_to(ROOT).as_posix(): {
                                "executed_lines": sorted(required_ownership_coverage_lines())
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            verify_official_service_coverage(report_path)

    def test_rejects_missing_ownership_line_coverage(self):
        required = required_ownership_coverage_lines()
        with tempfile.TemporaryDirectory() as directory:
            report_path = pathlib.Path(directory) / "coverage.json"
            report_path.write_text(
                json.dumps(
                    {
                        "files": {
                            CONTROLLER.relative_to(ROOT).as_posix(): {
                                "executed_lines": sorted(required - {max(required)})
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                AssertionError, "uncovered official Symphony ownership lines"
            ):
                verify_official_service_coverage(report_path)


def issue_revision(identifier, title="", description=""):
    canonical = f"{identifier}\n{title.strip()}\n{description.strip()}"
    return hashlib.sha256(canonical.encode()).hexdigest()[:24]


def admission_comment(identifier, title="", description="", *, stale=False):
    revision = "0" * 24 if stale else issue_revision(identifier, title, description)
    payload = {
        "schema": "admission-gate/v1",
        "issue": identifier,
        "issueRevision": revision,
        "fingerprint": "a" * 24,
        "decision": "approved",
    }
    return (
        "<!-- admission-gate/v1 -->\n"
        + json.dumps(payload)
        + "\n<!--/admission-gate-->"
    )


class LinearHandler(http.server.BaseHTTPRequestHandler):
    requests: list[tuple[str | None, str]] = []
    nodes = [
        {
            "identifier": identifier,
            "title": f"Ship {identifier}",
            "description": "Bounded admitted work.",
            "team": {"key": identifier.split("-", 1)[0]},
            "state": {"name": "Todo"},
            "labels": {"nodes": [{"name": name} for name in labels]},
            "comments": {
                "nodes": (
                    []
                    if blocked
                    else [
                        {
                            "body": admission_comment(
                                identifier,
                                f"Ship {identifier}",
                                "Bounded admitted work.",
                            )
                        }
                    ]
                )
            },
        }
        for identifier, labels, blocked in (
            ("JOV-1", ("symphony", "plan-approved", "admission-approved"), False),
            ("JOV-2", (), False),
            ("LYB-3", ("symphony",), False),
            ("JOV-4", ("symphony", "needs:human"), True),
            ("LYB-5", ("symphony", "hold"), True),
        )
    ]
    # Override for single-issue admission re-checks (simulates a label guard
    # flagging an issue AFTER the reconcile list query observed it as admitted).
    single_issue_labels: dict[str, list[str]] = {}
    pages: list[list[dict]] | None = None
    list_responses: list[dict] | None = None

    @classmethod
    def _paged_issues(cls, body: str) -> dict:
        after = None
        try:
            parsed = json.loads(body)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict):
            variables = parsed.get("variables")
            if isinstance(variables, dict):
                after = variables.get("after")
        pages = cls.pages if cls.pages is not None else [cls.nodes]
        if after is None:
            index = 0
        else:
            prefix = "cursor-"
            if not isinstance(after, str) or not after.startswith(prefix):
                return {"data": {"issues": {}}}
            try:
                index = int(after[len(prefix):]) + 1
            except ValueError:
                return {"data": {"issues": {}}}
        if index >= len(pages):
            return {
                "data": {
                    "issues": {
                        "nodes": [],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    }
                }
            }
        has_next = index + 1 < len(pages)
        return {
            "data": {
                "issues": {
                    "nodes": pages[index],
                    "pageInfo": {
                        "hasNextPage": has_next,
                        "endCursor": f"cursor-{index}" if has_next else None,
                    },
                }
            }
        }

    def do_POST(self):  # noqa: N802 - stdlib handler API
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        self.__class__.requests.append((self.headers.get("Authorization"), body))
        if "issues(" in body:
            responses = self.__class__.list_responses
            if responses is not None:
                payload = responses.pop(0) if responses else {"errors": [{"message": "empty"}]}
            else:
                payload = self._paged_issues(body)
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
                            "title": node.get("title") or f"Ship {identifier}",
                            "description": node.get("description") or "Bounded admitted work.",
                            "url": f"https://linear.example/{identifier}",
                            "updatedAt": "2026-08-14T19:00:00Z",
                            "state": node.get("state")
                            if isinstance(node.get("state"), dict)
                            and isinstance(node.get("state", {}).get("name"), str)
                            else {"id": f"{team}-todo", "name": "Todo"},
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
                            "comments": node.get("comments") or {"nodes": []},
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
    omit_receipt: set[str] = set()
    states: dict[str, str] = {}

    def do_POST(self):  # noqa: N802 - stdlib handler API
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.__class__.requests.append(payload)
        if "issueUpdate" in payload["query"]:
            response = {"data": {"issueUpdate": {"success": True}}}
        else:
            identifier = payload["variables"]["id"]
            team = identifier.split("-", 1)[0]
            title = f"Ship {identifier}"
            description = "Bounded admitted work."
            labels = self.__class__.labels.get(identifier) or []
            comments = (
                []
                if (
                    "needs-human" in labels
                    or "blocked" in labels
                    or identifier in self.__class__.omit_receipt
                )
                else [{"body": admission_comment(identifier, title, description)}]
            )
            response = {
                "data": {
                    "issue": {
                        "id": f"uuid-{identifier}",
                        "identifier": identifier,
                        "title": title,
                        "description": description,
                        "url": f"https://linear.example/{identifier}",
                        "updatedAt": "2026-08-14T19:00:00Z",
                        "state": {
                            "id": f"{team}-state",
                            "name": self.__class__.states.get(identifier) or "Todo",
                        },
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
                        "comments": {"nodes": comments},
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
        self.command("grok", "printf 'GROK_MODEL_READY\\n'")
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo "[]";;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[]}\';;\n'
            '  *) echo 0;;\n'
            'esac\n',
        )
        self.model_probe = self.command("model-probe", "echo qwen3-coder:30b")
        self.model_agent = self.command("model-agent", "exit 0")
        self.command("flock", "exit 0")
        self.gate = self.root / "fleet-gate.json"
        self.gate.write_text(json.dumps({
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "closureAdmission": {"newIssueIntakeAllowed": True},
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
            "remediationAdmission": {"allowed": True, "pushAllowed": True},
        }))
        self.environment = mock.patch.dict(os.environ, {
            "SYMPHONY_OPEN_PR_INDEX": "empty",
            "GEM_FLEET_GATE_RECEIPT": str(self.gate),
            "GEM_PR_DRAIN_QWEN": str(self.model_probe),
            "GEM_QWEN_AGENT_EXECUTABLE": str(self.model_agent),
            "GEM_CURSOR_EXECUTABLE": "/missing",
            "GEM_KIMI_EXECUTABLE": "/missing",
            "GEM_GROK_EXECUTABLE": "/missing",
            "GEM_CLAUDE_EXECUTABLE": "/missing",
            "GEM_DEEPSEEK_EXECUTABLE": "/missing",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.state = self.root / "state.json"
        self.state.write_text(json.dumps({"active": None, "cooldowns": {"jovie": 1}, "last_error": {}}))
        for account in ("jovie", "meetjovie"):
            account_dir = self.root / account
            account_dir.mkdir()
            (account_dir / "auth.json").write_text("{}\n")
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
            "GEM_GROK_CANARY_TIMEOUT_SECONDS": "1.0",
            "SYMPHONY_GROK_SURVIVAL_SECONDS": "0.01",
            "GEM_FLEET_GATE_RECEIPT": str(self.gate),
            "GEM_PR_DRAIN_QWEN": str(self.model_probe),
            "GEM_QWEN_AGENT_EXECUTABLE": str(self.model_agent),
            "GEM_CURSOR_EXECUTABLE": "/missing",
            "GEM_KIMI_EXECUTABLE": "/missing",
            "GEM_GROK_EXECUTABLE": "/missing",
            "GEM_CLAUDE_EXECUTABLE": "/missing",
            "GEM_DEEPSEEK_EXECUTABLE": "/missing",
            "SYMPHONY_FALLBACK_SELECTION_B64": base64.b64encode(json.dumps({
                "schema_version": 1,
                "deterministic_first": True,
                "selected": {
                    "id": "grok-composer-2.5-fast",
                    "provider": "grok",
                    "model": "grok-composer-2.5-fast",
                    "executor": {
                        "executable": str(self.bin / "grok"),
                        "argv": ["--always-approve", "--cwd", "{cwd}", "-p", "{prompt}"],
                    },
                },
            }).encode()).decode(),
            "SYMPHONY_FALLBACK_ISSUE_REVISION": "2026-08-14T19:00:00Z",
            "SYMPHONY_FALLBACK_BUNDLE_REVISION": "a" * 64,
            "SYMPHONY_FALLBACK_UNIT": "fallback-ship-JOV-7-3247073049db",
            "SYMPHONY_FALLBACK_LEASE_DIR": str(self.root / "fallback-leases"),
            "SYMPHONY_FALLBACK_RECEIPT_DIR": str(self.root / "fallback-receipts"),
        })
        env.update({key: str(value) for key, value in overrides.items()})
        return env

    def command(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\nset -eu\n" + textwrap.dedent(body))
        path.chmod(0o755)
        return path

    def test_grok_ship_gateway_boundary_rejects_forbidden_families(self):
        executor = self.command("gateway-executor", "touch \"$GEM_EXECUTED\"\n")
        executed = self.root / "gateway-executed"
        for family, model in (
            ("gpt-5.6", "openai/gpt-5.6-sol"),
            ("claude", "anthropic/claude-opus-4.8"),
            ("kimi", "moonshotai/kimi-k3"),
            ("gpt-5.6", "zai/glm-5.3-flash"),
        ):
            with self.subTest(family=family):
                selection = {
                    "schema_version": 1,
                    "deterministic_first": True,
                    "selected": {
                        "id": f"gateway-{family}",
                        "provider": "vercel-ai-gateway",
                        "model": model,
                        "family": family,
                        "channel": "api",
                        "executor": {
                            "executable": str(executor),
                            "argv": ["{prompt}"],
                        },
                    },
                }
                result = subprocess.run(
                    [GROK_SHIP, "JOV-7"],
                    capture_output=True,
                    text=True,
                    env=self.env(
                        GEM_EXECUTED=executed,
                        LINEAR_API_KEY="unused",
                        GROK_SHIP_WS_ROOT=self.root / "workspaces",
                        GROK_SHIP_LOG_DIR=self.root / "logs",
                        SYMPHONY_FALLBACK_SELECTION_B64=base64.b64encode(
                            json.dumps(selection).encode()
                        ).decode(),
                    ),
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("invalid router selection", result.stderr)
                self.assertFalse(executed.exists())

    def set_all_accounts_cooldown(self):
        future = int(time.time()) + 3600
        self.state.write_text(json.dumps({
            "active": None,
            "cooldowns": {"jovie": future, "meetjovie": future},
            "last_error": {},
        }))

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
            source = source_dir / name
            if name == MODEL_REGISTRY.name and not source.is_file():
                source = source_dir / "config" / name
            self.assertEqual((release / name).read_bytes(), source.read_bytes())
            if name in LAUNCHER_NAMES:
                self.assertTrue((destination / name).is_file())
                self.assertEqual(stat.S_IMODE((destination / name).stat().st_mode), 0o755)
                self.assertNotEqual((destination / name).read_bytes(), (source_dir / name).read_bytes())

    def distinct_source(self, label):
        source = self.root / f"source-{label}"
        source.mkdir()
        for path in RUNTIME_ARTIFACTS:
            target = source / path.name
            suffix = b"\n" if path == MODEL_REGISTRY else f"\n# {label}-{path.name}\n".encode()
            target.write_bytes(path.read_bytes() + suffix)
            target.chmod(path.stat().st_mode)
        return source / CONTROLLER.name

    def linear_url(self):
        LinearHandler.requests = []
        LinearHandler.single_issue_labels = {}
        LinearHandler.pages = None
        LinearHandler.list_responses = None
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LinearHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return f"http://127.0.0.1:{server.server_port}/graphql"

    def grok_linear_url(self):
        GrokLinearHandler.requests = []
        GrokLinearHandler.labels = {}
        GrokLinearHandler.omit_receipt = set()
        GrokLinearHandler.states = {}
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
        self.set_all_accounts_cooldown()
        kimi_canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        result = self.run_controller(GEM_CODEX_ROTATE_BIN=kimi_canary)
        self.assertEqual((result.stdout, result.returncode), ("yes\n", 0))

    def test_kimi_fallback_cannot_mask_cooldown_exhaustion_in_sidecar(self):
        self.set_all_accounts_cooldown()
        kimi_canary = self.command("codex-rotate", "echo GEM_MODEL_READY")
        self.command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"\n"
            "if [ \"$2\" = list-units ]; then\n"
            "  while read -r unit; do printf '%s loaded active running\\n' \"$unit\"; done < \"$GEM_ACTIVE_UNITS\" 2>/dev/null || true\n"
            "  exit 0\n"
            "fi\n"
            "if [ \"$2\" = is-active ]; then\n"
            "  unit=$4\n"
            "  grep -q \"^$unit$\" \"$GEM_ACTIVE_UNITS\" 2>/dev/null\n"
            "  exit $?\n"
            "fi\n"
            "exit 0",
        )
        self.command(
            "systemd-run",
            "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"\n"
            "for arg in \"$@\"; do case \"$arg\" in --unit=*) printf '%s\\n' \"${arg#--unit=}\" >> \"$GEM_ACTIVE_UNITS\";; esac; done",
        )
        active_units = self.root / "active-units"
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=kimi_canary, GEM_EVENTS=self.events,
                         GEM_ACTIVE_UNITS=active_units,
                         LINEAR_API_KEY="linear-secret", LINEAR_API_URL=self.linear_url()),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        launch_index = next(i for i, line in enumerate(events) if line.startswith("systemd-run"))
        self.assertNotIn(
            "systemctl --user stop symphony-elixir.service symphony-lyb.service",
            events,
        )
        self.assertGreaterEqual(launch_index, 0, events)
        self.assertIn("codex_exhausted", result.stderr)
        self.assertNotIn("codex_not_exhausted", result.stderr)

    def test_indeterminate_readiness_never_mutates_runtime_services(self):
        module = self.load_controller_module()

        for reason in (
            "unknown_state",
            "executable_missing",
            "probe_failed",
            "missing_ready_evidence",
        ):
            controls: list[list[str]] = []
            with self.subTest(reason=reason):
                with (
                    mock.patch.object(
                        module,
                        "codex_canary_ready",
                        return_value=(False, reason),
                    ),
                    mock.patch.object(
                        module,
                        "_control",
                        side_effect=lambda command: controls.append(command) or True,
                    ),
                ):
                    self.assertEqual(module.reconcile(), 2)
                self.assertEqual(controls, [])

    def test_actual_indeterminate_probe_paths_never_mutate_runtime_services(self):
        module = self.load_controller_module()
        rotate = self.command("codex-rotate", "echo GEM_MODEL_READY")

        cases = (
            ("unknown_state", None, rotate),
            ("executable_missing", {"active": None, "cooldowns": {}, "last_error": {}}, self.root / "missing"),
            ("probe_failed", {"active": None, "cooldowns": {}, "last_error": {}}, self.command("probe-failed", "exit 1")),
            ("missing_ready_evidence", {"active": None, "cooldowns": {}, "last_error": {}}, self.command("wrong-marker", "echo not-ready")),
        )
        for reason, state, executable in cases:
            controls: list[list[str]] = []
            with self.subTest(reason=reason):
                if state is None:
                    self.state.unlink(missing_ok=True)
                else:
                    self.state.write_text(json.dumps(state))
                stderr = io.StringIO()
                with (
                    mock.patch.dict(
                        os.environ,
                        self.env(
                            GEM_CODEX_ROTATE_BIN=executable,
                            GEM_CODEX_CANARY_TIMEOUT_SECONDS="5",
                        ),
                        clear=True,
                    ),
                    mock.patch.object(
                        module,
                        "_control",
                        side_effect=lambda command: controls.append(command) or True,
                    ),
                    contextlib.redirect_stderr(stderr),
                ):
                    self.assertEqual(module.reconcile(), 2)
                self.assertEqual(controls, [])
                self.assertIn(f"codex_readiness_indeterminate {reason}", stderr.getvalue())

        slow = self.command("probe-timeout", "sleep 1; echo GEM_MODEL_READY")
        self.state.write_text(json.dumps({"active": None, "cooldowns": {}, "last_error": {}}))
        controls = []
        stderr = io.StringIO()
        with (
            mock.patch.dict(
                os.environ,
                self.env(
                    GEM_CODEX_ROTATE_BIN=slow,
                    GEM_CODEX_CANARY_TIMEOUT_SECONDS="0.05",
                ),
                clear=True,
            ),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
            contextlib.redirect_stderr(stderr),
        ):
            self.assertEqual(module.reconcile(), 2)
        self.assertEqual(controls, [])
        self.assertIn("codex_readiness_indeterminate probe_failed", stderr.getvalue())

    def test_cooldown_handoff_requires_every_configured_account(self):
        module = self.load_controller_module()
        future = int(time.time()) + 3600
        canary = self.command("codex-rotate", "echo GEM_MODEL_READY")

        for cooldowns in (
            {"jovie": future},
            {"jovie": future, "meetjovie": "not-a-timestamp"},
        ):
            with self.subTest(cooldowns=cooldowns):
                self.state.write_text(json.dumps({
                    "active": None,
                    "cooldowns": cooldowns,
                    "last_error": {},
                }))
                with mock.patch.dict(
                    os.environ,
                    self.env(GEM_CODEX_ROTATE_BIN=canary),
                    clear=True,
                ):
                    self.assertEqual(module.codex_canary_ready(), (True, "ready"))

    def test_exhausted_handoff_proves_fallback_before_stopping_symphony(self):
        module = self.load_controller_module()

        cases = (
            ("grok_executable_missing", None, ["JOV-1"], []),
            ("linear_query_failed", "/bin/true", None, []),
            ("grok_state_query_failed", "/bin/true", ["JOV-1"], None),
            ("no_admitted_work", "/bin/true", [], []),
        )
        for expected, executable, identifiers, active in cases:
            controls: list[list[str]] = []
            with self.subTest(expected=expected):
                with (
                    mock.patch.object(
                        module,
                        "codex_canary_ready",
                        return_value=(False, "all_accounts_cooldown"),
                    ),
                    mock.patch.object(
                        module,
                        "_grok_ship_one_executable",
                        return_value=executable,
                    ),
                    mock.patch.object(
                        module,
                        "_linear_identifiers",
                        return_value=identifiers,
                    ),
                    mock.patch.object(
                        module,
                        "_active_grok_units",
                        return_value=active,
                    ),
                    mock.patch.object(
                        module,
                        "_control",
                        side_effect=lambda command: controls.append(command) or True,
                    ),
                ):
                    expected_rc = 0 if expected == "no_admitted_work" else 2
                    self.assertEqual(module.reconcile(), expected_rc)
                if expected == "no_admitted_work":
                    # Stopped JOV must be restored even when Linear has no
                    # sidecar-admitted issues; leaving it down is a permanent hold.
                    self.assertTrue(
                        any(
                            command[:4] == ["systemctl", "--user", "is-active", "--quiet"]
                            and "symphony-elixir.service" in command
                            for command in controls
                        ),
                        controls,
                    )
                else:
                    self.assertEqual(controls, [])

    def test_exhausted_no_admitted_work_starts_stopped_jov(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        jov_started = {"value": False}

        def control(command):
            controls.append(command)
            if command[:3] == ["systemctl", "--user", "start"] and module.PRIMARY_SERVICE in command:
                jov_started["value"] = True
                return True
            if (
                command[:4] == ["systemctl", "--user", "is-active", "--quiet"]
                and module.PRIMARY_SERVICE in command
            ):
                return jov_started["value"]
            return True

        with (
            mock.patch.object(
                module,
                "codex_canary_ready",
                return_value=(False, "all_accounts_cooldown"),
            ),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=[]),
            mock.patch.object(module, "_active_grok_units", return_value=[]),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            self.assertEqual(module.reconcile(), 0)
        self.assertTrue(jov_started["value"], controls)
        self.assertIn(
            ["systemctl", "--user", "start", module.PRIMARY_SERVICE],
            controls,
        )

    def test_model_router_failure_preserves_symphony(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_active_grok_units", return_value=[]),
            mock.patch.object(module, "_model_router_selection", return_value=(None, "model_router_failed")),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)
        self.assertEqual(controls, [])

    def test_targeted_drain_launches_only_the_exact_eligible_issue(self):
        module = self.load_controller_module()
        captured: dict[str, object] = {}
        selection = {"selected": {"id": "kimi-k3", "pool": "kimi"}}
        def launch(identifiers, active, executable, bundle_revision, selected, limit, **kwargs):
            captured.update(
                identifiers=identifiers,
                active=active,
                executable=executable,
                bundle_revision=bundle_revision,
                selection=selected,
                limit=limit,
            )
            providers = kwargs.get("unit_providers")
            if isinstance(providers, dict):
                providers["fallback-ship-JOV-2.service"] = "kimi"
            return {"fallback-ship-JOV-2.service"}, 1
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(
                module,
                "_admitted_or_remount_identifiers",
                return_value=["JOV-1", "JOV-2", "JOV-3"],
            ),
            mock.patch.object(
                module, "_model_router_selection", return_value=(selection, "ready")
            ),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(module, "_grok_limit", return_value=7),
            mock.patch.object(module, "_launch_fallback_workers", side_effect=launch),
        ):
            result = module._drain_included_pools([], "JOV-2")
        self.assertEqual(captured["identifiers"], ["JOV-2"])
        self.assertEqual(captured["limit"], 1)
        self.assertEqual(
            result,
            "drain_started=1 pool=kimi model=kimi-k3 grok_started=0 kimi_started=1",
        )
    def test_targeted_drain_refuses_absent_issue_before_provider_probe(self):
        module = self.load_controller_module()
        selection = mock.Mock(return_value=({"selected": {}}, "ready"))
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-1"]
            ),
            mock.patch.object(module, "_model_router_selection", selection),
        ):
            result = module._drain_included_pools([], "JOV-2")
        self.assertEqual(result, "drain_skipped=target_not_eligible:JOV-2")
        selection.assert_not_called()
    def test_targeted_drain_refuses_when_another_worker_owns_capacity(self):
        module = self.load_controller_module()
        selection = {"selected": {"id": "kimi-k3", "pool": "kimi"}}
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-2"]
            ),
            mock.patch.object(
                module, "_model_router_selection", return_value=(selection, "ready")
            ),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(
                module,
                "_launch_fallback_workers",
                return_value=(set(), 1),
            ),
        ):
            result = module._drain_included_pools(
                ["fallback-ship-JOV-1-aaaaaaaaaaaa.service"], "JOV-2"
            )
        self.assertEqual(result, "drain_skipped=target_not_started:JOV-2")
    def test_ready_targeted_reconcile_fails_when_exact_issue_does_not_start(self):
        module = self.load_controller_module()
        stderr = io.StringIO()
        with (
            mock.patch.object(module, "gc_fallback_locks"),
            mock.patch.object(module, "codex_canary_ready", return_value=(True, "ready")),
            mock.patch.object(module, "_active_grok_units", return_value=[]),
            mock.patch.object(module, "_start_jov_primary", return_value=True),
            mock.patch.object(module, "_services_active", return_value=True),
            mock.patch.object(
                module,
                "_drain_included_pools",
                return_value="drain_skipped=target_not_started:JOV-2",
            ),
            contextlib.redirect_stderr(stderr),
        ):
            result = module.reconcile("JOV-2")
        self.assertEqual(result, module.EXIT_SAFE_FAIL_CLOSED)
        self.assertIn("target=JOV-2", stderr.getvalue())
    def test_ready_targeted_reconcile_refuses_any_preexisting_fallback_worker(self):
        module = self.load_controller_module()
        start_primary = mock.Mock(return_value=True)
        drain = mock.Mock(return_value="drain_started=1 pool=kimi model=kimi-k3")
        stderr = io.StringIO()
        with (
            mock.patch.object(module, "gc_fallback_locks"),
            mock.patch.object(module, "codex_canary_ready", return_value=(True, "ready")),
            mock.patch.object(
                module,
                "_active_grok_units",
                return_value=["fallback-ship-JOV-1-aaaaaaaaaaaa.service"],
            ),
            mock.patch.object(module, "_start_jov_primary", start_primary),
            mock.patch.object(module, "_drain_included_pools", drain),
            contextlib.redirect_stderr(stderr),
        ):
            result = module.reconcile("JOV-2")
        self.assertEqual(result, module.EXIT_SAFE_FAIL_CLOSED)
        self.assertIn("target_not_started=JOV-2 grok_ship_active", stderr.getvalue())
        start_primary.assert_not_called()
        drain.assert_not_called()
    def test_ready_targeted_reconcile_succeeds_only_on_exact_start(self):
        module = self.load_controller_module()
        target_unit = "fallback-ship-JOV-2-aaaaaaaaaaaa.service"
        stderr = io.StringIO()
        def drain(_active, _target, launched):
            launched.add(target_unit)
            return "drain_started=1 pool=kimi model=kimi-k3"
        with (
            mock.patch.object(module, "gc_fallback_locks"),
            mock.patch.object(module, "codex_canary_ready", return_value=(True, "ready")),
            mock.patch.object(module, "_active_grok_units", return_value=[]),
            mock.patch.object(module, "_start_jov_primary", return_value=True),
            mock.patch.object(module, "_services_active", return_value=True),
            mock.patch.object(
                module,
                "_drain_included_pools",
                side_effect=drain,
            ),
            mock.patch.object(
                module, "_grok_units_after_survival_window", return_value=[target_unit]
            ),
            contextlib.redirect_stderr(stderr),
        ):
            result = module.reconcile("JOV-2")
        self.assertEqual(result, 0)
        self.assertIn("drain_started=1 pool=kimi model=kimi-k3", stderr.getvalue())

    def test_ready_targeted_reconcile_cleans_up_transient_exact_start(self):
        module = self.load_controller_module()
        target_unit = "fallback-ship-JOV-2-aaaaaaaaaaaa.service"
        controls: list[list[str]] = []
        stderr = io.StringIO()
        def drain(_active, _target, launched):
            launched.add(target_unit)
            return "drain_started=1 pool=kimi model=kimi-k3"
        with (
            mock.patch.object(module, "gc_fallback_locks"),
            mock.patch.object(module, "codex_canary_ready", return_value=(True, "ready")),
            mock.patch.object(module, "_active_grok_units", return_value=[]),
            mock.patch.object(module, "_start_jov_primary", return_value=True),
            mock.patch.object(module, "_services_active", return_value=True),
            mock.patch.object(module, "_drain_included_pools", side_effect=drain),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[]),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
            contextlib.redirect_stderr(stderr),
        ):
            result = module.reconcile("JOV-2")
        self.assertEqual(result, module.EXIT_SAFE_FAIL_CLOSED)
        self.assertIn("target_not_survived=JOV-2", stderr.getvalue())
        self.assertIn(
            ["systemctl", "--user", "stop", target_unit],
            controls,
        )

    def test_untargeted_drain_preserves_existing_capacity_and_issue_set(self):
        module = self.load_controller_module()
        captured: dict[str, object] = {}
        selection = {"selected": {"id": "grok-4.6", "pool": "grok-build"}}
        def launch(identifiers, active, executable, bundle_revision, selected, limit, **kwargs):
            captured.update(identifiers=identifiers, limit=limit)
            providers = kwargs.get("unit_providers")
            if isinstance(providers, dict):
                providers["fallback-ship-JOV-1.service"] = "grok"
            return {"fallback-ship-JOV-1.service"}, 1
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(
                module,
                "_admitted_or_remount_identifiers",
                return_value=["JOV-1", "JOV-2"],
            ),
            mock.patch.object(
                module, "_model_router_selection", return_value=(selection, "ready")
            ),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(module, "_grok_limit", return_value=4),
            mock.patch.object(module, "_kimi_limit", return_value=0),
            mock.patch.object(module, "_launch_fallback_workers", side_effect=launch),
        ):
            module._drain_included_pools([])
        self.assertEqual(captured["identifiers"], ["JOV-1", "JOV-2"])
        self.assertEqual(captured["limit"], 4)

    def test_exhausted_target_refuses_absent_issue_without_touching_runtime(self):
        module = self.load_controller_module()
        active = mock.Mock(return_value=[])
        selection = mock.Mock(return_value=({"selected": {}}, "ready"))
        stderr = io.StringIO()
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-1"]
            ),
            mock.patch.object(module, "_active_grok_units", active),
            mock.patch.object(module, "_model_router_selection", selection),
            contextlib.redirect_stderr(stderr),
        ):
            result = module._continue_exhausted_reconcile(
                "all_accounts_cooldown", "JOV-2"
            )
        self.assertEqual(result, module.EXIT_SAFE_FAIL_CLOSED)
        self.assertIn(
            "target_not_eligible=JOV-2 symphony_unchanged", stderr.getvalue()
        )
        active.assert_not_called()
        selection.assert_not_called()

    def test_exhausted_target_refuses_when_unrelated_worker_owns_capacity(self):
        module = self.load_controller_module()
        final_active = mock.Mock()
        stderr = io.StringIO()
        selection = {"selected": {"id": "kimi-k3", "pool": "kimi"}}
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-2"]
            ),
            mock.patch.object(
                module,
                "_active_grok_units",
                side_effect=[
                    ["fallback-ship-JOV-1-aaaaaaaaaaaa.service"],
                    final_active,
                ],
            ) as active,
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(
                module, "_model_router_selection", return_value=(selection, "ready")
            ),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(
                module, "_launch_fallback_workers", return_value=(set(), 1)
            ),
            contextlib.redirect_stderr(stderr),
        ):
            result = module._continue_exhausted_reconcile(
                "all_accounts_cooldown", "JOV-2"
            )
        self.assertEqual(result, module.EXIT_SAFE_FAIL_CLOSED)
        self.assertIn(
            "target_not_started=JOV-2 symphony_unchanged", stderr.getvalue()
        )
        self.assertEqual(active.call_count, 1)

    def test_exhausted_target_succeeds_only_when_exact_unit_survives(self):
        module = self.load_controller_module()
        target_unit = "fallback-ship-JOV-2-aaaaaaaaaaaa.service"
        stderr = io.StringIO()
        selection = {"selected": {"id": "kimi-k3", "pool": "kimi"}}
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-2"]
            ),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], [target_unit]]),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(module, "_model_router_selection", return_value=(selection, "ready")),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(module, "_launch_fallback_workers", return_value=({target_unit}, 1)),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[target_unit]),
            mock.patch.object(module, "_jov_active", return_value=True),
            contextlib.redirect_stderr(stderr),
        ):
            result = module._continue_exhausted_reconcile("all_accounts_cooldown", "JOV-2")
        self.assertEqual(result, 0)
        self.assertIn("grok_started=0 kimi_started=1", stderr.getvalue())
        self.assertIn("grok_survived=1", stderr.getvalue())

    def test_exhausted_target_fails_if_survivor_set_is_not_exact(self):
        module = self.load_controller_module()
        target_unit = "fallback-ship-JOV-2-aaaaaaaaaaaa.service"
        unrelated_unit = "fallback-ship-JOV-1-bbbbbbbbbbbb.service"
        controls: list[list[str]] = []
        stderr = io.StringIO()
        selection = {"selected": {"id": "kimi-k3", "pool": "kimi"}}
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-2"]
            ),
            mock.patch.object(
                module,
                "_active_grok_units",
                side_effect=[[], [unrelated_unit], [unrelated_unit]],
            ),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(module, "_model_router_selection", return_value=(selection, "ready")),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(module, "_launch_fallback_workers", return_value=({target_unit}, 1)),
            mock.patch.object(
                module,
                "_grok_units_after_survival_window",
                return_value=[target_unit, unrelated_unit],
            ),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
            mock.patch.object(module, "_jov_active", return_value=True),
            contextlib.redirect_stderr(stderr),
        ):
            result = module._continue_exhausted_reconcile("all_accounts_cooldown", "JOV-2")
        self.assertEqual(result, module.EXIT_SAFE_FAIL_CLOSED)
        self.assertIn(
            "target_not_survived=JOV-2 symphony_active", stderr.getvalue()
        )
        self.assertIn(["systemctl", "--user", "stop", target_unit], controls)

    def test_exhausted_target_not_survived_reports_restore_failure(self):
        module = self.load_controller_module()
        target_unit = "fallback-ship-JOV-2-aaaaaaaaaaaa.service"
        unrelated_unit = "fallback-ship-JOV-1-bbbbbbbbbbbb.service"
        stderr = io.StringIO()
        selection = {"selected": {"id": "kimi-k3", "pool": "kimi"}}
        with (
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(
                module, "_admitted_or_remount_identifiers", return_value=["JOV-2"]
            ),
            mock.patch.object(
                module, "_active_grok_units", side_effect=[[], [unrelated_unit]]
            ),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "green")),
            mock.patch.object(
                module, "_model_router_selection", return_value=(selection, "ready")
            ),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(
                module, "_launch_fallback_workers", return_value=({target_unit}, 1)
            ),
            mock.patch.object(
                module,
                "_grok_units_after_survival_window",
                return_value=[unrelated_unit],
            ),
            mock.patch.object(module, "_cleanup_launched_units", return_value=True),
            mock.patch.object(module, "_jov_active", return_value=False),
            mock.patch.object(module, "_start_jov_primary", return_value=False),
            contextlib.redirect_stderr(stderr),
        ):
            result = module._continue_exhausted_reconcile(
                "all_accounts_cooldown", "JOV-2"
            )

        self.assertEqual(result, module.EXIT_DEGRADED)
        self.assertIn(
            "target_not_survived=JOV-2 symphony_api_restore_failed",
            stderr.getvalue(),
        )

    def test_non_finite_grok_durations_fall_back_to_safe_defaults(self):
        module = self.load_controller_module()
        cases = (
            (
                "GEM_GROK_CANARY_TIMEOUT_SECONDS",
                module.DEFAULT_GROK_CANARY_TIMEOUT_SECONDS,
                module.MAX_GROK_CANARY_TIMEOUT_SECONDS,
            ),
            (
                "SYMPHONY_GROK_SURVIVAL_SECONDS",
                module.DEFAULT_GROK_SURVIVAL_SECONDS,
                module.MAX_GROK_SURVIVAL_SECONDS,
            ),
        )
        for name, default, maximum in cases:
            for value in ("NaN", "inf", "-inf"):
                with self.subTest(name=name, value=value):
                    with mock.patch.dict(os.environ, {name: value}):
                        self.assertEqual(
                            module._bounded_seconds(name, default, maximum),
                            default,
                        )

    def test_model_router_selection_is_proven_before_symphony_stops(self):
        module = self.load_controller_module()
        events: list[str] = []

        selection = {
            "schema_version": 1,
            "deterministic_first": True,
            "selected": {
                "id": "qwen-coder-local",
                "provider": "ollama",
                "model": "qwen3-coder:30b",
                "executor": {"executable": "/bin/true", "argv": ["{prompt}"]},
            },
        }

        def select(*_args, **_kwargs):
            events.append("model-router")
            return selection, "model_router_ready"

        def control(command):
            events.append(" ".join(command))
            return True

        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], []]),
            mock.patch.object(module, "_model_router_selection", side_effect=select),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(False, "blocked", None)),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)

        self.assertIn("model-router", events)
        self.assertNotIn("systemctl --user stop symphony-elixir.service symphony-lyb.service", events)

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
        result = subprocess.run([destination / "symphony-grok-sidecar"], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=canary, GEM_EVENTS=self.events, GEM_CODEX_CANARY_TIMEOUT_SECONDS="5"), check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text().splitlines(), [
            "systemctl --user list-units --type=service --state=active grok-ship-*.service kimi-ship-*.service fallback-ship-*.service --no-legend --no-pager",
            "systemctl --user start symphony-elixir.service",
            "systemctl --user is-active --quiet symphony-elixir.service",
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
        self.command(
            "systemctl",
            """
            case "$*" in
              *list-units*)
                printf 'grok-ship-JOV-1.service loaded active running\\n'
                ;;
            esac
            exit 0
            """,
        )
        destination = self.install_runtime()
        result = subprocess.run([destination / "symphony-grok-sidecar"], capture_output=True, text=True, env=self.env(GEM_CODEX_ROTATE_BIN=canary), check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("recovery_deferred", result.stderr)

    def test_exhausted_recovery_stops_symphony_and_bounds_grok_launches(self):
        self.set_all_accounts_cooldown()
        self.command("codex-rotate", "exit 1")
        self.command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"\n"
            "if [ \"$2\" = list-units ]; then printf 'grok-ship-JOV-2.service loaded active running\\n'; fi\n"
            "exit 0",
        )
        self.command("systemd-run", "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"")
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"], capture_output=True, text=True,
            env=self.env(GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate", GEM_EVENTS=self.events,
                         LINEAR_API_KEY="linear-secret", LINEAR_API_URL=self.linear_url()), check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        first_launch = next(i for i, line in enumerate(events) if line.startswith("systemd-run"))
        self.assertGreaterEqual(first_launch, 0, events)
        self.assertNotIn(
            "systemctl --user stop symphony-elixir.service symphony-lyb.service",
            events,
        )
        self.assertEqual(len([line for line in events if line.startswith("systemd-run")]), 2)
        self.assertTrue(any("fallback-ship-LYB-3" in line for line in events))
        self.assertFalse(any("fallback-ship-JOV-4" in line or "fallback-ship-LYB-5" in line for line in events))
        self.assertNotIn("linear-secret", result.stdout + result.stderr + self.events.read_text())
        request_body = LinearHandler.requests[0][1]
        self.assertIn("labels { nodes { name } }", request_body)
        self.assertIn("pageInfo", request_body)
        self.assertIn("hasNextPage", request_body)
        self.assertNotIn("first: 20", request_body)

    def _issue_node(self, identifier, *labels, receipt=None, title=None, description=None, state="Todo"):
        title = title if title is not None else f"Ship {identifier}"
        description = description if description is not None else "Bounded admitted work."
        blocked = any(
            label.lower() in {"needs:human", "needs-human", "hold", "blocked", "human-review-required"}
            for label in labels
        )
        include_receipt = receipt if receipt is not None else not blocked
        comments = []
        if include_receipt:
            comments.append(
                {
                    "body": admission_comment(identifier, title, description)
                    if include_receipt is True
                    else include_receipt
                }
            )
        return {
            "identifier": identifier,
            "title": title,
            "description": description,
            "state": {"name": state},
            "team": {"key": identifier.split("-", 1)[0]},
            "labels": {"nodes": [{"name": name} for name in labels]},
            "comments": {"nodes": comments},
        }

    def test_linear_identifiers_paginates_until_no_next_page(self):
        module = self.load_controller_module()
        url = self.linear_url()
        LinearHandler.pages = [
            [
                self._issue_node("JOV-21", "symphony"),
                self._issue_node("JOV-22", "symphony", "needs:human"),
            ],
            [
                self._issue_node("LYB-23", "symphony"),
                self._issue_node("JOV-24", "symphony", "hold"),
                self._issue_node("JOV-25", "symphony"),
            ],
        ]
        with mock.patch.dict(os.environ, {"LINEAR_API_KEY": "linear-secret", "LINEAR_API_URL": url}):
            identifiers = module._linear_identifiers()
        self.assertEqual(identifiers, ["JOV-21", "LYB-23", "JOV-25"])
        self.assertEqual(len(LinearHandler.requests), 2)
        first = json.loads(LinearHandler.requests[0][1])
        second = json.loads(LinearHandler.requests[1][1])
        self.assertEqual(first["query"], module.LINEAR_QUERY)
        self.assertEqual(second["query"], module.LINEAR_QUERY)
        self.assertEqual(first["variables"]["first"], module.LINEAR_PAGE_SIZE)
        self.assertNotIn("after", first["variables"])
        self.assertEqual(second["variables"]["after"], "cursor-0")
        self.assertGreater(module.LINEAR_PAGE_SIZE, 20)
        self.assertNotIn("first: 20", first["query"])
        self.assertNotIn('labels: { name: { eq: "symphony" } }', first["query"])
        self.assertIn('"In Review"', first["query"])
        self.assertIn("state { name }", first["query"])
        self.assertEqual(module.REQUIRED_ADMISSION_LABELS, frozenset())

    def test_linear_identifiers_continues_in_review_without_receipt(self):
        """Live :4041 retrying In Review issues after #16212 emptied receipts."""
        module = self.load_controller_module()
        url = self.linear_url()
        LinearHandler.pages = [
            [
                self._issue_node("JOV-5015", "symphony", receipt=False, state="In Review"),
                self._issue_node("JOV-5000", "symphony", receipt=False, state="Todo"),
                self._issue_node(
                    "JOV-4998", "symphony", "blocked", receipt=False, state="In Review"
                ),
            ]
        ]
        with mock.patch.dict(os.environ, {"LINEAR_API_KEY": "linear-secret", "LINEAR_API_URL": url}):
            identifiers = module._linear_identifiers()
        self.assertEqual(identifiers, ["JOV-5015"])

    def test_launch_continues_in_review_head_without_receipt(self):
        module = self.load_controller_module()
        launches: list[list[str]] = []
        issue = self._admitted_issue("JOV-5015", "In Review")
        issue["comments"] = {"nodes": []}
        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_fetch_single_issue", return_value=issue),
            mock.patch.object(
                module, "_control", side_effect=lambda command: launches.append(command) or True
            ),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5015"],
                [],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        self.assertEqual(used, 1)
        self.assertEqual(len(launched), 1)
        self.assertTrue(any("JOV-5015" in arg for command in launches for arg in command), launches)

    def test_check_admission_continues_in_review_without_receipt(self):
        url = self.linear_url()
        original_nodes = LinearHandler.nodes
        LinearHandler.nodes = [
            self._issue_node("JOV-5015", "symphony", receipt=False, state="In Review")
        ]
        self.addCleanup(lambda: setattr(LinearHandler, "nodes", original_nodes))
        result = self.run_controller(
            "check-admission",
            "JOV-5015",
            LINEAR_API_KEY="linear-secret",
            LINEAR_API_URL=url,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["original_state_name"], "In Review")

    def test_linear_identifiers_fails_closed_on_malformed_page_info(self):
        module = self.load_controller_module()
        url = self.linear_url()
        LinearHandler.list_responses = [
            {
                "data": {
                    "issues": {
                        "nodes": [self._issue_node("JOV-21", "symphony")],
                        "pageInfo": {"hasNextPage": True, "endCursor": "cursor-0"},
                    }
                }
            },
            {
                "data": {
                    "issues": {
                        "nodes": [self._issue_node("JOV-22", "symphony")],
                    }
                }
            },
        ]
        with mock.patch.dict(os.environ, {"LINEAR_API_KEY": "linear-secret", "LINEAR_API_URL": url}):
            self.assertIsNone(module._linear_identifiers())
        self.assertEqual(len(LinearHandler.requests), 2)

    def test_grok_limit_autoscales_from_live_oauth_seats_not_codex(self):
        module = self.load_controller_module()
        with tempfile.TemporaryDirectory() as tmp:
            home = pathlib.Path(tmp)
            grok = home / ".grok"
            grok.mkdir()
            (grok / "auth.json").write_text(
                json.dumps(
                    {
                        "https://auth.x.ai::one": {
                            "auth_mode": "oidc",
                            "refresh_token": "rt",
                            "key": "k",
                        }
                    }
                ),
                encoding="utf-8",
            )
            kimi = home / ".kimi-code" / "credentials"
            kimi.mkdir(parents=True)
            (kimi / "kimi-code.json").write_text(
                json.dumps({"access_token": "at", "refresh_token": "rt"}),
                encoding="utf-8",
            )
            with mock.patch.object(module.pathlib.Path, "home", return_value=home):
                with mock.patch.dict(os.environ):
                    os.environ.pop("SYMPHONY_GROK_MAX", None)
                    self.assertEqual(module._live_oauth_seats(), 2)
                    self.assertEqual(module._grok_limit(), 4)
                extra = {
                    f"https://auth.x.ai::{index}": {
                        "auth_mode": "oidc",
                        "refresh_token": "rt",
                        "key": "k",
                    }
                    for index in range(6)
                }
                (grok / "auth.json").write_text(json.dumps(extra), encoding="utf-8")
                with mock.patch.dict(os.environ):
                    os.environ.pop("SYMPHONY_GROK_MAX", None)
                    self.assertEqual(module._live_oauth_seats(), 7)
                    self.assertEqual(module._grok_limit(), 7)
                with mock.patch.dict(os.environ, {"SYMPHONY_GROK_MAX": "0"}):
                    self.assertEqual(module._grok_limit(), 0)

    def test_default_grok_limit_is_four_and_blocked_labels_are_gates(self):
        module = self.load_controller_module()
        self.assertEqual(module.DEFAULT_GROK_MAX, 4)
        self.assertEqual(module.MAX_GROK_MAX, 10)
        self.assertEqual(module.DEFAULT_KIMI_MAX, 4)
        self.assertEqual(module.MAX_KIMI_MAX, 10)
        self.assertIn("blocked", module.BLOCKED_ADMISSION_LABELS)
        self.assertIn("needs-human", module.BLOCKED_ADMISSION_LABELS)
        self.assertIn("needs:human", module.BLOCKED_ADMISSION_LABELS)
        self.assertIn("no-symphony", module.BLOCKED_ADMISSION_LABELS)
        for label in ("held", "decision-required", "manual-incident"):
            self.assertIn(label, module.BLOCKED_ADMISSION_LABELS)
        # admission_decision is one predicate shared front-to-back.
        comment = admission_comment("JOV-1", "Ship JOV-1", "Bounded admitted work.")
        ok, _reason = module.admission_decision(
            "JOV",
            "JOV-1",
            set(),
            title="Ship JOV-1",
            description="Bounded admitted work.",
            comments=[{"body": comment}],
        )
        self.assertTrue(ok)
        ok, reason = module.admission_decision(
            "JOV",
            "JOV-1",
            {"blocked", "needs-human"},
            title="Ship JOV-1",
            description="Bounded admitted work.",
            comments=[{"body": comment}],
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "blocked")
        for label in ("held", "decision-required", "manual-incident"):
            ok, reason = module.admission_decision(
                "JOV",
                "JOV-1",
                {label},
                title="Ship JOV-1",
                description="Bounded admitted work.",
                comments=[{"body": comment}],
            )
            self.assertFalse(ok)
            self.assertEqual(reason, "blocked")
        labels_only, reason = module.admission_decision(
            "JOV",
            "JOV-2",
            {"symphony", "plan-approved", "admission-approved"},
            title="Ship JOV-2",
            description="Bounded admitted work.",
            comments=[],
        )
        self.assertFalse(labels_only)
        self.assertEqual(reason, "admission_receipt_missing_or_stale")

    def test_admission_receipt_stale_and_revoked_fail_closed(self):
        module = self.load_controller_module()
        title = "Ship JOV-9"
        description = "Bounded admitted work."
        stale = admission_comment("JOV-9", title, description, stale=True)
        ok, reason = module.admission_decision(
            "JOV",
            "JOV-9",
            set(),
            title=title,
            description=description,
            comments=[{"body": stale}],
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "admission_receipt_missing_or_stale")
        current = admission_comment("JOV-9", title, description)
        ok, reason = module.admission_decision(
            "JOV",
            "JOV-9",
            {"human-review-required"},
            title=title,
            description=description,
            comments=[{"body": current}],
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "blocked")
        recovered, reason = module.admission_decision(
            "JOV",
            "JOV-9",
            set(),
            title=title,
            description=description,
            comments=[{"body": current}],
        )
        self.assertTrue(recovered, reason)

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
        self.set_all_accounts_cooldown()
        self.command("codex-rotate", "exit 1")
        self.command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"\n"
            'if [ "$2" = is-active ]; then case "$*" in *symphony-*.service*) exit 0;; *) exit 1;; esac; fi\n'
            "exit 0",
        )
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
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("not admitted", result.stderr)
        events = self.events.read_text() if self.events.exists() else ""
        self.assertNotIn("systemd-run", events)
        self.assertNotIn("systemctl --user stop", events)
        self.assertIn("systemctl --user start symphony-elixir.service", events)
        self.assertIn("symphony_restored", result.stderr)

    def test_zero_grok_capacity_preserves_symphony(self):
        self.set_all_accounts_cooldown()
        self.command("codex-rotate", "exit 1")
        self.command(
            "systemctl",
            "printf 'systemctl %s\\n' \"$*\" >> \"$GEM_EVENTS\"\n"
            'if [ "$2" = is-active ]; then exit 1; fi\n'
            "exit 0",
        )
        self.command("systemd-run", "printf 'systemd-run %s\\n' \"$*\" >> \"$GEM_EVENTS\"")
        result = subprocess.run(
            [self.install_runtime() / "symphony-grok-sidecar"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_CODEX_ROTATE_BIN=self.bin / "codex-rotate",
                GEM_EVENTS=self.events,
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.linear_url(),
                SYMPHONY_GROK_MAX="0",
                SYMPHONY_KIMI_MAX="0",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 2, result.stderr)
        events = self.events.read_text()
        self.assertNotIn("systemd-run", events)
        self.assertNotIn("systemctl --user stop", events)
        self.assertIn("grok_capacity_zero symphony_unchanged", result.stderr)

    def test_grok_max_does_not_steal_kimi_chairs(self):
        module = self.load_controller_module()
        launches: list[str] = []
        grok_selection = {
            "schema_version": 1,
            "deterministic_first": True,
            "selected": {
                "id": "grok-4.6",
                "provider": "grok",
                "pool": "grok-build",
                "model": "grok-4.6",
                "executor": {"executable": "/bin/true", "argv": ["-p", "{prompt}"]},
            },
        }
        kimi_selection = {
            "schema_version": 1,
            "deterministic_first": True,
            "selected": {
                "id": "kimi-k3",
                "provider": "kimi",
                "pool": "kimi",
                "model": "kimi-code/k3",
                "executor": {"executable": "/bin/true", "argv": ["-p", "{prompt}"]},
            },
        }
        issue = {
            "identifier": "JOV-5869",
            "title": "CI repair failing checks",
            "description": "create-bounded-ci-repair-pr",
            "team": {"key": "JOV"},
            "labels": {"nodes": [{"name": "symphony"}]},
            "state": {"name": "In Review"},
        }

        def router(workflow="new_pr", include_ids=()):
            if "kimi-k3" in include_ids:
                return kimi_selection, "model_router_ready"
            if "grok-4.6" in include_ids:
                return grok_selection, "model_router_ready"
            return grok_selection, "model_router_ready"

        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_fetch_single_issue", return_value=issue),
            mock.patch.object(
                module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "rev"}),
            ),
            mock.patch.object(module, "_model_router_selection", side_effect=router),
            mock.patch.object(module, "_grok_limit", return_value=0),
            mock.patch.object(module, "_kimi_limit", return_value=2),
            mock.patch.dict(
                os.environ,
                {"SYMPHONY_GROK_OAUTH_SEATS": "0", "SYMPHONY_KIMI_OAUTH_SEATS": "2"},
            ),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: launches.append(command) or True,
            ),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5869"],
                ["grok-ship-JOV-1.service", "grok-ship-JOV-2.service"],
                "/bin/true",
                "a" * 64,
                grok_selection,
                4,
                selections={"grok": grok_selection, "kimi": kimi_selection},
            )
        self.assertEqual(len(launched), 1)
        self.assertEqual(used, 3)
        self.assertTrue(
            any("SYMPHONY_FALLBACK_PROVIDER=kimi" in arg for command in launches for arg in command),
            launches,
        )

    def test_live_oauth_probe_caps_kimi_seats_without_touching_grok_max(self):
        module = self.load_controller_module()
        kimi = self.command(
            "kimi",
            "printf '%s\\n' "
            "'{\"models\":{\"kimi-code/k3\":{}},\"concurrency\":2}'\n",
        )
        with mock.patch.dict(
            os.environ,
            {
                "SYMPHONY_OAUTH_SEATS_PROBE": "1",
                "SYMPHONY_GROK_MAX": "8",
                "SYMPHONY_KIMI_MAX": "8",
                "GEM_KIMI_EXECUTABLE": str(kimi),
                "GEM_GROK_EXECUTABLE": "/missing",
            },
            clear=False,
        ):
            self.assertEqual(module._provider_seat_limit("kimi"), 2)
            self.assertEqual(module._provider_seat_limit("grok"), 8)

    def test_reconcile_respects_active_grok_concurrency_cap(self):
        self.set_all_accounts_cooldown()
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
                         SYMPHONY_GROK_MAX="5", SYMPHONY_KIMI_MAX="0"),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.events.exists(), result.stderr)
        launches = [line for line in self.events.read_text().splitlines() if line.startswith("systemd-run")]
        # Only LYB-3 is both admitted and absent from the three active units.
        self.assertEqual(len(launches), 1)

    def test_delayed_grok_activation_reserves_capacity_and_restores_symphony(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        identifiers = [f"JOV-{index}" for index in range(1, 7)]
        issue = {
            "identifier": "placeholder",
            "team": {"key": "JOV"},
            "labels": {"nodes": []},
            "state": {"name": "Todo"},
        }

        def control(command):
            controls.append(command)
            return True

        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=identifiers),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], [], []]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_grok_limit", return_value=2),
            mock.patch.object(module, "_kimi_limit", return_value=0),
            mock.patch.object(module, "_fetch_single_issue", return_value=issue),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            self.assertEqual(module.reconcile(), 2)

        launches = [command for command in controls if command[0] == "systemd-run"]
        self.assertEqual(len(launches), 2)
        first_launch = next(i for i, command in enumerate(controls) if command[0] == "systemd-run")
        restore_index = next(i for i, command in enumerate(controls) if "start" in command)
        cleanup_index = next(
            i for i, command in enumerate(controls)
            if command[:3] == ["systemctl", "--user", "stop"]
            and any(str(item).startswith("fallback-ship-") for item in command)
        )
        self.assertLess(first_launch, cleanup_index)
        self.assertLess(cleanup_index, restore_index)
        self.assertFalse(
            any(
                command[:3] == ["systemctl", "--user", "stop"]
                and "symphony-elixir.service" in command
                for command in controls
            )
        )

    def test_grok_worker_collapse_during_survival_window_restores_symphony(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        unit = module._fallback_unit("JOV-1", "2026-08-14T19:00:00Z") + ".service"
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], [unit], []]),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[]),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)

        cleanup_index = next(
            index
            for index, command in enumerate(controls)
            if command[:3] == ["systemctl", "--user", "stop"] and unit in command
        )
        restore_index = next(
            index
            for index, command in enumerate(controls)
            if command[:3] == ["systemctl", "--user", "start"]
        )
        self.assertLess(cleanup_index, restore_index)

    def test_collected_collapsed_worker_restores_when_stop_reports_not_loaded(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        unit = module._fallback_unit("JOV-1", "2026-08-14T19:00:00Z") + ".service"

        def control(command):
            controls.append(command)
            if command[:3] == ["systemctl", "--user", "stop"] and unit in command:
                return False
            return True

        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], [unit], []]),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[]),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(module, "_unit_not_loaded", return_value=True),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)

        self.assertTrue(
            any(command[:3] == ["systemctl", "--user", "start"] for command in controls)
        )

    def test_cleanup_failure_with_loaded_worker_never_restarts_symphony(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        unit = module._fallback_unit("JOV-1", "2026-08-14T19:00:00Z") + ".service"

        def control(command):
            controls.append(command)
            if command[:3] == ["systemctl", "--user", "stop"] and unit in command:
                return False
            return True

        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], [unit]]),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[]),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(module, "_unit_not_loaded", return_value=False),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_DEGRADED)

        self.assertFalse(
            any(command[:3] == ["systemctl", "--user", "start"] for command in controls)
        )

    def test_grok_worker_must_survive_window_before_handoff_succeeds(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        unit = module._fallback_unit("JOV-1", "2026-08-14T19:00:00Z") + ".service"
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], [unit]]),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[unit]),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
        ):
            self.assertEqual(module.reconcile(), 0)

        self.assertFalse(
            any(command[:3] == ["systemctl", "--user", "start"] for command in controls)
        )

    def test_vanished_fallback_is_rechecked_before_handoff_completes(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=[]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(
                module,
                "_active_grok_units",
                side_effect=[["grok-ship-JOV-1.service"], []],
            ),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
        ):
            self.assertEqual(module.reconcile(), 2)

        self.assertTrue(any("start" in command for command in controls))
        self.assertFalse(
            any(
                command[:3] == ["systemctl", "--user", "stop"]
                and "symphony-elixir.service" in command
                for command in controls
            )
        )

    def test_unknown_final_grok_state_never_restarts_competing_owner(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], None]),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_DEGRADED)

        self.assertTrue(any(command[0] == "systemd-run" for command in controls))
        self.assertFalse(any("start" in command for command in controls))
        self.assertFalse(
            any(
                command[:3] == ["systemctl", "--user", "stop"]
                and "symphony-elixir.service" in command
                for command in controls
            )
        )

    def test_delayed_unit_seen_after_cleanup_blocks_primary_restore(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(
                module,
                "_active_grok_units",
                side_effect=[[], [], ["grok-ship-JOV-1.service"]],
            ),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_DEGRADED)

        self.assertTrue(any(command[0] == "systemd-run" for command in controls))
        self.assertFalse(any("start" in command for command in controls))

    def test_restore_jov_even_when_lyb_is_down(self):
        module = self.load_controller_module()
        controls: list[list[str]] = []

        def control(command):
            controls.append(command)
            if "is-active" in command and "symphony-lyb.service" in command:
                return False
            return True

        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
            mock.patch.object(module, "_active_grok_units", side_effect=[[], []]),
            mock.patch.object(module, "_fetch_single_issue", return_value={}),
            mock.patch.object(module, "_issue_meta", return_value=(False, "blocked", None)),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)

        self.assertTrue(
            any(
                "is-active" in command and "symphony-elixir.service" in command
                for command in controls
            ),
            controls,
        )
        self.assertFalse(
            any(
                "is-active" in command and "symphony-lyb.service" in command
                for command in controls
            ),
            controls,
        )

    def test_managed_grok_worker_routes_jov_and_lyb_and_updates_team_states(self):
        created = self.root / "pr-created"
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";; esac\n',
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
                    SYMPHONY_FALLBACK_UNIT=f"fallback-ship-{identifier}-3247073049db",
                    LINEAR_API_KEY="linear-secret",
                    LINEAR_API_URL=linear_url,
                ),
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f"git clone --depth 1 https://github.com/{repository}.git", self.events.read_text())
            self.assertIn(f"--cwd {workspace / identifier.split('-', 1)[0] / identifier}", self.events.read_text())
            receipt = json.loads((self.root / "fallback-receipts" / f"{identifier}.json").read_text())
            self.assertEqual(receipt["schema"], "symphony-fallback-lease/v1")
            self.assertEqual(receipt["issueRevision"], "2026-08-14T19:00:00Z")
            self.assertEqual(receipt["baseRevision"], "b" * 40)
            self.assertEqual(receipt["bundleRevision"], "a" * 64)
            self.assertEqual(receipt["ownership"], "isolated-implementation-only")
            expected_unit = self.load_controller_module()._fallback_unit(identifier, receipt["issueRevision"])
            self.assertEqual(receipt["unit"], expected_unit)
            self.assertIn("deploy", receipt["forbidden"])
        mutations = [request["variables"]["input"]["stateId"] for request in GrokLinearHandler.requests if "issueUpdate" in request["query"]]
        self.assertEqual(mutations, ["JOV-progress", "JOV-review", "LYB-progress", "LYB-review"])

    def test_red_fleet_gate_blocks_fallback_before_workspace_or_provider(self):
        self.command("git", 'printf "git %s\\n" "$*" >> "$GEM_EVENTS"')
        self.command("gh", "echo 0")
        self.command("grok", 'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"')
        red = self.root / "red-gate.json"
        red.write_text(json.dumps({
            "schema": "jovie-fleet-gate/v1",
            "state": "RED",
            "workAdmission": {"allowed": False},
        }))
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GEM_FLEET_GATE_RECEIPT=red,
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
            ),
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("fleet gate blocks isolated work", result.stderr)
        self.assertFalse(self.events.exists())

    def test_closure_stop_line_blocks_new_fallback_before_workspace_or_provider(self):
        self.command("git", 'printf "git %s\\n" "$*" >> "$GEM_EVENTS"')
        self.command("gh", "echo 0")
        self.command("grok", 'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"')
        self.gate.write_text(json.dumps({
            "schema": "jovie-fleet-gate/v1",
            "state": "GREEN",
            "closureAdmission": {"newIssueIntakeAllowed": False},
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": False},
            "remediationAdmission": {"allowed": True, "pushAllowed": True},
        }))

        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
            ),
            check=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Summer closure stop-line blocks new fallback work", result.stderr)
        self.assertFalse(self.events.exists())

    def test_revision_scoped_unit_names_prevent_same_revision_duplicates(self):
        module = self.load_controller_module()
        first = module._fallback_unit("JOV-1", "revision-a")
        self.assertEqual(first, module._fallback_unit("JOV-1", "revision-a"))
        self.assertNotEqual(first, module._fallback_unit("JOV-1", "revision-b"))
        self.assertTrue(first.startswith("fallback-ship-JOV-1-"))

    def _admitted_issue(self, identifier="JOV-1", state="Todo"):
        team = identifier.split("-", 1)[0]
        title = f"Ship {identifier}"
        description = ""
        return {
            "id": f"uuid-{identifier}",
            "identifier": identifier,
            "title": title,
            "description": description,
            "url": f"https://linear.example/{identifier}",
            "updatedAt": "2026-08-19T18:46:00Z",
            "state": {"id": f"{team}-state", "name": state},
            "team": {
                "key": team,
                "states": {
                    "nodes": [
                        {"id": f"{team}-progress", "name": "In Progress"},
                        {"id": f"{team}-review", "name": "In Review"},
                    ]
                },
            },
            "labels": {"nodes": [{"name": "symphony"}]},
            "comments": {
                "nodes": [{"body": admission_comment(identifier, title, description)}]
            },
        }

    def test_in_review_is_admitted_so_ci_red_heads_can_remount(self):
        module = self.load_controller_module()
        ok, reason, meta = module._issue_meta(
            self._admitted_issue("JOV-4894", "In Review"), "JOV-4894"
        )
        self.assertTrue(ok, reason)
        self.assertEqual(meta["original_state_name"], "In Review")

    def test_open_pr_verdict_skips_inflight_and_remounts_failure(self):
        module = self.load_controller_module()
        index = {
            "JOV-1": {"number": 16211, "head": "grok/JOV-1-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "BLOCKED"},
            "JOV-2": {"number": 16212, "head": "grok/JOV-2-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "BLOCKED"},
            "JOV-4": {"number": 16214, "head": "grok/JOV-4-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "CLEAN"},
            "JOV-5": {"number": 16211, "head": "grok/JOV-5-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "DIRTY"},
        }
        with (
            mock.patch.object(module, "_pr_has_failing_check", side_effect=lambda repo, number: number in (16212, 16214)),
            mock.patch.object(module, "_pr_has_product_failure_tombstone", return_value=False),
        ):
            self.assertEqual(module._open_pr_verdict("JOV-1", index)[0], "skip")
            self.assertEqual(module._open_pr_verdict("JOV-2", index)[0], "remount")
            self.assertEqual(module._open_pr_verdict("JOV-3", index)[0], "none")
            self.assertEqual(module._open_pr_verdict("JOV-4", index)[0], "skip")
            self.assertEqual(module._open_pr_verdict("JOV-5", index)[0], "remount")
        conflicting = {
            "JOV-6": {
                "number": 16229,
                "head": "fallback/JOV-5220-fix",
                "repo": "JovieInc/Jovie",
                "mergeStateStatus": "UNKNOWN",
                "mergeable": "CONFLICTING",
            }
        }
        self.assertEqual(module._open_pr_verdict("JOV-6", conflicting)[0], "remount")

    def test_open_pr_verdict_remounts_clean_head_with_product_failure_tombstone(self):
        # Live #16420: merge-group-only product failure (iOS build, full unit
        # shards) leaves the head source-CLEAN while drain-pr-queue.sh
        # tombstones it; the enrollment guard refuses re-admission. The sidecar
        # must remount for real remediation instead of skipping forever.
        module = self.load_controller_module()
        index = {
            "JOV-1": {"number": 16420, "head": "grok/JOV-1-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "CLEAN"},
        }
        tombstoned = {
            "statusCheckRollup": [
                {"name": "ci-fast", "conclusion": "SUCCESS", "status": "COMPLETED"},
                {
                    "context": "jovie-queue-product-failure/v1",
                    "state": "SUCCESS",
                    "description": "blocked:merge-group-product-failure",
                },
            ]
        }
        with mock.patch.object(module, "_gh_json", return_value=tombstoned):
            self.assertEqual(module._open_pr_verdict("JOV-1", index)[0], "remount")

    def test_open_pr_verdict_skips_clean_head_without_tombstone(self):
        module = self.load_controller_module()
        index = {
            "JOV-1": {"number": 16420, "head": "grok/JOV-1-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "CLEAN"},
        }
        with mock.patch.object(module, "_gh_json", return_value={"statusCheckRollup": []}):
            self.assertEqual(module._open_pr_verdict("JOV-1", index)[0], "skip")
        # A rollup fetch failure must not remount a merge-queue-eligible head.
        with mock.patch.object(module, "_gh_json", return_value=None):
            self.assertEqual(module._open_pr_verdict("JOV-1", index)[0], "skip")

    def test_open_pr_verdict_dirty_head_never_fetches_checks(self):
        module = self.load_controller_module()
        index = {
            "JOV-2": {"number": 16211, "head": "grok/JOV-2-fix", "repo": "JovieInc/Jovie", "mergeStateStatus": "DIRTY"},
        }
        with (
            mock.patch.object(module, "_pr_has_failing_check", side_effect=AssertionError("must not fetch")),
            mock.patch.object(module, "_pr_has_product_failure_tombstone", side_effect=AssertionError("must not fetch")),
        ):
            self.assertEqual(module._open_pr_verdict("JOV-2", index)[0], "remount")

    def test_product_failure_tombstone_matches_status_and_check_run_shapes(self):
        module = self.load_controller_module()
        check_run_shape = {
            "statusCheckRollup": [
                {
                    "name": "jovie-queue-product-failure/v1",
                    "status": "COMPLETED",
                    "conclusion": "SUCCESS",
                    "text": "blocked:merge-group-product-failure",
                },
            ]
        }
        with mock.patch.object(module, "_gh_json", return_value=check_run_shape):
            self.assertTrue(module._pr_has_product_failure_tombstone("JovieInc/Jovie", 16420))

    def test_product_failure_tombstone_ignores_near_misses(self):
        module = self.load_controller_module()
        near_misses = {
            "statusCheckRollup": [
                # Right context, but no blocked: description.
                {"context": "jovie-queue-product-failure/v1", "state": "SUCCESS", "description": "merge-group passed"},
                # Right description, wrong context.
                {"context": "jovie-merge-queue/enroll", "description": "blocked:merge-group-product-failure"},
                "not-a-dict",
            ]
        }
        with mock.patch.object(module, "_gh_json", return_value=near_misses):
            self.assertFalse(module._pr_has_product_failure_tombstone("JovieInc/Jovie", 16420))
        with mock.patch.object(module, "_gh_json", return_value={"statusCheckRollup": "not-a-list"}):
            self.assertFalse(module._pr_has_product_failure_tombstone("JovieInc/Jovie", 16420))
        with mock.patch.object(module, "_gh_json", return_value=None):
            self.assertFalse(module._pr_has_product_failure_tombstone("JovieInc/Jovie", 16420))

    def test_github_remount_identifiers_find_dirty_heads_without_linear(self):
        module = self.load_controller_module()
        listed = [
            {
                "number": 16211,
                "headRefName": "grok/JOV-4894-fix",
                "mergeStateStatus": "DIRTY",
            },
            {
                "number": 16220,
                "headRefName": "grok/JOV-4905-fix",
                "mergeStateStatus": "CLEAN",
            },
            {"number": 1, "headRefName": "tim/manual", "mergeStateStatus": "DIRTY"},
        ]
        with (
            mock.patch.dict(os.environ, {"SYMPHONY_OPEN_PR_INDEX": "live"}),
            mock.patch.object(module, "_gh_json", return_value=listed),
            mock.patch.object(module, "_linear_identifiers", return_value=[]),
        ):
            remounts = module._github_remount_identifiers()
            combined = module._admitted_or_remount_identifiers()
        self.assertEqual(remounts, ["JOV-4894"])
        self.assertEqual(combined, ["JOV-4894"])

    def test_admitted_or_remount_keeps_linear_fail_closed_without_github_heads(self):
        module = self.load_controller_module()
        with (
            mock.patch.object(module, "_linear_identifiers", return_value=None),
            mock.patch.object(module, "_github_remount_identifiers", return_value=[]),
        ):
            self.assertIsNone(module._admitted_or_remount_identifiers())
        with (
            mock.patch.object(module, "_linear_identifiers", return_value=None),
            mock.patch.object(module, "_github_remount_identifiers", return_value=["JOV-4894"]),
        ):
            self.assertEqual(module._admitted_or_remount_identifiers(), ["JOV-4894"])
        with (
            mock.patch.object(module, "_linear_identifiers", return_value=[]),
            mock.patch.object(module, "_github_remount_identifiers", return_value=["JOV-4894"]),
        ):
            self.assertEqual(module._admitted_or_remount_identifiers(), ["JOV-4894"])

    def test_issue_meta_remount_skips_receipt_but_still_blocks_human_hold(self):
        module = self.load_controller_module()
        issue = self._admitted_issue("JOV-4894", "In Review")
        issue["comments"] = {"nodes": []}
        ok, reason, meta = module._issue_meta(issue, "JOV-4894", require_receipt=False)
        self.assertTrue(ok, reason)
        self.assertEqual(meta["original_state_name"], "In Review")
        refused, default_reason, _ = module._issue_meta(issue, "JOV-4894")
        self.assertFalse(refused)
        self.assertEqual(default_reason, "admission_receipt_missing_or_stale")
        blocked = self._admitted_issue("JOV-4894", "In Review")
        blocked["comments"] = {"nodes": []}
        blocked["labels"] = {"nodes": [{"name": "blocked"}]}
        ok, reason, _ = module._issue_meta(blocked, "JOV-4894", require_receipt=False)
        self.assertFalse(ok)
        self.assertEqual(reason, "blocked")

    def test_launch_remounts_dirty_head_without_admission_receipt(self):
        """Live stall after #16212: Linear receipts empty, #16211 DIRTY."""
        module = self.load_controller_module()
        launches: list[list[str]] = []
        issue = self._admitted_issue("JOV-4894", "In Review")
        issue["comments"] = {"nodes": []}
        index = {
            "JOV-4894": {
                "number": 16211,
                "head": "grok/JOV-4894-fix",
                "repo": "JovieInc/Jovie",
                "mergeStateStatus": "DIRTY",
            }
        }
        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value=index),
            mock.patch.object(module, "_fetch_single_issue", return_value=issue),
            mock.patch.object(
                module, "_control", side_effect=lambda command: launches.append(command) or True
            ),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-4894"],
                [],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        self.assertEqual(used, 1)
        self.assertEqual(len(launched), 1)
        self.assertTrue(any("JOV-4894" in arg for command in launches for arg in command), launches)

    def test_launch_still_requires_receipt_for_new_work(self):
        module = self.load_controller_module()
        launches: list[list[str]] = []
        issue = self._admitted_issue("JOV-5003", "Todo")
        issue["comments"] = {"nodes": []}
        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_fetch_single_issue", return_value=issue),
            mock.patch.object(
                module, "_control", side_effect=lambda command: launches.append(command) or True
            ),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5003"],
                [],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        self.assertEqual(used, 0)
        self.assertEqual(list(launched), [])
        self.assertEqual(launches, [])

    def test_launch_mirrors_closure_stop_line_for_new_work_but_not_remount(self):
        """While closureAdmission.newIssueIntakeAllowed is false, the sidecar
        must not lease NEW work that grok-ship-one would refuse at its own
        stop-line; remounts of open DIRTY heads stay exempt."""
        module = self.load_controller_module()
        self.gate.write_text(json.dumps({
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "closureAdmission": {"newIssueIntakeAllowed": False},
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
            "remediationAdmission": {"allowed": True, "pushAllowed": True},
        }))
        launches: list[list[str]] = []
        new_issue = self._admitted_issue("JOV-5003", "In Progress")
        new_issue["comments"] = {"nodes": []}
        remount_issue = self._admitted_issue("JOV-4894", "In Review")
        remount_issue["comments"] = {"nodes": []}
        index = {
            "JOV-4894": {
                "number": 16211,
                "head": "grok/JOV-4894-fix",
                "repo": "JovieInc/Jovie",
                "mergeStateStatus": "DIRTY",
            }
        }
        issues = {"JOV-5003": new_issue, "JOV-4894": remount_issue}
        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value=index),
            mock.patch.object(
                module, "_fetch_single_issue", side_effect=lambda ident: issues.get(ident)
            ),
            mock.patch.object(
                module, "_control", side_effect=lambda command: launches.append(command) or True
            ),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5003", "JOV-4894"],
                [],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        # New work refused before leasing; the DIRTY remount still launches.
        self.assertEqual(used, 1)
        self.assertEqual(len(launched), 1)
        self.assertTrue(
            any("JOV-4894" in arg for command in launches for arg in command), launches
        )
        self.assertFalse(
            any("JOV-5003" in arg for command in launches for arg in command), launches
        )

    def test_exhausted_remounts_github_dirty_head_when_linear_has_no_receipts(self):
        module = self.load_controller_module()
        launches: list[list[str]] = []
        unit = "fallback-ship-JOV-4894.service"
        active: list[str] = []

        def launch(identifiers, *_args, **_kwargs):
            launches.append(list(identifiers))
            active.append(unit)
            return {unit}, 1

        with (
            mock.patch.object(
                module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")
            ),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=[]),
            mock.patch.object(module, "_github_remount_identifiers", return_value=["JOV-4894"]),
            mock.patch.object(module, "_active_grok_units", side_effect=lambda: list(active)),
            mock.patch.object(module, "_fleet_gate_allows_isolated", return_value=(True, "fleet_gate_amber")),
            mock.patch.object(
                module,
                "_model_router_selection",
                return_value=({"selected": {"id": "grok", "pool": "grok"}}, "ok"),
            ),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(module, "_launch_fallback_workers", side_effect=launch),
            mock.patch.object(module, "_grok_units_after_survival_window", return_value=[unit]),
            mock.patch.object(module, "_jov_active", return_value=True),
            mock.patch.object(module, "_control", return_value=True),
        ):
            self.assertEqual(module.reconcile(), 0)
        self.assertEqual(launches, [["JOV-4894"]])

    def test_enroll_failure_does_not_count_as_product_ci_red(self):
        module = self.load_controller_module()
        with mock.patch.object(
            module,
            "_gh_json",
            return_value={
                "statusCheckRollup": [
                    {"name": "ci-fast", "conclusion": "SUCCESS", "status": "COMPLETED"},
                    {"name": "enroll", "conclusion": "FAILURE", "status": "COMPLETED"},
                    {"name": "PR Ready", "conclusion": "FAILURE", "status": "COMPLETED"},
                ]
            },
        ):
            self.assertFalse(module._pr_has_failing_check("JovieInc/Jovie", 16211))

    def test_launch_skips_inflight_open_prs_and_fills_capacity_with_unblocked(self):
        """Live sidecar launched identifiers that already had grok/JOV PRs; units
        exited immediately and leftover Todo work never got a slot."""
        module = self.load_controller_module()
        launches: list[list[str]] = []

        def verdict(identifier, _index):
            if identifier == "JOV-1":
                return "skip", {"number": 16211, "head": "grok/JOV-1-fix"}
            if identifier == "JOV-2":
                return "remount", {"number": 16212, "head": "grok/JOV-2-fix"}
            return "none", None

        def control(command):
            launches.append(command)
            return True

        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_open_pr_verdict", side_effect=verdict),
            mock.patch.object(module, "_fetch_single_issue", return_value=self._admitted_issue()),
            mock.patch.object(
                module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "2026-08-19T18:46:00Z"}),
            ),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-1", "JOV-2", "JOV-3"],
                [],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        units = [arg for command in launches if command[0] == "systemd-run" for arg in command if arg.startswith("--unit=")]
        self.assertEqual(len(units), 2)
        self.assertTrue(any("JOV-2" in unit for unit in units), units)
        self.assertTrue(any("JOV-3" in unit for unit in units), units)
        self.assertFalse(any("JOV-1" in unit for unit in units), units)
        self.assertEqual(used, 2)
        self.assertEqual(len(launched), 2)

    def test_launch_recycles_stale_remount_unit_and_relaunches(self):
        """Live JOV-5220 held a remount unit 90+ min after main moved."""
        module = self.load_controller_module()
        launches: list[list[str]] = []
        stopped: list[str] = []
        stale = "fallback-ship-JOV-5220-aaaaaaaaaaaa.service"

        def verdict(identifier, _index):
            if identifier in {"JOV-5220", "JOV-5238"}:
                return "remount", {
                    "number": 16229,
                    "head": f"fallback/{identifier}-fix",
                    "mergeable": "CONFLICTING",
                }
            return "none", None

        def control(command):
            if len(command) >= 4 and command[0] == "systemctl" and command[2] == "stop":
                stopped.append(command[-1])
                return True
            launches.append(command)
            return True

        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_open_pr_verdict", side_effect=verdict),
            mock.patch.object(module, "_unit_age_seconds", return_value=2 * 60 * 60),
            mock.patch.object(module, "_fetch_single_issue", return_value=self._admitted_issue()),
            mock.patch.object(
                module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "2026-08-19T18:46:00Z"}),
            ),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5220", "JOV-5238"],
                [stale],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        self.assertEqual(stopped, [stale])
        units = [arg for command in launches if command[0] == "systemd-run" for arg in command if arg.startswith("--unit=")]
        self.assertTrue(any("JOV-5220" in unit for unit in units), units)
        self.assertTrue(any("JOV-5238" in unit for unit in units), units)
        self.assertEqual(used, 2)
        self.assertEqual(len(launched), 2)

    def test_launch_keeps_fresh_remount_and_clean_units(self):
        module = self.load_controller_module()
        stopped: list[str] = []
        launches: list[list[str]] = []
        fresh = "fallback-ship-JOV-5218-bbbbbbbbbbbb.service"
        clean = "fallback-ship-JOV-4905-cccccccccccc.service"

        def verdict(identifier, _index):
            if identifier == "JOV-5218":
                return "remount", {"number": 16234, "head": "fallback/JOV-5218-fix"}
            if identifier == "JOV-4905":
                return "skip", {"number": 16214, "head": "grok/JOV-4905-fix"}
            return "none", None

        def control(command):
            if len(command) >= 4 and command[0] == "systemctl" and command[2] == "stop":
                stopped.append(command[-1])
                return True
            launches.append(command)
            return True

        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_open_pr_verdict", side_effect=verdict),
            mock.patch.object(module, "_unit_age_seconds", return_value=60.0),
            mock.patch.object(module, "_fetch_single_issue", return_value=self._admitted_issue()),
            mock.patch.object(
                module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "2026-08-19T18:46:00Z"}),
            ),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5218", "JOV-5238"],
                [fresh, clean],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                4,
            )
        self.assertEqual(stopped, [])
        units = [arg for command in launches if command[0] == "systemd-run" for arg in command if arg.startswith("--unit=")]
        self.assertFalse(any("JOV-5218" in unit for unit in units), units)
        self.assertTrue(any("JOV-5238" in unit for unit in units), units)
        self.assertEqual(used, 3)

    def test_launch_keeps_remount_during_pre_push_window(self):
        """Live JOV-5220 changelog remount was in pre-push at 15 min; recycle would kill it."""
        module = self.load_controller_module()
        self.assertGreater(module.STALE_REMOUNT_SECONDS, 60 * 60)
        stopped: list[str] = []
        pushing = "fallback-ship-JOV-5220-aaaaaaaaaaaa.service"

        def verdict(identifier, _index):
            if identifier == "JOV-5220":
                return "remount", {"number": 16229, "head": "fallback/JOV-5220-fix"}
            return "none", None

        def control(command):
            if len(command) >= 4 and command[0] == "systemctl" and command[2] == "stop":
                stopped.append(command[-1])
                return True
            return True

        with (
            mock.patch.object(module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(module, "_open_pr_verdict", side_effect=verdict),
            mock.patch.object(module, "_unit_age_seconds", return_value=54 * 60),
            mock.patch.object(module, "_fetch_single_issue", return_value=self._admitted_issue()),
            mock.patch.object(
                module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "2026-08-19T18:46:00Z"}),
            ),
            mock.patch.object(module, "_control", side_effect=control),
        ):
            launched, used = module._launch_fallback_workers(
                ["JOV-5220"],
                [pushing],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                4,
            )
        self.assertEqual(stopped, [])
        self.assertEqual(launched, set())
        self.assertEqual(used, 1)

    def test_unit_age_seconds_parses_wall_clock_when_usec_missing(self):
        """Gem user systemd has ExecMainStartTimestamp but not USec (live JOV-5220)."""
        module = self.load_controller_module()
        started = time.time() - 7200
        wall = time.strftime("%a %Y-%m-%d %H:%M:%S UTC", time.gmtime(started))
        payload = (
            f"ExecMainStartTimestampUSec=\nExecMainStartTimestamp={wall}\n"
        ).encode()

        def captured(command, _timeout):
            self.assertIn("--property=ExecMainStartTimestampUSec,ExecMainStartTimestamp", command)
            return subprocess.CompletedProcess(command, 0, stdout=payload, stderr=b"")

        with mock.patch.object(module, "_captured", side_effect=captured):
            age = module._unit_age_seconds("fallback-ship-JOV-5220-770fa184873a.service")
        self.assertIsNotNone(age)
        self.assertGreater(age, 7000)
        self.assertLess(age, 7400)

    def test_unit_age_seconds_prefers_usec_when_present(self):
        module = self.load_controller_module()
        usec = int((time.time() - 3600) * 1_000_000)
        payload = (
            f"ExecMainStartTimestampUSec={usec}\n"
            "ExecMainStartTimestamp=Wed 2020-01-01 00:00:00 UTC\n"
        ).encode()

        def captured(command, _timeout):
            return subprocess.CompletedProcess(command, 0, stdout=payload, stderr=b"")

        with mock.patch.object(module, "_captured", side_effect=captured):
            age = module._unit_age_seconds("fallback-ship-JOV-5220-770fa184873a.service")
        self.assertIsNotNone(age)
        self.assertGreater(age, 3500)
        self.assertLess(age, 3700)

    def test_unit_age_seconds_missing_both_returns_none(self):
        module = self.load_controller_module()
        payload = b"ExecMainStartTimestampUSec=\nExecMainStartTimestamp=\n"

        def captured(command, _timeout):
            return subprocess.CompletedProcess(command, 0, stdout=payload, stderr=b"")

        with mock.patch.object(module, "_captured", side_effect=captured):
            self.assertIsNone(module._unit_age_seconds("fallback-ship-JOV-5220-770fa184873a.service"))

    def test_cursor_agent_std_does_not_inject_fast_false(self):
        """Live JOV-5235: wrapper turned cursor-grok-4.6-high-fast into [fast=false]."""
        loader = importlib.machinery.SourceFileLoader("cursor_agent_std", str(CURSOR_STD))
        module = loader.load_module()
        self.assertEqual(module.lock_model("cursor-grok-4.6-high-fast"), "cursor-grok-4.6-high")
        self.assertEqual(module.lock_model("cursor-grok-4.6-high"), "cursor-grok-4.6-high")
        self.assertEqual(module.lock_model("grok-4.6[fast=true]"), "grok-4.6")
        self.assertEqual(
            module.lock_model("claude-opus-4-8[context=1m,fast=true]"),
            "claude-opus-4-8[context=1m]",
        )
        self.assertEqual(
            module.rewrite(["-p", "--force", "--model", "cursor-grok-4.6-high-fast", "fix it"]),
            ["-p", "--force", "--model", "cursor-grok-4.6-high", "fix it"],
        )

    def test_grok_ship_one_changelog_push_failure_still_invokes_grok(self):
        """Live JOV-5238: changelog autoresolve then pre-push typecheck failed, no END."""
        created = self.root / "pr-created"
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16241,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *isDraft*) echo false;;\n'
            '  *) echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"merge --no-edit origin/main") echo "CONFLICT (content): Merge conflict in CHANGELOG.md" >&2; exit 1;;\n'
            '  *"diff --name-only --diff-filter=U") printf "CHANGELOG.md\\n";;\n'
            '  *"show :2:CHANGELOG.md") printf -- "- **ours unique JOV-7**\\n";;\n'
            '  *"show :3:CHANGELOG.md") printf "# Changelog\\n\\n## [Unreleased]\\n\\n### Fixed\\n\\n- **theirs**\\n";;\n'
            '  *"ls-files"*) if [ -f "$GEM_EVENTS.changelog-added" ]; then exit 0; fi; printf "100644 abc CHANGELOG.md\\n";;\n'
            '  *"add CHANGELOG.md") : > "$GEM_EVENTS.changelog-added";;\n'
            '  *"commit --no-edit") ;;\n'
            '  *"push origin"*) echo "pre-push typecheck failed" >&2; exit 1;;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_changelog_stripped", log)
        self.assertIn("remount_changelog_push_failed", log)
        self.assertIn("START JOV-7", log)
        events = self.events.read_text()
        self.assertIn("grok -", events)
        self.assertTrue(created.exists())

    def test_grok_ship_one_path_includes_pnpm_dirs(self):
        """Live changelog remount commit died: husky pre-commit `pnpm: not found`."""
        text = GROK_SHIP.read_text()
        self.assertIn("/usr/local/bin", text)
        self.assertIn(".npm-global/bin", text)
        command = self.load_controller_module()._grok_command(
            "JOV-7",
            "/bin/true",
            {"schema_version": 1, "selected": {"id": "x"}},
            "rev",
            "a" * 64,
        )
        path_args = [arg for arg in command if arg.startswith("Environment=PATH=")]
        self.assertTrue(path_args)
        self.assertIn("/usr/local/bin", path_args[0])
        self.assertIn(".npm-global/bin", path_args[0])
        self.assertIn("Environment=AUTOMATION_VERIFY_MAX_WORKERS=4", command)
        self.assertIn("Environment=AUTOMATION_VERIFY_SHARD_CONCURRENCY=2", command)
        self.assertTrue(
            any(arg.startswith("Environment=GEM_KIMI_EXECUTABLE=") for arg in command)
        )
        self.assertTrue(
            any(arg.startswith("Environment=SYMPHONY_FALLBACK_PROVIDER=") for arg in command)
        )
        ship = GROK_SHIP.read_text()
        self.assertIn('AUTOMATION_VERIFY_MAX_WORKERS="${AUTOMATION_VERIFY_MAX_WORKERS:-4}"', ship)

    def test_grok_ship_one_new_work_does_not_request_queue_deferred(self):
        """Live fallback PRs still got queue-deferred because the prompt asked for it."""
        text = GROK_SHIP.read_text()
        self.assertNotIn("and the queue-deferred hold", text)
        self.assertIn("Do not add the queue-deferred label", text)
        self.assertIn("Native merge-queue autoenroll is the hold", text)

    def test_grok_ship_one_skips_existing_grok_prefix_pr(self):
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16211,"headRefName":"grok/JOV-7-fix"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *) echo 0;;\n'
            'esac\n',
        )
        self.command("git", 'printf "git %s\\n" "$*" >> "$GEM_EVENTS"')
        self.command("grok", 'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"')
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("open_pr_exists", (self.root / "logs/JOV-7.log").read_text())
        events = self.events.read_text() if self.events.exists() else ""
        self.assertNotIn("git clone", events)
        self.assertNotIn("grok -", events)

    def test_grok_ship_one_remounts_ci_red_existing_head(self):
        created = self.root / "pr-created"
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16211,"headRefName":"grok/JOV-7-fix"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"FAILURE"}]}\';;\n'
            '  *) [ ! -f "$GROK_CREATED" ] && echo 0 || echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "true\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 1;;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_ci_red", log)
        events = self.events.read_text()
        self.assertIn("fetch origin +refs/heads/grok/JOV-7-fix:refs/remotes/origin/grok/JOV-7-fix", events)
        self.assertIn("merge --abort", events)
        self.assertIn("reset --hard HEAD", events)
        self.assertIn("fetch origin main", events)
        self.assertIn("fetch --unshallow origin", events)
        self.assertIn("fetch --deepen=500 origin", events)
        self.assertIn("checkout -B grok/JOV-7-fix origin/grok/JOV-7-fix", events)
        self.assertIn("reset --hard origin/grok/JOV-7-fix", events)
        self.assertIn("merge --no-edit origin/main", events)
        self.assertNotIn("fetch --depth 1 origin refs/heads/grok/JOV-7-fix", events)
        self.assertNotIn("checkout -B fallback/JOV-7-fix origin/main", events)
        self.assertIn("failing CI", events)

    def test_grok_ship_one_remount_strips_changelog_only_conflict(self):
        """CHANGELOG is post-land state; a branch-only artifact is discarded."""
        created = self.root / "pr-created"
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16229,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *isDraft*) echo false;;\n'
            '  *) echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"merge --no-edit origin/main") echo "CONFLICT (content): Merge conflict in CHANGELOG.md" >&2; exit 1;;\n'
            '  *"diff --name-only --diff-filter=U") printf "CHANGELOG.md\\n";;\n'
            '  *"show :2:CHANGELOG.md") printf -- "- **ours unique JOV-7**\\n";;\n'
            '  *"show :3:CHANGELOG.md") printf "# Changelog\\n\\n## [Unreleased]\\n\\n### Fixed\\n\\n- **theirs**\\n";;\n'
            '  *"ls-files"*) if [ -f "$GEM_EVENTS.changelog-added" ]; then exit 0; fi; printf "100644 abc CHANGELOG.md\\n";;\n'
            '  *"add CHANGELOG.md") : > "$GEM_EVENTS.changelog-added";;\n'
            '  *"commit --no-edit") ;;\n'
            '  *"push origin"*) printf "pushed\\n" >> "$GEM_EVENTS";;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_merge_conflicts", log)
        self.assertIn("remount_changelog_stripped", log)
        self.assertIn("remount_changelog_pushed", log)
        events = self.events.read_text()
        self.assertIn("merge --no-edit origin/main", events)
        self.assertIn("add CHANGELOG.md", events)
        self.assertIn("commit --no-edit", events)
        self.assertIn("push origin", events)
        self.assertNotIn("grok -", events)
        self.assertFalse(created.exists(), "changelog-only DIRTY remount must not wait on grok")

    def test_grok_ship_one_remount_strips_clean_branch_changelog_diff(self):
        """A conflict-free remount also removes a legacy branch changelog."""
        created = self.root / "pr-created"
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16229,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *isDraft*) echo false;;\n'
            '  *) echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"diff --quiet origin/main...HEAD -- CHANGELOG.md") exit 1;;\n'
            '  *"push origin"*) printf "pushed\\n" >> "$GEM_EVENTS";;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_changelog_stripped", log)
        self.assertIn("remount_changelog_pushed", log)
        events = self.events.read_text()
        self.assertIn("restore --source=origin/main -- CHANGELOG.md", events)
        self.assertIn("commit -m chore: remove pre-land changelog artifact", events)
        self.assertIn("push origin", events)
        self.assertNotIn("grok -", events)
        self.assertFalse(created.exists())

    def test_grok_ship_one_remount_still_invokes_grok_for_product_conflicts(self):
        created = self.root / "pr-created"
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16234,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *) [ ! -f "$GROK_CREATED" ] && echo 0 || echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"merge --no-edit origin/main") echo "CONFLICT (content): Merge conflict in apps/web/x.ts" >&2; exit 1;;\n'
            '  *"diff --name-only --diff-filter=U") printf "CHANGELOG.md\\napps/web/x.ts\\n";;\n'
            '  *"show :2:CHANGELOG.md") printf -- "- **ours**\\n";;\n'
            '  *"show :3:CHANGELOG.md") printf "# Changelog\\n\\n## [Unreleased]\\n\\n- **theirs**\\n";;\n'
            '  *"ls-files -u") printf "100644 abc CHANGELOG.md\\n100644 def apps/web/x.ts\\n";;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_merge_conflicts", log)
        self.assertNotIn("remount_changelog_stripped", log)
        events = self.events.read_text()
        self.assertIn("grok -", events)
        self.assertNotIn("push origin", events)

    def test_grok_ship_one_retries_cursor_grok_model_when_grok_46_rejected(self):
        """Live JOV-5235 remount: grok TUI rejected grok-4.6 with cursor model list."""
        created = self.root / "pr-created"
        self.command("hermes", "printf 'hermes should not run\\n' >> \"$GEM_EVENTS\"; exit 99")
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16240,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"FAILURE"}]}\';;\n'
            '  *) [ ! -f "$GROK_CREATED" ] && echo 0 || echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"merge --no-edit origin/main") echo "CONFLICT (content): Merge conflict in apps/web/x.ts" >&2; exit 1;;\n'
            '  *"diff --name-only --diff-filter=U") printf "apps/web/x.ts\\n";;\n'
            '  *"ls-files -u") printf "100644 def apps/web/x.ts\\n";;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'case " $* " in\n'
            '  *" -m grok-4.6 "*)\n'
            '    echo "Cannot use this model: grok-4.6[fast=false]. Available models: auto, cursor-grok-4.6-high, cursor-grok-4.6-high-fast" >&2\n'
            '    exit 1;;\n'
            '  *" -m cursor-grok-4.6-high-fast "*)\n'
            '    touch "$GROK_CREATED"\n'
            '    exit 0;;\n'
            'esac\n'
            'exit 3\n',
        )
        selection = {
            "schema_version": 1,
            "deterministic_first": True,
            "selected": {
                "id": "hermes-openrouter",
                "provider": "openrouter",
                "model": "grok-4.6",
                "executor": {
                    "executable": str(self.bin / "hermes"),
                    "argv": ["-m", "{model}", "-p", "{prompt}"],
                },
            },
        }
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
                GEM_GROK_EXECUTABLE=str(self.bin / "grok"),
                GEM_GROK_BIN=str(self.bin / "grok"),
                SYMPHONY_FALLBACK_SELECTION_B64=base64.b64encode(
                    json.dumps(selection).encode()
                ).decode(),
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("retry_cursor_grok_model cursor-grok-4.6-high-fast", log)
        events = self.events.read_text()
        self.assertIn("-m grok-4.6", events)
        self.assertIn("-m cursor-grok-4.6-high-fast", events)
        self.assertNotIn("hermes should not run", events)
        self.assertTrue(created.exists())

    def test_grok_ship_one_retries_cursor_model_flag_when_grok_46_rejected(self):
        """Live JOV-5220: cursor argv uses --model grok-4.6, not -m."""
        created = self.root / "pr-created"
        self.command(
            "cursor-agent",
            'printf "cursor %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'case " $* " in\n'
            '  *" --model grok-4.6 "*)\n'
            '    echo "Cannot use this model: grok-4.6[fast=false]. Available models: auto, cursor-grok-4.6-high, cursor-grok-4.6-high-fast" >&2\n'
            '    exit 1;;\n'
            '  *" --model cursor-grok-4.6-high-fast "*)\n'
            '    touch "$GROK_CREATED"\n'
            '    exit 0;;\n'
            'esac\n'
            'exit 3\n',
        )
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16229,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"FAILURE"}]}\';;\n'
            '  *) [ ! -f "$GROK_CREATED" ] && echo 0 || echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"merge --no-edit origin/main") echo "CONFLICT (content): Merge conflict in apps/web/x.ts" >&2; exit 1;;\n'
            '  *"diff --name-only --diff-filter=U") printf "apps/web/x.ts\\n";;\n'
            '  *"ls-files -u") printf "100644 def apps/web/x.ts\\n";;\n'
            'esac\n',
        )
        selection = {
            "schema_version": 1,
            "deterministic_first": True,
            "selected": {
                "id": "cursor-grok-4.6",
                "provider": "cursor",
                "model": "grok-4.6",
                "executor": {
                    "executable": str(self.bin / "cursor-agent"),
                    "argv": ["-p", "--force", "--model", "{model}", "{prompt}"],
                },
            },
        }
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
                SYMPHONY_FALLBACK_SELECTION_B64=base64.b64encode(
                    json.dumps(selection).encode()
                ).decode(),
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("retry_cursor_grok_model cursor-grok-4.6-high-fast", log)
        events = self.events.read_text()
        self.assertIn("--model grok-4.6", events)
        self.assertIn("--model cursor-grok-4.6-high-fast", events)
        self.assertTrue(created.exists())

    def test_grok_ship_one_changelog_strip_failure_still_invokes_grok(self):
        """A missing main-stage CHANGELOG degrades to bounded Grok remediation."""
        created = self.root / "pr-created"
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16241,"headRefName":"fallback/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *) [ ! -f "$GROK_CREATED" ] && echo 0 || echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "false\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 0;;\n'
            '  *"merge --no-edit origin/main") echo "CONFLICT (content): Merge conflict in CHANGELOG.md" >&2; exit 1;;\n'
            '  *"diff --name-only --diff-filter=U") printf "CHANGELOG.md\\n";;\n'
            '  *"show :3:CHANGELOG.md") echo "missing stage" >&2; exit 128;;\n'
            '  *"ls-files -u") printf "100644 abc CHANGELOG.md\\n";;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_merge_conflicts", log)
        self.assertIn("remount_changelog_strip_failed", log)
        self.assertNotIn("remount_changelog_stripped", log)
        self.assertIn("START JOV-7", log)
        events = self.events.read_text()
        self.assertIn("grok -", events)

    def test_grok_ship_one_remounts_dirty_head_without_admission_receipt(self):
        created = self.root / "pr-created"
        GrokLinearHandler.omit_receipt = {"JOV-7"}
        # Summer's closure stop-line blocks only new fallback implementation;
        # an exact existing PR remount remains bounded remediation.
        self.gate.write_text(json.dumps({
            "schema": "jovie-fleet-gate/v1",
            "state": "GREEN",
            "closureAdmission": {"newIssueIntakeAllowed": False},
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": False},
            "remediationAdmission": {"allowed": True, "pushAllowed": True},
        }))
        self.command(
            "gh",
            'case "$*" in\n'
            '  *headRefName*) echo \'[{"number":16211,"headRefName":"grok/JOV-7-fix","mergeStateStatus":"DIRTY"}]\';;\n'
            '  *statusCheckRollup*) echo \'{"statusCheckRollup":[{"conclusion":"SUCCESS"}]}\';;\n'
            '  *) [ ! -f "$GROK_CREATED" ] && echo 0 || echo 1;;\n'
            'esac\n',
        )
        self.command(
            "git",
            'printf "git %s\\n" "$*" >> "$GEM_EVENTS"\n'
            '[ "$1" != clone ] || mkdir -p "$5/.git"\n'
            'case "$*" in\n'
            '  *"rev-parse HEAD") printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n";;\n'
            '  *"rev-parse --is-shallow-repository") printf "true\\n";;\n'
            '  *"merge-base HEAD origin/main") exit 1;;\n'
            'esac\n',
        )
        self.command(
            "grok",
            'printf "grok %s\\n" "$*" >> "$GEM_EVENTS"\n'
            'touch "$GROK_CREATED"\n',
        )
        result = subprocess.run(
            [self.install_runtime() / GROK_SHIP.name, "JOV-7"],
            capture_output=True,
            text=True,
            env=self.env(
                GEM_EVENTS=self.events,
                GROK_CREATED=created,
                GROK_SHIP_WS_ROOT=self.root / "workspaces",
                GROK_SHIP_LOG_DIR=self.root / "logs",
                LINEAR_API_KEY="linear-secret",
                LINEAR_API_URL=self.grok_linear_url(),
                SYMPHONY_OPEN_PR_INDEX="live",
            ),
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("issue is not admitted", result.stderr)
        log = (self.root / "logs/JOV-7.log").read_text()
        self.assertIn("remount_ci_red", log)
        events = self.events.read_text()
        self.assertIn("checkout -B grok/JOV-7-fix origin/grok/JOV-7-fix", events)
        self.assertIn("fetch origin +refs/heads/grok/JOV-7-fix:refs/remotes/origin/grok/JOV-7-fix", events)
        self.assertIn("merge --abort", events)
        self.assertIn("merge --no-edit origin/main", events)

    def test_check_admission_remount_skips_receipt(self):
        url = self.linear_url()
        original_nodes = LinearHandler.nodes
        LinearHandler.nodes = [
            {
                "identifier": "JOV-4894",
                "title": "Ship JOV-4894",
                "description": "",
                "team": {"key": "JOV"},
                "labels": {"nodes": [{"name": "symphony"}]},
                "comments": {"nodes": []},
            }
        ]
        self.addCleanup(lambda: setattr(LinearHandler, "nodes", original_nodes))
        refused = self.run_controller(
            "check-admission", "JOV-4894", LINEAR_API_KEY="linear-secret", LINEAR_API_URL=url
        )
        self.assertEqual(refused.returncode, 1, refused.stderr)
        self.assertIn("admission_receipt_missing_or_stale", refused.stderr)
        remounted = self.run_controller(
            "check-admission",
            "JOV-4894",
            "--remount",
            LINEAR_API_KEY="linear-secret",
            LINEAR_API_URL=url,
        )
        self.assertEqual(remounted.returncode, 0, remounted.stderr)
        self.assertEqual(json.loads(remounted.stdout)["title"], "Ship JOV-4894")

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


class FallbackLockGcTests(unittest.TestCase):
    """JOV-5297: stale fallback locks cannot permanently own pickup."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.leases = self.root / "leases"
        self.leases.mkdir()
        self.gate = self.root / "fleet-gate.json"
        self.gate.write_text(
            json.dumps(
                {
                    "schema": "jovie-fleet-gate/v1",
                    "state": "AMBER",
                    "closureAdmission": {"newIssueIntakeAllowed": True},
                    "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
                    "remediationAdmission": {"allowed": True, "pushAllowed": True},
                }
            )
        )
        spec = importlib.util.spec_from_file_location("symphony_codex_exhausted_gc", CONTROLLER)
        assert spec is not None and spec.loader is not None
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.env = mock.patch.dict(
            os.environ,
            {
                "SYMPHONY_FALLBACK_LEASE_DIR": str(self.leases),
                "SYMPHONY_FALLBACK_GC_RECEIPT": str(self.root / "gc.json"),
                "SYMPHONY_FALLBACK_PICKUP_RECEIPT": str(self.root / "pickup.json"),
                "SYMPHONY_OPEN_PR_INDEX": "empty",
                "GEM_FLEET_GATE_RECEIPT": str(self.gate),
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def touch_lock(self, identifier: str, age_seconds: float = 0) -> pathlib.Path:
        path = self.leases / f"{identifier}.lock"
        path.write_text("")
        if age_seconds:
            stamped = time.time() - age_seconds
            os.utime(path, (stamped, stamped))
        return path

    def test_expire_decision_terminal_and_ttl(self):
        expire = self.module.expire_fallback_lock_decision
        self.assertEqual(
            expire(held=False, state_name="In Review", pr_verdict="none", age_seconds=10),
            ("expire", "issue_in_review"),
        )
        self.assertEqual(
            expire(held=False, state_name="Done", pr_verdict="none", age_seconds=10),
            ("expire", "issue_done"),
        )
        self.assertEqual(
            expire(held=False, state_name="Todo", pr_verdict="skip", age_seconds=10),
            ("expire", "open_pr_inflight"),
        )
        self.assertEqual(
            expire(held=False, state_name="Todo", pr_verdict="none", age_seconds=self.module.FALLBACK_LEASE_TTL_SECONDS + 1),
            ("expire", "ttl_expired"),
        )
        self.assertEqual(
            expire(held=True, state_name="In Progress", pr_verdict="none", age_seconds=10_000),
            ("keep", "live_holder"),
        )
        self.assertEqual(
            expire(held=True, state_name="In Review", pr_verdict="remount", age_seconds=10),
            ("keep", "live_remount"),
        )
        self.assertEqual(
            expire(held=None, state_name="Done", pr_verdict="skip", age_seconds=10),
            ("unknown", "lock_held_unverified"),
        )

    def test_gc_expires_in_review_and_ttl_leftovers_keeps_live_holder(self):
        stale = self.touch_lock("JOV-5257", age_seconds=30)
        leftover = self.touch_lock("JOV-5001", age_seconds=self.module.FALLBACK_LEASE_TTL_SECONDS + 5)
        live = self.touch_lock("JOV-5002")
        handle = open(live, "a+")
        self.addCleanup(handle.close)
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        issues = {
            "JOV-5257": {"state": {"name": "In Review"}},
            "JOV-5001": {"state": {"name": "Todo"}},
            "JOV-5002": {"state": {"name": "In Progress"}},
        }
        receipt = self.module.gc_fallback_locks(
            open_prs={},
            now=time.time(),
            fetch_issue=lambda ident: issues.get(ident),
        )
        self.assertFalse(stale.exists())
        self.assertFalse(leftover.exists())
        self.assertTrue(live.exists())
        self.assertEqual(receipt["lockCountBefore"], 3)
        self.assertEqual(receipt["lockCountAfter"], 1)
        self.assertEqual({row["identifier"] for row in receipt["expired"]}, {"JOV-5257", "JOV-5001"})
        self.assertEqual(receipt["kept"][0]["identifier"], "JOV-5002")
        self.assertFalse(receipt["red"])

    def test_gc_expires_open_pr_inflight_without_linear(self):
        path = self.touch_lock("JOV-5257", age_seconds=5)
        fetches = []
        receipt = self.module.gc_fallback_locks(
            open_prs={"JOV-5257": {"number": 16365, "head": "fallback/JOV-5257-fix", "mergeStateStatus": "CLEAN"}},
            fetch_issue=lambda ident: fetches.append(ident) or {"state": {"name": "In Progress"}},
        )
        self.assertFalse(path.exists())
        self.assertEqual(fetches, [])
        self.assertEqual(receipt["expired"][0]["reason"], "open_pr_inflight")

    def test_pickup_refuses_in_review_and_unknown_is_red(self):
        self.assertEqual(
            self.module.pickup_refuse_reason(
                "JOV-5257",
                issue={"state": {"name": "In Review"}},
                pr_verdict="skip",
                held=False,
            ),
            "open_pr_inflight",
        )
        self.assertIsNone(
            self.module.pickup_refuse_reason(
                "JOV-5257",
                issue={"state": {"name": "In Review"}},
                pr_verdict="none",
                held=False,
            )
        )
        self.assertEqual(
            self.module.pickup_refuse_reason(
                "JOV-5257",
                issue={"state": {"name": "In Review"}},
                pr_verdict="none",
                held=False,
                codex_writer=True,
            ),
            "issue_in_review",
        )
        self.assertIsNone(
            self.module.pickup_refuse_reason(
                "JOV-5003",
                issue={"state": {"name": "Todo"}},
                pr_verdict="none",
                held=False,
            )
        )
        typed, red = self.module._typed_pickup_reason("not_a_real_reason")
        self.assertEqual((typed, red), ("unknown", True))

    def test_pickup_allows_done_issue_remount_but_not_new_work(self):
        """Linear Done + open DIRTY autonomous PR = state-sync error; remount
        continues the GitHub-side work. Done without a remount target and
        deliberate kills (canceled/duplicate) stay refused."""
        refuse = self.module.pickup_refuse_reason
        self.assertIsNone(
            refuse(
                "JOV-5874",
                issue={"state": {"name": "Done"}},
                pr_verdict="remount",
                held=False,
            )
        )
        self.assertEqual(
            refuse(
                "JOV-5874",
                issue={"state": {"name": "Done"}},
                pr_verdict="none",
                held=False,
            ),
            "issue_done",
        )
        self.assertEqual(
            refuse(
                "JOV-5874",
                issue={"state": {"name": "Canceled"}},
                pr_verdict="remount",
                held=False,
            ),
            "issue_canceled",
        )

    def test_expire_decision_keeps_live_done_remount_lock(self):
        expire = self.module.expire_fallback_lock_decision
        self.assertEqual(
            expire(held=True, state_name="Done", pr_verdict="remount", age_seconds=10),
            ("keep", "live_remount"),
        )
        self.assertEqual(
            expire(held=False, state_name="Done", pr_verdict="remount", age_seconds=10),
            ("expire", "issue_done"),
        )
        self.assertEqual(
            expire(held=True, state_name="Canceled", pr_verdict="remount", age_seconds=10),
            ("expire", "issue_canceled"),
        )

    def test_issue_meta_admits_done_state_for_remount_only(self):
        issue = {
            "id": "uuid-JOV-5874",
            "identifier": "JOV-5874",
            "title": "Recertify Grok Bot smoothness",
            "description": "",
            "url": "https://linear.example/JOV-5874",
            "updatedAt": "2026-09-03T00:00:00Z",
            "state": {"id": "JOV-done", "name": "Done"},
            "team": {
                "key": "JOV",
                "states": {
                    "nodes": [
                        {"id": "JOV-progress", "name": "In Progress"},
                        {"id": "JOV-review", "name": "In Review"},
                    ]
                },
            },
            "labels": {"nodes": []},
            "comments": {"nodes": []},
        }
        ok, reason, meta = self.module._issue_meta(
            issue, "JOV-5874", require_receipt=False, remount=True
        )
        self.assertTrue(ok, reason)
        self.assertEqual(meta["original_state_name"], "Done")
        ok, reason, _ = self.module._issue_meta(
            issue, "JOV-5874", require_receipt=False, remount=False
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "state_not_admitted")
        canceled = dict(issue, state={"id": "JOV-canceled", "name": "Canceled"})
        ok, reason, _ = self.module._issue_meta(
            canceled, "JOV-5874", require_receipt=False, remount=True
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "state_not_admitted")

    def test_index_adopts_codex_lane_heads(self):
        """Failed GPT-lane heads (codex/fable/fugu) join the remount index."""
        payload = [
            {
                "number": 17017,
                "headRefName": "codex/jov-5853-summer-stack-03-runtime",
                "mergeStateStatus": "DIRTY",
                "mergeable": "CONFLICTING",
            },
            {
                "number": 17059,
                "headRefName": "fable/jov-5865-optical-grid-ratchets",
                "mergeStateStatus": "DIRTY",
                "mergeable": "CONFLICTING",
            },
            {
                "number": 16854,
                "headRefName": "codex/quiet-hero-two-line-h1",
                "mergeStateStatus": "DIRTY",
                "mergeable": "CONFLICTING",
            },
            {
                "number": 17090,
                "headRefName": "fallback/JOV-5694-fix",
                "mergeStateStatus": "CLEAN",
                "mergeable": "MERGEABLE",
            },
        ]
        with (
            mock.patch.dict(os.environ, {"SYMPHONY_OPEN_PR_INDEX": ""}),
            mock.patch.object(self.module, "_gh_json", return_value=payload),
        ):
            index = self.module._autonomous_open_pr_index(None)
        self.assertEqual(index["JOV-5853"]["number"], 17017)
        self.assertEqual(index["JOV-5865"]["head"], "fable/jov-5865-optical-grid-ratchets")
        # No JOV-/LYB- identifier segment in the branch name: not adoptable.
        self.assertNotIn(16854, [entry["number"] for entry in index.values()])
        self.assertEqual(index["JOV-5694"]["number"], 17090)

    def test_linear_graphql_backs_off_on_ratelimit(self):
        """A RATELIMITED response stamps a backoff; while fresh, no HTTP call
        is even attempted (the per-timer reconcile must not stampede the
        shared 2500 req/hr budget)."""
        import urllib.error

        backoff = self.root / "linear-backoff.json"
        calls: list = []

        def fake_urlopen(req, timeout=0):
            calls.append(req)
            raise urllib.error.HTTPError(
                req.full_url,
                400,
                "Bad Request",
                None,
                io.BytesIO(b'{"errors":[{"extensions":{"code":"RATELIMITED"}}]}'),
            )

        with (
            mock.patch.dict(
                os.environ,
                {"SYMPHONY_LINEAR_BACKOFF": str(backoff), "LINEAR_API_KEY": "test-key"},
            ),
            mock.patch.object(self.module.urllib.request, "urlopen", side_effect=fake_urlopen),
        ):
            self.assertIsNone(self.module._linear_graphql({"query": "x"}))
            self.assertTrue(backoff.exists())
            # Backoff fresh: the second call must not touch the network.
            self.assertIsNone(self.module._linear_graphql({"query": "x"}))
        self.assertEqual(len(calls), 1)

    def test_linear_graphql_success_clears_stale_backoff(self):
        backoff = self.root / "linear-backoff.json"
        backoff.write_text(
            json.dumps({"epoch": time.time() - self.module.LINEAR_BACKOFF_SECONDS - 5})
        )

        class _Resp:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b'{"data": {"viewer": {"id": "x"}}}'

        with (
            mock.patch.dict(
                os.environ,
                {"SYMPHONY_LINEAR_BACKOFF": str(backoff), "LINEAR_API_KEY": "test-key"},
            ),
            mock.patch.object(
                self.module.urllib.request, "urlopen", side_effect=lambda req, timeout=0: _Resp()
            ),
        ):
            body = self.module._linear_graphql({"query": "x"})
        self.assertEqual(body["data"]["viewer"]["id"], "x")
        self.assertFalse(backoff.exists())

    def test_pickup_check_refuses_in_review_and_admits_todo(self):
        stderr = io.StringIO()
        with (
            mock.patch.object(self.module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(
                self.module,
                "_fetch_single_issue",
                return_value={"identifier": "JOV-5257", "state": {"name": "In Review"}},
            ),
            contextlib.redirect_stderr(stderr),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            rc = self.module.pickup_check_command("JOV-5257")
        self.assertEqual(rc, 78)
        self.assertIn("issue_in_review", stderr.getvalue())
        self.assertIn("pickup schema=symphony-fallback-pickup/v1 event=refuse", stderr.getvalue())

        stdout = io.StringIO()
        with (
            mock.patch.object(self.module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(
                self.module,
                "_fetch_single_issue",
                return_value={"identifier": "JOV-5003", "state": {"name": "Todo"}},
            ),
            contextlib.redirect_stderr(io.StringIO()),
            contextlib.redirect_stdout(stdout),
        ):
            rc = self.module.pickup_check_command("JOV-5003")
        self.assertEqual(rc, 0)
        self.assertIn("PICKUP_ADMITTED identifier=JOV-5003", stdout.getvalue())

    def test_launch_skips_inflight_and_names_next_eligible(self):
        launches: list[list[str]] = []
        stderr = io.StringIO()

        def verdict(identifier, _index):
            if identifier == "JOV-5257":
                return "skip", {"number": 16365}
            return "none", None

        with (
            mock.patch.object(self.module, "_autonomous_open_pr_index", return_value={}),
            mock.patch.object(self.module, "_open_pr_verdict", side_effect=verdict),
            mock.patch.object(
                self.module,
                "_fetch_single_issue",
                return_value={"identifier": "JOV-5003", "state": {"name": "Todo"}},
            ),
            mock.patch.object(
                self.module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "2026-08-22T00:00:00Z"}),
            ),
            mock.patch.object(
                self.module, "_control", side_effect=lambda command: launches.append(command) or True
            ),
            contextlib.redirect_stderr(stderr),
        ):
            launched, used = self.module._launch_fallback_workers(
                ["JOV-5257", "JOV-5003"],
                [],
                "/bin/true",
                "a" * 64,
                {"selected": {"id": "grok"}},
                2,
            )
        self.assertEqual(used, 1)
        self.assertEqual(len(launched), 1)
        self.assertTrue(any("JOV-5003" in arg for command in launches for arg in command))
        self.assertFalse(any("JOV-5257" in arg for command in launches for arg in command if arg.startswith("--unit=")))
        log = stderr.getvalue()
        self.assertIn("reason=open_pr_inflight", log)
        self.assertIn("event=lease_start identifier=JOV-5003", log)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--verify-ownership-coverage":
        try:
            verify_official_service_coverage(pathlib.Path(sys.argv[2]))
        except (AssertionError, KeyError, OSError, ValueError) as error:
            print(error, file=sys.stderr)
            raise SystemExit(1) from error
        raise SystemExit(0)
    unittest.main()
