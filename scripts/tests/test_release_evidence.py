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

    def test_line_reporter_headers_and_failed_summary_block(self):
        log = "\n".join([
            "2026-11-01T05:00:00.0000000Z   1) [chromium] › tests/e2e/start-entry-continuity.spec.ts:330:7 › continuity ─────",
            "2026-11-01T05:00:01.0000000Z     Timed out 5000ms waiting for expect(locator).toBeVisible()",
            "2026-11-01T05:00:02.0000000Z   1 failed",
            "2026-11-01T05:00:02.0000000Z     [chromium] › tests/e2e/start-entry-continuity.spec.ts:330:7 › continuity",
            "2026-11-01T05:00:02.0000000Z   40 passed (3.2m)",
            "2026-11-01T05:00:02.0000000Z     [chromium] › tests/e2e/golden-path.spec.ts:10:3 › should not count",
        ])
        self.assertEqual(release_evidence.failing_specs(log), ["tests/e2e/start-entry-continuity.spec.ts:330"])


class CarryStreak(unittest.TestCase):
    def test_first_bad_sha_survives_a_streak_longer_than_the_read_window(self):
        rows = runs(*["failure"] * 8)
        first = release_evidence.red_streaks(release_evidence.job_conclusions(rows, jobs_of_factory(rows)))["golden-path"]
        self.assertFalse(first["bounded"])
        newer = runs(*["failure"] * 10)[:8]  # two new reds arrived, the window slid
        for i, r in enumerate(newer):
            r["head_sha"] = f"n{i}".ljust(40, "0") if i < 2 else rows[i - 2]["head_sha"]
        current = release_evidence.red_streaks(release_evidence.job_conclusions(newer, jobs_of_factory(newer)))["golden-path"]
        carried = release_evidence.carry_streak(current, first)
        self.assertEqual(carried["firstBadSha"], rows[7]["head_sha"])
        self.assertEqual(carried["count"], 10)

    def test_a_green_in_the_window_bounds_the_streak(self):
        rows = runs("failure", "failure", "success")
        current = release_evidence.red_streaks(release_evidence.job_conclusions(rows, jobs_of_factory(rows)))["golden-path"]
        self.assertEqual(release_evidence.carry_streak(current, {"firstBadSha": "old", "count": 9})["firstBadSha"], rows[1]["head_sha"])


class LogRetry(unittest.TestCase):
    def test_a_failed_log_read_is_retried_next_tick(self):
        rows = runs("failure", "failure")
        log_ok = [False]

        def gh(args, **_):
            path = args[1]
            if "workflows/ci.yml/runs" in path:
                body = {"workflow_runs": [{k: v for k, v in r.items() if k != "_job"} for r in rows]}
            elif "/jobs?" in path:
                body = {"jobs": jobs_of_factory(rows)(int(path.split("/runs/")[1].split("/")[0]))}
            elif path.endswith("/logs"):
                return SimpleNamespace(returncode=0 if log_ok[0] else 1, stdout="✘ 1 › tests/e2e/x.spec.ts:5:1" if log_ok[0] else "", stderr="")
            else:
                body = {"sha": "f" * 40}
            return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")

        with tempfile.TemporaryDirectory() as tmp:
            out, _ = release_evidence.sample(Path(tmp), 1_000_000.0, run=gh, version=lambda: "a163bac")
            self.assertIsNone(out["streaks"]["golden-path"]["specs"])
            log_ok[0] = True
            out, _ = release_evidence.sample(Path(tmp), 1_000_400.0, run=gh, version=lambda: "a163bac")
            self.assertEqual(out["streaks"]["golden-path"]["specs"], ["tests/e2e/x.spec.ts:5"])


