"""Code sub-lanes: one class of code work never starves the others (2026-11-22): hermetic, no network.

JOV Todo held 468 issues against a code target of 6, most of them auto-filed remediation. Guard: fails
if a remediation burst spills past its own sub-lane, if activation loses its seat, or if an Urgent item
in one sub-lane displaces work in another.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import binding_refill
import linear_sync as ls
import priority_admission as pa
import remediation
import work_lane as wl
from test_priority_admission import NOW, FakeClient, FakeLane, row
from test_work_lane import moves, seed

STALE = "2026-10-01T00:00:00.000Z"


def item(n, sub, state="Backlog", priority=3, updated="2026-10-28T00:00:00.000Z", created="2026-09-01T00:00:00.000Z"):
    labels = {"activation": ("golden-path",), "remediation": (f"remediation:fp-{n}",), "small": ("size:xs",),
              "infra": ("fleet",), "product": ()}[sub]
    return row(n, state, priority=priority, labels=labels, updated=updated, created=created)


class RefillLane:
    linear_sync = ls

    @staticmethod
    def issue_hits_red_line(issue):
        return False

    Issue = staticmethod(lambda *a, **k: SimpleNamespace())


def refill(host, now=NOW):
    return binding_refill.refill(RefillLane, host, SimpleNamespace(key="JOV", excluded=()), FakeClient(), now=now)


def admit(d, host, backlog_ids, ticks=1):
    client = FakeClient({f"id-{n}": "Backlog" for n in backlog_ids})
    return [pa.run(FakeLane, host, "JOV", client, now=NOW + tick) for tick in range(ticks)]


def todo_by_sub(d):
    return {sub: sorted(r["identifier"] for r in rows) for sub, rows in wl.by_sub_lane(ls.todo(Path(d), "JOV")).items()}


class Classification(unittest.TestCase):
    def test_first_match_wins_in_sub_lane_order(self):
        cases = [
            ({"title": "x", "labels": ["area:auth", "flaky"]}, "activation"),
            ({"title": "x", "labels": ["remediation:claim-checkout-500"]}, "activation"),
            ({"title": "P0 QA: waitlist-signup-to-waitlisted broke", "labels": ["remediation:qa"]}, "activation"),
            ({"title": "[board:goal-rev-1] lift conversion", "labels": ["symphony"]}, "activation"),
            ({"title": "[board:doctor-x] fix", "labels": ["symphony"]}, "remediation"),
            ({"title": "x", "labels": ["remediation:dogfood-catalog-hidden"]}, "remediation"),
            ({"title": "x", "labels": ["Sentry:issue-9"]}, "remediation"),
            ({"title": "[ci] main is red", "labels": []}, "remediation"),
            ({"title": "Time bomb: cert expires", "labels": []}, "remediation"),
            ({"title": "x", "labels": ["batch:copy", "fleet"]}, "small"),
            ({"title": "x", "labels": ["fleet", "polish-later"]}, "infra"),
            ({"title": "x", "labels": ["no-symphony", "area:ci"]}, "product"),
            ({"title": "Fix the hero", "labels": []}, "product"),
        ]
        for issue, sub in cases:
            self.assertEqual(wl.code_sub_lane(issue), sub, issue)

    def test_lane_label_picks_the_sub_lane_and_hands_back_to_code(self):
        self.assertEqual(wl.code_sub_lane({"title": "[ci] red", "labels": ["lane:product"]}), "product")
        self.assertEqual(wl.code_sub_lane({"title": "x", "labels": ["golden-path", "Lane:Infra"]}), "infra")
        for labels in (["lane:design", "lane:remediation"], ["speed-win", "lane:small"]):
            self.assertEqual(wl.lane_of({"title": "x", "labels": labels}), "code", labels)

    def test_product_takes_the_room_the_seat_target_leaves(self):
        self.assertEqual(wl.sub_lane_depths(0)["product"], 2)
        self.assertEqual(wl.sub_lane_depths(8)["product"], 8, "a team with only product work keeps its depth")
        full = {"activation": [1] * 3, "remediation": [1] * 40}
        self.assertEqual(wl.sub_lane_depths(8, full)["product"], 2, "remediation counts only up to its own depth")


class RemediationBurstStaysInItsSubLane(unittest.TestCase):
    def test_refill_of_a_40_item_burst_fills_only_remediation(self):
        burst = [item(1000 + i, "remediation", priority=2) for i in range(40)]
        others = [item(10, "activation", priority=4), item(20, "product", priority=4), item(21, "product", priority=4),
                  item(30, "infra", priority=4)]
        with tempfile.TemporaryDirectory() as d:
            host = seed(d, burst + others)
            receipt = refill(host)
            subs = {sub: data["promoted"] for sub, data in receipt["codeSubLanes"].items()}
            self.assertEqual(len(subs["remediation"]), 3, "remediation stops at its depth")
            self.assertEqual(subs["activation"], ["JOV-10"])
            self.assertEqual(sorted(subs["product"]), ["JOV-20", "JOV-21"])
            self.assertEqual(subs["infra"], ["JOV-30"])
            again = refill(host, NOW + 10)
            self.assertEqual(again["promoted"], [], "pending promotions count: the burst gets no second helping")

    def test_urgent_burst_of_40_never_spills_into_other_sub_lanes(self):
        burst = [item(1000 + i, "remediation", priority=1) for i in range(40)]
        resident = [item(10 + i, "activation", "Todo", priority=4) for i in range(3)] + \
                   [item(20 + i, "product", "Todo", priority=4) for i in range(2)] + \
                   [item(30 + i, "infra", "Todo", priority=4) for i in range(2)] + \
                   [item(40 + i, "remediation", "Todo", priority=4) for i in range(2)]
        with tempfile.TemporaryDirectory() as d:
            receipts = admit(d, seed(d, burst + resident), range(1000, 1040), ticks=10)
            displaced = [i for r in receipts for i in r["displaced"]]
            self.assertEqual(sorted(displaced), ["JOV-40", "JOV-41"], "only remediation gives way")
            todo = todo_by_sub(d)
            self.assertEqual(len(todo["remediation"]), pa.OVERFLOW_PER_DEPTH * wl.SUB_LANE_DEPTH["remediation"])
            self.assertEqual(todo["activation"], ["JOV-10", "JOV-11", "JOV-12"])
            self.assertEqual(todo["product"], ["JOV-20", "JOV-21"])
            self.assertEqual(todo["infra"], ["JOV-30", "JOV-31"])
            self.assertEqual(receipts[-1]["admitted"], [])
            self.assertTrue(all(why == "sub-lane-full:remediation" for key, why in receipts[-1]["skipped"].items()
                                if int(key.split("-")[1]) >= 1000))


class UrgentStaysInsideItsSubLane(unittest.TestCase):
    def test_urgent_remediation_never_displaces_activation_or_product(self):
        # Activation and product hold the lowest-scoring Todo there is; remediation holds only Urgent work.
        resident = [item(10 + i, "activation", "Todo", priority=4, created="2026-01-01T00:00:00.000Z") for i in range(3)] + \
                   [item(20 + i, "product", "Todo", priority=4, created="2026-01-01T00:00:00.000Z") for i in range(4)] + \
                   [item(40 + i, "remediation", "Todo", priority=1) for i in range(3)]
        with tempfile.TemporaryDirectory() as d:
            receipts = admit(d, seed(d, [item(1, "remediation", priority=1), *resident]), [1])
            self.assertEqual(receipts[0]["admitted"], ["JOV-1"])
            self.assertEqual(receipts[0]["displaced"], [])
            self.assertEqual({target for _, target in moves(d)}, {"Todo"}, "nothing outside remediation went back")

    def test_urgent_product_displaces_product_not_activation(self):
        resident = [item(10 + i, "activation", "Todo", priority=4, created="2026-01-01T00:00:00.000Z") for i in range(3)] + \
                   [item(20 + i, "product", "Todo", priority=3) for i in range(2)]
        with tempfile.TemporaryDirectory() as d:
            receipt = admit(d, seed(d, [item(1, "product", priority=1), *resident]), [1])[0]
            self.assertEqual(receipt["admitted"], ["JOV-1"])
            self.assertEqual(len(receipt["displaced"]), 1)
            self.assertIn(receipt["displaced"][0], ("JOV-20", "JOV-21"))


class ActivationKeepsItsSeat(unittest.TestCase):
    def test_activation_refills_while_every_other_sub_lane_is_flooded(self):
        flood = [item(100 + i, sub, "Todo") for i, sub in enumerate(["remediation"] * 50 + ["infra"] * 20 + ["product"] * 30)]
        with tempfile.TemporaryDirectory() as d:
            receipt = refill(seed(d, [*flood, item(1, "activation", priority=4), item(2, "remediation")]))
            self.assertEqual(receipt["promoted"], ["JOV-1"])
            self.assertGreaterEqual(wl.SUB_LANE_MIN_SEATS["activation"], 1)

    def test_wip_demotion_stays_per_sub_lane_and_reaches_p2(self):
        product = [item(100 + i, "product", "Todo", priority=2, updated=STALE) for i in range(30)]
        activation = [item(200 + i, "activation", "Todo", priority=2, updated=STALE) for i in range(wl.sub_lane_ceiling(3))]
        with tempfile.TemporaryDirectory() as d:
            receipt = admit(d, seed(d, product + activation), [])[0]
            self.assertEqual(len(receipt["demoted"]), pa.MAX_DEMOTE_PER_TICK, "stale P2 product work is demoted")
            self.assertTrue(all(100 <= int(i.split("-")[1]) < 200 for i in receipt["demoted"]),
                            "activation at its ceiling keeps every item")


class SubLaneMeasure(unittest.TestCase):
    def test_measure_reports_each_sub_lane_and_keeps_lane_keys(self):
        rows = [item(1, "remediation", "Todo"), item(2, "remediation", "Todo", updated=STALE),
                dict(item(3, "activation", "In Progress"), stateType="started"), item(4, "product", "Todo")]
        metrics, snap = wl.measure(rows, NOW)
        self.assertEqual(set(metrics), set(wl.LANES))
        subs = snap["codeSubLanes"]
        self.assertEqual(set(subs), set(wl.SUB_LANES))
        self.assertEqual((subs["remediation"]["queued"], subs["activation"]["started"]), (2, 1))
        self.assertGreater(subs["remediation"]["oldestQueuedH"], subs["remediation"]["p50QueuedH"] - 0.01)
        later, _ = wl.measure([rows[0], rows[2], rows[3]], NOW + 3600, snap)
        self.assertEqual(set(later), set(wl.LANES))
        _, snap2 = wl.measure([rows[0], rows[2], rows[3]], NOW + 3600, snap)
        self.assertEqual(snap2["codeSubLanes"]["remediation"]["finishedSinceLast"]
                         + snap2["codeSubLanes"]["remediation"]["leftQueueSinceLast"], 1, "an exit is counted")

    def test_doctor_view_carries_the_sub_lane_block(self):
        with tempfile.TemporaryDirectory() as d:
            receipt = admit(d, seed(d, [item(1, "remediation", "Todo"), item(2, "product", "Todo")]), [])[0]
            self.assertEqual(receipt["codeSubLaneMetrics"]["remediation"]["queued"], 1)
            self.assertEqual(receipt["codeSubLanes"]["remediation"], {"todo": 1, "target": 3})
            view = wl.view(d)
            self.assertEqual(view["JOV"]["codeSubLanes"]["product"]["queued"], 1)
            self.assertEqual(set(view["JOV"]["lanes"]), set(wl.LANES))



ROOT = Path(__file__).resolve().parents[2]
# The shared JS filer helper with a stub Linear: prints the description it would create.
FILE_JS = """
const { upsertLinearIssueByTitleFingerprint } = await import(process.argv[1]);
let description = null;
const reply = data => new Response(JSON.stringify({ data }));
const fetchImpl = async (_url, init) => {
  const { query, variables } = JSON.parse(String(init.body));
  if (query.includes('FindIssueByFingerprint'))
    return reply({ team: { states: { nodes: [{ id: 'b', name: 'Backlog', type: 'backlog' }] }, labels: { nodes: [] } },
                   issues: { nodes: [] } });
  if (query.includes('FindIssueByRemediationLabel')) return reply({ issues: { nodes: [] } });
  if (query.includes('issueLabelCreate')) return reply({ issueLabelCreate: { success: true, issueLabel: { id: 'l' } } });
  description = variables.description;
  return reply({ issueCreate: { success: true, issue: { id: 'n', identifier: 'JOV-1', url: 'u' } } });
};
await upsertLinearIssueByTitleFingerprint({ fingerprint: 'ci-red-main-abc', labelKey: 'ci-red-main',
  title: '[ci] main is red (ci-red-main-abc)', description: 'Run 12 failed.', createStateName: 'Todo',
  priority: 1, apiKey: 'k', fetchImpl });
