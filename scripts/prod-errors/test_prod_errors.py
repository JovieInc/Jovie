import json
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
        self.assertEqual(h["receiver"]["status"], "missing")
        self.assertEqual(h["synthetic"]["status"], "pending-first-run")

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
