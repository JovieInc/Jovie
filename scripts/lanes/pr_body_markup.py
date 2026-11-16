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


def with_blast_radius(body: str, evidence: dict | None) -> str:
    """Append explicit author evidence without replacing an existing visible section."""
    if evidence is None:
        return body
    fields = ("What could break", "Proof")
    if not isinstance(evidence, dict) or any(
            not isinstance(evidence.get(field), str) or not evidence[field].strip()
            or "\n" in evidence[field] or "\r" in evidence[field] for field in fields):
        raise ValueError("blast radius requires explicit single-line What could break and Proof")
    if red_section_bounds(body.split("\n"), re.compile(r"^#{1,6}\s*Blast radius\s*$", re.I)) is not None:
        return body
    block = "## Blast radius\n\n" + "\n".join(f"- {field}: {evidence[field]}" for field in fields)
    return body.rstrip("\n") + "\n\n" + block + "\n"


def quote_revision_references(body: str, *, literal_mentions: tuple[str, ...] = ()) -> str:
    """Wrap commit-SHAs and explicitly selected literal mentions as code.

    The mention guard strips fenced blocks and inline code, then flags @login.
    Hex logins of 8 to 40 characters are commit prefixes, including a full SHA-1.
    A 7-character abbrev stays literal. Real logins, package paths, emails,
    fences, comments, and existing code spans stay unchanged. HTML comments stay
    literal so a changelog note can keep valid JSON. Callers may explicitly select
    other literal tokens (for example a test tag); unknown people are never inferred.
    """
    token = re.compile(r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?(?:\[bot\])?", re.ASCII)
    if not isinstance(literal_mentions, tuple) or any(
            not isinstance(value, str) or not token.fullmatch(value) for value in literal_mentions):
        raise ValueError("literal mentions require a tuple of complete @mention tokens")
    literals = frozenset(literal_mentions)
    if not body:
        return body
    protected = re.compile(
        r"```[\s\S]*?```|~~~[\s\S]*?~~~|<!--[\s\S]*?-->|(?P<ticks>`+)[\s\S]*?(?P=ticks)",
        re.ASCII,
    )
    mention = re.compile(
        r"(?<![\w@./`-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?(?:\[bot\])?)"
        r"(?![\w-]*/|\w*\.\w)",
        re.ASCII,
    )
    hex_login = re.compile(r"[0-9a-fA-F]{8,40}")

    def wrap(prose: str) -> str:
        def replacer(match: re.Match[str]) -> str:
            login = match.group(1)
            if not hex_login.fullmatch(login) and match.group(0) not in literals:
                return match.group(0)
            nxt = match.string[match.end() : match.end() + 1]
            if nxt and (nxt.isalnum() or nxt in "-_"):
                return match.group(0)
            return f"`@{login}`"

        return mention.sub(replacer, prose)

    pieces: list[str] = []
    cursor = 0
    for match in protected.finditer(body):
        pieces.append(wrap(body[cursor : match.start()]))
        pieces.append(match.group(0))
        cursor = match.end()
    pieces.append(wrap(body[cursor:]))
    return "".join(pieces)
