#!/usr/bin/env python3
"""Host-authorized, one-use existing-PR repair; never a tracker or provider receipt.

The trusted operator owns the private directory. Same-UID code is inside this
OS trust boundary; JSON owner/generation fields are audit bindings, not signatures.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone

SCHEMA = "symphony-existing-pr-repair/v1"
ISOLATED_SCHEMA = "symphony-existing-pr-repair/v2"
ROOT = Path.home() / ".config/symphony/repair-assignments"
LEASE_ROOT = Path.home() / ".local/state/symphony-fallback/leases"
GUARD = Path.home() / ".local/bin/symphony-lease-guard"
MAX_SECONDS = 5400
REPOS = {"JOV": "JovieInc/Jovie", "LYB": "JovieInc/LogYourBody"}
UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
PROVIDER_GRANT_SCHEMA = "symphony-provider-grant/v1"
QUALIFICATION_SCHEMA = "symphony-provider-qualification/v1"
GROK_PROVIDER = "grok"
GROK_MODEL = "grok-4.6"
PROVIDER_GRANT_ID = r"[A-Za-z0-9][A-Za-z0-9._:-]{7,127}"
ADMISSION_FLEET_PATH = Path.home() / "gem-workspace/state/gem-priority-gate/latest.json"
ADMISSION_CONCURRENCY_PATH = Path.home() / "gem-workspace/state/symphony-concurrency.json"
ADMISSION_ATTESTATION_PATH = Path.home() / "gem-workspace/state/gem-service-attestation.json"
ADMISSION_RUNTIME_URL = "http://127.0.0.1:4041/api/v1/state"
ADMISSION_FLEET_SCHEMA = "jovie-fleet-gate/v1"
ADMISSION_CONCURRENCY_SCHEMA = "symphony-concurrency/v1"
ADMISSION_ATTESTATION_SCHEMA = "gem-service-attestation/v1"
ADMISSION_MAX_AGE_SECONDS = 10 * 60
ADMISSION_MAX_CLOCK_SKEW_SECONDS = 60
MAX_PROVIDER_OUTPUT_BYTES = 128 * 1024
MAX_QUALIFICATION_AGE_SECONDS = 10 * 60
EXECUTION_EVIDENCE_SCHEMA = "symphony-existing-repair-evidence/v1"
# This is an authorization-policy binding, not a provider model identifier.
# The owner must explicitly attest the Fable 5.1 last-resort exception while
# leaving the router-selected model opaque to this repair contract.
ANTHROPIC_LAST_RESORT_POLICY_EXCEPTION = "anthropic-fable5.1-last-resort"


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def private_directory():
    info = ROOT.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o700
            and ROOT.resolve() == ROOT, "assignment-directory-untrusted")


def assignment_path(identifier):
    require(isinstance(identifier, str) and re.fullmatch(r"(?:JOV|LYB)-[1-9][0-9]*", identifier),
            "assignment-identifier-invalid")
    return ROOT / f"{identifier}.json"


def read_private(path):
    private_directory()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "r") as handle:
        info = os.fstat(handle.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
                and info.st_size <= 16384, "assignment-file-untrusted")
        return json.load(handle)


def source_hashes(controller):
    return {"controller": hashlib.sha256(Path(controller).read_bytes()).hexdigest(),
            "validator": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "guard": hashlib.sha256(GUARD.read_bytes()).hexdigest()}


def validate(payload, identifier, controller):
    require(isinstance(payload, dict) and payload.get("schema") == SCHEMA, "assignment-schema-invalid")
    require(payload.get("identifier") == identifier, "assignment-issue-mismatch")
    require(payload.get("repository") == REPOS[identifier.split("-")[0]], "assignment-repository-mismatch")
    require(isinstance(payload.get("issueId"), str) and re.fullmatch(UUID, payload["issueId"]), "assignment-uuid-invalid")
    require(type(payload.get("pr")) is int and payload["pr"] > 0, "assignment-pr-invalid")
    for key, pattern in (("head", r"[0-9a-f]{40}"), ("generation", r"[0-9a-f]{40}"),
                         ("authorizedBy", UUID), ("writerUnit", r"[a-zA-Z0-9_.@-]+\.service")):
        require(isinstance(payload.get(key), str) and re.fullmatch(pattern, payload[key]), f"assignment-{key}-invalid")
    issued, expires = payload.get("issuedAt"), payload.get("expiresAt")
    require(all(type(value) in (int, float) and math.isfinite(value) for value in (issued, expires)),
            "assignment-time-invalid")
    require(0 < expires - issued <= MAX_SECONDS and issued <= time.time() < expires, "assignment-expired-or-future")
    require(isinstance(payload.get("workspace"), str) and Path(payload["workspace"]).is_absolute()
            and str(Path(payload["workspace"]).resolve()) == payload["workspace"], "assignment-workspace-invalid")
    require(payload.get("newIssueIntakeAllowed") is False, "assignment-new-intake-forbidden")
    require(payload.get("sourceHashes") == source_hashes(controller), "assignment-source-mismatch")
    require(isinstance(payload.get("leaseIdentity"), dict)
            and all(type(payload["leaseIdentity"].get(key)) is int for key in ("device", "inode")),
            "assignment-lease-identity-invalid")
    return payload


def load(identifier, controller):
    return validate(read_private(assignment_path(identifier)), identifier, controller)


def load_isolated(identifier, controller):
    return validate_isolated(read_private(assignment_path(identifier)), identifier, controller)


def validate_isolated(payload, identifier, controller):
    require(payload.get("schema") == ISOLATED_SCHEMA
            and payload.get("executionMode") == "isolated-cli", "isolated-repair-grant-required")
    validate({**payload, "schema": SCHEMA}, identifier, controller)
    require(isinstance(payload.get("ownerId"), str) and re.fullmatch(UUID, payload["ownerId"]),
            "isolated-repair-owner-invalid")
    require(isinstance(payload.get("issueRevision"), str), "isolated-repair-revision-invalid")
    datetime.fromisoformat(payload["issueRevision"].replace("Z", "+00:00"))
    return payload


def assignment_digest(payload):
    # Host grants contain ASCII keys; canonical JSON is shared with the signed consumer.
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def _iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _digest(value):
    return assignment_digest(value)


def _receipt_path(identifier, suffix):
    return ROOT / f"{identifier}.{suffix}.json"


def _replace_private(path, payload):
    """Atomically replace one host-owned receipt and fsync its directory."""
    private_directory()
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as handle:
            json.dump(payload, handle, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(ROOT, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _trusted_file(path_value, expected_digest, label, *, executable=False):
    require(isinstance(path_value, str) and Path(path_value).is_absolute(),
            f"{label}-path-invalid")
    path = Path(path_value)
    require(path.resolve() == path and not path.is_symlink(),
            f"{label}-path-untrusted")
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and not (stat.S_IMODE(info.st_mode) & 0o022),
            f"{label}-file-untrusted")
    if executable:
        require(os.access(path, os.X_OK), f"{label}-not-executable")
    require(isinstance(expected_digest, str) and re.fullmatch(r"[a-f0-9]{64}", expected_digest)
            and hashlib.sha256(path.read_bytes()).hexdigest() == expected_digest,
            f"{label}-digest-mismatch")
    return path


def _grant_time(value, label):
    require(type(value) in (int, float) and math.isfinite(value),
            f"provider-grant-{label}-invalid")
    return float(value)


def validate_provider_grant(payload, now=None):
    """Validate the operator-owned provider grant without claiming or executing.

    The grant is deliberately nested in the private assignment. Its digest is
    therefore already covered by the v3 assignmentDigest carried on the wire,
    while these checks bind the selected provider to the exact host, account,
    workspace, issue, PR, and source files that will execute.
    """
    grant = payload.get("providerGrant") if isinstance(payload, dict) else None
    require(isinstance(grant, dict) and grant.get("schema") == PROVIDER_GRANT_SCHEMA,
            "provider-grant-missing")
    required = {
        "schema", "grantId", "provider", "model", "routerId", "routerPath",
        "routerDigest", "accountUserId", "authPoolIdentity", "authStatePath",
        "authStateSha256", "executablePath", "executableSha256", "qualification",
        "identifier", "issueId", "repository", "pr", "head", "workspace",
        "issuedAt", "expiresAt", "funding", "taskAppropriate", "costAppropriate",
        "delegationPolicyBound",
    }
    require(set(grant) == required, "provider-grant-fields-invalid")
    require(isinstance(grant.get("grantId"), str)
            and re.fullmatch(PROVIDER_GRANT_ID, grant["grantId"]),
            "provider-grant-id-invalid")
    require(grant.get("provider") == GROK_PROVIDER and grant.get("model") == GROK_MODEL,
            "provider-grant-route-invalid")
    require(isinstance(grant.get("routerId"), str)
            and 1 <= len(grant["routerId"]) <= 128,
            "provider-grant-router-invalid")
    require(isinstance(grant.get("accountUserId"), str)
            and re.fullmatch(UUID, grant["accountUserId"]),
            "provider-grant-account-invalid")
    for key in ("authPoolIdentity", "routerDigest", "authStateSha256", "executableSha256"):
        require(isinstance(grant.get(key), str)
                and re.fullmatch(r"[a-f0-9]{64}", grant[key]),
                f"provider-grant-{key}-invalid")
    for key, expected in (("identifier", payload.get("identifier")),
                          ("issueId", payload.get("issueId")),
                          ("repository", payload.get("repository")),
                          ("pr", payload.get("pr")),
                          ("head", payload.get("head")),
                          ("workspace", payload.get("workspace"))):
        require(grant.get(key) == expected, f"provider-grant-{key}-mismatch")
    require(grant.get("funding") == "included-local"
            and grant.get("taskAppropriate") is True
            and grant.get("costAppropriate") is True
            and grant.get("delegationPolicyBound") is True,
            "provider-grant-policy-invalid")
    issued = _grant_time(grant.get("issuedAt"), "issued-at")
    expires = _grant_time(grant.get("expiresAt"), "expires-at")
    current = time.time() if now is None else float(now)
    assignment_issued = _grant_time(payload.get("issuedAt"), "assignment-issued-at")
    assignment_expires = _grant_time(payload.get("expiresAt"), "assignment-expires-at")
    require(0 < assignment_expires - assignment_issued <= MAX_SECONDS
            and assignment_issued <= current < assignment_expires,
            "provider-grant-assignment-window-invalid")
    require(0 < expires - issued <= MAX_SECONDS and issued <= current < expires,
            "provider-grant-expired-or-future")
    require(issued >= assignment_issued and expires <= assignment_expires,
            "provider-grant-assignment-window-invalid")
    qualification = grant.get("qualification")
    qualification_required = {
        "schema", "marker", "provider", "model", "cliVersion", "observedAt",
        "outputDigest", "accountUserId", "authPoolIdentity", "includedRemainingPercent",
    }
    require(isinstance(qualification, dict)
            and set(qualification) == qualification_required
            and qualification.get("schema") == QUALIFICATION_SCHEMA
            and qualification.get("marker") == "GEM_GROK_QUALIFIED"
            and qualification.get("provider") == GROK_PROVIDER
            and qualification.get("model") == GROK_MODEL
            and isinstance(qualification.get("cliVersion"), str)
            and 1 <= len(qualification["cliVersion"]) <= 32
            and isinstance(qualification.get("outputDigest"), str)
            and re.fullmatch(r"[a-f0-9]{64}", qualification["outputDigest"])
            and qualification.get("accountUserId") == grant["accountUserId"]
            and qualification.get("authPoolIdentity") == grant["authPoolIdentity"]
            and type(qualification.get("includedRemainingPercent")) is int
            and 0 < qualification["includedRemainingPercent"] <= 100,
            "provider-grant-qualification-invalid")
    try:
        qualified_datetime = datetime.fromisoformat(
            qualification["observedAt"].replace("Z", "+00:00")
        )
        require(qualified_datetime.tzinfo is not None
                and qualified_datetime.utcoffset() is not None,
                "provider-grant-qualification-time-invalid")
        qualified_at = qualified_datetime.timestamp()
    except (AttributeError, TypeError, ValueError):
        raise ValueError("provider-grant-qualification-time-invalid")
    require(current - qualified_at <= MAX_QUALIFICATION_AGE_SECONDS
            and qualified_at - current <= 60,
            "provider-grant-qualification-stale")
    _trusted_file(grant["routerPath"], grant["routerDigest"], "provider-grant-router")
    _trusted_file(grant["authStatePath"], grant["authStateSha256"], "provider-grant-auth")
    executable = _trusted_file(
        grant["executablePath"], grant["executableSha256"],
        "provider-grant-executable", executable=True
    )
    return grant, executable


class ExecutionAdmissionHeld(ValueError):
    """Current Summer admission is held or cannot be independently observed."""


def _admission_object(value):
    return value if isinstance(value, dict) else {}


def _admission_semantic_identity(value):
    """Match Summer's source digest rule while excluding volatile timestamps."""
    if isinstance(value, list):
        return [_admission_semantic_identity(child) for child in value]
    if isinstance(value, dict):
        return {key: _admission_semantic_identity(child)
                for key, child in value.items() if key != "observedAt"}
    return value


