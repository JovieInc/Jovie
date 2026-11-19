"""Column-0 test splitter used by the unbaselined size-500 fixer.

Bin-packs top-level describe/it/test blocks, copies referenced support and
hooks, and trims imports. A block that cannot fit returns None.
"""
from __future__ import annotations

import re

LIMIT = 500
_TEST_PATH = re.compile(r"^(?P<dir>(?:.*/)?)(?P<stem>[^/]+?)(?P<kind>\.(?:test|spec))(?P<ext>\.[cm]?[jt]sx?)$")
_TEST_STMT = re.compile(r"^(?:export\s+)?(?:describe|it|test)(?:\.(?:each|only|skip|todo|concurrent))*\s*[(<]")
_HOOK_STMT = re.compile(r"^(?:export\s+)?(?:beforeAll|beforeEach|afterAll|afterEach)\s*[(]")
_IDENT = re.compile(r"[A-Za-z_$][\w$]*")
_KEYWORDS = frozenset("""
break case catch class const continue debugger default delete do else export extends false
finally for function if import in instanceof let new null return static super switch this
throw true try typeof var void while with async await of from as yield get set enum
undefined NaN Infinity
""".split())
_REGEX_WORD = frozenset("return throw case typeof void delete await yield else do in of instanceof".split())

def line_count(text: str) -> int:
    return len(text.splitlines())

def _binding_names(pattern: str) -> set[str]:
    names, i, depth = set(), 0, 0
    while i < len(pattern):
        char = pattern[i]
        if char in "[{(":
            depth += 1
            i += 1
            continue
        if char in "]})":
            depth = max(0, depth - 1)
            i += 1
            continue
        match = _IDENT.match(pattern, i)
        if not match:
            i += 1
            continue
        word, i = match.group(), match.end()
        nxt = i
        while nxt < len(pattern) and pattern[nxt] in " \t\n":
            nxt += 1
        if word not in {"as", "type"} and (nxt >= len(pattern) or pattern[nxt] in ",=]})"):
            names.add(word)
    return names

def _until_eq(text: str, start: int) -> str:
    depth = 0
    for i in range(start, len(text)):
        char = text[i]
        if char in "[{(":
            depth += 1
        elif char in "]})":
            depth = max(0, depth - 1)
        elif char == "=" and depth == 0 and not text.startswith("=>", i):
            return text[start:i]
    return text[start:]

def _span(text: str, open_at: int, open_ch: str, close_ch: str, step: int) -> tuple[int, int] | None:
    depth, i, end = 0, open_at, len(text) if step > 0 else -1
    while i != end:
        if text[i] == open_ch:
            depth += 1
        elif text[i] == close_ch:
            depth -= 1
            if depth == 0:
                a, b = (open_at, i) if step > 0 else (i, open_at)
                return a, b
        i += step
    return None

def _declaration_pattern(text: str, start: int) -> str:
    """Pattern before `=` or for-of/for-in. Do not scan through to the next assignment."""
    depth, i, n, seen = 0, start, len(text), False
    while i < n:
        char = text[i]
        if char in "[{(":
            depth += 1
            seen = True
            i += 1
            continue
        if char in "]})":
            depth = max(0, depth - 1)
            i += 1
            continue
        if depth == 0 and char == "=" and not text.startswith("=>", i):
            return text[start:i]
        if char.isalpha() or char in "$_":
            match = _IDENT.match(text, i)
            word = match.group()
            if depth == 0 and seen and word in {"of", "in"}:
                return text[start:i]
            seen = True
            i = match.end()
            continue
        if char not in " \t\n\r":
            seen = True
        i += 1
    return text[start:]

def _local_bindings(text: str) -> set[str]:
    """Names bound inside `text`, including inner consts and parameters."""
    masked = _mask(text)
    names = set()
    for match in re.finditer(r"\b(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(", masked):
        if match.group(1):
            names.add(match.group(1))
        span = _span(masked, match.end() - 1, "(", ")", 1)
        if span:
            names |= _binding_names(masked[span[0] + 1:span[1]])
    for match in re.finditer(r"\bclass\s+([A-Za-z_$][\w$]*)", masked):
        names.add(match.group(1))
    for match in re.finditer(r"\b(?:const|let|var)\s+", masked):
        names |= _binding_names(_declaration_pattern(masked, match.end()))
    for match in re.finditer(r"(?:([A-Za-z_$][\w$]*)|\))\s*=>", masked):
        if match.group(1):
            names.add(match.group(1))
            continue
        span = _span(masked, match.start(), ")", "(", -1)
        if span:
            names |= _binding_names(masked[span[0] + 1:span[1]])
    return names

