"""LYB macOS pool admission and metrics: hermetic, no gh, no network."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import macos_pool as mp  # noqa: E402

NOW = 1_800_000_000.0


def iso(offset):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(NOW + offset, timezone.utc).isoformat().replace("+00:00", "Z")


def job(job_id, repo, status, labels=("macos-15",), name="iOS Unit"):
    return {"id": job_id, "repo": repo, "status": status, "labels": list(labels), "name": name}


class Fetch:
    def __init__(self, jobs_by_repo, finished=None):
        self.jobs_by_repo, self.finished, self.calls = jobs_by_repo, finished or {}, []

    def __call__(self, path):
        self.calls.append(path)
        repo = "/".join(path.split("/")[1:3])
        if "/actions/runs?status=" in path:
            status = path.split("status=")[1].split("&")[0]
            has = any(j["status"] == status for j in self.jobs_by_repo.get(repo, []))
            return {"workflow_runs": [{"id": 1}] if has else []}
        if "/actions/runs/1/jobs" in path:
            return {"jobs": self.jobs_by_repo.get(repo, [])}
        if "/actions/jobs/" in path:
            return self.finished[path.rsplit("/", 1)[1]]
        raise AssertionError(path)


class TallyTests(unittest.TestCase):
    def test_counts_only_macos_jobs_per_repo(self):
        counts = mp.tally([job(1, mp.HOLD_REPO, "queued"), job(2, mp.HOLD_REPO, "in_progress"),
                           job(3, mp.HOLD_REPO, "queued", labels=("ubuntu-latest",)),
                           job(4, "JovieInc/Jovie", "in_progress", labels=("macos-26",))])
        self.assertEqual(counts[mp.HOLD_REPO], {"running": 1, "queued": 1})
        self.assertEqual(counts["JovieInc/Jovie"], {"running": 1, "queued": 0})

    def test_job_metric_needs_ordered_times(self):
        ok = mp.job_metric("r", {"name": "n", "created_at": iso(0), "started_at": iso(600), "completed_at": iso(1500),
                                 "conclusion": "success"})
        self.assertEqual((ok["waitS"], ok["runS"]), (600.0, 900.0))
        self.assertIsNone(mp.job_metric("r", {"created_at": iso(0), "started_at": iso(-5), "completed_at": iso(9)}))
        self.assertIsNone(mp.job_metric("r", {"created_at": iso(0), "started_at": iso(1)}))


class PoolCapTests(unittest.TestCase):
    def test_cap_is_the_measured_maximum_not_a_constant(self):
        rows = [{"kind": "sample", "at": NOW - 10, "repos": {"a": {"running": 3}, "b": {"running": 2}}},
                {"kind": "sample", "at": NOW - 5, "repos": {"a": {"running": 1}}},
                {"kind": "sample", "at": NOW - 99 * 86400, "repos": {"a": {"running": 9}}},
                {"kind": "job", "at": NOW}]
        self.assertEqual(mp.pool_cap(rows, NOW), 5)
        self.assertIsNone(mp.pool_cap([], NOW))


class AdmissionTests(unittest.TestCase):
    def write(self, state, running, queued, at=NOW):
        (Path(state) / mp.POOL_FILE).write_text(json.dumps(
            {"at": at, "repos": {mp.HOLD_REPO: {"running": running, "queued": queued}}, "poolCap": 5}))

    def test_holds_at_three_running_plus_queued(self):
        with tempfile.TemporaryDirectory() as state:
            self.write(state, 2, 0)
            self.assertFalse(mp.admission(Path(state), NOW)["hold"])
            self.write(state, 2, 1)
            held = mp.admission(Path(state), NOW)
            self.assertTrue(held["hold"])
            self.assertEqual((held["lybLoad"], held["holdAt"], held["poolCap"]), (3, 3, 5))

    def test_fails_open_without_a_fresh_sample(self):
        with tempfile.TemporaryDirectory() as state:
            self.assertEqual(mp.admission(Path(state), NOW)["reason"], "no-sample")
            self.write(state, 9, 9, at=NOW - mp.STALE_S - 1)
            held = mp.admission(Path(state), NOW)
            self.assertFalse(held["hold"])
            self.assertEqual(held["reason"], "stale-sample")

    def test_partition_holds_only_ios_rows(self):
        rows = [{"identifier": "LYB-1", "labels": ["agent-ready", "area:iOS"]},
                {"identifier": "LYB-2", "labels": ["agent-ready", "web"]}]
        kept, held = mp.partition_ios(rows, True)
        self.assertEqual([r["identifier"] for r in kept], ["LYB-2"])
        self.assertEqual(held, {"LYB-1": mp.HOLD_REASON})
        self.assertEqual(mp.partition_ios(rows, False), (rows, {}))


class SampleTests(unittest.TestCase):
    def test_sample_writes_snapshot_history_and_finished_job_metrics(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            first = Fetch({mp.HOLD_REPO: [job(10, mp.HOLD_REPO, "queued"), job(11, mp.HOLD_REPO, "in_progress")]})
            out = mp.sample(state, first, NOW)
            self.assertEqual(out["repos"][mp.HOLD_REPO], {"running": 1, "queued": 1})
            # job 10 finishes before the next sample: its wait and run are recorded once
            finished = {"10": {"name": "iOS Unit", "created_at": iso(0), "started_at": iso(1200),
                               "completed_at": iso(1800), "conclusion": "success"}}
            second = Fetch({mp.HOLD_REPO: [job(11, mp.HOLD_REPO, "in_progress")]}, finished)
            out = mp.sample(state, second, NOW + 300)
            self.assertEqual(out["recorded"], 1)
            rows = [json.loads(line) for line in (state / mp.HISTORY_FILE).read_text().splitlines()]
            metric = next(r for r in rows if r["kind"] == "job")
            self.assertEqual((metric["waitS"], metric["runS"]), (1200.0, 600.0))

    def test_sample_is_throttled_and_a_failed_read_keeps_the_old_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            mp.sample(state, Fetch({}), NOW)
            self.assertEqual(mp.sample(state, Fetch({}), NOW + 10), {"skipped": "throttled"})
            before = (state / mp.POOL_FILE).read_text()

            def boom(path):
                raise RuntimeError("HTTP 502")
            self.assertIn("error", mp.sample(state, boom, NOW + 1000))
            self.assertEqual((state / mp.POOL_FILE).read_text(), before)


if __name__ == "__main__":
    unittest.main()
