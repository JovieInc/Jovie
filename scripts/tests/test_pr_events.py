"""Regression tests for scripts/lanes/pr_events.py (event-driven PR repair, JOV-6672).

Run with:
    python3 -m pytest scripts/tests/test_pr_events.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import patch, Mock
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]


def load(name, alias=None):
    spec = importlib.util.spec_from_file_location(alias or name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[alias or name] = module
    spec.loader.exec_module(module)
    return module


events = load("pr_events")
# Its own module name: test_lane_runner.py's stubs live on sys.modules["lane_runner"].
runner = load("lane_runner", "lane_runner_under_pr_events_test")
PROVIDERS = {"devin": {"slots": 4}, "codex": {"slots": 3}, "claude": {"enabled": False},
             "hyperagent": {"enabled": False}}
NOW = 2_000_000_000.0


class Shell:
    """Canned `gh`: routes by argv prefix, records every call."""
    def __init__(self, routes=None):
        self.routes, self.calls = routes or {}, []

    def __call__(self, args, cwd=None, timeout=600, env=None, log=None, stream=False):
        self.calls.append(args)
        for prefix, reply in self.routes.items():
            if tuple(args[:len(prefix)]) == prefix:
                reply = reply(args) if callable(reply) else reply
                code, out = reply if isinstance(reply, tuple) else (0, reply)
                return SimpleNamespace(returncode=code, stdout=out if isinstance(out, str) else json.dumps(out), stderr="")
        if len(args) > 1 and Path(args[1]).name == "source_admission.mjs":
            out = {"schema": "jovie-source-admission/v1", "allowed": True, "blockers": [],
                   "prNumber": int(args[-2]), "headSha": args[-1]}
        elif "check-reenroll" in args:
            out = {"number": int(args[-1]), "reenrollable": True}
        else:
            out = None
        return SimpleNamespace(returncode=0, stdout=json.dumps(out) if out else "", stderr="")

    def made(self, *prefix):
        return [call for call in self.calls if tuple(call[:len(prefix)]) == prefix]


def fake_lane(shell, claimed=False):
    posted = []
    module = SimpleNamespace(
        sh=shell, REPO_SLUG=runner.REPO_SLUG, PR_FIELDS=runner.PR_FIELDS, RED=runner.RED,
        MAX_FIX_ATTEMPTS=runner.MAX_FIX_ATTEMPTS, held_path=runner.held_path, update_json=runner.update_json,
        now_iso=runner.now_iso, best_per_issue=runner.best_per_issue, load_providers=lambda: PROVIDERS,
        claimed_elsewhere=lambda number, sha, kind, **kwargs: claimed, post_claim=lambda number, sha, kind: posted.append(number),
        publication_revocation=runner.publication_revocation,
        reconcile_fix_target=lambda pr: {**pr, "state": "OPEN"})
    def publish(host, target):
        # Exercise the actual common consumer with this fixture's external boundaries.
        with patch.object(runner, 'sh', shell), patch.object(runner, 'claimed_elsewhere', return_value=claimed), \
             patch.object(runner, 'reconcile_fix_target', side_effect=lambda pr: {**pr, 'state': 'OPEN'}):
            return runner.publish_verified(host, target)
    module.publish_verified = publish
    module.posted = posted
    module.pruned = []
    module.prune_held = lambda host, prs, now, complete=False: module.pruned.append(complete)
    return module


def pr(number=5, branch="devin/jov-1-20260926t0900", sha="h1", draft=False, merge="BLOCKED", kinds=(), checks=(),
       labels=None, **extra):
    return {"number": number, "headRefName": branch, "headRefOid": sha, "isDraft": draft, "mergeStateStatus": merge,
            "statusCheckRollup": list(checks), "eventKinds": list(kinds), "url": f"https://x/pull/{number}",
            "labels": [{"name": name} for name in (labels or [])], "isCrossRepository": False,
            "isInMergeQueue": False, **extra}


def retirement_page(pr, **overrides):
    live = {**pr, "state": "OPEN", "isInMergeQueue": False,
            "labels": {"pageInfo": {"hasNextPage": False}, "nodes": pr["labels"]}, **overrides}
    return {"data": {"repository": {"pullRequest": live}}}


RED_CHECK = {"name": "ci", "status": "COMPLETED", "conclusion": "FAILURE"}


class ReasonTest(unittest.TestCase):
    def test_every_gate_reason_gets_a_code_and_a_next_action(self):
        self.assertEqual(events.held_reason(["check-failed:bash scripts/hooks", "error: x"]), ("gate-check-failed", "fix-loop"))
        self.assertEqual(events.held_reason(["gate-timeout:x3"]), ("gate-timeout", "regate"))
        self.assertEqual(events.held_reason(["code-change-without-test"]), ("missing-test", "fix-loop"))
        self.assertEqual(events.held_reason(["diff-too-large:2000"]), ("diff-too-large", "bug-intake"))
        self.assertEqual(events.held_reason([]), ("unclassified", "fix-loop"))

    def test_the_most_severe_reason_names_the_record(self):
        self.assertEqual(events.held_reason(["code-change-without-test", "secret-like-file-changed"])[0], "secret-file")
        record = events.held_record("h1", ["check-failed:x"] + [f"line {n}" for n in range(100)], at=5)
        self.assertEqual((record["reason"], record["next_action"], record["at"], len(record["evidence"])),
                         ("gate-check-failed", "fix-loop", 5, 60))

    def test_failed_runs_carry_a_reason_and_whether_they_retry(self):
        self.assertEqual(events.failure_reason({"verdict": "failed", "reasons": ["timeout:devin"]}, False),
                         {"reason": "agent-timeout", "next_action": "retry-after-backoff"})
        self.assertEqual(events.failure_reason({"verdict": "no-change", "reasons": ["no-pr-and-no-commits"]}, True),
                         {"reason": "no-change", "next_action": "backlog-disposition"})
        self.assertEqual(events.failure_reason({"verdict": "held", "reasons": ["code-change-without-test"]}, False)["reason"],
                         "missing-test")
        self.assertEqual(events.failure_reason({"verdict": "failed"}, False)["reason"], "failed")

    def test_held_counts_classify_legacy_records_and_skip_closed_prs(self):
        held = {"1": {"sha": "a", "evidence": ["gate-timeout:x3"]}, "2": {"sha": "b", "reason": "missing-test"},
                "3": {"sha": "c", "evidence": ["check-failed:x"]}}
        self.assertEqual(events.by_reason(held), {"gate-check-failed": 1, "gate-timeout": 1, "missing-test": 1})
        self.assertEqual(events.by_reason(held, {2, 3}), {"gate-check-failed": 1, "missing-test": 1})


class RetirementAuthorityTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = SimpleNamespace(state=Path(self.tmp.name), name="gem")

    def test_explicit_duplicate_is_revalidated_before_close(self):
        candidate = pr(labels=["duplicate"])
        shell = Shell({("gh", "api", "graphql"): retirement_page(candidate)})
        self.assertTrue(events.close_duplicate(fake_lane(shell), candidate, "source already landed", host=self.host, now=NOW))
        self.assertEqual(len(shell.made("gh", "pr", "close")), 1)

    def test_revoked_or_unreadable_authority_preserves_branch(self):
        candidate = pr(labels=["duplicate"])
        cases = [({}, "unreadable"),
                 (retirement_page(candidate, headRefOid="new-head"), "head moved"),
                 (retirement_page(candidate, headRefName="other-branch"), "branch moved"),
                 (retirement_page(candidate, state="MERGED"), "already merged"),
                 (retirement_page(candidate, isInMergeQueue=True), "queued"),
                 (retirement_page(candidate, isCrossRepository=True), "fork"),
                 (retirement_page(candidate, labels={"nodes": [], "pageInfo": {"hasNextPage": False}}),
                  "duplicate label revoked"),
                 (retirement_page(candidate, labels={"nodes": [{"name": "duplicate"}, {"name": "hold"}],
                                                     "pageInfo": {"hasNextPage": False}}), "hold added"),
                 (retirement_page(candidate, labels={"nodes": [{"name": "duplicate"}],
                                                     "pageInfo": {"hasNextPage": True}}), "incomplete labels")]
        for response, why in cases:
            with self.subTest(why=why):
                shell = Shell({("gh", "api", "graphql"): response})
                self.assertFalse(events.close_duplicate(fake_lane(shell), candidate, "stale", host=self.host, now=NOW))
                self.assertEqual(shell.made("gh", "pr", "close"), [])
        for overrides in ({"labels": []}, {"labels": [{"name": "duplicate"}, {"name": "gated"}]},
                          {"isInMergeQueue": True}, {"isCrossRepository": True}, {"state": "CLOSED"}):
            shell = Shell()
            self.assertFalse(events.close_duplicate(fake_lane(shell), {**candidate, **overrides}, "stale", host=self.host, now=NOW))
            self.assertEqual(shell.calls, [])

    def test_explicit_duplicate_cannot_override_state_changed_during_authority_read(self):
        candidate = pr(labels=["duplicate"])
        for record in ({"sha": "h1", "count": 2},
                       {"sha": "h1", "count": 1, "at": NOW - 1}):
            with self.subTest(record=record):
                attempts = self.host.state / "fix-attempts.json"
                attempts.write_text("{}")
                def read(args):
                    attempts.write_text(json.dumps({"5": record}))
                    return retirement_page(candidate)
                shell = Shell({("gh", "api", "graphql"): read})
                self.assertFalse(events.close_duplicate(fake_lane(shell), candidate, "duplicate",
                                                        host=self.host, now=NOW))
                self.assertEqual(shell.made("gh", "pr", "close"), [])
                self.assertEqual(json.loads(attempts.read_text()), {"5": record})

    def test_explicit_duplicate_respects_fresh_foreign_owner(self):
        candidate = pr(labels=["duplicate"])
        shell = Shell({("gh", "api", "graphql"): retirement_page(candidate)})
        self.assertFalse(events.close_duplicate(fake_lane(shell, claimed=True), candidate, "duplicate",
                                                host=self.host, now=NOW))
        self.assertEqual(shell.made("gh", "pr", "close"), [])

    def test_rejected_close_does_not_return_work_to_the_pool(self):
        candidate = pr(labels=["duplicate"])
        shell = Shell({("gh", "api", "graphql"): retirement_page(candidate),
                       ("gh", "pr", "close"): (1, "rejected")})
        linear = SimpleNamespace(gql=lambda *a: self.fail("failed retirement must preserve issue state"))
        self.assertFalse(events.return_to_pool(fake_lane(shell), linear, candidate, "duplicate", host=self.host, now=NOW))

    def test_refused_or_failed_retirement_reports_preserved_source(self):
        candidate = pr(draft=True, labels=["duplicate"], updatedAt="2020-01-01T00:00:00Z")
        newer = pr(number=6, draft=False, merge="CLEAN")
        for response, close_code in ((retirement_page(candidate, headRefOid="moved"), 0),
                                     (retirement_page(candidate), 1)):
            with self.subTest(close_code=close_code):
                shell = Shell({("gh", "api", "graphql"): response,
                               ("gh", "pr", "close"): (close_code, "refused")})
                with patch.object(events, "open_prs_state", return_value=[candidate, newer]):
                    record = events.reconcile(self.host, fake_lane(shell), lambda: None, NOW, force=True)
                self.assertEqual(record["closed"], [])
                row = next(row for row in record["dispositions"] if row["pr"] == 5)
                self.assertEqual(row["state"], "hold:retirement-unavailable")
                self.assertNotIn("closed this sweep", row["next"])

    def test_disabled_provider_and_done_issue_do_not_grant_authority(self):
        candidate = pr(branch="claude/jov-9-20260926t0100")
        shell = Shell()
        linear = SimpleNamespace(gql=lambda *a: {"issues": {"nodes": [
            {"id": "issue", "state": {"type": "completed", "name": "Done"}}]}})
        self.assertEqual(events.retire_orphan(fake_lane(shell), linear, candidate, [candidate], host=self.host, now=NOW), "adopted")
        self.assertEqual(shell.made("gh", "pr", "close"), [])


class ParkedRequeueTest(unittest.TestCase):
    """JOV-7708: parked work past 48h sends its issue back to rebuild from main. The PR stays
    open; only an explicit duplicate label retires it (JOV-INV-011)."""
    OLD = "2033-05-10T00:00:00Z"  # created eight days before NOW

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = SimpleNamespace(state=Path(self.tmp.name), name="mac")

    def parked(self, number=5, labels=("lane-fix-exhausted",), branch="devin/jov-7-20261001t0900", **extra):
        return pr(number=number, branch=branch, labels=list(labels), createdAt=self.OLD,
                  updatedAt=self.OLD, title="fix: thing", **extra)

    def events_since(self, hours, label="lane-fix-exhausted"):
        at = datetime.fromtimestamp(NOW - hours * 3600, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return f"lane-fix-conflict\t2033-05-01T00:00:00Z\n{label}\t{at}\n"

    def linear(self, state="started"):
        calls = []
        def gql(query, variables):
            calls.append((query, variables))
            if "issues(filter" in query:
                return {"issues": {"nodes": [{"id": "issue-7", "state": {"type": state, "name": state}}]}}
            if "issueLabels" in query:
                return {"issueLabels": {"nodes": [{"id": "label-agent-ready"}]}}
            return {}
        moved, comments = [], []
        return SimpleNamespace(gql=gql, calls=calls, moved=moved, comments=comments,
                               move=lambda issue_id, state_name: moved.append((issue_id, state_name)),
                               comment=lambda issue_id, body: comments.append((issue_id, body)))

    def test_only_unheld_unrequeued_agent_owned_parked_prs_older_than_48h_are_candidates(self):
        young = pr(number=6, labels=["lane-fix-exhausted"], createdAt="2033-05-17T00:00:00Z")
        keep = [young,
                self.parked(7, labels=("lane-fix-exhausted", "hold")),
                self.parked(8, labels=("lane-fix-conflict",)),
                self.parked(9, branch="feat/founder-work"),
                self.parked(10, isCrossRepository=True),
                self.parked(11, isInMergeQueue=True),
                self.parked(13, labels=("lane-fix-exhausted", events.REBUILD_LABEL))]
        take = [self.parked(5), self.parked(12, labels=("queue-poison",), branch="cursor/agent-fix-ab12")]
        self.assertEqual([row["number"] for row in events.parked_candidates(keep + take, NOW)], [5, 12])

    def test_parked_since_uses_the_latest_labeling_of_each_parked_label(self):
        out = ("lane-fix-exhausted\t2033-05-01T00:00:00Z\nqueue-poison\t2033-05-16T00:00:00Z\n"
               "lane-fix-exhausted\t2033-05-15T00:00:00Z\nhold\t2033-05-02T00:00:00Z\n")
        shell = Shell({("gh", "api", "--paginate"): out})
        self.assertEqual(events.parked_since(5, {"lane-fix-exhausted", "queue-poison"}, shell),
                         events.iso_ts("2033-05-15T00:00:00Z"))
        self.assertEqual(events.parked_since(5, {"queue-poison"}, shell), events.iso_ts("2033-05-16T00:00:00Z"))
        self.assertIsNone(events.parked_since(5, {"lane-fix-exhausted"}, Shell({("gh", "api", "--paginate"): (1, "")})))

    def test_issue_identity_comes_from_lane_branch_head_or_title(self):
        self.assertEqual(events.pr_issue({"headRefName": "devin/jov-7-20261001t0900"}), "JOV-7")
        self.assertEqual(events.pr_issue({"headRefName": "cursor/jov-7580-nav-857c"}), "JOV-7580")
        self.assertEqual(events.pr_issue({"headRefName": "codex/x", "title": "fix(nav): thing (JOV-12)"}), "JOV-12")
        self.assertIsNone(events.pr_issue({"headRefName": "codex/x", "title": "fix thing"}))

    def test_sweep_requeues_the_issue_and_never_closes_the_pr(self):
        candidate = self.parked()
        shell = Shell({("gh", "api", "graphql"): retirement_page(candidate),
                       ("gh", "api", "--paginate"): self.events_since(60)})
        linear = self.linear()
        with patch.object(events, "open_prs_state", return_value=[candidate]):
            record = events.reconcile(self.host, fake_lane(shell), lambda: linear, NOW, force=True)
        self.assertEqual(record["parkedRequeued"], [5])
        self.assertEqual(record["closed"], [])
        self.assertEqual(shell.made("gh", "pr", "close"), [], "JOV-INV-011: age and exhaustion never close")
        labeled = shell.made("gh", "api", "-X", "POST", "repos/JovieInc/Jovie/issues/5/labels")
        self.assertEqual(labeled[0][-1], f"labels[]={events.REBUILD_LABEL}")
        self.assertIn("this PR stays open", shell.made("gh", "pr", "comment")[0][-1])
        self.assertEqual(linear.moved, [("issue-7", "Todo")])
        self.assertTrue(any("issueAddLabel" in query and variables["l"] == "label-agent-ready"
                            for query, variables in linear.calls))
        self.assertIn("Rebuild from current main", linear.comments[0][1])
        row = next(row for row in record["dispositions"] if row["pr"] == 5)
        self.assertNotEqual(row["state"], "closing")
        self.assertIn("issue requeued", row["reason"])
        self.assertIn('"kind": "parked-requeue"', (self.host.state / "runs" / "ledger.jsonl").read_text())

    def test_a_requeued_pr_is_not_requeued_again(self):
        candidate = self.parked(labels=("lane-fix-exhausted", events.REBUILD_LABEL))
        shell = Shell({("gh", "api", "graphql"): retirement_page(candidate),
                       ("gh", "api", "--paginate"): self.events_since(60)})
        linear = self.linear()
        with patch.object(events, "open_prs_state", return_value=[candidate]):
            record = events.reconcile(self.host, fake_lane(shell), lambda: linear, NOW, force=True)
        self.assertEqual(record["parkedRequeued"], [])
        self.assertEqual(linear.moved, [])

    def test_inside_48h_or_kill_switch_nothing_happens(self):
        candidate = self.parked()
        for hours, env in ((47, {}), (60, {"LANES_PARKED_REQUEUE": "0"})):
            with self.subTest(hours=hours, env=env):
                shell = Shell({("gh", "api", "graphql"): retirement_page(candidate),
                               ("gh", "api", "--paginate"): self.events_since(hours)})
                linear = self.linear()
                with patch.dict(os.environ, env), patch.object(events, "open_prs_state", return_value=[candidate]):
                    record = events.reconcile(self.host, fake_lane(shell), lambda: linear, NOW, force=True)
                self.assertEqual(record["parkedRequeued"], [])
                self.assertEqual(linear.moved, [])
                self.assertEqual(shell.made("gh", "pr", "close"), [])

    def test_live_revalidation_and_repair_claims_leave_everything_as_is(self):
        candidate = self.parked()
        nodes = lambda *names: {"nodes": [{"name": n} for n in names], "pageInfo": {"hasNextPage": False}}
        cases = [({}, False, "unreadable"),
                 (retirement_page(candidate, headRefOid="new-head"), False, "head moved"),
                 (retirement_page(candidate, state="CLOSED"), False, "closed"),
                 (retirement_page(candidate, isInMergeQueue=True), False, "queued"),
                 (retirement_page(candidate, labels=nodes("lane-fix-exhausted", "hold")), False, "hold added"),
                 (retirement_page(candidate, labels=nodes("lane-fix-conflict")), False, "unparked"),
                 (retirement_page(candidate), True, "foreign repair claim")]
        for response, claimed, why in cases:
            with self.subTest(why=why):
                shell = Shell({("gh", "api", "graphql"): response})
                linear = self.linear()
                self.assertFalse(events.requeue_parked(fake_lane(shell, claimed=claimed), linear, candidate,
                                                       NOW - 60 * 3600, [candidate], host=self.host, now=NOW))
                self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])
                self.assertEqual(linear.moved, [])
        (self.host.state / "fix-attempts.json").write_text(json.dumps({"5": {"sha": "h1", "count": 1, "at": NOW - 60}}))
        shell = Shell({("gh", "api", "graphql"): retirement_page(candidate)})
        linear = self.linear()
        self.assertFalse(events.requeue_parked(fake_lane(shell), linear, candidate, NOW - 60 * 3600,
                                               [candidate], host=self.host, now=NOW), "local repair in flight")
        self.assertEqual(linear.moved, [])

    def test_done_issue_or_sibling_pr_is_not_requeued(self):
        candidate = self.parked()
        sibling = pr(number=9, branch="codex/jov-7-20261002t0900")
        for linear, open_prs, why in ((self.linear(state="completed"), [candidate], "issue done"),
                                      (self.linear(), [candidate, sibling], "another PR carries the issue")):
            with self.subTest(why=why):
                shell = Shell({("gh", "api", "graphql"): retirement_page(candidate)})
                self.assertFalse(events.requeue_parked(fake_lane(shell), linear, candidate, NOW - 60 * 3600,
                                                       open_prs, host=self.host, now=NOW))
                self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])
                self.assertEqual(linear.moved, [])

    def test_pool_label_matches_the_runner_shared_label(self):
        self.assertEqual(events.POOL_LABEL, runner.SHARED_LABEL)


class RelayTest(unittest.TestCase):
    def test_empty_ci_association_resolves_one_exact_same_repo_head_then_deduplicates(self):
        sha = "a" * 40
        workflow = {"event": "pull_request", "conclusion": "failure", "head_sha": sha,
                    "head_branch": "codex/fix", "head_repository": {"full_name": events.REPO},
                    "pull_requests": []}
        candidate = {"number": 5, "state": "open",
                     "head": {"sha": sha, "ref": "codex/fix", "repo": {"full_name": events.REPO}},
                     "base": {"repo": {"full_name": events.REPO}}}
        view = pr(branch="codex/fix", sha=sha)
        shell = Shell({("gh", "api", f"repos/{events.REPO}/pulls"): [candidate],
                       ("gh", "pr", "view"): lambda args: view})
        payload = {"workflow_run": workflow}
        self.assertEqual(events.relay("workflow_run", payload, shell, set()), [(5, "red")])
        view["labels"] = [{"name": "lane-fix-red"}]
        self.assertEqual(events.relay("workflow_run", payload, shell, set()), [])
        self.assertEqual(len(shell.made("gh", "api", "-X", "POST")), 1)
        for candidates in ([], [None], {}, [candidate, candidate], [{**candidate, "state": "closed"}],
                           [{**candidate, "head": {**candidate["head"], "sha": "b" * 40}}],
                           [{**candidate, "base": {"repo": {"full_name": "other/repo"}}}]):
            rejected = Shell({("gh", "api", f"repos/{events.REPO}/pulls"): candidates})
            self.assertEqual(events.relay("workflow_run", payload, rejected, set()), [])
            self.assertEqual(rejected.made("gh", "pr", "view"), [])
        for changed in ({"head_repository": {"full_name": "fork/repo"}}, {"head_sha": "bad"},
                        {"head_branch": ""}, {"event": "push"}, {"conclusion": "cancelled"}):
            rejected = Shell()
            self.assertEqual(events.relay("workflow_run", {"workflow_run": {**workflow, **changed}},
                                          rejected, set()), [])
            self.assertEqual(rejected.calls, [])
        failed = Shell({("gh", "api", f"repos/{events.REPO}/pulls"): (1, "")})
        with self.assertRaisesRegex(RuntimeError, "cannot resolve"):
            events.relay("workflow_run", payload, failed, set())

    def test_ci_failure_and_success_on_a_pr_become_red_and_green(self):
        run = {"event": "pull_request", "conclusion": "failure", "head_sha": "h1", "pull_requests": [{"number": 5}]}
        self.assertEqual(events.relay_targets("workflow_run", {"workflow_run": run}), [(5, "red", "h1")])
        self.assertEqual(events.relay_targets("workflow_run", {"workflow_run": {**run, "conclusion": "success"}}),
                         [(5, "green", "h1")])
        self.assertEqual(events.relay_targets("workflow_run", {"workflow_run": {**run, "conclusion": "cancelled"}}), [])
        self.assertEqual(events.relay_targets("workflow_run", {"workflow_run": {**run, "event": "merge_group"}}), [])

    def test_queue_removal_and_review_feedback_are_relayed(self):
        base = {"pull_request": {"number": 7, "head": {"sha": "h7"}}}
        self.assertEqual(events.relay_targets("pull_request_target", {**base, "action": "dequeued"}), [(7, "dequeued", "h7")])
        for reason in ("MANUAL", "manual", "ALREADY_MERGED", "merged", "BRANCH_REMOVED"):
            self.assertEqual(events.relay_targets("pull_request_target", {**base, "action": "dequeued", "reason": reason}),
                             [], f"{reason} removal is not a code failure")
        self.assertEqual(events.relay_targets("pull_request_target", {**base, "action": "dequeued", "reason": "CI_FAILURE"}),
                         [(7, "dequeued", "h7")])
        review = {**base, "action": "submitted", "review": {"state": "CHANGES_REQUESTED", "user": {"type": "Bot"}}}
        self.assertEqual(events.relay_targets("pull_request_review", review), [(7, "review", None)])
        comment = {**review, "review": {"state": "commented", "body": "rename this", "user": {"login": "tim", "type": "User"}}}
        self.assertEqual(events.relay_targets("pull_request_review", comment), [(7, "review", None)])
        bot = {**review, "review": {"state": "commented", "body": "lgtm", "user": {"login": "coderabbitai[bot]"}}}
        self.assertEqual(events.relay_targets("pull_request_review", bot), [], "bot chatter never loops the fixer")
        self.assertEqual(events.relay_targets("pull_request_review", {**review, "review": {"state": "approved"}}), [])
        inline = {**base, "action": "created", "comment": {"user": {"login": "tim", "type": "User"}}}
        self.assertEqual(events.relay_targets("pull_request_review_comment", inline), [(7, "review", None)])
        self.assertEqual(events.relay_targets("pull_request_review_comment",
                                              {**inline, "comment": {"user": {"type": "Bot"}}}), [])
        self.assertEqual(events.relay_targets("issues", {}), [])

    def test_scope_is_lane_branches_and_ready_prs_never_forks_or_holds(self):
        disabled = {"claude", "hyperagent"}
        self.assertTrue(events.in_scope(pr(draft=True), "red", disabled))
        self.assertTrue(events.in_scope(pr(branch="tim/fix"), "red", disabled))
        self.assertFalse(events.in_scope(pr(branch="claude/focused-davinci-x", draft=True), "red", disabled),
                         "a human session's draft is not the lanes' work")
        self.assertFalse(events.in_scope(pr(isCrossRepository=True), "red", disabled))
        self.assertFalse(events.in_scope(pr(labels=["hold"]), "red", disabled))
        self.assertFalse(events.in_scope(pr(state="MERGED"), "red", disabled))
        self.assertTrue(events.in_scope(pr(draft=True), "green", disabled))
        self.assertFalse(events.in_scope(pr(branch="tim/fix", draft=True), "green", disabled))
        self.assertTrue(events.in_scope(pr(branch="claude/jov-9-20260926t0100", draft=True), "orphan", disabled))
        self.assertFalse(events.in_scope(pr(draft=True), "orphan", disabled))
        self.assertEqual(events.disabled_lanes(PROVIDERS), {"claude", "hyperagent"})
        # JOV-7706: claude repairs locally; remote-only Hyperagent's drafts stay orphan-maintained.
        self.assertNotIn("claude", events.disabled_lanes())
        self.assertIn("hyperagent", events.disabled_lanes())

    def test_relay_labels_only_the_current_head_once(self):
        view = {"state": "OPEN", "isDraft": False, "headRefName": "tim/fix", "headRefOid": "h1",
                "isCrossRepository": False, "labels": []}
        shell = Shell({("gh", "pr", "view"): view})
        run = {"event": "pull_request", "conclusion": "failure", "head_sha": "h1", "pull_requests": [{"number": 5}]}
        self.assertEqual(events.relay("workflow_run", {"workflow_run": run}, shell, set()), [(5, "red")])
        self.assertIn(["gh", "api", "-X", "POST", f"repos/{events.REPO}/issues/5/labels", "-f", "labels[]=lane-fix-red"],
                      shell.calls)
        stale = {**run, "head_sha": "old"}
        self.assertEqual(events.relay("workflow_run", {"workflow_run": stale}, shell, set()), [], "stale runs are ignored")
        labeled = Shell({("gh", "pr", "view"): {**view, "labels": [{"name": "lane-fix-red"}]}})
        self.assertEqual(events.relay("workflow_run", {"workflow_run": run}, labeled, set()), [])
        self.assertEqual(labeled.made("gh", "api"), [], "an already queued PR is not relabeled")
        missing = Shell({("gh", "pr", "view"): (1, "")})
        self.assertEqual(events.relay("workflow_run", {"workflow_run": run}, missing, set()), [])

        exhausted = Shell({("gh", "pr", "view"): {
            **view, "labels": [{"name": "lane-fix-exhausted"}],
        }})
        self.assertEqual(events.relay("workflow_run", {"workflow_run": run}, exhausted, set()), [])
        self.assertEqual(exhausted.made("gh", "api", "-X", "POST"), [],
                         "a terminal head never gets another repair signal")

    def test_a_second_failed_ejection_in_a_day_marks_the_pr_queue_poison(self):
        now = time.time()
        stamp = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - ago))
        view = {"state": "OPEN", "isDraft": False, "headRefName": "tim/fix", "headRefOid": "h7",
                "isCrossRepository": False, "labels": []}
        payload = {"action": "dequeued", "pull_request": {"number": 7, "head": {"sha": "h7"}}}

        def relay_with(removals, labels=()):
            shell = Shell({("gh", "pr", "view"): {**view, "labels": [{"name": n} for n in labels]},
                           ("gh", "api", "graphql"): lambda args: removals if '--jq' in args else
                           {"data": {"repository": {"pullRequest": {"headRefOid": "h7", "state": "OPEN", "timelineItems": {
                               "nodes": [{"__typename": "PullRequestCommit", "commit": {"oid": "h7"}}] +
                                        [{"__typename": "RemovedFromMergeQueueEvent", **item} for item in reversed(removals)],
                               "pageInfo": {"hasPreviousPage": False, "startCursor": None}}}}}}})
            return events.relay("pull_request_target", payload, shell, set()), shell

        added, shell = relay_with([{"createdAt": stamp(60), "reason": "failed_checks"},
                                   {"createdAt": stamp(3600), "reason": "MANUAL"},
                                   {"createdAt": stamp(30 * 3600), "reason": "failed_checks"}])
        self.assertEqual(added, [(7, "dequeued")], "one failure today plus a manual or old removal is not poison")
        added, shell = relay_with([{"createdAt": stamp(60), "reason": "failed_checks"},
                                   {"createdAt": stamp(7200), "reason": "failed_checks"}])
        self.assertEqual(added, [(7, "queue-poison"), (7, "dequeued")])
        self.assertEqual(len(shell.made("gh", "pr", "comment")), 1)
        added, shell = relay_with([{"createdAt": stamp(60), "reason": "failed_checks"}] * 3, labels=["queue-poison"])
        self.assertEqual(shell.made("gh", "pr", "comment"), [], "an already-poisoned PR is not re-announced")

    def test_a_repaired_head_is_not_poisoned_by_old_revision_ejections(self):
        removal = {"__typename": "RemovedFromMergeQueueEvent", "createdAt": "2033-05-18T03:32:20Z", "reason": "failed_checks"}
        old = {"__typename": "PullRequestCommit", "commit": {"oid": "old"}}
        new = {"__typename": "HeadRefForcePushedEvent", "afterCommit": {"oid": "h7"}}
        view = pr(7, branch="tim/fix", sha="h7", state="OPEN")
        nodes = [old, removal, removal, new, removal]
        page = {"data": {"repository": {"pullRequest": {"headRefOid": "h7", "state": "OPEN", "timelineItems": {
            "nodes": nodes, "pageInfo": {"hasPreviousPage": False, "startCursor": None}}}}}}
        shell = Shell({("gh", "pr", "view"): view, ("gh", "api", "graphql"):
                       lambda args: [removal] * 3 if '--jq' in args else page})
        with patch.object(events.time, "time", return_value=NOW):
            added = events.relay("pull_request_target", {"action": "dequeued", "pull_request": {"number": 7, "head": {"sha": "h7"}}}, shell, set())
        self.assertEqual(added, [(7, "dequeued")])
        self.assertEqual(shell.made("gh", "pr", "comment"), [])

    def test_relay_never_poisons_explicitly_held_work(self):
        view = pr(7, branch="tim/fix", sha="h7", state="OPEN", labels=["hold"])
        removal = {"createdAt": "2033-05-18T03:32:20Z", "reason": "failed_checks"}
        shell = Shell({("gh", "pr", "view"): view, ("gh", "api", "graphql"): [removal] * 2})
        with patch.object(events.time, "time", return_value=NOW):
            added = events.relay("pull_request_target", {"action": "dequeued", "pull_request": {"number": 7, "head": {"sha": "h7"}}}, shell, set())
        self.assertEqual(added, [])
        self.assertEqual(shell.made("gh", "api", "-X"), [])

    def test_revision_ejections_paginate_back_to_the_actual_head_boundary(self):
        removal = {"__typename": "RemovedFromMergeQueueEvent", "createdAt": "2033-05-18T03:32:20Z", "reason": "failed_checks"}
        def page(nodes, previous=False, cursor=None, **extra):
            return {"data": {"repository": {"pullRequest": {"headRefOid": "h7", "state": "OPEN", **extra,
                "timelineItems": {"nodes": nodes, "pageInfo": {"hasPreviousPage": previous, "startCursor": cursor}}}}}}
        replies = iter([page([removal], True, 'cursor"quoted'), page([
            {"__typename": "PullRequestCommit", "commit": {"oid": "h7"}}, removal])])
        def reply(args):
            query = next(arg[6:] for arg in args if arg.startswith('query='))
            self.assertEqual(query.count('{'), query.count('}'))
            return next(replies)
        shell = Shell({("gh", "api", "graphql"): reply})
        self.assertEqual(events.queue_ejections(7, NOW, shell, head="h7"), 2)
        self.assertIn('before:"cursor\\\"quoted"', shell.calls[1][-1])
        for response in [page([removal]), page([removal], True), page([removal], headRefOid="changed"),
                         {"errors": [{"message": "partial"}], **page([removal])}, 'malformed', (1, '')]:
            self.assertIsNone(events.queue_ejections(7, NOW, Shell({("gh", "api", "graphql"): response}), head="h7"))
        repeated = Shell({("gh", "api", "graphql"): page([removal], True, 'same')})
        self.assertIsNone(events.queue_ejections(7, NOW, repeated, head="h7"))
        self.assertEqual(len(repeated.calls), 2)

    def test_poison_mutation_rechecks_live_head_and_hold_after_history_reads(self):
        removal = {"__typename": "RemovedFromMergeQueueEvent", "createdAt": "2033-05-18T03:32:20Z", "reason": "failed_checks"}
        page = {"data": {"repository": {"pullRequest": {"headRefOid": "h7", "state": "OPEN", "timelineItems": {
            "nodes": [{"__typename": "PullRequestCommit", "commit": {"oid": "h7"}}, removal, removal],
            "pageInfo": {"hasPreviousPage": False, "startCursor": None}}}}}}
        initial = pr(7, branch="tim/fix", sha="h7", state="OPEN")
        for live in [{**initial, "headRefOid": "changed"}, {**initial, "labels": [{"name": "hold"}]},
                     {**initial, "state": "CLOSED"}, {**initial, "isCrossRepository": True}, (1, ''), 'malformed']:
            shell = Shell({("gh", "api", "graphql"): page, ("gh", "pr", "view"): live})
            self.assertFalse(events.mark_poison(7, initial, NOW, shell))
            self.assertEqual(shell.made("gh", "api", "-X"), [])

    def test_a_push_to_main_labels_newly_conflicting_prs_after_mergeability_settles(self):
        reads = iter([
            [{"number": 5, "headRefName": "tim/fix", "headRefOid": "h5", "isDraft": False,
              "mergeable": "UNKNOWN", "labels": []}],
            [{"number": 5, "headRefName": "tim/fix", "headRefOid": "h5", "isDraft": False,
              "mergeable": "CONFLICTING", "labels": []},
             {"number": 6, "headRefName": "tim/other", "headRefOid": "h6", "isDraft": False,
              "mergeable": "CONFLICTING", "labels": [{"name": "lane-fix-conflict"}]}],
        ])
        shell = Shell({("gh", "pr", "list"): lambda args: next(reads)})
        added = events.label_backlog(shell, set(), kinds=("conflict",), settle_s=0.01)
        self.assertEqual(added, [(5, "conflict")])
        self.assertEqual(len(shell.made("gh", "pr", "list")), 2)

    def test_conflict_detector_skips_terminal_and_claimed_heads(self):
        claimed_at = datetime.fromtimestamp(NOW - 60, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        terminal = pr(number=5, branch="tim/terminal", mergeable="CONFLICTING",
                      labels=["lane-fix-exhausted"])
        claimed = pr(number=6, branch="tim/claimed", sha="claimed-head", mergeable="CONFLICTING")
        claim_url = (f"repos/{events.REPO}/issues/6/comments?per_page=100&sort=created&direction=desc")
        shell = Shell({
            ("gh", "pr", "list"): [terminal, claimed],
            ("gh", "api", claim_url):
                f"🤖 lane claim kind=fix sha=claimed-head host=gem at={claimed_at}\n",
        })
        with patch.object(events.time, "time", return_value=NOW):
            added = events.label_backlog(shell, set(), kinds=("conflict",), settle_s=0)
        self.assertEqual(added, [])
        self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])

    def test_backfill_labels_green_lane_drafts_and_orphans(self):
        prs = [
            {"number": 1, "headRefName": "devin/jov-1-20260926t0900", "isDraft": True, "mergeStateStatus": "CLEAN"},
            {"number": 2, "headRefName": "claude/jov-2-20260926t0900", "isDraft": True, "mergeStateStatus": "BLOCKED"},
            {"number": 3, "headRefName": "claude/laughing-franklin", "isDraft": True, "mergeStateStatus": "CLEAN"},
        ]
        self.assertEqual(events.backlog_targets(prs, {"claude"}), [(1, "green"), (2, "orphan")])

    def test_main_ci_failure_opens_one_intake_issue_without_a_new_secret(self):
        run = {"name": "CI", "event": "push", "conclusion": "failure", "head_branch": "main",
               "head_sha": "abc", "pull_requests": [], "html_url": "https://example.test/run/1",
               "updated_at": "2026-10-02T00:00:00Z"}
        payload = {"workflow_run": run}
        event = events.remediation.non_pr_event("workflow_run", payload)
        shell = Shell({("gh", "issue", "list"): [],
                       ("gh", "issue", "create"): "https://github.com/JovieInc/Jovie/issues/4242\n"})
        added = events.relay("workflow_run", payload, shell, set())
        self.assertEqual(added, [(4242, "symphony-remediation")])
        self.assertIn(event["fingerprint"], " ".join(shell.made("gh", "issue", "create")[0]))
        again = Shell({("gh", "issue", "list"): [{
            "number": 4242, "body": events.remediation.intake_body(event),
            "updatedAt": "2026-10-02T00:00:00Z"}]})
        self.assertEqual(events.relay("workflow_run", payload, again, set()), [])
        self.assertEqual(again.made("gh", "issue", "create"), [])
        sentry = events.remediation.event_from_sentry({"issue_id": "S1", "message": "boom", "url": "https://s"})
        self.assertEqual((sentry["source"], sentry["ws"]), ("sentry", "reliability"))
        self.assertIsNone(events.remediation.event_from_sentry({}))

    def test_push_event_runs_the_conflict_read(self):
        shell = Shell({("gh", "pr", "list"): []})
        self.assertEqual(events.relay("push", {}, shell, set()), [])
        self.assertEqual(len(shell.made("gh", "pr", "list")), 1)

    def test_cli_relays_the_actions_event(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "event.json"
            path.write_text(json.dumps({"action": "opened"}))
            saved = dict(os.environ)
            os.environ.update(GITHUB_EVENT_NAME="pull_request_target", GITHUB_EVENT_PATH=str(path))
            try:
                self.assertEqual(events.main(["relay"]), 0)
                self.assertEqual(events.main(["nope"]), 2)
            finally:
                os.environ.clear()
                os.environ.update(saved)


class ClaimTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.host = SimpleNamespace(state=Path(self.tmp.name))
        proofs = {f"{n}:h1": {"schema": runner.GATE_RESULT_SCHEMA, "headSha": "h1", "verdict": "verified-not-queued",
                  "completedAt": runner.now_iso(), "policyDigest": runner.GATE_POLICY_DIGEST, "sensitive": False}
                  for n in (1, 5)}
        (self.host.state / "verified.json").write_text(json.dumps(proofs))

    def tearDown(self):
        self.tmp.cleanup()

    def attempts(self, value=None):
        path = self.host.state / "fix-attempts.json"
        if value is not None:
            path.write_text(json.dumps(value))
        return json.loads(path.read_text()) if path.exists() else {}

    def test_queue_is_one_search_and_carries_the_kinds(self):
        shell = Shell({("gh", "pr", "list"): [pr(labels=["lane-fix-red", "lane-fix-green", "other"])]})
        found = events.queued_prs(fake_lane(shell), events.FIX_KINDS)
        self.assertEqual(found[0]["eventKinds"], ["red"])
        search = shell.calls[0][shell.calls[0].index("--search") + 1]
        self.assertEqual(search, "label:lane-fix-red,lane-fix-conflict,lane-fix-dequeued,lane-fix-review,lane-fix-stale")
        self.assertEqual(events.queued_prs(fake_lane(Shell({("gh", "pr", "list"): (1, "")})), events.FIX_KINDS), [])

    def test_an_event_pr_is_claimed_first_recorded_and_retains_its_label(self):
        shell = Shell()
        lane = fake_lane(shell)
        runner.record_held(self.host, 5, "h1", ["check-failed:x", "boom"])
        claimed = events.claim_event_pr(self.host, lane, "devin", [pr(kinds=["red"], checks=[RED_CHECK])], NOW)
        self.assertEqual((claimed["number"], claimed["gateEvidence"][1]), (5, "boom"))
        self.assertEqual(self.attempts()["5"], {"sha": "h1", "count": 1, "lane": "devin", "at": NOW})
        self.assertEqual(lane.posted, [5])
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"), [],
                         "the repair signal remains until the worker publishes a new head")

    def test_an_unfixable_hold_retains_the_label_without_an_attempt(self):
        shell = Shell()
        runner.record_held(self.host, 5, "h1", ["diff-too-large:2000"])
        claimed = events.claim_event_pr(self.host, fake_lane(shell), "devin",
                                        [pr(kinds=["red"], checks=[RED_CHECK])], NOW)
        self.assertIsNone(claimed, "a hold no push clears (diff-too-large) never reaches the fix loop")
        self.assertEqual(self.attempts(), {})
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"), [])

    def test_a_fixable_hold_still_reaches_the_fix_loop(self):
        shell = Shell()
        lane = fake_lane(shell)
        runner.record_held(self.host, 5, "h1", ["code-change-without-test"])
        claimed = events.claim_event_pr(self.host, lane, "devin", [pr(kinds=["red"], checks=[RED_CHECK])], NOW)
        self.assertEqual(claimed["number"], 5)

    def test_labels_whose_pr_no_longer_needs_work_wait_for_bounded_cleanup(self):
        shell = Shell();module = fake_lane(shell)
        green = pr(kinds=["red"], labels=["lane-fix-red"], checks=[{"conclusion": "SUCCESS"}])
        resolved = pr(number=6, kinds=["conflict"], labels=["lane-fix-conflict"], merge="CLEAN")
        human_draft = pr(number=7, branch="tim/wip", draft=True, kinds=["review"], labels=["lane-fix-review"])
        rows = [green, resolved, human_draft]
        self.assertIsNone(events.claim_event_pr(self.host, module, "devin", rows, NOW))
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"), [])
        for index in range(3):
            self.assertIsNotNone(events.cleanup_one_event(self.host, module, rows, NOW + index * 60))
        self.assertEqual(len(shell.made("gh", "api", "-X", "DELETE")), 3)

    def test_spent_and_already_tried_heads_keep_their_label_and_wait(self):
        shell = Shell()
        # `pushed` without a pushedHead is a legacy record: the current head may be the one our
        # own fix produced, which is not new evidence (JOV-7089), so the generation stays spent.
        self.attempts({"5": {"sha": "h0", "count": 2, "pushed": True}, "6": {"sha": "h1", "count": 1}})
        waiting = [pr(kinds=["conflict"], merge="DIRTY"), pr(number=6, kinds=["dequeued"])]
        self.assertIsNone(events.claim_event_pr(self.host, fake_lane(shell), "devin", waiting, NOW))
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"), [], "no relabel churn on every push to main")

    def test_a_new_external_head_reenters_with_a_durable_receipt(self):
        shell = Shell()
        # Attempts on h0 are spent; h1 is a head nobody in the fix loop pushed (JOV-7089).
        self.attempts({"5": {"sha": "h0", "count": 2, "lane": "codex", "at": 0, "endedAt": 1,
                             "escalated": True}})
        claimed = events.claim_event_pr(self.host, fake_lane(shell), "devin",
                                        [pr(kinds=["conflict"], merge="DIRTY")], NOW)
        self.assertEqual(claimed["number"], 5, "a new head is valid re-entry evidence")
        record = self.attempts()["5"]
        self.assertEqual((record["sha"], record["count"]), ("h1", 1), "a new bounded generation")
        self.assertNotIn("escalated", record, "the new generation escalates on its own failure")
        self.assertEqual(record["reentry"]["schema"], "jovie-reentry/v1")
        self.assertEqual(record["reentry"]["fromGeneration"]["head"], "h0")
        self.assertEqual(record["reentry"]["toGeneration"]["head"], "h1")
        self.assertEqual(record["reentry"]["materialChange"], "new-pr-head")

    def test_a_self_pushed_head_is_not_reentry_evidence(self):
        self.attempts({"5": {"sha": "h0", "count": 2, "pushed": True, "pushedHead": "h1"}})
        self.assertIsNone(events.claim_event_pr(self.host, fake_lane(Shell()), "devin",
                                                [pr(kinds=["conflict"], merge="DIRTY")], NOW),
                          "the head our own fix produced stays terminal, not a re-entry")

    def test_the_second_attempt_escalates_to_the_next_lane_in_cost_order(self):
        self.attempts({"5": {"sha": "h0", "count": 1, "lane": "devin", "at": NOW - 60, "endedAt": NOW - 1}})
        (self.host.state / "synced.json").write_text(json.dumps({"5": {"from": "h0", "ok": True}}))
        dequeued = pr(kinds=["dequeued"])
        self.assertIsNone(events.claim_event_pr(self.host, fake_lane(Shell()), "devin", [dequeued], NOW))
        self.assertEqual(events.claim_event_pr(self.host, fake_lane(Shell()), "codex", [dequeued], NOW)["number"], 5)

    def test_cheapest_lane_first_with_a_grace_before_any_lane_takes_it(self):
        order = ["devin", "codex"]
        fresh = pr(updatedAt="2033-05-18T03:30:00Z")
        now = events.iso_ts("2033-05-18T03:31:00Z")
        self.assertTrue(events.may_take("devin", fresh, {}, order, now))
        self.assertFalse(events.may_take("codex", fresh, {}, order, now))
        self.assertTrue(events.may_take("codex", fresh, {}, order, now + events.ESCALATION_GRACE_S))
        self.assertTrue(events.may_take("codex", pr(), {}, order, now), "no timestamp: never strand the PR")
        self.assertTrue(events.may_take("devin", fresh, {"count": 5, "at": now}, ["devin"], now))
        self.assertTrue(events.may_take("claude", fresh, {}, order, now))
        self.assertIsNone(events.iso_ts("not a date"))

    def test_another_hosts_claim_is_respected(self):
        claimed = fake_lane(Shell(), claimed=True)
        self.assertIsNone(events.claim_event_pr(self.host, claimed, "devin", [pr(kinds=["review"])], NOW))
        self.assertEqual(self.attempts(), {}, "no attempt charged for a head another host is fixing")

    def test_fix_prompt_carries_queue_removal_and_review_feedback(self):
        saved = runner.sh
        runner.sh = lambda args, **k: SimpleNamespace(returncode=0, stderr="", stdout="- review: rename the prop")
        try:
            prompt = runner.render_fix_prompt({**pr(kinds=["dequeued", "review"]), "title": "t"}, "")
        finally:
            runner.sh = saved
        self.assertIn("merge queue removed this PR", prompt)
        self.assertIn("rename the prop", prompt)


class TickTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.host = SimpleNamespace(state=Path(self.tmp.name))
        proofs = {f"{n}:h1": {"schema": runner.GATE_RESULT_SCHEMA, "headSha": "h1", "verdict": "verified-not-queued",
                  "completedAt": runner.now_iso(), "policyDigest": runner.GATE_POLICY_DIGEST, "sensitive": False}
                  for n in (1, 5)}
        (self.host.state / "verified.json").write_text(json.dumps(proofs))

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_clean_lane_draft_is_readied_with_its_merge_intent(self):
        shell = Shell()
        outcome = events.ready_green(self.host, fake_lane(shell), pr(draft=True, merge="CLEAN"), {}, NOW)
        self.assertEqual(outcome, "landing")
        self.assertEqual([call[:3] for call in shell.calls if call[0] == "gh"],
                         [["gh", "pr", "ready"], ["gh", "pr", "merge"]])
        ledger = [json.loads(line) for line in (self.host.state / "runs/ledger.jsonl").read_text().splitlines()]
        self.assertEqual((ledger[0]["kind"], ledger[0]["verdict"]), ("ready-green", "landing"))

    def test_a_revoked_branch_is_never_readied_enrolled_or_resynced(self):
        runner.revoke_publication(self.host, branch="devin/jov-1-20260926t0900", reason="run-stopped")
        shell = Shell()
        self.assertEqual(events.ready_green(self.host, fake_lane(shell), pr(draft=True, merge="CLEAN"),
                                            {}, NOW), "revoked:run-stopped")
        self.assertEqual(events.sync_main(self.host, fake_lane(shell), pr(merge="CLEAN"), NOW),
                         "revoked:run-stopped")
        self.assertFalse(shell.calls, "a revoked branch takes no publication mutation")

    def test_a_failed_enqueue_is_handed_to_the_requeue_retry(self):
        shell = Shell({("gh", "pr", "merge"): (1, "")})
        self.assertEqual(events.ready_green(self.host, fake_lane(shell), pr(draft=True, merge="CLEAN"), {}, NOW),
                         "verified-not-queued")
        self.assertEqual(json.loads((self.host.state / "requeue.json").read_text()), {"5": "h1"})

    def test_diff_policy_and_legacy_gate_holds_stand_despite_green_ci(self):
        draft = pr(draft=True, merge="CLEAN")
        policy = {"5": events.held_record("h1", ["code-change-without-test"])}
        self.assertEqual(events.ready_green(self.host, fake_lane(Shell()), draft, policy, NOW), "held:missing-test")
        legacy_timeout = {"5": {"sha": "h1", "evidence": ["gate-timeout:x3"]}}
        (self.host.state / "held.json").write_text(json.dumps(legacy_timeout))
        self.assertTrue(events.ready_green(self.host, fake_lane(Shell()), draft, legacy_timeout, NOW).startswith("held:"))
        (self.host.state / "held.json").unlink()
        moved = {"5": events.held_record("h0", ["secret-like-file-changed"])}
        self.assertEqual(events.ready_green(self.host, fake_lane(Shell()), draft, moved, NOW), "landing")

    def test_not_yet_clean_drafts_wait_until_dirty_or_expired(self):
        lane = fake_lane(Shell())
        recent = pr(draft=True, merge="BLOCKED", updatedAt=runner.now_iso())
        self.assertEqual(events.ready_green(self.host, lane, recent, {}, time.time()), "wait")
        self.assertEqual(events.ready_green(self.host, lane, recent, {}, time.time() + events.GREEN_TTL_S + 60), "not-clean")
        self.assertEqual(events.ready_green(self.host, lane, pr(draft=True, merge="DIRTY"), {}, NOW), "not-clean")
        self.assertEqual(events.ready_green(self.host, lane, pr(merge="CLEAN"), {}, NOW), "already-ready")

    def linear(self, state_type="started", state="In Progress"):
        calls = SimpleNamespace(moves=[], comments=[])
        return SimpleNamespace(
            gql=lambda query, variables: {"issues": {"nodes": [{"id": "iss", "state": {"name": state, "type": state_type}}]}},
            move=lambda issue_id, name: calls.moves.append((issue_id, name)),
            comment=lambda issue_id, body: calls.comments.append(body), calls=calls)

    def test_orphans_are_closed_when_superseded_or_done_and_adopted_otherwise(self):
        orphan = pr(number=2, branch="claude/jov-9-20260926t0100", draft=True, labels=["duplicate"])
        newer = {"number": 3, "headRefName": "devin/jov-9-20260926t0500", "isDraft": False, "mergeStateStatus": "CLEAN"}
        shell = Shell({("gh", "api", "graphql"): retirement_page(orphan)})
        self.assertEqual(events.retire_orphan(fake_lane(shell), self.linear(), orphan, [orphan, newer], host=self.host, now=NOW), "superseded-by:3")
        self.assertIn("superseded by #3", shell.made("gh", "pr", "close")[0][-1])
        shell = Shell({("gh", "api", "graphql"): retirement_page(orphan)})
        self.assertEqual(events.retire_orphan(fake_lane(shell), self.linear("completed", "Done"), orphan, [orphan], host=self.host, now=NOW),
                         "issue-done")
        self.assertEqual(len(shell.made("gh", "pr", "close")), 1)
        shell = Shell({("gh", "api", "graphql"): retirement_page(orphan)})
        self.assertEqual(events.retire_orphan(fake_lane(shell), self.linear(), orphan, [orphan], host=self.host, now=NOW), "adopted")
        self.assertEqual((shell.made("gh", "pr", "close"), len(shell.made("gh", "pr", "comment"))), ([], 1))
        self.assertEqual(events.retire_orphan(fake_lane(Shell()), self.linear(), pr(branch="claude/x"), [], host=self.host, now=NOW), "not-a-lane-pr")
        broken = SimpleNamespace(gql=lambda *a: (_ for _ in ()).throw(RuntimeError("down")))
        self.assertEqual(events.retire_orphan(fake_lane(Shell()), broken, orphan, [orphan], host=self.host, now=NOW), "linear-unreadable")

    def test_an_unheld_explicit_duplicate_is_closed_and_its_issue_returned_to_todo(self):
        candidate = pr(branch="hyperagent/jov-9-20260926t0100", labels=["duplicate"])
        shell, linear = Shell({("gh", "api", "graphql"): retirement_page(candidate)}), self.linear()
        events.return_to_pool(fake_lane(shell), linear, candidate, "explicit duplicate", host=self.host, now=NOW)
        self.assertEqual(len(shell.made("gh", "pr", "close")), 1)
        self.assertEqual(linear.calls.moves, [("iss", "Todo")])
        done = self.linear("completed", "Done")
        events.return_to_pool(fake_lane(Shell()), done, pr(branch="hyperagent/jov-9-20260926t0100"), "x", host=self.host, now=NOW)
        self.assertEqual(done.calls.moves, [], "a done issue is not reopened")

    def test_tick_readies_green_retires_orphans_and_consumes_labels(self):
        queued = [pr(number=1, draft=True, merge="CLEAN", labels=["lane-fix-green"]),
                  pr(number=2, branch="claude/jov-9-20260926t0100", draft=True, labels=["lane-fix-orphan"]),
                  pr(number=4, draft=True, merge="BLOCKED", labels=["lane-fix-green"], updatedAt=runner.now_iso())]
        shell = Shell({("gh", "pr", "list", "--repo", runner.REPO_SLUG, "--state", "open", "--limit", "100"): queued,
                       ("gh", "pr", "list"): []})
        outcomes = events.tick(self.host, fake_lane(shell), self.linear)
        self.assertEqual(outcomes, {1: "landing", 2: "adopted", 4: "wait"})
        deleted = [call[-1].rsplit("/", 1)[-1] for call in shell.made("gh", "api", "-X", "DELETE")]
        self.assertEqual(deleted, ["lane-fix-green", "lane-fix-orphan"], "a waiting green label stays for the next tick")
        self.assertEqual(events.tick(self.host, fake_lane(Shell({("gh", "pr", "list"): []})), self.linear), {})

    def test_escalation_is_a_bug_intake_envelope(self):
        text = events.bug_report(pr(), "two attempts failed", "gem", {"count": 2, "lane": "codex"})
        envelope = json.loads(text.split("```json\n")[1].split("\n```")[0])
        self.assertEqual((envelope["schema"], envelope["source"], envelope["surface"], envelope["triage"]["lastLane"]),
                         ("jovie.bug-report/v1", "agent", "pull-request/5", "codex"))


class GapTest(unittest.TestCase):
    """The orphan-PR gaps: parked heads, dequeued heads, the reconcile sweep and its invariant."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.host = SimpleNamespace(state=Path(self.tmp.name))
        proofs = {f"{n}:h1": {"schema": runner.GATE_RESULT_SCHEMA, "headSha": "h1", "verdict": "verified-not-queued",
                  "completedAt": runner.now_iso(), "policyDigest": runner.GATE_POLICY_DIGEST, "sensitive": False}
                  for n in (1, 5)}
        (self.host.state / "verified.json").write_text(json.dumps(proofs))

    def tearDown(self):
        self.tmp.cleanup()

    def test_only_a_running_attempt_holds_its_head(self):
        head = pr()
        self.assertTrue(events.in_flight({"sha": "h1", "at": NOW - 60}, head, NOW))
        self.assertFalse(events.in_flight({"sha": "h1", "at": NOW - 60, "endedAt": NOW}, head, NOW))
        self.assertFalse(events.in_flight({"sha": "h1", "at": NOW - events.FIX_LEASE_S - 1}, head, NOW))
        self.assertFalse(events.in_flight({"sha": "h1", "count": 1}, head, NOW), "legacy records get their retry")
        self.assertFalse(events.in_flight({"sha": "h0", "at": NOW}, head, NOW))

    def test_a_no_push_attempt_is_retried_on_the_same_head_by_the_next_lane(self):
        (self.host.state / "fix-attempts.json").write_text(json.dumps(
            {"5": {"sha": "h1", "count": 1, "lane": "devin", "at": NOW - 600, "endedAt": NOW - 60}}))
        conflict = pr(kinds=["conflict"], merge="DIRTY")
        self.assertEqual(events.claim_event_pr(self.host, fake_lane(Shell()), "codex", [conflict], NOW)["number"], 5)

    def test_a_first_removal_waits_for_the_no_model_sync(self):
        lane = fake_lane(Shell())
        self.assertIsNone(events.claim_event_pr(self.host, lane, "devin", [pr(kinds=["dequeued"], merge="CLEAN")], NOW))
        runs = [{"databaseId": 9, "headBranch": "gh-readonly-queue/main/pr-5-abc", "workflowName": "CI"},
                {"databaseId": 8, "headBranch": "gh-readonly-queue/main/pr-50-abc", "workflowName": "CI"}]
        shell = Shell({("gh", "run", "list"): runs,
                       ("gh", "run", "view"): "job\tstep\tok\njob\tstep\tError: e2e smoke failed\n"})
        (self.host.state / "synced.json").write_text(json.dumps({"5": {"from": "h0", "ok": True}}))
        claimed = events.claim_event_pr(self.host, fake_lane(shell), "devin", [pr(kinds=["dequeued"], merge="CLEAN")], NOW)
        self.assertIn("e2e smoke failed", claimed["queueFailure"])
        self.assertEqual(shell.made("gh", "run", "view")[0][3], "9")
        poisoned = pr(number=6, kinds=["dequeued"], merge="CLEAN", labels=[events.POISON_LABEL])
        claimed = events.claim_event_pr(self.host, fake_lane(shell), "devin", [poisoned], NOW)
        self.assertEqual(claimed["number"], 6, "a repeatedly ejected head bypasses another mechanical sync")
        self.assertEqual(events.queue_failure(fake_lane(Shell({("gh", "run", "list"): []})), 5), "")
        self.assertEqual(events.queue_failure(fake_lane(Shell({("gh", "run", "list"): (0, "not json")})), 5), "")

    def test_tick_syncs_a_dequeued_head_with_main_once(self):
        queued = [pr(merge="CLEAN", labels=["lane-fix-dequeued"]), pr(number=6, merge="DIRTY", labels=["lane-fix-dequeued"])]
        shell = Shell({("gh", "pr", "list"): queued})
        (self.host.state / "reconcile.json").write_text(json.dumps({"atEpoch": NOW}))
        outcomes = events.tick(self.host, fake_lane(shell), lambda: None, NOW)
        self.assertEqual(outcomes, {5: "synced"}, "a conflicted head cannot be synced; the model fixes it")
        self.assertIn(["gh", "api", "-X", "PUT", f"repos/{runner.REPO_SLUG}/pulls/5/update-branch",
                       "-f", "expected_head_sha=h1"], shell.calls)
        self.assertEqual(json.loads((self.host.state / "synced.json").read_text())["5"]["ok"], True)
        again = Shell({("gh", "pr", "list"): queued})
        self.assertEqual(events.tick(self.host, fake_lane(again), lambda: None, NOW), {})
        failing = Shell({("gh", "pr", "list"): [pr(number=7, merge="CLEAN", labels=["lane-fix-dequeued"])],
                         ("gh", "api", "-X", "PUT"): (1, "")})
        self.assertEqual(events.tick(self.host, fake_lane(failing), lambda: None, NOW), {7: "sync-failed"})
        self.assertEqual(failing.made("gh", "api", "-X", "DELETE"), [], "a failed sync leaves the label for the model")
        poisoned = Shell({("gh", "pr", "list"): [
            pr(number=8, merge="CLEAN", labels=["lane-fix-dequeued", events.POISON_LABEL])
        ]})
        self.assertEqual(events.tick(self.host, fake_lane(poisoned), lambda: None, NOW), {})
        self.assertEqual(poisoned.made("gh", "api", "-X", "PUT"), [], "poisoned PRs go straight to a model fix")
        self.assertEqual(poisoned.made("gh", "api", "-X", "DELETE"), [], "the model-fix label stays actionable")

    def node(self, number, **extra):
        base = {"number": number, "isDraft": False, "headRefName": f"tim/x{number}", "headRefOid": "h", "labels": [],
                "mergeStateStatus": "BLOCKED", "isInMergeQueue": False, "isCrossRepository": False,
                "updatedAt": "2033-05-17T00:00:00Z", "rollup": "SUCCESS"}
        base.update(extra)
        return base

    def test_age_exhaustion_and_same_issue_do_not_authorize_automatic_close(self):
        old = "2033-05-01T00:00:00Z"
        prs = [self.node(18509, isDraft=True, headRefName="claude/review-kernel",
                         createdAt=old, updatedAt=old),
               self.node(2, isDraft=True, headRefName="claude/jov-9-20260926t0100", updatedAt=old),
               self.node(3, headRefName="devin/jov-9-20260926t0500"),
               self.node(4, isDraft=True, headRefName="claude/jov-10-20260926t0100", updatedAt=old)]
        plan = events.reconcile_plan(prs, {"4": {"count": 2, "head": "h"}}, {"claude"}, 2,
                                     events.iso_ts("2033-05-18T03:00:00Z"))
        self.assertEqual(plan["close"], [], "JOV-INV-011 requires explicit duplicate authority")

    def test_reconcile_labels_missed_events_and_names_orphans(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        old = "2033-05-15T00:00:00Z"
        prs = [
            self.node(1, mergeStateStatus="DIRTY"),
            self.node(2, rollup="FAILURE"),
            self.node(3, isInMergeQueue=True, mergeStateStatus="CLEAN", labels=[{"name": "lane-fix-exhausted"}]),
            self.node(4, mergeStateStatus="CLEAN"),
            self.node(5, labels=[{"name": "hold"}]),
            self.node(6, rollup="PENDING"),
            self.node(7, labels=[{"name": "lane-fix-conflict"}], mergeStateStatus="DIRTY"),
            self.node(8, labels=[{"name": "lane-fix-red"}], rollup="FAILURE"),
            self.node(9, isDraft=True, headRefName="devin/jov-9-20260926t0100", mergeStateStatus="CLEAN"),
            self.node(10, isDraft=True, headRefName="devin/jov-10-20260926t0100", updatedAt=old),
            self.node(11, isDraft=True, headRefName="devin/jov-11-20260926t0100", updatedAt=old),
            self.node(12, isDraft=True, headRefName="codex/jov-10-20260926t0500", updatedAt=old),
            self.node(13, isDraft=True, headRefName="tim/wip", updatedAt=old),
            self.node(14, updatedAt="2033-05-18T02:50:00Z"),
            self.node(15, labels=[{"name": events.POISON_LABEL}]),
        ]
        plan = events.reconcile_plan(prs, {"8": {"count": 2}, "11": {"count": 2}}, set(), 2, now)
        self.assertEqual(plan["label"], [(1, "conflict"), (2, "red"), (9, "green"), (10, "stale"), (12, "stale"),
                                         (15, "dequeued")])
        self.assertEqual(plan["close"], [], "same issue and exhausted attempts do not authorize closure")
        self.assertEqual(plan["reset"], [4, 9])
        self.assertEqual(plan["unlabel"], [])
        self.assertEqual(plan["orphans"], [4], "terminal work is held, not orphaned")
        counts = plan["counts"]
        self.assertEqual((counts["open"], counts["dirty"], counts["red"], counts["cleanNotQueued"], counts["inQueue"],
                          counts["staleLaneDrafts"], counts["staleOtherDrafts"],
                          counts["staleAgentDrafts"]), (15, 2, 2, 1, 1, 2, 0, 1),
                         "a stale agent-owned draft (tim/wip) is counted separately from a human's")

    def test_stalled_agent_drafts_are_repaired_or_held_on_a_live_dependency(self):
        """JOV-7079 canary: an old non-lane agent draft cannot sit forever. Past the 7d SLO
        and stalled it enters repair unless a dependency it names is still open."""
        now = events.iso_ts("2033-05-18T03:00:00Z")
        old, recent = "2033-05-15T00:00:00Z", "2033-05-18T00:00:00Z"
        ancient = "2033-05-01T00:00:00Z"
        prs = [
            # abandoned: >7d old, DIRTY, no open dependency -> close
            self.node(20, isDraft=True, headRefName="codex/homepage-material", mergeStateStatus="DIRTY",
                      createdAt=ancient, updatedAt=recent),
            # abandoned: >7d old and idle >48h, CLEAN but unshipped -> close
            self.node(21, isDraft=True, headRefName="devin/leftover", mergeStateStatus="BLOCKED",
                      createdAt=ancient, updatedAt=old),
            # held: >7d old and stalled, but the dependency it names is still open
            self.node(22, isDraft=True, headRefName="codex/stacked-child", createdAt=ancient,
                      updatedAt=old),
            # young agent draft idle >48h is counted, not closed (its writer may still move it)
            self.node(23, isDraft=True, headRefName="codex/fresh-wip", createdAt=old, updatedAt=old),
            # a human's own branch is never the lanes' to close
            self.node(24, isDraft=True, headRefName="feature/personal-wip", createdAt=ancient,
                      updatedAt=ancient),
        ]
        plan = events.reconcile_plan(prs, {}, set(), 2, now, deps={22: [9]})
        self.assertEqual(plan["close"], [])
        self.assertEqual(plan["label"], [], "non-lane drafts stay with their qualified writer")
        self.assertEqual(plan["depHolds"], [(22, [9])])
        counts = plan["counts"]
        self.assertEqual((counts["staleAgentDrafts"], counts["staleOtherDrafts"]), (4, 1))
        states = {row["pr"]: row["state"] for row in plan["dispositions"]}
        self.assertEqual(states[20], "repair")
        self.assertEqual(states[22], "hold:dependency")
        self.assertEqual(states[24], "draft")
        # A landed dependency releases repair; it never grants retirement authority.
        landed = events.reconcile_plan(prs, {}, set(), 2, now, deps={})
        self.assertEqual(landed["close"], [])
        self.assertEqual(next(row for row in landed["dispositions"] if row["pr"] == 22)["state"], "repair")

    def test_explicit_duplicate_plan_still_respects_holds_queue_and_forks(self):
        old = "2033-05-01T00:00:00Z"
        candidate = self.node(1, isDraft=True, headRefName="codex/stale", createdAt=old, updatedAt=old,
                              labels=[{"name": "duplicate"}])
        now = events.iso_ts("2033-05-18T03:00:00Z")
        self.assertEqual([number for number, _ in events.reconcile_plan([candidate], {}, set(), 2, now)["close"]], [1])
        for overrides in ({"labels": [{"name": "duplicate"}, {"name": "hold"}]},
                          {"isInMergeQueue": True}, {"isCrossRepository": True}, {"state": "CLOSED"}):
            with self.subTest(overrides=overrides):
                self.assertEqual(events.reconcile_plan([{**candidate, **overrides}], {}, set(), 2, now)["close"], [])

    def test_dependency_refs_and_revalidation_reads(self):
        body = ("Waiting on #17290 and https://github.com/JovieInc/Jovie/pull/17291 to land.\n"
                "Parentbc508 is a sha, not a PR. Not blocked by #17.")
        self.assertEqual(events.dependency_refs(body), {17290, 17291})
        views = {"20": "keep draft; blocked by #300", "300": "OPEN", "310": "MERGED"}
        shell = Shell({("gh", "pr", "view"): lambda args: views[args[3]]})
        now = events.iso_ts("2033-05-18T03:00:00Z")
        stale = self.node(20, isDraft=True, headRefName="codex/x", createdAt="2033-05-01T00:00:00Z",
                          updatedAt="2033-05-01T00:00:00Z")
        self.assertEqual(events.open_dependencies([stale], now, shell), {20: [300]})
        views["300"] = "MERGED"
        self.assertEqual(events.open_dependencies([stale], now, shell), {},
                         "a merged dependency no longer holds the draft")

    def test_dispositions_cover_every_open_pr_oldest_first(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        prs = [
            self.node(1, mergeStateStatus="CLEAN", isInMergeQueue=True, createdAt="2033-05-17T00:00:00Z"),
            self.node(2, mergeStateStatus="CLEAN", createdAt="2033-05-18T02:00:00Z"),
            self.node(3, labels=[{"name": "hold"}], createdAt="2033-05-10T00:00:00Z"),
            self.node(4, isDraft=True, headRefName="devin/jov-4-20260926t0100",
                      createdAt="2033-05-18T01:00:00Z", updatedAt="2033-05-18T01:00:00Z"),
        ]
        plan = events.reconcile_plan(prs, {}, set(), 2, now)
        rows = {row["pr"]: row for row in plan["dispositions"]}
        self.assertEqual(set(rows), {1, 2, 3, 4}, "every open PR has exactly one disposition")
        self.assertEqual(rows[1]["headSha"], prs[0]["headRefOid"])
        self.assertEqual([row["pr"] for row in plan["dispositions"]], [3, 1, 4, 2],
                         "oldest first for the cockpit")
        self.assertEqual(rows[1]["state"], "queued")
        self.assertEqual(rows[2]["state"], "ready")
        self.assertEqual(rows[3]["state"], "hold:hold")
        self.assertEqual(rows[4]["state"], "draft")

    def test_stale_draft_disposition_names_the_real_next_step(self):
        """JOV-7132: a draft idle past the 48h SLO is not "inside the SLO". Non-agent
        branches are never closed by the sweep; young agent drafts close at the 7d SLO."""
        now = events.iso_ts("2033-05-18T03:00:00Z")
        prs = [
            self.node(30, isDraft=True, headRefName="feat/jov-6507-thing",
                      createdAt="2033-05-10T00:00:00Z", updatedAt="2033-05-14T00:00:00Z"),
            self.node(31, isDraft=True, headRefName="codex/wip",
                      createdAt="2033-05-15T00:00:00Z", updatedAt="2033-05-15T00:00:00Z"),
        ]
        plan = events.reconcile_plan(prs, {}, set(), 2, now)
        rows = {row["pr"]: row for row in plan["dispositions"]}
        self.assertEqual(rows[30]["state"], "draft")
        self.assertEqual(rows[30]["reason"], "past the 48h stale SLO")
        self.assertIn("never closes non-agent drafts", rows[30]["next"])
        self.assertEqual(rows[31]["next"], "repair unfinished work; closure requires an explicit duplicate label")

    def test_reconcile_applies_the_plan_on_its_own_cadence(self):
        page = {"data": {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [
            {**self.node(1, mergeStateStatus="DIRTY"), "commits": {"nodes": [{"commit": {"statusCheckRollup": None}}]},
             "labels": {"nodes": []}},
            {**self.node(4, mergeStateStatus="CLEAN", isInMergeQueue=True),
             "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": "SUCCESS"}}}]}, "labels": {"nodes": []}},
            {**self.node(10, isDraft=True, headRefName="devin/jov-10-20260926t0100", updatedAt="2020-01-01T00:00:00Z"),
             "commits": {"nodes": []}, "labels": {"nodes": []}},
        ]}}}}
        shell = Shell({("gh", "api", "graphql"): page})
        (self.host.state / "fix-attempts.json").write_text(json.dumps({"4": {"count": 2}, "10": {"count": 2}}))
        linear = SimpleNamespace(gql=lambda q, v: {"issues": {"nodes": []}}, move=None, comment=None)
        lane = fake_lane(shell)
        record = events.reconcile(self.host, lane, lambda: linear, NOW)
        self.assertEqual(lane.pruned, [True], "a complete open-PR page prunes held.json")
        self.assertEqual(record["counts"]["dirty"], 1)
        self.assertIn(["gh", "api", "-X", "POST", f"repos/{events.REPO}/issues/1/labels", "-f", "labels[]=lane-fix-conflict"],
                      shell.calls)
        self.assertEqual(json.loads((self.host.state / "fix-attempts.json").read_text()), {"4": {"count": 2}, "10": {"count": 2}},
                         "queue observations preserve all consumed attempts")
        self.assertEqual(record["closed"], [])
        self.assertIsNone(events.reconcile(self.host, fake_lane(shell), lambda: linear, NOW + 60), "one sweep per window")
        broken = Shell({("gh", "api", "graphql"): (1, "")})
        self.assertIsNone(events.reconcile(self.host, fake_lane(broken), lambda: linear, NOW, force=True))
        no_linear = Shell({("gh", "api", "graphql"): page})
        events.reconcile(self.host, fake_lane(no_linear), lambda: (_ for _ in ()).throw(OSError("x")), NOW, force=True)
        self.assertEqual(len(no_linear.made("gh", "pr", "close")), 0, "terminal work is preserved even with Linear unavailable")

    def test_reconcile_does_not_relabel_a_head_with_an_active_repair_claim(self):
        target = self.node(6, headRefOid="claimed-head", mergeStateStatus="DIRTY")
        claimed_at = datetime.fromtimestamp(NOW - 60, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        claim_url = f"repos/{events.REPO}/issues/6/comments?per_page=100&sort=created&direction=desc"
        shell = Shell({
            ("gh", "api", claim_url):
                f"🤖 lane claim kind=fix sha=claimed-head host=gem at={claimed_at}\n",
        })
        with patch.object(events, "open_prs_state", return_value=[target]):
            record = events.reconcile(self.host, fake_lane(shell), lambda: None, NOW, force=True)
        self.assertEqual(record["labeled"], [])
        self.assertEqual(shell.made("gh", "api", "-X", "POST"), [])

    def hold_ctx(self, events_list, notes=(), committed="2033-05-18T00:00:00Z", oid="h"):
        """A canned hold_context GraphQL reply: labeled events, comments, last commit."""
        return {"data": {"repository": {"pullRequest": {
            "timelineItems": {"pageInfo": {"hasPreviousPage": False}, "nodes": [{"createdAt": at, "label": {"name": label},
                                         "actor": {"login": actor}} for at, label, actor in events_list]},
            "comments": {"pageInfo": {"hasPreviousPage": False}, "nodes": [{"createdAt": at, "author": {"login": who}, "body": body}
                                   for at, who, body in notes]},
            "commits": {"nodes": [{"commit": {"oid": oid, "committedDate": committed}}]}}}}}

    def test_a_clean_held_pr_whose_hold_outlived_its_cause_is_flagged(self):
        """JOV-7066: stale when the hold is >24h old, the PR reads CLEAN and no note of
        Tim's explains it. Tim's holds, fresh holds and unreadable contexts stand."""
        now = events.iso_ts("2033-05-18T03:00:00Z")
        old, fresh = "2033-05-16T00:00:00Z", "2033-05-18T01:00:00Z"
        clean_held = pr(merge="CLEAN", labels=["hold"])

        def flagged(ctx, target=clean_held):
            return events.stale_hold(target["number"], target, now, Shell({("gh", "api", "graphql"): ctx}))

        row = flagged(self.hold_ctx([(old, "hold", "jovie-lanes[bot]")]))
        self.assertEqual((row["pr"], row["head"], row["labeler"], row["timHold"]),
                         (5, "h1", "jovie-lanes[bot]", False))
        self.assertGreater(row["holdAgeH"], 24)
        self.assertTrue(row["auto"], "an automation hold on a head that moved lifts in strict mode")
        self.assertIsNone(flagged(self.hold_ctx([(fresh, "hold", "jovie-lanes[bot]")])),
                          "a hold inside the 24h window is still settling")
        self.assertIsNone(flagged(self.hold_ctx([(old, "hold", "itstimwhite")])),
                          "Tim applied it: his holds (product/spend/taste) never auto-flag")
        self.assertIsNone(flagged(self.hold_ctx([(old, "hold", "jovie-lanes[bot]")],
                                                notes=[(old, "itstimwhite", "holding this for the pricing pass")])),
                          "a Tim-authored hold note keeps it held")
        self.assertIsNone(flagged(self.hold_ctx([])), "a label event we cannot see is not stale")
        self.assertIsNone(flagged((1, "")), "an unreadable hold is never flagged")

    def test_a_stale_hold_naming_a_non_check_blocker_alerts_but_never_auto_lifts(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        ctx = self.hold_ctx([("2033-05-16T00:00:00Z", "hold", "jovie-lanes[bot]")],
                            notes=[("2033-05-16T00:05:00Z", "jovie-lanes[bot]",
                                    "held: waits on dependency #17541 qualification pass")])
        row = events.stale_hold(5, pr(merge="CLEAN", labels=["hold"]), now,
                                Shell({("gh", "api", "graphql"): ctx}))
        self.assertTrue(row["nonCheckBlocker"])
        self.assertFalse(row["auto"], "a named non-check blocker is a human gate")
        self.assertIn("non-check blocker", events.stale_hold_alert(row))
        self.assertIn("h1", events.stale_hold_alert(row))
        same_head = self.hold_ctx([("2033-05-16T00:00:00Z", "hold", "jovie-lanes[bot]")],
                                  committed="2033-05-15T00:00:00Z")
        row = events.stale_hold(5, pr(merge="CLEAN", labels=["hold"]), now,
                                Shell({("gh", "api", "graphql"): same_head}))
        self.assertFalse(row["auto"], "the head never moved past the hold")

    def test_founder_note_before_a_later_bot_hold_remains_authoritative(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        ctx = self.hold_ctx([("2033-05-16T00:00:00Z", "hold", "jovie-lanes[bot]")],
                            notes=[("2033-05-10T00:00:00Z", "itstimwhite",
                                    "On hold: scanners are subscription-only; no AI Gateway key in scanner paths.")])
        self.assertIsNone(events.stale_hold(5, pr(merge="CLEAN", labels=["hold"]), now,
                                          Shell({("gh", "api", "graphql"): ctx})))

    def test_truncated_or_unproven_hold_history_never_authorizes_unhold_advice(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        for connection in ("timelineItems", "comments"):
            for page_info in ({"hasPreviousPage": True}, {}, None):
                with self.subTest(connection=connection, page_info=page_info):
                    ctx = self.hold_ctx([("2033-05-16T00:00:00Z", "hold", "jovie-lanes[bot]")])
                    ctx["data"]["repository"]["pullRequest"][connection]["pageInfo"] = page_info
                    self.assertIsNone(events.stale_hold(5, pr(merge="CLEAN", labels=["hold"]), now,
                                                      Shell({("gh", "api", "graphql"): ctx})))

    def test_reconcile_alerts_once_per_stale_hold_episode(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        held_node = {**self.node(5, mergeStateStatus="CLEAN", labels=[{"name": "hold"},
                                                                   {"name": events.POISON_LABEL}]),
                     "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": "SUCCESS"}}}]},
                     "labels": {"nodes": [{"name": "hold"}, {"name": events.POISON_LABEL}]}}

        def route(args):
            query = next((a for a in args if a.startswith("query=")), "")
            if "timelineItems" in query:
                return self.hold_ctx([("2033-05-16T00:00:00Z", "hold", "jovie-lanes[bot]")])
            return {"data": {"repository": {"pullRequests": {
                "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [held_node]}}}}

        shell = Shell({("gh", "api", "graphql"): route})
        record = events.reconcile(self.host, fake_lane(shell), lambda: None, now)
        self.assertEqual([row["pr"] for row in record["staleHolds"]], [5])
        comments = shell.made("gh", "pr", "comment")
        self.assertEqual(len(comments), 1)
        self.assertIn("h", comments[0][comments[0].index("--body") + 1])
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"), [], "alert mode never lifts a hold")
        second = Shell({("gh", "api", "graphql"): route})
        events.reconcile(self.host, fake_lane(second), lambda: None, now + 3600)
        self.assertEqual(second.made("gh", "pr", "comment"), [], "one alert per stale episode")

    def test_strict_mode_lifts_an_automation_hold_whose_head_moved(self):
        now = events.iso_ts("2033-05-18T03:00:00Z")
        held_node = {**self.node(5, mergeStateStatus="CLEAN", labels=[{"name": "hold"}]),
                     "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": "SUCCESS"}}}]},
                     "labels": {"nodes": [{"name": "hold"}]}}

        def route(args):
            query = next((a for a in args if a.startswith("query=")), "")
            if "timelineItems" in query:
                return self.hold_ctx([("2033-05-16T00:00:00Z", "hold", "jovie-lanes[bot]")])
            return {"data": {"repository": {"pullRequests": {
                "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [held_node]}}}}

        saved = os.environ.get("LANES_STALE_HOLD_UNHOLD")
        os.environ["LANES_STALE_HOLD_UNHOLD"] = "1"
        try:
            shell = Shell({("gh", "api", "graphql"): route})
            events.reconcile(self.host, fake_lane(shell), lambda: None, now)
        finally:
            if saved is None:
                os.environ.pop("LANES_STALE_HOLD_UNHOLD", None)
            else:
                os.environ["LANES_STALE_HOLD_UNHOLD"] = saved
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"),
                         [["gh", "api", "-X", "DELETE", f"repos/{runner.REPO_SLUG}/issues/5/labels/hold"]])

    def test_open_prs_are_read_page_by_page(self):
        pages = iter([
            {"data": {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": True, "endCursor": "c1"},
                                                      "nodes": [{"number": 1, "labels": {"nodes": [{"name": "hold"}]},
                                                                 "files": {"totalCount": 1, "nodes": [
                                                                     {"path": "scripts/lanes/hud.py", "changeType": "MODIFIED"}]}}]}}}},
            {"data": {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": False, "endCursor": None},
                                                      "nodes": [{"number": 2}]}}}},
        ])
        shell = Shell({("gh", "api", "graphql"): lambda args: next(pages)})
        prs = events.open_prs_state(fake_lane(shell))
        self.assertEqual([(p["number"], p["labels"], p["rollup"]) for p in prs], [(1, [{"name": "hold"}], None), (2, [], None)])
        self.assertEqual(prs[0]["files"], [{"path": "scripts/lanes/hud.py", "changeType": "MODIFIED"}])
        self.assertTrue(prs[0]["filesComplete"])
        self.assertIn("files(first:100)", next(arg for arg in shell.calls[0] if arg.startswith("query=")))
        self.assertIn("cursor=c1", shell.calls[1])

    def test_unreadable_large_file_list_preserves_metadata_without_certifying_overlap_inventory(self):
        page = {"data": {"repository": {"pullRequests": {
            "pageInfo": {"hasNextPage": False, "endCursor": None},
            "nodes": [{"number": 1, "files": {"totalCount": 101, "nodes": []}},
                      {"number": 2, "files": {"totalCount": 1, "nodes": [{"path": "README.md"}]}}]}}}}
        shell = Shell({("gh", "api", "graphql"): page,
                       ("gh", "api", "--paginate"): (1, "unavailable")})
        prs = events.open_prs_state(fake_lane(shell))
        self.assertEqual([row["number"] for row in prs], [1, 2])
        self.assertFalse(prs[0]["filesComplete"])
        self.assertTrue(prs[1]["filesComplete"])
        with patch.object(runner, "open_prs_summary", return_value=prs), \
                patch.dict(runner._SUMMARY, {"readable": True}):
            self.assertIsNone(runner.overlap_prs_summary())

    def test_fix_prompt_carries_stale_and_queue_log_and_lockfile_recipe(self):
        prompt = runner.render_fix_prompt({**pr(kinds=["dequeued", "stale"], merge="DIRTY"), "title": "t",
                                           "queueFailure": "### merge group: CI\nboom"}, "")
        self.assertIn("boom", prompt)
        self.assertIn("no activity for 48 hours", prompt)
        self.assertIn("pnpm install --lockfile-only", prompt)
        self.assertIn("Never hand-merge generated files", prompt)


