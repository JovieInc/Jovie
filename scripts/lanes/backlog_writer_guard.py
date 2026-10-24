"""Private, bounded lock session for the existing Fleet Backlog writer.

This process reads and fences; Fleet's Node adapter alone writes Linear. It
accepts no evidence packet, claims no work, and starts no provider. EOF/death
releases the kernel lock; a parent with an in-flight write must reconcile that
unknown effect instead of retrying it.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import select
import stat
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog_admission

SCHEMA = "jovie.backlog-writer-guard/v1"
CONTROL_TIMEOUT_S = 25
WRITE_WINDOW_S = 25
MIN_WRITE_WINDOW_S = 22
MAX_MESSAGE_BYTES = 4096
MAX_FRAME_BYTES = 1024 * 1024


class GuardHeld(RuntimeError):
    pass


class ParentOutputHeld(GuardHeld):
    """A failed output stream cannot be retried as another proof frame."""
    pass


class ClaimFence:
    """The installed lanes' canonical kernel fence, with exact inode checks."""
    def __init__(self, state):
        self.path = Path(state) / "claim.lock"
        self.fd = None

    def __enter__(self):
        before = self.path.lstat()
        if not stat.S_ISREG(before.st_mode):
            raise GuardHeld("canonical-claim-lock-not-regular")
        self.fd = os.open(self.path, os.O_RDWR | os.O_NOFOLLOW)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.identity = (before.st_dev, before.st_ino)
            self.check()
            return self
        except BaseException as error:
            os.close(self.fd)
            self.fd = None
            if isinstance(error, BlockingIOError):
                raise GuardHeld("canonical-claim-lock-busy") from None
            raise

    def check(self):
        current, opened = self.path.lstat(), os.fstat(self.fd)
        if (not stat.S_ISREG(current.st_mode) or
                (current.st_dev, current.st_ino) != self.identity or
                (opened.st_dev, opened.st_ino) != self.identity):
            raise GuardHeld("canonical-claim-lock-identity-changed")
        return {"device": opened.st_dev, "inode": opened.st_ino}

    def __exit__(self, *_):
        if self.fd is not None:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd)
            self.fd = None


def read_control(timeout):
    deadline, line = time.monotonic() + timeout, bytearray()
    while len(line) <= MAX_MESSAGE_BYTES:
        ready, _, _ = select.select([sys.stdin], [], [], max(0, deadline - time.monotonic()))
        if not ready:
            raise GuardHeld("parent-control-timeout")
        char = os.read(sys.stdin.fileno(), 1)
        if not char:
            raise GuardHeld("parent-eof")
        if char == b"\n":
            break
        line.extend(char)
    else:
        raise GuardHeld("parent-control-malformed")
    value = json.loads(line)
    if not isinstance(value, dict):
        raise GuardHeld("parent-control-malformed")
    return value


def emit(value, *, deadline=None, clock=time.time, monotonic_deadline=None,
         monotonic=None):
    monotonic = monotonic or time.monotonic
    payload = (json.dumps(value, separators=(",", ":")) + "\n").encode()
    if len(payload) > MAX_FRAME_BYTES:
        raise ParentOutputHeld("parent-output-frame-too-large")
    deadline = clock() + CONTROL_TIMEOUT_S if deadline is None else deadline
    remaining = deadline - clock()
    if not 0 < remaining <= CONTROL_TIMEOUT_S:
        raise ParentOutputHeld("parent-output-deadline")
    ceiling = monotonic() + remaining
    monotonic_deadline = ceiling if monotonic_deadline is None else min(ceiling, monotonic_deadline)
    fd, flags = sys.stdout.fileno(), None
    try:
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        offset = 0
        while offset < len(payload):
            remaining = min(deadline - clock(), monotonic_deadline - monotonic())
            if not 0 < remaining <= CONTROL_TIMEOUT_S:
                raise ParentOutputHeld("parent-output-deadline")
            _, writable, _ = select.select([], [fd], [], remaining)
            if not writable:
                raise ParentOutputHeld("parent-output-deadline")
            try:
                count = os.write(fd, payload[offset:])
            except BlockingIOError:
                continue
            if count <= 0:
                raise ParentOutputHeld("parent-output-closed")
            offset += count
    except OSError:
        raise ParentOutputHeld("parent-output-closed") from None
    finally:
        if flags is not None:
            fcntl.fcntl(fd, fcntl.F_SETFL, flags)


