"""incident and board-task jovie-stage-event/v1 rows (scripts/lanes/stage_events.py) and the doctor
fields they read (lastGoodEpoch on conditions, openedAt on issues).

Run with:
    python3 -m pytest scripts/tests/test_incident_stage_events.py -q
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


stage_events = load("stage_events")
T0 = 1_793_590_000.0  # 2026-11-02T02:06:40Z
KEY = "probe-red:gem:jovie-research"


def condition(state, generation=1, first=T0, good=T0 - 600):
    return {"state": state, "generation": generation, "firstObservedEpoch": first, "lastGoodEpoch": good}


def stages(rows, entity):
    return {row["stage"]: row for row in rows if row["entityType"] == entity}


class IncidentRows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)

    def tick(self, previous, result, now):
        return stage_events.journal_incidents(self.state, previous, result, "gem", now)

    def test_detect_file_clear_lifecycle(self):
        quiet = {"conditions": {}, "issues": {}}
        raised = {"conditions": {KEY: condition("active")}, "issues": {KEY: {"id": None, "closedAt": None}}}
        filed = {"conditions": {KEY: condition("active")}, "issues": {KEY: {"id": "i1", "closedAt": None}}}
        cleared = {"conditions": {KEY: {**condition("active"), "state": "resolved"}},
                   "issues": {KEY: {"id": "i1", "closedAt": T0 + 3600}}}
        self.assertEqual([r["event"] for r in self.tick(quiet, raised, T0)], ["detected"])
        self.assertEqual([r["event"] for r in self.tick(raised, filed, T0 + 120)], ["filed"])
        self.assertEqual(self.tick(filed, filed, T0 + 240), [], "steady state writes nothing")
        self.assertEqual([r["event"] for r in self.tick(filed, cleared, T0 + 3600)], ["cleared"])
        rows = stage_events.incident_events(self.state, T0 + 3700)
        got = stages(rows, "incident")
        self.assertEqual(set(got), {"undetected", "unfiled", "open", "cleared"})
        self.assertEqual(got["undetected"]["enteredAt"], stage_events._iso(T0 - 600))
        self.assertEqual(got["undetected"]["exitedAt"], stage_events._iso(T0))
        self.assertEqual(got["unfiled"]["exitedAt"], stage_events._iso(T0 + 120))
        self.assertEqual((got["open"]["enteredAt"], got["open"]["exitedAt"], got["open"]["outcome"]),
                         (stage_events._iso(T0 + 120), stage_events._iso(T0 + 3600), "completed"))
        self.assertEqual(got["cleared"]["entityId"], f"gem:{KEY}#1")
        for row in rows:
            self.assertEqual(row["schema"], "jovie-stage-event/v1")
            self.assertEqual(row["sourceReceipt"], f"doctor:gem:{KEY}:1")

    def test_open_incident_and_new_generation(self):
        self.tick({}, {"conditions": {KEY: condition("active", good=None)}, "issues": {}}, T0)
        got = stages(stage_events.incident_events(self.state, T0 + 60), "incident")
        self.assertEqual(set(got), {"open"}, "no last-good proof: no undetected row; never filed: open from the raise")
        self.assertEqual((got["open"]["exitedAt"], got["open"]["outcome"]), (None, "open"))
        # Reopen as generation 2 is a new entity.
        rows = self.tick({"conditions": {KEY: condition("resolved")}},
                         {"conditions": {KEY: condition("active", generation=2, first=T0 + 900)}, "issues": {}}, T0 + 900)
        self.assertEqual(rows[0]["generation"], 2)
        ids = {row["entityId"] for row in stage_events.incident_events(self.state, T0 + 960)}
        self.assertEqual(ids, {f"gem:{KEY}#1", f"gem:{KEY}#2"})

    def test_issue_already_open_is_not_a_new_filing(self):
        issues = {KEY: {"id": "i0", "closedAt": None}}
        rows = self.tick({"conditions": {}, "issues": issues}, {"conditions": {KEY: condition("active")}, "issues": issues}, T0)
        self.assertEqual([r["event"] for r in rows], ["detected"])
        # A reopen after the doctor closed it is a filing.
        rows = self.tick({"conditions": {}, "issues": {KEY: {"id": "i0", "closedAt": T0 - 50}}},
                         {"conditions": {KEY: condition("active", generation=2)}, "issues": issues}, T0 + 10)
        self.assertEqual([r["event"] for r in rows], ["detected", "filed"])

    def test_ndjson_publishes_incident_and_board_rows(self):
        self.tick({}, {"conditions": {KEY: condition("active")}, "issues": {}}, T0)
        (self.state / "runs").mkdir(exist_ok=True)
        (self.state / "runs" / "ledger.jsonl").write_text("")
        text = stage_events.ndjson(self.state / "runs" / "ledger.jsonl", T0 + 60)
        types = {json.loads(line)["entityType"] for line in text.splitlines()}
        self.assertIn("incident", types)


class BoardRows(unittest.TestCase):
    def test_claim_latency_run_time_and_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "runs"
            runs.mkdir()
            rows = [
                {"event": "claimed", "id": "stall-jovie-1-abcdef0-a1", "kind": "stall", "postedEpoch": T0, "claimedEpoch": T0 + 30},
                {"event": "done", "id": "stall-jovie-1-abcdef0-a1", "kind": "stall", "postedEpoch": T0, "claimedEpoch": T0 + 30, "closedEpoch": T0 + 930},
                {"event": "claimed", "id": "jov-9-c1", "kind": "goal", "postedEpoch": T0, "claimedEpoch": T0 + 60},
                {"event": "failed", "id": "jov-9-c1", "kind": "goal", "postedEpoch": T0, "claimedEpoch": T0 + 60, "closedEpoch": T0 + 120},
                {"event": "claimed", "id": "jov-10-c1", "kind": "goal", "postedEpoch": T0, "claimedEpoch": T0 + 90},
                "not json",
            ]
            (runs / "board-intake.jsonl").write_text("\n".join(r if isinstance(r, str) else json.dumps(r) for r in rows))
            out = stage_events.board_events(Path(tmp), T0 + 1000)
        by = {(r["entityId"], r["stage"]): r for r in out}
        done = by[("stall-jovie-1-abcdef0-a1", "running")]
        self.assertEqual((done["enteredAt"], done["exitedAt"], done["outcome"]),
                         (stage_events._iso(T0 + 30), stage_events._iso(T0 + 930), "completed"))
        self.assertEqual(by[("jov-9-c1", "closed")]["outcome"], "failed")
        self.assertEqual(by[("jov-10-c1", "running")]["outcome"], "open")
        self.assertNotIn(("jov-10-c1", "closed"), by)
        self.assertEqual(by[("jov-9-c1", "posted")]["exitedAt"], stage_events._iso(T0 + 60))

    def test_missing_journal_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(stage_events.board_events(Path(tmp), T0), [])
            self.assertEqual(stage_events.incident_events(Path(tmp), T0), [])


class ManifestAndDoctor(unittest.TestCase):
    def test_every_emitted_stage_is_registered(self):
        manifest = json.loads((ROOT / "docs/metrics/stage-manifest.json").read_text())
        for entity, ids in (("incident", {"undetected", "unfiled", "open", "cleared"}),
                            ("board-task", {"posted", "running", "closed"})):
            self.assertEqual({stage["id"] for stage in manifest["entities"][entity]["stages"]}, ids)

    def test_doctor_records_last_good(self):
        doctor = load("doctor")
        obs = {"now": T0, "integrationProbes": {"probes": {"gem:jovie-research": {"lastGoodAt": T0 - 300}}},
               "automation": {"silent": {"gem:waste-loop": {"ageS": 7200}}}}
        self.assertEqual(doctor.last_good_epoch(KEY, obs, T0), T0 - 300)
        self.assertEqual(doctor.last_good_epoch("automation-silent:gem:waste-loop", obs, T0), T0 - 7200)
        self.assertIsNone(doctor.last_good_epoch("no-landing", obs, T0))
        receipts = doctor.condition_receipts({KEY: "red"}, {}, obs, "gem")
        self.assertEqual(receipts[KEY]["lastGoodEpoch"], T0 - 300)


if __name__ == "__main__":
    unittest.main()
