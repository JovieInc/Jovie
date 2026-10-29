#!/usr/bin/env python3
"""Keep both sides of a merge hunk only when the sides do not disagree.

DIRTY fix-red runs with no failing check (fingerprint of an empty failure set)
were spending a model on conflicts a byte comparison can finish. Generated
files stay with ``resolve_generated_conflict``. This module clears a hunk when
the two sides are the same after dropping blank lines and trailing whitespace,
and it keeps main's bytes so formatting follows the branch being merged.

A deletion against a keep, a rewritten line, or any other disagreement stays
marked. Callers abort the merge and leave that file to the agent. Never union
unrelated insertions: a retired key next to a new comment is a disagreement,
not two additions.
"""
from __future__ import annotations

from pathlib import Path


def _meaningful(text: str) -> tuple[str, ...]:
    return tuple(line.rstrip() for line in text.splitlines() if line.strip())


def resolve_hunk(ours: str, theirs: str) -> str | None:
    """Main's text when the sides match ignoring blank lines and trailing space."""
    if _meaningful(ours) != _meaningful(theirs):
        return None
    return theirs


def apply_safe_hunks(text: str) -> str | None:
    """Resolve hunks whose sides agree. Disagreements stay marked.

    None when a marker is malformed. A caller that needs every hunk cleared
    uses ``fully_resolved`` instead.
    """
    resolved, _clean = _apply(text)
    return resolved


def fully_resolved(text: str) -> str | None:
    """Resolved text when every hunk agrees; None when any disagreement remains."""
    resolved, clean = _apply(text)
    if resolved is None or not clean:
        return None
    return resolved


def _apply(text: str) -> tuple[str | None, bool]:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    index = 0
    clean = True
    while index < len(lines):
        if not lines[index].startswith("<<<<<<<"):
            out.append(lines[index])
            index += 1
            continue
        opening = lines[index]
        index += 1
        ours: list[str] = []
        while index < len(lines) and not lines[index].startswith(("=======", "|||||||")):
            ours.append(lines[index])
            index += 1
        base: list[str] = []
        if index < len(lines) and lines[index].startswith("|||||||"):
            base.append(lines[index])
            index += 1
            while index < len(lines) and not lines[index].startswith("======="):
                base.append(lines[index])
                index += 1
        if index >= len(lines) or not lines[index].startswith("======="):
            return None, False
        divider = lines[index]
        index += 1
        theirs: list[str] = []
        while index < len(lines) and not lines[index].startswith(">>>>>>>"):
            theirs.append(lines[index])
            index += 1
        if index >= len(lines):
            return None, False
        closing = lines[index]
        index += 1
        chosen = resolve_hunk("".join(ours), "".join(theirs))
        if chosen is None:
            clean = False
            out.extend([opening, *ours, *base, divider, *theirs, closing])
        else:
            out.append(chosen)
    return "".join(out), clean


def resolve_paths(root: Path, relative_paths: list[str]) -> bool:
    """Resolve every listed file or change nothing. False when any hunk disagrees."""
    root = Path(root)
    updates: list[tuple[Path, str]] = []
    for rel in relative_paths:
        path = Path(rel)
        if path.is_absolute() or ".." in path.parts:
            return False
        target = root / path
        try:
            text = target.read_text()
        except OSError:
            return False
        resolved = fully_resolved(text)
        if resolved is None:
            return False
        updates.append((target, resolved))
    for target, resolved in updates:
        if target.read_text() != resolved:
            target.write_text(resolved)
    return True
