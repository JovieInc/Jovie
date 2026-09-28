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
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    def made(self, *prefix):
        return [call for call in self.calls if tuple(call[:len(prefix)]) == prefix]


def fake_lane(shell, claimed=False):
    posted = []
    module = SimpleNamespace(
        sh=shell, REPO_SLUG=runner.REPO_SLUG, PR_FIELDS=runner.PR_FIELDS, RED=runner.RED,
        MAX_FIX_ATTEMPTS=runner.MAX_FIX_ATTEMPTS, held_path=runner.held_path, update_json=runner.update_json,
        now_iso=runner.now_iso, best_per_issue=runner.best_per_issue, load_providers=lambda: PROVIDERS,
        claimed_elsewhere=lambda number, sha, kind: claimed, post_claim=lambda number, sha, kind: posted.append(number))
    module.posted = posted
    return module


def pr(number=5, branch="devin/jov-1-20260926t0900", sha="h1", draft=False, merge="BLOCKED", kinds=(), checks=(),
       labels=None, **extra):
    return {"number": number, "headRefName": branch, "headRefOid": sha, "isDraft": draft, "mergeStateStatus": merge,
            "statusCheckRollup": list(checks), "eventKinds": list(kinds), "url": f"https://x/pull/{number}",
            "labels": [{"name": name} for name in (labels or [])], "isCrossRepository": False, **extra}


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
                         {"reason": "no-change", "next_action": "triage"})
        self.assertEqual(events.failure_reason({"verdict": "held", "reasons": ["code-change-without-test"]}, False)["reason"],
                         "missing-test")
        self.assertEqual(events.failure_reason({"verdict": "failed"}, False)["reason"], "failed")

    def test_held_counts_classify_legacy_records_and_skip_closed_prs(self):
        held = {"1": {"sha": "a", "evidence": ["gate-timeout:x3"]}, "2": {"sha": "b", "reason": "missing-test"},
                "3": {"sha": "c", "evidence": ["check-failed:x"]}}
        self.assertEqual(events.by_reason(held), {"gate-check-failed": 1, "gate-timeout": 1, "missing-test": 1})
        self.assertEqual(events.by_reason(held, {2, 3}), {"gate-check-failed": 1, "missing-test": 1})


