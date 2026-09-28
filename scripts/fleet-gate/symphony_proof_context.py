"""Local trust boundary for completion evidence; never accepts a ledger's own attestation.

The operator-owned context names the installed binary/workflow and source tree.
Consumers remeasure these files and the enrolled profiles on every observation.
Private completion artifacts belong to the same OS principal as the probe. This
is filesystem provenance, not a signature against a compromised host principal.

Grok codex-account seats bind the live grok CLI principal (~/.grok/auth.json,
or SYMPHONY_GROK_AUTH_PATH). The bearer key, refresh token, expiry, and
create_time are not part of that identity. The grok CLI owns refresh; this
module never writes the auth file. Other providers still bind the full
auth.json bytes under the account directory.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from datetime import datetime, timedelta, timezone

import gem_gate_contract as contract


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_json(path: Path) -> object:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("untrusted evidence permissions")
    return json.loads(path.read_text())


class GrokAuthError(ValueError):
    """Secret-free failure for the live grok CLI auth file."""


GROK_AUTH_ENV = "SYMPHONY_GROK_AUTH_PATH"
GROK_ISSUER = "https://auth.x.ai"
# Clock skew only. A token this far in the past is expired; refresh stays with the grok CLI.
GROK_TOKEN_EXPIRY_SKEW = timedelta(seconds=30)
# Allowlist. key, refresh_token, expires_at, create_time, names, and unknown fields are excluded.
GROK_STABLE_PRINCIPAL_FIELDS = (
    "auth_mode",
    "email",
    "oidc_client_id",
    "oidc_issuer",
    "principal_id",
    "principal_type",
    "team_id",
    "user_id",
)


def grok_live_auth_path() -> Path:
    """Live grok CLI credentials. A CODEX_HOME/auth.json copy is not authoritative."""
    override = os.environ.get(GROK_AUTH_ENV, "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".grok" / "auth.json"


def _private_grok_auth(path: Path) -> None:
    if path.is_symlink():
        raise GrokAuthError("symlinked grok auth")
    try:
        info = path.lstat()
    except OSError as exc:
        raise GrokAuthError(f"missing grok auth: {path}") from exc
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise GrokAuthError(f"untrusted grok auth permissions: {path}")


def load_grok_auth_document(path: Path | None = None) -> dict:
    auth_path = path or grok_live_auth_path()
    _private_grok_auth(auth_path)
    try:
        data = json.loads(auth_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise GrokAuthError("malformed grok auth") from exc
    if not isinstance(data, dict):
        raise GrokAuthError("malformed grok auth")
    return data


def _is_xai_oidc_entry(key: object, value: object) -> bool:
    if not isinstance(value, dict):
        return False
    issuer = value.get("oidc_issuer")
    if issuer == GROK_ISSUER:
        return True
    # Today's seat files use an https://auth.x.ai::* key. A different issuer is not this seat.
    return issuer is None and "x.ai" in str(key)


def select_xai_oidc_entry(data: dict) -> dict:
    """Select the single https://auth.x.ai OIDC entry. Ambiguous files fail closed."""
    if not isinstance(data, dict) or not data:
        raise GrokAuthError("missing xAI auth entries")
    matches = [value for key, value in data.items() if _is_xai_oidc_entry(key, value)]
    if not matches:
        raise GrokAuthError("no xAI OIDC auth entry")
    if len(matches) != 1:
        raise GrokAuthError("ambiguous xAI auth entries")
    return matches[0]


def grok_stable_principal(entry: dict) -> dict:
    if not isinstance(entry, dict):
        raise GrokAuthError("malformed grok auth")
    principal = {}
    for field in GROK_STABLE_PRINCIPAL_FIELDS:
        if field not in entry or entry[field] is None:
            continue
        value = entry[field]
        if type(value) is not str or not value:
            raise GrokAuthError("malformed grok principal")
        principal[field] = value
    if principal.get("oidc_issuer") != GROK_ISSUER:
        raise GrokAuthError("grok auth issuer mismatch")
    if not principal.get("user_id") and not principal.get("principal_id"):
        raise GrokAuthError("grok auth missing principal")
    return principal


