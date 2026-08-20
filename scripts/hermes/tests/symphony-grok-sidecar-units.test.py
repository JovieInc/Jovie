#!/usr/bin/env python3
"""Installer and exit-classification regressions for the versioned Symphony
Grok sidecar units (JOV-5027).

Covers:
- the versioned systemd units declare the exit-status contract (exit 2 = typed
  safe fail-closed, classified as success; exit 3 = degraded handoff, still a
  real unit failure),
- reconcile() maps every preserved-state path to EXIT_SAFE_FAIL_CLOSED and
  every degraded path to EXIT_DEGRADED,
- install-symphony-grok-sidecar.sh installs deterministically from exact
  origin/main and writes a binding install receipt.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "scripts/hermes"
CONTROLLER = SOURCE_DIR / "symphony-codex-exhausted.py"
INSTALLER = SOURCE_DIR / "install-symphony-grok-sidecar.sh"
UNIT_DIR = SOURCE_DIR / "systemd"
SERVICE = UNIT_DIR / "symphony-grok-sidecar.service"
TIMER = UNIT_DIR / "symphony-grok-sidecar.timer"
UNIT_NAMES = (SERVICE.name, TIMER.name)
RECEIPT_SCHEMA = "symphony-grok-sidecar-install/v1"


def load_controller_module():
    spec = importlib.util.spec_from_file_location("symphony_codex_exhausted", CONTROLLER)
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


class UnitContractTests(unittest.TestCase):
    def test_exit_codes_are_typed_and_distinct(self):
        module = load_controller_module()
        self.assertEqual(module.EXIT_SAFE_FAIL_CLOSED, 2)
        self.assertEqual(module.EXIT_DEGRADED, 3)

    def test_service_declares_safe_fail_closed_without_hiding_degraded(self):
        module = load_controller_module()
        text = SERVICE.read_text(encoding="utf-8")
        self.assertEqual(ini_value(text, "Type"), "oneshot")
        self.assertEqual(ini_value(text, "ExecStart"), "%h/.local/bin/symphony-grok-sidecar")
        success = set((ini_value(text, "SuccessExitStatus") or "").split())
        self.assertEqual(
            success,
            {"0", str(module.EXIT_SAFE_FAIL_CLOSED)},
            "the unit must classify exactly the typed safe fail-closed exit as success",
        )
        self.assertNotIn(
            str(module.EXIT_DEGRADED),
            success,
            "degraded handoffs must remain real unit failures",
        )

    def test_timer_matches_live_schedule(self):
        text = TIMER.read_text(encoding="utf-8")
        self.assertEqual(ini_value(text, "OnBootSec"), "2m")
        self.assertEqual(ini_value(text, "OnUnitActiveSec"), "20m")
        self.assertEqual(ini_value(text, "Persistent"), "true")
        self.assertEqual(ini_value(text, "WantedBy"), "timers.target")


class ExitClassificationTests(unittest.TestCase):
    def setUp(self):
        self.module = load_controller_module()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = pathlib.Path(self.tmp.name)
        probe = root / "model-probe"
        probe.write_text("#!/bin/sh\necho qwen3-coder:30b\n", encoding="utf-8")
        probe.chmod(0o755)
        agent = root / "model-agent"
        agent.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        agent.chmod(0o755)
        gate = root / "gate.json"
        gate.write_text(json.dumps({
            "schema": "jovie-fleet-gate/v1",
            "state": "AMBER",
            "workAdmission": {"allowed": True},
        }), encoding="utf-8")
        environment = mock.patch.dict(os.environ, {
            "GEM_FLEET_GATE_RECEIPT": str(gate),
            "GEM_PR_DRAIN_QWEN": str(probe),
            "GEM_QWEN_AGENT_EXECUTABLE": str(agent),
            "GEM_CURSOR_EXECUTABLE": "/missing",
            "GEM_KIMI_EXECUTABLE": "/missing",
            "GEM_GROK_EXECUTABLE": "/missing",
            "GEM_CLAUDE_EXECUTABLE": "/missing",
            "GEM_DEEPSEEK_EXECUTABLE": "/missing",
        })
        environment.start()
        self.addCleanup(environment.stop)

    def test_indeterminate_probe_is_safe_fail_closed(self):
        module = self.module
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(False, "probe_failed")),
            mock.patch.object(module, "_control", return_value=True) as control,
        ):
            self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)
        control.assert_not_called()

    def test_exhausted_prehandoff_failures_are_safe_fail_closed(self):
        module = self.module
        cases = (
            ("grok_executable_missing", None, ["JOV-1"], []),
            ("linear_query_failed", "/bin/true", None, []),
            ("grok_state_query_failed", "/bin/true", ["JOV-1"], None),
        )
        for expected, executable, identifiers, active in cases:
            with self.subTest(expected=expected):
                with (
                    mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
                    mock.patch.object(module, "_grok_ship_one_executable", return_value=executable),
                    mock.patch.object(module, "_linear_identifiers", return_value=identifiers),
                    mock.patch.object(module, "_active_grok_units", return_value=active),
                    mock.patch.object(module, "_control", return_value=True) as control,
                ):
                    self.assertEqual(module.reconcile(), module.EXIT_SAFE_FAIL_CLOSED)
                control.assert_not_called()

    def test_ready_but_symphony_not_running_is_degraded(self):
        module = self.module
        for failing_command, expected_reason in (
            ("start", "symphony_start_failed"),
            ("is-active", "symphony_not_active"),
        ):
            with self.subTest(expected_reason=expected_reason):
                def control(command, failing=failing_command):
                    return failing not in command

                with (
                    mock.patch.object(module, "codex_canary_ready", return_value=(True, "ready")),
                    mock.patch.object(module, "_active_grok_units", return_value=[]),
                    mock.patch.object(module, "_control", side_effect=control),
                ):
                    self.assertEqual(module.reconcile(), module.EXIT_DEGRADED)

    def test_ready_codex_drains_included_pools_without_stopping_symphony(self):
        module = self.module
        controls: list[list[str]] = []
        selection = {
            "schema_version": 1,
            "deterministic_first": True,
            "selected": {
                "id": "cursor-grok-4.6",
                "provider": "cursor",
                "model": "grok-4.6",
                "pool": "cursor-models",
                "executor": {"executable": "/bin/true", "argv": ["{prompt}"]},
            },
        }
        with (
            mock.patch.object(module, "codex_canary_ready", return_value=(True, "ready")),
            mock.patch.object(module, "_active_grok_units", return_value=[]),
            mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
            mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"]),
            mock.patch.object(module, "_model_router_selection", return_value=(selection, "model_router_ready")),
            mock.patch.object(module, "_bundle_revision", return_value="a" * 64),
            mock.patch.object(module, "_fetch_single_issue", return_value={"identifier": "JOV-1"}),
            mock.patch.object(
                module,
                "_issue_meta",
                return_value=(True, "admitted", {"issue_revision": "2026-08-17T00:00:00Z"}),
            ),
            mock.patch.object(
                module,
                "_control",
                side_effect=lambda command: controls.append(command) or True,
            ),
            mock.patch("sys.stderr", new_callable=lambda: __import__("io").StringIO()) as stderr,
        ):
            self.assertEqual(module.reconcile(), 0)
        self.assertTrue(any(command[:3] == ["systemctl", "--user", "start"] for command in controls))
        self.assertTrue(any(command[0] == "systemd-run" for command in controls))
        self.assertFalse(
            any(command[:3] == ["systemctl", "--user", "stop"] for command in controls)
        )
        self.assertIn("drain_started=1", stderr.getvalue())
        self.assertIn("pool=cursor-models", stderr.getvalue())

    def test_degraded_handoffs_exit_distinctly_from_safe_fail_closed(self):
        module = self.module
        issue = {"identifier": "placeholder", "team": {"key": "JOV"}, "labels": {"nodes": []}, "state": {"name": "Todo"}}
        cases = (
            # final grok state unknowable after the stop -> ownership unknown
            ("grok_state_query_failed symphony_stopped", [[], None], True),
            # cleanup could not be verified -> symphony left stopped
            ("grok_cleanup_unverified symphony_stopped", [[], [], ["grok-ship-JOV-1.service"]], True),
        )
        for expected_reason, active_snapshots, launch in cases:
            with self.subTest(expected_reason=expected_reason):
                with (
                    mock.patch.object(module, "codex_canary_ready", return_value=(False, "all_accounts_cooldown")),
                    mock.patch.object(module, "_grok_ship_one_executable", return_value="/bin/true"),
                    mock.patch.object(module, "_linear_identifiers", return_value=["JOV-1"] if launch else []),
                    mock.patch.object(module, "_grok_canary_ready", return_value=(True, "grok_provider_ready")),
                    mock.patch.object(module, "_active_grok_units", side_effect=active_snapshots),
                    mock.patch.object(module, "_fetch_single_issue", return_value=issue),
                    mock.patch.object(module, "_issue_meta", return_value=(True, "admitted", {"issue_revision": "2026-08-14T19:00:00Z"})),
                    mock.patch.object(module, "_control", return_value=True),
                ):
                    self.assertEqual(module.reconcile(), module.EXIT_DEGRADED)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.repo = self.root / "repo"
        fixture_hermes = self.repo / "scripts/hermes"
        (fixture_hermes / "systemd").mkdir(parents=True)
        shutil.copy2(INSTALLER, fixture_hermes / INSTALLER.name)
        for name in UNIT_NAMES:
            shutil.copy2(UNIT_DIR / name, fixture_hermes / "systemd" / name)
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
            capture_output=True, text=True, check=True,
        )

    def run_installer(self, *args):
        env = os.environ.copy()
        env["SYMPHONY_GROK_SIDECAR_HOME"] = str(self.home)
        return subprocess.run(
            ["bash", str(self.repo / "scripts/hermes" / INSTALLER.name), "--no-daemon-reload", *args],
            capture_output=True, text=True, env=env, check=False,
        )

    def receipt_path(self) -> pathlib.Path:
        return self.home / ".local/state/symphony-grok-sidecar/install-receipt.json"

    def test_install_from_exact_main_writes_binding_receipt(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        head = self.git("rev-parse", "HEAD").stdout.strip()
        receipt = json.loads(self.receipt_path().read_text(encoding="utf-8"))
        self.assertEqual(receipt["schema"], RECEIPT_SCHEMA)
        self.assertEqual(receipt["source"], {"head": head, "originMain": head})
        self.assertEqual(set(receipt["units"]), set(UNIT_NAMES))
        for name in UNIT_NAMES:
            installed = self.home / ".config/systemd/user" / name
            self.assertEqual(installed.read_bytes(), (UNIT_DIR / name).read_bytes())
            digest = hashlib.sha256(installed.read_bytes()).hexdigest()
            self.assertEqual(receipt["units"][name], digest)
        checked = self.run_installer("--check")
        self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
        self.assertIn("RECEIPT_OK", checked.stdout)

    def test_install_is_rejected_when_head_is_not_exact_main(self):
        (self.repo / "scripts/hermes/systemd" / SERVICE.name).write_text("# drift\n", encoding="utf-8")
        self.git("add", "scripts")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "ahead of main")
        result = self.run_installer()
        self.assertEqual(result.returncode, 2)
        self.assertIn("NOT_EXACT_MAIN", result.stderr)
        self.assertFalse((self.home / ".config/systemd/user" / SERVICE.name).exists())
        self.assertFalse(self.receipt_path().exists())

    def test_install_is_rejected_when_unit_sources_are_dirty(self):
        (self.repo / "scripts/hermes/systemd" / TIMER.name).write_text("# dirty\n", encoding="utf-8")
        result = self.run_installer()
        self.assertEqual(result.returncode, 2)
        self.assertIn("DIRTY_SOURCES", result.stderr)
        self.assertFalse(self.receipt_path().exists())

    def test_check_detects_drift_and_missing_receipt(self):
        self.assertEqual(self.run_installer().returncode, 0)
        installed = self.home / ".config/systemd/user" / SERVICE.name
        installed.write_text(installed.read_text(encoding="utf-8") + "# tampered\n", encoding="utf-8")
        drifted = self.run_installer("--check")
        self.assertEqual(drifted.returncode, 1)
        self.assertIn("DRIFT", drifted.stdout)

        self.assertEqual(self.run_installer().returncode, 0)
        self.receipt_path().unlink()
        missing = self.run_installer("--check")
        self.assertEqual(missing.returncode, 1)
        self.assertIn("MISSING", missing.stdout)


if __name__ == "__main__":
    unittest.main()