def _admission_digest(value):
    return hashlib.sha256(json.dumps(
        _admission_semantic_identity(value), sort_keys=True, separators=(",", ":")
    ).encode()).hexdigest()


def _read_admission_json(path):
    """Read one bounded host projection; callers convert failures to UNKNOWN."""
    path = Path(path)
    with path.open("r", encoding="utf-8") as handle:
        raw = handle.read(256 * 1024 + 1)
    require(len(raw.encode("utf-8")) <= 256 * 1024, "admission-evidence-too-large")
    value = json.loads(raw)
    require(isinstance(value, dict), "admission-evidence-object-required")
    return value


def _admission_recent(value, now_epoch):
    if not isinstance(value, str):
        return False
    try:
        observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if observed.tzinfo is None or observed.utcoffset() is None:
            return False
        age = now_epoch - observed.timestamp()
        return -ADMISSION_MAX_CLOCK_SKEW_SECONDS <= age <= ADMISSION_MAX_AGE_SECONDS
    except (AttributeError, TypeError, ValueError, OverflowError):
        return False


def _admission_conjunction(*values):
    if any(value is False for value in values):
        return False
    return True if all(value is True for value in values) else None


def _admission_state(value):
    if value is True:
        return "ALLOWED"
    if value is False:
        return "HELD"
    return "UNKNOWN"


