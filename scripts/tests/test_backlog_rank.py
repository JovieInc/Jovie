"""Backlog score and cheap-model grooming queue: hermetic, no gh, no network."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import backlog_rank as br  # noqa: E402
import binding_refill as refill  # noqa: E402
import linear_sync as ls  # noqa: E402

NOW = 1_800_000_000.0
BODY = "## Problem\n" + "A scoped defect with a known fix. " * 10 + "\n## Acceptance criteria\n- [ ] a\n- [ ] b\n- [ ] c\n"


def iso(days_ago):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(NOW - days_ago * 86400, timezone.utc).isoformat().replace("+00:00", "Z")


def row(n, title="fix thing", priority=3, labels=("agent-ready",), days=1, description=BODY, state="Backlog"):
    return {"id": f"id{n}", "identifier": f"JOV-{n}", "title": title, "description": description, "priority": priority,
            "createdAt": iso(days), "updatedAt": iso(0), "state": state, "labels": list(labels), "labelsComplete": True,
            "stateType": "backlog"}


class ScoreTests(unittest.TestCase):
    def test_severity_and_priority_outrank_age(self):
        old_low = row(1, priority=4, days=120)
        fresh_urgent = row(2, priority=1, days=1)
        self.assertEqual(br.order([old_low, fresh_urgent], NOW)[0]["identifier"], "JOV-2")

    def test_age_alone_breaks_equal_work_and_is_capped(self):
        self.assertEqual(br.order([row(1, days=2), row(2, days=40)], NOW)[0]["identifier"], "JOV-2")
        self.assertEqual(br.age_bonus(row(3, days=4000), NOW), br.AGE_CAP)

    def test_label_evidence_raises_value_once_per_group(self):
        base = br.value(row(1))[0]
        self.assertGreater(br.value(row(2, labels=("agent-ready", "P0")))[0], base + 5)
        self.assertEqual(br.value(row(3, labels=("agent-ready", "P0", "P1")))[0], br.value(row(4, labels=("agent-ready", "P0")))[0])

    def test_confidence_and_effort_from_the_row(self):
        self.assertEqual(br.confidence(row(1)), 1.0)
        self.assertEqual(br.confidence(row(2, description="no criteria here")), 0.5)
        self.assertGreater(br.effort(row(3, labels=("agent-ready", "type:feature"))), br.effort(row(4)))

    def test_compounding_workstream_leads_equal_work(self):
        ci = row(1, title="merge queue flake in CI", labels=("agent-ready", "ws:ci"))
        ui = row(2, title="button spacing", labels=("agent-ready", "ws:ui-ia"))
        self.assertEqual(br.order([ui, ci], NOW)[0]["identifier"], "JOV-1")

    def test_explain_is_deterministic_and_names_inputs(self):
        text = br.explain(row(1, priority=2, labels=("agent-ready", "P1")), NOW)
        self.assertEqual(text, br.explain(row(1, priority=2, labels=("agent-ready", "P1")), NOW))
        self.assertIn("priority 2", text)
        self.assertIn("p1", text)

    def test_factory_floor_only_when_share_known_and_under(self):
        factory = row(1, title="ci flake", priority=4, labels=("agent-ready", "ws:ci"))
        product = [row(n, priority=1, labels=("agent-ready", "ws:ui-ia")) for n in (2, 3)]
        ordered = br.order(product + [factory], NOW)
        self.assertEqual(ordered[0]["identifier"], "JOV-2")
        under = br.with_factory_floor(ordered, 2, 0.05, 0.2)
        self.assertEqual(under[0]["identifier"], "JOV-1")
        self.assertEqual(len(under), 2)
        self.assertEqual([r["identifier"] for r in br.with_factory_floor(ordered, 2, None, 0.2)], ["JOV-2", "JOV-3"])
        self.assertEqual([r["identifier"] for r in br.with_factory_floor(ordered, 2, 0.5, 0.2)], ["JOV-2", "JOV-3"])


class GroomTests(unittest.TestCase):
    def test_missing_info_is_specific_and_human_holds_are_not_groomed(self):
        self.assertEqual(refill.missing_info(row(1, labels=(), description="short")),
                         ["description under 200 chars: state the problem and the scope",
                          "no acceptance criteria: add a checkable Definition of done"])
        # agent-ready is retired as an admission requirement (2026-10-29): a complete row
        # without the label has no missing info — readiness is computed, never labelled.
        self.assertEqual(refill.missing_info(row(2, labels=())), [])
        self.assertEqual(refill.missing_info(row(3, labels=("needs-tim",), description="short")), [])
        self.assertEqual(refill.missing_info(row(4)), [])

    def test_groom_queue_is_ranked_and_bounded(self):
        rows = [row(1, priority=4, labels=(), description="## Acceptance criteria\n- [ ] Fix the defect"),
                row(2, priority=1, labels=(), description="A scoped defect with a known fix. " * 10),
                row(3, labels=())]
        queue = refill.groom_queue(rows, NOW, keep=1)
        self.assertEqual([item["id"] for item in queue], ["JOV-2"])
        self.assertEqual(queue[0]["missing"], ["no acceptance criteria: add a checkable Definition of done"])
        self.assertEqual([item["id"] for item in refill.groom_queue(rows, NOW, keep=2)], ["JOV-2", "JOV-1"])

    def test_view_counts_ready_age_percentiles(self):
        rows = [row(n, days=n, labels=()) for n in range(1, 11)] + [row(99, labels=(), description="short")]
        view = refill.view(rows, NOW)
        self.assertEqual((view["backlog"], view["ready"]), (11, 10))
        self.assertEqual(view["readyAgeDaysP50"], 6.0)


class RefillGuardTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.state = Path(self.dir.name)
        self.addCleanup(self.dir.cleanup)
        (self.state / "autoscale.json").write_text(json.dumps({"lanes": {"codex": {"intakeEffective": 1}}}))
        self.lane = SimpleNamespace(linear_sync=ls, Issue=lambda *a: SimpleNamespace(title=a[2], description=a[3]),
                                    issue_hits_red_line=lambda issue: False)
        self.host = SimpleNamespace(state=self.state)
        self.binding = SimpleNamespace(key="JOV", excluded=("hold",))
        path = ls.mirror_path(self.state, "JOV")
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = [row(n, priority=2) for n in range(1, 6)]
        path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))

    def test_promotion_comment_says_why_and_is_logged(self):
        receipt = refill.refill(self.lane, self.host, self.binding, object(), now=NOW + 5)
        self.assertEqual(len(receipt["promoted"]), 2)
        comments = [e for e in json.loads((self.state / "linear" / "outbox.json").read_text())["entries"] if e["op"] == "comment"]
        self.assertTrue(all("Why ranked here: score" in e["body"] for e in comments))
        log = [json.loads(line) for line in (self.state / "backlog-promotions.jsonl").read_text().splitlines()]
        self.assertEqual([entry["id"] for entry in log], receipt["promoted"])
        self.assertIn("backlogAgeS", log[0])

    def test_alarm_when_deficit_outlives_threshold_with_ready_work_left(self):
        refill.refill(self.lane, self.host, self.binding, object(), now=NOW + 5)
        # promotions never landed in the mirror: the deficit stays open past the alarm window
        (self.state / "linear" / "outbox.json").unlink()
        path = ls.mirror_path(self.state, "JOV")
        data = json.loads(path.read_text())
        data["syncedAt"] = NOW + 5 + refill.ALARM_AFTER_S
        path.write_text(json.dumps(data))
        receipt = refill.refill(self.lane, self.host, self.binding, object(), now=NOW + 5 + refill.ALARM_AFTER_S + 60)
        self.assertEqual(receipt.get("alarm"), "ready-work-in-backlog")
        status = ls.status(self.state, NOW + 5 + refill.ALARM_AFTER_S + 60)
        self.assertIn("backlog-ready-idle:JOV", ls.alerts(status))

    def test_no_alarm_when_target_met(self):
        receipt = refill.refill(self.lane, self.host, SimpleNamespace(key="JOV", excluded=()), object(), floor=0, now=NOW + 5)
        self.assertNotIn("alarm", receipt)


class RankWriteTests(unittest.TestCase):
    def test_plan_puts_ranked_rows_above_everything_and_settles(self):
        ranked = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
        plan = br.plan_sort_orders(ranked, {"a": -5.0, "b": -9.0, "c": -1.0}, others_min=-4.0)
        self.assertEqual(plan, {"a": -7.0, "b": -6.0, "c": -5.0})
        self.assertLess(max(plan.values()), -4.0)
        self.assertEqual(br.plan_sort_orders(ranked, plan, -4.0), {})  # settled: no writes, no drift
        self.assertEqual(br.plan_sort_orders(ranked, {"a": 1.0}, 0.0), {})  # unknown order: never guess

    def test_rank_pass_reads_once_writes_through_outbox_in_batches(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        rows = [row(n, priority=1 + n % 3) for n in range(1, 16)]
        path = ls.mirror_path(state, "JOV"); path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))
        calls = []

        class Client:
            def gql(self, query, variables):
                calls.append(query)
                return {"issues": {"pageInfo": {"hasNextPage": False},
                                   "nodes": [{"id": r["id"], "identifier": r["identifier"], "sortOrder": -float(i)} for i, r in enumerate(rows)]}}
        lane = SimpleNamespace(linear_sync=ls)
        host = SimpleNamespace(state=state)
        binding = SimpleNamespace(key="JOV", excluded=())
        first = refill.rank_pass(lane, host, binding, Client(), now=NOW + 1)
        self.assertEqual((first["written"], len(first["pending"])), (10, 5))
        self.assertEqual(len(calls), 1)
        second = refill.rank_pass(lane, host, binding, Client(), now=NOW + 2)  # drains the rest, no second read
        self.assertEqual((second["written"], len(second["pending"])), (5, 0))
        self.assertEqual(len(calls), 1)
        entries = [e for e in json.loads((state / "linear" / "outbox.json").read_text())["entries"] if e["op"] == "rank"]
        self.assertEqual(len(entries), 15)
        values = {e["issueId"]: e["value"] for e in entries}
        best = br.order(rows, NOW + 1)
        self.assertEqual(sorted(values, key=values.get), [r["id"] for r in best])
        throttled = refill.rank_pass(lane, host, binding, Client(), now=NOW + 3)
        self.assertEqual(throttled.get("skipped"), "throttled")

    def test_outbox_label_and_rank_ops_are_idempotent(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        for _ in range(2):
            ls.enqueue(state, "label", "id1", body="agent-ready")
            ls.enqueue(state, "rank", "id1", target="-3.5")
        ls.enqueue(state, "rank", "id1", target="-4.5")
        entries = json.loads((state / "linear" / "outbox.json").read_text())["entries"]
        self.assertEqual(sorted((e["op"], e.get("value") or e.get("body")) for e in entries),
                         [("label", "agent-ready"), ("rank", -4.5)])


class FactoryShareTests(unittest.TestCase):
    def test_share_comes_from_the_ledger_once_an_hour_and_unknown_is_none(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        fake = state / "fleet_ledger.py"
        fake.write_text("import json;print(json.dumps({'factory':{'factory':1,'product':9,'share':0.1}}))")
        old = refill.FLEET_LEDGER
        refill.FLEET_LEDGER = fake
        self.addCleanup(setattr, refill, "FLEET_LEDGER", old)
        self.assertEqual(refill._factory_share(state, now=100.0), 0.1)
        fake.write_text("raise SystemExit(1)")
        self.assertEqual(refill._factory_share(state, now=200.0), 0.1)   # cached
        self.assertIsNone(refill._factory_share(state, now=100.0 + refill.SHARE_TTL_S + 1))
        fake.write_text("import json;print(json.dumps({'factory':{'factory':0,'product':0,'share':0.0}}))")
        self.assertIsNone(refill._factory_share(state, now=100000.0))   # nothing classified: unknown


class WakeTests(unittest.TestCase):
    def test_wake_files_are_validated_deduped_and_consumed(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        refill.write_wake(state, "JOV", "tim-comment", now=10.0)
        refill.write_wake(state, "JOV", "tim-comment", now=11.0)          # same team+reason: one file
        refill.write_wake(state, "LYB", "sentry-spike", now=12.0)
        (state / "wake" / "backlog-XXX-issue-created.json").write_text(json.dumps(
            {"schema": refill.WAKE_SCHEMA, "team": "XXX", "reason": "issue-created", "at": 1}))
        (state / "wake" / "backlog-bad.json").write_text("{not json")
        (state / "wake" / "red-5-abc-1.json").write_text("{}")             # not ours: untouched
        got = refill.drain_wakes(state, {"JOV", "LYB"}, now=20.0)
        self.assertEqual(sorted((w["team"], w["reason"]) for w in got), [("JOV", "tim-comment"), ("LYB", "sentry-spike")])
        self.assertEqual({p.name for p in (state / "wake").iterdir()}, {"red-5-abc-1.json"})
        self.assertEqual(len((state / "backlog-wakes.jsonl").read_text().splitlines()), 2)
        with self.assertRaises(ValueError):
            refill.write_wake(state, "JOV", "because")


class GroomApplyTests(unittest.TestCase):
    def test_apply_queues_rationale_and_marks_checked_without_agent_ready_label(self):
        import groom_pass
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        for team in ("JOV", "LYB"):
            path = ls.mirror_path(state, team); path.parent.mkdir(parents=True, exist_ok=True)
            rows = [row(1, labels=())] if team == "JOV" else []
            path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))
        done = groom_pass.apply(state, [{"id": "JOV-1", "verdict": "ready", "rationale": "One scoped PR."},
                                        {"id": "JOV-1", "verdict": "error"}, {"id": "JOV-9", "verdict": "ready", "rationale": "x"}])
        self.assertEqual(done, ["JOV-1"])
        entries = json.loads((state / "linear" / "outbox.json").read_text())["entries"]
        self.assertEqual(sorted((e["op"], e.get("body", "")) for e in entries),
                         [("comment", "Readiness pass (grok-4.7): agent-ready. One scoped PR."),
                          ("label", "readiness-checked")])

    def test_not_ready_comments_only_for_urgent_or_high(self):
        import groom_pass
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        for team in ("JOV", "LYB"):
            path = ls.mirror_path(state, team); path.parent.mkdir(parents=True, exist_ok=True)
            rows = [dict(row(1), priority=3), dict(row(2), priority=1)] if team == "JOV" else []
            path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))
        groom_pass.apply(state, [{"id": "JOV-1", "verdict": "not_ready", "rationale": "r"}, {"id": "JOV-2", "verdict": "not_ready", "rationale": "r"}])
        ops = sorted((e["op"], e["issue"] if "issue" in e else e.get("issueId")) for e in json.loads((state / "linear" / "outbox.json").read_text())["entries"])
        self.assertEqual(sum(1 for op, _ in ops if op == "comment"), 1)
        self.assertEqual(sum(1 for op, _ in ops if op == "label"), 2)


if __name__ == "__main__":
    unittest.main()
