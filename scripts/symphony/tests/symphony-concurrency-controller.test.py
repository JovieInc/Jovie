#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import pathlib
import re
import tempfile
import unittest
from unittest import mock
from datetime import datetime, timezone
import io
import json
import sys


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/symphony-concurrency-controller.py"
UNIT_DIR = ROOT / "scripts/symphony/systemd"
SERVICE_UNIT = UNIT_DIR / "symphony-concurrency-controller.service"
TIMER_UNIT = UNIT_DIR / "symphony-concurrency-controller.timer"
INSTALLER = ROOT / "scripts/symphony/install-symphony-ui-pilot.sh"
ACTIVATION = ROOT / ".github/workflows/gem-delivery-controller-activation.yml"
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
    return {
        "state": "available",
        "accounts": accounts,
        "locked": locked,
        "cooldown": accounts - locked - available,
        "available": available,
        "freshReadiness": available,
        "eligible": available > 0,
        "capacityFailure": False,
    }


DOWNSTREAM = {"healthy": True, "headroom": 20}
RUNTIME = {"productive": 4, "running": 4, "retrying": 0, "codexTotals": {"seconds_running": 100}}
SCOPE = {
    "kind": "gem-host-provider-accounts-workflow",
    "host": "gem",
    "workflow": "/workflows/jovie.md",
    "runtimeUrl": "http://127.0.0.1:4041/api/v1/state",
    "leaseGuard": "/bin/symphony-lease-guard",
}


class PressureParsingTests(unittest.TestCase):
    def test_parses_selected_psi_line(self):
        text = "some avg10=3.25 avg60=1.00 total=1\nfull avg10=0.50 avg60=0.25 total=2\n"
        self.assertEqual(MODULE.parse_pressure(text, "some"), 3.25)
        self.assertEqual(MODULE.parse_pressure(text, "full"), 0.5)


