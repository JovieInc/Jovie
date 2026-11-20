import json
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from contextlib import redirect_stderr
from io import StringIO
from unittest import mock
from pathlib import Path

import prod_errors as pe


class FakeSentry:
    def __init__(self):
        self.resolved = []

    def latest_trace(self, sid):
        return "Error: boom\n  at handler (app/api/x.ts:1)"

    def resolve(self, sid):
        self.resolved.append(sid)


class FakeLinear:
    def __init__(self):
        self.created, self.comments, self.states, self.n, self.closed = [], [], [], 0, set()

    def find_by_label(self, name, open_only=False):
        return next((c["id"] for c in self.created if name in c["labels"]
                     and not (open_only and c["id"] in self.closed)), None)

    def create(self, title, body, labels, priority):
        self.n += 1
        self.created.append({"id": f"JOV-{self.n}", "title": title, "body": body, "labels": labels, "p": priority})
        return f"JOV-{self.n}"

    def comment(self, ident, body):
        self.comments.append((ident, body))

    def set_state(self, ident, t):
        self.states.append((ident, t))

    def state_type(self, ident):
        return "completed" if ident in self.closed else "unstarted"


def iso(t):
    return pe.iso(t)


class LoopTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.s, self.l, self.ledger, self.t = FakeSentry(), FakeLinear(), {}, time.time()

    def issue(self, **kw):
        base = {"id": "101", "title": "TypeError in track page release credits", "culprit": "app/[username]/[slug]",
                "userCount": 3, "count": 9, "firstSeen": iso(self.t - 60), "lastSeen": iso(self.t - 30)}
        return {**base, **kw}

    def ghrun(self, n, **kw):
        base = {"databaseId": n, "workflowName": "E2E Full Browser Matrix", "conclusion": "success",
                "status": "completed", "event": "push", "createdAt": pe.iso(self.t + n * 60),
                "startedAt": pe.iso(self.t + n * 60), "headSha": f"sha{n}",
                "url": f"https://example.com/runs/{n}"}
        return {**base, **kw}

    def ci(self, runs_by_wf):
        def fake(args):
            if args[0] == "run":
                return runs_by_wf.get(args[args.index("--workflow") + 1], [])
            return []
        return mock.patch("prod_errors.gh_json", fake)

    def test_golden_path_triggers_at_any_count_and_one_linear_issue_per_id(self):
        self.assertEqual(pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir), "opened")
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        self.assertEqual(len(self.l.created), 1)
        labels = self.l.created[0]["labels"]
        self.assertIn("sentry:101", labels)
        self.assertIn("golden-path", labels)
        self.assertIn("regression test", self.l.created[0]["body"])
        self.assertIn("boom", self.l.created[0]["body"])

    def test_non_golden_below_threshold_ignored(self):
        r = pe.handle_issue(self.issue(title="Timeout in cron", culprit="jobs/x", userCount=0, count=1), self.ledger, self.s, self.l, [], self.t, self.dir)
        self.assertEqual(r, "below-threshold")

    def test_sentry_linked_linear_issue_is_adopted_not_duplicated(self):
        iss = self.issue(title="Timeout in cron", culprit="jobs/x", userCount=2,
                         annotations=[{"url": "https://linear.app/jovie/issue/JOV-8864/x", "displayName": "JOV#8864"}])
        r = pe.handle_issue(iss, self.ledger, self.s, self.l, [], self.t, self.dir)
        self.assertEqual(r, "opened")
        self.assertEqual(self.l.created, [])
        self.assertEqual(self.ledger["101"]["linear"], "JOV-8864")
        self.assertTrue(self.ledger["101"]["adopted"])
        self.assertEqual(self.l.comments[0][0], "JOV-8864")

    def test_unlinked_same_title_issues_roll_up_into_one_linear_issue(self):
        class S(FakeSentry):
            def top_issues(self_):
                return [self.issue(id=str(n), title="App Hanging", culprit="x", userCount=0, count=2,
                                   project={"slug": "ios"}) for n in (1, 2, 3)]
        with mock.patch.object(pe, "gh_json", return_value=[]):
            pe.sweep(S(), self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)
        led = json.loads((self.dir / "ledger.json").read_text())
        self.assertEqual({e["linear"] for e in led.values()}, {"JOV-1"})

    def test_metrics_p50_regression_and_trend(self):
        t = self.t
        led = {"a": {"sentryId": "a", "firstSeen": t - 7200, "closedAt": t, "reopens": 1, "linear": "JOV-1"},
               "b": {"sentryId": "b", "firstSeen": t - 3600, "closedAt": t, "linear": "JOV-2"}}
        m = pe.record_metrics(led, [self.issue(userCount=4)], t, self.dir)
        self.assertEqual(m["usersAffected24h"], 4)
        self.assertEqual(m["regressionRate"], 0.5)
        self.assertEqual(m["firstSeenToFixHours"]["p50"], 2.0)
        self.assertEqual(len((self.dir / "sentry-loop-metrics.jsonl").read_text().splitlines()), 1)

    def test_blocked_pr_with_open_bot_threads_files_one_issue_then_dedupes(self):
        graph = {"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": [
            {"id": "T1", "isResolved": False, "isOutdated": False, "path": "a.ts", "line": 3,
             "comments": {"nodes": [{"author": {"login": "sentry"}, "body": "**Bug:** x"}]}},
            {"id": "T2", "isResolved": True, "isOutdated": False, "path": "b.ts", "line": 1,
             "comments": {"nodes": [{"author": {"login": "sentry"}, "body": "old"}]}}]}}}}}
        def gh(args):
            return [{"number": 9, "title": "t", "mergeStateStatus": "BLOCKED"}] if args[0] == "pr" else graph
        with mock.patch.object(pe, "gh_json", side_effect=gh):
            self.assertEqual(pe.bot_threads(self.l, self.dir), {"threads-filed": 1})
            self.assertEqual(pe.bot_threads(self.l, self.dir), {"threads-filed": 0})
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("resolveReviewThread", self.l.created[0]["body"])
        self.assertIn("T1", self.l.created[0]["body"])
        self.assertNotIn("old", self.l.created[0]["body"])

    def test_repeat_episode_after_closed_alert_files_a_new_issue(self):
        # JOV-9007: dedupe against CLOSED issues silently swallowed a recurring identical incident.
        pe.alert("dead-man", "watchers unhealthy: ci-main is erroring", False, self.l, self.dir)
        pe.alert("dead-man", "watchers unhealthy: ci-main is erroring", False, self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)  # same open episode still dedupes
        self.l.closed.add("JOV-1")  # recovered, issue completed
        pe.alert("dead-man", "watchers unhealthy: ci-main is erroring", False, self.l, self.dir)
        self.assertEqual(len(self.l.created), 2)

    def test_query_is_production_only(self):
        urls = []
        s = object.__new__(pe.Sentry)
        s.org = "o"
        s._call = lambda m, u, b=None: urls.append(u) or []
        pe.Sentry.top_issues(s)
        self.assertIn("environment%3Aproduction", urls[0])

    def test_stripe_price_is_human_gate_with_siren_and_hold(self):
        pe.handle_issue(self.issue(id="7", title="StripeInvalidRequestError: No such price", culprit="api/checkout"),
                        self.ledger, self.s, self.l, [], self.t, self.dir)
        e = self.ledger["7"]
        self.assertEqual(e["gate"], "stripe-config")
        self.assertIn("hold", self.l.created[0]["labels"])
        alerts = [json.loads(x) for x in (self.dir / "alerts.jsonl").read_text().splitlines()]
        self.assertTrue(any(a["siren"] and a["text"].startswith("🚨") for a in alerts))

    def test_only_verifier_closes_after_24h_quiet_and_new_event_reopens(self):
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        prs = [{"number": 5, "title": "fix JOV-1", "body": "", "headRefName": "x", "mergedAt": iso(self.t)}]
        pe.advance(self.ledger, self.l, self.s, prs, self.t + 60, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "deployed")
        pe.advance(self.ledger, self.l, self.s, prs, self.t + 3600, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "deployed")
        pe.advance(self.ledger, self.l, self.s, prs, self.t + 25 * 3600, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "closed")
        self.assertEqual(self.s.resolved, ["101"])
        r = pe.handle_issue(self.issue(lastSeen=iso(self.t + 26 * 3600)), self.ledger, self.s, self.l, [],
                            self.t + 26 * 3600, self.dir)
        self.assertEqual(r, "reopened")
        self.assertIn(("JOV-1", "unstarted"), self.l.states)

    def test_claim_expiry_escalates_when_no_pr(self):
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        pe.advance(self.ledger, self.l, self.s, [], self.t + pe.CLAIM_S + 1, self.dir)
        self.assertEqual(self.ledger["101"]["escalations"], 1)
        self.assertTrue(any("Claim expired" in c[1] for c in self.l.comments))

    def test_claim_expiry_stands_down_when_linked_issue_completed_externally(self):
        # JOV-10213: a fix merges, an operator closes the Linear issue with receipts, but the
        # merged PR sits outside the PR fetch window -- so the ledger entry stays 'claimed' and
        # the claimer re-armed + re-filed a claim-expired alert every cycle on a DONE issue.
        # Expiry must check the linked issue's state first and stand down quietly.
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        ident = self.ledger["101"]["linear"]
        self.l.closed.add(ident)  # FakeLinear: completed issues are in `closed`
        pe.advance(self.ledger, self.l, self.s, [], self.t + pe.CLAIM_S + 1, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "closed")
        self.assertNotIn("escalations", self.ledger["101"])
        self.assertFalse(any("Claim expired" in c[1] for c in self.l.comments))
        # And a later sweep must not re-fire: the entry is closed, expiry never revisits it.
        pe.advance(self.ledger, self.l, self.s, [], self.t + 2 * pe.CLAIM_S + 2, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "closed")
        self.assertFalse(any("Claim expired" in c[1] for c in self.l.comments))

    def test_claim_expiry_still_escalates_when_linked_issue_open(self):
        # Control for the stand-down: an OPEN linked issue must keep the existing escalation.
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        pe.advance(self.ledger, self.l, self.s, [], self.t + pe.CLAIM_S + 1, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "claimed")
        self.assertEqual(self.ledger["101"]["escalations"], 1)

    def test_pr_matcher_binds_a_merged_fix_referencing_only_the_issue_id(self):
        # Regression lock for the JOV-8073/10213 shape: the merged fix PR (#21394) carries the
        # Linear identifier in title/body but never the word 'Sentry'. Once such a PR is IN the
        # fetched list, the claim must advance to deployed.
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        ident = self.ledger["101"]["linear"]
        prs = [{"number": 21394, "title": f"fix(canary): assert SSR session boundary on /start ({ident})",
                "body": f"Refs {ident}.\n<!-- linear-issue-identifier:{ident} -->",
                "headRefName": "devin/jov-8073-20261012t082825", "mergedAt": iso(self.t)}]
        pe.advance(self.ledger, self.l, self.s, prs, self.t + 60, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "deployed")
        self.assertEqual(self.ledger["101"]["pr"], 21394)

    def test_pr_fetch_includes_linear_id_references_not_just_the_word_sentry(self):
        # The sweep fetched '--search "Sentry in:body"' only, which excludes fix PRs whose body
        # references the Linear identifier but never says 'Sentry' (#21394): their claims could
        # never bind to the merge. The fetch must cover the issue-reference convention too, and
        # must dedupe the union.
        sentry_prs = [{"number": 1, "title": "a", "body": "Sentry 9", "headRefName": "x", "mergedAt": None}]
        jov_prs = [{"number": 1, "title": "a", "body": "Sentry 9", "headRefName": "x", "mergedAt": None},
                   {"number": 21394, "title": "fix (JOV-8073)", "body": "Refs JOV-8073", "headRefName": "y",
                    "mergedAt": iso(self.t)}]
        seen_terms = []

        def fake(args):
            if args[0] == "pr":
                term = args[args.index("--search") + 1]
                seen_terms.append(term)
                return sentry_prs if term.startswith("Sentry") else jov_prs
            return []

        with mock.patch.object(pe, "gh_json", side_effect=fake):
            prs = pe.fetch_prs()
        self.assertIn("Sentry in:body", seen_terms)
        self.assertTrue(any("JOV" in t for t in seen_terms))
        self.assertEqual([p["number"] for p in prs], [1, 21394])  # union, deduped

    def test_suspect_merge_linked(self):
        merges = [{"number": 42, "mergedAt": iso(self.t - 3600)}]
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, merges, self.t, self.dir)
        self.assertIn("#42", self.l.created[0]["body"])

    def test_synthetic_runs_whole_loop_without_lane(self):
        pe.handle_issue(self.issue(id="9", title="prod-errors-synthetic weekly loop test ab"), self.ledger,
                        self.s, self.l, [], self.t, self.dir)
        self.assertEqual(self.l.created, [])
        pe.advance(self.ledger, self.l, self.s, [], self.t + 25 * 3600, self.dir)
        self.assertEqual(self.ledger["9"]["status"], "closed")

    def test_deadman_stale_and_error_streak(self):
        pe.heartbeat("sentry-sweep", True, "", self.dir)
        for _ in range(3):
            pe.heartbeat("ci-main", False, "boom", self.dir)
        h = pe.watcher_health(self.dir, time.time() + 10)
        self.assertEqual(h["sentry-sweep"]["status"], "ok")
        self.assertEqual(h["ci-main"]["status"], "erroring")
        self.assertEqual(pe.watcher_health(self.dir, time.time() + 3 * 1800)["sentry-sweep"]["status"], "stale")
        self.assertEqual(h["receiver"]["status"], "pending-first-run")
        self.assertEqual(h["synthetic"]["status"], "pending-first-run")

    def test_fresh_install_is_graced_no_alerts(self):
        # A fresh install with zero heartbeats must not page: every watcher is pending until its
        # own 2x-interval window after install has passed.
        h = pe.watcher_health(self.dir)
        self.assertTrue(all(v["status"] == "pending-first-run" for v in h.values()))
        result = pe.deadman(self.l, self.dir)
        self.assertEqual(self.l.created, [])
        alerts = [json.loads(x) for x in (self.dir / "alerts.jsonl").read_text().splitlines()] if \
            (self.dir / "alerts.jsonl").exists() else []
        self.assertEqual(alerts, [])
        self.assertTrue(all(v["status"] == "pending-first-run" for v in result.values()))

    def test_install_burst_files_one_issue_not_one_per_watcher(self):
        # Everything genuinely missing (anchor far in the past) files exactly ONE aggregated issue.
        (self.dir / "installed_at").write_text(str(int(self.t - 10 ** 9)))
        pe.deadman(self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("watchers unhealthy", self.l.created[0]["title"])
        self.assertIn("sentry-sweep", self.l.created[0]["body"])
        self.assertIn("synthetic", self.l.created[0]["body"])

    def test_truly_stale_heartbeat_still_pages(self):
        # Beyond 2x the interval with no heartbeat, the dead-man still fires (never disabled).
        pe.heartbeat("sentry-sweep", True, "", self.dir)
        later = time.time() + 3 * 1800
        original_now = pe.now
        try:
            pe.now = lambda: later
            h = pe.watcher_health(self.dir)
            self.assertEqual(h["sentry-sweep"]["status"], "stale")
            result = pe.deadman(self.l, self.dir)
        finally:
            pe.now = original_now
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("sentry-sweep is stale", self.l.created[0]["title"])
        self.assertEqual(result["sentry-sweep"]["status"], "stale")

    def test_receiver_judged_on_own_cadence(self):
        # The receiver heartbeats when the dead-man pokes it, every 900s -- not at webhook latency.
        pe.heartbeat("receiver", True, "health", self.dir)
        self.assertEqual(pe.watcher_health(self.dir, time.time() + 700)["receiver"]["status"], "ok")
        self.assertEqual(pe.watcher_health(self.dir, time.time() + 1900)["receiver"]["status"], "stale")

    def test_synthetic_judged_on_weekly_cadence(self):
        pe.heartbeat("synthetic", True, "sent", self.dir)
        self.assertEqual(pe.watcher_health(self.dir, time.time() + 8 * 86400)["synthetic"]["status"], "ok")
        self.assertEqual(pe.watcher_health(self.dir, time.time() + 15 * 86400)["synthetic"]["status"], "stale")

    def test_receiver_missing_config_is_one_visible_issue_without_duplicates(self):
        # The gem receiver crash-looped on a missing webhook secret. New behavior: the failed
        # start records ONE 'missing config: <VARS>' status, the dead-man files ONE issue that
        # names the vars, repeated runs do not re-file, and recovery clears the gate.
        pe.heartbeat("receiver", False, "missing config: SENTRY_WEBHOOK_SECRET", self.dir)
        self.assertEqual(pe.watcher_health(self.dir)["receiver"]["status"], "missing-config")
        pe.deadman(self.l, self.dir)
        pe.deadman(self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("missing config: SENTRY_WEBHOOK_SECRET", self.l.created[0]["title"])
        self.assertIn("missing config: SENTRY_WEBHOOK_SECRET", self.l.created[0]["body"])
        self.assertIn("restart the unit", self.l.created[0]["body"])
        pe.heartbeat("receiver", True, "listening", self.dir)
        self.assertEqual(pe.watcher_health(self.dir)["receiver"]["status"], "ok")

    def test_sweep_missing_config_overrides_stale_and_error_streak(self):
        # A sweep failing on missing env must read as config, not crash noise, forever (the
        # service keeps failing until Tim fixes the env file) -- one clear status + one issue.
        pe.heartbeat("sentry-sweep", False, "missing config: SENTRY_AUTH_TOKEN, SENTRY_ORG", self.dir)
        pe.heartbeat("sentry-sweep", False, "missing config: SENTRY_AUTH_TOKEN, SENTRY_ORG", self.dir)
        pe.heartbeat("sentry-sweep", False, "missing config: SENTRY_AUTH_TOKEN, SENTRY_ORG", self.dir)
        h = pe.watcher_health(self.dir, time.time() + 4 * 1800)
        self.assertEqual(h["sentry-sweep"]["status"], "missing-config")
        pe.deadman(self.l, self.dir)
        pe.deadman(self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("SENTRY_AUTH_TOKEN", self.l.created[0]["body"])

    def test_sentry_and_linear_constructors_name_missing_vars(self):
        for v in ("SENTRY_AUTH_TOKEN", "SENTRY_ORG", "LINEAR_API_KEY"):
            os.environ.pop(v, None)
        with self.assertRaises(pe.MissingConfig) as ctx:
            pe.Sentry(pe.Http())
        self.assertEqual(str(ctx.exception), "missing config: SENTRY_AUTH_TOKEN, SENTRY_ORG")
        with self.assertRaises(pe.MissingConfig) as ctx:
            pe.Linear(pe.Http())
        self.assertEqual(str(ctx.exception), "missing config: LINEAR_API_KEY")

    def test_receive_missing_config_fails_clean_no_crash_loop(self):
        os.environ.pop("SENTRY_WEBHOOK_SECRET", None)
        pe.receive(8799, self.dir)  # must return cleanly (exit 0), never raise
        self.assertEqual(pe.watcher_health(self.dir)["receiver"]["status"], "missing-config")
        hb = pe.read_json(self.dir / "heartbeats" / "receiver.json", {})
        self.assertEqual(hb["runs"][-1]["detail"], "missing config: SENTRY_WEBHOOK_SECRET")

    def test_receiver_liveness_probe_down(self):
        # Judged on process liveness, not just interval: a failed /health probe on a fresh
        # heartbeat means the receiver is down NOW, not in 2x-interval time.
        pe.heartbeat("receiver", True, "listening", self.dir)
        self.assertEqual(pe.watcher_health(self.dir, probe={"receiver": True})["receiver"]["status"], "ok")
        self.assertEqual(pe.watcher_health(self.dir, probe={"receiver": False})["receiver"]["status"], "down")

    def test_synthetic_loop_gate_clears_between_episodes(self):
        # The stuck-synthetic gate must clear when the episode ends, so a NEW stuck synthetic
        # (fresh fingerprint each week) files a fresh issue instead of being suppressed forever.
        ep1 = {"9": {"synthetic": True, "status": "claimed", "openedAt": time.time() - 4 * 86400, "sentryId": "9"}}
        pe.write_json(self.dir / "ledger.json", ep1)
        pe.deadman(self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("synthetic-loop is stuck", self.l.created[0]["body"])
        pe.write_json(self.dir / "ledger.json", {})  # episode over, gate clears
        pe.deadman(self.l, self.dir)
        self.assertEqual(len(self.l.created), 1)
        ep2 = {"10": {"synthetic": True, "status": "claimed", "openedAt": time.time() - 4 * 86400, "sentryId": "10"}}
        pe.write_json(self.dir / "ledger.json", ep2)  # a new episode must re-alert
        pe.deadman(self.l, self.dir)
        self.assertEqual(len(self.l.created), 2)

    def ci_sweeps(self, sweeps):
        wf = "E2E Full Browser Matrix"
        old_expected = pe.EXPECTED_RUNS
        pe.EXPECTED_RUNS = {}  # keep the missed-run alarm out of these fixtures
        try:
            for runs_by_wf in sweeps:
                with self.ci({wf: runs_by_wf}):
                    pe.ci_main(self.l, self.dir)
        finally:
            pe.EXPECTED_RUNS = old_expected

    def test_ci_cancelled_superseded_by_newer_sha_is_ignored(self):
        # JOV-8916: each cancelled run was superseded the moment the next main push started a
        # newer run for a different SHA -- normal concurrency under fast merges, never a hang.
        # Three DISTINCT superseded cancels (the exact fast-merge incident shape that filed the
        # false "cancelled 3x in a row" issue) must not alert; repeated sweeps of the same
        # superseded run stay deduped too.
        sweep1 = [self.ghrun(2, status="in_progress", conclusion=None, headSha="sha-new1"),
                  self.ghrun(1, conclusion="cancelled", headSha="sha-old1")]
        sweep2 = [self.ghrun(3, status="in_progress", conclusion=None, headSha="sha-new2"),
                  self.ghrun(2, conclusion="cancelled", headSha="sha-new1"),
                  self.ghrun(1, conclusion="cancelled", headSha="sha-old1")]
        sweep3 = [self.ghrun(4, status="in_progress", conclusion=None, headSha="sha-new3"),
                  self.ghrun(3, conclusion="cancelled", headSha="sha-new2"),
                  self.ghrun(2, conclusion="cancelled", headSha="sha-new1"),
                  self.ghrun(1, conclusion="cancelled", headSha="sha-old1")]
        self.ci_sweeps([sweep1, sweep2, sweep3, sweep3])  # 4th sweep: same runs, still deduped
        self.assertEqual(self.l.created, [])

    def test_ci_cancelled_with_no_newer_run_still_flags(self):
        # Three DISTINCT cancels on the newest SHA with nothing superseding them = a real hang.
        # The same cancelled run repeated across sweeps counts once, not once per sweep.
        self.ci_sweeps([[self.ghrun(1, conclusion="cancelled", headSha="same")]])
        self.ci_sweeps([[self.ghrun(2, conclusion="cancelled", headSha="same"),
                         self.ghrun(1, conclusion="cancelled", headSha="same")]])
        self.ci_sweeps([[self.ghrun(3, conclusion="cancelled", headSha="same"),
                         self.ghrun(2, conclusion="cancelled", headSha="same"),
                         self.ghrun(1, conclusion="cancelled", headSha="same")]])
        self.ci_sweeps([[self.ghrun(3, conclusion="cancelled", headSha="same"),
                         self.ghrun(2, conclusion="cancelled", headSha="same"),
                         self.ghrun(1, conclusion="cancelled", headSha="same")]])  # no re-alert
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("cancelled 3x", self.l.created[0]["title"])

    def test_ci_newest_run_stuck_past_timeout_flags_once(self):
        stuck = [self.ghrun(7, status="in_progress", conclusion=None, headSha="sha-new",
                          createdAt=pe.iso(self.t - 3 * 3600), startedAt=pe.iso(self.t - 3 * 3600))]
        young = [self.ghrun(8, status="in_progress", conclusion=None, headSha="sha-new2",
                          createdAt=pe.iso(self.t - 60), startedAt=pe.iso(self.t - 60))]
        self.ci_sweeps([stuck, stuck, young])
        self.assertEqual(len(self.l.created), 1)
        self.assertIn("never finished within its timeout", self.l.created[0]["title"])

    def test_bottleneck_fragment(self):
        pe.handle_issue(self.issue(userCount=30), self.ledger, self.s, self.l, [], self.t, self.dir)
        frag = pe.write_bottleneck(self.ledger, self.dir)
        self.assertEqual(frag["schema"], "pipeline-bottleneck/v1")
        self.assertEqual(frag["golden_path_sentry"]["openGolden"], 1)
        self.assertLess(frag["golden_path_sentry"]["score"], 100)
        self.assertIn("sentry-sweep", frag["watcher_health"])

    def test_webhook_signature(self):
        sig = pe.hmac.new(b"k", b"{}", pe.hashlib.sha256).hexdigest()
        self.assertTrue(pe.verify_signature("k", b"{}", sig))
        self.assertFalse(pe.verify_signature("k", b"{}", "bad"))
        self.assertFalse(pe.verify_signature("k", b"{}", ""))


    def test_linear_gql_classifies_not_found_as_relinkable(self):
        # "Entity not found" from a deleted/invisible Linear id is a relinkable LinearIssueMissing;
        # every other Linear GraphQL error stays a fatal RuntimeError.
        lin = object.__new__(pe.Linear)
        lin.client = mock.Mock()
        lin.client.graphql = mock.Mock(side_effect=pe.LinearGraphQLError([{"message": "Entity not found: Issue"}]))
        with self.assertRaises(pe.LinearIssueMissing):
            lin.gql("query{}", {})
        lin.client.graphql = mock.Mock(side_effect=pe.LinearGraphQLError([{"message": "internal server error"}]))
        with self.assertRaises(RuntimeError) as cm:
            lin.gql("query{}", {})
        self.assertNotIsInstance(cm.exception, pe.LinearIssueMissing)

    def test_stale_adopted_rollup_link_files_fresh_issue(self):
        # A rollup/adopted id that no longer exists must not kill the sweep: file a fresh issue
        # with the SAME body, relink the ledger entry, say so on stderr.
        class L(FakeLinear):
            def comment(self_, ident, body):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().comment(ident, body)
        l = L()
        err = StringIO()
        with redirect_stderr(err):
            r = pe.handle_issue(self.issue(), self.ledger, self.s, l, [], self.t, self.dir, rollup="JOV-404")
        self.assertEqual(r, "relinked")
        self.assertEqual(len(l.created), 1)
        self.assertIn("regression test", l.created[0]["body"])  # full issue body, not a stub
        self.assertEqual(self.ledger["101"]["linear"], l.created[0]["id"])
        self.assertEqual(self.ledger["101"]["relinkedFrom"], "JOV-404")
        self.assertFalse(self.ledger["101"]["adopted"])
        self.assertIn("stale Linear link JOV-404", err.getvalue())

    def test_stale_link_on_reopen_files_fresh_issue(self):
        class L(FakeLinear):
            def set_state(self_, ident, t):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().set_state(ident, t)
        self.ledger["101"] = {"sentryId": "101", "linear": "JOV-404", "status": "closed", "flow": "checkout",
                              "gate": None, "title": "TypeError in track page release credits", "users": 3,
                              "openedAt": self.t - 7200, "closedAt": self.t - 60, "lastSeen": self.t - 30}
        l = L()
        err = StringIO()
        with redirect_stderr(err):
            r = pe.handle_issue(self.issue(lastSeen=iso(self.t)), self.ledger, self.s, l, [], self.t, self.dir)
        self.assertEqual(r, "relinked")
        fresh = next(c for c in l.created if "sentry:101" in c["labels"])  # alert() may file its own tim-alert issue too
        self.assertEqual(self.ledger["101"]["linear"], fresh["id"])
        self.assertEqual(self.ledger["101"]["relinkedFrom"], "JOV-404")
        self.assertEqual(self.ledger["101"]["status"], "claimed")
        self.assertIn("stale Linear link", err.getvalue())

    def test_stale_link_at_claim_expiry_relinks_and_keeps_escalating(self):
        class L(FakeLinear):
            def comment(self_, ident, body):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().comment(ident, body)
        led = {"101": {"sentryId": "101", "linear": "JOV-404", "status": "claimed", "flow": None, "gate": None,
                       "title": "TypeError in track page release credits", "users": 3, "lastSeen": self.t - 30,
                       "openedAt": self.t - pe.CLAIM_S - 100, "claimExpiresAt": self.t - 10}}
        l = L()
        stale = pe.advance(led, l, self.s, [], self.t, self.dir)
        self.assertEqual(stale, 1)
        self.assertNotEqual(led["101"]["linear"], "JOV-404")
        self.assertEqual(led["101"]["relinkedFrom"], "JOV-404")
        self.assertEqual(led["101"]["escalations"], 1)
        self.assertIn("Claim expired", l.created[0]["body"])  # escalation carried by the fresh issue

    def test_stale_link_at_close_stays_closed_and_logs(self):
        # At close the Linear issue is already gone: nothing to refile -- stay closed, log loudly.
        class L(FakeLinear):
            def set_state(self_, ident, t):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().set_state(ident, t)
        led = {"101": {"sentryId": "101", "linear": "JOV-404", "status": "deployed", "flow": None, "gate": None,
                       "title": "x", "users": 3, "lastSeen": self.t - 26 * 3600, "openedAt": self.t - 90 * 3600,
                       "deployedAt": self.t - 25 * 3600}}
        l = L()
        err = StringIO()
        with redirect_stderr(err):
            stale = pe.advance(led, l, self.s, [], self.t, self.dir)
        self.assertEqual(stale, 1)
        self.assertEqual(led["101"]["status"], "closed")
        self.assertEqual(led["101"]["linear"], "JOV-404")  # kept for forensics
        self.assertEqual(l.created, [])  # no fresh issue just to close it
        self.assertIn("stale Linear link JOV-404 at close", err.getvalue())

    def test_sweep_survives_a_stale_ledger_link_end_to_end(self):
        # The 2026-10-31 gem incident, end to end: sweep exited 1 on 'linear: Entity not found:
        # Issue' from a stale ledger id. The sweep must relink, complete, and surface the event.
        class L(FakeLinear):
            def _stale(self_, ident):
                return ident == "JOV-404"
            def set_state(self_, ident, t):
                if self_._stale(ident):
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().set_state(ident, t)
            def comment(self_, ident, body):
                if self_._stale(ident):
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().comment(ident, body)
        led = {"101": {"sentryId": "101", "linear": "JOV-404", "status": "closed", "flow": None, "gate": None,
                       "title": "TypeError in track page release credits", "users": 3,
                       "openedAt": self.t - 7200, "closedAt": self.t - 3600, "lastSeen": self.t - 3660}}
        (self.dir / "ledger.json").write_text(json.dumps(led))

        class S(FakeSentry):
            def top_issues(self_):
                return [self.issue(lastSeen=iso(self.t))]  # new event after close -> reopen path
        l = L()
        err = StringIO()
        with mock.patch.object(pe, "gh_json", return_value=[]), redirect_stderr(err):
            counts = pe.sweep(S(), l, self.dir)
        self.assertEqual(counts.get("relinked"), 1)  # sweep COMPLETED; no exception escaped
        led2 = json.loads((self.dir / "ledger.json").read_text())
        self.assertNotEqual(led2["101"]["linear"], "JOV-404")
        self.assertEqual(led2["101"]["relinkedFrom"], "JOV-404")
        self.assertIn("stale Linear link JOV-404", err.getvalue())

    def test_sweep_surfaces_stale_link_count_from_advance(self):
        # Claim expiry inside a full sweep: the relink is visible as counts["stale-link"], not
        # just as a stderr line.
        class L(FakeLinear):
            def comment(self_, ident, body):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().comment(ident, body)
        led = {"101": {"sentryId": "101", "linear": "JOV-404", "status": "claimed", "flow": None, "gate": None,
                       "title": "TypeError in track page release credits", "users": 3, "lastSeen": self.t - 30,
                       "openedAt": self.t - pe.CLAIM_S - 100, "claimExpiresAt": self.t - 10}}
        (self.dir / "ledger.json").write_text(json.dumps(led))

        class S(FakeSentry):
            def top_issues(self_):
                return [self.issue(lastSeen=iso(self.t - 30))]
        with mock.patch.object(pe, "gh_json", return_value=[]):
            counts = pe.sweep(S(), L(), self.dir)
        self.assertEqual(counts.get("tracked"), 1)
        self.assertEqual(counts.get("stale-link"), 1)

    def test_bot_threads_relinks_a_stale_thread_issue(self):
        graph = {"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": [
            {"id": "T1", "isResolved": False, "isOutdated": False, "path": "a.ts", "line": 3,
             "comments": {"nodes": [{"author": {"login": "sentry"}, "body": "**Bug:** x"}]}}]}}}}}
        key = f"threads:{pe.THREAD_REPOS[0]}#9"
        (self.dir / "threads.json").write_text(json.dumps({key: {"sig": "other", "linear": "JOV-404",
                                                                 "open": True, "at": iso(self.t)}}))

        class L(FakeLinear):
            def comment(self_, ident, body):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().comment(ident, body)
        def gh(args):
            return [{"number": 9, "title": "t", "mergeStateStatus": "BLOCKED"}] if args[0] == "pr" else graph
        l = L()
        err = StringIO()
        with mock.patch.object(pe, "gh_json", side_effect=gh), redirect_stderr(err):
            r = pe.bot_threads(l, self.dir)
        self.assertEqual(r["threads-filed"], 1)
        self.assertEqual(len(l.created), 1)  # fresh issue instead of the dead JOV-404
        seen = json.loads((self.dir / "threads.json").read_text())
        self.assertNotEqual(seen[key]["linear"], "JOV-404")
        self.assertIn("stale Linear link JOV-404", err.getvalue())

    def test_ci_green_recovery_survives_a_stale_link(self):
        # ci-main's closer hits the same stale-id class from ci-ledger.json; it must not crash.
        class L(FakeLinear):
            def set_state(self_, ident, t):
                if ident == "JOV-404":
                    raise pe.LinearIssueMissing("linear: Entity not found: Issue")
                super().set_state(ident, t)
        wf = "E2E Full Browser Matrix"
        key = f"ci:{pe.hashlib.sha1(wf.encode()).hexdigest()[:10]}"
        (self.dir / "ci-ledger.json").write_text(json.dumps({key: {"workflow": wf, "state": "red",
                                                                   "linear": "JOV-404"}}))
        old_expected = pe.EXPECTED_RUNS
        pe.EXPECTED_RUNS = {}
        try:
            with self.ci({wf: [self.ghrun(1, conclusion="success")]}):
                pe.ci_main(L(), self.dir)
        finally:
            pe.EXPECTED_RUNS = old_expected
        seen = json.loads((self.dir / "ci-ledger.json").read_text())
        self.assertEqual(seen[key]["state"], "green")
        self.assertIsNone(seen[key]["linear"])  # dead link dropped; next red episode files fresh

    def test_gh_json_fields_are_supported_by_the_pinned_gh_sets(self):
        # gh 2.96.0 (gem) rejects 'runStartedAt' with 'Unknown JSON field', blinding the ci-main
        # watcher -- and the test fixtures mirrored the source's field list, so no fake runner
        # caught it. Every --json field the watchers request must be in the pinned gh-supported
        # sets (verified against cli/cli v2.96.0 RunFields / PullRequestFields), whatever the
        # fake returns.
        asked = []

        def fake(args):
            if "--json" in args:
                asked.append((args[0], args[args.index("--json") + 1].split(",")))
            if args[0] == "run":
                return [self.ghrun(1, conclusion="success")]
            return []

        class S(FakeSentry):
            def top_issues(self_):
                return []
        with mock.patch.object(pe, "gh_json", side_effect=fake):
            pe.ci_main(self.l, self.dir)
            pe.sweep(S(), self.l, self.dir)
        run_fields = [f for cmd, fs in asked if cmd == "run" for f in fs]
        pr_fields = [f for cmd, fs in asked if cmd == "pr" for f in fs]
        self.assertTrue(run_fields)
        self.assertTrue(pr_fields)
        self.assertNotIn("runStartedAt", run_fields)
        for f in run_fields:
            self.assertIn(f, pe.GH_RUN_LIST_FIELDS, f"run list does not support field {f!r}")
        for f in pr_fields:
            self.assertIn(f, pe.GH_PR_LIST_FIELDS, f"pr list does not support field {f!r}")

    def test_sweep_deferral_is_visible_and_keeps_sweeping(self):
        # apiclient budget deferral (exit 75, 'retry later, not a verdict'): the sweep must not
        # exit 1. The Sentry sweep still runs, the deferral is visible in counts/stderr, and
        # claim expiry + thread watch are SKIPPED -- with no PR list, 'no PR' cannot be told from
        # 'did not check', so advancing claims would file false escalations.
        led = {"101": {"sentryId": "101", "linear": "JOV-1", "status": "claimed", "flow": None, "gate": None,
                       "title": "x", "users": 3, "lastSeen": self.t - 30,
                       "openedAt": self.t - pe.CLAIM_S - 100, "claimExpiresAt": self.t - 10}}
        (self.dir / "ledger.json").write_text(json.dumps(led))

        def fake(args):
            if args[0] == "pr":
                raise pe.GhDeferred("pr list deferred: waits past budget (budget-reserve:graphql)")
            return []

        class S(FakeSentry):
            def top_issues(self_):
                return [self.issue()]
        err = StringIO()
        with mock.patch.object(pe, "gh_json", side_effect=fake), redirect_stderr(err):
            counts = pe.sweep(S(), self.l, self.dir)
        self.assertIn("budget-reserve:graphql", counts.get("deferred", ""))
        self.assertEqual(counts.get("tracked"), 1)  # the Sentry sweep still ran
        led2 = json.loads((self.dir / "ledger.json").read_text())
        self.assertNotIn("escalations", led2["101"])  # no FALSE claim-expiry escalation
        self.assertFalse(any("Claim expired" in c[1] for c in self.l.comments))
        self.assertEqual(self.l.created, [])  # thread watch skipped
        self.assertIn("deferred gh lists", err.getvalue())

    def test_ci_main_deferral_is_visible_not_fatal(self):
        # Same class on the ci-main watcher: a deferred run list skips the tick visibly instead
        # of exiting 1 and tripping the dead-man's error streak.
        def fake(args):
            raise pe.GhDeferred("run list deferred: waits past budget (budget-reserve:graphql)")
        err = StringIO()
        with mock.patch.object(pe, "gh_json", side_effect=fake), redirect_stderr(err):
            r = pe.ci_main(self.l, self.dir)
        self.assertIn("budget-reserve:graphql", r.get("deferred", ""))
        self.assertIn("ci-main deferred this tick", err.getvalue())

    def test_sandbox_binds_the_shared_api_ledger_writable(self):
        # The units run bwrap with a read-only root; the apiclient budget ledger lives under the
        # shared jovie-lanes state (~/.local/state/jovie-lanes/api-ledger) and is written on every
        # API call. Without the writable bind, os.mkdir('<provider>.lock.d') dies with EROFS
        # [Errno 30] and every watcher unit fails. The bind must survive a fresh host too
        # (install.sh creates the ledger dir before bwrap can reference it).
        sh = (Path(__file__).parent / "install.sh").read_text()
        sandbox = sh.split('sandbox="')[1].split('"')[0]
        self.assertIn("--ro-bind / /", sandbox)
        self.assertIn("--bind $ledger $ledger", sandbox)
        ledger_line = next(line for line in sh.splitlines() if line.startswith("ledger="))
        self.assertIn("jovie-lanes/api-ledger", ledger_line)
        self.assertIn('mkdir -p "$ledger"', sh)


