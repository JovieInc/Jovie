"""Resolve a merge where both sides extracted the same helpers into different modules.

Main keeps the identical definitions. The head module keeps only its own names and
imports the shared ones back from main's module. Any other hunk stays unresolved.
"""
from __future__ import annotations

import ast
import re
import subprocess
from pathlib import Path

_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)",
    re.M | re.S)
_IMPORT = re.compile(
    r"(?P<indent>[ \t]*)from (?P<mod>[A-Za-z_][A-Za-z0-9_]*) import "
    r"(?P<names>[A-Za-z_][A-Za-z0-9_]*(?:, [A-Za-z_][A-Za-z0-9_]*)*)\Z")
_LANE_FILE = re.compile(r"scripts/lanes/[A-Za-z_][A-Za-z0-9_]*\.py\Z")


def resolve_split_helper_conflict(worktree: Path, rel: str) -> tuple[str, dict[str, str]] | None:
    """Return the resolved consumer and rewritten head modules, or None to leave the merge."""
    try:
        return _resolve(Path(worktree), str(rel))
    except (OSError, UnicodeError, SyntaxError, ValueError):
        return None


def _resolve(worktree: Path, rel: str) -> tuple[str, dict[str, str]] | None:
    if _LANE_FILE.fullmatch(rel) is None:
        return None
    consumer = (worktree / rel).read_text()
    hunks = list(_HUNK.finditer(consumer))
    if not hunks or _marked(_HUNK.sub("\n", consumer)):
        return None
    parsed = []
    for hunk in hunks:
        item = _parse_hunk(hunk)
        if item is None:
            return None
        parsed.append(item)
    referenced = _loaded( _HUNK.sub("\n", consumer))
    modules = _load_modules(worktree, parsed)
    if referenced is None or modules is None:
        return None
    owners = _owners(parsed, modules)
    if owners is None:
        return None
    writes = _rewrite(modules, owners)
    resolved = _rebuild(consumer, parsed, referenced, owners)
    if writes is None or resolved is None or _marked(resolved) or resolved == consumer:
        return None
    return resolved, writes


def _parse_hunk(hunk: re.Match):
    ours, theirs = _parse_import(hunk.group("ours")), _parse_import(hunk.group("theirs"))
    if ours is None or theirs is None or ours[0] != theirs[0] or ours[1] == theirs[1]:
        return None
    return hunk, ours, theirs


def _parse_import(block: str) -> tuple[str, str, list[str]] | None:
    lines = block.splitlines()
    if len(lines) != 1:
        return None
    match = _IMPORT.fullmatch(lines[0])
    if match is None:
        return None
    names = match.group("names").split(", ")
    if len(names) != len(set(names)):
        return None
    return match.group("indent"), match.group("mod"), names


def _load_modules(worktree: Path, parsed) -> dict[str, dict] | None:
    wanted: dict[str, str] = {}
    for _, ours, theirs in parsed:
        for mod, rev in ((ours[1], "HEAD"), (theirs[1], "MERGE_HEAD")):
            path = f"scripts/lanes/{mod}.py"
            if wanted.setdefault(path, rev) != rev:
                return None
    loaded = {}
    for path, rev in wanted.items():
        blob = _git_show(worktree, rev, path)
        disk = worktree / path
        if blob is None or not disk.is_file() or disk.read_text() != blob:
            return None
        definitions = _definitions(blob)
        if definitions is None:
            return None
        loaded[path] = {"source": blob, "defs": definitions}
    for _, ours, theirs in parsed:
        if _imports_module(loaded[f"scripts/lanes/{theirs[1]}.py"]["source"], ours[1]):
            return None
    return loaded


def _owners(parsed, modules: dict[str, dict]) -> dict[tuple[str, str], tuple[str, str]] | None:
    """Map (head module, name) to (place, canonical module). place is canonical or head."""
    owners: dict[tuple[str, str], tuple[str, str]] = {}
    for _, ours, theirs in parsed:
        head, canonical = modules[f"scripts/lanes/{ours[1]}.py"], modules[f"scripts/lanes/{theirs[1]}.py"]
        for name in _ordered(theirs[2], ours[2]):
            place = _place(name, head["defs"], canonical["defs"])
            if place is None:
                return None
            key = (ours[1], name)
            decision = (place, theirs[1])
            if owners.get(key, decision) != decision:
                return None
            owners[key] = decision
    return owners