class RunnerHookTest(unittest.TestCase):
    """The hook-in points in lane_runner.py: structured held records, exhausted orphans, the tick."""

    def setUp(self):
        disk = patch.object(runner.disk_guard, "free_pct", return_value=50.0)
        disk.start()
        self.addCleanup(disk.stop)

    def test_record_held_and_failures_are_structured(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = runner.Host(state=Path(tmp))
            runner.record_held(host, 9, "h9", ["diff-too-large:3000"])
            record = json.loads((host.state / "held.json").read_text())["9"]
            self.assertEqual((record["reason"], record["next_action"]), ("diff-too-large", "bug-intake"))

    def test_exhausted_disabled_lane_preserves_pr_and_terminal_backlog_disposition(self):
        stuck = pr(number=7, branch="claude/jov-9-20260926t0100", sha="h1", merge="DIRTY")
        calls, moves, comments = [], [], []
        saved = (runner.sh, runner.load_providers)
        runner.sh = lambda args, **k: calls.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        runner.load_providers = lambda: PROVIDERS
        linear = SimpleNamespace(
            gql=lambda *a: {"issues": {"nodes": [{"id": "iss", "state": {"type": "started"},
                                                  "comments": {"nodes": []}}]}},
            move=lambda issue, state: moves.append((issue, state)),
            comment=lambda issue, body: comments.append(body))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                (host.state / "fix-attempts.json").write_text(json.dumps(
                    {"7": {"sha": "h1", "count": 2, "pushed": True, "escalations": [
                        {"kind": "deterministic", "rung": "update-branch", "head": "h1", "at": 1},
                        {"kind": "model", "rung": "escalate", "lane": "devin", "head": "h1", "at": 2},
                        {"kind": "model", "rung": "top-rung", "lane": "codex", "head": "h1", "at": 3, "topRung": True},
                    ]}}))
                os.environ["LANES_ESCALATION_STUCK_PRS"] = "1"
                runner.escalate_exhausted(host, [stuck], linear)
                held = json.loads((host.state / "held.json").read_text())["7"]
                runner.escalate_exhausted(host, [stuck], linear)
        finally:
            runner.sh, runner.load_providers = saved
            os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        self.assertFalse(any(call[:3] == ["gh", "pr", "close"] for call in calls),
                         "retry exhaustion is evidence of a held generation, not redundant work")
        self.assertEqual(moves, [("iss", "Backlog")])
        self.assertEqual(len(comments), 1, "terminal disposition remains deduplicated")
        self.assertIn("needs-human-decision", comments[0])
        self.assertEqual((held["reason"], held["sha"]), ("fix-exhausted", "h1"))
        self.assertIn(["gh", "api", "-X", "POST", f"repos/{events.REPO}/issues/7/labels", "-f",
                       "labels[]=lane-fix-exhausted"], calls)

    def test_an_unfixable_hold_escalates_once_without_burning_attempts(self):
        stuck = pr(number=7, title="big diff")
        calls, triaged = [], []
        saved = (runner.sh, runner.load_providers, events.return_to_pool)
        runner.sh = lambda args, **k: calls.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        runner.load_providers = lambda: PROVIDERS
        events.return_to_pool = lambda *a: None
        linear = SimpleNamespace(create_triage=lambda title, body, dedupe=None: triaged.append(title))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                runner.record_held(host, 7, "h1", ["diff-too-large:2000"])
                os.environ["LANES_ESCALATION_STUCK_PRS"] = "1"
                runner.escalate_exhausted(host, [stuck], linear)
                runner.escalate_exhausted(host, [stuck], linear)  # intake once, not every pass
                held = json.loads((host.state / "held.json").read_text())["7"]
                attempts = json.loads((host.state / "fix-attempts.json").read_text())["7"]
        finally:
            runner.sh, runner.load_providers, events.return_to_pool = saved
            os.environ.pop("LANES_ESCALATION_STUCK_PRS", None)
        self.assertEqual(triaged, [], "an unfixable hold gets a terminal disposition, not Triage inventory")
        self.assertEqual((held["reason"], held["sha"]), ("diff-too-large", "h1"),
                         "a zero-attempt hold keeps its real reason instead of fix-exhausted")
        self.assertTrue(attempts["escalated"])
        self.assertNotIn("count", attempts, "no fix attempt was charged")

    def test_a_finished_fix_ends_its_attempt(self):
        saved = (runner.sh, runner.failure_excerpt)
        runner.failure_excerpt = lambda pr: ""

        def fake(args, cwd=None, timeout=600, env=None, log=None, stream=False):
            if args[:3] == ["git", "worktree", "add"]:
                Path(args[-2]).mkdir(parents=True)
            return SimpleNamespace(returncode=0, stderr="", stdout="")
        runner.sh = fake
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp), repo=Path(tmp))
                (host.state / "fix-attempts.json").write_text(json.dumps({"5": {"sha": "h1", "count": 1, "at": 1}}))
                runner.fix_red_pr(host, "devin", {"cmd": ["true"]}, pr())
                record = json.loads((host.state / "fix-attempts.json").read_text())["5"]
        finally:
            runner.sh, runner.failure_excerpt = saved
        self.assertEqual(record["pushed"], False)
        self.assertGreater(record["endedAt"], 1)

    def test_dispatch_survives_a_broken_event_tick(self):
        saved = (runner.load_providers, runner.sh, runner.doctor.run, events.tick, runner.disk_guard.check)
        runner.load_providers = lambda: {}
        runner.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        runner.doctor.run = lambda *a, **k: {}
        runner.disk_guard.check = lambda host: {"freePct": 50.0, "low": False, "critical": False, "admitted": True}
        events.tick = lambda *a: (_ for _ in ()).throw(RuntimeError("gh down"))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(runner.dispatch(host), 0)
                tick = json.loads((host.state / "tick.json").read_text())
        finally:
            runner.load_providers, runner.sh, runner.doctor.run, events.tick, runner.disk_guard.check = saved
        self.assertIn("gh down", tick["eventsError"])



