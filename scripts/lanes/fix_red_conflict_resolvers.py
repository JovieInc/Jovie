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


_QUOTED_LIST_ENTRY = re.compile(r"""^[ \t]*(?:'[^'\n]+'|"[^"\n]+"),[ \t]*$""")


def merge_additive_quoted_entries(ours: str, theirs: str) -> str | None:
    """Union quoted list entries. Single quotes keep main order; double quotes sort. A non-entry returns None."""

    def rows(side: str) -> list[str] | None:
        if not str(side or "").endswith("\n"):
            return None
        lines = side[:-1].split("\n")
        if not lines or any(_QUOTED_LIST_ENTRY.fullmatch(line) is None for line in lines):
            return None
        return lines

    ours_rows = rows(ours)
    theirs_rows = rows(theirs)
    if ours_rows is None or theirs_rows is None:
        return None
    rows = ours_rows + theirs_rows
    styles = {(line[:len(line) - len(line.lstrip(" \t"))], line.strip()[0]) for line in rows}
    if len(styles) != 1 or len(set(ours_rows)) != len(ours_rows) or len(set(theirs_rows)) != len(theirs_rows):
        return None
    if [line for line in ours_rows if line in theirs_rows] != [line for line in theirs_rows if line in ours_rows]:
        return None
    seen: list[str] = []
    for line in theirs_rows + ours_rows:
        if line not in seen:
            seen.append(line)
    # Double-quoted rows are JSON path registries. Those files must stay sorted.
    if seen and all(line.strip().startswith('"') for line in seen):
        pad = seen[0][:len(seen[0]) - len(seen[0].lstrip(" \t"))]
        seen = [f'{pad}"{line.strip()[1:-2]}",' for line in sorted(seen, key=lambda line: line.strip())]
    return "\n".join(seen) + "\n"


_BRACE_GROUP = re.compile(r"\{([A-Za-z0-9_,-]+)\}")
_JSON_SCRIPT_LINE = re.compile(
    r'^(?P<indent>[ \t]*)"(?P<key>[^"\n]+)"\s*:\s*"(?P<command>(?:\\.|[^"\\])*)"(?P<suffix>,?)\s*$'
)
def _split_and_outside_single_quotes(command: str) -> list[str] | None:
    """Split ` && ` outside single quotes. Double quotes and an odd quote fail closed."""
    if not command or '"' in command or "\n" in command:
        return None
    parts: list[str] = []
    start = 0
    quoted = False
    index = 0
    while index < len(command):
        if command[index] == "'":
            quoted = not quoted
            index += 1
            continue
        if not quoted and command.startswith(" && ", index):
            part = command[start:index].strip()
            if not part:
                return None
            parts.append(part)
            index += 4
            start = index
            continue
        index += 1
    if quoted:
        return None
    tail = command[start:].strip()
    if not tail:
        return None
    parts.append(tail)
    return parts
