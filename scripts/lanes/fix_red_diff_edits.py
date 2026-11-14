"""Diff-driven line rewrites for the fix-red no-model routes.

Scans the added lines of a unified diff and rewrites the still-matching lines
on disk: snap added conservative spacing utilities onto the 4px grid, strip
added legacy Cache Components exports, and balance added heading tags.
Split from fix_red_source_edits.py so that module stays within the 500-line
company budget. Callers still reach every pass through fix_red_source_edits.
"""
from __future__ import annotations

import re
from pathlib import Path

from atomic_state import atomic_write_text

LEGACY_CACHE_EXPORT = re.compile(
    r"^\s*export const (?:dynamic|fetchCache|revalidate)\s*=")
CACHE_SCAN_PREFIXES = ("apps/web/app/", "apps/web/lib/")
CACHE_SOURCE = re.compile(r"\.(?:cjs|js|json|mjs|ts|tsx)$")
# Same skip as stackAdoptionCoverage: tests and stories are not legacy surfaces.
CACHE_SKIP = re.compile(r"\.(?:stories|test)\.[^.]+$")
# Same utility shape as apps/web/scripts/optical-grid-scanners.ts, limited to the
# armed conservative steps. Longer prefixes are not required: `p` fails closed on
# `px-2.5` because the step hyphen does not follow `p`.
CONSERVATIVE_UTILITY = re.compile(
    r"(?<![\w-])(?P<sign>-)?(?P<prefix>p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|"
    r"gap|gap-x|gap-y|space-x|space-y)-(?P<step>2\.5|3\.5)(?![\w./%])")
# 10px and 14px sit halfway between canonical seams. Tie-break toward the lower
# seam (8px / 12px) so the rewrite is deterministic and stays on the 4px grid.
SNAP_STEP = {"2.5": "2", "3.5": "3"}
SPACING_SCAN_PREFIXES = ("apps/web/app/", "apps/web/components/", "packages/ui/")
NON_PRODUCT_SPACING = re.compile(r"\.(?:test|spec|stories)\.[tj]sx?$")


def _snap_spacing_line(line: str) -> str:
    def repl(match: re.Match) -> str:
        sign = match.group("sign") or ""
        return f"{sign}{match.group('prefix')}-{SNAP_STEP[match.group('step')]}"
    return CONSERVATIVE_UTILITY.sub(repl, line)


def _spacing_product_path(path: str) -> bool:
    """Product TS/TSX under the spacing ratchet's scan roots. Tests and stories are debt-free."""
    rel = str(path or "").replace("\\", "/")
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if not rel.endswith((".ts", ".tsx")) or NON_PRODUCT_SPACING.search(rel):
        return False
    return rel.startswith(SPACING_SCAN_PREFIXES)


def iter_added_lines(diff: str):
    """Yield (path, new 1-based line, added text) for each added unified-diff line."""
    rel = ""
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk or raw.startswith("\\"):
            continue
        if raw.startswith("+"):
            yield rel, new_line, raw[1:]
            new_line += 1
        elif not raw.startswith("-"):
            new_line += 1


