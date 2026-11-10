"""Publication regressions for canonical measured-Win validation."""
import unittest
from types import SimpleNamespace
from scripts.tests import test_pr_events_repair_evidence as fixtures


events = fixtures.events


class MeasuredWinPolicyTests(unittest.TestCase):
    PR = fixtures.RedBeforeGreenEvidenceTests.PR
    WIN = fixtures.RedBeforeGreenEvidenceTests.WIN

    def test_incomplete_measured_win_is_rejected_by_canonical_policy(self):
        for invalid in (
            "## Win\n\nnone\n",
            "## Win\n\n- Claim: Incomplete measured evidence.\n",
            self.WIN.replace("| 1 | 0 |", "| unknown | 0 |"),
            self.WIN.replace("- Area: quality", "- Area: unsupported"),
            self.WIN.replace("- Verify: https://github.com/JovieInc/Jovie/actions/runs/123\n", ""),
        ):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "measured win policy"):
                events.repair_evidence_body(self.PR, "Summary", win_section=invalid)

    def test_invalid_measured_win_never_reaches_publication(self):
        writes = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="Summary")
            writes.append(args)
            return SimpleNamespace(returncode=0, stdout="")

        with self.assertRaisesRegex(ValueError, "measured win policy"):
            events.ensure_red_before_green(self.PR, sh=shell, win_section="## Win\n\nnone\n")
        self.assertEqual(writes, [])

