#!/usr/bin/env python3
"""Fail-closed Hyperagent MCP lifecycle adapter.

This module validates dispatches and classifies structured provider observations.
It never calls Hyperagent, resolves an approval, sends a message, or starts work.
The canonical Symphony router remains the only dispatch-selection owner.
"""
from __future__ import annotations

import argparse
import json
import pathlib
from datetime import datetime, timezone

SCHEMA = "symphony-hyperagent-lifecycle/v1"
MAX_OBSERVATION_AGE_SECONDS = 300
TERMINAL_STATES = frozenset(
    {"useful_success", "terminal_failed", "declined", "cancelled"}
)
PROVIDER_ACTIONS = {
    401: "authorized_reconnect_required",
    402: "billing_hold",
    403: "inspect_scope_or_policy",
    429: "honor_shared_cooldown",
}


class LifecycleError(ValueError):
    pass


def _valid_sha256(value):
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
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
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0


def _codes(reasons):
    return [{"code": code, "field": field} for code, field in reasons]


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
        "runtime",
        "paying_org",
        "expected_paying_org",
        "idempotency_key",
        "request_sha256",
        "useful_outcome",
        "destination",
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
    scopes = envelope.get("oauth_scopes")
    if not isinstance(scopes, list) or not {"threads:read", "threads:write"}.issubset(
        set(scopes)
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
    if _money(balance) and _money(run_cap) and run_cap > balance:
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
    if _money(period_cap) and _money(period_spend) and _money(run_cap):
        if period_spend + run_cap > period_cap:
            reasons.append(("period_cap_exceeded", "period_cap_usd"))
    if envelope.get("auto_recharge_enabled") is not False:
        reasons.append(("auto_recharge_not_proven_off", "auto_recharge_enabled"))
    for field in ("balance_checked_at", "model_checked_at"):
        checked = _parse_time(envelope.get(field))
        if checked is None or checked > now or (now - checked).total_seconds() > 900:
            reasons.append(("stale_live_fact", field))
    expiry = _parse_time(envelope.get("credits_expire_at"))
    if expiry is None or expiry <= now:
        reasons.append(("credit_expiry_invalid", "credits_expire_at"))
    return {"decision": "PROCEED" if not reasons else "HOLD", "reasons": _codes(reasons)}


def classify_observation(observation, now=None):
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
    observed_at = _parse_time(observation.get("observed_at"))
    if observed_at is None or observed_at > now:
        return {"state": "unknown", "reason": "invalid_observed_at"}
    if (now - observed_at).total_seconds() > MAX_OBSERVATION_AGE_SECONDS:
        return {"state": "stale_status", "reason": "observation_expired"}
    if observation.get("transport_lost") is True:
        return {"state": "transport_unknown", "reason": "reconcile_original_thread"}
    provider_error = observation.get("provider_error")
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
        result = {"state": "provider_failure", "provider_error": provider_error, "action": action}
        if provider_error == 429:
            result["retry_after_seconds"] = observation["retry_after_seconds"]
        return result

    interaction = observation.get("interaction")
    if isinstance(interaction, dict):
        kind = interaction.get("kind")
        if kind == "approval":
            if not all(
                isinstance(interaction.get(field), str) and interaction[field]
                for field in ("id", "fingerprint", "account_alias", "destination")
            ) or not _money(interaction.get("per_query_cap_usd")) or interaction.get("state") != "pending":
                return {"state": "unknown", "reason": "malformed_approval"}
            if interaction.get("resolution_surface") not in {"mcp", "web_only"}:
                return {"state": "unknown", "reason": "approval_surface_unknown"}
            return {"state": "approval_required", "interaction": interaction, "job": job}
        if kind == "input":
            if (
                not _valid_sha256(interaction.get("prompt_sha256"))
                or not all(
                    isinstance(interaction.get(field), str) and interaction[field]
                    for field in ("account_alias", "destination")
                )
                or not _money(interaction.get("per_query_cap_usd"))
            ):
                return {"state": "unknown", "reason": "malformed_input_request"}
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
        return {"state": "running", "reason": "poll_same_thread"}
    if running is not False:
        return {"state": "unknown", "reason": "running_state_unknown"}
    terminal = observation.get("terminal_state")
    if terminal in {"declined", "cancelled"}:
        return {"state": terminal, "reason": "provider_terminal"}
    if terminal == "failed":
        return {"state": "terminal_failed", "reason": "provider_terminal"}
    if (
        terminal == "completed"
        and observation.get("useful_outcome_verified") is True
        and _valid_sha256(observation.get("final_output_sha256"))
        and _valid_sha256(observation.get("usage_receipt_sha256"))
        and _money(observation.get("cost_usd"))
    ):
        return {"state": "useful_success", "reason": "terminal_receipts_verified"}
    return {"state": "terminal_unverified", "reason": "useful_or_cost_receipt_missing"}


def _job_authority_matches(classification, authority):
    job = classification.get("job") or {}
    return isinstance(authority, dict) and all(
        authority.get(field) == job.get(field)
        for field in ("thread_id", "idempotency_key")
    )


def _authority_matches(classification, authority):
    interaction = classification.get("interaction") or {}
    if not isinstance(authority, dict):
        return False
    fields = ("fingerprint", "account_alias", "destination", "per_query_cap_usd")
    return (
        _job_authority_matches(classification, authority)
        and authority.get("user_authorized") is True
        and all(authority.get(field) == interaction.get(field) for field in fields)
    )


def plan_resolution(classification, authority=None, oauth_scopes=()):
    """Describe one next action; mutations require a durable journal reservation."""
    state = classification.get("state") if isinstance(classification, dict) else None
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
                "id": interaction["prompt_sha256"],
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
    if state in {"stale_status", "transport_unknown"}:
        return {
            "action": "reconcile_original_thread_once", "execute": False,
            "requires_journal_reservation": True,
        }
    if state == "provider_failure":
        action = classification.get("action", "hold_unknown")
        result = {"action": action, "execute": False}
        if action == "reconcile_original_thread":
            result["requires_journal_reservation"] = True
        return result
    if state == "running":
        return {"action": "observe_same_thread", "execute": False, "read_only": True}
    if state in TERMINAL_STATES:
        return {
            "action": "record_terminal_receipt", "execute": False,
            "requires_journal_reservation": True,
        }
    if state == "terminal_unverified":
        return {
            "action": "reconcile_terminal_receipts_once", "execute": False,
            "requires_journal_reservation": True,
        }
    return {"action": "hold_unknown", "execute": False}


def main():  # pragma: no cover - exercised by subprocess contract tests
    parser = argparse.ArgumentParser()
    subcommands = parser.add_subparsers(dest="command", required=True)
    preflight = subcommands.add_parser("preflight")
    preflight.add_argument("--envelope", required=True)
    classify = subcommands.add_parser("classify")
    classify.add_argument("--observation", required=True)
    plan = subcommands.add_parser("plan")
    plan.add_argument("--classification", required=True)
    plan.add_argument("--authority")
    plan.add_argument("--oauth-scope", action="append", default=[])
    args = parser.parse_args()
    if args.command == "preflight":
        path = pathlib.Path(args.envelope)
    elif args.command == "classify":
        path = pathlib.Path(args.observation)
    else:
        path = pathlib.Path(args.classification)
    payload = json.loads(path.read_text())
    if args.command == "preflight":
        result = validate_dispatch(payload)
    elif args.command == "classify":
        result = classify_observation(payload)
    else:
        authority = json.loads(pathlib.Path(args.authority).read_text()) if args.authority else None
        result = plan_resolution(payload, authority, args.oauth_scope)
    print(json.dumps(result, indent=2, sort_keys=True))
    if args.command == "preflight":
        return 0 if result["decision"] == "PROCEED" else 2
    return 0


if __name__ == "__main__":  # pragma: no cover - subprocess entry point
    raise SystemExit(main())
