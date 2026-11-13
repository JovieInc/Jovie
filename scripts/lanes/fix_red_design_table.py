"""Resolve DESIGN.md enforcement-table conflicts from the merged baselines.

Head-only gates stay verbatim. A gate on both sides keeps the non-count cells
and renders the count cell from the baseline file the enforcement test reads.
A design-sections.json hunk that is only a sha256 line is rehashed from the
resolved DESIGN.md section. Any other hunk returns None so the caller leaves
the merge unresolved.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from atomic_state import atomic_write_text
from fix_red_source_edits import commit_open_merge

DESIGN = "DESIGN.md"
SECTIONS = "scripts/agent-context/design-sections.json"
ALLOWED = frozenset({DESIGN, SECTIONS})
_BASELINE_DIR = Path("apps/web/tests/unit/design-system")
_COUNT_FILES = {
    "source-identity": "source-identity.baseline.json",
    "arbitrary-values": "arbitrary-values.baseline.json",
    "deprecated-button-alias": "deprecated-button-alias.baseline.json",
    "linear-namespace": "linear-namespace.baseline.json",
}
_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)",
    re.M | re.S,
)
_SHA_LINE = re.compile(
    r'^(?P<indent>[ \t]*)"sha256": "(?P<digest>[0-9a-f]{64})"(?P<comma>,?)$'
)
_HEADING = re.compile(r'"heading": "(## [^"]+)"')


def _read_baseline(root: Path, name: str, cache: dict):
    if name in cache:
        return cache[name]
    path = root / _BASELINE_DIR / name
    try:
        text = path.read_text()
    except OSError:
        cache[name] = None
        return None
    if "<<<<<<<" in text or ">>>>>>>" in text:
        cache[name] = None
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        cache[name] = None
        return None
    cache[name] = data if isinstance(data, dict) else None
    return cache[name]


def render_count(gate: str, root: Path, cache: dict | None = None) -> str | None:
    """Count cell the DESIGN.md enforcement test compares to the baseline file."""
    cache = {} if cache is None else cache
    if gate.startswith("spacing-scale (") and gate.endswith(")"):
        tier_name = gate[len("spacing-scale ("):-1]
        data = _read_baseline(root, "spacing-scale.baseline.json", cache)
        tier = data.get(tier_name) if isinstance(data, dict) else None
        if not isinstance(tier, dict):
            return None
        armed, count, per_family = tier.get("armed"), tier.get("count"), tier.get("perFamily")
        if (type(armed) is not bool or type(count) is not int or count < 0
                or not isinstance(per_family, dict)
                or any(type(value) is not int or not isinstance(key, str)
                       for key, value in per_family.items())):
            return None
        families = "; ".join(f"{key}={per_family[key]}" for key in sorted(per_family))
        return f"{count}; armed={str(armed).lower()}; {families}"
    filename = _COUNT_FILES.get(gate)
    if filename is None:
        return None
    data = _read_baseline(root, filename, cache)
    count = data.get("count") if isinstance(data, dict) else None
    if type(count) is not int or count < 0:
        return None
    return str(count)


def _rows(side: str) -> list[tuple[str, str, list[str]]] | None:
    if not str(side or "").endswith("\n"):
        return None
    lines = side[:-1].split("\n")
    if not lines:
        return None
    parsed = []
    for line in lines:
        cells = [part.strip() for part in line.split("|")]
        if len(cells) != 7 or cells[0] or cells[-1]:
            return None
        gate = cells[1]
        if len(gate) < 3 or gate[0] != "`" or gate[-1] != "`" or "`" in gate[1:-1]:
            return None
        name = gate[1:-1]
        parsed.append((name, line, cells[1:6]))
    if len({name for name, _, _ in parsed}) != len(parsed):
        return None
    return parsed


def _with_count(line: str, count: str) -> str:
    parts = line.split("|")
    parts[5] = f" {count} "
    return "|".join(parts)


def merge_design_table(ours: str, theirs: str, root: Path, cache: dict | None = None) -> str | None:
    """Keep head order, then main-only gates. Shared counts come from `root` baselines."""
    ours_rows = _rows(ours)
    theirs_rows = _rows(theirs)
    if ours_rows is None or theirs_rows is None:
        return None
    cache = {} if cache is None else cache
    theirs_by = {name: cells for name, _line, cells in theirs_rows}
    emitted: list[str] = []
    seen: set[str] = set()
    for name, line, cells in ours_rows:
        other = theirs_by.get(name)
        if other is None:
            emitted.append(line)
            seen.add(name)
            continue
        if cells[:4] != other[:4]:
            return None
        count = render_count(name, root, cache)
        if count is None:
            return None
        emitted.append(_with_count(line, count))
        seen.add(name)
    for name, line, _cells in theirs_rows:
        if name not in seen:
            emitted.append(line)
    return "\n".join(emitted) + "\n"


def _replace_hunks(text: str, merge):
    if "<<<<<<<" not in str(text or ""):
        return None
    hunks = list(_HUNK.finditer(text))
    if not hunks:
        return None
    cleared = _HUNK.sub("", text)
    if "<<<<<<<" in cleared or ">>>>>>>" in cleared:
        return None
    pieces = []
    last = 0
    for hunk in hunks:
        merged = merge(hunk)
        if merged is None:
            return None
        pieces.append(text[last:hunk.start()])
        pieces.append(merged)
        last = hunk.end()
    pieces.append(text[last:])
    resolved = "".join(pieces)
    if "<<<<<<<" in resolved or ">>>>>>>" in resolved or resolved == text:
        return None
    return resolved


def resolve_design_table_text(text: str, root: Path) -> str | None:
    """Replace table-row hunks. None when any hunk is not that shape."""
    cache: dict = {}
    return _replace_hunks(
        text, lambda hunk: merge_design_table(hunk.group("ours"), hunk.group("theirs"), root, cache))


def section_digest(design: str, heading: str) -> str | None:
    """SHA-256 of one DESIGN.md section, with markdown links normalized to ](link)."""
    if not heading.startswith("## ") or "<<<<<<<" in design or ">>>>>>>" in design:
        return None
    matches = list(re.finditer(r"^## ", design, flags=re.M))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(design)
        section = design[match.start():end]
        normalized = re.sub(r"\]\([^)]*\)", "](link)", section).strip()
        if normalized == heading or normalized.startswith(heading + "\n"):
            return hashlib.sha256(normalized.encode()).hexdigest()
    return None


def _sha_side(side: str) -> tuple[str, str] | None:
    if not str(side or "").endswith("\n") or side.count("\n") != 1:
        return None
    match = _SHA_LINE.fullmatch(side[:-1])
    if match is None:
        return None
    return match.group("indent"), match.group("comma")


def resolve_design_sections_text(text: str, design: str) -> str | None:
    """Rehash sha256 hunks from the heading on the immediately previous line."""

    def merge(hunk) -> str | None:
        ours = _sha_side(hunk.group("ours"))
        theirs = _sha_side(hunk.group("theirs"))
        if ours is None or ours != theirs:
            return None
        prior = text[:hunk.start()].rstrip("\n").split("\n")[-1]
        heading = _HEADING.search(prior)
        if heading is None:
            return None
        digest = section_digest(design, heading.group(1))
        if digest is None:
            return None
        indent, comma = ours
        return f'{indent}"sha256": "{digest}"{comma}\n'

    return _replace_hunks(text, merge)


def resolve_design_table_conflict(worktree: Path, branch: str, log, *, sh, guard=lambda: None) -> bool:
    """Merge main and fast-forward when every conflict is a design table or section hash.

    Unknown files and hunks abort. This pushes; a caller that must not push uses
    resolve_design_table_text and resolve_design_sections_text instead.
    """
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = [
            path for path in (sh(
                ["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split()
            if path]
        if not conflicted or not set(conflicted) <= ALLOWED:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        try:
            design_text = (worktree / DESIGN).read_text()
            if DESIGN in conflicted:
                design_text = resolve_design_table_text(design_text, worktree)
                if design_text is None:
                    raise ValueError(DESIGN)
            resolved = {DESIGN: design_text} if DESIGN in conflicted else {}
            if SECTIONS in conflicted:
                sections = resolve_design_sections_text((worktree / SECTIONS).read_text(), design_text)
                if sections is None:
                    raise ValueError(SECTIONS)
                resolved[SECTIONS] = sections
            for path, text in resolved.items():
                atomic_write_text(worktree / path, text)
        except (OSError, UnicodeError, ValueError):
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        if not commit_open_merge(worktree, conflicted, sh, log, guard=guard):
            return False
    guard()
    return sh(
        ["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"],
        cwd=worktree, log=log).returncode == 0
