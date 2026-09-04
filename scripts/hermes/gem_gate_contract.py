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
PROOF_SCHEMA = "symphony-useful-turn-proof/v1"
CAPACITY_SOURCE = "execution-proven-useful-turns"
CAPACITY_MAX_AGE = timedelta(hours=24)
CAPACITY_MAX_TARGET = 40
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class GateContractError(RuntimeError):
    pass


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
            timezone.utc
        )
    except (ValueError, OverflowError):
        return None


def validate_useful_turn_proof(
    value: object, now: datetime, max_age: timedelta = CAPACITY_MAX_AGE
) -> tuple[dict[str, Any] | None, str]:
    if not isinstance(value, dict) or value.get("schema") != PROOF_SCHEMA:
        return None, "malformed"
    strings = [value.get(key) for key in ("provider", "profile", "model")]
    completed_at = _parse_time(value.get("completedAt"))
    completion = any(
        isinstance(value.get(key), int)
        and not isinstance(value.get(key), bool)
        and value.get(key) > 0
        for key in ("outputBytes", "outputTokens")
    )
    if not all(isinstance(item, str) and item.strip() for item in strings):
        return None, "malformed"
    if value.get("rc") != 0:
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
        "provider": strings[0].strip(),
        "profile": strings[1].strip(),
        "model": strings[2].strip(),
        "rc": 0,
        "useful": True,
        "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
        "outputDigest": value["outputDigest"],
        "outputBytes": value.get("outputBytes", 0),
        "outputTokens": value.get("outputTokens", 0),
    }, "accepted"


def accepted_useful_turn_proofs(
    rows: list[object], now: datetime, max_age: timedelta = CAPACITY_MAX_AGE
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    by_seat: dict[tuple[str, str, str], dict[str, Any]] = {}
    rejected: dict[str, int] = {}
    for row in rows:
        proof, reason = validate_useful_turn_proof(row, now, max_age)
        if proof is None:
            rejected[reason] = rejected.get(reason, 0) + 1
            continue
        seat = (proof["provider"], proof["profile"], proof["model"])
        prior = by_seat.get(seat)
        if prior is None or proof["completedAt"] > prior["completedAt"]:
            by_seat[seat] = proof
    return [by_seat[key] for key in sorted(by_seat)], rejected


def validate_capacity_receipt(
    value: object, now: datetime, max_age: timedelta = CAPACITY_MAX_AGE
) -> tuple[bool, str, list[dict[str, Any]]]:
    if not isinstance(value, dict) or value.get("schema") != CAPACITY_SCHEMA:
        return False, "capacity-evidence-malformed", []
    if value.get("source") != CAPACITY_SOURCE:
        return False, "capacity-evidence-source-untrusted", []
    observed_at = _parse_time(value.get("observedAt"))
    if observed_at is None or not timedelta(0) <= now - observed_at <= max_age:
        return False, "capacity-evidence-stale-or-future", []
    rows = value.get("acceptedEvidence")
    if not isinstance(rows, list):
        return False, "capacity-evidence-proof-rows-missing", []
    proofs, rejected = accepted_useful_turn_proofs(rows, now, max_age)
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
    if not proofs or value.get("approved") is not True or value.get("severeIncidents") != 0:
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
        if maximum != gem_maximum:
            raise GateContractError("remediation concurrency contradicts Gem concurrency")
    elif maximum != 0:
        raise GateContractError("RED must close dispatch")
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