def _coverage_template(segment: str) -> tuple[str, list[str]] | None:
    """One brace group becomes `{}`. A segment with no brace group stays whole."""
    groups = list(_BRACE_GROUP.finditer(segment))
    if len(groups) > 1:
        return None
    if not groups:
        return segment, []
    body = groups[0].group(1)
    tokens = body.split(",")
    if any(re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", token) is None for token in tokens):
        return None
    if len(tokens) != len(set(tokens)) or body != ",".join(tokens):
        return None
    template = segment[:groups[0].start()] + "{}" + segment[groups[0].end():]
    return template, tokens
def merge_coverage_include_chain(ours: str, theirs: str) -> str | None:
    """Union node coverage scripts that differ only by a brace list.
    Main's segment order and shared token order stay, then head-only tokens
    and head-only `&&` segments. A reordered token, a second brace group, or
    any other edit returns None.
    """
    ours_parts = _split_and_outside_single_quotes(str(ours or "").strip())
    theirs_parts = _split_and_outside_single_quotes(str(theirs or "").strip())
    if not ours_parts or not theirs_parts:
        return None
    def keyed(parts: list[str]) -> list[tuple[str, list[str], str]] | None:
        rows = []
        seen: set[str] = set()
        for part in parts:
            parsed = _coverage_template(part)
            if parsed is None:
                return None
            template, tokens = parsed
            if template in seen:
                return None
            seen.add(template)
            rows.append((template, tokens, part))
        return rows
    ours_rows = keyed(ours_parts)
    theirs_rows = keyed(theirs_parts)
    if ours_rows is None or theirs_rows is None:
        return None
    theirs_by = {template: tokens for template, tokens, _part in theirs_rows}
    ours_by = {template: tokens for template, tokens, _part in ours_rows}
    def brace_prefix(template: str) -> str:
        return template.split("{}", 1)[0]
    for our_template, our_tokens in ours_by.items():
        for their_template, their_tokens in theirs_by.items():
            if our_template == their_template:
                continue
            # Same include path with any other flag or suffix is an edit.
            if our_tokens and their_tokens and brace_prefix(our_template) == brace_prefix(their_template):
                return None
            # A brace-free segment that is not identical is an edit, not an addition.
            if not our_tokens and not their_tokens:
                return None
    for template, tokens, _part in ours_rows + theirs_rows:
        other = theirs_by if template in ours_by else ours_by
        if template not in other and not tokens:
            return None
    merged_tokens: dict[str, list[str]] = {}
    for template, their_tokens in theirs_by.items():
        if template not in ours_by:
            merged_tokens[template] = their_tokens
            continue
        our_tokens = ours_by[template]
        if bool(their_tokens) != bool(our_tokens):
            return None
        shared = set(their_tokens) & set(our_tokens)
        if [token for token in our_tokens if token in shared] != [token for token in their_tokens if token in shared]:
            return None
        merged = list(their_tokens)
        for token in our_tokens:
            if token not in merged:
                merged.append(token)
        merged_tokens[template] = merged
    def render(template: str, tokens: list[str], part: str) -> str:
        if not tokens:
            return part
        return template.replace("{}", "{" + ",".join(merged_tokens.get(template, tokens)) + "}", 1)
    result = [render(template, tokens, part) for template, tokens, part in theirs_rows]
    for template, tokens, part in ours_rows:
        if template not in theirs_by:
            result.append(render(template, tokens, part))
    return " && ".join(result)
def resolve_coverage_include_hunk(ours: str, theirs: str) -> str | None:
    """One JSON script line, or one raw command, per conflict side."""
    def parse(side: str) -> tuple[str, re.Match[str] | None, str] | None:
        if not str(side or "").endswith("\n"):
            return None
        body = side[:-1]
        if "\n" in body:
            return None
        match = _JSON_SCRIPT_LINE.match(body)
        if match:
            return "json", match, match.group("command")
        if '"' in body:
            return None
        return "raw", None, body.strip()
    ours_parsed = parse(ours)
    theirs_parsed = parse(theirs)
    if ours_parsed is None or theirs_parsed is None or ours_parsed[0] != theirs_parsed[0]:
        return None
    merged = merge_coverage_include_chain(ours_parsed[2], theirs_parsed[2])
    if merged is None or merged == ours_parsed[2] == theirs_parsed[2]:
        return None
    if ours_parsed[0] == "raw":
        indent = theirs[:-1][:len(theirs[:-1]) - len(theirs[:-1].lstrip(" \t"))]
        return indent + merged + "\n"
    ours_match, theirs_match = ours_parsed[1], theirs_parsed[1]
    if ours_match is None or theirs_match is None:
        return None
    if ours_match.group("key") != theirs_match.group("key") \
            or ours_match.group("indent") != theirs_match.group("indent") \
            or ours_match.group("suffix") != theirs_match.group("suffix"):
        return None
    return (
        f"{theirs_match.group('indent')}\"{theirs_match.group('key')}\": "
        f"\"{merged}\"{theirs_match.group('suffix')}\n"
    )
def merge_pytest_file_list(ours: str, theirs: str) -> str | None:
    """Union one quoted `scripts/tests/test_*.py` list: main order, then head-only paths."""
    pattern = re.compile(r"^(?P<indent>[ \t]*)'(?P<body>(?:scripts/tests/test_[A-Za-z0-9_]+\.py)(?: scripts/tests/test_[A-Za-z0-9_]+\.py)*)'\.split\($")
    def parse(side: str):
        text = str(side or "")
        match = pattern.match(text[:-1]) if text.endswith("\n") and "\n" not in text[:-1] else None
        tokens = match.group("body").split(" ") if match else []
        return (match.group("indent"), tokens) if match and len(set(tokens)) == len(tokens) else None
    left, right = parse(ours), parse(theirs)
    ordered = left and right and left[0] == right[0] and [t for t in left[1] if t in right[1]] == [t for t in right[1] if t in left[1]]
    return f"{right[0]}'{' '.join(dict.fromkeys([*right[1], *left[1]]))}'.split(\n" if ordered else None


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