class NativeQueueClaimTest(unittest.TestCase):
    def test_known_queue_owns_every_repair_event_and_polling_selection(self):
        for kind in ("red", "review", "dequeued", "stale"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                target = pr(kinds=[kind], checks=[RED_CHECK], isInMergeQueue=True, merge="DIRTY")
                shell = Shell();module = fake_lane(shell)
                module.reconcile_fix_target = Mock(side_effect=AssertionError("known queue needs no per-row read"))
                self.assertFalse(events.needs_work(module, target))
                self.assertIsNone(runner.red_pr([target], {}))
                self.assertIsNone(events.claim_event_pr(host, module, "devin", [target], NOW))
                self.assertEqual(shell.calls, []);self.assertEqual(module.posted, [])
                self.assertFalse((host.state / "fix-attempts.json").exists())

    def test_fresh_queue_or_unknown_blocks_both_claim_paths_without_spending(self):
        for entrypoint in ("event", "poll"):
            for queue in (True, None, "false"):
                with self.subTest(entrypoint=entrypoint, queue=queue), tempfile.TemporaryDirectory() as tmp:
                    host = runner.Host(state=Path(tmp));target = pr(kinds=["red"], checks=[RED_CHECK])
                    target.pop("isInMergeQueue")
                    live = {**target, "state": "OPEN", "isInMergeQueue": queue}
                    shell = Shell();module = fake_lane(shell);module.reconcile_fix_target = lambda _: live
                    with patch.object(runner, "sh", shell), patch.object(runner, "reconcile_fix_target", return_value=live), \
                            patch.object(runner, "claimed_elsewhere", return_value=False), \
                            patch.object(runner, "load_providers", return_value=PROVIDERS), patch.object(runner, "post_claim") as posted:
                        result = events.claim_event_pr(host, module, "devin", [target], NOW) if entrypoint == "event" else \
                            runner.claim_red_pr(host, "devin", [target])
                        self.assertIsNone(result);posted.assert_not_called()
                    self.assertFalse((host.state / "fix-attempts.json").exists())
                    self.assertEqual(shell.calls, []);self.assertEqual(module.posted, [])

    def test_unknown_cleanup_preserves_signals_without_querying_each_row(self):
        for target in (pr(kinds=["red"]), pr(kinds=["red"], draft=True, branch="human/work")):
            target.pop("isInMergeQueue")
            with tempfile.TemporaryDirectory() as tmp:
                shell = Shell();module = fake_lane(shell)
                module.reconcile_fix_target = Mock(side_effect=AssertionError("no cleanup row query"))
                self.assertIsNone(events.claim_event_pr(runner.Host(state=Path(tmp)), module, "devin", [target], NOW))
                self.assertEqual(shell.calls, [])

    def test_dequeue_log_read_cannot_charge_after_queue_or_preservation_changes(self):
        for change in ("queued", "unknown", "owner", "attempt", "hold", "head", "branch", "fork", "remote-hold"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp));target = pr(kinds=["dequeued"], merge="DIRTY")
                live = {**target, "state": "OPEN"};shell = Shell();module = fake_lane(shell)
                module.reconcile_fix_target = Mock(side_effect=lambda _: dict(live))
                def failure(*args):
                    if change in ("queued", "unknown"):live["isInMergeQueue"] = True if change == "queued" else None
                    elif change == "owner":module.claimed_elsewhere = lambda *args: True
                    elif change == "attempt":(host.state / "fix-attempts.json").write_text(json.dumps({"5": {"sha": "h1", "count": 2}}))
                    elif change == "head":live["headRefOid"] = "external"
                    elif change == "branch":live["headRefName"] = "external/branch"
                    elif change == "fork":live["isCrossRepository"] = True
                    elif change == "remote-hold":live["labels"] = [{"name": "tim-hold"}]
                    else:(host.state / "held.json").write_text(json.dumps({"5": events.held_record("h1", ["diff-too-large:100"])}))
                    return "failed merge group"
                with patch.object(events, "queue_failure", side_effect=failure):
                    self.assertIsNone(events.claim_event_pr(host, module, "devin", [target], NOW))
                self.assertEqual(module.reconcile_fix_target.call_count, 1 if change == "owner" else 2)
                self.assertEqual(shell.calls, []);self.assertEqual(module.posted, [])
                if change != "attempt":self.assertFalse((host.state / "fix-attempts.json").exists())
                else:self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text())["5"]["count"], 2)

    def test_last_target_read_follows_owner_and_no_remote_read_precedes_charge(self):
        for entrypoint in ("event", "poll"):
            with self.subTest(entrypoint=entrypoint), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp));target = pr(kinds=["red"], checks=[RED_CHECK])
                live = {**target, "state": "OPEN"};order = []
                def owner(*args):
                    order.append("owner");live["isInMergeQueue"] = True
                    return False
                def observe(_):order.append("target");return dict(live)
                shell = Shell();module = fake_lane(shell)
                module.claimed_elsewhere = owner;module.reconcile_fix_target = observe
                with patch.object(runner, "sh", shell), patch.object(runner, "reconcile_fix_target", side_effect=observe), \
                        patch.object(runner, "claimed_elsewhere", side_effect=owner), \
                        patch.object(runner, "load_providers", return_value=PROVIDERS):
                    selected = events.claim_event_pr(host, module, "devin", [target], NOW) if entrypoint == "event" else \
                        runner.claim_red_pr(host, "devin", [target])
                self.assertIsNone(selected);self.assertEqual(order, ["owner", "target"])
                self.assertFalse((host.state / "fix-attempts.json").exists());self.assertEqual(shell.calls, [])

    def test_fresh_scope_drift_never_spends(self):
        for entrypoint in ("event", "poll"):
            with self.subTest(entrypoint=entrypoint), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp));target = pr(branch="human/work", kinds=["red"], checks=[RED_CHECK])
                shell = Shell();module = fake_lane(shell);live = {**target, "state": "OPEN", "isDraft": True}
                module.reconcile_fix_target = lambda _: live
                with patch.object(runner, "sh", shell), patch.object(runner, "reconcile_fix_target", return_value=live), \
                        patch.object(runner, "claimed_elsewhere", return_value=False), \
                        patch.object(runner, "load_providers", return_value=PROVIDERS):
                    selected = events.claim_event_pr(host, module, "devin", [target], NOW) if entrypoint == "event" else \
                        runner.claim_red_pr(host, "devin", [target])
                self.assertIsNone(selected)
                self.assertFalse((host.state / "fix-attempts.json").exists());self.assertEqual(shell.calls, [])

    def test_polling_preserves_current_lane_branch_ownership_without_widening_event_scope(self):
        digest = "hyperagent/jov-9-abcdef123456789"
        cases = [
            ("devin", digest, PROVIDERS, True),  # disabled lane orphan
            ("hyperagent", digest, {**PROVIDERS, "hyperagent": {"enabled": True}}, True),
            ("devin", digest, {**PROVIDERS, "hyperagent": {"enabled": True}}, False),
            ("devin", "devin/jov-1-20260926t0900", PROVIDERS, True),
            ("devin", "codex/jov-1-20260926t0900", PROVIDERS, False),
            ("devin", digest + "x", PROVIDERS, False),
            ("devin", "devin/jov-9-abcdef123456789", PROVIDERS, False),
            ("devin", "human/work", PROVIDERS, False),
        ]
        for name, branch, providers, allowed in cases:
            with self.subTest(name=name, branch=branch, allowed=allowed), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                target = pr(branch=branch, draft=True, checks=[RED_CHECK])
                live = {**target, "state": "OPEN"};shell = Shell()
                with patch.object(runner, "sh", shell), patch.object(runner, "reconcile_fix_target", return_value=live), \
                        patch.object(runner, "claimed_elsewhere", return_value=False), \
                        patch.object(runner, "load_providers", return_value=providers), patch.object(runner, "post_claim") as posted:
                    selected = runner.claim_red_pr(host, name, [target])
                self.assertEqual(selected is not None, allowed)
                self.assertEqual(posted.call_count, int(allowed))
                path = host.state / "fix-attempts.json"
                self.assertEqual(path.exists(), allowed)
                if allowed:self.assertEqual(json.loads(path.read_text())["5"]["count"], 1)
                self.assertEqual(shell.calls, [])
        self.assertFalse(events.in_scope(pr(branch=digest, draft=True), "red", {"hyperagent"}),
                         "polling integration does not expand event ownership")

    def test_cleanup_production_list_rotates_refused_row_and_preserves_current_ownership(self):
        for first in ("queued", "unreadable", "owner"):
            with self.subTest(first=first), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                rows = [pr(number=n, labels=["lane-fix-red"], merge="CLEAN") for n in (5, 6)]
                for row in rows:row.pop("isInMergeQueue")
                shell = Shell({("gh", "pr", "list"): rows});module = fake_lane(shell);reads = []
                module.claimed_elsewhere = Mock(side_effect=lambda number, *args, **kw: number == 5 and first == "owner")
                def observe(target):
                    reads.append(target["number"])
                    if target["number"] == 5 and first == "unreadable":return None
                    return {**target, "state": "OPEN", "isInMergeQueue": target["number"] == 5 and first == "queued"}
                module.reconcile_fix_target = observe
                listed = events.queued_prs(module, events.FIX_KINDS)
                self.assertTrue(all("isInMergeQueue" not in row for row in listed))
                self.assertIsNone(events.cleanup_one_event(host, module, listed, 0))
                self.assertEqual(events.cleanup_one_event(host, module, listed, 60), 6)
                self.assertLessEqual(len(reads), 2)
                self.assertEqual([call.kwargs for call in module.claimed_elsewhere.call_args_list], [{"timeout": 30}] * 2)
                self.assertEqual(shell.made("gh", "api", "-X", "DELETE"),
                    [["gh", "api", "-X", "DELETE", f"repos/{runner.REPO_SLUG}/issues/6/labels/lane-fix-red"]])
                self.assertFalse((host.state / "fix-attempts.json").exists())

    def test_cleanup_unblocks_intake_beyond_the_existing_hundred_row_search(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = runner.Host(state=Path(tmp))
            backend = {n: pr(number=n, labels=["lane-fix-red"], merge="CLEAN",
                             checks=[RED_CHECK] if n == 105 else [], isInMergeQueue=n == 5)
                       for n in range(5, 106)}
            def listed(args):
                return [{key: value for key, value in row.items() if key != "isInMergeQueue"}
                        for row in backend.values() if "lane-fix-red" in events.label_names(row)][:100]
            def remove(args):
                number = int(args[4].split("/")[4]);backend[number]["labels"] = []
                return ""
            shell = Shell({("gh", "pr", "list"): listed, ("gh", "api", "-X", "DELETE"): remove})
            module = fake_lane(shell)
            module.reconcile_fix_target = lambda target: {**target,
                **{key: value for key, value in backend[target["number"]].items() if key != "eventKinds"}, "state": "OPEN"}
            selected = None
            for cycle in range(200):
                rows = events.queued_prs(module, events.FIX_KINDS)
                selected = events.claim_event_pr(host, module, "devin", rows, NOW + cycle * 60)
                if selected:break
                before = len(shell.made("gh", "api", "-X", "DELETE"))
                events.cleanup_one_event(host, module, rows, NOW + cycle * 60)
                self.assertLessEqual(len(shell.made("gh", "api", "-X", "DELETE")) - before, 1)
            self.assertIsNotNone(selected);self.assertEqual(selected["number"], 105)
            self.assertEqual(events.label_names(backend[5]), ["lane-fix-red"], "native queued row remains preserved")
            self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text()),
                             {"105": {"sha": "h1", "count": 1, "lane": "devin", "at": NOW + cycle * 60}})

    def test_cleanup_cached_false_never_overrides_live_queue_or_preservation(self):
        for change in ("queued", "spent", "active", "held", "new-head", "now-red", "exhaustion-label"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp));target = pr(kinds=["red"], labels=["lane-fix-red"], merge="CLEAN")
                shell = Shell();module = fake_lane(shell);live = {**target, "state": "OPEN"}
                def owner(*args, **kwargs):
                    if change == "queued":live["isInMergeQueue"] = True
                    elif change == "new-head":live["headRefOid"] = "h2"
                    elif change == "now-red":live["statusCheckRollup"] = [RED_CHECK]
                    elif change == "exhaustion-label":live["labels"] += [{"name": "lane-fix-exhausted"}]
                    elif change == "held":(host.state / "held.json").write_text(json.dumps({"5": events.held_record("h1", ["diff-too-large:100"])}))
                    else:(host.state / "fix-attempts.json").write_text(json.dumps({"5": {"sha": "h1", "count": 2 if change == "spent" else 1, "at": NOW}}))
                    return False
                module.claimed_elsewhere = owner;module.reconcile_fix_target = lambda _: live
                self.assertIsNone(events.cleanup_one_event(host, module, [target], NOW))
                self.assertEqual(shell.calls, []);self.assertEqual(module.posted, [])

    def test_natural_queue_exit_admits_once_with_same_preserved_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = runner.Host(state=Path(tmp));target = pr(kinds=["red"], checks=[RED_CHECK])
            shell = Shell();module = fake_lane(shell)
            live = {**target, "state": "OPEN", "isInMergeQueue": True}
            module.reconcile_fix_target = lambda _: dict(live)
            self.assertIsNone(events.claim_event_pr(host, module, "devin", [target], NOW))
            self.assertFalse((host.state / "fix-attempts.json").exists())
            live["isInMergeQueue"] = False
            self.assertEqual(events.claim_event_pr(host, module, "devin", [target], NOW)["number"], 5)
            self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text())["5"]["count"], 1)
            self.assertEqual(module.posted, [5])

