#!/usr/bin/env python3
"""Claude Code as a shipping lane: headless `claude -p` on the host's subscription login.

  claude_lane.py run --model ID --prompt-file F [--cwd DIR] [--receipt-file R]
  claude_lane.py status    # JSON: login, quota bank, runs in the current window (HUD, router)
  claude_lane.py health    # exit 0 only on a subscription login that is not banked

Subscription only (Tim, 2026-09-26: no raw model API usage). The run strips every
Anthropic API credential from the child environment, so a stray ANTHROPIC_API_KEY in a
host profile can never turn a lane run into metered API spend, and `health` refuses an
API-key login. Repo and user hooks stay on: no `--bare`, no settings override.
A usage-limit answer banks the lane until the reset Claude reports (default 5h); a burst
rate limit or overload backs off briefly. Both are read from the run's own output.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

STATE = Path(os.environ.get("LANES_STATE", Path.home() / ".local/state/jovie-lanes")) / "claude-quota.json"
# `claude setup-token` output for hosts without an interactive login (reason lane shares it).
TOKEN_ENV = Path(os.environ.get("CLAUDE_LANE_ENV", Path.home() / ".config/jovie-lanes/claude.env"))
MODELS = frozenset({"claude-opus-5-5", "claude-sonnet-5-5"})
API_CREDENTIALS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
                   "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX")
WINDOW_S = int(os.environ.get("CLAUDE_LANE_WINDOW_S", 5 * 3600))
DEFAULT_BANK_S = int(os.environ.get("CLAUDE_LANE_DEFAULT_BANK_S", 5 * 3600))
BURST_BACKOFF_S = int(os.environ.get("CLAUDE_LANE_BURST_BACKOFF_S", 300))
USAGE = re.compile(r"usage limit|hit your (?:usage )?limit|limit reached|out of (?:extra )?usage", re.I)
BURST = re.compile(r"rate.?limit|too many requests|\b429\b|overloaded|\b529\b", re.I)
# "Claude AI usage limit reached|1759530000" (epoch) or "resets 3pm" / "resets at 15:30".
RESET_EPOCH = re.compile(r"limit reached\|(\d{10})")
RESET_CLOCK = re.compile(r"resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", re.I)
NO_CAPACITY_EXIT = 75  # EX_TEMPFAIL: the harness treats it as provider-error and fails over
EVIDENCE_SCHEMA = "jovie-provider-run/v1"


def now_iso(at: float | None = None) -> str:
    return datetime.fromtimestamp(time.time() if at is None else at, timezone.utc).isoformat()


def read_state(path: Path = STATE) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_state(data: dict, path: Path = STATE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, sort_keys=True))
    tmp.replace(path)


def reset_at(text: str, now: float) -> float | None:
    """The reset Claude reported, if any. A clock time already past means tomorrow."""
    epoch = RESET_EPOCH.search(text)
    if epoch:
        return float(epoch.group(1))
    clock = RESET_CLOCK.search(text)
    if not clock:
        return None
    hour, minute, meridiem = int(clock.group(1)), int(clock.group(2) or 0), (clock.group(3) or "").lower()
    if meridiem == "pm" and hour < 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    local = datetime.fromtimestamp(now).astimezone()
    target = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target.timestamp() <= now:
        target += timedelta(days=1)
    return target.timestamp()


def classify_limit(text: str, now: float) -> dict | None:
    """Usage limit banks until its reset; a burst limit or overload backs off briefly."""
    if USAGE.search(text):
        until = reset_at(text, now) or now + DEFAULT_BANK_S
        return {"kind": "usage-limit", "until": until}
    if BURST.search(text):
        return {"kind": "rate-limit", "until": now + BURST_BACKOFF_S}
    return None


def banked(state: dict, now: float) -> dict | None:
    bank = state.get("bank")
    if isinstance(bank, dict) and isinstance(bank.get("until"), (int, float)) and bank["until"] > now:
        return bank
    return None


def window_runs(state: dict, now: float, window_s: int = WINDOW_S) -> list[dict]:
    return [row for row in state.get("runs") or []
            if isinstance(row, dict) and isinstance(row.get("at"), (int, float)) and now - row["at"] < window_s]


def record_run(model: str, exit_code: int, limit: dict | None, now: float, path: Path = STATE,
               usage: dict | None = None) -> dict:
    """Keep only the current window; a new limit replaces the bank, success never clears an
    unexpired usage bank (another concurrent run may have hit it)."""
    state = read_state(path)
    runs = window_runs(state, now) + [{"at": now, "model": model, "exit": exit_code,
                                        **({"limit": limit["kind"]} if limit else {}),
                                        **({"usage": usage} if usage else {})}]
    state["runs"] = runs[-200:]
    if limit:
        current = banked(state, now)
        if not current or limit["until"] > current["until"]:
            state["bank"] = {**limit, "at": now}
    write_state(state, path)
    return state


def child_env(base: dict | None = None, token_file: Path = TOKEN_ENV) -> dict:
    """Subscription auth only: no API credential survives into the child."""
    env = {key: value for key, value in (base if base is not None else os.environ).items()
           if key not in API_CREDENTIALS}
    try:
        for line in token_file.read_text().splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key == "CLAUDE_CODE_OAUTH_TOKEN" and value:
                env[key] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return env


def command(model: str) -> list[str]:
    return ["claude", "-p", "--model", model, "--permission-mode", "bypassPermissions",
            "--output-format", "json", "--no-session-persistence"]


def login(env: dict | None = None) -> dict:
    try:
        result = subprocess.run(["claude", "auth", "status"], capture_output=True, text=True,
                                timeout=30, env=child_env(env))
        data = json.loads(result.stdout or "{}")
        return data if isinstance(data, dict) else {}
    except (OSError, subprocess.SubprocessError, ValueError):
        return {}


def subscription_login(status: dict) -> bool:
    """A claude.ai login (Pro/Max) or a setup-token; never an API key."""
    method = str(status.get("authMethod") or "").lower()
    return status.get("loggedIn") is True and method not in ("", "apikey", "api_key", "api-key")


def status(now: float | None = None, path: Path = STATE, auth: dict | None = None) -> dict:
    now = time.time() if now is None else now
    state = read_state(path)
    auth = login() if auth is None else auth
    runs = window_runs(state, now)
    bank = banked(state, now)
    by_model = {}
    for row in runs:
        by_model[row.get("model")] = by_model.get(row.get("model"), 0) + 1
    return {"schema": "jovie-claude-lane-status/v1", "at": now_iso(now),
            "loggedIn": auth.get("loggedIn") is True, "authMethod": auth.get("authMethod"),
            "subscription": auth.get("subscriptionType"), "subscriptionLogin": subscription_login(auth),
            "banked": bank, "available": subscription_login(auth) and bank is None,
            "windowS": WINDOW_S, "windowRuns": len(runs), "windowRunsByModel": by_model}


def run(model: str, prompt: str, cwd: str | None, receipt_file: str | None, *, now=time.time,
        runner=subprocess.run, path: Path = STATE) -> int:
    if model not in MODELS:
        print(f"claude-lane: model {model!r} is not a lane model ({', '.join(sorted(MODELS))})", file=sys.stderr)
        return 2
    started = now()
    bank = banked(read_state(path), started)
    if bank:
        print(f"claude-lane: {bank['kind']} until {now_iso(bank['until'])}; no run", file=sys.stderr)
        return NO_CAPACITY_EXIT
    result = runner(command(model), input=prompt, capture_output=True, text=True, cwd=cwd, env=child_env())
    output = (result.stdout or "") + "\n" + (result.stderr or "")
    payload = {}
    try:
        payload = json.loads(result.stdout or "{}")
    except ValueError:
        payload = {}
    payload = payload if isinstance(payload, dict) else {}
    text = payload.get("result") if isinstance(payload.get("result"), str) else ""
    # Plain text for the lane log, so the harness's not-shippable detector reads the answer.
    sys.stdout.write((text or result.stdout or "") + "\n")
    sys.stderr.write(result.stderr or "")
    is_error = payload.get("is_error") is True or result.returncode != 0
    limit = classify_limit(output, now()) if is_error else None
    usage = {key: payload[key] for key in ("num_turns", "duration_ms", "total_cost_usd") if key in payload}
    record_run(model, result.returncode, limit, now(), path, usage=usage or None)
    if receipt_file:
        with open(receipt_file, "a") as out:
            out.write(json.dumps({"schema": EVIDENCE_SCHEMA, "event": "claude-run", "provider": "claude",
                                  "model": model, "accountClass": "claude-subscription",
                                  "exit": result.returncode, "limit": limit and limit["kind"],
                                  # Notional list price: the run rides the subscription, not the API.
                                  "notionalCostUsd": usage.get("total_cost_usd"),
                                  "at": now_iso(started)}) + "\n")
    if limit:
        return NO_CAPACITY_EXIT
    return 1 if is_error and result.returncode == 0 else result.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    go = sub.add_parser("run")
    go.add_argument("--model", required=True)
    go.add_argument("--prompt-file", required=True)
    go.add_argument("--cwd")
    go.add_argument("--receipt-file")
    sub.add_parser("status")
    sub.add_parser("health")
    args = parser.parse_args(argv)
    if args.command == "run":
        return run(args.model, Path(args.prompt_file).read_text(), args.cwd, args.receipt_file)
    report = status()
    if args.command == "status":
        print(json.dumps(report, indent=2))
        return 0
    print(f"available: {'true' if report['available'] else 'false'} "
          f"login={report['authMethod']} banked={bool(report['banked'])} windowRuns={report['windowRuns']}")
    return 0 if report["available"] else 1


if __name__ == "__main__":
    sys.exit(main())
