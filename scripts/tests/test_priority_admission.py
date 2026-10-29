"""Priority admission, Todo WIP sanity and signed Summer rank (JOV-7073): hermetic, no network."""
from __future__ import annotations

import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import priority_admission as pa  # noqa: E402
import linear_sync as ls  # noqa: E402

NOW = 1793242000.0
BODY = ("## Problem\n" + "The golden path tests skip themselves so CI is green with the flow untested. " * 4 +
        "\n\n## Acceptance criteria\n- [ ] no skips\n")


def row(n, state="Backlog", priority=3, labels=("agent-ready",), created="2026-09-01T00:00:00.000Z",
        updated="2026-10-28T00:00:00.000Z"):
    return {"id": f"id-{n}", "identifier": f"JOV-{n}", "title": f"task {n}", "description": BODY, "priority": priority,
            "createdAt": created, "updatedAt": updated, "state": state, "labels": list(labels), "labelsComplete": True}


def keypair():
    """(private PEM, public PEM) from node, which the verifier also falls back to."""
    script = ("const c=require('node:crypto');const k=c.generateKeyPairSync('ed25519');"
              "process.stdout.write(JSON.stringify({priv:k.privateKey.export({type:'pkcs8',format:'pem'}),"
              "pub:k.publicKey.export({type:'spki',format:'pem'})}))")
    try:
        out = json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)
    except (OSError, subprocess.SubprocessError):
        raise ImportError("node unavailable")
    return out["priv"], out["pub"]


def envelope(key, items, sent="2026-10-29T02:46:00Z"):
    import capacity_limit
    body = {"schema": pa.RANK_SCHEMA, "sentAt": sent, "deliveryId": "d-1", "signatureKeyId": "k1", "items": items}
    sig = capacity_limit.sign(f"{pa.RANK_SCHEMA}\0{pa.canonical(body)}".encode(), key)
    return {**body, "signature": "ed25519=" + sig}


class Selection(unittest.TestCase):
    def test_urgent_and_ranked_admitted_others_not(self):
        rows = [row(1, priority=1), row(2, priority=2), row(3, priority=3), row(4, priority=1, labels=())]
        got, skipped = pa.admit_candidates(rows, {"JOV-3": 1}, now=NOW)
        self.assertEqual([r["identifier"] for r in got], ["JOV-3", "JOV-1"])
        self.assertEqual(skipped["JOV-4"], "not-agent-ready")

    def test_hold_label_blocks_urgent(self):
        got, _ = pa.admit_candidates([row(1, priority=1, labels=("agent-ready", "needs-tim"))], {}, now=NOW)
        self.assertEqual(got, [])

    def test_displacement_skips_protected_lowest_first(self):
        todo = [row(1, "Todo", priority=1), row(2, "Todo", priority=4), row(3, "Todo", priority=2),
                row(4, "Todo", priority=4, labels=("dispatch-next",)), row(5, "Todo", priority=2)]
        order = [r["identifier"] for r in pa.displacement_order(todo, {"JOV-5": 1}, NOW)]
        self.assertEqual(order, ["JOV-2", "JOV-3"])

    def test_stale_demotion_only_old_low_priority(self):
        old = "2026-10-01T00:00:00.000Z"
        todo = [row(1, "Todo", 3, updated=old), row(2, "Todo", 2, updated=old), row(3, "Todo", 4),
                row(4, "Todo", 4, updated="2026-09-01T00:00:00.000Z"), row(5, "Todo", 0, updated=old)]
        got = [r["identifier"] for r in pa.stale_demotions(todo, {}, NOW, 10)]
        self.assertEqual(got, ["JOV-4", "JOV-1"])
        self.assertEqual(len(pa.stale_demotions(todo, {}, NOW, 1)), 1)


class Rank(unittest.TestCase):
    def setUp(self):
        try:
            self.key, self.pub = keypair()
        except ImportError:
            self.skipTest("cryptography unavailable")

    def test_valid_signature_ingested_and_claim_key(self):
        with tempfile.TemporaryDirectory() as d:
            result = pa.ingest(d, envelope(self.key, [{"id": "JOV-9693", "rank": 1}]), now=NOW, pem=self.pub)
            self.assertTrue(result["ok"], result)
            ranks = pa.summer_ranks(d, NOW)
            self.assertEqual(ranks, {"JOV-9693": 1})
            self.assertLess(pa.claim_key("JOV-9693", ranks), pa.claim_key("JOV-1", ranks))
            self.assertEqual(pa.summer_ranks(d, NOW + pa.RANK_TTL_S + 10), {})

    def test_rejects_tamper_stale_and_wrong_key(self):
        with tempfile.TemporaryDirectory() as d:
            good = envelope(self.key, [{"id": "JOV-9693", "rank": 1}])
            tampered = {**good, "items": [{"id": "JOV-1", "rank": 1}]}
            self.assertEqual(pa.ingest(d, tampered, NOW, self.pub)["reason"], "bad-signature")
            self.assertEqual(pa.ingest(d, good, NOW + 2 * pa.RANK_TTL_S, self.pub)["reason"], "stale-or-future")
            _, other = keypair()
            self.assertEqual(pa.ingest(d, good, NOW, other)["reason"], "bad-signature")
            self.assertEqual(pa.ingest(d, {**good, "signature": "x"}, NOW, self.pub)["reason"], "unsigned")
            self.assertEqual(pa.summer_ranks(d, NOW), {})


