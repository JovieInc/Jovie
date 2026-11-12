"""Bounded subprocess output for the pinned cloud CLI."""
# api-budget: github-user-graphql 20/hr - planning estimate: 2 carried + 8 new tasks, 2 gh calls each
# Completion bursts and gh HTTP request cost are unmeasured; this is not a runtime limit.
import os
import select
import subprocess
import sys
from pathlib import Path
import time

OUTPUT_CAP_BYTES = 8 * 1024 * 1024

class Bounded:
    """A bounded run result; `truncated` marks output cut at the streaming cap."""
    __slots__ = ("returncode", "stdout", "stderr", "truncated")

    def __init__(self, returncode, stdout, stderr, truncated=False):
        self.returncode, self.stdout, self.stderr, self.truncated = returncode, stdout, stderr, truncated

def stream_run(cmd, *, timeout, cap=OUTPUT_CAP_BYTES):
    """Run one command and bound its output while it streams (never after capture)."""
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as error:
        return Bounded(None, "", f"spawn-{type(error).__name__}")
    out, err = bytearray(), bytearray()
    truncated = False
    deadline = time.monotonic() + timeout
    streams = [proc.stdout, proc.stderr]
    for handle in streams:
        os.set_blocking(handle.fileno(), False)
    try:
        while streams and not truncated:
            if time.monotonic() > deadline:
                truncated = True
                break
            ready, _, _ = select.select(streams, [], [], 0.2)
            for handle in ready:
                chunk = handle.read1(65536)
                if not chunk:
                    streams.remove(handle)
                    continue
                target = out if handle is proc.stdout else err
                room = cap - len(target)
                if len(chunk) > room:
                    target.extend(chunk[:max(room, 0)])
                    truncated = True
                else:
                    target.extend(chunk)
        if truncated:
            proc.kill()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
    finally:
        for handle in (proc.stdout, proc.stderr):
            handle.close()
    return Bounded(proc.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace"), truncated)


def budgeted_gh(args):
    """One GitHub attempt under shared quota admission and the publisher's timeout."""
    scripts = str(Path(__file__).resolve().parents[1])
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from apiclient.gh import default_run, run_gh

    def execute(argv, env):
        return default_run(argv, env, timeout=120)

    result = run_gh(args, priority="repair", run=execute, max_attempts=1, max_wait_ms=0)
    return subprocess.CompletedProcess(args, result["code"], result["stdout"], result["stderr"])
