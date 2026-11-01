#!/usr/bin/env python3
"""Route one exact `gh` subprocess helper through `packages/api-client` `runGh`.

external-api-guard's `gh-subprocess` rule rejects a new
`spawnSync('gh', ...)` (and the other exec/spawn forms). Release scripts keep
reintroducing the same four-line helper, then `JSON.parse` the stdout. Replacing
only the helper leaves callers holding a Promise.

`rewrite` performs the whole mechanical edit or returns None. It matches one
exact synchronous helper, imports `runGh` at deploy priority, promotes direct
callers to `async`, and awaits those calls. A nested call that is not the
`readMarker: () => readMarkerOnline(...)` callback shape returns None so a
later `await` cannot land inside a non-async arrow.

This module is the pure edit. The fix-red dispatcher on current main
(`fix_red_classes.SIGNATURES` and the `lane_runner` fixer map) still has to
call `rewrite` for the class to run unattended. That registration is a
follow-up: those two files diverge from this branch, and editing them here
conflicts on merge.
"""
from __future__ import annotations

import re
from pathlib import PurePosixPath

LOG_TEXT = re.compile(
    r"gh-subprocess:\s+\d+\s+direct call\(s\),\s+\d+\s+grandfathered"
)
FILE_TEXT = re.compile(
    r"(?P<path>[\w./-]+\.(?:mjs|cjs|js|ts|tsx)):\d+\s+gh-subprocess:"
)
GH_SPAWN = re.compile(
    r"""\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\(\s*['"`]gh\b"""
    r"""|`gh\s+(?:api|pr|run|auth|repo|issue|release|workflow|label|variable|secret|cache|gpg|ssh|codespace|extension|gist|search|browse|alias)\b"""
)
HELPER = (
    "function gh(args) {\n"
    "  const run = spawnSync('gh', args, { encoding: 'utf8' });\n"
    "  if (run.status !== 0) throw new Error(run.stderr || 'gh failed');\n"
    "  return run.stdout;\n"
    "}"
)
ASYNC_HELPER = (
    "async function gh(args) {\n"
    "  const run = await runGh(args, { priority: 'deploy' });\n"
    "  if (run.deferred || run.code !== 0) {\n"
    "    throw new Error(run.stderr || 'gh failed');\n"
    "  }\n"
    "  return run.stdout;\n"
    "}"
)
_IMPORT = re.compile(
    r"""^import\s+(?:type\s+)?[\w*\s{},]+\s+from\s+['"]([^'"]+)['"];\s*$"""
)
_IDENT = re.compile(r"[A-Za-z_$][\w$]*")


def files_from_log(text: str) -> list[str]:
    """Repo-relative files named on `gh-subprocess:` guard lines."""
    return sorted({match.group("path") for match in FILE_TEXT.finditer(text or "")})


