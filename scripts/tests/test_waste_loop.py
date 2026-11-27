import json, subprocess, sys, tempfile, unittest
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

    def test_open_asks_of_tim_have_a_ceiling_of_three(self):
        # Tim 2026-10-30: Ovie Home showed 36 asks; doctrine says most default.
        spec = SPECS["tim.open_asks"]
        cls = next(c for c in REG["classes"] if any(m["id"] == "tim.open_asks" for m in c["metrics"]))
        self.assertEqual(cls["id"], "tim-attention")
        self.assertEqual(w.detect(spec, 36, None, None)["status"], "WASTE")
        self.assertEqual(w.detect(spec, 3, None, None)["status"], "OK")
        self.assertEqual(w.detect(spec, None, None, None)["status"], "GAP")

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
                    return {"teams": {"nodes": [{"id": "t", "states": {"nodes": [{"name": "Backlog", "id": "s"}]},
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


class SummerCritic(unittest.TestCase):
    @staticmethod
    def opener(payload):
        class R:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return json.dumps(payload).encode()
        return lambda req, timeout: R()

    def test_reads_failure_rates_from_the_critic_route(self):
        sweep = {"turns": 40, "failureRate": 0.15, "rateByClass": {"noise-to-tim": 0.05}, "missedIncidents": 1}
        self.assertEqual(w.col_summer(self.opener({"sweep": sweep})),
                         {"turnFailureRate": 0.15, "noiseToTimRate": 0.05, "missedIncidents": 1})

    def test_no_sweep_or_unreachable_is_a_gap(self):
        self.assertEqual(w.col_summer(self.opener({"sweep": None})), {})
        def down(req, timeout): raise OSError("down")
        self.assertEqual(w.col_summer(down), {})

    def test_metrics_live_in_tim_attention_and_any_missed_incident_is_waste(self):
        tim = next(c for c in REG["classes"] if c["id"] == "tim-attention")
        self.assertTrue({"summer.turn_failure_rate", "summer.noise_to_tim_rate", "summer.missed_incidents"} <= {m["id"] for m in tim["metrics"]})
        self.assertEqual(w.detect(SPECS["summer.missed_incidents"], 1, None, None)["status"], "WASTE")
        self.assertEqual(w.detect(SPECS["summer.missed_incidents"], 0, None, None)["status"], "OK")


class TechDebtOwnership(unittest.TestCase):
    def test_tech_debt_class_is_owned_by_summer(self):
        cls = next(c for c in REG["classes"] if c["id"] == "tech-debt")
        self.assertEqual(cls["owner"], "summer")
        self.assertEqual({m["id"] for m in cls["metrics"]},
                         {"debt.oversized_files", "debt.cert_screen_entries", "debt.workflow_max_bytes"})
        self.assertTrue(any("waste-latest.json" in f for f in cls["feeds"]))
        cert = next(m for m in cls["metrics"] if m["id"] == "debt.cert_screen_entries")
        self.assertEqual(cert["source"], "debt.certScreenEntries")
        self.assertTrue(any("cert-screens.json" in f for f in cls["feeds"]))

    def test_tech_debt_signal_carries_summer_owner_into_factory_intake(self):
        row = {"id": "debt.oversized_files", "class": "tech-debt", "owner": "summer",
               "label": "Tracked source files over 1500 lines", "unit": "count",
               "value": 120, "status": "WASTE", "excess": 1.2, "why": "+20% vs 7 days ago"}
        sig = w.signal(REG, row, SPECS["debt.oversized_files"])
        self.assertIsNone(fi.validate(sig))
        self.assertIn("Owner: summer", sig["problem"])
        planned = fi.plan([sig])[0]
        self.assertIn("waste", planned["labels"])

    def test_cert_screen_entries_collector_reads_debt_map_cardinality(self):
        # Live ledger on the checkout: observer only; never invents debt.
        reading = w.col_debt()
        self.assertIn("certScreenEntries", reading)
        self.assertIsInstance(reading["certScreenEntries"], int)
        self.assertGreaterEqual(reading["certScreenEntries"], 0)
        live = json.loads(w.CERT_SCREENS.read_text()).get("debt") or {}
        self.assertEqual(reading["certScreenEntries"], len(live))
        # Metric evaluates through the registry source path (no GAP when ledger present).
        data = {"debt": reading, "inputs": {"activeUsers": 0}}
        rows = {r["id"]: r for r in w.evaluate(REG, data, {})}
        self.assertEqual(rows["debt.cert_screen_entries"]["status"], "OK")
        self.assertEqual(rows["debt.cert_screen_entries"]["value"], float(len(live)))
        self.assertEqual(rows["debt.cert_screen_entries"]["owner"], "summer")


class WorkflowDebt(unittest.TestCase):
    metric = "debt.workflow_max_bytes"

    def sample(self, repo: Path) -> dict:
        data = {"debt": w.col_debt(repo), "inputs": {"activeUsers": 0}}
        return next(row for row in w.evaluate(REG, data, {}) if row["id"] == self.metric)

    def git(self, *args: str) -> str:
        return subprocess.check_output(["git", "-C", str(self.repo), *args], text=True).strip()

    def publish(self, count: int) -> str:
        self.workflow.write_bytes(b"#" * count)
        self.git("add", ".github")
        self.git("-c", "user.email=test@example.com", "-c", "user.name=Fixture", "commit", "-qm", "workflow fixture")
        sha = self.git("rev-parse", "HEAD")
        self.git("update-ref", "refs/remotes/origin/main", sha)
        return sha

    def setUp(self):
        checkout = tempfile.TemporaryDirectory()
        self.addCleanup(checkout.cleanup)
        self.repo = Path(checkout.name)
        self.git("init", "-q")
        self.workflow = self.repo / ".github/workflows/ci.yml"
        self.workflow.parent.mkdir(parents=True)

    def test_only_committed_workflow_blob_bytes_on_main_count(self):
        other = self.workflow.parent / "extra.txt"
        other.write_bytes(b"#" * 500001)
        sha = self.publish(450001)
        self.workflow.write_text("# local uncommitted shrink should not hide debt")
        self.git("add", ".github")
        self.git("-c", "user.email=test@example.com", "-c", "user.name=Fixture", "commit", "-qm", "local only")
        row = self.sample(self.repo)
        self.assertEqual((row["status"], row["value"]), ("WASTE", 450001))
        self.assertEqual(row["evidence"]["sha"], sha)
        self.assertEqual(row["evidence"]["path"], ".github/workflows/ci.yml")
        result = w.signal(REG, row, SPECS[self.metric])
        self.assertIsNone(fi.validate(result))
        self.assertIn("Owner: summer. Repair owner: ci.", result["problem"])
        self.assertIn(sha, result["problem"])
        self.assertEqual(result["metric"]["target"], 450000)
        self.assertEqual(result["fingerprint"], "waste-debt-workflow-max-bytes")

    def test_unavailable_source_is_gap_never_success_and_shows_in_digest(self):
        self.workflow.write_bytes(b"#" * 450001)
        row = self.sample(self.repo)
        self.assertEqual((row["status"], row["value"]), ("GAP", None))
        self.assertNotIn("evidence", row)
        self.assertEqual(w.digest(REG, [row], self.repo, 0)["techDebt"], [row])

    def test_stale_rollback_or_malformed_measurement_cannot_close(self):
        old_sha = self.publish(449999)
        older = self.sample(self.repo)
        current_sha = self.publish(450001)
        bad = self.sample(self.repo)
        state = self.repo / "state"
        state.mkdir()
        w.settle_wins(REG, [bad], state, 0, repo=self.repo)

        self.git("update-ref", "refs/remotes/origin/main", old_sha)
        self.assertEqual(w.settle_wins(REG, [older], state, 1, repo=self.repo), [])
        self.git("update-ref", "refs/remotes/origin/main", current_sha)
        self.publish(450000)
        fixed = self.sample(self.repo)
        malformed = {**fixed, "evidence": {"sha": "invalid"}}
        self.assertEqual(w.settle_wins(REG, [malformed], state, 2, repo=self.repo), [])
        self.assertEqual(w.settle_wins(REG, [{**fixed, "value": 0}], state, 2, repo=self.repo), [])
        self.git("update-ref", "refs/remotes/origin/main", current_sha)
        self.assertEqual(w.settle_wins(REG, [fixed], state, 3, repo=self.repo), [])

    def test_regression_uses_same_fingerprint_and_new_evidence_after_proven_fix(self):
        self.publish(450001)
        bad = self.sample(self.repo)
        state = self.repo / "state"
        state.mkdir()
        queue = self.repo / "lanes"
        self.assertTrue(w.write_signals(REG, [bad], SPECS, queue))
        self.assertEqual(w.write_signals(REG, [bad], SPECS, queue), [])
        self.assertEqual(w.settle_wins(REG, [bad], state, 0, repo=self.repo), [])
        self.git("update-ref", "-d", "refs/remotes/origin/main")
        gap = self.sample(self.repo)
        self.assertEqual(w.settle_wins(REG, [gap], state, 1, repo=self.repo), [])
        fixed_sha = self.publish(450000)
        good = self.sample(self.repo)
        self.assertEqual(good["status"], "OK")
        wins = w.settle_wins(REG, [good], state, 2, repo=self.repo)
        self.assertEqual(len(wins), 1)
        self.assertEqual([r["sha"] for r in wins[0]["receipts"]], [bad["evidence"]["sha"], fixed_sha])
        self.assertEqual([r["value"] for r in wins[0]["receipts"]], [450001, 450000])
        w.drop_signal(self.metric, queue)
        self.publish(450001)
        regressed = self.sample(self.repo)
        self.assertEqual(regressed["status"], "WASTE")
        self.assertTrue(w.write_signals(REG, [regressed], SPECS, queue))
        original = w.signal(REG, bad, SPECS[self.metric])
        recurrence = w.signal(REG, regressed, SPECS[self.metric])
        self.assertEqual(original["fingerprint"], recurrence["fingerprint"])
        self.assertNotEqual(fi.body(original), fi.body(recurrence))
        self.assertEqual(w.settle_wins(REG, [regressed], state, 3, repo=self.repo), [])
        self.publish(449999)
        second = w.settle_wins(REG, [self.sample(self.repo)], state, 4, repo=self.repo)
        self.assertNotEqual(wins[0]["id"], second[0]["id"])


if __name__ == "__main__":
    unittest.main()