class HysteresisTests(unittest.TestCase):
    def decide(self, current: int, low_streak: int, sample: dict | None = None):
        return MODULE.choose_target(
            current=current,
            state={"lowStreak": low_streak, "lastChangeEpoch": 0.0},
            sample=sample or low_sample(),
            provider=provider(),
            runtime=RUNTIME,
            integrity_allowed=True,
            now_epoch=1000.0,
            downstream=DOWNSTREAM,
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

    def test_account_inventory_does_not_cap_execution_concurrency(self):
        target = MODULE.choose_target(
            current=4,
            state={"lowStreak": 2, "lastChangeEpoch": 0.0},
            sample=low_sample(),
            provider=provider(accounts=4, locked=3, available=1),
            runtime=RUNTIME,
            integrity_allowed=True,
            now_epoch=1000.0,
            downstream=DOWNSTREAM,
        )
        self.assertEqual(target, (5, 0, "sustained-low-pressure"))

    def test_missing_runtime_or_provider_evidence_fails_closed(self):
        for missing_provider, missing_runtime in ((None, RUNTIME), (provider(), None)):
            with self.subTest(provider=missing_provider, runtime=missing_runtime):
                target = MODULE.choose_target(
                    current=6,
                    state={"lowStreak": 2, "lastChangeEpoch": 0.0},
                    sample=low_sample(),
                    provider=missing_provider,
                    runtime=missing_runtime,
                    integrity_allowed=True,
                    now_epoch=1000.0,
            downstream=DOWNSTREAM,
                )
                self.assertEqual(target, (1, 0, "required-telemetry-unavailable"))

    def test_integrity_block_fails_closed(self):
        target = MODULE.choose_target(
            current=6,
            state={"lowStreak": 2, "lastChangeEpoch": 0.0},
            sample=low_sample(),
            provider=provider(),
            runtime=RUNTIME,
            integrity_allowed=False,
            now_epoch=1000.0,
            downstream=DOWNSTREAM,
        )
        self.assertEqual(target, (1, 0, "integrity-blocked"))


class EmpiricalCapacityTests(unittest.TestCase):
    def decide(self, current=40, **changes):
        args = dict(current=current, state={"lowStreak": 2, "lastChangeEpoch": 0},
                    sample=low_sample(), provider=provider(1, 0, 1),
                    runtime={**RUNTIME, "running": current, "productive": current},
                    integrity_allowed=True, now_epoch=1000, downstream=DOWNSTREAM)
        args.update(changes)
        return MODULE.choose_target(**args)

    def test_one_account_can_probe_one_or_many_issues_with_measured_headroom(self):
        for count in (1, 8, 40, 128):
            with self.subTest(count=count):
                self.assertEqual(self.decide(count), (count + 1, 0, "sustained-low-pressure"))

    def test_failure_contracts_without_waiting_for_growth_cooldown(self):
        self.assertEqual(self.decide(provider={"eligible": False, "capacityFailure": True},
                                    state={"lowStreak": 2, "lastChangeEpoch": 999}),
                         (20, 0, "provider-capacity-failure"))

    def test_simultaneous_pressure_never_masks_stricter_constraints(self):
        high = {**low_sample(), "cpuSomeAvg10": 30}
        failed = {"eligible": False, "capacityFailure": True}
        self.assertEqual(self.decide(sample=high, provider=failed)[0], 20)
        self.assertEqual(self.decide(sample=high, provider=failed, downstream={"healthy": False, "headroom": 0})[0], 1)

    def test_cooldown_recovery_restarts_hysteresis(self):
        self.assertEqual(self.decide(state={"lowStreak": 0, "lastChangeEpoch": 950}),
                         (40, 1, "low-pressure-hysteresis"))

    def test_unknown_or_idle_or_heartbeat_only_runtime_never_ramps(self):
        for runtime in ({**RUNTIME, "productive": 0}, {**RUNTIME, "retrying": 1}):
            self.assertEqual(self.decide(runtime=runtime)[0], 40)
        self.assertEqual(self.decide(provider={"eligible": False})[0], 40)
        self.assertEqual(self.decide(downstream=None), (40, 0, "downstream-evidence-unavailable"))

    def test_backpressure_contracts_but_nonempty_healthy_queue_can_grow(self):
        self.assertEqual(self.decide(downstream={"healthy": False, "headroom": 12}), (1, 0, "downstream-backpressure"))
        self.assertEqual(self.decide(downstream={"healthy": True, "headroom": 0}), (1, 0, "downstream-backpressure"))
        self.assertEqual(self.decide(downstream={"healthy": True, "headroom": 1})[0], 41)

    def test_unknown_and_normal_pressure_and_cpu_validation(self):
        for sample in ({**low_sample(), "cpuSomeAvg10": None}, {**low_sample(), "cpuCount": 0}):
            self.assertEqual(self.decide(sample=sample)[0], 1)
        self.assertEqual(self.decide(sample={**low_sample(), "cpuSomeAvg10": 10}), (40, 0, "pressure-hold"))


class EvidenceTests(unittest.TestCase):
    def test_fresh_router_routes_skip_only_cooling_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            now = 2000
            observed = datetime.fromtimestamp(now, timezone.utc).isoformat()
            cooldown = root / "provider-cooldowns.json"
            cooldown.write_text(json.dumps({"providers": {"cursor": {"unavailableUntil": datetime.fromtimestamp(2100, timezone.utc).isoformat()}}}))
            for issue, name in (("JOV-1", "cursor"), ("JOV-2", "codex")):
                (root / f"{issue}.json").write_text(json.dumps({"schema": "symphony-provider-route/v1", "issue": issue, "provider": name, "model": "model", "observedAt": observed}))
            read = lambda issues: MODULE.read_router_capacity(root, {"issues": issues}, now)
            self.assertTrue(read(["JOV-1"])["capacityFailure"])
            self.assertTrue(read(["JOV-1", "JOV-2"])["eligible"])
            self.assertFalse(read(["JOV-1", "JOV-2"])["capacityFailure"])
            self.assertFalse(read(["../JOV-2"])["eligible"])
            self.assertIsNone(MODULE.read_router_capacity(root, None, now))
            self.assertIsNone(read(["missing"]))
            cooldown.write_text('{"providers":null}')
            self.assertIsNone(read(["JOV-1"]))

    def test_gate_scope_freshness_and_queue_allowance(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "gate.json"
            now = 2000
            gate = {"schema": "jovie-fleet-gate/v1", "observedAt": datetime.fromtimestamp(now, timezone.utc).isoformat(), "state": "GREEN",
                    "workAdmission": {"allowed": True, "newIssueLeaseAllowed": True, "newImplementationAllowed": True},
                    "closureAdmission": {"newIssueIntakeAllowed": True, "newImplementationAllowed": True, "remediationContinues": True},
                    "remediationAdmission": {"allowed": True, "localAllowed": True, "pushAllowed": True},
                    "signals": {"main": {"status": "green"}, "production": {"status": "green"},
                                "closureHealth": {"remediationContinues": True},
                                "queue": {"repository": "JovieInc/Jovie", "status": "known", "greenReadyPrs": 10, "target": 15}}}
            path.write_text(json.dumps(gate))
            result = MODULE.read_downstream(path, "JovieInc/Jovie", now)
            self.assertEqual(result["headroom"], 5)
            self.assertTrue(result["healthy"])
            self.assertIsNone(MODULE.read_downstream(path, "JovieInc/LogYourBody", now))
            self.assertIsNone(MODULE.read_downstream(path, "JovieInc/Jovie", now + 601))
            gate["state"] = "AMBER"
            gate["workAdmission"]["allowed"] = False
            gate["workAdmission"]["newIssueLeaseAllowed"] = False
            gate["workAdmission"]["newImplementationAllowed"] = False
            gate["closureAdmission"]["newIssueIntakeAllowed"] = False
            gate["closureAdmission"]["newImplementationAllowed"] = False
            path.write_text(json.dumps(gate))
            result = MODULE.read_downstream(path, "JovieInc/Jovie", now)
            self.assertFalse(result["healthy"])
            self.assertFalse(result["newWorkAllowed"])
            self.assertTrue(result["repairOnly"])
            self.assertTrue(result["remediationPushAllowed"])
            target = MODULE.choose_target(
                current=40,
                state={"lowStreak": 2, "lastChangeEpoch": 0},
                sample=low_sample(),
                provider=provider(),
                runtime={**RUNTIME, "running": 40, "productive": 40},
                integrity_allowed=True,
                now_epoch=now,
                downstream=result,
            )
            self.assertEqual(target, (1, 0, "downstream-backpressure"))
            gate["remediationAdmission"]["pushAllowed"] = False
            path.write_text(json.dumps(gate))
            result = MODULE.read_downstream(path, "JovieInc/Jovie", now)
            self.assertFalse(result["healthy"])
            self.assertTrue(result["repairOnly"])
            self.assertFalse(result["remediationPushAllowed"])
            gate["remediationAdmission"]["localAllowed"] = False
            path.write_text(json.dumps(gate))
            self.assertFalse(MODULE.read_downstream(path, "JovieInc/Jovie", now)["repairOnly"])
            gate["state"] = "RED"
            path.write_text(json.dumps(gate))
            self.assertFalse(MODULE.read_downstream(path, "JovieInc/Jovie", now)["healthy"])
            gate["signals"]["queue"]["target"] = True
            path.write_text(json.dumps(gate))
            self.assertIsNone(MODULE.read_downstream(path, "JovieInc/Jovie", now))
            path.write_text('{}')
            self.assertIsNone(MODULE.read_downstream(path, "JovieInc/Jovie", now))

    def test_runtime_counts_useful_stage_without_counting_notifications(self):
        now = datetime.now(timezone.utc).isoformat()
        payload = {"running": [{"issue_identifier": "JOV-1", "last_event_at": now, "last_message": "command execution still in progress"},
                               {"issue_identifier": "JOV-2", "last_event_at": now, "last_message": "thread/status/changed"}], "retrying": []}
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            self.assertEqual(MODULE.read_runtime_state("http://127.0.0.1/state")["productive"], 1)

    def test_source_attestation_requires_fresh_bound_official_runtime(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "attestation.json"
            now = 2000
            receipt = {
                "schema": "gem-service-attestation/v1",
                "sourceRevision": "a" * 40,
                "observedAt": datetime.fromtimestamp(now, timezone.utc).isoformat(),
                "active": True,
                "healthy": True,
                "listener": {"port": 4041, "boundToService": True},
            }
            path.write_text(json.dumps(receipt))
            self.assertEqual(MODULE.read_source_attestation(path, now)["sourceRevision"], "a" * 40)
            for mutation in (
                lambda value: value.update(sourceRevision="short"),
                lambda value: value.update(active=False),
                lambda value: value["listener"].update(boundToService=False),
                lambda value: value["listener"].update(port=4042),
            ):
                broken = json.loads(json.dumps(receipt))
                mutation(broken)
                path.write_text(json.dumps(broken))
                self.assertIsNone(MODULE.read_source_attestation(path, now))
            path.write_text(json.dumps(receipt))
            self.assertIsNone(MODULE.read_source_attestation(path, now + 601))

    def test_exhausted_retry_keeps_provider_failure_evidence(self):
        now = datetime.now(timezone.utc).isoformat()
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"running": [], "retrying": [{"issue_identifier": "JOV-1"}]}).encode()
        with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
            runtime = MODULE.read_runtime_state("http://localhost")
        self.assertEqual(runtime["issues"], ["JOV-1"])
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "provider-cooldowns.json").write_text(json.dumps({"providers": {"codex": {"unavailableUntil": "2099-01-01T00:00:00Z"}}}))
            (root / "JOV-1.json").write_text(json.dumps({"schema": "symphony-provider-route/v1", "issue": "JOV-1", "provider": "codex", "model": "gpt", "observedAt": now}))
            self.assertTrue(MODULE.read_router_capacity(root, runtime, MODULE.time.time())["capacityFailure"])

    def test_psi_rejects_nonfinite_and_negative_values(self):
        for raw in ("nan", "inf", "-1", "bad"):
            self.assertIsNone(MODULE.parse_pressure(f"some avg10={raw}", "some"))