class TreeLayoutTest(unittest.TestCase):
    """The live tree on gem must be a runnable repo-relative layout.

    Regression pins for the 2026-10-31 incident (units jovie-prod-errors-{sweep,ci-main,deadman}
    all failed): install.sh skipped an existing current/ (a re-install never repaired a stale or
    mis-shaped tree), the self-update archived only scripts/prod-errors (prod_errors.py imports
    scripts/apiclient, whose contract reads packages/api-client/providers.json two dirs up from
    itself, so every candidate tree failed its own test gate and the loop froze on a broken tree),
    and run.sh exec'd only the flat current/prod_errors.py, so a nested current/ died with
    python's exit-2 file-not-found on every unit tick.
    """

    # scripts/{prod-errors,apiclient} + packages/api-client: the full runnable dependency tree.
    trees = ("scripts/prod-errors", "scripts/apiclient", "packages/api-client")
    repo = Path(__file__).resolve().parents[2]

    def setUp(self):
        self.home = Path(tempfile.mkdtemp())
        self.bin = self.home / "fakebin"
        self.bin.mkdir()
        self.base = self.home / ".local/share/jovie-prod-errors"

    def stub(self, name, body):
        """Put a fake executable on PATH (systemctl no-op; python3 arg logger)."""
        p = self.bin / name
        p.write_text("#!/bin/sh\n" + body)
        p.chmod(0o755)

    def env(self, **extra):
        env = dict(os.environ, HOME=str(self.home), PATH=f"{self.bin}:{os.environ['PATH']}")
        env.update({k: str(v) for k, v in extra.items()})
        return env

    def run_install(self):
        # install.sh ends with systemctl --user daemon-reload / enable --now / list-timers;
        # tests run where no user systemd session exists, so systemctl is a no-op stub.
        self.stub("systemctl", "exit 0")
        return subprocess.run(
            ["bash", str(self.repo / "scripts/prod-errors/install.sh")],
            env=self.env(), capture_output=True, text=True, timeout=180)

    def fixture_repo(self):
        """A lanes-mirror-shaped git repo: the three trees at repo-relative paths, committed at
        refs/remotes/origin/main so run.sh's rev-parse/archive path resolves."""
        r = self.home / "mirror"
        for d in self.trees:
            dst = r / d
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(self.repo / d, dst)

        def git(*args):
            subprocess.run(["git", "-C", str(r), *args], check=True, capture_output=True)

        git("init", "-q")
        git("add", "-A")
        git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture")
        git("update-ref", "refs/remotes/origin/main", "HEAD")
        return r

    def tree_head(self, repo, ref="origin/main"):
        """The concatenated tree hashes run.sh stamps into current/.tree."""
        return "".join(
            subprocess.run(["git", "-C", str(repo), "rev-parse", "-q", "--verify", f"{ref}:{p}"],
                           capture_output=True, text=True).stdout.strip()
            for p in self.trees)

    def seed_live(self, nested=True, tree_hash=None):
        """Seed $base/current with a live tree: full repo-relative layout, or legacy flat."""
        live = self.base / "current"
        if nested:
            for d in self.trees:
                dst = live / d
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(self.repo / d, dst)
        else:
            live.mkdir(parents=True)
            shutil.copy(self.repo / "scripts/prod-errors/prod_errors.py", live / "prod_errors.py")
        if tree_hash is not None:
            (live / ".tree").write_text(tree_hash + "\n")
        return live

    def run_run_sh(self, repo, cmd="sweep"):
        self.stub("python3", 'printf "%s\\n" "$*" >> "$EXEC_LOG"\nexit 0')
        log = self.home / "exec.log"
        r = subprocess.run(
            ["bash", str(self.repo / "scripts/prod-errors/run.sh"), cmd],
            env=self.env(LANES_REPO=repo, PROD_ERRORS_HOME=self.base, EXEC_LOG=log),
            capture_output=True, text=True, timeout=180)
        return r, log

    def last_exec(self, log):
        lines = log.read_text().strip().splitlines()
        self.assertTrue(lines, "run.sh must exec python3")
        return lines[-1]

    def assert_runnable_tree(self, live):
        for f in ("scripts/prod-errors/prod_errors.py", "scripts/prod-errors/test_prod_errors.py",
                  "scripts/apiclient/contract.py", "packages/api-client/providers.json"):
            self.assertTrue((live / f).is_file(), f"live tree missing {f}")

    def test_fresh_install_stages_the_runnable_dependency_tree(self):
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.base / "run.sh").is_file(), "install must ship run.sh")
        self.assert_runnable_tree(self.base / "current")
        # .tree is stamped whenever the checkout has git metadata, so a mirror at the same
        # commit skips a redundant self-update on the first tick.
        probe = subprocess.run(["git", "-C", str(self.repo), "rev-parse", "-q", "--verify",
                                "HEAD:scripts/prod-errors"], capture_output=True)
        if probe.returncode == 0:
            self.assertTrue((self.base / "current/.tree").is_file(), "install must stamp .tree")

    def test_reinstall_repairs_a_broken_nested_current_tree(self):
        # The observed gem shape: a nested prod-errors-only tree -- no apiclient, no
        # providers.json, no top-level prod_errors.py at the path the old run.sh exec'd.
        nested = self.base / "current/scripts/prod-errors"
        nested.mkdir(parents=True)
        (nested / "prod_errors.py").write_text("# stale nested tree\n")
        (self.base / "current/stale-marker").write_text("stale\n")
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stderr)
        live = self.base / "current"
        self.assert_runnable_tree(live)
        # Replaced wholesale, not merged: the stale marker is gone from the live tree and the
        # old tree is kept aside for forensics.
        self.assertFalse((live / "stale-marker").exists())
        self.assertTrue((self.base / "current.prev/stale-marker").is_file())

    def test_install_copies_trees_when_git_is_unavailable(self):
        # Installed from an extracted tree with no git metadata: the cp fallback still stages the
        # full layout (and no .tree stamp -- run.sh's next tick self-updates and stamps it).
        self.stub("git", "exit 1")
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assert_runnable_tree(self.base / "current")
        self.assertFalse((self.base / "current/.tree").is_file())

    def test_run_sh_execs_a_runnable_path_when_current_is_nested(self):
        # Full nested live tree stamped with the legacy single-tree hash: the old run.sh treated
        # it as fresh, exec'd the flat path (which does not exist) and every unit died with
        # python's exit-2 file-not-found.
        repo = self.fixture_repo()
        legacy = subprocess.run(["git", "-C", str(repo), "rev-parse", "-q", "--verify",
                                 "origin/main:scripts/prod-errors"],
                                capture_output=True, text=True).stdout.strip()
        live = self.seed_live(nested=True, tree_hash=legacy)
        r, log = self.run_run_sh(repo)
        exec_line = self.last_exec(log)
        self.assertTrue(exec_line.startswith(str(live / "scripts/prod-errors/prod_errors.py")),
                        exec_line)
        self.assertTrue(exec_line.endswith(" sweep"), exec_line)

    def test_run_sh_self_update_ships_the_dependency_tree(self):
        # Empty live dir: the first tick must archive all three trees at the repo-relative
        # layout (tests are faked green here; the real gate runs this very suite in CI), stamp
        # the triple hash and exec from the nested path.
        repo = self.fixture_repo()
        (self.base).mkdir(parents=True, exist_ok=True)
        r, log = self.run_run_sh(repo)
        self.assertEqual(r.returncode, 0, r.stderr)
        live = self.base / "current"
        self.assert_runnable_tree(live)
        self.assertEqual((live / ".tree").read_text().strip(), self.tree_head(repo))
        exec_line = self.last_exec(log)
        self.assertTrue(exec_line.startswith(str(live / "scripts/prod-errors/prod_errors.py")),
                        exec_line)

    def test_run_sh_falls_back_to_a_legacy_flat_tree(self):
        # An old host's flat tree keeps running until the first successful update swaps in the
        # full tree: a matching .tree stamp means no update, and the flat path still execs.
        repo = self.fixture_repo()
        live = self.seed_live(nested=False, tree_hash=self.tree_head(repo))
        r, log = self.run_run_sh(repo)
        self.assertEqual(r.returncode, 0, r.stderr)
        exec_line = self.last_exec(log)
        self.assertTrue(exec_line.startswith(str(live / "prod_errors.py")), exec_line)

    def test_run_sh_names_a_clear_error_when_no_tree_is_runnable(self):
        # Mirror unusable and no live tree at all: exit 2 (the observed unit status) but with a
        # message that names the repair step instead of python's bare file-not-found.
        repo = self.home / "not-a-git-repo"
        repo.mkdir()
        self.base.mkdir(parents=True)
        r, log = self.run_run_sh(repo)
        self.assertEqual(r.returncode, 2, r.stderr)
        self.assertIn("install.sh", r.stderr)
        self.assertFalse(log.exists(), "nothing must be exec'd when no tree is runnable")

    def test_run_sh_never_promotes_a_tree_that_fails_its_own_tests(self):
        # A red candidate tree is never swapped in: the live tree keeps serving, .tree is left
        # untouched so the next tick retries, and nothing lands at current.prev.
        repo = self.fixture_repo()
        live = self.seed_live(nested=False, tree_hash="stale-does-not-match")
        self.stub("python3", 'printf "%s\\n" "$*" >> "$EXEC_LOG"\nexit 1')
        log = self.home / "exec.log"
        r = subprocess.run(
            ["bash", str(self.repo / "scripts/prod-errors/run.sh"), "sweep"],
            env=self.env(LANES_REPO=repo, PROD_ERRORS_HOME=self.base, EXEC_LOG=log),
            capture_output=True, text=True, timeout=180)
        exec_line = self.last_exec(log)
        self.assertTrue(exec_line.startswith(str(live / "prod_errors.py")), exec_line)
        self.assertEqual((live / ".tree").read_text().strip(), "stale-does-not-match")
        self.assertFalse((live / "scripts").exists(), "a red candidate tree must not be promoted")
        self.assertFalse((self.base / "current.prev").exists())

    def test_run_sh_ships_all_three_trees_and_execs_nested_first(self):
        # Source probe (runs even where bash/git fixtures cannot): the archive line ships the
        # full dependency tree, extraction preserves the repo-relative layout (no strip), and
        # exec resolves the nested path before the legacy flat one.
        sh = (self.repo / "scripts/prod-errors/run.sh").read_text()
        archive = sh.split('git -C "$repo" archive')[1].split("|")[0]
        for needed in self.trees:
            self.assertIn(needed, archive)
        self.assertNotIn("--strip-components", sh)
        self.assertIn('"$live/scripts/prod-errors/prod_errors.py"', sh)
        self.assertIn('"$live/prod_errors.py"', sh)


if __name__ == "__main__":
    unittest.main()
