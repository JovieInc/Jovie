"""Fleet work ledger: claim liveness, external claims with ttl, duplicates, throughput (hermetic)."""
from __future__ import annotations

import fcntl
import json
import sys
import tempfile
import unittest
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import fleet_ledger as fl  # noqa: E402

NOW = 1_800_000_000.0


def run(run_id, start, end, **kw):
    return {"runId": run_id, "provider": kw.pop("provider", "codex"), "_s": start, "_e": end, **kw}


class FleetLedgerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state = Path(tmp.name)

    def claims(self, **rows):
        path = self.state / "linear" / "claims.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"claims": rows}))

    def test_stranded_live_and_starting_claims(self):
        self.claims(a={"identifier": "LYB-1", "lane": "codex", "status": "active", "claimedAt": NOW - 5 * 3600},
                    b={"identifier": "LYB-2", "lane": "grok", "status": "active", "claimedAt": NOW - 5 * 3600},
                    c={"identifier": "LYB-3", "lane": "codex", "status": "active", "claimedAt": NOW - 60},
                    d={"identifier": "LYB-4", "lane": "codex", "status": "released", "claimedAt": NOW - 9})
        held = self.state / "bindings" / "LYB" / "issue.LYB-2.lock"
        held.parent.mkdir(parents=True)
        handle = open(held, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX)
        self.addCleanup(handle.close)
        verdicts = {r["ident"]: r["verdict"] for r in fl.ledger(self.state, NOW)}
        self.assertEqual(verdicts, {"LYB-1": "stranded", "LYB-2": "live", "LYB-3": "starting"})

    def test_external_claim_excludes_others_until_ttl_then_expires(self):
        self.assertTrue(fl.external_claim(self.state, "JOV-9", "lola", ttl_s=600, now=NOW))
        self.assertFalse(fl.external_claim(self.state, "JOV-9", "hyperagent", now=NOW + 599))
        self.assertTrue(fl.external_heartbeat(self.state, "JOV-9", "lola", now=NOW + 500))
        self.assertFalse(fl.external_claim(self.state, "JOV-9", "hyperagent", now=NOW + 1000))
        self.assertTrue(fl.external_claim(self.state, "JOV-9", "hyperagent", now=NOW + 1200))  # lola went quiet
        self.assertFalse(fl.external_release(self.state, "JOV-9", "lola"))
        self.assertEqual(fl.external_active(self.state, "JOV-9", NOW + 1300)["agent"], "hyperagent")
        self.assertEqual({r["verdict"] for r in fl.ledger(self.state, NOW + 1300)}, {"live"})
        self.assertEqual({r["verdict"] for r in fl.ledger(self.state, NOW + 9000)}, {"expired"})

    def test_duplicate_overlap_ignores_handoffs_and_timers(self):
        runs = [run("a", 0, 1000, pr=7), run("b", 400, 2000, pr=7, provider="grok"),
                run("c", 2000, 2500, pr=7), run("t1", 0, 9000, issue="JOV-1", kind="outcome-verify"),
                run("t2", 10, 9000, issue="JOV-1", kind="outcome-verify")]
        found = fl.duplicate_overlaps(runs)
        self.assertEqual([(d["a"], d["b"], d["overlapS"]) for d in found], [("a", "b", 600)])

    def test_throughput_splits_overnight_from_day_and_caps_hung_runs(self):
        day = 1_799_971_200  # a UTC midnight
        runs = [run("n", day + 3600, day + 3600 + 600, verdict="fix-pushed"),
                run("d", day + 10 * 3600, day + 10 * 3600 + 400 * 3600, verdict="failed"),
                run("x", day + 3600, day + 4000, kind="outcome-verify")]
        out = fl.throughput(runs, days=1)
        self.assertEqual(out["overnight_00_08"]["runs"], 1)
        self.assertEqual(out["overnight_00_08"]["productivePerHour"], round(1 / 8, 3))
        self.assertEqual(out["day_08_24"]["agentHoursPerHour"], round(4 / 16, 2))

    def test_factory_share_flags_starvation_and_never_hides_unclassified(self):
        keys = iter(["ci", "reliability", "reliability", "reliability", "reliability", None])
        out = fl.factory_share([run(str(i), 0, 1) for i in range(6)], lambda r: next(keys))
        self.assertEqual((out["factory"], out["product"], out["unclassified"]), (1, 4, 1))
        self.assertEqual(out["share"], 0.2)
        self.assertFalse(out["belowTarget"])
        keys = iter(["repair"] * 3 + ["general"])
        out = fl.factory_share([run(str(i), 0, 1) for i in range(4)], lambda r: next(keys))
        self.assertEqual((out["repair"], out["share"]), (3, 0.0))
        keys = iter(["general"] * 5)
        self.assertTrue(fl.factory_share([run(str(i), 0, 1) for i in range(5)], lambda r: next(keys))["belowTarget"])


if __name__ == "__main__":
    unittest.main()
