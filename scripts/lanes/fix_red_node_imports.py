"""Base-proven named Node import unions for identifier-list conflicts.

Split from fix_red_classes and lane_runner so those files stay inside the
company size ceiling. Unknown hunks stay unresolved.
"""
from __future__ import annotations

import re
from pathlib import Path

from atomic_state import atomic_write_text

_IMPORT = re.compile(
    r"import \{ ([A-Za-z][A-Za-z0-9]*(?:, [A-Za-z][A-Za-z0-9]*)*) \} from '(node:[a-z_]+)';")


def merge_additive_node_imports(ours: str, theirs: str, base: str) -> str | None:
    """Union named Node imports only when both sides retain every base binding.

    No aliases, default imports, module changes or duplicate local bindings.
    The caller supplies Git's stage-1 source, never an inferred ancestor."""
    from fix_red_classes import merge_additive_identifier_list

    def parse(side: str):
        if not side.endswith("\n"):
            return None
        matches = [_IMPORT.fullmatch(line) for line in side.splitlines()]
        if not matches or any(match is None for match in matches):
            return None
        rows = [(match[2], match[1]) for match in matches]
        return None if len({module for module, _names in rows}) != len(rows) else rows

    head, main = parse(ours), parse(theirs)
    if not head or not main or [row[0] for row in head] != [row[0] for row in main]:
        return None
    merged: list[str] = []
    bindings: set[str] = set()
    for (module, head_names), (_, main_names) in zip(head, main):
        ancestor = [match[1] for line in base.splitlines()
                    if (match := _IMPORT.fullmatch(line)) and match[2] == module]
        if len(ancestor) > 1 or (not ancestor and module in base):
            return None
        original = ancestor[0].split(", ") if ancestor else []
        if any(not set(original).issubset(names.split(", ")) for names in (head_names, main_names)):
            return None
        names = merge_additive_identifier_list(head_names + "\n", main_names + "\n")
        if names is None:
            return None
        tokens = names.strip().split(", ")
        if bindings.intersection(tokens):
            return None
        bindings.update(tokens)
        merged.append(f"import {{ {names.strip()} }} from '{module}';\n")
    return "".join(merged)


def apply_identifier_resolution(worktree: Path, conflicted, sh, log) -> bool:
    """Write resolved identifier hunks. False leaves the caller to abort the merge.

    A union can collide with bindings in another hunk or untouched code. Node's
    parser checks each resolved .js/.mjs file; other source formats stay unchecked.
    """
    from fix_red_classes import resolve_additive_identifier_list_text

    resolved: dict[str, str] = {}
    for path in conflicted:
        target = worktree / path
        try:
            ancestor = sh(["git", "show", f":1:{path}"], cwd=worktree)
            base = ancestor.stdout if ancestor.returncode == 0 and target.suffix in {".js", ".mjs"} else ""
            text = resolve_additive_identifier_list_text(target.read_text(), base=base)
        except (OSError, UnicodeError):
            text = None
        if text is None:
            return False
        resolved[path] = text
    try:
        for path, text in resolved.items():
            atomic_write_text(worktree / path, text)
    except OSError:
        return False
    for path in resolved:
        if Path(path).suffix in {".js", ".mjs"} and sh(
                ["node", "--check", "--", path], cwd=worktree, log=log).returncode != 0:
            return False
    return True
