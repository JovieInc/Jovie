"""Economics admission and totals use deterministic, explicitly authorized evidence."""
import copy
import io
import json
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import provider_economics as economics


class ProviderEconomicsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "ledger.jsonl"
        self.claim = {"attempt": 1, "fencingToken": "private-fence"}
        self.ident = {"executionGeneration": "generation", "identityDigest": "identity"}
        self.receipt = {"schema": "jovie-lane-run/v1", "repository": "JovieInc/Jovie", "issue": "JOV-8663",
                        "runId": "run-1", "startedAt": "2026-10-20T10:00:00Z", "verdict": "failed"}
        self.entry = economics.segment(self.receipt, self.claim, self.ident, "claude", "sonnet")
        self.source = {"kind": "billing", "id": "invoice/line-1", "provider": "claude"}
        self.evidence = {"schema": economics.SCHEMA, "binding": self.entry["binding"], "metric": "cashUsd",
                         "amount": "0.125", "unit": "USD", "scope": "execution-total", "source": self.source,
                         "sourceObservedAt": "2026-10-20T10:01:00Z", "observedAt": "2026-10-20T10:02:00Z"}
        self.now = economics.stamp("2026-10-20T10:03:00Z")
        self.write()

    def write(self, *extra):
        self.path.write_text("".join(json.dumps(row) + "\n" for row in [self.receipt, *extra]))

    def rows(self):
        return [json.loads(line) for line in self.path.read_text().splitlines()]

    def record(self, evidence=None, source=None):
        return economics.record(self.path, evidence or self.evidence, source or self.source, now=self.now)

    def test_cash_credit_estimate_and_reservation_stay_separate_on_failed_attempt(self):
        before = self.path.read_bytes()
        self.record()
        credits = {**self.evidence, "metric": "credits", "amount": "3.5", "unit": "provider_credits"}
        self.record(credits)
        estimate = {**self.evidence, "metric": "estimateUsd", "amount": "1.5"}
        self.record(estimate)
        self.assertTrue(self.path.read_bytes().startswith(before))
        self.assertEqual(self.rows()[0]["verdict"], "failed")
        self.assertNotIn("private-fence", self.path.read_text())
        totals = {row["metric"]: row for row in economics.summarize(self.rows())}
        self.assertEqual(totals["cashUsd"]["total"], "0.125")
        self.assertEqual(totals["credits"]["total"], "3.5")
        self.assertEqual(totals["estimateUsd"]["total"], "1.5")
        self.assertEqual(self.rows()[0]["economics"][0]["reservedLimits"], {"dispatchUnits": 1})
        self.assertEqual(self.rows()[1]["evidence"]["source"], self.source)
        self.assertEqual(self.rows()[1]["recordedAt"], self.now)

    def test_missing_measurements_are_unknown_including_zero_cost_routes(self):
        totals = economics.summarize(self.rows())
        self.assertTrue(all(row["total"] is None and row["unknownExecutions"] == 1 for row in totals))
        self.assertEqual(economics.summarize([]), [])
        self.evidence["amount"] = "0"
        self.record()
        cash = next(row for row in economics.summarize(self.rows()) if row["metric"] == "cashUsd")
        self.assertEqual(cash["total"], "0")
        legacy = {"schema": "jovie-lane-run/v1", "runId": "old", "provider": "claude", "model": "sonnet"}
        legacy_cash = next(row for row in economics.summarize([legacy, legacy]) if row["metric"] == "cashUsd")
        self.assertEqual(legacy_cash["unknownExecutions"], 1)
        self.assertIsNone(legacy_cash["total"])
        for denial in [{"execution": {"admitted": False}}, {"offer": {"accepted": False}}, {"verdict": "duplicate-active"}]:
            self.assertEqual(economics.summarize([{**legacy, **denial}]), [])

    def test_duplicate_conflicting_sources_and_second_totals_do_not_append(self):
        self.record()
        for evidence, reason in [
            (self.evidence, "duplicate"),
            ({**self.evidence, "amount": "8"}, "conflicting-source"),
            ({**self.evidence, "source": {**self.source, "id": "different-source"}}, "conflicting-measurement"),
        ]:
            with self.subTest(reason=reason):
                before = self.path.read_bytes()
                with self.assertRaisesRegex(ValueError, reason):
                    self.record(evidence, evidence["source"])
                self.assertEqual(self.path.read_bytes(), before)

    def test_foreign_repository_generation_attempt_provider_model_execution_and_handoff_rejected(self):
        for field, value in [("repository", "Other/Repo"), ("issue", "JOV-1"), ("executionGeneration", "old"),
                             ("identityDigest", "foreign"), ("attempt", 2), ("attemptId", "foreign"),
                             ("provider", "other"), ("model", "other"), ("executionKind", "remote"),
                             ("executionId", "other"), ("remoteThreadId", "foreign"), ("handoffFrom", "foreign")]:
            with self.subTest(field=field):
                evidence = {**self.evidence, "binding": {**self.evidence["binding"], field: value}}
                with self.assertRaisesRegex(ValueError, "foreign-attempt"):
                    self.record(evidence)
        with self.assertRaisesRegex(ValueError, "foreign-attempt"):
            economics.validate({**self.evidence, "binding": {}}, self.entry, self.source, self.now)

    def test_stale_and_future_evidence_rejected_but_delayed_billing_is_allowed(self):
        for fields in [{"sourceObservedAt": "2026-10-20T09:59:59Z"},
                       {"observedAt": "2026-10-20T10:04:00Z"},
                       {"sourceObservedAt": "2026-10-20T10:02:01Z"}]:
            with self.assertRaisesRegex(ValueError, "stale"):
                self.record({**self.evidence, **fields})
        self.record()
        older_credit = {**self.evidence, "metric": "credits", "unit": "credits", "observedAt": "2026-10-20T10:01:59Z"}
        with self.assertRaisesRegex(ValueError, "stale"):
            self.record(older_credit)
        economics.record(self.path, {**self.evidence, "metric": "credits", "unit": "credits",
                         "observedAt": "2026-10-21T10:00:00Z"}, self.source, now=self.now + 86400)

    def test_malformed_numbers_timestamps_metrics_scope_and_untrusted_sources_rejected(self):
        cases = [{"amount": value} for value in [True, 1, -1, None, "-1", "NaN", "Infinity", "1e4", "01", "", "1.0000000000001"]]
        cases += [{"observedAt": value} for value in [None, 12, "yesterday", "2026-99-20T10:02:00Z"]]
        cases += [{"metric": "reservedLimit"}, {"unit": "credits"}, {"scope": "account"}, {"balanceUsd": 100},
                  {"schema": "foreign"}, {"source": {**self.source, "kind": "assistant"}},
                  {"source": {**self.source, "provider": "foreign"}}, {"source": {**self.source, "id": "Bearer secret"}},
                  {"source": []}, {"source": {**self.source, "kind": []}}, {"source": {**self.source, "extra": True}}]
        for fields in cases:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                evidence = {**self.evidence, **fields}
                self.record(evidence, evidence["source"])
        for bad in ([], {"binding": []}, {"binding": self.entry["binding"]}):
            with self.assertRaises(ValueError):
                economics.record(self.path, bad, self.source, now=self.now)
        with self.assertRaisesRegex(ValueError, "unauthorized"):
            self.record(source={**self.source, "id": "unapproved"})

    def test_parallel_imports_charge_once_and_reuse_across_attempts_is_rejected(self):
        def write():
            try:
                self.record()
                return "accepted"
            except ValueError:
                return "rejected"
        with ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(lambda _: write(), range(2))), ["accepted", "rejected"])
        other = copy.deepcopy(self.receipt)
        other["economics"][0]["binding"]["executionId"] = "another-execution"
        with self.path.open("a") as out:
            out.write(json.dumps(other) + "\n")
        with self.assertRaisesRegex(ValueError, "conflicting-source"):
            self.record({**self.evidence, "binding": other["economics"][0]["binding"]})

    def test_handoffs_and_repeated_remote_snapshots_are_not_double_charged(self):
        first_id = self.entry["binding"]["executionId"]
        second = economics.segment(self.receipt, self.claim, self.ident, "codex", "codex-default", handoff=first_id)
        self.assertEqual(second["binding"]["handoffFrom"], first_id)
        self.write()
        self.record()
        cash = next(row for row in economics.summarize(self.rows()) if row["metric"] == "cashUsd" and row["provider"] == "claude")
        self.assertEqual(cash["total"], "0.125")
        remote = economics.segment(self.receipt, self.claim, self.ident, "hyperagent", "glm", remote=True, thread="thread-1")
        self.write(copy.deepcopy(self.receipt))
        source = {"kind": "provider-usage", "id": "thread-1/usage", "provider": "hyperagent"}
        self.record({**self.evidence, "binding": remote["binding"], "source": source}, source)
        cash = next(row for row in economics.summarize(self.rows()) if row["metric"] == "cashUsd" and row["provider"] == "hyperagent")
        self.assertEqual((cash["total"], cash["measuredExecutions"]), ("0.125", 1))

    def test_remote_unknown_thread_and_conflicting_snapshots_fail_closed(self):
        remote = economics.segment(self.receipt, self.claim, self.ident, "hyperagent", "glm", remote=True)
        source = {**self.source, "provider": "hyperagent"}
        self.write()
        with self.assertRaisesRegex(ValueError, "attribution-unknown"):
            self.record({**self.evidence, "binding": remote["binding"], "source": source}, source)
        other = copy.deepcopy(self.receipt)
        other["economics"][0]["evidence"] = [self.evidence]
        with self.assertRaisesRegex(ValueError, "conflicting-snapshot"):
            economics.entries([self.receipt, other])
        one = {"schema": economics.SCHEMA, "event": "measurement-recorded", "evidence": self.evidence,
               "authorizedSource": self.source, "recordedAt": self.now}
        two = {**one, "evidence": {**self.evidence, "amount": "2"}}
        with self.assertRaisesRegex(ValueError, "conflicting"):
            economics.summarize([self.receipt, one, two])

    def test_reporting_revalidates_full_binding_source_time_and_snapshot_measurements(self):
        recorded = self.record()
        for fields in [{"binding": {**self.evidence["binding"], "remoteThreadId": "foreign"}},
                       {"source": {**self.source, "id": "unapproved"}}, {"amount": "NaN"},
                       {"sourceObservedAt": "2020-01-01T00:00:00Z"}]:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                economics.summarize([self.receipt, {**recorded, "evidence": {**self.evidence, **fields}}])
        other = copy.deepcopy(self.receipt)
        other["economics"][0]["measurements"]["cashUsd"] = {"amount": "7", "unit": "USD"}
        with self.assertRaisesRegex(ValueError, "conflicting-snapshot"):
            economics.entries([self.receipt, other])
        with self.assertRaisesRegex(ValueError, "unattributed"):
            economics.summarize([other])
        for value in (True, float('inf'), float('nan'), -1, self.now + 86400 * 36500):
            with self.assertRaisesRegex(ValueError, "record-malformed"):
                economics.summarize([self.receipt, {**recorded, "recordedAt": value}])
        with self.assertRaisesRegex(ValueError, "timestamp-malformed"):
            economics.record(self.path, self.evidence, self.source, now=float('inf'))
        foreign = {**recorded, "evidence": {**self.evidence, "binding": {**self.evidence["binding"], "attemptId": "foreign"}}}
        with self.assertRaisesRegex(ValueError, "foreign-attempt"):
            economics.summarize([self.receipt, foreign])
        older = {**recorded, "evidence": {**self.evidence, "metric": "credits", "unit": "credits",
                                        "observedAt": "2026-10-20T10:01:59Z"}}
        with self.assertRaisesRegex(ValueError, "stale"):
            economics.summarize([self.receipt, recorded, older])
        embedded = copy.deepcopy(self.receipt)
        embedded["economics"][0]["evidence"] = [self.evidence]
        with self.assertRaisesRegex(ValueError, "embedded-source-unauthorized"):
            economics.summarize([embedded])

    def test_missing_ledger_does_not_create_a_receipt_or_execution(self):
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, "ledger-unavailable"):
            self.record()
        self.assertFalse(self.path.exists())

    def test_cash_totals_include_distinct_executions_without_reusing_source(self):
        other = copy.deepcopy(self.receipt)
        other["economics"][0]["binding"]["executionId"] = "execution-2"
        self.write(other)
        self.record()
        source = {**self.source, "id": "invoice/line-2"}
        self.record({**self.evidence, "binding": other["economics"][0]["binding"], "source": source}, source)
        cash = next(row for row in economics.summarize(self.rows()) if row["metric"] == "cashUsd")
        self.assertEqual((cash["total"], cash["measuredExecutions"]), ("0.250", 2))

    def test_learning_remote_thread_keeps_one_execution_and_original_observation_window(self):
        remote = economics.segment(self.receipt, self.claim, self.ident, "hyperagent", "glm", remote=True)
        original = copy.deepcopy(self.receipt)
        remote["binding"]["remoteThreadId"] = "thread-1"
        remote["startedAt"] = "2026-10-20T10:02:30Z"
        self.path.write_text(json.dumps(original) + "\n" + json.dumps(self.receipt) + "\n")
        source = {"kind": "provider-usage", "id": "thread-1/usage", "provider": "hyperagent"}
        self.record({**self.evidence, "binding": remote["binding"], "source": source}, source)
        totals = [row for row in economics.summarize(self.rows()) if row["provider"] == "hyperagent"]
        self.assertTrue(all(row["measuredExecutions"] + row["unknownExecutions"] == 1 for row in totals))
        foreign = copy.deepcopy(self.receipt)
        foreign["economics"][-1]["binding"]["remoteThreadId"] = "thread-2"
        with self.assertRaisesRegex(ValueError, "conflicting-thread"):
            economics.entries([self.receipt, foreign])

    def test_local_output_only_supplies_notional_estimate_even_on_failure(self):
        output = Path(self.tmp.name) / "provider.jsonl"
        def execute():
            output.write_text(json.dumps({"schema": "jovie-provider-lease/v1", "event": "claude-run", "provider": "claude",
                "model": "sonnet", "notionalCostUsd": 0.25, "cashUsd": 99,
                "at": economics.datetime.now(economics.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}) + "\n")
            return SimpleNamespace(returncode=1)
        economics.run(self.receipt, self.claim, self.ident, "claude", "sonnet", output, execute)
        entry = self.receipt["economics"][-1]
        self.assertEqual(entry["measurements"]["estimateUsd"], {"amount": "0.25", "unit": "USD"})
        self.assertIsNone(entry["measurements"]["cashUsd"])
        self.assertEqual(entry["exitCode"], 1)
        self.assertEqual(entry["evidence"][0]["source"]["id"], "provider.jsonl:0")
        self.write()
        imported = {**self.evidence, "binding": entry["binding"], "observedAt": entry["observedAt"],
                    "sourceObservedAt": entry["observedAt"]}
        economics.record(self.path, imported, self.source)
        self.assertEqual(len(economics.summarize(self.rows())), 3)

    def test_bad_or_duplicate_output_and_raised_execution_preserve_unknowns(self):
        output = Path(self.tmp.name) / "provider.jsonl"
        for raw in ["not json", "[]", '{}\n{}', json.dumps({"schema": "jovie-provider-lease/v1", "event": "claude-run",
                    "provider": "claude", "model": "sonnet", "notionalCostUsd": 1, "at": "2020-01-01T00:00:00Z"})]:
            output.write_text(raw)
            economics.run(self.receipt, self.claim, self.ident, "claude", "sonnet", output, lambda: SimpleNamespace(returncode=0))
            self.assertIsNone(self.receipt["economics"][-1]["measurements"]["estimateUsd"])
        def failed():
            raise TimeoutError("private-fixture")
        with self.assertRaises(TimeoutError):
            economics.run(self.receipt, self.claim, self.ident, "codex", None, output, failed)
        self.assertIn("observedAt", self.receipt["economics"][-1])
        self.assertNotIn("private-fixture", json.dumps(self.receipt))

    def test_cli_requires_explicit_source_redacts_failure_and_summarizes(self):
        script = Path(economics.__file__)
        evidence = Path(self.tmp.name) / "authorized.json"
        evidence.write_text(json.dumps(self.evidence))
        args = [sys.executable, str(script), "record", "--ledger", str(self.path), "--authorized-evidence-file", str(evidence)]
        failed = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(failed.returncode, 1)
        self.assertEqual(failed.stderr, "economics-evidence-rejected\n")
        result = subprocess.run([*args, "--source-kind", "billing", "--source-id", self.source["id"], "--provider", "claude"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = subprocess.run([sys.executable, str(script), "summarize", "--ledger", str(self.path)], capture_output=True, text=True)
        self.assertEqual(summary.returncode, 0)
        self.assertEqual(json.loads(summary.stdout)[0]["total"], "0.125")

    def test_cli_dispatches_import_and_report_and_redacts_invalid_inputs(self):
        evidence = Path(self.tmp.name) / "authorized.json"
        evidence.write_text(json.dumps(self.evidence))
        base = ["provider_economics", "--ledger", str(self.path)]
        for args, rejected in [
            (["record"], True),
            (["record", "--authorized-evidence-file", str(evidence), "--source-kind", "billing",
              "--source-id", self.source["id"], "--provider", "claude"], False),
            (["summarize"], False),
        ]:
            with self.subTest(args=args), patch.object(sys, "argv", [*base, *args]), \
                    redirect_stdout(io.StringIO()) as output, redirect_stderr(io.StringIO()) as error:
                if rejected:
                    with self.assertRaises(SystemExit) as exit_code:
                        economics.main()
                    self.assertEqual(exit_code.exception.code, 1)
                    self.assertEqual(error.getvalue(), "economics-evidence-rejected\n")
                else:
                    economics.main()
                    self.assertTrue(json.loads(output.getvalue()))


if __name__ == "__main__":
    unittest.main()