def _admission_row(value, source, revision, valid, schema, reason):
    state = _admission_state(value) if valid else "UNKNOWN"
    return {
        "state": state,
        "sourceSchema": schema,
        "observedAt": source.get("observedAt") if valid else None,
        "sourceRevision": revision if valid else None,
        "sourceDigest": _admission_digest(source) if valid else None,
        "reason": reason if state != "UNKNOWN" else "source-evidence-unavailable",
    }


def read_current_execution_admission(now=None):
    """Read the existing Summer admission projection without side effects.

    This function intentionally consumes only the three host receipts already
    used by Summer. It does not mint a grant, claim an assignment, inspect
    capacity, or infer permission from a missing/partial receipt.
    """
    try:
        current = time.time() if now is None else float(now)
        require(math.isfinite(current), "admission-clock-invalid")
    except (TypeError, ValueError):
        current = float("nan")

    try:
        fleet = _read_admission_json(ADMISSION_FLEET_PATH)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        fleet = {}
    try:
        concurrency = _read_admission_json(ADMISSION_CONCURRENCY_PATH)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        concurrency = {}
    try:
        attestation = _read_admission_json(ADMISSION_ATTESTATION_PATH)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        attestation = {}

    signals = _admission_object(fleet.get("signals"))
    queue = _admission_object(signals.get("queue"))
    main = _admission_object(signals.get("main"))
    work = _admission_object(fleet.get("workAdmission"))
    closure = _admission_object(fleet.get("closureAdmission"))
    remediation = _admission_object(fleet.get("remediationAdmission"))
    main_revision = main.get("sha") if isinstance(main.get("sha"), str) else None
    fleet_valid = (
        fleet.get("schema") == ADMISSION_FLEET_SCHEMA
        and _admission_recent(fleet.get("observedAt"), current)
        and queue.get("repository") == REPOS["JOV"]
        and queue.get("status") == "known"
        and queue.get("source") == "live"
        and re.fullmatch(r"[0-9a-f]{40}", main_revision or "") is not None
    )
    new_work = _admission_conjunction(
        work.get("allowed"), work.get("newImplementationAllowed"),
        work.get("newIssueLeaseAllowed"), closure.get("newImplementationAllowed"),
        closure.get("newIssueIntakeAllowed"),
    )
    owned_remediation = _admission_conjunction(
        remediation.get("allowed"), remediation.get("localAllowed"),
        closure.get("remediationContinues"),
        True if remediation.get("authority") == "single-pr-writer-exact-head" else None,
    )
    # Gem's canonical fleet receipt binds the snapshot to signals.main.sha;
    # there is no top-level fleet sourceRevision field. Keep malformed or
    # missing main authority UNKNOWN instead of accepting a legacy shape.
    fleet_revision = main_revision if fleet_valid else None

    runtime = _admission_object(attestation.get("runtime"))
    listener = _admission_object(attestation.get("listener"))
    runtime_revision = attestation.get("sourceRevision")
    attestation_valid = (
        attestation.get("schema") == ADMISSION_ATTESTATION_SCHEMA
        and _admission_recent(attestation.get("observedAt"), current)
        and isinstance(runtime_revision, str)
        and re.fullmatch(r"[0-9a-f]{40}", runtime_revision) is not None
        and attestation.get("active") is True
        and attestation.get("healthy") is True
        and listener.get("port") == 4041
        and listener.get("boundToService") is True
        and isinstance(runtime.get("workflowPath"), str)
        and bool(runtime["workflowPath"])
    )
    report = _admission_object(concurrency)
    provenance = _admission_object(report.get("provenance"))
    scope = _admission_object(report.get("resourceScope"))
    report_valid = (
        report.get("schema") == ADMISSION_CONCURRENCY_SCHEMA
        and _admission_recent(report.get("observedAt"), current)
        and _admission_recent(provenance.get("observedAt"), current)
        and attestation_valid
        and report.get("sourceRevision") == runtime_revision
        and provenance.get("sourceRevision") == runtime_revision
        and scope.get("repository") == REPOS["JOV"]
        and scope.get("runtimeUrl") == ADMISSION_RUNTIME_URL
        and scope.get("workflow") == runtime["workflowPath"]
    )
    provider = _admission_object(report.get("provider"))
    downstream = _admission_object(report.get("downstream"))
    admissions = {
        "newImplementation": _admission_row(
            new_work, fleet, fleet_revision, fleet_valid,
            ADMISSION_FLEET_SCHEMA, "new-implementation-gate",
        ),
        "ownedRemediation": _admission_row(
            owned_remediation, fleet, fleet_revision, fleet_valid,
            ADMISSION_FLEET_SCHEMA, "single-pr-writer-exact-head-required",
        ),
        "push": _admission_row(
            remediation.get("pushAllowed"), fleet, fleet_revision, fleet_valid,
            ADMISSION_FLEET_SCHEMA, "independent-push-gate",
        ),
        "providerEligibility": _admission_row(
            provider.get("eligible"), report, runtime_revision,
            report_valid and provider.get("source") == "active-issue-authenticated-routes",
            ADMISSION_CONCURRENCY_SCHEMA, "authenticated-provider-route-gate",
        ),
        "downstreamHealth": _admission_row(
            downstream.get("healthy"), report, runtime_revision,
            report_valid and downstream.get("repository") == REPOS["JOV"],
            ADMISSION_CONCURRENCY_SCHEMA, "downstream-health-observation",
        ),
    }
    required = ("ownedRemediation", "push", "providerEligibility", "downstreamHealth")
    failed = next((name for name in required if admissions[name]["state"] != "ALLOWED"), None)
    if failed is None:
        allowed, reason = True, "execution-admission-allowed"
    else:
        allowed = False
        reason_name = {
            "ownedRemediation": "owned-remediation",
            "providerEligibility": "provider-eligibility",
            "downstreamHealth": "downstream-health",
        }.get(failed, failed)
        reason = f"execution-admission-{reason_name}-{admissions[failed]['state'].lower()}"
    return {
        "schema": "jovie.eve.summer-admissions-projection/v1",
        "repository": REPOS["JOV"],
        "authorityScope": "observed-class-admission-task-acceptance-required",
        "allowed": allowed,
        "reason": reason,
        **admissions,
    }


