"""Split an unbaselined size-500 test. Growth-only logs still sync main.

The scanner lives in size500_scan. This module classifies the company-guards
log and fast-forwards the split onto the PR branch.
"""
from __future__ import annotations

import re
import types
from pathlib import Path

from atomic_state import atomic_write_text
from size500_scan import LIMIT, insert_siblings, line_count, split_test

__all__ = (
    "ACTION", "CLASS", "LIMIT", "CI_FAST", "line_count", "paths", "unbaselined_hit",
    "split_test", "insert_siblings", "bind",
)
ACTION = "split-size-500"
CLASS = "size-500-unbaselined"
CI_FAST = "scripts/ci-fast-lanes.mjs"
_ANNOTATED = re.compile(r"##\[error\]([^\n]+)")
_EXIT = re.compile(r"Process completed with exit code \d+\.?\s*$")
_UNBASELINED = re.compile(r"size-500: (\S+): \d+ lines, over 500 and not baselined\s*$")
_BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,200}")
_COMMIT = "fix(ci): split tests named by an unbaselined size-500 failure"


def _errors(text: object) -> list[str] | None:
    if not isinstance(text, str):
        return None
    return [item.strip() for item in _ANNOTATED.findall(text) if _EXIT.fullmatch(item.strip()) is None]


def paths(text: object) -> list[str]:
    """Test paths from an unbaselined size-500 log, or [] when any other error is present."""
    errors = _errors(text)
    if not errors or any(_UNBASELINED.fullmatch(item) is None for item in errors):
        return []
    found = []
    for item in errors:
        path = _UNBASELINED.fullmatch(item).group(1)
        if path not in found:
            found.append(path)
    return found


def unbaselined_hit(text: object) -> tuple[str, str] | None:
    """Return `(CLASS, ACTION)` when every annotated error is an unbaselined size-500 test."""
    return (CLASS, ACTION) if paths(text) else None


def _safe(worktree: Path, rel: str) -> Path | None:
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return None
    path = (worktree / rel).resolve()
    try:
        path.relative_to(worktree.resolve())
    except ValueError:
        return None
    return path


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
    """Fixer: split every named test, wire ci-fast, syntax-check, fast-forward the branch."""

    def restore(saved):
        for path, previous in saved.items():
            if previous is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write_text(path, previous)

    def fix(host, pr, route, worktree, log, receipt):
        del route
        branch = str((pr or {}).get("headRefName") or "")
        if _BRANCH.fullmatch(branch) is None or ".." in branch.split("/"):
            return None
        named = paths(_log_text(failed_logs, host, pr))
        root = Path(worktree)
        if not named or not root.is_dir():
            return None
        planned = []
        for rel in named:
            target = _safe(root, rel)
            if target is None or not target.is_file():
                return None
            result = split_test(rel, target.read_text(encoding="utf-8"))
            if result is None:
                return None
            planned.append(result)
        ci = _safe(root, CI_FAST)
        if ci is None or not ci.is_file():
            return None
        wired = ci.read_text(encoding="utf-8")
        for result in planned:
            wired = insert_siblings(wired, result["path"], result["siblings"])
            if wired is None:
                return None
        saved = {ci: ci.read_text(encoding="utf-8")}
        changed = [CI_FAST]
        try:
            for result in planned:
                for rel, body in result["files"]:
                    target = _safe(root, rel)
                    if target is None:
                        restore(saved)
                        return None
                    saved.setdefault(target, target.read_text(encoding="utf-8") if target.is_file() else None)
                    atomic_write_text(target, body)
                    changed.append(rel)
            atomic_write_text(ci, wired)
            for rel in changed:
                if not rel.endswith((".mjs", ".js", ".cjs", ".ts", ".tsx")):
                    continue
                if sh(["node", "--check", rel], cwd=root, log=log, timeout=120).returncode:
                    restore(saved)
                    return None
        except OSError:
            restore(saved)
            return None
        if sh(["git", "add", "--", *changed], cwd=root, log=log, timeout=120).returncode:
            return None
        staged = sh(["git", "diff", "--cached", "--name-only"], cwd=root, log=log, timeout=60)
        if staged.returncode or not (staged.stdout or "").strip():
            return None
        if sh(["git", "commit", "-q", "-m", _COMMIT], cwd=root, log=log, timeout=900).returncode:
            return None
        pushed = sh(["git", "push", "-q", "origin", f"HEAD:{branch}"], cwd=root, log=log, timeout=900)
        if pushed.returncode:
            return None
        receipt.update(resolution="split-size-500", splitTests=[item["path"] for item in planned])
        return types.SimpleNamespace(returncode=0)

    return fix
