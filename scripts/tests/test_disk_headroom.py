"""Headroom alarms, the daily report and the critical-alarm strip trigger (JOV-7704 follow-up)."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("worktree_sweep", ROOT / "scripts/lanes/worktree_sweep.py")
sweeper = importlib.util.module_from_spec(SPEC)
sys.modules["worktree_sweep"] = sweeper
SPEC.loader.exec_module(sweeper)
import disk_headroom  # noqa: E402  (sweeper puts scripts/lanes on sys.path)

DAY = 86400.0


def no_processes(args, **kw):
    return SimpleNamespace(returncode=0, stdout="", stderr="")


class HeadroomTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name).resolve()
        self.home, self.state = self.base / "home", self.base / "state"
        self.home.mkdir()
        self.state.mkdir()
        self.now = time.time()

    def test_strip_pass_sheds_idle_installs_only(self):
        idle, fresh = self.base / "idle-strip", self.base / "fresh-strip"
        for path in (idle, fresh):
            (path / "node_modules").mkdir(parents=True)
        activity = {idle: self.now - 7200, fresh: self.now}
        with patch.object(sweeper, "linked_worktrees", return_value=[(idle, None), (fresh, None)]), \
                patch.object(sweeper, "inspect", side_effect=lambda path, run: {"activity": activity[path]}):
            report = sweeper.strip_pass([self.base], [self.base], [], run=no_processes, now=self.now)
        self.assertEqual(report["stripped"], [str(idle)])
        self.assertFalse((idle / "node_modules").exists())
        self.assertTrue((fresh / "node_modules").exists())

    def test_crit_alarm_spawns_strip_once_and_coalesces(self):
        (self.base / ".git").mkdir()
        crit = {"volumes": [{"mount": "/", "level": "crit"}]}
        with patch.object(disk_headroom.subprocess, "Popen") as popen:
            self.assertEqual(disk_headroom.alarm_strip(self.state, self.base, {"volumes": [{"level": "warn"}]}, now=1000.0), "no-alarm")
            self.assertEqual(disk_headroom.alarm_strip(self.state, self.base, crit, now=1000.0), "spawned")
            self.assertEqual(disk_headroom.alarm_strip(self.state, self.base, crit, now=1010.0), "coalesced")
        self.assertEqual(popen.call_count, 1)
        self.assertIn("--strip-only", popen.call_args[0][0])
        self.assertEqual(json.loads((self.state / disk_headroom.STRIP_ONLY_STAMP).read_text())["triggeredAt"], 1000.0)

    def test_headroom_levels_and_alarm_events_on_change(self):
        usage = {Path("/a"): (100, 0, 20), Path("/b"): (100, 0, 25), Path("/c"): (100, 0, 10), Path("/d"): (100, 0, 60)}
        current = disk_headroom.headroom(list(usage), usage=lambda p: usage[p])
        self.assertEqual([v["level"] for v in current["volumes"]], ["warn", "warn", "crit", "ok"])
        self.assertEqual([a["mount"] for a in current["alarms"]], ["/a", "/b", "/c"])
        disk_headroom.publish_headroom(self.state, current, self.now)
        events = (self.state / "host-alarms.jsonl").read_text().splitlines()
        self.assertEqual(len(events), 3)
        disk_headroom.publish_headroom(self.state, current, self.now + 1)
        self.assertEqual(len((self.state / "host-alarms.jsonl").read_text().splitlines()), 3)  # no repeat
        usage[Path("/c")] = (100, 0, 90)
        disk_headroom.publish_headroom(self.state, disk_headroom.headroom(list(usage), usage=lambda p: usage[p]), self.now + 2)
        self.assertEqual(len((self.state / "host-alarms.jsonl").read_text().splitlines()), 4)  # recovered
        self.assertEqual(disk_headroom.headroom([Path("/missing-volume")], usage=lambda p: (_ for _ in ()).throw(OSError()))["volumes"], [])

    def test_volumes_lists_root_srv_mounts_and_state_volume(self):
        found = disk_headroom.volumes(self.home, self.state, mounts=[Path("/srv/worktrees")])
        self.assertIn(Path("/"), found)
        self.assertIn(Path("/srv/worktrees"), found)

    def test_daily_report_names_top_growers_and_runs_once_a_day(self):
        grow = self.base / "grow"
        grow.mkdir()
        (grow / "blob").write_bytes(b"x" * 4096)
        self.assertEqual(disk_headroom.daily_report(self.home, self.state, self.now, targets=[grow]), "written")
        (grow / "blob2").write_bytes(b"x" * 8 * 2**20)
        self.assertEqual(disk_headroom.daily_report(self.home, self.state, self.now + 60, targets=[grow]), "not-due")
        self.assertEqual(disk_headroom.daily_report(self.home, self.state, self.now + DAY + 1, targets=[grow]), "written")
        report = json.loads((self.state / "disk-report.json").read_text())
        self.assertEqual(report["topGrowers"][0]["path"], str(grow))
        self.assertGreater(report["topGrowers"][0]["deltaGiB"], 0)
        self.assertTrue(report["volumes"])

    def test_report_targets_only_lists_existing_paths(self):
        (self.state / "runs").mkdir()
        self.assertIn(self.state / "runs", disk_headroom.report_targets(self.home, self.state))


if __name__ == "__main__":
    unittest.main()
