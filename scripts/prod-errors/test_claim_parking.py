import json
import tempfile
import time
import unittest
from pathlib import Path

import prod_errors as pe


class FakeSentry:
    def latest_trace(self, sid):
        return "Error: boom"

    def resolve(self, sid):
        pass


class FakeLinear:
    def __init__(self):
        self.created, self.comments = [], []

    def find_by_label(self, name, open_only=False):
        return next((c["id"] for c in self.created if name in c["labels"]), None)

    def create(self, title, body, labels, priority):
        self.created.append({"id": f"JOV-{len(self.created) + 1}", "title": title, "body": body,
                             "labels": labels, "p": priority})
        return self.created[-1]["id"]

    def comment(self, ident, body):
        self.comments.append((ident, body))

    def state_type(self, ident):
        return "unstarted"  # the linked issue stays open: the parking path is what fires


class ClaimParkingTest(unittest.TestCase):
    """JOV-10504: a claim whose linked issue stays open and never gets a PR used to re-arm
    forever, posting 'Claim expired with no PR. Escalated ... re-arming claim.' every CLAIM_S.
    It must park after MAX_CLAIM_ESCALATIONS escalations and bind a later PR again."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.s, self.l, self.ledger, self.t = FakeSentry(), FakeLinear(), {}, time.time()

    def issue(self, **kw):
        base = {"id": "101", "title": "TypeError in track page release credits", "culprit": "app/[username]/[slug]",
                "userCount": 3, "count": 9, "firstSeen": pe.iso(self.t - 60), "lastSeen": pe.iso(self.t - 30)}
        return {**base, **kw}

    def expire(self, k):
        # The k-th expiry pass: past the (k-1)-th re-arm (each re-arm pushes claimExpiresAt
        # out by CLAIM_S, so k*(CLAIM_S+2) is always beyond it).
        pe.advance(self.ledger, self.l, self.s, [], self.t + k * (pe.CLAIM_S + 2), self.dir)

    def alerts(self):
        return [json.loads(x) for x in (self.dir / "alerts.jsonl").read_text().splitlines()]

    def test_claim_expiry_parks_after_max_escalations(self):
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        cap = pe.MAX_CLAIM_ESCALATIONS
        for k in range(1, cap + 1):  # every expiry up to the cap re-arms and escalates once
            self.expire(k)
            self.assertEqual(self.ledger["101"]["status"], "claimed")
            self.assertEqual(self.ledger["101"]["escalations"], k)
        self.expire(cap + 1)  # one past the cap: park, do not re-arm, do not re-alert
        e = self.ledger["101"]
        self.assertEqual(e["status"], "parked")
        self.assertEqual(e["parkReason"], "claim-expired-cap")
        self.assertEqual(e["escalations"], cap + 1)
        self.assertEqual(e["parkedAt"], self.t + (cap + 1) * (pe.CLAIM_S + 2))
        self.assertTrue(any("Parking this claim" in c[1] for c in self.l.comments))
        self.assertEqual(sum(a["kind"] == "claim-parked" for a in self.alerts()), 1)
        self.assertEqual(sum(a["kind"] == "claim-expired" for a in self.alerts()), cap)
        # A parked entry must not re-enter the expiry comment loop: no further comments,
        # alerts or re-arms, however many sweeps pass with still no PR.
        comments, alerts, expiry = len(self.l.comments), len(self.alerts()), e["claimExpiresAt"]
        for k in range(cap + 2, cap + 5):
            self.expire(k)
        self.assertEqual(len(self.l.comments), comments)
        self.assertEqual(len(self.alerts()), alerts)
        self.assertEqual(self.ledger["101"]["claimExpiresAt"], expiry)
        self.assertEqual(self.ledger["101"]["status"], "parked")

    def test_parked_claim_binds_later_pr(self):
        pe.handle_issue(self.issue(), self.ledger, self.s, self.l, [], self.t, self.dir)
        ident = self.ledger["101"]["linear"]
        for k in range(1, pe.MAX_CLAIM_ESCALATIONS + 2):
            self.expire(k)
        self.assertEqual(self.ledger["101"]["status"], "parked")
        # A later OPEN fix PR unparks back to claimed and re-arms the claim window.
        at = self.t + 100 * (pe.CLAIM_S + 2)
        prs = [{"number": 424242, "title": f"fix: repair the credits TypeError ({ident})", "body": f"Refs {ident}.",
                "headRefName": "cursor/claim-expired-cap", "mergedAt": None}]
        pe.advance(self.ledger, self.l, self.s, prs, at, self.dir)
        e = self.ledger["101"]
        self.assertEqual(e["status"], "claimed")
        self.assertEqual(e["pr"], 424242)
        self.assertEqual(e["claimExpiresAt"], at + pe.CLAIM_S)
        self.assertTrue(e.get("parkedAt"))  # park history is kept for forensics, not wiped
        # The same PR merging deploys the unparked claim as usual.
        prs[0]["mergedAt"] = pe.iso(at + 60)
        pe.advance(self.ledger, self.l, self.s, prs, at + 120, self.dir)
        self.assertEqual(self.ledger["101"]["status"], "deployed")
        self.assertAlmostEqual(self.ledger["101"]["deployedAt"], at + 60, delta=1)  # iso() truncates to seconds


if __name__ == "__main__":
    unittest.main()
