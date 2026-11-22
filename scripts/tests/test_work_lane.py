"""Non-code lanes run beside code, never behind it (Tim, 2026-11-22): hermetic, no network.

Guard: fails if any admission or refill path holds, displaces, demotes or counts non-code
work (design, research, data, copy, whiteboard) for a code dependency it does not have, including
when golden-path Urgent code work is being admitted.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import binding_refill
import linear_sync as ls
import priority_admission as pa
import work_lane
from test_priority_admission import BODY, NOW, FakeClient, FakeLane, row

STALE = "2026-10-01T00:00:00.000Z"


def design(n, state="Todo", priority=4, updated=STALE, title=None, labels=()):
    r = row(n, state, priority=priority, labels=labels, updated=updated)
    r["title"] = title or f"Pen draft for approval: frame-{n}"
    return r


def seed(d, rows):
    state = Path(d)
    path = ls.mirror_path(state, "JOV")
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))
    return SimpleNamespace(state=str(state))


def moves(d):
    entries = ls._read(Path(d) / "linear" / "outbox.json", ls.OUTBOX).get("entries", [])
    return {(e["issueId"], e["target"]) for e in entries if e["op"] == "move"}


class Classification(unittest.TestCase):
    def test_explicit_signals_only(self):
        self.assertEqual(work_lane.lane_of({"title": "Pen draft for approval: claim", "labels": []}), "design")
        self.assertEqual(work_lane.lane_of({"title": "x", "labels": ["pen-draft:needs-tim"]}), "design")
        for lane in work_lane.NON_CODE_LANES:
            self.assertEqual(work_lane.lane_of({"title": "x", "labels": [f"Lane:{lane.title()}"]}), lane)
        # loose wording and generic labels stay code: they are on code issues too
        for title, labels in (("Redraw the hero in Figma", ["figma", "research"]),
                              ("Re: Pen draft for approval: claim", []), ("Fix golden path", ["design-system"])):
            self.assertEqual(work_lane.lane_of({"title": title, "labels": labels}), "code", title)
        # lane:code hands a mislabelled item back to code
        self.assertEqual(work_lane.lane_of({"title": "Pen draft for approval: claim", "labels": ["lane:code"]}), "code")

    def test_issue_objects_classify_like_rows(self):
        issue = SimpleNamespace(title="Load artist list", labels=["lane:data"])
        self.assertTrue(work_lane.is_non_code(issue))


class GoldenPathNeverHoldsNonCode(unittest.TestCase):
    def test_urgent_code_admission_displaces_code_not_design(self):
        # Todo holds 31 low-scoring non-code items and three code items (code target 2). An Urgent
        # golden-path fix arrives: a code item gives way, every design and data item stays in Todo.
        todo = [design(100 + i, labels=("lane:design",)) for i in range(30)] + [design(200, title="Load lead list", labels=("lane:data",)),
                                                       *(row(300 + i, "Todo", priority=4) for i in range(3))]
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, [row(1, priority=1), *todo]), "JOV", FakeClient(), now=NOW)
            self.assertEqual(receipt["admitted"], ["JOV-1"])
            self.assertEqual(receipt["todo"], 3, "only code counts toward the code target")
            self.assertEqual(receipt["nonCodeTodo"]["design"], 30)
            self.assertEqual(receipt["nonCodeTodo"]["data"], 1)
            backlogged = {issue for issue, target in moves(d) if target == "Backlog"}
            self.assertEqual(len(receipt["displaced"]), 1)
            self.assertTrue(receipt["displaced"][0].startswith("JOV-30"), receipt["displaced"])
            self.assertEqual(backlogged, {"id-" + receipt["displaced"][0][4:]}, "no design or data item went back to Backlog")

    def test_accepted_pen_draft_becomes_a_speed_build(self):
        # Tim accepts a Pen draft by moving it to Todo. It must get a builder: admission labels it a
        # speed-lane build. A draft still awaiting his decision, and one he handed to code, stay put.
        accepted = design(100)
        waiting = design(101, labels=("tim-action-required",))
        handed = design(102, labels=("lane:code",))
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, [accepted, waiting, handed]), "JOV", FakeClient(), now=NOW)
            self.assertEqual(receipt["acceptedDesignBuilds"], ["JOV-100"])
            entries = json.loads(ls._outbox_path(Path(d)).read_text())["entries"]
            labels = sorted(e["body"] for e in entries if e["op"] == "label")
            self.assertEqual(labels, sorted(work_lane.ACCEPTED_DESIGN_LABELS))
            self.assertTrue(all(e["issueId"] == "id-100" for e in entries if e["op"] in ("label", "comment")))
            self.assertEqual(receipt["nonCodeTodo"]["speed"], 1)
        self.assertEqual(work_lane.lane_of(dict(accepted, labels=["lane:speed", "agent-ready"])), "speed")

    def test_full_non_code_lanes_never_trigger_displacement(self):
        todo = [design(100 + i, updated="2026-10-28T00:00:00.000Z") for i in range(40)]
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, [row(1, priority=1), *todo]), "JOV", FakeClient(), now=NOW)
            self.assertEqual(receipt["admitted"], ["JOV-1"])
            self.assertEqual(receipt["displaced"], [])

    def test_wip_sanity_never_demotes_non_code(self):
        todo = [design(100 + i) for i in range(60)] + [row(500 + i, "Todo", priority=4, updated=STALE) for i in range(40)]
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, todo), "JOV", FakeClient(), now=NOW)
            self.assertTrue(receipt["demoted"])
            self.assertTrue(all(int(i.split("-")[1]) >= 500 for i in receipt["demoted"]), receipt["demoted"])

    def test_non_code_admission_takes_no_code_slot(self):
        todo = [row(100 + i, "Todo", priority=3) for i in range(40)]
        urgent_design = design(2, state="Backlog", priority=1, title="Redraw launch hero", labels=("lane:design",))
        urgent_design["description"] = BODY
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, [urgent_design, *todo]), "JOV", FakeClient(), now=NOW)
            self.assertEqual(receipt["admitted"], ["JOV-2"])
            self.assertEqual(receipt["displaced"], [], "non-code admission never makes code give way")


class RefillCountsCodeOnly(unittest.TestCase):
    def test_full_design_lane_does_not_stop_code_refill(self):
        class Lane:
            linear_sync = ls

            @staticmethod
            def issue_hits_red_line(issue):
                return False

            Issue = staticmethod(lambda *a, **k: SimpleNamespace())

        rows = [design(100 + i) for i in range(20)] + [row(1, priority=3), design(2, state="Backlog")]
        with tempfile.TemporaryDirectory() as d:
            host = seed(d, rows)
            binding = SimpleNamespace(key="JOV", excluded=())
            receipt = binding_refill.refill(Lane, host, binding, FakeClient(), floor=2, now=NOW)
            self.assertEqual(receipt["todo"], 0)
            self.assertEqual(receipt["promoted"], ["JOV-1"], "code refill promotes code, never the design draft")


class LaneMeasure(unittest.TestCase):
    def test_each_lane_reports_queue_age_throughput_and_stuck(self):
        def r(n, lane_title, state="Todo", stype="unstarted", labels=(), updated="2026-10-20T00:00:00.000Z"):
            base = row(n, state, labels=labels, updated=updated)
            base.update(title=lane_title, stateType=stype)
            return base
        day0 = [r(1, "Pen draft for approval: a"), r(2, "Pen draft for approval: b", labels=("tim-action-required",)),
                r(3, "Fix checkout"), r(4, "Fix signup", state="In Progress", stype="started")]
        m0, snap = work_lane.measure(day0, NOW)
        self.assertEqual((m0["design"]["queued"], m0["design"]["blocked"], m0["code"]["started"]), (2, 1, 1))
        self.assertGreater(m0["design"]["oldestQueuedH"], 0)
        self.assertFalse(m0["design"]["stuck"], "no history yet is not stuck")
        # a day later: code moved (JOV-3 started, JOV-4 finished), design did not move at all
        day1 = [day0[0], day0[1], r(3, "Fix checkout", state="In Progress", stype="started")]
        m1, _ = work_lane.measure(day1, NOW + 25 * 3600, snap)
        self.assertEqual((m1["code"]["leftQueueSinceLast"], m1["code"]["finishedSinceLast"]), (1, 1))
        self.assertFalse(m1["code"]["stuck"])
        self.assertTrue(m1["design"]["stuck"], "waiting design work with no start and no exit for a day shows up")

    def test_admission_receipt_carries_lane_metrics(self):
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, [design(100), row(200, "Todo")]), "JOV", FakeClient(), now=NOW)
            self.assertEqual(set(receipt["lanes"]), set(work_lane.LANES))
            self.assertEqual(receipt["lanes"]["design"]["queued"], 1)


class SpeedWinsJumpTheQueue(unittest.TestCase):
    def test_speed_win_is_admitted_outside_the_code_target_and_displaces_nothing(self):
        todo = [row(100 + i, "Todo", priority=3) for i in range(40)]
        speed = row(2, "Backlog", priority=3, labels=("agent-ready", "speed-win"))
        speed["title"] = "Cache the turbo build in the merge queue"
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, seed(d, [row(1, priority=1), speed, *todo]), "JOV", FakeClient(), now=NOW)
            self.assertEqual(receipt["admitted"][0], "JOV-2", "the speed win is admitted first, ahead of Urgent")
            self.assertEqual(receipt["todo"], 40)
            self.assertEqual(len(receipt["displaced"]), 1, "only the Urgent code admission makes code give way")

    def test_lane_code_hands_a_speed_label_back_to_code(self):
        self.assertEqual(work_lane.lane_of({"title": "x", "labels": ["compounding", "lane:code"]}), "code")


class LaneFeed(unittest.TestCase):
    def test_doctor_view_and_stuck_alert(self):
        with tempfile.TemporaryDirectory() as d:
            pa.run(FakeLane, seed(d, [design(100), row(200, "Todo")]), "JOV", FakeClient(), now=NOW)
            view = work_lane.view(d)
            self.assertEqual(view["JOV"]["lanes"]["design"]["queued"], 1)
            self.assertEqual(work_lane.alerts(view), {})
            view["JOV"]["lanes"]["design"]["stuck"] = True
            self.assertIn("lane-stuck:JOV:design", work_lane.alerts(view))

    def test_reasoning_jobs_hold_their_own_lane(self):
        self.assertEqual(work_lane.lane_of({"title": "Reason about pricing", "labels": ["reasoning-job"]}), "reasoning")


if __name__ == "__main__":
    unittest.main()