def _added_spacing_edits(diff: str) -> dict[str, dict[int, tuple[str, str]]]:
    """Map eligible file -> {new 1-based line: (added text, snapped text)} for utilities the diff adds."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    for rel, new_line, added in iter_added_lines(diff):
        snapped = _snap_spacing_line(added)
        if _spacing_product_path(rel) and snapped != added:
            edits.setdefault(rel, {})[new_line] = (added, snapped)
    return edits


def _rewrite_added_lines(root: Path, edits: dict[str, dict[int, tuple[str, str]]]) -> list[str]:
    """Replace added lines that still match. A stale line is left alone."""
    changed = []
    root = Path(root)
    for rel, lines in edits.items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        dirty = False
        for lineno, (added, rewritten) in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current != added:
                continue
            file_lines[index] = rewritten + ending
            dirty = True
        if not dirty:
            continue
        try:
            atomic_write_text(path, "".join(file_lines))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)


def snap_added_conservative_spacing(root: Path, diff: str) -> list[str]:
    """Snap added 2.5/3.5 utilities to 2/3. Grandfathered and stale lines stay."""
    return _rewrite_added_lines(root, _added_spacing_edits(diff))


def _legacy_cache_path(path: str) -> bool:
    """Product source under the Cache Components scan. Tests and stories are not counted."""
    rel = str(path or "").replace("\\", "/")
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if not CACHE_SOURCE.search(rel) or CACHE_SKIP.search(rel):
        return False
    return rel.startswith(CACHE_SCAN_PREFIXES)


def _added_legacy_cache_exports(diff: str) -> dict[str, dict[int, str]]:
    """Map eligible file -> {new 1-based line: added text} for cache exports the diff adds."""
    edits: dict[str, dict[int, str]] = {}
    for rel, new_line, added in iter_added_lines(diff):
        if _legacy_cache_path(rel) and LEGACY_CACHE_EXPORT.match(added):
            edits.setdefault(rel, {})[new_line] = added
    return edits


_HEADING_TAG = re.compile(r"<h[1-6]\b[^>]*>", re.I)
_BALANCE_EXEMPT = re.compile(
    r"\b(?:text-balance|text-pretty|text-wrap|text-nowrap|truncate|sr-only|line-clamp-)\w*|\bwhitespace-nowrap\b")
_QUOTED_CLASS = re.compile(r"""className=(['"])(.*?)\1""")
_TEMPLATE_CLASS = re.compile(r"className=\{`([^`]*)`\}")


def _heading_product_path(path: str) -> bool:
    rel = str(path or "").replace("\\", "/")
    if not rel.endswith(".tsx") or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if re.search(r"\.(?:test|spec|stories)\.tsx$", rel):
        return False
    return rel.startswith(("apps/web/", "packages/ui/"))


def _balance_tag(tag: str) -> str:
    if "textWrap" in tag:
        return tag
    quoted = _QUOTED_CLASS.search(tag)
    if quoted:
        body = quoted.group(2)
        if _BALANCE_EXEMPT.search(body):
            return tag
        quote = quoted.group(1)
        insert = "text-balance" if body == "" else f"text-balance {body}"
        return f"{tag[:quoted.start()]}className={quote}{insert}{quote}{tag[quoted.end():]}"
    template = _TEMPLATE_CLASS.search(tag)
    if template:
        body = template.group(1)
        if "${" in body or _BALANCE_EXEMPT.search(body):
            return tag
        insert = "text-balance" if body == "" else f"text-balance {body}"
        return f"{tag[:template.start()]}className={{`{insert}`}}{tag[template.end():]}"
    if "className=" in tag:
        return tag
    if tag.endswith("/>"):
        return tag[:-2] + ' className="text-balance" />'
    return tag[:-1] + ' className="text-balance">'


def balance_heading_line(line: str) -> str:
    """Balance static heading tags using the shared exemption and class rules."""
    return _HEADING_TAG.sub(lambda match: _balance_tag(match.group(0)), line)


def balance_added_headings(root: Path, diff: str) -> list[str]:
    """Add text-balance on added heading tags. Dynamic and stale lines stay."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    for rel, new_line, added in iter_added_lines(diff):
        balanced = balance_heading_line(added)
        if _heading_product_path(rel) and balanced != added:
            edits.setdefault(rel, {})[new_line] = (added, balanced)
    return _rewrite_added_lines(root, edits)


def strip_added_legacy_cache_exports(root: Path, diff: str) -> list[str]:
    """Delete added dynamic/fetchCache/revalidate exports. Stale and runtime lines stay."""
    changed = []
    root = Path(root)
    for rel, lines in _added_legacy_cache_exports(diff).items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        drop: set[int] = set()
        for lineno, added in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current == added:
                drop.add(index)
        if not drop:
            continue
        kept = [line for index, line in enumerate(file_lines) if index not in drop]
        try:
            atomic_write_text(path, "".join(kept))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)