def _top_declared(text: str) -> set[str]:
    head = text.lstrip()
    match = re.match(r"(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)", head)
    if match:
        return {match.group(1)}
    match = re.match(r"(?:export\s+)?class\s+([A-Za-z_$][\w$]*)", head)
    if match:
        return {match.group(1)}
    match = re.match(r"(?:export\s+)?(?:const|let|var)\s+", head)
    if match:
        return _binding_names(_until_eq(head, match.end()))
    return set()

def _mask(text: str) -> str:
    """Blank comments and string contents so declaration scans do not see literals."""
    out, i, n, state, expr, depth = list(text), 0, len(text), "code", [], 0
    quotes = {"sq": "'", "dq": '"', "tpl": "`"}
    while i < n:
        if state == "line":
            if text[i] == "\n":
                state = "code"
            else:
                out[i] = " "
            i += 1
            continue
        if state == "block":
            if text.startswith("*/", i):
                out[i] = out[i + 1] = " "
                state, i = "code", i + 2
            else:
                out[i] = " " if text[i] != "\n" else out[i]
                i += 1
            continue
        if state in quotes:
            if text[i] == "\\" and i + 1 < n:
                out[i] = " "
                if text[i + 1] != "\n":
                    out[i + 1] = " "
                i += 2
                continue
            if state == "tpl" and text.startswith("${", i):
                expr.append(depth)
                depth, state, i = depth + 1, "code", i + 2
                continue
            if text[i] == quotes[state]:
                state = "code"
            elif text[i] != "\n":
                out[i] = " "
            i += 1
            continue
        if text.startswith("//", i):
            state, i = "line", i + 2
            continue
        if text.startswith("/*", i):
            state, i = "block", i + 2
            continue
        if text[i] in "'\"`":
            state, i = {v: k for k, v in quotes.items()}[text[i]], i + 1
            continue
        if text[i] in "([{":
            depth += 1
        elif text[i] in ")]}":
            depth -= 1
            if expr and depth == expr[-1]:
                expr.pop()
                state = "tpl"
            depth = max(0, depth)
        i += 1
    return "".join(out)

def _regex_at(text: str, i: int) -> bool:
    j = i - 1
    while j >= 0 and text[j] in " \t\r\n":
        j -= 1
    if j < 0 or text[j] in "([{:;,=!?&|~^%<>+-*\n":
        return True
    end = j + 1
    while j >= 0 and (text[j].isalnum() or text[j] in "$_"):
        j -= 1
    return text[j + 1:end] in _REGEX_WORD

def _consume_regex(text: str, i: int) -> int | None:
    k, n, klass = i + 1, len(text), False
    while k < n:
        if text[k] == "\n":
            return None
        if text[k] == "\\":
            k += 2
            continue
        if text[k] == "[" and not klass:
            klass = True
        elif text[k] == "]" and klass:
            klass = False
        elif text[k] == "/" and not klass:
            k += 1
            while k < n and text[k].isalpha():
                k += 1
            return k
        k += 1
    return None

