"""Apply ui-feel tokens on lines a Source Validation log reports.

The changed-line gate prints a block between two markers. Only that block is
read. A missing marker, an escaping path, a dynamic className, or an unknown
line fails closed and writes nothing.
"""
from __future__ import annotations

import re
from pathlib import Path

import fix_red_rewrite
from atomic_state import atomic_write_text
from fix_red_source_edits import balance_heading_line

MARKER = "[lint:ui-feel] new violations on lines this change adds:"
END = "[lint:ui-feel] see eslint-rules"
_HIT = re.compile(
    r"(?P<path>(?:apps/web/)?[\w./()\[\]@+-]+\.(?:tsx|jsx|ts|js)):(?P<line>\d+)[ \t]+"
    r"(?P<kind>missingTabularNums|headingNeedsBalance)\b")
_CLASS = re.compile(r"""className=(['"])(.*?)\1""")
_TOKENS = {
    "missingTabularNums": ("tabular-nums", ("tabular-nums", "font-variant-numeric")),
}


def _block(log: str) -> str | None:
    start = str(log or "").find(MARKER)
    if start < 0:
        return None
    end = log.find(END, start + len(MARKER))
    if end < 0:
        return None
    return log[start + len(MARKER):end]


def _normalize(raw: str) -> str | None:
    raw = raw.strip().replace("\\", "/")
    if raw.startswith("apps/web/"):
        rel = raw
    elif raw.startswith("/") or raw.startswith("apps/"):
        return None
    else:
        rel = "apps/web/" + raw
    if ".." in Path(rel).parts or not rel.startswith("apps/web/"):
        return None
    return rel


def hits(log: str) -> list[tuple[str, int, str]] | None:
    """Reported (repo path, 1-based line, kind). None when a path escapes."""
    block = _block(log)
    if block is None:
        return []
    found, seen = [], set()
    for match in _HIT.finditer(block):
        rel = _normalize(match.group("path"))
        if rel is None:
            return None
        item = (rel, int(match.group("line")), match.group("kind"))
        if item not in seen:
            seen.add(item)
            found.append(item)
    return found


def _has(parts: list[str], token: str) -> bool:
    if token.endswith("-"):
        return any(part.startswith(token) for part in parts)
    return token in parts


def insert_token(line: str, kind: str) -> str | None:
    """Return the line with the kind's token, the same line when already exempt, or None."""
    if kind == "headingNeedsBalance":
        return balance_heading_line(line)
    spec = _TOKENS.get(kind)
    if spec is None or "className={" in line:
        return None
    match = _CLASS.search(line)
    if match is None:
        return None
    value = match.group(2)
    token, exempt = spec
    if any(_has(value.split(), item) for item in exempt):
        return line
    updated = f"{value} {token}" if value else token
    return line[:match.start(2)] + updated + line[match.end(2):]


def _split_ending(line: str) -> tuple[str, str]:
    if line.endswith("\r\n"):
        return line[:-2], "\r\n"
    if line.endswith("\n"):
        return line[:-1], "\n"
    return line, ""


def _safe(root: Path, rel: str) -> Path | None:
    path = (root / rel).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return None
    return path if path.is_file() else None


def apply(root: Path, log: str) -> list[str]:
    """Validate every edit before replacing files atomically, one file at a time."""
    rows = hits(log)
    if not rows:
        return []
    root = root.resolve()
    grouped: dict[str, list[tuple[int, str]]] = {}
    for rel, line_no, kind in rows:
        grouped.setdefault(rel, []).append((line_no, kind))
    staged: list[tuple[Path, str, str]] = []
    for rel, edits in grouped.items():
        path = _safe(root, rel)
        if path is None:
            return []
        original = path.read_text(encoding="utf-8")
        lines = original.splitlines(keepends=True)
        for line_no, kind in edits:
            index = line_no - 1
            if index < 0 or index >= len(lines):
                return []
            body, ending = _split_ending(lines[index])
            updated = insert_token(body, kind)
            if updated is None:
                return []
            lines[index] = updated + ending
        staged.append((path, original, "".join(lines)))
    changed = []
    for path, original, text in staged:
        if text == original:
            continue
        atomic_write_text(path, text, encoding="utf-8")
        changed.append(path.relative_to(root).as_posix())
    return changed


def publish(sh, failed_logs, host, pr, worktree, log, receipt):
    """Commit the reported tokens through the shared rewrite tail."""
    text = "\n".join((failed_logs(host, pr) or {}).values())
    return fix_red_rewrite.rewrite_commit_push(
        sh, pr, worktree, log, receipt, ("apps/web",),
        lambda root, _diff: apply(root, text),
        "fix(ui): add tabular-nums and heading balance on reported lines",
        "ui-feel", "uiFeelFiles")
