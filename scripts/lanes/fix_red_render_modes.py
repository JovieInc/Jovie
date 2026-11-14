"""Admit missing allowed dynamic routes the render-mode ratchet already named.

The node writer owns the snapshot. This matcher accepts a log whose marked
errors are only those admissions, plus the process-exit line. Any other
marked error returns None so the model still sees the log. No import of
fix_red_classes (that module imports this one) and no node import at load.
"""
from __future__ import annotations

import re
import tempfile
import types
from pathlib import Path

ACTION = "admit-render-mode"
CLASS = "render-mode-admission"
SNAPSHOT = "apps/web/scripts/route-render-modes.json"

_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_LOG_PREFIX = re.compile(
    r"^[^\t]+\t[^\t]+\t(?=\d{4}-\d\d-\d\dT|##\[error\]|::error::)")
_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+")
_MARKED = re.compile(r"^(?:##\[error\]|::error::)\s?(.*)$")
_EXIT = re.compile(r"^Process completed with exit code \d+\.?$")
_MISS = re.compile(
    r'^(/\S+) \(dynamic\) has no entry in apps/web/scripts/route-render-modes\.json '
    r'\(new routes fail closed\)\. Add "(/\S+)": "dynamic"')
_BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,200}")


def _marked(line: str) -> str | None:
    clean = _TIMESTAMP.sub("", _LOG_PREFIX.sub("", _ANSI.sub("", line), count=1))
    match = _MARKED.match(clean)
    return match.group(1) if match else None


def routes_in(text: str) -> list[str]:
    """Named dynamic misses, or [] when the log is empty or not only those misses."""
    found: list[str] = []
    seen: set[str] = set()
    for raw in str(text or "").splitlines():
        body = _marked(raw)
        if body is None or _EXIT.match(body):
            continue
        match = _MISS.match(body)
        if not match or match.group(1) != match.group(2):
            return []
        if match.group(1) not in seen:
            seen.add(match.group(1))
            found.append(match.group(1))
    return found


def hit(text: str):
    routes = routes_in(text)
    if not routes:
        return None
    return (CLASS, ACTION)


def _log_text(failed_logs, host, pr) -> str:
    if isinstance(failed_logs, dict):
        values = failed_logs.values()
    elif callable(failed_logs) and host is not None and isinstance(pr, dict):
        got = failed_logs(host, pr)
        values = got.values() if isinstance(got, dict) else ()
    else:
        values = ()
    return "\n".join(value for value in values if isinstance(value, str))


def bind(sh, failed_logs):
    """Fixer: re-check the log, run the node admitter, fast-forward the branch."""

    def fix(host, pr, route, worktree, log, receipt):
        branch = str((pr or {}).get("headRefName") or "")
        if _BRANCH.fullmatch(branch) is None or ".." in branch.split("/"):
            return None
        text = _log_text(failed_logs, host, pr)
        named = routes_in(text) if text else []
        if text and not named:
            return None
        fallback = [
            item for item in ((route or {}).get("files") or [])
            if isinstance(item, str) and item.startswith("/") and ".." not in item.split("/")
        ]
        routes = named or fallback
        if not routes:
            return None
        path = None
        try:
            argv = ["node", "apps/web/scripts/route-render-modes.mjs", "--snapshot", SNAPSHOT]
            if named:
                handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
                path = handle.name
                handle.write(text)
                handle.close()
                argv.extend(["--admit-from-log", path])
            else:
                for item in routes:
                    argv.extend(["--admit-dynamic", item])
            probe = sh(argv, cwd=worktree, log=log, timeout=120)
            if getattr(probe, "returncode", 1):
                return None
        finally:
            if path:
                Path(path).unlink(missing_ok=True)
        if sh(["git", "add", "--", SNAPSHOT], cwd=worktree, log=log, timeout=120).returncode:
            return None
        staged = sh(["git", "diff", "--cached", "--name-only"], cwd=worktree, log=log, timeout=60)
        if staged.returncode or (staged.stdout or "").strip() != SNAPSHOT:
            return None
        if sh(["git", "commit", "-q", "-m", "fix(perf): admit dynamic routes the render-mode check named"],
              cwd=worktree, log=log, timeout=900).returncode:
            return None
        if sh(["git", "push", "-q", "origin", f"HEAD:{branch}"],
              cwd=worktree, log=log, timeout=900).returncode:
            return None
        receipt.update(resolution="admitted-render-mode", admittedRoutes=routes)
        return types.SimpleNamespace(returncode=0)

    return fix
