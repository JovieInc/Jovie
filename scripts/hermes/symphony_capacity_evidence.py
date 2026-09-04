#!/usr/bin/env python3
"""Project useful-turn proofs into dispatch capacity (JOV-INV-007).

OAuth/account files are inventory only. This process never invokes a provider,
refreshes credentials, or rewrites proof timestamps. A seat is usable only when
the ledger contains a fresh successful turn with a useful, digest-bound output.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from datetime import datetime, timezone
from typing import Any

HERMES_DIR = str(pathlib.Path(__file__).resolve().parent)
if HERMES_DIR not in sys.path:
    sys.path.insert(0, HERMES_DIR)

from gem_gate_contract import (  # noqa: E402 - installed sibling module
    CAPACITY_MAX_TARGET as MAX_TARGET,
    CAPACITY_SCHEMA as RECEIPT_SCHEMA,
    CAPACITY_SOURCE as SOURCE,
    PROOF_SCHEMA,
    accepted_useful_turn_proofs as accepted_proofs,
    validate_capacity_receipt as validate_receipt,
    validate_useful_turn_proof as validate_proof,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _inventory_rows(value: object) -> list[dict[str, str]]:
    rows = value.get("accounts", []) if isinstance(value, dict) else []
    enrolled: dict[tuple[str, str], dict[str, str]] = {}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        provider, profile = row.get("provider"), row.get("profile")
        if isinstance(provider, str) and provider.strip() and isinstance(profile, str) and profile.strip():
            enrolled[(provider.strip(), profile.strip())] = {
                "provider": provider.strip(),
                "profile": profile.strip(),
                "status": "enrolled",
            }
    return [enrolled[key] for key in sorted(enrolled)]


def build_receipt(
    rows: list[object], inventory: object, now: datetime
) -> dict[str, Any]:
    proofs, rejected = accepted_proofs(rows, now)
    if len(proofs) > MAX_TARGET:
        rejected["policy-cap"] = len(proofs) - MAX_TARGET
        proofs = proofs[:MAX_TARGET]
    enrolled = _inventory_rows(inventory)
    providers: dict[str, dict[str, int]] = {}
    for row in enrolled:
        providers.setdefault(row["provider"], {"enrolled": 0, "ready": 0})["enrolled"] += 1
    for proof in proofs:
        providers.setdefault(proof["provider"], {"enrolled": 0, "ready": 0})["ready"] += 1
    return {
        "schema": RECEIPT_SCHEMA,
        "source": SOURCE,
        "observedAt": isoformat(now),
        "target": len(proofs),
        "approved": bool(proofs),
        "severeIncidents": 0,
        "acceptedEvidence": proofs,
        "inventory": enrolled,
        "providers": providers,
        "rejectedProofs": rejected,
    }


def _read_jsonl(path: pathlib.Path) -> list[object]:
    rows: list[object] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return rows
    for line in lines:
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            rows.append(None)
    return rows


def _write_atomic(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser()
    root = pathlib.Path("/home/timwhite/gem-workspace/state")
    parser.add_argument("--proof-ledger", type=pathlib.Path, default=root / "useful-turn-proofs.jsonl")
    parser.add_argument("--inventory", type=pathlib.Path, default=root / "provider-inventory.json")
    parser.add_argument("--output", type=pathlib.Path, default=root / "concurrency.json")
    args = parser.parse_args()
    try:
        inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        inventory = {}
    receipt = build_receipt(_read_jsonl(args.proof_ledger), inventory, utc_now())
    _write_atomic(args.output, receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