process.stdout.write(JSON.stringify(description));
"""


class FiledRemediationIsAdmissible(unittest.TestCase):
    """Filers write Backlog, so what they file must pass admission's readiness check or it never runs."""

    def admissible(self, title, description, labels):
        backlog = dict(row(1, priority=1, labels=labels), title=title, description=description)
        self.assertIsNone(binding_refill.skip_reason(backlog, {"JOV-1"}, frozenset()), description)
        got, _ = pa.admit_candidates([backlog], {}, now=NOW)
        self.assertEqual([r["identifier"] for r in got], ["JOV-1"], "Urgent remediation is admitted from Backlog")
        self.assertEqual(wl.code_sub_lane(backlog), "remediation")

    def test_lanes_remediation_intake_body(self):
        plan = remediation.linear_intake_plan({"source": "ci", "fingerprint": "abc123", "ws": "ci", "subject": "main",
                                               "evidence": {"url": "https://example.invalid/run/1"}})
        self.assertIn("## Definition of done", plan["description"])
        self.admissible(plan["title"], plan["description"], plan["labels"])

    @unittest.skipUnless(shutil.which("node"), "node unavailable")
    def test_shared_js_filer_helper(self):
        with tempfile.TemporaryDirectory() as d:
            out = subprocess.run(["node", "--input-type=module", "-e", FILE_JS,
                                  (ROOT / "scripts/lib/linear-issue-intake.mjs").as_uri()],
                                 capture_output=True, text=True, timeout=60, check=False, env={**os.environ, "LINEAR_COOLDOWN_STATE_DIR": d})
        self.assertEqual(out.returncode, 0, out.stderr)
        self.admissible("[ci] main is red (ci-red-main-abc)", json.loads(out.stdout), ["remediation:ci-red-main"])


if __name__ == "__main__":
    unittest.main()
