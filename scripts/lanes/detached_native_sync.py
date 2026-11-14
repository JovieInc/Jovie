"""Route a detached native consumer to sync-main when origin/main already lists it.

A pull_request unit shard tests the merge of main. The branch is BLOCKED, so the
BEHIND sync never runs, and a model is sent to register a Swift consumer main
already owns. Sync only when origin/main's ownership registry quotes every path
in the failure. A pull request that added the call itself stays with the model.
One sync per head, then the model if the sync does not clear the red.
"""
from __future__ import annotations

import re
import subprocess

REGISTRY = "apps/web/data/designSystem/uiOwnershipRegistry.ts"
_SWIFT = r"apps/ios/Jovie/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.swift"
_PATH = re.compile(rf"\A{_SWIFT}\Z")
DETACHED_NATIVE = re.compile(
    r'"code": "detached-native-consumer"[\s\S]{0,240}?'
    rf'"id": "[A-Za-z_][A-Za-z0-9_]*:({_SWIFT})"')
_QUOTED = re.compile(rf"""['"]({_SWIFT})['"]""")


def paths(text: object) -> list[str]:
    """Sorted consumer paths named by a detached-native-consumer assertion."""
    if not isinstance(text, str):
        return []
    return sorted(set(DETACHED_NATIVE.findall(text)))


def quoted_consumers(registry_text: str) -> set[str]:
    """Swift paths that appear as quoted literals in an ownership registry."""
    if not isinstance(registry_text, str):
        return set()
    return {match.group(1) for match in _QUOTED.finditer(registry_text)}


def main_owns(found: list[str], show=None, repo=None) -> bool:
    """True when origin/main's registry quotes every consumer path.

    `show` injects registry text in tests. A git failure, a path outside the
    Swift tree, or a missing quote fails closed so the model keeps the red.
    """
    if not isinstance(found, (list, tuple)) or not found:
        return False
    if any(not isinstance(path, str) or _PATH.fullmatch(path) is None for path in found):
        return False
    if show is None:
        text = _registry_text(repo)
    else:
        text = show if isinstance(show, str) else None
    if text is None:
        return False
    owned = quoted_consumers(text)
    return all(path in owned for path in found)


def hit(text: object) -> tuple[str, str] | None:
    """`("detached-native-consumer", action)` or None. Checked before other signatures."""
    found = paths(text)
    if not found:
        return None
    action = "sync-main" if main_owns(found) else "agent"
    return ("detached-native-consumer", action)


def _registry_text(repo) -> str | None:
    try:
        shown = subprocess.run(
            ["git", "show", f"origin/main:{REGISTRY}"],
            cwd=repo, check=False, capture_output=True, text=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if shown.returncode != 0:
        return None
    return shown.stdout