class OnlyGreenClears(unittest.TestCase):
    def test_skipped_runs_sliding_the_reds_out_of_the_window_do_not_clear_the_streak(self):
        state = {"rows": runs("failure", "failure")}

        def gh(args, **_):
            path = args[1]
            rows = state["rows"]
            if "workflows/ci.yml/runs" in path:
                body = {"workflow_runs": [{k: v for k, v in r.items() if k != "_job"} for r in rows]}
            elif "/jobs?" in path:
                body = {"jobs": jobs_of_factory(rows)(int(path.split("/runs/")[1].split("/")[0]))}
            elif path.endswith("/logs"):
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            else:
                body = {"sha": "f" * 40}
            return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")

        with tempfile.TemporaryDirectory() as tmp:
            out, _ = release_evidence.sample(Path(tmp), 1_000_000.0, run=gh, version=lambda: "a163bac")
            self.assertEqual(out["streaks"]["golden-path"]["count"], 2)
            skipped = runs(*[None] * 8)
            for r in skipped:
                r["id"] += 1000
            state["rows"] = skipped
            out, _ = release_evidence.sample(Path(tmp), 1_000_400.0, run=gh, version=lambda: "a163bac")
            self.assertEqual(out["streaks"]["golden-path"]["count"], 2)
            green = runs("success")
            green[0]["id"] += 2000
            state["rows"] = green
            out, _ = release_evidence.sample(Path(tmp), 1_000_800.0, run=gh, version=lambda: "a163bac")
            self.assertNotIn("golden-path", out["streaks"])

    def test_a_job_that_stopped_running_expires_after_a_day(self):
        prior = {"count": 3, "firstBadSha": "a" * 40, "newestSha": "b" * 40, "lastRedSeenAt": 1_000_000.0}

        def gh(args, **_):
            path = args[1]
            if "workflows/ci.yml/runs" in path:
                rows = runs(None, None)
                body = {"workflow_runs": [{k: v for k, v in r.items() if k != "_job"} for r in rows]}
            elif "/jobs?" in path:
                body = {"jobs": []}
            else:
                body = {"sha": "f" * 40}
            return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / release_evidence.STATE_FILE).write_text(json.dumps({"streaks": {"golden-path": prior}}))
            out, _ = release_evidence.sample(Path(tmp), 1_000_000.0 + 3600, run=gh, version=lambda: "a163bac")
            self.assertIn("golden-path", out["streaks"])
            out, _ = release_evidence.sample(Path(tmp), 1_000_000.0 + 25 * 3600, run=gh, version=lambda: "a163bac")
            self.assertNotIn("golden-path", out["streaks"])


class ReadStale(unittest.TestCase):
    def test_a_failed_evidence_read_does_not_look_fresh(self):
        self.assertEqual(release_evidence.judge({"evidenceReadAt": 1000.0}, 1000.0 + 600), {})
        self.assertIn("release-evidence-stale", release_evidence.judge({"evidenceReadAt": 1000.0}, 1000.0 + 1801))
        # Cold start whose reads keep failing: no evidenceReadAt yet, measured from the first observation.
        self.assertIn("release-evidence-stale", release_evidence.judge({"evidenceReadAt": None, "firstObservedAt": 1000.0}, 1000.0 + 1801))


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

    def test_age_counts_from_when_main_moved_past_the_build_not_from_deploy(self):
        t0 = 1_000_000.0
        b = release_evidence.build_staleness({}, "a163bac", "a163bac" + "0" * 33, t0)  # live build is main
        b = release_evidence.build_staleness(b, "a163bac", "a163bac" + "0" * 33, t0 + 10 * 3600)  # 10h, main unchanged
        self.assertFalse(b["stale"])
        b = release_evidence.build_staleness(b, "a163bac", "f" * 40, t0 + 10 * 3600 + 60)  # a new commit lands
        self.assertFalse(b["stale"])
        b = release_evidence.build_staleness(b, "a163bac", "e" * 40, t0 + 12 * 3600 + 120)
        self.assertTrue(b["stale"])

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
        attempt = [1]

        def gh(args, **_):
            path = args[1]
            calls.append(path)
            if path.startswith("repos/JovieInc/Jovie/actions/workflows/ci.yml/runs"):
                body = {"workflow_runs": [{**{k: v for k, v in r.items() if k != "_job"}, "run_attempt": attempt[0]} for r in rows]}
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
            attempt[0] = 2  # a manual rerun of every run: new attempts are read again
            calls.clear()
            release_evidence.sample(Path(tmp), 1_000_000.0 + 800, run=gh, version=lambda: "a163bac")
            self.assertEqual(sum(1 for c in calls if "/jobs?" in c), 3)


if __name__ == "__main__":
    unittest.main()
