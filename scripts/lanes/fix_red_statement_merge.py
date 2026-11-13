"""Union Vitest statement insertions and proven additive named imports.

Main's statements stay first, then head-only statements. A changed existing
line, control flow, an unbalanced side, or a repeated binding or import of the
same module with a different body stays unresolved. The caller proves the
diff3 base is empty.
"""
from __future__ import annotations

import difflib
import re

_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^\|{7}[^\n]*\n(?P<base>.*?)"
    r"^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)",
    re.M | re.S)
_BIND = re.compile(
    r"^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)\b")
_IMPORT = re.compile(
    r"^import\s+(?:type\s+)?(?:[^'\"\n;]+?\s+from\s+)?(['\"])(?P<mod>[^'\"\n]+)\1\s*;$")
_MOCK = re.compile(r"^vi\.mock\(\s*(['\"])(?P<mod>[^'\"\n]+)\1")
_CALL = re.compile(r"^[A-Za-z_$][\w$.]*\(")
_FLOW = re.compile(
    r"^(?:return|throw|break|continue|yield|if|for|while|switch|try|else|catch|do)\b")
_MARKERS = re.compile(r"(?m)^(?:<{7}|\|{7}|={7}|>{7})")
_NAMED_IMPORT = re.compile(
    r"import \{ (?P<names>[A-Za-z_$][\w$]*(?:, [A-Za-z_$][\w$]*)*) \} "
    r"from (?P<quote>['\"])(?P<module>[^'\"\\\n]+)(?P=quote);\n")


def _additive_named_imports(base: str, ours: str, theirs: str) -> str | None:
    """Union only one-line named imports; every base binding must survive both sides."""
    def parse(side):
        imports, bindings, offset = {}, set(), 0
        for match in _NAMED_IMPORT.finditer(side):
            names = match['names'].split(', ')
            module = match['module']
            if (match.start() != offset or module in imports
                    or len(names) != len(set(names)) or bindings.intersection(names)):
                return None
            imports[module] = (names, match['quote'])
            bindings.update(names)
            offset = match.end()
        return imports if imports and offset == len(side) else None

    original, head, main = parse(base), parse(ours), parse(theirs)
    if original is None or head is None or main is None:
        return None
    for module, (names, _) in original.items():
        if any(module not in side or not set(names).issubset(side[module][0])
               for side in (head, main)):
            return None
    if any([module for module in side if module in original] != list(original)
           for side in (head, main)):
        return None
    result, bindings = [], set()
    for module in dict.fromkeys([*main, *head]):
        names, quote = main.get(module, head.get(module))
        merged = list(dict.fromkeys([*names, *head.get(module, ([], quote))[0]]))
        if bindings.intersection(merged):
            return None
        bindings.update(merged)
        result.append(f"import {{ {', '.join(merged)} }} from {quote}{module}{quote};\n")
    return ''.join(result)


def _unique_file_imports(text: str) -> bool:
    """Refuse collisions with imports or declarations outside the resolved hunk.

    Unsupported static import syntax stays manual. Indented declarations can
    be local, so treating those as collisions is deliberately conservative.
    """
    bindings = set()
    for match in re.finditer(r'^import\b[^;]*;\n', text, re.M):
        statement = match[0]
        named = _NAMED_IMPORT.fullmatch(statement)
        default = re.fullmatch(r"import ([A-Za-z_$][\w$]*) from ['\"][^'\"\\\n]+['\"];\n", statement)
        if named:
            names = named['names'].split(', ')
        elif default:
            names = [default[1]]
        else:
            return False
        if len(names) != len(set(names)) or bindings.intersection(names):
            return False
        bindings.update(names)
    for line in text.splitlines():
        declared = _BIND.match(line.strip())
        if declared and declared[1] in bindings:
            return False
    return True


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
    imported = _IMPORT.match(body)
    if imported:
        return "import:" + imported.group("mod")
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
    """Union empty-base statement hunks or additive named imports proven by diff3.

    None when any hunk has another shape, so the caller leaves that merge
    unresolved.
    """
    matches = list(_HUNK.finditer(text))
    if not matches:
        return None
    imports_changed = False
    for match in reversed(matches):
        if match["base"].strip():
            merged = _additive_named_imports(match['base'], match['ours'], match['theirs'])
            if merged is None:
                return None
            text = text[:match.start()] + merged + text[match.end():]
            imports_changed = True
            continue
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
    if imports_changed and not _unique_file_imports(text):
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


def contained_by_main_file(worktree, rel, sh) -> str | None:
    """Read Git's actual base/PR/main stages, refusing missing stages."""
    stages = []
    for stage in (1, 2, 3):
        blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
        if blob.returncode:
            return None
        stages.append(blob.stdout)
    return contained_by_main(*stages)
