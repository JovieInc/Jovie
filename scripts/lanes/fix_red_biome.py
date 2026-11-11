"""Deterministic repair for a Source Validation biome format or import-sort failure.

Biome names the file, then prints `Sort these imports` or
`Formatter would have printed the following content`. The repair is
`biome check --write` on those cited paths. A path the log did not cite,
or a path that leaves the worktree, is ignored.
"""
from __future__ import annotations

import re
import types
from pathlib import Path

BIOME_FORMAT_TEXT = re.compile(
    r"Formatter would have printed the following content:|Sort these imports\."
)
_SUFFIX = r"mjs|cjs|js|jsx|ts|tsx|json|jsonc|css"
_CITED = re.compile(
    rf"(?m)^(?:\d{{4}}-\d\d-\d\dT[\d:.]+Z\s+)?"
    rf"(?P<path>(?:[\w.+@()-]+/)*[\w.+@()-]+\.(?:{_SUFFIX}))"
    rf"(?::\d+:\d+\s+\S*organizeImports|\s+format\b)"
)


def cited_paths(text: str) -> list[str]:
    """Repo-relative paths biome cited for a format or import-sort diagnostic."""
    if not BIOME_FORMAT_TEXT.search(text or ""):
        return []
    seen: list[str] = []
    for match in _CITED.finditer(text or ""):
        path = match.group("path")
        if path not in seen and ".." not in Path(path).parts:
            seen.append(path)
    return seen


def safe_rels(root: Path, files: list[str]) -> list[str]:
    """Cited paths that are files inside `root`. Anything else is dropped."""
    base = Path(root).resolve()
    rels: list[str] = []
    for rel in files or []:
        if not isinstance(rel, str) or not rel or rel.startswith(("/", "\\")):
            continue
        if ".." in Path(rel).parts:
            continue
        path = (base / rel).resolve()
        if base not in path.parents or not path.is_file():
            continue
        rels.append(path.relative_to(base).as_posix())
    return rels


def write_args(rels: list[str]) -> list[str]:
    """The one biome invocation this class uses."""
    return ["pnpm", "exec", "biome", "check", "--write", "--no-errors-on-unmatched", *rels]


def format_commit_push(sh, pr, worktree, log, receipt, files):
    """Rewrite cited files with biome, commit and push. None when nothing applies."""
    rels = safe_rels(worktree, files)
    if not rels:
        return None
    wrote = sh(write_args(rels), cwd=worktree, log=log, timeout=300)
    if wrote.returncode:
        return None
    diff = sh(["git", "diff", "--name-only", "--", *rels], cwd=worktree, log=log, timeout=60)
    if diff.returncode:
        return None
    wanted = set(rels)
    changed = [line.strip() for line in (diff.stdout or "").splitlines() if line.strip() in wanted]
    if not changed:
        return None
    steps = [
        ["git", "add", "--", *changed],
        ["git", "commit", "-q", "-m", "fix(ci): format files biome would rewrite"],
        ["git", "push", "-q", "origin", f"HEAD:{pr['headRefName']}"],
    ]
    for step in steps:
        if sh(step, cwd=worktree, log=log, timeout=900).returncode:
            return None
    receipt.update(resolution="biome-formatted", biomeFiles=changed)
    return types.SimpleNamespace(returncode=0)
