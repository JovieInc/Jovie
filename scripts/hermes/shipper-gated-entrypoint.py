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


def hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))


LOG = hermes_home() / "logs" / "launchd" / "cron-codex-issue-shipper.log"


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} shipper-gate {msg}\n"
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(line)
    print(line, end="")


def pause_active() -> bool:
    home = hermes_home()
    if os.environ.get("HERMES_PAUSE") == "1":
        return True
    if (home / "PAUSE").is_file():
        return True
    if (home / "shipping-paused").is_file():
        return True
    return False


def gbrain_alive() -> bool:
    gbrain_bin = os.environ.get("HERMES_GBRAIN_BIN")
    if not gbrain_bin:
        gbrain_bin = shutil.which("gbrain") or str(hermes_home() / "bin" / "gbrain")
    if not Path(gbrain_bin).is_file():
        return False
    try:
        out = subprocess.run(
            [gbrain_bin, "doctor", "--fast", "--json"],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    if out.returncode != 0 or not out.stdout.strip():
        return False
    try:
        status = json.loads(out.stdout).get("status", "")
    except json.JSONDecodeError:
        return False
    return status not in ("", "error", "fail", "failed", "dead")


def grok_ready() -> bool:
    agent = os.environ.get("HERMES_CODEX_SHIPPER_AGENT", "grok").strip().lower()
    if agent != "grok":
        return True
    found = subprocess.run(["bash", "-lc", "command -v grok"], capture_output=True, text=True)
    if found.returncode != 0 or not found.stdout.strip():
        return False
    auth = Path.home() / ".grok" / "auth.json"
    return auth.is_file()


def resolve_tsx() -> str | None:
    node_bin = os.environ.get("NODE_BIN_DIR")
    if node_bin:
        candidate = Path(node_bin) / "tsx"
        if candidate.is_file():
            return str(candidate)
    for candidate in (
        os.environ.get("HERMES_TSX_BIN"),
        shutil.which("tsx"),
        str(hermes_home() / "bin" / "tsx"),
    ):
        if candidate and Path(candidate).is_file():
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
        log("ABORT: grok agent selected but grok CLI/auth missing (grok_gate)")
        return 4

    tsx = resolve_tsx()
    if not tsx:
        log("ABORT: tsx not found on PATH")
        return 5

    repo_root = os.environ.get("HERMES_JOVIE_REPO", os.getcwd())
    shipper = Path(repo_root) / "scripts" / "hermes" / "jobs" / "codex-issue-shipper.ts"
    if not shipper.is_file():
        log(f"ABORT: missing shipper job at {shipper}")
        return 6

    log("preflight OK: launching codex-issue-shipper")
    result = subprocess.run([tsx, str(shipper)], cwd=repo_root)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())