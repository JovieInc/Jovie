#!/usr/bin/env python3

from __future__ import annotations

import argparse
import importlib.util
import io
import json
import pathlib
import re
import subprocess
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/symphony-concurrency-controller.py"
UNIT_DIR = ROOT / "scripts/hermes/systemd"
SERVICE_UNIT = UNIT_DIR / "symphony-concurrency-controller.service"
TIMER_UNIT = UNIT_DIR / "symphony-concurrency-controller.timer"
INSTALLER = ROOT / "scripts/hermes/install-symphony-ui-pilot.sh"
SPEC = importlib.util.spec_from_file_location("symphony_concurrency_controller", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def low_sample(cpu_count: int = 8) -> dict:
    return {
        "cpuCount": cpu_count,
        "cpuSomeAvg10": 0.0,
        "memoryFullAvg10": 0.0,
        "ioFullAvg10": 0.0,
        "availableMemoryBytes": 55 * 1024**3,
    }


def ini_value(text: str, key: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{key}="):
            return stripped.split("=", 1)[1].strip()
    return None


def timespan_seconds(value: str) -> int:
    units = {"s": 1, "sec": 1, "min": 60, "m": 60, "h": 3600}
    match = re.fullmatch(r"([0-9]+)\s*([a-z]+)", value.strip())
    if match is None or match.group(2) not in units:
        raise AssertionError(f"unsupported systemd timespan: {value!r}")
    return int(match.group(1)) * units[match.group(2)]


def provider(accounts: int = 8, locked: int = 4, available: int = 4) -> dict:
    profiles = [f"{index + 1:064x}" for index in range(accounts)]
    cooldown = accounts - locked - available
    locked_profiles = sorted(profiles[:locked])
    available_profiles = sorted(profiles[locked : locked + available])
    cooldown_profiles = sorted(profiles[locked + available :])
    return {
        "provider": "openai",
        "state": "available",
        "accounts": accounts,
        "locked": locked,
        "cooldown": cooldown,
        "available": available,
        "lockedProfiles": locked_profiles,
        "cooldownProfiles": cooldown_profiles,
        "availableProfiles": available_profiles,
        "eligibleProfiles": sorted(locked_profiles + available_profiles),
    }


def capacity(target: int = 8) -> dict:
    return {
        "target": target,
        "accepted": True,
        "rows": [
            {"provider": "openai", "profile": f"{index + 1:064x}"}
            for index in range(target)
        ],
    }


RUNTIME = {"running": 4, "retrying": 0, "codexTotals": {"seconds_running": 100}}
SCOPE = {
    "kind": "gem-host-provider-accounts-workflow",
    "host": "gem",
    "workflow": "/workflows/jovie.md",
    "runtimeUrl": "http://127.0.0.1:4041/api/v1/state",
    "leaseGuard": "/bin/symphony-lease-guard",
    "capacityEvidence": "/state/concurrency.json",
}


class PressureParsingTests(unittest.TestCase):
    def test_parses_selected_psi_line(self):
        text = "some avg10=3.25 avg60=1.00 total=1\nfull avg10=0.50 avg60=0.25 total=2\n"
        self.assertEqual(MODULE.parse_pressure(text, "some"), 3.25)
        self.assertEqual(MODULE.parse_pressure(text, "full"), 0.5)

    def test_provider_capacity_rejects_boolean_counts_and_nonopaque_profiles(self):
        invalid = []
        boolean_count = provider()
        boolean_count["accounts"] = True
        invalid.append(boolean_count)
        raw_profile = provider()
        raw_profile["availableProfiles"][-1] = "account-8"
        raw_profile["eligibleProfiles"][-1] = "account-8"
        invalid.append(raw_profile)
        invalid_provider = provider()
        invalid_provider["provider"] = "OpenAI"
        invalid.append(invalid_provider)

        for capacity in invalid:
            with self.subTest(capacity=capacity):
                with mock.patch.object(
                    MODULE.subprocess,
                    "run",
                    return_value=mock.Mock(
                        stdout=json.dumps({"capacity": capacity})
                    ),
                ):
                    self.assertIsNone(
                        MODULE.read_provider_capacity(pathlib.Path("/guard"))
                    )


class HysteresisTests(unittest.TestCase):
    def decide(self, current: int, low_streak: int, sample: dict | None = None):
        return MODULE.choose_target(
            current=current,
            state={"lowStreak": low_streak, "lastChangeEpoch": 0.0},
            sample=sample or low_sample(),
            provider=provider(),
            capacity=capacity(),
            runtime=RUNTIME,
            integrity_allowed=True,
            now_epoch=1000.0,
        )

    def test_requires_three_low_pressure_samples_before_scale_up(self):
        self.assertEqual(self.decide(4, 0), (4, 1, "low-pressure-hysteresis"))
        self.assertEqual(self.decide(4, 1), (4, 2, "low-pressure-hysteresis"))
        self.assertEqual(self.decide(4, 2), (5, 0, "sustained-low-pressure"))

    def test_measured_saturation_sheds_one_slot_immediately(self):
        sample = low_sample()
        sample["ioFullAvg10"] = 12.0
        self.assertEqual(self.decide(6, 2, sample), (5, 0, "measured-saturation"))

    def test_severe_pressure_falls_to_minimum(self):
        sample = low_sample()
        sample["availableMemoryBytes"] = 2 * 1024**3
        self.assertEqual(self.decide(6, 2, sample), (1, 0, "severe-pressure"))

    def test_provider_capacity_caps_scale_up(self):
        target = MODULE.choose_target(
            current=4,
            state={"lowStreak": 2, "lastChangeEpoch": 0.0},
            sample=low_sample(),
            provider=provider(accounts=4, locked=3, available=1),
            capacity=capacity(),
            runtime=RUNTIME,
            integrity_allowed=True,
            now_epoch=1000.0,
        )
        self.assertEqual(target, (4, 3, "low-pressure-hysteresis"))

    def test_missing_runtime_or_provider_evidence_fails_closed(self):
        for missing_provider, missing_runtime in ((None, RUNTIME), (provider(), None)):
            with self.subTest(provider=missing_provider, runtime=missing_runtime):
                target = MODULE.choose_target(
                    current=6,
                    state={"lowStreak": 2, "lastChangeEpoch": 0.0},
                    sample=low_sample(),
                    provider=missing_provider,
                    capacity=capacity(),
                    runtime=missing_runtime,
                    integrity_allowed=True,
                    now_epoch=1000.0,
                )
                self.assertEqual(target, (1, 0, "required-telemetry-unavailable"))

    def test_integrity_block_fails_closed(self):
        target = MODULE.choose_target(
            current=6,
            state={"lowStreak": 2, "lastChangeEpoch": 0.0},
            sample=low_sample(),
            provider=provider(),
            capacity=capacity(),
            runtime=RUNTIME,
            integrity_allowed=False,
            now_epoch=1000.0,
        )
        self.assertEqual(target, (1, 0, "integrity-blocked"))

    def test_execution_proof_contracts_provider_ceiling(self):
        target = MODULE.choose_target(
            current=2,
            state={"lowStreak": 2, "lastChangeEpoch": 0.0},
            sample=low_sample(),
            provider=provider(accounts=4, locked=0, available=2),
            capacity=capacity(1),
            runtime=RUNTIME,
            integrity_allowed=True,
            now_epoch=1000.0,
        )
        self.assertEqual(target, (1, 0, "capacity-ceiling-contracted"))

    def test_missing_execution_proof_fails_closed_to_config_floor(self):
        target = MODULE.choose_target(
            current=4,
            state={"lowStreak": 2, "lastChangeEpoch": 0.0},
            sample=low_sample(),
            provider=provider(),
            capacity=None,
            runtime=RUNTIME,
            integrity_allowed=True,
            now_epoch=1000.0,
        )
        self.assertEqual(target, (1, 0, "required-telemetry-unavailable"))


class ResourceScopeStateTests(unittest.TestCase):
    def test_load_state_reuses_only_matching_exact_resource_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "state.json"
            path.write_text(
                MODULE.json.dumps(
                    {
                        "schema": MODULE.STATE_SCHEMA,
                        "resourceScope": SCOPE,
                        "target": 6,
                        "lowStreak": 2,
                        "lastChangeEpoch": 100.0,
                    }
                )
            )

            state = MODULE.load_state(path, current_target=4, scope=SCOPE)

        self.assertEqual(state["resourceScope"], SCOPE)
        self.assertEqual(state["target"], 6)
        self.assertEqual(state["lowStreak"], 2)

    def test_load_state_discards_unscoped_or_mismatched_resource_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "state.json"
            path.write_text(
                MODULE.json.dumps(
                    {
                        "schema": MODULE.STATE_SCHEMA,
                        "target": 6,
                        "lowStreak": 2,
                        "lastChangeEpoch": 100.0,
                    }
                )
            )

            legacy = MODULE.load_state(path, current_target=4, scope=SCOPE)
            path.write_text(
                MODULE.json.dumps(
                    {
                        "schema": MODULE.STATE_SCHEMA,
                        "resourceScope": {**SCOPE, "workflow": "/other.md"},
                        "target": 6,
                        "lowStreak": 2,
                        "lastChangeEpoch": 100.0,
                    }
                )
            )
            mismatched = MODULE.load_state(path, current_target=4, scope=SCOPE)

        self.assertEqual(legacy["resourceScope"], SCOPE)
        self.assertEqual(legacy["target"], 4)
        self.assertEqual(legacy["lowStreak"], 0)
        self.assertEqual(mismatched["resourceScope"], SCOPE)
        self.assertEqual(mismatched["target"], 4)
        self.assertEqual(mismatched["lowStreak"], 0)


class RuntimeEvidenceTests(unittest.TestCase):
    def test_reads_linux_pressure_memory_and_provider_partition(self):
        with tempfile.TemporaryDirectory() as tmp:
            proc = pathlib.Path(tmp)
            pressure = proc / "pressure"
            pressure.mkdir()
            (pressure / "cpu").write_text("some avg10=1.25 avg60=0 total=1\n")
            (proc / "meminfo").write_text("MemAvailable: 1024 kB\n")
            self.assertEqual(MODULE.read_pressure(proc, "cpu", "some"), 1.25)
            self.assertEqual(MODULE.read_available_memory(proc), 1024 * 1024)

        completed = subprocess.CompletedProcess(
            ["guard", "report"],
            0,
            stdout=json.dumps({"capacity": provider()}),
            stderr="",
        )
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            observed = MODULE.read_provider_capacity(pathlib.Path("/guard"))
        self.assertEqual(observed, provider())

    def test_reads_runtime_counts_and_rejects_malformed_runtime(self):
        response = io.BytesIO(
            json.dumps(
                {
                    "running": [{"id": 1}, {"id": 2}],
                    "retrying": [],
                    "codex_totals": {"seconds_running": 12},
                }
            ).encode()
        )
        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            observed = MODULE.read_runtime_state("http://127.0.0.1:4041/api/v1/state")
        self.assertEqual(observed["running"], 2)
        self.assertEqual(observed["retrying"], 0)

        malformed = io.BytesIO(json.dumps({"running": 2, "retrying": []}).encode())
        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=malformed):
            self.assertIsNone(MODULE.read_runtime_state("http://127.0.0.1:4041/api/v1/state"))

    def test_run_applies_only_the_evidence_bounded_workflow_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            workflow = root / "WORKFLOW.md"
            state = root / "state.json"
            receipt_path = root / "receipt.json"
            workflow.write_text(
                "---\nagent:\n  max_concurrent_agents: 1\n  max_turns: 24\n---\nprompt\n",
                encoding="utf-8",
            )
            args = argparse.Namespace(
                workflow=workflow,
                state=state,
                receipt=receipt_path,
                proc_root=root,
                lease_guard=root / "guard",
                capacity_evidence=root / "capacity.json",
                runtime_url="http://127.0.0.1:4041/api/v1/state",
                integrity_receipt=root / "integrity.json",
                dry_run=False,
            )
            with (
                mock.patch.object(MODULE.time, "time", return_value=1000.0),
                mock.patch.object(MODULE, "read_cpu_count", return_value=8),
                mock.patch.object(MODULE, "read_pressure", return_value=0.0),
                mock.patch.object(
                    MODULE, "read_available_memory", return_value=55 * 1024**3
                ),
                mock.patch.object(
                    MODULE, "read_provider_capacity", return_value=provider(4, 0, 4)
                ),
                mock.patch.object(
                    MODULE, "read_execution_capacity", return_value=capacity(4)
                ),
                mock.patch.object(
                    MODULE,
                    "read_runtime_state",
                    return_value={"running": 1, "retrying": 0, "codexTotals": {}},
                ),
                mock.patch.object(
                    MODULE, "integrity_allows_scale", return_value=(True, "clear")
                ),
                mock.patch.object(
                    MODULE,
                    "load_state",
                    return_value={
                        "lowStreak": 2,
                        "lastChangeEpoch": 0.0,
                        "target": 1,
                    },
                ),
            ):
                receipt = MODULE.run(args)

            self.assertEqual(receipt["target"], 2)
            self.assertEqual(receipt["reason"], "sustained-low-pressure")
            self.assertIn("max_concurrent_agents: 2", workflow.read_text())
            self.assertEqual(json.loads(state.read_text())["target"], 2)
            self.assertEqual(json.loads(receipt_path.read_text())["target"], 2)


class WorkflowMutationTests(unittest.TestCase):
    def test_rewrites_only_the_concurrency_scalar(self):
        source = "---\nagent:\n  max_concurrent_agents: 4\n  max_turns: 24\n---\nprompt\n"
        rendered = MODULE.render_target(source, 6)
        self.assertEqual(
            rendered,
            "---\nagent:\n  max_concurrent_agents: 6\n  max_turns: 24\n---\nprompt\n",
        )

    def test_atomic_workflow_write_preserves_complete_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "WORKFLOW.md"
            MODULE.write_workflow_atomic(path, "complete\n")
            self.assertEqual(path.read_text(), "complete\n")
            self.assertFalse((path.parent / ".WORKFLOW.md.tmp").exists())


class WorkflowOverlayIdentityTests(unittest.TestCase):
    SOURCE = "---\nagent:\n  max_concurrent_agents: 4\n  max_turns: 24\n---\nprompt\n"

    def overlay(self, value: str) -> str:
        return self.SOURCE.replace("max_concurrent_agents: 4", f"max_concurrent_agents: {value}")

    def test_accepts_each_bounded_runtime_value(self):
        for value in range(MODULE.MIN_CONCURRENCY, MODULE.MAX_CONCURRENCY + 1):
            with self.subTest(value=value):
                self.assertEqual(
                    MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay(str(value))),
                    value,
                )

    def test_identical_source_is_accepted(self):
        self.assertEqual(MODULE.verify_concurrency_overlay(self.SOURCE, self.SOURCE), 4)

    def test_padded_runtime_concurrency_fails_closed(self):
        for value in ("01", "08", "0001", "0008"):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "outside the bounded policy"):
                    MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay(value))

    def test_missing_runtime_concurrency_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "exactly one max_concurrent_agents"):
            MODULE.verify_concurrency_overlay(
                self.SOURCE,
                self.SOURCE.replace("  max_concurrent_agents: 4\n", ""),
            )

    def test_duplicated_runtime_concurrency_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "exactly one max_concurrent_agents"):
            MODULE.verify_concurrency_overlay(
                self.SOURCE,
                self.SOURCE.replace(
                    "  max_concurrent_agents: 4\n",
                    "  max_concurrent_agents: 1\n  max_concurrent_agents: 2\n",
                ),
            )

    def test_non_numeric_runtime_concurrency_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "exactly one max_concurrent_agents"):
            MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay("n"))

    def test_zero_runtime_concurrency_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "outside the bounded policy"):
            MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay("0"))

    def test_above_policy_runtime_concurrency_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "outside the bounded policy"):
            MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay("41"))

    def test_any_other_workflow_drift_fails_closed(self):
        drifted = self.overlay("1").replace("max_turns: 24", "max_turns: 99")
        with self.assertRaisesRegex(ValueError, "beyond concurrency overlay"):
            MODULE.verify_concurrency_overlay(self.SOURCE, drifted)


