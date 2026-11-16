from __future__ import annotations

import json
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import doctor  # noqa: E402,F401
import lane_runner as lane  # noqa: E402
import urgent_sla  # noqa: E402

NOW = 1793242000.0


def todo_row(n, priority=1, age_s=7200, title="task"):
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - age_s))
    return {"id": f"id-{n}", "identifier": f"JOV-{n}", "title": title, "priority": priority, "createdAt": stamp}


class UrgentSla(unittest.TestCase):
    def test_breach_only_for_unclaimed_urgent_past_sla(self):
        rows = [todo_row(1), todo_row(2, priority=2), todo_row(3, age_s=60)]
        got = urgent_sla.breaches(rows, NOW)
        self.assertEqual([b["id"] for b in got], ["JOV-1"])

    def test_production_breakage_is_urgent_only(self):
        self.assertTrue(urgent_sla.production_breakage("Prod synthetic: sign-up AuthShell never ready", 1))
        self.assertTrue(urgent_sla.production_breakage("[ci] Production Controller abc failing", 1))
        self.assertFalse(urgent_sla.production_breakage("Prod synthetic: flaky banner", 2))
        self.assertFalse(urgent_sla.production_breakage("Tidy the production copy", 1))

    def test_record_logs_stage_timestamp_once_and_doctor_alerts(self):
        with tempfile.TemporaryDirectory() as d:
            for _ in range(2):
                summary = urgent_sla.record(d, "JOV", [todo_row(5)], NOW)
            self.assertEqual(summary["breaches"], 1)
            logged = [json.loads(line) for line in (Path(d) / "urgent-sla.jsonl").read_text().splitlines()]
            self.assertEqual([(e["id"], e["breachedAt"]) for e in logged], [("JOV-5", NOW)])
            self.assertIn("urgent-sla-breach", urgent_sla.alerts({"urgentSla": urgent_sla.view(d)}))
            self.assertEqual(urgent_sla.alerts({}), {})

    def test_fresh_urgent_production_breakage_outranks_older_urgent_pile(self):
        # JOV-11615: FIFO among ~158 Urgent rows left a fresh prod outage unclaimed ~6h.
        now = datetime(2026, 11, 8, 12, tzinfo=timezone.utc).timestamp()
        pile = [lane.Issue(f"id-{n}", f"JOV-{n}", f"Fix thing {n}", "body", 1, "2026-10-01T00:00:00Z", []) for n in range(5)]
        outage = lane.Issue("id-o", "JOV-11615", "Prod synthetic: sign-up AuthShell never ready", "body", 1, "2026-11-08T05:38:00Z", [])
        self.assertIs(lane.pick_issue([*pile, outage], {}, now=now), outage)
        soft = lane.Issue("id-s", "JOV-11616", "Prod synthetic: flaky banner", "body", 2, "2026-11-08T05:38:00Z", [])
        self.assertIsNot(lane.pick_issue([*pile, soft], {}, now=now), soft)


if __name__ == "__main__":
    unittest.main()