def grok_access_token(entry: dict, now: datetime | None = None) -> str:
    """Return the access token or fail closed. Never includes the token in the error."""
    if not isinstance(entry, dict):
        raise GrokAuthError("malformed grok auth")
    token = entry.get("key")
    if type(token) is not str or not token:
        raise GrokAuthError("no bearer key in grok auth")
    raw = entry.get("expires_at")
    if type(raw) is not str or not raw:
        raise GrokAuthError("grok auth missing expires_at")
    try:
        expiry = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise GrokAuthError("malformed grok auth expires_at") from exc
    if expiry.tzinfo is None:
        raise GrokAuthError("malformed grok auth expires_at")
    current = now or datetime.now(timezone.utc)
    if expiry <= current - GROK_TOKEN_EXPIRY_SKEW:
        raise GrokAuthError("grok access token expired")
    return token


def _toml_model_provider(path: Path) -> str | None:
    if path.is_symlink() or not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if "=" not in line:
            continue
        left, right = line.split("=", 1)
        if left.strip() != "model_provider":
            continue
        return right.strip().strip('"').strip("'")
    return None


def grok_profile_identity(path: Path) -> str:
    """Bind a grok seat to its live principal, config bytes, and account path."""
    auth_path = grok_live_auth_path()
    if auth_path.is_symlink() or any((path / name).is_symlink() for name in ("auth.json", "config.toml")):
        raise ValueError("symlinked account identity")
    entry = select_xai_oidc_entry(load_grok_auth_document(auth_path))
    principal = grok_stable_principal(entry)
    parts = [
        "grok-live-principal/v1",
        str(path.resolve()),
        str(auth_path.resolve()),
        principal,
        digest(path / "config.toml"),
    ]
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()


def profile_identity(path: Path) -> str:
    # Config replacement and a different principal invalidate prior enrollment.
    # Grok seats ignore rotating bearer material; kimi and other codex accounts
    # still hash the full auth.json bytes.
    if path.is_symlink() or not path.is_dir():
        raise ValueError("invalid account path")
    if any((path / name).is_symlink() for name in ("auth.json", "config.toml")):
        raise ValueError("symlinked account identity")
    if _toml_model_provider(path / "config.toml") == "grok":
        return grok_profile_identity(path)
    parts = [str(path.resolve()), digest(path / "auth.json"), digest(path / "config.toml")]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


def executor_identity(provider: str, model: str, path: Path) -> str:
    """Bind a CLI-backed seat to the exact executable, without claiming app-server compatibility."""
    if (not contract.V2_PROVIDER_ID.fullmatch(provider)
        or not contract.V2_MODEL_ID.fullmatch(model)
        or path.is_symlink() or not path.is_file() or not os.access(path, os.X_OK)):
        raise ValueError("invalid provider executor")
    parts = [provider, model, str(path.resolve()), digest(path)]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


def provider_pool_identity(provider: str, model: str, executor: Path, auth_state: Path) -> str:
    """Bind a CLI completion to the exact local auth pool without claiming a chair."""
    info = auth_state.stat() if not auth_state.is_symlink() and auth_state.is_file() else None
    if (auth_state.is_symlink() or not auth_state.is_file()
        or info is None or info.st_uid != os.getuid() or info.st_mode & 0o022):
        raise ValueError("invalid provider auth pool")
    parts = [executor_identity(provider, model, executor), str(auth_state.resolve()), digest(auth_state)]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


def executor_state(row: dict) -> str:
    path = Path(row["executorPath"])
    auth_state = Path(row["authStatePath"])
    value = [row["provider"], row["profile"], row["model"], str(path.resolve()), digest(path),
             str(auth_state.resolve()), digest(auth_state), row["authPoolIdentity"]]
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


PROC_ROOT = Path("/proc")


