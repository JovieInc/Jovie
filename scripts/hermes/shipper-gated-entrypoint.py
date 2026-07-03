#!/usr/bin/env python3
"""Gated launchd entrypoint for the codex issue shipper.

Checks pause, gbrain reachability, and grok auth before exec'ing the TS job.
Checkout freshness is enforced inside codex-issue-shipper.ts (fail-closed).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
JOVIE_REPO = Path.cwd()
LOG = HERMES_HOME / "logs" / "launchd" / "cron-codex-issue-shipper.log"


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} shipper-gate {msg}\n"
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(line)
    print(line, end="")


def pause_active() -> bool:
    if os.environ.get("HERMES_PAUSE") == "1":
        return True
    for name in ("PAUSE", "shipping-paused"):
        if (HERMES_HOME / name).exists():
            return True
    return False


def gbrain_alive() -> bool:
    gbrain_bin = os.environ.get("HERMES_GBRAIN_BIN")
    if not gbrain_bin:
        gbrain_bin = shutil.which("gbrain") or str(HERMES_HOME / "bin" / "gbrain")
    if not Path(gbrain_bin).exists():
        return False
    try:
        out = subprocess.check_output(
            [gbrain_bin, "doctor", "--fast", "--json"],
            stderr=subprocess.DEVNULL,
            timeout=30,
            text=True,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False
    try:
        status = json.loads(out).get("status", "")
    except json.JSONDecodeError:
        return False
    return status not in ("", "error", "fail", "failed", "dead")


def grok_ready() -> bool:
    return (Path.home() / ".grok" / "auth.json").is_file()


def resolve_tsx() -> str | None:
    for candidate in (
        os.environ.get("HERMES_TSX_BIN"),
        shutil.which("tsx"),
        str(HERMES_HOME / "bin" / "tsx"),
    ):
        if candidate and Path(candidate).exists():
            return candidate
    return None


def main() -> int:
    if pause_active():
        log("SKIP: pause sentinel active")
        return 0

    if not gbrain_alive():
        log("ABORT: gbrain dead/unreachable (gbrain_gate)")
        return 3

    if not grok_ready():
        log("ABORT: grok auth missing (~/.grok/auth.json) (grok_gate)")
        return 4

    tsx = resolve_tsx()
    job = JOVIE_REPO / "scripts" / "hermes" / "jobs" / "codex-issue-shipper.ts"
    if not tsx:
        log("ABORT: tsx binary not found")
        return 2
    if not job.is_file():
        log(f"ABORT: missing shipper job at {job}")
        return 2

    log("preflight OK: launching codex-issue-shipper")
    return subprocess.call([tsx, str(job)], cwd=JOVIE_REPO)


if __name__ == "__main__":
    sys.exit(main())