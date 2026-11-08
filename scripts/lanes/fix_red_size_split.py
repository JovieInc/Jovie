"""Split a new vitest file that company guards rejected for crossing 500 lines.

The size ratchet fails a file that is over 500 lines and absent from
scripts/company-guards/size-baseline.json. Baselined growth stays with the
model. This route moves trailing top-level suites into a sibling the original
test imports, and moves shared helpers into one fixtures module. The original
test file stays the ci-fast entry.
"""
from __future__ import annotations

import re
import types
from pathlib import Path

from atomic_state import atomic_write_text
from fix_red_js_scan import code_names, parse_statements

LIMIT = 500
# Company guards prints this for a file that is not in the shrink-only baseline.
# A "grew A -> B" line is a baselined file and must not match.
SIZE_500_NEW = re.compile(
    r"size-500: (?P<path>[A-Za-z0-9_./-]+\.(?:test|spec)\.(?:mjs|js)): "
    r"\d+ lines, over 500 and not baselined"
)
_TEST_FILE = re.compile(r"\.(?:test|spec)\.(?P<ext>mjs|js)$")
_IMPORT = re.compile(
    r"import\s+(.+?)\s+from\s+(['\"][^'\"]+['\"])\s*;?\s*$",
    re.S,
)


def count_lines(text: str) -> int:
    """Match company-guards size.mjs: split length, minus one when the file ends in a newline."""
    return len(text.split("\n")) - (1 if text.endswith("\n") else 0)


def paths_from_log(log: str) -> list[str]:
    """Repo-relative vitest paths from `over 500 and not baselined` lines, in order."""
    seen: list[str] = []
    for match in SIZE_500_NEW.finditer(str(log or "")):
        path = match.group("path")
        if path not in seen:
            seen.append(path)
    return seen


def _name_in(name: str, text: str) -> bool:
    return name in code_names(text)


def _referenced(text: str, names: list[str]) -> list[str]:
    return [name for name in names if _name_in(name, text)]


def _parse_import(text: str) -> dict | None:
    match = _IMPORT.match(text.strip())
    if not match:
        return None
    clause, module = match.group(1).strip(), match.group(2)
    default = None
    names: list[tuple[str, str]] = []
    if clause.startswith("*"):
        found = re.match(r"\*\s+as\s+([A-Za-z_$][\w$]*)", clause)
        if not found:
            return None
        return {"module": module, "default": None, "names": [], "namespace": found.group(1)}
    if clause.startswith("{"):
        named = clause
    elif "," in clause:
        default, named = clause.split(",", 1)
        default = default.strip()
    else:
        return {"module": module, "default": clause.strip(), "names": [], "namespace": None}
    inner = named.strip().removeprefix("{").removesuffix("}")
    for part in inner.split(","):
        part = part.strip()
        if not part:
            continue
        if " as " in part:
            imported, local = [piece.strip() for piece in part.split(" as ", 1)]
        else:
            imported = local = part
        if not re.match(r"[A-Za-z_$][\w$]*$", imported) or not re.match(r"[A-Za-z_$][\w$]*$", local):
            return None
        names.append((imported, local))
    return {"module": module, "default": default, "names": names, "namespace": None}


def _format_import(parsed: dict, used: set[str]) -> str | None:
    parts: list[str] = []
    if parsed["default"] and parsed["default"] in used:
        parts.append(parsed["default"])
    if parsed["namespace"] and parsed["namespace"] in used:
        parts.append(f"* as {parsed['namespace']}")
    named = [(imp, loc) for imp, loc in parsed["names"] if loc in used]
    if named:
        rendered = ", ".join(imp if imp == loc else f"{imp} as {loc}" for imp, loc in named)
        parts.append("{ " + rendered + " }")
    if not parts:
        return None
    return f"import {', '.join(parts)} from {parsed['module']};\n"


def _imports_for(statements: list, body: str) -> str:
    used = code_names(body)
    lines: list[str] = []
    for stmt in statements:
        if stmt.kind != "import":
            continue
        parsed = _parse_import(stmt.text)
        if parsed is None:
            if code_names(stmt.text) & used:
                lines.append(stmt.text.strip() + "\n")
            continue
        rendered = _format_import(parsed, used)
        if rendered:
            lines.append(rendered)
    return "".join(lines)


def _as_export(text: str) -> str:
    stripped = text.strip("\n")
    if re.search(r"(?m)^[ \t]*export\s+", stripped):
        return stripped + "\n"
    match = re.search(
        r"(?m)^(?P<indent>[ \t]*)(?P<kw>(?:async\s+)?(?:function|class)|const|let|var)\b",
        stripped,
    )
    if not match:
        return stripped + "\n"
    return stripped[:match.start("kw")] + "export " + stripped[match.start("kw"):] + "\n"


def _indent(text: str) -> str:
    return "\n".join(("  " + line) if line.strip() else "" for line in text.strip("\n").split("\n"))


def _finish(*parts: str) -> str:
    return "".join(parts).strip() + "\n"


def _closure(seed: set[str], bindings: list) -> set[str]:
    needed = set(seed)
    changed = True
    by_name = {stmt.names[0]: stmt for stmt in bindings if stmt.names}
    while changed:
        changed = False
        for name in list(needed):
            stmt = by_name.get(name)
            if stmt is None:
                continue
            for other in by_name:
                if other not in needed and _name_in(other, stmt.text):
                    needed.add(other)
                    changed = True
    return needed