class RelayTest(unittest.TestCase):
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
        self.assertIn("claude", events.disabled_lanes())

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

    def test_a_second_failed_ejection_in_a_day_marks_the_pr_queue_poison(self):
        now = time.time()
        stamp = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - ago))
        view = {"state": "OPEN", "isDraft": False, "headRefName": "tim/fix", "headRefOid": "h7",
                "isCrossRepository": False, "labels": []}
        payload = {"action": "dequeued", "pull_request": {"number": 7, "head": {"sha": "h7"}}}

        def relay_with(removals, labels=()):
            shell = Shell({("gh", "pr", "view"): {**view, "labels": [{"name": n} for n in labels]},
                           ("gh", "api", "graphql"): removals})
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

    def test_a_push_to_main_labels_newly_conflicting_prs_after_mergeability_settles(self):
        reads = iter([
            [{"number": 5, "headRefName": "tim/fix", "isDraft": False, "mergeable": "UNKNOWN", "labels": []}],
            [{"number": 5, "headRefName": "tim/fix", "isDraft": False, "mergeable": "CONFLICTING", "labels": []},
             {"number": 6, "headRefName": "tim/other", "isDraft": False, "mergeable": "CONFLICTING",
              "labels": [{"name": "lane-fix-conflict"}]}],
        ])
        shell = Shell({("gh", "pr", "list"): lambda args: next(reads)})
        added = events.label_backlog(shell, set(), kinds=("conflict",), settle_s=0.01)
        self.assertEqual(added, [(5, "conflict")])
        self.assertEqual(len(shell.made("gh", "pr", "list")), 2)

    def test_backfill_labels_green_lane_drafts_and_orphans(self):
        prs = [
            {"number": 1, "headRefName": "devin/jov-1-20260926t0900", "isDraft": True, "mergeStateStatus": "CLEAN"},
            {"number": 2, "headRefName": "claude/jov-2-20260926t0900", "isDraft": True, "mergeStateStatus": "BLOCKED"},
            {"number": 3, "headRefName": "claude/laughing-franklin", "isDraft": True, "mergeStateStatus": "CLEAN"},
        ]
        self.assertEqual(events.backlog_targets(prs, {"claude"}), [(1, "green"), (2, "orphan")])

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

    def test_an_event_pr_is_claimed_first_recorded_and_its_label_consumed(self):
        shell = Shell()
        lane = fake_lane(shell)
        runner.record_held(self.host, 5, "h1", ["check-failed:x", "boom"])
        claimed = events.claim_event_pr(self.host, lane, "devin", [pr(kinds=["red"], checks=[RED_CHECK])], NOW)
        self.assertEqual((claimed["number"], claimed["gateEvidence"][1]), (5, "boom"))
        self.assertEqual(self.attempts()["5"], {"sha": "h1", "count": 1, "lane": "devin", "at": NOW})
        self.assertEqual(lane.posted, [5])
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"),
                         [["gh", "api", "-X", "DELETE", f"repos/{runner.REPO_SLUG}/issues/5/labels/lane-fix-red"]])

    def test_an_unfixable_hold_consumes_the_label_without_an_attempt(self):
        shell = Shell()
        runner.record_held(self.host, 5, "h1", ["diff-too-large:2000"])
        claimed = events.claim_event_pr(self.host, fake_lane(shell), "devin",
                                        [pr(kinds=["red"], checks=[RED_CHECK])], NOW)
        self.assertIsNone(claimed, "a hold no push clears (diff-too-large) never reaches the fix loop")
        self.assertEqual(self.attempts(), {})
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"),
                         [["gh", "api", "-X", "DELETE", f"repos/{runner.REPO_SLUG}/issues/5/labels/lane-fix-red"]])

    def test_a_fixable_hold_still_reaches_the_fix_loop(self):
        shell = Shell()
        lane = fake_lane(shell)
        runner.record_held(self.host, 5, "h1", ["code-change-without-test"])
        claimed = events.claim_event_pr(self.host, lane, "devin", [pr(kinds=["red"], checks=[RED_CHECK])], NOW)
        self.assertEqual(claimed["number"], 5)

    def test_labels_whose_pr_no_longer_needs_work_are_consumed(self):
        shell = Shell()
        green = pr(kinds=["red"], checks=[{"conclusion": "SUCCESS"}])
        resolved = pr(number=6, kinds=["conflict"], merge="CLEAN")
        human_draft = pr(number=7, branch="tim/wip", draft=True, kinds=["review"])
        self.assertIsNone(events.claim_event_pr(self.host, fake_lane(shell), "devin", [green, resolved, human_draft], NOW))
        self.assertEqual(len(shell.made("gh", "api", "-X", "DELETE")), 3)

    def test_spent_and_already_tried_heads_keep_their_label_and_wait(self):
        shell = Shell()
        self.attempts({"5": {"sha": "h0", "count": 2}, "6": {"sha": "h1", "count": 1}})
        waiting = [pr(kinds=["conflict"], merge="DIRTY"), pr(number=6, kinds=["dequeued"])]
        self.assertIsNone(events.claim_event_pr(self.host, fake_lane(shell), "devin", waiting, NOW))
        self.assertEqual(shell.made("gh", "api", "-X", "DELETE"), [], "no relabel churn on every push to main")

    def test_the_second_attempt_escalates_to_the_next_lane_in_cost_order(self):
        self.attempts({"5": {"sha": "h0", "count": 1, "lane": "devin", "at": NOW - 60}})
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

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_clean_lane_draft_is_readied_with_its_merge_intent(self):
        shell = Shell()
        outcome = events.ready_green(self.host, fake_lane(shell), pr(draft=True, merge="CLEAN"), {}, NOW)
        self.assertEqual(outcome, "landing")
        self.assertEqual([call[:3] for call in shell.calls], [["gh", "pr", "ready"], ["gh", "pr", "merge"]])
        ledger = [json.loads(line) for line in (self.host.state / "runs/ledger.jsonl").read_text().splitlines()]
        self.assertEqual((ledger[0]["kind"], ledger[0]["verdict"]), ("ready-green", "landing"))

    def test_a_failed_enqueue_is_handed_to_the_requeue_retry(self):
        shell = Shell({("gh", "pr", "merge"): (1, "")})
        self.assertEqual(events.ready_green(self.host, fake_lane(shell), pr(draft=True, merge="CLEAN"), {}, NOW),
                         "verified-not-queued")
        self.assertEqual(json.loads((self.host.state / "requeue.json").read_text()), {"5": "h1"})

    def test_diff_policy_holds_stand_but_green_ci_supersedes_the_local_gate(self):
        draft = pr(draft=True, merge="CLEAN")
        policy = {"5": events.held_record("h1", ["code-change-without-test"])}
        self.assertEqual(events.ready_green(self.host, fake_lane(Shell()), draft, policy, NOW), "held:missing-test")
        legacy_timeout = {"5": {"sha": "h1", "evidence": ["gate-timeout:x3"]}}
        self.assertEqual(events.ready_green(self.host, fake_lane(Shell()), draft, legacy_timeout, NOW), "landing")
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
        orphan = pr(number=2, branch="claude/jov-9-20260926t0100", draft=True)
        newer = {"number": 3, "headRefName": "devin/jov-9-20260926t0500", "isDraft": False, "mergeStateStatus": "CLEAN"}
        shell = Shell()
        self.assertEqual(events.retire_orphan(fake_lane(shell), self.linear(), orphan, [orphan, newer]), "superseded-by:3")
        self.assertIn("superseded by #3", shell.made("gh", "pr", "close")[0][-1])
        shell = Shell()
        self.assertEqual(events.retire_orphan(fake_lane(shell), self.linear("completed", "Done"), orphan, [orphan]),
                         "issue-done")
        self.assertEqual(len(shell.made("gh", "pr", "close")), 1)
        shell = Shell()
        self.assertEqual(events.retire_orphan(fake_lane(shell), self.linear(), orphan, [orphan]), "adopted")
        self.assertEqual((shell.made("gh", "pr", "close"), len(shell.made("gh", "pr", "comment"))), ([], 1))
        self.assertEqual(events.retire_orphan(fake_lane(Shell()), self.linear(), pr(branch="claude/x"), []), "not-a-lane-pr")
        broken = SimpleNamespace(gql=lambda *a: (_ for _ in ()).throw(RuntimeError("down")))
        self.assertEqual(events.retire_orphan(fake_lane(Shell()), broken, orphan, [orphan]), "linear-unreadable")

    def test_an_exhausted_orphan_is_closed_and_its_issue_returned_to_todo(self):
        shell, linear = Shell(), self.linear()
        events.return_to_pool(fake_lane(shell), linear, pr(branch="hyperagent/jov-9-20260926t0100"), "after two attempts")
        self.assertEqual(len(shell.made("gh", "pr", "close")), 1)
        self.assertEqual(linear.calls.moves, [("iss", "Todo")])
        done = self.linear("completed", "Done")
        events.return_to_pool(fake_lane(Shell()), done, pr(branch="hyperagent/jov-9-20260926t0100"), "x")
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
        self.assertEqual(plan["label"], [(1, "conflict"), (2, "red"), (9, "green"), (12, "stale"),
                                         (15, "dequeued")])
        self.assertEqual(plan["close"], [(10, "superseded by #12 for the same issue"),
                                         (11, "stale for 48h after its fix attempts ran out")])
        self.assertEqual(plan["reset"], [3, 4, 9])
        self.assertEqual(plan["unlabel"], [(3, "exhausted")])
        self.assertEqual(plan["orphans"], [4, 8], "CLEAN but unqueued, and a spent fix label, have no owner")
        counts = plan["counts"]
        self.assertEqual((counts["open"], counts["dirty"], counts["red"], counts["cleanNotQueued"], counts["inQueue"],
                          counts["staleLaneDrafts"], counts["staleOtherDrafts"]), (15, 2, 2, 1, 1, 3, 1))

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
        record = events.reconcile(self.host, fake_lane(shell), lambda: linear, NOW)
        self.assertEqual(record["counts"]["dirty"], 1)
        self.assertIn(["gh", "api", "-X", "POST", f"repos/{events.REPO}/issues/1/labels", "-f", "labels[]=lane-fix-conflict"],
                      shell.calls)
        self.assertEqual(json.loads((self.host.state / "fix-attempts.json").read_text()), {"10": {"count": 2}},
                         "a PR that reached the queue starts a fresh episode")
        self.assertEqual(record["closed"], [10])
        self.assertIsNone(events.reconcile(self.host, fake_lane(shell), lambda: linear, NOW + 60), "one sweep per window")
        broken = Shell({("gh", "api", "graphql"): (1, "")})
        self.assertIsNone(events.reconcile(self.host, fake_lane(broken), lambda: linear, NOW, force=True))
        no_linear = Shell({("gh", "api", "graphql"): page})
        events.reconcile(self.host, fake_lane(no_linear), lambda: (_ for _ in ()).throw(OSError("x")), NOW, force=True)
        self.assertEqual(len(no_linear.made("gh", "pr", "close")), 1, "closing never waits on Linear")

    def test_open_prs_are_read_page_by_page(self):
        pages = iter([
            {"data": {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": True, "endCursor": "c1"},
                                                      "nodes": [{"number": 1, "labels": {"nodes": [{"name": "hold"}]}}]}}}},
            {"data": {"repository": {"pullRequests": {"pageInfo": {"hasNextPage": False, "endCursor": None},
                                                      "nodes": [{"number": 2}]}}}},
        ])
        shell = Shell({("gh", "api", "graphql"): lambda args: next(pages)})
        prs = events.open_prs_state(fake_lane(shell))
        self.assertEqual([(p["number"], p["labels"], p["rollup"]) for p in prs], [(1, [{"name": "hold"}], None), (2, [], None)])
        self.assertIn("cursor=c1", shell.calls[1])

    def test_fix_prompt_carries_stale_and_queue_log_and_lockfile_recipe(self):
        prompt = runner.render_fix_prompt({**pr(kinds=["dequeued", "stale"], merge="DIRTY"), "title": "t",
                                           "queueFailure": "### merge group: CI\nboom"}, "")
        self.assertIn("boom", prompt)
        self.assertIn("no activity for 48 hours", prompt)
        self.assertIn("pnpm install --lockfile-only", prompt)


