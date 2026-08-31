#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/symphony-concurrency-controller.py"
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


def provider(accounts: int = 8, locked: int = 4, available: int = 4) -> dict:
    return {
        "state": "available",
        "accounts": accounts,
        "locked": locked,
        "cooldown": accounts - locked - available,
        "available": available,
    }


RUNTIME = {"running": 4, "retrying": 0, "codexTotals": {"seconds_running": 100}}
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
            runtime=RUNTIME,
            integrity_allowed=False,
            now_epoch=1000.0,
        )
        self.assertEqual(target, (1, 0, "integrity-blocked"))


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
            MODULE.verify_concurrency_overlay(self.SOURCE, self.overlay("9"))

    def test_any_other_workflow_drift_fails_closed(self):
        drifted = self.overlay("1").replace("max_turns: 24", "max_turns: 99")
        with self.assertRaisesRegex(ValueError, "beyond concurrency overlay"):
            MODULE.verify_concurrency_overlay(self.SOURCE, drifted)


if __name__ == "__main__":
    unittest.main()
