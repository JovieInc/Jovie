"""Three-stage conflict resolvers for the fix-red no-model merge routes.

Renders Git's three index stages as one diff3 conflict and resolves only the
shapes proven additive: complete node:test blocks, Vitest statement
insertions, component waiver rows, and head-only certification additions.
Those additions are written to a component-certification.d shard so the next
batch PR does not edit the shared registry. Split from fix_red_source_edits.py
so that module stays within the 500-line company budget. Callers still reach
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


def _load_json_object_stages(worktree: Path, rel: str, sh, field: str, accept,
                             *, additional_fields: dict | None = None) -> tuple[dict, dict, dict] | None:
    """Base, ours, and theirs for explicitly validated JSON object fields.

    None unless every stage is one object, all field validators pass, and every
    other field still matches base."""
    validators = {field: accept, **(additional_fields or {})}
    documents = []
    for stage in (1, 2, 3):
        blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
        if blob.returncode:
            return None
        try:
            document = json.loads(blob.stdout, object_pairs_hook=_unique_json_object)
        except (ValueError, TypeError):
            return None
        if not isinstance(document, dict) or any(not check(document.get(key)) for key, check in validators.items()):
            return None
        documents.append(document)
    base, ours, theirs = documents
    base_rest = {key: value for key, value in base.items() if key not in validators}
    for document in (ours, theirs):
        if {key: value for key, value in document.items() if key not in validators} != base_rest:
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


def _gate_rows(value) -> bool:
    criteria = {"ds-owner", "tokens", "states", "tests", "a11y", "frontend-rules", "forced-caps"}
    return isinstance(value, dict) and all(
        isinstance(row, list) and row and all(isinstance(item, str) and item in criteria for item in row)
        and len(row) == len(set(row)) for row in value.values())


def resolve_additive_certificate_waivers(worktree: Path, rel: str, sh) -> str | None:
    """Union new component gate and waiver rows, proven against Git's three stages.

    This is authored policy, not generated metadata. Existing rows and every
    other policy field must be unchanged; ambiguous edits remain unresolved.
    The union is written sorted by component path, as the certificate gate
    requires (`node scripts/component-certificate.mjs --sort`).
    """
    if rel != "docs/design-system/component-certification.json":
        return None
    loaded = _load_json_object_stages(worktree, rel, sh, "waivers", _waiver_rows,
                                      additional_fields={"gates": _gate_rows})
    if loaded is None:
        return None
    base, ours, theirs = loaded
    for field in ("gates", "waivers"):
        for document in (ours, theirs):
            if any(document[field].get(key) != value for key, value in base[field].items()):
                return None
        merged = dict(theirs[field])
        for key, value in ours[field].items():
            if key in merged and merged[key] != value:
                return None
            merged[key] = value
        theirs[field] = dict(sorted(merged.items()))
    return json.dumps(theirs, ensure_ascii=False, indent=2) + "\n"


CERT_REGISTRY = "docs/design-system/component-certification.json"
_SHARD_SLUG = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,80}")


def _stage_documents(worktree: Path, rel: str, sh):
    """(text, object) for base, ours, and theirs. None on any unreadable stage."""
    loaded = []
    for stage in (1, 2, 3):
        blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
        if getattr(blob, "returncode", 1):
            return None
        try:
            document = json.loads(blob.stdout, object_pairs_hook=_unique_json_object)
        except (ValueError, TypeError):
            return None
        if not isinstance(document, dict):
            return None
        loaded.append((blob.stdout, document))
    return loaded


def _head_additions(base: dict, ours: dict, theirs: dict) -> dict | None:
    """Keys ours added that theirs does not have. None when an existing row changed."""
    if any(key not in ours or ours[key] != value for key, value in base.items()):
        return None
    if any(key not in theirs or theirs[key] != value for key, value in base.items()):
        return None
    added = {}
    for key, value in ours.items():
        if key in base:
            continue
        if key in theirs:
            if theirs[key] != value:
                return None
            continue
        added[key] = value
    return added


def certification_shard_rel(branch: str) -> str | None:
    """One shard path per PR branch. `claude/ds-cert-s10` -> `.../claude-ds-cert-s10.json`."""
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", str(branch or "")).strip("-.")
    if _SHARD_SLUG.fullmatch(slug) is None:
        return None
    return f"docs/design-system/component-certification.d/{slug}.json"


def certification_shard_text(gates: dict, waivers: dict) -> str:
    """Path-sorted shard. Empty maps are omitted. Inner waiver key order stays as authored."""
    document = {}
    if gates:
        document["gates"] = {key: gates[key] for key in sorted(gates)}
    if waivers:
        document["waivers"] = {key: waivers[key] for key in sorted(waivers)}
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def certification_head_additions(worktree: Path, rel: str, sh) -> dict | None:
    """Head-only gates and waivers, plus main's registry bytes.

    None unless every existing row is unchanged, shared additions agree, and
    the head did not edit policy. Main may add rows and change policy; the
    caller keeps main's file bytes.
    """
    if rel != CERT_REGISTRY:
        return None
    loaded = _stage_documents(worktree, rel, sh)
    if loaded is None:
        return None
    (_, base), (_, ours), (theirs_text, theirs) = loaded
    if set(ours) != set(base):
        return None
    for key, value in ours.items():
        if key in ("gates", "waivers"):
            continue
        if base.get(key) != value:
            return None
    for label, accept in (("gates", _gate_rows), ("waivers", _waiver_rows)):
        if not all(accept(document.get(label)) for document in (base, ours, theirs)):
            return None
    gates = _head_additions(base["gates"], ours["gates"], theirs["gates"])
    waivers = _head_additions(base["waivers"], ours["waivers"], theirs["waivers"])
    if gates is None or waivers is None:
        return None
    return {"gates": gates, "waivers": waivers, "registry": theirs_text}


def _occupied_by_other_shards(worktree: Path, shard_rel: str) -> set[str] | None:
    directory = worktree / "docs/design-system/component-certification.d"
    if not directory.is_dir():
        return set()
    occupied: set[str] = set()
    for path in sorted(directory.glob("*.json")):
        rel = path.relative_to(worktree).as_posix()
        if rel == shard_rel:
            continue
        try:
            document = json.loads(path.read_text(), object_pairs_hook=_unique_json_object)
        except (OSError, UnicodeError, ValueError, TypeError):
            return None
        if not isinstance(document, dict):
            return None
        for field in ("gates", "waivers"):
            rows = document.get(field, {})
            if rows and not isinstance(rows, dict):
                return None
            occupied.update(rows or {})
    return occupied


def _merged_shard_text(worktree: Path, shard_rel: str, gates: dict, waivers: dict) -> str | None:
    merged_gates, merged_waivers = dict(gates), dict(waivers)
    target = worktree / shard_rel
    if target.is_file():
        try:
            document = json.loads(target.read_text(), object_pairs_hook=_unique_json_object)
        except (OSError, UnicodeError, ValueError, TypeError):
            return None
        if not isinstance(document, dict) or set(document) - {"gates", "waivers"}:
            return None
        existing_gates, existing_waivers = document.get("gates", {}), document.get("waivers", {})
        if not _gate_rows(existing_gates) or not _waiver_rows(existing_waivers):
            return None
        for key, value in existing_gates.items():
            if merged_gates.get(key, value) != value:
                return None
            merged_gates.setdefault(key, value)
        for key, value in existing_waivers.items():
            if merged_waivers.get(key, value) != value:
                return None
            merged_waivers.setdefault(key, value)
    if not merged_gates and not merged_waivers:
        return None
    return certification_shard_text(merged_gates, merged_waivers)


def apply_certification_shard(worktree: Path, rel: str, sh, branch: str) -> dict[str, str] | None:
    """Registry bytes plus a shard of head-only rows. None when the conflict is not that shape.

    The registry value is main's file unchanged. An empty addition (the head is
    a subset of main) returns the registry only.
    """
    additions = certification_head_additions(worktree, rel, sh)
    if additions is None:
        return None
    placed = {rel: additions["registry"]}
    if not additions["gates"] and not additions["waivers"]:
        return placed
    shard_rel = certification_shard_rel(branch)
    if shard_rel is None:
        return None
    root = Path(worktree)
    occupied = _occupied_by_other_shards(root, shard_rel)
    if occupied is None:
        return None
    if (set(additions["gates"]) | set(additions["waivers"])) & occupied:
        return None
    text = _merged_shard_text(root, shard_rel, additions["gates"], additions["waivers"])
    if text is None:
        return None
    placed[shard_rel] = text
    return placed
