#!/usr/bin/env python3
"""Fail-closed Hyperagent MCP lifecycle adapter.

This module validates dispatches and classifies structured provider observations.
It never calls Hyperagent, resolves an approval, sends a message, or starts work.
The canonical Symphony router remains the only dispatch-selection owner.
The classify CLI is diagnostic and cannot certify terminal success; journal-bound
Python callers must provide the persisted expected job.
"""
from __future__ import annotations

import argparse
import fcntl
import functools
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import stat
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

SCHEMA = "symphony-hyperagent-lifecycle/v1"
DELIVERY_SCHEMA = "symphony-hyperagent-delivery/v1"
JOURNAL_SCHEMA = "symphony-hyperagent-journal/v2"
BUDGET_RECEIPT_SCHEMA = "symphony-hyperagent-budget-receipt/v1"
CREATE_RECEIPT_SCHEMA = "symphony-hyperagent-create-receipt/v1"
TERMINAL_RECEIPT_SCHEMA = "symphony-hyperagent-terminal-receipt/v1"
RECONCILIATION_RECEIPT_SCHEMA = "symphony-hyperagent-reconciliation-receipt/v1"
MAX_OBSERVATION_AGE_SECONDS = 300
MAX_LIVE_FACT_AGE_SECONDS = 900
REMOTE_TERMINAL_STATES = frozenset(
    {"remote_useful_success", "remote_failed", "remote_declined", "remote_cancelled"}
)
TERMINAL_STATES = frozenset({"landed_verified", "delivery_failed"})
PROVIDER_ACTIONS = {
    401: "authorized_reconnect_required",
    402: "billing_hold",
    403: "inspect_scope_or_policy",
    429: "honor_shared_cooldown",
}
DISPATCH_IDENTITY_FIELDS = (
    "provider",
    "route_selected",
    "authenticated",
    "oauth_scopes",
    "account_alias",
    "expected_account_alias",
    "workspace_id",
    "agent_id",
    "agent_name",
    "agent_mode",
    "model_id",
    "model_price_usd",
    "runtime",
    "runtime_compatible",
    "turn_timeout_seconds",
    "tools",
    "integrations",
    "delegation_allowlist",
    "invocation_surface",
    "idempotency_key",
    "request_sha256",
    "useful_outcome",
    "destination",
    "expected_destination",
    "per_query_cap_usd",
    "period_cap_usd",
    "auto_recharge_enabled",
    "paying_org",
    "expected_paying_org",
    "paying_org_id",
    "expected_paying_org_id",
    "budget_period_id",
    "issue_id",
    "lease_id",
    "expected_pr_repository",
    "required_runtime",
)
SET_LIKE_IDENTITY_FIELDS = frozenset(
    {"oauth_scopes", "tools", "integrations", "delegation_allowlist"}
)
MONEY_IDENTITY_FIELDS = frozenset(
    {"model_price_usd", "per_query_cap_usd", "period_cap_usd"}
)


class LifecycleError(ValueError):
    pass


def _locked_mutation(method):
    @functools.wraps(method)
    def wrapped(self, *args, **kwargs):
        with self._locked():
            return method(self, *args, **kwargs)

    return wrapped


def _valid_sha256(value):
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def _valid_git_sha(value):
    return (
        isinstance(value, str)
        and len(value) in {40, 64}
        and all(character in "0123456789abcdef" for character in value)
    )


def _valid_pr_url(value, repository):
    prefix = f"https://github.com/{repository}/pull/"
    number = value.removeprefix(prefix) if isinstance(value, str) else ""
    return (
        isinstance(value, str)
        and value.startswith(prefix)
        and number.isascii()
        and number.isdecimal()
    )


def _delivery_resolved(remote_state, delivery_state):
    return delivery_state in {
        "pr_open", "merged_runtime_unverified", *TERMINAL_STATES,
    } or (
        delivery_state == "delivery_missing"
        and remote_state == "remote_useful_success"
    )


def _aggregate_state(remote_state, delivery_state):
    return (
        delivery_state
        if _delivery_resolved(remote_state, delivery_state)
        else remote_state
    )


