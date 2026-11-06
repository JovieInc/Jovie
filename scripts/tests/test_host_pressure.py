"""Tests for scripts/lanes/host_pressure.py (host memory-pressure sentinel)."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("host_pressure", ROOT / "scripts/lanes/host_pressure.py")
hp = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hp)

PSI = "some avg10={s} avg60=0.00 avg300=0.00 total=1\nfull avg10={f} avg60=0.00 avg300=0.00 total=1\n"
G = hp.GIB


class HostPressureTest(unittest.TestCase):
    def test_levels(self):
        ok = hp.parse_psi(PSI.format(s=0.5, f=0.1))
        self.assertEqual(hp.level(ok, 30 * G), "ok")
        self.assertEqual(hp.level(hp.parse_psi(PSI.format(s=12, f=0)), 30 * G), "warn")
        self.assertEqual(hp.level(ok, 6 * G), "warn")
        self.assertEqual(hp.level(hp.parse_psi(PSI.format(s=1, f=20)), 30 * G), "crit")
        self.assertEqual(hp.level(ok, 3 * G), "crit")
        self.assertEqual(hp.level(ok, None), "ok")

    def test_meminfo(self):
        self.assertEqual(hp.mem_available("MemTotal: 1 kB\nMemAvailable: 2048 kB\n"), 2048 * 1024)
        self.assertIsNone(hp.mem_available("MemTotal: 1 kB\n"))

    def test_events_only_on_change_and_name_holders(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            calm, hot = hp.parse_psi(PSI.format(s=0, f=0)), hp.parse_psi(PSI.format(s=40, f=20))
            holders = lambda: [{"pid": 1, "rssMiB": 4096, "cgroup": "/x", "cmd": "tsc --noEmit"}]
            lines = lambda: (state / "host-alarms.jsonl").read_text().splitlines() if (state / "host-alarms.jsonl").exists() else []
            hp.publish(state, calm, 40 * G, 1000, holders)
            self.assertEqual(lines(), [])
            hp.publish(state, hot, 2 * G, 1060, holders)
            hp.publish(state, hot, 2 * G, 1120, holders)
            self.assertEqual(len(lines()), 1)
            event = json.loads(lines()[0])
            self.assertEqual((event["kind"], event["level"], event["topHolders"][0]["cmd"]), ("host-memory-pressure", "crit", "tsc --noEmit"))
            hp.publish(state, calm, 40 * G, 1180, holders)
            self.assertEqual(len(lines()), 2)
            self.assertNotIn("topHolders", json.loads(lines()[1]))

    def test_top_holders_reads_proc(self):
        rows = hp.top_holders(limit=2)
        self.assertLessEqual(len(rows), 2)
        self.assertTrue(all({"pid", "rssMiB", "cgroup", "cmd"} <= set(r) for r in rows))

    def test_disk_forecast_alarms_on_a_shrinking_trend_before_the_threshold(self):
        total, day = 1000 * G, 86400
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            lines = lambda: (state / "host-alarms.jsonl").read_text().splitlines() if (state / "host-alarms.jsonl").exists() else []
            # 20% free, losing 2% (20 GB) per day: 5% floor is 7.5 days away -> quiet, then alarm as it nears.
            for hour in range(0, 49):
                now = 1_000_000 + hour * 3600
                free = 200 * G - int(20 * G * hour / 24)
                hp.publish_disk_forecast(state, now, usage=lambda _p, f=free: (total, total - f, f))
            self.assertEqual(len(lines()), 1)
            self.assertEqual(json.loads(lines()[0])["kind"], "host-disk-forecast")
            self.assertTrue(json.loads(lines()[0])["alarm"])
            # Space recovers (flat trend afterwards would take days of history); a big jump flips the slope.
            self.assertEqual(hp.forecast_days([[0, 100 * G], [3600, 100 * G], [8 * 3600, 100 * G]], total), None)
            self.assertIsNone(hp.forecast_days([[0, 100 * G]], total))
            self.assertEqual(hp.forecast_days([[0, 60 * G], [3600, 55 * G], [8 * 3600, 40 * G]], total), 0.0)

    def test_load_storm_alarms_only_when_sustained_and_clears(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            census = lambda: {"processes": 3000, "defunct": 1293, "top": [{"comm": "node", "count": 194}]}
            lines = lambda: [json.loads(x) for x in (state / "host-alarms.jsonl").read_text().splitlines()] if (state / "host-alarms.jsonl").exists() else []
            hp.publish_load(state, 60.0, 16, 1000, census=census)       # 4x16=64: under the line
            hp.publish_load(state, 457.0, 16, 1060, census=census)      # over, just started
            self.assertEqual(lines(), [])
            hp.publish_load(state, 900.0, 16, 1120, census=census)      # 60 s over: not yet
            self.assertEqual(lines(), [])
            hp.publish_load(state, 1661.0, 16, 1180, census=census)     # 120 s over: alarm
            hp.publish_load(state, 1661.0, 16, 1240, census=census)     # still over: no duplicate
            self.assertEqual(len(lines()), 1)
            event = lines()[0]
            self.assertEqual((event["kind"], event["alarm"], event["threshold"]), ("host-load-storm", True, 64.0))
            self.assertEqual(event["census"]["defunct"], 1293)
            hp.publish_load(state, 5.0, 16, 1300, census=census)
            self.assertEqual([e["alarm"] for e in lines()], [True, False])

    def test_load_blip_resets_the_clock(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            hp.publish_load(state, 500.0, 16, 1000, census=dict)
            hp.publish_load(state, 10.0, 16, 1060, census=dict)
            hp.publish_load(state, 500.0, 16, 1120, census=dict)
            row = hp.publish_load(state, 500.0, 16, 1180, census=dict)
            self.assertFalse(row["alarm"])

    def test_load_config_env_override_and_census(self):
        self.assertEqual(hp.load_config({"JOVIE_LOAD_ALARM_MULT": "0.5", "JOVIE_LOAD_ALARM_SECS": "1"}), (0.5, 1.0))
        self.assertEqual(hp.load_config({"JOVIE_LOAD_ALARM_MULT": "x"}), (4.0, 120.0))
        if Path("/proc").exists():
            self.assertGreater(hp.process_census()["processes"], 0)


if __name__ == "__main__":
    unittest.main()
