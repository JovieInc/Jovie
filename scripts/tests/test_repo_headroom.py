"""Repo headroom alert: the doctor raises repo-headroom-low while origin/main leaves under 20% free.

Run with:
    python3 -m unittest scripts/tests/test_repo_headroom.py -v
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    # Reuse a module test_doctor.py already loaded, so shared import-time state stays intact.
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


repo_headroom = load("repo_headroom")
doctor = load("doctor")

MIB = 1024 * 1024
LS_TREE = "\n".join([
    "100644 blob aaa     700\tapps/web/a.ts",
    "100755 blob bbb     200\tscripts/run.sh",
    "120000 blob ccc      40\tlink",
    "160000 commit ddd     -\tvendor/sub",
])


def fake_run(limits="  maxTrackedBytes: 198 * MiB,\n", tree=LS_TREE, code=0):
    def run(cmd, **_kwargs):
        out = limits if "show" in cmd else tree
        return SimpleNamespace(returncode=code, stdout=out, stderr="")
    return run


def judge_obs(headroom):
    return {"now": 1_000_000.0, "tick": {"at": "2026-11-21T00:00:00Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 600, "runs24h": 12, "busy": 3,
            "codex": {"generatedAt": doctor.epoch_iso(1_000_000.0), "count": 1, "available": ["a"],
                      "accounts": {"a": {"available": True, "leased": False, "resetsInS": 0}}},
            "pool": 40, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "openPRCount": 0, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
            "hudExpected": True, "hudBeatAge": 3, "repoHeadroom": headroom}


class MeasureTest(unittest.TestCase):
    def test_counts_regular_files_only_and_reads_the_budget_from_the_ref(self):
        measured = repo_headroom.measure(Path("/repo"), run=fake_run())
        self.assertEqual(measured, {"bytes": 900, "budget": 198 * MIB, "ref": "origin/main"})

    def test_unreadable_ref_or_changed_limits_shape_is_an_error_not_an_alert(self):
        self.assertIn("error", repo_headroom.measure(Path("/repo"), run=fake_run(code=128)))
        changed = repo_headroom.measure(Path("/repo"), run=fake_run(limits="maxTrackedBytes: BUDGET,"))
        self.assertIn("maxTrackedBytes not found", changed["error"])
        self.assertIsNone(repo_headroom.alert_line(changed))

    def test_git_failure_is_reported(self):
        def boom(*_args, **_kwargs):
            raise subprocess.TimeoutExpired("git", 60)
        self.assertIn("git unavailable", repo_headroom.measure(Path("/repo"), run=boom)["error"])

    def test_the_real_limits_file_still_parses_and_matches_a_real_count(self):
        source = (ROOT / repo_headroom.LIMITS_PATH).read_text()
        self.assertEqual(repo_headroom.budget_bytes(source), 198 * MIB)
        tree = subprocess.run(["git", "-C", str(ROOT), "ls-tree", "-r", "-l", "HEAD"],
                              capture_output=True, text=True, timeout=60)
        if tree.returncode == 0:
            self.assertGreater(repo_headroom.tracked_bytes(tree.stdout), 0)


class AlertLineTest(unittest.TestCase):
    def test_quiet_at_or_above_twenty_percent_free(self):
        self.assertIsNone(repo_headroom.alert_line({"bytes": 80, "budget": 100}))
        self.assertIsNone(repo_headroom.alert_line({"bytes": 10, "budget": 100}))
        self.assertIsNone(repo_headroom.alert_line(None))
        self.assertIsNone(repo_headroom.alert_line({"error": "x"}))

    def test_fires_under_twenty_percent_free_and_names_the_target(self):
        line = repo_headroom.alert_line({"bytes": 81, "budget": 100, "ref": "origin/main"})
        self.assertIn("81 of 100 budget bytes", line)
        self.assertIn("19.00% free", line)
        self.assertIn("down to 80", line)
        self.assertIn("never a budget raise", line)


class DoctorJudgeTest(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch("devin_free_policy.admission_open", return_value=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_judge_raises_repo_headroom_low_only_under_the_line(self):
        low = doctor.judge(judge_obs({"bytes": 207_098_291, "budget": 198 * MIB, "ref": "origin/main"}))
        self.assertIn("99.75% used", low["repo-headroom-low"])
        ok = doctor.judge(judge_obs({"bytes": 150 * MIB, "budget": 198 * MIB, "ref": "origin/main"}))
        self.assertNotIn("repo-headroom-low", ok)
        self.assertNotIn("repo-headroom-low", doctor.judge(judge_obs(None)))


if __name__ == "__main__":
    unittest.main()
