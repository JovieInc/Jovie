"""Backlog -> Todo refill for extra bindings (Tim 2026-10-24): hermetic, no gh, no network."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import binding_refill as br  # noqa: E402
import linear_sync as ls  # noqa: E402

BODY = ("## Problem\n" + "The sitemap omits public routes and stamps every URL as changed on each request. " * 3 +
        "\n\n## Acceptance criteria\n- [ ] sitemap == public route list\n")


def row(n, state="Backlog", labels=("agent-ready",), priority=3, description=BODY, created="2026-10-01T00:00:00.000Z"):
    return {"id": f"id-{n}", "identifier": f"LYB-{n}", "title": f"task {n}", "description": description,
            "priority": priority, "createdAt": created, "updatedAt": "2026-10-20T00:00:00.000Z", "state": state,
            "stateType": "unstarted" if state == "Todo" else "backlog", "parentId": None, "labels": list(labels),
            "labelsComplete": True}


class FakeClient:
    pass


class SelectTests(unittest.TestCase):
    def test_orders_by_priority_then_age_and_respects_need(self):
        rows = [row(1, priority=3), row(2, priority=1), row(3, priority=2, created="2026-09-01T00:00:00.000Z"),
                row(4, priority=0), row(5, priority=2)]
        picked, _ = br.select(rows, 3)
        self.assertEqual([r["identifier"] for r in picked], ["LYB-2", "LYB-3", "LYB-5"])

    def test_skips_unmarked_thin_epic_decision_and_blocked(self):
        rows = [row(1, labels=()), row(2, description="short"), row(3, labels=("agent-ready", "type:epic")),
                row(4, labels=("agent-ready", "needs-tim")), row(5, labels=("agent-ready", "hold")),
                row(6, description="x" * 250), row(7, description=BODY + "\nBlocked by LYB-1 until it ships.\n"),
                row(8, description=BODY + "\n**Sequencing:** after LYB-138.\n"), row(9)]
        rows.append(row(138, state="In Progress"))
        picked, skipped = br.select(rows, 10, excluded=("hold",))
        self.assertEqual([r["identifier"] for r in picked], ["LYB-1", "LYB-9"])  # agent-ready is retired as a requirement
        self.assertNotIn("LYB-1", skipped)
        self.assertEqual(skipped["LYB-2"], "thin-description")
        self.assertEqual(skipped["LYB-3"], "label:type:epic")
        self.assertEqual(skipped["LYB-4"], "label:needs-tim")
        self.assertEqual(skipped["LYB-5"], "label:hold")
        self.assertEqual(skipped["LYB-6"], "no-acceptance-criteria")
        self.assertEqual(skipped["LYB-7"], "blocked-by:LYB-1")
        self.assertEqual(skipped["LYB-8"], "blocked-by:LYB-138")

    def test_done_heading_counts_as_acceptance(self):
        body = BODY.replace("## Acceptance criteria", "## Done")
        picked, skipped = br.select([row(1, description=body)], 1)
        self.assertEqual(len(picked), 1, skipped)

    def test_closed_blocker_does_not_block(self):
        picked, _ = br.select([row(7, description=BODY + "\nBlocked by LYB-99.\n")], 1)  # LYB-99 not open
        self.assertEqual(len(picked), 1)

    def test_red_line_and_incomplete_labels(self):
        incomplete = row(1)
        incomplete["labelsComplete"] = False
        picked, skipped = br.select([incomplete, row(2)], 5, red_line=lambda r: r["identifier"] == "LYB-2")
        self.assertEqual(picked, [])
        self.assertEqual(skipped, {"LYB-1": "labels-incomplete", "LYB-2": "sensitive-text"})


class RefillTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.state = Path(self.dir.name)
        self.addCleanup(self.dir.cleanup)
        (self.state / "autoscale.json").write_text(json.dumps({"lanes": {
            "codex": {"intakeEffective": 1}, "grok": {"intakeEffective": 1}, "hyperagent": {"intakeEffective": 0}}}))
        self.lane = SimpleNamespace(linear_sync=ls, Issue=lambda *a: SimpleNamespace(title=a[2], description=a[3]),
                                    issue_hits_red_line=lambda issue: False)
        self.host = SimpleNamespace(state=self.state)
        self.binding = SimpleNamespace(key="LYB", excluded=("hold",))

    def mirror(self, rows, synced=1000.0):
        path = ls.mirror_path(self.state, "LYB")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": synced, "issues": {r["id"]: r for r in rows}}))

    def outbox(self):
        return json.loads((self.state / "linear" / "outbox.json").read_text())["entries"]

    def test_seats_are_measured_and_target_is_two_per_seat_or_floor(self):
        self.assertEqual(br.seats(self.state), 2)
        self.assertEqual(br.target(self.state), 4)
        self.assertEqual(br.target(self.state, floor=10), 10)
        (self.state / "autoscale.json").unlink()
        self.assertEqual(br.seats(self.state), 1)

    def test_deficit_promotes_and_comments_through_the_outbox(self):
        self.mirror([row(n, priority=2) for n in range(1, 8)])
        receipt = br.refill(self.lane, self.host, self.binding, FakeClient(), floor=0, now=1010.0)
        self.assertEqual(receipt["promoted"], ["LYB-1", "LYB-2", "LYB-3", "LYB-4"])
        moves = [e for e in self.outbox() if e["op"] == "move"]
        self.assertEqual({e["target"] for e in moves}, {"Todo"})
        self.assertEqual(len(moves), 4)
        self.assertEqual(receipt["deficitSince"], 1010.0)

    def test_lyb_ios_rows_wait_while_the_macos_pool_is_loaded_and_other_rows_still_promote(self):
        rows = [row(n, labels=("agent-ready", "area:iOS")) for n in range(1, 4)] + [row(n) for n in range(4, 9)]
        self.mirror(rows)
        (self.state / "macos-pool.json").write_text(json.dumps(
            {"at": 1005.0, "repos": {"JovieInc/LogYourBody": {"running": 3, "queued": 4}}, "poolCap": 5}))
        receipt = br.refill(self.lane, self.host, self.binding, FakeClient(), now=1010.0)
        self.assertFalse(set(receipt["promoted"]) & {"LYB-1", "LYB-2", "LYB-3"})
        self.assertTrue(receipt["promoted"])
        self.assertEqual(receipt["skipped"]["LYB-1"], "macos-admission-hold")
        self.assertTrue(receipt["macosAdmission"]["hold"])

    def test_lyb_ios_rows_promote_when_the_pool_has_room_or_no_fresh_sample(self):
        self.mirror([row(n, labels=("agent-ready", "area:iOS")) for n in range(1, 8)])
        receipt = br.refill(self.lane, self.host, self.binding, FakeClient(), now=1010.0)
        self.assertEqual(len(receipt["promoted"]), 4)
        self.assertEqual(receipt["macosAdmission"]["reason"], "no-sample")

    def test_pending_promotions_count_so_a_second_tick_does_not_double_promote(self):
        self.mirror([row(n) for n in range(1, 8)])
        br.refill(self.lane, self.host, self.binding, FakeClient(), now=1010.0)
        again = br.refill(self.lane, self.host, self.binding, FakeClient(), now=1020.0)
        self.assertEqual(again["promoted"], [])
        self.assertEqual(again["todo"], 4)

    def test_no_action_at_target_and_latency_recorded_when_closed(self):
        self.mirror([row(n) for n in range(1, 8)])
        br.refill(self.lane, self.host, self.binding, FakeClient(), now=1010.0)
        self.mirror([row(n, state="Todo") for n in range(1, 5)] + [row(n) for n in range(5, 8)], synced=1030.0)
        receipt = br.refill(self.lane, self.host, self.binding, FakeClient(), now=1040.0)
        self.assertEqual(receipt["promoted"], [])
        self.assertEqual(receipt["lastRefillLatencyS"], 30.0)
        self.assertIsNone(receipt["deficitSince"])

    def test_stale_mirror_is_never_acted_on(self):
        self.mirror([row(n) for n in range(1, 8)], synced=0.0)
        receipt = br.refill(self.lane, self.host, self.binding, FakeClient(), now=5000.0)
        self.assertEqual(receipt["held"], "mirror-stale")
        self.assertEqual(receipt["promoted"], [])
        self.assertFalse((self.state / "linear" / "outbox.json").exists())

    def test_nothing_ready_reports_why(self):
        self.mirror([row(1, labels=("hold",)), row(2, description="short")])
        receipt = br.refill(self.lane, self.host, self.binding, FakeClient(), now=1010.0)
        self.assertEqual(receipt["promoted"], [])
        self.assertEqual(receipt["short"], 4)
        self.assertEqual(receipt["skipped"], {"LYB-1": "label:hold", "LYB-2": "thin-description"})


if __name__ == "__main__":
    unittest.main()
