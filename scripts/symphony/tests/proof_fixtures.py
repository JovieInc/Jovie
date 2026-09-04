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
# Runtime access is mocked only by the test harness; production has no bypass.
REAL_LIVE_RUNTIME = trust.live_runtime
GENERATION = hashlib.sha256(b"mock-service-generation").hexdigest()
trust.live_runtime = lambda value: GENERATION
RUNNER = ROOT / "codex-test-runner"
RUNNER.write_text("#!/bin/sh\nexit 78\n")
RUNNER.chmod(0o700)
SOURCE = Path(__file__).resolve().parents[3]
RUNTIME = {"schema": contract.RUNTIME_IDENTITY_SCHEMA, "service": contract.OFFICIAL_RUNTIME_SERVICE,
    "sourceRevision": subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip(),
    "binarySha256": trust.digest(RUNNER),
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
    if not (account.parent / "state.json").exists():
        write_private(account.parent / "state.json", {"cooldowns": {}})
    profile = trust.profile_identity(account)
    row = {"provider": "openai", "profile": profile, "model": "gpt-5.6-sol", "agentProfile": "coder", "accountPath": str(account)}
    row["accountStateSha256"] = trust.account_state(row, now)
    ACCOUNTS[profile] = row
    p = {"runtimeGeneration": GENERATION, "codexSha256": trust.digest(RUNNER), "accountStateSha256": row["accountStateSha256"], "schema": contract.PROOF_SCHEMA, "producer": contract.PROOF_SOURCE, "agentProfile": "coder",
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


def install_test_python():
    wrapper = ROOT / "python3"
    wrapper.write_text("#!" + sys.executable + "\nimport sys, runpy\nsys.path.insert(0, " + repr(str(Path(__file__).parent)) + ")\nimport proof_fixtures\nsys.argv = sys.argv[1:]\nif sys.argv[0] == '-c':\n code = sys.argv.pop(1)\n exec(compile(code, '<string>', 'exec'), {'__name__':'__main__'})\nelif sys.argv[0].endswith('symphony_proof_context.py'):\n raise SystemExit(proof_fixtures.trust.main())\nelse: runpy.run_path(sys.argv[0], run_name='__main__')\n")
    wrapper.chmod(0o700)
    if not os.environ["PATH"].startswith(str(ROOT) + os.pathsep):
        os.environ["PATH"] = str(ROOT) + os.pathsep + os.environ["PATH"]


def refresh(now):
    install_test_python()
    write_private(CONTEXT, {"runtime": RUNTIME, "sourceRoot": str(SOURCE),
        "binaryPath": str(RUNNER), "codexPath": str(RUNNER), "codexSha256": trust.digest(RUNNER), "workflowPath": str(SOURCE / "scripts/symphony/WORKFLOW.md"),
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


if __name__ == "__main__":
    # Node owns this temporary directory and keeps it alive through validation.
    ROOT = Path(sys.argv[3])
    ARTIFACTS = ROOT / "attestations"
    ARTIFACTS.mkdir(mode=0o700, exist_ok=True)
    CONTEXT = ROOT / "context.json"
    RUNNER = ROOT / "codex-test-runner"
    RUNNER.write_text("#!/bin/sh\nexit 78\n")
    RUNNER.chmod(0o700)
    print(json.dumps({"evidence": evidence(int(sys.argv[1]), sys.argv[2]), "contextPath": str(CONTEXT)}))
