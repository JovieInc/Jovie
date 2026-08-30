#!/usr/bin/env python3
"""Bounded Auto-Enroll admission projection for jovie-fleet-gate/v1."""

from __future__ import annotations

import json
import sys
from typing import Any

SCHEMA = "jovie-fleet-gate/v1"
CLOSURE_HEALTH_SCHEMA = "jovie-closure-health/v1"
PROMOTION_MODES = frozenset(
    {"normal", "isolated-only", "draft-only", "hold-intake", "blocked"}
)
STATES = frozenset({"GREEN", "AMBER", "RED"})
INTEGRITY_STATUSES = frozenset({"clear", "resolved", "active", "invalid"})
CLOSURE_STATUSES = frozenset({"healthy", "grace", "red"})
MAX_ADMISSION_JSON_BYTES = 32 * 1024
DIAGNOSTIC_INVENTORY_KEYS = frozenset(
    {
        "classifications",
        "changedFileEvidence",
        "duplicateIssueLanes",
        "dispositions",
        "unclassified",
        "expiredHolds",
        "episodes",
        "stackHealth",
        "repairActions",
    }
)

class AdmissionProjectionError(ValueError):
    """The source receipt cannot produce a typed admission projection."""

def _require_mapping(value: object, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AdmissionProjectionError(f"{name} is missing or is not an object")
    return value


def _require_bool(value: object, name: str) -> bool:
    if not isinstance(value, bool):
        raise AdmissionProjectionError(f"{name} must be boolean")
    return value


def _require_str(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise AdmissionProjectionError(f"{name} must be a non-empty string")
    return value


def _hex_sha(value: object, name: str) -> str:
    sha = _require_str(value, name)
    if len(sha) != 40 or any(character not in "0123456789abcdef" for character in sha):
        raise AdmissionProjectionError(f"{name} must be an exact lowercase SHA")
    return sha


def _project_reasons(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise AdmissionProjectionError("reasons must be a list")
    projected: list[dict[str, str]] = []
    for index, reason in enumerate(value):
        item = _require_mapping(reason, f"reasons[{index}]")
        projected.append(
            {
                "code": _require_str(item.get("code"), f"reasons[{index}].code"),
                "layer": _require_str(item.get("layer"), f"reasons[{index}].layer"),
                "severity": _require_str(
                    item.get("severity"), f"reasons[{index}].severity"
                ),
                "detail": _require_str(item.get("detail"), f"reasons[{index}].detail"),
            }
        )
    return projected


def _project_closure_health(value: object) -> dict[str, Any]:
    signal = _require_mapping(value, "signals.closureHealth")
    status = signal.get("status")
    if status not in CLOSURE_STATUSES:
        raise AdmissionProjectionError("closure health status is invalid")
    reasons = signal.get("reasons")
    if not isinstance(reasons, list) or not all(
        isinstance(reason, str) for reason in reasons
    ):
        raise AdmissionProjectionError("closure health reasons are malformed")
    projected = {
        "schema": CLOSURE_HEALTH_SCHEMA,
        "status": status,
        "authority": "Summer",
        "newIssueIntakeAllowed": _require_bool(
            signal.get("newIssueIntakeAllowed"),
            "signals.closureHealth.newIssueIntakeAllowed",
        ),
        "promotionContinues": True,
        "remediationContinues": True,
        "reasons": list(reasons),
    }
    if projected["newIssueIntakeAllowed"] is not (status == "healthy"):
        raise AdmissionProjectionError("closure health status contradicts intake signal")
    if signal.get("schema") != CLOSURE_HEALTH_SCHEMA:
        raise AdmissionProjectionError("closure health signal schema is invalid")
    if signal.get("authority") != "Summer":
        raise AdmissionProjectionError("closure health authority is not Summer")
    if signal.get("promotionContinues") is not True:
        raise AdmissionProjectionError("closure health signal must preserve promotion")
    if signal.get("remediationContinues") is not True:
        raise AdmissionProjectionError("closure health signal must preserve remediation")
    observed_at = signal.get("observedAt")
    if isinstance(observed_at, str) and observed_at:
        projected["observedAt"] = observed_at
    return projected


def _project_signals(value: object) -> dict[str, Any]:
    signals = _require_mapping(value, "signals")
    main = _require_mapping(signals.get("main"), "signals.main")
    production = _require_mapping(signals.get("production"), "signals.production")
    integrity = _require_mapping(signals.get("integrity"), "signals.integrity")
    integrity_status = integrity.get("status")
    if integrity_status not in INTEGRITY_STATUSES:
        raise AdmissionProjectionError("signals.integrity.status is invalid")
    main_status = _require_str(main.get("status"), "signals.main.status")
    production_status = _require_str(
        production.get("status"), "signals.production.status"
    )
    projected_main: dict[str, Any] = {
        "status": main_status,
        "sha": _hex_sha(main.get("sha"), "signals.main.sha"),
    }
    projected_production: dict[str, Any] = {"status": production_status}
    deployed = production.get("deployedSha")
    if isinstance(deployed, str) and deployed:
        projected_production["deployedSha"] = deployed
    projected = {
        "main": projected_main,
        "production": projected_production,
        "integrity": {"status": integrity_status},
        "closureHealth": _project_closure_health(signals.get("closureHealth")),
    }
    controller = signals.get("controller")
    if isinstance(controller, dict) and isinstance(controller.get("status"), str):
        projected["controller"] = {"status": controller["status"]}
    return projected


def _project_isolated(value: object) -> dict[str, Any]:
    admission = _require_mapping(value, "isolatedPromotionAdmission")
    return {
        "allowed": _require_bool(
            admission.get("allowed"), "isolatedPromotionAdmission.allowed"
        ),
        "deploymentsAllowed": _require_bool(
            admission.get("deploymentsAllowed"),
            "isolatedPromotionAdmission.deploymentsAllowed",
        ),
    }


def _project_unbound_repair(value: object, promotion_mode: str) -> dict[str, Any]:
    if value is None:
        if promotion_mode == "hold-intake":
            raise AdmissionProjectionError(
                "hold-intake requires productionUnboundRepairAdmission"
            )
        return {
            "allowed": False,
            "condition": None,
            "mainSha": None,
            "deployedSha": None,
            "maxConcurrent": 1,
            "deploymentsAllowed": False,
        }
    admission = _require_mapping(value, "productionUnboundRepairAdmission")
    allowed = _require_bool(
        admission.get("allowed"), "productionUnboundRepairAdmission.allowed"
    )
    projected = {
        "allowed": allowed,
        "condition": admission.get("condition"),
        "mainSha": admission.get("mainSha"),
        "deployedSha": admission.get("deployedSha"),
        "maxConcurrent": admission.get("maxConcurrent"),
        "deploymentsAllowed": _require_bool(
            admission.get("deploymentsAllowed"),
            "productionUnboundRepairAdmission.deploymentsAllowed",
        ),
    }
    if projected["maxConcurrent"] != 1:
        raise AdmissionProjectionError("unbound repair maxConcurrent must be 1")
    if allowed:
        if projected["condition"] != "production-deployment-unbound":
            raise AdmissionProjectionError("allowed unbound repair is unbound")
        _hex_sha(projected["mainSha"], "productionUnboundRepairAdmission.mainSha")
        deployed = projected["deployedSha"]
        if not isinstance(deployed, str) or len(deployed) < 7 or projected["mainSha"] == deployed:
            raise AdmissionProjectionError("allowed unbound repair SHAs are invalid")
    elif projected["condition"] is not None or projected["mainSha"] is not None or projected["deployedSha"] is not None:
        raise AdmissionProjectionError("denied unbound repair must not carry a bound identity")
    return projected


def _project_closure_admission(value: object) -> dict[str, Any]:
    admission = _require_mapping(value, "closureAdmission")
    intake = _require_bool(
        admission.get("newIssueIntakeAllowed"),
        "closureAdmission.newIssueIntakeAllowed",
    )
    status = admission.get("status")
    if status not in CLOSURE_STATUSES or intake is not (status == "healthy"):
        raise AdmissionProjectionError("closureAdmission status contradicts intake")
    if (
        admission.get("authority") != "Summer"
        or admission.get("promotionContinues") is not True
        or admission.get("remediationContinues") is not True
    ):
        raise AdmissionProjectionError("closureAdmission must preserve Summer promotion")
    projected = {
        "allowed": _require_bool(admission.get("allowed"), "closureAdmission.allowed"),
        "newIssueIntakeAllowed": intake,
        "newImplementationAllowed": _require_bool(
            admission.get("newImplementationAllowed"),
            "closureAdmission.newImplementationAllowed",
        ),
        "fallbackPrGenerationAllowed": _require_bool(
            admission.get("fallbackPrGenerationAllowed"),
            "closureAdmission.fallbackPrGenerationAllowed",
        ),
        "authority": "Summer",
        "status": status,
        "promotionContinues": True,
        "remediationContinues": True,
    }
    for field in ("allowed", "newImplementationAllowed", "fallbackPrGenerationAllowed"):
        if projected[field] is not intake:
            raise AdmissionProjectionError(f"closureAdmission.{field} contradicts intake")
    reasons = admission.get("reasons")
    if isinstance(reasons, list) and all(isinstance(reason, str) for reason in reasons):
        projected["reasons"] = list(reasons)
    return projected


def _project_cohort(value: object, promotion_mode: str, intake: bool) -> dict[str, Any]:
    cohort = _require_mapping(value, "alreadyAdmittedCohort")
    preserve = _require_bool(cohort.get("preserve"), "alreadyAdmittedCohort.preserve")
    new_intake = _require_bool(
        cohort.get("newIntakeAllowed"), "alreadyAdmittedCohort.newIntakeAllowed"
    )
    if promotion_mode == "hold-intake":
        if preserve is not True:
            raise AdmissionProjectionError(
                "hold-intake must preserve the admitted cohort"
            )
        if new_intake is not intake:
            raise AdmissionProjectionError(
                "alreadyAdmittedCohort.newIntakeAllowed contradicts closure intake"
            )
    projected: dict[str, Any] = {
        "preserve": preserve,
        "newIntakeAllowed": new_intake,
    }
    semantics = cohort.get("semantics")
    if isinstance(semantics, str) and semantics:
        projected["semantics"] = semantics
    return projected


def _reject_inventories(value: object, path: str) -> None:
    if isinstance(value, dict):
        leaked = DIAGNOSTIC_INVENTORY_KEYS.intersection(value)
        if leaked:
            raise AdmissionProjectionError(
                f"{path} leaked diagnostic inventories: {sorted(leaked)}"
            )
        for key, child in value.items():
            _reject_inventories(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_inventories(child, f"{path}[{index}]")


def project_fleet_admission_receipt(receipt: object) -> dict[str, Any]:
    """Return a bounded jovie-fleet-gate/v1 admission projection."""
    source = _require_mapping(receipt, "fleet receipt")
    if source.get("schema") != SCHEMA:
        raise AdmissionProjectionError(f"schema must be {SCHEMA}")
    promotion_mode = source.get("promotionMode")
    if promotion_mode not in PROMOTION_MODES:
        raise AdmissionProjectionError("promotionMode is missing or invalid")
    state = source.get("state")
    if state not in STATES:
        raise AdmissionProjectionError("state must be GREEN, AMBER, or RED")
    closure_admission = _project_closure_admission(source.get("closureAdmission"))
    isolated = _project_isolated(source.get("isolatedPromotionAdmission"))
    promotion = _require_mapping(source.get("promotionAdmission"), "promotionAdmission")
    work = _require_mapping(source.get("workAdmission"), "workAdmission")
    projected: dict[str, Any] = {
        "schema": SCHEMA,
        "observedAt": _require_str(source.get("observedAt"), "observedAt"),
        "state": state,
        "promotionMode": promotion_mode,
        "reasons": _project_reasons(source.get("reasons")),
        "signals": _project_signals(source.get("signals")),
        "promotionAdmission": {
            "allowed": _require_bool(
                promotion.get("allowed"), "promotionAdmission.allowed"
            )
        },
        "isolatedPromotionAdmission": isolated,
        "productionUnboundRepairAdmission": _project_unbound_repair(
            source.get("productionUnboundRepairAdmission"), promotion_mode
        ),
        "closureAdmission": closure_admission,
        "alreadyAdmittedCohort": _project_cohort(
            source.get("alreadyAdmittedCohort"),
            promotion_mode,
            closure_admission["newIssueIntakeAllowed"],
        ),
        "workAdmission": {
            "allowed": _require_bool(work.get("allowed"), "workAdmission.allowed"),
            "newIssueLeaseAllowed": _require_bool(
                work.get("newIssueLeaseAllowed"), "workAdmission.newIssueLeaseAllowed"
            ),
        },
    }
    deployment = source.get("deploymentAdmission")
    if isinstance(deployment, dict):
        projected["deploymentAdmission"] = {
            "allowed": _require_bool(
                deployment.get("allowed"), "deploymentAdmission.allowed"
            )
        }
    if (
        projected["signals"]["closureHealth"]["newIssueIntakeAllowed"]
        is not closure_admission["newIssueIntakeAllowed"]
    ):
        raise AdmissionProjectionError("closure signal and admission disagree")
    _reject_inventories(projected, "admission")
    encoded = json.dumps(projected, separators=(",", ":"), sort_keys=True)
    if len(encoded.encode("utf-8")) > MAX_ADMISSION_JSON_BYTES:
        raise AdmissionProjectionError(
            "admission projection exceeds the Auto-Enroll transport bound"
        )
    return projected


def main() -> int:
    try:
        receipt = json.load(sys.stdin)
        projection = project_fleet_admission_receipt(receipt)
        json.dump(projection, sys.stdout, separators=(",", ":"), sort_keys=True)
        sys.stdout.write("\n")
        return 0
    except (AdmissionProjectionError, json.JSONDecodeError, TypeError, ValueError) as error:
        print(f"::error::Fleet admission projection failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