if __name__ == "__main__":
    unittest.main()

class TerminalPreservationTest(unittest.TestCase):
    def test_external_head_waits_for_active_old_owner_before_event_or_worker_reentry(self):
        now = time.time()
        target = pr(sha="h1", merge="DIRTY", kinds=["conflict"], labels=["lane-fix-exhausted"])
        for entrypoint in ("event", "worker"):
            for count in (1, 2):
                with self.subTest(entrypoint=entrypoint, count=count), tempfile.TemporaryDirectory() as tmp:
                    host = runner.Host(state=Path(tmp))
                    path = host.state / "fix-attempts.json"
                    old = {"sha": "h0", "count": count, "at": now - 1, "lane": "devin"}
                    path.write_text(json.dumps({"5": old}))
                    shell = Shell()
                    module = fake_lane(shell)
                    owner = runner.Locked(host.state / "locks/repair-pr-5.lock", blocking=False)
                    with patch.object(runner, "load_providers", return_value=PROVIDERS), \
                         patch.object(runner, "claimed_elsewhere", return_value=False), \
                         patch.object(runner, "reconcile_fix_target", return_value={**target, "state": "OPEN"}), \
                         patch.object(runner, "sh", shell), patch.object(runner, "post_claim") as posts:
                        claim = lambda: (events.claim_event_pr(host, module, "codex", [target], now)
                                         if entrypoint == "event" else runner.claim_red_pr(host, "codex", [target]))
                        try:
                            self.assertIsNone(claim())
                            self.assertEqual(json.loads(path.read_text()), {"5": old})
                            self.assertEqual(shell.calls, [])
                            self.assertEqual(module.posted, [])
                            posts.assert_not_called()
                        finally:
                            owner.release()
                        path.write_text(json.dumps({"5": {**old, "endedAt": now}}))
                        self.assertEqual(claim()["headRefOid"], "h1")
                        saved = json.loads(path.read_text())["5"]
                        self.assertEqual((saved["sha"], saved["count"]), ("h1", 1))
                        self.assertEqual(saved["reentry"]["fromGeneration"]["head"], "h0")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = runner.Host(state=Path(self.tmp.name))

    def state(self, name, value):
        (self.host.state / name).write_text(json.dumps(value))

    def test_fresh_clean_reentry_cannot_spend_or_consume_exhaustion(self):
        target = pr(sha='h1', merge='DIRTY', kinds=['conflict'], labels=['lane-fix-exhausted'])
        history = {'5': {'sha': 'h0', 'count': 2, 'endedAt': NOW - 1}}
        self.state('fix-attempts.json', history)
        shell = Shell()
        lane = fake_lane(shell)
        lane.reconcile_fix_target = lambda _: {**target, 'state': 'OPEN', 'mergeStateStatus': 'CLEAN',
                                               'statusCheckRollup': []}
        self.assertIsNone(events.claim_event_pr(self.host, lane, 'devin', [target], NOW))
        self.assertEqual(json.loads((self.host.state / 'fix-attempts.json').read_text()), history)
        self.assertEqual(shell.calls, [])
        self.assertEqual(lane.posted, [])

    def test_atomic_reentry_preserves_other_rows_and_rejects_changed_target(self):
        target = pr(sha='h1', merge='DIRTY', kinds=['conflict'], labels=['lane-fix-exhausted'])
        old = {'sha': 'h0', 'count': 2, 'endedAt': NOW - 1}
        other = {'sha': 'other', 'count': 1, 'at': NOW}
        path = self.host.state / 'fix-attempts.json'
        self.state('fix-attempts.json', {'5': old, '9': other})
        self.assertTrue(events.charge_reentry(runner, path, target, old, 'devin', NOW))
        saved = json.loads(path.read_text())
        self.assertEqual(saved['9'], other)
        self.assertEqual(saved['5']['reentry']['fromGeneration']['head'], 'h0')
        self.assertFalse(events.charge_reentry(runner, path, target, old, 'codex', NOW + 1))
        self.assertEqual(json.loads(path.read_text()), saved)

    def test_clean_and_queued_observations_preserve_terminal_work_for_two_cycles(self):
        records = [
            {'sha': 'h1', 'count': 2},
            {'sha': 'h0', 'pushedHead': 'h1', 'count': 2},
            {'count': 2},
            {'sha': 'h0', 'pushed': True, 'count': 2},
            {},
        ]
        for record in records:
            with self.subTest(record=record):
                target = pr(draft=True, merge='CLEAN', labels=['lane-fix-exhausted', 'lane-fix-green'],
                            updatedAt='2020-01-01T00:00:00Z', isInMergeQueue=True)
                before = {'5': record}
                self.state('fix-attempts.json', before)
                self.state('synced.json', {'5': {'from': 'h1'}})
                shell, lane = Shell(), None
                lane = fake_lane(shell)
                with patch.object(events, 'open_prs_state', return_value=[target]):
                    for now in (NOW, NOW + 3600):
                        report = events.reconcile(self.host, lane, lambda: None, now, force=True)
                        self.assertEqual(report['closed'], [])
                        self.assertTrue(report['dispositions'][0]['state'].startswith('hold:'))
                self.assertEqual(json.loads((self.host.state/'fix-attempts.json').read_text()), before)
                self.assertIsNone(events.claim_event_pr(self.host, lane, 'devin', [target], NOW + 4000))
                self.assertFalse(shell.made('gh', 'api', '-X', 'DELETE'))
                self.assertFalse(shell.made('gh', 'pr', 'close'))
                self.assertEqual(lane.posted, [])

    def test_tick_cannot_ready_close_or_sync_terminal_or_explicitly_held_work(self):
        for labels, record in [(['lane-fix-exhausted'], {}), ([], {'sha':'h1','count':2}),
                               (['Tim:Hold'], {}), ([], {'sha':'h1','count':1,'at':NOW-1})]:
            with self.subTest(labels=labels,record=record):
                self.state('fix-attempts.json', {'5': record})
                target = pr(branch='claude/jov-1-20260926t0900', draft=True, merge='CLEAN',
                            kinds=['green','orphan','dequeued'], labels=labels)
                shell = Shell()
                with patch.object(events,'reconcile',return_value=None), patch.object(events,'queued_prs',return_value=[target]):
                    outcome = events.tick(self.host,fake_lane(shell),lambda: self.fail('must not load Linear'),NOW)
                self.assertTrue(outcome[5].startswith('held:'))
                # The tick reads open symphony-remediation issues. That read is not
                # ready, merge, close, update-branch, or label consumption.
                self.assertEqual(shell.calls, [[
                    "gh", "issue", "list", "--repo", "JovieInc/Jovie", "--state", "open",
                    "--label", "symphony-remediation", "--limit", "30",
                    "--json", "number,title,body,updatedAt",
                ]])

    def test_direct_helpers_cannot_bypass_missing_history_exhaustion(self):
        target = pr(draft=True,merge='CLEAN',labels=['lane-fix-exhausted'])
        shell, lane = Shell(), None
        lane = fake_lane(shell)
        self.assertTrue(events.ready_green(self.host,lane,target,{},NOW).startswith('held:'))
        self.assertTrue(events.sync_main(self.host,lane,target,NOW).startswith('held:'))
        self.assertTrue(events.retire_orphan(lane,None,target,[target],host=self.host,now=NOW).startswith('held:'))
        self.assertFalse(events.return_to_pool(lane,None,target,'superseded',host=self.host,now=NOW))
        self.assertEqual(shell.calls, [])

    def test_claim_requires_head_history_and_persists_reentry_before_exhaustion_removal(self):
        target = pr(merge='DIRTY',kinds=['conflict'],labels=['lane-fix-exhausted'])
        for old in [{}, {'count':2}, {'sha':'','count':2}, {'sha':'h0','count':2,'pushed':True},
                    {'sha':'h0','count':2,'pushedHead':'h1'}]:
            self.state('fix-attempts.json', {'5':old})
            shell=Shell()
            self.assertIsNone(events.claim_event_pr(self.host,fake_lane(shell),'devin',[target],NOW))
            self.assertEqual(shell.calls, [])
        old={'sha':'h0','count':2,'endedAt':NOW-1}
        self.state('fix-attempts.json', {'5':old})
        class ReceiptShell(Shell):
            def __call__(inner,args,**kwargs):
                if args[-1].endswith('/lane-fix-exhausted'):
                    saved=json.loads((self.host.state/'fix-attempts.json').read_text())['5']
                    self.assertEqual(saved['reentry']['fromGeneration']['head'],'h0')
                    self.assertEqual(saved['reentry']['toGeneration']['head'],'h1')
                    self.assertEqual(saved['count'],1)
                return super(ReceiptShell,inner).__call__(args,**kwargs)
        shell=ReceiptShell();lane=fake_lane(shell)
        self.assertEqual(events.claim_event_pr(self.host,lane,'devin',[target],NOW)['number'],5)
        self.assertFalse(any(call[-1].endswith('/lane-fix-conflict') for call in shell.calls),
                         'the repair signal remains until the worker publishes a new head')
        saved=json.loads((self.host.state/'fix-attempts.json').read_text())
        receipt=saved['5']['reentry']
        saved['5'].update(endedAt=NOW+1,pushedHead='h2',pushed=True)
        events.record_attempt(saved,5,'h2','codex',NOW+2)
        self.assertEqual(saved['5']['count'],2)
        self.assertEqual(saved['5']['reentry'],receipt,'later self-pushed-head attempt retains the material-change proof')

    def test_clean_external_head_cannot_invent_reentry_to_consume_exhaustion(self):
        self.state('fix-attempts.json', {'5':{'sha':'h0','count':2,'endedAt':NOW-1}})
        target=pr(merge='CLEAN',kinds=['green'],draft=True,labels=['lane-fix-exhausted'])
        shell=Shell()
        self.assertIsNone(events.claim_event_pr(self.host,fake_lane(shell),'devin',[target],NOW))
        self.assertTrue(events.ready_green(self.host,fake_lane(shell),target,{},NOW).startswith('held:'))
        self.assertEqual(shell.calls,[])

    def test_stale_supersession_preserves_live_local_and_remote_owners(self):
        old=pr(draft=True,labels=['duplicate'],updatedAt='2020-01-01T00:00:00Z')
        newer=pr(number=6,draft=False,merge='CLEAN')
        record={'sha':'h1','count':1,'at':NOW-1}
        plan=events.reconcile_plan([old,newer],{'5':record},set(),2,NOW)
        self.assertEqual(plan['close'],[])
        self.state('fix-attempts.json',{})
        shell=Shell()
        with patch.object(events,'open_prs_state',return_value=[old,newer]):
            report=events.reconcile(self.host,fake_lane(shell,claimed=True),lambda:None,NOW,force=True)
        self.assertEqual(report['closed'],[])
        self.assertFalse(shell.made('gh','pr','close'))

    def test_terminal_work_never_reaches_stale_hold_alert_or_auto_unhold(self):
        target=pr(merge='CLEAN',labels=['hold','lane-fix-exhausted'])
        self.state('fix-attempts.json',{'5':{'sha':'h1','count':2}})
        shell=Shell()
        with patch.object(events,'open_prs_state',return_value=[target]), \
             patch.object(events,'stale_hold',side_effect=AssertionError('terminal hold cannot become unhold advice')), \
             patch.dict(os.environ,{'LANES_STALE_HOLD_UNHOLD':'1'}):
            report=events.reconcile(self.host,fake_lane(shell),lambda:None,NOW,force=True)
        self.assertEqual(report['staleHolds'],[])
        self.assertEqual(shell.calls,[])

    def test_success_observation_clears_only_sync_metadata(self):
        target=pr(merge='CLEAN',isInMergeQueue=True)
        history={'5':{'sha':'h1','count':1,'endedAt':NOW-1,'reentry':{'evidence':'retained'}}}
        self.state('fix-attempts.json',history);self.state('synced.json',{'5':{'from':'h0'}})
        with patch.object(events,'open_prs_state',return_value=[target]):
            events.reconcile(self.host,fake_lane(Shell()),lambda:None,NOW,force=True)
        self.assertEqual(json.loads((self.host.state/'fix-attempts.json').read_text()),history)
        self.assertEqual(json.loads((self.host.state/'synced.json').read_text()),{})

    def test_multiple_prs_retain_policy_hold_map_and_truthful_disposition(self):
        ordinary=pr(number=1,merge='BLOCKED',updatedAt='2020-01-01T00:00:00Z')
        target=pr(number=5,draft=True,updatedAt='2020-01-01T00:00:00Z')
        newer=pr(number=6,merge='CLEAN')
        held={'5':events.held_record('h1',['diff-too-large:2001'],at=NOW-500)}
        plan=events.reconcile_plan([ordinary,target,newer],{},set(),2,NOW,held=held)
        self.assertEqual(plan['close'],[])
        row=next(x for x in plan['dispositions'] if x['pr']==5)
        self.assertEqual(row['state'],'hold:diff-too-large')

    def test_stale_unhold_preserves_changed_head_local_owner_and_foreign_owner(self):
        for record, foreign in [({'sha':'h0','count':1,'at':NOW-1},False), ({},True)]:
            with self.subTest(record=record,foreign=foreign):
                target=pr(sha='h1',merge='CLEAN',labels=['hold'])
                self.state('fix-attempts.json',{'5':record})
                shell=Shell()
                with patch.object(events,'open_prs_state',return_value=[target]), \
                     patch.object(events,'stale_hold',side_effect=AssertionError('active work cannot become unhold advice')), \
                     patch.dict(os.environ,{'LANES_STALE_HOLD_UNHOLD':'1'}):
                    report=events.reconcile(self.host,fake_lane(shell,claimed=foreign),lambda:None,NOW,force=True)
                self.assertEqual(report['staleHolds'],[])
                self.assertEqual(shell.calls,[])

    def test_cached_old_head_cannot_reset_or_unlabel_current_terminal_generation(self):
        target=pr(sha='cached-h1',merge='DIRTY',kinds=['conflict'],labels=['lane-fix-exhausted'])
        history={'5':{'sha':'current-h2','count':2,'endedAt':NOW-1}}
        for observed in [None,{**target,'state':'OPEN','headRefOid':'current-h2'},
                         {**target,'state':'CLOSED'},{**target,'state':'OPEN','labels':[{'name':'Tim:Hold'}]}]:
            with self.subTest(observed=observed):
                self.state('fix-attempts.json',history)
                shell=Shell();lane=fake_lane(shell);lane.reconcile_fix_target=lambda pr:observed
                self.assertIsNone(events.claim_event_pr(self.host,lane,'devin',[target],NOW))
                self.assertEqual(json.loads((self.host.state/'fix-attempts.json').read_text()),history)
                self.assertFalse(shell.calls)
                self.assertFalse(lane.posted)


