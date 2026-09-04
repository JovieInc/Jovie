#!/usr/bin/env python3
from __future__ import annotations

import json
import hashlib
import pathlib
import re
from datetime import datetime, timedelta, timezone
from typing import Any


SCHEMA = "jovie-fleet-gate/v1"
INDEPENDENT_REVIEW_SCHEMA = "jovie-independent-review/v1"
INDEPENDENT_REVIEW_AUTHORITY = "Gem"
INDEPENDENT_REVIEWER = "Gem"
INDEPENDENT_REVIEW_SCOPE = "exact-main-head"
CLOSURE_HEALTH_SCHEMA = "jovie-closure-health/v1"
CLOSURE_HEALTH_AUTHORITY = "Summer"
JOVIE_REPO = "JovieInc/Jovie"
CAPACITY_SCHEMA = "gem-concurrency-evidence/v1"
PROOF_SCHEMA = "symphony-useful-turn-proof/v2"
PROOF_SOURCE = "authenticated-completion-probe/v2"
RUNTIME_IDENTITY_SCHEMA = "symphony-runtime-identity/v1"
OFFICIAL_RUNTIME_SERVICE = "symphony-elixir.service"
CODER_AGENT_PROFILE = "coder"
CAPACITY_SOURCE = "execution-proven-useful-turns"
CAPACITY_MAX_AGE = timedelta(hours=24)
CAPACITY_MAX_TARGET = 40
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PROVIDER_ID = re.compile(r"^[a-z][a-z0-9._-]{0,63}$")
MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$")
SOURCE_REVISION = re.compile(r"^[0-9a-f]{40}$")
ISO_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$")


class GateContractError(RuntimeError):
    pass


def _parse_time(value: object) -> datetime | None:
    match = ISO_TIMESTAMP.fullmatch(value) if isinstance(value, str) else None
    if match is None or (match[1] is not None and (int(match[1]) > 23 or int(match[2]) > 59)):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        return None


def validate_runtime_identity(value: object) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    normalized = {
        "schema": value.get("schema"),
        "service": value.get("service"),
        "sourceRevision": value.get("sourceRevision"),
        "binarySha256": value.get("binarySha256"),
        "workflowSha256": value.get("workflowSha256"),
        "contractSha256": value.get("contractSha256"),
    }
    if (
        normalized["schema"] != RUNTIME_IDENTITY_SCHEMA
        or normalized["service"] != OFFICIAL_RUNTIME_SERVICE
        or not isinstance(normalized["sourceRevision"], str)
        or not SOURCE_REVISION.fullmatch(normalized["sourceRevision"])
        or any(
            not isinstance(normalized[key], str) or not SHA256.fullmatch(normalized[key])
            for key in ("binarySha256", "workflowSha256", "contractSha256")
        )
    ):
        return None
    return normalized


