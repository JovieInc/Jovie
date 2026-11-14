"""Three-stage conflict resolvers for the fix-red no-model merge routes.

Renders Git's three index stages as one diff3 conflict and resolves only the
shapes proven additive: complete node:test blocks, Vitest statement
insertions, and component waiver rows. Split from fix_red_source_edits.py so
that module stays within the 500-line company budget. Callers still reach
every resolver through fix_red_source_edits.
"""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from atomic_state import atomic_write_text
from fix_red_statement_merge import (resolve_additive_statements_text,
                                     resolve_shared_closer_it_text, unique_import_bindings)


def resolve_additive_node_tests_text(text: str) -> str | None:
    """Union complete top-level node:test additions against an empty diff3 base.

    Main order wins. Existing-test edits, shared names with different bodies,
    partial statements and unknown hunks stay unresolved. This is deliberately
    narrower than a JavaScript parser; it never rewrites assertions.
    """
    hunk = re.compile(
        r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^\|{7}[^\n]*\n(?P<base>.*?)"
        r"^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*(?:\n|\Z)", re.M | re.S)
    block = re.compile(
        r"test\('(?P<name>[^'\n]+)', (?:async )?\(\) => \{\n"
        r"(?:[ \t]+[^\n]*\n|\n)*?\}\);\n(?:\n)*")

    def tests(side):
        found, offset = {}, 0
        for match in block.finditer(side):
            name = match['name']
            if match.start() != offset or name in found:
                return None
            found[name] = match[0]
            offset = match.end()
        return found if found and offset == len(side) else None

    matches = list(hunk.finditer(text))
    if not matches:
        return None
    for match in reversed(matches):
        if match['base']:
            return None
        ours, theirs = tests(match['ours']), tests(match['theirs'])
        if ours is None or theirs is None:
            return None
        if any(ours[name] != theirs[name] for name in ours.keys() & theirs.keys()):
            return None
        merged = ''.join(theirs.values()) + ''.join(value for name, value in ours.items() if name not in theirs)
        text = text[:match.start()] + merged + text[match.end():]
    return None if re.search(r"(?m)^(?:<{7}|\|{7}|={7}|>{7})", text) else text


def _diff3_conflict(worktree: Path, rel: str, sh) -> str | None:
    """Render Git's three stages as one diff3 conflict. None unless merge-file reports conflicts."""
    with tempfile.TemporaryDirectory() as scratch:
        paths = []
        for stage in (2, 1, 3):  # merge-file expects ours, base, theirs
            blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
            if blob.returncode:
                return None
            path = Path(scratch) / str(stage)
            atomic_write_text(path, blob.stdout)
            paths.append(str(path))
        probe = sh(["git", "merge-file", "-p", "--diff3", *paths], cwd=worktree)
        # Git returns the conflict count (capped at 127); errors wrap above it.
        if not 1 <= probe.returncode <= 127:
            return None
        return probe.stdout


# Next.js route groups, dynamic segments, parallel routes and intercepts.
_TEST_PATH = r"[\w./()[\]@+-]+"


def resolve_additive_node_test_file(worktree: Path, rel: str, sh) -> str | None:
    """Use Git's actual three stages to prove test conflicts are insertions only."""
    if not re.fullmatch(_TEST_PATH + r"\.(?:test|spec)\.mjs", rel):
        return None
    conflict = _diff3_conflict(worktree, rel, sh)
    if conflict is None:
        return None
    return resolve_additive_node_tests_text(conflict)


def resolve_additive_statement_file(worktree: Path, rel: str, sh) -> str | None:
    """Union empty-base statement insertions in a Vitest file, proven from Git's three stages.

    A two-way `it()` pair that shares one trailing `});` is resolved from the
    on-disk conflict first. Any other shape still needs the diff3 stages.
    """
    if not re.fullmatch(_TEST_PATH + r"\.(?:test|spec)\.tsx?", rel):
        return None
    try:
        disk = (worktree / rel).read_text()
    except (OSError, UnicodeError):
        disk = ""
    if "<<<<<<<" in disk:
        shared = resolve_shared_closer_it_text(disk)
        if shared is not None:
            return shared
    conflict = _diff3_conflict(worktree, rel, sh)
    if conflict is None:
        return None
    return resolve_additive_statements_text(
        conflict, validate_imports=lambda text, spans: unique_import_bindings(text, worktree, sh, spans))


def _unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _load_json_object_stages(worktree: Path, rel: str, sh, field: str, accept) -> tuple[dict, dict, dict] | None:
    """Base, ours, and theirs for one JSON object field.

    None unless every stage is one object, `accept` passes the field, and every
    other field still matches base."""
    documents = []
    for stage in (1, 2, 3):
        blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
        if blob.returncode:
            return None
        try:
            document = json.loads(blob.stdout, object_pairs_hook=_unique_json_object)
        except (ValueError, TypeError):
            return None
        if not isinstance(document, dict) or not accept(document.get(field)):
            return None
        documents.append(document)
    base, ours, theirs = documents
    base_rest = {key: value for key, value in base.items() if key != field}
    for document in (ours, theirs):
        if {key: value for key, value in document.items() if key != field} != base_rest:
            return None
    return base, ours, theirs


def _waiver_rows(value) -> bool:
    return isinstance(value, dict) and all(
        isinstance(row, dict) and row and all(
            isinstance(reason, str) and reason.strip() for reason in row.values())
        for row in value.values())


def _debt_rows(value) -> bool:
    return isinstance(value, dict) and all(
        isinstance(reason, str) and reason.strip() for reason in value.values())


def resolve_additive_certificate_waivers(worktree: Path, rel: str, sh) -> str | None:
    """Union new component waiver rows, proven against Git's three stages.

    This is authored policy, not generated metadata. Existing rows and every
    other policy field must be unchanged; ambiguous edits remain unresolved.
    The union is written sorted by component path, as the certificate gate
    requires (`node scripts/component-certificate.mjs --sort`).
    """
    if rel != "docs/design-system/component-certification.json":
        return None
    loaded = _load_json_object_stages(worktree, rel, sh, "waivers", _waiver_rows)
    if loaded is None:
        return None
    base, ours, theirs = loaded
    for document in (ours, theirs):
        if any(document["waivers"].get(key) != value for key, value in base["waivers"].items()):
            return None
    merged = dict(theirs["waivers"])
    for key, value in ours["waivers"].items():
        if key in merged and merged[key] != value:
            return None
        merged[key] = value
    theirs["waivers"] = dict(sorted(merged.items()))
    return json.dumps(theirs, ensure_ascii=False, indent=2) + "\n"
