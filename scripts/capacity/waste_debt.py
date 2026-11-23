"""Tech-debt stock collectors for the waste loop (observe only).

Repair stays with existing loops: ds-cert-loop for cert-screens.debt; size ratchets /
human PRs for oversized files. Split from waste.py for the company size-500 budget.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

REPO = Path(os.environ.get("CAPACITY_REPO") or Path(__file__).resolve().parents[2])
CERT_SCREENS = REPO / "docs" / "design-system" / "cert-screens.json"


def _sh(cmd: list[str], timeout: int = 25, cwd: Path | None = None) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout if out.returncode == 0 else None


def col_debt(repo: Path | None = None, sh=_sh) -> dict:
    root = repo or REPO
    out: dict = {}
    files = sh(["git", "ls-files", "*.ts", "*.tsx", "*.mjs", "*.py"], 30, root)
    if files is not None:
        big = 0
        for f in files.splitlines():
            try:
                with open(root / f, "rb") as h:
                    big += sum(1 for _ in h) > 1500
            except OSError:
                pass
        out["oversizedFiles"] = big
    try:
        debt = json.loads((root / "docs" / "design-system" / "cert-screens.json").read_text()).get("debt") or {}
        if isinstance(debt, dict):
            out["certScreenEntries"] = len(debt)
    except (OSError, ValueError, TypeError):
        pass
    return out
