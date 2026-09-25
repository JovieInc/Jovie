#!/usr/bin/env python3
"""Read-only native worker projection beside the existing consumer journal.

Private-file checks are not signature verification. The existing consumer owns
that verification and must revalidate the exact task, installed producer, native
session, stopped execution and production result before trusting a candidate.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re
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
EXIT_SCHEMA = "symphony-shipping-worker-exit/v1"
DIGEST = re.compile(r"[a-f0-9]{64}")


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
                         producer_sha256: str, *, require_workspace: bool = True) -> dict:
    owned_directory(private_root.parent.parent)
    owned_directory(private_root.parent)
    owned_directory(private_root, private=True)
    if require_workspace:
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
    identity = value["digest"]
    if value.get("schema") == EXIT_SCHEMA:
        if not isinstance(value.get("candidateDigest"), str) or not DIGEST.fullmatch(value["candidateDigest"]):
            raise ValueError("worker evidence exit reference invalid")
        identity = "exit-" + value["candidateDigest"]
    destination = root / (identity + ".json")
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
            invocation_id: str, producer_directory: Path, pointer: Path | None = None) -> bool:
    private_root = gem_workspace / "state" / "summer-symphony-consumer"
    def binding(require_workspace=True):
        return binding_from_journal(private_root, workspace, invocation_id,
                                    producer_digest(producer_directory), require_workspace=require_workspace)
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
        if binding(require_workspace=False) != initial:
            raise ValueError("worker evidence binding changed before publication")
        publish_candidate(private_root, value)
        if pointer is not None:
            write_pointer(pointer, value["digest"])
    return capture_stream(source, destination, reader, publish)


def write_pointer(path: Path, candidate_digest: str) -> None:
    # The launcher creates this private, empty mktemp file before starting Codex.
    # Native messages never choose it. Refuse to replace another capture attempt.
    fd = os.open(path, os.O_WRONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 0):
            raise ValueError("worker evidence pointer unsafe")
        with os.fdopen(os.dup(fd), "wb") as output:
            output.write((candidate_digest + "\n").encode("ascii"))
            output.flush()
            os.fsync(output.fileno())
    finally:
        os.close(fd)


def record_exit(pointer: Path, process_code: int, launcher_code: int, *, gem_workspace: Path,
                workspace: Path, invocation_id: str, producer_directory: Path,
                now=lambda: datetime.now(timezone.utc)) -> Path:
    if any(type(code) is not int or not 0 <= code <= 255 for code in (process_code, launcher_code)):
        raise ValueError("worker evidence exit code invalid")
    private_root = gem_workspace / "state/summer-symphony-consumer"
    binding = binding_from_journal(private_root, workspace, invocation_id, producer_digest(producer_directory),
                                   require_workspace=False)
    reference = read_owned(pointer).decode("ascii").strip()
    if not DIGEST.fullmatch(reference):
        raise ValueError("worker evidence pointer invalid")
    root = private_root / "worker-evidence"
    owned_directory(root, private=True)
    candidate = json.loads(read_owned(root / (reference + ".json")))
    if (not isinstance(candidate, dict) or candidate.get("schema") != "symphony-shipping-worker-candidate/v1"
            or candidate.get("digest") != reference
            or digest({key: value for key, value in candidate.items() if key != "digest"}) != reference
            or any(candidate.get(key) != value for key, value in binding.items())
            or candidate.get("executionTerminated") is not False):
        raise ValueError("worker evidence exit candidate cross-bound")
    observed = now()
    if (observed.tzinfo is None or observed.utcoffset().total_seconds() != 0
            or observed < datetime.fromisoformat(candidate["observedAt"].replace("Z", "+00:00"))):
        raise ValueError("worker evidence exit clock invalid")
    fixed = {"schema": EXIT_SCHEMA, **binding, "candidateDigest": reference,
             "sessionId": candidate["sessionId"], "processExitCode": process_code,
             "launcherExitCode": launcher_code, "workerProcessExited": True, "taskTerminal": False}
    destination = root / ("exit-" + reference + ".json")
    if destination.exists():
        prior = json.loads(read_owned(destination))
        if (set(prior) != {*fixed, "observedAt", "digest"}
                or any(prior.get(key) != value for key, value in fixed.items())
                or prior.get("digest") != digest({key: value for key, value in prior.items() if key != "digest"})
                or not datetime.fromisoformat(candidate["observedAt"].replace("Z", "+00:00"))
                <= datetime.fromisoformat(prior["observedAt"].replace("Z", "+00:00")) <= observed):
            raise ValueError("worker evidence exit receipt conflict")
        return destination
    value = {**fixed, "observedAt": observed.isoformat().replace("+00:00", "Z")}
    return publish_candidate(private_root, {**value, "digest": digest(value)})


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    try:
        recording_exit = len(args) == 5 and args[0] == "--record-exit"
        context = dict(gem_workspace=Path(os.environ.get("GEM_WORKSPACE", "/home/timwhite/gem-workspace")),
                       workspace=Path(args[4]) if recording_exit else Path.cwd(),
                       invocation_id=os.environ.get("INVOCATION_ID", ""),
                       producer_directory=Path(__file__).resolve().parent)
        if recording_exit:
            record_exit(Path(args[1]), int(args[2]), int(args[3]), **context)
        elif not args or (len(args) == 2 and args[0] == "--candidate-pointer"):
            capture(sys.stdin.buffer, sys.stdout.buffer, pointer=Path(args[1]) if args else None, **context)
        else:
            raise ValueError("worker evidence arguments invalid")
        return 0
    except Exception:
        # Never include provider output, journal contents, paths or credentials.
        print("worker-evidence: capture-unavailable", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
