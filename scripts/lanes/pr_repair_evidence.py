"""Pure body-section parsing and explicit provenance repair for lane evidence."""
from __future__ import annotations

import re

RED_HEADING = re.compile(r"^#{1,6}\s*red-before-green\s*$", re.I)
ANY_HEADING = re.compile(r"^#{1,6}\s")


def red_section_bounds(lines: list[str], heading=RED_HEADING) -> tuple[int, int] | None:
    """Match Fleet boundaries, ignoring fenced/hidden headings but preserving source line indexes."""
    visible = re.sub(r"<!--[\s\S]*?-->", lambda match: "\n" * match.group().count("\n"), "\n".join(lines))
    fenced = False
    start = None
    for index, line in enumerate(visible.split("\n")):
        if re.match(r"^\s*(?:```|~~~)", line):
            fenced = not fenced
            continue
        if fenced:
            continue
        if start is None:
            if heading.match(line.strip()):
                start = index
        elif ANY_HEADING.match(line):
            return start, index
    return (start, len(lines)) if start is not None else None


def with_locking_pr(body: str, locking_pr: int) -> str:
    """Fill an explicit placeholder without replacing citations, comments or notes."""
    updated = body
    if type(locking_pr) is not int or locking_pr < 1:
        raise ValueError("locking PR requires an explicit positive PR number")
    lines = updated.split("\n")
    bounds = red_section_bounds(lines, re.compile(r"^#{1,6}\s+Locked areas\s*$", re.I))
    if bounds is None:
        updated = updated.rstrip("\n") + f"\n\n## Locked areas\n\nLocking PR: #{locking_pr}\n"
    else:
        start, end = bounds
        original = "\n".join(lines[start + 1:end])
        content = re.sub(r"<!--[\s\S]*?-->", "", original).strip()
        # Fill explicit template declarations, preserving existing citations and
        # unrelated notes/footer text. Never replace text inside hidden comments.
        placeholder = r"(?:[-*][ \t]*)?(?:none|n/?a|not applicable|todo|tbd)[.!]?"
        if not content:
            updated = "\n".join(lines[:end] + [f"Locking PR: #{locking_pr}", ""] + lines[end:])
        elif (re.fullmatch(placeholder, content.splitlines()[0].strip(), re.I)
              and not re.search(r"\b(?:GBrain|Locking PR)\s*:", content, re.I)):
            parts = re.split(r"(<!--[\s\S]*?-->)", original)
            for index in range(0, len(parts), 2):
                parts[index], count = re.subn(r"(?im)^[ \t]*" + placeholder + r"[ \t]*$",
                                              f"Locking PR: #{locking_pr}", parts[index], count=1)
                if count:
                    break
            updated = "\n".join(lines[:start + 1] + "".join(parts).split("\n") + lines[end:])
    return updated
