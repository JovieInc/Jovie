"""Strip legacy focus utilities a focus-canon log names, and nothing else.

The canon linter counts class tokens. A comment that only mentions one is not
a hit, and this fixer never edits that comment or the shrink-only baseline.
A token that is not sitting in a class list (``cn('focus-ring-themed', x)``)
fails closed: removing it would leave a broken call. Any marked error besides
the web-source-read wrapper and the process-exit line also fails closed, so a
second red check on the same shard stays with the model.

No import of fix_red_classes: that module imports this one.
"""
from __future__ import annotations

import re
import types
from pathlib import Path

ACTION = "strip-focus-canon"
CLASS = "focus-canon"
_BASELINE = "focus-canon.baseline.json"
_TOKENS = (
    "focus-ring-transparent-offset",
    "focus-ring-themed",
    "input-focus-glow",
    "focus-ring",
)
_TOKEN = re.compile(
    r"(?P<before>^|[\s'\"`{(,])(?P<token>"
    + "|".join(_TOKENS)
    + r")(?=[\s'\"`;})!,]|$)")
_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_LOG_PREFIX = re.compile(
    r"^[^\t]+\t[^\t]+\t(?=\d{4}-\d\d-\d\dT|##\[error\]|::error)")
_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+")
_MARKED = re.compile(r"^(?:##\[error\]|::error(?::|\s+file=))\s?(.*)$")
_WEB_SOURCE = re.compile(
    r"^web-source-read-tests failed \(exit \d+\); read its output above\.$")
_EXIT = re.compile(r"^Process completed with exit code \d+\.?$")
_FOCUS = re.compile(
    r"((?:apps/web|packages/ui)/[\w.@/-]+\.(?:tsx|ts|css)): \d+ ad hoc focus "
    r"style\(s\) \(baseline \d+\)")
_BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,200}")


def mask_comments(source: str, *, line_comments: bool = True) -> str:
    """Blank comments. Length and newlines stay so token indexes still match."""
    out = list(source)
    stack: list[tuple[str, int | None]] = [("code", None)]
    i = 0
    n = len(source)
    while i < n:
        kind, exit_braces = stack[-1]
        current = source[i]
        nxt = source[i + 1] if i + 1 < n else ""
        if kind == "line":
            if current == "\n":
                stack.pop()
            else:
                out[i] = " "
            i += 1
            continue
        if kind == "block":
            if current == "*" and nxt == "/":
                out[i] = out[i + 1] = " "
                stack.pop()
                i += 2
                continue
            if current != "\n":
                out[i] = " "
            i += 1
            continue
        if kind in ("squote", "dquote"):
            if current == "\\":
                i += 2 if i + 1 < n else 1
                continue
            if current == ("'" if kind == "squote" else '"'):
                stack.pop()
            i += 1
            continue
        if kind == "template":
            if current == "\\":
                i += 2 if i + 1 < n else 1
                continue
            if current == "`":
                stack.pop()
                i += 1
                continue
            if current == "$" and nxt == "{":
                stack.append(("code", 1))
                i += 2
                continue
            i += 1
            continue
        if line_comments and current == "/" and nxt == "/":
            out[i] = out[i + 1] = " "
            stack.append(("line", None))
            i += 2
            continue
        if current == "/" and nxt == "*":
            out[i] = out[i + 1] = " "
            stack.append(("block", None))
            i += 2
            continue
        if current == "'":
            stack.append(("squote", None))
            i += 1
            continue
        if current == '"':
            stack.append(("dquote", None))
            i += 1
            continue
        if current == "`":
            stack.append(("template", None))
            i += 1
            continue
        if current == "{" and exit_braces is not None:
            stack[-1] = (kind, exit_braces + 1)
        elif current == "}" and exit_braces is not None:
            exit_braces -= 1
            if exit_braces == 0:
                stack.pop()
            else:
                stack[-1] = (kind, exit_braces)
        i += 1
    return "".join(out)


