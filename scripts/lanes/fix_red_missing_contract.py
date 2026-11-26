"""Drop orphan-sweep contract entries whose test file is not in the tree.

Source Validation's inventory guard fails the first missing path with
`AssertionError: <path>: expected false to be true`. Vitest stops there, so
one red log can hide further missing registrations. The repair removes every
concrete test path in SCRIPT_CONTRACT_NODE_TESTS and SCRIPT_CONTRACT_VITEST_TESTS
that is not a file. It never deletes a path that exists, and it leaves the
file untouched when a cited path would still be missing.
"""
from __future__ import annotations

import re
import types
from pathlib import Path

from atomic_state import atomic_write_text
from fix_red_failure_routing import _ANSI, _LOG_FAILED_PREFIX

CLASS = "missing-contract-test"
ACTION = "drop-missing-contract"
GUARD = "lists only existing files in the orphan-sweep lane commands"
_ARRAYS = ("SCRIPT_CONTRACT_NODE_TESTS", "SCRIPT_CONTRACT_VITEST_TESTS")
_TEST_PATH = re.compile(r"scripts/[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?\Z")
_LINE = re.compile(
    r"^(?P<indent>[ \t]*)'(?P<body>[^'\n]*)'(?P<comma>,?)(?P<comment>[ \t]*//[^\n]*)?$"
)
_STAMP = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+Z[ \t]*")
_ASSERT = re.compile(
    r"AssertionError: (scripts/[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?): expected false to be true\b"
)
_ALLOWED_ERROR = re.compile(
    r"^##\[error\](?:AssertionError: scripts/[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?: "
    r"expected false to be true\b.*|Process completed with exit code 1\.)$"
)
_TARGET = "scripts/ci-fast-lanes.mjs"


def clean_log(text: str) -> str:
    """Drop ANSI, the gh log prefix, and the Actions timestamp."""
    lines = []
    for line in str(text or "").splitlines():
        line = _STAMP.sub("", _LOG_FAILED_PREFIX.sub("", _ANSI.sub("", line), count=1))
        lines.append(line)
    return "\n".join(lines)


def paths(text: str) -> list[str]:
    """Test paths named by this guard. Empty when the guard did not fail."""
    clean = clean_log(text)
    if GUARD not in clean:
        return []
    found = []
    for path in _ASSERT.findall(clean):
        if path not in found:
            found.append(path)
    return found


def other_failure(text: str) -> bool:
    """True when the log has a failure this class must not claim."""
    for line in clean_log(text).splitlines():
        if (" FAIL " in line or line.startswith("FAIL ") or line.startswith("FAIL\t")) and GUARD not in line:
            return True
        if line.startswith("##[error]") and not _ALLOWED_ERROR.fullmatch(line):
            return True
    return False


def hit(text: str):
    """`(class, action)` when the orphan-sweep guard is the only failure."""
    clean = clean_log(text)
    if GUARD not in clean or not paths(clean) or other_failure(clean):
        return None
    return CLASS, ACTION


def _array_spans(text: str):
    spans = []
    for name in _ARRAYS:
        marker = f"export const {name} = Object.freeze([\n"
        start = text.find(marker)
        if start < 0 or text.find(marker, start + 1) >= 0:
            return None
        body_at = start + len(marker)
        end = text.find("\n]);", body_at)
        if end < 0:
            return None
        spans.append((body_at, end))
    return spans


def _listed(text: str, path: str) -> bool:
    return f"'{path}'" in text or f"'{path} " in text or f" {path}'" in text or f" {path} " in text


def _drop_line(line: str, exists) -> tuple[str | None, bool]:
    match = _LINE.match(line)
    if not match:
        return line, False
    kept = []
    dropped = False
    for token in match.group("body").split(" "):
        if _TEST_PATH.fullmatch(token) and not exists(token):
            dropped = True
            continue
        kept.append(token)
    if not dropped:
        return line, False
    if not any(kept):
        return None, True
    comment = match.group("comment") or ""
    return f"{match.group('indent')}'{' '.join(kept)}'{match.group('comma')}{comment}", True


def drop_missing_entries(text: str, exists) -> str | None:
    """Return the edited source, or None when no missing test path was removed."""
    if not isinstance(text, str):
        return None
    spans = _array_spans(text)
    if spans is None:
        return None
    changed = False
    for body_at, end in reversed(spans):
        out = []
        for line in text[body_at:end].split("\n"):
            rewritten, did = _drop_line(line, exists)
            changed = changed or did
            if rewritten is not None:
                out.append(rewritten)
        text = text[:body_at] + "\n".join(out) + text[end:]
    return text if changed else None


def inside_file(root: Path, rel: str) -> bool:
    """True when `rel` is a file inside `root`. Traversal and absolute paths are not files."""
    if not isinstance(rel, str) or not rel or rel.startswith(("/", "\\")) or ".." in Path(rel).parts:
        return False
    base = Path(root).resolve()
    path = (base / rel).resolve()
    if path != base and base not in path.parents:
        return False
    return path.is_file()


def remaining_missing(text: str, exists) -> list[str]:
    """Contract tokens that still would fail the inventory guard."""
    spans = _array_spans(text)
    if spans is None:
        return ["<unparsed>"]
    missing = []
    for body_at, end in spans:
        for line in text[body_at:end].split("\n"):
            match = _LINE.match(line)
            if not match:
                continue
            for token in match.group("body").split(" "):
                if token and not exists(token):
                    missing.append(token)
    return missing


def _still_missing(text: str, cited: list[str], exists) -> bool:
    return any(not exists(path) and _listed(text, path) for path in cited)


def bind(sh):
    """Keep git side effects on the runner that owns this repair."""
    def fix(host, pr, route, worktree, log, receipt):
        del host
        return commit_push(sh, pr, worktree, log, receipt, (route or {}).get("files") or [])
    return fix


def commit_push(sh, pr, worktree, log, receipt, files):
    """Rewrite the contract lists, commit, and fast-forward the PR branch.

    None when the edit cannot clear every cited missing path. The caller then
    keeps the model path.
    """
    root = Path(worktree)
    target = root / _TARGET
    branch = str((pr or {}).get("headRefName") or "")
    if not branch or not target.is_file():
        return None
    try:
        text = target.read_text(encoding="utf-8")
    except OSError:
        return None

    def exists(rel: str) -> bool:
        return inside_file(root, rel)

    rewritten = drop_missing_entries(text, exists)
    cited = [path for path in files or [] if isinstance(path, str)]
    if rewritten is None or _still_missing(rewritten, cited, exists) or remaining_missing(rewritten, exists):
        return None
    atomic_write_text(target, rewritten)
    diff = sh(["git", "diff", "--name-only", "--", _TARGET], cwd=root, log=log, timeout=60)
    if diff.returncode or _TARGET not in (diff.stdout or "").split():
        return None
    steps = [
        ["git", "add", "--", _TARGET],
        ["git", "commit", "-q", "-m", "fix(ci): drop contract tests that are not in the tree"],
        ["git", "push", "-q", "origin", f"HEAD:{branch}"],
    ]
    for step in steps:
        if sh(step, cwd=root, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution="dropped-missing-contract", droppedContractFiles=cited)
    return types.SimpleNamespace(returncode=0)
