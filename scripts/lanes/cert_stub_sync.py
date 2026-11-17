"""Route a certification TODO stub to sync-main when origin/main already filled it.

Company guards and public-app certification fail while a branch is BLOCKED, so the
BEHIND sync never runs, and a model is sent to rewrite a config main already
completed. Sync only when every ##[error] stub path is no longer a TODO string on
origin/main. A warning, a stub main still has, or a git/JSON failure stays with
the model. One sync per head, then the model if the sync does not clear the red.
"""
from __future__ import annotations

import json
import re
import subprocess

CONFIG = "canon/certification/{app}.json"
_APP = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_TODO = re.compile(r"\bTODO\b")
_STUB = re.compile(
    r"##\[error\](?:public-app-certification: )?"
    r"(?P<app>[a-z0-9]+(?:-[a-z0-9]+)*): "
    r"(?P<path>[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]+\]|\.[A-Za-z_][A-Za-z0-9_]*)*): "
    r"still a TODO stub"
)
_MISSING = object()
_BAD = object()


def findings(text: object) -> list[tuple[str, str]]:
    """Unique `(app, field path)` pairs named by an error annotation."""
    if not isinstance(text, str):
        return []
    seen: set[tuple[str, str]] = set()
    found = []
    for match in _STUB.finditer(text):
        item = (match.group("app"), match.group("path"))
        if item not in seen:
            seen.add(item)
            found.append(item)
    return found


def config_paths(text: object) -> list[str]:
    """Certification configs named by the error annotations."""
    return sorted({CONFIG.format(app=app) for app, _path in findings(text)})


def main_clear(found, show=None, repo=None) -> bool:
    """True when origin/main no longer stores a TODO at any named field.

    `show(app)` injects config text in tests. A missing field is clear because
    the schema moved. A git failure, bad JSON, a leftover TODO, or a path
    outside the certification configs fails closed.
    """
    if not isinstance(found, (list, tuple)) or not found:
        return False
    by_app: dict[str, list[str]] = {}
    for item in found:
        if not isinstance(item, tuple) or len(item) != 2:
            return False
        app, path = item
        if not isinstance(app, str) or _APP.fullmatch(app) is None or not isinstance(path, str):
            return False
        by_app.setdefault(app, []).append(path)
    for app, paths in by_app.items():
        text = show(app) if show is not None else _config_text(repo, app)
        if not isinstance(text, str):
            return False
        try:
            document = json.loads(text)
        except json.JSONDecodeError:
            return False
        if not isinstance(document, dict):
            return False
        for path in paths:
            value = _lookup(document, path)
            if value is _BAD or (isinstance(value, str) and _TODO.search(value)):
                return False
    return True


def hit(text: object) -> tuple[str, str] | None:
    """`("cert-todo-stub", action)` or None. Checked before other signatures."""
    found = findings(text)
    if not found:
        return None
    action = "sync-main" if main_clear(found) else "agent"
    return ("cert-todo-stub", action)


def _config_text(repo, app: str) -> str | None:
    try:
        shown = subprocess.run(
            ["git", "show", f"origin/main:{CONFIG.format(app=app)}"],
            cwd=repo, check=False, capture_output=True, text=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if shown.returncode != 0:
        return None
    return shown.stdout


def _lookup(node, path: str):
    index = 0
    while index < len(path):
        key = re.match(r"[A-Za-z_][A-Za-z0-9_]*", path[index:])
        if key is None:
            return _BAD
        name = key.group(0)
        if not isinstance(node, dict) or name not in node:
            return _MISSING
        node = node[name]
        index += len(name)
        while path.startswith("[", index):
            end = path.find("]", index)
            if end < 0 or not path[index + 1:end].isdigit():
                return _BAD
            slot = int(path[index + 1:end])
            if not isinstance(node, list) or slot >= len(node):
                return _MISSING
            node = node[slot]
            index = end + 1
        if index == len(path):
            return node
        if not path.startswith(".", index):
            return _BAD
        index += 1
    return _BAD