def service_identity() -> tuple[int, str]:
    result = subprocess.run(["/usr/bin/systemctl", "--user", "show", contract.V2_OFFICIAL_RUNTIME_SERVICE,
        "--property=MainPID,ControlGroup,ActiveState"], capture_output=True, text=True, check=True, timeout=5)
    fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if fields.get("ActiveState") != "active" or int(fields.get("MainPID", 0)) <= 0:
        raise ValueError("official runtime inactive")
    return int(fields["MainPID"]), fields["ControlGroup"]


def process_identity(pid: int, group: str) -> tuple[int, str]:
    process = PROC_ROOT / str(pid)
    groups = [line.split(":", 2)[2] for line in (process / "cgroup").read_text().splitlines()]
    if group not in groups:
        raise ValueError("official runtime cgroup mismatch")
    fields = (process / "stat").read_text().rsplit(")", 1)[1].split()
    return int(fields[1]), fields[19]


def listener_owned(process: Path) -> bool:
    sockets = {entry.readlink().name for entry in (process / "fd").iterdir() if entry.is_symlink()}
    for name in ("tcp", "tcp6"):
        for line in (process / "net" / name).read_text().splitlines()[1:]:
            fields = line.split()
            if fields[1].rsplit(":", 1)[1] == "0FC9" and fields[3] == "0A" and "socket:[" + fields[9] + "]" in sockets:
                return True
    return False


def live_runtime(value: dict) -> str:
    """Bind user-unit MainPID to the actual listener descendant, not PID equality."""
    pid, group = service_identity()
    if not group or not group.endswith("/symphony-elixir.service"):
        raise ValueError("official runtime cgroup mismatch")
    main_identity = process_identity(pid, group)
    binary, workflow = str(Path(value["binaryPath"]).resolve()), str(Path(value["workflowPath"]).resolve())
    candidates = []
    for process in PROC_ROOT.iterdir():
        if not process.name.isdigit():
            continue
        try:
            listener = int(process.name)
            identity = process_identity(listener, group)
            if not listener_owned(process):
                continue
            args = (process / "cmdline").read_bytes().decode().split("\0")
            if (binary not in args and str((process / "exe").resolve()) != binary) or workflow not in args:
                continue
            chain = {listener: identity}
            cursor = listener
            while cursor != pid:
                cursor = chain[cursor][0]
                if cursor <= 0 or cursor in chain or len(chain) >= 64:
                    raise ValueError("listener is not an official service descendant")
                chain[cursor] = process_identity(cursor, group)
            if chain[pid] != main_identity or any(process_identity(member, group) != observed for member, observed in chain.items()):
                raise ValueError("official runtime generation changed")
            candidates.append(chain)
        except (OSError, ValueError, IndexError):
            continue
    if len(candidates) != 1 or process_identity(pid, group) != main_identity or service_identity() != (pid, group):
        raise ValueError("official runtime listener or generation mismatch")
    return hashlib.sha256(json.dumps(candidates[0], sort_keys=True).encode()).hexdigest()


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


def validate_account_row(row: dict, now: datetime) -> dict:
    """Revalidate one enrolled identity independently of runtime freshness."""
    if not isinstance(row, dict):
        raise ValueError("malformed enrollment")
    provider, profile, model = (row.get(k) for k in ("provider", "profile", "model"))
    identity_type = row.get("identityType", "codex-account")
    if (not isinstance(provider, str) or not contract.V2_PROVIDER_ID.fullmatch(provider)
        or not isinstance(model, str) or not contract.V2_MODEL_ID.fullmatch(model)
        or row.get("agentProfile") != "coder"):
        raise ValueError("enrollment identity mismatch")
    if identity_type == "codex-account":
        account_path = Path(row["accountPath"])
        if profile != profile_identity(account_path):
            raise ValueError("enrollment identity mismatch")
        account_binding = account_state(row, now)
    elif identity_type == "provider-executor":
        executor = Path(row["executorPath"])
        auth_state = Path(row["authStatePath"])
        if (profile != provider_pool_identity(provider, model, executor, auth_state)
            or row.get("executorSha256") != digest(executor)
            or row.get("authStateSha256") != digest(auth_state)
            or row.get("authPoolIdentity") != profile):
            raise ValueError("enrollment identity mismatch")
        account_binding = executor_state(row)
    else:
        raise ValueError("enrollment identity mismatch")
    return {**row, "accountStateSha256": account_binding}


