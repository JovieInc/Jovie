"""incident and board-task jovie-stage-event/v1 rows (scripts/lanes/stage_events.py) and the doctor
fields they read (lastGoodEpoch on conditions, openedAt on issues).

Run with:
    python3 -m pytest scripts/tests/test_incident_stage_events.py -q
"""
from __future__ import annotations

import importlib
import json
import pickle
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))


def load(name):
    return importlib.import_module(name)


stage_events = load("stage_events")
T0 = 1_793_590_000.0  # 2026-11-02T03:26:40Z
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


class ReasonCheckRows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)
        (self.state / "runs").mkdir()
        self.directory = self.state / "runs/reason-checks"
        self.directory.mkdir()
        self.path = self.directory / "2026-11-02.jsonl"

    def receipt(self, **changes):
        return {"schema": "jovie.reason-check/v1", "checkId": "a" * 32, "host": "gem", "owner": "reason-lane",
                "startedAt": "2026-11-02T03:26:40.125000Z", "observedAt": "2026-11-02T03:26:40.250000Z",
                "status": "idle", "source": {"status": "available", "producer": "scripts/lanes/reason_dispatch.py",
                "sourceCommit": "1" * 40, "bundleDigest": "2" * 64, "laneTree": "3" * 40}, **changes}

    def write(self, rows, tail=""):
        self.path.write_text("".join(json.dumps(row) + "\n" for row in rows) + tail)

    def test_check_precision_and_host_identity_never_claim_job_acceptance(self):
        self.write([self.receipt(status=status, host=host) for host, status in
                    (("gem", "idle"), ("mac", "spawned"), ("other", "running"))])
        rows = stage_events.reason_check_events(self.state, T0 + 10)
        self.assertEqual(len(rows), 6)
        self.assertEqual({row["entityType"] for row in rows}, {"reason-check"})
        self.assertEqual({row["stage"] for row in rows}, {"queue-check", "checked"})
        self.assertEqual(len({row["entityId"] for row in rows}), 3)
        checked = stages(rows, "reason-check")
        self.assertEqual(checked["queue-check"]["enteredAt"], "2026-11-02T03:26:40.125000Z")
        self.assertEqual(checked["queue-check"]["exitedAt"], "2026-11-02T03:26:40.250000Z")
        self.assertEqual(checked["checked"]["outcome"], "completed")
        self.assertEqual(checked["checked"]["enteredAt"], checked["checked"]["exitedAt"])

    def test_blocked_and_rate_limited_checks_are_failed(self):
        for changes in ({"status": "blocked"}, {"status": "linear-rate-limited"},
                        {"status": "blocked", "blockedOn": "queue"}, {"blockedOn": "disk-admission"}):
            with self.subTest(changes=changes):
                self.write([self.receipt(**changes)])
                rows = stage_events.reason_check_events(self.state, T0 + 10)
                self.assertEqual(len(rows), 2)
                self.assertEqual({row["outcome"] for row in rows}, {"failed"})

    def test_duplicate_receipts_have_stable_event_identity_and_one_sample(self):
        receipt = self.receipt()
        self.write([receipt, receipt])
        rows = stage_events.reason_check_events(self.state, T0 + 10)
        self.assertEqual(len(rows), 2)
        text = stage_events.ndjson(self.state / "runs/ledger.jsonl", T0 + 10)
        self.assertCountEqual([json.loads(line) for line in text.splitlines()], rows)
        self.assertEqual(rows[0]["sourceReceipt"], "reason-check:gem:" + "a" * 32)
        self.assertEqual(stage_events.reason_check_events(self.state, T0 + 20), rows)

    def test_conflicting_duplicate_receipts_cannot_select_a_green_sample(self):
        source = {**self.receipt()["source"], "sourceCommit": "4" * 40}
        for conflict in (self.receipt(status="blocked", blockedOn="queue"), self.receipt(source=source)):
            with self.subTest(conflict=conflict):
                self.write([self.receipt(), conflict])
                self.assertEqual(stage_events.reason_check_events(self.state, T0 + 10), [])

    def test_identifiable_conflicts_are_quarantined_before_qualification(self):
        good = self.receipt()
        conflicts = [self.receipt(status="blocked", blockedOn="queue", source={"status": "unavailable", "reason": "missing release"}),
                     self.receipt(source=None), self.receipt(observedAt=None), self.receipt(status="checking"),
                     self.receipt(observedAt="not-a-time"), self.receipt(schema="other"), self.receipt(owner="other")]
        for conflict in conflicts:
            for rows in ([good, conflict], [conflict, good]):
                with self.subTest(conflict=conflict, first=rows[0]):
                    self.write(rows)
                    self.assertEqual(stage_events.reason_check_events(self.state, T0 + 10), [])
                    self.assertEqual(stage_events.ndjson(self.state / "runs/ledger.jsonl", T0 + 10), "")
        self.write([good, conflicts[0], self.receipt(host="mac")])
        rows = stage_events.reason_check_events(self.state, T0 + 10)
        self.assertEqual(len(rows), 2)
        self.assertEqual({row["entityId"] for row in rows}, {"mac@" + "a" * 32})

    def test_malformed_partial_stale_future_and_unqualified_receipts_are_not_samples(self):
        source = self.receipt()["source"]
        invalid = [self.receipt(schema="other"), self.receipt(checkId="short"), self.receipt(host=""),
                   self.receipt(owner="code"), self.receipt(status="checking"), self.receipt(status="scheduled"),
                   self.receipt(source={**source, "sourceCommit": "short"}),
                   self.receipt(source={**source, "bundleDigest": "short"}),
                   self.receipt(source={**source, "laneTree": "short"}),
                   self.receipt(source={"status": "unavailable", "reason": "missing release"}),
                   self.receipt(observedAt=None), self.receipt(startedAt="not-a-time"),
                   self.receipt(startedAt="2026-11-02T03:26:41Z"),
                   self.receipt(observedAt="2026-11-02T03:27:00Z"),
                   self.receipt(startedAt="2026-09-02T02:06:40Z", observedAt="2026-09-02T02:06:41Z")]
        for receipt in invalid:
            with self.subTest(receipt=receipt):
                self.write([receipt])
                self.assertEqual(stage_events.reason_check_events(self.state, T0 + 10), [])
        self.write([self.receipt()], tail=json.dumps(self.receipt(checkId="b" * 32)))
        with self.assertRaisesRegex(OSError, "reason-check-history-incomplete"):
            stage_events.reason_check_events(self.state, T0 + 10)
        self.path.write_text(json.dumps(self.receipt()) + '\n{"schema": "jovie.reason-check/v1"\n')
        with self.assertRaisesRegex(OSError, "reason-check-history-incomplete"):
            stage_events.ndjson(self.state / "runs/ledger.jsonl", T0 + 10)

    def test_cross_partition_duplicates_and_conflicts_are_global(self):
        prior = self.directory / "2026-11-01.jsonl"
        good = self.receipt()
        self.write([good])
        prior.write_text(json.dumps(good) + "\n")
        self.assertEqual(len(stage_events.reason_check_events(self.state, T0 + 10)), 2)
        conflict = self.receipt(status="blocked", source={"status": "unavailable", "reason": "release unreadable"})
        for first, second in ((good, conflict), (conflict, good)):
            with self.subTest(first=first):
                prior.write_text(json.dumps(first) + "\n")
                self.write([second])
                self.assertEqual(stage_events.reason_check_events(self.state, T0 + 10), [])

    def test_only_strict_recent_utc_partitions_are_opened(self):
        self.write([self.receipt()])
        ignored = ["2026-10-04.jsonl", "2026-11-03.jsonl", "2026-11-2.jsonl", "2026-02-30.jsonl", "2026-11-02.jsonl.tmp"]
        for name in ignored:
            (self.directory / name).write_bytes(b"\xff")
        legacy = self.state / "runs/reason-ticks.jsonl"
        legacy.write_bytes(b"preserved old audit\xff")
        original_open = stage_events.os.open
        def check_open(path, *args, **kwargs):
            self.assertNotIn(Path(path).name, ignored + [legacy.name])
            return original_open(path, *args, **kwargs)
        with mock.patch.object(stage_events.os, "open", side_effect=check_open), \
                mock.patch.object(Path, "read_text", side_effect=AssertionError("reason history must stream")):
            self.assertEqual(len(stage_events.reason_check_events(self.state, T0 + 10)), 2)
        self.assertEqual(legacy.read_bytes(), b"preserved old audit\xff")

    def test_partition_intersecting_oldest_window_day_is_included(self):
        edge = self.receipt(checkId="b" * 32, startedAt="2026-10-05T23:00:00Z", observedAt="2026-10-05T23:00:01Z")
        (self.directory / "2026-10-05.jsonl").write_text(json.dumps(edge) + "\n")
        self.write([self.receipt()])
        self.assertEqual(len(stage_events.reason_check_events(self.state, T0 + 10)), 4)

    def test_unreadable_or_corrupt_partition_prevents_partial_statistics(self):
        self.write([self.receipt()])
        with mock.patch.object(stage_events.os, "open", side_effect=PermissionError("history unavailable")):
            with self.assertRaisesRegex(OSError, "reason-check-history-incomplete"):
                stage_events.reason_check_events(self.state, T0 + 10)
        (self.directory / "2026-11-01.jsonl").write_bytes(b"\xff\n")
        with self.assertRaisesRegex(OSError, "reason-check-history-incomplete"):
            stage_events.ndjson(self.state / "runs/ledger.jsonl", T0 + 10)


    def test_oversized_serialized_history_row_is_rejected_before_aggregation(self):
        oversized = self.receipt(checkId="b" * 32, padding="x" * (1024 * 1024))
        self.write([self.receipt(), oversized])
        with self.assertRaisesRegex(OSError, "reason-check-history-incomplete"):
            stage_events.reason_check_events(self.state, T0 + 10)
        self.write([self.receipt()], tail=json.dumps(oversized))
        with self.assertRaisesRegex(OSError, "reason-check-history-incomplete"):
            stage_events.ndjson(self.state / "runs/ledger.jsonl", T0 + 10)

    def test_incomplete_history_cannot_upload_a_partial_statistical_feed(self):
        self.write([self.receipt()], tail=json.dumps(self.receipt(checkId="b" * 32)))
        doctor = load("doctor")
        lane = mock.Mock()
        with mock.patch.object(doctor.time, "time", return_value=T0 + 10), \
                mock.patch.object(doctor.time, "monotonic", return_value=0), \
                mock.patch.object(doctor, "now_iso", return_value="2026-11-02T03:26:50Z"), \
                mock.patch.object(doctor, "public_status_projection", return_value="{}"), \
                mock.patch.object(doctor.lifecycle, "run") as transport:
            with self.assertRaisesRegex(OSError, "reason-check-history-incomplete") as failure:
                doctor._publish_status(mock.Mock(state=self.state), lane, {}, "JOV-12871")
        transport.assert_not_called()
        lane.load_github_env.assert_not_called()
        self.assertFalse((self.state / "lanes-status-publish.json").exists())
        self.assertIn("owner=reason-lane", str(failure.exception)[:120])
        self.assertIn("action=restore complete daily receipts", str(failure.exception)[:120])

class ManifestAndDoctor(unittest.TestCase):
    def test_existing_module_and_pickle_identity_are_preserved(self):
        for name, attribute in (("stage_events", "event"), ("doctor", "Tracker")):
            with self.subTest(module=name):
                canonical = importlib.import_module(name)
                subject = getattr(canonical, attribute)
                self.assertIs(load(name), canonical)
                self.assertIs(pickle.loads(pickle.dumps(subject)), subject)

    def test_every_emitted_stage_is_registered(self):
        manifest = json.loads((ROOT / "docs/metrics/stage-manifest.json").read_text())
        for entity, ids in (("incident", {"undetected", "unfiled", "open", "cleared"}),
                            ("board-task", {"posted", "running", "closed"}),
                            ("reason-check", {"queue-check", "checked"})):
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
