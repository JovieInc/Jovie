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


if __name__ == "__main__":
    unittest.main()