def _parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _money(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return False
    return parsed.is_finite() and parsed >= 0


def _decimal_money(value):
    if not _money(value):
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def _codes(reasons):
    return [{"code": code, "field": field} for code, field in reasons]


def _canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _dispatch_identity(envelope):
    identity = {}
    for field in DISPATCH_IDENTITY_FIELDS:
        value = envelope[field]
        if field in SET_LIKE_IDENTITY_FIELDS:
            value = sorted(value)
        elif field in MONEY_IDENTITY_FIELDS:
            value = str(Decimal(str(value)).normalize())
        identity[field] = value
    return identity


def _identity_sha256(envelope):
    return hashlib.sha256(_canonical_json(_dispatch_identity(envelope)).encode()).hexdigest()


def _receipt_payload(receipt):
    return {
        key: value
        for key, value in receipt.items()
        if key != "receipt_hmac_sha256"
    }


def _budget_receipt_payload(envelope):
    return {
        "schema": BUDGET_RECEIPT_SCHEMA,
        "provider": envelope["provider"],
        "paying_org_id": envelope["paying_org_id"],
        "workspace_id": envelope["workspace_id"],
        "account_alias": envelope["account_alias"],
        "budget_period_id": envelope["budget_period_id"],
        "period_cap_usd": str(Decimal(str(envelope["period_cap_usd"])).normalize()),
        "period_spend_usd": str(
            Decimal(str(envelope["period_spend_usd"])).normalize()
        ),
        "balance_usd": str(Decimal(str(envelope["balance_usd"])).normalize()),
        "observed_at": envelope["budget_period_checked_at"],
    }


def _valid_job_identity(job):
    return isinstance(job, dict) and all(
        isinstance(job.get(field), str) and job[field]
        for field in ("thread_id", "idempotency_key")
    )


def _terminal_authority_matches(observation, expected_job):
    if not _valid_job_identity(expected_job):
        return False
    identity_fields = (
        "thread_id", "idempotency_key", "account_alias", "destination", "model_id"
    )
    if not all(
        isinstance(expected_job.get(field), str)
        and expected_job[field]
        and observation.get(field) == expected_job[field]
        for field in identity_fields
    ):
        return False
    cost = _decimal_money(observation.get("cost_usd"))
    run_cap = _decimal_money(expected_job.get("per_query_cap_usd"))
    period_cap = _decimal_money(expected_job.get("period_cap_usd"))
    period_spend = _decimal_money(expected_job.get("period_spend_usd"))
    return (
        None not in (cost, run_cap, period_cap, period_spend)
        and cost <= run_cap
        and period_spend + cost <= period_cap
    )


def _interaction_matches_dispatch(interaction, observed_job, expected_job):
    if not _valid_job_identity(expected_job) or observed_job != {
        "thread_id": expected_job["thread_id"],
        "idempotency_key": expected_job["idempotency_key"],
    }:
        return False
    if not all(
        isinstance(expected_job.get(field), str)
        and expected_job[field]
        and interaction.get(field) == expected_job[field]
        for field in ("account_alias", "destination")
    ):
        return False
    requested_cap = _decimal_money(interaction.get("per_query_cap_usd"))
    admitted_cap = _decimal_money(expected_job.get("per_query_cap_usd"))
    return (
        requested_cap is not None
        and admitted_cap is not None
        and requested_cap <= admitted_cap
    )


def validate_dispatch(envelope, now=None):
    """Validate live routing/account/cost evidence before an MCP create call."""
    now = now or datetime.now(timezone.utc)
    reasons = []
    if not isinstance(envelope, dict) or envelope.get("schema") != SCHEMA:
        return {"decision": "HOLD", "reasons": _codes([("invalid_schema", "schema")])}
    required_text = (
        "account_alias",
        "expected_account_alias",
        "workspace_id",
        "agent_id",
        "agent_name",
        "model_id",
        "budget_period_id",
        "budget_period_receipt_sha256",
        "budget_period_checked_at",
        "runtime",
        "paying_org",
        "expected_paying_org",
        "paying_org_id",
        "expected_paying_org_id",
        "issue_id",
        "lease_id",
        "expected_pr_repository",
        "required_runtime",
        "idempotency_key",
        "request_sha256",
        "useful_outcome",
        "destination",
        "expected_destination",
        "balance_checked_at",
        "model_checked_at",
        "credits_expire_at",
    )
    for field in required_text:
        if not isinstance(envelope.get(field), str) or not envelope[field]:
            reasons.append(("unknown_live_fact", field))
    if envelope.get("provider") != "hyperagent":
        reasons.append(("route_mismatch", "provider"))
    if envelope.get("route_selected") is not True:
        reasons.append(("route_unselected", "route_selected"))
    if envelope.get("authenticated") is not True:
        reasons.append(("authentication_unproven", "authenticated"))
    if envelope.get("account_alias") != envelope.get("expected_account_alias"):
        reasons.append(("account_mismatch", "account_alias"))
    if envelope.get("paying_org") != envelope.get("expected_paying_org"):
        reasons.append(("payer_mismatch", "paying_org"))
    if envelope.get("paying_org_id") != envelope.get("expected_paying_org_id"):
        reasons.append(("payer_mismatch", "paying_org_id"))
    if envelope.get("destination") != envelope.get("expected_destination"):
        reasons.append(("destination_mismatch", "destination"))
    scopes = envelope.get("oauth_scopes")
    if (
        not isinstance(scopes, list)
        or not all(isinstance(scope, str) and scope for scope in scopes)
        or not {"threads:read", "threads:write"}.issubset(scopes)
    ):
        reasons.append(("thread_scopes_unproven", "oauth_scopes"))
    if envelope.get("invocation_surface") != "mcp":
        reasons.append(("surface_mismatch", "invocation_surface"))
    if envelope.get("agent_mode") == "ask_first":
        reasons.append(("ask_first_mcp_incompatible", "agent_mode"))
    elif envelope.get("agent_mode") != "auto":
        reasons.append(("agent_mode_unknown", "agent_mode"))
    if envelope.get("runtime_compatible") is not True:
        reasons.append(("runtime_incompatible", "runtime_compatible"))
    timeout = envelope.get("turn_timeout_seconds")
    if not isinstance(timeout, int) or isinstance(timeout, bool) or timeout <= 0:
        reasons.append(("invalid_timeout", "turn_timeout_seconds"))
    for field in ("tools", "integrations", "delegation_allowlist"):
        value = envelope.get(field)
        if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
            reasons.append(("unknown_live_fact", field))
    if not _valid_sha256(envelope.get("request_sha256")):
        reasons.append(("invalid_sha256", "request_sha256"))
    if not _valid_sha256(envelope.get("budget_period_receipt_sha256")):
        reasons.append(("invalid_sha256", "budget_period_receipt_sha256"))
    for field in (
        "model_price_usd", "balance_usd", "per_query_cap_usd",
        "period_cap_usd", "period_spend_usd",
    ):
        if not _money(envelope.get(field)):
            reasons.append(("invalid_money", field))
    balance = envelope.get("balance_usd")
    run_cap = envelope.get("per_query_cap_usd")
    period_cap = envelope.get("period_cap_usd")
    period_spend = envelope.get("period_spend_usd")
    decimal_balance = _decimal_money(balance)
    decimal_run_cap = _decimal_money(run_cap)
    decimal_period_cap = _decimal_money(period_cap)
    decimal_period_spend = _decimal_money(period_spend)
    if decimal_balance is not None and decimal_run_cap is not None and decimal_run_cap > decimal_balance:
        reasons.append(("insufficient_balance", "per_query_cap_usd"))
    if _money(run_cap) and run_cap <= 0:
        reasons.append(("invalid_cap", "per_query_cap_usd"))
    if _money(period_cap) and period_cap <= 0:
        reasons.append(("invalid_cap", "period_cap_usd"))
    model_price = envelope.get("model_price_usd")
    if _money(model_price) and _money(run_cap) and model_price > run_cap:
        reasons.append(("model_price_exceeds_cap", "model_price_usd"))
    if _money(model_price) and _money(balance) and model_price > balance:
        reasons.append(("insufficient_balance", "model_price_usd"))
    if None not in (decimal_period_cap, decimal_period_spend, decimal_run_cap):
        if decimal_period_spend + decimal_run_cap > decimal_period_cap:
            reasons.append(("period_cap_exceeded", "period_cap_usd"))
    if envelope.get("auto_recharge_enabled") is not False:
        reasons.append(("auto_recharge_not_proven_off", "auto_recharge_enabled"))
    for field in ("balance_checked_at", "model_checked_at", "budget_period_checked_at"):
        checked = _parse_time(envelope.get(field))
        if checked is None or checked > now or (now - checked).total_seconds() > MAX_LIVE_FACT_AGE_SECONDS:
            reasons.append(("stale_live_fact", field))
    expiry = _parse_time(envelope.get("credits_expire_at"))
    if expiry is None or expiry <= now:
        reasons.append(("credit_expiry_invalid", "credits_expire_at"))
    return {"decision": "PROCEED" if not reasons else "HOLD", "reasons": _codes(reasons)}


def classify_observation(observation, now=None, expected_job=None):
    """Classify structured provider evidence without guessing from prose."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(observation, dict) or observation.get("schema") != SCHEMA:
        return {"state": "unknown", "reason": "invalid_schema"}
    if not all(
        isinstance(observation.get(field), str) and observation[field]
        for field in ("thread_id", "idempotency_key")
    ):
        return {"state": "unknown", "reason": "missing_job_identity"}
    job = {
        "thread_id": observation["thread_id"],
        "idempotency_key": observation["idempotency_key"],
    }
    if expected_job is not None and (
        not _valid_job_identity(expected_job)
        or job != {
            "thread_id": expected_job["thread_id"],
            "idempotency_key": expected_job["idempotency_key"],
        }
    ):
        return {"state": "unknown", "reason": "observation_job_mismatch"}
    observed_at = _parse_time(observation.get("observed_at"))
    if observed_at is None or observed_at > now:
        return {"state": "unknown", "reason": "invalid_observed_at"}
    if (now - observed_at).total_seconds() > MAX_OBSERVATION_AGE_SECONDS:
        return {"state": "stale_status", "reason": "observation_expired", "job": job}
    transport_lost = observation.get("transport_lost")
    if "transport_lost" in observation and not isinstance(transport_lost, bool):
        return {"state": "unknown", "reason": "transport_state_unknown"}
    if transport_lost is True:
        return {"state": "transport_unknown", "reason": "reconcile_original_thread", "job": job}
    provider_error = observation.get("provider_error")
    if "provider_error" in observation and (
        not isinstance(provider_error, int) or isinstance(provider_error, bool)
    ):
        return {"state": "unknown", "reason": "provider_error_unknown"}
    if isinstance(provider_error, int) and not isinstance(provider_error, bool):
        if provider_error == 429:
            retry_after = observation.get("retry_after_seconds")
            if not isinstance(retry_after, int) or isinstance(retry_after, bool) or retry_after <= 0:
                return {"state": "unknown", "reason": "retry_timing_unknown"}
        if provider_error in PROVIDER_ACTIONS:
            action = PROVIDER_ACTIONS[provider_error]
        elif provider_error >= 500:
            action = "reconcile_original_thread"
        else:
            action = "inspect_provider_failure"
        result = {
            "state": "provider_failure", "provider_error": provider_error,
            "action": action, "job": job,
        }
        if provider_error == 429:
            result["retry_after_seconds"] = observation["retry_after_seconds"]
        return result

    interaction = observation.get("interaction")
    if "interaction" in observation and not isinstance(interaction, dict):
        return {"state": "unknown", "reason": "interaction_unknown"}
    if isinstance(interaction, dict):
        kind = interaction.get("kind")
        if kind == "approval":
            if not all(
                isinstance(interaction.get(field), str) and interaction[field]
                for field in ("id", "fingerprint", "account_alias", "destination")
            ) or not _money(interaction.get("per_query_cap_usd")) or interaction.get("state") != "pending":
                return {"state": "unknown", "reason": "malformed_approval"}
            surface = interaction.get("resolution_surface")
            if not isinstance(surface, str) or surface not in {"mcp", "web_only"}:
                return {"state": "unknown", "reason": "approval_surface_unknown"}
            if not _interaction_matches_dispatch(interaction, job, expected_job):
                return {"state": "unknown", "reason": "interaction_dispatch_mismatch"}
            return {"state": "approval_required", "interaction": interaction, "job": job}
        if kind == "input":
            if (
                not _valid_sha256(interaction.get("prompt_sha256"))
                or not all(
                    isinstance(interaction.get(field), str) and interaction[field]
                    for field in ("id", "account_alias", "destination")
                )
                or not _money(interaction.get("per_query_cap_usd"))
            ):
                return {"state": "unknown", "reason": "malformed_input_request"}
            if not _interaction_matches_dispatch(interaction, job, expected_job):
                return {"state": "unknown", "reason": "interaction_dispatch_mismatch"}
            return {"state": "input_required", "interaction": interaction, "job": job}
        if kind == "memory_decision":
            if not isinstance(interaction.get("id"), str) or not interaction["id"]:
                return {"state": "unknown", "reason": "malformed_memory_decision"}
            return {
                "state": "memory_decision_required", "interaction": interaction, "job": job
            }
        if kind == "sandbox_domain":
            if not isinstance(interaction.get("domain"), str) or not interaction["domain"]:
                return {"state": "unknown", "reason": "malformed_domain_approval"}
            return {"state": "approval_required", "interaction": interaction, "job": job}
        return {"state": "unknown", "reason": "interaction_kind_unknown"}

    running = observation.get("is_running")
    if running is True:
        return {"state": "running", "reason": "poll_same_thread", "job": job}
    if running is not False:
        return {"state": "unknown", "reason": "running_state_unknown"}
    terminal = observation.get("terminal_state")
    if terminal not in (None, "declined", "cancelled", "failed", "completed"):
        return {"state": "unknown", "reason": "terminal_state_unknown"}
    terminal_job_matches = _valid_job_identity(expected_job) and job == {
        "thread_id": expected_job["thread_id"],
        "idempotency_key": expected_job["idempotency_key"],
    }
    if terminal in {"declined", "cancelled", "failed", "completed"} and not terminal_job_matches:
        return {"state": "terminal_unverified", "reason": "terminal_job_mismatch", "job": job}
    if terminal in {"declined", "cancelled"}:
        return {
            "state": f"remote_{terminal}",
            "reason": "provider_terminal",
            "job": job,
        }
    if terminal == "failed":
        return {"state": "remote_failed", "reason": "provider_terminal", "job": job}
    if (
        terminal == "completed"
        and observation.get("useful_outcome_verified") is True
        and _valid_sha256(observation.get("final_output_sha256"))
        and _valid_sha256(observation.get("usage_receipt_sha256"))
        and _valid_sha256(observation.get("route_receipt_sha256"))
        and _valid_sha256(observation.get("destination_receipt_sha256"))
        and _money(observation.get("cost_usd"))
        and _terminal_authority_matches(observation, expected_job)
    ):
        return {
            "state": "remote_useful_success",
            "reason": "remote_receipts_verified",
            "job": job, "cost_usd": observation["cost_usd"],
        }
    return {
        "state": "terminal_unverified",
        "reason": "useful_identity_or_cost_receipt_missing",
        "job": job,
    }


def classify_delivery_observation(observation, now=None):
    """Classify PR, merge, and exact-runtime evidence independently of remote work."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(observation, dict) or observation.get("schema") != DELIVERY_SCHEMA:
        return {"state": "unknown", "reason": "invalid_delivery_schema"}
    identity_fields = (
        "issue_id",
        "lease_id",
        "idempotency_key",
        "expected_pr_repository",
        "required_runtime",
    )
    if not all(
        isinstance(observation.get(field), str) and observation[field]
        for field in identity_fields
    ):
        return {"state": "unknown", "reason": "missing_delivery_identity"}
    observed_at = _parse_time(observation.get("observed_at"))
    if observed_at is None or observed_at > now:
        return {"state": "unknown", "reason": "invalid_observed_at"}
    if (now - observed_at).total_seconds() > MAX_OBSERVATION_AGE_SECONDS:
        return {"state": "stale_status", "reason": "delivery_observation_expired"}
    pr_state = observation.get("pr_state")
    if pr_state == "not_found":
        return {"state": "delivery_missing", "reason": "reconcile_before_retry"}
    if pr_state == "closed_unmerged":
        if (
            not isinstance(observation.get("failure_owner"), str)
            or not observation["failure_owner"]
            or not _valid_sha256(observation.get("failure_receipt_sha256"))
            or not _valid_pr_url(
                observation.get("pr_url"), observation["expected_pr_repository"]
            )
            or not _valid_git_sha(observation.get("pr_head_sha"))
        ):
            return {"state": "unknown", "reason": "failure_ownership_unproven"}
        return {"state": "delivery_failed", "reason": "pr_closed_unmerged"}
    if pr_state not in {"open", "merged"}:
        return {"state": "unknown", "reason": "pr_state_unknown"}
    if (
        not _valid_pr_url(
            observation.get("pr_url"), observation["expected_pr_repository"]
        )
        or not _valid_git_sha(observation.get("pr_head_sha"))
    ):
        return {"state": "unknown", "reason": "pr_identity_unproven"}
    if pr_state == "open":
        return {"state": "pr_open", "reason": "await_merge"}
    merge_sha = observation.get("merge_sha")
    runtime = observation.get("runtime")
    if not _valid_git_sha(merge_sha):
        return {"state": "unknown", "reason": "merge_identity_unproven"}
    if not isinstance(runtime, dict):
        return {
            "state": "merged_runtime_unverified",
            "reason": "runtime_evidence_missing",
        }
    if (
        runtime.get("name") != observation["required_runtime"]
        or runtime.get("sha") != merge_sha
        or not _valid_sha256(runtime.get("receipt_sha256"))
    ):
        return {
            "state": "merged_runtime_unverified",
            "reason": "exact_runtime_unproven",
        }
    return {
        "state": "landed_verified",
        "reason": "merge_and_runtime_receipts_verified",
    }


def _job_authority_matches(classification, authority):
    job = classification.get("job") or {}
    return _valid_job_identity(job) and _valid_job_identity(authority) and all(
        authority.get(field) == job.get(field)
        for field in ("thread_id", "idempotency_key")
    )


def _authority_matches(classification, authority):
    interaction = classification.get("interaction") or {}
    if not isinstance(authority, dict):
        return False
    fields = (
        "interaction_id", "fingerprint", "account_alias", "destination",
        "per_query_cap_usd",
    )
    return (
        _job_authority_matches(classification, authority)
        and authority.get("user_authorized") is True
        and all(
            authority.get(field)
            == (interaction.get("id") if field == "interaction_id" else interaction.get(field))
            for field in fields
        )
    )


def plan_resolution(classification, authority=None, oauth_scopes=()):
    """Describe one next action; mutations require a durable journal reservation."""
    state = classification.get("state") if isinstance(classification, dict) else None
    if not isinstance(state, str):
        return {"action": "hold_unknown", "execute": False}
    if not isinstance(oauth_scopes, (list, tuple, set, frozenset)) or not all(
        isinstance(scope, str) for scope in oauth_scopes
    ):
        oauth_scopes = ()
    if state == "approval_required":
        interaction = classification.get("interaction") or {}
        if interaction.get("kind") == "sandbox_domain":
            return {"action": "surface_domain_approval", "execute": False}
        if not _authority_matches(classification, authority):
            return {"action": "surface_exact_approval", "execute": False}
        if interaction.get("resolution_surface") == "mcp" and "approvals:write" in oauth_scopes:
            return {
                "action": "resolve_approval_once", "execute": False,
                "requires_journal_reservation": True, "id": interaction["id"],
            }
        if interaction.get("resolution_surface") == "web_only" and authority.get("attended_browser") is True:
            return {
                "action": "open_attended_thread_once", "execute": False,
                "requires_journal_reservation": True, "id": interaction["id"],
            }
        return {"action": "surface_exact_approval", "execute": False}
    if state == "input_required":
        interaction = classification.get("interaction") or {}
        if (
            isinstance(authority, dict)
            and _job_authority_matches(classification, authority)
            and authority.get("input_authorized") is True
            and authority.get("prompt_sha256") == interaction.get("prompt_sha256")
            and all(
                authority.get(field) == interaction.get(field)
                for field in ("account_alias", "destination", "per_query_cap_usd")
            )
            and _valid_sha256(authority.get("response_sha256"))
            and "threads:write" in oauth_scopes
        ):
            return {
                "action": "send_message_once", "execute": False,
                "requires_journal_reservation": True,
                "id": interaction["id"],
            }
        return {"action": "surface_required_input", "execute": False}
    if state == "memory_decision_required":
        interaction = classification.get("interaction") or {}
        if (
            isinstance(authority, dict)
            and _job_authority_matches(classification, authority)
            and authority.get("memory_decision_authorized") is True
            and authority.get("interaction_id") == interaction.get("id")
            and authority.get("decision") in {"approve", "reject"}
        ):
            return {
                "action": "record_memory_decision_once", "execute": False,
                "requires_journal_reservation": True, "id": interaction["id"],
            }
        return {"action": "surface_memory_decision", "execute": False}
    if state in {
        "stale_status",
        "transport_unknown",
        "terminal_unverified",
        "remote_failed",
        "remote_declined",
        "remote_cancelled",
    }:
        if not _valid_job_identity(classification.get("job")):
            return {"action": "hold_unknown", "execute": False}
        return {
            "action": "reconcile_issue_lifecycle_once", "execute": False,
            "requires_journal_reservation": True,
        }
    if state == "provider_failure":
        action = classification.get("action", "hold_unknown")
        result = {"action": action, "execute": False}
        if action == "reconcile_original_thread":
            if not _valid_job_identity(classification.get("job")):
                return {"action": "hold_unknown", "execute": False}
            result["action"] = "reconcile_issue_lifecycle_once"
            result["requires_journal_reservation"] = True
        return result
    if state == "running":
        return {"action": "observe_same_thread", "execute": False, "read_only": True}
    if state in {"remote_useful_success", "delivery_missing"}:
        return {
            "action": "reconcile_delivery_once", "execute": False,
            "requires_journal_reservation": True,
        }
    if state == "pr_open":
        return {
            "action": "recover_existing_pr",
            "execute": False,
            "external_owner": "native_merge_controller",
        }
    if state == "merged_runtime_unverified":
        return {
            "action": "reconcile_required_runtime_once", "execute": False,
            "requires_journal_reservation": True,
        }
    if state in TERMINAL_STATES:
        return {
            "action": "record_terminal_receipt",
            "execute": False,
            "terminal": True,
        }
    return {"action": "hold_unknown", "execute": False}


class LifecycleJournal:
    """Atomic pre-create exposure and lifecycle evidence journal."""

    EXPOSURE_STATES = frozenset({"create_reserved", "create_unknown", "active"})

    def __init__(self, path, receipt_hmac_key=None):
        self.path = pathlib.Path(path).expanduser().resolve(strict=False)
        self.lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        if receipt_hmac_key is not None and (
            not isinstance(receipt_hmac_key, bytes) or len(receipt_hmac_key) < 32
        ):
            raise LifecycleError("receipt HMAC key must contain at least 32 bytes")
        self.receipt_hmac_key = receipt_hmac_key
        self.data = None
        with self._locked():
            pass

    @staticmethod
    def _assert_safe_file(path, allow_missing=True):
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            if allow_missing:
                return
            raise
        if (
            stat.S_ISLNK(metadata.st_mode)
            or not stat.S_ISREG(metadata.st_mode)
            or metadata.st_nlink != 1
        ):
            raise LifecycleError("journal path is not a single regular file")

    @contextmanager
    def _locked(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._assert_safe_file(self.path)
        self._assert_safe_file(self.lock_path)
        flags = os.O_RDWR | os.O_CREAT
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(self.lock_path, flags, 0o600)
        except OSError as error:
            raise LifecycleError("journal lock path is unsafe") from error
        with os.fdopen(descriptor, "a+") as lock:
            metadata = os.fstat(lock.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise LifecycleError("journal lock path is not a single regular file")
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            self._load()
            yield

    def _load(self):
        self._assert_safe_file(self.path)
        try:
            flags = os.O_RDONLY
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(self.path, flags)
        except FileNotFoundError:
            self.data = {"schema": JOURNAL_SCHEMA, "budgets": {}, "jobs": {}}
            return
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise LifecycleError("journal path is not a single regular file")
            with os.fdopen(descriptor) as handle:
                descriptor = None
                self.data = json.load(handle)
        except json.JSONDecodeError as error:
            raise LifecycleError("journal is corrupt") from error
        finally:
            if descriptor is not None:
                os.close(descriptor)
        if not self._valid_loaded_data(self.data):
            raise LifecycleError("journal schema is invalid")

    @staticmethod
    def _valid_loaded_data(data):
        if (
            not isinstance(data, dict)
            or data.get("schema") != JOURNAL_SCHEMA
            or not isinstance(data.get("budgets"), dict)
            or not isinstance(data.get("jobs"), dict)
        ):
            return False
        try:
            for budget_id, budget in data["budgets"].items():
                if not isinstance(budget_id, str) or not isinstance(budget, dict):
                    return False
                amounts = [
                    Decimal(budget[field])
                    for field in (
                        "cap_usd",
                        "spent_floor_usd",
                        "balance_remaining_usd",
                    )
                ]
                if not all(amount.is_finite() and amount >= 0 for amount in amounts):
                    return False
            for key, job in data["jobs"].items():
                if (
                    not isinstance(key, str)
                    or not isinstance(job, dict)
                    or key != job.get("idempotency_key")
                    or any(field not in job for field in DISPATCH_IDENTITY_FIELDS)
                    or not _valid_sha256(job.get("identity_sha256"))
                    or _identity_sha256(job) != job["identity_sha256"]
                    or job.get("budget_id") not in data["budgets"]
                    or job.get("exposure_state")
                    not in {*LifecycleJournal.EXPOSURE_STATES, "absence_proven", "settled"}
                    or not isinstance(job.get("remote_state"), str)
                    or not isinstance(job.get("state"), str)
                    or not isinstance(job.get("delivery_state"), str)
                    or job.get("thread_id") is not None
                    and not isinstance(job.get("thread_id"), str)
                    or not isinstance(job.get("attempts"), dict)
                    or job.get("current_attempt_identity") not in job["attempts"]
                    or not isinstance(job.get("actions"), list)
                    or not isinstance(job.get("classification"), dict)
                    or not isinstance(job.get("delivery_classification"), dict)
                    or not isinstance(job.get("delivery"), dict)
                    or not isinstance(job.get("last_revision"), int)
                    or isinstance(job.get("last_revision"), bool)
                    or job.get("last_observation_sha256") is not None
                    and not _valid_sha256(job.get("last_observation_sha256"))
                    or not isinstance(job.get("delivery_revision"), int)
                    or isinstance(job.get("delivery_revision"), bool)
                    or job.get("last_delivery_sha256") is not None
                    and not _valid_sha256(job.get("last_delivery_sha256"))
                    or job.get("settlement") is not None
                    and not isinstance(job.get("settlement"), dict)
                ):
                    return False
                exposure = Decimal(job["max_exposure_usd"])
                if not exposure.is_finite() or exposure < 0:
                    return False
                for attempt_identity, attempt in job["attempts"].items():
                    if (
                        not _valid_sha256(attempt_identity)
                        or not isinstance(attempt, dict)
                        or not isinstance(attempt.get("number"), int)
                        or isinstance(attempt.get("number"), bool)
                        or not isinstance(attempt.get("nonce"), str)
                        or not attempt["nonce"]
                        or _parse_time(attempt.get("reserved_at")) is None
                        or attempt.get("state")
                        not in {
                            "create_reserved",
                            "create_unknown",
                            "absence_proven",
                            "active",
                            "settled",
                        }
                        or attempt.get("create_receipt") is not None
                        and not isinstance(attempt.get("create_receipt"), dict)
                        or attempt.get("reconciliation_receipt") is not None
                        and not isinstance(attempt.get("reconciliation_receipt"), dict)
                    ):
                        return False
        except (InvalidOperation, KeyError, TypeError, ValueError):
            return False
        return True

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._assert_safe_file(self.path)
        descriptor, temporary = tempfile.mkstemp(
            prefix=self.path.name + ".", dir=self.path.parent
        )
        try:
            with os.fdopen(descriptor, "w") as handle:
                json.dump(self.data, handle, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
            directory = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @staticmethod
    def _budget_id(envelope):
        identity = (
            envelope["provider"],
            envelope["paying_org_id"],
            envelope["workspace_id"],
            envelope["account_alias"],
            envelope["budget_period_id"],
        )
        return hashlib.sha256(_canonical_json(identity).encode()).hexdigest()

    def _active_exposure(self, budget_id):
        return sum(
            Decimal(job["max_exposure_usd"])
            for job in self.data["jobs"].values()
            if job["budget_id"] == budget_id
            and job["exposure_state"] in self.EXPOSURE_STATES
        )

    @staticmethod
    def _current_attempt(job):
        return job["attempts"][job["current_attempt_identity"]]

    @staticmethod
    def _new_attempt(job, number, now):
        nonce = secrets.token_hex(16)
        attempt_identity = hashlib.sha256(
            _canonical_json(
                {
                    "idempotency_key": job["idempotency_key"],
                    "identity_sha256": job["identity_sha256"],
                    "number": number,
                    "nonce": nonce,
                }
            ).encode()
        ).hexdigest()
        attempt = {
            "number": number,
            "nonce": nonce,
            "reserved_at": now.isoformat(),
            "state": "create_reserved",
            "create_receipt": None,
            "reconciliation_receipt": None,
        }
        job["attempts"][attempt_identity] = attempt
        job["current_attempt_identity"] = attempt_identity
        return attempt_identity

    def _require_identity(self, job, envelope):
        if _identity_sha256(envelope) != job["identity_sha256"]:
            raise LifecycleError("idempotency key identity changed")

    def _receipt_is_authenticated(self, receipt):
        if self.receipt_hmac_key is None or not isinstance(receipt, dict):
            return False
        supplied = receipt.get("receipt_hmac_sha256")
        if not _valid_sha256(supplied):
            return False
        expected = hmac.new(
            self.receipt_hmac_key,
            _canonical_json(_receipt_payload(receipt)).encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(supplied, expected)

    def _require_authenticated_budget(self, envelope):
        if self.receipt_hmac_key is None:
            raise LifecycleError("budget receipt authentication failed")
        supplied = envelope["budget_period_receipt_sha256"]
        expected = hmac.new(
            self.receipt_hmac_key,
            _canonical_json(_budget_receipt_payload(envelope)).encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(supplied, expected):
            raise LifecycleError("budget receipt authentication failed")

    def _require_fresh_receipt(self, receipt, expected, attempt, now):
        if not self._receipt_is_authenticated(receipt):
            raise LifecycleError("provider receipt authentication failed")
        observed_at = _parse_time(receipt.get("observed_at"))
        reserved_at = _parse_time(attempt["reserved_at"])
        if (
            observed_at is None
            or reserved_at is None
            or observed_at < reserved_at
            or observed_at > now
            or (now - observed_at).total_seconds() > MAX_OBSERVATION_AGE_SECONDS
        ):
            raise LifecycleError("provider receipt timing is invalid")
        if any(receipt.get(field) != value for field, value in expected.items()):
            raise LifecycleError("provider receipt identity changed")

    @staticmethod
    def _receipt_identity(job, attempt_identity, schema, outcome):
        return {
            "schema": schema,
            "provider": job["provider"],
            "paying_org_id": job["paying_org_id"],
            "workspace_id": job["workspace_id"],
            "account_alias": job["account_alias"],
            "budget_period_id": job["budget_period_id"],
            "idempotency_key": job["idempotency_key"],
            "identity_sha256": job["identity_sha256"],
            "attempt_identity": attempt_identity,
            "outcome": outcome,
        }

    @_locked_mutation
    def reserve_dispatch(self, envelope, now=None):
        """Atomically reserve maximum exposure before a provider create call."""
        now = now or datetime.now(timezone.utc)
        if validate_dispatch(envelope, now)["decision"] != "PROCEED":
            raise LifecycleError("dispatch envelope is not admissible")
        key = envelope["idempotency_key"]
        existing = self.data["jobs"].get(key)
        if existing:
            self._require_identity(existing, envelope)
            self._require_authenticated_budget(envelope)
            return {
                "execute_create": False,
                "duplicate": True,
                "attempt_identity": existing["current_attempt_identity"],
                "job": existing,
            }
        self._require_authenticated_budget(envelope)
        if any(
            job["request_sha256"] == envelope["request_sha256"]
            and job["exposure_state"] in self.EXPOSURE_STATES
            for job in self.data["jobs"].values()
        ):
            raise LifecycleError("related job is already active")

        budget_id = self._budget_id(envelope)
        exposure = _decimal_money(envelope["per_query_cap_usd"])
        cap = _decimal_money(envelope["period_cap_usd"])
        observed_spend = _decimal_money(envelope["period_spend_usd"])
        observed_balance = _decimal_money(envelope["balance_usd"])
        budget = self.data["budgets"].setdefault(
            budget_id,
            {
                "cap_usd": str(cap),
                "spent_floor_usd": str(observed_spend),
                "balance_remaining_usd": str(observed_balance),
            },
        )
        if Decimal(budget["cap_usd"]) != cap:
            raise LifecycleError("budget period cap changed")
        budget["spent_floor_usd"] = str(
            max(Decimal(budget["spent_floor_usd"]), observed_spend)
        )
        budget["balance_remaining_usd"] = str(
            min(Decimal(budget["balance_remaining_usd"]), observed_balance)
        )
        active = self._active_exposure(budget_id)
        if (
            Decimal(budget["spent_floor_usd"]) + active + exposure > cap
            or active + exposure > Decimal(budget["balance_remaining_usd"])
        ):
            raise LifecycleError("budget exposure unavailable")

        job = {
            **{field: envelope[field] for field in DISPATCH_IDENTITY_FIELDS},
            "identity_sha256": _identity_sha256(envelope),
            "budget_id": budget_id,
            "budget_period_receipt_sha256": envelope["budget_period_receipt_sha256"],
            "budget_period_checked_at": envelope["budget_period_checked_at"],
            "balance_usd": envelope["balance_usd"],
            "balance_checked_at": envelope["balance_checked_at"],
            "model_checked_at": envelope["model_checked_at"],
            "credits_expire_at": envelope["credits_expire_at"],
            "period_spend_usd": envelope["period_spend_usd"],
            "max_exposure_usd": str(exposure),
            "exposure_state": "create_reserved",
            "state": "pre_create",
            "remote_state": "pre_create",
            "delivery_state": "unknown",
            "thread_id": None,
            "current_attempt_identity": None,
            "attempts": {},
            "last_revision": -1,
            "last_observation_sha256": None,
            "classification": {"state": "accepted"},
            "delivery_revision": -1,
            "last_delivery_sha256": None,
            "delivery_classification": {"state": "unknown"},
            "delivery": {},
            "actions": [],
            "settlement": None,
        }
        attempt_identity = self._new_attempt(job, 1, now)
        self.data["jobs"][key] = job
        self._save()
        return {
            "execute_create": True,
            "duplicate": False,
            "attempt_identity": attempt_identity,
            "job": job,
        }

    @_locked_mutation
    def mark_create_unknown(self, key, attempt_identity):
        job = self.data["jobs"].get(key)
        if not job or attempt_identity != job["current_attempt_identity"]:
            raise LifecycleError("create attempt identity changed")
        attempt = self._current_attempt(job)
        if attempt["state"] == "create_reserved":
            attempt["state"] = "create_unknown"
            job["exposure_state"] = "create_unknown"
            self._save()
        elif attempt["state"] != "create_unknown":
            raise LifecycleError("create outcome is not ambiguous")
        return {"state": job["exposure_state"], "exposure_retained": True}

    @_locked_mutation
    def bind_created_thread(self, key, attempt_identity, receipt, now=None):
        now = now or datetime.now(timezone.utc)
        return self._bind_thread_locked(
            key, attempt_identity, receipt, now, "created"
        )

    def _bind_thread_locked(
        self, key, attempt_identity, receipt, now, expected_outcome
    ):
        job = self.data["jobs"].get(key)
        if not job or attempt_identity != job["current_attempt_identity"]:
            raise LifecycleError("create attempt identity changed")
        attempt = self._current_attempt(job)
        if (
            isinstance(receipt, dict)
            and attempt.get("create_receipt") == receipt
            and job.get("thread_id") == receipt.get("thread_id")
        ):
            return {"recorded": False, "duplicate": True, "job": job}
        if attempt.get("create_receipt") is not None:
            raise LifecycleError("created thread receipt changed")
        thread_id = receipt.get("thread_id") if isinstance(receipt, dict) else None
        if not isinstance(thread_id, str) or not thread_id:
            raise LifecycleError("created thread receipt is invalid")
        outcome = receipt.get("outcome")
        if outcome != expected_outcome:
            raise LifecycleError("created thread receipt is invalid")
        expected = self._receipt_identity(
            job, attempt_identity, CREATE_RECEIPT_SCHEMA, outcome
        )
        self._require_fresh_receipt(receipt, expected, attempt, now)
        if attempt["state"] not in {"create_reserved", "create_unknown"}:
            raise LifecycleError("create attempt is not bindable")
        attempt.update(state="active", create_receipt=receipt)
        job.update(
            exposure_state="active",
            state="accepted",
            remote_state="accepted",
            thread_id=thread_id,
        )
        self._save()
        return {"recorded": True, "duplicate": False, "job": job}

    @_locked_mutation
    def reconcile_create(self, key, attempt_identity, receipt, now=None):
        now = now or datetime.now(timezone.utc)
        outcome = receipt.get("outcome") if isinstance(receipt, dict) else None
        if outcome == "found_existing":
            return self._bind_thread_locked(
                key, attempt_identity, receipt, now, "found_existing"
            )
        if outcome != "provider_absence":
            raise LifecycleError("create reconciliation evidence is invalid")
        job = self.data["jobs"].get(key)
        attempt = job.get("attempts", {}).get(attempt_identity) if job else None
        if not job or not attempt:
            raise LifecycleError("create attempt identity changed")
        if attempt.get("reconciliation_receipt") == receipt:
            return {"recorded": False, "duplicate": True, "exposure_retained": False}
        if attempt_identity != job["current_attempt_identity"]:
            raise LifecycleError("create attempt identity changed")
        if attempt.get("reconciliation_receipt") is not None:
            raise LifecycleError("create reconciliation changed")
        expected = self._receipt_identity(
            job, attempt_identity, CREATE_RECEIPT_SCHEMA, outcome
        )
        self._require_fresh_receipt(receipt, expected, attempt, now)
        if attempt["state"] not in {"create_reserved", "create_unknown"}:
            raise LifecycleError("create attempt is not reconcilable")
        attempt.update(state="absence_proven", reconciliation_receipt=receipt)
        job["exposure_state"] = "absence_proven"
        self._save()
        return {"recorded": True, "duplicate": False, "exposure_retained": False}

    @_locked_mutation
    def reserve_create_retry_once(self, key, envelope, now=None):
        now = now or datetime.now(timezone.utc)
        if validate_dispatch(envelope, now)["decision"] != "PROCEED":
            raise LifecycleError("retry envelope is not admissible")
        job = self.data["jobs"].get(key)
        if (
            not job
            or job["exposure_state"] != "absence_proven"
            or len(job["attempts"]) >= 2
        ):
            raise LifecycleError("create retry is not authorized")
        self._require_identity(job, envelope)
        self._require_authenticated_budget(envelope)
        budget = self.data["budgets"][job["budget_id"]]
        observed_spend = _decimal_money(envelope["period_spend_usd"])
        observed_balance = _decimal_money(envelope["balance_usd"])
        budget["spent_floor_usd"] = str(
            max(Decimal(budget["spent_floor_usd"]), observed_spend)
        )
        budget["balance_remaining_usd"] = str(
            min(Decimal(budget["balance_remaining_usd"]), observed_balance)
        )
        exposure = Decimal(job["max_exposure_usd"])
        active = self._active_exposure(job["budget_id"])
        if (
            Decimal(budget["spent_floor_usd"]) + active + exposure
            > Decimal(budget["cap_usd"])
            or active + exposure > Decimal(budget["balance_remaining_usd"])
        ):
            raise LifecycleError("budget exposure unavailable")
        attempt_identity = self._new_attempt(job, 1, now)
        job.update(
            exposure_state="create_reserved",
            remote_state="pre_create",
            thread_id=None,
            period_spend_usd=envelope["period_spend_usd"],
            balance_usd=envelope["balance_usd"],
            budget_period_receipt_sha256=envelope["budget_period_receipt_sha256"],
            budget_period_checked_at=envelope["budget_period_checked_at"],
        )
        self._save()
        return {"execute_create": True, "attempt_identity": attempt_identity}

    @_locked_mutation
    def register_dispatch(self, envelope, thread_id, now=None):
        """Confirm an already authenticated create; never creates a reservation."""
        now = now or datetime.now(timezone.utc)
        if validate_dispatch(envelope, now)["decision"] != "PROCEED":
            raise LifecycleError("dispatch envelope is not admissible")
        if not isinstance(thread_id, str) or not thread_id:
            raise LifecycleError("thread_id is required")
        job = self.data["jobs"].get(envelope["idempotency_key"])
        if not job:
            raise LifecycleError("pre-create reservation is required")
        self._require_identity(job, envelope)
        if job.get("thread_id") != thread_id or job["exposure_state"] not in {
            "active",
            "settled",
        }:
            raise LifecycleError("authenticated create receipt is required")
        return {"recorded": False, "duplicate": True, "job": job}

    @_locked_mutation
    def observe(self, key, revision, observation, now=None):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        if job["exposure_state"] not in {"active", "settled"} or not job.get(
            "thread_id"
        ):
            raise LifecycleError("authenticated created thread is required")
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
            raise LifecycleError("revision must be a non-negative integer")
        if observation.get("thread_id") != job["thread_id"] or observation.get(
            "idempotency_key"
        ) != key:
            raise LifecycleError("observation job identity changed")
        digest = hashlib.sha256(
            json.dumps(observation, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if revision < job["last_revision"]:
            raise LifecycleError("observation revision regressed")
        if revision == job["last_revision"]:
            if digest != job["last_observation_sha256"]:
                raise LifecycleError("observation revision changed content")
            return {"recorded": False, "duplicate": True, "classification": job["classification"]}
        if job["remote_state"] in REMOTE_TERMINAL_STATES:
            raise LifecycleError("terminal job cannot receive a new observation")
        classification = classify_observation(observation, now, job)
        job.update(
            remote_state=classification["state"], last_revision=revision,
            last_observation_sha256=digest, classification=classification,
        )
        job["state"] = _aggregate_state(
            classification["state"], job["delivery_state"]
        )
        self._save()
        return {"recorded": True, "duplicate": False, "classification": classification}

    @_locked_mutation
    def observe_delivery(self, key, revision, observation, now=None):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
            raise LifecycleError("delivery revision must be a non-negative integer")
        for field in (
            "issue_id",
            "lease_id",
            "idempotency_key",
            "expected_pr_repository",
            "required_runtime",
        ):
            expected = key if field == "idempotency_key" else job[field]
            if not isinstance(observation, dict) or observation.get(field) != expected:
                raise LifecycleError("delivery identity changed")
        digest = hashlib.sha256(_canonical_json(observation).encode()).hexdigest()
        if revision < job["delivery_revision"]:
            raise LifecycleError("delivery revision regressed")
        if revision == job["delivery_revision"]:
            if digest != job["last_delivery_sha256"]:
                raise LifecycleError("delivery revision changed content")
            return {
                "recorded": False,
                "duplicate": True,
                "classification": job["delivery_classification"],
            }
        if job["state"] in TERMINAL_STATES:
            raise LifecycleError("terminal job cannot receive delivery evidence")
        classification = classify_delivery_observation(observation, now)
        allowed_from_proven = {
            "pr_open": {
                "pr_open",
                "merged_runtime_unverified",
                "landed_verified",
                "delivery_failed",
            },
            "merged_runtime_unverified": {
                "merged_runtime_unverified",
                "landed_verified",
            },
        }
        if (
            job["delivery_state"] in allowed_from_proven
            and classification["state"]
            not in allowed_from_proven[job["delivery_state"]]
        ):
            raise LifecycleError("delivery evidence cannot regress a proven PR state")
        proven_pr_url = job["delivery"].get("pr_url")
        if (
            proven_pr_url is not None
            and observation.get("pr_url") is not None
            and observation["pr_url"] != proven_pr_url
        ):
            raise LifecycleError("delivery PR identity changed")
        delivery = {}
        if classification["state"] in {
            "pr_open",
            "merged_runtime_unverified",
            *TERMINAL_STATES,
        }:
            delivery = {
                field: observation.get(field)
                for field in (
                    "pr_state",
                    "pr_url",
                    "pr_head_sha",
                    "merge_sha",
                    "runtime",
                    "failure_owner",
                    "failure_receipt_sha256",
                )
                if observation.get(field) is not None
            }
        job.update(
            state=_aggregate_state(job["remote_state"], classification["state"]),
            delivery_state=classification["state"],
            delivery_revision=revision,
            last_delivery_sha256=digest,
            delivery_classification=classification,
            delivery={**job["delivery"], **delivery},
        )
        self._save()
        return {"recorded": True, "duplicate": False, "classification": classification}

    @_locked_mutation
    def reserve_action_once(self, key, authority=None, oauth_scopes=()):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        delivery_resolved = _delivery_resolved(
            job["remote_state"], job["delivery_state"]
        )
        classification = (
            job["delivery_classification"]
            if delivery_resolved
            else job["classification"]
        )
        planned = plan_resolution(classification, authority, oauth_scopes)
        if planned.get("requires_journal_reservation") is not True:
            raise LifecycleError("current action is not admissible for reservation")
        action = planned["action"]
        attempt_number = self._current_attempt(job)["number"]
        suffix = planned.get("id") or (
            f"{job['last_revision']}:{job['delivery_revision']}"
        )
        action_id = f"attempt:{attempt_number}:{action}:{suffix}"
        authority_sha256 = hashlib.sha256(
            _canonical_json(authority).encode()
        ).hexdigest()
        reservation_identity_sha256 = hashlib.sha256(
            _canonical_json(
                {
                    "action": action,
                    "action_id": action_id,
                    "authority_sha256": authority_sha256,
                    "observation_revision": job["last_revision"],
                    "delivery_revision": job["delivery_revision"],
                    "attempt_number": attempt_number,
                }
            ).encode()
        ).hexdigest()
        existing = next((item for item in job["actions"] if item["id"] == action_id), None)
        if existing:
            if existing.get("identity_sha256") != reservation_identity_sha256:
                raise LifecycleError("action reservation identity changed")
            return {"execute": False, "duplicate": True, "reservation": existing}
        if action.startswith("reconcile_"):
            prior = [
                item
                for item in job["actions"]
                if item["action"] == action
                and item.get("attempt_number") == attempt_number
            ]
            incomplete = next(
                (item for item in prior if item["status"] != "completed"), None
            )
            if incomplete:
                return {
                    "execute": False,
                    "duplicate": True,
                    "reservation": incomplete,
                }
            if prior:
                raise LifecycleError("reconciliation limit reached")
        reservation = {
            "id": action_id, "action": action, "status": "reserved",
            "authority_sha256": authority_sha256,
            "identity_sha256": reservation_identity_sha256,
            "attempt_number": attempt_number,
            "observation_revision": job["last_revision"],
            "delivery_revision": job["delivery_revision"],
        }
        job["actions"].append(reservation)
        self._save()
        return {"execute": True, "duplicate": False, "reservation": reservation}

    @_locked_mutation
    def record_action_result(
        self, key, action_id, provider_receipt, outcome=None, now=None
    ):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        reservation = next((item for item in job["actions"] if item["id"] == action_id), None)
        if not reservation:
            raise LifecycleError("action was not reserved")
        is_reconciliation = reservation["action"].startswith("reconcile_")
        if not is_reconciliation and not _valid_sha256(provider_receipt):
            raise LifecycleError("provider action receipt is required")
        if not is_reconciliation and outcome is not None:
            raise LifecycleError("non-reconciliation action cannot claim an outcome")
        if is_reconciliation:
            checked_at = now or datetime.now(timezone.utc)
            attempt = self._current_attempt(job)
            if not isinstance(outcome, dict):
                raise LifecycleError("reconciliation outcome is invalid")
            evidence_sha256 = hashlib.sha256(
                _canonical_json(outcome).encode()
            ).hexdigest()
            expected = {
                **self._receipt_identity(
                    job,
                    job["current_attempt_identity"],
                    RECONCILIATION_RECEIPT_SCHEMA,
                    reservation["action"],
                ),
                "action_id": action_id,
                "evidence_sha256": evidence_sha256,
            }
            self._require_fresh_receipt(provider_receipt, expected, attempt, checked_at)
            observed_at = _parse_time(outcome.get("observed_at"))
            if (
                not all(outcome.get(field) == job[field] for field in ("issue_id", "lease_id"))
                or outcome.get("remote")
                not in {"absent", "existing", "idempotent_replay"}
                or outcome.get("pr")
                not in {"not_found", "open", "merged", "closed_unmerged"}
                or observed_at is None
                or observed_at > checked_at
                or (checked_at - observed_at).total_seconds()
                > MAX_OBSERVATION_AGE_SECONDS
            ):
                raise LifecycleError("reconciliation outcome is invalid")
            if outcome["remote"] == "existing" and outcome.get("thread_id") != job["thread_id"]:
                raise LifecycleError("reconciliation remote identity changed")
            if outcome["pr"] != "not_found" and (
                not _valid_pr_url(outcome.get("pr_url"), job["expected_pr_repository"])
                or not _valid_git_sha(outcome.get("pr_head_sha"))
            ):
                raise LifecycleError("reconciliation PR identity is invalid")
            if outcome["pr"] == "merged" and not _valid_git_sha(outcome.get("merge_sha")):
                raise LifecycleError("reconciliation merge identity is invalid")
            if outcome["pr"] == "closed_unmerged" and (
                not isinstance(outcome.get("failure_owner"), str)
                or not outcome["failure_owner"]
                or not _valid_sha256(outcome.get("failure_receipt_sha256"))
            ):
                raise LifecycleError("reconciliation failure ownership is invalid")
        if reservation["status"] == "completed":
            if (
                reservation["provider_receipt"] != provider_receipt
                or reservation.get("outcome") != outcome
            ):
                raise LifecycleError("action receipt changed")
            return {"recorded": False, "duplicate": True}
        reservation.update(
            status="completed", provider_receipt=provider_receipt,
            outcome=outcome,
        )
        self._save()
        return {"recorded": True, "duplicate": False}

    @_locked_mutation
    def reserve_retry_once(self, key, envelope, now=None):
        """Reserve one post-terminal replacement create after signed absence proof."""
        now = now or datetime.now(timezone.utc)
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        current = self._current_attempt(job)
        if current["number"] == 2:
            return {
                "execute": False,
                "duplicate": True,
                "attempt_identity": job["current_attempt_identity"],
                "attempt": current,
            }
        if validate_dispatch(envelope, now)["decision"] != "PROCEED":
            raise LifecycleError("retry dispatch envelope is not admissible")
        self._require_identity(job, envelope)
        self._require_authenticated_budget(envelope)
        if (
            current["number"] != 1
            or job["exposure_state"] != "settled"
            or job["remote_state"] not in REMOTE_TERMINAL_STATES
        ):
            raise LifecycleError("safe retry authority is unproven")
        reconciliation = next(
            (
                item
                for item in reversed(job["actions"])
                if item["action"] == "reconcile_issue_lifecycle_once"
                and item["status"] == "completed"
                and item["observation_revision"] == job["last_revision"]
                and item["delivery_revision"] == job["delivery_revision"]
            ),
            None,
        )
        outcome = reconciliation.get("outcome") if reconciliation else {}
        if (
            outcome.get("remote") not in {"absent", "idempotent_replay"}
            or outcome.get("pr") != "not_found"
        ):
            raise LifecycleError("safe retry authority is unproven")
        budget = self.data["budgets"][job["budget_id"]]
        observed_spend = _decimal_money(envelope["period_spend_usd"])
        observed_balance = _decimal_money(envelope["balance_usd"])
        budget["spent_floor_usd"] = str(
            max(Decimal(budget["spent_floor_usd"]), observed_spend)
        )
        budget["balance_remaining_usd"] = str(
            min(Decimal(budget["balance_remaining_usd"]), observed_balance)
        )
        exposure = Decimal(job["max_exposure_usd"])
        active = self._active_exposure(job["budget_id"])
        if (
            Decimal(budget["spent_floor_usd"]) + active + exposure
            > Decimal(budget["cap_usd"])
            or active + exposure > Decimal(budget["balance_remaining_usd"])
        ):
            raise LifecycleError("budget exposure unavailable")
        attempt_identity = self._new_attempt(job, 2, now)
        job.update(
            exposure_state="create_reserved",
            state="pre_create",
            remote_state="pre_create",
            thread_id=None,
            last_revision=-1,
            last_observation_sha256=None,
            classification={"state": "accepted"},
            period_spend_usd=envelope["period_spend_usd"],
            balance_usd=envelope["balance_usd"],
            budget_period_receipt_sha256=envelope[
                "budget_period_receipt_sha256"
            ],
            budget_period_checked_at=envelope["budget_period_checked_at"],
        )
        self._save()
        return {
            "execute": True,
            "duplicate": False,
            "attempt_identity": attempt_identity,
            "attempt": job["attempts"][attempt_identity],
        }

    @_locked_mutation
    def bind_retry_thread(self, key, attempt_identity, receipt, now=None):
        now = now or datetime.now(timezone.utc)
        job = self.data["jobs"].get(key)
        attempt = job.get("attempts", {}).get(attempt_identity) if job else None
        if not attempt or attempt.get("number") != 2:
            raise LifecycleError("retry was not reserved")
        return self._bind_thread_locked(
            key, attempt_identity, receipt, now, "created"
        )

    @_locked_mutation
    def settle_terminal(self, key, observation, terminal_receipt, now=None):
        """Settle or release reserved exposure from authenticated terminal cost."""
        now = now or datetime.now(timezone.utc)
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        observation_sha256 = hashlib.sha256(
            _canonical_json(observation).encode()
        ).hexdigest()
        existing = job.get("settlement")
        if existing is not None:
            if (
                existing["observation_sha256"] == observation_sha256
                and existing["receipt"] == terminal_receipt
            ):
                return {"recorded": False, "duplicate": True}
            raise LifecycleError("terminal settlement changed")
        if job["exposure_state"] != "active" or not job.get("thread_id"):
            raise LifecycleError("active exposure is required for settlement")
        classification = classify_observation(observation, now, job)
        terminal_state = classification.get("state")
        if terminal_state not in REMOTE_TERMINAL_STATES:
            raise LifecycleError("terminal settlement evidence is invalid")
        attempt_identity = job["current_attempt_identity"]
        attempt = self._current_attempt(job)
        cost = (
            _decimal_money(terminal_receipt.get("cost_usd"))
            if isinstance(terminal_receipt, dict)
            else None
        )
        if cost is None or not _valid_sha256(
            terminal_receipt.get("usage_receipt_sha256")
            if isinstance(terminal_receipt, dict)
            else None
        ):
            raise LifecycleError("authenticated terminal cost receipt is required")
        if cost > Decimal(job["max_exposure_usd"]):
            raise LifecycleError("terminal cost exceeds reserved exposure")
        if terminal_state == "remote_useful_success" and (
            cost != _decimal_money(classification.get("cost_usd"))
            or terminal_receipt["usage_receipt_sha256"]
            != observation.get("usage_receipt_sha256")
        ):
            raise LifecycleError("terminal cost receipt changed useful outcome evidence")
        expected = {
            **self._receipt_identity(
                job, attempt_identity, TERMINAL_RECEIPT_SCHEMA, terminal_state
            ),
            "thread_id": job["thread_id"],
            "cost_usd": terminal_receipt["cost_usd"],
            "usage_receipt_sha256": terminal_receipt["usage_receipt_sha256"],
            "observation_sha256": observation_sha256,
        }
        self._require_fresh_receipt(terminal_receipt, expected, attempt, now)
        budget = self.data["budgets"][job["budget_id"]]
        budget["spent_floor_usd"] = str(
            Decimal(budget["spent_floor_usd"]) + cost
        )
        budget["balance_remaining_usd"] = str(
            Decimal(budget["balance_remaining_usd"]) - cost
        )
        settlement = {
            "terminal_state": terminal_state,
            "cost_usd": str(cost),
            "observation_sha256": observation_sha256,
            "receipt": terminal_receipt,
        }
        attempt["state"] = "settled"
        job.update(
            exposure_state="settled",
            remote_state=terminal_state,
            state=_aggregate_state(terminal_state, job["delivery_state"]),
            classification=classification,
            settlement=settlement,
        )
        self._save()
        return {"recorded": True, "duplicate": False, "settlement": settlement}

def main():  # pragma: no cover - exercised by subprocess contract tests
    parser = argparse.ArgumentParser()
    subcommands = parser.add_subparsers(dest="command", required=True)
    preflight = subcommands.add_parser("preflight")
    preflight.add_argument("--envelope", required=True)
    classify = subcommands.add_parser("classify")
    classify.add_argument("--observation", required=True)
    args = parser.parse_args()
    if args.command == "preflight":
        path = pathlib.Path(args.envelope)
    else:
        path = pathlib.Path(args.observation)
    payload = json.loads(path.read_text())
    if args.command == "preflight":
        result = validate_dispatch(payload)
    else:
        result = classify_observation(payload)
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.command == "preflight":
        return 0 if result["decision"] == "PROCEED" else 2
    return 0


if __name__ == "__main__":  # pragma: no cover - subprocess entry point
    raise SystemExit(main())
