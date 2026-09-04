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
from datetime import datetime, timedelta

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


PROC_ROOT = Path("/proc")


def service_identity() -> tuple[int, str]:
    result = subprocess.run(["systemctl", "show", contract.OFFICIAL_RUNTIME_SERVICE,
        "--property=MainPID,ControlGroup,ActiveState"], capture_output=True, text=True, check=True, timeout=5)
    fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if fields.get("ActiveState") != "active" or int(fields.get("MainPID", 0)) <= 0:
        raise ValueError("official runtime inactive")
    return int(fields["MainPID"]), fields["ControlGroup"]


def live_runtime(value: dict) -> str:
    """Bind the official service PID, start time, cgroup and owned 4041 socket."""
    pid, group = service_identity()
    process = PROC_ROOT / str(pid)
    before = (process / "stat").read_text().rsplit(")", 1)[1].split()[19]
    groups = [line.split(":", 2)[2] for line in (process / "cgroup").read_text().splitlines()]
    if not group or group not in groups:
        raise ValueError("official runtime cgroup mismatch")
    args = (process / "cmdline").read_bytes().decode().split("\0")
    binary, workflow = str(Path(value["binaryPath"]).resolve()), str(Path(value["workflowPath"]).resolve())
    if (binary not in args and str((process / "exe").resolve()) != binary) or workflow not in args:
        raise ValueError("official runtime command mismatch")
    sockets = {entry.readlink().name for entry in (process / "fd").iterdir() if entry.is_symlink()}
    listeners = set()
    for name in ("tcp", "tcp6"):
        for line in (process / "net" / name).read_text().splitlines()[1:]:
            fields = line.split()
            if fields[1].rsplit(":", 1)[1] == "0FC9" and fields[3] == "0A":
                listeners.add("socket:[" + fields[9] + "]")
    after = (process / "stat").read_text().rsplit(")", 1)[1].split()[19]
    if not sockets.intersection(listeners) or before != after or service_identity() != (pid, group):
        raise ValueError("official runtime listener or generation mismatch")
    return hashlib.sha256(json.dumps([pid, group, before]).encode()).hexdigest()


def account_state(row: dict, now: datetime) -> str:
    account = Path(row["accountPath"])
    state = private_json(account.parent / "state.json")
    if not isinstance(state, dict) or any(not isinstance(state.get(k, {}), dict) for k in ("cooldowns", "last_error")):
        raise ValueError("invalid account state")
    cooldown = state.get("cooldowns", {}).get(account.name, 0)
    error = state.get("last_error", {}).get(account.name)
    if type(cooldown) is not int or cooldown > now.timestamp() or error:
        raise ValueError("account cooling or failed")
    return hashlib.sha256(json.dumps([cooldown, error], sort_keys=True).encode()).hexdigest()


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
    generation = live_runtime(value)
    runner = Path(value["codexPath"])
    if runner.is_symlink() or not runner.is_file() or not os.access(runner, os.X_OK) or digest(runner) != value["codexSha256"]:
        raise ValueError("untrusted completion executable")
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
        enrolled.append({**row, "accountStateSha256": account_state(row, now)})
    artifacts = Path(value["attestationDir"])
    info = artifacts.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("untrusted attestation directory")
    attestations = {}
    for artifact in artifacts.glob("*.json"):
        if not contract.SHA256.fullmatch(artifact.stem):
            continue
        try:
            proof = private_json(artifact)
            seat = next((row for row in enrolled if row["profile"] == proof.get("profile") and row["provider"] == proof.get("provider")), None)
            if (seat is not None and proof.get("accountStateSha256") == seat["accountStateSha256"]
                and proof.get("runtimeGeneration") == generation and proof.get("codexSha256") == value["codexSha256"]):
                attestations[artifact.stem] = proof
        except (OSError, ValueError, AttributeError):
            continue
    return {"runtimeGeneration": generation, "codexPath": runner.resolve(), "codexSha256": value["codexSha256"], "runtime": runtime, "accounts": enrolled, "attestations": attestations,
            "attestationDir": artifacts, "contextPath": path}


def validation_args(context: dict) -> dict:
    return {"expected_runtime": context["runtime"],
            "expected_contract_sha": context["runtime"]["contractSha256"],
            "attestations": context["attestations"],
            "enrolled_seats": {(r["provider"], r["profile"], r["model"]) for r in context["accounts"]}}


def validate_local_receipt(value: object, now: datetime, max_age=contract.CAPACITY_MAX_AGE):
    try:
        context = load_context(now)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return False, "capacity-evidence-trust-context-invalid", []
    return contract.validate_capacity_receipt(value, now, max_age, **validation_args(context))


def main() -> int:
    """Canonical stdin boundary for the JavaScript admission consumer."""
    import sys
    try:
        raw = sys.stdin.read(1_048_577)
        if len(raw) > 1_048_576:
            raise ValueError("capacity request too large")
        request = json.loads(raw)
        now = contract._parse_time(request.get("now"))
        maximum = request.get("maxAgeMs")
        if now is None or type(maximum) is not int or not 0 < maximum <= 86_400_000:
            raise ValueError("invalid freshness bounds")
        accepted, reason, rows = validate_local_receipt(request.get("receipt"), now, timedelta(milliseconds=maximum))
        print(json.dumps({"accepted": accepted, "reason": reason,
                          "seats": [row["provider"] + "\0" + row["profile"] for row in rows]}))
        return 0
    except (AttributeError, OSError, ValueError, TypeError):
        print(json.dumps({"accepted": False, "reason": "capacity-request-invalid", "seats": []}))
        return 78


if __name__ == "__main__":
    raise SystemExit(main())
