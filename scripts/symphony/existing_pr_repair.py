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
import time
from datetime import datetime, timezone

SCHEMA = "symphony-existing-pr-repair/v1"
ISOLATED_SCHEMA = "symphony-existing-pr-repair/v2"
ROOT = Path.home() / ".config/symphony/repair-assignments"
LEASE_ROOT = Path.home() / ".local/state/symphony-fallback/leases"
GUARD = Path.home() / ".local/bin/symphony-lease-guard"
MAX_SECONDS = 5400
REPOS = {"JOV": "JovieInc/Jovie", "LYB": "JovieInc/LogYourBody"}
UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
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


def execute_isolated(task, controller, fetch_issue, fetch_prs, *, executor=None):
    """Existing consumer adapter. Default is held, never an inferred live executor.

    Executor injection is for regression tests until the owner qualifies and installs
    an adapter using the canonical router. It must expose qualify and execute; a
    Summer class admission or model name is not an executor capability receipt.
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
        return {"status": "held", "reason": "isolated-repair-claimed-outcome-unknown"}
    # No real adapter is qualified by this source change. Do not fall through to
    # generic issue reconciliation (which writes Linear and chooses a workspace).
    if executor is None:
        return {"status": "held", "reason": "qualified-isolated-repair-executor-unavailable"}
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
            exclusive_write(ROOT / f"{identifier}.claim", {**payload, "taskKey": task["taskKey"], "task": task, "eligibility": eligibility})
            # The one-use claim remains on uncertainty; no automatic repeat of work.
            result = executor.execute(task, payload, eligibility, lease_fd=9)
            exclusive_write(result_path, {"taskKey": task["taskKey"], "assignmentDigest": target["assignmentDigest"], "result": result})
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
