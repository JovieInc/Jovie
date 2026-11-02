"""Hermetic tests for ledger rotation (runs/ledger.jsonl bound)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
import unittest.mock
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import ledger_archive as la  # noqa: E402
import shipping_attribution as sa  # noqa: E402
import stage_events as se  # noqa: E402

NOW = 1_800_000_000.0


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_row(run_id, days_ago, issue="JOV-1", provider="codex", **extra):
    ended = NOW - days_ago * 86400
    return {"schema": "jovie-lane-run/v1", "runId": run_id, "provider": provider, "issue": issue,
            "startedAt": iso(ended - 600), "endedAt": iso(ended), "verdict": "pr-opened", **extra}


class LedgerArchiveTest(unittest.TestCase):
    def state(self, rows, raw_extra=b""):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state = Path(tmp.name)
        (state / "runs").mkdir()
        (state / "runs/ledger.jsonl").write_bytes(
            b"".join(json.dumps(r).encode() + b"\n" for r in rows) + raw_extra)
        return state

    def test_old_rows_move_to_dated_archives_and_the_index_remembers_their_issues(self):
        state = self.state([run_row("a", 30, "JOV-7"), run_row("b", 12, "JOV-7", provider="grok"),
                            run_row("c", 2, "JOV-8"), run_row("d", 0.1, "JOV-9")], raw_extra=b"not json\n")
        result = la.rotate(state, NOW, settle_s=0, sleep=lambda s: None)
        self.assertEqual((result["status"], result["kept"], result["archived"]), ("rotated", 3, 2))
        live = (state / "runs/ledger.jsonl").read_text().splitlines()
        self.assertEqual(len(live), 3)
        self.assertIn("not json", live, "unparseable rows are kept, never dropped")
        archived = sum(len(p.read_text().splitlines()) for p in (state / "runs/ledger-archive").glob("ledger-*.jsonl"))
        self.assertEqual(archived, 2)
        index = la.read_index(state)
        self.assertEqual(index["JOV-7"]["count"], 2)
        self.assertEqual(index["JOV-7"]["provider"], "grok")  # last archived row in file order
        self.assertNotIn("JOV-8", index)
        self.assertFalse((state / "runs" / la.ROTATING).exists())
        # Idempotent: nothing left to archive.
        again = la.rotate(state, NOW, settle_s=0, sleep=lambda s: None)
        self.assertEqual((again["archived"], again["kept"]), (0, 3))

    def test_an_append_in_flight_during_the_rename_is_not_lost(self):
        state = self.state([run_row("old", 30), run_row("recent", 1)])
        handle = open(state / "runs/ledger.jsonl", "a")  # an appender that already opened the file
        def settle(_):
            handle.write(json.dumps(run_row("inflight", 0.01)) + "\n")
            handle.flush()
            with open(state / "runs/ledger.jsonl", "a") as late:  # one that opens after the rename
                late.write(json.dumps(run_row("late", 0.005)) + "\n")
        try:
            result = la.rotate(state, NOW, sleep=settle)
        finally:
            handle.close()
        ids = sorted(json.loads(l)["runId"] for l in (state / "runs/ledger.jsonl").read_text().splitlines())
        self.assertEqual(ids, ["inflight", "late", "recent"])
        self.assertEqual(result["archived"], 1)

    def test_a_crash_between_rename_and_publish_is_recovered_on_the_next_run(self):
        state = self.state([run_row("old", 30), run_row("recent", 1)])
        os.rename(state / "runs/ledger.jsonl", state / "runs" / la.ROTATING)  # the crashed run's leftover
        (state / "runs/ledger.jsonl").write_text(json.dumps(run_row("newer", 0.01)) + "\n")
        self.assertTrue(la.due(state, NOW))
        la.rotate(state, NOW, settle_s=0, sleep=lambda s: None)
        ids = sorted(json.loads(l)["runId"] for l in (state / "runs/ledger.jsonl").read_text().splitlines())
        self.assertEqual(ids, ["newer", "recent"])
        self.assertFalse((state / "runs" / la.ROTATING).exists())

    def test_due_needs_size_and_age(self):
        state = self.state([run_row("a", 1)])
        self.assertFalse(la.due(state, NOW))  # too small
        with unittest.mock.patch.object(la, "ROTATE_MIN_BYTES", 1):
            self.assertTrue(la.due(state, NOW))
            la.rotate(state, NOW, settle_s=0, sleep=lambda s: None)
            self.assertFalse(la.due(state, NOW + 60))
            self.assertTrue(la.due(state, NOW + la.ROTATE_EVERY_S + 1))

    def test_stage_feed_still_covers_archived_rows(self):
        rows = [run_row(f"r{n}", 20 + n, kind="adopt", pr=n, gateWaitS=5, verdict="landing") for n in range(3)]
        rows.append(run_row("fresh", 1, kind="adopt", pr=9, gateWaitS=5, verdict="landing"))
        state = self.state(rows)
        before = se.ndjson(state / "runs/ledger.jsonl", NOW)
        self.assertTrue(before)
        la.rotate(state, NOW, settle_s=0, sleep=lambda s: None)
        self.assertLess(len((state / "runs/ledger.jsonl").read_text().splitlines()), len(rows))
        self.assertEqual(se.ndjson(state / "runs/ledger.jsonl", NOW), before)

    def test_doctor_tail_read_drops_the_cut_line_and_stays_complete(self):
        state = self.state([run_row(f"r{n}", 1, "JOV-%d" % n) for n in range(200)])
        size = (state / "runs/ledger.jsonl").stat().st_size
        tail = sa.read_ledger(state / "runs/ledger.jsonl", tail_bytes=size // 4)
        self.assertTrue(tail["complete"])
        self.assertEqual(tail["corruptRows"], 0)
        self.assertLess(len(tail["rows"]), 200)
        self.assertEqual(tail["rows"][-1]["runId"], "r199")
        full = sa.read_ledger(state / "runs/ledger.jsonl", tail_bytes=size * 2)
        self.assertEqual(len(full["rows"]), 200)


if __name__ == "__main__":
    unittest.main()