def validate_useful_turn_proof(
    value: object,
    now: datetime,
    max_age: timedelta = CAPACITY_MAX_AGE,
    *,
    expected_runtime: dict[str, str] | None = None,
    expected_contract_sha: str | None = None,
) -> tuple[dict[str, Any] | None, str]:
    if not isinstance(value, dict) or value.get("schema") != PROOF_SCHEMA:
        return None, "malformed"
    strings = [value.get(key) for key in ("provider", "profile", "model")]
    completed_at = _parse_time(value.get("completedAt"))
    runtime = validate_runtime_identity(value.get("runtime"))
    completion = all(type(value.get(key, 0)) is int and value.get(key, 0) >= 0
                     for key in ("outputBytes", "outputTokens")) and any(
        isinstance(value.get(key), int)
        and not isinstance(value.get(key), bool)
        and value.get(key) > 0
        for key in ("outputBytes", "outputTokens")
    )
    if (
        not isinstance(strings[0], str)
        or not PROVIDER_ID.fullmatch(strings[0])
        or not isinstance(strings[1], str)
        or not SHA256.fullmatch(strings[1])
        or not isinstance(strings[2], str)
        or not MODEL_ID.fullmatch(strings[2])
    ):
        return None, "malformed"
    if (
        value.get("producer") != PROOF_SOURCE
        or value.get("agentProfile") != CODER_AGENT_PROFILE
        or not isinstance(value.get("probeId"), str)
        or not SHA256.fullmatch(value["probeId"])
        or value.get("attested") is not True
        or runtime is None
        or not isinstance(value.get("contractSha256"), str)
        or not SHA256.fullmatch(value["contractSha256"])
        or value["contractSha256"] != runtime["contractSha256"]
    ):
        return None, "unattested"
    if expected_contract_sha is not None and value["contractSha256"] != expected_contract_sha:
        return None, "imported-runtime-mismatch"
    if expected_runtime is not None and runtime != expected_runtime:
        return None, "runtime-build-mismatch"
    if type(value.get("rc")) is not int or value["rc"] != 0:
        return None, "failed"
    if value.get("useful") is not True:
        return None, "non-useful"
    if not isinstance(value.get("outputDigest"), str) or not SHA256.fullmatch(
        value["outputDigest"]
    ):
        return None, "missing-output-digest"
    if not completion:
        return None, "completion-unproven"
    if completed_at is None or not timedelta(0) <= now - completed_at <= max_age:
        return None, "stale-or-future"
    return {
        "schema": PROOF_SCHEMA,
        "provider": strings[0],
        "profile": strings[1],
        "model": strings[2],
        "rc": 0,
        "useful": True,
        "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
        "outputDigest": value["outputDigest"],
        "outputBytes": value.get("outputBytes", 0),
        "outputTokens": value.get("outputTokens", 0),
        "producer": PROOF_SOURCE,
        "probeId": value["probeId"],
        "agentProfile": CODER_AGENT_PROFILE,
        "attested": True,
        "contractSha256": value["contractSha256"],
        "runtime": runtime,
    }, "accepted"


