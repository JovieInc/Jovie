import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "capacity"))
import forecast as f

H = 3600
RES = {"id": "x", "group": "g", "label": "X", "unit": "bytes", "leadTimeHours": 7 * 24, "mode": "trend",
       "atLimit": {"effect": "deny", "note": "n"}, "collector": {"type": "disk"},
       "fix": {"escalate": {"options": [{"label": "NVMe", "cost": "$200", "lead": "3d"}], "default": "sweep", "deadlineHours": 48}}}


class Forecast(unittest.TestCase):
    def test_slope_needs_span_and_points(self):
        self.assertIsNone(f.slope_per_hour([(0, 1), (H, 2)]))
        self.assertIsNone(f.slope_per_hour([(0, 1), (H, 2), (2 * H, 3)]))
        pts = [(i * 12 * H, i * 10.0) for i in range(8)]
        self.assertAlmostEqual(f.slope_per_hour(pts), 10 / 12, places=6)

    def test_alarm_when_ttl_inside_lead_time(self):
        hist = [(i * 12 * H, 100 + i * 12.0) for i in range(8)]  # 1 unit/hour
        row = f.evaluate(RES, {"value": 200, "limit": 300}, hist[:-1], hist[-1][0] + 12 * H)
        self.assertEqual(row["status"], "ALARM")
        self.assertAlmostEqual(row["ttlHours"], 100, delta=3)

    def test_ok_when_ttl_outside_lead_time(self):
        hist = [(i * 12 * H, 100 + i * 1.2) for i in range(8)]  # 0.1/hour
        row = f.evaluate(RES, {"value": 110, "limit": 500}, hist, hist[-1][0] + 12 * H)
        self.assertEqual(row["status"], "OK")

    def test_headroom_floor_without_history(self):
        row = f.evaluate(RES, {"value": 95, "limit": 100}, [], 0)
        self.assertEqual(row["status"], "ALARM")

    def test_at_limit_and_gap_and_stale(self):
        self.assertEqual(f.evaluate(RES, {"value": 100, "limit": 100}, [], 0)["status"], "AT-LIMIT")
        self.assertEqual(f.evaluate(RES, None, [], 0)["status"], "GAP")
        res = dict(RES, maxAgeDays=1)
        row = f.evaluate(res, {"value": 1, "limit": 100, "observedAt": "2026-01-01T00:00:00Z"}, [], f.parse_iso("2026-01-05T00:00:00Z"))
        self.assertEqual(row["status"], "STALE")

    def test_publish_is_change_only_and_never_buys(self):
        with tempfile.TemporaryDirectory() as d:
            state, feed = Path(d) / "s", Path(d) / "alarms.jsonl"
            row = f.evaluate(RES, {"value": 95, "limit": 100}, [], 0)
            reg = {"resources": [RES]}
            first = f.publish([row], reg, 0, state, feed)
            second = f.publish([row], reg, 60, state, feed)
            self.assertEqual(len(first), 1)
            self.assertEqual(second, [])
            self.assertTrue(first[0]["neverBuy"])
            self.assertIn("NVMe", first[0]["body"])
            self.assertEqual(len(feed.read_text().splitlines()), 1)

    def test_registry_is_complete(self):
        reg = json.loads(f.REGISTRY.read_text())
        ids = [r["id"] for r in reg["resources"]]
        self.assertEqual(len(ids), len(set(ids)))
        for r in reg["resources"]:
            self.assertIn(r["atLimit"]["effect"], ("pause", "deny", "crash"), r["id"])
            self.assertGreater(r["leadTimeHours"], 0, r["id"])
            self.assertIn(r["collector"]["type"], list(f.COLLECTORS) + ["none"], r["id"])
            self.assertIn(r["host"], ("gem", "mac", "air", "cloud", "any"), r["id"])
        self.assertIn(reg["cloudCollector"], reg["hostAliases"])


if __name__ == "__main__":
    unittest.main()
