#!/usr/bin/env python3
"""Read-only native worker projection beside the existing consumer journal.

Private-file checks are not signature verification. The existing consumer owns
that verification and must revalidate the exact task, installed producer, native
session, stopped execution and production result before trusting a candidate.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time

from shipping_lead_worker_evidence import NativeTurnEvidence, capture_stream, digest

LIMIT = 1024 * 1024


def owned_directory(path: Path, private: bool = False) -> None:
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or path.resolve(strict=True) != path
            or info.st_uid != os.getuid() or info.st_mode & 0o022
            or (private and stat.S_IMODE(info.st_mode) != 0o700)):
        raise ValueError("worker evidence directory unsafe")


def read_owned(path: Path, *, private: bool = True) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                or before.st_nlink != 1 or before.st_size > LIMIT
                or before.st_mode & 0o022
                or (private and stat.S_IMODE(before.st_mode) != 0o600)):
            raise ValueError("worker evidence file unsafe")
        data = bytearray()
        while len(data) <= LIMIT:
            chunk = os.read(fd, min(65536, LIMIT + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
        after = os.fstat(fd)
        if (len(data) > LIMIT or len(data) != before.st_size
                or (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)):
            raise ValueError("worker evidence file changed during read")
        return bytes(data)
    finally:
        os.close(fd)


def producer_digest(directory: Path) -> str:
    owned_directory(directory)
    return digest({name: hashlib.sha256(read_owned(directory / name, private=False)).hexdigest()
                   for name in ("codex-rotate", "shipping_lead_worker_evidence.py",
                                "shipping_worker_capture.py")})


def binding_from_journal(private_root: Path, workspace: Path, invocation_id: str,
                         producer_sha256: str) -> dict:
    owned_directory(private_root.parent.parent)
    owned_directory(private_root.parent)
    owned_directory(private_root, private=True)
    owned_directory(workspace)
    state = json.loads(read_owned(private_root / "state.json"))
    active = state.get("active") if isinstance(state, dict) else None
    if (not isinstance(state, dict) or state.get("schema") != "jovie.summer-symphony-consumer-state/v1"
            or not isinstance(active, dict) or active.get("phase") != "discovered"):
        raise ValueError("worker evidence admission unavailable")
    record = active.get("record")
    task = record.get("task") if isinstance(record, dict) else None
    progress = active.get("admissionProgress")
    if (not isinstance(task, dict) or task.get("schema") != "jovie-symphony-shipping-lead-task/v1"
            or active.get("taskKey") != task.get("taskKey")
            or not isinstance(progress, dict)
            or progress.get("schema") != "symphony-shipping-lead-admission-progress/v1"
            or progress.get("taskDigest") != digest(task)
            or type(progress.get("mutationCount")) is not int
            or not 1 <= progress["mutationCount"] <= 100):
        raise ValueError("worker evidence admission not attempted")
    issue = task.get("issue")
    runtime = task.get("runtime")
    if (not isinstance(issue, dict) or not isinstance(runtime, dict)
            or runtime.get("invocationId") != invocation_id
            or workspace.name != issue.get("identifier")
            or issue.get("repository") != "JovieInc/Jovie"):
        raise ValueError("worker evidence admission cross-bound")
    binding = {"taskDigest": digest(task), "issueId": issue.get("id"),
               "identifier": issue.get("identifier"), "invocationId": invocation_id,
               "runtimeGeneration": runtime.get("generation"), "workspace": str(workspace),
               "producerSha256": producer_sha256}
    # Use the projector's strict bounded schema without running Git yet.
    NativeTurnEvidence(binding, git=lambda: None)
    return binding


def git_snapshot(workspace: Path) -> dict:
    owned_directory(workspace)
    deadline = time.monotonic() + 1
    def git(*args):
        result = subprocess.run(["git", "-C", str(workspace), *args], check=True,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=max(0.001, deadline - time.monotonic()),
                                env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"})
        if len(result.stdout) > LIMIT:
            raise ValueError("worker evidence Git response oversized")
        return result.stdout
    if git("rev-parse", "--show-toplevel").decode().strip() != str(workspace):
        raise ValueError("worker evidence Git workspace mismatch")
    before = git("rev-parse", "--verify", "HEAD").decode().strip()
    clean = not git("status", "--porcelain=v1", "--untracked-files=normal")
    if git("rev-parse", "--verify", "HEAD").decode().strip() != before:
        raise ValueError("worker evidence Git head changed during read")
    return {"head": before, "clean": clean}


def publish_candidate(private_root: Path, value: dict) -> Path:
    owned_directory(private_root, private=True)
    if value.get("digest") != digest({key: item for key, item in value.items() if key != "digest"}):
        raise ValueError("worker evidence candidate digest invalid")
    root = private_root / "worker-evidence"
    root.mkdir(mode=0o700, exist_ok=True)
    owned_directory(root, private=True)
    data = (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
    if len(data) > LIMIT:
        raise ValueError("worker evidence candidate oversized")
    destination = root / (value["digest"] + ".json")
    fd, name = tempfile.mkstemp(prefix=".candidate-", dir=root)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(temporary, destination, follow_symlinks=False)
        except FileExistsError:
            if read_owned(destination) != data:
                raise ValueError("worker evidence immutable candidate conflict")
        # Remove the temporary hard link before consumers inspect st_nlink.
        temporary.unlink()
        directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def capture(source, destination, *, gem_workspace: Path, workspace: Path,
            invocation_id: str, producer_directory: Path) -> bool:
    private_root = gem_workspace / "state" / "summer-symphony-consumer"
    def binding():
        return binding_from_journal(private_root, workspace, invocation_id,
                                    producer_digest(producer_directory))
    try:
        initial = binding()
        reader = NativeTurnEvidence(initial, git=lambda: git_snapshot(workspace))
    except Exception:
        # No admission is normal for other Symphony tasks. Preserve native IO.
        while chunk := source.read1(65536):
            destination.write(chunk)
            destination.flush()
        return False
    def publish(value):
        if binding() != initial:
            raise ValueError("worker evidence binding changed before publication")
        publish_candidate(private_root, value)
    return capture_stream(source, destination, reader, publish)


def main() -> int:
    try:
        capture(sys.stdin.buffer, sys.stdout.buffer,
                gem_workspace=Path(os.environ.get("GEM_WORKSPACE", "/home/timwhite/gem-workspace")),
                workspace=Path.cwd(), invocation_id=os.environ.get("INVOCATION_ID", ""),
                producer_directory=Path(__file__).resolve().parent)
        return 0
    except Exception:
        # Never include provider output, journal contents, paths or credentials.
        print("worker-evidence: capture-unavailable", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
