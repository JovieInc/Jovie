#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[3]
SOURCE = ROOT / "scripts/symphony/hyperagent/lifecycle.py"
SPEC = importlib.util.spec_from_file_location("hyperagent_lifecycle", SOURCE)
lifecycle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lifecycle)


class HyperagentLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)
        self.envelope = {
            "schema": lifecycle.SCHEMA,
            "provider": "hyperagent",
            "route_selected": True,
            "authenticated": True,
            "oauth_scopes": ["threads:read", "threads:write", "approvals:read", "approvals:write"],
            "account_alias": "workspace-a",
            "expected_account_alias": "workspace-a",
            "workspace_id": "workspace-id-a",
            "agent_id": "agent-a",
            "agent_name": "GLM 5.3",
            "agent_mode": "auto",
            "task_class": "code",
            "model_id": "GLM 5.3",
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

    def approval(self, **updates):
        value = {
            "kind": "approval",
            "id": "approval-1",
            "state": "pending",
            "fingerprint": "action-1",
            "account_alias": "workspace-a",
            "destination": "local-artifact",
            "per_query_cap_usd": 1.0,
            "resolution_surface": "mcp",
        }
        value.update(updates)
        return value

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

    def expected_job(self):
        return {**self.envelope, "thread_id": "thread-1"}

    def land_proof(self, **updates):
        value = {
            "schema": lifecycle.LAND_SCHEMA,
            "thread_id": "thread-1",
            "idempotency_key": "job-1",
            "landed": True,
            "destination": "production",
            "merged_pr": 17453,
            "production_sha": "f" * 64,
            "merged_at": self.now.isoformat(),
        }
        value.update(updates)
        return value

    def test_preflight_accepts_only_a_complete_live_selected_route(self):
        self.assertEqual(lifecycle.validate_dispatch(self.envelope, self.now), {"decision": "PROCEED", "reasons": []})
        for field in (
            "account_alias", "expected_account_alias", "workspace_id", "agent_id",
            "agent_name", "model_id", "task_class", "runtime", "paying_org", "expected_paying_org",
            "credits_expire_at",
            "idempotency_key", "useful_outcome",
            "destination", "expected_destination", "balance_checked_at",
            "model_checked_at",
        ):
            changed = {**self.envelope, field: ""}
            self.assertEqual(lifecycle.validate_dispatch(changed, self.now)["decision"], "HOLD")

    def test_registry_admits_hyperagent_as_post_subscription_gateway_pool(self):
        registry = json.loads((ROOT / "scripts/symphony/config/model-registry.json").read_text())
        hyperagent = [model for model in registry["models"] if model["provider"] == "hyperagent"]
        self.assertEqual(
            [model["id"] for model in hyperagent],
            [
                "hyperagent-glm-5.3-flash",
                "hyperagent-glm-5.3",
                "hyperagent-kimi-k3",
                "hyperagent-deepseek-v4",
                "hyperagent-astra",
            ],
        )
        for model in hyperagent:
            self.assertEqual(model["channel"], "api")
            self.assertEqual(model["cost_tier"], "gateway-budgeted-paid")
            self.assertEqual(model["pool"], "hyperagent")
            self.assertEqual(model["probe_mode"], "json-model-key")
        for chain in registry["route_chains"].values():
            last_subscription = max(
                chain.index(model["id"])
                for model in registry["models"]
                if model["channel"] == "subscription"
            )
            for model in hyperagent:
                self.assertGreater(chain.index(model["id"]), last_subscription)

    def test_named_agent_is_selected_by_task_class(self):
        self.assertEqual(
            lifecycle.select_named_agent("architecture"),
            {"agent_name": "Fable 5.1", "model_id": "Fable 5.1"},
        )
        self.assertEqual(
            lifecycle.select_named_agent("mechanical"),
            {"agent_name": "Flash", "model_id": "Flash"},
        )
        self.assertEqual(
            lifecycle.select_named_agent("code"),
            {"agent_name": "GLM 5.3", "model_id": "GLM 5.3"},
        )
        self.assertEqual(
            lifecycle.select_named_agent("tests"),
            {"agent_name": "GLM 5.3", "model_id": "GLM 5.3"},
        )
        self.assertEqual(
            lifecycle.select_named_agent("review"),
            {"agent_name": "Fable 5.1", "model_id": "Fable 5.1"},
        )
        self.assertEqual(
            lifecycle.select_named_agent("design"),
            {"agent_name": "Fable 5.1", "model_id": "Fable 5.1"},
        )
        self.assertEqual(
            lifecycle.select_named_agent("root-cause"),
            {"agent_name": "Fable 5.1", "model_id": "Fable 5.1"},
        )
        with self.assertRaises(lifecycle.LifecycleError):
            lifecycle.select_named_agent("newest")
        with self.assertRaises(lifecycle.LifecycleError):
            lifecycle.select_named_agent(None)
        self.assertEqual(lifecycle.DISPATCH_AGENT_NAMES, {"Fable 5.1", "GLM 5.3", "Flash"})

    def test_preflight_fails_closed_on_named_model_mismatch_and_silent_alternatives(self):
        mismatched = {**self.envelope, "agent_name": "Fable 5.1", "model_id": "Fable 5.1"}
        decision = lifecycle.validate_dispatch(mismatched, self.now)
        self.assertEqual(decision["decision"], "HOLD")
        self.assertIn("named_agent_mismatch", [item["code"] for item in decision["reasons"]])
        self.assertIn("named_model_mismatch", [item["code"] for item in decision["reasons"]])
        for field, value, code in (
            ("model_id", "opus", "silent_model_alternative"),
            ("model_id", "newest", "silent_model_alternative"),
            ("model_id", "codex", "silent_model_alternative"),
            ("model_id", "live-cheapest-capable", "silent_model_alternative"),
            ("task_class", "newest", "unknown_task_class"),
            ("agent_name", "Jovie instruction eval — temporary", "temp_roster_agent"),
            ("agent_name", "Jovie Skills Audit Tranche 4 — GLM Flash", "temp_roster_agent"),
            ("agent_name", "GLM 5.3 Flash Developer (copy)", "temp_roster_agent"),
        ):
            changed = {**self.envelope, field: value}
            result = lifecycle.validate_dispatch(changed, self.now)
            self.assertIn(code, [item["code"] for item in result["reasons"]])
        pileup = lifecycle.validate_dispatch(
            {
                **self.envelope,
                "open_threads": [
                    {
                        "id": "thread-eval-1",
                        "name": "Agent Policy Decision Evaluation",
                        "agent_name": "Jovie instruction eval — temporary",
                    },
                    {
                        "id": "thread-eval-2",
                        "name": "Agent Policy Decision Evaluation",
                        "agent_name": "Jovie instruction eval — temporary",
                    },
                ],
            },
            self.now,
        )
        self.assertIn("usage_burn_pileup", [item["code"] for item in pileup["reasons"]])
        invalid = lifecycle.validate_dispatch({**self.envelope, "roster": {}, "open_threads": {}}, self.now)
        self.assertIn("invalid_roster", [item["code"] for item in invalid["reasons"]])
        self.assertIn("invalid_pileup", [item["code"] for item in invalid["reasons"]])

    def test_preflight_fails_closed_on_identity_auth_scope_mode_and_hash(self):
        mutations = (
            ("schema", "wrong", "invalid_schema"),
            ("provider", "other", "route_mismatch"),
            ("route_selected", False, "route_unselected"),
            ("authenticated", False, "authentication_unproven"),
            ("account_alias", "other", "account_mismatch"),
            ("paying_org", "other", "payer_mismatch"),
            ("destination", "other", "destination_mismatch"),
            ("oauth_scopes", ["threads:read"], "thread_scopes_unproven"),
            ("oauth_scopes", [], "thread_scopes_unproven"),
            ("oauth_scopes", "UNKNOWN", "thread_scopes_unproven"),
            ("oauth_scopes", ["threads:read", "threads:write", {}], "thread_scopes_unproven"),
            ("oauth_scopes", ["threads:read", "threads:write", ""], "thread_scopes_unproven"),
            ("invocation_surface", "web", "surface_mismatch"),
            ("agent_mode", "ask_first", "ask_first_mcp_incompatible"),
            ("agent_mode", "UNKNOWN", "agent_mode_unknown"),
            ("runtime_compatible", False, "runtime_incompatible"),
            ("turn_timeout_seconds", 0, "invalid_timeout"),
            ("tools", "UNKNOWN", "unknown_live_fact"),
            ("request_sha256", "A" * 64, "invalid_sha256"),
        )
        for field, value, code in mutations:
            decision = lifecycle.validate_dispatch({**self.envelope, field: value}, self.now)
            self.assertIn(code, [reason["code"] for reason in decision["reasons"]])

    def test_preflight_rejects_unknown_stale_or_unbounded_cost_evidence(self):
        changed = {
            **self.envelope,
            "balance_usd": 0.5,
            "model_price_usd": "UNKNOWN",
            "per_query_cap_usd": 30.0,
            "period_spend_usd": 9.5,
            "auto_recharge_enabled": True,
            "balance_checked_at": (self.now - timedelta(minutes=16)).isoformat(),
            "model_checked_at": (self.now + timedelta(minutes=1)).isoformat(),
            "credits_expire_at": (self.now - timedelta(seconds=1)).isoformat(),
        }
        codes = [reason["code"] for reason in lifecycle.validate_dispatch(changed, self.now)["reasons"]]
        for code in (
            "invalid_money", "insufficient_balance", "period_cap_exceeded",
            "auto_recharge_not_proven_off", "stale_live_fact",
            "credit_expiry_invalid",
        ):
            self.assertIn(code, codes)

        for field, value, code in (
            ("per_query_cap_usd", 0, "invalid_cap"),
            ("period_cap_usd", 0, "invalid_cap"),
            ("model_price_usd", 2, "model_price_exceeds_cap"),
        ):
            decision = lifecycle.validate_dispatch({**self.envelope, field: value}, self.now)
            self.assertIn(code, [reason["code"] for reason in decision["reasons"]])

        exact_boundary = {
            **self.envelope, "period_spend_usd": 0.1,
            "model_price_usd": 0.2, "per_query_cap_usd": 0.2,
            "period_cap_usd": 0.3,
        }
        self.assertEqual(lifecycle.validate_dispatch(exact_boundary, self.now)["decision"], "PROCEED")

    def test_nonfinite_balance_and_cost_receipts_fail_closed(self):
        for value in (float("inf"), float("-inf"), float("nan")):
            with self.subTest(balance=value):
                result = lifecycle.validate_dispatch(
                    {**self.envelope, "balance_usd": value}, self.now
                )
                self.assertIn("invalid_money", [item["code"] for item in result["reasons"]])

            with self.subTest(cost=value):
                observation = self.observation(
                    is_running=False, terminal_state="completed",
                    useful_outcome_verified=True, final_output_sha256="d" * 64,
                    usage_receipt_sha256="e" * 64, cost_usd=value,
                )
                self.assertEqual(
                    lifecycle.classify_observation(observation, self.now)["state"],
                    "terminal_unverified",
                )
        huge = 10**1000
        self.assertEqual(
            lifecycle.validate_dispatch(
                {**self.envelope, "per_query_cap_usd": huge}, self.now
            )["decision"],
            "HOLD",
        )
        self.assertEqual(
            lifecycle.classify_observation(
                self.observation(
                    is_running=False, terminal_state="completed",
                    useful_outcome_verified=True, final_output_sha256="d" * 64,
                    usage_receipt_sha256="e" * 64, cost_usd=huge,
                ),
                self.now,
                {**self.envelope, "thread_id": "thread-1"},
            )["state"],
            "terminal_unverified",
        )
        self.assertEqual(lifecycle.validate_dispatch(self.envelope, self.now)["decision"], "PROCEED")

    def test_observation_age_and_transport_loss_reconcile_the_original(self):
        stale = self.observation(observed_at=(self.now - timedelta(minutes=6)).isoformat())
        self.assertEqual(lifecycle.classify_observation(stale, self.now)["state"], "stale_status")
        lost = self.observation(transport_lost=True)
        classified = lifecycle.classify_observation(lost, self.now)
        self.assertEqual(classified["state"], "transport_unknown")
        self.assertEqual(lifecycle.plan_resolution(classified)["action"], "reconcile_original_thread_once")
        for observed_at in ("bad", (self.now + timedelta(seconds=1)).isoformat()):
            self.assertEqual(lifecycle.classify_observation(self.observation(observed_at=observed_at), self.now)["state"], "unknown")

    def test_provider_failures_have_bounded_distinct_actions(self):
        expected = {
            401: "authorized_reconnect_required",
            402: "billing_hold",
            403: "inspect_scope_or_policy",
            429: "honor_shared_cooldown",
            503: "reconcile_original_thread",
            418: "inspect_provider_failure",
        }
        for code, action in expected.items():
            extra = {"retry_after_seconds": 120} if code == 429 else {}
            classified = lifecycle.classify_observation(
                self.observation(provider_error=code, **extra), self.now
            )
            self.assertEqual(classified["state"], "provider_failure")
            self.assertEqual(
                lifecycle.plan_resolution(classified)["action"], action,
            )
            self.assertFalse(lifecycle.plan_resolution(classified)["execute"])
            self.assertEqual(
                lifecycle.plan_resolution(classified).get("requires_journal_reservation"),
                True if code == 503 else None,
            )
        unknown_cooldown = lifecycle.classify_observation(
            self.observation(provider_error=429), self.now
        )
        self.assertEqual(unknown_cooldown, {"state": "unknown", "reason": "retry_timing_unknown"})

    def test_actual_approval_requires_structured_identity_not_approval_words(self):
        prose_only = self.observation(last_message="Please approve this ordinary response")
        self.assertEqual(lifecycle.classify_observation(prose_only, self.now)["state"], "running")
        actual = lifecycle.classify_observation(
            self.observation(interaction=self.approval()), self.now, self.expected_job()
        )
        self.assertEqual(actual["state"], "approval_required")
        for changed in (
            self.approval(id=""), self.approval(state="approved"),
            self.approval(resolution_surface="UNKNOWN"), self.approval(per_query_cap_usd="UNKNOWN"),
        ):
            self.assertEqual(lifecycle.classify_observation(self.observation(interaction=changed), self.now)["state"], "unknown")

    def test_approval_resolution_requires_exact_authority_scope_and_surface(self):
        classified = lifecycle.classify_observation(
            self.observation(interaction=self.approval()), self.now, self.expected_job()
        )
        self.assertEqual(lifecycle.plan_resolution(classified)["action"], "surface_exact_approval")
        self.assertEqual(lifecycle.plan_resolution(classified, self.authority(), ["approvals:read"])["action"], "surface_exact_approval")
        allowed = lifecycle.plan_resolution(classified, self.authority(), ["approvals:write"])
        self.assertEqual(allowed["action"], "resolve_approval_once")
        self.assertTrue(allowed["requires_journal_reservation"])
        self.assertFalse(allowed["execute"])
        for field, value in (
            ("thread_id", "other"), ("idempotency_key", "other"),
            ("user_authorized", False), ("interaction_id", "other"),
            ("fingerprint", "other"),
            ("account_alias", "other"), ("destination", "other"),
            ("per_query_cap_usd", 2.0),
        ):
            mismatched = lifecycle.plan_resolution(
                classified, self.authority(**{field: value}), ["approvals:write"]
            )
            self.assertEqual(mismatched, {"action": "surface_exact_approval", "execute": False})
        incomplete = {"state": "approval_required", "interaction": self.approval()}
        self.assertEqual(
            lifecycle.plan_resolution(incomplete, {"user_authorized": True}, ["approvals:write"]),
            {"action": "surface_exact_approval", "execute": False},
        )
        for field, value in (
            ("account_alias", "other"), ("destination", "other"),
            ("per_query_cap_usd", 2.0),
        ):
            escalated = self.approval(**{field: value})
            self.assertEqual(
                lifecycle.classify_observation(
                    self.observation(interaction=escalated), self.now, self.expected_job()
                )["state"],
                "unknown",
            )

    def test_web_only_approval_needs_an_attended_exactly_authorized_fallback(self):
        approval = self.approval(resolution_surface="web_only")
        classified = lifecycle.classify_observation(
            self.observation(interaction=approval), self.now, self.expected_job()
        )
        self.assertEqual(
            lifecycle.plan_resolution(classified, self.authority()),
            {"action": "surface_exact_approval", "execute": False},
        )
        allowed = lifecycle.plan_resolution(classified, self.authority(attended_browser=True))
        self.assertEqual(allowed["action"], "open_attended_thread_once")
        self.assertTrue(allowed["requires_journal_reservation"])

    def test_input_memory_and_domain_are_not_collapsed_into_approval(self):
        input_interaction = {
            "kind": "input", "prompt_sha256": "b" * 64,
            "account_alias": "workspace-a", "destination": "local-artifact",
            "per_query_cap_usd": 1.0,
        }
        input_state = lifecycle.classify_observation(
            self.observation(interaction=input_interaction), self.now, self.expected_job()
        )
        self.assertEqual(input_state["state"], "input_required")
        self.assertFalse(lifecycle.plan_resolution(input_state)["execute"])
        input_action = lifecycle.plan_resolution(
            input_state,
            {
                **self.authority(), "input_authorized": True,
                "prompt_sha256": "b" * 64, "response_sha256": "c" * 64,
            },
            ["threads:write"],
        )
        self.assertEqual(input_action["action"], "send_message_once")
        self.assertTrue(input_action["requires_journal_reservation"])
        self.assertFalse(input_action["execute"])
        input_authority = {
            **self.authority(), "input_authorized": True,
            "prompt_sha256": "b" * 64, "response_sha256": "c" * 64,
        }
        for field, value in (
            ("thread_id", "other"), ("idempotency_key", "other"),
            ("input_authorized", False), ("prompt_sha256", "d" * 64),
            ("response_sha256", "short"), ("account_alias", "other"),
            ("destination", "other"), ("per_query_cap_usd", 2.0),
        ):
            rejected = lifecycle.plan_resolution(
                input_state, {**input_authority, field: value}, ["threads:write"]
            )
            self.assertEqual(rejected, {"action": "surface_required_input", "execute": False})
        self.assertEqual(
            lifecycle.plan_resolution(input_state, input_authority, ["threads:read"]),
            {"action": "surface_required_input", "execute": False},
        )
        for field, value in (
            ("account_alias", "other"), ("destination", "other"),
            ("per_query_cap_usd", 2.0),
        ):
            escalated = {**input_interaction, field: value}
            self.assertEqual(
                lifecycle.classify_observation(
                    self.observation(interaction=escalated), self.now, self.expected_job()
                )["state"],
                "unknown",
            )
        malformed_input = self.observation(interaction={"kind": "input", "prompt_sha256": "short"})
        self.assertEqual(lifecycle.classify_observation(malformed_input, self.now)["state"], "unknown")

        memory = lifecycle.classify_observation(
            self.observation(interaction={"kind": "memory_decision", "id": "memory-1"}), self.now
        )
        self.assertEqual(memory["state"], "memory_decision_required")
        self.assertFalse(lifecycle.plan_resolution(memory)["execute"])
        memory_action = lifecycle.plan_resolution(
            memory,
            {"memory_decision_authorized": True, "interaction_id": "memory-1", "decision": "reject"},
        )
        self.assertEqual(memory_action["action"], "surface_memory_decision")
        memory_action = lifecycle.plan_resolution(
            memory,
            {
                **self.authority(), "memory_decision_authorized": True,
                "interaction_id": "memory-1", "decision": "reject",
            },
        )
        self.assertEqual(memory_action["action"], "record_memory_decision_once")
        self.assertTrue(memory_action["requires_journal_reservation"])
        memory_authority = {
            **self.authority(), "memory_decision_authorized": True,
            "interaction_id": "memory-1", "decision": "reject",
        }
        for field, value in (
            ("thread_id", "other"), ("idempotency_key", "other"),
            ("memory_decision_authorized", False), ("interaction_id", "other"),
            ("decision", "UNKNOWN"),
        ):
            self.assertEqual(
                lifecycle.plan_resolution(memory, {**memory_authority, field: value}),
                {"action": "surface_memory_decision", "execute": False},
            )
        malformed_memory = self.observation(interaction={"kind": "memory_decision", "id": ""})
        self.assertEqual(lifecycle.classify_observation(malformed_memory, self.now)["state"], "unknown")

        domain = lifecycle.classify_observation(
            self.observation(interaction={"kind": "sandbox_domain", "domain": "example.com"}), self.now
        )
        self.assertEqual(lifecycle.plan_resolution(domain)["action"], "surface_domain_approval")
        malformed_domain = self.observation(interaction={"kind": "sandbox_domain", "domain": ""})
        self.assertEqual(lifecycle.classify_observation(malformed_domain, self.now)["state"], "unknown")

    def test_terminal_success_requires_useful_output_usage_and_cost_receipts(self):
        success = self.observation(
            is_running=False,
            terminal_state="completed",
            account_alias="workspace-a",
            destination="local-artifact",
            model_id="GLM 5.3",
            useful_outcome_verified=True,
            final_output_sha256="d" * 64,
            usage_receipt_sha256="e" * 64,
            cost_usd=0.5,
            land=self.land_proof(),
        )
        expected_job = self.expected_job()
        classified = lifecycle.classify_observation(success, self.now, expected_job)
        self.assertEqual(classified["state"], "useful_success")
        unfinished = {k: v for k, v in success.items() if k != "land"}
        self.assertEqual(
            lifecycle.classify_observation(unfinished, self.now, expected_job)["state"],
            "land_not_complete",
        )
        self.assertEqual(
            lifecycle.plan_resolution(
                lifecycle.classify_observation(unfinished, self.now, expected_job)
            )["action"],
            "close_or_land_original_thread",
        )
        for field, value in (
            ("landed", False),
            ("destination", "preview"),
            ("thread_id", "other"),
            ("merged_pr", 0),
            ("production_sha", "short"),
            ("schema", "wrong"),
        ):
            self.assertEqual(
                lifecycle.classify_observation(
                    {**unfinished, "land": self.land_proof(**{field: value})},
                    self.now,
                    expected_job,
                )["state"],
                "land_not_complete",
            )
        self.assertEqual(lifecycle.plan_resolution(classified)["action"], "record_terminal_receipt")
        for field, value in (
            ("useful_outcome_verified", False), ("final_output_sha256", "short"),
            ("usage_receipt_sha256", "short"), ("cost_usd", "UNKNOWN"),
        ):
            failed = lifecycle.classify_observation({**success, field: value}, self.now, expected_job)
            self.assertEqual(failed["state"], "terminal_unverified")
            self.assertEqual(lifecycle.plan_resolution(failed)["action"], "reconcile_terminal_receipts_once")
        for field, value in (
            ("provider_error", "429"), ("transport_lost", "true"),
            ("interaction", [self.approval()]),
        ):
            failed = lifecycle.classify_observation(
                {**success, field: value}, self.now, expected_job
            )
            self.assertEqual(failed["state"], "unknown")
        for field, value in (
            ("thread_id", "other"), ("idempotency_key", "other"),
            ("account_alias", "other"), ("destination", "other"),
            ("model_id", "other"), ("cost_usd", 1.01),
        ):
            failed = lifecycle.classify_observation(
                {**success, field: value}, self.now, expected_job
            )
            self.assertEqual(
                failed["state"],
                "unknown" if field in {"thread_id", "idempotency_key"} else "terminal_unverified",
            )
        self.assertEqual(
            lifecycle.classify_observation(success, self.now)["state"],
            "terminal_unverified",
        )
        period_exhausted = {**expected_job, "period_spend_usd": 9.8}
        self.assertEqual(
            lifecycle.classify_observation(success, self.now, period_exhausted)["state"],
            "terminal_unverified",
        )

    def test_terminal_failure_decline_cancel_and_unknown_remain_distinct(self):
        expected = {"failed": "terminal_failed", "declined": "declined", "cancelled": "cancelled"}
        for terminal, state in expected.items():
            result = lifecycle.classify_observation(
                self.observation(is_running=False, terminal_state=terminal),
                self.now,
                self.expected_job(),
            )
            self.assertEqual(result["state"], state)
            mismatched = lifecycle.classify_observation(
                self.observation(
                    thread_id="other", is_running=False, terminal_state=terminal
                ),
                self.now,
                self.expected_job(),
            )
            self.assertEqual(mismatched["state"], "unknown")
        for updates in (
            {"thread_id": "other"},
            {"thread_id": "other", "transport_lost": True},
            {"thread_id": "other", "provider_error": 503},
            {"thread_id": "other", "interaction": {"kind": "memory_decision", "id": "memory-1"}},
        ):
            result = lifecycle.classify_observation(
                self.observation(**updates), self.now, self.expected_job()
            )
            self.assertEqual(result, {"state": "unknown", "reason": "observation_job_mismatch"})
        self.assertEqual(
            lifecycle.classify_observation(self.observation(), self.now, {})["state"],
            "unknown",
        )
        self.assertEqual(lifecycle.classify_observation(self.observation(is_running="UNKNOWN"), self.now)["state"], "unknown")
        self.assertEqual(lifecycle.classify_observation({"schema": "wrong"}, self.now)["state"], "unknown")
        self.assertEqual(lifecycle.classify_observation({"schema": lifecycle.SCHEMA}, self.now)["reason"], "missing_job_identity")
        unknown_interaction = self.observation(interaction={"kind": "something_else"})
        self.assertEqual(lifecycle.classify_observation(unknown_interaction, self.now)["state"], "unknown")
        self.assertEqual(lifecycle.plan_resolution({"state": "unknown"})["action"], "hold_unknown")
        for terminal_state in ({}, "succeeded"):
            self.assertEqual(
                lifecycle.classify_observation(
                    self.observation(is_running=False, terminal_state=terminal_state), self.now
                )["state"],
                "unknown",
            )
        malformed_surface = self.observation(
            interaction=self.approval(resolution_surface=[])
        )
        self.assertEqual(
            lifecycle.classify_observation(malformed_surface, self.now)["state"],
            "unknown",
        )
        for state in ("stale_status", "transport_unknown", "terminal_failed", "terminal_unverified"):
            self.assertEqual(
                lifecycle.plan_resolution({"state": state})["action"], "hold_unknown"
            )

    def test_roster_and_pileup_exclude_temp_agents_and_usage_burns(self):
        roster = lifecycle.classify_roster([
            {"id": "named-glm", "name": "GLM 5.3"},
            {"id": "named-fable", "name": "Fable 5.1"},
            {"id": "named-flash", "name": "Flash"},
            {
                "id": "cmto9hsuk01wl06adf6f8632n",
                "name": "Jovie instruction eval — temporary",
                "description": "Temporary isolated synthetic decision trials",
            },
            {
                "id": "cmtqr4e1e0fff07advjvz1xft",
                "name": "Jovie Skills Audit Tranche 4 — GLM Flash",
                "description": "Temporary read-only auditor",
            },
            {"id": "copy", "name": "GLM 5.3 Flash Developer (copy)"},
            {"id": "eve", "name": "Eve - Prodcut"},
            "bad",
        ])
        self.assertEqual(roster["schema"], lifecycle.LAND_SCHEMA)
        self.assertEqual(
            {item["name"] for item in roster["eligible"]},
            {"GLM 5.3", "Fable 5.1", "Flash"},
        )
        excluded_reasons = {item.get("name"): item["reason"] for item in roster["excluded"] if item.get("name")}
        self.assertEqual(excluded_reasons["Jovie instruction eval — temporary"], "temp_roster_agent")
        self.assertEqual(excluded_reasons["Jovie Skills Audit Tranche 4 — GLM Flash"], "temp_roster_agent")
        self.assertEqual(excluded_reasons["GLM 5.3 Flash Developer (copy)"], "temp_roster_agent")
        self.assertEqual(excluded_reasons["Eve - Prodcut"], "not_named_dispatch_agent")
        self.assertTrue(any(item["reason"] == "invalid_agent" for item in roster["excluded"]))
        self.assertEqual(lifecycle.classify_roster({})["reason"], "invalid_roster")

        now = self.now
        stale = (now - timedelta(hours=2)).isoformat()
        pileup = lifecycle.classify_pileup(
            [
                {
                    "id": "eval-1",
                    "name": "Agent Policy Decision Evaluation",
                    "agent_name": "Jovie instruction eval — temporary",
                    "updatedAt": now.isoformat(),
                    "terminal_state": "completed",
                },
                {
                    "id": "eval-2",
                    "name": "Agent Policy Decision Evaluation",
                    "agent_name": "Jovie instruction eval — temporary",
                    "updatedAt": now.isoformat(),
                    "terminal_state": "completed",
                },
                {
                    "id": "stale-1",
                    "name": "JOV-1 land",
                    "agent_name": "GLM 5.3",
                    "is_running": True,
                    "updated_at": stale,
                },
                {
                    "id": "fail-1",
                    "name": "JOV-2 land",
                    "agent_name": "Flash",
                    "terminal_state": "failed",
                },
                {"id": ""},
                "bad",
            ],
            now=now,
        )
        self.assertEqual(pileup["status"], "pileup")
        kinds = {item["kind"] for item in pileup["burns"]}
        self.assertIn("duplicate", kinds)
        self.assertIn("temp_roster_burn", kinds)
        self.assertIn("stale", kinds)
        self.assertIn("failed_burn", kinds)
        self.assertIn("land_not_complete", kinds)
        self.assertIn("invalid_thread", kinds)
        self.assertEqual(lifecycle.classify_pileup({}, now=now)["status"], "unknown")
        clear = lifecycle.classify_pileup(
            [{
                "id": "landed-1",
                "name": "JOV-3",
                "agent_name": "GLM 5.3",
                "terminal_state": "completed",
                "landed": True,
                "destination": "production",
                "updated_at": now.isoformat(),
                "is_running": False,
            }],
            now=now,
        )
        self.assertEqual(clear["status"], "clear")
        burned = lifecycle.plan_resolution({
            "state": "failed_burn",
            "job": {"thread_id": "fail-1", "idempotency_key": "job-1"},
        })
        self.assertEqual(burned["action"], "quarantine_failed_burn")
        self.assertFalse(burned["execute"])
        self.assertEqual(
            lifecycle.plan_resolution({"state": "land_not_complete"})["action"],
            "hold_unknown",
        )
        self.assertEqual(
            lifecycle.plan_resolution({"state": "failed_burn"})["action"],
            "hold_unknown",
        )
        self.assertEqual(lifecycle.plan_resolution(None)["action"], "hold_unknown")
        self.assertEqual(
            lifecycle.validate_dispatch(
                {**self.envelope, "agent_id": "Jovie instruction eval — temporary"},
                self.now,
            )["decision"],
            "HOLD",
        )
        described = lifecycle.validate_dispatch(
            {
                **self.envelope,
                "roster": [{
                    "name": "GLM 5.3",
                    "description": "temporary isolated eval copy",
                }],
            },
            self.now,
        )
        self.assertIn("temp_roster_agent", [item["code"] for item in described["reasons"]])
        self.assertEqual(
            lifecycle.validate_dispatch({**self.envelope, "open_threads": []}, self.now)["decision"],
            "PROCEED",
        )
        self.assertFalse(lifecycle.is_temp_roster_agent(""))
        self.assertFalse(lifecycle.is_temp_roster_agent(None))
        mismatch_land = lifecycle.classify_observation(
            {
                **self.observation(
                    is_running=False, terminal_state="completed",
                    account_alias="workspace-a", destination="local-artifact",
                    model_id="GLM 5.3", useful_outcome_verified=True,
                    final_output_sha256="d" * 64, usage_receipt_sha256="e" * 64,
                    cost_usd=0.5,
                ),
                "land": self.land_proof(idempotency_key="other", merged_pr=True),
            },
            self.now,
            self.expected_job(),
        )
        self.assertEqual(mismatch_land["state"], "land_not_complete")

    def test_cli_preflight_and_classification_are_machine_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            envelope = root / "envelope.json"
            observation = root / "observation.json"
            actual_now = datetime.now(timezone.utc)
            current = {
                **self.envelope,
                "balance_checked_at": actual_now.isoformat(),
                "model_checked_at": actual_now.isoformat(),
                "credits_expire_at": (actual_now + timedelta(days=30)).isoformat(),
            }
            envelope.write_text(json.dumps(current))
            observation.write_text(json.dumps({
                "schema": lifecycle.SCHEMA,
                "observed_at": actual_now.isoformat(),
                "thread_id": "thread-1",
                "idempotency_key": "job-1",
                "is_running": True,
            }))
            checked = subprocess.run(
                ["python3", str(SOURCE), "preflight", "--envelope", str(envelope)],
                text=True, capture_output=True, check=True,
            )
            self.assertEqual(json.loads(checked.stdout)["decision"], "PROCEED")
            classified = subprocess.run(
                ["python3", str(SOURCE), "classify", "--observation", str(observation)],
                text=True, capture_output=True, check=True,
            )
            self.assertEqual(json.loads(classified.stdout)["state"], "running")
            observation.write_text(json.dumps({
                **json.loads(observation.read_text()),
                "is_running": False,
                "terminal_state": "completed",
                "account_alias": "workspace-a",
                "destination": "local-artifact",
                "model_id": "GLM 5.3",
                "useful_outcome_verified": True,
                "final_output_sha256": "d" * 64,
                "usage_receipt_sha256": "e" * 64,
                "cost_usd": 0.5,
            }))
            terminal = subprocess.run(
                ["python3", str(SOURCE), "classify", "--observation", str(observation)],
                text=True, capture_output=True, check=True,
            )
            self.assertEqual(json.loads(terminal.stdout)["state"], "terminal_unverified")


if __name__ == "__main__":
    unittest.main()
