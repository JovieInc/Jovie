"""The CI runner-backlog reading ignores ghost runs GitHub still lists as queued.

2026-11-07: GitHub listed 32 runs created Aug 19 to Oct 7 as "queued" while refusing to cancel them as
completed. The sentinel took the oldest queued run's age (~45,000 minutes), so the autoscaler's
ci-runner-backlog brake held new-issue intake at zero. GitHub cancels runs queued over 24 hours, so
the count and the oldest age now cover runs created in the last day only.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_throughput_sentinel as base  # noqa: E402  (loads throughput_sentinel as base.ts)

ts, NOW, iso = base.ts, base.NOW, base.iso


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


if __name__ == "__main__":
    unittest.main()
