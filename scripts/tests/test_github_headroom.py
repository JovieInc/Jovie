"""GitHub headroom block: cached, background refresh, never blocks or fails the feed."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import github_headroom as gh  # noqa: E402

GOOD = {"schema": gh.SCHEMA, "generatedAt": "2026-10-25T09:00:00.000Z",
        "windows": [{"bucket": "github-token", "windowStart": "2026-10-25T09:00:00.000Z", "limit": 5000,
                     "samples": 12, "minRemaining": 0, "medianRemaining": 389,
                     "exhaustedSamples": 3, "emptyShare": 0.25}]}


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        self.spawned = []

    def spawn(self, *args, **kwargs):
        self.spawned.append(args[0])

    def write(self, value, mtime):
        path = self.state / gh.CACHE_FILE
        path.write_text(json.dumps(value))
        os.utime(path, (mtime, mtime))

    def test_fresh_cache_is_returned_without_a_refresh(self):
        self.write(GOOD, 1000)
        self.assertEqual(gh.read_block(self.state, ROOT, now=1000 + gh.REFRESH_AFTER_S - 1, spawn=self.spawn), GOOD)
        self.assertEqual(self.spawned, [])

    def test_missing_cache_returns_none_and_starts_exactly_one_refresh(self):
        self.assertIsNone(gh.read_block(self.state, ROOT, now=5000, spawn=self.spawn))
        self.assertEqual(len(self.spawned), 1)
        self.assertIn("refresh", self.spawned[0])
        # the lock holds a second doctor tick off while the first refresh runs
        self.assertIsNone(gh.read_block(self.state, ROOT, now=5001, spawn=self.spawn))
        self.assertEqual(len(self.spawned), 1)

    def test_stale_cache_is_still_returned_while_it_refreshes(self):
        self.write(GOOD, 1000)
        self.assertEqual(gh.read_block(self.state, ROOT, now=1000 + gh.REFRESH_AFTER_S + 1, spawn=self.spawn), GOOD)
        self.assertEqual(len(self.spawned), 1)

    def test_a_stale_lock_expires(self):
        (self.state / gh.LOCK_FILE).write_text("1")
        os.utime(self.state / gh.LOCK_FILE, (1000, 1000))
        gh.read_block(self.state, ROOT, now=1000 + gh.LOCK_TTL_S + 1, spawn=self.spawn)
        self.assertEqual(len(self.spawned), 1)

    def test_junk_cache_is_ignored_not_trusted(self):
        (self.state / gh.CACHE_FILE).write_text(json.dumps({"schema": "other/v1", "windows": []}))
        self.assertIsNone(gh.read_block(self.state, ROOT, now=9999, spawn=self.spawn))

    def test_a_spawn_failure_never_raises(self):
        def boom(*a, **k):
            raise OSError("no node")
        self.assertIsNone(gh.read_block(self.state, ROOT, now=5000, spawn=boom))


class Refresh(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def run_with(self, stdout="", code=0, error=None):
        calls = []

        def run(cmd, **kwargs):
            calls.append((cmd, kwargs))
            if error:
                raise error
            return SimpleNamespace(returncode=code, stdout=stdout, stderr="")
        return run, calls

    def test_a_valid_report_replaces_the_cache_atomically_and_releases_the_lock(self):
        (self.state / gh.LOCK_FILE).write_text("1")
        run, calls = self.run_with(json.dumps(GOOD))
        self.assertTrue(gh.refresh(self.state, ROOT, run=run))
        self.assertEqual(json.loads((self.state / gh.CACHE_FILE).read_text()), GOOD)
        self.assertFalse((self.state / gh.LOCK_FILE).exists())
        self.assertFalse((self.state / (gh.CACHE_FILE + ".tmp")).exists())
        cmd = calls[0][0]
        self.assertEqual(cmd[0], "node")
        self.assertTrue(cmd[1].endswith("scripts/lib/api-quota-report.mjs"))
        self.assertEqual(cmd[2:4], ["headroom", "--hours"])
        self.assertIn("--json", cmd)
        self.assertIn(str(gh.MAX_SAMPLES), cmd)

    def test_failures_keep_the_previous_report(self):
        (self.state / gh.CACHE_FILE).write_text(json.dumps(GOOD))
        for stdout, code, error in [
            ("not json", 0, None), (json.dumps({"schema": "other/v1", "windows": []}), 0, None),
            (json.dumps(GOOD), 1, None), ("", 0, subprocess.TimeoutExpired("node", 1)), ("", 0, OSError("x")),
        ]:
            run, _ = self.run_with(stdout, code, error)
            self.assertFalse(gh.refresh(self.state, ROOT, run=run))
            self.assertEqual(json.loads((self.state / gh.CACHE_FILE).read_text()), GOOD)


if __name__ == "__main__":
    unittest.main()
