"""Source rewrites for the fix-red no-model routes: snap added off-grid spacing utilities and
strip added legacy Cache Components exports and resolve additive source conflicts. Split from fix_red_classes to keep it under its size ceiling."""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from atomic_state import atomic_write_text
from fix_red_statement_merge import contained_by_main, contained_by_main_file, resolve_additive_statements_text, unique_import_bindings
from screen_debt_merge import resolve_subtractive_screen_debt

LEGACY_CACHE_EXPORT = re.compile(
    r"^\s*export const (?:dynamic|fetchCache|revalidate)\s*=")
CACHE_SCAN_PREFIXES = ("apps/web/app/", "apps/web/lib/")
CACHE_SOURCE = re.compile(r"\.(?:cjs|js|json|mjs|ts|tsx)$")
# Same skip as stackAdoptionCoverage: tests and stories are not legacy surfaces.
CACHE_SKIP = re.compile(r"\.(?:stories|test)\.[^.]+$")
# Same utility shape as apps/web/scripts/optical-grid-scanners.ts, limited to the
# armed conservative steps. Longer prefixes are not required: `p` fails closed on
# `px-2.5` because the step hyphen does not follow `p`.
CONSERVATIVE_UTILITY = re.compile(
    r"(?<![\w-])(?P<sign>-)?(?P<prefix>p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|"
    r"gap|gap-x|gap-y|space-x|space-y)-(?P<step>2\.5|3\.5)(?![\w./%])")
# 10px and 14px sit halfway between canonical seams. Tie-break toward the lower
# seam (8px / 12px) so the rewrite is deterministic and stays on the 4px grid.
SNAP_STEP = {"2.5": "2", "3.5": "3"}
SPACING_SCAN_PREFIXES = ("apps/web/app/", "apps/web/components/", "packages/ui/")
NON_PRODUCT_SPACING = re.compile(r"\.(?:test|spec|stories)\.[tj]sx?$")


def _snap_spacing_line(line: str) -> str:
    def repl(match: re.Match) -> str:
        sign = match.group("sign") or ""
        return f"{sign}{match.group('prefix')}-{SNAP_STEP[match.group('step')]}"
    return CONSERVATIVE_UTILITY.sub(repl, line)


def _spacing_product_path(path: str) -> bool:
    """Product TS/TSX under the spacing ratchet's scan roots. Tests and stories are debt-free."""
    rel = str(path or "").replace("\\", "/")
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if not rel.endswith((".ts", ".tsx")) or NON_PRODUCT_SPACING.search(rel):
        return False
    return rel.startswith(SPACING_SCAN_PREFIXES)


def iter_added_lines(diff: str):
    """Yield (path, new 1-based line, added text) for each added unified-diff line."""
    rel = ""
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk or raw.startswith("\\"):
            continue
        if raw.startswith("+"):
            yield rel, new_line, raw[1:]
            new_line += 1
        elif not raw.startswith("-"):
            new_line += 1


