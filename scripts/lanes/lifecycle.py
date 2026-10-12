"""Continuous host controller ownership across detached spawn and worker exec.

An operator can take the same file's exclusive lock only after controllers drain.
Inherited shared locks are released by close, never LOCK_UN: child processes may
still own the same open file description.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import re
from pathlib import Path
import stat
import subprocess
import sys
import time

PROTOCOL = "jovie-lane-lifecycle/v1"
FD_ENV = "LANES_LIFECYCLE_FD"
_active = None


class AdmissionHeld(RuntimeError):
    pass


class Guard:
    def __init__(self, state: Path, *, allow_drain=False):
        self.allow_drain = allow_drain
        self.state = Path(state).resolve()
        self.path = self.state / "lifecycle.lock"
        self.fd = None

    def validate(self):
        descriptor = os.fstat(self.fd)
        current = self.path.lstat()
        if (not stat.S_ISREG(descriptor.st_mode) or not stat.S_ISREG(current.st_mode)
                or (descriptor.st_dev, descriptor.st_ino) != (current.st_dev, current.st_ino)):
            raise AdmissionHeld("lifecycle descriptor differs from canonical lock")

    def __enter__(self):
        global _active
        if _active is not None:
            raise AdmissionHeld("nested lifecycle ownership")
        inherited = os.environ.get(FD_ENV)
        try:
            if draining(self.state) and not (self.allow_drain and inherited is not None):
                raise AdmissionHeld("operator requested natural controller drain")
            if inherited is not None:
                if not inherited.isdecimal() or int(inherited) < 3:
                    raise AdmissionHeld("malformed inherited lifecycle descriptor")
                self.fd = int(inherited)
                self.validate()
            else:
                self.state.mkdir(parents=True, exist_ok=True)
                self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                self.validate()
            # Validation alone does not prove ownership. A forged, valid-but-
            # unlocked descriptor must still pass the ordinary shared admission.
            fcntl.flock(self.fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
            self.validate()
            os.set_inheritable(self.fd, False)
        except (OSError, ValueError, AdmissionHeld) as error:
            if inherited is None and self.fd is not None:
                os.close(self.fd)
            self.fd = None
            raise AdmissionHeld(str(error)) from error
        os.environ.pop(FD_ENV, None)
        _active = self
        return self

    def __exit__(self, *_):
        global _active
        if os.environ.get(FD_ENV) == str(self.fd):
            os.environ.pop(FD_ENV, None)
        os.close(self.fd)
        self.fd = None
        _active = None


def spawn_kwargs(*, env=None, pass_fds=()):
    """Pass continuous ownership only to the controller children we own."""
    if _active is None:
        return {**({"env": env} if env is not None else {}),
                **({"pass_fds": tuple(pass_fds)} if pass_fds else {})}
    _active.validate()
    child_env = dict(os.environ if env is None else env)
    child_env["LANES_STATE"] = str(_active.state)
    child_env[FD_ENV] = str(_active.fd)
    descriptors = tuple(dict.fromkeys((*pass_fds, _active.fd)))
    return {"env": child_env, "pass_fds": descriptors}


def prepare_reexec():
    if _active is not None:
        _active.validate()
        os.set_inheritable(_active.fd, True)
        os.environ[FD_ENV] = str(_active.fd)


def active():
    return _active is not None


def run(args, **kwargs):
    """Retain ownership in a tracked helper across controller death.

    Preserve subprocess.run's stdin, stdout, stderr and exit/timeout contract.
    The helper reports a drained outcome on a dedicated pipe; a cleanup failure
    retains the shared lock and never produces an outcome eligible for retry.
    """
    if not active():
        return subprocess.run(args, **kwargs)
    timeout = kwargs.pop("timeout", None)
    check = kwargs.pop("check", False)
    env = kwargs.pop("env", None)
    inherited = kwargs.pop("pass_fds", ())
    read_fd, write_fd = os.pipe()
    command = [sys.executable, str(Path(__file__).resolve().with_name("lane_runner.py")),
               "gate-command", "--timeout", str(float("inf") if timeout is None else timeout),
               "--result-fd", str(write_fd), "--separate-stderr"]
    if env is not None and "LANES_STATE" in env:
        command += ["--child-state", str(env["LANES_STATE"])]
    command += ["--", *args]
    try:
        result = subprocess.run(command, **kwargs,
                                **spawn_kwargs(env=env, pass_fds=(*inherited, write_fd)))
        os.close(write_fd)
        write_fd = None
        receipt = json.loads(os.read(read_fd, 4096))
    finally:
        os.close(read_fd)
        if write_fd is not None:
            os.close(write_fd)
    if receipt.get("timeout") is True:
        raise subprocess.TimeoutExpired(args, timeout, result.stdout, result.stderr)
    if "spawnError" in receipt:
        error = receipt["spawnError"]
        raise OSError(error["errno"], error["strerror"], error["filename"])
    code = receipt["returncode"]
    if not isinstance(code, int):
        raise RuntimeError("lifecycle-command-outcome-unavailable")
    if check and code:
        raise subprocess.CalledProcessError(code, args, result.stdout, result.stderr)
    return subprocess.CompletedProcess(args, code, result.stdout, result.stderr)


def draining(state):
    """An operator hold blocks new units; admitted command helpers may finish.

    No automatic expiry resumes uncertain work. Any unreadable or malformed hold
    remains a hold until the operator reconciles and removes the exact request.
    """
    try:
        (Path(state) / "lifecycle-drain.json").lstat()
        return True
    except FileNotFoundError:
        return False
    except OSError:
        return True


def _require(condition, reason):
    if not condition:
        raise AdmissionHeld(reason)


def checked_manifest(value):
    """Validate an exact qualified target, not a caller's green/proof boolean."""
    _require(isinstance(value, dict) and set(value) == {
        "schema", "sourceCommit", "bundleDigest", "objects"}
        and value["schema"] == "jovie-lane-release-bundle/v1", "invalid operator manifest")
    objects = value["objects"]
    _require(isinstance(objects, dict) and "scripts/lanes" in objects
             and 1 <= len(objects) <= 256, "incomplete operator manifest")
    for name, oid in objects.items():
        _require(isinstance(name, str) and name and not name.startswith("/")
                 and all(part not in ("", ".", "..") for part in name.split("/"))
                 and isinstance(oid, str) and re.fullmatch("[0-9a-f]{40}", oid),
                 "invalid manifest object")
    digest = hashlib.sha256(json.dumps(objects, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    _require(isinstance(value["sourceCommit"], str)
             and re.fullmatch("[0-9a-f]{40}", value["sourceCommit"])
             and value["bundleDigest"] == digest, "operator manifest digest mismatch")
    return json.loads(json.dumps(value))


def _read_regular(path, limit=16 * 1024 * 1024):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _require(stat.S_ISREG(before.st_mode) and before.st_size <= limit,
                 "invalid operator evidence file")
        chunks, size = [], 0
        while chunk := os.read(fd, min(65536, limit + 1 - size)):
            chunks.append(chunk)
            size += len(chunk)
            _require(size <= limit, "operator evidence grew beyond bound")
        after, current = os.fstat(fd), Path(path).lstat()
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
                                 info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode))
        _require(identity(before) == identity(after) == identity(current),
                 "operator evidence changed while reading")
        return b"".join(chunks), current
    finally:
        os.close(fd)


