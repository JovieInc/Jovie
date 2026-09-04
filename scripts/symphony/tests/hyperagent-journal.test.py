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
            "issue_id": "JOV-6005",
            "lease_id": "lease-1",
            "expected_pr_repository": "JovieInc/Jovie",
            "required_runtime": "symphony-4041",
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

    def delivery(self, **updates):
        value = {
            "schema": lifecycle.DELIVERY_SCHEMA,
            "observed_at": self.now.isoformat(),
            "issue_id": "JOV-6005",
            "lease_id": "lease-1",
            "idempotency_key": "job-1",
            "expected_pr_repository": "JovieInc/Jovie",
            "required_runtime": "symphony-4041",
            "pr_state": "not_found",
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
                stale.register_dispatch(
                    {
                        **self.envelope, "idempotency_key": "job-2",
                        "request_sha256": "b" * 64,
                    },
                    "thread-2", self.now,
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
                "remote_useful_success",
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
            action_id = reserved["reservation"]["id"]
            self.assertTrue(reserved["execute"])
            self.assertFalse(
                lifecycle.LifecycleJournal(path).reserve_action_once(
                    "job-1", self.authority(), ["approvals:write"]
                )["execute"]
            )
            receipt = "f" * 64
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", action_id, "short")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("missing", "approval-1", "f" * 64)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", "missing", "f" * 64)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result(
                    "job-1", action_id, "f" * 64, "provider_absence"
                )
            self.assertTrue(
                journal.record_action_result("job-1", action_id, receipt)["recorded"]
            )
            self.assertTrue(
                journal.record_action_result("job-1", action_id, receipt)["duplicate"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", action_id, "e" * 64)

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
            pending = journal.reserve_action_once("job-1")
            self.assertFalse(pending["execute"])
            self.assertEqual(pending["reservation"]["id"], action_id)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result("job-1", action_id, "f" * 64, "UNKNOWN")
            outcome = {
                "issue_id": "JOV-6005", "lease_id": "lease-1",
                "remote": "absent", "pr": "not_found",
                "observed_at": self.now.isoformat(),
            }
            journal.record_action_result(
                "job-1", action_id, "f" * 64,
                outcome,
                now=self.now,
            )
            self.assertTrue(
                journal.record_action_result(
                    "job-1", action_id, "f" * 64, outcome,
                    now=self.now + timedelta(minutes=10),
                )["duplicate"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_action_once("job-1")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_retry_once("job-1", self.envelope, self.now)

            retry_journal = self.journal(pathlib.Path(directory) / "retry")
            retry_journal.observe(
                "job-1", 0, self.observation(transport_lost=True), self.now
            )
            retry_reservation = retry_journal.reserve_action_once("job-1")["reservation"]
            retry_journal.record_action_result(
                "job-1", retry_reservation["id"], "f" * 64,
                {
                    "issue_id": "JOV-6005", "lease_id": "lease-1",
                    "remote": "absent", "pr": "not_found",
                    "observed_at": self.now.isoformat(),
                },
                now=self.now,
            )
            retry = retry_journal.reserve_retry_once("job-1", self.envelope, self.now)
            self.assertTrue(retry["execute"])
            self.assertEqual(retry["attempt"]["number"], 2)
            self.assertFalse(
                retry_journal.reserve_retry_once("job-1", self.envelope, self.now)["execute"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                retry_journal.reserve_retry_once("missing", self.envelope, self.now)

    def test_corrupt_journal_and_nonretryable_failure_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            path.write_text("not-json")
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(path)
            path.write_text("{}")
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(path)
            path.write_text('{"schema":"symphony-hyperagent-journal/v1","jobs":{}}')
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(path)
            path.unlink()
            journal = self.journal(directory)
            journal.observe("job-1", 0, self.observation(provider_error=401), self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_action_once("job-1")

    def test_remote_completion_is_not_landing_and_delivery_states_are_distinct(self):
        open_pr = self.delivery(
            pr_state="open", pr_url="https://github.com/JovieInc/Jovie/pull/1",
            pr_head_sha="a" * 40,
        )
        self.assertEqual(
            lifecycle.classify_delivery_observation(self.delivery(), self.now)["state"],
            "delivery_missing",
        )
        self.assertEqual(
            lifecycle.classify_delivery_observation(open_pr, self.now)["state"], "pr_open"
        )
        merged = {**open_pr, "pr_state": "merged", "merge_sha": "b" * 40}
        self.assertEqual(
            lifecycle.classify_delivery_observation(merged, self.now)["state"],
            "merged_runtime_unverified",
        )
        exact = {
            **merged,
            "runtime": {
                "name": "symphony-4041", "sha": "b" * 40,
                "receipt_sha256": "c" * 64,
            },
        }
        self.assertEqual(
            lifecycle.classify_delivery_observation(exact, self.now)["state"],
            "landed_verified",
        )
        self.assertEqual(
            lifecycle.plan_resolution({"state": "pr_open"})["action"],
            "recover_existing_pr",
        )
        self.assertEqual(
            lifecycle.plan_resolution({"state": "merged_runtime_unverified"})["action"],
            "reconcile_required_runtime_once",
        )
        self.assertEqual(
            lifecycle.plan_resolution({"state": "landed_verified"})["action"],
            "record_terminal_receipt",
        )
        malformed = (
            ({"schema": "wrong"}, "invalid_delivery_schema"),
            ({**self.delivery(), "issue_id": ""}, "missing_delivery_identity"),
            ({**self.delivery(), "observed_at": "bad"}, "invalid_observed_at"),
            ({**self.delivery(), "observed_at": (self.now - timedelta(minutes=6)).isoformat()}, "delivery_observation_expired"),
            ({**self.delivery(), "pr_state": "UNKNOWN"}, "pr_state_unknown"),
            ({**open_pr, "pr_head_sha": "short"}, "pr_identity_unproven"),
            ({**open_pr, "pr_url": "https://github.com/Other/Repo/pull/1"}, "pr_identity_unproven"),
            ({**merged, "merge_sha": "short"}, "merge_identity_unproven"),
            ({**exact, "runtime": {**exact["runtime"], "sha": "d" * 40}}, "exact_runtime_unproven"),
        )
        for observation, reason in malformed:
            self.assertEqual(
                lifecycle.classify_delivery_observation(observation, self.now)["reason"],
                reason,
            )

    def test_delivery_identity_revision_and_terminal_evidence_are_durable(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            missing = self.delivery()
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("missing", 0, missing, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", -1, missing, self.now)
            self.assertEqual(
                journal.observe_delivery("job-1", 0, missing, self.now)["classification"]["state"],
                "delivery_missing",
            )
            self.assertTrue(journal.observe_delivery("job-1", 0, missing, self.now)["duplicate"])
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 0, {**missing, "pr_state": "open"}, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", -1, missing, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery(
                    "job-1", 1, {**missing, "lease_id": "other"}, self.now
                )
            exact = self.delivery(
                pr_state="merged", pr_url="https://github.com/JovieInc/Jovie/pull/1",
                pr_head_sha="a" * 40, merge_sha="b" * 40,
                runtime={
                    "name": "symphony-4041", "sha": "b" * 40,
                    "receipt_sha256": "c" * 64,
                },
            )
            self.assertEqual(
                journal.observe_delivery("job-1", 1, exact, self.now)["classification"]["state"],
                "landed_verified",
            )
            persisted = lifecycle.LifecycleJournal(
                pathlib.Path(directory) / "journal.json"
            ).data["jobs"]["job-1"]
            self.assertEqual(persisted["delivery"]["pr_url"], exact["pr_url"])
            self.assertEqual(persisted["delivery"]["merge_sha"], exact["merge_sha"])
            self.assertEqual(persisted["delivery"]["runtime"], exact["runtime"])
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 2, missing, self.now)

    def test_existing_pr_blocks_retry_and_closed_pr_needs_failure_owner(self):
        closed = self.delivery(pr_state="closed_unmerged")
        self.assertEqual(
            lifecycle.classify_delivery_observation(closed, self.now)["reason"],
            "failure_ownership_unproven",
        )
        owned = {
            **closed, "failure_owner": "symphony-owner",
            "failure_receipt_sha256": "d" * 64,
            "pr_url": "https://github.com/JovieInc/Jovie/pull/1",
            "pr_head_sha": "a" * 40,
        }
        self.assertEqual(
            lifecycle.classify_delivery_observation(owned, self.now)["state"],
            "delivery_failed",
        )
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            journal.observe(
                "job-1", 0,
                self.observation(is_running=False, terminal_state="failed"), self.now,
            )
            reserved = journal.reserve_action_once("job-1")["reservation"]
            journal.record_action_result(
                "job-1", reserved["id"], "e" * 64,
                {
                    "issue_id": "JOV-6005", "lease_id": "lease-1",
                    "remote": "absent", "pr": "open",
                    "observed_at": self.now.isoformat(),
                    "pr_url": "https://github.com/JovieInc/Jovie/pull/1",
                    "pr_head_sha": "a" * 40,
                },
                now=self.now,
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_retry_once("job-1", self.envelope, self.now)

    def test_reconciliation_closed_pr_requires_failure_owner_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            journal.observe("job-1", 0, self.observation(transport_lost=True), self.now)
            reservation = journal.reserve_action_once("job-1")["reservation"]
            outcome = {
                "issue_id": "JOV-6005", "lease_id": "lease-1",
                "remote": "absent", "pr": "closed_unmerged",
                "pr_url": "https://github.com/JovieInc/Jovie/pull/1",
                "pr_head_sha": "a" * 40,
                "observed_at": self.now.isoformat(),
            }
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result(
                    "job-1", reservation["id"], "e" * 64, outcome, now=self.now
                )
            completed = {
                **outcome, "failure_owner": "symphony-owner",
                "failure_receipt_sha256": "f" * 64,
            }
            self.assertTrue(
                journal.record_action_result(
                    "job-1", reservation["id"], "e" * 64, completed,
                    now=self.now,
                )["recorded"]
            )

    def test_retry_reservation_and_thread_binding_survive_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            journal = self.journal(directory)
            journal.observe(
                "job-1", 0,
                self.observation(is_running=False, terminal_state="failed"), self.now,
            )
            journal.observe_delivery("job-1", 0, self.delivery(), self.now)
            reserved = journal.reserve_action_once("job-1")["reservation"]
            journal.record_action_result(
                "job-1", reserved["id"], "e" * 64,
                {
                    "issue_id": "JOV-6005", "lease_id": "lease-1",
                    "remote": "idempotent_replay", "pr": "not_found",
                    "observed_at": self.now.isoformat(),
                },
                now=self.now,
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_retry_once(
                    "job-1", {**self.envelope, "per_query_cap_usd": 2.0}, self.now
                )
            self.assertTrue(
                journal.reserve_retry_once("job-1", self.envelope, self.now)["execute"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_action_once("job-1")
            restarted = lifecycle.LifecycleJournal(path)
            self.assertFalse(
                restarted.reserve_retry_once("job-1", self.envelope, self.now)["execute"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(pathlib.Path(directory) / "other.json").bind_retry_thread(
                    "job-1", "thread-2", "f" * 64
                )
            with self.assertRaises(lifecycle.LifecycleError):
                restarted.bind_retry_thread("job-1", "", "short")
            receipt = "f" * 64
            self.assertTrue(
                restarted.bind_retry_thread("job-1", "thread-2", receipt)["recorded"]
            )
            self.assertTrue(
                restarted.bind_retry_thread("job-1", "thread-2", receipt)["duplicate"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                restarted.bind_retry_thread("job-1", "thread-3", receipt)
            restarted.observe(
                "job-1", 0,
                self.observation(thread_id="thread-2", transport_lost=True), self.now,
            )
            second_attempt = restarted.reserve_action_once("job-1")
            self.assertTrue(second_attempt["execute"])
            self.assertEqual(second_attempt["reservation"]["attempt_number"], 2)
            self.assertTrue(
                second_attempt["reservation"]["id"].startswith(
                    "attempt:2:reconcile_issue_lifecycle_once:"
                )
            )

    def test_delivery_evidence_cannot_regress_and_unknown_does_not_mask_remote_state(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            journal.observe(
                "job-1", 0,
                self.observation(is_running=False, terminal_state="failed"), self.now,
            )
            unknown = {
                **self.delivery(), "pr_state": "UNKNOWN",
                "pr_url": "https://github.com/JovieInc/Jovie/pull/999",
            }
            journal.observe_delivery("job-1", 0, unknown, self.now)
            self.assertEqual(journal.data["jobs"]["job-1"]["state"], "remote_failed")
            self.assertEqual(journal.data["jobs"]["job-1"]["delivery"], {})

            open_pr = self.delivery(
                pr_state="open",
                pr_url="https://github.com/JovieInc/Jovie/pull/1",
                pr_head_sha="a" * 40,
            )
            journal.observe_delivery("job-1", 1, open_pr, self.now)
            self.assertEqual(journal.data["jobs"]["job-1"]["state"], "pr_open")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery(
                    "job-1", 2,
                    {**open_pr, "pr_url": "https://github.com/JovieInc/Jovie/pull/2"},
                    self.now,
                )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 2, unknown, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 2, self.delivery(), self.now)
            persisted = lifecycle.LifecycleJournal(
                pathlib.Path(directory) / "journal.json"
            ).data["jobs"]["job-1"]
            self.assertEqual(persisted["delivery_state"], "pr_open")
            self.assertEqual(persisted["delivery"]["pr_url"], open_pr["pr_url"])

    def test_issue_and_delivery_reconciliations_are_independently_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(directory)
            journal.observe("job-1", 0, self.observation(transport_lost=True), self.now)
            issue = journal.reserve_action_once("job-1")["reservation"]
            self.assertEqual(issue["action"], "reconcile_issue_lifecycle_once")
            journal.record_action_result(
                "job-1", issue["id"], "e" * 64,
                {
                    "issue_id": "JOV-6005", "lease_id": "lease-1",
                    "remote": "existing", "thread_id": "thread-1",
                    "pr": "not_found", "observed_at": self.now.isoformat(),
                },
                now=self.now,
            )
            completed = self.observation(
                is_running=False, terminal_state="completed",
                useful_outcome_verified=True, final_output_sha256="a" * 64,
                usage_receipt_sha256="b" * 64, route_receipt_sha256="c" * 64,
                destination_receipt_sha256="d" * 64, cost_usd=0.5,
            )
            journal.observe("job-1", 1, completed, self.now)
            journal.observe_delivery("job-1", 0, self.delivery(), self.now)
            delivery = journal.reserve_action_once("job-1")["reservation"]
            self.assertEqual(delivery["action"], "reconcile_delivery_once")
            duplicate = journal.reserve_action_once("job-1")
            self.assertFalse(duplicate["execute"])
            self.assertTrue(duplicate["duplicate"])
            self.assertEqual(duplicate["reservation"], delivery)


if __name__ == "__main__":
    unittest.main()
