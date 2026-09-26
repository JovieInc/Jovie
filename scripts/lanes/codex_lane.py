#!/usr/bin/env python3
"""Codex as a shipping lane: one run = one leased ChatGPT account, its own CODEX_HOME.

  codex_lane.py run --prompt-file F [--cwd DIR]   # exec codex on an available account
  codex_lane.py status                            # JSON: every account's state (HUD, doctor)
  codex_lane.py health                            # exit 0 when at least one account is usable

Accounts are the ChatGPT-authenticated profiles under ~/.codex-accounts/<name>/auth.json
(the ones with OAuth tokens; API-key and adapter profiles are ignored). Exhaustion is read
from codex's own output ("hit your usage limit", "rate limit", 429) and stored with the
reset time codex reports, or a default cooldown when it reports none, so the lane never
burns a slot on an account that cannot answer and the HUD can show who is banked.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ACCOUNTS_ROOT = Path(os.environ.get("CODEX_ACCOUNTS_ROOT", Path.home() / ".codex-accounts"))
STATE = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "codex-accounts.json"
DEFAULT_COOLDOWN_S = int(os.environ.get("CODEX_DEFAULT_COOLDOWN_S", 5 * 3600))
LIMIT = re.compile(r"usage limit|rate limit|too many requests|\b429\b|quota", re.I)
AUTH = re.compile(r"not logged in|login required|unauthori[sz]ed|invalid.*(token|credential)|\b401\b", re.I)
# "Try again at 3:15 PM", "try again in 2 hours 5 minutes", "resets at 2026-09-27T01:00:00Z"
RESET_AT = re.compile(r"(?:try again|resets?|available)\s+(?:at|on)\s+([0-9T:\-\. ]+(?:AM|PM|Z)?)", re.I)
RESET_IN = re.compile(r"try again in\s+((?:\d+\s*(?:days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|[dhms])\s*)+)", re.I)
NO_ACCOUNT_EXIT = 75  # EX_TEMPFAIL: the lane treats it as provider-error and cools down


def accounts() -> list[str]:
    """ChatGPT-authenticated profiles only; adapters and API-key profiles never lease."""
    found = []
    for auth in sorted(ACCOUNTS_ROOT.glob("*/auth.json")):
        try:
            data = json.loads(auth.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(data.get("tokens"), dict) and data["tokens"].get("access_token"):
            found.append(auth.parent.name)
    return found


def read_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {}


def write_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1, sort_keys=True))
    os.replace(tmp, STATE)


def iso(stamp: float | None) -> str | None:
    try:
        return datetime.fromtimestamp(float(stamp), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OverflowError, OSError):
        return "far-future" if stamp else None


def available(name: str, state: dict, now: float) -> bool:
    return float(state.get(name, {}).get("exhaustedUntil") or 0) <= now


def parse_reset(text: str, now: float) -> float | None:
    """The reset instant codex printed, if any; None means 'unknown, use the default'."""
    match = RESET_IN.search(text)
    if match:
        seconds = 0
        for amount, unit in re.findall(r"(\d+)\s*([a-z]+)", match.group(1), re.I):
            seconds += int(amount) * {"d": 86400, "h": 3600, "m": 60, "s": 1}[unit[0].lower()]
        return now + seconds if seconds else None
    match = RESET_AT.search(text)
    if not match:
        return None
    raw = match.group(1).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
    for fmt in ("%I:%M %p", "%I %p", "%H:%M"):
        try:
            clock = datetime.strptime(raw.upper(), fmt)
        except ValueError:
            continue
        local = datetime.fromtimestamp(now).replace(hour=clock.hour, minute=clock.minute, second=0)
        if local.timestamp() <= now:
            local += timedelta(days=1)
        return local.timestamp()
    return None


def classify(output: str, code: int, now: float) -> tuple[str, float | None]:
    """(kind, exhausted_until): kind is ok | limit | auth | error."""
    tail = output[-20000:]
    if LIMIT.search(tail) and (code != 0 or not tail.strip().endswith("OK")):
        return "limit", parse_reset(tail, now) or now + DEFAULT_COOLDOWN_S
    if code != 0 and AUTH.search(tail):
        return "auth", now + 24 * 3600
    return ("ok" if code == 0 else "error"), None


def lease(name: str):
    """Exclusive per-account flock; released by the kernel if the run dies."""
    locks = STATE.parent / "codex-locks"
    locks.mkdir(parents=True, exist_ok=True)
    handle = open(locks / f"{name}.lock", "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def pick(state: dict, now: float, names: list[str] | None = None):
    """Least-recently-used available account that nobody else has leased right now."""
    names = accounts() if names is None else names
    order = sorted((n for n in names if available(n, state, now)),
                   key=lambda n: float(state.get(n, {}).get("lastUsed") or 0))
    for name in order:
        handle = lease(name)
        if handle is not None:
            return name, handle
    return None, None


def run(args) -> int:
    now = time.time()
    state = read_state()
    name, handle = pick(state, now)
    if name is None:
        print("codex-lane: no available account (all exhausted or leased)", file=sys.stderr)
        return NO_ACCOUNT_EXIT
    home = ACCOUNTS_ROOT / name
    prompt = Path(args.prompt_file).read_text()
    last = Path(args.cwd or ".") / ".codex-last-message.txt"
    cmd = ["codex", "exec", "--ignore-user-config", "--skip-git-repo-check", "--ephemeral",
           "--dangerously-bypass-approvals-and-sandbox", "--color", "never", "-o", str(last)]
    if args.model:
        cmd += ["-m", args.model]
    if args.cwd:
        cmd += ["-C", args.cwd]
    cmd.append("-")
    env = {**os.environ, "CODEX_HOME": str(home)}
    state.setdefault(name, {}).update(lastUsed=now, runs=int(state.get(name, {}).get("runs") or 0) + 1)
    write_state(state)
    print(f"codex-lane: account={name} home={home}", flush=True)
    captured = []
    try:
        proc = subprocess.Popen(cmd, cwd=args.cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True)
        proc.stdin.write(prompt)
        proc.stdin.close()
        for line in proc.stdout:
            captured.append(line)
            sys.stdout.write(line)
            sys.stdout.flush()
        code = proc.wait()
    finally:
        handle.close()
    output = "".join(captured)
    kind, until = classify(output, code, time.time())
    state = read_state()
    entry = state.setdefault(name, {})
    entry.update(lastKind=kind, lastExit=code, lastRunAt=time.time())
    if until:
        entry.update(exhaustedUntil=until, lastError=(LIMIT.search(output) or AUTH.search(output)).group(0)[:80])
    else:
        entry.pop("exhaustedUntil", None)
    write_state(state)
    if kind in ("limit", "auth"):
        print(f"codex-lane: account {name} {kind}; banked until {iso(until)}", file=sys.stderr)
        return NO_ACCOUNT_EXIT if code == 0 else code
    return code


def status(now: float | None = None, names: list[str] | None = None, state: dict | None = None) -> dict:
    now = time.time() if now is None else now
    state = read_state() if state is None else state
    names = accounts() if names is None else names
    rows = {}
    for name in names:
        entry = state.get(name, {})
        until = float(entry.get("exhaustedUntil") or 0)
        rows[name] = {
            "available": until <= now,
            "leased": (STATE.parent / "codex-locks" / f"{name}.lock").exists() and not _lockable(name),
            "exhaustedUntil": iso(until) if until > now else None,
            "resetsInS": max(0, int(until - now)) if until > now else 0,
            "lastKind": entry.get("lastKind"), "lastError": entry.get("lastError"),
            "runs": entry.get("runs", 0),
            "lastUsed": iso(entry.get("lastUsed")),
        }
    banked = [n for n, r in rows.items() if r["available"] and not r["leased"]]
    return {"generatedAt": iso(now),
            "accounts": rows, "available": banked, "count": len(rows)}


def _lockable(name: str) -> bool:
    handle = lease(name)
    if handle is None:
        return False
    handle.close()
    return True


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    go = sub.add_parser("run")
    go.add_argument("--prompt-file", required=True)
    go.add_argument("--cwd")
    go.add_argument("--model", default=os.environ.get("CODEX_LANE_MODEL"))
    sub.add_parser("status")
    sub.add_parser("health")
    args = parser.parse_args(argv)
    if args.command == "run":
        return run(args)
    report = status()
    if args.command == "status":
        print(json.dumps(report, indent=1))
        return 0
    print(f"codex accounts available: {len(report['available'])}/{report['count']}")
    return 0 if report["available"] else 1


if __name__ == "__main__":
    sys.exit(main())