def _sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        _require(stat.S_ISDIR(os.fstat(fd).st_mode), "operator state is not a directory")
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_sources(root, manifest):
    """Recompute every manifest object, including the complete managed source tree.

    Only installer-generated metadata, mesh outputs and Python bytecode are
    omitted from the Git tree. Their proof is separate from source identity.
    """
    manifest = checked_manifest(manifest)
    root = Path(root)
    _require(root.is_absolute() and root.resolve() == root and not root.is_symlink(),
             "release root is not canonical")
    count = 0
    def object_hash(path, relative, depth=0):
        nonlocal count
        count += 1
        _require(count <= 4096 and depth <= 32, "release source traversal bound")
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            data, _ = _read_regular(path)
            return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).digest()
        _require(stat.S_ISDIR(info.st_mode), "release source symlink or special file")
        entries = []
        for child in path.iterdir():
            child_relative = relative + "/" + child.name
            if (child.name == "__pycache__" or child_relative in {
                    "scripts/lanes/.tree", "scripts/lanes/.bundle", "scripts/lanes/.release.json",
                    "scripts/lanes/.mesh-runtime"}):
                continue
            child_info = child.lstat()
            directory = stat.S_ISDIR(child_info.st_mode)
            mode = b"40000" if directory else (b"100755" if child_info.st_mode & 0o111 else b"100644")
            oid = object_hash(child, child_relative, depth + 1)
            name = os.fsencode(child.name)
            entries.append((name + (b"/" if directory else b""), mode + b" " + name + b"\0" + oid))
        _require((info.st_dev, info.st_ino) == (path.lstat().st_dev, path.lstat().st_ino),
                 "release source directory changed")
        data = b"".join(entry for _, entry in sorted(entries))
        return hashlib.sha1(b"tree " + str(len(data)).encode() + b"\0" + data).digest()
    for relative, oid in manifest["objects"].items():
        path = root
        for part in relative.split("/"):
            path /= part
            _require(not path.is_symlink(), "release source ancestor is a symlink")
        _require(object_hash(path, relative).hex() == oid, "qualified release source mismatch")
    return manifest


