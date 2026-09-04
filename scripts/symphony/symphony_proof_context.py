"""Local trust boundary for completion evidence; never accepts a ledger's own attestation.

The operator-owned context names the installed binary/workflow and source tree.
Consumers remeasure these files and the enrolled profiles on every observation.
Private completion artifacts belong to the same OS principal as the probe. This
is filesystem provenance, not a signature against a compromised host principal.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from datetime import datetime

import gem_gate_contract as contract


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path) -> object:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("untrusted evidence permissions")
    return json.loads(path.read_text())


def profile_identity(path: Path) -> str:
    # Configuration and auth replacement invalidate prior enrollment/proofs.
    if path.is_symlink() or not path.is_dir():
        raise ValueError("invalid account path")
    if any((path / name).is_symlink() for name in ("auth.json", "config.toml")):
        raise ValueError("symlinked account identity")
    parts = [str(path.resolve()), digest(path / "auth.json"), digest(path / "config.toml")]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


def load_context(now: datetime, path: Path | None = None) -> dict:
    path = path or Path(os.environ.get("SYMPHONY_PROOF_CONTEXT", "/home/timwhite/gem-workspace/state/proof-context.json"))
    value = private_json(path)
    if not isinstance(value, dict):
        raise ValueError("context must be an object")
    runtime = contract.validate_runtime_identity(value.get("runtime"))
    if runtime is None or runtime["contractSha256"] != digest(Path(contract.__file__)):
        raise ValueError("imported contract mismatch")
    revision = subprocess.run(["git", "-C", value["sourceRoot"], "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True, timeout=5).stdout.strip()
    if (revision != runtime["sourceRevision"]
        or digest(Path(value["binaryPath"])) != runtime["binarySha256"]
        or digest(Path(value["workflowPath"])) != runtime["workflowSha256"]):
        raise ValueError("runtime build mismatch")
    observed = contract._parse_time(value.get("observedAt"))
    if observed is None or not 0 <= (now - observed).total_seconds() <= 600:
        raise ValueError("stale enrollment")
    accounts = value.get("accounts")
    if not isinstance(accounts, list):
        raise ValueError("missing enrollment")
    seats = set()
    enrolled = []
    for row in accounts:
        if not isinstance(row, dict):
            raise ValueError("malformed enrollment")
        provider, profile, model = (row.get(k) for k in ("provider", "profile", "model"))
        if (not isinstance(provider, str) or not contract.PROVIDER_ID.fullmatch(provider)
            or not isinstance(model, str) or not contract.MODEL_ID.fullmatch(model)
            or profile != profile_identity(Path(row["accountPath"]))
            or row.get("agentProfile") != "coder"):
            raise ValueError("enrollment identity mismatch")
        seat = (provider, profile)
        if seat in seats:
            raise ValueError("duplicate enrollment")
        seats.add(seat)
        enrolled.append(dict(row))
    artifacts = Path(value["attestationDir"])
    info = artifacts.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("untrusted attestation directory")
    attestations = {}
    for artifact in artifacts.glob("*.json"):
        if not contract.SHA256.fullmatch(artifact.stem):
            continue
        try:
            attestations[artifact.stem] = private_json(artifact)
        except (OSError, ValueError):
            continue
    return {"runtime": runtime, "accounts": enrolled, "attestations": attestations,
            "attestationDir": artifacts, "contextPath": path}


def validation_args(context: dict) -> dict:
    return {"expected_runtime": context["runtime"],
            "expected_contract_sha": context["runtime"]["contractSha256"],
            "attestations": context["attestations"],
            "enrolled_seats": {(r["provider"], r["profile"], r["model"]) for r in context["accounts"]}}


def validate_local_receipt(value: object, now: datetime):
    try:
        context = load_context(now)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return False, "capacity-evidence-trust-context-invalid", []
    return contract.validate_capacity_receipt(value, now, **validation_args(context))
