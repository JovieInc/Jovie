"""Cloud runner contract cases; bound to the existing runner fixtures at collection."""
import json
import os
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class CloudLaneGateMixin:
    """JOV-10357: the claimed-execution cloud gate and the draft-only origin guards (R3/R4/R7)."""

    def setUp(self):
        disk = patch.object(self.runner.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)
        self.real_verify = self.runner.verify_and_land
        self.addCleanup(setattr, self.runner, "verify_and_land", self.real_verify)
        self.real_next, self.real_pack = self.runner.next_provider, self.runner.context_pack
        self.runner.next_provider = lambda *a, **k: None
        self.runner.context_pack = lambda issue: "ctx"
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = self.runner.Host(state=Path(self.tmp.name), repo=Path(self.tmp.name))
        self.ledger = Path(self.tmp.name) / "cloud-lane.jsonl"
        self.env = patch.dict(os.environ, {"CLOUD_LANE_LEDGER": str(self.ledger),
                                           "LANES_CLOUD_ENABLED": "1",
                                           "CODEX_CLOUD_ENV": "env_test",
                                           "CODEX_CLOUD_BINARY": "/real/codex"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.calls = []

        def fake_sh(args, cwd=None, timeout=600, env=None, log=None):
            self.calls.append(list(args))
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        self.real_sh = self.runner.sh
        self.runner.sh = fake_sh

    def tearDown(self):
        self.runner.sh = self.real_sh
        self.runner.next_provider, self.runner.context_pack = self.real_next, self.real_pack

    def test_disabled_by_default_runs_the_local_lane_with_zero_cloud_side_effects(self):
        with patch.dict(os.environ, {"LANES_CLOUD_ENABLED": ""}):
            self.runner.verify_and_land = lambda *a, **k: {"verdict": "landing", "pr": 9, "reasons": []}
            receipt = self.runner.run_issue(self.host, "devin", {"cmd": ["true"]}, self.linear_fixture([]),
                                     self.issue_fixture("JOV-10357", labels=["cloud-lane"]))
            self.assertEqual(receipt["verdict"], "landing")
        self.assertFalse(self.ledger.exists(), "no cloud ledger write while disabled")
        self.assertFalse(any("/real/codex" in " ".join(c) for c in self.calls),
                         "the pinned cloud binary is never invoked while disabled")

    def test_opted_in_issue_submits_to_cloud_and_stays_pending(self):
        submitted = subprocess.CompletedProcess([], 0, "https://chatgpt.com/codex/tasks/task_abc12345\n", "")
        with patch.object(self.runner.cloud_lane, "ls_remote_main", lambda *a, **k: "f" * 40), \
                patch.object(self.runner.cloud_lane, "stream_run", lambda *a, **k: submitted):
            receipt = self.runner.run_issue(self.host, "devin", {"cmd": ["true"]}, self.linear_fixture([]),
                                     self.issue_fixture("JOV-10357", labels=["cloud-lane"]))
        self.assertEqual(receipt["verdict"], "cloud-pending")
        self.assertEqual(receipt["cloud"]["branch"], "cloud/jov-10357-task_abc")
        stages = [json.loads(line)["stage"] for line in self.ledger.read_text().splitlines()]
        self.assertEqual(stages, ["submitted", "cloud-pending"])
        self.assertFalse(any(c[:3] == ["git", "worktree", "add"] for c in self.calls),
                         "no worktree is taken for a cloud issue")

    def test_a_live_cloud_claim_blocks_every_provider_call(self):
        self.runner.cloud_lane.append({"issue": "JOV-10357", "task": "task_abc12345", "provider": "codex",
                                "stage": "cloud-pending", "reason": "submitted",
                                "repo": self.runner.cloud_lane.REPO, "env": "env_test",
                                "branch": "cloud/jov-10357-task_abc1", "baseSha": "f" * 40,
                                "fencingToken": "tok", "at": 1}, self.ledger)
        receipt = self.runner.run_issue(self.host, "devin", {"cmd": ["true"]}, self.linear_fixture([]),
                                 self.issue_fixture("JOV-10357", labels=["cloud-lane"]))
        self.assertEqual(receipt["verdict"], "cloud-pending")
        self.assertIn("cloud-claim-live", receipt["reasons"][0])
        self.assertFalse(any(c[:3] == ["git", "worktree", "add"] for c in self.calls))
        self.assertEqual(len(self.ledger.read_text().splitlines()), 1)

    def test_publish_verified_and_gate_pr_refuse_cloud_origin(self):
        cloud = {"number": 7, "headRefName": "cloud/jov-1-task_abc1", "headRefOid": "abc",
                 "isDraft": True, "url": "https://github.com/JovieInc/Jovie/pull/7",
                 "labels": []}
        path = self.host.state / "verified.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"7:abc": self.proof_fixture("abc")}))
        with patch.object(self.runner, "sh", side_effect=lambda *a, **k: (_ for _ in ()).throw(
                AssertionError("no gh call for a cloud PR"))):
            self.assertEqual(self.runner.publish_verified(self.host, cloud),
                             "held:cloud-origin-draft-only")
        seen = []
        with patch.object(self.runner, "sensitive_review", side_effect=seen.append):
            verdict = self.runner.gate_pr(self.host, cloud, self.host.state / "wt", log=None)
        self.assertEqual((verdict["verdict"], verdict["reasons"][0]),
                         ("held", "cloud-origin-draft-only"))
        self.assertEqual(seen, [], "a cloud PR never reaches sensitive_review or llm-review")
        self.assertEqual(json.loads(path.read_text()), {"7:abc": self.proof_fixture("abc")},
                         "the guard leaves even a stale pre-existing receipt untouched")

    def test_adoption_repair_and_reclaim_skip_cloud_drafts(self):
        cloud = {"number": 7, "headRefName": "cloud/jov-1-task_abc1", "headRefOid": "abc",
                 "isDraft": True, "labels": [], "updatedAt": self.runner.now_iso(),
                 "createdAt": "2020-01-01T00:00:00Z", "statusCheckRollup": [], "eventKinds": []}
        self.assertEqual(self.runner.fix_red_pr(self.host, "devin", {}, cloud)["reasons"],
                         ["cloud-origin-draft-only"])
        self.assertFalse((self.host.state / "locks" / "repair-pr-7.lock").exists())
        adopted = self.runner.adopt_pr(self.host, "devin", cloud)
        self.assertEqual((adopted["verdict"], adopted["reasons"]), ("skipped", ["cloud-origin-draft-only"]))
        with patch.object(self.runner.pr_events, "abandoned_agent_draft", return_value=True):
            kept = self.runner.reclaimable_drafts(inventory=[cloud, {"number": 8, "isCrossRepository": False,
                                                              "headRefName": "devin/jov-1-1",
                                                              "isDraft": True, "labels": []}])
        self.assertEqual([row["number"] for row in kept], [8])


    def test_cloud_worker_retains_pending_overlap_and_blocks_epic_execution(self):
        from unittest.mock import Mock
        dispatch = self.runner.cloud_lane_dispatch
        task = self.issue_fixture("JOV-10357", labels=["cloud-lane"])
        self.runner.cloud_lane.append({"issue": task.identifier, "stage": "cloud-held",
                                       "reason": "unknown-submit-outcome", "at": 1}, self.ledger)
        runner = SimpleNamespace(epics=SimpleNamespace(is_epic=Mock(return_value=True),
                                                       run_epic=Mock()),
                                 run_issue=Mock(return_value={"verdict": "cloud-pending"}),
                                 file_overlap=SimpleNamespace(release_task=Mock()))
        receipt = dispatch.execute_claimed_issue(runner, self.host, "devin", {}, None, task)
        self.assertEqual(receipt["verdict"], "cloud-pending")
        runner.epics.run_epic.assert_not_called()
        runner.run_issue.assert_called_once_with(self.host, "devin", {}, None, task)
        runner.file_overlap.release_task.assert_not_called()
        runner.run_issue.return_value = {"verdict": "cloud-held"}
        dispatch.execute_claimed_issue(runner, self.host, "devin", {}, None, task)
        runner.file_overlap.release_task.assert_called_once_with(self.host.state, task.identifier)

    def test_noncloud_epic_and_failed_execution_release_overlap(self):
        from unittest.mock import Mock
        task = self.issue_fixture()
        runner = SimpleNamespace(epics=SimpleNamespace(is_epic=Mock(return_value=True),
                                                       run_epic=Mock(return_value={"verdict": "done"})),
                                 run_issue=Mock(side_effect=RuntimeError("execution failed")),
                                 file_overlap=SimpleNamespace(release_task=Mock()))
        with patch.dict(os.environ, {"LANES_CLOUD_ENABLED": ""}):
            receipt = self.runner.cloud_lane_dispatch.execute_claimed_issue(
                runner, self.host, "devin", {}, None, task)
        self.assertEqual(receipt["verdict"], "done")
        runner.epics.run_epic.assert_called_once_with(runner, self.host, "devin", {}, None,
                                                     task, self.host.repo)
        runner.run_issue.assert_not_called()
        runner.epics.is_epic.return_value = False
        runner.file_overlap.release_task.reset_mock()
        with self.assertRaisesRegex(RuntimeError, "execution failed"):
            self.runner.cloud_lane_dispatch.execute_claimed_issue(
                runner, self.host, "devin", {}, None, task)
        runner.file_overlap.release_task.assert_called_once_with(self.host.state, task.identifier)

    def test_retained_dispositions_release_slot_without_returning_issue_to_pool(self):
        from unittest.mock import Mock
        task = self.issue_fixture()
        linear, slot = self.linear_fixture([]), Mock()
        dispatch = self.runner.cloud_lane_dispatch
        for verdict in self.runner.cloud_lane.RETAINED_VERDICTS:
            receipt = {"verdict": verdict, "reasons": ["held_sensitive"],
                       "cloud": {"paths": ["secrets.txt"]}}
            self.assertTrue(dispatch.retain_disposition(linear, task, receipt, slot))
        self.assertEqual(slot.release.call_count, 3)
        self.assertEqual(linear.moves, [])
        self.assertEqual(len(linear.comments), 1)
        self.assertIn("secrets.txt", linear.comments[0][1])
        slot.reset_mock()
        self.assertFalse(dispatch.retain_disposition(linear, task, {"verdict": "failed"}, slot))
        slot.release.assert_not_called()

    def test_reconciliation_turn_is_dormant_and_preserves_worker_after_failure(self):
        import io
        dispatch = self.runner.cloud_lane_dispatch
        with patch.object(self.runner.cloud_lane, "reconcile") as reconcile:
            with patch.dict(os.environ, {"LANES_CLOUD_ENABLED": ""}):
                dispatch.reconcile_turn(self.host)
            reconcile.assert_not_called()
            self.assertFalse(self.ledger.exists())
            dispatch.reconcile_turn(self.host)
            reconcile.assert_called_once_with(repo_dir=self.host.repo)
            reconcile.side_effect = RuntimeError("unavailable")
            with patch("sys.stderr", new_callable=io.StringIO) as stderr:
                dispatch.reconcile_turn(self.host)
            self.assertIn("cloud reconcile failed: RuntimeError", stderr.getvalue())

    def test_execution_gate_keeps_ineligible_work_local_and_unknown_submissions_held(self):
        dispatch = self.runner.cloud_lane_dispatch
        for labels in ([], ["cloud-lane", "security"]):
            task = self.issue_fixture(labels=labels)
            self.assertIsNone(dispatch.execution_gate(self.runner, self.host, task,
                                                     self.linear_fixture([]), "devin", {}))
        task = self.issue_fixture(labels=["cloud-lane"])
        with patch.object(self.runner.cloud_lane, "route", return_value={"route": "gem"}):
            self.assertIsNone(dispatch.execution_gate(self.runner, self.host, task,
                                                     self.linear_fixture([]), "devin", {}))
        with patch.object(self.runner.cloud_lane, "route", return_value={
                "route": "held", "reason": "unknown-submit-outcome"}):
            receipt = dispatch.execution_gate(self.runner, self.host, task,
                                              self.linear_fixture([]), "devin", {})
        self.assertEqual(receipt["verdict"], "cloud-held")
        self.assertEqual(receipt["reason"], "unknown-submit-outcome")


class FakeLinear:
    def __init__(self, issues):
        self.issues, self.moves, self.comments, self.triaged = issues, [], [], []
        self.issue_state = {"name": "Todo", "type": "unstarted"}

    def gql(self, query, variables):
        # The issue-lookup used for terminal dispositions (pr_events.linear_issue).
        number = int(variables.get("n") or 0)
        issue_id = f"id-JOV-{number}"
        comments = [{"body": body} for iid, body in self.comments if iid == issue_id]
        node = {"id": issue_id, "state": self.issue_state, "comments": {"nodes": comments}}
        return {"issues": {"nodes": [] if self.missing_issue(number) else [node]}}

    def missing_issue(self, number):
        return number in getattr(self, "missing", set())

    def create_triage(self, title, description, dedupe=None):
        if dedupe and any(dedupe in open_title for open_title in getattr(self, "open_titles", [])):
            return "existing-id"
        self.triaged.append(title)
        return "triage-id"

    def lane_issues(self, label):
        return self.issues

    def move(self, issue_id, state):
        self.moves.append((issue_id, state))

    def state_of(self, issue_id):
        return getattr(self, "states", {}).get(issue_id, "Todo")

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))
