#!/usr/bin/env python3
"""Codex delegation through the lanes' own seats.

Agents with an uncapped model of their own (Dots, Instinct) still burn the shared Codex Pro accounts
when they delegate to `codex exec`. This wrapper makes that spend visible and bounded: it takes a
`slots/codex.N.lock` seat under the same admission lock, effective-slot cap and host ceiling the
lanes use (so the lanes' census, autoscaler and doctor count it), runs the command while holding the
seat, and appends a `jovie-codex-delegation/v1` row tagged with the agent to `runs/delegations.jsonl`
(`fleet_ledger.py metrics` reports per-agent Codex seconds from it).

    codex_delegate.py --agent dots -- codex exec ...

Exit 75 (EX_TEMPFAIL) when no seat is free: the caller must do the work with its own model or retry
later, never run Codex outside a seat. Seats exist only on the lanes host; remote agents call this
over ssh. Stdlib only.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

EX_TEMPFAIL = 75
PROVIDER = "codex"
SCHEMA = "jovie-codex-delegation/v1"
HERE = Path(__file__).resolve().parent
SEAT = re.compile(r"([a-z][a-z0-9_-]*)\.[0-9]+\.lock")


def seat_limits(state: Path) -> tuple[int, int | None]:
    """(effective codex seats, host ceiling) exactly as the lane runner derives them."""
    sys.path.insert(0, str(HERE))
    import autoscale
    spec = json.loads((HERE / "providers.json").read_text()).get(PROVIDER, {})
    base = int(os.environ.get("LANES_SLOTS_CODEX", spec.get("slots", 1)))
    return autoscale.effective_slots(state, PROVIDER, base), autoscale.host_ceiling(state)


def occupied(state: Path) -> dict[str, int] | None:
    counts: dict[str, int] = {}
    try:
        for path in (state / "slots").iterdir():
            match = SEAT.fullmatch(path.name)
            if not match:
                continue
            with open(path, "a") as handle:
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    counts[match.group(1)] = counts.get(match.group(1), 0) + 1
                else:
                    fcntl.flock(handle, fcntl.LOCK_UN)
    except OSError:
        return None  # unknown occupancy never admits
    return counts


def take_seat(state: Path, limit: int, ceiling: int | None, agent: str):
    """An open, flock-held handle on a free codex seat, or None."""
    slots = state / "slots"
    slots.mkdir(parents=True, exist_ok=True)
    with open(slots / "admission.lock", "a+") as admission:
        fcntl.flock(admission, fcntl.LOCK_EX)
        counts = occupied(state)
        if counts is None or counts.get(PROVIDER, 0) >= limit or (
                ceiling is not None and sum(counts.values()) >= ceiling):
            return None
        for index in range(limit):
            handle = open(slots / f"{PROVIDER}.{index}.lock", "a+")
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                handle.close()
                continue
            handle.seek(0)
            handle.truncate()
            handle.write(json.dumps({"pid": os.getpid(), "host": socket.gethostname(), "agent": agent,
                                     "acquiredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))
            handle.flush()
            return handle
    return None


def delegate(state: Path, agent: str, argv: list[str], limit: int, ceiling: int | None, cwd: str | None = None) -> int:
    seat = take_seat(state, limit, ceiling, agent)
    if seat is None:
        print(json.dumps({"seat": None, "reason": "no-free-codex-seat", "agent": agent}), file=sys.stderr)
        return EX_TEMPFAIL
    started = time.time()
    try:
        code = subprocess.run(argv, cwd=cwd).returncode
    finally:
        ended = time.time()
        runs = state / "runs"
        runs.mkdir(parents=True, exist_ok=True)
        row = {"schema": SCHEMA, "agent": agent, "provider": PROVIDER, "seat": Path(seat.name).name,
               "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
               "endedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ended)),
               "seconds": round(ended - started, 1), "argv0": Path(argv[0]).name}
        with open(runs / "delegations.jsonl", "a") as out:
            out.write(json.dumps({**row, "exit": locals().get("code")}) + "\n")
        fcntl.flock(seat, fcntl.LOCK_UN)
        seat.close()
    return code


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--agent", required=True)
    parser.add_argument("--state", default=os.environ.get("LANES_STATE") or str(Path.home() / ".local/state/jovie-lanes"))
    parser.add_argument("--cwd")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a command is required after --")
    limit, ceiling = seat_limits(Path(args.state))
    return delegate(Path(args.state), args.agent, command, limit, ceiling, args.cwd)


if __name__ == "__main__":
    sys.exit(main())