def _added_spacing_edits(diff: str) -> dict[str, dict[int, tuple[str, str]]]:
    """Map eligible file -> {new 1-based line: (added text, snapped text)} for utilities the diff adds."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    for rel, new_line, added in iter_added_lines(diff):
        snapped = _snap_spacing_line(added)
        if _spacing_product_path(rel) and snapped != added:
            edits.setdefault(rel, {})[new_line] = (added, snapped)
    return edits


def _rewrite_added_lines(root: Path, edits: dict[str, dict[int, tuple[str, str]]]) -> list[str]:
    """Replace added lines that still match. A stale line is left alone."""
    changed = []
    root = Path(root)
    for rel, lines in edits.items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        dirty = False
        for lineno, (added, rewritten) in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current != added:
                continue
            file_lines[index] = rewritten + ending
            dirty = True
        if not dirty:
            continue
        try:
            atomic_write_text(path, "".join(file_lines))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)


def snap_added_conservative_spacing(root: Path, diff: str) -> list[str]:
    """Snap added 2.5/3.5 utilities to 2/3. Grandfathered and stale lines stay."""
    return _rewrite_added_lines(root, _added_spacing_edits(diff))


def _legacy_cache_path(path: str) -> bool:
    """Product source under the Cache Components scan. Tests and stories are not counted."""
    rel = str(path or "").replace("\\", "/")
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if not CACHE_SOURCE.search(rel) or CACHE_SKIP.search(rel):
        return False
    return rel.startswith(CACHE_SCAN_PREFIXES)


def _added_legacy_cache_exports(diff: str) -> dict[str, dict[int, str]]:
    """Map eligible file -> {new 1-based line: added text} for cache exports the diff adds."""
    edits: dict[str, dict[int, str]] = {}
    for rel, new_line, added in iter_added_lines(diff):
        if _legacy_cache_path(rel) and LEGACY_CACHE_EXPORT.match(added):
            edits.setdefault(rel, {})[new_line] = added
    return edits


_HEADING_TAG = re.compile(r"<h[1-6]\b[^>]*>", re.I)
_BALANCE_EXEMPT = re.compile(
    r"\b(?:text-balance|text-pretty|text-wrap|text-nowrap|truncate|sr-only|line-clamp-)\w*|\bwhitespace-nowrap\b")
_QUOTED_CLASS = re.compile(r"""className=(['"])(.*?)\1""")
_TEMPLATE_CLASS = re.compile(r"className=\{`([^`]*)`\}")


def _heading_product_path(path: str) -> bool:
    rel = str(path or "").replace("\\", "/")
    if not rel.endswith(".tsx") or rel.startswith("/") or ".." in Path(rel).parts:
        return False
    if re.search(r"\.(?:test|spec|stories)\.tsx$", rel):
        return False
    return rel.startswith(("apps/web/", "packages/ui/"))


def _balance_tag(tag: str) -> str:
    if "textWrap" in tag:
        return tag
    quoted = _QUOTED_CLASS.search(tag)
    if quoted:
        body = quoted.group(2)
        if _BALANCE_EXEMPT.search(body):
            return tag
        quote = quoted.group(1)
        insert = "text-balance" if body == "" else f"text-balance {body}"
        return f"{tag[:quoted.start()]}className={quote}{insert}{quote}{tag[quoted.end():]}"
    template = _TEMPLATE_CLASS.search(tag)
    if template:
        body = template.group(1)
        if "${" in body or _BALANCE_EXEMPT.search(body):
            return tag
        insert = "text-balance" if body == "" else f"text-balance {body}"
        return f"{tag[:template.start()]}className={{`{insert}`}}{tag[template.end():]}"
    if "className=" in tag:
        return tag
    if tag.endswith("/>"):
        return tag[:-2] + ' className="text-balance" />'
    return tag[:-1] + ' className="text-balance">'


def balance_heading_line(line: str) -> str:
    """Balance static heading tags using the shared exemption and class rules."""
    return _HEADING_TAG.sub(lambda match: _balance_tag(match.group(0)), line)


def balance_added_headings(root: Path, diff: str) -> list[str]:
    """Add text-balance on added heading tags. Dynamic and stale lines stay."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    for rel, new_line, added in iter_added_lines(diff):
        balanced = balance_heading_line(added)
        if _heading_product_path(rel) and balanced != added:
            edits.setdefault(rel, {})[new_line] = (added, balanced)
    return _rewrite_added_lines(root, edits)


def strip_added_legacy_cache_exports(root: Path, diff: str) -> list[str]:
    """Delete added dynamic/fetchCache/revalidate exports. Stale and runtime lines stay."""
    changed = []
    root = Path(root)
    for rel, lines in _added_legacy_cache_exports(diff).items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        drop: set[int] = set()
        for lineno, added in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current == added:
                drop.add(index)
        if not drop:
            continue
        kept = [line for index, line in enumerate(file_lines) if index not in drop]
        try:
            atomic_write_text(path, "".join(kept))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)


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
    """Union empty-base statement insertions in a Vitest file, proven from Git's three stages."""
    if not re.fullmatch(_TEST_PATH + r"\.(?:test|spec)\.tsx?", rel):
        return None
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


# Same argv as lane_runner.WORKTREE_INSTALL. A fresh repair worktree has no
# node_modules, so the pre-commit hook cannot find lint-staged and the merge
# is aborted before the hook checks any file. Keep these flags identical.
MERGE_COMMIT_INSTALL = [
    "pnpm", "install", "--frozen-lockfile", "--prefer-offline",
    "--package-import-method=hardlink",
]
_LINT_STAGED_MISSING = re.compile(r'Command "lint-staged" not found')


def _command_text(result) -> str:
    return f"{getattr(result, 'stdout', '') or ''}{getattr(result, 'stderr', '') or ''}"


def commit_open_merge(worktree, paths, sh, log, *, guard=lambda: None) -> bool:
    """Stage `paths` and commit the open merge. None means the caller already staged.

    When the hook fails only because `pnpm exec lint-staged` is not installed,
    install once and retry that commit. Any other failure aborts the merge.
    """
    guard()
    if paths:
        if sh(["git", "add", "--", *paths], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    commit = sh(["git", "commit", "--no-edit"], cwd=worktree, log=log)
    if commit.returncode != 0 and _LINT_STAGED_MISSING.search(_command_text(commit)):
        guard()
        installed = sh(MERGE_COMMIT_INSTALL, cwd=worktree, timeout=1800, log=log)
        if installed.returncode == 0:
            commit = sh(["git", "commit", "--no-edit"], cwd=worktree, log=log)
    if commit.returncode != 0:
        sh(["git", "merge", "--abort"], cwd=worktree, log=log)
        return False
    return True


def resolve_additive_list_conflict(worktree: Path, branch: str, log, *, sh, merge_entries, guard=lambda: None, push: bool = True, stage_choice=None) -> bool:
    """Union quoted lists, node:test blocks, Vitest statement insertions, waiver rows, or dropped screen-debt rows.

    Main's order stays, then head-only lines. A prose hunk or any other shape aborts
    and leaves the PR to the model. The push is a fast-forward of the PR branch.
    `push=False` leaves that fast-forward to the caller."""
    guard()
    merged = sh(["git", "merge", "--no-edit", "origin/main"], cwd=worktree, log=log)
    if merged.returncode != 0:
        conflicted = [path for path in (sh(["git", "diff", "--name-only", "--diff-filter=U"], cwd=worktree).stdout or "").split() if path]
        if not conflicted:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        resolved: dict[str, str] = {}
        for path in conflicted:
            target = worktree / path
            try:
                text = stage_choice(worktree, path, sh) if stage_choice else merge_entries(target.read_text())
                if text is None and not stage_choice:
                    text = resolve_additive_node_test_file(worktree, path, sh)
                if text is None and not stage_choice:
                    text = resolve_additive_statement_file(worktree, path, sh)
                if text is None and not stage_choice:
                    text = resolve_additive_certificate_waivers(worktree, path, sh)
                if text is None and not stage_choice:
                    text = resolve_subtractive_screen_debt(worktree, path, sh)
            except OSError:
                text = None
            if text is None:
                sh(["git", "merge", "--abort"], cwd=worktree, log=log)
                return False
            resolved[path] = text
        try:
            for path, text in resolved.items():
                atomic_write_text(worktree / path, text)
        except OSError:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
        if not commit_open_merge(worktree, conflicted, sh, log, guard=guard):
            return False
    guard()
    if not push:
        return True
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0


# Company guards annotates each over-baseline file, then Actions appends
# "Process completed with exit code 1." A stale branch still carries files
# main already shrunk, and a red check reports BLOCKED so the BEHIND fallback
# never runs. Sync main when those growth lines are the only errors. Another
# error stays with the model. classify() checks this after SIGNATURES.
_SIZE_500_ERROR = re.compile(r"size-500: \S+: grew \d+ -> \d+\s*$")
_ANNOTATED_ERROR = re.compile(r"##\[error\]([^\n]+)")
_GHA_EXIT = re.compile(r"Process completed with exit code \d+\.?\s*$")


def size_500_stale_hit(text: object) -> tuple[str, str] | None:
    """Return `("size-500-stale", "sync-main")` when every annotated error is size growth."""
    if not isinstance(text, str):
        return None
    errors = [item.strip() for item in _ANNOTATED_ERROR.findall(text)]
    errors = [item for item in errors if _GHA_EXIT.fullmatch(item) is None]
    if not errors or any(_SIZE_500_ERROR.fullmatch(item) is None for item in errors):
        return None
    return ("size-500-stale", "sync-main")