def run_gh_specifier(repo_path: str) -> str | None:
    """Relative specifier from a repo-relative file to `packages/api-client/gh.ts`."""
    path = PurePosixPath(str(repo_path or "").replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or not path.parts:
        return None
    ups = len(path.parts) - 1
    prefix = "../" * ups if ups else "./"
    return f"{prefix}packages/api-client/gh.ts"


def rewrite(source: str, repo_path: str) -> str | None:
    """Return the routed source, or None when the exact helper is absent or unsafe."""
    if "\r" in (source or "") or source.count(HELPER) != 1:
        return None
    specifier = run_gh_specifier(repo_path)
    if specifier is None:
        return None
    updated = source.replace(HELPER, ASYNC_HELPER, 1)
    updated = _insert_import(updated, specifier)
    if updated is None:
        return None
    promoted = _promote(updated)
    if promoted is None or GH_SPAWN.search(promoted):
        return None
    return promoted


def _insert_import(source: str, specifier: str) -> str | None:
    line = f"import {{ runGh }} from '{specifier}';"
    if line in source:
        return source
    lines = source.split("\n")
    start = next((i for i, row in enumerate(lines) if row.startswith("import ")), None)
    if start is None:
        return None
    end = start
    for index in range(start, len(lines)):
        row = lines[index]
        if row.startswith("import ") or row.strip() == "":
            if row.startswith("import "):
                end = index + 1
            continue
        break
    block = lines[start:end]
    if any(row.strip() and not row.startswith("import ") for row in block):
        return None
    imports = [row for row in block if row.startswith("import ")]
    if any(_IMPORT.match(row) is None for row in imports):
        return None
    imports.append(line)
    node, other = [], []
    for row in imports:
        spec = _IMPORT.match(row).group(1)
        (node if spec.startswith("node:") else other).append((spec, row))
    node.sort(key=lambda item: item[0])
    other.sort(key=lambda item: item[0])
    ordered = [row for _, row in node]
    if node and other:
        ordered.append("")
    ordered.extend(row for _, row in other)
    return "\n".join(lines[:start] + ordered + lines[end:])


class _Func:
    def __init__(self, name: str, keyword: int, is_async: bool, body_open: int, body_close: int):
        self.name = name
        self.keyword = keyword
        self.is_async = is_async
        self.body_open = body_open
        self.body_close = body_close


def _promote(source: str) -> str | None:
    funcs = _functions(source)
    if len({func.name for func in funcs}) != len(funcs):
        return None
    by_name = {func.name: func for func in funcs}
    if "gh" not in by_name or not by_name["gh"].is_async:
        return None
    direct: dict[str, list[tuple[int, str, bool]]] = {}
    aliases: dict[str, str] = {}
    nested: list[tuple[str, bool]] = []
    for func in funcs:
        found = _body_calls(source, func.body_open + 1, func.body_close)
        if found is None:
            return None
        direct[func.name], func_aliases, func_nested = found
        for prop, callee in func_aliases:
            if prop in aliases and aliases[prop] != callee:
                return None
            aliases[prop] = callee
        nested.extend(func_nested)
    async_names = {func.name for func in funcs if func.is_async}
    changed = True
    while changed:
        changed = False
        for func in funcs:
            if func.name in async_names:
                continue
            if any(name in async_names for _, name, _ in direct[func.name]):
                async_names.add(func.name)
                changed = True
    allowed_nested = set()
    for prop, callee in aliases.items():
        if callee not in async_names:
            continue
        allowed_nested.add(callee)
        if prop in by_name:
            return None
    for name, pure_alias in nested:
        if name in async_names or (name in aliases and aliases[name] in async_names):
            if not (pure_alias and name in allowed_nested):
                return None
    edits: list[tuple[int, str]] = []
    for func in funcs:
        if func.name in async_names and not func.is_async:
            edits.append((func.keyword, "async "))
        for pos, name, awaited in direct[func.name]:
            target = name in async_names or (
                name in aliases and aliases[name] in async_names
            )
            if target and not awaited:
                edits.append((pos, "await "))
    if any(func.name in {"if", "for", "while", "switch", "catch"} for func in funcs):
        return None
    for pos, text in sorted(edits, key=lambda item: item[0], reverse=True):
        source = source[:pos] + text + source[pos:]
    return source


def _functions(source: str) -> list[_Func]:
    found = []
    i, n = 0, len(source)
    while i < n:
        skipped = _skip_ignorable(source, i)
        if skipped is not None:
            i = skipped
            continue
        if source.startswith("function", i) and _boundary(source, i, 8):
            keyword = i
            is_async = _preceded_by(source, i, "async")
            j = _skip_space(source, i + 8)
            match = _IDENT.match(source, j)
            if match is None:
                i += 8
                continue
            name = match.group(0)
            j = _skip_space(source, match.end())
            if j >= n or source[j] != "(":
                i += 8
                continue
            close = _matching(source, j, "(", ")")
            if close is None:
                return found
            j = _skip_space(source, close + 1)
            if j >= n or source[j] != "{":
                i += 8
                continue
            end = _matching(source, j, "{", "}")
            if end is None:
                return found
            found.append(_Func(name, keyword, is_async, j, end))
            i = end + 1
            continue
        i += 1
    return found


def _body_calls(source: str, start: int, end: int):
    """Direct calls, `prop: () => callee(...)` aliases, and other nested calls."""
    direct = []
    aliases = []
    nested = []
    i = start
    while i < end:
        skipped = _skip_ignorable(source, i)
        if skipped is not None:
            i = skipped
            continue
        if source.startswith("function", i) and _boundary(source, i, 8):
            name_at = _skip_space(source, i + 8)
            match = _IDENT.match(source, name_at)
            j = match.end() if match else name_at
            j = _skip_space(source, j)
            if j < end and source[j] == "(":
                close = _matching(source, j, "(", ")")
                if close is None:
                    return None
                j = _skip_space(source, close + 1)
            if j < end and source[j] == "{":
                block_end = _matching(source, j, "{", "}")
                if block_end is None:
                    return None
                inner = _calls_between(source, j + 1, block_end)
                if inner is None:
                    return None
                nested.extend((name, False) for name in inner)
                i = block_end + 1
                continue
        if source.startswith("=>", i):
            expr = _skip_space(source, i + 2)
            parsed = _arrow_expression(source, expr, end)
            if parsed is None:
                return None
            expr_end, calls, pure = parsed
            prop = _arrow_property(source, i)
            if pure and prop and len(calls) == 1:
                aliases.append((prop, calls[0]))
                nested.append((calls[0], True))
            else:
                nested.extend((name, False) for name in calls)
            i = expr_end
            continue
        match = _IDENT.match(source, i)
        if match and _call_at(source, match.end(), end):
            name = match.group(0)
            if name not in {"if", "for", "while", "switch", "catch", "function"}:
                direct.append((match.start(), name, _preceded_by(source, match.start(), "await")))
            i = match.end()
            continue
        i += 1
    return direct, aliases, nested


def _arrow_property(source: str, arrow: int) -> str | None:
    head = source[:arrow]
    match = re.search(
        r"(\b[A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\([^()\n]*\)\s*$",
        head,
    )
    return match.group(1) if match else None


def _arrow_expression(source: str, start: int, limit: int):
    if start >= limit:
        return None
    if source[start] == "{":
        end = _matching(source, start, "{", "}")
        if end is None or end > limit:
            return None
        calls = _calls_between(source, start + 1, end)
        if calls is None:
            return None
        return end + 1, calls, False
    name = None
    match = _IDENT.match(source, start)
    if match and _call_at(source, match.end(), limit):
        paren = _skip_space(source, match.end())
        close = _matching(source, paren, "(", ")")
        if close is None:
            return None
        tail = source[close + 1:limit]
        if re.match(r"\s*(?:[,;]|$)", tail):
            arg_calls = _calls_between(source, paren + 1, close) or []
            if arg_calls:
                return close + 1, [match.group(0), *arg_calls], False
            return close + 1, [match.group(0)], True
    calls = []
    i = start
    depth = 0
    while i < limit:
        skipped = _skip_ignorable(source, i)
        if skipped is not None:
            i = skipped
            continue
        char = source[i]
        if char in "([{":
            depth += 1
            i += 1
            continue
        if char in ")]}":
            if depth == 0:
                break
            depth -= 1
            i += 1
            continue
        if depth == 0 and char in ",;":
            break
        ident = _IDENT.match(source, i)
        if ident and _call_at(source, ident.end(), limit):
            calls.append(ident.group(0))
            i = ident.end()
            continue
        i += 1
    if name:
        calls.insert(0, name)
    return i, calls, False


def _calls_between(source: str, start: int, end: int) -> list[str] | None:
    found = []
    i = start
    while i < end:
        skipped = _skip_ignorable(source, i)
        if skipped is not None:
            i = skipped
            continue
        if source.startswith("=>", i):
            parsed = _arrow_expression(source, _skip_space(source, i + 2), end)
            if parsed is None:
                return None
            expr_end, calls, _pure = parsed
            found.extend(calls)
            i = expr_end
            continue
        match = _IDENT.match(source, i)
        if match and _call_at(source, match.end(), end):
            name = match.group(0)
            if name not in {"if", "for", "while", "switch", "catch", "function"}:
                found.append(name)
            i = match.end()
            continue
        i += 1
    return found


def _call_at(source: str, index: int, limit: int) -> bool:
    if index > 0 and source[index - 1] == ".":
        return False
    probe = index - 1
    while probe >= 0 and source[probe] in " \t":
        probe -= 1
    if probe >= 0 and source[probe] == ".":
        return False
    j = _skip_space(source, index)
    return j < limit and j < len(source) and source[j] == "("


def _matching(source: str, open_at: int, open_ch: str, close_ch: str) -> int | None:
    depth = 0
    i = open_at
    pairs = {"(": ")", "{": "}", "[": "]"}
    while i < len(source):
        skipped = _skip_ignorable(source, i)
        if skipped is not None:
            i = skipped
            continue
        char = source[i]
        if char == open_ch:
            depth += 1
        elif char == close_ch:
            depth -= 1
            if depth == 0:
                return i
        elif char in pairs and char != open_ch:
            end = _matching(source, i, char, pairs[char])
            if end is None:
                return None
            i = end
        i += 1
    return None


def _skip_ignorable(source: str, i: int) -> int | None:
    if i >= len(source):
        return None
    if source.startswith("//", i):
        nl = source.find("\n", i)
        return len(source) if nl < 0 else nl + 1
    if source.startswith("/*", i):
        end = source.find("*/", i + 2)
        return len(source) if end < 0 else end + 2
    if source[i] in "\"'":
        return _skip_quoted(source, i, source[i])
    if source[i] == "`":
        return _skip_template(source, i)
    return None


def _skip_quoted(source: str, i: int, quote: str) -> int:
    i += 1
    while i < len(source):
        if source[i] == "\\":
            i += 2
            continue
        if source[i] == quote:
            return i + 1
        i += 1
    return i


def _skip_template(source: str, i: int) -> int:
    i += 1
    while i < len(source):
        if source[i] == "\\":
            i += 2
            continue
        if source.startswith("${", i):
            end = _matching(source, i + 1, "{", "}")
            i = len(source) if end is None else end + 1
            continue
        if source[i] == "`":
            return i + 1
        i += 1
    return i


def _skip_space(source: str, i: int) -> int:
    while i < len(source) and source[i] in " \t\r\n":
        i += 1
    return i


def _boundary(source: str, i: int, length: int) -> bool:
    before = i == 0 or not (source[i - 1].isalnum() or source[i - 1] in "_$")
    after_at = i + length
    after = after_at >= len(source) or not (source[after_at].isalnum() or source[after_at] in "_$")
    return before and after


def _preceded_by(source: str, i: int, word: str) -> bool:
    j = i
    while j > 0 and source[j - 1] in " \t\n":
        j -= 1
    start = j - len(word)
    if start < 0 or source[start:j] != word:
        return False
    return start == 0 or not (source[start - 1].isalnum() or source[start - 1] in "_$")
