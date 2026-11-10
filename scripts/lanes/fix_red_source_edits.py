"""Source rewrites for the fix-red no-model routes: snap added off-grid spacing utilities and
strip added legacy Cache Components exports and resolve additive source conflicts. Split from fix_red_classes to keep it under its size ceiling."""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from atomic_state import atomic_write_text

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


def _added_spacing_edits(diff: str) -> dict[str, dict[int, tuple[str, str]]]:
    """Map eligible file -> {new 1-based line: (added text, snapped text)} for utilities the diff adds."""
    edits: dict[str, dict[int, tuple[str, str]]] = {}
    rel = ""
    eligible = False
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            eligible = _spacing_product_path(rel)
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if raw.startswith("\\"):
            continue  # "\ No newline at end of file" is not a source line
        if raw.startswith("+"):
            added = raw[1:]
            snapped = _snap_spacing_line(added)
            if eligible and snapped != added:
                edits.setdefault(rel, {})[new_line] = (added, snapped)
            new_line += 1
        elif raw.startswith("-"):
            continue
        else:
            # A context line (rare with -U0) still occupies a new-file line.
            new_line += 1
    return edits


def snap_added_conservative_spacing(root: Path, diff: str) -> list[str]:
    """Snap conservative spacing utilities on lines this diff adds. Returns the files written.

    Grandfathered lines are left alone, including an identical `gap-2.5` elsewhere in the
    file. A line that no longer matches the diff is left alone so a stale patch cannot
    rewrite a neighbor. 2.5 -> 2 (10px -> 8px) and 3.5 -> 3 (14px -> 12px).
    """
    changed = []
    root = Path(root)
    for rel, lines in _added_spacing_edits(diff).items():
        path = root / rel
        try:
            original = path.read_text()
        except OSError:
            continue
        file_lines = original.splitlines(keepends=True)
        dirty = False
        for lineno, (added, snapped) in lines.items():
            index = lineno - 1
            if index < 0 or index >= len(file_lines):
                continue
            ending = "\r\n" if file_lines[index].endswith("\r\n") else "\n" if file_lines[index].endswith("\n") else ""
            current = file_lines[index][: len(file_lines[index]) - len(ending)]
            if current != added:
                continue
            file_lines[index] = snapped + ending
            dirty = True
        if not dirty:
            continue
        try:
            atomic_write_text(path, "".join(file_lines))
        except OSError:
            continue
        changed.append(rel)
    return sorted(changed)


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
    rel = ""
    eligible = False
    new_line = 0
    in_hunk = False
    for raw in str(diff or "").splitlines():
        if raw.startswith("+++ b/"):
            rel = raw[6:]
            eligible = _legacy_cache_path(rel)
            in_hunk = False
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git "):
            continue
        header = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw)
        if header:
            new_line = int(header.group(1))
            in_hunk = True
            continue
        if not in_hunk:
            continue
        if raw.startswith("\\"):
            continue
        if raw.startswith("+"):
            added = raw[1:]
            if eligible and LEGACY_CACHE_EXPORT.match(added):
                edits.setdefault(rel, {})[new_line] = added
            new_line += 1
        elif raw.startswith("-"):
            continue
        else:
            new_line += 1
    return edits


def strip_added_legacy_cache_exports(root: Path, diff: str) -> list[str]:
    """Delete route-segment cache exports on lines this diff adds. Returns the files written.

    Grandfathered exports stay, including an identical line elsewhere in the file.
    A line that no longer matches the diff stays, so a stale patch cannot delete a
    neighbor. `export const runtime` is not a legacy surface and is left alone.
    """
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


def resolve_additive_node_test_file(worktree: Path, rel: str, sh) -> str | None:
    """Use Git's actual three stages to prove test conflicts are insertions only."""
    if not re.fullmatch(r"[\w./-]+\.(?:test|spec)\.mjs", rel):
        return None
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
        return resolve_additive_node_tests_text(probe.stdout)


def resolve_additive_certificate_waivers(worktree: Path, rel: str, sh) -> str | None:
    """Union new component waiver rows, proven against Git's three stages.

    This is authored policy, not generated metadata. Existing rows and every
    other policy field must be unchanged; ambiguous edits remain unresolved.
    """
    if rel != "docs/design-system/component-certification.json":
        return None

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    documents = []
    for stage in (1, 2, 3):
        blob = sh(["git", "show", f":{stage}:{rel}"], cwd=worktree)
        if blob.returncode:
            return None
        try:
            document = json.loads(blob.stdout, object_pairs_hook=unique_object)
        except (ValueError, TypeError):
            return None
        if not isinstance(document, dict) or not isinstance(document.get("waivers"), dict):
            return None
        if any(not isinstance(row, dict) or not row or
               any(not isinstance(reason, str) or not reason.strip() for reason in row.values())
               for row in document["waivers"].values()):
            return None
        documents.append(document)
    base, ours, theirs = documents
    base_policy = {key: value for key, value in base.items() if key != "waivers"}
    for document in (ours, theirs):
        if {key: value for key, value in document.items() if key != "waivers"} != base_policy:
            return None
        if any(document["waivers"].get(key) != value for key, value in base["waivers"].items()):
            return None
    merged = dict(theirs["waivers"])
    for key, value in ours["waivers"].items():
        if key in merged and merged[key] != value:
            return None
        merged[key] = value
    theirs["waivers"] = merged
    return json.dumps(theirs, ensure_ascii=False, indent=2) + "\n"


def resolve_additive_list_conflict(worktree: Path, branch: str, log, *, sh, merge_entries, guard=lambda: None) -> bool:
    """Union quoted list entries, additive node:test blocks or certificate rows.

    Main's order stays, then head-only lines. A prose hunk or any other shape aborts
    and leaves the PR to the model. The push is a fast-forward of the PR branch."""
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
                text = merge_entries(target.read_text())
                if text is None:
                    text = resolve_additive_node_test_file(worktree, path, sh)
                if text is None:
                    text = resolve_additive_certificate_waivers(worktree, path, sh)
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
        guard()
        if sh(["git", "add", "--", *conflicted], cwd=worktree, log=log).returncode != 0 \
                or sh(["git", "commit", "--no-edit"], cwd=worktree, log=log).returncode != 0:
            sh(["git", "merge", "--abort"], cwd=worktree, log=log)
            return False
    guard()
    return sh(["git", "push", "-q", "origin", f"HEAD:refs/heads/{branch}"], cwd=worktree, log=log).returncode == 0