class SystemdActivationTests(unittest.TestCase):
    """The controller is activated by a versioned systemd user service+timer.

    The pair mirrors the symphony-reconciler siblings: a oneshot service that
    invokes the controller with its fail-closed defaults (missing evidence
    fails to minimum concurrency inside the process) and a timer whose cadence
    is bounded by the controller's own hysteresis constants.
    """

    def test_unit_files_exist(self):
        self.assertTrue(SERVICE_UNIT.is_file())
        self.assertTrue(TIMER_UNIT.is_file())

    def test_service_invokes_controller_with_fail_closed_defaults(self):
        text = SERVICE_UNIT.read_text(encoding="utf-8")
        self.assertEqual(ini_value(text, "Type"), "oneshot")
        # Exactly the binary, no flags: every policy input stays at its
        # fail-closed default (missing telemetry or integrity evidence pins
        # concurrency to MIN_CONCURRENCY).
        self.assertEqual(
            ini_value(text, "ExecStart"),
            "%h/.local/bin/symphony-concurrency-controller --capacity-evidence "
            "%h/gem-workspace/state/concurrency.json --receipt "
            "%h/gem-workspace/state/symphony-concurrency.json",
        )
        self.assertEqual(
            ini_value(text, "After"),
            "symphony-elixir.service",
        )
        self.assertIn("provider-capacity-bootstrap.py", text)
        self.assertIn("gem-concurrency-evidence.py", text)
        self.assertLess(
            text.index("provider-capacity-bootstrap.py"),
            text.index("gem-concurrency-evidence.py"),
        )
        # Exit 2 (unreadable or drifted workflow) must stay a real unit
        # failure; only clean runs are success.
        self.assertIn(ini_value(text, "SuccessExitStatus"), (None, "0"))

    def test_timer_cadence_matches_controller_hysteresis(self):
        text = TIMER_UNIT.read_text(encoding="utf-8")
        cadence = timespan_seconds(
            ini_value(text, "OnUnitActiveSec") or ""
        )
        # Scale-down is documented as immediate: the sampling cadence must be
        # at least as fine as the change cooldown so a severe sample is acted
        # on within one cooldown window.
        self.assertLessEqual(cadence, MODULE.CHANGE_COOLDOWN_SECONDS)
        # Scale-up hysteresis: LOW_STREAK_REQUIRED consecutive low samples at
        # this cadence must span at least the change cooldown.
        self.assertGreaterEqual(
            cadence * MODULE.LOW_STREAK_REQUIRED,
            MODULE.CHANGE_COOLDOWN_SECONDS,
        )
        self.assertIsNotNone(ini_value(text, "OnBootSec"))
        self.assertEqual(ini_value(text, "Persistent"), "true")
        self.assertEqual(ini_value(text, "WantedBy"), "timers.target")

    def test_recovery_pilot_installer_does_not_own_canonical_controller_timer(self):
        text = INSTALLER.read_text(encoding="utf-8")
        self.assertIn(
            'CONTROLLER_SRC="$REPO_ROOT/scripts/hermes/symphony-concurrency-controller.py"',
            text,
        )
        self.assertNotIn('CONTROLLER_DST=', text)
        self.assertNotIn('CONTROLLER_SERVICE_DST=', text)
        self.assertNotIn('CONTROLLER_TIMER_DST=', text)
        self.assertNotIn(
            "systemctl --user enable --now symphony-concurrency-controller.timer",
            text,
        )
        canonical = (
            ROOT / "scripts/hermes/install-gem-fleet-controller.sh"
        ).read_text(encoding="utf-8")
        self.assertIn(
            'systemctl --user start "${CONCURRENCY_SERVICE}"', canonical
        )


if __name__ == "__main__":
    unittest.main()