def _statements(text: str) -> list[dict]:
    """Column-0 top-level statements. Identifiers omit properties and keywords."""
    starts, idents, current = [], [], []
    i, n = 0, len(text)
    state, depth, expr, prev = "code", 0, [], ""

    def flush(end):
        if starts:
            current.append({"text": text[starts[-1]:end], "idents": set(idents)})

    while i < n:
        at_line = i == 0 or text[i - 1] == "\n"
        if state == "code" and at_line and depth == 0 and text[i] not in " \t\r\n" and not text.startswith(("//", "/*", "*/"), i):
            flush(i)
            starts.append(i)
            idents = []
        if state == "line":
            state = "code" if text[i] == "\n" else state
            i += 1
            continue
        if state == "block":
            if text.startswith("*/", i):
                state, i = "code", i + 2
                continue
            i += 1
            continue
        if state in {"sq", "dq"}:
            quote = "'" if state == "sq" else '"'
            if text[i] == "\\":
                i += 2
                continue
            if text[i] == quote:
                state, prev = "code", quote
            i += 1
            continue
        if state == "tpl":
            if text[i] == "\\":
                i += 2
                continue
            if text[i] == "`":
                state, prev, i = "code", "`", i + 1
                continue
            if text.startswith("${", i):
                expr.append(depth)
                depth += 1
                state, prev, i = "code", "{", i + 2
                continue
            i += 1
            continue
        if text.startswith("//", i):
            state, i = "line", i + 2
            continue
        if text.startswith("/*", i):
            state, i = "block", i + 2
            continue
        if text[i] == "/" and i + 1 < n and text[i + 1] not in "/*" and _regex_at(text, i):
            end = _consume_regex(text, i)
            if end is not None:
                prev, i = "/", end
                continue
        if text[i] in "'\"`":
            state, i = {"'": "sq", '"': "dq", "`": "tpl"}[text[i]], i + 1
            continue
        match = _IDENT.match(text, i) if text[i].isalpha() or text[i] in "$_" else None
        if match:
            word = match.group()
            j = i - 1
            while j >= 0 and text[j] in " \t\r\n":
                j -= 1
            dots = 0
            while j >= 0 and text[j] == ".":
                dots += 1
                j -= 1
            # `...name` is a reference. `.name` and `1..name` are properties.
            if (prev != "." or dots == 3) and word not in _KEYWORDS:
                idents.append(word)
            prev, i = word[-1], match.end()
            continue
        if text[i] in "([{":
            depth += 1
        elif text[i] in ")]}":
            depth -= 1
            if text[i] == "}" and expr and depth == expr[-1]:
                expr.pop()
                state = "tpl"
            depth = max(0, depth)
        if text[i] not in " \t\r\n":
            prev = text[i]
        i += 1
    flush(n)
    return [item for item in current if item["text"].strip()]

def _kind(text: str) -> str:
    head = text.lstrip()
    if head.startswith("import "):
        return "import"
    if _TEST_STMT.match(head):
        return "test"
    if _HOOK_STMT.match(head):
        return "hook"
    if re.match(r"(?:export\s+)?(?:async\s+)?(?:function\b|class\b|const\b|let\b|var\b)", head):
        return "support"
    return "other"

def _split_commas(text: str) -> list[str]:
    parts, start, depth = [], 0, 0
    for i, char in enumerate(text):
        if char in "[{(":
            depth += 1
        elif char in "]})":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            parts.append(text[start:i])
            start = i + 1
    parts.append(text[start:])
    return parts

def _parse_import(text: str) -> dict | None:
    compact = re.sub(r"\s+", " ", text).strip().rstrip(";")
    side = re.fullmatch(r"import\s+(['\"])(.+)\1", compact)
    if side:
        return {"side": True, "quote": side.group(1), "module": side.group(2)}
    match = re.fullmatch(r"import\s+(.+?)\s+from\s+(['\"])(.+)\2", compact)
    if not match:
        return None
    body, quote, module = match.group(1), match.group(2), match.group(3)
    default, namespace, specs = "", "", []
    if body.startswith("* as "):
        namespace = body[5:].strip()
    elif "{" in body:
        brace = body.index("{")
        default = body[:brace].strip().rstrip(",").strip()
        specs = [part.strip() for part in _split_commas(body[brace + 1:body.rindex("}")]) if part.strip()]
    else:
        default = body.strip()
    return {"side": False, "quote": quote, "module": module, "default": default, "namespace": namespace, "specs": specs}

def _local_spec(spec: str) -> str:
    return re.sub(r"^type\s+", "", spec.strip()).rsplit(" as ", 1)[-1].strip()

def _emit_import(parsed: dict, used: set[str]) -> str | None:
    if parsed.get("side"):
        return f"import {parsed['quote']}{parsed['module']}{parsed['quote']};\n"
    kept = [spec for spec in parsed["specs"] if _local_spec(spec) in used]
    default = parsed["default"] if parsed["default"] and _local_spec(parsed["default"]) in used else ""
    namespace = parsed["namespace"] if parsed["namespace"] in used else ""
    if not kept and not default and not namespace:
        return None
    parts = []
    if default:
        parts.append(default)
    if namespace:
        parts.append(f"* as {namespace}")
    if kept:
        inner = ", ".join(kept)
        parts.append("{ " + inner + " }" if len(inner) <= 70 else "{\n" + "".join(f"  {spec},\n" for spec in kept) + "}")
    return f"import {', '.join(parts)} from {parsed['quote']}{parsed['module']}{parsed['quote']};\n"

def _refs(stmt: dict) -> set[str]:
    return set(stmt["idents"]) - _local_bindings(stmt["text"])

