"""Child delivery requests parent outcome validation; a stale `hold` expires."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import epics  # noqa: E402
import lane_runner as lane  # noqa: E402

NOW = 1790860000.0
TEAM = {"id": "team-1", "key": "JOV", "states": {"nodes": [
    {"id": "s-todo", "name": "Todo", "type": "unstarted"}, {"id": "s-done", "name": "Done", "type": "completed"}]}}


def plan(*children, summary="Two slices."):
    rows = [{"title": title, "goal": f"{title} works", "definitionOfDone": [f"{title} is tested"]}
            for title in children]
    return f"```json\n{json.dumps({'schema': epics.PLAN_SCHEMA, 'summary': summary, 'children': rows})}\n```"


def child(identifier, kind, title="x", delivered_at="2026-10-03T11:00:00Z"):
    return {"id": identifier.lower(), "identifier": identifier, "title": title,
            "state": {"name": kind, "type": kind},
            "completedAt": delivered_at if kind == "completed" else None,
            "canceledAt": delivered_at if kind == "canceled" else None}


class FakeLinear:
    def __init__(self, children=(), more=False, create_ok=True):
        self.children, self.more, self.create_ok = list(children), more, create_ok
        self.moves, self.comments, self.created, self.removed = [], [], [], []
        self.epics, self.holds, self.remove_leaves = [], [], set()
        self.rate_limited = False

    def gql(self, query, variables):
        if self.rate_limited:
            raise lane.LinearRateLimited(NOW + 60)
        if query == epics.DETAIL_QUERY:
            found = next((epic for epic in self.epics if epic["id"] == variables["id"]), None)
            children = found["children"] if found else {"pageInfo": {"hasNextPage": self.more}, "nodes": self.children}
            return {"issue": {"id": variables["id"], "team": TEAM, "state": found["state"] if found else {"name": "In Progress"}, "children": children,
                "comments": {"pageInfo": {"hasNextPage": False}, "nodes": [{"body": body} for issue_id, body in self.comments if issue_id == variables["id"]]},
                "history": {"pageInfo": {"hasNextPage": False}, "nodes": []}}}
        if query == epics.CREATE_MUTATION:
            given = variables["i"]
            self.created.append(given)
            number = 100 + len(self.created)
            return {"issueCreate": {"success": True, "issue": {
                "id": f"c{number}", "identifier": f"JOV-{number}", "title": given["title"],
                "parent": {"id": given["parentId"] if self.create_ok else "other"}, "state": {"id": given["stateId"]}}}}
        if query == epics.EPICS_QUERY:
            return {"issues": {"nodes": self.epics}}
        if query == epics.HOLDS_QUERY:
            self.before = variables["before"]
            return {"issues": {"nodes": self.holds}}
        if query == epics.REMOVE_LABEL:
            self.removed.append((variables["id"], variables["label"]))
            left = [{"name": "hold"}] if variables["id"] in self.remove_leaves else [{"name": "bug"}]
            return {"issueRemoveLabel": {"success": True, "issue": {"labels": {"nodes": left}}}}
        raise AssertionError(query)

    def move(self, issue_id, state):
        self.moves.append((issue_id, state))

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))


def epic_issue(**fields):
    base = dict(id="e1", identifier="JOV-1", title="Ship merch v2", description="The epic.", priority=2,
                created_at="2026-09-01T00:00:00Z", labels=["Type:Epic"])
    return lane.Issue(**{**base, **fields})


class PlanTest(unittest.TestCase):
    def test_closed_merch_children_do_not_certify_the_parent_outcome(self):
        linear = FakeLinear(children=[child("JOV-2", "completed"), child("JOV-3", "completed")])
        epics.close_epic(linear, "e1", linear.children)
        self.assertNotIn(("e1", "Done"), linear.moves)

    def test_parent_validation_request_rechecks_children_and_deduplicates(self):
        linear = FakeLinear(children=[child("JOV-2", "completed")])
        self.assertTrue(epics.close_epic(linear, "e1", []))
        self.assertFalse(epics.close_epic(linear, "e1", []))
        self.assertEqual(len(linear.comments), 1)
        linear.children[0]["completedAt"] = "2026-10-03T14:00:00Z"
        self.assertTrue(epics.close_epic(linear, "e1", []))
        self.assertFalse(epics.close_epic(linear, "e1", []))
        self.assertEqual(len(linear.comments), 2)
        linear.children.append(child("JOV-3", "started"))
        self.assertFalse(epics.close_epic(linear, "e1", [child("JOV-2", "completed")]))
        self.assertEqual(linear.moves, [])

    def test_reopened_parent_requests_a_new_outcome_for_unchanged_children(self):
        linear = FakeLinear(children=[child("JOV-2", "completed")])
        self.assertTrue(epics.close_epic(linear, "e1", []))
        detail = linear.gql(epics.DETAIL_QUERY, {"id": "e1"})
        detail["issue"]["history"] = {"pageInfo": {"hasNextPage": False}, "nodes": [
            {"createdAt": "2026-10-14T21:00:00Z", "fromState": {"type": "completed"},
             "toState": {"type": "started"}}]}
        with patch.object(linear, "gql", return_value=detail):
            self.assertTrue(epics.close_epic(linear, "e1", []))
            detail["issue"]["comments"]["nodes"].append({"body": linear.comments[-1][1]})
            self.assertFalse(epics.close_epic(linear, "e1", []))
        self.assertEqual(len(linear.comments), 2)
        self.assertEqual(linear.moves, [])

    def test_partial_parent_evidence_and_unknown_child_identity_stay_open(self):
        linear = FakeLinear(children=[child("JOV-2", "completed")])
        for connection in ("children", "comments", "history"):
            detail = linear.gql(epics.DETAIL_QUERY, {"id": "e1"})
            detail["issue"][connection]["pageInfo"]["hasNextPage"] = True
            with patch.object(linear, "gql", return_value=detail):
                self.assertFalse(epics.close_epic(linear, "e1", linear.children))
        linear.children = [{"state": {"type": "completed"}}]
        self.assertFalse(epics.close_epic(linear, "e1", linear.children))
        self.assertEqual((linear.moves, linear.comments), ([], []))
        linear.children = [child("JOV-2", "completed", delivered_at=None)]
        self.assertFalse(epics.close_epic(linear, "e1", []))

    def test_unknown_reopen_episode_cannot_issue_duplicate_validation_requests(self):
        linear = FakeLinear(children=[child("JOV-2", "completed")])
        for stamp, target in (("invalid", "started"), ("2026-10-14T21:00:00", "started"),
                              ("2026-10-14T21:00:00Z", None)):
            detail = linear.gql(epics.DETAIL_QUERY, {"id": "e1"})
            detail["issue"]["history"]["nodes"] = [{"createdAt": stamp,
                "fromState": {"type": "completed"}, "toState": {"type": target}}]
            with patch.object(linear, "gql", return_value=detail):
                self.assertFalse(epics.close_epic(linear, "e1", []))
        self.assertEqual((linear.moves, linear.comments), ([], []))

    def test_canonical_validation_states_are_not_taken_over(self):
        linear = FakeLinear(children=[child("JOV-2", "completed")])
        for state in ("Done", "Canceled", "Merging", "Validating", "Rework"):
            detail = linear.gql(epics.DETAIL_QUERY, {"id": "e1"})
            detail["issue"]["state"]["name"] = state
            with patch.object(linear, "gql", return_value=detail):
                self.assertFalse(epics.close_epic(linear, "e1", linear.children))
        self.assertEqual((linear.moves, linear.comments), ([], []))
    def test_is_epic_and_children_status(self):
        self.assertTrue(epics.is_epic(epic_issue()))
        self.assertFalse(epics.is_epic(epic_issue(labels=["bug"])))
        self.assertEqual(epics.children_status([]), "empty")
        self.assertEqual(epics.children_status([child("A", "canceled")]), "empty")
        self.assertEqual(epics.children_status([child("A", "canceled"), child("B", "completed")]), "done")
        self.assertEqual(epics.children_status([child("A", "completed"), child("B", "started")]), "open")
        self.assertEqual(epics.children_status([child("A", "completed")], complete=False), "open")

    def test_parse_plan_takes_the_last_valid_block_and_caps_children(self):
        many = plan(*[f"Slice {n}" for n in range(20)])
        text = f"{plan('old')}\n```json {{bad```\n```json\n{{\"schema\": \"other\"}}\n```\n{many}"
        parsed = epics.parse_plan(text)
        self.assertEqual(len(parsed["children"]), epics.MAX_CHILDREN)
        self.assertEqual(parsed["children"][0], {"title": "Slice 0", "goal": "Slice 0 works",
                                                 "done": ["Slice 0 is tested"]})
        loose = {"schema": epics.PLAN_SCHEMA, "children": [
            "x", {"title": "No goal", "definitionOfDone": ["y"]},
            {"title": "One line", "goal": "g", "definitionOfDone": "it works"}]}
        self.assertEqual(epics.parse_plan(f"```json\n{json.dumps(loose)}\n```")["children"],
                         [{"title": "One line", "goal": "g", "done": ["it works"]}])
        self.assertIsNone(epics.parse_plan("no plan here"))

    def test_prompt_lists_existing_children_and_forbids_writes(self):
        prompt = epics.render_prompt(epic_issue(), [child("JOV-7", "started", "Existing slice")])
        self.assertIn("JOV-7 Existing slice (started)", prompt)
        self.assertIn("Do not edit files", prompt)
        self.assertIn(epics.PLAN_SCHEMA, prompt)
        self.assertIn("- (none)", epics.render_prompt(epic_issue(), []))

    def test_apply_plan_dedupes_existing_titles_and_verifies_readback(self):
        linear = FakeLinear()
        detail = {"team": TEAM, "children": {"nodes": [child("JOV-7", "canceled", "Build the API")]}}
        parsed = epics.parse_plan(plan("Build the API!", "Ship the UI", "ship the ui"))
        created = epics.apply_plan(linear, detail, epic_issue(), parsed, "claude")
        self.assertEqual([row["title"] for row in created], ["Ship the UI"])
        [given] = linear.created
        self.assertEqual((given["teamId"], given["stateId"], given["parentId"], given["priority"]),
                         ("team-1", "s-todo", "e1", 2))
        self.assertNotIn("labelIds", given)
        self.assertIn("## Goal", given["description"])
        self.assertIn("## Definition of done\n- Ship the UI is tested", given["description"])
        with self.assertRaisesRegex(RuntimeError, "readback"):
            epics.apply_plan(FakeLinear(create_ok=False), {"team": TEAM, "children": {"nodes": []}},
                             epic_issue(), parsed, "claude")
        with self.assertRaisesRegex(RuntimeError, "Todo"):
            epics.create_child(linear, {"team": {**TEAM, "states": {"nodes": []}}}, epic_issue(),
                               parsed["children"][0], "claude", 0)


class RunEpicTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = SimpleNamespace(state=Path(self.tmp.name), agent_timeout=60)
        self.output, self.exit = plan("Build the API", "Ship the UI"), 0

    def sh(self, args, cwd=None, log=None, **_):
        if args[:3] == ["git", "worktree", "add"]:
            Path(args[-2]).mkdir(parents=True)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    def run_agent(self, cmd, cwd, log, timeout, guard=None):
        guard()
        log.write(self.output)
        return SimpleNamespace(returncode=self.exit)

    def run_epic(self, linear):
        spec = {"cmd": ["agent", "{prompt_file}"], "model": "m"}
        with patch.object(lane, "sh", side_effect=self.sh) as sh, \
                patch.object(lane, "run_agent", side_effect=self.run_agent), \
                patch.object(lane, "require_disk"):
            receipt = epics.run_epic(lane, self.host, "claude", spec, linear, epic_issue(), Path("/repo"))
        removed = [call.args[0] for call in sh.call_args_list if call.args[0][:3] == ["git", "worktree", "remove"]]
        ledger = (self.host.state / "runs" / "ledger.jsonl").read_text().splitlines()
        self.assertEqual(json.loads(ledger[-1])["verdict"], receipt["verdict"])
        return receipt, removed

    def test_decomposes_an_epic_without_children_once(self):
        linear = FakeLinear()
        receipt, removed = self.run_epic(linear)
        self.assertEqual((receipt["verdict"], receipt["children"]), ("decomposed", ["JOV-101", "JOV-102"]))
        self.assertEqual(len(removed), 1)
        self.assertEqual(linear.moves, [])  # the claim already moved the epic to In Progress
        self.assertIn("decomposed this epic into 2 child issue(s)", linear.comments[-1][1])
        self.assertIn("JOV-101 Build the API", linear.comments[-1][1])
        rerun = FakeLinear(children=[child("JOV-101", "canceled", "Build the API"),
                                     child("JOV-102", "canceled", "Ship the UI")])
        receipt, _ = self.run_epic(rerun)
        self.assertEqual((receipt["verdict"], rerun.created), ("failed", []))
        self.assertEqual(receipt["reasons"], ["epic-plan-duplicates-existing-children"])

    def test_open_children_drive_the_work_and_finished_children_close_the_epic(self):
        linear = FakeLinear(children=[child("JOV-2", "started")])
        receipt, removed = self.run_epic(linear)
        self.assertEqual((receipt["verdict"], removed, linear.created), ("epic-children-active", [], []))
        linear = FakeLinear(children=[child("JOV-2", "completed"), child("JOV-3", "canceled")])
        receipt, _ = self.run_epic(linear)
        self.assertEqual(receipt["verdict"], "epic-awaiting-validation")
        self.assertEqual(linear.moves, [])
        self.assertIn("parent outcome", linear.comments[-1][1])
        self.run_epic(linear)
        self.assertEqual(len(linear.comments), 1)
        self.assertEqual(self.run_epic(FakeLinear(children=[child("JOV-2", "completed")], more=True))[0]["verdict"],
                         "epic-children-active")

    def test_declines_missing_plans_and_partial_creation_still_reports(self):
        self.output = "NOT-SHIPPABLE: already delivered on main"
        self.assertEqual(self.run_epic(FakeLinear())[0]["reasons"], ["already delivered on main"])
        self.output, self.exit = "no plan", 3
        self.assertEqual(self.run_epic(FakeLinear())[0]["verdict"], "provider-error")
        self.exit = 0
        self.assertEqual(self.run_epic(FakeLinear())[0]["reasons"], ["epic-plan-missing"])
        self.output = plan("Build the API")
        linear = FakeLinear(create_ok=False)
        receipt, removed = self.run_epic(linear)
        self.assertEqual(receipt["verdict"], "failed")
        self.assertIn("readback", receipt["reasons"][0])
        self.assertEqual((len(removed), linear.comments), (1, []))

    def test_disk_pressure_holds_the_epic(self):
        with patch.object(lane, "require_disk", side_effect=lane.DiskAdmissionError("disk-low")), \
                patch.object(lane, "sh", side_effect=self.sh):
            receipt = epics.run_epic(lane, self.host, "claude", {"cmd": []}, FakeLinear(), epic_issue(), Path("/r"))
        self.assertEqual(receipt["verdict"], "disk-held")

    def test_codex_last_message_is_read(self):
        worktree = self.host.state / "wt"
        worktree.mkdir()
        (worktree / ".codex-last-message.txt").write_text(plan("From codex"))
        text = epics.plan_text(worktree, self.host.state / "missing.log")
        self.assertEqual(epics.parse_plan(text)["children"][0]["title"], "From codex")


class ReconcileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = SimpleNamespace(state=Path(self.tmp.name))
        self.linear = FakeLinear()

    def reconcile(self, now=NOW, owner="gem", host="gem"):
        with patch.dict(os.environ, {"LANES_RECONCILE_OWNER": owner}), patch.object(lane, "HOST", host):
            return epics.reconcile(lane, self.host, lambda: self.linear, ["JOV", "LYB"], now=now)

    def test_only_the_owner_runs_and_it_is_throttled(self):
        self.assertEqual(self.reconcile(host="mac")["status"], "not-owner")
        self.assertEqual(self.reconcile()["status"], "ok")
        self.assertEqual(self.reconcile(now=NOW + 60)["status"], "throttled")
        self.assertEqual(self.reconcile(now=NOW + epics.RECONCILE_INTERVAL_S)["status"], "ok")

    def test_closes_finished_epics_and_starts_todo_epics_with_open_children(self):
        def epic(identifier, state, kinds, more=False):
            return {"id": identifier.lower(), "identifier": identifier, "state": {"name": state},
                    "children": {"pageInfo": {"hasNextPage": more}, "nodes": [child(f"child-{n}", k) for n, k in enumerate(kinds)]}}
        self.linear.epics = [epic("JOV-1", "In Progress", ["completed", "canceled"]),
                             epic("JOV-2", "Todo", ["started"]), epic("JOV-3", "In Progress", ["started"]),
                             epic("JOV-4", "Todo", []), epic("JOV-5", "In Progress", ["canceled"]),
                             epic("JOV-6", "In Progress", ["completed"], more=True)]
        result = self.reconcile()
        self.assertEqual((result["epicsDone"], result["epicsStarted"]), ([], ["JOV-2"]))
        self.assertEqual(result["epicsAwaitingValidation"], ["JOV-1"])
        self.assertEqual(self.linear.moves, [("jov-2", "In Progress")])
        self.assertEqual(self.reconcile(now=NOW + epics.RECONCILE_INTERVAL_S)["epicsAwaitingValidation"], [])

    def test_expires_holds_without_activity_for_72h(self):
        hold = lambda ident: {"id": ident, "identifier": ident, "labels": {"nodes": [
            {"id": "l-hold", "name": "hold"}, {"id": "l-HOLD", "name": "Hold"}, {"id": "l-bug", "name": "bug"}]}}
        self.linear.holds = [hold("JOV-8"), hold("JOV-9")]
        self.linear.remove_leaves = {"JOV-9"}
        result = self.reconcile()
        self.assertEqual(result["holdsExpired"], ["JOV-8"])
        self.assertEqual(self.linear.before, "2026-09-28T13:06:40Z")  # NOW - 72h; fresher holds stay
        self.assertEqual(self.linear.removed[:2], [("JOV-8", "l-hold"), ("JOV-8", "l-HOLD")])
        self.assertEqual(self.linear.comments, [("JOV-8", epics.HOLD_EXPIRED_COMMENT)])
        self.assertFalse(epics.expire_hold(self.linear, {"id": "x", "labels": {"nodes": []}}))
        refused = FakeLinear()
        refused.gql = lambda q, v: {"issueRemoveLabel": {"success": False}}
        self.assertFalse(epics.expire_hold(refused, hold("JOV-10")))

    def test_rate_limit_is_recorded_not_raised(self):
        self.linear.rate_limited = True
        result = self.reconcile()
        self.assertEqual((result["status"], result["resetAt"]), ("linear-rate-limited", NOW + 60))
        saved = json.loads((self.host.state / "issue-reconcile.json").read_text())
        self.assertEqual(saved["result"]["status"], "linear-rate-limited")


if __name__ == "__main__":
    unittest.main()