def _require_execution_admission(reader=None):
    observation = (read_current_execution_admission() if reader is None else reader())
    if not isinstance(observation, dict) or observation.get("allowed") is not True:
        reason = observation.get("reason") if isinstance(observation, dict) else None
        raise ExecutionAdmissionHeld(reason or "execution-admission-authority-unavailable")
    required = ("ownedRemediation", "push", "providerEligibility", "downstreamHealth")
    if any(_admission_object(observation.get(name)).get("state") != "ALLOWED" for name in required):
        raise ExecutionAdmissionHeld("execution-admission-authority-unavailable")
    return observation

def load_validated_candidate(identifier, controller):
    """Read one complete, provider-qualified assignment without side effects."""
    payload = load_isolated(identifier, controller)
    validate_provider_grant(payload)
    require(not _assignment_consumed(identifier), "assignment-consumed")
    return payload


def _assignment_consumed(identifier):
    """Return whether the host ledger has already consumed this assignment."""
    assignment_path(identifier)
    return any(os.path.lexists(ROOT / path) for path in (
        f"{identifier}.claim",
        f"{identifier}.execution.json",
    ))


def _lease_digest(payload):
    return _digest({"identifier": payload["identifier"], "leaseIdentity": payload["leaseIdentity"]})


def _execution_evidence_digest(execution):
    unsigned = {key: value for key, value in execution.items() if key != "evidenceDigest"}
    return _digest({"schema": EXECUTION_EVIDENCE_SCHEMA, **unsigned})


