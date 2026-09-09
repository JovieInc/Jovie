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

SCHEMA = "symphony-existing-pr-repair/v1"
ROOT = Path.home() / ".config/symphony/repair-assignments"
LEASE_ROOT = Path.home() / ".local/state/symphony-fallback/leases"
GUARD = Path.home() / ".local/bin/symphony-lease-guard"
MAX_SECONDS = 5400
REPOS = {"JOV": "JovieInc/Jovie", "LYB": "JovieInc/LogYourBody"}
UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"


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


def candidates(controller):
    if not ROOT.exists():
        return []
    private_directory()
    result = []
    for path in ROOT.glob("*.json"):
        try:
            result.append(load(path.stem, controller))
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
        payload = {**spec, "schema": SCHEMA, "sourceHashes": source_hashes(controller),
                   "leaseIdentity": {"device": info.st_dev, "inode": info.st_ino}}
        validate(payload, identifier, controller)
        require(isinstance(prs, list), "assignment-inventory-unknown")
        mapped = [pr for pr in prs if identifier in marker_identifiers(pr)]
        require(len(mapped) == 1 and matches(payload, payload["repository"], mapped[0]), "assignment-pr-mismatch")
        require(not os.path.lexists(ROOT / f"{identifier}.claim"), "assignment-already-claimed")
        exclusive_write(path, payload)
        return payload
    finally:
        os.close(fd)
