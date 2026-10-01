#!/usr/bin/env python3
"""Surface-scoped decision layer for the canonical fleet admission receipt."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_FLEET_GATE_DIR = Path(__file__).resolve().parent
if str(_FLEET_GATE_DIR) not in sys.path:
    sys.path.insert(0, str(_FLEET_GATE_DIR))

from gem_gate_contract import SURFACE_SCOPED_OPTIONAL_CHECKS  # noqa: E402

POLICY_VERSION = "jovie.fleet-admission/2026-10-01.1"
SCHEMA = "jovie-fleet-admission/v2"
MAX_AGE = timedelta(minutes=10)
RISK_LANES = frozenset({"not_applicable", "low", "medium", "high", "unknown"})
SURFACE_DEPENDENCIES = {
    "fleet-control": ("global-integrity",),
    "fleet-intake": ("symphony-capacity", "global-integrity"),
    "staging-web": ("main", "staging-alias"),
    "production-web": ("main", "vercel-alias", "global-integrity"),
    "migration": ("main", "vercel-alias", "database", "global-integrity"),
    "desktop-release": ("main", "desktop-release", "global-integrity"),
    "worker-deploy": ("main", "worker-runtime", "global-integrity"),
}
HARD_INVARIANTS = tuple(f"{name}-gates-preserved" for name in (
    "auth", "migration", "payment", "data-integrity", "rollback"))
STATUS_WEIGHT = {"healthy": 0, "unknown": 1, "unhealthy": 2}

class ScopedAdmissionError(ValueError):
    pass
def _string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ScopedAdmissionError(f"{name} must be a non-empty string")
    return value.strip()
def _sha(value: object, name: str) -> str:
    revision = _string(value, name)
    if len(revision) != 40 or any(char not in "0123456789abcdef" for char in revision):
        raise ScopedAdmissionError(f"{name} must be an exact lowercase SHA")
    return revision
def _time(value: object, name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(_string(value, name).replace("Z", "+00:00"))
    except ValueError as error:
        raise ScopedAdmissionError(f"{name} must be ISO-8601") from error
    if parsed.tzinfo is None:
        raise ScopedAdmissionError(f"{name} must include a timezone")
    return parsed.astimezone(timezone.utc)

def _status(value: object) -> str:
    if value is True or value in {"green", "clear", "resolved", "healthy", "ok"}:
        return "healthy"
    if value is False or value in {"red", "active", "invalid", "failed", "unhealthy"}:
        return "unhealthy"
    return "unknown"

def _health_signals(receipt: dict[str, Any], request: dict[str, Any]) -> dict[str, dict[str, Any]]:
    signals = receipt.get("signals") if isinstance(receipt.get("signals"), dict) else {}
    rows: dict[str, dict[str, Any]] = {}
    def record(name: str, status: object, detail: object, proof: str) -> None:
        row = {
            "signal": name,
            "status": _status(status),
            "detail": str(detail or "no detail supplied"),
            "proof": proof,
        }
        prior = rows.get(name)
        if prior is None or STATUS_WEIGHT[row["status"]] > STATUS_WEIGHT[prior["status"]]:
            rows[name] = row
    main = signals.get("main") if isinstance(signals.get("main"), dict) else {}
    record("main", main.get("status"), main.get("error"), "signals.main")
    # JOV-4970: optional main checks stay individually observable. A terminal
    # failure surfaces as `check:<name>` and binds only the surfaces that name
    # it; pending optional lanes degrade nothing globally.
    checks = main.get("checks")
    if isinstance(checks, list):
        for entry in checks:
            if (
                not isinstance(entry, dict)
                or entry.get("classification") != "optional"
                or not isinstance(entry.get("name"), str)
            ):
                continue
            verdict = entry.get("verdict")
            record(
                f"check:{entry['name']}",
                "unhealthy"
                if verdict == "failed"
                else "unknown"
                if verdict == "pending"
                else "healthy",
                entry.get("conclusion") or entry.get("status") or verdict,
                "signals.main.checks",
            )
    production = signals.get("production") if isinstance(signals.get("production"), dict) else {}
    components = production.get("dependencies")
    if isinstance(components, dict) and components:
        for name, value in components.items():
            if isinstance(name, str) and isinstance(value, dict):
                record(name, value.get("status", value.get("ok")), value.get("detail"), f"signals.production.dependencies.{name}")
    else:
        record("vercel-alias", production.get("status"), production.get("error"), "signals.production")
    integrity = signals.get("integrity") if isinstance(signals.get("integrity"), dict) else {}
    record("global-integrity", integrity.get("status"), integrity.get("detail"), "signals.integrity")
    controller = signals.get("controller") if isinstance(signals.get("controller"), dict) else {}
    capacity = signals.get("concurrencyEvidence") if isinstance(signals.get("concurrencyEvidence"), dict) else {}
    capacity_status = capacity.get("accepted") if controller.get("status") == "green" else controller.get("status", "unknown")
    record("symphony-capacity", capacity_status, controller.get("error") or capacity.get("reason"), "signals.controller+concurrencyEvidence")
    closure = signals.get("closureHealth") if isinstance(signals.get("closureHealth"), dict) else {}
    repository = closure.get("repository") or request.get("repository")
    if isinstance(repository, str) and repository:
        record(f"repository:{repository}", closure.get("newIssueIntakeAllowed"), ",".join(closure.get("reasons") or []), "signals.closureHealth")
    extra = request.get("healthSignals", [])
    if not isinstance(extra, list):
        raise ScopedAdmissionError("healthSignals must be a list")
    for index, value in enumerate(extra):
        if not isinstance(value, dict):
            raise ScopedAdmissionError(f"healthSignals[{index}] must be an object")
        name = _string(value.get("signal"), f"healthSignals[{index}].signal")
        record(name, value.get("status"), value.get("detail"), _string(value.get("proof"), f"healthSignals[{index}].proof"))
    return rows

def _required_dependencies(surface: str, risk_lane: str, repository: str) -> list[str]:
    required = list(SURFACE_DEPENDENCIES[surface])
    if surface == "production-web" and risk_lane in {"medium", "high", "unknown"}:
        required.append("database")
    if surface == "fleet-intake":
        required.append(f"repository:{repository}")
    return required

def build_scoped_admission(
    receipt: dict[str, Any], request: object, now: datetime | None = None
) -> dict[str, Any]:
    """Bind one fleet observation to one exact mutation and dependency policy."""
    if not isinstance(request, dict):
        raise ScopedAdmissionError("scoped request must be an object")
    consumer = _string(request.get("consumer"), "consumer")
    surface = _string(request.get("surface"), "surface")
    if surface not in SURFACE_DEPENDENCIES:
        raise ScopedAdmissionError(f"unsupported surface: {surface}")
    repository = _string(request.get("repository"), "repository")
    revision = _sha(request.get("revision"), "revision")
    mutation = _string(request.get("mutation"), "mutation")
    risk_lane = _string(request.get("riskLane"), "riskLane")
    if risk_lane not in RISK_LANES:
        raise ScopedAdmissionError(f"unsupported riskLane: {risk_lane}")
    observed_at = _time(receipt.get("observedAt"), "observedAt")
    evaluated_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    age = evaluated_at - observed_at
    fresh = timedelta(0) <= age <= MAX_AGE
    health = _health_signals(receipt, request)
    required = _required_dependencies(surface, risk_lane, repository)
    # Surface-scoped optional checks (JOV-4970): a failed auxiliary lane gates
    # only the surfaces that name it. Pending or absent optional evidence never
    # becomes a required dependency.
    for check_name in sorted(SURFACE_SCOPED_OPTIONAL_CHECKS.get(surface, ())):
        signal = f"check:{check_name}"
        if health.get(signal, {}).get("status") == "unhealthy":
            required.append(signal)
    blockers = [
        health.get(name, {"signal": name, "status": "unknown", "detail": "required dependency health is missing", "proof": "missing"})
        for name in required
        if health.get(name, {}).get("status") != "healthy"
    ]
    if risk_lane == "unknown":
        blockers.append({"signal": "risk-receipt", "status": "unknown", "detail": "exact JOV-5937 risk lane is missing", "proof": "missing"})
    if not fresh:
        blockers.append({"signal": "receipt-freshness", "status": "unknown", "detail": "fleet observation is stale or future-dated", "proof": "observedAt"})
    blocker_names = {row["signal"] for row in blockers}
    unrelated = sorted(
        (row for name, row in health.items() if row["status"] != "healthy" and name not in blocker_names),
        key=lambda row: row["signal"],
    )
    blockers = sorted(blockers, key=lambda row: row["signal"])
    allowed = not blockers
    mode = "normal" if allowed else "hold-intake" if surface == "fleet-intake" else "isolated-only" if surface == "production-web" and blocker_names <= {"vercel-alias", "database"} else "draft-only" if blocker_names == {"main"} else "blocked"
    reason = (
        f"all dependencies required for {surface}/{mutation} are healthy"
        if allowed
        else "required blockers: " + ", ".join(sorted(blocker_names))
    )
    next_proof = (
        f"persist exact release-lineage admission for {revision}"
        if allowed
        else f"fresh healthy proof for {', '.join(sorted(blocker_names))}"
    )
    return {
        "schema": SCHEMA,
        "policyVersion": POLICY_VERSION,
        "consumer": consumer,
        "surface": surface,
        "repository": repository,
        "revision": revision,
        "requestedMutation": mutation,
        "riskLane": risk_lane,
        "requiredDependencies": required,
        "hardInvariants": list(HARD_INVARIANTS),
        "relevantBlockers": blockers,
        "unrelatedDegradations": unrelated,
        "allowed": allowed,
        "allowedMode": mode,
        "reason": reason,
        "freshness": {
            "observedAt": observed_at.isoformat().replace("+00:00", "Z"),
            "evaluatedAt": evaluated_at.isoformat().replace("+00:00", "Z"),
            "ageSeconds": max(0, int(age.total_seconds())),
            "maxAgeSeconds": int(MAX_AGE.total_seconds()),
            "fresh": fresh,
        },
        "retryTrigger": "none" if allowed else "required-health-or-risk-evidence-changed",
        "nextAction": f"execute {mutation}" if allowed else "refresh scoped fleet admission",
        "nextProof": next_proof,
    }
