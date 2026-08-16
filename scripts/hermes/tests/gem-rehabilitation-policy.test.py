#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem_rehabilitation_policy.py"
SPEC = importlib.util.spec_from_file_location("gem_rehabilitation_policy", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
POLICY = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = POLICY
SPEC.loader.exec_module(POLICY)
HEAD = "a" * 40


class PauseLatticeTests(unittest.TestCase):
    def decide(self, state="GREEN", push=True, mergeable="behind", attempt=0):
        return POLICY.decide_action(
            state=state,
            push_allowed=push,
            mergeable_state=mergeable,
            expected_head=HEAD,
            attempt=attempt,
        )

    def test_green_and_amber_can_refresh_an_exact_head(self):
        self.assertEqual(self.decide(), "exact_head_branch_update")
        self.assertEqual(self.decide(state="AMBER"), "exact_head_branch_update")

    def test_red_preserves_local_diagnosis_but_blocks_remote_mutation(self):
        self.assertEqual(self.decide(state="RED", push=False), "local_diagnosis_only")

    def test_remote_push_capability_is_independently_fail_closed(self):
        self.assertEqual(self.decide(push=False), "local_diagnosis_only")

    def test_failure_classes_route_without_adding_a_second_implementation_owner(self):
        self.assertEqual(self.decide(mergeable="dirty"), "fresh_main_replant_required")
        self.assertEqual(self.decide(mergeable="blocked"), "isolated_model_repair")
        self.assertEqual(self.decide(mergeable="unstable"), "isolated_model_repair")
        self.assertEqual(self.decide(mergeable="clean"), "observe_only")

    def test_retry_budget_terminates_runaway_repair(self):
        self.assertEqual(self.decide(attempt=3), "retry_budget_exhausted")

    def test_malformed_inputs_fail_closed(self):
        for arguments in (
            {"state": "UNKNOWN"},
            {"expected_head": "short"},
            {"expected_head": "A" * 40},
            {"expected_head": "z" * 40},
            {"attempt": -1},
        ):
            base = dict(state="GREEN", push_allowed=True, mergeable_state="behind", expected_head=HEAD, attempt=0)
            base.update(arguments)
            with self.assertRaises(POLICY.PolicyError):
                POLICY.decide_action(**base)


class ThroughputAndOwnershipTests(unittest.TestCase):
    def candidates(self):
        return [
            {"number": number, "created_at": f"2026-08-16T00:{number:02d}:00Z", "head": {"sha": str(number) * 40}}
            for number in range(1, 21)
        ]

    def test_twenty_held_prs_dispatch_only_four_disjoint_workers(self):
        selected = POLICY.bounded_selection(self.candidates(), 4)
        self.assertEqual([item["number"] for item in selected], [1, 2, 3, 4])
        self.assertEqual(len({POLICY.lease_key("JovieInc/Jovie", item["number"], item["head"]["sha"]) for item in selected}), 4)

    def test_twenty_held_prs_respect_a_low_typed_worker_cap(self):
        selected = POLICY.bounded_selection(self.candidates(), 1)
        self.assertEqual([item["number"] for item in selected], [1])

    def test_duplicate_exact_head_gets_one_writer(self):
        items = self.candidates()[:2]
        items.append(dict(items[0]))
        self.assertEqual(len(POLICY.bounded_selection(items, 4)), 2)

    def test_zero_capacity_observes_without_dispatch(self):
        self.assertEqual(POLICY.bounded_selection(self.candidates(), 0), [])

    def test_invalid_capacity_or_candidate_fails_closed(self):
        with self.assertRaises(POLICY.PolicyError):
            POLICY.bounded_selection([], -1)
        with self.assertRaises(POLICY.PolicyError):
            POLICY.bounded_selection([{"number": 1, "head": {}}], 1)


class HandoffAndWatchdogTests(unittest.TestCase):
    def receipt(self):
        return POLICY.handoff_receipt(
            repo="JovieInc/Jovie",
            number=42,
            expected_head=HEAD,
            owner="Gem",
            failure_class="checks_failed",
            attempt=1,
            observed_at="2026-08-16T00:00:00Z",
            stage_times={stage: None for stage in POLICY.STAGES},
        )

    def test_handoff_is_exact_head_bound_and_stage_complete(self):
        receipt = self.receipt()
        POLICY.validate_handoff(receipt)
        self.assertEqual(receipt["schema"], POLICY.SCHEMA)
        self.assertEqual(set(receipt["stages"]), set(POLICY.STAGES))

    def test_stale_or_incomplete_handoff_fails_closed(self):
        receipt = self.receipt()
        receipt["leaseKey"] = "wrong"
        with self.assertRaises(POLICY.PolicyError):
            POLICY.validate_handoff(receipt)
        receipt = self.receipt()
        receipt["stages"].pop("merged")
        with self.assertRaises(POLICY.PolicyError):
            POLICY.validate_handoff(receipt)

    def test_constructor_rejects_incomplete_stage_schema(self):
        with self.assertRaises(POLICY.PolicyError):
            POLICY.handoff_receipt(
                repo="JovieInc/Jovie", number=1, expected_head=HEAD, owner="Gem",
                failure_class="behind", attempt=0, observed_at="now", stage_times={},
            )

    def test_watchdog_ranks_total_founder_visible_blocked_time(self):
        self.assertEqual(
            POLICY.rank_bottlenecks(
                {"pickup": 60, "repair": 300, "queue": 100},
                {"pickup": 20, "repair": 5, "queue": 2},
            ),
            ["repair", "pickup", "queue"],
        )

    def test_watchdog_requires_complete_stage_attribution(self):
        with self.assertRaises(POLICY.PolicyError):
            POLICY.rank_bottlenecks({"repair": 1}, {"queue": 1})


if __name__ == "__main__":
    unittest.main()