def load_context(now: datetime, path: Path | None = None) -> dict:
    path = path or Path(os.environ.get("SYMPHONY_PROOF_CONTEXT", "/home/timwhite/gem-workspace/state/proof-context.json"))
    value = private_json(path)
    if not isinstance(value, dict):
        raise ValueError("context must be an object")
    runtime = contract.v2_validate_runtime_identity(value.get("runtime"))
    if runtime is None or runtime["contractSha256"] != digest(Path(contract.__file__)):
        raise ValueError("imported contract mismatch")
    revision = subprocess.run(["/usr/bin/git", "-C", value["sourceRoot"], "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True, timeout=5).stdout.strip()
    if (revision != runtime["sourceRevision"]
        or digest(Path(value["binaryPath"])) != runtime["binarySha256"]
        or digest(Path(value["workflowPath"])) != runtime["workflowSha256"]):
        raise ValueError("runtime build mismatch")
    generation = live_runtime(value)
    runner = None
    if "codexPath" in value or "codexSha256" in value:
        runner = Path(value["codexPath"])
        if runner.is_symlink() or not runner.is_file() or not os.access(runner, os.X_OK) or digest(runner) != value["codexSha256"]:
            raise ValueError("untrusted completion executable")
    observed = contract.v2_parse_time(value.get("observedAt"))
    if observed is None or not 0 <= (now - observed).total_seconds() <= 600:
        raise ValueError("stale enrollment")
    accounts = value.get("accounts")
    if not isinstance(accounts, list):
        raise ValueError("missing enrollment")
    seats = set()
    enrolled = []
    for row in accounts:
        normalized = validate_account_row(row, now)
        provider, profile = (normalized[k] for k in ("provider", "profile"))
        seat = (provider, profile)
        if seat in seats:
            raise ValueError("duplicate enrollment")
        seats.add(seat)
        enrolled.append(normalized)
    artifacts = Path(value["attestationDir"])
    info = artifacts.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("untrusted attestation directory")
    attestations = {}
    for artifact in artifacts.glob("*.json"):
        if not contract.V2_SHA256.fullmatch(artifact.stem):
            continue
        try:
            proof = private_json(artifact)
            seat = next((row for row in enrolled if row["profile"] == proof.get("profile") and row["provider"] == proof.get("provider")), None)
            executable_matches = (
                proof.get("codexSha256") == value.get("codexSha256")
                if proof.get("producer") == contract.V2_PROOF_SOURCE
                else proof.get("executorSha256") == seat.get("executorSha256") if seat is not None else False
            )
            if (seat is not None and proof.get("accountStateSha256") == seat["accountStateSha256"]
                and proof.get("runtimeGeneration") == generation and executable_matches):
                attestations[artifact.stem] = proof
        except (OSError, ValueError, AttributeError):
            continue
    return {"runtimeGeneration": generation, "codexPath": runner.resolve() if runner else None, "codexSha256": value.get("codexSha256"), "runtime": runtime, "accounts": enrolled, "attestations": attestations,
            "attestationDir": artifacts, "contextPath": path}


def validation_args(context: dict) -> dict:
    return {"expected_runtime": context["runtime"],
            "expected_contract_sha": context["runtime"]["contractSha256"],
            "attestations": context["attestations"],
            "enrolled_seats": {(r["provider"], r["profile"], r["model"]) for r in context["accounts"]}}


def validate_local_receipt(value: object, now: datetime, max_age=contract.V2_CAPACITY_MAX_AGE):
    try:
        context = load_context(now)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return False, "capacity-evidence-trust-context-invalid", []
    return contract.v2_validate_capacity_receipt(value, now, max_age, **validation_args(context))


def main() -> int:
    """Canonical stdin boundary for the JavaScript admission consumer."""
    import sys
    try:
        raw = sys.stdin.read(1_048_577)
        if len(raw) > 1_048_576:
            raise ValueError("capacity request too large")
        request = json.loads(raw)
        now = contract.v2_parse_time(request.get("now"))
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
