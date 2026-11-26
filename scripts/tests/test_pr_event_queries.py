"""Focused regressions for stale conflicted draft inventory recovery."""
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts.tests.test_pr_events import NOW, Shell, events


class QueryTest(unittest.TestCase):
    def setUp(self):
        clock = patch.object(events.time, "time", return_value=NOW)
        clock.start()
        self.addCleanup(clock.stop)

    def row(self, number=9, branch="codex/jov-9-fix", labels=None):
        return {"number": number, "headRefName": branch, "headRefOid": f"head-{number}",
                "isDraft": True, "mergeable": "CONFLICTING", "mergeStateStatus": "DIRTY",
                "isCrossRepository": False, "baseRefName": "main", "createdAt": "2026-11-20T00:00:00Z",
                "labels": labels or []}

    def evidence(self, row, *, parked=False):
        events = ([{"__typename": "ConvertToDraftEvent"}] if parked
                  else [])
        return {"number": row["number"], "state": "OPEN", "baseRefName": "main",
                "headRefName": row["headRefName"], "headRefOid": row["headRefOid"],
                "isDraft": True, "mergeable": "CONFLICTING", "mergeStateStatus": "DIRTY",
                "reviewDecision": None, "isCrossRepository": False, "isInMergeQueue": False,
                "createdAt": row["createdAt"], "body": "", "labels": {
                    "pageInfo": {"hasNextPage": False}, "nodes": []},
                "commits": {"nodes": [{"commit": {"committedDate": "2026-11-20T00:00:00Z"}}]},
                "timelineItems": {"pageInfo": {"hasNextPage": False}, "nodes": events}}

    def shell(self, rows, *, parked=False):
        def query(args):
            query_text = next(arg for arg in args if arg.startswith("query="))
            return {"data": {"repository": {
                f"pr{row['number']}": self.evidence(row, parked=parked) for row in rows
                if f"pr{row['number']}:pullRequest(" in query_text
            }}}
        def listed(args):
            columns = args[-1].split(",")
            return [{key: row[key] for key in columns if key in row} for row in rows]
        return Shell({("gh", "pr", "list"): listed,
                      ("gh", "api", "graphql"): query})

    def test_label_backlog_recovers_missing_clock_and_reads_label_back(self):
        row = self.row()
        shell = self.shell([row])
        prior_shape = {key: value for key, value in row.items() if key not in {"baseRefName", "createdAt"}}
        self.assertEqual(events.backlog_targets([prior_shape], set(), ("conflict",)), [])
        writes = []
        def add_label(number, kind, _sh):
            writes.append((number, kind))
            row["labels"].append({"name": f"lane-fix-{kind}"})
            return True
        with patch.object(events.red_repair, "writer_active", return_value=False), \
             patch.object(events, "claim_active", return_value=False), \
             patch.object(events, "add_label", side_effect=add_label):
            self.assertEqual(events.label_backlog(shell, set(), kinds=("conflict",), settle_s=0),
                             [(9, "conflict")])
            self.assertEqual(events.backlog_targets(events.list_open(shell), set(), ("conflict",)), [])
        self.assertEqual(writes, [(9, "conflict")])
        listing = shell.made("gh", "pr", "list")[0]
        self.assertIn("createdAt,baseRefName", listing[-1])
        self.assertEqual(len(shell.made("gh", "api", "graphql")), 1)

    def test_no_write_for_post_head_convert_to_draft(self):
        shell = self.shell([self.row()], parked=True)
        with patch.object(events.red_repair, "writer_active", return_value=False), \
             patch.object(events, "claim_active", return_value=False), \
             patch.object(events, "add_label") as add_label:
            self.assertEqual(events.label_backlog(shell, set(), kinds=("conflict",), settle_s=0), [])
        add_label.assert_not_called()

    def test_non_conflict_rows_lane_branches_and_lifecycle_are_not_enriched(self):
        rows = [self.row(1, labels=[{"name": "lane-fix-red"}]),
                self.row(2, branch="codex/jov-2-20261120-task"),
                self.row(3, branch="codex/ordinary")]
        shell = self.shell(rows)
        with patch.object(events.red_repair, "writer_active", return_value=False):
            inventory = events.list_open(shell, enrich_conflicted_drafts=True)
        self.assertEqual(["createdAt" in row for row in inventory], [False, False, True])
        self.assertEqual(len(shell.made("gh", "api", "graphql")), 1)
        rows = [self.row()]
        shell = self.shell(rows)
        with patch.object(events.red_repair, "writer_active", return_value=False):
            events.list_open(shell, enrich_conflicted_drafts=False)
        self.assertEqual(shell.made("gh", "api", "graphql"), [])

    def test_advanced_or_held_draft_evidence(self):
        row = self.row()
        recent = datetime.fromtimestamp(NOW - 5, timezone.utc).isoformat()
        cases = [
            ({"timelineItems": {"nodes": [{"__typename": "HeadRefForcePushedEvent"}]}}, True),
            ({"timelineItems": {"nodes": [{"__typename": "UnexpectedEvent"}]}}, False),
            ({"timelineItems": None}, False),
            ({"headRefOid": "updated"}, False),
            ({"isInMergeQueue": True}, False),
            ({"body": "<!-- jovie-auto-ready: park -->"}, False),
            ({"reviewDecision": "CHANGES_REQUESTED"}, False),
            ({"labels": {"pageInfo": {"hasNextPage": True}, "nodes": []}}, False),
            ({"labels": {"pageInfo": {"hasNextPage": False}, "nodes": [{"name": "queue-poison"}]}}, False),
            ({"commits": {"nodes": [None]}}, False),
            ({"commits": {"nodes": [{"commit": {"committedDate": recent}}]}}, False),
            ({"commits": {"nodes": [{"commit": {"committedDate": "malformed"}}]}}, False),
        ]
        for change, expected in cases:
            with self.subTest(change=change):
                current = self.evidence(row) | change
                sh = Shell({("gh", "pr", "list"): [row], ("gh", "api", "graphql"):
                            {"data": {"repository": {"pr9": current}}}})
                result = events.list_open(sh, enrich_conflicted_drafts=True)
                self.assertEqual("createdAt" in result[0], expected)

    def test_inventory_uses_the_lifecycle_runner_with_its_time_bound(self):
        from apiclient.gh import run_gh
        from types import SimpleNamespace
        seen = []

        def budgeted(args, *, run, priority, env):
            self.assertEqual(priority, "repair")
            code, stdout, stderr = run(args, {})
            return {"code": code, "stdout": stdout, "stderr": stderr}

        def execute(args, **kwargs):
            seen.append((args[:3], kwargs["timeout"]))
            return SimpleNamespace(returncode=0, stdout="[]", stderr="")

        with patch("apiclient.gh.run_gh", autospec=run_gh, side_effect=budgeted), \
             patch.object(events.lifecycle, "run", side_effect=execute):
            self.assertEqual(events.list_open(), [])
        self.assertEqual(seen, [(["gh", "pr", "list"], 180)])

    def test_unavailable_inventory_and_evidence(self):
        for response in ((1, ""), (0, "not JSON"), (0, "{}")):
            with self.subTest(response=response):
                shell = Shell({("gh", "pr", "list"): response})
                self.assertEqual(events.list_open(shell, enrich_conflicted_drafts=True), [])
        row = self.row()
        for response in ((1, ""), {"data": {"repository": None}}):
            shell = Shell({("gh", "pr", "list"): [row], ("gh", "api", "graphql"): response})
            self.assertNotIn("createdAt", events.list_open(shell, enrich_conflicted_drafts=True)[0])

    def test_incomplete_or_malformed_candidate_fails_closed_per_row(self):
        eligible, malformed = self.row(10), self.row(11)
        def query(_args):
            incomplete = self.evidence(malformed)
            incomplete.pop("timelineItems")
            return {"data": {"repository": {"pr10": self.evidence(eligible), "pr11": incomplete}}}
        shell = Shell({("gh", "pr", "list"): [eligible, malformed],
                       ("gh", "api", "graphql"): query})
        with patch.object(events.red_repair, "writer_active", return_value=False):
            inventory = events.list_open(shell, enrich_conflicted_drafts=True)
        self.assertIn("createdAt", inventory[0])
        self.assertNotIn("createdAt", inventory[1])
        self.assertEqual(len(shell.made("gh", "api", "graphql")), 1)


if __name__ == "__main__":
    unittest.main()
