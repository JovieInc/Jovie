"""escalation_reconcile: liveness is head/rung progress, never GitHub's updatedAt (2026-11-19 burst)."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lanes"))

import escalation_reconcile as er  # noqa: E402

NOW = 1_795_110_000.0  # 2026-11-19T17:40Z
HEAD = "454a8f99ea65ae18e48798e1af2b8bd5394de423"


def pr(updated_at, committed, number=24765):
    return {"number": number, "title": "feat(lanes): x", "headRefOid": HEAD, "updatedAt": updated_at,
            "labels": [{"name": "lane-fix-escalating"}], "files": [],
            "commits": [{"oid": HEAD, "committedDate": committed}]}


class ProgressNotUpdatedAt(unittest.TestCase):
    def run_reconcile(self, prs, attempts):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "fix-attempts.json").write_text(json.dumps(attempts))
            removed = []
            receipt = er.reconcile(state, prs, {}, update_attempts=lambda change: None,
                                   remove_label=lambda n: removed.append(n) or True, now=NOW)
            return receipt, removed

    def test_bot_touch_does_not_hide_a_stalled_head(self):
        # updatedAt 30 min ago (label burst), head untouched for 54h, no escalation rung: orphan label.
        receipt, removed = self.run_reconcile([pr("2026-11-19T17:08:00Z", "2026-11-17T11:00:00Z")], {})
        self.assertEqual(receipt["orphan"], [24765])
        self.assertEqual(removed, [24765])
        self.assertEqual(receipt["skipped"], [])

    def test_real_push_inside_window_is_still_skipped(self):
        receipt, removed = self.run_reconcile([pr("2026-11-19T17:08:00Z", "2026-11-19T16:00:00Z")], {})
        self.assertEqual(receipt["skipped"], [24765])
        self.assertEqual(removed, [])

    def test_recent_rung_counts_as_progress(self):
        attempts = {"24765": {"escalations": [{"head": HEAD, "at": NOW - 600, "lane": "codex"}]}}
        receipt, _ = self.run_reconcile([pr("2026-11-19T17:08:00Z", "2026-11-17T11:00:00Z")], attempts)
        self.assertEqual(receipt["skipped"], [24765])

    def test_no_commit_data_falls_back_to_updated_at(self):
        row = pr("2026-11-19T17:08:00Z", None)
        row["commits"] = []
        receipt, _ = self.run_reconcile([row], {})
        self.assertEqual(receipt["skipped"], [24765])


if __name__ == "__main__":
    unittest.main()
