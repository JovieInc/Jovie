import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import slot_yield as gate  # noqa: E402

NOW = 2_000_000_000.0
REGISTRY = {"providers": [{"id": "hyperagent", "lane": "hyperagent"}, {"id": "openai-codex", "lane": "codex"},
                          {"id": "xai-grok", "lane": "grok"}]}


def metrics(age_s=60, **rows):
    stamp = datetime.fromtimestamp(NOW - age_s, timezone.utc).isoformat()
    return {"readAt": stamp, "providers": rows}


GROK = {"costBasis": "amortized-plan", "costUsd": 22.77, "mergedCreated": 16, "mergedRepaired": 78}
HYPER = {"costBasis": "credit-burn-estimate", "costUsd": 333.2, "mergedAgentProven": 5, "mergedAgentInferred": 65}


class SlotYieldTest(unittest.TestCase):
    def ceiling(self, data, lane="hyperagent", base=10):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / gate.METRICS_FILE).write_text(json.dumps(data))
            return gate.ceiling(Path(tmp), lane, base, REGISTRY, NOW)

    def test_a_pay_per_use_lane_with_poor_yield_keeps_only_the_probe_slot(self):
        slots, why = self.ceiling(metrics(hyperagent=HYPER, **{"xai-grok": GROK}))
        self.assertEqual(slots, gate.PROBE)
        self.assertTrue(why["gated"])
        self.assertLess(why["mergedPerUsd"], why["referencePerUsd"])

    def test_slots_grow_with_measured_merges_per_dollar(self):
        better = {**HYPER, "mergedAgentProven": 1200}  # 3.6 merges per USD against grok 4.1
        slots, _ = self.ceiling(metrics(hyperagent=better, **{"xai-grok": GROK}))
        self.assertTrue(gate.PROBE < slots < 10, slots)
        best = {**HYPER, "mergedAgentProven": 2000}
        self.assertEqual(self.ceiling(metrics(hyperagent=best, **{"xai-grok": GROK}))[0], 10)

    def test_subscription_lanes_are_paced_elsewhere_not_gated_here(self):
        slots, why = self.ceiling(metrics(hyperagent=HYPER, **{"xai-grok": GROK, "openai-codex": {**GROK, "costUsd": 138}}), lane="codex")
        self.assertEqual((slots, why["why"]), (10, "not-pay-per-use"))

    def test_missing_stale_or_unreferenced_evidence_keeps_the_configured_base(self):
        self.assertEqual(self.ceiling({})[0], 10)
        self.assertEqual(self.ceiling(metrics(age_s=gate.STALE_S + 5, hyperagent=HYPER, **{"xai-grok": GROK}))[1]["why"], "metrics-stale")
        self.assertEqual(self.ceiling(metrics(hyperagent=HYPER))[1]["why"], "no-yield-evidence")
        self.assertEqual(self.ceiling(metrics(hyperagent={**HYPER, "costUsd": None}, **{"xai-grok": GROK}))[0], 10)

    def test_a_base_at_the_probe_is_never_changed(self):
        self.assertEqual(self.ceiling(metrics(hyperagent=HYPER, **{"xai-grok": GROK}), base=1)[0], 1)


if __name__ == "__main__":
    unittest.main()
