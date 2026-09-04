#!/usr/bin/env python3
"""Fail-closed Hyperagent MCP lifecycle adapter.

This module validates dispatches and classifies structured provider observations.
It never calls Hyperagent, resolves an approval, sends a message, or starts work.
The canonical Symphony router remains the only dispatch-selection owner.
"""
from __future__ import annotations

import argparse
import fcntl
import functools
import hashlib
import json
import math
import os
import pathlib
import tempfile
from datetime import datetime, timezone

SCHEMA = "symphony-hyperagent-lifecycle/v1"
DELIVERY_SCHEMA = "symphony-hyperagent-delivery/v1"
JOURNAL_SCHEMA = "symphony-hyperagent-journal/v2"
MAX_OBSERVATION_AGE_SECONDS = 300
TERMINAL_STATES = frozenset({"landed_verified", "delivery_failed"})
REMOTE_TERMINAL_STATES = frozenset(
    {"remote_useful_success", "remote_failed", "remote_declined", "remote_cancelled"}
)
ACTIVE_STATES = frozenset(
    {
        "accepted", "running", "approval_required", "input_required",
        "memory_decision_required", "stale_status", "transport_unknown",
        "terminal_unverified", "provider_failure", "unknown",
        "remote_useful_success", "remote_failed", "remote_declined",
        "remote_cancelled", "delivery_missing", "pr_open",
        "merged_runtime_unverified",
    }
)
PROVIDER_ACTIONS = {
    401: "authorized_reconnect_required",
    402: "billing_hold",
    403: "inspect_scope_or_policy",
    429: "honor_shared_cooldown",
}


class LifecycleError(ValueError):
    pass


def _locked_mutation(method):
    @functools.wraps(method)
    def wrapped(self, *args, **kwargs):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        with lock_path.open("a+") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            self._load()
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
    return delivery_state if _delivery_resolved(
        remote_state, delivery_state
    ) else remote_state


def _parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _money(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    )


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
    if envelope.get("destination") != envelope.get("expected_destination"):
        reasons.append(("destination_mismatch", "destination"))
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
                    for field in ("id", "account_alias", "destination")
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
        return {"state": f"remote_{terminal}", "reason": "provider_terminal", "job": job}
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
    ):
        return {"state": "remote_useful_success", "reason": "remote_receipts_verified", "job": job}
    return {"state": "terminal_unverified", "reason": "useful_or_cost_receipt_missing"}