def accepted_useful_turn_proofs(
    rows: list[object],
    now: datetime,
    max_age: timedelta = CAPACITY_MAX_AGE,
    *,
    expected_runtime: dict[str, str] | None = None,
    expected_contract_sha: str | None = None,
    attestations: dict[str, object] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    by_seat: dict[tuple[str, str], dict[str, Any]] = {}
    contradictory: set[tuple[str, str]] = set()
    probe_seats: dict[str, tuple[str, str]] = {}
    rejected: dict[str, int] = {}
    for row in rows:
        proof, reason = validate_useful_turn_proof(
            row,
            now,
            max_age,
            expected_runtime=expected_runtime,
            expected_contract_sha=expected_contract_sha,
        )
        if proof is None:
            rejected[reason] = rejected.get(reason, 0) + 1
            continue
        seat = (proof["provider"], proof["profile"])
        if attestations is None or attestations.get(proof["probeId"]) != row:
            rejected["unattested"] = rejected.get("unattested", 0) + 1
            continue
        prior_seat = probe_seats.get(proof["probeId"])
        if prior_seat is not None and prior_seat != seat:
            by_seat.pop(prior_seat, None)
            contradictory.update((prior_seat, seat))
            rejected["substituted-probe"] = rejected.get("substituted-probe", 0) + 1
            continue
        probe_seats[proof["probeId"]] = seat
        if seat in contradictory:
            rejected["contradictory-seat"] = rejected.get("contradictory-seat", 0) + 1
            continue
        prior = by_seat.get(seat)
        if prior is None:
            by_seat[seat] = proof
            continue
        binding_fields = ("provider", "profile", "model", "contractSha256", "runtime")
        if any(prior[field] != proof[field] for field in binding_fields):
            by_seat.pop(seat, None)
            contradictory.add(seat)
            rejected["contradictory-seat"] = rejected.get("contradictory-seat", 0) + 2
            continue
        rejected["duplicate-seat"] = rejected.get("duplicate-seat", 0) + 1
        by_seat.pop(seat, None)
        contradictory.add(seat)
    return [by_seat[key] for key in sorted(by_seat)], rejected


def validate_capacity_receipt(
    value: object,
    now: datetime,
    max_age: timedelta = CAPACITY_MAX_AGE,
    *,
    expected_runtime: dict[str, str] | None = None,
    expected_contract_sha: str | None = None,
    attestations: dict[str, object] | None = None,
    enrolled_seats: set[tuple[str, str, str]] | None = None,
) -> tuple[bool, str, list[dict[str, Any]]]:
    if not isinstance(value, dict) or value.get("schema") != CAPACITY_SCHEMA:
        return False, "capacity-evidence-malformed", []
    if value.get("source") != CAPACITY_SOURCE:
        return False, "capacity-evidence-source-untrusted", []
    if expected_runtime is None or expected_contract_sha is None or enrolled_seats is None:
        return False, "capacity-evidence-trust-context-missing", []
    runtime = validate_runtime_identity(value.get("runtime"))
    contract_sha = value.get("contractSha256")
    if runtime is None or not isinstance(contract_sha, str) or not SHA256.fullmatch(contract_sha):
        return False, "capacity-evidence-unattested", []
    if contract_sha != runtime["contractSha256"]:
        return False, "capacity-evidence-imported-runtime-mismatch", []
    if expected_contract_sha is not None and contract_sha != expected_contract_sha:
        return False, "capacity-evidence-imported-runtime-mismatch", []
    if expected_runtime is not None and runtime != expected_runtime:
        return False, "capacity-evidence-runtime-build-mismatch", []
    observed_at = _parse_time(value.get("observedAt"))
    if observed_at is None or not timedelta(0) <= now - observed_at <= max_age:
        return False, "capacity-evidence-stale-or-future", []
    rows = value.get("acceptedEvidence")
    if not isinstance(rows, list):
        return False, "capacity-evidence-proof-rows-missing", []
    proofs, rejected = accepted_useful_turn_proofs(
        rows,
        now,
        max_age,
        expected_runtime=runtime,
        expected_contract_sha=contract_sha,
        attestations=attestations,
    )
    if any((p["provider"], p["profile"], p["model"]) not in enrolled_seats for p in proofs):
        return False, "capacity-evidence-not-enrolled", []
    target = value.get("target")
    if (
        rejected
        or len(proofs) != len(rows)
        or target != len(proofs)
        or not isinstance(target, int)
        or isinstance(target, bool)
        or target > CAPACITY_MAX_TARGET
    ):
        return False, "capacity-evidence-target-proof-mismatch", []
    severe = value.get("severeIncidents")
    if not proofs or value.get("approved") is not True or type(severe) is not int or severe != 0:
        return False, "capacity-evidence-zero-proof", []
    return True, CAPACITY_SOURCE, proofs


def _is_jovie_repo(repo: str) -> bool:
    return repo.casefold() in {"jovieinc/jovie", "itstimwhite/jovie"}


def _repo_key(repo: str) -> str:
    slug = "".join(character if character.isalnum() else "-" for character in repo).strip("-")
    if not slug:
        raise GateContractError("repository name cannot map to an empty state directory")
    digest = hashlib.sha256(repo.casefold().encode("utf-8")).hexdigest()[:10]
    return f"{slug.lower()}-{digest}"


def gate_state_dir(root: pathlib.Path, repo: str) -> pathlib.Path:
    base = root / "state" / "gem-priority-gate"
    if _is_jovie_repo(repo):
        return base
    return base.with_name(f"{base.name}-{_repo_key(repo)}")


def drain_state_dir(root: pathlib.Path, repo: str) -> pathlib.Path:
    base = root / "state" / "gem-pr-drain"
    return base if _is_jovie_repo(repo) else base.with_name(f"{base.name}-{_repo_key(repo)}")


def _typed_allowed(receipt: dict[str, Any], consumer: str) -> bool:
    if consumer == "fleet":
        value = receipt.get("workAdmission", {}).get("allowed")
    elif consumer == "promotion":
        value = receipt.get("promotionAdmission", {}).get("allowed")
    elif consumer == "remediation":
        value = receipt.get("remediationAdmission", {}).get("allowed")
    elif consumer == "direct-gem":
        value = receipt.get("ownership", {}).get("directGemPickup")
    else:
        raise GateContractError(f"unknown gate consumer: {consumer}")
    if not isinstance(value, bool):
        raise GateContractError(f"{consumer} admission is missing or is not boolean")
    return value


def validate_gate_result(returncode: int, stdout: str, consumer: str) -> dict[str, Any]:
    try:
        receipt = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise GateContractError(f"gate returned invalid JSON: {error}") from error
    if not isinstance(receipt, dict) or receipt.get("schema") != SCHEMA:
        raise GateContractError(f"gate schema must be {SCHEMA}")
    state = receipt.get("state")
    if state not in {"GREEN", "AMBER", "RED"}:
        raise GateContractError("gate state must be GREEN, AMBER, or RED")
    work_allowed = _typed_allowed(receipt, "fleet")
    promotion_allowed = _typed_allowed(receipt, "promotion")
    direct_gem_allowed = _typed_allowed(receipt, "direct-gem")
    remediation_allowed = _typed_allowed(receipt, "remediation")
    expected_admission = {
        "GREEN": (True, True),
        "AMBER": (True, False),
        "RED": (False, False),
    }[state]
    if (work_allowed, promotion_allowed) != expected_admission:
        raise GateContractError(
            f"{state} admission invariant disagrees with typed work/promotion fields"
        )
    review_admission = receipt.get("reviewAdmission")
    if not isinstance(review_admission, dict):
        raise GateContractError("independent review admission is missing")
    review_allowed = review_admission.get("allowed")
    if not isinstance(review_allowed, bool):
        raise GateContractError("independent review admission must be boolean")
    if review_admission.get("required") is not True:
        raise GateContractError("independent review must be required")
    if review_admission.get("authority") != INDEPENDENT_REVIEW_AUTHORITY:
        raise GateContractError("independent review authority is not explicit")
    if review_admission.get("scope") != INDEPENDENT_REVIEW_SCOPE:
        raise GateContractError("independent review scope must be exact-main-head")
    if not isinstance(review_admission.get("reason"), str):
        raise GateContractError("independent review reason is missing")
    review_signal = receipt.get("signals", {}).get("independentReview")
    if not isinstance(review_signal, dict):
        raise GateContractError("independent review signal is missing")
    if review_signal.get("schema") != INDEPENDENT_REVIEW_SCHEMA:
        raise GateContractError("independent review signal schema is invalid")
    if not isinstance(review_signal.get("accepted"), bool):
        raise GateContractError("independent review signal acceptance is not boolean")
    if review_allowed != review_signal["accepted"]:
        raise GateContractError("independent review admission disagrees with its signal")
    if review_allowed:
        main_sha = receipt.get("signals", {}).get("main", {}).get("sha")
        if not isinstance(main_sha, str) or len(main_sha) != 40 or any(
            character not in "0123456789abcdef" for character in main_sha
        ):
            raise GateContractError("accepted review must name an exact main head")
        if review_admission.get("headSha") != main_sha:
            raise GateContractError("accepted review head is not the exact main head")
        if review_signal.get("headSha") != main_sha:
            raise GateContractError("review signal head is not the exact main head")
        if review_signal.get("status") != "passed":
            raise GateContractError("accepted review signal must be passed")
        if review_signal.get("authority") != INDEPENDENT_REVIEW_AUTHORITY:
            raise GateContractError("accepted review signal authority is invalid")
        if review_signal.get("scope") != INDEPENDENT_REVIEW_SCOPE:
            raise GateContractError("accepted review signal scope is invalid")
        if not isinstance(review_signal.get("observedAt"), str):
            raise GateContractError("accepted review observation time is missing")
        if not isinstance(review_signal.get("reviewId"), str) or not review_signal["reviewId"]:
            raise GateContractError("accepted review id is missing")
        if review_signal.get("reviewer") != INDEPENDENT_REVIEWER:
            raise GateContractError("accepted reviewer identity is not Gem")
    new_issue_lease = receipt.get("workAdmission", {}).get("newIssueLeaseAllowed")
    if not isinstance(new_issue_lease, bool):
        raise GateContractError("new issue lease admission is missing or is not boolean")
    closure_signal = receipt.get("signals", {}).get("closureHealth")
    closure_admission = receipt.get("closureAdmission")
    if not isinstance(closure_signal, dict):
        raise GateContractError("closure health signal is missing")
    if closure_signal.get("schema") != CLOSURE_HEALTH_SCHEMA:
        raise GateContractError("closure health signal schema is invalid")
    if closure_signal.get("authority") != CLOSURE_HEALTH_AUTHORITY:
        raise GateContractError("closure health authority is not Summer")
    closure_status = closure_signal.get("status")
    if closure_status not in {"healthy", "grace", "red"}:
        raise GateContractError("closure health status is invalid")
    closure_signal_allowed = closure_signal.get("newIssueIntakeAllowed")
    if not isinstance(closure_signal_allowed, bool):
        raise GateContractError("closure health intake signal must be boolean")
    if closure_signal_allowed is not (closure_status == "healthy"):
        raise GateContractError("closure health status contradicts intake signal")
    if closure_signal.get("promotionContinues") is not True:
        raise GateContractError("closure health signal must preserve promotion")
    if closure_signal.get("remediationContinues") is not True:
        raise GateContractError("closure health signal must preserve remediation")
    closure_reasons = closure_signal.get("reasons")
    if not isinstance(closure_reasons, list) or not all(
        isinstance(reason, str) for reason in closure_reasons
    ):
        raise GateContractError("closure health reasons are malformed")
    if not isinstance(closure_admission, dict):
        raise GateContractError("closure admission is missing")
    closure_allowed = closure_admission.get("newIssueIntakeAllowed")
    if not isinstance(closure_allowed, bool):
        raise GateContractError("closure intake admission must be boolean")
    if closure_admission.get("authority") != CLOSURE_HEALTH_AUTHORITY:
        raise GateContractError("closure admission authority is not Summer")
    if closure_admission.get("promotionContinues") is not True:
        raise GateContractError("closure stop-line must preserve promotion")
    if closure_admission.get("remediationContinues") is not True:
        raise GateContractError("closure stop-line must preserve remediation")
    for field in (
        "allowed",
        "newImplementationAllowed",
        "fallbackPrGenerationAllowed",
    ):
        if closure_admission.get(field) is not closure_allowed:
            raise GateContractError(f"closure admission {field} contradicts intake")
    if closure_allowed is not closure_signal_allowed:
        raise GateContractError("closure signal and admission disagree")
    if new_issue_lease and not closure_allowed:
        raise GateContractError("new issue lease bypasses Summer closure admission")
    if promotion_allowed and not review_allowed:
        raise GateContractError("promotion admission bypasses independent review")
    if direct_gem_allowed:
        raise GateContractError("direct Gem pickup must remain disabled")
    if receipt.get("ownership", {}).get("review") != INDEPENDENT_REVIEW_AUTHORITY:
        raise GateContractError("review ownership must remain with Gem")
    remediation = receipt.get("remediationAdmission", {})
    if not remediation_allowed or remediation.get("localAllowed") is not True:
        raise GateContractError("observation and bounded local remediation must remain live")
    push_allowed = remediation.get("pushAllowed")
    if not isinstance(push_allowed, bool):
        raise GateContractError("remediation push admission is missing or is not boolean")
    concurrency = receipt.get("concurrency") or {}
    if not isinstance(concurrency, dict):
        raise GateContractError("concurrency admission is malformed")
    gem_concurrency = concurrency.get("gem") or {}
    if not isinstance(gem_concurrency, dict):
        raise GateContractError("Gem concurrency admission is malformed")
    capacity_accepted = gem_concurrency.get("evidenceAccepted")
    new_mutation_allowed = gem_concurrency.get("newMutationAllowed")
    if not isinstance(capacity_accepted, bool):
        raise GateContractError("capacity evidence acceptance is missing or is not boolean")
    if not isinstance(new_mutation_allowed, bool):
        raise GateContractError("new mutation admission is missing or is not boolean")
    if new_mutation_allowed is not (state != "RED" and capacity_accepted):
        raise GateContractError("new mutation admission requires execution-proven capacity")
    capacity_signal = receipt.get("signals", {}).get("concurrencyEvidence") or {}
    capacity_signal_accepted = (
        capacity_signal.get("accepted") if isinstance(capacity_signal, dict) else None
    )
    if not isinstance(capacity_signal_accepted, bool):
        raise GateContractError("capacity evidence signal acceptance is not boolean")
    if capacity_signal_accepted is not capacity_accepted:
        raise GateContractError("capacity evidence signal and admission disagree")
    if capacity_accepted:
        from symphony_proof_context import validate_local_receipt
        accepted, reason, _ = validate_local_receipt(capacity_signal, datetime.now(timezone.utc))
        if not accepted:
            raise GateContractError(f"accepted capacity failed local verification: {reason}")
        proof_rows = capacity_signal.get("acceptedEvidence")
        if (
            capacity_signal.get("source") != "execution-proven-useful-turns"
            or not isinstance(proof_rows, list)
            or capacity_signal.get("target") != len(proof_rows)
        ):
            raise GateContractError("accepted capacity lacks cross-checked useful-turn rows")
    runtime_floor = gem_concurrency.get("runtimeFloor")
    if isinstance(runtime_floor, bool) or runtime_floor != 1:
        raise GateContractError("runtimeFloor must admit exactly one local repair")
    if push_allowed != (state != "RED" and capacity_accepted):
        raise GateContractError("remote remediation requires execution-proven capacity")
    remote_update_listed = "expected-head-pr-update" in remediation.get("activities", [])
    if remote_update_listed is not push_allowed:
        raise GateContractError("remote remediation activity contradicts push admission")
    maximum = remediation.get("maxConcurrent")
    if isinstance(maximum, bool) or not isinstance(maximum, int) or maximum < 0:
        raise GateContractError("remediation concurrency must be a non-negative integer")
    gem_maximum = gem_concurrency.get("maxConcurrent")
    if isinstance(gem_maximum, bool) or not isinstance(gem_maximum, int) or gem_maximum < 0:
        raise GateContractError("Gem mutation concurrency must be a non-negative integer")
    if state != "RED":
        if not capacity_accepted and gem_maximum != 0:
            raise GateContractError("unproven capacity must close dispatch")
        if capacity_accepted and gem_maximum < runtime_floor:
            raise GateContractError("accepted capacity is below the configured floor")
        if capacity_accepted and gem_maximum > capacity_signal["target"]:
            raise GateContractError("mutation concurrency exceeds verified useful-turn capacity")
        if maximum != gem_maximum:
            raise GateContractError("remediation concurrency contradicts Gem concurrency")
    elif maximum != 0 or gem_maximum != 0:
        raise GateContractError("RED must close dispatch")
    if push_allowed and not 1 <= maximum <= CAPACITY_MAX_TARGET:
        raise GateContractError("allowed remediation concurrency must be 1 through 40")
    if not push_allowed and maximum != 0:
        raise GateContractError("denied remediation concurrency must be zero")
    if remediation.get("authority") != "single-pr-writer-exact-head":
        raise GateContractError("remediation authority must require one exact-head writer")
    reasons = receipt.get("reasons")
    if not isinstance(reasons, list) or any(
        not isinstance(reason, dict)
        or any(not isinstance(reason.get(key), str) for key in ("code", "layer", "severity", "detail"))
        for reason in reasons
    ):
        raise GateContractError("gate reasons must be a list of typed reason objects")
    main = receipt.get("signals", {}).get("main", {})
    if main.get("status") not in {"green", "red", "unknown"}:
        raise GateContractError("gate main signal is missing or invalid")
    allowed = _typed_allowed(receipt, consumer)
    expected_returncode = 0 if allowed else 2
    if returncode != expected_returncode:
        raise GateContractError(
            f"{consumer} gate exit {returncode} disagrees with allowed={str(allowed).lower()}"
        )
    return receipt
