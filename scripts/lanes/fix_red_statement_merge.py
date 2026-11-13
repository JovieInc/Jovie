"""Union Vitest statement insertions and proven additive named imports.

Main's statements stay first, then head-only statements. A changed existing
line, control flow, an unbalanced side, or a repeated binding or import of the
same module with a different body stays unresolved unless the actual diff3
base proves an additive import change and a full-file binding check passes.
A two-way `it()` pair that shares one trailing `});` is the same insertion,
with main's test first. Any other hunk stays unresolved.
"""
from __future__ import annotations

import difflib
import json
import re
import tempfile
from pathlib import Path

from atomic_state import atomic_write_text

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
_TWOWAY_HUNK = re.compile(
    r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*\n",
    re.M | re.S)
_IT_CLOSER = re.compile(r"[ \t]*\}\);\n")
_IT_START = re.compile(r"[ \t]*it\(")
_IT_TITLE = re.compile(r"^[ \t]*it\(\s*(['\"])(?P<title>(?:\\.|(?!\1).)*)\1")


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


# Reuse the installed TypeScript parser rather than approximating TSX bindings
# with regex. This conservative check also refuses harmless local shadowing.
_IMPORT_BINDINGS_CHECK = """
const ts = require(process.argv[1]);
const text = require('node:fs').readFileSync(process.argv[2], 'utf8');
const source = ts.createSourceFile('merged.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
if (source.parseDiagnostics.length) process.exit(1);
const spans = JSON.parse(process.argv[3]);
const byteOffset = offset => Buffer.byteLength(text.slice(0, offset));
const imports = source.statements.filter(ts.isImportDeclaration).map(statement => [
  byteOffset(statement.getStart(source)), byteOffset(statement.end + (text[statement.end] === '\\n' ? 1 : 0)),
]);
for (const [start, end] of spans) {
  let cursor = start;
  for (const [from, to] of imports.filter(([from]) => from >= start && from < end)) {
    if (from !== cursor || to > end) process.exit(1);
    cursor = to;
  }
  if (cursor !== end) process.exit(1);
}
const imported = new Set();
let valid = true;
function names(name, visit) {
  if (ts.isIdentifier(name)) visit(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) if (ts.isBindingElement(element)) names(element.name, visit);
  }
}
for (const statement of source.statements) {
  const add = name => { if (imported.has(name)) valid = false; imported.add(name); };
  if (ts.isImportEqualsDeclaration(statement)) add(statement.name.text);
  if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
  const clause = statement.importClause;
  if (clause.name) add(clause.name.text);
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) add(clause.namedBindings.name.text);
    else for (const element of clause.namedBindings.elements) add(element.name.text);
  }
}
function declarations(node) {
  if (node.name && (ts.isVariableDeclaration(node) || ts.isParameter(node)
      || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
      || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isInterfaceDeclaration(node) || ts.isModuleDeclaration(node))) {
    names(node.name, name => { if (imported.has(name)) valid = false; });
  }
  ts.forEachChild(node, declarations);
}
declarations(source);
process.exit(valid ? 0 : 1);
"""


def unique_import_bindings(text: str, worktree: Path, sh, spans=()) -> bool:
    """Check the full resolved TSX file; missing installed parser leaves it manual."""
    parser = Path(__file__).resolve().parents[2] / 'node_modules' / 'typescript'
    try:
        with tempfile.TemporaryDirectory() as scratch:
            source = Path(scratch) / 'merged.tsx'
            atomic_write_text(source, text)
            return sh(['node', '-e', _IMPORT_BINDINGS_CHECK, str(parser), str(source), json.dumps(spans)],
                      cwd=worktree).returncode == 0
    except OSError:
        return False


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


def resolve_additive_statements_text(text: str, *, validate_imports=None) -> str | None:
    """Union empty-base statement hunks or additive named imports proven by diff3.

    None when any hunk has another shape, so the caller leaves that merge
    unresolved.
    """
    matches = list(_HUNK.finditer(text))
    if not matches:
        return None
    import_spans = []

    def replace(match, replacement):
        nonlocal text
        delta = len(replacement) - (match.end() - match.start())
        import_spans[:] = [(start + delta, end + delta) for start, end in import_spans]
        text = text[:match.start()] + replacement + text[match.end():]
    for match in reversed(matches):
        if match["base"].strip():
            merged = _additive_named_imports(match['base'], match['ours'], match['theirs'])
            if merged is None:
                return None
            replace(match, merged)
            import_spans.append((match.start(), match.start() + len(merged)))
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
        replace(match, "".join(ordered))
    if _MARKERS.search(text):
        return None
    if import_spans:
        # TypeScript reports UTF-16 positions; byte spans keep Unicode context exact.
        spans = [(len(text[:start].encode()), len(text[:end].encode())) for start, end in import_spans]
        if validate_imports is None or not validate_imports(text, spans):
            return None
    return text


def _one_shared_it(side: str, closer: str) -> tuple[str, str] | None:
    """One `it()` finished by the shared closer. None for any other shape."""
    if not _IT_START.match(side) or side.lstrip().startswith("it.each"):
        return None
    statements = _statements(side + closer)
    if statements is None or len(statements) != 1:
        return None
    statement = statements[0]
    title = _IT_TITLE.match(statement)
    if title is None or _key(statement) is None:
        return None
    return title.group("title"), statement


def resolve_shared_closer_it_text(text: str) -> str | None:
    """Union two-way `it()` insertions that share one trailing `});`.

    Git's default merge keeps one identical closer after the hunk. Main's test
    stays first, then head's, each closed. Diff3 hunks, `it.each`, the same
    title with two bodies, a closer that does not finish exactly one statement,
    and any other shape stay unresolved.
    """
    if "|||||||" in text or _MARKERS.search(text) is None:
        return None
    matches = list(_TWOWAY_HUNK.finditer(text))
    if not matches or text.count("<<<<<<<") != len(matches):
        return None
    pieces: list[str] = []
    cursor = 0
    for match in matches:
        closer_match = _IT_CLOSER.match(text, match.end())
        if closer_match is None:
            return None
        ours = _one_shared_it(match["ours"], closer_match.group(0))
        theirs = _one_shared_it(match["theirs"], closer_match.group(0))
        if ours is None or theirs is None:
            return None
        our_title, our_body = ours
        their_title, their_body = theirs
        if our_title == their_title and our_body.strip() != their_body.strip():
            return None
        if our_body.strip() == their_body.strip():
            block = their_body if their_body.endswith("\n") else their_body + "\n"
        else:
            main = their_body if their_body.endswith("\n") else their_body + "\n"
            head = our_body if our_body.endswith("\n") else our_body + "\n"
            block = main if main.endswith("\n\n") else main + "\n"
            block += head
        pieces.append(text[cursor:match.start()])
        pieces.append(block)
        cursor = closer_match.end()
    resolved = "".join(pieces) + text[cursor:]
    if _MARKERS.search(resolved):
        return None
    return resolved


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
