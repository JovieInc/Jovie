#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts/symphony/publisher_self_repair.py"
SPEC = importlib.util.spec_from_file_location("publisher_self_repair", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublisherSelfRepairTests(unittest.TestCase):
    def test_attestation_unhealthy_is_a_publisher_hold(self):
        self.assertEqual(
            MODULE.publisher_missing_reason(
                attestation_healthy=False,
                green_ready=3,
                blocked_since="2026-09-16T16:00:00Z",
                consumer_status="idle",
            ),
            "runner-source-attestation-unavailable",
        )

    def test_missing_blocked_since_with_clean_prs_is_ranking_publisher_hold(self):
        self.assertEqual(
            MODULE.publisher_missing_reason(
                attestation_healthy=True,
                green_ready=3,
                blocked_since=None,
                consumer_status="idle",
            ),
            "queue-blocked-since-unavailable",
        )

    def test_healthy_ranking_idle_is_not_a_gem_publisher_hold(self):
        self.assertIsNone(
            MODULE.publisher_missing_reason(
                attestation_healthy=True,
                green_ready=3,
                blocked_since="2026-09-16T16:00:00Z",
                consumer_status="idle",
            )
        )

    def test_three_consecutive_holds_name_allowlisted_restart(self):
        first = MODULE.next_streak(None, "runner-source-attestation-unavailable", "t1")
        self.assertEqual(first["count"], 1)
        self.assertFalse(first["restart"])
        second = MODULE.next_streak(first, "runner-source-attestation-unavailable", "t2")
        self.assertEqual(second["count"], 2)
        self.assertFalse(second["restart"])
        third = MODULE.next_streak(second, "runner-source-attestation-unavailable", "t3")
        self.assertEqual(third["count"], 3)
        self.assertTrue(third["restart"])
        self.assertEqual(third["unit"], "gem-service-attestation.timer")
        self.assertIn(third["unit"], MODULE.PUBLISHER_UNITS)
        self.assertNotEqual(third["unit"], "symphony-elixir.service")

    def test_reason_change_resets_streak(self):
        first = MODULE.next_streak(None, "runner-source-attestation-unavailable", "t1")
        switched = MODULE.next_streak(
            first, "queue-blocked-since-unavailable", "t2"
        )
        self.assertEqual(switched["count"], 1)
        self.assertFalse(switched["restart"])

    def test_clear_reason_resets_streak(self):
        first = MODULE.next_streak(None, "runner-source-attestation-unavailable", "t1")
        cleared = MODULE.next_streak(first, None, "t2")
        self.assertEqual(cleared["count"], 0)
        self.assertFalse(cleared["restart"])
        self.assertIsNone(cleared["unit"])


if __name__ == "__main__":
    unittest.main()