def _place(name: str, head: dict[str, ast.stmt], canonical: dict[str, ast.stmt]) -> str | None:
    in_head, in_canonical = name in head, name in canonical
    if not in_head and not in_canonical:
        return None
    if in_head and in_canonical:
        same = ast.dump(head[name], include_attributes=False) == ast.dump(canonical[name], include_attributes=False)
        return "canonical" if same else None
    return "canonical" if in_canonical else "head"


def _rewrite(modules: dict[str, dict], owners) -> dict[str, str] | None:
    by_head: dict[str, list[tuple[str, str]]] = {}
    for (head_mod, name), (place, canonical_mod) in owners.items():
        if place == "canonical" and name in modules[f"scripts/lanes/{head_mod}.py"]["defs"]:
            by_head.setdefault(head_mod, []).append((name, canonical_mod))
    writes = {}
    for head_mod, pairs in by_head.items():
        path = f"scripts/lanes/{head_mod}.py"
        rewritten = _strip_and_import(modules[path]["source"], pairs)
        if rewritten is None:
            return None
        if _imports_module(rewritten, head_mod):
            return None
        if rewritten != modules[path]["source"]:
            writes[path] = rewritten
    return writes


def _rebuild(consumer: str, parsed, referenced: set[str], owners) -> str | None:
    pieces = []
    last = 0
    for hunk, ours, theirs in parsed:
        block = _import_block(ours, theirs, referenced, owners)
        if block is None:
            return None
        pieces.append(consumer[last:hunk.start()])
        pieces.append(block)
        last = hunk.end()
    pieces.append(consumer[last:])
    return "".join(pieces)


def _import_block(ours, theirs, referenced: set[str], owners) -> str | None:
    indent, head_mod, ours_names = ours
    canonical_mod, theirs_names = theirs[1], theirs[2]
    canonical, head = [], []
    for name in _ordered(theirs_names, ours_names):
        if name not in referenced:
            continue
        place, mod = owners[(head_mod, name)]
        target = canonical if place == "canonical" else head
        if name not in target:
            target.append(name)
        if place == "canonical" and mod != canonical_mod:
            return None
    if not canonical and not head:
        return None
    lines = []
    if canonical:
        lines.append(f"{indent}from {canonical_mod} import {', '.join(canonical)}")
    if head:
        lines.append(f"{indent}from {head_mod} import {', '.join(head)}")
    return "\n".join(lines) + "\n"


def _strip_and_import(source: str, pairs: list[tuple[str, str]]) -> str | None:
    remove = [name for name, _mod in pairs]
    stripped = _delete(source, remove)
    if stripped is None:
        return None
    loaded = _loaded(stripped, set(remove))
    if loaded is None:
        return None
    groups: dict[str, list[str]] = {}
    for name, mod in pairs:
        if name in loaded and name not in groups.get(mod, []):
            groups.setdefault(mod, []).append(name)
    if not groups:
        return stripped
    return _add_imports(stripped, list(groups.items()))


def _delete(source: str, remove: list[str]) -> str | None:
    defs = _definitions(source)
    if defs is None:
        return None
    wanted = set(remove)
    chosen = []
    for name in remove:
        stmt = defs.get(name)
        if stmt is None or any(item is stmt for item in chosen):
            if stmt is None:
                return None
            continue
        bound = [item for item, owner in defs.items() if owner is stmt]
        if not set(bound) <= wanted:
            return None
        chosen.append(stmt)
    if not chosen:
        return source
    drop = set()
    for stmt in chosen:
        if stmt.end_lineno is None:
            return None
        drop.update(range(stmt.lineno, stmt.end_lineno + 1))
    kept = [line for number, line in enumerate(source.splitlines(keepends=True), start=1) if number not in drop]
    text = re.sub(r"\n{3,}", "\n\n", "".join(kept))
    try:
        ast.parse(text)
    except SyntaxError:
        return None
    return text


