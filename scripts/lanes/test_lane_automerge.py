"""Publication merge-intent regressions; included in the lanes release suite."""
import concurrent.futures
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lane_runner as lane


class VerifiedAutomergeTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.host = lane.Host(state=Path(tmp.name))
        self.pr = dict(number=7, headRefOid="abc", headRefName="lane/jov-8939", title="change",
                       body="", state="OPEN", isDraft=False, autoMergeRequest=None,
                       isInMergeQueue=False, labels={"nodes": [], "pageInfo": {"hasNextPage": False}})
        self.calls = []
        self.variables = []
        self.failure = False
        self.log = io.StringIO()
        for mock in [patch.dict(os.environ, {"LANES_AUTOMERGE_MAX_PER_HOUR": "30"}),
                     patch.object(lane, "sh", side_effect=self.shell)]:
            mock.start()
            self.addCleanup(mock.stop)

    def shell(self, cmd, **kwargs):
        self.calls.append(cmd)
        if cmd[:3] == ["gh", "api", "graphql"]:
            out = json.dumps({"data": {"repository": {"pullRequest": self.pr}}})
        elif cmd[:3] == ["gh", "variable", "list"]:
            out = json.dumps(self.variables)
        else:
            out = ""
            if self.failure:
                raise OSError("transport failed")
        return SimpleNamespace(returncode=0, stdout=out, stderr="")

    def arm(self):
        lane.arm_verified_automerge(self.host, self.pr, log=self.log)

    def merges(self):
        return [cmd for cmd in self.calls if cmd[:3] == ["gh", "pr", "merge"]]

    def test_arms_once_per_head_and_persists_across_rerun(self):
        self.arm()
        self.arm()
        self.assertEqual(self.merges(), [["gh", "pr", "merge", "7", "--auto", "--squash",
                         "--match-head-commit", "abc", "--repo", lane.REPO_SLUG]])
        self.pr["headRefOid"] = "def"
        self.arm()
        self.assertEqual(len(self.merges()), 2)
        self.assertEqual(set(json.loads((self.host.state / "automerge.json").read_text())["attempts"]),
                         {"7:abc", "7:def"})

    def test_concurrent_publishers_reserve_only_one_attempt(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: self.arm(), range(8)))
        self.assertEqual(len(self.merges()), 1)

    def test_ready_precedes_arming(self):
        live = {**self.pr, "isDraft": True, "labels": []}
        claim = SimpleNamespace(lock=SimpleNamespace(held=True), pr=live)
        real_shell = self.shell
        def shell(cmd, **kwargs):
            if cmd[:3] == ["gh", "pr", "ready"]:
                self.assertEqual(self.merges(), [])
            return real_shell(cmd, **kwargs)
        with patch.object(lane, "successful_gate", return_value={"sensitive": False}), \
                patch.object(lane, "require_gate_authority", return_value=live), \
                patch.object(lane, "claimed_elsewhere", return_value=False), \
                patch.object(lane, "source_publication_authority", return_value=None), \
                patch.object(lane, "sh", side_effect=shell):
            self.assertEqual(lane.publish_verified(self.host, live, claim=claim, log=self.log), "landing")
        self.assertEqual(len(self.merges()), 1)
        self.assertLess(next(i for i, c in enumerate(self.calls) if c[:3] == ["gh", "pr", "ready"]),
                        next(i for i, c in enumerate(self.calls) if c[:3] == ["gh", "pr", "merge"]))

    def test_skips_armed_queued_and_every_enroll_hold(self):
        holds = json.loads((lane.HERE.parent / "lib/admission-hold-labels.json").read_text())
        for field, value in [("autoMergeRequest", {"enabledAt": "now"}), ("isInMergeQueue", True)]:
            with self.subTest(field=field):
                old = self.pr[field]
                self.pr[field] = value
                self.arm()
                self.pr[field] = old
        for label in holds["stopHoldLabels"] + holds["machineBlockLabels"] + [holds["queuePoisonLabel"]]:
            self.pr["labels"]["nodes"] = [{"name": label}]
            self.arm()
        self.assertEqual(self.merges(), [])
        self.assertFalse((self.host.state / "automerge.json").exists())

    def test_linear_key_may_be_in_branch_title_or_body(self):
        self.pr["headRefName"] = "lane/change"
        self.arm()
        self.assertIn("no-linear-key", self.log.getvalue())
        self.assertEqual(self.merges(), [])
        for index, field in enumerate(("title", "body", "headRefName")):
            self.pr[field] = "Related LYB-42"
            self.pr["headRefOid"] = str(index)
            self.arm()
            self.pr[field] = "change"
        self.assertEqual(len(self.merges()), 3)

    def test_cap_is_rolling_and_zero_disables_even_reads(self):
        with patch.dict(os.environ, {"LANES_AUTOMERGE_MAX_PER_HOUR": "1"}):
            with patch.object(lane.time, "time", return_value=10000):
                self.arm()
            self.pr["headRefOid"] = "new"
            with patch.object(lane.time, "time", return_value=13599):
                self.arm()
            self.assertEqual(len(self.merges()), 1)
            self.assertIn("hourly-cap", self.log.getvalue())
            with patch.object(lane.time, "time", return_value=13600):
                self.arm()
            self.assertEqual(len(self.merges()), 2)
        self.calls.clear()
        with patch.dict(os.environ, {"LANES_AUTOMERGE_MAX_PER_HOUR": "0"}):
            self.arm()
        self.assertEqual(self.calls, [])

    def test_freeze_stale_head_and_incomplete_evidence_skip(self):
        self.variables = [{"name": "QUEUE_FREEZE", "value": "1"}]
        self.arm()
        self.variables = []
        stale = {**self.pr, "headRefOid": "old"}
        lane.arm_verified_automerge(self.host, stale, log=self.log)
        self.pr["labels"]["pageInfo"]["hasNextPage"] = True
        self.arm()
        self.assertEqual(self.merges(), [])

    def test_failed_attempt_is_not_retried_and_publication_still_lands(self):
        self.failure = True
        live = {**self.pr, "labels": []}
        claim = SimpleNamespace(lock=SimpleNamespace(held=True), pr=live)
        with patch.object(lane, "successful_gate", return_value={"sensitive": False}), \
                patch.object(lane, "require_gate_authority", return_value=live), \
                patch.object(lane, "claimed_elsewhere", return_value=False), \
                patch.object(lane, "source_publication_authority", return_value=None):
            self.assertEqual(lane.publish_verified(self.host, live, claim=claim, log=self.log), "landing")
            self.assertEqual(lane.publish_verified(self.host, live, claim=claim, log=self.log), "landing")
        self.assertEqual(len(self.merges()), 1)
        self.assertIn("transport failed", self.log.getvalue())
        self.assertEqual(json.loads((self.host.state / "requeue.json").read_text()), {})

    def test_nonzero_commands_and_closed_log_never_raise(self):
        for command in (["gh", "api", "graphql"], ["gh", "variable", "list"], ["gh", "pr", "merge"]):
            with self.subTest(command=command):
                self.calls.clear()
                (self.host.state / "automerge.json").unlink(missing_ok=True)
                real_shell = self.shell
                def shell(cmd, **kwargs):
                    result = real_shell(cmd, **kwargs)
                    if cmd[:3] == command:
                        result.returncode = 1
                    return result
                with patch.object(lane, "sh", side_effect=shell):
                    self.arm()
                self.assertIn("arm-failed" if command[-1] == "merge" else "arm-unavailable",
                              self.log.getvalue())
                if command[-1] != "merge":
                    self.assertEqual(self.merges(), [])
        self.log.close()
        self.arm()

    def test_corrupt_state_fails_closed_without_merge(self):
        (self.host.state / "automerge.json").write_text("invalid")
        self.arm()
        self.assertEqual(self.merges(), [])
        self.assertIn("arm-unavailable", self.log.getvalue())
