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
        ls.claim(self.state, "id-1", "JOV-1", "codex")
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
        ls.claim(self.state, "id-1", "JOV-1", "codex")
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


import ownership  # noqa: E402  (sibling of linear_sync)
from types import SimpleNamespace  # noqa: E402


class StartedOwnershipTest(Base):
    """Gem 2026-10-20: 536 started JOV issues, 144 active claims (median 5.6 days), 4 workers.
    Every started issue needs a live owner; ownerless ones move through the outbox."""
    NOW = 1_800_000_000.0

    def git(self, subjects=()):
        log = "".join(f"{subject}\n\n\x1e" for subject in subjects)
        return lambda *a, **k: SimpleNamespace(returncode=0, stdout=log, stderr="")

    def started(self, n, state="In Progress", days_idle=5, labels=("codex",)):
        updated = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(self.NOW - days_idle * 86400))
        ls.apply(self.state, "JOV", [node(n, state, updated, labels=labels, kind="started")])

    def reconcile(self, open_prs=frozenset(), git=None, at=0.0, **kw):
        return ownership.reconcile(self.state, self.state, open_prs, run=git or self.git(), now=self.NOW + at, **kw)

    def moves(self):
        return {e["issueId"]: e["target"] for e in ls._read(ls._outbox_path(self.state), ls.OUTBOX).get("entries", [])
                if e["op"] == "move"}

    def claim_at(self, n, claimed_at):
        with mock.patch.object(ls.time, "time", return_value=claimed_at):
            self.assertTrue(ls.claim(self.state, f"id-{n}", f"JOV-{n}", "codex"))

    def test_owner_process_dies_then_the_issue_returns_to_the_pool(self):
        self.started(1)
        self.claim_at(1, self.NOW - 3600)
        lease = ownership.acquire_run_lease(self.state, "id-1", "JOV-1", "codex")
        self.assertIsNone(ownership.acquire_run_lease(self.state, "id-1", "JOV-1", "codex"))  # exclusive
        report = self.reconcile()
        self.assertEqual((report["owners"], report["ownerless"]), ({"run": 1}, 0))
        lease.close()  # the worker died: the kernel released its lease
        self.assertEqual(ownership.run_lease(self.state, "id-1"), "ended")
        self.assertEqual(self.reconcile(at=1)["ownerless"], 1)
        self.assertEqual(self.moves(), {}, "an owner may vanish for one grace period")
        report = self.reconcile(at=ownership.GRACE_S + 1)
        self.assertEqual(self.moves(), {"id-1": "Todo"})
        self.assertEqual(ls.claim_status(self.state, "id-1"), "released")
        self.assertIn("id-1", [row["id"] for row in ls.todo(self.state, "JOV")])  # dispatchable again
        self.assertEqual(report["moved"][0]["reason"], "no-live-owner")

    def test_merged_pr_hands_the_issue_to_the_merge_lifecycle(self):
        # Done is the lifecycle's (receipts); lanes moves to Merging, its entry state.
        self.started(2)
        self.reconcile(git=self.git(["fix(web): thing (JOV-2) (#123)"]))
        self.reconcile(git=self.git(["fix(web): thing (JOV-2) (#123)"]), at=ownership.GRACE_S + 1)
        self.assertEqual(self.moves(), {"id-2": "Merging"})
        ls.apply(self.state, "JOV", [node(2, "Merging", "2026-12-01T00:00:00.000Z", kind="started")])
        report = self.reconcile(git=self.git(["fix(web): thing (JOV-2) (#123)"]), at=ownership.GRACE_S + 2)
        self.assertEqual(report["owners"], {"lifecycle": 1})

    def test_closed_pr_returns_the_issue(self):
        self.started(3, "In Review")
        self.assertEqual(self.reconcile(open_prs=frozenset({"JOV-3"}))["owners"], {"pr": 1})
        self.reconcile(open_prs=frozenset())
        self.reconcile(open_prs=frozenset(), at=ownership.GRACE_S + 1)
        self.assertEqual(self.moves(), {"id-3": "Todo"})

    def test_active_claim_without_a_live_lease_is_released(self):
        ls.apply(self.state, "JOV", [node(4, "Todo")])
        self.claim_at(4, self.NOW - ownership.LEGACY_RUN_GRACE_S - 1)  # a legacy claim, no lease file
        self.claim_at(5, self.NOW - 60)                                # inside the claim grace
        report = self.reconcile()
        self.assertEqual(report["claimsReleased"], ["JOV-4"])
        self.assertEqual(ls.claim_status(self.state, "id-4"), "released")
        self.assertEqual(ls.claim_status(self.state, "id-5"), "active")
        lease = ownership.acquire_run_lease(self.state, "id-5", "JOV-5", "codex")
        lease.close()  # a run that ended: released without waiting for the legacy grace
        self.assertEqual(self.reconcile(at=ownership.CLAIM_GRACE_S)["claimsReleased"], ["JOV-5"])

    def test_a_started_state_without_an_owner_is_rejected(self):
        with self.assertRaises(ls.StartedWithoutOwner):
            ls.enqueue(self.state, "move", "id-6", target="In Progress")
        with self.assertRaises(ls.StartedWithoutOwner):
            ls.Outboxed(self.state, None).move("id-6", "Rework")
        ls.enqueue(self.state, "move", "id-6", target="Todo")  # non-started needs no owner
        ls.enqueue(self.state, "move", "id-6", target="Merging", owner="lifecycle:merged-on-main")
        self.assertTrue(ls.claim(self.state, "id-7", "JOV-7", "codex"))
        ls.enqueue(self.state, "move", "id-7", target="In Progress")  # the claim is its owner
        import lane_runner
        client = lane_runner.Linear.__new__(lane_runner.Linear)
        client.gql = mock.Mock(side_effect=AssertionError("no write"))
        with self.assertRaises(ls.StartedWithoutOwner):
            client.move("id-8", "In Progress")

    def test_rework_is_repair_demand_and_post_merge_states_are_never_guessed(self):
        self.started(9, "Rework")
        self.started(10, "Validating")
        self.started(11, "Validating")
        self.started(12, "In Progress", days_idle=0.5)                 # a session touched it today
        self.started(13, "In Progress", labels=("hold",))
        git = self.git(["feat: x (JOV-11)", "docs: mentions JOV-9 in passing (#5)"])
        self.reconcile(git=git)
        report = self.reconcile(git=git, at=ownership.GRACE_S + 1)
        self.assertEqual(self.moves(), {"id-9": "Todo"})
        self.assertEqual(report["unresolved"], {"post-merge-without-merged-evidence": 1})
        self.assertEqual(report["owners"], {"lifecycle": 1, "recent-activity": 1, "hold": 1})

    def test_unknown_evidence_never_moves_and_writes_are_budgeted(self):
        for n in (20, 21, 22):
            self.started(n)
        unreadable = lambda *a, **k: SimpleNamespace(returncode=128, stdout="", stderr="fatal")
        ownership.reconcile(self.state, self.state, None, run=self.git(), now=self.NOW)
        report = ownership.reconcile(self.state, self.state, None, run=self.git(), now=self.NOW + 9999)
        self.assertEqual((report["owners"], self.moves()), ({"unknown-pr-inventory": 3}, {}))
        self.reconcile(git=unreadable)
        report = self.reconcile(git=unreadable, at=ownership.GRACE_S + 1)
        self.assertEqual((report["unresolved"], self.moves()), ({"merged-evidence-unreadable": 3}, {}))
        report = self.reconcile(at=ownership.GRACE_S + 2, max_moves=2)
        self.assertEqual((len(self.moves()), report["unresolved"]), (2, {"move-budget": 1}))
        again = self.reconcile(at=ownership.GRACE_S + 3, max_moves=2)  # idempotent: pending moves count
        self.assertEqual((len(self.moves()), again["started"], len(again["moved"])), (3, 1, 1))


