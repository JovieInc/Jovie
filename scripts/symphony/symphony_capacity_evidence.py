#!/usr/bin/env python3
"""Project fresh, digest-bound useful-turn proofs into dispatch capacity (JOV-INV-007)."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from datetime import datetime, timezone
from typing import Any

HERMES_DIR = pathlib.Path(__file__).resolve().parent
CONTRACT_DIRS = (HERMES_DIR, pathlib.Path(os.environ.get("GEM_WORKSPACE", "/home/timwhite/gem-workspace")) / "scripts")
for contract_dir in reversed(CONTRACT_DIRS):
    if str(contract_dir) not in sys.path:
        sys.path.insert(0, str(contract_dir))

from gem_gate_contract import (  # noqa: E402 - installed sibling module
    CAPACITY_MAX_TARGET as MAX_TARGET,
    CAPACITY_SCHEMA as RECEIPT_SCHEMA,
    CAPACITY_SOURCE as SOURCE,
    PROOF_SCHEMA,
    PROVIDER_ID,
    SHA256,
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
        if (
            isinstance(provider, str)
            and PROVIDER_ID.fullmatch(provider)
            and isinstance(profile, str)
            and SHA256.fullmatch(profile)
        ):
            enrolled[(provider, profile)] = {
                "provider": provider,
                "profile": profile,
                "status": "enrolled",
            }
    return [enrolled[key] for key in sorted(enrolled)]


def build_receipt(rows: list[object], inventory: object, now: datetime) -> dict[str, Any]:
    proofs, rejected = accepted_proofs(rows, now)
    enrolled = _inventory_rows(inventory)
    enrolled_seats = {(row["provider"], row["profile"]) for row in enrolled}
    accepted = [proof for proof in proofs if (proof["provider"], proof["profile"]) in enrolled_seats]
    if len(accepted) != len(proofs):
        rejected["not-enrolled"] = len(proofs) - len(accepted)
    proofs = accepted
    if len(proofs) > MAX_TARGET:
        rejected["policy-cap"] = len(proofs) - MAX_TARGET
        proofs = proofs[:MAX_TARGET]
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
        with path.open("r", encoding="utf-8") as stream:
            stream.seek(0, os.SEEK_END)
            start = max(0, stream.tell() - 1_048_576)
            stream.seek(start)
            if start:
                stream.readline()
            lines = stream.read().splitlines()
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
    temporary = path.with_name(f".{path.name}.tmp.{os.getpid()}")
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
