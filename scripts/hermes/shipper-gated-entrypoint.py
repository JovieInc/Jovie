#!/usr/bin/env python3
"""Launchd entrypoint for codex-issue-shipper — gbrain/grok preflight gates.

Installed to ~/.hermes/scripts/ by bootstrap-air.sh. WorkingDirectory is the
primary ~/Jovie checkout; the TypeScript shipper enforces main@origin/main
before dispatching.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def log(msg: str) -> None:
    print(msg, flush=True)


def hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))


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
    gbrain_bin = os.environ.get("HERMES_GBRAIN_BIN", str(hermes_home() / "bin" / "gbrain"))
    if not Path(gbrain_bin).is_file():
        found = subprocess.run(["bash", "-lc", "command -v gbrain"], capture_output=True, text=True)
        gbrain_bin = found.stdout.strip()
    if not gbrain_bin:
        return False
    try:
        out = subprocess.run(
            ["timeout", "30", gbrain_bin, "doctor", "--fast", "--json"],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
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
    found = subprocess.run(["bash", "-lc", "command -v tsx"], capture_output=True, text=True)
    if found.returncode == 0 and found.stdout.strip():
        return found.stdout.strip()
    return None


def main() -> int:
    if pause_active():
        log("shipper-gated SKIP: pause sentinel active")
        return 0

    if not gbrain_alive():
        log("shipper-gated ABORT: gbrain is dead/unreachable — refusing to ship blind")
        return 3

    if not grok_ready():
        log("shipper-gated ABORT: grok agent selected but grok CLI/auth missing")
        return 4

    tsx = resolve_tsx()
    if not tsx:
        log("shipper-gated ABORT: tsx not found on PATH")
        return 5

    repo_root = os.environ.get("HERMES_JOVIE_REPO", os.getcwd())
    shipper = Path(repo_root) / "scripts" / "hermes" / "jobs" / "codex-issue-shipper.ts"
    if not shipper.is_file():
        log(f"shipper-gated ABORT: missing {shipper}")
        return 6

    log("shipper-gated preflight OK: launching codex-issue-shipper")
    result = subprocess.run([tsx, str(shipper)], cwd=repo_root)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())