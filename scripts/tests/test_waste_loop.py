import json, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "capacity"), str(ROOT / "lanes")]
import waste as w
import factory_intake as fi

REG = json.loads(w.REGISTRY.read_text())
SPECS = {m["id"]: m for c in REG["classes"] for m in c["metrics"]}


class Registry(unittest.TestCase):
    def test_every_metric_has_a_valid_detector_and_a_known_class(self):
        for cid in ("money", "api-calls", "llm", "ci", "queue-rework", "agent-time", "tim-attention",
                    "notifications", "storage", "idle-compute", "tech-debt"):
            self.assertIn(cid, {c["id"] for c in REG["classes"]})
        for m in SPECS.values():
            self.assertIn(m["detector"]["kind"], ("ceiling", "wow", "zero-denominator"), m["id"])

    def test_six_known_incidents_are_seeded(self):
        self.assertEqual(len(REG["seeds"]), 6)
        self.assertTrue({s["class"] for s in REG["seeds"]} <= {c["id"] for c in REG["classes"]})


class Detectors(unittest.TestCase):
    def test_zero_denominator_flags_spend_with_no_users(self):
        spec = SPECS["money.usd_per_day_zero_users"]
        self.assertEqual(w.detect(spec, 7.4, 0, None)["status"], "WASTE")
        self.assertEqual(w.detect(spec, 7.4, 12, None)["status"], "OK")
        self.assertEqual(w.detect(spec, 0.2, 0, None)["status"], "OK")

    def test_wow_needs_history_and_growth(self):
        spec = SPECS["ci.runs_per_merged_pr"]
        self.assertEqual(w.detect(spec, 20, None, None)["status"], "OK")
        self.assertEqual(w.detect(spec, 20, None, 10)["status"], "WASTE")
        self.assertEqual(w.detect(spec, 11, None, 10)["status"], "OK")

    def test_missing_reading_is_a_gap_never_ok(self):
        self.assertEqual(w.detect(SPECS["ci.cancelled_share"], None, None, None)["status"], "GAP")

    def test_ranking_orders_by_excess(self):
        rows = [{"status": "WASTE", "excess": 2}, {"status": "OK", "excess": 9}, {"status": "WASTE", "excess": 5}]
        self.assertEqual([r["excess"] for r in w.ranking(rows)], [5, 2])


class FixStream(unittest.TestCase):
    def row(self):
        return {"id": "ci.cancelled_share", "class": "ci", "owner": "ci", "label": "Cancelled share", "unit": "share",
                "value": 0.5, "status": "WASTE", "excess": 1.4, "why": "0.5 vs ceiling 0.35"}

    def test_signal_is_valid_for_factory_intake_and_labelled_waste(self):
        sig = w.signal(REG, self.row(), SPECS["ci.cancelled_share"])
        self.assertIsNone(fi.validate(sig))
        planned = fi.plan([sig])[0]
        self.assertIn("waste", planned["labels"])
        self.assertIn("ws:symphony-throughput", planned["labels"])

    def test_signals_are_written_once(self):
        with tempfile.TemporaryDirectory() as d:
            first = w.write_signals(REG, [self.row()], SPECS, Path(d))
            again = w.write_signals(REG, [self.row()], SPECS, Path(d))
        self.assertEqual(len(first), 1)
        self.assertEqual(again, [])

    def test_waste_has_a_reserved_intake_slot(self):
        class Linear:
            n = 0
            def gql(self, q, v):
                if "teams" in q:
                    return {"teams": {"nodes": [{"id": "t", "states": {"nodes": [{"name": "Todo", "id": "s"}]},
                                                 "labels": {"nodes": []}}]}}
                if "issueLabelCreate" in q:
                    return {"issueLabelCreate": {"issueLabel": {"id": "l"}}}
                if "issueCreate" in q:
                    Linear.n += 1
                    return {"issueCreate": {"success": True, "issue": {"identifier": f"JOV-{Linear.n}"}}}
                return {"issues": {"nodes": [], "pageInfo": {"hasNextPage": False}}}
        mk = lambda fp, extra: {"fingerprint": fp, "title": fp, "description": fp, "labels": ["factory", *extra, f"factory-fp:{fp}"],
                                "receiptKeys": [], "receiptHistory": {}}
        items = [mk(f"f{i}", []) for i in range(4)] + [mk("waste-a", ["waste"]), mk("waste-b", ["waste"])]
        out = fi.apply(Linear(), items, limit=3, covered={})
        filed = [r["fingerprint"] for r in out if r["action"] == "filed"]
        self.assertEqual(sorted(filed), ["f0", "f1", "f2", "waste-a"])


