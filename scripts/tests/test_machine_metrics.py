import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import machine_gap  # noqa: E402
import machine_metrics as mm  # noqa: E402

NOW = 2_000_000_000.0


def iso(offset_days):
    return datetime.fromtimestamp(NOW - offset_days * 86400, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pr(number, author="itstimwhite", body="", days=1):
    return {"number": number, "author": author, "body": body, "mergedAt": iso(days)}


class BuildTest(unittest.TestCase):
    def test_share_counts_bots_deterministic_fixers_and_built_machines(self):
        rows = [{"kind": "fix-red", "pr": 3, "resolution": "wired-ci-fast", "startedAt": iso(1)}]
        merged = [pr(1), pr(2, author="dependabot[bot]"), pr(3), pr(4, body="x\nMachine: built scripts/lanes/a.py\n"), pr(5, days=30)]
        got = mm.build(rows, merged, [], NOW)
        self.assertEqual((got["merged"], got["machineMade"], got["machineBuilt"], got["machineMergeShare"]), (4, 3, 1, 0.75))

    def test_recurring_fingerprints_and_days_to_machine(self):
        day = 86400
        fp = [{"fp": "hot", "at": NOW - 9 * day, "subject": "A"}, {"fp": "hot", "at": NOW - 8 * day, "subject": "B"},
              {"fp": "hot", "at": NOW - 7 * day, "subject": "C"}, {"fp": "hot", "at": NOW - 5 * day, "subject": "PR9", "machine": True},
              {"fp": "cold", "at": NOW - day, "subject": "A"}]
        got = mm.build([], [], fp, NOW)
        self.assertEqual((got["recurringFingerprints"], got["topRecurring"]), (1, [("hot", 3)]))
        self.assertEqual(got["daysTo3rdRepeatToMachine"], 2.0)
        self.assertIsNone(mm.build([], [], fp[:3], NOW)["daysTo3rdRepeatToMachine"])

    def test_cost_per_merged_by_class_uses_per_run_cost(self):
        rows = [{"kind": "fix-red", "pr": 1, "provider": "codex", "startedAt": iso(1)},
                {"kind": "fix-red", "pr": 1, "provider": "codex", "startedAt": iso(1)},
                {"kind": "fix-red", "pr": 2, "provider": "codex", "startedAt": iso(1)},
                {"issue": "JOV-1", "pr": 7, "provider": "grok", "startedAt": iso(1)}]
        got = mm.build(rows, [pr(1), pr(7)], [], NOW, {"codex": 0.5, "grok": 1.0})
        self.assertEqual(got["costPerMergedByClass"], {"fix": 1.5, "new": 1.0})

    def test_public_block_is_small_and_bounded(self):
        record = mm.build([], [pr(i) for i in range(50)], [], NOW)
        record["topRecurring"] = [("x" * 500, 9)] * 20
        block = mm.public_block(record)
        self.assertLessEqual(len(json.dumps(block)), mm.PUBLIC_MAX_BYTES)
        self.assertEqual(len(block["topRecurring"]), 3)


class DailyReadingTest(unittest.TestCase):
    def test_one_row_per_utc_day_is_appended_without_anyone_asking(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            record = {"machineMergeShare": 0.25, "machineMade": 2, "merged": 8}
            first = mm.daily_row(state, [], record, {}, NOW)
            second = mm.daily_row(state, [], record, {}, NOW + 3600)
            lines = (state / mm.DAILY_FILE).read_text().splitlines()
            self.assertEqual(len(lines), 1)
            self.assertEqual(first["date"], second["date"])
            self.assertEqual(first["machineMergeShare"], 0.25)
            nxt = mm.daily_row(state, [], record, {}, NOW + 86400)
            self.assertNotEqual(nxt["date"], first["date"])
            self.assertEqual(len((state / mm.DAILY_FILE).read_text().splitlines()), 2)

    def test_the_public_block_carries_the_latest_daily_row(self):
        block = mm.public_block({"at": "x", "daily": {"date": "2026-10-25", "fixRedLlmRuns": 40}})
        self.assertEqual(block["daily"]["fixRedLlmRuns"], 40)


class RefreshTest(unittest.TestCase):
    def test_refresh_writes_both_files_marks_built_machines_and_respects_freshness(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / "runs").mkdir()
            gate_row = {"kind": "issue", "issue": "JOV-1", "pr": 9, "machineGate": {"fp": "hot"}, "startedAt": iso(2)}
            (state / "runs" / "ledger.jsonl").write_text(json.dumps(gate_row) + "\n")
            calls = []
            def fetch(since):
                calls.append(since)
                return [pr(9, body="Machine: built scripts/lanes/x.py")]
            record = mm.refresh(state, NOW, fetch=fetch)
            self.assertEqual(record["machineBuilt"], 1)
            self.assertTrue((state / mm.FILE).exists())
            self.assertTrue(any(r.get("machine") for r in machine_gap.read(state)))
            mm.refresh(state, NOW + 60, fetch=fetch)
            self.assertEqual(len(calls), 1, "a fresh record is not rebuilt")
            mm.refresh(state, NOW + mm.REFRESH_S + 1, fetch=fetch)
            self.assertEqual(len(calls), 2)

    def test_a_failed_read_keeps_the_previous_record_and_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            def broken(since):
                raise OSError("no network")
            self.assertIsNone(mm.refresh(Path(tmp), NOW, fetch=broken))

    def test_no_lane_history_means_no_github_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(mm.refresh(Path(tmp), NOW))


if __name__ == "__main__":
    unittest.main()
