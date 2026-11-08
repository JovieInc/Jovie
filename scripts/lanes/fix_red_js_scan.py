"""Top-level JavaScript scan for the unbaselined vitest size split.

Statements stay whole, including the whitespace that preceded them. Names are
collected from code only: strings, comments, regular expressions and property
access do not count as bindings. A function or class with a default parameter
is one binding; a const/let/var with a depth-0 comma is left unsplit.
"""
from __future__ import annotations

import re

_HOOK = re.compile(r"(?:afterEach|beforeEach|afterAll|beforeAll)\s*\(")
_BINDING = re.compile(
    r"(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\b"
)
_BINDING_NAME = re.compile(
    r"(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)"
    r"|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)",
    re.M,
)
_VAR = re.compile(r"(?:export\s+)?(?:const|let|var)\b")
_REGEX_BEFORE = frozenset({
    "return", "typeof", "case", "throw", "delete", "void", "do", "else",
    "in", "of", "await", "yield", "new", "instanceof",
})
_REGEX_CHAR = set("([{=,:;!&|?+-~*%^<>")


class Stmt:
    def __init__(self, text: str, kind: str, names: tuple[str, ...]):
        self.text = text
        self.kind = kind
        self.names = names


def _skip_string(text: str, index: int, quote: str) -> int:
    length = len(text)
    index += 1
    if quote == "`":
        while index < length:
            char = text[index]
            if char == "\\":
                index += 2
                continue
            if char == "`":
                return index + 1
            if char == "$" and index + 1 < length and text[index + 1] == "{":
                index = _skip_balanced(text, index + 1)
                continue
            index += 1
        return length
    while index < length:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == quote:
            return index + 1
        if char == "\n":
            return index
        index += 1
    return length


def _skip_balanced(text: str, index: int) -> int:
    """index points at `{`. Return the index just after the matching `}`."""
    depth = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char in "'\"`":
            index = _skip_string(text, index, char)
            continue
        if text.startswith("//", index):
            newline = text.find("\n", index)
            index = length if newline < 0 else newline + 1
            continue
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            index = length if end < 0 else end + 2
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1
        index += 1
    return length


def _skip_regex(text: str, index: int) -> int:
    length = len(text)
    index += 1
    in_class = False
    while index < length:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == "\n":
            return index
        if char == "[" and not in_class:
            in_class = True
        elif char == "]" and in_class:
            in_class = False
        elif char == "/" and not in_class:
            index += 1
            while index < length and text[index] in "gimsuy":
                index += 1
            return index
        index += 1
    return length


def _skip_comment(text: str, index: int, length: int) -> int | None:
    if text.startswith("//", index):
        newline = text.find("\n", index)
        return length if newline < 0 else newline + 1
    if text.startswith("/*", index):
        end = text.find("*/", index + 2)
        return length if end < 0 else end + 2
    return None


def _statement_end(text: str, start: int) -> int:
    length = len(text)
    head = text[start:start + 80].lstrip()
    is_block = head.startswith(("function ", "class ", "async function "))
    paren = brace = bracket = 0
    index = start
    prev_char = ""
    prev_token = ""
    token: list[str] = []
    while index < length:
        comment = _skip_comment(text, index, length)
        if comment is not None:
            index = comment
            continue
        char = text[index]
        if char in "'\"`":
            index = _skip_string(text, index, char)
            prev_char = char
            prev_token = ""
            token = []
            continue
        if char == "/" and index + 1 < length and text[index + 1] not in "/*":
            regex = prev_char in _REGEX_CHAR or prev_char == "" or prev_token in _REGEX_BEFORE
            if regex and not (prev_char.isalnum() or prev_char in ")]"):
                index = _skip_regex(text, index)
                prev_char = "/"
                prev_token = ""
                token = []
                continue
        if char in "(){}[]":
            if token:
                prev_token = "".join(token)
                token = []
            prev_char = char
            if char == "(":
                paren += 1
            elif char == ")":
                paren -= 1
            elif char == "{":
                brace += 1
            elif char == "}":
                brace -= 1
                if is_block and paren == bracket == brace == 0:
                    return index + 1
            elif char == "[":
                bracket += 1
            else:
                bracket -= 1
            index += 1
            continue
        if char == ";" and paren == brace == bracket == 0:
            return index + 1
        if char.isalnum() or char in "_$":
            token.append(char)
        elif token:
            prev_token = "".join(token)
            token = []
            prev_char = char
        elif not char.isspace():
            prev_char = char
            prev_token = ""
        index += 1
    return length


