"""Fleet completeness and probe alarms for the capacity forecaster (every machine covered)."""
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/capacity"))
import forecast as f  # noqa: E402

REG = json.loads((ROOT / "ops/registry/capacity-resources.json").read_text())


class FleetTests(unittest.TestCase):
    def test_registry_complete(self):
        self.assertEqual(f.check_registry(REG), [])

    def test_missing_machine_resource_fails(self):
        reg = json.loads(json.dumps(REG))
        reg["resources"] = [r for r in reg["resources"] if r["id"] != "air-liveness"]
        self.assertIn("air: missing resource air-liveness", f.check_registry(reg))

    def test_unknown_tailnet_peer_fails(self):
        self.assertTrue(f.check_registry(REG, ["mystery-box"]))
        self.assertEqual(f.check_registry(REG, ["tims-macbook-air", "gem"]), [])

    def test_air_alarm_at_simulated_low_threshold_and_dark_host(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d)
            ok = lambda target: {"used": 50 * 2**30, "total": 100 * 2**30}  # noqa: E731
            rows = {r["id"]: r for r in f.probe(REG, "mac", time.time(), state, probe_fn=ok)}
            self.assertEqual(rows["air-disk"]["status"], "OK")
            rows = {r["id"]: r for r in f.probe(REG, "mac", time.time(), state, limit_frac=0.4, probe_fn=ok)}
            self.assertEqual(rows["air-disk"]["status"], "AT-LIMIT")
            rows = {r["id"]: r for r in f.probe(REG, "mac", time.time(), state, probe_fn=lambda t: None)}
            self.assertEqual(rows["air-liveness"]["status"], "AT-LIMIT")


if __name__ == "__main__":
    unittest.main()
