"""Codex delegation takes a lanes seat, honours the cap and writes an agent-tagged row (hermetic)."""
from __future__ import annotations

import fcntl
import json
import sys
import tempfile
import unittest
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import codex_delegate as cd  # noqa: E402
import fleet_ledger as fl  # noqa: E402


class CodexDelegateTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = Path(tmp.name)

    def hold(self, name):
        (self.state / "slots").mkdir(exist_ok=True)
        handle = open(self.state / "slots" / name, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX)
        self.addCleanup(handle.close)

    def test_runs_in_a_seat_that_the_lane_census_counts_and_logs_the_agent(self):
        seen = {}
        code = cd.delegate(self.state, "dots", [sys.executable, "-c",
                           f"import sys;sys.path.insert(0,{str(LANES)!r});import codex_delegate as c;"
                           f"print(c.occupied(__import__('pathlib').Path({str(self.state)!r})))"], limit=2, ceiling=None)
        self.assertEqual(code, 0)
        row = json.loads((self.state / "runs" / "delegations.jsonl").read_text())
        self.assertEqual((row["agent"], row["provider"], row["exit"]), ("dots", "codex", 0))
        self.assertEqual(cd.occupied(self.state), {}, "seat released")

    def test_refuses_when_the_cap_or_host_ceiling_is_reached(self):
        self.hold("codex.0.lock")
        self.assertEqual(cd.delegate(self.state, "instinct", ["true"], limit=1, ceiling=None), cd.EX_TEMPFAIL)
        self.assertEqual(cd.delegate(self.state, "instinct", ["true"], limit=3, ceiling=1), cd.EX_TEMPFAIL)
        self.assertFalse((self.state / "runs" / "delegations.jsonl").exists(), "a refusal spends nothing")
        self.assertEqual(cd.delegate(self.state, "instinct", ["true"], limit=3, ceiling=None), 0)

    def test_failed_command_is_recorded_and_ledger_sums_consumption_per_agent(self):
        self.assertEqual(cd.delegate(self.state, "dots", [sys.executable, "-c", "raise SystemExit(3)"], 1, None), 3)
        cd.delegate(self.state, "dots", ["true"], 1, None)
        cd.delegate(self.state, "instinct", ["true"], 1, None)
        out = fl.codex_consumption(self.state, 0)
        self.assertEqual((out["dots"]["runs"], out["dots"]["failed"], out["instinct"]["runs"]), (2, 1, 1))


if __name__ == "__main__":
    unittest.main()
