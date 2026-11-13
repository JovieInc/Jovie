"""Markdown-preserving helpers for the existing PR repair evidence writer."""
from __future__ import annotations

import json
import re

RED_HEADING = re.compile(r"^#{1,6}\s*red-before-green\s*$", re.I)
ANY_HEADING = re.compile(r"^#{1,6}\s")


def repair_customer_decision(updated: str, decisions: list[str], customer_decision: dict | None) -> str:
    """Preserve original comments through section replacement before selecting a missing note."""
    for decision in decisions:
        if decision not in updated:
            updated = updated.rstrip("\n") + "\n" + decision + "\n"
    if customer_decision is not None and not re.search(r"<!--\s*customer-changelog/v1\b", updated):
        if not isinstance(customer_decision, dict) or type(customer_decision.get("releaseWorthy")) is not bool:
            raise ValueError("customer decision requires an explicit releaseWorthy boolean")
        if customer_decision["releaseWorthy"] is False:
            from fix_red_classes import stamp_internal_changelog
            updated = stamp_internal_changelog(updated)
        else:
            note = json.dumps(customer_decision, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e")
            updated = updated.rstrip("\n") + "\n<!-- customer-changelog/v1 " + note + " -->\n"
    return updated


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


def with_red_section(body: str, block: str) -> str:
    """Replace an empty/placeholder Red-before-green section with the block, or append one."""
    lines = (body or "").split("\n")
    bounds = red_section_bounds(lines)
    if bounds is None:
        return (body or "").rstrip("\n") + "\n\n" + block + "\n"
    start, end = bounds
    return "\n".join(lines[:start] + block.split("\n") + [""] + lines[end:])


def quote_revision_references(body: str) -> str:
    """Render bare full commit references as code, preserving proof and real mentions.

    Company Guards accepts quoted technical references. Only full SHA-1s at a
    mention boundary qualify; user names, package scopes and URLs stay unchanged.
    """
    tokens = (r"(?P<ticks>`+)[\s\S]*?(?P=ticks)|~~~[\s\S]*?~~~|<!--[\s\S]*?-->|"
              r"(?P<revision>(?<![\w@./`-])@[0-9a-fA-F]{40}(?![\w/-]))")
    return re.sub(tokens, lambda m: f"`{m.group()}`" if m.group("revision") else m.group(), body)
