"""Clock-pin merge: a head noon pin and main's lane.time wrap resolve together."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_statement_merge as statements  # noqa: E402


class DuplicateClockPinTest(unittest.TestCase):
    """Head pins time.time to a UTC noon; main wraps lane.time and still samples the clock."""

    BASE = (
        "class T:\n"
        "    def test_router_end_to_end_logs_its_rationale(self):\n"
        "        router = build()\n"
        "        now = time.time()\n"
        "        frontier = issue()\n"
        "        self.assertIsNone(check(now))\n"
        "\n"
        "    def test_other(self):\n"
        "        self.assertTrue(True)\n"
    )
    OURS = (
        "class T:\n"
        "    # Pinned to midday UTC.\n"
        "    @patch(\"time.time\", return_value=1_794_484_800.0)  # 2026-11-12T12:00:00Z\n"
        "    def test_router_end_to_end_logs_its_rationale(self, _clock):\n"
        "        router = build()\n"
        "        now = time.time()\n"
        "        frontier = issue()\n"
        "        self.assertIsNone(check(now))\n"
        "\n"
        "    def test_other(self):\n"
        "        self.assertTrue(True)\n"
    )
    THEIRS = (
        "class T:\n"
        "    def test_router_end_to_end_logs_its_rationale(self):\n"
        "        # The router reads the wall clock.\n"
        "        now = (time.time() - 12 * 3600) // 86400 * 86400 + 12 * 3600\n"
        "        with patch.object(lane.time, \"time\", return_value=now):\n"
        "            self._router_end_to_end(now)\n"
        "\n"
        "    def _router_end_to_end(self, now: float):\n"
        "        router = build()\n"
        "        frontier = issue()\n"
        "        self.assertIsNone(check(now))\n"
        "\n"
        "    def test_other(self):\n"
        "        self.assertTrue(True)\n"
    )
    MERGED = THEIRS.replace(
        "        now = (time.time() - 12 * 3600) // 86400 * 86400 + 12 * 3600\n",
        "        now = 1_794_484_800.0  # 2026-11-12T12:00:00Z\n",
        1)

    def test_keeps_main_patch_target_and_head_noon(self):
        self.assertIsNone(statements.contained_by_main(self.BASE, self.OURS, self.THEIRS))
        self.assertEqual(
            statements.merge_duplicate_clock_pin(self.BASE, self.OURS, self.THEIRS),
            self.MERGED)

    def test_file_reader_uses_the_pin_after_contained_misses(self):
        blobs = {1: self.BASE, 2: self.OURS, 3: self.THEIRS}

        def sh(args, cwd=None):
            return SimpleNamespace(returncode=0, stdout=blobs[int(args[-1][1])])

        self.assertEqual(
            statements.contained_by_main_file(Path("."), "t.py", sh), self.MERGED)

    def test_contained_result_wins_when_main_already_holds_the_edit(self):
        text = "def test_ok(self):\n    return 1\n"

        def sh(args, cwd=None):
            return SimpleNamespace(returncode=0, stdout=text)

        self.assertEqual(statements.contained_by_main_file(Path("."), "t.py", sh), text)

    def test_missing_stage_stays_unresolved(self):
        def sh(args, cwd=None):
            return SimpleNamespace(returncode=1, stdout="")

        self.assertIsNone(statements.contained_by_main_file(Path("."), "t.py", sh))

    def test_other_shapes_stay_unresolved(self):
        afternoon = self.OURS.replace("1_794_484_800.0", "1_794_488_400.0")
        extra = self.OURS.replace(
            "self.assertIsNone(check(now))\n",
            "self.assertIsNone(check(now))\n        self.assertEqual(1, 1)\n")
        other = self.THEIRS.replace("self.assertTrue(True)\n", "self.assertTrue(False)\n")
        second = self.OURS.replace(
            "    def test_other(self):\n",
            "    @patch(\"time.time\", return_value=1_794_484_800.0)\n    def test_other(self, _clock):\n",
            1)
        marked = self.OURS.replace("class T:\n", "class T:\n<<<<<<< ours\n", 1)
        for base, ours, theirs in (
            (self.BASE, afternoon, self.THEIRS),
            (self.BASE, extra, self.THEIRS),
            (self.BASE, self.OURS, other),
            (self.BASE, second, self.THEIRS),
            (self.BASE, marked, self.THEIRS),
        ):
            with self.subTest(ours=ours[20:60]):
                self.assertIsNone(statements.merge_duplicate_clock_pin(base, ours, theirs))


if __name__ == "__main__":
    unittest.main()
