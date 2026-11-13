"""Union empty-base Vitest statement insertions.

Main's statements stay first, then head-only statements. A changed existing
line, control flow, an unbalanced side, or a repeated binding with a different
body stays unresolved. The caller proves the diff3 base is empty.

A duplicate UTC-noon test clock pin keeps main's patch target and the head's
fixed instant. Any other overlap stays unresolved.
"""
from __future__ import annotations

import difflib
import re
from datetime import datetime, timezone

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


def contained_by_main(base: str, ours: str, theirs: str) -> str | None:
    """Take main when every PR edit is retained within main's edit of the same base range.

    Keep comments, whitespace, directives and string contents significant. Broader
    overlapping base ranges, renamed locals and text elsewhere remain unresolved.
    """
    if any(_MARKERS.search(side) for side in (base, ours, theirs)):
        return None
    base_lines = base.splitlines(keepends=True)

    def changes(side):
        lines = side.splitlines(keepends=True)
        return {(i1, i2): lines[j1:j2]
                for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(
                    a=base_lines, b=lines, autojunk=False).get_opcodes() if tag != "equal"}

    main_changes = changes(theirs)
    for span, replacement in changes(ours).items():
        landed = main_changes.get(span)
        if landed is None:
            return None
        if not replacement:
            if landed:
                return None
        elif not any(landed[start:start + len(replacement)] == replacement
                     for start in range(len(landed) - len(replacement) + 1)):
            return None
    return theirs


# Head pins the shared time module to one UTC noon. Main wraps the same test
# around patch.object(lane.time, "time") and still samples the wall clock.
_HEAD_PIN = re.compile(
    r"(?P<indent>[ ]+)"
    r"(?:#.*\n(?P=indent))*"
    r"@patch\(\"time\.time\", return_value=(?P<literal>\d[\d_]*(?:\.\d[\d_]*)?)\)"
    r"(?:[ \t]+#.*)?\n"
    r"(?P=indent)def (?P<name>test_[A-Za-z0-9_]+)\(self, _clock\):\n")
_MAIN_WRAP = re.compile(
    r"(?P<indent>[ ]+)def (?P<name>test_[A-Za-z0-9_]+)\(self\):\n"
    r"(?:(?P=indent)[ ]+#.*\n)*"
    r"(?P=indent)    now = \(time\.time\(\) - 12 \* 3600\) // 86400 \* 86400 \+ 12 \* 3600\n"
    r"(?P=indent)    with patch\.object\((?P<target>[A-Za-z_]\w*)\.time, \"time\", "
    r"return_value=now\):\n"
    r"(?P=indent)        self\.(?P<helper>_[A-Za-z0-9_]+)\(now\)\n"
    r"\n"
    r"(?P=indent)def (?P=helper)\(self, now: float\):\n")
_NOON_FORMULA = "    now = (time.time() - 12 * 3600) // 86400 * 86400 + 12 * 3600\n"


def _one(pattern: re.Pattern[str], text: str) -> re.Match[str] | None:
    found = list(pattern.finditer(text))
    if len(found) != 1:
        return None
    return found[0]


def _body_after(text: str, body_at: int, indent: str) -> tuple[str, int]:
    """Lines of a method, including blank lines, up to the next sibling."""
    index = body_at
    while index < len(text):
        newline = text.find("\n", index)
        end = len(text) if newline < 0 else newline + 1
        line = text[index:end]
        if line.strip() and not line.startswith(indent + " "):
            break
        index = end
    return text[body_at:index], index


def _utc_noon(literal: str) -> str | None:
    """Stamp a numeric literal that is an exact UTC noon, keeping its spelling."""
    try:
        number = float(literal)
    except ValueError:
        return None
    if number != int(number):
        return None
    seconds = int(number)
    if seconds % 86400 != 12 * 3600:
        return None
    return datetime.fromtimestamp(seconds, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def merge_duplicate_clock_pin(base: str, ours: str, theirs: str) -> str | None:
    """Keep main's lane.time patch and replace its formula with the head's noon.

    The head may only add same-indent comments, one ``@patch("time.time")``
    decorator, and a ``_clock`` parameter. Main may only wrap that same test in
    ``patch.object`` and move its body into the helper, dropping one
    ``now = time.time()`` line. A second edit on either side stays unresolved.
    """
    if any(_MARKERS.search(side) for side in (base, ours, theirs)):
        return None
    pin = _one(_HEAD_PIN, ours)
    wrap = _one(_MAIN_WRAP, theirs)
    if pin is None or wrap is None or pin.group("name") != wrap.group("name"):
        return None
    indent = pin.group("indent")
    restored = indent + f"def {pin.group('name')}(self):\n"
    if ours[:pin.start()] + restored + ours[pin.end():] != base:
        return None
    stamp = _utc_noon(pin.group("literal"))
    if stamp is None or wrap.group("indent") != indent:
        return None
    header = indent + f"def {pin.group('name')}(self):\n"
    base_at = base.find(header)
    if base_at < 0 or base.find(header, base_at + 1) >= 0:
        return None
    if base_at and base[base_at - 1] != "\n":
        return None
    base_body, _base_end = _body_after(base, base_at + len(header), indent)
    clock = [line for line in base_body.splitlines(keepends=True) if line.strip() == "now = time.time()"]
    if len(clock) != 1 or base_body.count(clock[0]) != 1:
        return None
    helper_body, helper_end = _body_after(theirs, wrap.end(), indent)
    if helper_body != base_body.replace(clock[0], "", 1):
        return None
    if theirs[:wrap.start()] + header + base_body + theirs[helper_end:] != base:
        return None
    formula = indent + _NOON_FORMULA
    if theirs.count(formula) != 1:
        return None
    merged = theirs.replace(
        formula,
        indent + f"    now = {pin.group('literal')}  # {stamp}\n",
        1)
    if _MARKERS.search(merged):
        return None
    return merged


def contained_by_main_file(worktree, rel, sh) -> str | None:
    """Read Git's actual base/PR/main stages, refusing missing stages.

    A duplicate UTC-noon clock pin is merged when main does not already
    contain the PR edit. Every other shape still fails closed.
    """
    stages = []
    for stage in (1, 2, 3):
        blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
        if blob.returncode:
            return None
        stages.append(blob.stdout)
    landed = contained_by_main(*stages)
    if landed is not None:
        return landed
    return merge_duplicate_clock_pin(*stages)
