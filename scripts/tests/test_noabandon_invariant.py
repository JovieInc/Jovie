"""Invariant scenarios: what counts as abandoned, who hears about it, and when it may close."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from noabandon import invariant as I  # noqa: E402
from noabandon import ledger as L  # noqa: E402

NOW = 1_795_110_000.0
H = 3600


class Abandoned(unittest.TestCase):
    def test_expired_lease_fails_loud_to_owning_agent_not_tim(self):
        lease = L.grant(None, lane="codex", worker_id="w", head="h", now=NOW - 3 * H, next_kind="ci_result",
                        item="JOV-1", pr=1)
        out = I.check_item({"item": "JOV-1", "pr": 1, "state": "open", "lease": lease}, NOW)
        self.assertEqual(out["owner"], "jovie-owner")
        self.assertEqual(out["fingerprint"], "abandon:JOV-1")
        self.assertNotIn("tim", out["owner"])

    def test_lyb_item_goes_to_lyb_owner(self):
        self.assertEqual(I.check_item({"item": "LYB-9", "state": "open"}, NOW)["owner"], "lyb-owner")

    def test_owner_reserved_wait_is_quiet(self):
        self.assertIsNone(I.check_item({"item": "JOV-12910", "state": "open", "owner_card_at": NOW - H}, NOW))

    def test_abandon_issue_does_not_flap_closed_on_a_blip(self):
        lease = L.grant(None, lane="lanes", worker_id="w", head="h", now=NOW, next_kind="ci_result",
                        item="JOV-1", pr=1)
        self.assertFalse(I.may_close_abandon({"state": "open", "lease": lease, "progress_since_open": False}, NOW))
        self.assertTrue(I.may_close_abandon({"state": "open", "lease": lease, "progress_since_open": True}, NOW))
        self.assertTrue(I.may_close_abandon({"state": "verified"}, NOW))



class ProgressAtUnknown(unittest.TestCase):
    """JOV-13158: a missing/None/non-numeric progress_at is UNKNOWN, never epoch 0."""

    def test_prless_in_progress_without_progress_at_stays_with_assignee(self):
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "In Progress"}, None, NOW))
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "In Progress",
                                              "progress_at": None}, None, NOW))
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "Merging"}, None, NOW))

    def test_prless_validating_without_progress_at_is_not_rework(self):
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "Validating"}, None, NOW))

    def test_non_numeric_progress_at_never_raises(self):
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "In Progress",
                                              "progress_at": "n/a"}, None, NOW))

    def test_started_at_is_the_fallback_timestamp(self):
        recent = {"id": "JOV-1", "state": "In Progress", "startedAt": NOW - H}
        self.assertIsNone(I.reconcile_linear(recent, None, NOW))  # not stale on the fallback
        ancient = {"id": "JOV-8470", "state": "In Progress", "startedAt": NOW - 711 * H}
        out = I.reconcile_linear(ancient, None, NOW)              # genuinely stale on the fallback
        self.assertEqual(out["to"], "Todo")
        self.assertTrue(out["clear_assignee"])

    def test_explicit_progress_at_still_governs(self):
        stale = {"id": "JOV-8470", "state": "In Progress", "progress_at": NOW - 711 * H,
                 "startedAt": NOW - H}
        self.assertEqual(I.reconcile_linear(stale, None, NOW)["to"], "Todo")
        fresh = {"id": "JOV-1", "state": "In Progress", "progress_at": NOW - H,
                 "startedAt": NOW - 711 * H}
        self.assertIsNone(I.reconcile_linear(fresh, None, NOW))


class LinearReconcile(unittest.TestCase):
    def test_merged_and_green_is_done_with_receipt(self):
        out = I.reconcile_linear({"id": "JOV-1", "state": "Validating", "progress_at": NOW - 900 * H},
                                 {"state": "merged", "merge_sha": "abc", "main_ci": "success"}, NOW)
        self.assertEqual(out["to"], "Done")
        self.assertEqual(out["receipt"]["merge_sha"], "abc")

    def test_merged_but_main_red_is_rework_not_done(self):
        out = I.reconcile_linear({"id": "JOV-1", "state": "Validating", "progress_at": NOW},
                                 {"state": "merged", "merge_sha": "abc", "main_ci": "failure"}, NOW)
        self.assertEqual(out["to"], "Rework")

    def test_stale_in_progress_without_pr_releases_the_claim(self):
        out = I.reconcile_linear({"id": "JOV-8470", "state": "In Progress", "progress_at": NOW - 711 * H}, None, NOW)
        self.assertEqual(out["to"], "Todo")
        self.assertTrue(out["clear_assignee"])

    def test_recent_in_progress_is_left_alone(self):
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "In Progress", "progress_at": NOW - H}, None, NOW))

    def test_open_pr_is_owned_by_the_pr_lease(self):
        self.assertIsNone(I.reconcile_linear({"id": "JOV-1", "state": "In Progress", "progress_at": 0},
                                             {"state": "open"}, NOW))

    def test_verify_receipt(self):
        self.assertEqual(I.verify("abc", "success", 1, "JOV-1")["next"], "Done")
        self.assertIn("main-red", I.verify("abc", "failure", 1, "JOV-1")["next"])


if __name__ == "__main__":
    unittest.main()
