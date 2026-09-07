#!/usr/bin/env python3
"""Install, health, and fail-closed regressions for the Cursor CLI worker."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/symphony"
WORKER = SOURCE_DIR / "cursor-cli-worker.py"
INSTALLER = SOURCE_DIR / "install-cursor-cli-worker.sh"
SERVICE = SOURCE_DIR / "systemd/cursor-cli-worker.service"
TIMER = SOURCE_DIR / "systemd/cursor-cli-worker.timer"
HEALTHY = (
    "case \"$1\" in\n"
    "  --version) echo cursor-agent 2026.09.07-abcd;;\n"
    "  status|whoami) echo logged in as testdriver;;\n"
    "  models) echo 'Available models: auto, cursor-grok-4.6-high-fast, cursor-grok-4.6-high, gpt-5.6-luna-high';;\n"
    "  update) echo updated;;\n"
    "  *) exit 2;;\n"
    "esac\n"
)


def load_worker():
    spec = importlib.util.spec_from_file_location("cursor_cli_worker", WORKER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ini_value(text, key):
    for line in text.splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return None


class CursorCliWorkerContractTests(unittest.TestCase):
    def test_units_keep_gem_cursor_executable_and_typed_exits(self):
        module = load_worker()
        service = SERVICE.read_text(encoding="utf-8")
        self.assertEqual(ini_value(service, "Type"), "oneshot")
        self.assertEqual(ini_value(service, "ExecStart"), "%h/.local/bin/cursor-cli-worker reconcile")
        self.assertIn("GEM_CURSOR_EXECUTABLE=%h/.local/bin/cursor-agent-std", service)
        self.assertIn("CURSOR_AGENT_UPDATE=1", service)
        self.assertNotIn("systemctl", WORKER.read_text(encoding="utf-8"))
        self.assertEqual(ini_value(service, "Restart"), "on-failure")
        self.assertEqual(set((ini_value(service, "SuccessExitStatus") or "").split()), {"0", str(module.EXIT_UNHEALTHY)})
        timer = TIMER.read_text(encoding="utf-8")
        self.assertEqual((ini_value(timer, "OnBootSec"), ini_value(timer, "OnUnitInactiveSec"), ini_value(timer, "Persistent")), ("30s", "2min", "true"))

    def test_registry_requests_live_fast_catalog_id(self):
        registry = json.loads((SOURCE_DIR / "config/model-registry.json").read_text())
        cursor = next(model for model in registry["models"] if model["id"] == "cursor-grok-4.6")
        self.assertEqual(cursor["model"], "cursor-grok-4.6-high-fast")
        luna = next(model for model in registry["models"] if model["id"] == "cursor-luna")
        self.assertEqual(luna["model"], "gpt-5.6-luna-high")
        self.assertNotEqual(luna["model"], "gpt-5.6-luna")


class CursorCliWorkerBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.module = load_worker()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = pathlib.Path(self.tmp.name) / "home"
        self.home.mkdir()
        self.env = {"SYMPHONY_CURSOR_CLI_HOME": str(self.home), "HOME": str(self.home), "GEM_CURSOR_HEALTH_RECEIPT": str(self.home / "health.json")}

    def write_binary(self, script, name="cursor-agent"):
        path = self.home / "bin" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("#!/bin/sh\n" + script, encoding="utf-8")
        path.chmod(0o755)
        return path

    def _healthy_env(self, script=HEALTHY):
        binary = self.write_binary(script)
        wrapper = self.module.install_wrapper(self.env)
        return {
            **self.env,
            "CURSOR_AGENT_REAL": str(binary),
            "GEM_CURSOR_EXECUTABLE": str(wrapper),
            "GEM_FLEET_GATE_RECEIPT": str(self.home / "fleet-gate.json"),
            "SYMPHONY_FALLBACK_PICKUP_RECEIPT": str(self.home / "pickup.json"),
            "SYMPHONY_PROVIDER_CAPACITY_STATE": str(self.home / "capacity.json"),
        }

    def _write_json(self, path, payload):
        pathlib.Path(path).write_text(json.dumps(payload), encoding="utf-8")

    def test_health_and_throughput_classes(self):
        missing = self.module.probe_health(self.env)
        self.assertEqual(missing["status"], "unhealthy")
        self.assertTrue({"wrapper_missing", "binary_missing"} <= set(missing["reasons"]))
        env = self._healthy_env()
        payload = self.module.probe_health(env)
        self.assertEqual(payload["status"], "ready", payload)
        self.assertEqual(payload["throughput"], "unknown")
        self.assertEqual(payload["throughputSchema"], self.module.THROUGHPUT_SCHEMA)
        self.assertEqual(payload["landSchema"], self.module.LAND_SCHEMA)
        self.assertEqual(payload["pairedLocks"], [self.module.THROUGHPUT_SCHEMA, self.module.LAND_SCHEMA])
        self.assertEqual(payload["hosts"], self.module.HOSTS)
        self.assertNotIn("the Mac", json.dumps(payload))
        self.assertEqual(
            (payload["hostRole"], payload["cursorCliTarget"], payload["proRole"], payload["proCursorRole"]),
            ("gem", "gem", "ops_grok_bot", "reference_only"),
        )
        self.assertIn("cursor-grok-4.6-high-fast", payload["models"])
        self.assertIn("gpt-5.6-luna-high", payload["enrolledModels"])
        self.assertNotIn("gpt-5.6-luna", payload["enrolledModels"])
        self.assertIn("cursor-grok-4.6-high", payload["catalogGap"])
        self.assertNotIn("auto", payload["catalogGap"])
        self.assertNotIn("gpt-5.6-luna", payload["catalogGap"])
        unauth = self._healthy_env(
            "case \"$1\" in\n  --version) echo cursor-agent 2026.09.07-abcd;;\n"
            "  status|whoami) echo not logged in >&2; exit 1;;\n"
            "  models) echo 'Available models: auto, cursor-grok-4.6-high';;\n  *) exit 2;;\nesac\n"
        )
        bad = self.module.probe_health(unauth)
        self.assertTrue({"unauthenticated", "requested_model_unlisted"} <= set(bad["reasons"]))
        stale = self._healthy_env(
            "case \"$1\" in\n  --version) echo cursor-agent 2026.08.11-e8db854;;\n"
            "  status|whoami) echo logged in;;\n  models) echo cursor-grok-4.6-high-fast;;\n  *) exit 2;;\nesac\n"
        )
        now = time.mktime(time.strptime("2026.09.07", "%Y.%m.%d"))
        self.assertIn("binary_stale", self.module.probe_health(stale, now=now)["reasons"])
        env = self._healthy_env()
        self._write_json(env["GEM_FLEET_GATE_RECEIPT"], {
            "schema": self.module.FLEET_GATE_SCHEMA,
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
            "concurrency": {"gem": {"maxConcurrent": 0}},
        })
        held = self.module.probe_health(env)
        self.assertEqual((held["status"], held["throughput"], held["admissionGate"]), ("admission_held", "admission_held", "JOV-5492"))
        self.assertNotIn("usefulCompletions", held)
        self._write_json(env["GEM_FLEET_GATE_RECEIPT"], {"schema": self.module.FLEET_GATE_SCHEMA, "concurrency": {"gem": {"maxConcurrent": 1}}, "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True}})
        self._write_json(env["SYMPHONY_PROVIDER_CAPACITY_STATE"], {
            "schema": self.module.CAPACITY_SCHEMA, "observedAt": "2026-09-07T16:20:00Z",
            "providers": {"grok": {"limit": 4, "status": "available"}}, "events": {},
        })
        self._write_json(env["SYMPHONY_FALLBACK_PICKUP_RECEIPT"], {
            "schema": self.module.PICKUP_SCHEMA, "observedAt": "2026-09-07T16:20:00Z",
            "event": "idle", "reason": "capacity_full", "lockCount": 0,
        })
        clock = time.mktime(time.strptime("2026-09-07T16:21:00Z", "%Y-%m-%dT%H:%M:%SZ"))
        dormant = self.module.probe_health(env, now=clock)
        self.assertEqual(dormant["throughput"], "dormant_with_capacity")
        self._write_json(env["SYMPHONY_FALLBACK_PICKUP_RECEIPT"], {
            "schema": self.module.PICKUP_SCHEMA, "observedAt": "2026-09-07T16:20:00Z",
            "event": "idle", "reason": "no_eligible_issue", "lockCount": 0,
        })
        self.assertEqual(self.module.probe_health(env, now=clock)["throughput"], "idle_no_work")
        self._write_json(env["SYMPHONY_FALLBACK_PICKUP_RECEIPT"], {
            "schema": self.module.PICKUP_SCHEMA, "observedAt": "2026-09-07T16:20:00Z",
            "event": "lease_start", "reason": "lease_start", "lockCount": 1,
        })
        self.assertEqual(self.module.probe_health(env, now=clock)["throughput"], "delivering")
        self.assertEqual(self.module.hud_projection({}), {"status": "unknown", "detail": "cursor-cli health receipt missing"})
        self.assertEqual(self.module.hud_projection({"schema": self.module.SCHEMA, "status": "admission_held", "throughput": "admission_held"}), {"status": "admission_held", "detail": "cursor-cli admission_held"})

    def test_reconcile_and_stale_override(self):
        installer = self.write_binary(
            "mkdir -p \"$HOME/.local/share/cursor-agent/versions/2026.09.07\"\n"
            "printf '%s\\n' '#!/bin/sh' 'case \"$1\" in' '  --version) echo cursor-agent 2026.09.07;;' '  status|whoami) echo logged in;;' '  models) echo cursor-grok-4.6-high-fast;;' '  *) exit 0;;' 'esac' > \"$HOME/.local/share/cursor-agent/versions/2026.09.07/cursor-agent\"\n"
            "chmod 755 \"$HOME/.local/share/cursor-agent/versions/2026.09.07/cursor-agent\"\n",
            name="official-install",
        )
        code, payload = self.module.reconcile({**self.env, "CURSOR_AGENT_INSTALL_BIN": str(installer)})
        self.assertEqual(code, self.module.EXIT_OK, payload)
        self.assertTrue((self.home / ".local/bin/cursor-agent-std").is_file())
        newest = self.home / ".local/share/cursor-agent/versions/2026.09.07/cursor-agent"
        newest.parent.mkdir(parents=True, exist_ok=True)
        newest.write_text("#!/bin/sh\ncase \"$1\" in\n  --version) echo cursor-agent 2026.09.07;;\n  status|whoami) echo logged in;;\n  models) echo cursor-grok-4.6-high-fast;;\n  *) exit 0;;\nesac\n", encoding="utf-8")
        newest.chmod(0o755)
        stale = self.write_binary(
            "case \"$1\" in\n  --version) echo cursor-agent 2026.08.11-e8db854;;\n  status|whoami) echo logged in;;\n  models) echo cursor-grok-4.6-high-fast;;\n  *) exit 0;;\nesac\n",
            name="stale-agent",
        )
        wrapper = self.module.install_wrapper(self.env)
        self.assertIn("stale_binary_selected", self.module.probe_health({**self.env, "CURSOR_AGENT_REAL": str(stale), "GEM_CURSOR_EXECUTABLE": str(wrapper)})["reasons"])
        shutil.rmtree(self.home / ".local/share/cursor-agent/versions", ignore_errors=True)
        marker = self.home / "updated"
        binary = self.write_binary(
            "case \"$1\" in\n  --version) echo cursor-agent 2026.09.07-abcd;;\n  status|whoami) echo logged in;;\n"
            f"  models) echo cursor-grok-4.6-high-fast;;\n  update) echo updated > {marker};;\n  *) exit 2;;\nesac\n"
        )
        code, payload = self.module.reconcile({**self.env, "CURSOR_AGENT_REAL": str(binary), "CURSOR_AGENT_UPDATE": "1"})
        self.assertEqual(code, self.module.EXIT_OK, payload)
        self.assertTrue(marker.is_file())


class CursorCliInstallerTests(unittest.TestCase):
    def test_installer_stays_exact_main_and_never_starts_units(self):
        text = INSTALLER.read_text(encoding="utf-8")
        self.assertIn("NOT_EXACT_MAIN", text)
        self.assertIn("never starts", text.lower())
        self.assertNotIn("systemctl --user enable", text)
        self.assertNotIn("systemctl --user start", text)


if __name__ == "__main__":
    unittest.main()
