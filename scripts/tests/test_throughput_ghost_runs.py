"""The CI runner-backlog reading ignores ghost runs GitHub still lists as queued.

2026-11-07: GitHub listed 32 runs created Aug 19 to Oct 7 as "queued" while refusing to cancel them as
completed. The sentinel took the oldest queued run's age (~45,000 minutes), so the autoscaler's
ci-runner-backlog brake held new-issue intake at zero. GitHub cancels runs queued over 24 hours, so
the count and the oldest age now cover runs created in the last day only.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

# Self-contained: the lanes release self-test ships only LANE_TESTS, so this file must not import another test.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
_spec = importlib.util.spec_from_file_location("throughput_sentinel", ROOT / "scripts/lanes/throughput_sentinel.py")
ts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ts)
NOW = 1_800_000_000.0


def iso(epoch):
    return ts.datetime.fromtimestamp(epoch, ts.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class GhostQueuedRunsTest(unittest.TestCase):
    def test_queued_reads_cover_only_the_last_day(self):
        calls = []

        def run(args, **kwargs):
            path = args[-1]
            calls.append(path)
            if "status=queued" in path:
                # GitHub applies the created filter; return what it would with the ghost excluded.
                recent = "created=%3E%3D" in path
                total = 2 if recent else 3
                oldest = NOW - 5 * 60 if recent else NOW - 45_000 * 60
                if "&page=" in path:
                    return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps(
                        {"workflow_runs": [{"created_at": iso(oldest)}]}))
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"total_count": total}))
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": []}))

        with tempfile.TemporaryDirectory() as raw:
            signal, error = ts.sample_release_flow(Path(raw), NOW, run)
        self.assertIsNone(error)
        self.assertEqual((signal["queuedRuns"], signal["queuedOldestMin"]), (2, 5.0))
        queued = [path for path in calls if "status=queued" in path]
        self.assertEqual(len(queued), 2)
        self.assertTrue(all("created=%3E%3D" in path for path in queued))

    def test_queued_window_is_two_hours_so_same_day_ghosts_release_the_brake(self):
        """2026-11-12: 134 runs created 2026-11-11 20:19-20:52Z sat "queued" with no jobs and refused
        cancellation (409 "not been queued yet"). Inside the old 24h window they held every lane's
        intake at 0 (ci-runner-backlog) for 14 hours. A real backlog's oldest run is minutes old."""
        calls = []

        def run(args, **kwargs):
            calls.append(args[-1])
            if "status=queued" in args[-1]:
                return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"total_count": 0}))
            return SimpleNamespace(returncode=0, stderr="", stdout=json.dumps({"workflow_runs": []}))

        with tempfile.TemporaryDirectory() as raw:
            signal, error = ts.sample_release_flow(Path(raw), NOW, run)
        self.assertIsNone(error)
        window = iso(NOW - 2 * 3600)
        queued = [path for path in calls if "status=queued" in path]
        self.assertTrue(queued and all(f"created=%3E%3D{window}" in path for path in queued))


if __name__ == "__main__":
    unittest.main()
