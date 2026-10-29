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

    def test_ready_recorder_measures_idle_and_throttled_minutes_and_skips_recorder_gaps(self):
        def row(at, ready, slots, running, base=None):
            fl.record_ready(self.state, NOW + at, {"codex": {"slots": slots, "running": running, "base": base or slots}},
                            {"codex": ready})
        row(0, 5, 3, 1)        # 2 seats idle with work waiting: 5 min idle
        row(300, 5, 3, 3)      # saturated: nothing
        row(600, 5, 1, 1, base=3)  # autoscaler removed seats while work waits: 5 min throttled
        row(900, 0, 3, 0)      # no work: idle but not ready
        row(5000, 4, 3, 0)     # recorder was down for >15 min: that gap is not counted
        out = fl.idle_while_ready(self.state, NOW)
        self.assertEqual(out["idleMin"], {"codex": 5.0})
        self.assertEqual(out["throttledMin"], {"codex": 5.0})
        self.assertEqual(out["coveredMin"], 15.0)

    def test_stranded_and_external_held_helpers(self):
        self.claims(a={"identifier": "LYB-1", "lane": "codex", "status": "active", "claimedAt": NOW - 9 * 3600})
        self.assertEqual(fl.stranded(self.state, NOW), ["LYB-1"])
        fl.external_claim(self.state, "JOV-3", "lola", ttl_s=60, now=NOW)
        self.assertEqual(fl.external_held(self.state, NOW + 30), frozenset({"JOV-3"}))
        self.assertEqual(fl.external_held(self.state, NOW + 90), frozenset())

    def mirror(self, rows):
        path = self.state / "linear"
        path.mkdir(parents=True, exist_ok=True)
        (path / "mirror-JOV.json").write_text(json.dumps({"issues": {f"id-{r['identifier']}": r for r in rows}}))

    def test_gates_park_with_default_and_deadline_and_flag_unbounded_ones(self):
        def row(n, labels, desc, state="unstarted", title="t"):
            return {"identifier": f"JOV-{n}", "labels": labels, "description": desc, "stateType": state, "title": title}
        self.mirror([
            row(1, ["needs-human-decision"], "Default: ship option B\nDeadline: 2099-01-01"),
            row(2, ["hold"], "**Default:** keep flag off\n**Deadline:** 2099-01-01T12:00Z"),
            row(3, ["needs-human"], "Default: x\nDeadline: 1999-01-01"),
            row(4, ["gated"], "no decision recorded"),
            row(5, ["gated"], "Default: x", state="completed"),
            row(6, ["bug"], "Default: x\nDeadline: 1999-01-01"),
            row(7, ["needs:human", "tim-approved"], "approved already"),
            row(8, ["ws:human-decision"], "a workstream label is not a gate")])
        out = fl.gate_census(self.state, now=1_800_000_000)
        self.assertEqual((out["parked"], out["due"], out["unbounded"]), (["JOV-1", "JOV-2"], ["JOV-3"], ["JOV-4"]))

    def test_deadline_follows_tims_risk_and_confidence_rule(self):
        self.assertEqual([fl.gate_deadline_h(r, c) for r, c in (("low", "high"), ("low", "low"), ("med", "med"), ("high", "low"))],
                         [2.0, 8.0, 24.0, 144.0])

    def test_propose_unbounded_bounds_every_gate_once_and_queues_a_comment(self):
        self.mirror([{"identifier": "JOV-9", "labels": ["quality-gap:needs-tim"], "description": "", "stateType": "backlog", "title": "x"},
                     {"identifier": "JOV-10", "labels": ["human-review-required"], "description": "", "stateType": "unstarted",
                      "title": "Publish the first public package"}])
        made = fl.propose_unbounded(self.state, now=NOW)
        self.assertEqual({m["ident"]: (m["risk"], m["confidence"]) for m in made}, {"JOV-9": ("low", "med"), "JOV-10": ("high", "low")})
        self.assertTrue([m for m in made if m["ident"] == "JOV-10"][0]["irreversible"])
        outbox = json.loads((self.state / "linear" / "outbox.json").read_text())["entries"]
        self.assertEqual([e["op"] for e in outbox], ["comment", "comment"])
        self.assertIn("Deadline: ", outbox[0]["body"])
        self.assertEqual(fl.gate_census(self.state, NOW)["counts"], {"parked": 2, "due": 0, "unbounded": 0})
        self.assertEqual(fl.propose_unbounded(self.state, now=NOW), [], "idempotent: nothing left to bound")

    def test_burn_plan_pushes_work_to_capped_agents_that_are_behind_their_window(self):
        week = 7 * 86400
        windows = [{"agent": "muse", "resetAt": NOW + week / 2, "windowS": week, "quota": 100, "used": 10},
                   {"agent": "grokbot", "resetAt": NOW + week / 2, "windowS": week, "quota": 100, "used": 52},
                   {"agent": "gone", "resetAt": NOW - 1, "windowS": week, "quota": 100, "used": 0}]
        plan = fl.burn_plan(windows, NOW)
        self.assertEqual([p["agent"] for p in plan], ["muse", "grokbot"])
        self.assertTrue(plan[0]["behind"])
        self.assertFalse(plan[1]["behind"])
        self.assertEqual(plan[0]["needPerHour"], round(90 / 84, 2))


if __name__ == "__main__":
    unittest.main()
