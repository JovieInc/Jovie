"""Real local files at the proof trust boundary; no provider/network calls."""
import atexit
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from datetime import datetime, timezone
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gem_gate_contract as contract
import symphony_proof_context as trust

TMP = tempfile.TemporaryDirectory()
atexit.register(TMP.cleanup)
ROOT = Path(TMP.name)
ARTIFACTS = ROOT / "attestations"
ARTIFACTS.mkdir(mode=0o700)
CONTEXT = ROOT / "context.json"
SOURCE = Path(__file__).resolve().parents[3]
RUNTIME = {"schema": contract.RUNTIME_IDENTITY_SCHEMA, "service": contract.OFFICIAL_RUNTIME_SERVICE,
    "sourceRevision": subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip(),
    "binarySha256": trust.digest(Path(contract.__file__)),
    "workflowSha256": trust.digest(SOURCE / "scripts/symphony/WORKFLOW.md"),
    "contractSha256": trust.digest(Path(contract.__file__))}
ACCOUNTS = {}
ATTESTATIONS = {}


def write_private(path, value):
    path.write_text(json.dumps(value))
    path.chmod(0o600)


def proof(now, name="1"):
    account = ROOT / ("account-" + str(name))
    account.mkdir(exist_ok=True)
    (account / "auth.json").write_text("{}")
    (account / "config.toml").write_text('model = "gpt-5.6-sol"')
    profile = trust.profile_identity(account)
    row = {"provider": "openai", "profile": profile, "model": "gpt-5.6-sol", "agentProfile": "coder", "accountPath": str(account)}
    ACCOUNTS[profile] = row
    p = {"schema": contract.PROOF_SCHEMA, "producer": contract.PROOF_SOURCE, "agentProfile": "coder",
         "attested": True, "runtime": RUNTIME.copy(), "contractSha256": RUNTIME["contractSha256"],
         "probeId": hashlib.sha256((profile + now.isoformat()).encode()).hexdigest(),
         "provider": "openai", "profile": profile, "model": "gpt-5.6-sol", "rc": 0, "useful": True,
         "completedAt": now.isoformat().replace("+00:00", "Z"), "outputDigest": hashlib.sha256(profile.encode()).hexdigest(),
         "outputBytes": 32, "outputTokens": 8}
    attest(p)
    refresh(now)
    return p


def attest(p):
    ATTESTATIONS[p["probeId"]] = json.loads(json.dumps(p))
    write_private(ARTIFACTS / (p["probeId"] + ".json"), p)


def refresh(now):
    write_private(CONTEXT, {"runtime": RUNTIME, "sourceRoot": str(SOURCE),
        "binaryPath": contract.__file__, "workflowPath": str(SOURCE / "scripts/symphony/WORKFLOW.md"),
        "observedAt": now.isoformat(), "accounts": list(ACCOUNTS.values()), "attestationDir": str(ARTIFACTS)})
    os.environ["SYMPHONY_PROOF_CONTEXT"] = str(CONTEXT)


def context(proofs):
    return {"runtime": RUNTIME, "accounts": [ACCOUNTS[p["profile"]] for p in proofs], "attestations": ATTESTATIONS}


def evidence(target=4, observed_at=None):
    now = datetime.fromisoformat(observed_at.replace("Z", "+00:00")) if observed_at else datetime.now(timezone.utc)
    rows = [proof(now, str(i)) for i in range(1, target + 1)]
    refresh(now)
    return {"schema": contract.CAPACITY_SCHEMA, "source": contract.CAPACITY_SOURCE,
            "runtime": RUNTIME, "contractSha256": RUNTIME["contractSha256"], "target": target,
            "approved": target > 0, "severeIncidents": 0, "observedAt": now.isoformat().replace("+00:00", "Z"),
            "acceptedEvidence": rows}
