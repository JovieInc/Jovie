"""Factory-signal adapters: recurrence, handoff clusters and unowned audit rows (hermetic)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
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

    def test_sentinel_discards_expired_malformed_future_and_duplicate_days(self):
        (self.root / "doctor.json").write_text(json.dumps({"alerts": {"no-landing": "red"}}))
        path = self.root / "factory-recurrence.json"
        path.write_text(json.dumps({"no-landing": ["2026-01-01", "2026-02-01", "2026-10-26"]}))
        now = datetime(2026, 10, 26, tzinfo=timezone.utc)
        self.assertEqual(fs.sentinel_signals(self.root, now), [], "three observed dates are not three recent days")
        path.write_text(json.dumps({"no-landing": ["2026-10-12", "2026-10-13", "2026-10-13", "bad",
                                                   "2026-02-30", None, 42, "2026-10-27"],
                                    "cleared": ["2026-01-01"]}))
        self.assertEqual(fs.sentinel_signals(self.root, now), [])
        self.assertEqual(json.loads(path.read_text()), {"no-landing": ["2026-10-13", "2026-10-26"], "cleared": []})
        # UTC Oct 26, despite the caller's Oct 27 offset; Oct 13 is the inclusive boundary.
        path.write_text(json.dumps({"no-landing": ["2026-10-13", "2026-10-25"]}))
        signal = fs.sentinel_signals(self.root, datetime(2026, 10, 27, 1, tzinfo=timezone(timedelta(hours=2))))[0]
        self.assertEqual(signal["metric"]["baseline"], 3)
        self.assertEqual(json.loads(path.read_text())["no-landing"], ["2026-10-13", "2026-10-25", "2026-10-26"])

    def test_cheap_fixer_counts_unique_files_and_ignores_unfixable_or_malformed_receipts(self):
        row = {"schema": "jovie-cheap-fixer-receipt/v1", "failureClass": "lint",
               "outcome": "handoff-model-failed", "classMatch": "x"}
        for name in ("receipt.json", "one.json", "two.json", "three/receipt.json"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(row))
        (self.root / "bad.json").write_text("{")
        (self.root / "wrong.json").write_text('{"schema":"wrong"}')
        (self.root / "unfixable.json").write_text(json.dumps({**row, "outcome": "handoff-unfixable-class"}))
        self.assertEqual(fs.cheap_fixer_signals(self.root), [], "four eligible receipts must stay below HANDOFF_MIN")
        (self.root / "alias.json").symlink_to(self.root / "receipt.json")
        self.assertEqual(fs.cheap_fixer_signals(self.root), [], "aliases of one receipt are one observation")
        (self.root / "array.json").write_text("[]")
        (self.root / "four.json").write_text(json.dumps(row))
        out = fs.cheap_fixer_signals(self.root)
        self.assertEqual(len(out), 1)
        self.assertIn("5 of 6", out[0]["problem"], "unfixable remains in the denominator, never in the handoff cluster")
        self.assertEqual(out[0]["metric"]["baseline"], round(5 / 6, 2))

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
        first = (self.root / "factory-signals/a-b.json").read_text()
        self.assertEqual(fs.write(self.root, [signal]), {"written": [], "alreadyPresent": ["a-b"]})
        self.assertEqual((self.root / "factory-signals/a-b.json").read_text(), first, "replay preserves observation time")

    def test_write_refreshes_new_evidence_without_deleting_other_pending_signals(self):
        fs.write(self.root, [{"fingerprint": "a-b", "problem": "old"}, {"fingerprint": "pending"}])
        newer = {"fingerprint": "a-b", "problem": "new"}
        fs.write(self.root, [newer])
        saved = json.loads((self.root / "factory-signals/a-b.json").read_text())
        self.assertIsNotNone(datetime.fromisoformat(saved.pop("_observedAt")).tzinfo)
        self.assertEqual(saved, newer)
        self.assertTrue((self.root / "factory-signals/pending.json").exists())


if __name__ == "__main__":
    unittest.main()