def _var_multi(body: str) -> bool:
    """True when a const/let/var statement has a comma outside brackets."""
    if not _VAR.match(body):
        return False
    depth = 0
    index = 0
    length = len(body)
    while index < length:
        comment = _skip_comment(body, index, length)
        if comment is not None:
            index = comment
            continue
        char = body[index]
        if char in "'\"`":
            index = _skip_string(body, index, char)
            continue
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
        elif char == "," and depth == 0:
            return True
        index += 1
    return False


def _kind_and_names(text: str) -> tuple[str, tuple[str, ...]]:
    body = re.sub(r"^\s*(?:/\*[\s\S]*?\*/\s*|//[^\n]*\n\s*)*", "", text).lstrip()
    if body.startswith("import "):
        return "import", ()
    if body.startswith("vi.mock"):
        return "mock", ()
    if _HOOK.match(body):
        return "hook", ()
    if body.startswith(("describe(", "describe ")):
        return "describe", ()
    if body.startswith(("it(", "test(")):
        return "suite", ()
    if not _BINDING.match(body) or _var_multi(body):
        return "other", ()
    found = _BINDING_NAME.search(body)
    name = (found.group(1) or found.group(2) or "") if found else ""
    return ("binding", (name,)) if name else ("other", ())


def parse_statements(text: str) -> list[Stmt] | None:
    """Top-level statements. None when the scan does not cover the file."""
    stmts: list[Stmt] = []
    index = 0
    length = len(text)
    while index < length:
        cursor = index
        while cursor < length and text[cursor] in " \t\r\n":
            cursor += 1
        while True:
            comment = _skip_comment(text, cursor, length)
            if comment is None:
                break
            cursor = comment
            while cursor < length and text[cursor] in " \t\r\n":
                cursor += 1
        if cursor >= length:
            if stmts and index < length:
                stmts[-1].text += text[index:]
            break
        end = _statement_end(text, cursor)
        if end <= cursor:
            return None
        raw = text[index:end]
        kind, names = _kind_and_names(raw)
        stmts.append(Stmt(raw, kind, names))
        index = end
    if sum(len(stmt.text) for stmt in stmts) != length:
        return None
    return stmts


def code_names(text: str) -> set[str]:
    """Binding-shaped identifiers. Skips strings, comments, regexes and `obj.name`."""
    found: set[str] = set()
    _scan_names(text, 0, len(text), found)
    return found


def _scan_names(text: str, start: int, end: int, found: set[str]) -> None:
    index = start
    prev_char = ""
    prev_token = ""
    token: list[str] = []

    def flush() -> None:
        nonlocal prev_token
        if not token:
            return
        word = "".join(token)
        token.clear()
        if prev_char != ".":
            found.add(word)
        prev_token = word

    while index < end:
        comment = _skip_comment(text, index, end)
        if comment is not None:
            flush()
            index = comment
            continue
        char = text[index]
        if char == "`":
            flush()
            index = _scan_template(text, index, end, found)
            prev_char = "`"
            prev_token = ""
            continue
        if char in "'\"":
            flush()
            index = _skip_string(text, index, char)
            prev_char = char
            prev_token = ""
            continue
        if char == "/" and index + 1 < end and text[index + 1] not in "/*":
            regex = prev_char in _REGEX_CHAR or prev_char == "" or prev_token in _REGEX_BEFORE
            if regex and not (prev_char.isalnum() or prev_char in ")]"):
                flush()
                index = _skip_regex(text, index)
                prev_char = "/"
                prev_token = ""
                continue
        if char.isalnum() or char in "_$":
            token.append(char)
            index += 1
            continue
        flush()
        if not char.isspace():
            prev_char = char
            prev_token = ""
        index += 1
    flush()


def _scan_template(text: str, index: int, end: int, found: set[str]) -> int:
    """index points at a backtick. Walk interpolations, then return after the closer."""
    index += 1
    while index < end:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == "`":
            return index + 1
        if char == "$" and index + 1 < end and text[index + 1] == "{":
            close = _skip_balanced(text, index + 1)
            _scan_names(text, index + 2, close - 1, found)
            index = close
            continue
        index += 1
    return end
