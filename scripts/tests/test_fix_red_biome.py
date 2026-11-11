"""Biome format class: cite the file, outrank platform noise, ignore paths outside the tree."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_biome  # noqa: E402
import fix_red_classes as classes  # noqa: E402


def pr(*names):
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": name, "conclusion": "FAILURE"} for name in names]}


class BiomeFormatTest(unittest.TestCase):
    def test_cites_the_file_and_outranks_platform_noise(self):
        log = (
            "2026-11-10T18:31:24.1112294Z .github/scripts/run-actionlint.test.mjs:1:1 "
            "assist/source/organizeImports  FIXABLE\n"
            "2026-11-10T18:31:24.1112294Z   × Sort these imports.\n"
            "2026-11-10T18:31:24.1133546Z .github/scripts/run-actionlint.test.mjs format ━━━━━━━━━━\n"
            "2026-11-10T18:31:24.1133546Z   × Formatter would have printed the following content:\n"
            "passing fixture: API rate limit exceeded\n"
        )
        got = classes.classify(pr("Source Validation"), {"Source Validation": log})
        self.assertEqual((got["cls"], got["action"]), ("biome-format", "biome-format"))
        self.assertEqual(got["files"], [".github/scripts/run-actionlint.test.mjs"])
        self.assertIn(got["action"], classes.DETERMINISTIC)
        self.assertEqual(fix_red_biome.cited_paths("Sort these imports.\n"), [])
        self.assertIsNone(fix_red_biome.format_commit_push(
            lambda *args, **kwargs: None, {"headRefName": "x"}, Path("/tmp"), None, {},
            ["../etc/passwd", "/etc/passwd"]))


if __name__ == "__main__":
    unittest.main()
