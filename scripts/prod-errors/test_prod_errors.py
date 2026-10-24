import json
import os
import tempfile
import time
import unittest
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
        self.created, self.comments, self.states, self.n = [], [], [], 0

    def find_by_label(self, name):
        return next((c["id"] for c in self.created if name in c["labels"]), None)

    def create(self, title, body, labels, priority):
        self.n += 1
        self.created.append({"id": f"JOV-{self.n}", "title": title, "body": body, "labels": labels, "p": priority})
        return f"JOV-{self.n}"

    def comment(self, ident, body):
        self.comments.append((ident, body))

    def set_state(self, ident, t):
        self.states.append((ident, t))


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
        r = pe.handle_issue(self.issue(title="Timeout in cron", culprit="jobs/x"), self.ledger, self.s, self.l, [], self.t, self.dir)
        self.assertEqual(r, "below-threshold")

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


if __name__ == "__main__":
    unittest.main()