def classify_delivery_observation(observation, now=None):
    """Classify PR, merge, and exact-runtime evidence independently of remote work."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(observation, dict) or observation.get("schema") != DELIVERY_SCHEMA:
        return {"state": "unknown", "reason": "invalid_delivery_schema"}
    if not all(
        isinstance(observation.get(field), str) and observation[field]
        for field in (
            "issue_id", "lease_id", "idempotency_key", "expected_pr_repository",
            "required_runtime",
        )
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
        return {"state": "merged_runtime_unverified", "reason": "runtime_evidence_missing"}
    if (
        runtime.get("name") != observation["required_runtime"]
        or runtime.get("sha") != merge_sha
        or not _valid_sha256(runtime.get("receipt_sha256"))
    ):
        return {"state": "merged_runtime_unverified", "reason": "exact_runtime_unproven"}
    return {"state": "landed_verified", "reason": "merge_and_runtime_receipts_verified"}


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
        "stale_status", "transport_unknown", "terminal_unverified", "remote_failed",
        "remote_declined", "remote_cancelled",
    }:
        return {
            "action": "reconcile_issue_lifecycle_once", "execute": False,
            "requires_journal_reservation": True,
        }
    if state == "provider_failure":
        action = classification.get("action", "hold_unknown")
        result = {"action": action, "execute": False}
        if action == "reconcile_original_thread":
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
            "action": "recover_existing_pr", "execute": False,
            "external_owner": "native_merge_controller",
        }
    if state == "merged_runtime_unverified":
        return {
            "action": "reconcile_required_runtime_once", "execute": False,
            "requires_journal_reservation": True,
        }
    if state in TERMINAL_STATES:
        return {
            "action": "record_terminal_receipt", "execute": False, "terminal": True,
        }
    return {"action": "hold_unknown", "execute": False}


class LifecycleJournal:
    """Atomic evidence ledger; it is not a queue, poller, or provider client."""

    def __init__(self, path):
        self.path = pathlib.Path(path)
        self._load()

    def _load(self):
        try:
            self.data = json.loads(self.path.read_text())
        except FileNotFoundError:
            self.data = {"schema": JOURNAL_SCHEMA, "jobs": {}}
        except json.JSONDecodeError as error:
            raise LifecycleError("journal is corrupt") from error
        if self.data.get("schema") != JOURNAL_SCHEMA or not isinstance(
            self.data.get("jobs"), dict
        ):
            raise LifecycleError("journal schema is invalid")

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(
            prefix=self.path.name + ".", dir=self.path.parent
        )
        try:
            with os.fdopen(descriptor, "w") as handle:
                json.dump(self.data, handle, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @_locked_mutation
    def register_dispatch(self, envelope, thread_id, now=None):
        if validate_dispatch(envelope, now)["decision"] != "PROCEED":
            raise LifecycleError("dispatch envelope is not admissible")
        if not isinstance(thread_id, str) or not thread_id:
            raise LifecycleError("thread_id is required")
        key = envelope["idempotency_key"]
        existing = self.data["jobs"].get(key)
        identity = (envelope["request_sha256"], thread_id)
        if existing:
            if (existing["request_sha256"], existing["thread_id"]) != identity:
                raise LifecycleError("idempotency key identity changed")
            return {"recorded": False, "duplicate": True, "job": existing}
        if any(
            (
                job["request_sha256"] == envelope["request_sha256"]
                or job["issue_id"] == envelope["issue_id"]
                or job["lease_id"] == envelope["lease_id"]
            )
            and job["state"] in ACTIVE_STATES
            for job in self.data["jobs"].values()
        ):
            raise LifecycleError("related job is already active")
        job = {
            "idempotency_key": key,
            "thread_id": thread_id,
            "issue_id": envelope["issue_id"],
            "lease_id": envelope["lease_id"],
            "expected_pr_repository": envelope["expected_pr_repository"],
            "required_runtime": envelope["required_runtime"],
            "provider": envelope["provider"],
            "model_id": envelope["model_id"],
            "request_sha256": envelope["request_sha256"],
            "account_alias": envelope["account_alias"],
            "paying_org": envelope["paying_org"],
            "destination": envelope["destination"],
            "per_query_cap_usd": envelope["per_query_cap_usd"],
            "state": "accepted",
            "remote_state": "accepted",
            "delivery_state": "unknown",
            "last_revision": -1,
            "delivery_revision": -1,
            "last_observation_sha256": None,
            "last_delivery_sha256": None,
            "classification": {"state": "accepted"},
            "delivery_classification": {"state": "unknown"},
            "delivery": None,
            "actions": [],
            "retry_attempts": 0,
            "attempts": [{"number": 1, "thread_id": thread_id, "status": "accepted"}],
        }
        self.data["jobs"][key] = job
        self._save()
        return {"recorded": True, "duplicate": False, "job": job}

    @_locked_mutation
    def observe(self, key, revision, observation, now=None):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
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
        if job["state"] in TERMINAL_STATES or job["remote_state"] in REMOTE_TERMINAL_STATES:
            raise LifecycleError("terminal remote attempt cannot receive a new observation")
        classification = classify_observation(observation, now)
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
        for field in ("issue_id", "lease_id", "idempotency_key", "expected_pr_repository", "required_runtime"):
            expected = key if field == "idempotency_key" else job[field]
            if observation.get(field) != expected:
                raise LifecycleError("delivery identity changed")
        digest = hashlib.sha256(
            json.dumps(observation, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if revision < job["delivery_revision"]:
            raise LifecycleError("delivery revision regressed")
        if revision == job["delivery_revision"]:
            if digest != job["last_delivery_sha256"]:
                raise LifecycleError("delivery revision changed content")
            return {
                "recorded": False, "duplicate": True,
                "classification": job["delivery_classification"],
            }
        if job["state"] in TERMINAL_STATES:
            raise LifecycleError("terminal job cannot receive delivery evidence")
        classification = classify_delivery_observation(observation, now)
        allowed_from_proven = {
            "pr_open": {
                "pr_open", "merged_runtime_unverified", "landed_verified",
                "delivery_failed",
            },
            "merged_runtime_unverified": {
                "merged_runtime_unverified", "landed_verified",
            },
        }
        if (
            job["delivery_state"] in allowed_from_proven
            and classification["state"] not in allowed_from_proven[job["delivery_state"]]
        ):
            raise LifecycleError("delivery evidence cannot regress a proven PR state")
        proven_pr_url = (job["delivery"] or {}).get("pr_url")
        if (
            proven_pr_url is not None
            and observation.get("pr_url") is not None
            and observation["pr_url"] != proven_pr_url
        ):
            raise LifecycleError("delivery PR identity changed")
        delivery = {}
        if classification["state"] in {
            "pr_open", "merged_runtime_unverified", *TERMINAL_STATES,
        }:
            delivery = {
                field: observation.get(field)
                for field in (
                    "pr_state", "pr_url", "pr_head_sha", "merge_sha", "runtime",
                    "failure_owner", "failure_receipt_sha256",
                )
                if observation.get(field) is not None
            }
        job.update(
            state=_aggregate_state(job["remote_state"], classification["state"]),
            delivery_state=classification["state"],
            delivery_revision=revision, last_delivery_sha256=digest,
            delivery_classification=classification,
            delivery={**(job["delivery"] or {}), **delivery},
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
            job["delivery_classification"] if delivery_resolved else job["classification"]
        )
        planned = plan_resolution(classification, authority, oauth_scopes)
        if planned.get("requires_journal_reservation") is not True:
            raise LifecycleError("current action is not admissible for reservation")
        action = planned["action"]
        if (
            job["attempts"][-1]["status"] == "reserved"
            and job["attempts"][-1]["thread_id"] is None
        ):
            raise LifecycleError("retry thread is not bound")
        attempt_number = job["attempts"][-1]["number"]
        suffix = planned.get("id") or (
            f"{job['last_revision']}:{job['delivery_revision']}"
        )
        action_id = f"attempt:{attempt_number}:{action}:{suffix}"
        existing = next((item for item in job["actions"] if item["id"] == action_id), None)
        if existing:
            return {"execute": False, "duplicate": True, "reservation": existing}
        if action.startswith("reconcile_"):
            prior = [
                item for item in job["actions"]
                if item["action"] == action
                and item["attempt_number"] == attempt_number
            ]
            incomplete = next(
                (item for item in prior if item["status"] != "completed"), None
            )
            if incomplete:
                return {
                    "execute": False, "duplicate": True,
                    "reservation": incomplete,
                }
            if prior:
                raise LifecycleError("reconciliation limit reached")
        authority_sha256 = hashlib.sha256(
            json.dumps(authority, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        reservation = {
            "id": action_id, "action": action, "status": "reserved",
            "authority_sha256": authority_sha256,
            "attempt_number": attempt_number,
            "observation_revision": job["last_revision"],
            "delivery_revision": job["delivery_revision"],
        }
        job["actions"].append(reservation)
        self._save()
        return {"execute": True, "duplicate": False, "reservation": reservation}

    @_locked_mutation
    def record_action_result(
        self, key, action_id, provider_receipt_sha256, outcome=None, now=None
    ):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        if not _valid_sha256(provider_receipt_sha256):
            raise LifecycleError("provider action receipt is required")
        reservation = next((item for item in job["actions"] if item["id"] == action_id), None)
        if not reservation:
            raise LifecycleError("action was not reserved")
        if reservation["status"] == "completed":
            if (
                reservation["provider_receipt_sha256"] != provider_receipt_sha256
                or reservation.get("outcome") != outcome
            ):
                raise LifecycleError("action receipt changed")
            return {"recorded": False, "duplicate": True}
        if reservation["action"].startswith("reconcile_"):
            observed_at = _parse_time(outcome.get("observed_at")) if isinstance(outcome, dict) else None
            checked_at = now or datetime.now(timezone.utc)
            if not isinstance(outcome, dict) or not all(
                outcome.get(field) == job[field] for field in ("issue_id", "lease_id")
            ) or outcome.get("remote") not in {
                "absent", "existing", "idempotent_replay",
            } or outcome.get("pr") not in {
                "not_found", "open", "merged", "closed_unmerged",
            } or (
                observed_at is None
                or observed_at > checked_at
                or (checked_at - observed_at).total_seconds() > MAX_OBSERVATION_AGE_SECONDS
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
        if not reservation["action"].startswith("reconcile_") and outcome is not None:
            raise LifecycleError("non-reconciliation action cannot claim an outcome")
        reservation.update(
            status="completed", provider_receipt_sha256=provider_receipt_sha256,
            outcome=outcome,
        )
        self._save()
        return {"recorded": True, "duplicate": False}

    @_locked_mutation
    def reserve_retry_once(self, key, envelope, now=None):
        job = self.data["jobs"].get(key)
        if not job:
            raise LifecycleError("unknown idempotency key")
        if len(job["attempts"]) > 1:
            return {"execute": False, "duplicate": True, "attempt": job["attempts"][1]}
        if validate_dispatch(envelope, now)["decision"] != "PROCEED":
            raise LifecycleError("retry dispatch envelope is not admissible")
        for field in (
            "issue_id", "lease_id", "idempotency_key", "request_sha256", "provider",
            "model_id", "account_alias", "paying_org", "destination",
            "expected_pr_repository", "required_runtime",
        ):
            if envelope.get(field) != job[field]:
                raise LifecycleError("retry dispatch identity changed")
        if envelope["per_query_cap_usd"] > job["per_query_cap_usd"]:
            raise LifecycleError("retry cap increased")
        retryable_state = job["remote_state"] in {
            "stale_status", "transport_unknown", "terminal_unverified", "remote_failed",
            "remote_declined", "remote_cancelled",
        } or (
            job["remote_state"] == "provider_failure"
            and job["classification"].get("action") == "reconcile_original_thread"
        )
        reconciliation = next(
            (
                item for item in job["actions"]
                if item["action"] == "reconcile_issue_lifecycle_once"
                and item["status"] == "completed"
                and item["observation_revision"] == job["last_revision"]
                and item["delivery_revision"] == job["delivery_revision"]
            ),
            None,
        )
        outcome = reconciliation.get("outcome") if reconciliation else {}
        if (
            not retryable_state
            or outcome.get("remote") not in {"absent", "idempotent_replay"}
            or outcome.get("pr") != "not_found"
        ):
            raise LifecycleError("safe retry authority is unproven")
        job["retry_attempts"] += 1
        job["attempts"][0].update(
            status=job["remote_state"], final_revision=job["last_revision"]
        )
        attempt = {"number": 2, "thread_id": None, "status": "reserved"}
        job["attempts"].append(attempt)
        self._save()
        return {"idempotency_key": key, "execute": True, "duplicate": False, "attempt": attempt}

    @_locked_mutation
    def bind_retry_thread(self, key, thread_id, provider_receipt_sha256):
        job = self.data["jobs"].get(key)
        if not job or len(job.get("attempts", [])) != 2:
            raise LifecycleError("retry was not reserved")
        if not isinstance(thread_id, str) or not thread_id or not _valid_sha256(
            provider_receipt_sha256
        ):
            raise LifecycleError("retry thread receipt is invalid")
        attempt = job["attempts"][1]
        if attempt["status"] == "accepted":
            if attempt["thread_id"] != thread_id or attempt["provider_receipt_sha256"] != provider_receipt_sha256:
                raise LifecycleError("retry thread identity changed")
            return {"recorded": False, "duplicate": True, "attempt": attempt}
        attempt.update(
            thread_id=thread_id, status="accepted",
            provider_receipt_sha256=provider_receipt_sha256,
        )
        job.update(
            thread_id=thread_id, remote_state="accepted",
            state=_aggregate_state("accepted", job["delivery_state"]),
            last_revision=-1, last_observation_sha256=None,
            classification={"state": "accepted"},
        )
        self._save()
        return {"recorded": True, "duplicate": False, "attempt": attempt}

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
