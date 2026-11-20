"""lane-fix-escalating is consumed: orphans return to repair, stale escalations move up the ladder."""
import json
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import escalation_reconcile as er  # noqa: E402

NOW = 1_800_000_000.0
PROVIDERS = {"codex": {"enabled": True, "slots": 3}, "grok": {"enabled": True, "slots": 1},
             "claude": {"enabled": True, "slots": 0}, "hyperagent": {"enabled": True, "repairs": False}}
slots = lambda lane, default: PROVIDERS[lane].get("slots", default)  # noqa: E731


def pr(n, head="h1", title="feat: x", updated="2026-10-26T00:00:00Z"):
    return {"number": n, "headRefOid": head, "title": title, "updatedAt": updated, "files": []}


class DispositionTest(unittest.TestCase):
    def test_label_with_no_escalation_state_for_this_head_is_an_orphan(self):
        self.assertEqual(er.disposition(pr(1), {"count": 1}, PROVIDERS, NOW, slots), "orphan")
        old_head = {"escalations": [{"head": "h0", "at": NOW - 10, "kind": "model", "lane": "grok"}]}
        self.assertEqual(er.disposition(pr(1), old_head, PROVIDERS, NOW, slots), "orphan")

    def test_pending_escalation_is_stale_after_six_hours_or_on_a_lane_that_cannot_run_it(self):
        fresh = {"pendingEscalation": {"lane": "grok", "at": NOW - 600, "head": "h1"}}
        old = {"pendingEscalation": {"lane": "grok", "at": NOW - er.STALE_S - 1, "head": "h1"}}
        no_seats = {"pendingEscalation": {"lane": "claude", "at": NOW - 60, "head": "h1"}}
        no_repairs = {"pendingEscalation": {"lane": "hyperagent", "at": NOW - 60, "head": "h1"}}
        self.assertEqual(er.disposition(pr(1), fresh, PROVIDERS, NOW, slots), "live")
        for record in (old, no_seats, no_repairs):
            self.assertEqual(er.disposition(pr(1), record, PROVIDERS, NOW, slots), "stale")

    def test_idle_after_a_rung_and_surfaced_is_left_alone(self):
        idle = {"escalations": [{"head": "h1", "at": NOW - er.STALE_S - 5, "kind": "model", "lane": "grok"}]}
        recent = {"escalations": [{"head": "h1", "at": NOW - 60, "kind": "model", "lane": "grok"}]}
        self.assertEqual(er.disposition(pr(1), idle, PROVIDERS, NOW, slots), "idle")
        self.assertEqual(er.disposition(pr(1), recent, PROVIDERS, NOW, slots), "live")
        self.assertEqual(er.disposition(pr(1), {"escalated": True}, PROVIDERS, NOW, slots), "surfaced")

    def test_expired_pending_becomes_a_failed_rung_for_that_lane(self):
        record = {"count": 2, "pendingEscalation": {"lane": "grok", "cls": "needs-rebase", "at": 1, "head": "h1"}}
        out = er.expire_pending(record, NOW)
        self.assertNotIn("pendingEscalation", out)
        self.assertEqual(out["escalations"][-1], {"rung": "stale-escalation", "lane": "grok", "cls": "needs-rebase",
                                                   "at": NOW, "head": "h1", "kind": "model", "topRung": False,
                                                   "ok": False})
        self.assertEqual(out["count"], 2)

    def test_product_work_is_reconciled_first(self):
        rows = [pr(1, title="chore(ci): x"), pr(2, title="feat(home): chat-first Home"), pr(3, title="fix(lanes): y"),
                pr(4, title="feat(api): z")]
        self.assertEqual([r["number"] for r in sorted(rows, key=er.product_rank)], [2, 4, 1, 3])


class ReconcileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.attempts = {
            "1": {"count": 1},
            "2": {"pendingEscalation": {"lane": "grok", "cls": "fixable-by-model", "at": NOW - er.STALE_S - 1, "head": "h1"}},
            "3": {"pendingEscalation": {"lane": "grok", "at": NOW - 60, "head": "h1"}},
            "4": {"escalated": True},
        }
        (self.state / "fix-attempts.json").write_text(json.dumps(self.attempts))

    def tearDown(self):
        self.tmp.cleanup()

    def test_orphans_lose_the_label_stale_pending_expires_and_live_work_is_untouched(self):
        removed = []

        def update(change):
            data = json.loads((self.state / "fix-attempts.json").read_text())
            change(data)
            (self.state / "fix-attempts.json").write_text(json.dumps(data))
        receipt = er.reconcile(self.state, [pr(1), pr(2), pr(3), pr(4)], PROVIDERS, update_attempts=update,
                               remove_label=lambda n: removed.append(n) or True, now=NOW, slots=slots)
        self.assertEqual(removed, [1])
        self.assertEqual((receipt["orphan"], receipt["stale"], receipt["live"], receipt["surfaced"]), ([1], [2], 1, 1))
        data = json.loads((self.state / "fix-attempts.json").read_text())
        self.assertNotIn("pendingEscalation", data["2"])
        self.assertEqual(data["2"]["escalations"][-1]["rung"], "stale-escalation")
        self.assertIn("pendingEscalation", data["3"])
        rows = [json.loads(l) for l in (self.state / "runs/escalation-reconcile.jsonl").read_text().splitlines()]
        self.assertEqual(sorted(r["disposition"] for r in rows), ["orphan", "stale"])

    def test_owned_held_or_recently_touched_prs_are_skipped(self):
        removed = []
        fresh = pr(1, updated="2027-01-15T07:59:00Z")  # touched a minute before NOW
        held = {**pr(1), "labels": [{"name": "hold"}]}
        with unittest.mock.patch.dict("os.environ", {"LANES_ESCALATION_SKIP": "1, 99"}):
            receipt = er.reconcile(self.state, [pr(1)], PROVIDERS, update_attempts=lambda c: None,
                                   remove_label=lambda n: removed.append(n) or True, now=NOW, slots=slots)
        self.assertEqual((removed, receipt["skipped"]), ([], [1]))
        for row in (fresh, held):
            receipt = er.reconcile(self.state, [row], PROVIDERS, update_attempts=lambda c: None,
                                   remove_label=lambda n: removed.append(n) or True, now=NOW, slots=slots)
            self.assertEqual((removed, receipt["skipped"]), ([], [1]))

    def test_failed_label_removal_is_retried_not_journaled(self):
        receipt = er.reconcile(self.state, [pr(1)], PROVIDERS, update_attempts=lambda c: None,
                               remove_label=lambda n: False, now=NOW, slots=slots)
        self.assertEqual(receipt["orphan"], [])
        self.assertEqual(receipt["errors"], ["1:label"])

    def test_cadence(self):
        self.assertTrue(er.due(self.state, NOW))
        er.stamp(self.state, {"at": NOW})
        self.assertFalse(er.due(self.state, NOW + 60))
        self.assertTrue(er.due(self.state, NOW + er.RECONCILE_S))


if __name__ == "__main__":
    unittest.main()
