#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import hashlib
import importlib.util
import pathlib
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-ops-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_ops_hud", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"could not load {SOURCE}")
HUD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HUD
SPEC.loader.exec_module(HUD)


def fixture_state():
    stamp = "2026-08-16T12:00:00Z"
    return {
        "symphony": {
            "updated": stamp,
            "error": None,
            "workers": {"runner_listeners": 4, "runner_jobs": 1, "symphony_jobs": 1},
            "counts": {"implementing": 1, "retrying": 2, "queued": 3, "blocked": 0},
            "reason_buckets": {
                "capacity": 1, "timeout": 1, "launcher_failure": 0,
                "ci_check_failure": 0, "merge_queue_wait": 0,
                "ownership_input": 0, "other": 0,
            },
            "slots": {"total": 4, "available": 0},
            "next_retry": "2026-08-16T12:01:00Z",
            "jobs": [],
            "blockers": [],
        },
        "delivery": {
            "updated": stamp,
            "error": None,
            "main_sha": "a" * 40,
            "prod_sha": "a" * 40,
            "exact": True,
            "deploy_status": "healthy",
            "prs": {"total": 4, "draft": 1, "ready": 3, "queued": 1},
            "queue": [],
            "runs": [],
            "merged_recent": 7,
            "production_completions": 2,
            "latency": {"ci": {"sample": 4, "typical_seconds": 240, "slow_tail_seconds": 420}},
        },
    }


class VersionedHudContractTests(unittest.TestCase):
    def test_seed_is_byte_identical_to_the_observed_ubuntu_renderer(self):
        self.assertEqual(
            hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "13827761718cd891f5eb4378d1c863fd61ad5f19332565dd36cd88d083746dfd",
        )

    def test_fixture_renders_fixed_width_operational_sections(self):
        moment = dt.datetime(2026, 8, 16, 12, 0, 30, tzinfo=dt.timezone.utc)
        with (
            mock.patch.object(HUD, "now", return_value=moment),
            mock.patch.dict(HUD.os.environ, {"HUD_COLOR": "never"}),
        ):
            output = HUD.render(fixture_state())

        lines = output.rstrip("\n").splitlines()
        self.assertTrue(lines)
        self.assertTrue(all(len(line) == HUD.GRID_WIDTH for line in lines))
        for title in (
            "GEM OPERATIONS", "[ SYMPHONY ]", "[ WAIT REASONS ]",
            "[ DELIVERY FUNNEL ]", "[ CYCLE TIME ]", "[ DETAILS / NEXT ACTION ]",
        ):
            self.assertIn(title, output)


if __name__ == "__main__":
    unittest.main()