def validate_release(root, manifest):
    manifest = validate_sources(root, manifest)
    lanes = Path(root) / "scripts/lanes"
    actual, _ = _read_regular(lanes / ".release.json", 65536)
    bundle, _ = _read_regular(lanes / ".bundle", 256)
    tree, _ = _read_regular(lanes / ".tree", 256)
    _require(json.loads(actual) == manifest and bundle.decode().strip() == manifest["bundleDigest"]
             and tree.decode().strip() == manifest["objects"]["scripts/lanes"],
             "qualified release metadata mismatch")
    return manifest


class OperatorGuard:
    """An owned persistent drain and ordinary EX barrier for an operator update.

    The required admission_check must inspect the complete participating launch
    routes, including unguarded writers. Kernel EX proves only lifecycle-covered
    processes; a JSON coverage flag is not that check. Failure/close retains the
    drain. No inherited descriptor, shared-lock upgrade or automatic expiry is
    accepted. The caller remains responsible for reviewed source qualification.
    """
    def __init__(self, state, *, owner, operation_id, manifest, admission_check):
        self.state = Path(state).resolve()
        self.path = self.state / "lifecycle.lock"
        self.marker = self.state / "lifecycle-drain.json"
        self.manifest = checked_manifest(manifest)
        _require(isinstance(owner, str) and owner == owner.strip() and 0 < len(owner) <= 512
                 and isinstance(operation_id, str) and re.fullmatch("[A-Za-z0-9._-]{1,128}", operation_id)
                 and callable(admission_check), "invalid operator ownership or admission check")
        self.admission_check = admission_check
        self.request = {"schema": "jovie-lane-operator-drain/v1", "owner": owner,
                        "operationId": operation_id, "uid": os.geteuid(),
                        "state": str(self.state), "manifest": self.manifest}
        self.marker_bytes = json.dumps(self.request, sort_keys=True, separators=(",", ":")).encode()
        self.fd = None

    def _check_admissions(self):
        before = time.monotonic()
        _require(self.admission_check() is None, "participant admission check did not accept")
        after = time.monotonic()
        _require(all(type(value) in (int, float) and math.isfinite(value) for value in (before, after))
                 and 0 <= after - before <= 30, "participant admission evidence exceeded freshness bound")

    def __enter__(self):
        _require(self.fd is None and not active() and FD_ENV not in os.environ,
                 "operator cannot inherit controller ownership")
        self._check_admissions()
        self.state.mkdir(parents=True, exist_ok=True)
        _require(self.state.stat().st_uid == os.geteuid(), "operator state owner differs")
        try:
            marker_fd = os.open(self.marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            pass
        else:
            # A partially written marker still blocks admissions on failure.
            with os.fdopen(marker_fd, "wb") as marker:
                marker.write(self.marker_bytes)
                marker.flush()
                os.fsync(marker.fileno())
            _sync_directory(self.state)
        raw, info = _read_regular(self.marker, 65536)
        _require(raw == self.marker_bytes and info.st_uid == os.geteuid(), "foreign or changed operator drain")
        self.marker_identity = (info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode))
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_identity = self._identity(os.fstat(self.fd))
            self.validate()
        except BaseException:
            os.close(self.fd)
            self.fd = None
            raise
        return self

    @staticmethod
    def _identity(info):
        _require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
                 and not info.st_mode & 0o022, "operator lock owner/type differs")
        return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode))

    def _validate_owned(self):
        _require(self.fd is not None and self._identity(os.fstat(self.fd)) == self.lock_identity
                 == self._identity(self.path.lstat()), "canonical operator lock changed")
        raw, info = _read_regular(self.marker, 65536)
        _require(raw == self.marker_bytes and self._identity(info) == self.marker_identity,
                 "owned operator drain changed")

    def validate(self):
        self._validate_owned()
        self._check_admissions()
        self._validate_owned()
        probe = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            try:
                fcntl.flock(probe, fcntl.LOCK_SH | fcntl.LOCK_NB)
            except BlockingIOError:
                pass
            else:
                raise AdmissionHeld("exclusive operator exclusion lost")
        finally:
            os.close(probe)

    def proof_env(self, staging, repo):
        self.validate()
        staging = Path(staging)
        _require(staging.is_absolute() and staging.resolve() == staging and not staging.is_symlink()
                 and staging.parent == self.state / "releases"
                 and staging.name == "." + self.manifest["bundleDigest"] + ".tmp",
                 "proof staging differs from owned release")
        validate_sources(staging, self.manifest)
        scratch = staging / ".staging-proof-state"
        scratch.mkdir(mode=0o700)  # exclusive creation; no stale or symlink state is reused
        env = {key: value for key, value in os.environ.items() if key != FD_ENV}
        return {**env, "LANES_STATE": str(scratch), "LANES_REPO": str(Path(repo).resolve()), "LANES_SELFTEST": "1"}

    def prove_staging(self, staging, repo, *, timeout):
        env = self.proof_env(staging, repo)
        # A real private SH owner tracks proof descendants. The canonical EX is
        # never handed to a child or converted to SH, even after parent death.
        with Guard(Path(env["LANES_STATE"])):
            return run([sys.executable, str(Path(staging) / "scripts/lanes/lane_runner.py"),
                        "prove-staging", str(staging)], cwd=staging, capture_output=True,
                       text=True, timeout=timeout, env=env)

    def resume(self, release_root, *, acceptance_check):
        _require(callable(acceptance_check), "missing cross-host acceptance check")
        self.validate()
        release_root = Path(release_root)
        current = self.state / "current"
        _require(release_root == self.state / "releases" / self.manifest["bundleDigest"]
                 and current.is_symlink() and current.resolve() == release_root / "scripts/lanes",
                 "qualified release is not installed current")
        identity = current.lstat()
        current_identity = (identity.st_dev, identity.st_ino, os.readlink(current))
        validate_release(release_root, self.manifest)
        before = time.monotonic()
        _require(acceptance_check() is None, "cross-host acceptance incomplete")
        after = time.monotonic()
        _require(all(type(value) in (int, float) and math.isfinite(value) for value in (before, after))
                 and 0 <= after - before <= 30, "cross-host acceptance exceeded freshness bound")
        self.validate()
        identity = current.lstat()
        _require(current_identity == (identity.st_dev, identity.st_ino, os.readlink(current)),
                 "installed current changed during acceptance")
        validate_release(release_root, self.manifest)
        # Every supported operator marker writer must take this same EX lock.
        # Unknown/unguarded marker writers are refused by admission_check.
        self.marker.unlink()
        _sync_directory(self.state)

    def __exit__(self, *_):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
