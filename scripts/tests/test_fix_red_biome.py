"""Biome format class: cite the file, outrank platform noise, ignore paths outside the tree."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_biome  # noqa: E402
import fix_red_classes as classes  # noqa: E402


def pr(*names):
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": name, "conclusion": "FAILURE"} for name in names]}


class BiomeFormatTest(unittest.TestCase):
    def test_parses_each_machine_citation_even_when_summary_messages_are_truncated(self):
        paths = ["scripts/example.mjs", "apps/web/app/api/internal/ovie/component-certificate-evidence/route.ts"]
        log = "##[error]File content differs from formatting output\n##[error]Diagnostics: | " + " | ".join(
            f"::error title=format,file=/home/runner/work/Jovie/Jovie/{path},line=1::File content differs from formatting…"
            for path in paths)
        self.assertEqual(fix_red_biome.cited_paths(log), paths)

    def test_parses_ci_reporter_and_gh_log_prefix_without_guessing_absolute_roots(self):
        rel = "apps/web/app/[username]/page.tsx"
        prefix = "Source Validation\tUNKNOWN STEP\t2026-11-16T13:00:00.000Z "
        for title, message in [
            ("format", "File content differs from formatting output"),
            ("assist/source/organizeImports", "Some imports or exports are not organized."),
        ]:
            with self.subTest(title=title):
                log = prefix + (
                    f"##[error]Diagnostics: | ::error title={title},"
                    f"file=/home/runner/work/Jovie/Jovie/{rel},line=1::{message}\n")
                got = classes.classify(pr("Source Validation"), {"Source Validation": log})
                self.assertEqual((got["action"], got["files"]), ("biome-format", [rel]))
        terminal = prefix + f"{rel} format ━━━━━\nFormatter would have printed the following content:\n"
        self.assertEqual(fix_red_biome.cited_paths(terminal), [rel])
        for path in ["/untrusted/root/scripts/example.mjs", "../scripts/example.mjs"]:
            log = f"::error title=format,file={path},line=1::File content differs from formatting output\n"
            self.assertEqual(fix_red_biome.cited_paths(log), [])

    def test_composes_biome_with_body_repairs_and_dispatches_the_owning_fixer(self):
        import lane_runner as lane
        from fix_red_compose import deterministic_fixer

        logs = {
            "Source Validation": (
                ".github/scripts/run-actionlint.test.mjs format ━━━━━━━━━━\n"
                "Formatter would have printed the following content:\n"),
            "PR Fleet Rules": "Error: Customer outcome decision missing or invalid (missing-metadata).",
        }
        got = classes.classify(pr(*logs), logs)
        self.assertEqual((got["cls"], got["action"]), ("composed", "compose"))
        self.assertEqual(got["actions"], ["stamp-changelog", "biome-format"])
        self.assertEqual(got["files"], [".github/scripts/run-actionlint.test.mjs"])
        receipt = {}
        with patch.object(lane.pr_events, "ensure_red_before_green", return_value=True) as stamp, \
                patch.object(lane, "biome_format_fix", return_value=SimpleNamespace(returncode=0)) as biome:
            self.assertIs(deterministic_fixer(lane, classes.BIOME_FORMAT), biome)
            done = lane.compose_deterministic_fix(None, {}, got, Path("."), None, receipt)
        self.assertEqual(done.returncode, 0)
        stamp.assert_called_once()
        biome.assert_called_once_with(None, {}, got, Path("."), None, receipt)
        self.assertEqual(receipt["composedActions"], ["stamp-changelog", "biome-format"])

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
