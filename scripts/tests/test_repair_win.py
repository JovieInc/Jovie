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


class CompanyGuardPinWinTests(unittest.TestCase):
    BEFORE = 'a' * 40
    AFTER = 'b' * 40
    OLD = {"schema": "company-guards/v1", "guards": [
        {"id": "size-500", "mode": "ratchet"},
        {"id": "trial", "mode": "shadow"},
    ]}
    NEW = {"schema": "company-guards/v1", "guards": [
        {"id": "size-500", "mode": "ratchet"},
        {"id": "trial", "mode": "shadow"},
        {"id": "tracker-registry", "mode": "ratchet"},
    ]}

    def test_pinned_registry_measurement_repairs_fleet_body_idempotently(self):
        win = events.repair_win.company_guard_pin_win(self.BEFORE, self.AFTER, self.OLD, self.NEW)
        self.assertIn('| count | higher | 1 | 2 |', win)
        self.assertIn(f'{self.BEFORE}...{self.AFTER}', win)
        updated = events.repair_evidence_body(
            MeasuredWinPolicyTests.PR, 'Summary', win_section=win,
            customer_decision={"releaseWorthy": False})
        self.assertEqual(updated.count('## Win'), 1)
        self.assertEqual(updated.count('customer-changelog/v1'), 1)
        self.assertEqual(events.repair_evidence_body({}, updated, win_section=win), updated)

    def test_missing_ambiguous_or_non_improving_evidence_cannot_invent_a_win(self):
        for before_pin, after_pin, before, after in (
            ('main', self.AFTER, self.OLD, self.NEW),
            (self.BEFORE, 'b' * 8, self.OLD, self.NEW),
            (self.BEFORE, self.BEFORE, self.OLD, self.NEW),
            (self.BEFORE, self.AFTER, {}, self.NEW),
            (self.BEFORE, self.AFTER, self.OLD, self.OLD),
            (self.BEFORE, self.AFTER, self.NEW, self.OLD),
            (self.BEFORE, self.AFTER, self.OLD, {**self.NEW, 'guards': self.NEW['guards'] * 2}),
            (self.BEFORE, self.AFTER, self.OLD, {'schema': 'company-guards/v1', 'guards': [
                {'id': 'unknown', 'mode': 'pass'}]}),
        ):
            with self.subTest(after=after), self.assertRaises(ValueError):
                events.repair_win.company_guard_pin_win(before_pin, after_pin, before, after)