def _add_imports(source: str, groups: list[tuple[str, list[str]]]) -> str | None:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    lines = source.splitlines(keepends=True)
    pending = []
    for mod, names in groups:
        stmt = _existing_import(tree, mod)
        if stmt == "reject":
            return None
        if isinstance(stmt, ast.ImportFrom):
            if stmt.lineno != stmt.end_lineno or any(alias.asname for alias in stmt.names):
                return None
            current = [alias.name for alias in stmt.names]
            lines[stmt.lineno - 1] = f"from {mod} import {', '.join(_ordered(current, names))}\n"
        else:
            pending.append(f"from {mod} import {', '.join(names)}\n")
    if pending:
        for offset, line in enumerate(pending):
            lines.insert(_insert_at(tree) + offset, line)
    text = "".join(lines)
    try:
        ast.parse(text)
    except SyntaxError:
        return None
    return text


def _existing_import(tree: ast.AST, mod: str):
    found = None
    for stmt in tree.body if isinstance(tree, ast.Module) else []:
        if not isinstance(stmt, ast.ImportFrom) or stmt.module != mod or stmt.level:
            continue
        if found is not None or stmt.lineno != stmt.end_lineno:
            return "reject"
        found = stmt
    return found


def _insert_at(tree: ast.Module) -> int:
    insert_at = 0
    for index, stmt in enumerate(tree.body):
        if index == 0 and _docstring(stmt):
            insert_at = stmt.end_lineno or 0
            continue
        if isinstance(stmt, (ast.Import, ast.ImportFrom)):
            insert_at = stmt.end_lineno or insert_at
            continue
        break
    return insert_at


def _definitions(source: str) -> dict[str, ast.stmt] | None:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    found: dict[str, ast.stmt] = {}
    for stmt in tree.body:
        names = _bound(stmt)
        if names is None:
            return None
        if any(name in found for name in names) or len(names) != len(set(names)):
            return None
        for name in names:
            found[name] = stmt
    return found


def _bound(stmt: ast.stmt) -> list[str] | None:
    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return [stmt.name]
    if isinstance(stmt, ast.Assign):
        names = []
        for target in stmt.targets:
            part = _target_names(target)
            if part is None:
                return None
            names.extend(part)
        return names
    if isinstance(stmt, ast.AnnAssign) and stmt.value is not None:
        return _target_names(stmt.target)
    return []


def _target_names(target: ast.AST) -> list[str] | None:
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        names = []
        for elt in target.elts:
            part = _target_names(elt)
            if part is None:
                return None
            names.extend(part)
        return names
    return None


def _loaded(source: str, limit: set[str] | None = None) -> set[str] | None:
    """Names loaded from source. A store of a limited name fails closed; other stores are ignored."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    found = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Name) or (limit is not None and node.id not in limit):
            continue
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            if limit is not None:
                return None
            continue
        found.add(node.id)
    return found


def _imports_module(source: str, mod: str) -> bool:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return True
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == mod:
            return True
        if isinstance(node, ast.Import) and any(alias.name == mod or alias.name.startswith(mod + ".") for alias in node.names):
            return True
    return False


def _docstring(stmt: ast.stmt) -> bool:
    return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str)


def _ordered(*groups: list[str]) -> list[str]:
    ordered = []
    for group in groups:
        for name in group:
            if name not in ordered:
                ordered.append(name)
    return ordered


def _marked(text: str) -> bool:
    return "<<<<<<<" in text or ">>>>>>>" in text


def _git_show(worktree: Path, rev: str, rel: str) -> str | None:
    if rev not in {"HEAD", "MERGE_HEAD"} or _LANE_FILE.fullmatch(rel) is None:
        return None
    done = subprocess.run(["git", "show", f"{rev}:{rel}"], cwd=worktree, capture_output=True, text=True)
    if done.returncode != 0:
        return None
    return done.stdout