def _repair_prompt(task, payload):
    target = task["existingRepair"]
    return "\n".join((
        "You are the bounded worker for one already-owned existing PR repair.",
        f"Issue: {target['identifier']} ({target['issueId']})",
        f"Repository: {target['repository']}, PR: {target['pr']}",
        f"Workspace: {target['workspace']}",
        f"Starting head: {target['head']}",
        f"Task fingerprint: {task['taskKey']}",
        f"Selected bottleneck: {task['selected']['id']}",
        f"Source revision: {task['source']['sourceVersion']}",
        "Work only in this exact checkout and existing PR branch.",
        "Make the smallest correct repair, run the relevant tests, commit, and push the existing branch.",
        "Do not create an issue or PR, change issue ownership, merge, deploy, alter queue policy, or use another workspace.",
        "Do not weaken tests or gates. If the repair cannot be completed, exit nonzero after preserving the exact reason.",
    ))


class GrokOwnedRepairExecutor:
    """The installed, grant-bound Grok CLI worker for existing PR repairs."""

    def __init__(self, run=subprocess.run):
        self.run = run

    def qualify(self, task, payload):
        grant, executable = validate_provider_grant(payload)
        require(task.get("existingRepair", {}).get("assignmentDigest")
                == assignment_digest(payload), "provider-grant-assignment-mismatch")
        return {
            "qualified": True,
            "provider": grant["provider"],
            "model": grant["model"],
            "funding": grant["funding"],
            "taskAppropriate": grant["taskAppropriate"],
            "costAppropriate": grant["costAppropriate"],
            "delegationPolicyBound": grant["delegationPolicyBound"],
            "expiresAt": grant["expiresAt"],
            "authPoolIdentity": grant["authPoolIdentity"],
            "grantDigest": assignment_digest(grant),
            "routerId": grant["routerId"],
            "routerDigest": grant["routerDigest"],
            "accountUserId": grant["accountUserId"],
            "executablePath": str(executable),
        }

    def execute(self, task, payload, eligibility, *, lease_fd=9):
        require(lease_fd == 9 and os.environ.get("SYMPHONY_ISSUE_LEASE_FD") == "9",
                "provider-grant-lease-missing")
        grant, executable = validate_provider_grant(payload)
        require(eligibility.get("provider") == grant["provider"]
                and eligibility.get("model") == grant["model"]
                and eligibility.get("authPoolIdentity") == grant["authPoolIdentity"],
                "provider-grant-qualification-drift")
        workspace = Path(payload["workspace"])
        base_head = _git_head(workspace)
        environment = os.environ.copy()
        for secret in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "LINEAR_API_KEY", "GITHUB_TOKEN", "GH_TOKEN"):
            environment.pop(secret, None)
        command = [
            str(executable), "-m", grant["model"], "--always-approve",
            "--cwd", str(workspace), "--disable-web-search", "--no-subagents",
            "-p", _repair_prompt(task, payload),
        ]
        run_id = eligibility.get("runId")
        require(isinstance(run_id, str) and re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", run_id),
                "provider-run-id-missing")
        output_digest = None
        exit_code = None
        detail = "grok-execution-failed"
        status = "failed"
        try:
            completed = self.run(
                command, cwd=str(workspace), env=environment, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                timeout=MAX_SECONDS, check=False, pass_fds=(9,),
            )
            stdout = completed.stdout or ""
            stderr = completed.stderr or ""
            output_digest = _digest({"stdout": stdout[-MAX_PROVIDER_OUTPUT_BYTES:],
                                     "stderr": stderr[-MAX_PROVIDER_OUTPUT_BYTES:]})
            exit_code = completed.returncode
            if len(stdout.encode()) > MAX_PROVIDER_OUTPUT_BYTES or len(stderr.encode()) > MAX_PROVIDER_OUTPUT_BYTES:
                detail = "grok-execution-output-too-large"
            elif exit_code == 0:
                detail = "grok-execution-succeeded"
                status = "succeeded"
            else:
                detail = f"grok-execution-exit-{exit_code}"
        except subprocess.TimeoutExpired:
            output_digest = _digest({"timeout": True, "runId": run_id})
            detail = "grok-execution-timeout"
        except (OSError, subprocess.SubprocessError):
            output_digest = _digest({"launch": "failed", "runId": run_id})
            detail = "grok-execution-launch-failed"
        try:
            final_head = _git_head(workspace)
        except (OSError, subprocess.SubprocessError, ValueError):
            final_head = base_head
            detail = "grok-final-head-unavailable"
            status = "failed"
        if status == "succeeded" and final_head == base_head:
            detail = "grok-execution-no-source-change"
            status = "failed"
        return {
            "status": status,
            "detail": detail,
            "completedAt": _iso_now(),
            "_executionObservation": {
                "baseHead": base_head,
                "finalHead": final_head,
                "outputDigest": output_digest or _digest({"runId": run_id}),
                "exitCode": exit_code,
                "headChanged": final_head != base_head,
            },
        }


