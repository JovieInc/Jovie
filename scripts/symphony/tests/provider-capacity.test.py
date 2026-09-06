#!/usr/bin/env python3
"""Focused coverage for provider-local fallback admission."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts/symphony/provider_capacity.py"
spec = importlib.util.spec_from_file_location("provider_capacity", MODULE_PATH)
assert spec and spec.loader
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


class ProviderCapacityTests(unittest.TestCase):
    def test_controller_derives_cursor_grok_kimi_from_registry(self):
        controller_path = ROOT / "scripts/symphony/symphony-codex-exhausted.py"
        controller_spec = importlib.util.spec_from_file_location("controller", controller_path)
        assert controller_spec and controller_spec.loader
        controller = importlib.util.module_from_spec(controller_spec)
        controller_spec.loader.exec_module(controller)
        self.assertEqual(controller._fallback_provider_names(), ("cursor", "grok", "kimi"))
        self.assertNotIn("codex", controller._fallback_provider_names())

    def test_cursor_uses_the_existing_isolated_worker_and_official_router_stays_codex(self):
        controller_path = ROOT / "scripts/symphony/symphony-codex-exhausted.py"
        controller_spec = importlib.util.spec_from_file_location("controller_router_guard", controller_path)
        assert controller_spec and controller_spec.loader
        controller = importlib.util.module_from_spec(controller_spec)
        controller_spec.loader.exec_module(controller)
        command = controller._grok_command(
            "JOV-6000", "/bin/true",
            {"selected": {"provider": "cursor", "model": "cursor-grok-4.6", "id": "cursor-grok-4.6"}},
            "revision", "b" * 64,
        )
        self.assertIn("Environment=SYMPHONY_FALLBACK_PROVIDER=cursor", command)
        self.assertNotIn("app-server", command)
        official_router = (ROOT / "scripts/symphony/symphony-codex-router").read_text()
        self.assertIn("entry.provider === 'codex'", official_router)

    def test_provider_admission_isolated_when_one_provider_saturates(self):
        state = capacity.empty_state("2026-09-05T12:00:00Z")
        state = capacity.apply_observation(
            state, provider="cursor", kind="capacity_observed", event_id="seed-c",
            observed_at="2026-09-05T12:00:00Z", observed_capacity=2,
        )
        state = capacity.apply_observation(
            state, provider="cursor", kind="quota_pressure", event_id="pressure-c",
            observed_at="2026-09-05T12:01:00Z",
        )
        self.assertEqual(capacity.admitted_limit(
            state, "cursor", active=0, now="2026-09-05T12:02:00Z"), 0)
        self.assertEqual(capacity.admitted_limit(
            state, "grok", active=0, now="2026-09-05T12:02:00Z"), 1)

    def test_useful_completion_increases_only_its_provider(self):
        state = capacity.empty_state("2026-09-05T12:00:00Z")
        state = capacity.apply_observation(
            state, provider="cursor", kind="capacity_observed", event_id="seed-c",
            observed_at="2026-09-05T12:00:00Z", observed_capacity=2,
        )
        state = capacity.apply_observation(
            state, provider="grok", kind="capacity_observed", event_id="seed-g",
            observed_at="2026-09-05T12:00:00Z", observed_capacity=4,
        )
        state = capacity.apply_observation(
            state, provider="cursor", kind="useful_completion", event_id="done-c",
            observed_at="2026-09-05T12:01:00Z",
        )
        self.assertEqual(state["providers"]["cursor"]["limit"], 3)
        self.assertEqual(state["providers"]["grok"]["limit"], 4)

    def test_each_pressure_decreases_and_sets_typed_cooldown(self):
        for kind in capacity.PRESSURE_KINDS:
            with self.subTest(kind=kind):
                state = capacity.empty_state("2026-09-05T12:00:00Z")
                state = capacity.apply_observation(
                    state, provider="grok", kind="capacity_observed", event_id="seed",
                    observed_at="2026-09-05T12:00:00Z", observed_capacity=8,
                )
                state = capacity.apply_observation(
                    state, provider="grok", kind=kind, event_id=kind,
                    observed_at="2026-09-05T12:01:00Z",
                )
                self.assertEqual(state["providers"]["grok"]["limit"], 4)
                self.assertEqual(state["providers"]["grok"]["status"], "cooling")
                self.assertTrue(state["providers"]["grok"]["recoverAfter"])

    def test_recovery_is_automatic_and_provider_local(self):
        state = capacity.empty_state("2026-09-05T12:00:00Z")
        state = capacity.apply_observation(
            state, provider="kimi", kind="capacity_observed", event_id="seed-k",
            observed_at="2026-09-05T12:00:00Z", observed_capacity=4,
        )
        state = capacity.apply_observation(
            state, provider="kimi", kind="quota_pressure", event_id="pressure-k",
            observed_at="2026-09-05T12:01:00Z",
        )
        self.assertEqual(
            capacity.admitted_limit(state, "kimi", active=0, now="2026-09-05T13:00:00Z"),
            2,
        )
        self.assertEqual(
            capacity.admitted_limit(state, "grok", active=0, now="2026-09-05T13:00:00Z"),
            1,
        )

    def test_replay_is_idempotent_and_conflicting_replay_refused(self):
        state = capacity.empty_state("2026-09-05T12:00:00Z")
        event = dict(
            provider="cursor", kind="useful_completion", event_id="event-1",
            observed_at="2026-09-05T12:00:00Z",
        )
        once = capacity.apply_observation(state, **event)
        twice = capacity.apply_observation(once, **event)
        self.assertEqual(once, twice)
        with self.assertRaisesRegex(ValueError, "replay conflicts"):
            capacity.apply_observation(
                once, **{**event, "kind": "quota_pressure"}
            )

    def test_shared_resource_reserves_one_slot_for_remediation(self):
        receipt = {
            "schema": "jovie-lane-capacity/v2",
            "defaultLaneBudget": 4,
            "lanes": {"lane:a": {"ready": 1, "budget": 4}},
            "sharedResources": {
                "cursor": {
                    "resource": "cursor", "ready": 3, "budget": 4,
                    "consumers": ["lane:a"],
                }
            },
        }
        self.assertFalse(capacity.lane_allows(
            receipt, provider="cursor", lane="lane:a", remediation=False
        ))
        self.assertTrue(capacity.lane_allows(
            receipt, provider="cursor", lane="lane:a", remediation=True
        ))
        self.assertTrue(capacity.lane_allows(
            receipt, provider="grok", lane="lane:a", remediation=False
        ))

    def test_unrelated_lane_continues_when_affected_lane_is_full(self):
        receipt = {
            "schema": "jovie-lane-capacity/v2",
            "defaultLaneBudget": 2,
            "lanes": {
                "lane:a": {"ready": 2, "budget": 2},
                "lane:b": {"ready": 0, "budget": 2},
            },
            "sharedResources": {},
        }
        self.assertFalse(capacity.lane_allows(
            receipt, provider="cursor", lane="lane:a", remediation=False
        ))
        self.assertTrue(capacity.lane_allows(
            receipt, provider="cursor", lane="lane:b", remediation=False
        ))

    def test_state_updates_are_atomic_and_survive_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "provider-capacity.json"
            result = capacity.record_observation(
                path, provider="grok", kind="capacity_observed", event_id="seed",
                observed_at="2026-09-05T12:00:00Z", observed_capacity=3,
            )
            self.assertEqual(capacity.read_state(path, "2026-09-05T12:00:00Z"), result)
            self.assertTrue(path.with_name("provider-capacity.json.lock").is_file())
            json.loads(path.read_text())


if __name__ == "__main__":
    unittest.main()
