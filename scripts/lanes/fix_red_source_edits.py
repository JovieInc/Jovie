"""Source rewrites for the fix-red no-model routes: snap added off-grid spacing utilities and
strip added legacy Cache Components exports. Split from fix_red_classes to keep it under its size ceiling."""
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


def _added_spacing_edits(diff: str) -> dict[str, dict[int, tuple[str, str]]]:
    """Map eligible file -> {new 1-based line: (added text, snapped text)} for utilities the diff adds."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    rel = ""
    eligible = False
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            eligible = _spacing_product_path(rel)
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if raw.startswith("\\"):
            continue  # "\ No newline at end of file" is not a source line
        if raw.startswith("+"):
            added = raw[1:]
            snapped = _snap_spacing_line(added)
            if eligible and snapped != added:
                edits.setdefault(rel, {})[new_line] = (added, snapped)
            new_line += 1
        elif raw.startswith("-"):
            continue
        else:
            # A context line (rare with -U0) still occupies a new-file line.
            new_line += 1
    return edits


def snap_added_conservative_spacing(root: Path, diff: str) -> list[str]:
    """Snap conservative spacing utilities on lines this diff adds. Returns the files written.

    Grandfathered lines are left alone, including an identical `gap-2.5` elsewhere in the
    file. A line that no longer matches the diff is left alone so a stale patch cannot
    rewrite a neighbor. 2.5 -> 2 (10px -> 8px) and 3.5 -> 3 (14px -> 12px).
    """
    changed = []
    root = Path(root)
    for rel, lines in _added_spacing_edits(diff).items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        dirty = False
        for lineno, (added, snapped) in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current != added:
                continue
            file_lines[index] = snapped + ending
            dirty = True
        if not dirty:
            continue
        try:
            atomic_write_text(path, "".join(file_lines))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)


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
    rel = ""
    eligible = False
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            eligible = _legacy_cache_path(rel)
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if raw.startswith("\\"):
            continue
        if raw.startswith("+"):
            added = raw[1:]
            if eligible and LEGACY_CACHE_EXPORT.match(added):
                edits.setdefault(rel, {})[new_line] = added
            new_line += 1
        elif raw.startswith("-"):
            continue
        else:
            new_line += 1
    return edits


def strip_added_legacy_cache_exports(root: Path, diff: str) -> list[str]:
    """Delete route-segment cache exports on lines this diff adds. Returns the files written.

    Grandfathered exports stay, including an identical line elsewhere in the file.
    A line that no longer matches the diff stays, so a stale patch cannot delete a
    neighbor. `export const runtime` is not a legacy surface and is left alone.
    """
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