def _git_head(workspace):
    result = subprocess.run(
        ["git", "-C", str(workspace), "rev-parse", "HEAD"],
        check=True, capture_output=True, text=True, timeout=10,
    )
    head = result.stdout.strip()
    require(re.fullmatch(r"[0-9a-f]{40}", head), "provider-workspace-head-invalid")
    return head


def execute_isolated(task, controller, fetch_issue, fetch_prs, *, executor=None):
    """Run one signed, assigned repair under the shared issue lease.

    The live path requires the host-owned provider grant and uses the installed
    Grok adapter. Test callers may inject a qualification/execution double; that
    path never becomes an admission source for production.
    """
    require(isinstance(task, dict) and task.get("schema") == "jovie-symphony-repair-task/v3"
            and task.get("action") == "execute-existing-owned-repair"
            and task.get("authority") == "host-assigned-isolated-repair-only"
            and task.get("taskKey") == task.get("decisionFingerprint")
            and isinstance(task.get("taskKey"), str) and re.fullmatch(r"[a-f0-9]{64}", task["taskKey"]),
            "isolated-repair-task-invalid")
    target = task["existingRepair"]
    identifier = target["identifier"]
    payload = load_isolated(identifier, controller)
    require(target.get("mode") == "isolated-cli" and target.get("assignmentDigest") == assignment_digest(payload),
            "isolated-repair-grant-mismatch")
    for key in ("identifier", "issueId", "ownerId", "issueRevision", "repository", "pr", "head", "workspace", "writerUnit"):
        require(target.get(key) == payload.get(key), f"isolated-repair-{key}-mismatch")
    require(datetime.fromisoformat(target["expiresAt"].replace("Z", "+00:00")).timestamp() == payload["expiresAt"],
            "isolated-repair-expiry-mismatch")
    result_path = ROOT / f"{identifier}.execution.json"
    if os.path.lexists(result_path):
        receipt = read_private(result_path)
        require(receipt.get("taskKey") == task["taskKey"] and
                receipt.get("assignmentDigest") == target["assignmentDigest"], "isolated-repair-result-cross-bound")
        return receipt["result"]
    if os.path.lexists(ROOT / f"{identifier}.claim"):
        acceptance_path = _receipt_path(identifier, "acceptance")
        run_path = _receipt_path(identifier, "run")
        recovery_path = _receipt_path(identifier, "recovery")
        acceptance = read_private(acceptance_path) if os.path.lexists(acceptance_path) else None
        run = read_private(run_path) if os.path.lexists(run_path) else None
        recovery = {
            "schema": "symphony-existing-repair-recovery/v1",
            "taskKey": task["taskKey"],
            "assignmentDigest": target["assignmentDigest"],
            "identifier": identifier,
            "state": "unknown",
            "reason": "claimed-execution-without-terminal-result",
            "runId": (run or acceptance or {}).get("runId"),
            "observedAt": _iso_now(),
        }
        if os.path.lexists(recovery_path):
            stored = read_private(recovery_path)
            require(stored.get("taskKey") == recovery["taskKey"] and
                    stored.get("assignmentDigest") == recovery["assignmentDigest"],
                    "isolated-repair-recovery-cross-bound")
        else:
            exclusive_write(recovery_path, recovery)
        return {"status": "held", "reason": "isolated-repair-claimed-outcome-unknown"}
    live = executor is None
    if live:
        try:
            validate_provider_grant(payload)
        except (OSError, ValueError, KeyError, TypeError):
            return {"status": "held", "reason": "qualified-isolated-repair-executor-unavailable"}
        executor = GrokOwnedRepairExecutor()
    eligibility = executor.qualify(task, payload)
    require(isinstance(eligibility, dict) and eligibility.get("qualified") is True
            and isinstance(eligibility.get("provider"), str)
            and 0 < len(eligibility["provider"]) <= 64
            and eligibility.get("provider") != "codex"
            and isinstance(eligibility.get("model"), str)
            and 0 < len(eligibility["model"]) <= 128
            and eligibility.get("funding") in ("included-local", "funded-credit")
            and eligibility.get("taskAppropriate") is True
            and eligibility.get("costAppropriate") is True
            and eligibility.get("delegationPolicyBound") is True
            and (eligibility.get("provider") != "anthropic" or (
                eligibility.get("policyException") == ANTHROPIC_LAST_RESORT_POLICY_EXCEPTION
                and eligibility.get("lastResortEscalation") is True))
            and type(eligibility.get("expiresAt")) in (int, float)
            and time.time() < eligibility["expiresAt"] <= payload["expiresAt"]
            and isinstance(eligibility.get("authPoolIdentity"), str)
            and re.fullmatch(r"[a-f0-9]{64}", eligibility["authPoolIdentity"]),
            "isolated-repair-router-qualification-required")
    try:
        os.fstat(9)
    except OSError:
        pass
    else:
        raise ValueError("isolated-repair-fd9-already-owned")
    lease = LEASE_ROOT / f"{identifier}.lock"
    fd = os.open(lease, os.O_RDWR | os.O_NOFOLLOW)
    try:
        # Exactly the native/fallback inode, never a parallel lock namespace.
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        os.dup2(fd, 9)
        original = os.environ.get("SYMPHONY_ISSUE_LEASE_FD")
        os.environ["SYMPHONY_ISSUE_LEASE_FD"] = "9"
        try:
            current = load_isolated(identifier, controller)
            require(current == payload, "assignment-replaced")
            issue = fetch_issue(identifier)
            require(isinstance(issue, dict) and issue.get("id") == payload["issueId"]
                    and issue.get("updatedAt") == payload["issueRevision"]
                    and (issue.get("assignee") or {}).get("id") == payload["ownerId"],
                    "isolated-repair-tracker-changed")
            prs = fetch_prs(payload["repository"])
            require(isinstance(prs, list), "assignment-inventory-unknown")
            mapped = [pr for pr in prs if identifier in marker_identifiers(pr)]
            require(len(mapped) == 1 and matches(payload, payload["repository"], mapped[0]), "assignment-pr-mismatch")
            check_workspace(payload, mapped[0])
            check_writer(payload, inherited=True)
            require(executor.qualify(task, payload) == eligibility, "isolated-repair-router-changed")
            claim_payload = {**payload, "taskKey": task["taskKey"], "task": task, "eligibility": eligibility}
            exclusive_write(ROOT / f"{identifier}.claim", claim_payload)
            run_id = f"{identifier}-{uuid.uuid4().hex}"
            provider_grant = payload.get("providerGrant")
            provider_grant_digest = (
                _digest(provider_grant) if isinstance(provider_grant, dict)
                else eligibility.get("grantDigest") or _digest({"injected": True, "taskKey": task["taskKey"]})
            )
            lease_digest = _lease_digest(payload)
            acceptance = {
                "schema": "symphony-existing-repair-acceptance/v1",
                "taskKey": task["taskKey"],
                "assignmentDigest": target["assignmentDigest"],
                "providerGrantDigest": provider_grant_digest,
                "runId": run_id,
                "provider": eligibility["provider"],
                "model": eligibility["model"],
                "authPoolIdentity": eligibility["authPoolIdentity"],
                "leaseIdentity": lease_digest,
                "identifier": identifier,
                "issueId": payload["issueId"],
                "repository": payload["repository"],
                "pr": payload["pr"],
                "head": payload["head"],
                "workspace": payload["workspace"],
                "acceptedAt": _iso_now(),
            }
            acceptance_path = _receipt_path(identifier, "acceptance")
            exclusive_write(acceptance_path, acceptance)
            run_started = {
                "schema": "symphony-existing-repair-run/v1",
                "taskKey": task["taskKey"],
                "assignmentDigest": target["assignmentDigest"],
                "providerGrantDigest": provider_grant_digest,
                "runId": run_id,
                "provider": eligibility["provider"],
                "model": eligibility["model"],
                "authPoolIdentity": eligibility["authPoolIdentity"],
                "leaseIdentity": lease_digest,
                "status": "started",
                "startedAt": _iso_now(),
            }
            run_path = _receipt_path(identifier, "run")
            exclusive_write(run_path, run_started)
            # The one-use claim, acceptance, and run receipt remain on uncertainty;
            # a restart records recovery and never starts the provider twice.
            execution_input = {**eligibility, "runId": run_id}
            result = executor.execute(task, payload, execution_input, lease_fd=9)
            require(isinstance(result, dict) and result.get("status") in ("succeeded", "failed"),
                    "isolated-repair-result-invalid")
            observation = result.pop("_executionObservation", {}) if isinstance(result, dict) else {}
            base_head = observation.get("baseHead", payload["head"])
            final_head = observation.get("finalHead", base_head)
            require(re.fullmatch(r"[0-9a-f]{40}", base_head)
                    and re.fullmatch(r"[0-9a-f]{40}", final_head),
                    "isolated-repair-result-head-invalid")
            output_digest = observation.get("outputDigest") or _digest({"runId": run_id})
            require(re.fullmatch(r"[a-f0-9]{64}", output_digest), "isolated-repair-result-evidence-invalid")
            run_terminal = {
                **run_started,
                "status": result["status"],
                "completedAt": result.get("completedAt") or _iso_now(),
                "baseHead": base_head,
                "finalHead": final_head,
                "outputDigest": output_digest,
                "exitCode": observation.get("exitCode"),
            }
            run_digest = _digest(run_terminal)
            verification = {
                "schema": EXECUTION_EVIDENCE_SCHEMA,
                "claimRecorded": True,
                "acceptanceRecorded": True,
                "runStarted": True,
                "runTerminal": True,
                "resultPersisted": True,
                "leaseHeld": True,
                "workspaceBound": True,
                "headObserved": True,
                "headChanged": final_head != base_head,
            }
            execution = {
                "runId": run_id,
                "provider": eligibility["provider"],
                "model": eligibility["model"],
                "authPoolIdentity": eligibility["authPoolIdentity"],
                "leaseIdentity": lease_digest,
                "evidenceDigest": "0" * 64,
                "assignmentDigest": target["assignmentDigest"],
                "providerGrantDigest": provider_grant_digest,
                "acceptanceDigest": _digest(acceptance),
                "runDigest": run_digest,
                "baseHead": base_head,
                "finalHead": final_head,
                "outputDigest": output_digest,
                "verification": verification,
            }
            execution["evidenceDigest"] = _execution_evidence_digest(execution)
            result["completedAt"] = run_terminal["completedAt"]
            result["detail"] = str(result.get("detail") or "isolated-repair-completed")[:240]
            result["execution"] = execution
            exclusive_write(result_path, {"taskKey": task["taskKey"], "assignmentDigest": target["assignmentDigest"], "result": result})
            _replace_private(run_path, run_terminal)
            return result
        finally:
            if original is None:
                os.environ.pop("SYMPHONY_ISSUE_LEASE_FD", None)
            else:
                os.environ["SYMPHONY_ISSUE_LEASE_FD"] = original
            if fd != 9:
                os.close(9)
    finally:
        os.close(fd)


