"""Restore gem:waste-loop when the capacity SHARE install is missing waste modules.

Root cause (2026-11-02): #23933 wired forecast.py -> waste.run_pass, but
install-systemd-user.sh never copied waste.py / waste_debt.py / waste.json into
~/.local/share/capacity. capacity-collector.timer kept writing forecast.json while
`import waste` failed into stderr every 15 min, so waste-latest.json stayed missing
and doctor raised automation-silent:gem:waste-loop.

This heal rides the lanes tick (auto-updated) and the lanes update event: it
materializes the missing modules from origin/main into the SHARE install and runs
one waste pass so the canonical receipt appears within maxStaleness without SSH.
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path

SHARE = Path.home() / ".local/share/capacity"
STATE = Path.home() / ".local/state/capacity"
# Blobs capacity SHARE must hold for `import waste` + tech-debt observe.
BLOBS = (
    ("scripts/capacity/waste.py", SHARE / "scripts/capacity/waste.py"),
    ("scripts/capacity/waste_debt.py", SHARE / "scripts/capacity/waste_debt.py"),
    ("ops/registry/waste.json", SHARE / "ops/registry/waste.json"),
    # Observe-only debt map; repair stays with ds-cert-loop / component-certificate.
    ("docs/design-system/cert-screens.json", SHARE / "docs/design-system" / "cert-screens.json"),
)


def _git_show(repo: Path, rev: str, rel: str) -> bytes | None:
    try:
        out = subprocess.run(
            ["git", "show", f"{rev}:{rel}"],
            cwd=repo, capture_output=True, timeout=60, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout if out.returncode == 0 and out.stdout else None


def sync_share(repo: Path, rev: str = "origin/main") -> dict:
    """Copy waste-loop modules from `rev` into the capacity SHARE tree."""
    forecast = SHARE / "scripts/capacity/forecast.py"
    if not forecast.is_file():
        return {"status": "no-capacity-install", "share": str(SHARE)}
    written = []
    for rel, dest in BLOBS:
        blob = _git_show(repo, rev, rel)
        if blob is None:
            return {"status": "missing-blob", "path": rel, "rev": rev}
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.is_file() and dest.read_bytes() == blob:
            continue
        dest.write_bytes(blob)
        written.append(rel)
    return {"status": "synced", "written": written, "rev": rev, "share": str(SHARE)}


def _load_waste():
    path = SHARE / "scripts/capacity/waste.py"
    spec = importlib.util.spec_from_file_location("waste_share", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    # REPO resolves from waste.py location -> SHARE root (ops/registry + docs live there).
    sys.modules["waste_share"] = mod
    # waste_debt is imported by waste.py from the same directory.
    sys.path.insert(0, str(SHARE / "scripts/capacity"))
    try:
        spec.loader.exec_module(mod)
    finally:
        try:
            sys.path.remove(str(SHARE / "scripts/capacity"))
        except ValueError:
            pass
    return mod


def run_waste_pass(*, capacity_repo: Path | None = None) -> dict:
    """Execute one publish pass; returns digest timestamp + receipt paths."""
    STATE.mkdir(parents=True, exist_ok=True)
    prev_state = os.environ.get("CAPACITY_STATE")
    prev_repo = os.environ.get("CAPACITY_REPO")
    os.environ["CAPACITY_STATE"] = str(STATE)
    if capacity_repo is not None:
        os.environ["CAPACITY_REPO"] = str(capacity_repo)
    # Drop cached modules so CAPACITY_REPO is re-read at import.
    for name in ("waste_share", "waste_debt", "waste"):
        sys.modules.pop(name, None)
    try:
        waste = _load_waste()
        result = waste.run_pass(publish=True)
    finally:
        if prev_state is None:
            os.environ.pop("CAPACITY_STATE", None)
        else:
            os.environ["CAPACITY_STATE"] = prev_state
        if capacity_repo is not None:
            if prev_repo is None:
                os.environ.pop("CAPACITY_REPO", None)
            else:
                os.environ["CAPACITY_REPO"] = prev_repo
    receipt = STATE / "waste-latest.json"
    digest = result.get("digest") or {}
    return {
        "status": "ok",
        "at": digest.get("at"),
        "receipt": str(receipt),
        "exists": receipt.is_file(),
        "ageS": None if not receipt.is_file() else round(time.time() - receipt.stat().st_mtime),
        "techDebt": [
            {k: r.get(k) for k in ("id", "owner", "status", "value", "why")}
            for r in (result.get("rows") or [])
            if r.get("class") == "tech-debt"
        ],
    }


def heal(host, rev: str = "origin/main", *, force_run: bool = False) -> dict:
    """Sync SHARE modules from git and run a waste pass when the receipt is missing/stale.

    Safe to call every doctor tick: no-ops when capacity is not installed on this host,
    and skips the publish pass when a fresh receipt already exists (unless force_run).
    """
    repo = Path(getattr(host, "repo", None) or os.environ.get("LANES_REPO") or Path.cwd())
    sync = sync_share(repo, rev)
    if sync.get("status") not in ("synced",):
        return sync
    receipt = STATE / "waste-latest.json"
    fresh = False
    if receipt.is_file() and not force_run:
        fresh = (time.time() - receipt.stat().st_mtime) < 50 * 60  # under maxStaleness with margin
    if fresh and not sync.get("written"):
        return {"status": "already-fresh", "ageS": round(time.time() - receipt.stat().st_mtime),
                "sync": sync}
    try:
        # CAPACITY_REPO=live checkout so debt.oversized_files can git-ls-files; cert-screens
        # also resolves from that tree when present (SHARE copy is the fallback).
        ran = run_waste_pass(capacity_repo=repo if (repo / ".git").exists() or (repo / "ops/registry/waste.json").is_file() else None)
    except Exception as error:  # noqa: BLE001 — doctor/update must never die on heal
        return {"status": "run-failed", "error": f"{type(error).__name__}: {error}"[:240],
                "sync": sync}
    ran["sync"] = sync
    return ran


def main(argv: list[str] | None = None) -> int:
    import argparse
    from types import SimpleNamespace
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--repo", default=os.environ.get("LANES_REPO") or str(Path.cwd()))
    ap.add_argument("--rev", default="origin/main")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    out = heal(SimpleNamespace(repo=Path(args.repo)), rev=args.rev, force_run=args.force)
    print(json.dumps(out, indent=1) if args.json else out)
    return 0 if out.get("status") in ("ok", "already-fresh", "synced") else 1


if __name__ == "__main__":
    sys.exit(main())