class Wins(unittest.TestCase):
    def test_drop_under_flagged_baseline_records_before_and_after(self):
        with tempfile.TemporaryDirectory() as d:
            st = Path(d)
            bad = {"id": "ci.cancelled_share", "class": "ci", "owner": "ci", "label": "Cancelled share", "unit": "share",
                   "value": 0.5, "status": "WASTE", "excess": 1.4, "why": "x"}
            self.assertEqual(w.settle_wins(REG, [bad], st, 0), [])
            good = dict(bad, value=0.2, status="OK", excess=0.5)
            wins = w.settle_wins(REG, [good], st, 86400)
        self.assertEqual(wins[0]["metrics"][0]["before"], 0.5)
        self.assertEqual(wins[0]["metrics"][0]["after"], 0.2)

    def test_a_transient_store_failure_keeps_the_win_open_for_retry(self):
        bad = {"id": "ci.cancelled_share", "class": "ci", "owner": "ci", "label": "Cancelled share", "unit": "share",
               "value": 0.5, "status": "WASTE", "excess": 1.4, "why": "x"}
        good = dict(bad, value=0.2, status="OK", excess=0.5)
        with tempfile.TemporaryDirectory() as d:
            st = Path(d)
            w.settle_wins(REG, [bad], st, 0)
            orig = w.store_put
            w.store_put = lambda *a, **k: "store unreachable"
            try:
                self.assertEqual(w.settle_wins(REG, [good], st, 86400), [])
                self.assertIn("ci.cancelled_share", json.loads((st / "waste-open.json").read_text()))
                self.assertFalse((st / "waste-wins.jsonl").exists())
            finally:
                w.store_put = orig
            self.assertEqual(len(w.settle_wins(REG, [good], st, 86400)), 1)

    def test_dropping_a_signal_lets_a_regression_file_fresh_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            row = FixStream().row()
            self.assertEqual(len(w.write_signals(REG, [row], SPECS, Path(d))), 1)
            w.drop_signal(row["id"], Path(d))
            self.assertEqual(len(w.write_signals(REG, [row], SPECS, Path(d))), 1)

    def test_fleet_feed_metrics_read_the_fleet_collector_not_a_missing_file(self):
        for mid in ("agent.duplicate_overlaps", "idle.ready_minutes"):
            self.assertTrue(SPECS[mid]["source"].startswith("fleet."), mid)
        with tempfile.TemporaryDirectory() as d:
            orig = w.lanes_state
            w.lanes_state = lambda: Path(d)
            try:
                self.assertEqual(w.col_fleet(), {})  # no ledger yet: a GAP, never a zero
            finally:
                w.lanes_state = orig

    def test_store_put_fails_open_without_credentials(self):
        self.assertEqual(w.store_put("a/b.json", {}, True, env={}), "store not configured")


class FirstPushGates(unittest.TestCase):
    @staticmethod
    def pr(*conclusions):
        names = w.GATE_CHECKS
        nodes = [{"__typename": "CheckRun", "name": n, "conclusion": c} for n, c in zip(names, conclusions)]
        return {"commits": {"nodes": [{"commit": {"statusCheckRollup": {"contexts": {"nodes": nodes}}}}]}}

    def test_share_counts_only_finished_prs_and_any_red_gate(self):
        ok = self.pr("SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS")
        red = self.pr("SUCCESS", "SUCCESS", "FAILURE", "FAILURE")
        running = self.pr("SUCCESS", "SUCCESS", None, None)
        none = {"commits": {"nodes": [{"commit": {"statusCheckRollup": None}}]}}
        self.assertEqual(w.first_push_failure_share([ok, red, running, none, ok, ok]), (0.25, 4))
        self.assertEqual(w.first_push_failure_share([]), (None, 0))

    def test_metric_is_registered_with_a_ceiling(self):
        self.assertEqual(SPECS["pr.first_push_gate_failure_rate"]["detector"]["kind"], "ceiling")


if __name__ == "__main__":
    unittest.main()