def candidates(controller):
    if not ROOT.exists():
        return []
    private_directory()
    result = []
    for path in ROOT.glob("*.json"):
        try:
            payload = read_private(path)
            if _assignment_consumed(path.stem):
                continue
            result.append(validate_isolated(payload, path.stem, controller) if payload.get("schema") == ISOLATED_SCHEMA
                          else validate(payload, path.stem, controller))
        except (OSError, ValueError, KeyError, TypeError):
            # Invalid/expired assignments never contribute discovery authority.
            continue
    return result


def marker_identifiers(pr):
    body = pr.get("body")
    return re.findall(r"<!-- linear-issue-id:((?:JOV|LYB)-[1-9][0-9]*) -->", body) if isinstance(body, str) else []


def matches(payload, repo, pr):
    return (repo == payload["repository"] and pr.get("number") == payload["pr"]
            and pr.get("headRefOid") == payload["head"]
            and pr.get("headRepository") == {"nameWithOwner": repo}
            and marker_identifiers(pr) == [payload["identifier"]])


def check_workspace(payload, pr):
    workspace = Path(payload["workspace"])
    require(Path.cwd().resolve() == workspace
            and Path(os.environ.get("SYMPHONY_WORKSPACE", str(workspace))).resolve() == workspace,
            "assignment-workspace-mismatch")
    def git(*args):
        return subprocess.run(["git", "-C", str(workspace), *args], check=True,
                              capture_output=True, text=True, timeout=10).stdout.strip()
    require(git("rev-parse", "--show-toplevel") == str(workspace), "assignment-workspace-root-mismatch")
    require(git("rev-parse", "HEAD") == payload["head"], "assignment-workspace-head-mismatch")
    require(git("symbolic-ref", "--short", "HEAD") == pr.get("head", pr.get("headRefName")),
            "assignment-workspace-branch-mismatch")
    repo = payload["repository"]
    require(git("remote", "get-url", "origin") in
            {f"https://github.com/{repo}.git", f"https://github.com/{repo}", f"git@github.com:{repo}.git"},
            "assignment-workspace-repository-mismatch")