class FakeLane:
    @staticmethod
    def issue_hits_red_line(issue):
        return False

    @staticmethod
    def Issue(*args):
        return SimpleNamespace(args=args)


class FakeClient:
    """Linear live read: every issue is in the state the test mirror says, unless overridden."""
    def __init__(self, states=None):
        self.states = states or {}

    def gql(self, query, variables):
        return {"issue": {"state": {"name": self.states.get(variables["id"], "Backlog" if variables["id"] in ("id-1", "id-2") else "Todo")}}}


class RunTests(unittest.TestCase):
    def seed(self, d, rows):
        state = Path(d)
        path = ls.mirror_path(state, "JOV")
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))
        return SimpleNamespace(state=str(state))

    def test_urgent_admitted_over_target_displacing_lowest_and_measured(self):
        todo = [row(100 + i, "Todo", priority=3 if i % 2 else 4) for i in range(40)]
        with tempfile.TemporaryDirectory() as d:
            host = self.seed(d, [row(1, priority=1), row(2, priority=3), *todo])
            receipt = pa.run(FakeLane, host, "JOV", FakeClient(), now=NOW)
            self.assertEqual(receipt["admitted"], ["JOV-1"])
            self.assertEqual(len(receipt["displaced"]), 1)
            entries = ls._read(Path(d) / "linear" / "outbox.json", ls.OUTBOX)["entries"]
            moves = {(e["issueId"], e["target"]) for e in entries if e["op"] == "move"}
            self.assertIn(("id-1", "Todo"), moves)
            self.assertIn(("id-" + receipt["displaced"][0].split("-")[1], "Backlog"), moves)
            # a lane claims it 90s later: admitted -> claimed latency is recorded
            ls.claim(Path(d), "id-1", "JOV-1", "codex")
            claims = ls._claims(Path(d))
            claims["id-1"]["claimedAt"] = NOW + 90
            with ls._mutating(ls._claims_path(Path(d)), ls.CLAIMS) as data:
                data["claims"] = claims
            self.assertEqual(pa.measure(d, NOW + 100)["admittedToClaimedMinP50"], 1.5)

    def test_wip_ceiling_demotes_stale_low_priority_in_bounded_batch(self):
        stale = "2026-10-01T00:00:00.000Z"
        todo = [row(100 + i, "Todo", priority=4, updated=stale) for i in range(60)]
        with tempfile.TemporaryDirectory() as d:
            receipt = pa.run(FakeLane, self.seed(d, todo), "JOV", FakeClient(), now=NOW)
            self.assertEqual(len(receipt["demoted"]), pa.MAX_DEMOTE_PER_TICK)
            self.assertEqual(receipt["admitted"], [])

    def test_live_state_change_and_superseded_claim_block_admission(self):
        with tempfile.TemporaryDirectory() as d:
            host = self.seed(d, [row(1, priority=1), row(2, priority=1)])
            receipt = pa.run(FakeLane, host, "JOV", FakeClient({"id-1": "In Progress"}), now=NOW)
            self.assertEqual(receipt["admitted"], ["JOV-2"])
            self.assertEqual(receipt["skipped"]["JOV-1"], "live-state-changed")

    def test_lagging_mirror_still_nominates(self):
        with tempfile.TemporaryDirectory() as d:
            host = self.seed(d, [row(1, priority=1)])
            receipt = pa.run(FakeLane, host, "JOV", FakeClient(), now=NOW + 3000)
            self.assertEqual(receipt["admitted"], ["JOV-1"])

    def test_stale_mirror_holds(self):
        with tempfile.TemporaryDirectory() as d:
            host = self.seed(d, [row(1, priority=1)])
            receipt = pa.run(FakeLane, host, "JOV", FakeClient(), now=NOW + 7 * 3600)
            self.assertEqual(receipt["held"], "mirror-stale")


if __name__ == "__main__":
    unittest.main()
