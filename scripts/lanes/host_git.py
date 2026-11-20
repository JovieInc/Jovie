"""Host Git floor probe for lane hosts (JOV-11391).

Repo script tests and review-escapes run `git --no-lazy-fetch`, which needs Git >= 2.44; Gem's
Ubuntu 24.04 ships 2.43, so lane PRs failed preflight there and ended `fix-no-change`. This probe
turns that into a named host gap: `host-git-below-minimum`, raised by integration_probes as
`probe-red:gem:host-git`. Fix: scripts/hostops/install-lane-host-git.sh.
"""
from __future__ import annotations

import re
import subprocess

MIN_GIT = (2, 44)
REASON = "host-git-below-minimum"
FIX = "scripts/hostops/install-lane-host-git.sh"


def parse_version(text: str) -> tuple[int, ...] | None:
    found = re.search(r"git version (\d+)\.(\d+)(?:\.(\d+))?", text or "")
    return tuple(int(part) for part in found.groups() if part is not None) if found else None


def probe(run=subprocess.run, **_) -> dict:
    def git(*args):
        try:
            return run(["git", *args], capture_output=True, text=True, timeout=15)
        except (OSError, subprocess.SubprocessError) as error:
            return type("Failed", (), {"returncode": 127, "stdout": "", "stderr": type(error).__name__})()

    shown = git("--version")
    version = parse_version(shown.stdout) if shown.returncode == 0 else None
    if version is None:
        return {"ok": False, "detail": f"{REASON}: git --version unreadable; run {FIX}"}
    label = ".".join(map(str, version))
    if version[:2] < MIN_GIT:
        return {"ok": False, "detail": f"{REASON}: host Git {label} is below {MIN_GIT[0]}.{MIN_GIT[1]} "
                                       f"(--no-lazy-fetch tests cannot run); run {FIX}"}
    if git("--no-lazy-fetch", "--version").returncode != 0:
        return {"ok": False, "detail": f"{REASON}: Git {label} rejects --no-lazy-fetch; run {FIX}"}
    return {"ok": True, "detail": f"host Git {label} accepts --no-lazy-fetch"}
