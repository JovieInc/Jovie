#!/usr/bin/env python3
import hashlib
import hmac
import importlib.util
import json
import multiprocessing
import os
import pathlib
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/hyperagent/lifecycle.py"
SPEC = importlib.util.spec_from_file_location("hyperagent_lifecycle_journal", SOURCE)
lifecycle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lifecycle)
HMAC_KEY = b"hyperagent-receipt-test-key-32-bytes-minimum"


def reserve_process(path, envelope, now, start, results):
    start.wait()
    try:
        result = lifecycle.LifecycleJournal(path, HMAC_KEY).reserve_dispatch(
            envelope, now
        )
        results.put(result["execute_create"])
    except lifecycle.LifecycleError as error:
        results.put(str(error))


class HyperagentJournalTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
        self.envelope = {
            "schema": lifecycle.SCHEMA,
            "provider": "hyperagent",
            "route_selected": True,
            "authenticated": True,
            "oauth_scopes": [
                "threads:read",
                "threads:write",
                "approvals:read",
                "approvals:write",
            ],
            "account_alias": "workspace-a",
            "expected_account_alias": "workspace-a",
            "workspace_id": "workspace-id-a",
            "agent_id": "agent-a",
            "agent_name": "Developer",
            "agent_mode": "auto",
            "model_id": "live-cheapest-capable",
            "budget_period_id": "2026-09",
            "budget_period_receipt_sha256": "9" * 64,
            "budget_period_checked_at": (
                self.now - timedelta(minutes=1)
            ).isoformat(),
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
            "destination": "local-artifact",
            "expected_destination": "local-artifact",
            "balance_usd": 20.0,
            "per_query_cap_usd": 1.0,
            "period_cap_usd": 10.0,
            "period_spend_usd": 2.0,
            "auto_recharge_enabled": False,
            "paying_org": "workspace-a",
            "expected_paying_org": "workspace-a",
            "paying_org_id": "org-id-a",
            "expected_paying_org_id": "org-id-a",
            "issue_id": "JOV-6005",
            "lease_id": "lease-1",
            "expected_pr_repository": "JovieInc/Jovie",
            "required_runtime": "symphony-4041",
            "credits_expire_at": (self.now + timedelta(days=30)).isoformat(),
            "balance_checked_at": (self.now - timedelta(minutes=1)).isoformat(),
            "model_checked_at": (self.now - timedelta(minutes=1)).isoformat(),
        }
        self.envelope["budget_period_receipt_sha256"] = self.sign_budget(
            self.envelope
        )

    @staticmethod
    def sign_budget(envelope, key=HMAC_KEY):
        return hmac.new(
            key,
            lifecycle._canonical_json(
                lifecycle._budget_receipt_payload(envelope)
            ).encode(),
            hashlib.sha256,
        ).hexdigest()

    def budget_envelope(self, **updates):
        envelope = {**self.envelope, **updates}
        envelope["budget_period_receipt_sha256"] = self.sign_budget(envelope)
        return envelope

    def journal(self, path):
        return lifecycle.LifecycleJournal(path, HMAC_KEY)

    def observation(self, envelope=None, **updates):
        envelope = envelope or self.envelope
        value = {
            "schema": lifecycle.SCHEMA,
            "observed_at": self.now.isoformat(),
            "thread_id": "thread-1",
            "idempotency_key": envelope["idempotency_key"],
            "is_running": True,
        }
        value.update(updates)
        return value

    def receipt(
        self,
        schema,
        outcome,
        attempt_identity,
        envelope=None,
        observed_at=None,
        key=HMAC_KEY,
        **updates,
    ):
        envelope = envelope or self.envelope
        value = {
            "schema": schema,
            "provider": envelope["provider"],
            "paying_org_id": envelope["paying_org_id"],
            "workspace_id": envelope["workspace_id"],
            "account_alias": envelope["account_alias"],
            "budget_period_id": envelope["budget_period_id"],
            "idempotency_key": envelope["idempotency_key"],
            "identity_sha256": lifecycle._identity_sha256(envelope),
            "attempt_identity": attempt_identity,
            "outcome": outcome,
            "observed_at": (observed_at or self.now).isoformat(),
        }
        value.update(updates)
        value["receipt_hmac_sha256"] = hmac.new(
            key,
            lifecycle._canonical_json(value).encode(),
            hashlib.sha256,
        ).hexdigest()
        return value

    def reserve_and_bind(self, journal, envelope=None, thread_id="thread-1"):
        envelope = envelope or self.envelope
        reserved = journal.reserve_dispatch(envelope, self.now)
        receipt = self.receipt(
            lifecycle.CREATE_RECEIPT_SCHEMA,
            "created",
            reserved["attempt_identity"],
            envelope,
            thread_id=thread_id,
        )
        journal.bind_created_thread(
            envelope["idempotency_key"], reserved["attempt_identity"], receipt, self.now
        )
        return reserved, receipt

    def terminal_observation(self, terminal="completed", envelope=None, **updates):
        envelope = envelope or self.envelope
        value = self.observation(
            envelope,
            is_running=False,
            terminal_state=terminal,
            account_alias=envelope["account_alias"],
            destination=envelope["destination"],
            model_id=envelope["model_id"],
        )
        if terminal == "completed":
            value.update(
                useful_outcome_verified=True,
                final_output_sha256="d" * 64,
                usage_receipt_sha256="e" * 64,
                route_receipt_sha256="f" * 64,
                destination_receipt_sha256="1" * 64,
                cost_usd=0.4,
            )
        value.update(updates)
        return value

    def approval(self):
        return {
            "kind": "approval",
            "id": "approval-1",
            "state": "pending",
            "fingerprint": "action-1",
            "account_alias": "workspace-a",
            "destination": "local-artifact",
            "per_query_cap_usd": 1.0,
            "resolution_surface": "mcp",
        }

    def authority(self, **updates):
        value = {
            "thread_id": "thread-1",
            "idempotency_key": "job-1",
            "user_authorized": True,
            "interaction_id": "approval-1",
            "fingerprint": "action-1",
            "account_alias": "workspace-a",
            "destination": "local-artifact",
            "per_query_cap_usd": 1.0,
        }
        value.update(updates)
        return value

    def delivery(self, **updates):
        value = {
            "schema": lifecycle.DELIVERY_SCHEMA,
            "observed_at": self.now.isoformat(),
            "issue_id": self.envelope["issue_id"],
            "lease_id": self.envelope["lease_id"],
            "idempotency_key": self.envelope["idempotency_key"],
            "expected_pr_repository": self.envelope["expected_pr_repository"],
            "required_runtime": self.envelope["required_runtime"],
            "pr_state": "not_found",
        }
        value.update(updates)
        return value

    def reconciliation_receipt(self, journal, action_id, outcome):
        job = journal.data["jobs"][self.envelope["idempotency_key"]]
        receipt = self.receipt(
            lifecycle.RECONCILIATION_RECEIPT_SCHEMA,
            journal.data["jobs"][self.envelope["idempotency_key"]]["actions"][-1]["action"],
            job["current_attempt_identity"],
            action_id=action_id,
            evidence_sha256=hashlib.sha256(
                lifecycle._canonical_json(outcome).encode()
            ).hexdigest(),
        )
        return receipt

    def test_workflow_requires_precreate_reservation_and_authenticated_receipts(self):
        workflow = (ROOT / "scripts/symphony/WORKFLOW.md").read_text()
        self.assertIn("scripts/symphony/hyperagent/lifecycle.py preflight", workflow)
        self.assertIn("Never infer an approval from prose", workflow)
        self.assertIn("never a parallel queue", workflow)
        self.assertIn("reserve_action_once", workflow)
        self.assertIn("LifecycleJournal.reserve_dispatch", workflow)
        self.assertIn("HMAC-authenticated", workflow)
        self.assertIn("unknown cost remains reserved", workflow)

    def test_atomic_precreate_reservation_caps_concurrent_aggregate_exposure(self):
        context = multiprocessing.get_context("fork")
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            boundary = self.budget_envelope(
                period_spend_usd=0.0,
                period_cap_usd=1.0,
                balance_usd=10.0,
                per_query_cap_usd=1.0,
            )
            start, results = context.Event(), context.Queue()
            processes = [
                context.Process(
                    target=reserve_process,
                    args=(
                        path,
                        {
                            **boundary,
                            "idempotency_key": f"job-{index}",
                            "request_sha256": str(index) * 64,
                        },
                        self.now,
                        start,
                        results,
                    ),
                )
                for index in (1, 2)
            ]
            for process in processes:
                process.start()
            start.set()
            for process in processes:
                process.join(5)
                self.assertEqual(process.exitcode, 0)
            outcomes = [results.get(timeout=1) for _ in processes]
            self.assertEqual(outcomes.count(True), 1)
            self.assertEqual(outcomes.count("budget exposure unavailable"), 1)
            data = self.journal(path).data
            self.assertEqual(len(data["jobs"]), 1)
            self.assertEqual(
                sum(float(job["max_exposure_usd"]) for job in data["jobs"].values()),
                1.0,
            )

    def test_duplicate_key_rejects_changed_full_dispatch_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            first = journal.reserve_dispatch(self.envelope, self.now)
            duplicate = journal.reserve_dispatch(self.envelope, self.now)
            self.assertFalse(duplicate["execute_create"])
            self.assertEqual(duplicate["attempt_identity"], first["attempt_identity"])
            valid_identity_changes = (
                {"per_query_cap_usd": 0.75},
                {"model_id": "other-capable-model"},
                {"destination": "github-draft", "expected_destination": "github-draft"},
                {"workspace_id": "workspace-id-b"},
                {"agent_id": "agent-b"},
                {"agent_name": "Reviewer"},
                {"model_price_usd": 0.4},
                {"runtime": "other-compatible-runtime"},
                {"turn_timeout_seconds": 800},
                {"tools": ["code", "browser"]},
                {"integrations": ["github"]},
                {"delegation_allowlist": ["reviewer"]},
                {"useful_outcome": "a different artifact"},
                {"request_sha256": "b" * 64},
                {
                    "paying_org": "workspace-b",
                    "expected_paying_org": "workspace-b",
                    "paying_org_id": "org-id-b",
                    "expected_paying_org_id": "org-id-b",
                },
                {
                    "account_alias": "workspace-b",
                    "expected_account_alias": "workspace-b",
                },
                {"budget_period_id": "2026-Q3"},
            )
            for updates in valid_identity_changes:
                with self.subTest(updates=updates), self.assertRaisesRegex(
                    lifecycle.LifecycleError, "identity changed"
                ):
                    journal.reserve_dispatch({**self.envelope, **updates}, self.now)
            for field in lifecycle.DISPATCH_IDENTITY_FIELDS:
                value = self.envelope[field]
                if isinstance(value, list):
                    changed = [*value, "identity-change"]
                elif isinstance(value, bool):
                    changed = not value
                elif isinstance(value, (int, float)):
                    changed = value + 1
                else:
                    changed = f"changed-{field}"
                mutated = {**self.envelope, field: changed}
                self.assertNotEqual(
                    lifecycle._identity_sha256(mutated),
                    lifecycle._identity_sha256(self.envelope),
                    field,
                )

    def test_attempt_identity_contains_unpredictable_persisted_nonce(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            first = journal.reserve_dispatch(self.envelope, self.now)
            attempt = first["job"]["attempts"][first["attempt_identity"]]
            self.assertEqual(len(first["attempt_identity"]), 64)
            self.assertEqual(len(attempt["nonce"]), 32)
            self.assertNotIn("job-1", first["attempt_identity"])

    def test_create_receipt_requires_hmac_exact_identity_and_post_reservation_time(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            reserved = journal.reserve_dispatch(self.envelope, self.now)
            attempt = reserved["attempt_identity"]
            valid = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "created",
                attempt,
                thread_id="thread-1",
            )
            invalid = (
                {key: value for key, value in valid.items() if key != "receipt_hmac_sha256"},
                self.receipt(
                    lifecycle.CREATE_RECEIPT_SCHEMA,
                    "created",
                    attempt,
                    key=b"wrong-receipt-key-with-at-least-32-bytes",
                    thread_id="thread-1",
                ),
                self.receipt(
                    lifecycle.CREATE_RECEIPT_SCHEMA,
                    "created",
                    attempt,
                    observed_at=self.now - timedelta(seconds=1),
                    thread_id="thread-1",
                ),
                {**valid, "thread_id": "thread-tampered"},
            )
            for receipt in invalid:
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.bind_created_thread("job-1", attempt, receipt, self.now)
            self.assertTrue(
                journal.bind_created_thread("job-1", attempt, valid, self.now)["recorded"]
            )

    def test_canonical_alias_shares_lock_and_hardlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            path = root / "journal.json"
            alias = root / "journal-alias.json"
            alias.symlink_to(path)
            first = self.journal(alias)
            self.assertTrue(first.reserve_dispatch(self.envelope, self.now)["execute_create"])
            self.assertEqual(first.path, self.journal(path).path)
            self.assertFalse(
                self.journal(path).reserve_dispatch(self.envelope, self.now)["execute_create"]
            )
            hardlink = root / "journal-hardlink.json"
            os.link(path, hardlink)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "single regular file"):
                self.journal(hardlink)

    def test_lock_path_aliases_and_nonregular_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)

            symlink_journal = root / "symlink.json"
            symlink_lock = root / "symlink.json.lock"
            symlink_target = root / "outside.lock"
            symlink_lock.symlink_to(symlink_target)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "single regular file"):
                self.journal(symlink_journal)
            self.assertFalse(symlink_target.exists())

            hardlink_journal = root / "hardlink.json"
            hardlink_lock = root / "hardlink.json.lock"
            hardlink_target = root / "shared.lock"
            hardlink_target.write_text("")
            os.link(hardlink_target, hardlink_lock)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "single regular file"):
                self.journal(hardlink_journal)

            directory_journal = root / "directory.json"
            (root / "directory.json.lock").mkdir()
            with self.assertRaisesRegex(lifecycle.LifecycleError, "single regular file"):
                self.journal(directory_journal)

    def test_ambiguous_create_retains_exposure_until_signed_absence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            boundary = self.budget_envelope(
                period_spend_usd=0.0,
                period_cap_usd=1.0,
            )
            contender = {
                **boundary,
                "idempotency_key": "job-2",
                "request_sha256": "b" * 64,
            }
            journal = self.journal(path)
            attempt = journal.reserve_dispatch(boundary, self.now)["attempt_identity"]
            journal.mark_create_unknown("job-1", attempt)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "exposure unavailable"):
                journal.reserve_dispatch(contender, self.now)
            absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "provider_absence",
                attempt,
                boundary,
            )
            self.assertTrue(
                journal.reconcile_create("job-1", attempt, absence, self.now)["recorded"]
            )
            self.assertTrue(journal.reserve_dispatch(contender, self.now)["execute_create"])

    def test_found_existing_and_committed_receipts_replay_after_freshness_window(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            attempt = journal.reserve_dispatch(self.envelope, self.now)["attempt_identity"]
            journal.mark_create_unknown("job-1", attempt)
            found = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "found_existing",
                attempt,
                thread_id="thread-1",
            )
            self.assertTrue(
                journal.reconcile_create("job-1", attempt, found, self.now)["recorded"]
            )
            self.assertTrue(
                journal.reconcile_create(
                    "job-1", attempt, found, self.now + timedelta(minutes=10)
                )["duplicate"]
            )

    def test_retry_requires_signed_absence_fresh_evidence_and_same_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            attempt = journal.reserve_dispatch(self.envelope, self.now)["attempt_identity"]
            journal.mark_create_unknown("job-1", attempt)
            absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "provider_absence",
                attempt,
            )
            journal.reconcile_create("job-1", attempt, absence, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "identity changed"):
                journal.reserve_create_retry_once(
                    "job-1", {**self.envelope, "per_query_cap_usd": 0.75}, self.now
                )
            retry = journal.reserve_create_retry_once("job-1", self.envelope, self.now)
            self.assertTrue(retry["execute_create"])
            self.assertNotEqual(retry["attempt_identity"], attempt)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_create_retry_once("job-1", self.envelope, self.now)
            self.assertTrue(
                journal.reconcile_create(
                    "job-1", attempt, absence, self.now + timedelta(minutes=10)
                )["duplicate"]
            )

    def test_terminal_outcomes_settle_authenticated_exact_cost_and_release_exposure(self):
        cases = (
            ("completed", "remote_useful_success", 0.4),
            ("failed", "remote_failed", 0.1),
            ("declined", "remote_declined", 0.0),
            ("cancelled", "remote_cancelled", 0.0),
        )
        for terminal, state, cost in cases:
            with self.subTest(terminal=terminal), tempfile.TemporaryDirectory() as directory:
                journal = self.journal(pathlib.Path(directory) / "journal.json")
                reserved, _ = self.reserve_and_bind(journal)
                observation = self.terminal_observation(terminal)
                receipt = self.receipt(
                    lifecycle.TERMINAL_RECEIPT_SCHEMA,
                    state,
                    reserved["attempt_identity"],
                    thread_id="thread-1",
                    cost_usd=cost,
                    usage_receipt_sha256="e" * 64,
                    observation_sha256=hashlib.sha256(
                        lifecycle._canonical_json(observation).encode()
                    ).hexdigest(),
                )
                settled = journal.settle_terminal("job-1", observation, receipt, self.now)
                self.assertTrue(settled["recorded"])
                self.assertEqual(settled["settlement"]["cost_usd"], str(cost))
                self.assertEqual(
                    journal.data["jobs"]["job-1"]["exposure_state"], "settled"
                )
                self.assertTrue(
                    journal.settle_terminal(
                        "job-1", observation, receipt, self.now + timedelta(minutes=10)
                    )["duplicate"]
                )

    def test_unknown_or_unauthenticated_terminal_cost_retains_exposure(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            reserved, _ = self.reserve_and_bind(journal)
            failed = self.terminal_observation("failed")
            unsigned = self.receipt(
                lifecycle.TERMINAL_RECEIPT_SCHEMA,
                "remote_failed",
                reserved["attempt_identity"],
                thread_id="thread-1",
                cost_usd=0.0,
                usage_receipt_sha256="e" * 64,
                observation_sha256=hashlib.sha256(
                    lifecycle._canonical_json(failed).encode()
                ).hexdigest(),
            )
            unsigned.pop("receipt_hmac_sha256")
            for receipt in (unsigned, {**unsigned, "cost_usd": "UNKNOWN"}):
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.settle_terminal("job-1", failed, receipt, self.now)
            self.assertEqual(journal.data["jobs"]["job-1"]["exposure_state"], "active")

    def test_remote_state_is_separate_and_observations_use_persisted_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            self.reserve_and_bind(journal)
            result = journal.observe("job-1", 0, self.observation(), self.now)
            self.assertEqual(result["classification"]["state"], "running")
            job = journal.data["jobs"]["job-1"]
            self.assertEqual(job["remote_state"], "running")
            self.assertEqual(job["exposure_state"], "active")
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe(
                    "job-1",
                    1,
                    self.observation(thread_id="other-thread", transport_lost=True),
                    self.now,
                )

    def test_action_reservation_remains_idempotent_after_authenticated_create(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            self.reserve_and_bind(journal)
            interaction = {
                "kind": "approval",
                "id": "approval-1",
                "state": "pending",
                "fingerprint": "action-1",
                "account_alias": "workspace-a",
                "destination": "local-artifact",
                "per_query_cap_usd": 1.0,
                "resolution_surface": "mcp",
            }
            journal.observe(
                "job-1", 0, self.observation(interaction=interaction), self.now
            )
            authority = {
                "thread_id": "thread-1",
                "idempotency_key": "job-1",
                "user_authorized": True,
                "interaction_id": "approval-1",
                "fingerprint": "action-1",
                "account_alias": "workspace-a",
                "destination": "local-artifact",
                "per_query_cap_usd": 1.0,
            }
            reserved = journal.reserve_action_once(
                "job-1", authority, ["approvals:write"]
            )
            self.assertTrue(reserved["execute"])
            self.assertFalse(
                journal.reserve_action_once(
                    "job-1", authority, ["approvals:write"]
                )["execute"]
            )
            changed = {**interaction, "fingerprint": "action-2"}
            journal.observe(
                "job-1", 1, self.observation(interaction=changed), self.now
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "identity changed"):
                journal.reserve_action_once(
                    "job-1",
                    {**authority, "fingerprint": "action-2"},
                    ["approvals:write"],
                )

    def test_observation_revisions_and_terminal_state_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            self.reserve_and_bind(journal)
            running = self.observation()
            with self.assertRaisesRegex(lifecycle.LifecycleError, "unknown idempotency"):
                journal.observe("missing", 0, running, self.now)
            for revision in (-1, True):
                with self.assertRaisesRegex(lifecycle.LifecycleError, "non-negative"):
                    journal.observe("job-1", revision, running, self.now)
            self.assertTrue(journal.observe("job-1", 1, running, self.now)["recorded"])
            self.assertTrue(journal.observe("job-1", 1, running, self.now)["duplicate"])
            with self.assertRaisesRegex(lifecycle.LifecycleError, "changed content"):
                journal.observe(
                    "job-1", 1, self.observation(last_message="changed"), self.now
                )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "regressed"):
                journal.observe("job-1", 0, running, self.now)
            success = self.terminal_observation()
            journal.observe("job-1", 2, success, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "terminal job"):
                journal.observe("job-1", 3, running, self.now)

    def test_action_results_are_identity_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            self.reserve_and_bind(journal)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "unknown idempotency"):
                journal.reserve_action_once("missing")
            with self.assertRaisesRegex(lifecycle.LifecycleError, "not admissible"):
                journal.reserve_action_once("job-1")
            journal.observe(
                "job-1", 0, self.observation(interaction=self.approval()), self.now
            )
            reserved = journal.reserve_action_once(
                "job-1", self.authority(), ["approvals:write"]
            )["reservation"]
            for key, action_id, digest, outcome in (
                ("missing", reserved["id"], "f" * 64, None),
                ("job-1", reserved["id"], "short", None),
                ("job-1", "missing", "f" * 64, None),
                ("job-1", reserved["id"], "f" * 64, "provider_absence"),
            ):
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.record_action_result(key, action_id, digest, outcome)
            self.assertTrue(
                journal.record_action_result("job-1", reserved["id"], "f" * 64)[
                    "recorded"
                ]
            )
            self.assertTrue(
                journal.record_action_result("job-1", reserved["id"], "f" * 64)[
                    "duplicate"
                ]
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "receipt changed"):
                journal.record_action_result("job-1", reserved["id"], "e" * 64)


    def test_create_registration_and_reconciliation_reject_changed_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            with self.assertRaisesRegex(lifecycle.LifecycleError, "not admissible"):
                journal.reserve_dispatch(
                    {**self.envelope, "route_selected": False}, self.now
                )
            attempt = journal.reserve_dispatch(self.envelope, self.now)[
                "attempt_identity"
            ]
            with self.assertRaisesRegex(lifecycle.LifecycleError, "related job"):
                journal.reserve_dispatch(
                    {
                        **self.envelope,
                        "idempotency_key": "job-2",
                    },
                    self.now,
                )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "attempt identity"):
                journal.mark_create_unknown("missing", attempt)
            self.assertTrue(
                journal.mark_create_unknown("job-1", attempt)["exposure_retained"]
            )
            self.assertTrue(
                journal.mark_create_unknown("job-1", attempt)["exposure_retained"]
            )
            for receipt in (
                None,
                {"outcome": "created"},
                self.receipt(
                    lifecycle.CREATE_RECEIPT_SCHEMA,
                    "not-created",
                    attempt,
                    thread_id="thread-1",
                ),
            ):
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.bind_created_thread("job-1", attempt, receipt, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "reconciliation evidence"):
                journal.reconcile_create("job-1", attempt, {}, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "attempt identity"):
                journal.reconcile_create(
                    "missing",
                    attempt,
                    self.receipt(
                        lifecycle.CREATE_RECEIPT_SCHEMA,
                        "provider_absence",
                        attempt,
                    ),
                    self.now,
                )
            created = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "created",
                attempt,
                thread_id="thread-1",
            )
            self.assertTrue(
                journal.bind_created_thread("job-1", attempt, created, self.now)[
                    "recorded"
                ]
            )
            self.assertTrue(
                journal.bind_created_thread("job-1", attempt, created, self.now)[
                    "duplicate"
                ]
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "receipt changed"):
                journal.bind_created_thread(
                    "job-1",
                    attempt,
                    self.receipt(
                        lifecycle.CREATE_RECEIPT_SCHEMA,
                        "created",
                        attempt,
                        thread_id="thread-2",
                    ),
                    self.now,
                )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "create outcome"):
                journal.mark_create_unknown("job-1", attempt)
            self.assertTrue(
                journal.register_dispatch(self.envelope, "thread-1", self.now)[
                    "duplicate"
                ]
            )
            for envelope, thread_id in (
                ({**self.envelope, "route_selected": False}, "thread-1"),
                (self.envelope, ""),
                (self.envelope, "thread-2"),
            ):
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.register_dispatch(envelope, thread_id, self.now)

    def test_receipt_and_create_state_transitions_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            unsigned_journal = lifecycle.LifecycleJournal(root / "unsigned.json")
            with self.assertRaisesRegex(lifecycle.LifecycleError, "authentication failed"):
                unsigned_journal.reserve_dispatch(self.envelope, self.now)

            forged_budget = self.journal(root / "forged-budget.json")
            with self.assertRaisesRegex(lifecycle.LifecycleError, "authentication failed"):
                forged_budget.reserve_dispatch(
                    {**self.envelope, "budget_period_receipt_sha256": "9" * 64},
                    self.now,
                )

            identity_journal = self.journal(root / "identity.json")
            identity_attempt = identity_journal.reserve_dispatch(
                self.envelope, self.now
            )["attempt_identity"]
            wrong_identity = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "created",
                identity_attempt,
                paying_org_id="org-id-other",
                thread_id="thread-1",
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "identity changed"):
                identity_journal.bind_created_thread(
                    "job-1", identity_attempt, wrong_identity, self.now
                )

            absent_journal = self.journal(root / "absent.json")
            absent_attempt = absent_journal.reserve_dispatch(
                self.envelope, self.now
            )["attempt_identity"]
            absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "provider_absence",
                absent_attempt,
            )
            absent_journal.reconcile_create(
                "job-1", absent_attempt, absence, self.now
            )
            changed_absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "provider_absence",
                absent_attempt,
                observed_at=self.now + timedelta(seconds=1),
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "reconciliation changed"):
                absent_journal.reconcile_create(
                    "job-1",
                    absent_attempt,
                    changed_absence,
                    self.now + timedelta(seconds=1),
                )
            created_after_absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "created",
                absent_attempt,
                thread_id="thread-1",
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "not bindable"):
                absent_journal.bind_created_thread(
                    "job-1", absent_attempt, created_after_absence, self.now
                )
            found_after_absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "found_existing",
                absent_attempt,
                thread_id="thread-1",
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "not bindable"):
                absent_journal.reconcile_create(
                    "job-1", absent_attempt, found_after_absence, self.now
                )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "retry envelope"):
                absent_journal.reserve_create_retry_once(
                    "job-1", {**self.envelope, "route_selected": False}, self.now
                )

            found_journal = self.journal(root / "found.json")
            found_attempt = found_journal.reserve_dispatch(
                self.envelope, self.now
            )["attempt_identity"]
            with self.assertRaisesRegex(lifecycle.LifecycleError, "attempt identity"):
                found_journal.reconcile_create(
                    "job-1",
                    "0" * 64,
                    self.receipt(
                        lifecycle.CREATE_RECEIPT_SCHEMA,
                        "found_existing",
                        "0" * 64,
                        thread_id="thread-1",
                    ),
                    self.now,
                )
            invalid_thread = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "found_existing",
                found_attempt,
                thread_id="",
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "receipt is invalid"):
                found_journal.reconcile_create(
                    "job-1", found_attempt, invalid_thread, self.now
                )
            found = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "found_existing",
                found_attempt,
                thread_id="thread-1",
            )
            found_journal.reconcile_create("job-1", found_attempt, found, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "receipt changed"):
                found_journal.reconcile_create(
                    "job-1",
                    found_attempt,
                    self.receipt(
                        lifecycle.CREATE_RECEIPT_SCHEMA,
                        "found_existing",
                        found_attempt,
                        thread_id="thread-2",
                    ),
                    self.now,
                )

    def test_reconciliation_limit_and_unbound_settlement_are_enforced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            unbound = self.journal(root / "unbound.json")
            unbound.reserve_dispatch(self.envelope, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "active exposure"):
                unbound.settle_terminal(
                    "job-1", self.terminal_observation("failed"), {}, self.now
                )

            journal = self.journal(root / "reconcile.json")
            self.reserve_and_bind(journal)
            journal.observe(
                "job-1", 0, self.observation(transport_lost=True), self.now
            )
            first = journal.reserve_action_once("job-1")["reservation"]
            outcome = {
                "issue_id": "JOV-6005",
                "lease_id": "lease-1",
                "remote": "absent",
                "pr": "not_found",
                "observed_at": self.now.isoformat(),
            }
            journal.record_action_result(
                "job-1",
                first["id"],
                self.reconciliation_receipt(journal, first["id"], outcome),
                outcome,
                self.now,
            )
            journal.observe(
                "job-1",
                1,
                self.observation(is_running=False, terminal_state="completed"),
                self.now,
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "reconciliation limit"):
                journal.reserve_action_once("job-1")

    def test_budget_scope_cap_and_retry_exposure_are_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            first = journal.reserve_dispatch(self.envelope, self.now)
            distinct = {
                **self.envelope,
                "idempotency_key": "job-2",
                "request_sha256": "b" * 64,
            }
            with self.assertRaisesRegex(lifecycle.LifecycleError, "period cap changed"):
                journal.reserve_dispatch(
                    {
                        **distinct,
                        "period_cap_usd": 9.0,
                        "budget_period_receipt_sha256": self.sign_budget(
                            {**distinct, "period_cap_usd": 9.0}
                        ),
                    },
                    self.now,
                )
            journal.mark_create_unknown("job-1", first["attempt_identity"])
            absence = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "provider_absence",
                first["attempt_identity"],
            )
            journal.reconcile_create(
                "job-1", first["attempt_identity"], absence, self.now
            )
            journal.reserve_dispatch(distinct, self.now)
            constrained = self.budget_envelope(
                balance_usd=1.5,
                balance_checked_at=self.now.isoformat(),
                budget_period_checked_at=self.now.isoformat(),
                model_checked_at=self.now.isoformat(),
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "exposure unavailable"):
                journal.reserve_create_retry_once("job-1", constrained, self.now)

    def test_terminal_settlement_rejects_untrusted_changed_or_excess_cost(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            journal = self.journal(path)
            reserved, _ = self.reserve_and_bind(journal)
            failed = self.terminal_observation("failed")
            with self.assertRaisesRegex(lifecycle.LifecycleError, "unknown idempotency"):
                journal.settle_terminal("missing", failed, {}, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "terminal settlement evidence"):
                journal.settle_terminal("job-1", self.observation(), {}, self.now)
            for cost, usage in ((2.0, "e" * 64), (0.1, "short")):
                receipt = self.receipt(
                    lifecycle.TERMINAL_RECEIPT_SCHEMA,
                    "remote_failed",
                    reserved["attempt_identity"],
                    thread_id="thread-1",
                    cost_usd=cost,
                    usage_receipt_sha256=usage,
                    observation_sha256=hashlib.sha256(
                        lifecycle._canonical_json(failed).encode()
                    ).hexdigest(),
                )
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.settle_terminal("job-1", failed, receipt, self.now)
            valid = self.receipt(
                lifecycle.TERMINAL_RECEIPT_SCHEMA,
                "remote_failed",
                reserved["attempt_identity"],
                thread_id="thread-1",
                cost_usd=0.1,
                usage_receipt_sha256="e" * 64,
                observation_sha256=hashlib.sha256(
                    lifecycle._canonical_json(failed).encode()
                ).hexdigest(),
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "identity changed"):
                journal.settle_terminal(
                    "job-1", {**failed, "provider_message": "changed"}, valid, self.now
                )
            journal.settle_terminal("job-1", failed, valid, self.now)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "settlement changed"):
                journal.settle_terminal(
                    "job-1", {**failed, "last_message": "changed"}, valid, self.now
                )

            useful = self.journal(pathlib.Path(directory) / "useful.json")
            useful_reserved, _ = self.reserve_and_bind(useful)
            useful_observation = self.terminal_observation()
            changed_cost = self.receipt(
                lifecycle.TERMINAL_RECEIPT_SCHEMA,
                "remote_useful_success",
                useful_reserved["attempt_identity"],
                thread_id="thread-1",
                cost_usd=0.3,
                usage_receipt_sha256="e" * 64,
                observation_sha256=hashlib.sha256(
                    lifecycle._canonical_json(useful_observation).encode()
                ).hexdigest(),
            )
            with self.assertRaisesRegex(lifecycle.LifecycleError, "changed useful"):
                useful.settle_terminal(
                    "job-1", useful_observation, changed_cost, self.now
                )

    def test_corrupt_journal_short_key_and_unreserved_registration_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            with self.assertRaises(lifecycle.LifecycleError):
                lifecycle.LifecycleJournal(path, b"short")
            journal = self.journal(path)
            with self.assertRaisesRegex(lifecycle.LifecycleError, "pre-create reservation"):
                journal.register_dispatch(self.envelope, "thread-1", self.now)
            path.write_text("not-json")
            with self.assertRaises(lifecycle.LifecycleError):
                self.journal(path)
            path.write_text("{}")
            with self.assertRaisesRegex(lifecycle.LifecycleError, "schema is invalid"):
                self.journal(path)
            malformed = (
                None,
                [],
                "journal",
                {"schema": lifecycle.JOURNAL_SCHEMA, "budgets": [], "jobs": {}},
                {
                    "schema": lifecycle.JOURNAL_SCHEMA,
                    "budgets": {"budget": {}},
                    "jobs": {},
                },
                {
                    "schema": lifecycle.JOURNAL_SCHEMA,
                    "budgets": {},
                    "jobs": {"job-1": {}},
                },
            )
            for payload in malformed:
                with self.subTest(payload=payload):
                    path.write_text(json.dumps(payload))
                    with self.assertRaisesRegex(
                        lifecycle.LifecycleError, "schema is invalid"
                    ):
                        self.journal(path)

    def test_remote_completion_and_delivery_states_remain_distinct(self):
        open_pr = self.delivery(
            pr_state="open",
            pr_url="https://github.com/JovieInc/Jovie/pull/1",
            pr_head_sha="a" * 40,
        )
        self.assertEqual(
            lifecycle.classify_delivery_observation(self.delivery(), self.now)["state"],
            "delivery_missing",
        )
        self.assertEqual(
            lifecycle.classify_delivery_observation(open_pr, self.now)["state"],
            "pr_open",
        )
        merged = {**open_pr, "pr_state": "merged", "merge_sha": "b" * 40}
        self.assertEqual(
            lifecycle.classify_delivery_observation(merged, self.now)["state"],
            "merged_runtime_unverified",
        )
        exact = {
            **merged,
            "runtime": {
                "name": "symphony-4041",
                "sha": "b" * 40,
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
            lifecycle.plan_resolution({"state": "merged_runtime_unverified"})[
                "action"
            ],
            "reconcile_required_runtime_once",
        )
        self.assertTrue(
            lifecycle.plan_resolution({"state": "landed_verified"})["terminal"]
        )
        malformed = (
            ({"schema": "wrong"}, "invalid_delivery_schema"),
            ({**self.delivery(), "issue_id": ""}, "missing_delivery_identity"),
            ({**self.delivery(), "observed_at": "bad"}, "invalid_observed_at"),
            (
                {
                    **self.delivery(),
                    "observed_at": (self.now - timedelta(minutes=6)).isoformat(),
                },
                "delivery_observation_expired",
            ),
            ({**self.delivery(), "pr_state": "UNKNOWN"}, "pr_state_unknown"),
            (
                {
                    **open_pr,
                    "pr_url": "https://github.com/Other/Repo/pull/1",
                },
                "pr_identity_unproven",
            ),
            ({**open_pr, "pr_head_sha": "short"}, "pr_identity_unproven"),
            ({**merged, "merge_sha": "short"}, "merge_identity_unproven"),
            (
                {**merged, "runtime": {"name": "wrong"}},
                "exact_runtime_unproven",
            ),
            ({**self.delivery(), "pr_state": "closed_unmerged"}, "failure_ownership_unproven"),
        )
        for observation, reason in malformed:
            self.assertEqual(
                lifecycle.classify_delivery_observation(observation, self.now)[
                    "reason"
                ],
                reason,
            )
        closed = self.delivery(
            pr_state="closed_unmerged",
            failure_owner="symphony-owner",
            failure_receipt_sha256="d" * 64,
            pr_url="https://github.com/JovieInc/Jovie/pull/1",
            pr_head_sha="a" * 40,
        )
        self.assertEqual(
            lifecycle.classify_delivery_observation(closed, self.now)["state"],
            "delivery_failed",
        )
        self.assertEqual(
            lifecycle.plan_resolution({"state": "running"})["action"],
            "observe_same_thread",
        )

    def test_delivery_identity_revision_and_terminal_evidence_are_durable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            journal = self.journal(path)
            self.reserve_and_bind(journal)
            missing = self.delivery()
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("missing", 0, missing, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", True, missing, self.now)
            self.assertTrue(
                journal.observe_delivery("job-1", 0, missing, self.now)["recorded"]
            )
            self.assertTrue(
                journal.observe_delivery("job-1", 0, missing, self.now)["duplicate"]
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery(
                    "job-1", 0, {**missing, "pr_state": "open"}, self.now
                )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery(
                    "job-1", 1, {**missing, "lease_id": "other"}, self.now
                )
            exact = self.delivery(
                pr_state="merged",
                pr_url="https://github.com/JovieInc/Jovie/pull/1",
                pr_head_sha="a" * 40,
                merge_sha="b" * 40,
                runtime={
                    "name": "symphony-4041",
                    "sha": "b" * 40,
                    "receipt_sha256": "c" * 64,
                },
            )
            journal.observe_delivery("job-1", 1, exact, self.now)
            persisted = self.journal(path).data["jobs"]["job-1"]
            self.assertEqual(persisted["state"], "landed_verified")
            self.assertEqual(persisted["delivery"]["merge_sha"], "b" * 40)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 2, missing, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 2, exact, self.now)

    def test_delivery_evidence_cannot_regress_or_change_pr_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            self.reserve_and_bind(journal)
            journal.observe("job-1", 0, self.terminal_observation("failed"), self.now)
            unknown = self.delivery(pr_state="UNKNOWN")
            journal.observe_delivery("job-1", 0, unknown, self.now)
            self.assertEqual(journal.data["jobs"]["job-1"]["state"], "remote_failed")
            open_pr = self.delivery(
                pr_state="open",
                pr_url="https://github.com/JovieInc/Jovie/pull/1",
                pr_head_sha="a" * 40,
            )
            journal.observe_delivery("job-1", 1, open_pr, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery(
                    "job-1", 2,
                    {**open_pr, "pr_url": "https://github.com/JovieInc/Jovie/pull/2"},
                    self.now,
                )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.observe_delivery("job-1", 2, unknown, self.now)

    def test_issue_lease_and_delivery_contract_are_full_dispatch_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            journal.reserve_dispatch(self.envelope, self.now)
            for field, value in (
                ("issue_id", "JOV-OTHER"),
                ("lease_id", "lease-other"),
                ("expected_pr_repository", "Other/Repo"),
                ("required_runtime", "other-runtime"),
            ):
                with self.assertRaisesRegex(lifecycle.LifecycleError, "identity changed"):
                    journal.reserve_dispatch(
                        self.budget_envelope(**{field: value}), self.now
                    )

    def test_signed_reconciliation_reserves_and_binds_one_budgeted_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "journal.json"
            journal = self.journal(path)
            first, _ = self.reserve_and_bind(journal)
            failed = self.terminal_observation("failed")
            journal.observe("job-1", 0, failed, self.now)
            terminal = self.receipt(
                lifecycle.TERMINAL_RECEIPT_SCHEMA,
                "remote_failed",
                first["attempt_identity"],
                thread_id="thread-1",
                cost_usd=0.0,
                usage_receipt_sha256="e" * 64,
                observation_sha256=hashlib.sha256(
                    lifecycle._canonical_json(failed).encode()
                ).hexdigest(),
            )
            journal.settle_terminal("job-1", failed, terminal, self.now)
            journal.observe_delivery("job-1", 0, self.delivery(), self.now)
            action = journal.reserve_action_once("job-1")["reservation"]
            outcome = {
                "issue_id": "JOV-6005", "lease_id": "lease-1",
                "remote": "absent", "pr": "not_found",
                "observed_at": self.now.isoformat(),
            }
            signed = self.reconciliation_receipt(journal, action["id"], outcome)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.record_action_result(
                    "job-1", action["id"],
                    {**signed, "receipt_hmac_sha256": "0" * 64},
                    outcome, self.now,
                )
            journal.record_action_result(
                "job-1", action["id"], signed, outcome, self.now
            )
            retry = journal.reserve_retry_once("job-1", self.envelope, self.now)
            self.assertTrue(retry["execute"])
            self.assertEqual(retry["attempt"]["number"], 2)
            self.assertFalse(
                self.journal(path).reserve_retry_once(
                    "job-1", self.envelope, self.now
                )["execute"]
            )
            created = self.receipt(
                lifecycle.CREATE_RECEIPT_SCHEMA,
                "created",
                retry["attempt_identity"],
                thread_id="thread-2",
            )
            journal.bind_retry_thread(
                "job-1", retry["attempt_identity"], created, self.now
            )
            self.assertEqual(journal.data["jobs"]["job-1"]["thread_id"], "thread-2")

    def test_delivery_retry_rejects_existing_pr_and_changed_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            first, _ = self.reserve_and_bind(journal)
            failed = self.terminal_observation("failed")
            journal.observe("job-1", 0, failed, self.now)
            terminal = self.receipt(
                lifecycle.TERMINAL_RECEIPT_SCHEMA, "remote_failed",
                first["attempt_identity"], thread_id="thread-1", cost_usd=0.0,
                usage_receipt_sha256="e" * 64,
                observation_sha256=hashlib.sha256(
                    lifecycle._canonical_json(failed).encode()
                ).hexdigest(),
            )
            journal.settle_terminal("job-1", failed, terminal, self.now)
            action = journal.reserve_action_once("job-1")["reservation"]
            outcome = {
                "issue_id": "JOV-6005", "lease_id": "lease-1",
                "remote": "absent", "pr": "open",
                "pr_url": "https://github.com/JovieInc/Jovie/pull/1",
                "pr_head_sha": "a" * 40,
                "observed_at": self.now.isoformat(),
            }
            journal.record_action_result(
                "job-1", action["id"],
                self.reconciliation_receipt(journal, action["id"], outcome),
                outcome, self.now,
            )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_retry_once("job-1", self.envelope, self.now)
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_retry_once(
                    "job-1", self.budget_envelope(lease_id="lease-other"), self.now
                )
            with self.assertRaises(lifecycle.LifecycleError):
                journal.reserve_retry_once("missing", self.envelope, self.now)

    def test_reconciliation_receipt_rejects_each_untrusted_outcome_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            for index, updates in enumerate(
                (
                    None,
                    {"issue_id": "other"},
                    {"remote": "existing", "thread_id": "other"},
                    {"pr": "open", "pr_url": "bad", "pr_head_sha": "a" * 40},
                    {
                        "pr": "merged",
                        "pr_url": "https://github.com/JovieInc/Jovie/pull/1",
                        "pr_head_sha": "a" * 40,
                        "merge_sha": "bad",
                    },
                    {
                        "pr": "closed_unmerged",
                        "pr_url": "https://github.com/JovieInc/Jovie/pull/1",
                        "pr_head_sha": "a" * 40,
                    },
                )
            ):
                journal = self.journal(pathlib.Path(directory) / f"{index}.json")
                self.reserve_and_bind(journal)
                journal.observe(
                    "job-1", 0, self.observation(transport_lost=True), self.now
                )
                action = journal.reserve_action_once("job-1")["reservation"]
                base = {
                    "issue_id": "JOV-6005",
                    "lease_id": "lease-1",
                    "remote": "absent",
                    "pr": "not_found",
                    "observed_at": self.now.isoformat(),
                }
                outcome = None if updates is None else {**base, **updates}
                signed = (
                    "f" * 64
                    if outcome is None
                    else self.reconciliation_receipt(journal, action["id"], outcome)
                )
                with self.assertRaises(lifecycle.LifecycleError):
                    journal.record_action_result(
                        "job-1", action["id"], signed, outcome, self.now
                    )

    def test_issue_and_delivery_reconciliations_are_independently_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = self.journal(pathlib.Path(directory) / "journal.json")
            self.reserve_and_bind(journal)
            journal.observe("job-1", 0, self.observation(transport_lost=True), self.now)
            issue = journal.reserve_action_once("job-1")["reservation"]
            outcome = {
                "issue_id": "JOV-6005", "lease_id": "lease-1",
                "remote": "existing", "thread_id": "thread-1",
                "pr": "not_found", "observed_at": self.now.isoformat(),
            }
            journal.record_action_result(
                "job-1", issue["id"],
                self.reconciliation_receipt(journal, issue["id"], outcome),
                outcome, self.now,
            )
            journal.observe("job-1", 1, self.terminal_observation(), self.now)
            journal.observe_delivery("job-1", 0, self.delivery(), self.now)
            delivery = journal.reserve_action_once("job-1")["reservation"]
            self.assertEqual(issue["action"], "reconcile_issue_lifecycle_once")
            self.assertEqual(delivery["action"], "reconcile_delivery_once")
            self.assertFalse(journal.reserve_action_once("job-1")["execute"])


if __name__ == "__main__":
    unittest.main()
