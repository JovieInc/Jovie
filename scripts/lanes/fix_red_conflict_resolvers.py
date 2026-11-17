"""Three-stage conflict resolvers for the fix-red no-model merge routes.

Renders Git's three index stages as one diff3 conflict and resolves only the
shapes proven additive: complete node:test blocks, Vitest statement
insertions, and component waiver rows. Split from fix_red_source_edits.py so
that module stays within the 500-line company budget. Callers still reach
every resolver through fix_red_source_edits.
"""
from __future__ import annotations

import difflib
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


_TEST_INSERTIONS_CHECK = """
const ts = require(process.argv[1]);
const text = require('node:fs').readFileSync(process.argv[2], 'utf8');
const source = ts.createSourceFile('merged.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
if (source.parseDiagnostics.length) process.exit(1);
const tests = [];
function visit(node) {
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
    const call = node.expression;
    const callee = call.expression;
    const plain = ts.isIdentifier(callee) && callee.text === 'it';
    const each = ts.isCallExpression(callee) && ts.isPropertyAccessExpression(callee.expression)
      && ts.isIdentifier(callee.expression.expression) && callee.expression.expression.text === 'it'
      && callee.expression.name.text === 'each';
    if ((plain || each) && ts.isStringLiteral(call.arguments[0])
        && call.arguments.some(arg => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
      tests.push([node.getStart(source), node.end]);
      return;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
const byteOffset = offset => Buffer.byteLength(text.slice(0, offset));
for (const [start, end] of JSON.parse(process.argv[3])) {
  const added = tests.filter(([from, to]) => byteOffset(from) >= start && byteOffset(to) <= end);
  if (!added.length) process.exit(1);
  const chunk = Buffer.from(text).subarray(start, end).toString();
  let cursor = 0;
  for (const [from, to] of added) {
    const offset = byteOffset(from) - start;
    if (Buffer.from(chunk).subarray(cursor, offset).toString().trim()) process.exit(1);
    cursor = byteOffset(to) - start;
  }
  if (Buffer.from(chunk).subarray(cursor).toString().trim()) process.exit(1);
}
"""


def _contained_add_add_tests(worktree: Path, rel: str, sh) -> str | None:
    """Take main only when an add/add file retains head plus complete test insertions.

    Actual index stages must prove the file has no base. Identical lines are
    significant; changed/deleted assertions, non-test additions and unavailable
    syntax validation leave the conflict unresolved.
    """
    index = sh(['git', 'ls-files', '-u', '--', rel], cwd=worktree)
    rows = [line.split() for line in index.stdout.splitlines()]
    if (index.returncode or len(rows) != 2 or any(len(row) != 4 for row in rows)
            or [row[2] for row in rows] != ['2', '3']
            or rows[0][0] != rows[1][0] or rows[0][0] not in ('100644', '100755')):
        return None
    sides = [sh(['git', 'show', f':{stage}:{rel}'], cwd=worktree) for stage in (2, 3)]
    if any(side.returncode for side in sides):
        return None
    ours, theirs = [side.stdout.splitlines(keepends=True) for side in sides]
    spans = []
    for tag, _i1, _i2, j1, j2 in difflib.SequenceMatcher(a=ours, b=theirs, autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        if tag != 'insert':
            return None
        spans.append((len(''.join(theirs[:j1]).encode()), len(''.join(theirs[:j2]).encode())))
    if not spans:
        return None
    parser = Path(__file__).resolve().parents[2] / 'node_modules' / 'typescript'
    try:
        with tempfile.TemporaryDirectory() as scratch:
            source = Path(scratch) / 'merged.tsx'
            atomic_write_text(source, sides[1].stdout)
            check = sh(['node', '-e', _TEST_INSERTIONS_CHECK, str(parser), str(source), json.dumps(spans)],
                       cwd=worktree)
            return sides[1].stdout if check.returncode == 0 else None
    except OSError:
        return None


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
        return _contained_add_add_tests(worktree, rel, sh)
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