class GreenPublicationProofTest(unittest.TestCase):
    def test_spent_final_self_push_can_publish_then_requeue_without_another_repair(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = runner.Host(state=Path(tmp))
            target = pr(draft=True, merge="CLEAN", kinds=["green", "dequeued"], labels=["lane-fix-green"])
            history = {"5": {"sha": "prior", "count": 2, "pushed": True, "pushedHead": "h1", "endedAt": time.time() - 1}}
            (host.state / "fix-attempts.json").write_text(json.dumps(history))
            proof = {"schema": runner.GATE_RESULT_SCHEMA, "headSha": "h1", "verdict": "verified-not-queued",
                     "completedAt": runner.now_iso(), "policyDigest": runner.GATE_POLICY_DIGEST, "sensitive": False}
            (host.state / "verified.json").write_text(json.dumps({"5:h1": proof}))
            shell = Shell({("gh", "pr", "merge"): (1, "temporary failure")})
            with patch.object(events, "reconcile", return_value=None), patch.object(events, "queued_prs", return_value=[target]):
                outcome = events.tick(host, fake_lane(shell), lambda: self.fail("no retirement"), NOW)
            self.assertEqual(outcome[5], "verified-not-queued")
            self.assertEqual(json.loads((host.state / "requeue.json").read_text()), {"5": "h1"})
            self.assertFalse(any("update-branch" in " ".join(call) for call in shell.calls))
            self.assertEqual(len(shell.made("gh", "api", "-X", "DELETE")), 1, "consume only green")
            shell = Shell()
            with patch.object(runner, "sh", shell), patch.object(runner, "claimed_elsewhere", return_value=False), \
                 patch.object(runner, "reconcile_fix_target", return_value={**target, "state": "OPEN", "isDraft": False}):
                runner.requeue_verified(host, [target])
            self.assertEqual(json.loads((host.state / "requeue.json").read_text()), {})
            self.assertEqual(json.loads((host.state / "fix-attempts.json").read_text()), history)
            self.assertEqual(shell.made("gh", "pr", "ready"), [])
            self.assertEqual(shell.made("gh", "pr", "merge")[0][-2:], ["--match-head-commit", "h1"])

    def test_actual_tick_retains_green_event_without_terminal_proof_or_with_active_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = runner.Host(state=Path(tmp))
            target = pr(draft=True, merge='CLEAN', kinds=['green'], labels=['lane-fix-green'])
            for busy in (False, True):
                shell = Shell()
                lane = fake_lane(shell)
                claim = runner.reserve_gate(host, target) if busy else None
                try:
                    with patch.object(events,'reconcile',return_value=None), patch.object(events,'queued_prs',return_value=[target]):
                        outcome = events.tick(host,lane,lambda:None,NOW)
                    self.assertTrue(outcome[5].startswith('held:'))
                    # The normal remediation read is allowed; every publication,
                    # label, closure, sync and other command remains forbidden.
                    self.assertEqual(shell.calls, [[
                        "gh", "issue", "list", "--repo", "JovieInc/Jovie", "--state", "open",
                        "--label", "symphony-remediation", "--limit", "30",
                        "--json", "number,title,body,updatedAt",
                    ]])
                    self.assertFalse((host.state/'runs/ledger.jsonl').exists())
                finally:
                    if claim:claim.lock.release()
