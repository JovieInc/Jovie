#!/usr/bin/env python3
"""Typed compatibility boundary between Gem callers and the fleet gate."""

from __future__ import annotations

import json
import hashlib
import pathlib
from typing import Any


SCHEMA = "jovie-fleet-gate/v1"
JOVIE_REPO = "JovieInc/Jovie"


class GateContractError(RuntimeError):
    """The gate process and its typed receipt disagree or are malformed."""


def _is_jovie_repo(repo: str) -> bool:
    return repo.casefold() in {"jovieinc/jovie", "itstimwhite/jovie"}


def _repo_key(repo: str) -> str:
    slug = "".join(character if character.isalnum() else "-" for character in repo).strip("-")
    if not slug:
        raise GateContractError("repository name cannot map to an empty state directory")
    digest = hashlib.sha256(repo.casefold().encode("utf-8")).hexdigest()[:10]
    return f"{slug.lower()}-{digest}"


def gate_state_dir(root: pathlib.Path, repo: str) -> pathlib.Path:
    """Keep the Jovie authority receipt stable across multi-repo drain cycles."""
    base = root / "state" / "gem-priority-gate"
    if _is_jovie_repo(repo):
        return base
    # Sibling directories retain the gate's shared ROOT/state/integrity.json and
    # ROOT/.gem-ship-paused-pr-queue authority while avoiding latest.json collisions.
    return base.with_name(f"{base.name}-{_repo_key(repo)}")


def drain_state_dir(root: pathlib.Path, repo: str) -> pathlib.Path:
    """Preserve Jovie's legacy artifact while isolating every other repository."""
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
    """Validate schema and require exit 0/2 to match typed admission exactly."""
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
    if direct_gem_allowed:
        raise GateContractError("direct Gem pickup must remain disabled")
    remediation = receipt.get("remediationAdmission", {})
    if not remediation_allowed or remediation.get("localAllowed") is not True:
        raise GateContractError("observation and bounded local remediation must remain live")
    push_allowed = remediation.get("pushAllowed")
    if not isinstance(push_allowed, bool):
        raise GateContractError("remediation push admission is missing or is not boolean")
    if push_allowed != (state != "RED"):
        raise GateContractError("remote remediation must fail closed only on RED")
    maximum = remediation.get("maxConcurrent")
    if isinstance(maximum, bool) or not isinstance(maximum, int) or maximum < 1:
        raise GateContractError("remediation concurrency must be a positive integer")
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
