#!/usr/bin/env python3
"""Live capacity reads for the registry, on the lanes host (metadata only, no tokens).

Writes `capacity-live.json` in the lanes state dir; capacity_registry.py and the Ovie view take a
live row over the registry snapshot only when it is newer. Sources:
- Codex: the lanes ledger `codex-accounts.json` (capacityLease from account/rateLimits/read), joined
  to registry accounts by the 12-hex email hash. Fixture rows (observed before 2001) are ignored.
- Grok: the Grok TUI `/usage` "Usage limit" tab through tmux. The bar is USED percent (it rose
  62 to 63 after model calls on 2026-10-25), so the reader records usedPercent.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capacity_registry  # noqa: E402

INTERVAL_S = 900
GROK_BIN = Path.home() / ".local/bin/grok"
MIN_EPOCH = 978307200  # 2001-01-01: earlier observations are test-fixture residue
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def read_codex(registry: dict, ledger: dict) -> dict:
    """{'openai-codex/<account>': {'quota': {...}}} for accounts with a real, fresh read."""
    by_hash = {}
    for provider in registry.get("providers", []):
        for account in provider.get("accounts", []):
            if account.get("emailSha256"):
                by_hash[account["emailSha256"]] = (provider["id"], account["id"])
    out = {}
    for name, row in ledger.items():
        if name.startswith("_") or not isinstance(row, dict):
            continue
        digest = str((row.get("subscriptionBinding") or {}).get("emailSha256") or "")[:12]
        lease = row.get("capacityLease") or {}
        capacity = (lease.get("sources") or {}).get("capacity") or {}
        primary = (lease.get("usableCapacityRemaining") or {}).get("primary") or {}
        observed = capacity_registry._epoch(capacity.get("observedAt"))
        if digest not in by_hash or observed is None or observed < MIN_EPOCH:
            continue
        if not isinstance(primary.get("remainingPercent"), (int, float)) or not primary.get("resetsAt"):
            continue
        provider_id, account_id = by_hash[digest]
        out[f"{provider_id}/{account_id}"] = {"quota": {
            "remainingPercent": primary["remainingPercent"], "resetsAt": _iso(primary["resetsAt"]),
            "windowMins": primary.get("windowDurationMins"), "observedAt": capacity["observedAt"],
            "source": "gem codex-accounts.json account/rateLimits/read", "live": "codex-ledger"}}
    return out


def parse_grok_usage(text: str, now: float) -> dict | None:
    """Weekly limit percent (USED) and reset time from the /usage screen; None when absent."""
    percent = re.search(r"Weekly limit[^\n]*\n(?:[^\n]*\n){0,3}?[^\n]*?[█░]+\s+(\d{1,3})%", text)
    reset = re.search(r"Resets:\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})", text)
    if not percent or not reset or reset.group(1) not in MONTHS:
        return None
    month = MONTHS.index(reset.group(1)) + 1
    year = datetime.fromtimestamp(now, timezone.utc).year
    when = datetime(year, month, int(reset.group(2)), int(reset.group(3)), int(reset.group(4)), tzinfo=timezone.utc)
    if when.timestamp() < now - 86400:  # a January reset read in December
        when = when.replace(year=year + 1)
    return {"usedPercent": int(percent.group(1)), "resetsAt": _iso(when.timestamp())}


def read_grok(now: float, run=subprocess.run, sleep=time.sleep, binary: Path = GROK_BIN) -> dict | None:
    """Open the Grok TUI in a detached tmux session, run /usage, parse, always clean up. No model call."""
    session = f"capacity-grok-{uuid.uuid4().hex[:8]}"
    tmux = lambda *args: run(["tmux", *args], capture_output=True, text=True, timeout=15)  # noqa: E731
    try:
        if tmux("new-session", "-d", "-s", session, "-x", "140", "-y", "50", str(binary)).returncode != 0:
            return None
        screen = ""
        for _ in range(20):
            sleep(1)
            screen = tmux("capture-pane", "-t", session, "-p").stdout
            if "❯" in screen:
                break
        else:
            return None
        tmux("send-keys", "-t", session, "/usage", "Enter")
        for _ in range(10):
            sleep(1)
            screen = tmux("capture-pane", "-t", session, "-p").stdout
            parsed = parse_grok_usage(screen, now)
            if parsed:
                return {"quota": {**parsed, "windowMins": 10080, "observedAt": _iso(now),
                                  "source": "gem grok TUI /usage (Usage limit tab, used percent)", "live": "grok-usage"}}
        return None
    except (OSError, subprocess.SubprocessError):
        return None
    finally:
        try:
            tmux("kill-session", "-t", session)
        except (OSError, subprocess.SubprocessError):
            pass


def collect(registry: dict, ledger: dict, now: float, grok=read_grok) -> dict:
    accounts = read_codex(registry, ledger)
    grok_row = grok(now)
    if grok_row:
        accounts["xai-grok/supergrok-heavy"] = grok_row
    return {"schema": "jovie.capacity-live/v1", "generatedAt": _iso(now), "accounts": accounts}


def tick(state_dir: Path, now: float | None = None, registry: dict | None = None, grok=read_grok,
         force: bool = False) -> dict:
    if os.environ.get("LANES_SELFTEST") or os.environ.get("LANES_EXECUTION_BACKEND") == "local-test":
        return {"status": "selftest-skipped"}
    now = time.time() if now is None else now
    path = Path(state_dir) / capacity_registry.LIVE_FILE
    try:
        previous = json.loads(path.read_text())
        if not force and now - (capacity_registry._epoch(previous.get("generatedAt")) or 0) < INTERVAL_S:
            return {"status": "current", "generatedAt": previous.get("generatedAt")}
    except (OSError, ValueError):
        pass
    registry = capacity_registry.load() if registry is None else registry
    if not registry:
        return {"status": "registry-missing"}
    try:
        ledger = json.loads((Path(state_dir) / "codex-accounts.json").read_text())
    except (OSError, ValueError):
        ledger = {}
    result = collect(registry, ledger if isinstance(ledger, dict) else {}, now, grok)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True))
    os.replace(temporary, path)
    return {"status": "written", "accounts": sorted(result["accounts"])}


if __name__ == "__main__":
    state = Path(os.environ.get("LANES_STATE") or Path.home() / ".local/state/jovie-lanes")
    print(json.dumps(tick(state, force="--force" in sys.argv)))