class RuntimeIntegrationTests(unittest.TestCase):
    def test_run_applies_only_future_concurrency_and_preserves_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            workflow = root / "WORKFLOW.md"
            workflow.write_text("agent:\n  max_concurrent_agents: 40\n  max_turns: 20\n")
            attestation = root / "attestation.json"
            attestation.write_text(json.dumps({
                "schema": "gem-service-attestation/v1",
                "sourceRevision": "a" * 40,
                "observedAt": datetime.now(timezone.utc).isoformat(),
                "active": True,
                "healthy": True,
                "listener": {"port": 4041, "boundToService": True},
            }))
            with mock.patch.object(sys, "argv", ["controller", "--workflow", str(workflow), "--state", str(root / "state.json"), "--receipt", str(root / "receipt.json"), "--source-attestation", str(attestation), "--proc-root", str(root / "proc")]):
                args = MODULE.parse_args()
            for name in ("cpu", "memory", "io"):
                path = args.proc_root / "pressure" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("some avg10=0\nfull avg10=0\n")
            (args.proc_root / "meminfo").write_text("MemAvailable: 64000000 kB\n")
            scope = MODULE.resource_scope(args)
            MODULE.write_json_atomic(args.state, {"schema": MODULE.STATE_SCHEMA, "resourceScope": scope, "target": 40, "lowStreak": 2, "lastChangeEpoch": 0})
            with mock.patch.object(MODULE, "read_cpu_count", return_value=8), mock.patch.object(MODULE, "read_runtime_state", return_value={**RUNTIME, "running": 40, "productive": 40}), mock.patch.object(MODULE, "read_router_capacity", return_value={"eligible": True}), mock.patch.object(MODULE, "read_downstream", return_value=DOWNSTREAM), mock.patch.object(MODULE, "integrity_allows_scale", return_value=(True, "clear")):
                result = MODULE.run(args)
                self.assertEqual(result["target"], 41)
                self.assertEqual(workflow.read_text(), "agent:\n  max_concurrent_agents: 41\n  max_turns: 20\n")
                self.assertIsNone(result["bounds"]["max"])
                persisted = json.loads(args.receipt.read_text())
                self.assertEqual(persisted["target"], 41)
                self.assertEqual(persisted["sourceRevision"], "a" * 40)
                args.dry_run = True
                before = workflow.read_text()
                MODULE.run(args)
                self.assertEqual(workflow.read_text(), before)
            with mock.patch.object(MODULE, "read_runtime_state", return_value=RUNTIME), mock.patch.object(MODULE, "read_router_capacity", return_value=None), mock.patch.object(MODULE, "read_provider_capacity", return_value=None):
                self.assertEqual(MODULE.run(args)["target"], 1)

    def test_io_failures_and_invalid_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            self.assertIsNone(MODULE.read_pressure(root, "cpu", "some"))
            self.assertIsNone(MODULE.read_available_memory(root))
            (root / "meminfo").write_text("MemAvailable: bad kB\n")
            self.assertIsNone(MODULE.read_available_memory(root))
            path = root / "integrity.json"
            self.assertEqual(MODULE.integrity_allows_scale(path), (True, "no-active-receipt"))
            for data, allowed in (({}, False), ({"status": "active"}, False), ({"status": "resolved"}, True)):
                path.write_text(json.dumps(data))
                self.assertEqual(MODULE.integrity_allows_scale(path)[0], allowed)
            path.write_text('[]')
            self.assertFalse(MODULE.integrity_allows_scale(path)[0])
            for text in ("agent: {}", "max_concurrent_agents: 0", "max_concurrent_agents: 01"):
                path.write_text(text)
                with self.assertRaises(ValueError): MODULE.read_current_target(path)
            self.assertEqual(MODULE.load_state(root / "absent", 128, SCOPE)["target"], 128)
            path.write_text(json.dumps({"schema": MODULE.STATE_SCHEMA, "resourceScope": SCOPE, "target": True, "lowStreak": -1, "lastChangeEpoch": -1}))
            state = MODULE.load_state(path, 128, SCOPE)
            self.assertEqual((state["target"], state["lowStreak"], state["lastChangeEpoch"]), (128, 0, 0))
        with mock.patch.object(MODULE.os, "cpu_count", return_value=0):
            self.assertIsNone(MODULE.read_cpu_count())
        with mock.patch.object(MODULE.os, "cpu_count", return_value=16):
            self.assertEqual(MODULE.read_cpu_count(), 16)
        self.assertFalse(MODULE.recent_timestamp(None, 100))
        self.assertFalse(MODULE.recent_timestamp("bad", 100))
        self.assertFalse(MODULE.recent_timestamp("2026-09-05T00:00:00", 100))

    def test_provider_report_is_only_eligibility_never_slots(self):
        for raw in ([], {"capacity": {}}, {"capacity": {"state": "available", "accounts": True}}, {"capacity": provider(1, 0, 1)}):
            completed = MODULE.subprocess.CompletedProcess([], 0, json.dumps(raw))
            with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
                result = MODULE.read_provider_capacity(pathlib.Path("guard"))
                if isinstance(raw, dict) and raw.get("capacity", {}).get("available") == 1:
                    self.assertTrue(result["eligible"])
                    self.assertNotIn("slots", result)
                else: self.assertIsNone(result)
        with mock.patch.object(MODULE.subprocess, "run", side_effect=OSError):
            self.assertIsNone(MODULE.read_provider_capacity(pathlib.Path("guard")))
        with mock.patch.object(MODULE.urllib.request, "urlopen", side_effect=OSError):
            self.assertIsNone(MODULE.read_runtime_state("http://localhost"))
        response = mock.MagicMock()
        for data in ([], {"running": None}, {"running": [], "retrying": []}):
            response.__enter__.return_value.read.return_value = json.dumps(data).encode()
            with mock.patch.object(MODULE.urllib.request, "urlopen", return_value=response):
                self.assertEqual(MODULE.read_runtime_state("http://localhost") is not None, data == {"running": [], "retrying": []})

    def test_cli_reports_overlay_drift_and_execution_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, installed = pathlib.Path(tmp) / "source", pathlib.Path(tmp) / "installed"
            source.write_text("max_concurrent_agents: 8\n")
            installed.write_text("max_concurrent_agents: 128\n")
            with mock.patch.object(sys, "argv", ["controller", "--verify-workflow-overlay", str(source), str(installed)]), mock.patch("builtins.print"):
                self.assertEqual(MODULE.main(), 0)
                installed.write_text("max_concurrent_agents: 00\n")
                self.assertEqual(MODULE.main(), 1)
        with mock.patch.object(sys, "argv", ["controller"]), mock.patch.object(MODULE, "run", return_value={"target": 1}), mock.patch("builtins.print"):
            self.assertEqual(MODULE.main(), 0)
        with mock.patch.object(sys, "argv", ["controller"]), mock.patch.object(MODULE, "run", side_effect=ValueError("invalid workflow")), mock.patch("builtins.print"):
            self.assertEqual(MODULE.main(), 2)


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
        for value in (1, 8, 9, 40, 41, 128):
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

    def test_high_runtime_concurrency_preserves_workflow_identity(self):
        self.assertEqual(MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay("128")), 128)

    def test_fleet_installer_attests_high_overlay_and_rejects_other_drift(self):
        installer = ROOT / "scripts/symphony/install-gem-fleet-controller.sh"
        code = installer.read_text().rsplit("python3 - <<'PY'\n", 1)[1].split("\nPY", 1)[0]
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            source, installed = root / "source", root / "installed"
            source.write_text(self.SOURCE)
            env = {"GEM_ROOT": str(root), "WORKFLOW_SOURCE": str(source), "WORKFLOW_TARGET": str(installed),
                   "SOURCE_REVISION": "a" * 40, "LISTENER_PID": "123", "SERVICE_PID": "124", "SERVICE_CONTROL_GROUP": "/test"}
            for prefix in ("UNIT", "POLICY", "GATE", "CLOSURE"):
                env[f"{prefix}_SOURCE_SHA"] = env[f"{prefix}_TARGET_SHA"] = "a" * 64
            with mock.patch.dict(MODULE.os.environ, env):
                for value in ("1", "41", "128"):
                    installed.write_text(self.overlay(value))
                    exec(compile(code, str(installer), "exec"), {})
                    receipt = json.loads((root / "state/gem-service-attestation.json").read_text())
                    self.assertTrue(receipt["workflow"]["matches"])
                    self.assertEqual(receipt["workflow"]["installedMaxConcurrentAgents"], int(value))
                for text in (self.overlay("01"), self.overlay("0"), self.overlay("41").replace("max_turns: 24", "max_turns: 99")):
                    installed.write_text(text)
                    with self.assertRaises(SystemExit): exec(compile(code, str(installer), "exec"), {})

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
            "%h/.local/bin/symphony-concurrency-controller",
        )
        self.assertEqual(ini_value(text, "After"), "symphony-elixir.service")
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

    def test_installer_installs_and_enables_like_sibling_units(self):
        text = INSTALLER.read_text(encoding="utf-8")
        self.assertIn(
            'CONTROLLER_SRC="$REPO_ROOT/scripts/symphony/symphony-concurrency-controller.py"',
            text,
        )
        self.assertIn('install_one "$CONTROLLER_SRC" "$CONTROLLER_DST" 0755', text)
        self.assertIn('install_one "$CONTROLLER_SERVICE_SRC" "$CONTROLLER_SERVICE_DST"', text)
        self.assertIn('install_one "$CONTROLLER_TIMER_SRC" "$CONTROLLER_TIMER_DST"', text)
        self.assertIn('check_one "$CONTROLLER_SERVICE_SRC" "$CONTROLLER_SERVICE_DST"', text)
        self.assertIn('check_one "$CONTROLLER_TIMER_SRC" "$CONTROLLER_TIMER_DST"', text)
        self.assertIn(
            "systemctl --user enable --now symphony-concurrency-controller.timer",
            text,
        )

    def test_exact_production_activation_installs_runs_and_attests_controller(self):
        text = ACTIVATION.read_text(encoding="utf-8")
        self.assertIn(
            'install -D -m 0755 scripts/symphony/symphony-concurrency-controller.py "$HOME/.local/bin/symphony-concurrency-controller"',
            text,
        )
        self.assertIn(
            "systemctl --user enable --now symphony-concurrency-controller.timer",
            text,
        )
        self.assertIn(
            "systemctl --user start symphony-concurrency-controller.service",
            text,
        )
        self.assertIn("--verify-workflow-overlay", text)
        self.assertIn('.bounds.max == null', text)
        self.assertIn('.bounds.policy == "empirical-additive-probe"', text)
        self.assertIn('.sourceRevision == $sha', text)
        self.assertIn('symphony concurrency receipt is stale or from the future', text)


if __name__ == "__main__":
    unittest.main()
