"""Linear down must not stop shipping: local mirror, claim ledger and outbox (2026-10-11)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import linear_sync as ls  # noqa: E402


class Limited(RuntimeError):
    pass


def node(n, state="Todo", updated="2026-10-11T10:00:00.000Z", labels=("codex",), more=False, kind=None, team="JOV"):
    kind = kind or {"Todo": "unstarted", "In Progress": "started", "Backlog": "backlog", "Triage": "triage",
                    "Done": "completed", "Canceled": "canceled"}[state]
    return {"id": f"id-{n}", "identifier": f"{team}-{n}", "title": f"task {n}", "description": None, "priority": 2,
            "createdAt": "2026-10-01T00:00:00.000Z", "updatedAt": updated, "state": {"name": state, "type": kind},
            "parent": None, "labels": {"pageInfo": {"hasNextPage": more}, "nodes": [{"name": l} for l in labels]}}


def page(nodes, more=False, cursor="c"):
    return {"issues": {"pageInfo": {"hasNextPage": more, "endCursor": cursor}, "nodes": nodes}}


class FakeLinear:
    def __init__(self, responses=()):
        self.responses, self.calls = list(responses), []

    def gql(self, query, variables):
        self.calls.append((query, dict(variables)))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response(query, variables) if callable(response) else response


class Base(unittest.TestCase):
    def setUp(self):
        self.state = Path(tempfile.mkdtemp())

    def sync(self, linear, admit=lambda n: True, team="JOV"):
        return ls.sync(self.state, team, linear, admit, (Limited,))


class MirrorSyncTest(Base):
    def test_first_fill_then_incremental_with_explicit_small_pages(self):
        linear = FakeLinear([page([node(1)], more=True, cursor="p1"), page([node(2, "In Progress")])])
        with mock.patch.object(ls.time, "time", return_value=1_800_000_000.0):
            self.assertEqual(self.sync(linear)["outcome"], "filled")
        self.assertTrue(all(query == ls.FILL_QUERY for query, _ in linear.calls))
        self.assertEqual([v["after"] for _, v in linear.calls], [None, "p1"])
        mirror = ls.read_mirror(self.state, "JOV")
        # The fill's cursor re-reads the window before it began; it is a lower bound, never later.
        self.assertEqual(mirror["cursor"], ls._iso(1_800_000_000 - ls.FILL_OVERLAP_S))
        self.assertEqual(sorted(mirror["issues"]), ["id-1", "id-2"])
        linear = FakeLinear([page([node(1, "Backlog", "2026-10-11T11:00:00.000Z"),
                                   node(3, updated="2026-10-11T12:00:00.000Z")])])
        self.assertEqual(self.sync(linear)["outcome"], "synced")
        [(query, variables)] = linear.calls
        self.assertEqual((query, variables["since"]), (ls.SYNC_QUERY, mirror["cursor"]))
        self.assertEqual(ls.read_mirror(self.state, "JOV")["cursor"], "2026-10-11T12:00:00.000Z")
        self.assertEqual([row["identifier"] for row in ls.todo(self.state, "JOV")], ["JOV-3"])
        for query in (ls.FILL_QUERY, ls.SYNC_QUERY):
            self.assertIn("issues(first:50", query)
            self.assertIn("labels(first:25)", query)

    def test_a_long_gap_resumes_across_ticks_and_never_skips(self):
        ls.apply(self.state, "JOV", [node(1)])
        with ls._mutating(ls.mirror_path(self.state, "JOV"), ls.MIRROR) as data:
            data.update(cursor="2026-10-11T00:00:00.000Z", syncedAt=1.0)
        pages = [page([node(10 + i, updated=f"2026-10-11T0{i}:00:00.000Z")], more=True, cursor=f"p{i}")
                 for i in range(ls.SYNC_PAGES)]
        self.assertEqual(self.sync(FakeLinear(pages))["outcome"], "partial")
        mirror = ls.read_mirror(self.state, "JOV")
        self.assertEqual(mirror["cursor"], "2026-10-11T00:00:00.000Z")  # unchanged until complete
        linear = FakeLinear([page([node(99, updated="2026-10-11T09:00:00.000Z")])])
        self.assertEqual(self.sync(linear)["outcome"], "synced")
        self.assertEqual(linear.calls[0][1]["after"], f"p{ls.SYNC_PAGES - 1}")
        self.assertEqual(linear.calls[0][1]["since"], "2026-10-11T00:00:00.000Z")
        self.assertEqual(ls.read_mirror(self.state, "JOV")["cursor"], "2026-10-11T09:00:00.000Z")

    def test_budget_and_rate_limits_skip_the_read_and_keep_the_mirror(self):
        ls.apply(self.state, "JOV", [node(1)])
        linear = FakeLinear([])
        self.assertEqual(self.sync(linear, admit=lambda n: False)["outcome"], "budget-held")
        self.assertEqual(linear.calls, [])
        self.assertEqual(self.sync(FakeLinear([Limited()]))["outcome"], "rate-limited")
        self.assertEqual([row["identifier"] for row in ls.todo(self.state, "JOV")], ["JOV-1"])

    def test_newer_rows_win_closed_issues_leave_and_truncated_labels_never_dispatch(self):
        ls.apply(self.state, "JOV", [node(1, updated="2026-10-11T10:00:00.000Z"), node(2, more=True)])
        ls.apply(self.state, "JOV", [node(1, "Backlog", updated="2026-10-11T09:00:00.000Z")])
        self.assertEqual([row["identifier"] for row in ls.todo(self.state, "JOV")], ["JOV-1"])
        ls.apply(self.state, "JOV", [node(1, "Done", updated="2026-10-11T11:00:00.000Z"), node(5, team="LYB")])
        self.assertEqual(ls.read_mirror(self.state, "JOV")["issues"].keys(), {"id-2"})
        self.assertEqual(ls.read_mirror(self.state, "LYB"), {"schema": ls.MIRROR})

    def test_stale_mirror_is_reported_but_still_dispatches(self):
        ls.apply(self.state, "JOV", [node(1)])
        with ls._mutating(ls.mirror_path(self.state, "JOV"), ls.MIRROR) as data:
            data.update(cursor="x", syncedAt=time.time() - 7 * 3600)
        view = ls.status(self.state)
        self.assertGreater(view["mirror"]["JOV"]["ageS"], ls.STALE_ALERT_S)
        self.assertIn("linear-mirror-stale:JOV", ls.alerts(view))
        self.assertEqual(len(ls.todo(self.state, "JOV")), 1)


class ClaimLedgerTest(Base):
    def test_the_local_claim_is_exclusive_and_hides_the_issue_from_todo(self):
        ls.apply(self.state, "JOV", [node(1), node(2)])
        self.assertTrue(ls.claim(self.state, "id-1", "JOV-1", "codex"))
        self.assertFalse(ls.claim(self.state, "id-1", "JOV-1", "devin"))
        self.assertEqual([row["identifier"] for row in ls.todo(self.state, "JOV")], ["JOV-2"])
        self.assertEqual([row["identifier"] for row in ls.active(self.state, "JOV")], ["JOV-1"])
        linear = ls.Outboxed(self.state, FakeLinear())
        linear.move("id-1", "In Progress")
        self.assertEqual(ls.claim_status(self.state, "id-1"), "active")
        linear.move("id-1", "Todo")  # a lane disposition back to Todo releases the claim
        self.assertEqual(ls.claim_status(self.state, "id-1"), "released")
        self.assertEqual(sorted(row["identifier"] for row in ls.todo(self.state, "JOV")), ["JOV-1", "JOV-2"])

    def test_remote_changes_supersede_or_close_a_claim_without_touching_work(self):
        ls.apply(self.state, "JOV", [node(1), node(2)])
        for issue in ("id-1", "id-2"):
            ls.claim(self.state, issue, issue.replace("id", "JOV"), "codex")
        ls.apply(self.state, "JOV", [node(1, "Backlog", "2026-10-11T12:00:00.000Z"),
                                     node(2, "Canceled", "2026-10-11T12:00:00.000Z")])
        self.assertEqual(ls.claim_status(self.state, "id-1"), "superseded")
        self.assertEqual(ls.claim_status(self.state, "id-2"), "closed")
        outboxed = ls.Outboxed(self.state, FakeLinear())
        outboxed.move("id-1", "Todo")  # superseded: the remote decision stands
        self.assertEqual(ls.status(self.state)["outbox"]["depth"], 0)
        outboxed.comment("id-1", "PR opened")  # informational comments still go
        self.assertEqual(ls.status(self.state)["outbox"]["depth"], 1)

    def test_a_pending_projection_is_not_mistaken_for_a_remote_requeue(self):
        ls.apply(self.state, "JOV", [node(1)])
        ls.claim(self.state, "id-1", "JOV-1", "codex")
        ls.enqueue(self.state, "move", "id-1", target="In Progress")
        ls.apply(self.state, "JOV", [node(1, updated="2026-10-11T12:00:00.000Z")])  # e.g. a label edit
        self.assertEqual(ls.claim_status(self.state, "id-1"), "active")


class OutboxTest(Base):
    def issue_reply(self, state="Todo", **extra):
        def reply(query, variables):
            row = node(1, state, "2026-10-11T12:00:00.000Z")
            row["team"] = {"states": {"nodes": [{"id": "s-todo", "name": "Todo"},
                                                {"id": "s-ip", "name": "In Progress"}]}}
            return {"issue": {**row, **extra}}
        return reply

    def moved(self, query, variables):
        return {"issueUpdate": {"success": True, "issue": node(1, "In Progress", "2026-10-11T12:01:00.000Z")}}

    def test_entries_are_idempotent_and_a_newer_move_replaces_a_pending_one(self):
        ls.enqueue(self.state, "move", "id-1", target="In Progress")
        ls.enqueue(self.state, "comment", "id-1", body="claimed")
        ls.enqueue(self.state, "comment", "id-1", body="claimed")
        ls.enqueue(self.state, "move", "id-1", target="Todo")
        entries = ls._read(ls._outbox_path(self.state), ls.OUTBOX)["entries"]
        self.assertEqual([(e["op"], e.get("target")) for e in entries], [("comment", None), ("move", "Todo")])

    def test_flush_delivers_oldest_first_with_readback_and_feeds_the_mirror(self):
        ls.apply(self.state, "JOV", [node(1)])
        ls.claim(self.state, "id-1", "JOV-1", "codex")
        ls.enqueue(self.state, "move", "id-1", target="In Progress")
        ls.enqueue(self.state, "comment", "id-1", body="claimed")
        linear = FakeLinear([self.issue_reply(), self.moved, {"commentCreate": {"success": True}}])
        report = ls.flush(self.state, linear, lambda n: True, (Limited,))
        self.assertEqual([row["result"] for row in report["delivered"]], ["moved", "commented"])
        self.assertEqual(linear.calls[1][1], {"id": "id-1", "s": "s-ip"})
        self.assertEqual(ls.read_mirror(self.state, "JOV")["issues"]["id-1"]["state"], "In Progress")
        self.assertEqual(ls.status(self.state)["outbox"]["depth"], 0)
        self.assertEqual(ls.claim_status(self.state, "id-1"), "active")

    def test_budget_rate_limit_and_errors_keep_the_entry_without_failing_work(self):
        ls.enqueue(self.state, "move", "id-1", target="In Progress")
        self.assertEqual(ls.flush(self.state, FakeLinear([]), lambda n: False, (Limited,))["outcome"], "budget-held")
        self.assertEqual(ls.flush(self.state, FakeLinear([Limited()]), lambda n: True, (Limited,))["outcome"], "rate-limited")
        [entry] = ls._read(ls._outbox_path(self.state), ls.OUTBOX)["entries"]
        self.assertEqual(entry["attempts"], 0)
        for _ in range(ls.DEAD_AFTER):
            ls.flush(self.state, FakeLinear([RuntimeError("boom")]), lambda n: True, (Limited,))
        view = ls.status(self.state)
        self.assertEqual((view["outbox"]["depth"], view["outbox"]["dead"]), (0, 1))
        self.assertIn("linear-outbox-dead", ls.alerts(view))

    def test_a_remotely_closed_or_parked_issue_supersedes_the_claim_instead_of_reopening(self):
        for state, expected in (("Canceled", "remote-closed"), ("Backlog", "remote-moved")):
            with self.subTest(state=state):
                self.state = Path(tempfile.mkdtemp())
                ls.apply(self.state, "JOV", [node(1)])
                ls.claim(self.state, "id-1", "JOV-1", "codex")
                ls.enqueue(self.state, "move", "id-1", target="In Progress")
                linear = FakeLinear([self.issue_reply(state)])
                [row] = ls.flush(self.state, linear, lambda n: True, (Limited,))["delivered"]
                self.assertEqual(row["result"], expected)
                self.assertEqual(len(linear.calls), 1)  # no mutation
                self.assertEqual(ls.claim_status(self.state, "id-1"), "superseded" if state == "Backlog" else "closed")

    def test_an_unconfirmed_comment_is_read_back_before_any_resend(self):
        ls.enqueue(self.state, "comment", "id-1", body="claimed")
        linear = FakeLinear([Limited()])
        ls.flush(self.state, linear, lambda n: True, (Limited,))  # sent, outcome unknown
        [entry] = ls._read(ls._outbox_path(self.state), ls.OUTBOX)["entries"]
        self.assertIn("sentAt", entry)
        linear = FakeLinear([{"issue": {"comments": {"nodes": [{"body": "claimed"}]}}}])
        [row] = ls.flush(self.state, linear, lambda n: True, (Limited,))["delivered"]
        self.assertEqual(row["result"], "readback")
        self.assertEqual([query for query, _ in linear.calls], [ls.COMMENTS_QUERY])

    def test_tick_isolates_faults_per_team(self):
        linear = FakeLinear([RuntimeError("x"), page([])])
        report = ls.tick(self.state, linear, lambda n: True, (Limited,), teams=("JOV", "LYB"))
        self.assertEqual(report["JOV"]["outcome"], "error:RuntimeError")
        self.assertEqual(report["LYB"]["outcome"], "filled")