class RunnerHookTest(unittest.TestCase):
    """The hook-in points in lane_runner.py: structured held records, exhausted orphans, the tick."""

    def test_record_held_and_failures_are_structured(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = runner.Host(state=Path(tmp))
            runner.record_held(host, 9, "h9", ["diff-too-large:3000"])
            record = json.loads((host.state / "held.json").read_text())["9"]
            self.assertEqual((record["reason"], record["next_action"]), ("diff-too-large", "bug-intake"))

    def test_an_exhausted_orphan_is_escalated_then_returned_to_the_pool(self):
        stuck = pr(number=7, branch="claude/jov-9-20260926t0100", merge="DIRTY", title="orphan")
        calls = []
        saved = (runner.sh, runner.load_providers, events.return_to_pool)
        runner.sh = lambda args, **k: calls.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        runner.load_providers = lambda: PROVIDERS
        returned = []
        events.return_to_pool = lambda lane, linear, pr, why: returned.append(pr["number"])
        triaged = []
        linear = SimpleNamespace(create_triage=lambda title, body: triaged.append(body))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                (host.state / "fix-attempts.json").write_text(json.dumps({"7": {"sha": "h0", "count": 2}}))
                runner.escalate_exhausted(host, [stuck], linear)
                held = json.loads((host.state / "held.json").read_text())["7"]
        finally:
            runner.sh, runner.load_providers, events.return_to_pool = saved
        self.assertEqual(returned, [7])
        self.assertIn(["gh", "api", "-X", "POST", f"repos/{events.REPO}/issues/7/labels", "-f",
                       "labels[]=lane-fix-exhausted"], calls, "held with a reason, visible on the PR")
        self.assertIn("jovie.bug-report/v1", triaged[0])
        self.assertEqual((held["reason"], held["sha"]), ("fix-exhausted", "h1"))

    def test_an_unfixable_hold_escalates_once_without_burning_attempts(self):
        stuck = pr(number=7, title="big diff")
        calls, triaged = [], []
        saved = (runner.sh, runner.load_providers, events.return_to_pool)
        runner.sh = lambda args, **k: calls.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        runner.load_providers = lambda: PROVIDERS
        events.return_to_pool = lambda *a: None
        linear = SimpleNamespace(create_triage=lambda title, body: triaged.append(title))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                runner.record_held(host, 7, "h1", ["diff-too-large:2000"])
                runner.escalate_exhausted(host, [stuck], linear)
                runner.escalate_exhausted(host, [stuck], linear)  # intake once, not every pass
                held = json.loads((host.state / "held.json").read_text())["7"]
                attempts = json.loads((host.state / "fix-attempts.json").read_text())["7"]
        finally:
            runner.sh, runner.load_providers, events.return_to_pool = saved
        self.assertEqual(len(triaged), 1)
        self.assertIn("Unfixable gate hold", triaged[0])
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
        saved = (runner.load_providers, runner.sh, runner.doctor.run, events.tick)
        runner.load_providers = lambda: {}
        runner.sh = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        runner.doctor.run = lambda *a, **k: {}
        events.tick = lambda *a: (_ for _ in ()).throw(RuntimeError("gh down"))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp), repo=Path(tmp))
                self.assertEqual(runner.dispatch(host), 0)
                tick = json.loads((host.state / "tick.json").read_text())
        finally:
            runner.load_providers, runner.sh, runner.doctor.run, events.tick = saved
        self.assertIn("gh down", tick["eventsError"])


if __name__ == "__main__":
    unittest.main()
