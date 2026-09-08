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
    V2_CAPACITY_MAX_TARGET as MAX_TARGET,
    V2_CAPACITY_SCHEMA as RECEIPT_SCHEMA,
    V2_CAPACITY_SOURCE as SOURCE,
    V2_PROOF_SCHEMA,
    V2_PROVIDER_ID,
    V2_SHA256,
    v2_accepted_useful_turn_proofs as accepted_proofs,
    v2_validate_capacity_receipt as validate_receipt,
    v2_validate_useful_turn_proof as validate_proof,
)
def utc_now() -> datetime:
    return datetime.now(timezone.utc)
def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def build_receipt(rows: list[object], inventory: object, now: datetime, *, context: dict | None = None) -> dict[str, Any]:
    # Inventory carried by an input receipt cannot confer enrollment authority.
    if context is None:
        proofs, rejected, enrolled = [], {"trust-context-missing": len(rows)}, []
    else:
        proofs, rejected = accepted_proofs(rows, now,
            expected_runtime=context["runtime"],
            expected_contract_sha=context["runtime"]["contractSha256"],
            attestations=context["attestations"])
        enrolled = context["accounts"]
    enrolled_seats = {(row["provider"], row["profile"], row["model"]) for row in enrolled}
    accepted = [proof for proof in proofs if (proof["provider"], proof["profile"], proof["model"]) in enrolled_seats]
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
        "runtime": context["runtime"] if context else None,
        "contractSha256": context["runtime"]["contractSha256"] if context else None,
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
    from symphony_proof_context import load_context
    import subprocess
    now = utc_now()
    try:
        context = load_context(now)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        context = None
    receipt = build_receipt(_read_jsonl(args.proof_ledger), inventory, now, context=context)
    _write_atomic(args.output, receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
