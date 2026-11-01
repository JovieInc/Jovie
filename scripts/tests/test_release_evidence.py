"""Tests for scripts/lanes/release_evidence.py (closed-loop gap 2026-11-01).

Run with:
    python3 -m unittest scripts/tests/test_release_evidence.py -v
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
spec = importlib.util.spec_from_file_location("release_evidence", ROOT / "scripts/lanes/release_evidence.py")
release_evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_evidence)

JOB = "Golden Path (manual)"


def runs(*conclusions):
    """Newest-first main push runs; each conclusion is the Golden Path job's result (None = job skipped/absent)."""
    out = []
    for i, c in enumerate(conclusions):
        out.append({"id": 100 - i, "status": "completed", "head_sha": f"{i:x}" * 40, "created_at": f"2026-11-01T0{9 - i}:00:00Z",
                    "html_url": f"https://github.com/run/{100 - i}", "_job": c})
    return out


def jobs_of_factory(rows):
    by = {r["id"]: r["_job"] for r in rows}
    return lambda run_id: ([] if by[run_id] is None else [{"name": JOB, "conclusion": by[run_id], "id": run_id * 10,
                                                          "html_url": f"https://github.com/job/{run_id * 10}"}])


class Streaks(unittest.TestCase):
    def test_two_consecutive_reds_fire_with_the_oldest_red_as_first_bad_sha(self):
        rows = runs("failure", "failure", "success", "failure")
        streak = release_evidence.red_streaks(release_evidence.job_conclusions(rows, jobs_of_factory(rows)))["golden-path"]
        self.assertEqual(streak["count"], 2)
        self.assertEqual(streak["firstBadSha"], rows[1]["head_sha"])
        self.assertEqual(streak["newestJobId"], 1000)
        alerts = release_evidence.judge({"streaks": {"golden-path": {**streak, "specs": ["tests/e2e/start-entry-continuity.spec.ts:330"]}}}, 0)
        text = alerts["production-deploy:release-evidence-red:golden-path"]
        self.assertIn(rows[1]["head_sha"][:12], text)
        self.assertIn("tests/e2e/start-entry-continuity.spec.ts:330", text)

    def test_one_red_or_green_newest_is_quiet_and_skips_neither_break_nor_count(self):
        rows = runs("failure", "success", "failure")
        self.assertEqual(release_evidence.judge({"streaks": release_evidence.red_streaks(
            release_evidence.job_conclusions(rows, jobs_of_factory(rows)))}, 0), {})
        rows = runs("success", "failure", "failure")
        self.assertEqual(release_evidence.red_streaks(release_evidence.job_conclusions(rows, jobs_of_factory(rows))), {})
        rows = runs("failure", None, "failure", "success")
        streak = release_evidence.red_streaks(release_evidence.job_conclusions(rows, jobs_of_factory(rows)))["golden-path"]
        self.assertEqual((streak["count"], streak["firstBadSha"]), (2, rows[2]["head_sha"]))

    def test_tonight_eight_red_runs(self):
        rows = runs(*["failure"] * 8)
        streak = release_evidence.red_streaks(release_evidence.job_conclusions(rows, jobs_of_factory(rows)))["golden-path"]
        self.assertEqual((streak["count"], streak["firstBadSha"]), (8, rows[7]["head_sha"]))

    def test_failing_specs_from_a_playwright_log(self):
        log = "\n".join([
            "  ✘  12 [chromium] › tests/e2e/start-entry-continuity.spec.ts:330:7 › continuity (3.1s)",
            "  ✓  13 [chromium] › tests/e2e/golden-path.spec.ts:10:3 › ok",
            "  1) [chromium] › tests/e2e/start-entry-continuity.spec.ts:330:7 › continuity  Error: expect(locator)",
        ])
        self.assertEqual(release_evidence.failing_specs(log), ["tests/e2e/start-entry-continuity.spec.ts:330"])


class BuildStale(unittest.TestCase):
    def test_stale_only_after_two_hours_with_main_advanced(self):
        t0 = 1_000_000.0
        b = release_evidence.build_staleness({}, "a163bac", "f" * 40, t0)
        self.assertFalse(b["stale"])
        b = release_evidence.build_staleness(b, "a163bac", "f" * 40, t0 + 2 * 3600 - 1)
        self.assertFalse(b["stale"])
        b = release_evidence.build_staleness(b, "a163bac", "f" * 40, t0 + 2 * 3600 + 1)
        self.assertTrue(b["stale"])
        alerts = release_evidence.judge({"build": b}, t0)
        self.assertIn("a163bac", alerts["production-deploy:build-stale"])

    def test_main_not_advanced_is_a_no_op_and_a_new_build_clears(self):
        t0 = 1_000_000.0
        b = release_evidence.build_staleness({"buildId": "a163bac", "since": t0 - 5 * 3600}, "a163bac", "a163bac" + "0" * 33, t0)
        self.assertFalse(b["stale"])
        b = release_evidence.build_staleness({"buildId": "a163bac", "since": t0 - 5 * 3600}, "b222222", "f" * 40, t0)
        self.assertEqual((b["since"], b["stale"]), (t0, False))
        self.assertEqual(release_evidence.judge({"build": b}, t0), {})

    def test_unreadable_version_keeps_previous_and_never_alerts_on_its_own(self):
        b = release_evidence.build_staleness({"buildId": "a163bac", "since": 1.0}, None, "f" * 40, 99_999.0)
        self.assertFalse(b["readable"])


class Sample(unittest.TestCase):
    def test_sample_reads_ci_and_version_and_caches_completed_jobs(self):
        rows = runs("failure", "failure", "success")
        calls = []

        def gh(args, **_):
            path = args[1]
            calls.append(path)
            if path.startswith("repos/JovieInc/Jovie/actions/workflows/ci.yml/runs"):
                body = {"workflow_runs": [{k: v for k, v in r.items() if k != "_job"} for r in rows]}
            elif "/jobs?" in path:
                run_id = int(path.split("/runs/")[1].split("/")[0])
                body = {"jobs": jobs_of_factory(rows)(run_id)}
            elif path.endswith("/logs"):
                return SimpleNamespace(returncode=0, stdout="✘ 1 [chromium] › tests/e2e/x.spec.ts:5:1 › y", stderr="")
            elif path.endswith("/commits/main"):
                body = {"sha": "f" * 40}
            else:
                raise AssertionError(path)
            return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")

        with tempfile.TemporaryDirectory() as tmp:
            out, err = release_evidence.sample(Path(tmp), 1_000_000.0, run=gh, version=lambda: "a163bac")
            self.assertIsNone(err)
            self.assertEqual(out["streaks"]["golden-path"]["specs"], ["tests/e2e/x.spec.ts:5"])
            self.assertEqual(out["build"]["buildId"], "a163bac")
            jobs_reads = sum(1 for c in calls if "/jobs?" in c)
            calls.clear()
            out2, _ = release_evidence.sample(Path(tmp), 1_000_000.0 + 400, run=gh, version=lambda: "a163bac")
            self.assertEqual(sum(1 for c in calls if "/jobs?" in c), 0)  # completed runs' jobs are cached
            self.assertEqual(sum(1 for c in calls if c.endswith("/logs")), 0)  # same failing job: no second log read
            self.assertEqual(jobs_reads, 3)


if __name__ == "__main__":
    unittest.main()
