"""Fair share of a provider seat between Jovie and extra repository bindings (e.g. LYB).

2026-11-07: with one codex seat, every turn served the LogYourBody binding first and re-executed
into it again, so pending Jovie work never ran (28 LYB repairs, 0 Jovie runs). While Jovie work is
pending, a turn that served a binding is followed by a Jovie turn; with nothing pending on the
Jovie side the binding keeps every turn.
"""
from __future__ import annotations

from pathlib import Path


def _marker(state: Path, name: str) -> Path:
    return Path(state) / "binding-turns" / name


def yields(state: Path, name: str, jovie_pending: bool) -> bool:
    """True when this provider's last turn served a binding and Jovie work is waiting."""
    return bool(jovie_pending) and _marker(state, name).exists()


def record(state: Path, name: str, served_binding: bool) -> None:
    """Remember whether this turn served a binding. Best-effort: never blocks a turn."""
    marker = _marker(state, name)
    try:
        if served_binding:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.touch()
        else:
            marker.unlink(missing_ok=True)
    except OSError:
        pass
