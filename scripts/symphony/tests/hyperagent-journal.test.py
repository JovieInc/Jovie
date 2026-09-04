#!/usr/bin/env python3
import importlib.util
import pathlib
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/hyperagent/lifecycle.py"
SPEC = importlib.util.spec_from_file_location("hyperagent_lifecycle_journal", SOURCE)
lifecycle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lifecycle)


class HyperagentJournalTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)
        self.envelope = {
            "schema": lifecycle.SCHEMA,
            "provider": "hyperagent",
            "route_selected": True,
            "authenticated": True,
            "oauth_scopes": ["threads:read", "threads:write", "approvals:write"],
            "account_alias": "workspace-a",
            "expected_account_alias": "workspace-a",
            "workspace_id": "workspace-id-a",
            "agent_id": "agent-a",
            "agent_name": "Developer",
            "agent_mode": "auto",
            "model_id": "live-cheapest-capable",
            "model_price_usd": 0.5,
            "runtime": "hyperagent-sandbox",
            "runtime_compatible": True,
            "turn_timeout_seconds": 900,
            "tools": ["code"],
            "integrations": [],
            "delegation_allowlist": [],
            "invocation_surface": "mcp",
            "idempotency_key": "job-1",
            "request_sha256": "a" * 64,
            "useful_outcome": "one verified local artifact",
            "destination": "github-draft",
            "expected_destination": "github-draft",
            "balance_usd": 20.0,
            "per_query_cap_usd": 1.0,
            "period_cap_usd": 10.0,
            "period_spend_usd": 2.0,
            "auto_recharge_enabled": False,
            "paying_org": "workspace-a",
            "expected_paying_org": "workspace-a",
            "credits_expire_at": (self.now + timedelta(days=30)).isoformat(),
            "balance_checked_at": (self.now - timedelta(minutes=1)).isoformat(),
            "model_checked_at": (self.now - timedelta(minutes=1)).isoformat(),
        }

    def observation(self, **updates):
        value = {
            "schema": lifecycle.SCHEMA,
            "observed_at": self.now.isoformat(),
            "thread_id": "thread-1",
            "idempotency_key": "job-1",
            "is_running": True,
        }
        value.update(updates)
        return value

    def approval(self):
        return {
            "kind": "approval",
            "id": "approval-1",
            "state": "pending",
            "fingerprint": "action-1",
            "account_alias": "workspace-a",
            "destination": "github-draft",
            "per_query_cap_usd": 1.0,
            "resolution_surface": "mcp",
        }

    def authority(self, **updates):
        value = {
            "thread_id": "thread-1",
            "idempotency_key": "job-1",
            "user_authorized": True,
            "fingerprint": "action-1",
            "account_alias": "workspace-a",
            "destination": "github-draft",
            "per_query_cap_usd": 1.0,
        }
        value.update(updates)
        return value

    def journal(self, directory):
        journal = lifecycle.LifecycleJournal(pathlib.Path(directory) / "journal.json")
        journal.register_dispatch(self.envelope, "thread-1", self.now)
        return journal

    def test_workflow_routes_hyperagent_through_the_guarded_adapter(self):
        workflow = (ROOT / "scripts/symphony/WORKFLOW.md").read_text()
        self.assertIn("scripts/symphony/hyperagent/lifecycle.py preflight", workflow)
        self.assertIn("Never infer an approval from prose", workflow)
        self.assertIn("never a parallel queue", workflow)
        self.assertIn("reserve_action_once", workflow)

    def test_dispatch_is_idempotent_and_cross_process_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            first = lifecycle.LifecycleJournal(path)
            stale = lifecycle.LifecycleJournal(path)
            self.assertTrue(first.register_dispatch(self.envelope, "thread-1", self.now)["recorded"])
            self.assertTrue(first.register_dispatch(self.envelope, "thread-1", self.now)["duplicate"])
            with self.assertRaises(lifecycle.LifecycleError):
                stale.register_dispatch(
                    {**self.envelope, "idempotency_key": "job-2"}, "thread-2", self.now
                )
            with self.assertRaises(lifecycle.LifecycleError):
                first.register_dispatch(
                    {**self.envelope, "request_sha256": "b" * 64}, "thread-2", self.now
                )
            for envelope, thread_id in (
                ({**self.envelope, "route_selected": False}, "thread-2"),
                ({**self.envelope, "idempotency_key": "job-2"}, ""),
            ):
                with self.assertRaises(lifecycle.LifecycleError):
                    first.register_dispatch(envelope, thread_id, self.now)
            self.assertEqual(len(lifecycle.LifecycleJournal(path).data["jobs"]), 1)

    def test_observations_are_monotonic_identity_bound_and_terminal(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            running = self.observation()
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe("missing", 0, running, self.now)
            self.assertTrue(journal.observe("job-1", 0, running, self.now)["recorded"])
            self.assertTrue(journal.observe("job-1", 0, running, self.now)["duplicate"])
            for revision, observation in (
                (-1, running),
                (0, self.observation(last_message="changed")),
                (1, self.observation(thread_id="other")),
            ):
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.observe("job-1", revision, observation, self.now)
            success = self.observation(
                is_running=False,
                terminal_state="completed",
                useful_outcome_verified=True,
                final_output_sha256="d" * 64,
                usage_receipt_sha256="e" * 64,
                route_receipt_sha256="f" * 64,
                destination_receipt_sha256="1" * 64,
                cost_usd=0.5,
            )
            self.assertEqual(
                journal.observe("job-1", 1, success, self.now)["classification"]["state"],
                "useful_success",
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe("job-1", 2, running, self.now)

    def test_action_requires_one_reservation_and_one_matching_result(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            journal = self.journal(directory)
            journal.observe("job-1", 0, self.observation(interaction=self.approval()), self.now)
            reserved = journal.reserve_action_once(
                "job-1", self.authority(), ["approvals:write"]
            )
            self.assertTrue(reserved["execute"])
            self.assertFalse(
                lifecycle.LifecycleJournal(path).reserve_action_once(
                    "job-1", self.authority(), ["approvals:write"]
                )["execute"]
            )
            receipt = "f" * 64
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", "approval-1", "short")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("missing", "approval-1", "f" * 64)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", "missing", "f" * 64)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result(
                    "job-1", "approval-1", "f" * 64, "provider_absence"
                )
            self.assertTrue(
                journal.record_action_result("job-1", "approval-1", receipt)["recorded"]
            )
            self.assertTrue(
                journal.record_action_result("job-1", "approval-1", receipt)["duplicate"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", "approval-1", "e" * 64)

    def test_reconciliation_and_retry_are_bounded_and_outcome_gated(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            journal.observe("job-1", 0, self.observation(transport_lost=True), self.now)
            reserved = journal.reserve_action_once("job-1")
            action_id = reserved["reservation"]["id"]
            self.assertTrue(reserved["execute"])
            self.assertFalse(journal.reserve_action_once("job-1")["execute"])
            journal.observe(
                "job-1", 1, self.observation(is_running=False, terminal_state="completed"),
                self.now,
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_action_once("job-1")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", action_id, "f" * 64, "UNKNOWN")
            journal.record_action_result("job-1", action_id, "f" * 64, "provider_absence")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.authorize_retry_once("job-1", "provider_absence")

            retry_journal = self.journal(pathlib.Path(directory) / "retry")
            retry_journal.observe(
                "job-1", 0, self.observation(transport_lost=True), self.now
            )
            retry_reservation = retry_journal.reserve_action_once("job-1")["reservation"]
            retry_journal.record_action_result(
                "job-1", retry_reservation["id"], "f" * 64, "provider_absence"
            )
            with self.assertRaises(lifecycle.LifecycleError):
                retry_journal.authorize_retry_once(
                    "job-1", "documented_idempotent_replay"
                )
            self.assertEqual(
                retry_journal.authorize_retry_once("job-1", "provider_absence")["attempt"],
                1,
            )
            with self.assertRaises(lifecycle.LifecycleError):
                retry_journal.authorize_retry_once("job-1", "provider_absence")
            with self.assertRaises(lifecycle.LifecycleError):
                retry_journal.authorize_retry_once("missing", "provider_absence")

    def test_corrupt_journal_and_nonretryable_failure_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            path.write_text("not-json")
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(path)
            path.write_text("{}")
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(path)
            path.unlink()
            journal = self.journal(directory)
            journal.observe("job-1", 0, self.observation(provider_error=401), self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_action_once("job-1")


if __name__ == "__main__":
    unittest.main()