def strip_source(source: str) -> str | None:
    """Drop safely bounded legacy utilities. None when one is not a class token."""
    masked = mask_comments(source)
    matches = list(_TOKEN.finditer(masked))
    if not matches:
        return source
    pieces: list[str] = []
    cursor = 0
    for match in matches:
        start = match.start("token")
        end = match.end("token")
        before = match.group("before")
        left_ws = bool(before) and before.isspace()
        right_ws = end < len(source) and source[end].isspace()
        if not left_ws and not right_ws:
            return None
        if right_ws:
            pieces.append(source[cursor:start])
            cursor = end + 1
        else:
            pieces.append(source[cursor:match.start("before")])
            cursor = end
    pieces.append(source[cursor:])
    return "".join(pieces)


def _clean(line: str) -> str:
    text = _ANSI.sub("", line)
    text = _LOG_PREFIX.sub("", text, count=1)
    return _TIMESTAMP.sub("", text, count=1)


def _safe_path(path: str) -> bool:
    parts = path.split("/")
    return (
        ".." not in parts
        and "" not in parts
        and not path.startswith("/")
        and not path.endswith(_BASELINE)
        and path.startswith(("apps/web/", "packages/ui/"))
        and path.endswith((".ts", ".tsx", ".css"))
    )


def assess(text: str) -> list[str] | None:
    """Named focus files, or None when the log is empty or not only that failure."""
    found: list[str] = []
    seen: set[str] = set()
    for raw in str(text or "").splitlines():
        clean = _clean(raw)
        marked = _MARKED.match(clean)
        if marked is not None:
            body = marked.group(1)
            if _WEB_SOURCE.match(body) or _EXIT.match(body):
                continue
            return None
        for match in _FOCUS.finditer(clean):
            path = match.group(1)
            if not _safe_path(path):
                return None
            if path not in seen:
                seen.add(path)
                found.append(path)
    return found or None


def paths(text: str) -> list[str]:
    return assess(text) or []


def hit(text: str):
    named = assess(text)
    if not named:
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
    """Fixer for a later lane run. Writes only the named class files, then fast-forwards."""

    def fix(host, pr, route, worktree, log, receipt):
        branch = str((pr or {}).get("headRefName") or "")
        if _BRANCH.fullmatch(branch) is None or ".." in branch.split("/"):
            return None
        text = _log_text(failed_logs, host, pr)
        named = assess(text) if text else None
        if text and named is None:
            return None
        fallback = [
            item for item in ((route or {}).get("files") or [])
            if isinstance(item, str) and _safe_path(item)
        ]
        targets = named or fallback
        if not targets or worktree is None:
            return None
        root = Path(worktree)
        changed: list[str] = []
        for rel in targets:
            if not _safe_path(rel):
                return None
            full = root / rel
            if not full.is_file():
                return None
            original = full.read_text(encoding="utf-8")
            stripped = strip_source(original)
            if stripped is None:
                return None
            if stripped == original:
                continue
            full.write_text(stripped, encoding="utf-8")
            changed.append(rel)
        if not changed:
            return None
        if sh(["git", "add", "--", *changed], cwd=worktree, log=log, timeout=120).returncode:
            return None
        staged = sh(["git", "diff", "--cached", "--name-only"], cwd=worktree, log=log, timeout=60)
        staged_names = sorted(line for line in (staged.stdout or "").splitlines() if line.strip())
        if staged.returncode or staged_names != sorted(changed):
            return None
        if any(name.endswith(_BASELINE) for name in staged_names):
            return None
        if sh(["git", "commit", "-q", "-m",
               "fix(ui): drop legacy focus utilities the canon log named"],
              cwd=worktree, log=log, timeout=900).returncode:
            return None
        if sh(["git", "push", "-q", "origin", f"HEAD:{branch}"],
              cwd=worktree, log=log, timeout=900).returncode:
            return None
        receipt.update(resolution="stripped-focus-canon", strippedFocus=changed)
        return types.SimpleNamespace(returncode=0)

    return fix
