"""Tests for scripts/lanes/release_gates.py: replay of the 2026-11-01 sequence of four release blockers.

Run with:
    python3 -m unittest scripts/tests/test_release_gates.py -v
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import release_gates as rg  # noqa: E402

AUTH, RELEASE, LIGHTHOUSE, FLEET = ("Authorize exact main CI evidence", "Production Release",
                                    "Lighthouse CI (Production)", "Authorize fleet deployment state")
FLEET_LOG = ('Z {\n  "reason": "required blockers: check:Generate Screenshots",\n}\n'
             "Z ##[error]Fleet gate blocked production deployment (mode=blocked).\nZ ##[error]Process completed with exit code 2.")
# Newest last. Each entry: (time, failing job, log). None = green controller run.
TIMELINE = [
    ("12:30", None, None),
    ("12:52", RELEASE, "##[error]Staged canary failed: /api/health 503 after 3 attempts"),
    ("13:40", RELEASE, "##[error]Staged canary failed: /api/health 503 after 3 attempts"),
    ("14:20", AUTH, "##[error]Journey gate failed: auth journey evidence red tests/e2e/start-entry-continuity.spec.ts:330"),
    ("15:10", AUTH, "##[error]Journey gate failed: auth journey evidence red tests/e2e/start-entry-continuity.spec.ts:330"),
    ("16:30", LIGHTHOUSE, "##[error]Staged public-profile perf lane over budget: LCP 4200ms"),
    ("17:30", LIGHTHOUSE, "##[error]Staged public-profile perf lane over budget: LCP 4400ms"),
    ("18:30", FLEET, FLEET_LOG),
    ("19:00", FLEET, FLEET_LOG),
]


class FakeGitHub:
    def __init__(self, shown: int, red_commits: int = 0):
        self.shown, self.red_commits = shown, red_commits
        self.log_reads = 0

    def runs(self):
        out = []
        for i, (at, job, _) in enumerate(TIMELINE[: self.shown]):
            out.append({"id": 1000 + i, "status": "completed", "conclusion": "success" if job is None else "failure",
                        "head_sha": f"{i:x}" * 40, "created_at": f"2026-11-01T{at}:00Z", "html_url": f"https://github.com/run/{1000 + i}"})
        return list(reversed(out))

    def __call__(self, args, **_):
        path = args[1]
        body: dict | list
        if "workflows/production-controller.yml/runs" in path:
            body = {"workflow_runs": self.runs()}
        elif "workflows/staging-controller.yml/runs" in path:
            body = {"workflow_runs": []}
        elif "/jobs?" in path:
            i = int(path.split("/runs/")[1].split("/")[0]) - 1000
            failing = TIMELINE[i][1]
            body = {"jobs": [{"name": n, "id": (1000 + i) * 100 + k, "html_url": f"https://github.com/job/{(1000 + i) * 100 + k}",
                              "conclusion": "failure" if n == failing else "success"} for k, n in enumerate((AUTH, RELEASE, LIGHTHOUSE, FLEET))]}
        elif path.endswith("/logs"):
            self.log_reads += 1
            job_id = int(path.split("/jobs/")[1].split("/")[0])
            return SimpleNamespace(returncode=0, stdout=TIMELINE[job_id // 100 - 1000][2] or "", stderr="")
        elif "/commits?sha=main" in path:
            body = [{"sha": f"c{i}", "commit": {"committer": {"date": f"2026-11-01T1{9 - i}:00:00Z"}}} for i in range(6)]
        elif "/check-runs?" in path:
            sha, name = path.split("/commits/")[1].split("/check-runs")[0], unquote(path.split("check_name=")[1].split("&")[0])
            red = name == "Generate Screenshots" and int(sha[1:]) < self.red_commits
            body = {"check_runs": [{"id": 5000 + int(sha[1:]), "status": "completed", "conclusion": "failure" if red else "success",
                                    "html_url": f"https://github.com/check/{sha}"}]}
        else:
            raise AssertionError(path)
        return SimpleNamespace(returncode=0, stdout=json.dumps(body), stderr="")


def red_keys(alerts):
    return {k for k in alerts if "release-gate-red" in k}


def new_keys(alerts):
    return {k for k in alerts if "release-gate-new-blocker" in k}


class Derivation(unittest.TestCase):
    def test_gates_come_from_the_controller_and_fleet_contract(self):
        gates = rg.derive_gates()
        self.assertIn(FLEET, gates["controllerJobs"]["production-controller.yml"])
        self.assertIn(AUTH, gates["controllerJobs"]["production-controller.yml"])
        self.assertIn("Generate Screenshots", gates["mainChecks"])
        self.assertIn("Main Release Ready", gates["mainChecks"])
        self.assertEqual(gates["journeys"], ["auth", "billing"])

    def test_job_names_parse_from_workflow_text(self):
        text = "name: x\njobs:\n  a:\n    name: Gate A\n    runs-on: x\n  b:\n    runs-on: x\n  c:\n    name: ${{ x }}\n"
        self.assertEqual(rg.controller_jobs(text), ["Gate A", "b"])

    def test_reasons_normalise_ids_and_split_fleet_blockers(self):
        self.assertEqual(rg.blocker_reasons(FLEET_LOG), ["fleet-gate blocker: check:Generate Screenshots",
                                                         "Fleet gate blocked production deployment (mode=blocked)."])
        self.assertEqual(rg.normalize_reason("canary run 4041234 on " + "a" * 40), "canary run <n> on <sha>")


class Replay(unittest.TestCase):
    """Four different blockers 12:52Z-19:00Z; each is a new-blocker P0 on its first run and a gate-red P0 on its second."""

    def tick(self, tmp, shown, now, gh=None):
        gh = gh or FakeGitHub(shown)
        got, err = rg.sample(Path(tmp), now, run=gh)
        self.assertIsNone(err)
        return rg.judge(got, now)

    def test_each_blocker_is_detected_on_its_first_or_second_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            now = 2_000_000.0
            seen = []
            for shown in range(1, len(TIMELINE) + 1):
                now += 400
                seen.append(self.tick(tmp, shown, now))
            # (index of the blocker's first run, expected gate key). Run index i is shown at step i+1.
            for first, gate in ((1, "production:production-release"), (3, "production:authorize-exact-main-ci-evidence"),
                                (5, "production:lighthouse-ci-production"), (7, "production:authorize-fleet-deployment-state")):
                on_first, on_second = seen[first], seen[first + 1]
                self.assertEqual(len(new_keys(on_first)), len(rg.blocker_reasons(TIMELINE[first][2])), f"first run {first}")
                self.assertFalse(red_keys(on_first) & {f"production-deploy:release-gate-red:{gate}"}, "one red run is quiet")
                text = on_second[f"production-deploy:release-gate-red:{gate}"]
                self.assertIn(f"{(f'{first:x}') * 12}", text)  # first bad SHA
                self.assertIn(f"controller run {1000 + first + 1}", text)  # newest controller run id
            # Names the gate, the failing job and the spec.
            self.assertIn("tests/e2e/start-entry-continuity.spec.ts:330", seen[4]["production-deploy:release-gate-red:production:authorize-exact-main-ci-evidence"])
            self.assertIn("Authorize exact main CI evidence", seen[4]["production-deploy:release-gate-red:production:authorize-exact-main-ci-evidence"])
            self.assertIn("github.com/job/", seen[4]["production-deploy:release-gate-red:production:authorize-exact-main-ci-evidence"])
            fleet_new = "\n".join(seen[7][k] for k in new_keys(seen[7]))
            self.assertIn("fleet-gate blocker: check:Generate Screenshots", fleet_new)
            # Each earlier blocker cleared once the next one took over.
            self.assertFalse(new_keys(seen[4]) & new_keys(seen[2]))
            self.assertEqual(red_keys(seen[3]), set())

    def test_green_controller_run_clears_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.tick(tmp, 3, 2_000_400.0)
            old = TIMELINE[:]
            try:
                TIMELINE.append(("20:00", None, None))
                alerts = self.tick(tmp, len(TIMELINE), 2_000_800.0)
            finally:
                TIMELINE[:] = old
            self.assertEqual((red_keys(alerts), new_keys(alerts)), (set(), set()))

    def test_logs_are_read_once_per_job(self):
        with tempfile.TemporaryDirectory() as tmp:
            gh = FakeGitHub(3)
            rg.sample(Path(tmp), 3_000_000.0, run=gh)
            reads = gh.log_reads
            self.assertGreater(reads, 0)
            rg.sample(Path(tmp), 3_000_400.0, run=gh)
            self.assertEqual(gh.log_reads, reads)

    def test_a_standing_new_blocker_stays_raised_on_the_next_run_without_a_second_issue(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = self.tick(tmp, 2, 4_000_000.0)
            second = self.tick(tmp, 3, 4_000_400.0)
            self.assertEqual(new_keys(first), new_keys(second))


class MainChecks(unittest.TestCase):
    def test_generate_screenshots_red_on_two_main_commits_is_a_p0_with_first_bad_sha(self):
        with tempfile.TemporaryDirectory() as tmp:
            got, err = rg.sample(Path(tmp), 5_000_000.0, run=FakeGitHub(1, red_commits=2))
            self.assertIsNone(err)
            alerts = rg.judge(got, 5_000_000.0)
            text = alerts["production-deploy:release-gate-red:check:generate-screenshots"]
            self.assertIn("Generate Screenshots", text)
            self.assertIn("2 main commits", text)
            self.assertIn("c1", text)
        with tempfile.TemporaryDirectory() as tmp:  # fresh state: concluded check runs are cached as immutable
            got, _ = rg.sample(Path(tmp), 5_000_400.0, run=FakeGitHub(1, red_commits=1))
            self.assertNotIn("production-deploy:release-gate-red:check:generate-screenshots", rg.judge(got, 5_000_400.0))

    def test_red_check_never_rerun_on_newer_commits_is_dispatched_once_with_a_receipt(self):
        class Stale(FakeGitHub):
            posts = []

            def __call__(self, args, **kw):
                if len(args) > 3 and "dispatches" in args[3]:
                    self.posts.append(args)
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                if "/check-runs?" in args[1] and "Generate" in unquote(args[1]):
                    sha = args[1].split("/commits/")[1].split("/")[0]
                    if int(sha[1:]) < 2:  # c0, c1: path filter skipped them, no run
                        return SimpleNamespace(returncode=0, stdout=json.dumps({"check_runs": []}), stderr="")
                    return SimpleNamespace(returncode=0, stdout=json.dumps({"check_runs": [
                        {"id": 77, "status": "completed", "conclusion": "failure", "html_url": "u"}]}), stderr="")
                return super().__call__(args, **kw)

        with tempfile.TemporaryDirectory() as tmp:
            gh = Stale(1)
            got, err = rg.sample(Path(tmp), 6_000_000.0, run=gh)
            self.assertIsNone(err)
            self.assertEqual(len(gh.posts), 1)
            self.assertIn("screenshots.yml/dispatches", gh.posts[0][3])
            self.assertEqual(list(got["dispatches"].values())[0]["redCheckRunId"], 77)
            rg.sample(Path(tmp), 6_000_400.0, run=gh)
            self.assertEqual(len(gh.posts), 1, "once per red check run")

    def test_stale_evidence_read_alerts(self):
        self.assertIn("release-gates-stale", rg.judge({"evidenceReadAt": 1000.0}, 1000.0 + 1801))


if __name__ == "__main__":
    unittest.main()