class MergedEvidenceTest(Base):
    """Gem 2026-10-20: 40 Merging/Validating issues looked ownerless because their merged PRs
    live in summer-config, Ops or LogYourBody, not Jovie main."""
    NOW = StartedOwnershipTest.NOW
    git, started, reconcile = StartedOwnershipTest.git, StartedOwnershipTest.started, StartedOwnershipTest.reconcile

    def search(self, table, calls):
        def run(ident):
            calls.append(ident)
            return table.get(ident, [])
        return run

    def comments(self):
        return [e["body"] for e in ls._read(ls._outbox_path(self.state), ls.OUTBOX).get("entries", [])
                if e["op"] == "comment"]

    def test_an_org_merged_pr_that_claims_the_issue_makes_the_lifecycle_its_owner(self):
        self.started(8304, "Validating")
        self.started(8305, "Merging")
        calls, table = [], {
            "JOV-8304": [{"repository": "JovieInc/summer-config", "number": 209, "title": "fix(summer): x",
                          "body": "Refs JOV-8304.\n"}],
            "JOV-8305": [{"repository": "JovieInc/Jovie", "number": 1, "title": "docs: mentions JOV-8305 in passing",
                          "body": "see JOV-8305"}]}
        report = self.reconcile(search=self.search(table, calls))
        self.assertEqual(report["owners"], {"lifecycle": 2})  # title token counts
        self.assertEqual(sorted(calls), ["JOV-8304", "JOV-8305"])
        self.assertEqual(len(self.comments()), 2)
        again = self.reconcile(search=self.search(table, calls), at=ownership.GRACE_S + 1)
        self.assertEqual((again["owners"], len(calls), len(self.comments())), ({"lifecycle": 2}, 2, 2))

    def test_an_incidental_mention_is_not_evidence_and_searches_are_budgeted(self):
        for n in range(30, 38):
            self.started(n, "Validating")
        calls = []
        table = {f"JOV-{n}": [{"repository": "JovieInc/Jovie", "number": n, "title": "chore: unrelated",
                                "body": f"context JOV-{n} (not a reference line)"}] for n in range(30, 38)}
        report = self.reconcile(search=self.search(table, calls))
        self.assertEqual(len(calls), ownership.SEARCHES_PER_TICK)
        self.assertEqual(report["ownerless"], 8)
        self.reconcile(search=self.search(table, calls), at=60)
        self.assertEqual(len(calls), 8, "a miss is cached for a day; the rest finish next tick")
        unreadable = self.reconcile(search=lambda ident: None, at=ownership.GRACE_S + 1)
        self.assertEqual(unreadable["unresolved"], {"post-merge-without-merged-evidence": 8})

    def test_a_refs_line_listing_several_issues_claims_each_of_them(self):
        body = "Summary.\n\nRefs JOV-7703; JOV-6022; JOV-7514; JOV-7198.\n"  # Jovie#21232
        for ident in ("JOV-7703", "JOV-6022", "JOV-7198"):
            self.assertTrue(ownership.pr_names_issue({"title": "docs(fleet): x", "body": body}, ident))
        partial = "This is a bounded first repair under JOV-8333; the rest stays open."  # summer-config#211
        self.assertFalse(ownership.pr_names_issue({"title": "fix(summer): y", "body": partial}, "JOV-8333"))
