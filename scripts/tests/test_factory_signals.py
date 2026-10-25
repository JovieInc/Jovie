"""Factory-signal adapters: recurrence, handoff clusters and unowned audit rows (hermetic)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import factory_intake as fi  # noqa: E402
import factory_signals as fs  # noqa: E402


class FactorySignalsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)

    def test_sentinel_files_a_signal_only_after_the_alarm_recurs_on_distinct_days(self):
        (self.root / "doctor.json").write_text(json.dumps({"alerts": {"no-landing": "nothing passed the gate", "aged-prs": "x"}}))
        days = [datetime(2026, 10, d, 9, tzinfo=timezone.utc) for d in (21, 22, 22, 23)]
        results = [fs.sentinel_signals(self.root, now) for now in days]
        self.assertEqual([len(r) for r in results], [0, 0, 0, 1], "same-day repeats do not count; aged-prs is housekeeping")
        signal = results[-1][0]
        self.assertIsNone(fi.validate(signal), "adapter output must satisfy the intake contract")
        self.assertEqual(signal["fingerprint"], "sentinel-no-landing")
        (self.root / "doctor.json").write_text(json.dumps({"alerts": {}}))
        self.assertEqual(fs.sentinel_signals(self.root, days[-1]), [], "a cleared alarm files nothing")

    def test_cheap_fixer_clusters_handoffs_by_class(self):
        def receipt(i, cls, outcome, match):
            d = self.root / "cf" / str(i)
            d.mkdir(parents=True)
            (d / "receipt.json").write_text(json.dumps({"schema": "jovie-cheap-fixer-receipt/v1", "failureClass": cls,
                                                          "outcome": outcome, "classMatch": match}))
        for i in range(6):
            receipt(i, "lint", "handoff-no-candidate-files", "noUselessFragments")
        receipt(10, "lint", "fixed", "x")
        receipt(11, "test", "handoff-model-failed", "y")  # below the cluster minimum
        out = fs.cheap_fixer_signals(self.root / "cf")
        self.assertEqual([s["fingerprint"] for s in out], ["cheap-fixer-lint-handoff-no-candidate-files"])
        self.assertEqual(out[0]["metric"]["baseline"], round(6 / 7, 2))
        self.assertIsNone(fi.validate(out[0]))

    def test_audit_files_only_unowned_curated_rows(self):
        md = self.root / "SYNTHESIS.md"
        md.write_text("\n".join([
            "| # | Change | Consensus | ROI | Effort | Ref | Evidence |", "|---|---|---|---|---|---|---|",
            "| 1 | Make holds native | 3/3 | 9.7 | S-M | x | verified |",
            "| 2 | Back-pressure | 3/3 | 9.5 | S | x | verified |",
            "| 5 | Scoped tokens | 3/3 | 7.7 | M-L | x | verified |",
            "| 10 | Reconcile rules | 1/3 | 8 | S | x | partly |",
            "| 11 | Something new | 1/3 | 5 | S | x | partly |"]))
        out, uncurated = fs.audit_signals(md)
        self.assertEqual(sorted(s["fingerprint"][:8] for s in out), ["audit-1-", "audit-10", "audit-5-"])
        self.assertEqual(uncurated, [11])
        self.assertTrue(all(fi.validate(s) is None for s in out))
        one = [s for s in out if s["fingerprint"].startswith("audit-1-")][0]
        self.assertIn("NOT changed", " ".join(one["acceptance"]), "ruleset changes are proposed, never applied")

    def test_write_is_idempotent(self):
        signal = {"fingerprint": "a-b"}
        self.assertEqual(fs.write(self.root, [signal])["written"], ["a-b"])
        self.assertEqual(fs.write(self.root, [signal]), {"written": [], "alreadyPresent": ["a-b"]})


if __name__ == "__main__":
    unittest.main()
