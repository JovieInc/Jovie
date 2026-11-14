"""Source rewrites for the fix-red no-model routes: resolve additive source conflicts.

Split from fix_red_classes to keep it under its size ceiling, then split again
when that ceiling was reached: the diff-driven line rewrites (spacing snap,
legacy cache strip, heading balance) live in fix_red_diff_edits and the
three-stage resolvers in fix_red_conflict_resolvers. This module stays the
entrypoint every caller imports, re-exports that public surface, and owns the
open-merge commit, the list-conflict orchestration, and the size-500 stale
classification.
"""
from __future__ import annotations

import re
from pathlib import Path

from atomic_state import atomic_write_text
from fix_red_statement_merge import contained_by_main, contained_by_main_file  # noqa: F401
from fix_red_diff_edits import (  # noqa: F401
    balance_added_headings, balance_heading_line, snap_added_conservative_spacing, strip_added_legacy_cache_exports,
)
from fix_red_conflict_resolvers import (  # noqa: F401
    resolve_additive_certificate_waivers, resolve_additive_node_test_file,
    resolve_additive_node_tests_text, resolve_additive_statement_file,
)
from fix_red_liveness_quota import resolve_liveness_quota_text  # noqa: F401
from screen_debt_merge import resolve_subtractive_screen_debt  # noqa: F401

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
                if text is None and not stage_choice:
                    text = resolve_liveness_quota_text(path, target.read_text())
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
