"""Reason worker ownership and recovery with real local leases and canned remote boundaries."""
from __future__ import annotations

import contextlib
import importlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


def _fixture(name):
    full = f"scripts.tests.{name}"
    module = sys.modules.get(name) or sys.modules.get(full) or importlib.import_module(full)
    sys.modules.setdefault(name, module)
    sys.modules.setdefault(full, module)
    return module


lane_fixtures = _fixture("test_lane_runner")
reason_fixtures = _fixture("test_reason_lane")
lane, reason, CONFIG = lane_fixtures.lane, reason_fixtures.reason, reason_fixtures.CONFIG


class ReasonOwnershipTest(unittest.TestCase):
    """Real local flocks; all model and remote destination boundaries remain canned."""
    NOW = 1_800_000_000.0

    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.state = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.host = SimpleNamespace(state=self.state, linear_env=self.state / "env")
        self.issue = {"id": "id-1", "identifier": "JOV-1", "title": "research", "createdAt": "1",
                      "description": reason_fixtures.description({**reason_fixtures.JOB_BLOCK,
                          "decisionType": "research", "contextRefs": []})}
        self.linear = reason_fixtures.FakeLinear(issues={"JOV-1": self.issue}, jobs=[self.issue])
        self.stack.enter_context(patch.dict(os.environ, {
            "JOVIE_AGENT_PROFILE": "coder", "LANES_SELFTEST": "", "LANES_EXECUTION_BACKEND": ""}))
        self.stack.enter_context(patch.object(lane, "SHARED_CACHE_DIR", self.state / "shared"))
        self.stack.enter_context(patch.object(reason, "healthy", return_value=True))
        self.stack.enter_context(patch.object(reason, "load_config", return_value=CONFIG))
        self.stack.enter_context(patch.object(lane, "load_github_env"))
        self.stack.enter_context(patch.object(lane, "Host", return_value=self.host))
        self.stack.enter_context(patch.object(lane, "Linear", return_value=self.linear))
        self.stack.enter_context(patch.object(lane.ownership.time, "time", return_value=self.NOW))

    def lease(self, issue=None):
        issue = issue or self.issue
        handle = lane.ownership.acquire_run_lease(self.state, issue["id"], issue["identifier"], "reason")
        self.assertIsNotNone(handle)
        self.addCleanup(handle.close)
        return handle

    def cli(self):
        with patch("sys.stdout", new_callable=io.StringIO) as output:
            code = reason.guarded_main(["run", self.issue["identifier"]])
        return code, json.loads(output.getvalue())

    def assert_blocked(self, receipt, why):
        self.assertEqual((receipt["status"], receipt["reason"], receipt["owner"]),
                         ("blocked", why, "reason-lane"))
        self.assertTrue(receipt["nextAction"])

    def mirror(self, issue=None, status="In Progress", updated="2027-01-15T07:59:59.000Z"):
        issue = issue or self.issue
        node = {**issue, "priority": 2, "updatedAt": updated, "parent": None,
                "labels": {"pageInfo": {"hasNextPage": False}, "nodes": [{"name": "reasoning-job"}]},
                "state": {"name": status, "type": "unstarted" if status == "Todo" else "started"}}
        lane.linear_sync.apply(self.state, "JOV", [node])

    def reconcile(self, at=0):
        return lane.ownership.reconcile(self.state, self.state, frozenset(), now=self.NOW + at,
            run=lambda *a, **kw: reason_fixtures.done())

    def test_drain_refuses_an_actual_held_issue_lease_before_move_or_execution(self):
        self.lease()
        with patch.object(reason, "one_job", return_value={"confidence": "research"}) as execute:
            result = reason.drain(self.host, lane, CONFIG)
        execute.assert_not_called()
        self.assertEqual(self.linear.moves, [])
        self.assertEqual(result["done"], [])
        self.assert_blocked(result["blocked"][0], "reason-run-already-owned")
        self.assertFalse(reason.budget_path(self.state).exists())

    def test_direct_run_refuses_an_actual_held_issue_lease_before_move_or_execution(self):
        self.lease()
        with patch.object(reason, "one_job", return_value={"confidence": "research"}) as execute:
            code, result = self.cli()
        execute.assert_not_called()
        self.assertEqual(self.linear.moves, [])
        self.assertEqual(code, 75)
        self.assert_blocked(result, "reason-run-already-owned")

    def test_direct_run_respects_reason_lock_held_by_a_different_issue(self):
        self.lease({"id": "id-2", "identifier": "JOV-2"})
        held = lane.Locked(self.state / "reason.lock", blocking=False)
        self.addCleanup(held.release)
        self.assertTrue(held.held)
        with patch.object(reason, "one_job", return_value={"confidence": "research"}) as execute:
            code, result = self.cli()
        execute.assert_not_called()
        self.assertEqual(self.linear.moves, [])
        self.assertEqual((code, result["status"]), (75, "busy"))
        self.assertEqual((result["reason"], result["owner"]), ("reason-run-already-owned", "reason-lane"))
        self.assertTrue(result["nextAction"])
        self.assertIsNone(lane.ownership.run_lease(self.state, self.issue["id"]))

    def test_accepted_execution_has_a_live_lease_and_local_reason_claim_until_settled(self):
        observed = []
        def complete(*args, **kwargs):
            observed.append((lane.ownership.run_lease(self.state, self.issue["id"]),
                             lane.linear_sync._claims(self.state).get(self.issue["id"])))
            self.linear.states[self.issue["id"]] = "Done"
            return {"confidence": "research", "publication": {"status": "published"}}
        with patch.object(reason, "one_job", side_effect=complete):
            result = reason.drain(self.host, lane, CONFIG)
        self.assertEqual(observed[0][0], "live")
        self.assertIsNotNone(observed[0][1], "an accepted reason run must not look like human activity")
        self.assertEqual((observed[0][1]["lane"], observed[0][1]["status"]), ("reason", "active"))
        self.assertEqual(lane.ownership.run_lease(self.state, self.issue["id"]), "ended")
        self.assertNotEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "active")
        self.assertEqual(result["done"], [{"job": "JOV-1", "confidence": "research"}])

    def test_unknown_worker_outcome_stays_owned_and_blocked_without_automatic_retry(self):
        with patch.object(reason, "one_job", side_effect=RuntimeError("transport outcome unknown")) as execute:
            result = reason.drain(self.host, lane, CONFIG)
        self.assertEqual(execute.call_count, 1)
        self.assertEqual(result["done"], [])
        self.assert_blocked(result["blocked"][0], "reason-attempt-outcome-unknown")
        self.assertEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "active")
        self.assertEqual(lane.ownership.run_lease(self.state, self.issue["id"]), "ended")
        self.mirror()
        for at in (1, lane.ownership.HUMAN_ACTIVITY_S + lane.ownership.GRACE_S + 1):
            report = self.reconcile(at)
            self.assertEqual(report["moved"], [])
            self.assertEqual(report["claimsReleased"], [])
            self.assertNotIn("recent-activity", report["owners"])
            self.assertTrue(report["unresolved"].get("reason-attempt-outcome-unknown"))
            self.assertTrue(any(row.get("owner") == "reason-lane" and row.get("nextAction")
                                for row in report["sample"]))
        self.assertEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "active")
        with patch.object(reason, "one_job", side_effect=AssertionError("duplicate attempt")) as execute:
            code, receipt = self.cli()
        execute.assert_not_called()
        self.assertEqual(code, 75)
        self.assert_blocked(receipt, "reason-attempt-outcome-unknown")
        self.assertNotIn((self.issue["id"], "Todo"), self.linear.moves)

    def test_saved_result_can_resume_a_superseded_reason_claim_without_model_work(self):
        first = reason_fixtures.Runner(hyperagent=reason_fixtures.done(json.dumps({"text": "Retained full memo"})),
                                      gbrain=reason_fixtures.done("ok"))
        initial = reason.one_job(self.linear, self.issue, CONFIG, self.state, run=first)
        self.assertEqual(initial["publication"]["status"], "blocked")
        saved = json.loads(reason.publication_path(self.state, self.issue).read_text())
        self.assertEqual(saved["outcome"]["research"], "Retained full memo")
        self.mirror()
        self.assertTrue(lane.linear_sync.claim(self.state, self.issue["id"], "JOV-1", "reason"))
        self.lease().close()
        self.mirror(status="Todo", updated="2027-01-15T08:00:01.000Z")
        self.assertEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "superseded")
        before = reason.budget_path(self.state).read_bytes()
        recovery = reason_fixtures.Runner(gbrain=reason_fixtures.StoringGbrain())
        with patch.object(reason, "healthy", return_value=False), \
                patch.object(reason, "execute", side_effect=AssertionError("must reuse retained bytes")):
            result = reason.drain(self.host, lane, {**CONFIG, "maxJobsPerDay": 0, "maxResearchPerDay": 0}, run=recovery)
        self.assertEqual(result["done"], [{"job": "JOV-1", "confidence": "research"}])
        self.assertEqual(reason.budget_path(self.state).read_bytes(), before)
        self.assertEqual(recovery.made("hyperagent"), [])
        self.assertEqual(self.linear.moves[-1], (self.issue["id"], "Done"))
        published = json.loads(reason.publication_path(self.state, self.issue).read_text())
        for field in ("inputDigest", "outcomeDigest", "payloadDigest", "outcome"):
            self.assertEqual(published[field], saved[field])
        self.assertEqual(lane.linear_sync._claims(self.state)[self.issue["id"]]["reason"], "reason:returned")

    def test_unclaimed_recent_human_activity_keeps_its_existing_grace(self):
        self.mirror()
        report = self.reconcile()
        self.assertEqual(report["owners"], {"recent-activity": 1})
        self.assertEqual(report["moved"], [])
        self.assertEqual(report["claimsReleased"], [])

    def ended_reason_claim(self, superseded=False):
        self.mirror()
        self.assertTrue(lane.linear_sync.claim(self.state, self.issue["id"], "JOV-1", "reason"))
        self.lease().close()
        if superseded:
            self.mirror(status="Todo", updated="2027-01-15T08:00:01.000Z")
            self.assertEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "superseded")
        self.mirror(updated="2027-01-15T08:00:02.000Z")
        for at in (lane.ownership.CLAIM_GRACE_S + 1, lane.ownership.HUMAN_ACTIVITY_S + 3600):
            report = self.reconcile(at)
            self.assertEqual(report["moved"], [])
            self.assertEqual(report["claimsReleased"], [])
            self.assertNotIn("recent-activity", report["owners"])
            self.assertTrue(report["unresolved"].get("reason-attempt-outcome-unknown"))
            self.assertTrue(any(row.get("owner") == "reason-lane" and row.get("nextAction")
                                for row in report["sample"]))
        expected = "superseded" if superseded else "active"
        self.assertEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), expected)
        with patch.object(reason, "one_job", side_effect=AssertionError("unknown work must not retry")) as execute:
            code, receipt = self.cli()
        execute.assert_not_called()
        self.assertEqual(code, 75)
        self.assert_blocked(receipt, "reason-attempt-outcome-unknown")

    def test_ended_reason_worker_is_explicitly_blocked_past_human_and_claim_grace(self):
        self.ended_reason_claim()

    def test_generic_supersession_cannot_make_an_unknown_reason_attempt_retryable(self):
        self.ended_reason_claim(superseded=True)

    def supersede_unknown_attempt(self):
        self.mirror()
        with patch.object(reason, "one_job", side_effect=RuntimeError("unknown remote outcome")):
            result = reason.drain(self.host, lane, CONFIG)
        self.assert_blocked(result["blocked"][0], "reason-attempt-outcome-unknown")
        self.mirror(status="Todo", updated="2027-01-15T08:00:01.000Z")
        row = lane.linear_sync._claims(self.state)[self.issue["id"]]
        self.assertEqual(row["status"], "superseded")
        return row

    def assert_unknown_cannot_execute(self):
        with patch.object(reason, "one_job", side_effect=AssertionError("unknown work must not retry")) as execute:
            code, receipt = self.cli()
        execute.assert_not_called()
        self.assertEqual(code, 75)
        self.assert_blocked(receipt, "reason-attempt-outcome-unknown")

    def test_priority_cleanup_cannot_erase_a_superseded_unknown_reason_attempt(self):
        row = self.supersede_unknown_attempt()
        self.assertFalse(lane.linear_sync.clear_superseded(self.state, self.issue["id"]))
        self.assertEqual(lane.linear_sync._claims(self.state)[self.issue["id"]], row)
        self.assert_unknown_cannot_execute()

    def test_unrelated_claim_cannot_prune_an_old_superseded_unknown_reason_attempt(self):
        row = self.supersede_unknown_attempt()
        later = self.NOW + lane.linear_sync.CLAIM_KEEP_S + 1
        with patch.object(lane.linear_sync.time, "time", return_value=later):
            self.assertTrue(lane.linear_sync.claim(self.state, "id-2", "JOV-2", "codex"))
        self.assertEqual(lane.linear_sync._claims(self.state)[self.issue["id"]], row)
        self.assert_unknown_cannot_execute()

    def test_direct_unknown_outcome_returns_blocked_and_keeps_its_reason_claim(self):
        with patch.object(reason, "one_job", side_effect=RuntimeError("unknown remote outcome")):
            code, record = self.cli()
        self.assertEqual(code, 75)
        self.assert_blocked(record["publication"], "reason-attempt-outcome-unknown")
        self.assertEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "active")
        self.assertEqual(lane.ownership.run_lease(self.state, self.issue["id"]), "ended")
        self.assertNotIn((self.issue["id"], "Todo"), self.linear.moves)

    def test_failed_pre_execution_state_move_unwinds_only_its_known_new_claim(self):
        with patch.object(self.linear, "move", side_effect=RuntimeError("state write unavailable")), \
                patch.object(reason, "one_job") as execute:
            with self.assertRaisesRegex(RuntimeError, "state write unavailable"):
                reason.drain(self.host, lane, CONFIG)
        execute.assert_not_called()
        self.assertEqual(lane.ownership.run_lease(self.state, self.issue["id"]), "ended")
        self.assertNotEqual(lane.linear_sync.claim_status(self.state, self.issue["id"]), "active")
