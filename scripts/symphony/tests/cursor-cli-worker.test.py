#!/usr/bin/env python3
"""Install, health, and fail-closed regressions for the Cursor CLI worker."""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/symphony"
WORKER = SOURCE_DIR / "cursor-cli-worker.py"
INSTALLER = SOURCE_DIR / "install-cursor-cli-worker.sh"
SERVICE = SOURCE_DIR / "systemd/cursor-cli-worker.service"
TIMER = SOURCE_DIR / "systemd/cursor-cli-worker.timer"


def load_worker():
    import importlib.util

    spec = importlib.util.spec_from_file_location("cursor_cli_worker", WORKER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ini_value(text: str, key: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{key}="):
            return stripped.split("=", 1)[1].strip()
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
        success = set((ini_value(service, "SuccessExitStatus") or "").split())
        self.assertEqual(success, {"0", str(module.EXIT_UNHEALTHY)})
        self.assertNotIn(str(module.EXIT_DEGRADED), success)
        timer = TIMER.read_text(encoding="utf-8")
        self.assertEqual(ini_value(timer, "OnBootSec"), "30s")
        self.assertEqual(ini_value(timer, "OnUnitInactiveSec"), "2min")
        self.assertEqual(ini_value(timer, "Persistent"), "true")

    def test_registry_requests_live_fast_catalog_id(self):
        registry = json.loads((SOURCE_DIR / "config/model-registry.json").read_text())
        cursor = next(model for model in registry["models"] if model["id"] == "cursor-grok-4.6")
        self.assertEqual(cursor["model"], "cursor-grok-4.6-high-fast")


class CursorCliWorkerBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.module = load_worker()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = pathlib.Path(self.tmp.name) / "home"
        self.home.mkdir()
        self.env = {
            "SYMPHONY_CURSOR_CLI_HOME": str(self.home),
            "HOME": str(self.home),
            "GEM_CURSOR_HEALTH_RECEIPT": str(self.home / "health.json"),
        }

    def write_binary(self, script: str, name="cursor-agent"):
        path = self.home / "bin" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("#!/bin/sh\n" + script, encoding="utf-8")
        path.chmod(0o755)
        return path

    def test_health_fails_closed_when_binary_missing(self):
        payload = self.module.probe_health(self.env)
        self.assertEqual(payload["status"], "unhealthy")
        self.assertIn("wrapper_missing", payload["reasons"])
        self.assertIn("binary_missing", payload["reasons"])
        self.assertEqual(payload["requestedModel"], "cursor-grok-4.6-high-fast")

    def test_ready_when_wrapper_binary_auth_and_model_match(self):
        binary = self.write_binary(
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.09.07-abcd;;\n"
            "  status|whoami) echo logged in as testdriver;;\n"
            "  models) echo 'Available models: auto, cursor-grok-4.6-high-fast';;\n"
            "  *) exit 2;;\n"
            "esac\n"
        )
        wrapper = self.module.install_wrapper(self.env)
        env = {**self.env, "CURSOR_AGENT_REAL": str(binary), "GEM_CURSOR_EXECUTABLE": str(wrapper)}
        payload = self.module.probe_health(env)
        self.assertEqual(payload["status"], "ready", payload)
        self.assertEqual(payload["throughput"], "unknown")
        self.assertEqual(payload["hostRole"], "gem")
        self.assertEqual(payload["hostLabel"], "Ubuntu Symphony")
        self.assertEqual(payload["hosts"]["pro"], "mac.lan")
        self.assertEqual(payload["hosts"]["air"], "off")
        self.assertEqual(payload["hosts"]["pc"], "dead")
        self.assertEqual(payload["pinnedExecutable"], self.module.PINNED_EXECUTABLE)
        self.assertEqual(payload["codex"], "out_until_weekly_reset")
        self.assertTrue(payload["authenticated"])
        self.assertIn("cursor-grok-4.6-high-fast", payload["models"])

    def test_unauthenticated_and_wrong_model_fail_closed(self):
        binary = self.write_binary(
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.09.07-abcd;;\n"
            "  status|whoami) echo not logged in >&2; exit 1;;\n"
            "  models) echo 'Available models: auto, cursor-grok-4.6-high';;\n"
            "  *) exit 2;;\n"
            "esac\n"
        )
        wrapper = self.module.install_wrapper(self.env)
        env = {**self.env, "CURSOR_AGENT_REAL": str(binary), "GEM_CURSOR_EXECUTABLE": str(wrapper)}
        payload = self.module.probe_health(env)
        self.assertEqual(payload["status"], "unhealthy")
        self.assertIn("unauthenticated", payload["reasons"])
        self.assertIn("requested_model_unlisted", payload["reasons"])

    def test_stale_version_is_unhealthy(self):
        binary = self.write_binary(
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.08.11-e8db854;;\n"
            "  status|whoami) echo logged in;;\n"
            "  models) echo cursor-grok-4.6-high-fast;;\n"
            "  *) exit 2;;\n"
            "esac\n"
        )
        wrapper = self.module.install_wrapper(self.env)
        env = {**self.env, "CURSOR_AGENT_REAL": str(binary), "GEM_CURSOR_EXECUTABLE": str(wrapper)}
        now = time.mktime(time.strptime("2026.09.07", "%Y.%m.%d"))
        payload = self.module.probe_health(env, now=now)
        self.assertEqual(payload["status"], "unhealthy")
        self.assertIn("binary_stale", payload["reasons"])

    def test_reconcile_installs_wrapper_and_official_binary(self):
        installer = self.write_binary(
            "mkdir -p \"$HOME/.local/share/cursor-agent/versions/2026.09.07\"\n"
            "printf '%s\\n' '#!/bin/sh' 'case \"$1\" in' '  --version) echo cursor-agent 2026.09.07;;' '  status|whoami) echo logged in;;' '  models) echo cursor-grok-4.6-high-fast;;' '  *) exit 0;;' 'esac' > \"$HOME/.local/share/cursor-agent/versions/2026.09.07/cursor-agent\"\n"
            "chmod 755 \"$HOME/.local/share/cursor-agent/versions/2026.09.07/cursor-agent\"\n",
            name="official-install",
        )
        env = {**self.env, "CURSOR_AGENT_INSTALL_BIN": str(installer)}
        code, payload = self.module.reconcile(env)
        self.assertEqual(code, self.module.EXIT_OK, payload)
        self.assertEqual(payload["status"], "ready")
        self.assertTrue((self.home / ".local/bin/cursor-agent-std").is_file())
        self.assertTrue((self.home / ".local/bin/cursor-cli-worker").is_file())
        receipt = json.loads((self.home / "health.json").read_text())
        self.assertEqual(receipt["schema"], self.module.SCHEMA)

    def test_hud_projection_is_fail_closed_without_receipt(self):
        self.assertEqual(
            self.module.hud_projection({}),
            {"status": "unknown", "detail": "cursor-cli health receipt missing"},
        )
        self.assertEqual(
            self.module.hud_projection({"schema": self.module.SCHEMA, "status": "ready", "requestedModel": "cursor-grok-4.6-high-fast"}),
            {"status": "ready", "detail": "cursor-cli cursor-grok-4.6-high-fast"},
        )
        self.assertEqual(
            self.module.hud_projection({
                "schema": self.module.SCHEMA,
                "status": "admission_held",
                "throughput": "admission_held",
                "reasons": [],
            }),
            {"status": "admission_held", "detail": "cursor-cli admission_held"},
        )
        self.assertEqual(
            self.module.hud_projection({
                "schema": self.module.SCHEMA,
                "status": "unhealthy",
                "throughput": "dormant_with_capacity",
                "reasons": ["dormant_with_capacity"],
            }),
            {"status": "unhealthy", "detail": "cursor-cli dormant_with_capacity"},
        )

    def _healthy_env(self, models="auto, cursor-grok-4.6-high-fast, cursor-grok-4.6-high, gpt-5.6-luna"):
        binary = self.write_binary(
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.09.07-abcd;;\n"
            "  status|whoami) echo logged in as testdriver;;\n"
            f"  models) echo 'Available models: {models}';;\n"
            "  update) echo updated;;\n"
            "  *) exit 2;;\n"
            "esac\n"
        )
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

    def test_catalog_gap_is_observational_and_does_not_enroll(self):
        env = self._healthy_env()
        payload = self.module.probe_health(env)
        self.assertEqual(payload["status"], "ready", payload)
        self.assertIn("cursor-grok-4.6-high", payload["catalogGap"])
        self.assertNotIn("auto", payload["catalogGap"])
        self.assertNotIn("cursor-grok-4.6-high-fast", payload["catalogGap"])
        self.assertEqual(payload["enrolledModels"], ["cursor-grok-4.6-high-fast", "gpt-5.6-luna"])

    def test_admission_held_is_jov_5492_gate_not_useful_turn(self):
        env = self._healthy_env()
        self._write_json(env["GEM_FLEET_GATE_RECEIPT"], {
            "schema": self.module.FLEET_GATE_SCHEMA,
            "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True},
            "concurrency": {"gem": {"maxConcurrent": 0}},
        })
        payload = self.module.probe_health(env)
        self.assertEqual(payload["status"], "admission_held", payload)
        self.assertEqual(payload["throughput"], "admission_held")
        self.assertEqual(payload["admissionGate"], "JOV-5492")
        self.assertNotIn("usefulCompletions", payload)

    def test_dormant_with_capacity_fails_when_seats_exist_and_pickup_is_idle(self):
        env = self._healthy_env()
        self._write_json(env["SYMPHONY_PROVIDER_CAPACITY_STATE"], {
            "schema": self.module.CAPACITY_SCHEMA,
            "observedAt": "2026-09-07T16:20:00Z",
            "providers": {"grok": {"limit": 4, "status": "available", "pressureCount": 0, "usefulCompletions": 0}},
            "events": {},
        })
        self._write_json(env["SYMPHONY_FALLBACK_PICKUP_RECEIPT"], {
            "schema": self.module.PICKUP_SCHEMA,
            "observedAt": "2026-09-07T16:20:00Z",
            "event": "idle",
            "reason": "capacity_full",
            "lockCount": 0,
        })
        now = time.mktime(time.strptime("2026-09-07T16:21:00Z", "%Y-%m-%dT%H:%M:%SZ"))
        payload = self.module.probe_health(env, now=now)
        self.assertEqual(payload["status"], "unhealthy", payload)
        self.assertEqual(payload["throughput"], "dormant_with_capacity")
        self.assertIn("dormant_with_capacity", payload["reasons"])

    def test_idle_no_work_stays_ready_and_delivering_is_not_dormant(self):
        env = self._healthy_env()
        now = time.mktime(time.strptime("2026-09-07T16:21:00Z", "%Y-%m-%dT%H:%M:%SZ"))
        self._write_json(env["SYMPHONY_FALLBACK_PICKUP_RECEIPT"], {
            "schema": self.module.PICKUP_SCHEMA,
            "observedAt": "2026-09-07T16:20:00Z",
            "event": "idle",
            "reason": "no_eligible_issue",
            "lockCount": 0,
        })
        idle = self.module.probe_health(env, now=now)
        self.assertEqual(idle["status"], "ready", idle)
        self.assertEqual(idle["throughput"], "idle_no_work")
        self._write_json(env["SYMPHONY_FALLBACK_PICKUP_RECEIPT"], {
            "schema": self.module.PICKUP_SCHEMA,
            "observedAt": "2026-09-07T16:20:00Z",
            "event": "lease_start",
            "reason": "lease_start",
            "lockCount": 1,
        })
        delivering = self.module.probe_health(env, now=now)
        self.assertEqual(delivering["status"], "ready", delivering)
        self.assertEqual(delivering["throughput"], "delivering")

    def test_stale_override_fails_closed_when_newer_version_exists(self):
        newest = self.home / ".local/share/cursor-agent/versions/2026.09.07/cursor-agent"
        newest.parent.mkdir(parents=True)
        newest.write_text(
            "#!/bin/sh\n"
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.09.07;;\n"
            "  status|whoami) echo logged in;;\n"
            "  models) echo cursor-grok-4.6-high-fast;;\n"
            "  *) exit 0;;\n"
            "esac\n",
            encoding="utf-8",
        )
        newest.chmod(0o755)
        stale = self.write_binary(
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.08.11-e8db854;;\n"
            "  status|whoami) echo logged in;;\n"
            "  models) echo cursor-grok-4.6-high-fast;;\n"
            "  *) exit 0;;\n"
            "esac\n",
            name="stale-agent",
        )
        wrapper = self.module.install_wrapper(self.env)
        env = {**self.env, "CURSOR_AGENT_REAL": str(stale), "GEM_CURSOR_EXECUTABLE": str(wrapper)}
        payload = self.module.probe_health(env)
        self.assertEqual(payload["status"], "unhealthy")
        self.assertIn("stale_binary_selected", payload["reasons"])

    def test_reconcile_updates_asap_when_authorized_and_rebinds_wrapper(self):
        marker = self.home / "updated"
        binary = self.write_binary(
            "case \"$1\" in\n"
            "  --version) echo cursor-agent 2026.09.07-abcd;;\n"
            "  status|whoami) echo logged in;;\n"
            "  models) echo cursor-grok-4.6-high-fast;;\n"
            f"  update) echo updated > {marker};;\n"
            "  *) exit 2;;\n"
            "esac\n"
        )
        env = {
            **self.env,
            "CURSOR_AGENT_REAL": str(binary),
            "CURSOR_AGENT_UPDATE": "1",
        }
        code, payload = self.module.reconcile(env)
        self.assertEqual(code, self.module.EXIT_OK, payload)
        self.assertTrue(marker.is_file())
        self.assertTrue((self.home / ".local/bin/cursor-agent-std").is_file())
        self.assertEqual(payload["status"], "ready")


class CursorCliInstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.repo = self.root / "repo"
        fixture = self.repo / "scripts/symphony"
        (fixture / "systemd").mkdir(parents=True)
        shutil.copy2(INSTALLER, fixture / INSTALLER.name)
        shutil.copy2(SOURCE_DIR / "cursor-agent-std", fixture / "cursor-agent-std")
        shutil.copy2(WORKER, fixture / WORKER.name)
        shutil.copy2(SERVICE, fixture / "systemd" / SERVICE.name)
        shutil.copy2(TIMER, fixture / "systemd" / TIMER.name)
        self.git("init", "-b", "main")
        self.git("add", "scripts")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        self.home = self.root / "home"
        self.home.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(
            ["git", "-C", str(self.repo), *args],
            capture_output=True,
            text=True,
            check=True,
        )

    def run_installer(self, *args):
        env = os.environ.copy()
        env["SYMPHONY_CURSOR_CLI_HOME"] = str(self.home)
        return subprocess.run(
            ["bash", str(self.repo / "scripts/symphony" / INSTALLER.name), "--no-daemon-reload", *args],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )

    def test_check_is_fail_closed_when_uninstalled(self):
        result = self.run_installer("--check")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("MISSING", result.stdout)

    def test_install_from_exact_main_writes_known_good_executable(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        executable = self.home / ".local/bin/cursor-agent-std"
        self.assertTrue(executable.is_file())
        self.assertEqual(executable.read_bytes(), (SOURCE_DIR / "cursor-agent-std").read_bytes())
        receipt = json.loads((self.home / ".local/state/symphony-cursor-cli/install-receipt.json").read_text())
        self.assertEqual(receipt["schema"], "symphony-cursor-cli-install/v1")
        self.assertEqual(receipt["gemCursorExecutable"], str(executable))
        checked = self.run_installer("--check")
        self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
        self.assertIn("RECEIPT_OK", checked.stdout)

    def test_install_is_rejected_when_head_is_not_exact_main(self):
        (self.repo / "scripts/symphony/systemd" / SERVICE.name).write_text("# drift\n", encoding="utf-8")
        self.git("add", "scripts")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "ahead of main")
        result = self.run_installer()
        self.assertEqual(result.returncode, 2)
        self.assertIn("NOT_EXACT_MAIN", result.stderr)
        self.assertFalse((self.home / ".local/bin/cursor-agent-std").exists())


if __name__ == "__main__":
    unittest.main()