def check_writer(payload, *, inherited):
    groups = Path("/proc/self/cgroup").read_text().splitlines()
    require(any(payload["writerUnit"] in line.split(":", 2)[-1].split("/") for line in groups),
            "assignment-writer-unit-mismatch")
    path = LEASE_ROOT / f"{payload['identifier']}.lock"
    require(path.resolve() == path and not path.is_symlink(), "assignment-lease-path-untrusted")
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and {"device": info.st_dev, "inode": info.st_ino} == payload["leaseIdentity"],
            "assignment-lease-mismatch")
    if inherited:
        require(os.environ.get("SYMPHONY_ISSUE_LEASE_FD") == "9", "assignment-writer-lease-missing")
        held = os.fstat(9)
        require((held.st_dev, held.st_ino) == (info.st_dev, info.st_ino), "assignment-writer-lease-mismatch")
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    else:
        # before_run precedes the router's FD9 acquisition. This is only an
        # availability check; pickup must subsequently acquire and bind FD9.
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            os.close(fd)
    require(not os.path.lexists(ROOT / f"{payload['identifier']}.claim"), "assignment-already-claimed")


def exclusive_write(path, payload):
    private_directory()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as handle:
        json.dump(payload, handle, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    directory = os.open(ROOT, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def claim(payload, controller):
    # Expiry/source/ownership are checked again immediately before the one-use
    # claim. A concurrent or previously consumed assignment fails O_EXCL.
    current = load(payload["identifier"], controller)
    require(current == payload, "assignment-replaced")
    check_writer(current, inherited=True)
    exclusive_write(ROOT / f"{payload['identifier']}.claim", payload)


def authorize(spec, controller, issue, prs):
    """Operator-only producer. Call only for an explicitly assigned repair.

    No provider identity, user authority, or tracker transition is synthesized.
    Existing assignments and claims require explicit operator disposition.
    """
    identifier = spec["identifier"]
    path = assignment_path(identifier)
    private_directory()
    require(issue.get("identifier") == identifier and issue.get("id") == spec.get("issueId"), "assignment-tracker-mismatch")
    lease = LEASE_ROOT / f"{identifier}.lock"
    require(lease.resolve() == lease, "assignment-lease-path-untrusted")
    fd = os.open(lease, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid(), "assignment-lease-untrusted")
        isolated = spec.get("executionMode") == "isolated-cli"
        require(spec.get("executionMode") in (None, "isolated-cli"), "assignment-mode-invalid")
        payload = {**spec, "schema": ISOLATED_SCHEMA if isolated else SCHEMA, "sourceHashes": source_hashes(controller),
                   "leaseIdentity": {"device": info.st_dev, "inode": info.st_ino}}
        (validate_isolated if isolated else validate)(payload, identifier, controller)
        if isolated:
            require(issue.get("updatedAt") == payload["issueRevision"] and
                    (issue.get("assignee") or {}).get("id") == payload["ownerId"], "isolated-repair-tracker-changed")
        require(isinstance(prs, list), "assignment-inventory-unknown")
        mapped = [pr for pr in prs if identifier in marker_identifiers(pr)]
        require(len(mapped) == 1 and matches(payload, payload["repository"], mapped[0]), "assignment-pr-mismatch")
        require(not os.path.lexists(ROOT / f"{identifier}.claim"), "assignment-already-claimed")
        exclusive_write(path, payload)
        return payload
    finally:
        os.close(fd)
