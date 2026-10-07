"""Continuous host controller ownership across detached spawn and worker exec.

An operator can take the same file's exclusive lock only after controllers drain.
Inherited shared locks are released by close, never LOCK_UN: child processes may
still own the same open file description.
"""
from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

PROTOCOL = "jovie-lane-lifecycle/v1"
FD_ENV = "LANES_LIFECYCLE_FD"
_active = None


class AdmissionHeld(RuntimeError):
    pass


class Guard:
    def __init__(self, state: Path):
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
