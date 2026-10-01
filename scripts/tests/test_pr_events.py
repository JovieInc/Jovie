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
from unittest.mock import patch
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
        claimed_elsewhere=lambda number, sha, kind: claimed, post_claim=lambda number, sha, kind: posted.append(number),
        publication_revocation=runner.publication_revocation)
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
                         {"reason": "no-change", "next_action": "backlog-disposition"})
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
                          counts["staleLaneDrafts"], counts["staleOtherDrafts"],
                          counts["staleAgentDrafts"]), (15, 2, 2, 1, 1, 3, 0, 1),
                         "a stale agent-owned draft (tim/wip) is counted separately from a human's")

    def test_an_abandoned_agent_draft_is_closed_or_held_on_a_live_dependency(self):
        """JOV-7079 canary: an old non-lane agent draft cannot sit forever. Past the 7d SLO
        and stalled it is closed unless a dependency it names is still open."""
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
        self.assertEqual(plan["close"],
                         [(20, "abandoned agent draft: open 17d with no advancing event and no open dependency"),
                          (21, "abandoned agent draft: open 17d with no advancing event and no open dependency")])
        self.assertEqual(plan["depHolds"], [(22, [9])])
        counts = plan["counts"]
        self.assertEqual((counts["staleAgentDrafts"], counts["staleOtherDrafts"]), (2, 1))
        states = {row["pr"]: row["state"] for row in plan["dispositions"]}
        self.assertEqual(states[20], "closing")
        self.assertEqual(states[22], "hold:dependency")
        self.assertEqual(states[24], "draft")
        # the fixture: once the dependency is gone (merged/closed), the same draft reverts to
        # abandoned and closes — the historical note is never authoritative for weeks
        landed = events.reconcile_plan(prs, {}, set(), 2, now, deps={})
        self.assertIn((22, "abandoned agent draft: open 17d with no advancing event and no open dependency"),
                      landed["close"])

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
        self.assertEqual(rows[31]["next"], "closes as abandoned at the 7d age SLO")

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

    def hold_ctx(self, events_list, notes=(), committed="2033-05-18T00:00:00Z", oid="h"):
        """A canned hold_context GraphQL reply: labeled events, comments, last commit."""
        return {"data": {"repository": {"pullRequest": {
            "timelineItems": {"nodes": [{"createdAt": at, "label": {"name": label},
                                         "actor": {"login": actor}} for at, label, actor in events_list]},
            "comments": {"nodes": [{"createdAt": at, "author": {"login": who}, "body": body}
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

    def test_an_exhausted_orphan_is_escalated_then_returned_to_the_pool(self):
        stuck = pr(number=7, branch="claude/jov-9-20260926t0100", merge="DIRTY", title="orphan")
        calls = []
        saved = (runner.sh, runner.load_providers, events.return_to_pool)
        runner.sh = lambda args, **k: calls.append(args) or SimpleNamespace(returncode=0, stderr="", stdout="")
        runner.load_providers = lambda: PROVIDERS
        returned = []
        events.return_to_pool = lambda lane, linear, pr, why: returned.append(pr["number"])
        triaged = []
        linear = SimpleNamespace(create_triage=lambda title, body, dedupe=None: triaged.append(body))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                host = runner.Host(state=Path(tmp))
                # `pushed` marks a head the fix loop may have produced itself: still terminal.
                (host.state / "fix-attempts.json").write_text(json.dumps(
                    {"7": {"sha": "h0", "count": 2, "pushed": True}}))
                runner.escalate_exhausted(host, [stuck], linear)
                held = json.loads((host.state / "held.json").read_text())["7"]
        finally:
            runner.sh, runner.load_providers, events.return_to_pool = saved
        self.assertEqual(returned, [7])
        self.assertIn(["gh", "api", "-X", "POST", f"repos/{events.REPO}/issues/7/labels", "-f",
                       "labels[]=lane-fix-exhausted"], calls, "held with a reason, visible on the PR")
        self.assertEqual(triaged, [], "a terminal generation is a disposition, not queue inventory")
        self.assertEqual((held["reason"], held["sha"]), ("fix-exhausted", "h1"))

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
                runner.escalate_exhausted(host, [stuck], linear)
                runner.escalate_exhausted(host, [stuck], linear)  # intake once, not every pass
                held = json.loads((host.state / "held.json").read_text())["7"]
                attempts = json.loads((host.state / "fix-attempts.json").read_text())["7"]
        finally:
            runner.sh, runner.load_providers, events.return_to_pool = saved
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


if __name__ == "__main__":
    unittest.main()
