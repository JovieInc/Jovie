#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import pathlib
import re
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/hermes/gem-checkin-hud.py"
SPEC = importlib.util.spec_from_file_location("gem_checkin_hud", SOURCE)
HUD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HUD
SPEC.loader.exec_module(HUD)
NOW = dt.datetime(2026, 8, 31, 12, 0, tzinfo=dt.timezone.utc)
BANNED = ("GEM OPERATIONS", "FLEET POLICY", "ALIVE", "WOW", "SHIPS", "$0", "FAIL 0")
GREEN = re.compile(r"\033\[(?:1;)?(?:32|92)m|\033\[38;5;(?:2|10|22|28|34|40|46|76|82|112|118)m")
TOKEN_COUNT = re.compile(r"token[s]?\s*[:=]\s*\d+", re.I)


def strip(text: str) -> str:
    return re.sub(r"\033\[[0-9;]*m", "", text)


def paint(symphony=None, mq=None, review=None):
    return HUD.render(
        symphony=symphony or {"ok": True, "count": 0, "cap": 3, "rows": []},
        mq=mq or {"ok": True, "count": 0, "rows": []},
        review=review,
        now=NOW,
    )


class BuildkiteListTests(unittest.TestCase):
    def test_unknown_is_dash_never_fakes_zero_or_banned_tiles(self):
        output = paint({"ok": False, "count": None, "cap": None, "rows": []}, {"ok": False, "count": None, "rows": []}, None)
        plain = strip(output)
        for banned in BANNED:
            self.assertNotIn(banned, plain)
        self.assertNotIn("$0", output)
        self.assertIsNone(TOKEN_COUNT.search(plain))
        self.assertIsNone(GREEN.search(output))
        self.assertIn("RUN -/-", plain)
        self.assertIn("MQ -", plain)
        self.assertIn("Review -", plain)
        self.assertNotIn("FAIL 0", plain)
        self.assertIn("● Running", plain)
        self.assertIn("○ Review", plain)
        self.assertIn("○ MQ", plain)

    def test_omits_zero_buckets_and_never_prints_fail_zero(self):
        plain = strip(paint({"ok": True, "count": 0, "cap": 3, "rows": []}, {"ok": True, "count": 0, "rows": []}, 0))
        self.assertNotIn("RUN ", plain)
        self.assertNotIn("MQ 0", plain)
        self.assertNotIn("Review 0", plain)
        self.assertNotIn("FAIL 0", plain)
        self.assertIn("JOVIE", plain)
        self.assertIn("main", plain)

    def test_running_then_mq_then_collapsed_review(self):
        started = "2026-08-31T11:57:00Z"
        output = paint(
            {
                "ok": True,
                "count": 1,
                "cap": 3,
                "rows": [{"id": "JOV-5491", "title": "Add Ovi quick launchers", "started": started, "owner": "meetjovie"}],
            },
            {
                "ok": True,
                "count": 2,
                "rows": [
                    {"number": 16796, "title": "check-in HUD + burrito", "enqueued": started, "position": 5},
                    {"number": 16734, "title": "retire linear-app tokens", "enqueued": "2026-08-31T11:52:00Z", "position": 6},
                ],
            },
            11,
        )
        plain = strip(output)
        self.assertIn("JOV-5491 Add Ovi quick launchers", plain)
        self.assertIn("symphony · 1/3 · meetjovie", plain)
        self.assertIn("MQ #16796 check-in HUD + burrito", plain)
        self.assertIn("github · main · pos 5", plain)
        self.assertIn("Review 11", plain)
        self.assertLess(plain.index("JOV-5491"), plain.index("MQ #16796"))
        self.assertLess(plain.index("MQ #16734"), plain.index("Review 11"))
        self.assertIn("RUN 1/3", plain)
        self.assertIn("MQ 2", plain)
        self.assertIn("3m", plain)
        source = SOURCE.read_text(encoding="utf-8")
        for banned in ("GEM OPERATIONS", "FLEET POLICY", "ALIVE", "WOW"):
            self.assertNotIn(banned, source)
        self.assertNotIn("$0", source)
        self.assertIsNone(GREEN.search(source))
        self.assertNotIn("lin_", source)

    def test_reads_official_state_and_skips_token_counts(self):
        fake = mock.Mock()
        fake.read.return_value = json.dumps(
            {
                "counts": {"running": 1, "retrying": 0, "max_concurrent": 3},
                "jobs": [{"identifier": "JOV-5491", "title": "Add Ovi quick launchers", "status": "running", "started_at": "2026-08-31T11:57:00Z", "owner": "meetjovie"}],
            }
        ).encode()
        fake.__enter__ = mock.Mock(return_value=fake)
        fake.__exit__ = mock.Mock(return_value=False)
        with mock.patch.object(HUD.urllib.request, "urlopen", return_value=fake) as opener:
            state = HUD.fetch_symphony("http://127.0.0.1:4043/api/v1/state")
        self.assertEqual(state["count"], 1)
        self.assertEqual(state["rows"][0]["id"], "JOV-5491")
        self.assertIn("4043", opener.call_args.args[0])
        self.assertNotIn("token", json.dumps(state).lower())


if __name__ == "__main__":
    unittest.main()