def _render(statements: list[dict], chosen: list[dict]) -> str:
    chosen_ids = {id(stmt) for stmt in chosen}
    included = {id(stmt) for stmt in statements if stmt["kind"] == "other"}
    needed = set()
    for stmt in statements:
        if id(stmt) in chosen_ids or stmt["kind"] == "other":
            needed |= _refs(stmt)
    changed = True
    while changed:
        changed = False
        declared = set()
        for stmt in statements:
            if stmt["kind"] == "support" and id(stmt) in included:
                declared |= stmt["declared"]
        for stmt in statements:
            if stmt["kind"] not in {"support", "hook"} or id(stmt) in included or id(stmt) in chosen_ids:
                continue
            take = stmt["declared"] & needed if stmt["kind"] == "support" else _refs(stmt) & declared
            if not take:
                continue
            included.add(id(stmt))
            needed |= _refs(stmt)
            changed = True
    used = set(needed)
    for stmt in statements:
        if id(stmt) in included:
            used |= _refs(stmt)
    chunks, body = [], []
    for stmt in statements:
        if stmt["kind"] != "import":
            continue
        emitted = stmt["text"] if stmt.get("parsed") is None else _emit_import(stmt["parsed"], used)
        if stmt.get("parsed") is None and not stmt["text"].endswith("\n"):
            emitted += "\n"
        if emitted:
            chunks.append(emitted)
    for stmt in statements:
        if stmt["kind"] == "import" or (id(stmt) not in included and id(stmt) not in chosen_ids):
            continue
        body.append(stmt["text"] if stmt["text"].endswith("\n") else stmt["text"] + "\n")
    text = "".join(chunks)
    if chunks and body and not text.endswith("\n\n"):
        text += "\n"
    text += "".join(body)
    return text if text.endswith("\n") or not text else text + "\n"

def _prepare(text: str) -> list[dict]:
    prepared = []
    for stmt in _statements(text):
        kind = _kind(stmt["text"])
        stmt["kind"] = kind
        stmt["declared"] = _top_declared(stmt["text"]) if kind == "support" else set()
        stmt["parsed"] = _parse_import(stmt["text"]) if kind == "import" else None
        prepared.append(stmt)
    return prepared

def split_test(path: str, text: str, *, limit: int = LIMIT) -> dict | None:
    """Split `path` into sibling test files of at most `limit` lines. None when it cannot."""
    if _TEST_PATH.fullmatch(path) is None or not isinstance(text, str) or line_count(text) <= limit:
        return None
    statements = _prepare(text)
    tests = [stmt for stmt in statements if stmt["kind"] == "test"]
    if len(tests) < 2:
        return None
    bins, current = [], []
    for stmt in tests:
        trial = [*current, stmt]
        if line_count(_render(statements, trial)) <= limit:
            current = trial
            continue
        if not current or line_count(_render(statements, [stmt])) > limit:
            return None
        bins.append(current)
        current = [stmt]
    if current:
        bins.append(current)
    if len(bins) < 2:
        return None
    match = _TEST_PATH.fullmatch(path)
    files, siblings = [], []
    for index, chosen in enumerate(bins, start=1):
        rendered = _render(statements, chosen)
        if line_count(rendered) > limit:
            return None
        if index == 1:
            files.append((path, rendered))
            continue
        sibling = f"{match.group('dir')}{match.group('stem')}.size500-{index}{match.group('kind')}{match.group('ext')}"
        siblings.append(sibling)
        files.append((sibling, rendered))
    return {"path": path, "files": files, "siblings": siblings}

def insert_siblings(source: str, parent: str, siblings: list[str]) -> str | None:
    """Insert quoted sibling paths once, on the line after the one quoted parent."""
    if not isinstance(source, str) or not siblings:
        return None
    found = list(re.finditer(r"(['\"])" + re.escape(parent) + r"\1", source))
    if len(found) != 1:
        return None
    quote = found[0].group(1)
    missing = [item for item in siblings if f"{quote}{item}{quote}" not in source]
    if not missing:
        return source
    line_end = source.find("\n", found[0].end())
    if line_end < 0:
        return None
    indent = re.match(r"[ \t]*", source[source.rfind("\n", 0, found[0].start()) + 1:]).group(0)
    block = "".join(f"{indent}{quote}{item}{quote},\n" for item in missing)
    return source[:line_end + 1] + block + source[line_end + 1:]