def split_unbaselined_vitest(text: str, filename: str) -> dict[str, str] | None:
    """Return {owner, fixtures, cases} or None when a safe split is not possible.

    Every returned file is at most LIMIT lines. Trailing suites move into the
    cases module, which the owner imports so an existing single-file vitest
    command still collects them.
    """
    if count_lines(text) <= LIMIT or not _TEST_FILE.search(filename):
        return None
    if filename.startswith("/") or ".." in Path(filename).parts:
        return None
    statements = parse_statements(text)
    if statements is None:
        return None
    suites = [stmt for stmt in statements if stmt.kind in {"describe", "suite"}]
    bindings = [stmt for stmt in statements if stmt.kind == "binding"]
    if len(suites) < 2:
        return None
    path = Path(filename)
    stem = _TEST_FILE.sub("", path.name)
    ext = "." + _TEST_FILE.search(filename).group("ext")
    fixtures = str(path.with_name(stem + ".fixtures" + ext))
    cases = str(path.with_name(stem + ".cases" + ext))
    for count in range(1, len(suites)):
        pieces = _assemble(
            filename, fixtures, cases, "./" + Path(fixtures).name, "./" + Path(cases).name,
            statements, bindings, suites[:-count], suites[-count:],
        )
        if pieces and all(count_lines(body) <= LIMIT for body in pieces.values()):
            return pieces
    return None


def _assemble(filename, fixtures, cases, fixture_spec, cases_spec, statements, bindings, kept, moved):
    suite_text = "\n".join(stmt.text for stmt in kept + moved)
    exported = _closure(
        {stmt.names[0] for stmt in bindings if _name_in(stmt.names[0], suite_text)},
        bindings,
    )
    export_stmts = [stmt for stmt in bindings if stmt.names and stmt.names[0] in exported]
    export_names = {stmt.names[0] for stmt in export_stmts}
    hook_stmts = []
    for stmt in statements:
        if stmt.kind == "hook" or (stmt.kind == "binding" and stmt.names and stmt.names[0] not in exported):
            hook_stmts.append(stmt)
        elif stmt.kind == "other" and not any(_name_in(name, stmt.text) for name in export_names):
            hook_stmts.append(stmt)
    mocks = [stmt for stmt in statements if stmt.kind == "mock"]
    installer = ""
    names = [stmt.names[0] for stmt in export_stmts]
    if hook_stmts:
        installer = "export function installSplitSuiteHooks() {\n" + "\n".join(
            _indent(stmt.text) for stmt in hook_stmts) + "\n}\n"
        names.append("installSplitSuiteHooks")
    fixtures_body = _finish(_imports_for(statements, "".join(
        _as_export(stmt.text) for stmt in export_stmts) + installer),
        "".join(_as_export(stmt.text) for stmt in export_stmts), installer)

    def suite_file(suites: list, extra_mocks: bool) -> str:
        body = "".join(stmt.text.strip("\n") + "\n" for stmt in suites)
        needed = _referenced(body, names)
        if installer and "installSplitSuiteHooks" not in needed:
            needed.append("installSplitSuiteHooks")
        helper = f"import {{ {', '.join(needed)} }} from '{fixture_spec}';\n" if needed else ""
        call = "installSplitSuiteHooks();\n" if installer else ""
        mock_text = "".join(stmt.text.strip("\n") + "\n" for stmt in mocks) if extra_mocks else ""
        return _finish(_imports_for(statements, mock_text + body), helper, mock_text, call, body)

    import_locals: set[str] = set()
    for stmt in statements:
        if stmt.kind != "import":
            continue
        parsed = _parse_import(stmt.text)
        if parsed is None:
            continue
        if parsed["default"]:
            import_locals.add(parsed["default"])
        if parsed["namespace"]:
            import_locals.add(parsed["namespace"])
        import_locals.update(local for _imported, local in parsed["names"])
    mock_text = "".join(stmt.text for stmt in mocks)
    moved_text = "".join(stmt.text for stmt in moved)
    cases_mocks = any(_name_in(local, moved_text) and _name_in(local, mock_text) for local in import_locals)
    owner_body = suite_file(kept, True)
    # The cases module is a side-effect import so the owner's vitest command still collects it.
    side_effect = (
        "// Collected by this file's vitest command; not a second test entry.\n"
        f"import '{cases_spec}';\n"
    )
    owner_lines = owner_body.split("\n")
    last_import = max((index for index, line in enumerate(owner_lines) if line.startswith("import ")), default=-1)
    owner_lines.insert(last_import + 1, side_effect.rstrip("\n"))
    owner_body = "\n".join(owner_lines)
    if not owner_body.endswith("\n"):
        owner_body += "\n"
    pieces = {filename: owner_body, fixtures: fixtures_body, cases: suite_file(moved, cases_mocks)}
    if any(not body.strip() for body in pieces.values()):
        return None
    return pieces


def apply(sh, pr, worktree, log, receipt, files):
    """Split each listed vitest file in `worktree`, then commit and push. None when nothing applies."""
    root = Path(worktree)
    changed: list[str] = []
    for rel in files or []:
        rel = str(rel).replace("\\", "/")
        if not rel or rel.startswith("/") or ".." in Path(rel).parts:
            continue
        source = root / rel
        if not source.is_file():
            continue
        pieces = split_unbaselined_vitest(source.read_text(), rel)
        if not pieces:
            continue
        if any(name != rel and (root / name).exists() for name in pieces):
            continue
        for name, body in pieces.items():
            if count_lines(body) > LIMIT:
                return None
            dest = root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_text(dest, body)
            changed.append(name)
    if not changed:
        return None
    message = "fix(ci): split unbaselined vitest files under the 500-line guard"
    pushed = f"HEAD:{pr['headRefName']}"
    steps = [
        ["git", "add", "--", *changed],
        ["git", "commit", "-q", "-m", message],
        ["git", "push", "-q", "origin", pushed],
    ]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution="split-size-500", splitFiles=changed)
    return types.SimpleNamespace(returncode=0)
