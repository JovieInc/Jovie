"""Union empty-base Vitest statement insertions.

Main's statements stay first, then head-only statements. A changed existing
line, control flow, an unbalanced side, or a repeated binding with a different
body stays unresolved. The caller proves the diff3 base is empty.
"""
from __future__ import annotations

import re

_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^\|{7}[^\n]*\n(?P<base>.*?)"
    r"^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)",
    re.M | re.S)
_BIND = re.compile(
    r"^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)\b")
_MOCK = re.compile(r"^vi\.mock\(\s*(['\"])(?P<mod>[^'\"\n]+)\1")
_CALL = re.compile(r"^[A-Za-z_$][\w$.]*\(")
_FLOW = re.compile(
    r"^(?:return|throw|break|continue|yield|if|for|while|switch|try|else|catch|do)\b")
_MARKERS = re.compile(r"(?m)^(?:<{7}|\|{7}|={7}|>{7})")


def _statements(side: str) -> list[str] | None:
    """Split one conflict side into semicolon-terminated statements."""
    if side == "":
        return []
    found: list[str] = []
    index = start = depth = 0
    limit = len(side)
    while index < limit:
        char = side[index]
        if char == "/" and index + 1 < limit and side[index + 1] == "/":
            newline = side.find("\n", index)
            if newline < 0:
                return None
            index = newline
            continue
        if char == "/" and index + 1 < limit and side[index + 1] == "*":
            end = side.find("*/", index + 2)
            if end < 0:
                return None
            index = end + 2
            continue
        if char in "'\"":
            quote = char
            index += 1
            while index < limit and side[index] != quote:
                if side[index] == "\n":
                    return None
                index += 2 if side[index] == "\\" else 1
            if index >= limit:
                return None
            index += 1
            continue
        if char == "`":
            return None
        if char in "({[":
            depth += 1
        elif char in ")}]":
            depth -= 1
            if depth < 0:
                return None
        elif char == ";" and depth == 0:
            end = index + 1
            if end < limit and side[end] == "\n":
                end += 1
            statement = side[start:end]
            found.append(statement if statement.endswith("\n") else statement + "\n")
            index = end
            start = index
            continue
        index += 1
    if depth or side[start:].strip():
        return None
    return found


def _key(statement: str) -> str | None:
    body = statement.strip()
    if _FLOW.match(body):
        return None
    bound = _BIND.match(body)
    if bound:
        return "bind:" + bound.group(1)
    mocked = _MOCK.match(body)
    if mocked:
        return "mock:" + mocked.group("mod")
    if _CALL.match(body):
        return "call:" + body
    return None


def resolve_additive_statements_text(text: str) -> str | None:
    """Union diff3 hunks whose base is empty and whose sides are statements.

    None when any hunk has another shape, so the caller leaves that merge
    unresolved.
    """
    matches = list(_HUNK.finditer(text))
    if not matches:
        return None
    for match in reversed(matches):
        if match["base"].strip():
            return None
        ours = _statements(match["ours"])
        theirs = _statements(match["theirs"])
        if ours is None or theirs is None:
            return None
        seen: dict[str, str] = {}
        ordered: list[str] = []
        for statement in [*theirs, *ours]:
            key = _key(statement)
            if key is None:
                return None
            prior = seen.get(key)
            if prior is not None and prior != statement.strip():
                return None
            if prior is None:
                seen[key] = statement.strip()
                ordered.append(statement)
        text = text[:match.start()] + "".join(ordered) + text[match.end():]
    if _MARKERS.search(text):
        return None
    return text