def run_guard(identifier, expected_version, *, prepare=None, read=read_control,
              send=None, lock_factory=ClaimFence, clock=time.time, monotonic=None):
    # Test injection is in-process only. The CLI exposes identity/version, never
    # a supplied observation, lock path, runtime path or authority flag.
    prepare = prepare or backlog_admission.prepare_backlog_guard
    monotonic = monotonic or time.monotonic
    nonce = secrets.token_hex(32)
    base = {"schema": SCHEMA, "issue": identifier, "expectedVersion": expected_version,
            "nonce": nonce, "authorizesTransition": False, "authorizesDispatch": False}
    output_deadline = None
    output_monotonic_deadline = None
    def report(phase, **details):
        value = {**base, "phase": phase, **details}
        if send is None:
            emit(value, deadline=output_deadline, clock=clock,
                 monotonic_deadline=output_monotonic_deadline, monotonic=monotonic)
        else:
            send(value)
    def control(timeout, expected):
        value = read(timeout)
        if (set(value) != {"nonce", "op"} or value["nonce"] != nonce or value["op"] not in expected):
            raise GuardHeld("parent-control-binding-mismatch")
        return value["op"]
    try:
        prepared = prepare(identifier, expected_version)
        observation = prepared.observation
        if observation.get("allowed") is not True:
            report("held", observation=observation)
            return 2
        report("prepared", issueId=prepared.issue_id, priority=prepared.priority,
               observation=observation)
        control(CONTROL_TIMEOUT_S, {"lock"})
        # Remote joins finish before taking the shared native claim fence. The
        # private context retains its original read set; it cannot refresh away
        # an intervening owner, priority, dependency or attempt change.
        observation = prepared.revalidate()
        if observation.get("allowed") is not True:
            report("held", observation=observation)
            return 2
        with lock_factory(prepared.canonical_state_path) as lock:
            fence_started = monotonic()
            fence_wall_started = clock()
            observation = prepared.assert_bound()
            if observation.get("allowed") is not True:
                report("held", observation=observation)
                return 2
            seen = backlog_admission._epoch(observation.get("evidence", {}).get("observedAt"))
            now = clock()
            if seen is None or not 0 <= now - seen <= backlog_admission.MAX_AGE_S:
                raise GuardHeld("native-proof-expired")
            monotonic_now = monotonic()
            kernel_deadline = fence_started + WRITE_WINDOW_S
            # The parent's abort timer uses the advertised epoch deadline.
            # Local checks and wall-clock lag cannot give it a longer window
            # than the kernel fence's original monotonic ceiling.
            expires = min(fence_wall_started + WRITE_WINDOW_S,
                          now + (kernel_deadline - monotonic_now),
                          seen + backlog_admission.MAX_AGE_S)
            output_monotonic_deadline = min(kernel_deadline,
                                            monotonic_now + (expires - now))
            if min(expires - now, output_monotonic_deadline - monotonic_now) < MIN_WRITE_WINDOW_S:
                raise GuardHeld("native-proof-write-window-too-short")
            output_deadline = expires
            identity = lock.check()
            report("locked", issueId=prepared.issue_id, priority=prepared.priority,
                   expiresAt=expires, lockIdentity=identity, observation=observation)
            while True:
                wall_remaining = expires - clock()
                remaining = min(wall_remaining, output_monotonic_deadline - monotonic())
                # Refuse expiry and clock drift before waiting on the parent;
                # an expired proof never becomes a negative/unbounded timeout.
                if not 0 < wall_remaining <= WRITE_WINDOW_S or not 0 < remaining <= WRITE_WINDOW_S:
                    raise GuardHeld("writer-lock-window-expired")
                op = control(remaining, {"check", "done", "abort"})
                after_read = expires - clock()
                if not 0 < after_read <= WRITE_WINDOW_S or not monotonic() < output_monotonic_deadline:
                    raise GuardHeld("writer-lock-window-expired")
                if lock.check() != identity:
                    raise GuardHeld("canonical-claim-lock-identity-changed")
                observation = prepared.assert_bound()
                if observation.get("allowed") is not True:
                    report("held", observation=observation,
                           effect="unknown-if-parent-write-started")
                    return 2
                if op == "check":
                    report("locked", issueId=prepared.issue_id, priority=prepared.priority,
                           expiresAt=expires, lockIdentity=identity, observation=observation)
                else:
                    break
        report("released", result=op)
        return 0
    except (OSError, ValueError, TypeError, KeyError, RuntimeError) as error:
        # A partial/closed stream cannot carry a second, potentially misleading
        # frame. With unwound, the kernel fence is already released. Oversize
        # frames write no bytes, so only that case may report a compact hold.
        if isinstance(error, ParentOutputHeld) and str(error) != "parent-output-frame-too-large":
            return 2
        reason = str(error) if isinstance(error, GuardHeld) else type(error).__name__
        try:
            report("held", reason=reason, effect="unknown-if-parent-write-started")
        except ParentOutputHeld:
            pass
        return 2


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--issue", required=True)
    parser.add_argument("--expected-version", required=True)
    args = parser.parse_args()
    state = Path.home() / ".local/state/jovie-lanes"
    if Path(__file__).resolve() != (state / "current").resolve() / "backlog_writer_guard.py":
        emit({"schema": SCHEMA, "phase": "held", "reason": "writer-guard-not-installed",
              "authorizesTransition": False, "authorizesDispatch": False})
        return 2
    return run_guard(args.issue, args.expected_version)


if __name__ == "__main__":
    sys.exit(main())
