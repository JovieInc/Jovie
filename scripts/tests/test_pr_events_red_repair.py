"""Red-repair admission regression tests (scripts/lanes/red_repair.py via pr_events, 2026-11-12).

Split from test_pr_events.py (size budget). Run with:
    python3 -m pytest scripts/tests/test_pr_events_red_repair.py -v
"""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.tests.test_pr_events import NOW, Shell, events, fake_lane


def iso_at(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class RedRepairTest(unittest.TestCase):
    """Tim 2026-11-12: a red required check on any same-repo PR to main queues repair now unless
    an active worker (fresh exact-head claim, or a commit inside the hour) holds the head. Red main
    and infra incidents queue none. 27 agent drafts sat red 6-48h on 2026-11-12 under the 3d rule."""
    RUN = {"event": "pull_request", "conclusion": "failure", "head_sha": "h1", "pull_requests": [{"number": 5}]}

    def gh(self, *, committed=NOW - 7200, claim_age=None, main="success", peers=(), check="Source Validation"):
        """One canned GitHub: the head rollup, Main Health runs, claim comments and the peer read."""
        failed = {"__typename": "CheckRun", "name": check, "conclusion": "FAILURE", "completedAt": iso_at(NOW - 300)}
        rollup = {"data": {"repository": {"pullRequest": {"commits": {"nodes": [{"commit": {
            "committedDate": iso_at(committed), "statusCheckRollup": {"contexts": {"nodes": [failed]}}}}]}}}}}
        peer_nodes = [{"number": n, "isCrossRepository": False, "commits": {"nodes": [{"commit": {
            "statusCheckRollup": {"contexts": {"nodes": [failed]}}}}]}} for n in peers]
        runs = {"workflow_runs": [{"event": "push", "conclusion": main, "head_sha": "m1",
                                   "created_at": iso_at(NOW - 600)}]}
        claim = "" if claim_age is None else f"🤖 lane claim kind=fix sha=h1 host=gem at={iso_at(NOW - claim_age)}"

        def api(args):
            text = " ".join(args)
            if args[2] == "graphql":
                return {"data": {"repository": {"pullRequests": {"nodes": peer_nodes}}}} if "orderBy" in text else rollup
            if "main-health.yml" in text:
                return runs
            if args[2] == "--paginate" and "/comments" in text:
                return claim
            return ""
        return api

    def relay(self, view=None, **gh):
        view = {"state": "OPEN", "isDraft": True, "baseRefName": "main", "headRefName": "feature/agent-wip",
                "headRefOid": "h1", "isCrossRepository": False, "mergeStateStatus": "BLOCKED", "labels": [], **(view or {})}
        shell = Shell({("gh", "pr", "view"): view, ("gh", "issue", "list"): [],
                       ("gh", "issue", "create"): "https://github.com/JovieInc/Jovie/issues/900",
                       ("gh", "api"): self.gh(**gh)})
        with patch.object(events.time, "time", return_value=NOW):
            added = events.relay("workflow_run", {"workflow_run": self.RUN}, shell, set())
        return added, shell

    def test_a_red_two_hour_old_draft_with_no_worker_is_repaired_now(self):
        added, shell = self.relay()
        self.assertEqual(added, [(5, "red")])
        self.assertEqual(len(shell.made("gh", "api", "-X", "POST")), 1)

    def test_a_fresh_claim_or_a_recent_commit_holds_the_head(self):
        for why, gh in (("claim 10 min old on the exact head", {"claim_age": 600}),
                        ("commit 10 min old", {"committed": NOW - 600})):
            added, shell = self.relay(**gh)
            self.assertEqual(added, [], why)
            self.assertEqual(shell.made("gh", "api", "-X", "POST"), [], why)
        expired, _ = self.relay(claim_age=events.CLAIM_TTL_S + 60)
        self.assertEqual(expired, [(5, "red")], "an expired claim is no worker")
        lane_push, _ = self.relay(view={"isDraft": False, "headRefName": "devin/jov-1-20260926t0900"},
                                  committed=NOW - 600)
        self.assertEqual(lane_push, [(5, "red")], "a lane's own red push is repaired, not waited on")
        stacked, _ = self.relay(view={"baseRefName": "feature/parent"})
        self.assertEqual(stacked, [], "a stacked draft stays with its stack")

    def test_nothing_is_labelled_while_main_is_red(self):
        for view in ({}, {"isDraft": False, "headRefName": "devin/jov-1-20260926t0900"}):
            added, shell = self.relay(view=view, main="failure")
            self.assertEqual(added, [])
            self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])

    def test_an_infra_incident_files_one_issue_and_repairs_nothing(self):
        added, shell = self.relay(peers=range(10, 15))  # 5 peers + this PR = 6 > INFRA_PEERS
        self.assertEqual(added, [(900, events.remediation.INTAKE_LABEL)])
        self.assertEqual(shell.made("gh", "api", "-X", "POST"), [], "zero repairs")
        self.assertEqual(len(shell.made("gh", "issue", "create")), 1)
        below, _ = self.relay(peers=range(10, 14))  # 4 peers + this PR = 5: not an incident
        self.assertEqual(below, [(5, "red")])
        red_repair = events.red_repair
        self.assertEqual(red_repair.incident_checks({"ci": {n: iso_at(NOW - 3600) for n in range(9)}}, NOW), {},
                         "failures older than the 30-minute window are not an incident")
        self.assertEqual(red_repair.incident_checks({"tently": {}, "ci": {n: iso_at(NOW) for n in range(6)}}, NOW),
                         {"ci": list(range(6))})

    def test_reconcile_backstop_honours_main_red_and_infra_incidents(self):
        def node(n):
            return {"number": n, "isDraft": True, "headRefName": f"feature/w{n}", "headRefOid": "h1",
                    "baseRefName": "main", "state": "OPEN", "mergeStateStatus": "BLOCKED", "isInMergeQueue": False,
                    "isCrossRepository": False, "createdAt": iso_at(NOW - 7200), "updatedAt": iso_at(NOW - 7200),
                    "labels": {"nodes": []},
                    "commits": {"nodes": [{"commit": {"committedDate": iso_at(NOW - 7200),
                                                      "statusCheckRollup": {"state": "FAILURE"}}}]}}

        def sweep(count, **gh):
            page = {"data": {"repository": {"pullRequests": {
                "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [node(n) for n in range(1, count + 1)]}}}}
            api = self.gh(**gh)
            shell = Shell({("gh", "issue", "list"): [], ("gh", "issue", "create"): "https://github.com/x/issues/901",
                           ("gh", "api"): lambda args: page if "states:OPEN,first:50" in " ".join(args) else api(args)})
            with tempfile.TemporaryDirectory() as tmp:
                record = events.reconcile(SimpleNamespace(state=Path(tmp)), fake_lane(shell), lambda: None, NOW, force=True)
            return record, shell

        record, shell = sweep(2)
        self.assertEqual(sorted(record["labeled"]), [(1, "red"), (2, "red")], "the sweep is the hour's check-in")
        record, shell = sweep(2, main="failure")
        self.assertEqual(record["labeled"], [])
        self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])
        record, shell = sweep(6)
        self.assertEqual(record["labeled"], [], "six PRs red on one check inside 30 min is one incident")
        self.assertEqual(len(shell.made("gh", "issue", "create")), 1)
