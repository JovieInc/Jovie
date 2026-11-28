"""Qualified factory custody evidence, durable watches, and bounded refresh."""
from __future__ import annotations

import fcntl
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import factory_intake as fi  # noqa: E402
import factory_signals as fs  # noqa: E402
import factory_visibility as fv  # noqa: E402
import ownership  # noqa: E402

from scripts.tests.test_factory_intake import FakeLinear, signal


class FactoryAdoption(unittest.TestCase):
    CLOCK = datetime(2026, 11, 24, 1, tzinfo=timezone.utc).timestamp()
    METRIC = "debt.workflow_max_bytes"
    FP = "waste-debt-workflow-max-bytes"

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.state = Path(temp.name)
        self.issue = {"id": "issue-id", "identifier": "JOV-42", "state": {"type": "started"},
                      "assignee": {"id": "assigned-but-not-accepted"}}
        self.linear = FakeLinear()
        self.visibility_reads = 0
        ordinary = self.linear.gql
        def gql(query, variables):
            if query == fi.EXISTING:
                return {"issues": {"nodes": [self.issue] if self.issue["state"]["type"] == "started" else []}}
            if query == fv.ISSUE_BY_IDENTIFIER:
                self.visibility_reads += 1
                self.assertEqual(variables["id"], self.issue["identifier"])
                return {"issue": self.issue}
            return ordinary(query, variables)
        self.linear.gql = gql
        fs.write(self.state, [signal(self.FP, source="waste-loop", metric={
            "name": self.METRIC, "baseline": 511389, "target": 450000,
        })])
        self.signal_file = self.state / "factory-signals" / f"{self.FP}.json"
        payload = json.loads(self.signal_file.read_text())
        payload["_observedAt"] = self.stamp(self.CLOCK)
        self.signal_file.write_text(json.dumps(payload))

    @staticmethod
    def stamp(epoch):
        return datetime.fromtimestamp(epoch, timezone.utc).isoformat()

    def digest(self, status="WASTE", *, received=None, win=None, sha="b" * 40):
        received = self.CLOCK + 15 if received is None else received
        reading = 511389 if status == "WASTE" else 441000
        document = {
            "schema": "jovie.waste-digest/v1", "at": self.stamp(received),
            "techDebt": [{"id": self.METRIC, "value": reading, "status": status, "evidence": {"sha": sha}}],
            "fixesShippedThisWeek": [win] if win is not None else [],
        }
        (self.state / "waste-latest.json").write_text(json.dumps(document))

    def pass_intake(self, previous=(), *, offset=30):
        result = fi.run_pass(self.state, self.linear, previous_adoption=previous, now=self.CLOCK + offset)
        self.assertNotIn("error", result)
        return result

    def test_assignment_and_started_state_do_not_count_without_a_live_lease(self):
        before = self.pass_intake()["adoption"][0]
        self.assertEqual(before["status"], "open-awaiting-acceptance")
        self.assertEqual(before["producerEvidence"]["sourceAdoption"], "unverified")
        with mock.patch("ownership.time.time", return_value=self.CLOCK + 1):
            held = ownership.acquire_run_lease(self.state, self.issue["id"], self.issue["identifier"], "codex-ci")
        self.assertIsNotNone(held)
        with held:
            after = self.pass_intake()["adoption"][0]
            self.assertEqual(after["executionAcceptance"]["lane"], "codex-ci")
            self.assertEqual(after["status"], "accepted")
        self.assertEqual(self.pass_intake()["adoption"][0]["status"], "open-awaiting-acceptance")

    def test_observer_and_new_worker_startup_never_adopt_old_receipt(self):
        issue_id, identifier = self.issue["id"], self.issue["identifier"]
        with mock.patch("ownership.time.time", return_value=self.CLOCK + 1):
            old = ownership.acquire_run_lease(self.state, issue_id, identifier, "old")
        old.close()
        path = self.state / "linear" / "run-leases" / f"{issue_id}.lock"
        with path.open("a+") as active:
            fcntl.flock(active, fcntl.LOCK_SH)
            self.assertEqual(ownership.accepted_run_lease(self.state, issue_id, identifier, now=self.CLOCK + 30)["status"],
                             "awaiting-verified-local-lease")
            fcntl.flock(active, fcntl.LOCK_EX)
            self.assertEqual(ownership.accepted_run_lease(self.state, issue_id, identifier, now=self.CLOCK + 30)["status"],
                             "unknown")

    def test_watch_survives_unrelated_intake_failure_after_signal_disappears(self):
        self.pass_intake()
        self.issue["state"]["type"] = "completed"
        self.signal_file.unlink()
        self.digest()
        fs.write(self.state, [signal("other-factory-signal")])
        with mock.patch.object(self.linear, "gql", side_effect=RuntimeError("read failed")):
            self.assertIn("error", fi.run_pass(self.state, self.linear, now=self.CLOCK + 30))
        (self.state / "factory-signals" / "other-factory-signal.json").unlink()
        result = self.pass_intake()
        self.assertEqual(result["adoption"][0]["status"], "terminal-unresolved")
        self.assertEqual(result["adoption"][0]["issue"], self.issue["identifier"])

    def test_retained_open_read_is_throttled_globally_even_after_projection_loss(self):
        self.pass_intake()
        self.signal_file.unlink()
        for offset in (30, 31, 929):
            result = fi.run_pass(self.state, self.linear, now=self.CLOCK + offset)
            self.assertEqual(result["adoption"][0]["issueKind"], "open")
        self.assertEqual(self.visibility_reads, 1)
        fi.run_pass(self.state, self.linear, now=self.CLOCK + 930)
        self.assertEqual(self.visibility_reads, 2)

    def test_refresh_rotates_past_unreadable_issue_and_preserves_budget(self):
        adoption = fv.Adoption(self.state, self.linear, self.CLOCK)
        for index in range(2):
            item = {"fingerprint": f"waste-source-{index}",
                    "producer": {"source": "waste-loop", "metric": self.METRIC}}
            adoption.observe(item, {"identifier": f"JOV-{index + 100}"}, "terminal")
        with mock.patch.object(self.linear, "gql", side_effect=RuntimeError("read failed")) as reader:
            for offset in (1, 2, 900, 901):
                adoption = fv.Adoption(self.state, self.linear, self.CLOCK + offset)
                adoption.retained()
                adoption.refresh()
            self.assertEqual([call.args[1]["id"] for call in reader.call_args_list], ["JOV-100", "JOV-101"])

    def test_terminal_issue_with_current_debt_remains_visible_under_same_fingerprint(self):
        self.pass_intake()  # Bind the original open issue in the existing dedupe cache.
        self.digest()
        for terminal, offset in (("canceled", 30), ("completed", 930)):
            with self.subTest(terminal=terminal):
                self.issue["state"]["type"] = terminal
                result = self.pass_intake(offset=offset)
                row = result["adoption"][0]
                self.assertEqual(result["results"][0]["action"], "exists")
                self.assertEqual(row["issue"], "JOV-42")
                self.assertEqual(row["issueState"], terminal)
                self.assertEqual(row["status"], "terminal-unresolved")
                self.assertEqual(row["producerEvidence"]["sourceAdoption"], "unverified")
                self.assertEqual(row["producerEvidence"]["observedSourceSha"], "b" * 40)
                self.assertEqual(self.linear.created, [])

    def test_visibility_cap_reports_partial_coverage_and_unique_omissions(self):
        adoption = fv.Adoption(self.state, self.linear, self.CLOCK)
        for index in range(fv.MAX_WATCH + 2):
            item = {"fingerprint": f"waste-source-{index}",
                    "producer": {"source": "waste-loop", "metric": self.METRIC}}
            issue = {"identifier": f"JOV-{index + 100}", "state": {"type": "canceled"}}
            adoption.observe(item, issue, "terminal")
            adoption.observe(item, issue, "terminal")  # One omitted fingerprint, even on reobservation.
        public = fv.public_view({"adoption": adoption.report(), "adoptionOmitted": len(adoption.omitted)})
        self.assertEqual(len(public["adoption"]), fv.MAX_WATCH)
        self.assertEqual(public["coverage"], "partial")
        self.assertEqual(public["omitted"], 2)
        self.assertFalse(public["known"])
        self.assertEqual(fv.public_view(self.pass_intake())["coverage"], "partial")
        self.signal_file.unlink()
        later = fv.public_view(self.pass_intake())
        self.assertEqual(later["coverage"], "partial")
        self.assertTrue(later["retainedOverflow"])
        self.assertGreaterEqual(later["omitted"], 1)
        self.assertEqual(fv.public_view({"error": "unavailable"})["coverage"], "unknown")

    def test_terminal_issue_without_fresh_producer_proof_is_unknown(self):
        self.pass_intake()
        self.issue["state"]["type"] = "completed"
        row = self.pass_intake()["adoption"][0]
        self.assertEqual(row["status"], "terminal-producer-unknown")
        self.assertEqual(row["producerEvidence"]["sourceAdoption"], "unverified")
        self.digest(received=self.CLOCK - 3601)
        row = self.pass_intake([row])["adoption"][0]
        self.assertEqual(row["producerEvidence"]["sourceAdoption"], "unverified")
        self.digest("OK")  # A sample alone cannot establish same-episode recovery.
        row = self.pass_intake([row])["adoption"][0]
        self.assertEqual(row["status"], "terminal-producer-unknown")
        self.assertEqual(self.visibility_reads, 1)

    def test_verified_recovery_survives_signal_retirement_without_new_work(self):
        current = self.pass_intake()["adoption"]
        self.issue["state"]["type"] = "completed"
        self.signal_file.unlink()
        win = {
            "id": "win-workflow-byte-debt", "metric": {"name": self.METRIC, "before": 511389, "after": 441000},
            "receipts": [
                {"note": "Before", "metric": self.METRIC, "value": 511389,
                 "at": self.stamp(self.CLOCK), "sha": "c" * 40, "evidence": "https://example.invalid/source"},
                {"note": "After", "metric": self.METRIC, "value": 441000,
                 "at": self.stamp(self.CLOCK + 5), "sha": "a" * 40, "evidence": "https://example.invalid/source"},
            ],
        }
        self.digest("OK", win=win)
        unrelated = self.pass_intake(current)["adoption"][0]
        self.assertEqual(unrelated["status"], "terminal-producer-unknown")
        self.digest("OK", win=win, sha="a" * 40)
        result = self.pass_intake()
        self.assertEqual(result["signals"], 0)
        row = fv.public_view(result)["adoption"][0]
        self.assertEqual(row["status"], "terminal-recovered")
        self.assertEqual(row["issue"], "JOV-42")
        self.assertEqual(row["producerEvidence"]["recovery"]["id"], "win-workflow-byte-debt")
        self.assertNotIn("producer", row)
        self.assertEqual(self.linear.created, [])


if __name__ == "__main__":
    unittest.main()
