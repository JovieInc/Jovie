"""Canonical Win insertion/replacement rejection and explicit pending evidence."""
import unittest

from . import test_pr_events_repair_evidence as evidence

events = evidence.events


class WinPolicyTests(unittest.TestCase):
    PR = evidence.RedBeforeGreenEvidenceTests.PR
    WIN = evidence.RedBeforeGreenEvidenceTests.WIN

    def test_new_win_is_validated_by_canonical_policy_before_publication(self):
        body = events.red_before_green_block(self.PR)
        invalid = (
            "## Win\n\nnone\n",
            "## Win\n\n- Claim: incomplete measurement\n",
            self.WIN.replace("| 1 | 0 |", "| unknown | 0 |"),
            self.WIN.replace("| 1 | 0 |", "| 1 | ? |"),
            self.WIN.replace("- Area: quality", "- Area: invented"),
        )
        for win in invalid:
            with self.subTest(win=win), self.assertRaisesRegex(ValueError, r"^measured win policy: "):
                events.repair_evidence_body(self.PR, body, win_section=win)
            with self.subTest(replacement=win), self.assertRaisesRegex(ValueError, r"^measured win policy: "):
                events.repair_evidence_body(self.PR, body + "\n" + self.WIN,
                                            win_section=win, previous_win_section=self.WIN)

    def test_pending_win_uses_the_canonical_pending_measurement_contract(self):
        win = self.WIN.replace("| 1 | 0 |", "| 1 | ? |") + "- Pending: yes\n"
        body = events.repair_evidence_body(self.PR, "Summary", win_section=win)
        self.assertTrue(body.endswith(win))

